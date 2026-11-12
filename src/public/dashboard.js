/**
 * Le TABLEAU DE BORD web de Wumi (dash.wumi.fr).
 *
 * Les administrateurs se connectent avec Discord, choisissent un serveur
 * qu'ils gerent, et reglent le bot en cliquant au lieu de taper des commandes.
 *
 * CE QUI LE REND SUR
 *   - Connexion OAuth2 Discord (scopes identify + guilds), avec un « state »
 *     verifie : impossible de forcer quelqu'un a se connecter sur le compte
 *     d'un autre.
 *   - Le cookie de session est aleatoire, HttpOnly, Secure, SameSite=Lax ; en
 *     base on ne garde que son EMPREINTE (sha256) : une fuite de la base ne
 *     donne aucune session utilisable. Aucun jeton Discord n'est conserve.
 *   - CHAQUE lecture et ecriture re-verifie AUPRES DU BOT que la personne a
 *     « Gerer le serveur » (ou en est proprietaire) MAINTENANT. La liste de
 *     serveurs renvoyee par Discord a la connexion n'est qu'un affichage.
 *   - Les ecritures exigent un jeton anti-CSRF et une origine correcte.
 *   - Chaque valeur est validee selon le type du reglage (salon qui existe
 *     vraiment sur CE serveur, role non gere, nombre dans les bornes...).
 *
 * LA LISTE DES REGLAGES n'est pas dupliquee ici : c'est la table CATEGORIES
 * de src/utils/panneauConfig.js, celle de /config. Un reglage ajoute la-bas
 * apparait tout seul sur le site, avec son nom et son aide traduits.
 *
 * Reglages du .env : DASHBOARD_URL (ex. https://dash.wumi.fr), CLIENT_ID,
 * CLIENT_SECRET. Redirect OAuth2 a declarer : DASHBOARD_URL + /callback.
 */
const crypto = require('node:crypto');
const path = require('node:path');
const { ChannelType, PermissionFlagsBits } = require('discord.js');
const { db, config, majConfig } = require('../database/db');
const logger = require('../utils/logger');

const DOSSIER = path.join(__dirname, 'dash');
const SESSION_MS = 7 * 86_400_000;
const COOKIE = 'wumi_session';
const COOKIE_ETAT = 'wumi_etat';

db.exec(`
CREATE TABLE IF NOT EXISTS dash_sessions (
  empreinte  TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL,
  profil     TEXT NOT NULL,
  serveurs   TEXT NOT NULL,
  csrf       TEXT NOT NULL,
  expire     INTEGER NOT NULL
);
`);
const q = {
  creer: db.prepare('INSERT INTO dash_sessions (empreinte, user_id, profil, serveurs, csrf, expire) VALUES (?, ?, ?, ?, ?, ?)'),
  lire: db.prepare('SELECT * FROM dash_sessions WHERE empreinte = ? AND expire > ?'),
  effacer: db.prepare('DELETE FROM dash_sessions WHERE empreinte = ?'),
  purger: db.prepare('DELETE FROM dash_sessions WHERE expire <= ?'),
};

// ----------------------------------------------------------------- OUTILS
const empreinte = (v) => crypto.createHash('sha256').update(String(v)).digest('hex');

function base() {
  return String(process.env.DASHBOARD_URL ?? '').trim().replace(/\/+$/, '');
}

/** Le tableau de bord est-il configure ? */
function actif() {
  return Boolean(base() && String(process.env.CLIENT_SECRET ?? '').trim() && String(process.env.CLIENT_ID ?? '').trim());
}

/** Cette requete vise-t-elle le tableau de bord ? (routage par nom de domaine) */
function concerne(req) {
  if (!actif()) return false;
  try {
    return String(req.headers.host ?? '').toLowerCase() === new URL(base()).host.toLowerCase();
  } catch {
    return false;
  }
}

function lireCookies(req) {
  const sortie = {};
  for (const morceau of String(req.headers.cookie ?? '').split(';')) {
    const i = morceau.indexOf('=');
    if (i > 0) sortie[morceau.slice(0, i).trim()] = decodeURIComponent(morceau.slice(i + 1).trim());
  }
  return sortie;
}

function cookie(nom, valeur, maxAge) {
  const securise = base().startsWith('https://') ? '; Secure' : '';
  return `${nom}=${encodeURIComponent(valeur)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${securise}`;
}

function session(req) {
  const jeton = lireCookies(req)[COOKIE];
  if (!jeton) return null;
  const ligne = q.lire.get(empreinte(jeton), Date.now());
  if (!ligne) return null;
  return { ...ligne, profil: JSON.parse(ligne.profil), serveurs: JSON.parse(ligne.serveurs) };
}

async function discord(chemin, options = {}) {
  const controleur = new AbortController();
  const stop = setTimeout(() => controleur.abort(), 8000);
  try {
    const r = await fetch(`https://discord.com/api/v10${chemin}`, { ...options, signal: controleur.signal });
    const texte = await r.text();
    const json = texte ? JSON.parse(texte) : {};
    if (!r.ok) throw new Error(json?.error_description ?? json?.message ?? `HTTP ${r.status}`);
    return json;
  } finally {
    clearTimeout(stop);
  }
}

const icone = (g) => (g.icon ? `https://cdn.discordapp.com/icons/${g.id}/${g.icon}.png?size=128` : null);

// ------------------------------------------------------------ PERMISSIONS
/**
 * Peut-il regler ce serveur, LA, MAINTENANT ? Demande au bot, pas a la liste
 * de la connexion : un admin retire depuis ne garde pas l'acces.
 */
const cacheAcces = new Map(); // `${user}:${guild}` -> { ok, jusqua }
async function acces(client, userId, guildId) {
  if (!/^\d{17,20}$/.test(String(guildId))) return null;
  const guild = client.guilds.cache.get(guildId);
  if (!guild) return null;
  const cle = `${userId}:${guildId}`;
  const connu = cacheAcces.get(cle);
  if (connu && connu.jusqua > Date.now()) return connu.ok ? guild : null;

  const membre = await guild.members.fetch(userId).catch(() => null);
  const ok = Boolean(membre && (guild.ownerId === userId || membre.permissions.has(PermissionFlagsBits.ManageGuild)));
  cacheAcces.set(cle, { ok, jusqua: Date.now() + 60_000 });
  if (cacheAcces.size > 5000) cacheAcces.clear();
  return ok ? guild : null;
}

// --------------------------------------------------------------- REGLAGES
/** La valeur envoyee par le site, verifiee et convertie pour la base. */
function valider(reglage, valeur, guild) {
  const vide = valeur === null || valeur === undefined || valeur === '';
  switch (reglage.type) {
    case 'bool':
      return { ok: true, valeur: valeur === true || valeur === 1 || valeur === '1' ? 1 : 0 };
    case 'nombre': {
      const n = Number(valeur);
      if (!Number.isFinite(n)) return { ok: false, erreur: 'nombre_invalide' };
      const borne = Math.min(reglage.max ?? Infinity, Math.max(reglage.min ?? -Infinity, Math.round(n)));
      return { ok: true, valeur: borne };
    }
    case 'choix':
      if (!reglage.valeurs.includes(valeur)) return { ok: false, erreur: 'valeur_inconnue' };
      return { ok: true, valeur };
    case 'texte': {
      if (vide) return { ok: true, valeur: null };
      const texte = String(valeur).replace(/\r\n/g, '\n');
      if (texte.length > (reglage.max ?? 1000)) return { ok: false, erreur: 'trop_long' };
      return { ok: true, valeur: reglage.long ? texte : texte.replace(/\n/g, ' ') };
    }
    case 'salon': {
      if (vide) return { ok: true, valeur: null };
      if (reglage.speciaux?.includes(valeur)) return { ok: true, valeur };
      const salon = guild.channels.cache.get(String(valeur));
      if (!salon || ![ChannelType.GuildText, ChannelType.GuildAnnouncement].includes(salon.type)) return { ok: false, erreur: 'salon_invalide' };
      return { ok: true, valeur: salon.id };
    }
    case 'categorie': {
      if (vide) return { ok: true, valeur: null };
      const cat = guild.channels.cache.get(String(valeur));
      if (!cat || cat.type !== ChannelType.GuildCategory) return { ok: false, erreur: 'categorie_invalide' };
      return { ok: true, valeur: cat.id };
    }
    case 'role': {
      if (vide) return { ok: true, valeur: null };
      const role = guild.roles.cache.get(String(valeur));
      if (!role || role.managed || role.id === guild.id) return { ok: false, erreur: 'role_invalide' };
      return { ok: true, valeur: role.id };
    }
    default:
      return { ok: false, erreur: 'type_inconnu' };
  }
}

/** Tout ce que la page d'un serveur affiche. */
function detailServeur(guild) {
  const panneau = require('../utils/panneauConfig');
  const { traducteur, existe } = require('../utils/langues');
  const { t, langue } = traducteur(guild);
  const cfg = config(guild.id);
  const moi = guild.members.me;

  const categories = panneau.categoriesDe(guild.id).map((c) => ({
    cle: c.cle,
    nom: t(`config.cat.${c.cle}`),
    aide: existe(`config.cat_aide.${c.cle}`, langue) ? t(`config.cat_aide.${c.cle}`) : '',
    reglages: c.reglages.map((r) => ({
      cle: r.cle,
      type: r.type,
      nom: t(`config.r.${r.cle}.nom`),
      aide: existe(`config.r.${r.cle}.aide`, langue) ? t(`config.r.${r.cle}.aide`) : '',
      valeur: cfg[r.cle] ?? null,
      min: r.min ?? null,
      max: r.max ?? null,
      long: Boolean(r.long),
      valeurs: r.type === 'choix' ? r.valeurs.map((v) => ({ v, nom: existe(`config.valeur.${r.cle}.${v}`, langue) ? t(`config.valeur.${r.cle}.${v}`) : v })) : null,
      speciaux: r.speciaux ? r.speciaux.map((v) => ({ v, nom: t(`config.special.${v}`) })) : null,
    })),
  }));

  const salons = [...guild.channels.cache.values()]
    .filter((c) => [ChannelType.GuildText, ChannelType.GuildAnnouncement, ChannelType.GuildCategory].includes(c.type))
    .sort((a, b) => a.rawPosition - b.rawPosition)
    .map((c) => ({
      id: c.id,
      nom: c.name,
      type: c.type === ChannelType.GuildCategory ? 'categorie' : 'texte',
      parent: c.parentId ?? null,
      ecrire: c.type === ChannelType.GuildCategory ? null : Boolean(c.permissionsFor(moi)?.has(PermissionFlagsBits.SendMessages)),
    }));

  const roles = [...guild.roles.cache.values()]
    .filter((r) => r.id !== guild.id && !r.managed)
    .sort((a, b) => b.position - a.position)
    .map((r) => ({ id: r.id, nom: r.name, couleur: r.hexColor, gerable: r.editable }));

  let sanctions30 = 0;
  let ticketsOuverts = 0;
  try {
    sanctions30 = db.prepare('SELECT COUNT(*) AS n FROM sanctions WHERE guild_id = ? AND date >= ?').get(guild.id, Date.now() - 30 * 86_400_000).n;
    ticketsOuverts = db.prepare("SELECT COUNT(*) AS n FROM tickets WHERE guild_id = ? AND statut = 'ouvert'").get(guild.id).n;
  } catch {
    /* tables absentes : on affiche 0 */
  }

  return {
    serveur: { id: guild.id, nom: guild.name, icone: icone(guild), membres: guild.memberCount, langue },
    categories,
    salons,
    roles,
    paliers: require('../utils/paliers').lire(guild.id),
    stats: { sanctions30, ticketsOuverts, raid: Boolean(require('../utils/modeRaid').etat(guild.id)) },
  };
}

// ------------------------------------------------------------------ ROUTES
/**
 * @returns {Promise<boolean>} vrai si la requete a ete traitee ici
 */
async function traiter(req, res, url, { client, envoyer, lireCorps, fichierStatique }) {
  const chemin = url.pathname;

  // ------------------------------------------------- PAGES ET FICHIERS
  if (req.method === 'GET' && (chemin === '/' || /^\/serveur\/\d+$/.test(chemin))) {
    fichierStatique(res, 'index.html', DOSSIER);
    return true;
  }
  if (req.method === 'GET' && /^\/[\w.-]+\.(js|css|svg|png)$/.test(chemin)) {
    fichierStatique(res, chemin.slice(1), DOSSIER);
    return true;
  }

  // -------------------------------------------------------- CONNEXION
  if (req.method === 'GET' && chemin === '/connexion') {
    const etat = crypto.randomBytes(18).toString('base64url');
    const params = new URLSearchParams({
      client_id: String(process.env.CLIENT_ID).trim(),
      response_type: 'code',
      redirect_uri: `${base()}/callback`,
      scope: 'identify guilds',
      state: etat,
      prompt: 'none',
    });
    res.writeHead(302, { Location: `https://discord.com/oauth2/authorize?${params}`, 'Set-Cookie': cookie(COOKIE_ETAT, etat, 600) });
    res.end();
    return true;
  }

  if (req.method === 'GET' && chemin === '/callback') {
    const etat = lireCookies(req)[COOKIE_ETAT];
    const code = url.searchParams.get('code');
    if (!code || !etat || url.searchParams.get('state') !== etat) {
      res.writeHead(302, { Location: '/?erreur=etat' });
      res.end();
      return true;
    }
    try {
      const jeton = await discord('/oauth2/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: String(process.env.CLIENT_ID).trim(),
          client_secret: String(process.env.CLIENT_SECRET).trim(),
          grant_type: 'authorization_code',
          code,
          redirect_uri: `${base()}/callback`,
        }),
      });
      const auth = { headers: { Authorization: `Bearer ${jeton.access_token}` } };
      const [user, guilds] = await Promise.all([discord('/users/@me', auth), discord('/users/@me/guilds', auth)]);

      if (require('../utils/fondateur').bloque(user.id)) {
        res.writeHead(302, { Location: '/?erreur=bloque' });
        res.end();
        return true;
      }

      // On ne garde que les serveurs qu'il peut gerer : c'est tout ce que
      // le site affichera.
      const gerables = guilds
        .filter((g) => g.owner || (BigInt(g.permissions) & 0x28n) !== 0n) // ADMINISTRATOR | MANAGE_GUILD
        .map((g) => ({ id: g.id, nom: g.name, icone: icone(g) }));

      const brut = crypto.randomBytes(32).toString('base64url');
      q.creer.run(
        empreinte(brut),
        user.id,
        JSON.stringify({
          id: user.id,
          nom: user.global_name ?? user.username,
          avatar: user.avatar ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=128` : null,
        }),
        JSON.stringify(gerables),
        crypto.randomBytes(18).toString('base64url'),
        Date.now() + SESSION_MS
      );
      // Le jeton Discord n'est PAS garde : on n'en a plus besoin.
      fetch('https://discord.com/api/v10/oauth2/token/revoke', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          token: jeton.access_token,
          client_id: String(process.env.CLIENT_ID).trim(),
          client_secret: String(process.env.CLIENT_SECRET).trim(),
        }),
      }).catch(() => null);

      logger.action('connexion au tableau de bord', user.username);
      res.writeHead(302, {
        Location: '/',
        'Set-Cookie': [cookie(COOKIE, brut, SESSION_MS / 1000), cookie(COOKIE_ETAT, '', 0)],
      });
      res.end();
    } catch (e) {
      logger.avertissement('Tableau de bord (connexion) :', e.message);
      res.writeHead(302, { Location: '/?erreur=discord' });
      res.end();
    }
    return true;
  }

  if (chemin === '/deconnexion') {
    const jeton = lireCookies(req)[COOKIE];
    if (jeton) q.effacer.run(empreinte(jeton));
    res.writeHead(302, { Location: '/', 'Set-Cookie': cookie(COOKIE, '', 0) });
    res.end();
    return true;
  }

  // -------------------------------------------------------------- API
  if (!chemin.startsWith('/api/')) return false;
  const s = session(req);
  if (!s) {
    envoyer(res, 401, { erreur: 'connexion' });
    return true;
  }

  // Ecriture : jeton anti-CSRF + origine.
  if (req.method !== 'GET') {
    const origine = String(req.headers.origin ?? '');
    if (req.headers['x-wumi-csrf'] !== s.csrf || (origine && origine !== base())) {
      envoyer(res, 403, { erreur: 'csrf' });
      return true;
    }
  }

  if (req.method === 'GET' && chemin === '/api/moi') {
    const clientId = String(process.env.CLIENT_ID).trim();
    envoyer(res, 200, {
      utilisateur: s.profil,
      csrf: s.csrf,
      serveurs: s.serveurs
        .map((g) => ({
          ...g,
          present: client.guilds.cache.has(g.id),
          invitation: `https://discord.com/oauth2/authorize?client_id=${clientId}&scope=bot+applications.commands&permissions=8&guild_id=${g.id}&disable_guild_select=true`,
        }))
        .sort((a, b) => Number(b.present) - Number(a.present) || a.nom.localeCompare(b.nom)),
    });
    return true;
  }

  const m = chemin.match(/^\/api\/serveur\/(\d{17,20})(\/[a-z]+)?$/);
  if (!m) {
    envoyer(res, 404, { erreur: 'introuvable' });
    return true;
  }
  const guild = await acces(client, s.user_id, m[1]);
  if (!guild) {
    envoyer(res, 403, { erreur: 'acces' });
    return true;
  }
  const action = m[2] ?? '';

  if (req.method === 'GET' && action === '') {
    envoyer(res, 200, detailServeur(guild));
    return true;
  }

  if (req.method === 'POST' && action === '/reglage') {
    const { cle, valeur } = await lireCorps(req);
    const reglage = require('../utils/panneauConfig').trouverReglage(guild.id, String(cle));
    if (!reglage) {
      envoyer(res, 400, { erreur: 'reglage_inconnu' });
      return true;
    }
    const v = valider(reglage, valeur, guild);
    if (!v.ok) {
      envoyer(res, 400, { erreur: v.erreur });
      return true;
    }
    const avant = config(guild.id)[reglage.cle];
    majConfig(guild.id, { [reglage.cle]: v.valeur });
    if (String(avant ?? '') !== String(v.valeur ?? '')) {
      try {
        require('../utils/configAudit').noter({ guildId: guild.id, cle: reglage.cle, avant, apres: v.valeur, par: s.user_id, source: 'dashboard' });
      } catch {
        /* le journal est un confort */
      }
    }
    envoyer(res, 200, { ok: true, valeur: v.valeur });
    return true;
  }

  if (req.method === 'POST' && action === '/paliers') {
    const { paliers } = await lireCorps(req);
    try {
      const propre = require('../utils/paliers').ecrire(guild.id, paliers);
      envoyer(res, 200, { ok: true, paliers: propre });
    } catch (e) {
      envoyer(res, 400, { erreur: e.message });
    }
    return true;
  }

  if (req.method === 'GET' && action === '/journal') {
    const { traducteur, existe } = require('../utils/langues');
    const { t, langue } = traducteur(guild);
    const lignes = require('../utils/configAudit').lister(guild.id, 40).map((l) => ({
      ...l,
      nom: existe(`config.r.${l.cle}.nom`, langue) ? t(`config.r.${l.cle}.nom`) : l.cle,
    }));
    envoyer(res, 200, { lignes });
    return true;
  }

  // ------------------------------------- STATISTIQUES, ROLES, EMBEDS, SANCTIONS
  const plus = require('./dashboardPlus');
  const repondre = (r) => envoyer(res, r?.erreur ? 400 : 200, r);

  if (req.method === 'GET' && action === '/stats') {
    envoyer(res, 200, await plus.statistiques(guild, Number(url.searchParams.get('jours')) || 30));
    return true;
  }
  if (req.method === 'GET' && action === '/roles') {
    envoyer(res, 200, { panneaux: plus.listeRR(guild) });
    return true;
  }
  if (req.method === 'GET' && action === '/sanctions') {
    envoyer(res, 200, await plus.listeSanctions(guild, {
      page: url.searchParams.get('page'),
      type: url.searchParams.get('type') ?? '',
      membre: url.searchParams.get('membre') ?? '',
    }));
    return true;
  }

  if (req.method === 'POST' && ['/roles', '/embed', '/sanction'].includes(action)) {
    const membre = await guild.members.fetch(s.user_id).catch(() => null);
    if (!membre) {
      envoyer(res, 403, { erreur: 'acces' });
      return true;
    }
    const corps = await lireCorps(req);
    try {
      if (action === '/roles') repondre(await plus.actionRR(guild, membre, corps));
      else if (action === '/embed') repondre(await plus.publierEmbed(guild, membre, corps));
      else repondre(await plus.retirerSanction(guild, membre, corps.id));
    } catch (e) {
      logger.avertissement(`Dashboard ${action} :`, e.message);
      if (!res.headersSent) envoyer(res, 500, { erreur: 'erreur_interne' });
    }
    return true;
  }

  envoyer(res, 404, { erreur: 'introuvable' });
  return true;
}

setInterval(() => {
  try {
    q.purger.run(Date.now());
  } catch {
    /* rien */
  }
}, 3_600_000).unref?.();

module.exports = { actif, concerne, traiter, valider, detailServeur, acces };
