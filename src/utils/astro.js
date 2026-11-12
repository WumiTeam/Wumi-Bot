/**
 * ASTRO RUN — le jeu de plateforme de Wumi, en Activite Discord.
 *
 * Le jeu (Phaser) est servi par le serveur public de Wumi sous /astro/, et sa
 * petite API sous /astro/api/ :
 *   POST   /astro/api/token        code OAuth2 de l'Activite -> session signee
 *   GET    /astro/api/save         la sauvegarde du joueur
 *   PUT    /astro/api/save         nouvelle sauvegarde (validee champ par champ)
 *   DELETE /astro/api/save         remise a zero
 *   GET    /astro/api/leaderboard/:n   meilleurs temps du serveur Discord
 *
 * L'identite du joueur vient UNIQUEMENT de Discord (code OAuth2 echange par
 * Wumi), scellee dans une session HMAC : le client ne peut pas l'usurper.
 *
 * LIEN AVEC LE SERVEUR DISCORD
 * Le jeu envoie le serveur et le salon ou il a ete lance (en-tetes). Quand une
 * sauvegarde ameliore un temps, Wumi l'inscrit au classement de CE serveur
 * (si le joueur en est bien membre), donne la recompense de premiere
 * victoire (XP et monnaie du serveur, une fois par niveau et par serveur) et
 * annonce le record dans le salon choisi (/astro config).
 */
const crypto = require('node:crypto');
const conf = require('../../config');
const C = require('./composants');
const { db, config } = require('../database/db');
const { traducteur } = require('./langues');
const logger = require('./logger');

db.exec(`
CREATE TABLE IF NOT EXISTS astro_joueurs (
  user_id TEXT PRIMARY KEY,
  nom     TEXT NOT NULL,
  avatar  TEXT,
  save    TEXT,
  rev     INTEGER NOT NULL DEFAULT 0,
  maj_le  INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS astro_records (
  guild_id TEXT NOT NULL,
  user_id  TEXT NOT NULL,
  niveau   INTEGER NOT NULL,
  temps    INTEGER NOT NULL,
  etoiles  INTEGER NOT NULL DEFAULT 0,
  le       INTEGER NOT NULL,
  PRIMARY KEY (guild_id, user_id, niveau)
);
CREATE INDEX IF NOT EXISTS idx_astro_records ON astro_records (guild_id, niveau, temps);
CREATE TABLE IF NOT EXISTS astro_recompenses (
  guild_id TEXT NOT NULL,
  user_id  TEXT NOT NULL,
  niveau   INTEGER NOT NULL,
  le       INTEGER NOT NULL,
  PRIMARY KEY (guild_id, user_id, niveau)
);
`);

const q = {
  joueur: db.prepare('SELECT * FROM astro_joueurs WHERE user_id = ?'),
  ecrireJoueur: db.prepare(`
    INSERT INTO astro_joueurs (user_id, nom, avatar, save, rev, maj_le) VALUES (@user_id, @nom, @avatar, @save, @rev, @maj_le)
    ON CONFLICT(user_id) DO UPDATE SET nom = excluded.nom, avatar = excluded.avatar, save = excluded.save, rev = excluded.rev, maj_le = excluded.maj_le
  `),
  profil: db.prepare(`
    INSERT INTO astro_joueurs (user_id, nom, avatar, save, rev, maj_le) VALUES (?, ?, ?, NULL, 0, ?)
    ON CONFLICT(user_id) DO UPDATE SET nom = excluded.nom, avatar = excluded.avatar
  `),
  record: db.prepare('SELECT * FROM astro_records WHERE guild_id = ? AND user_id = ? AND niveau = ?'),
  ecrireRecord: db.prepare(`
    INSERT INTO astro_records (guild_id, user_id, niveau, temps, etoiles, le) VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(guild_id, user_id, niveau) DO UPDATE SET
      temps = MIN(astro_records.temps, excluded.temps),
      etoiles = MAX(astro_records.etoiles, excluded.etoiles),
      le = CASE WHEN excluded.temps < astro_records.temps THEN excluded.le ELSE astro_records.le END
  `),
  meilleurServeur: db.prepare('SELECT user_id, temps FROM astro_records WHERE guild_id = ? AND niveau = ? ORDER BY temps ASC LIMIT 1'),
  classement: db.prepare(`
    SELECT r.user_id, r.temps, r.etoiles, j.nom, j.avatar FROM astro_records r
    LEFT JOIN astro_joueurs j ON j.user_id = r.user_id
    WHERE r.guild_id = ? AND r.niveau = ? ORDER BY r.temps ASC LIMIT ? OFFSET ?
  `),
  compter: db.prepare('SELECT COUNT(*) AS n FROM astro_records WHERE guild_id = ? AND niveau = ?'),
  rang: db.prepare('SELECT COUNT(*) AS n FROM astro_records WHERE guild_id = ? AND niveau = ? AND temps < ?'),
  joueursServeur: db.prepare('SELECT COUNT(DISTINCT user_id) AS n FROM astro_records WHERE guild_id = ?'),
  recompense: db.prepare('INSERT OR IGNORE INTO astro_recompenses (guild_id, user_id, niveau, le) VALUES (?, ?, ?, ?)'),
};

// --------------------------------------------------------------- LE JEU
// Repris de src/data/characters.ts et src/levels/*.ts d'Astro Run.
const PERSONNAGES = ['beige', 'green', 'pink', 'purple', 'yellow'];
const NIVEAUX = { 1: 'Premiers pas', 2: 'Dunes brûlantes', 3: 'Pics glacés', 4: 'Forêt de champignons', 5: 'La citadelle' };
const MAX_NIVEAU = 5;
const MAX_PIECES = 1_000_000;
const TEMPS_MIN_MS = 3000; // personne ne finit un niveau en moins de 3 s

function defaut() {
  return {
    version: 1, coins: 0, owned: ['beige'], selected: 'beige', unlockedLevel: 1,
    bestTimes: {}, bestStars: {}, settings: { muted: false, volume: 0.8 },
  };
}

const nombre = (v, repli, min = 0) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(min, v) : repli);

/** Reconstruit une sauvegarde champ par champ (rien n'est copie tel quel). */
function nettoyer(brut) {
  const d = defaut();
  if (!brut || typeof brut !== 'object' || Array.isArray(brut)) return d;
  d.coins = Math.floor(nombre(brut.coins, 0));
  const possedes = Array.isArray(brut.owned) ? brut.owned.filter((id) => PERSONNAGES.includes(id)) : [];
  d.owned = [...new Set(['beige', ...possedes])];
  d.selected = d.owned.includes(brut.selected) ? brut.selected : 'beige';
  d.unlockedLevel = Math.min(MAX_NIVEAU, Math.max(1, Math.floor(nombre(brut.unlockedLevel, 1, 1))));
  for (const [champ, cible] of [['bestTimes', d.bestTimes], ['bestStars', d.bestStars]]) {
    if (brut[champ] && typeof brut[champ] === 'object') {
      for (const [k, v] of Object.entries(brut[champ]).slice(0, 20)) {
        if (typeof v === 'number' && Number.isFinite(v) && v > 0) cible[k] = Math.round(v);
      }
    }
  }
  if (brut.settings && typeof brut.settings === 'object') {
    d.settings.muted = brut.settings.muted === true;
    d.settings.volume = Math.min(1, nombre(brut.settings.volume, 0.8));
  }
  return d;
}

/** Refuse ce qui est structurellement impossible. */
function valider(brut) {
  if (!brut || typeof brut !== 'object' || Array.isArray(brut)) return { ok: false, raison: 'format invalide' };
  const d = nettoyer(brut);
  if (d.coins > MAX_PIECES) return { ok: false, raison: 'trop de pièces' };
  let maxFini = 0;
  for (const [niveau, temps] of Object.entries(d.bestTimes)) {
    const id = Number(niveau);
    if (!Number.isInteger(id) || id < 1 || id > MAX_NIVEAU) return { ok: false, raison: 'niveau inconnu' };
    if (temps < TEMPS_MIN_MS) return { ok: false, raison: 'temps impossible' };
    maxFini = Math.max(maxFini, id);
  }
  for (const [niveau, etoiles] of Object.entries(d.bestStars)) {
    const id = Number(niveau);
    if (!Number.isInteger(id) || id < 1 || id > MAX_NIVEAU || etoiles < 0 || etoiles > 3) return { ok: false, raison: 'étoiles invalides' };
  }
  if (d.unlockedLevel > Math.min(MAX_NIVEAU, maxFini + 1)) return { ok: false, raison: 'niveau débloqué sans progression' };
  return { ok: true, donnees: d };
}

// ------------------------------------------------------------- SESSIONS
const SESSION_MS = 12 * 3_600_000;
// Le secret de session est derive du secret OAuth2 : rien a configurer, et
// il change si le secret de l'application change.
const secret = () => crypto.createHash('sha256').update(`astro:${process.env.CLIENT_SECRET ?? ''}:${process.env.DISCORD_TOKEN ?? ''}`).digest();
const b64 = (b) => Buffer.from(b).toString('base64url');
const signer = (corps) => crypto.createHmac('sha256', secret()).update(corps).digest();

function creerSession(uid, maintenant = Date.now()) {
  const corps = b64(JSON.stringify({ uid, exp: maintenant + SESSION_MS }));
  return { jeton: `${corps}.${b64(signer(corps))}`, expire: maintenant + SESSION_MS };
}

function lireSession(jeton, maintenant = Date.now()) {
  if (typeof jeton !== 'string' || jeton.length > 1024) return null;
  const [corps, sig] = jeton.split('.');
  if (!corps || !sig) return null;
  const attendu = signer(corps);
  let donne;
  try { donne = Buffer.from(sig, 'base64url'); } catch { return null; }
  if (donne.length !== attendu.length || !crypto.timingSafeEqual(donne, attendu)) return null;
  try {
    const p = JSON.parse(Buffer.from(corps, 'base64url').toString('utf8'));
    return typeof p.uid === 'string' && typeof p.exp === 'number' && p.exp > maintenant ? p : null;
  } catch {
    return null;
  }
}

// ------------------------------------------------- INTENTIONS DE LANCEMENT
// Sur le serveur support, l'Activite ouvre la verification. Quand quelqu'un
// tape /astro jouer dans un salon du support, on retient ce SALON deux
// minutes : l'Activite qui s'y ouvre sert alors le jeu.
const intentions = new Map(); // channelId -> expiration
function noterIntention(channelId) {
  if (channelId) intentions.set(channelId, Date.now() + 2 * 60_000);
}
function intentionSalon(channelId) {
  const e = channelId ? intentions.get(channelId) : null;
  return Boolean(e && e > Date.now());
}

// ------------------------------------------------------------ AFFICHAGE
function formaterTemps(ms) {
  const s = ms / 1000;
  const min = Math.floor(s / 60);
  const reste = (s - min * 60).toFixed(1).padStart(4, '0');
  return `${min}:${reste}`;
}
const etoiles = (n) => '★'.repeat(n) + '☆'.repeat(Math.max(0, 3 - n));

// ------------------------------------------------------------ SAUVEGARDE
/**
 * Enregistre une sauvegarde et en tire les consequences sur le serveur
 * Discord ou le jeu tourne (records, recompenses, annonce).
 */
async function sauvegarder(client, uid, donnees, contexte = {}) {
  const avant = q.joueur.get(uid);
  let ancienne = null;
  try { ancienne = avant?.save ? JSON.parse(avant.save) : null; } catch { ancienne = null; }
  q.ecrireJoueur.run({
    user_id: uid, nom: avant?.nom ?? 'Joueur', avatar: avant?.avatar ?? null,
    save: JSON.stringify(donnees), rev: (avant?.rev ?? 0) + 1, maj_le: Date.now(),
  });

  // Les niveaux ameliores par CETTE sauvegarde.
  const ameliores = [];
  for (const [k, temps] of Object.entries(donnees.bestTimes)) {
    const prec = ancienne?.bestTimes?.[k];
    if (prec === undefined || temps < prec) ameliores.push({ niveau: Number(k), temps, etoiles: donnees.bestStars[k] ?? 0, premier: prec === undefined });
  }
  if (!ameliores.length) return [];

  const guild = contexte.guildId ? client.guilds.cache.get(contexte.guildId) : null;
  const membre = guild ? await guild.members.fetch(uid).catch(() => null) : null;
  if (!guild || !membre) return ameliores;

  for (const a of ameliores) {
    const meilleur = q.meilleurServeur.get(guild.id, a.niveau);
    const recordServeur = !meilleur || a.temps < meilleur.temps;
    q.ecrireRecord.run(guild.id, uid, a.niveau, a.temps, a.etoiles, Date.now());
    const recompense = q.recompense.run(guild.id, uid, a.niveau, Date.now()).changes > 0
      ? await recompenser(guild, membre, a.niveau) : null;
    await annoncer(guild, membre, { ...a, recordServeur, recompense, salonJeu: contexte.channelId }).catch((e) => logger.debug('Astro (annonce) :', e.message));
  }
  return ameliores;
}

/** Premiere victoire sur un niveau dans ce serveur : XP et monnaie. */
async function recompenser(guild, membre, niveau) {
  let cfg;
  try { cfg = config(guild.id); } catch { return null; }
  if (!cfg.astro_recompenses) return null;
  const xp = 50 * niveau;
  const argent = 25 * niveau;
  const sortie = { xp: 0, argent: 0 };
  try {
    const niveaux = require('./niveaux');
    if (cfg.xp_actif && niveaux.ajouterXp) {
      niveaux.ajouterXp(guild.id, membre.id, xp);
      sortie.xp = xp;
    }
  } catch (e) { logger.debug('Astro (XP) :', e.message); }
  try {
    if (cfg.eco_actif) {
      require('./economie').crediter(guild.id, membre.id, argent);
      sortie.argent = argent;
    }
  } catch (e) { logger.debug('Astro (monnaie) :', e.message); }
  return sortie.xp || sortie.argent ? sortie : null;
}

/** La carte du record, dans le salon choisi (sinon rien). */
async function annoncer(guild, membre, a) {
  const cfg = config(guild.id);
  const salon = cfg.astro_salon ? guild.channels.cache.get(cfg.astro_salon) : null;
  if (!salon?.isTextBased()) return;
  // Seuls les evenements qui comptent : premiere victoire, record du serveur.
  if (!a.premier && !a.recordServeur) return;
  const { t } = traducteur(guild);
  const gains = [];
  if (a.recompense?.xp) gains.push(`+${a.recompense.xp} XP`);
  if (a.recompense?.argent) gains.push(require('./economie').somme(guild.id, a.recompense.argent));
  await salon.send(C.envoi([C.conteneur([
    C.sectionVignette(
      `### 🚀 ${t(a.recordServeur ? 'astro.annonce_record' : 'astro.annonce_fini', { membre: `${membre}`, niveau: a.niveau, nom: NIVEAUX[a.niveau] })}\n`
      + `⏱️ **${formaterTemps(a.temps)}** · ${etoiles(a.etoiles)}${gains.length ? ` · 🎁 ${gains.join(' · ')}` : ''}`,
      membre.displayAvatarURL({ size: 128 })
    ),
    C.texte(`-# ${t('astro.annonce_pied')}`),
  ], 0xffc93c)], { allowedMentions: { parse: [] } }));
}

module.exports = {
  q, NIVEAUX, MAX_NIVEAU, PERSONNAGES, defaut, nettoyer, valider, creerSession, lireSession,
  noterIntention, intentionSalon, sauvegarder, formaterTemps, etoiles,
};
