/**
 * Le serveur web PUBLIC de Wumi.
 *
 * A ne pas confondre avec le panneau (src/panneau/), qui n'ecoute que sur
 * 127.0.0.1. Celui-ci est fait pour etre joint depuis Internet, derriere un
 * HTTPS (tunnel Cloudflare, Nginx, Caddy...). Il sert deux choses :
 *
 *   /            la page de l'Activite de verification (affichee DANS Discord)
 *   /api/token   echange le code OAuth2 de l'Activite contre l'identite du membre
 *   /api/verifier le membre repond au defi, le bot donne le role
 *   /astro/      le jeu Astro Run (Activite Wumi) et son API /astro/api/
 *   /topgg       le webhook de vote top.gg (facultatif)
 *   /sante       « ok », pour verifier que le tunnel marche
 *
 * Il ne demarre que si SERVEUR_PUBLIC_PORT est rempli, et seulement dans le
 * processus qui porte le serveur support (avec des shards, un seul l'a).
 *
 * Il n'expose RIEN d'autre : pas de donnees de serveur, pas de reglages. Le
 * secret OAuth2 (CLIENT_SECRET) ne quitte jamais cette machine.
 */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const logger = require('../utils/logger');
const fondateur = require('../utils/fondateur');

const DOSSIER = path.join(__dirname, 'activite');
const TAILLE_MAX = 16 * 1024; // un corps de requete n'a aucune raison d'etre gros (sauf une sauvegarde Astro)
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ogg': 'audio/ogg',
  '.mp3': 'audio/mpeg',
  '.xml': 'application/xml; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
};
const DOSSIER_ASTRO = path.join(__dirname, 'astro');

let serveur = null;
let cacheCommandes = null;
let cacheStatut = null; // la page de statut est publique : une minute de cache suffit

// ------------------------------------------------------------- LIMITEUR
/** 40 requetes par minute et par adresse : largement assez pour un humain. */
const compteurs = new Map();
function limiter(ip, max = 40) {
  const maintenant = Date.now();
  const c = compteurs.get(ip);
  if (!c || maintenant - c.debut > 60_000) {
    compteurs.set(ip, { debut: maintenant, n: 1 });
    return false;
  }
  c.n++;
  return c.n > max;
}
setInterval(() => {
  const limite = Date.now() - 60_000;
  for (const [ip, c] of compteurs) if (c.debut < limite) compteurs.delete(ip);
}, 60_000).unref?.();

function ipDe(req) {
  // Derriere un tunnel ou le proxy de Discord, la vraie adresse est dans
  // l'en-tete. On ne s'en sert que pour limiter le debit, jamais pour
  // autoriser : la falsifier ne donne rien.
  const fwd = String(req.headers['cf-connecting-ip'] ?? req.headers['x-forwarded-for'] ?? '').split(',')[0].trim();
  return fwd || req.socket.remoteAddress || '?';
}

// -------------------------------------------------------------- REPONSES
function envoyer(res, code, corps, type = 'application/json; charset=utf-8') {
  const donnees = typeof corps === 'string' || Buffer.isBuffer(corps) ? corps : JSON.stringify(corps);
  res.writeHead(code, {
    'Content-Type': type,
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
  });
  res.end(donnees);
}

function lireCorps(req, max = TAILLE_MAX) {
  return new Promise((resoudre, rejeter) => {
    let taille = 0;
    const morceaux = [];
    req.on('data', (m) => {
      taille += m.length;
      if (taille > max) {
        rejeter(new Error('corps trop gros'));
        req.destroy();
        return;
      }
      morceaux.push(m);
    });
    req.on('end', () => {
      try {
        const texte = Buffer.concat(morceaux).toString('utf8');
        resoudre(texte ? JSON.parse(texte) : {});
      } catch {
        rejeter(new Error('JSON invalide'));
      }
    });
    req.on('error', rejeter);
  });
}

/** Sert un fichier de la page de l'Activite (et rien en dehors du dossier). */
function fichierStatique(res, nom, dossier = DOSSIER) {
  const chemin = path.normalize(path.join(dossier, nom));
  if (!chemin.startsWith(dossier + path.sep) || !fs.existsSync(chemin)) return envoyer(res, 404, { erreur: 'introuvable' });
  const type = TYPES[path.extname(chemin)] ?? 'application/octet-stream';
  res.writeHead(200, {
    'Content-Type': type,
    'Cache-Control': 'no-cache',
    'X-Content-Type-Options': 'nosniff',
  });
  fs.createReadStream(chemin).pipe(res);
  return null;
}

// --------------------------------------------------------------- DISCORD
async function appelDiscord(chemin, options = {}) {
  const controleur = new AbortController();
  const stop = setTimeout(() => controleur.abort(), 8000);
  try {
    const r = await fetch(`https://discord.com/api/v10${chemin}`, { ...options, signal: controleur.signal });
    const texte = await r.text();
    const json = texte ? JSON.parse(texte) : {};
    if (!r.ok) throw Object.assign(new Error(json?.error_description ?? json?.message ?? `HTTP ${r.status}`), { status: r.status });
    return json;
  } finally {
    clearTimeout(stop);
  }
}

/** Le code donne par l'Activite -> le membre Discord, verifie par Discord. */
async function identifier(code) {
  const corps = new URLSearchParams({
    client_id: String(process.env.CLIENT_ID ?? '').trim(),
    client_secret: String(process.env.CLIENT_SECRET ?? '').trim(),
    grant_type: 'authorization_code',
    code: String(code),
  });
  const jeton = await appelDiscord('/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: corps,
  });
  const user = await appelDiscord('/users/@me', {
    headers: { Authorization: `Bearer ${jeton.access_token}` },
  });
  return { user, accessToken: jeton.access_token };
}

// ------------------------------------------------------------- ASTRO RUN
/**
 * Le jeu (fichiers de src/public/astro/) et son API. Voir src/utils/astro.js.
 * Les erreurs repondent en JSON { error } comme le serveur d'origine du jeu.
 */
async function astro(req, res, url, client) {
  const A = require('../utils/astro');
  const chemin = url.pathname.replace(/^\/astro\/?/, '/');

  if (!chemin.startsWith('/api/')) {
    if (req.method !== 'GET' && req.method !== 'HEAD') return envoyer(res, 405, { error: 'méthode' });
    if (!fs.existsSync(DOSSIER_ASTRO)) return envoyer(res, 404, { error: 'jeu absent' });
    let nom;
    try { nom = decodeURIComponent(chemin).replace(/^\/+/, '') || 'index.html'; } catch { return envoyer(res, 400, { error: 'url' }); }
    return fichierStatique(res, nom, DOSSIER_ASTRO);
  }

  const route = `${req.method} ${chemin}`;
  const session = () => {
    const entete = String(req.headers.authorization ?? '');
    const p = A.lireSession(entete.startsWith('Bearer ') ? entete.slice(7) : '');
    if (!p) throw Object.assign(new Error('Session invalide ou expirée'), { status: 401 });
    return p.uid;
  };
  const contexte = () => ({
    guildId: /^\d{17,20}$/.test(String(req.headers['x-wumi-guild'] ?? '')) ? String(req.headers['x-wumi-guild']) : null,
    channelId: /^\d{17,20}$/.test(String(req.headers['x-wumi-channel'] ?? '')) ? String(req.headers['x-wumi-channel']) : null,
  });

  try {
    if (route === 'GET /api/health') return envoyer(res, 200, { ok: true, discordConfigured: Boolean(process.env.CLIENT_SECRET) });

    // Diagnostic envoye par le jeu quand une etape de connexion bloque.
    if (route === 'POST /api/log') {
      const { etape, message, ua } = await lireCorps(req, 2048);
      const propre = (v, n) => String(v ?? '').replace(/[\r\n]+/g, ' ').slice(0, n);
      logger.avertissement(`Astro Run (client) [${propre(etape, 20)}] ${propre(message, 300)} · ${propre(ua, 120)}`);
      return envoyer(res, 200, { ok: true });
    }

    if (route === 'POST /api/token') {
      const { code } = await lireCorps(req);
      if (typeof code !== 'string' || !code || code.length > 512) return envoyer(res, 400, { error: 'Code manquant' });
      let identite;
      try {
        identite = await identifier(code);
      } catch (e) {
        logger.avertissement('Astro Run (échange du code) :', e.message);
        return envoyer(res, 401, { error: 'Code Discord refusé.' });
      }
      const u = identite.user;
      const nom = String(u.global_name || u.username).slice(0, 40);
      const avatar = u.avatar ? `https://cdn.discordapp.com/avatars/${u.id}/${u.avatar}.png?size=128` : null;
      A.q.profil.run(u.id, nom, avatar, Date.now());
      const { jeton, expire } = A.creerSession(u.id);
      return envoyer(res, 200, { access_token: identite.accessToken, session: jeton, expiresAt: expire, user: { name: nom, avatar: u.avatar ?? null } });
    }

    if (chemin === '/api/save') {
      const uid = session();
      if (req.method === 'GET') {
        const j = A.q.joueur.get(uid);
        let save = null;
        try { save = j?.save ? JSON.parse(j.save) : null; } catch { save = null; }
        return envoyer(res, 200, { save });
      }
      if (req.method === 'PUT') {
        const r = A.valider(await lireCorps(req, 64 * 1024));
        if (!r.ok) return envoyer(res, 422, { error: `Sauvegarde refusée : ${r.raison}` });
        await A.sauvegarder(client, uid, r.donnees, contexte());
        return envoyer(res, 200, { ok: true, save: r.donnees });
      }
      if (req.method === 'DELETE') {
        const j = A.q.joueur.get(uid);
        if (j) A.q.ecrireJoueur.run({ ...j, save: null, rev: j.rev + 1, maj_le: Date.now() });
        return envoyer(res, 200, { ok: true });
      }
    }

    const lb = chemin.match(/^\/api\/leaderboard\/(\d{1,3})$/);
    if (req.method === 'GET' && lb) {
      session();
      const { guildId } = contexte();
      const rows = guildId ? A.q.classement.all(guildId, Number(lb[1]), 10, 0).map((l) => ({ name: l.nom ?? '?', timeMs: l.temps })) : [];
      return envoyer(res, 200, { level: Number(lb[1]), top: rows });
    }

    return envoyer(res, 404, { error: 'Introuvable' });
  } catch (e) {
    if (e.status) return envoyer(res, e.status, { error: e.message });
    logger.avertissement(`Astro Run ${route} :`, e.message);
    return envoyer(res, 500, { error: 'Erreur interne' });
  }
}

// ---------------------------------------------------------------- ROUTES
function routes(client, { toutDash = false } = {}) {
  const verif = require('../utils/verificationSupport');

  return async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const ip = ipDe(req);

    // Le tableau de bord fait plus d'appels (un par reglage modifie) : sa
    // limite est plus large.
    const dash = require('./dashboard');
    // Sur le port dedie (DASHBOARD_PORT, utile avec Tailscale Funnel), tout
    // est tableau de bord, quel que soit le nom de domaine recu.
    const pourDash = toutDash || dash.concerne(req);
    const pourAstro = url.pathname.startsWith('/astro/') || url.pathname === '/astro';
    if (limiter(ip, pourDash || pourAstro ? 150 : 40)) return envoyer(res, 429, { erreur: 'trop de requetes, patiente une minute' });

    try {
      // -------------------------------------------- TABLEAU DE BORD
      // Routage par nom de domaine : dash.wumi.fr -> tableau de bord,
      // tout le reste -> Activite, statut, webhook.
      if (pourDash && url.pathname !== '/api/statut' && url.pathname !== '/sante') {
        const fait = await dash.traiter(req, res, url, { client, envoyer, lireCorps, fichierStatique });
        if (!fait && !res.headersSent) envoyer(res, 404, { erreur: 'introuvable' });
        return null;
      }

      // --------------------------------------------------- ASTRO RUN
      if (pourAstro) return await astro(req, res, url, client);

      // ------------------------------------------------------- SANTE
      if (req.method === 'GET' && url.pathname === '/sante') {
        return envoyer(res, 200, { ok: true, activite: verif.activiteActive(), bot: client.user?.username ?? null });
      }

      // ------------------------------------------------------- ACTIVITE
      // L'Activite Wumi est un « hub » : la page d'accueil est choisie ICI,
      // d'apres le serveur ou elle est lancee (Discord met guild_id et
      // channel_id dans l'adresse). Changer de page apres coup casserait la
      // connexion au SDK Discord : il faut servir la bonne page du premier coup.
      //   serveur support -> verification (sauf /astro jouer dans ce salon)
      //   ailleurs        -> Astro Run
      if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
        const guildId = url.searchParams.get('guild_id');
        const support = fondateur.serveurSupport();
        const astroIci = !guildId || guildId !== support || require('../utils/astro').intentionSalon(url.searchParams.get('channel_id'));
        if (astroIci && fs.existsSync(DOSSIER_ASTRO)) {
          logger.info('Astro Run : partie ouverte');
          return fichierStatique(res, 'index.html', DOSSIER_ASTRO);
        }
        return fichierStatique(res, 'index.html');
      }
      // Les fichiers du jeu quand il est servi a la racine (main.js, assets/).
      if (req.method === 'GET' && (url.pathname === '/main.js' || url.pathname.startsWith('/assets/'))) {
        let nom;
        try { nom = decodeURIComponent(url.pathname).replace(/^\/+/, ''); } catch { return envoyer(res, 400, { erreur: 'url' }); }
        return fichierStatique(res, nom, DOSSIER_ASTRO);
      }
      if (req.method === 'GET' && /^\/[\w.-]+\.(js|css|svg|png)$/.test(url.pathname)) {
        return fichierStatique(res, url.pathname.slice(1));
      }

      // ------------------------------------------------------- STATUT
      // Lu par la page wumi.fr/statut (GitHub Pages, autre domaine) : d'ou
      // l'en-tete CORS. Rien de prive la-dedans, que des totaux.
      if (url.pathname === '/api/statut') {
        if (req.method === 'OPTIONS') {
          res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET' });
          return res.end();
        }
        if (req.method !== 'GET') return envoyer(res, 405, { erreur: 'methode' });
        const statut = require('../utils/statut');
        if (!cacheStatut || Date.now() - cacheStatut.date > 60_000) {
          cacheStatut = { date: Date.now(), corps: { actuel: await statut.releve(client), ...statut.resumeHistorique(90), incidents: require('../utils/incidents').pourApi() } };
        }
        res.writeHead(200, {
          'Content-Type': 'application/json; charset=utf-8',
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'public, max-age=60',
          'X-Content-Type-Options': 'nosniff',
        });
        return res.end(JSON.stringify(cacheStatut.corps));
      }

      // ----------------------------------------------------- COMMANDES
      // Lu par la page wumi.fr/commandes : la liste vient du bot lui-meme,
      // elle est donc toujours a jour. Rien de prive (pas de /admin).
      if (url.pathname === '/api/commandes') {
        if (req.method === 'OPTIONS') {
          res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET' });
          return res.end();
        }
        if (req.method !== 'GET') return envoyer(res, 405, { erreur: 'methode' });
        if (!cacheCommandes || Date.now() - cacheCommandes.date > 600_000) {
          cacheCommandes = { date: Date.now(), corps: JSON.stringify(require('../utils/listeCommandes').construire(client.commandes.values())) };
        }
        res.writeHead(200, {
          'Content-Type': 'application/json; charset=utf-8',
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'public, max-age=600',
          'X-Content-Type-Options': 'nosniff',
        });
        return res.end(cacheCommandes.corps);
      }

      if (req.method === 'GET' && url.pathname === '/api/config') {
        // L'identifiant de l'application est public (il est dans chaque lien
        // d'invitation) : la page en a besoin pour se presenter a Discord.
        return envoyer(res, 200, { client_id: String(process.env.CLIENT_ID ?? '').trim(), support_id: fondateur.serveurSupport() });
      }

      if (req.method === 'POST' && url.pathname === '/api/token') {
        if (!verif.activiteActive()) return envoyer(res, 503, { erreur: 'activite desactivee' });
        const { code, guild_id: guildId } = await lireCorps(req);
        if (!code || typeof code !== 'string' || code.length > 200) return envoyer(res, 400, { erreur: 'code manquant' });

        const support = fondateur.serveurSupport();
        const guild = support ? client.guilds.cache.get(support) : null;
        const textes = verif.textesActivite(guild);

        // L'Activite a ete lancee ailleurs que sur le serveur support : on le
        // dit tout de suite, sans meme echanger le code.
        if (!guildId || guildId !== support) {
          const { t } = require('../utils/langues').traducteur(support);
          return envoyer(res, 403, { erreur: 'ailleurs', textes, message: t('support.verif.activite_ailleurs') });
        }

        let identite;
        try {
          identite = await identifier(code);
        } catch (e) {
          logger.avertissement('Activité (échange du code) :', e.message);
          return envoyer(res, 401, { erreur: 'code refuse par Discord', textes });
        }

        const { jeton, session } = verif.creerSession(identite.user.id);
        const membre = guild ? await guild.members.fetch(identite.user.id).catch(() => null) : null;
        const obstacle = verif.obstacle(guild, membre);
        const { t } = require('../utils/langues').traducteur(guild);

        return envoyer(res, 200, {
          session: jeton,
          user: {
            id: identite.user.id,
            nom: identite.user.global_name ?? identite.user.username,
            avatar: identite.user.avatar
              ? `https://cdn.discordapp.com/avatars/${identite.user.id}/${identite.user.avatar}.png?size=128`
              : null,
          },
          deja: obstacle?.deja === true,
          bloque: obstacle && !obstacle.deja ? t(obstacle.cle, obstacle.variables) : null,
          defi: { choix: session.defi.choix, cible: session.defi.cible },
          textes,
        });
      }

      if (req.method === 'POST' && url.pathname === '/api/verifier') {
        if (!verif.activiteActive()) return envoyer(res, 503, { erreur: 'activite desactivee' });
        const { session, choix, regles } = await lireCorps(req);
        const r = await verif.repondre(client, session, { choix: String(choix ?? ''), regles: regles === true });
        return envoyer(res, 200, r);
      }

      // ------------------------------------------------------- TOP.GG
      if (req.method === 'POST' && url.pathname === '/topgg') {
        const attendu = String(process.env.TOPGG_WEBHOOK_AUTH ?? '').trim();
        const recu = String(req.headers.authorization ?? '');
        const ok = attendu
          && recu.length === attendu.length
          && crypto.timingSafeEqual(Buffer.from(recu), Buffer.from(attendu));
        if (!ok) return envoyer(res, 401, { erreur: 'non autorise' });

        const vote = await lireCorps(req);
        if (!/^\d{17,20}$/.test(String(vote.user ?? ''))) return envoyer(res, 400, { erreur: 'vote invalide' });
        // On repond tout de suite : top.gg reessaie si on met trop de temps.
        envoyer(res, 200, { ok: true });
        try {
          require('../utils/topgg').marquerVote?.(vote.user);
        } catch {
          /* le cache est un confort */
        }
        require('../utils/votesSupport').voteRecu(client, vote).catch(() => null);
        return null;
      }

      return envoyer(res, 404, { erreur: 'introuvable' });
    } catch (e) {
      logger.avertissement(`Serveur public ${req.method} ${url.pathname} :`, e.message);
      if (!res.headersSent) return envoyer(res, 500, { erreur: 'erreur interne' });
      return null;
    }
  };
}

// --------------------------------------------------------------- DEMARRAGE
let serveurDash = null;

function ecouter(srv, port, hote, quoi) {
  srv.on('error', (e) => logger.erreur(`Serveur public (port ${port}) :`, e.message));
  srv.listen(port, hote, () => logger.succes(`Serveur public sur http://${hote}:${port} : ${quoi}.`));
}

function demarrer(client) {
  const port = Number(process.env.SERVEUR_PUBLIC_PORT);
  if (!port) {
    logger.info('Serveur public : SERVEUR_PUBLIC_PORT vide, Activité et webhook top.gg en sommeil.');
    return;
  }
  // Avec des shards, seul celui qui voit le serveur support peut donner le role.
  const support = fondateur.serveurSupport();
  if (client.shard && support && !client.guilds.cache.has(support)) return;
  if (serveur) return;

  const hote = String(process.env.SERVEUR_PUBLIC_HOTE ?? '0.0.0.0').trim() || '0.0.0.0';
  const dashActif = require('./dashboard').actif();
  const portDash = Number(process.env.DASHBOARD_PORT) || null;

  const parties = ['Activité de vérification', 'statut'];
  if (process.env.TOPGG_WEBHOOK_AUTH) parties.push('webhook top.gg');
  if (dashActif && !portDash) parties.push(`tableau de bord (${process.env.DASHBOARD_URL})`);
  serveur = http.createServer(routes(client));
  ecouter(serveur, port, hote, parties.join(', '));

  // Un port a part pour le tableau de bord : avec Tailscale Funnel il n'y a
  // qu'un seul nom de domaine, on ne peut donc pas trier par domaine.
  if (dashActif && portDash && portDash !== port && !serveurDash) {
    serveurDash = http.createServer(routes(client, { toutDash: true }));
    ecouter(serveurDash, portDash, hote, `tableau de bord (${process.env.DASHBOARD_URL})`);
  }
}

function arreter() {
  if (serveur) serveur.close();
  if (serveurDash) serveurDash.close();
  serveur = null;
  serveurDash = null;
}

module.exports = { demarrer, arreter, _routes: routes };
