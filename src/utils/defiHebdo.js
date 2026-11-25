/**
 * DEFI DE LA SEMAINE de Wumi Run (Wumi 2.21).
 *
 * Chaque semaine (du lundi 00:00 au dimanche 23:59, heure UTC), un niveau est
 * mis en avant, le meme pour tous les serveurs. Le meilleur temps realise sur
 * ce niveau PENDANT la semaine compte, meme s'il ne bat pas le record
 * personnel du joueur : le jeu signale chaque partie terminee (POST
 * /astro/api/run), plus seulement les records.
 *
 * Sur un serveur qui a choisi un salon (/wumirun config salon-defi) :
 *   - un message de defi est publie le lundi et mis a jour en direct ;
 *   - le lundi suivant, le podium est annonce et recompense (monnaie et XP du
 *     serveur, si l'economie et les niveaux y sont actifs).
 */
const C = require('./composants');
const { db, config } = require('../database/db');
const { traducteur } = require('./langues');
const { E } = require('./emojis');
const logger = require('./logger');

db.exec(`
CREATE TABLE IF NOT EXISTS astro_defis (
  semaine  TEXT NOT NULL,
  guild_id TEXT NOT NULL,
  user_id  TEXT NOT NULL,
  temps    INTEGER NOT NULL,
  etoiles  INTEGER NOT NULL DEFAULT 0,
  essais   INTEGER NOT NULL DEFAULT 1,
  le       INTEGER NOT NULL,
  PRIMARY KEY (semaine, guild_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_astro_defis ON astro_defis (semaine, guild_id, temps);
CREATE TABLE IF NOT EXISTS astro_defi_etat (
  guild_id   TEXT PRIMARY KEY,
  semaine    TEXT NOT NULL,
  message_id TEXT,
  salon_id   TEXT
);
`);

const q = {
  ecrire: db.prepare(`
    INSERT INTO astro_defis (semaine, guild_id, user_id, temps, etoiles, essais, le) VALUES (?, ?, ?, ?, ?, 1, ?)
    ON CONFLICT(semaine, guild_id, user_id) DO UPDATE SET
      essais = astro_defis.essais + 1,
      etoiles = CASE WHEN excluded.temps < astro_defis.temps THEN excluded.etoiles ELSE astro_defis.etoiles END,
      le = CASE WHEN excluded.temps < astro_defis.temps THEN excluded.le ELSE astro_defis.le END,
      temps = MIN(astro_defis.temps, excluded.temps)
  `),
  classement: db.prepare('SELECT user_id, temps, etoiles, essais FROM astro_defis WHERE semaine = ? AND guild_id = ? ORDER BY temps ASC, le ASC LIMIT ?'),
  moi: db.prepare('SELECT temps, etoiles, essais FROM astro_defis WHERE semaine = ? AND guild_id = ? AND user_id = ?'),
  rang: db.prepare('SELECT COUNT(*) AS n FROM astro_defis WHERE semaine = ? AND guild_id = ? AND temps < ?'),
  participants: db.prepare('SELECT COUNT(*) AS n FROM astro_defis WHERE semaine = ? AND guild_id = ?'),
  tous: db.prepare('SELECT user_id FROM astro_defis WHERE semaine = ? AND guild_id = ?'),
  etat: db.prepare('SELECT * FROM astro_defi_etat WHERE guild_id = ?'),
  ecrireEtat: db.prepare(`
    INSERT INTO astro_defi_etat (guild_id, semaine, message_id, salon_id) VALUES (?, ?, ?, ?)
    ON CONFLICT(guild_id) DO UPDATE SET semaine = excluded.semaine, message_id = excluded.message_id, salon_id = excluded.salon_id
  `),
  serveurs: db.prepare('SELECT guild_id, astro_defi FROM config WHERE astro_defi IS NOT NULL'),
};

const SEMAINE_MS = 7 * 86_400_000;
const LUNDI_REF = Date.UTC(2024, 0, 1); // un lundi
/** Recompenses du podium : [monnaie, XP]. Tout participant recoit PARTICIPATION. */
const PODIUM = [[500, 300], [300, 200], [150, 100]];
const PARTICIPATION = [25, 0];

/** La semaine qui contient `maintenant`. */
function semaine(maintenant = Date.now()) {
  const index = Math.floor((maintenant - LUNDI_REF) / SEMAINE_MS);
  const debut = LUNDI_REF + index * SEMAINE_MS;
  const A = require('./astro');
  return {
    index,
    id: new Date(debut).toISOString().slice(0, 10),
    debut,
    fin: debut + SEMAINE_MS,
    niveau: (index % A.MAX_NIVEAU) + 1,
  };
}

// ------------------------------------------------- ENREGISTRER UNE PARTIE
const derniereRun = new Map(); // uid -> horodatage, contre les envois en rafale

/**
 * Une partie terminee, envoyee par le jeu. Ne compte que sur le niveau de la
 * semaine et pour un membre du serveur ou le jeu tourne.
 * @returns {{ compte: boolean, raison?: string, rang?: number }}
 */
async function enregistrer(client, uid, run, contexte = {}) {
  const A = require('./astro');
  const s = semaine();
  if (!Number.isInteger(run.niveau) || run.niveau < 1 || run.niveau > A.MAX_NIVEAU) return { compte: false, raison: 'niveau' };
  if (!Number.isFinite(run.temps) || run.temps < 3000 || run.temps > 60 * 60_000) return { compte: false, raison: 'temps' };
  // On ne peut pas finir deux parties plus vite que la duree d'une partie.
  const avant = derniereRun.get(uid) ?? 0;
  const maintenant = Date.now();
  if (maintenant - avant < run.temps * 0.9) return { compte: false, raison: 'rafale' };
  derniereRun.set(uid, maintenant);
  if (run.niveau !== s.niveau) return { compte: false, raison: 'autre niveau' };

  const guild = contexte.guildId ? client.guilds.cache.get(contexte.guildId) : null;
  const membre = guild ? await guild.members.fetch(uid).catch(() => null) : null;
  if (!guild || !membre) return { compte: false, raison: 'hors serveur' };

  const etoiles = Math.max(0, Math.min(3, Math.floor(run.etoiles ?? 0)));
  q.ecrire.run(s.id, guild.id, uid, Math.round(run.temps), etoiles, maintenant);
  const moi = q.moi.get(s.id, guild.id, uid);
  planifierMaj(client, guild.id);
  return { compte: true, rang: q.rang.get(s.id, guild.id, moi.temps).n + 1 };
}

// ------------------------------------------------------------- AFFICHAGE
const medaille = (i) => [E('premier'), E('deuxieme'), E('troisieme')][i] ?? `**#${i + 1}**`;

/** Le message du defi en cours (Components V2). */
function vue(guild, s = semaine(), { pour = null } = {}) {
  const A = require('./astro');
  const { t, nombre } = traducteur(guild);
  const lignes = q.classement.all(s.id, guild.id, 10);
  const n = q.participants.get(s.id, guild.id).n;
  const cfg = config(guild.id);
  const gains = PODIUM.map(([argent, xp], i) => {
    const morceaux = [];
    if (cfg.eco_actif) morceaux.push(require('./economie').somme(guild.id, argent));
    if (cfg.xp_actif) morceaux.push(`${nombre(xp)} XP`);
    return morceaux.length ? `${medaille(i)} ${morceaux.join(' + ')}` : null;
  }).filter(Boolean);

  const corps = [
    C.texte(`## ${E('mission')} ${t('astro.defi_titre')}\n### ${t('astro.defi_niveau', { niveau: s.niveau, nom: t(`donnees.niveaux_run.${s.niveau}`) })}`),
    C.texte(t('astro.defi_regle', { fin: `<t:${Math.floor(s.fin / 1000)}:R>` })),
    C.separateur(),
    C.texte(lignes.length
      ? lignes.map((l, i) => `${medaille(i)} <@${l.user_id}> · ⏱️ **${A.formaterTemps(l.temps)}** · ${A.etoiles(l.etoiles)}`).join('\n')
      : t('astro.defi_vide')),
  ];
  if (pour) {
    const moi = q.moi.get(s.id, guild.id, pour);
    corps.push(C.texte(`-# ${moi
      ? t('astro.defi_moi', { rang: q.rang.get(s.id, guild.id, moi.temps).n + 1, temps: A.formaterTemps(moi.temps), essais: moi.essais, n: moi.essais })
      : t('astro.defi_moi_aucun')}`));
  }
  corps.push(C.separateur());
  if (gains.length) corps.push(C.texte(`${E('cadeau')} ${t('astro.defi_gains')} · ${gains.join(' · ')}`));
  corps.push(C.texte(`-# ${t('astro.defi_pied', { n: nombre(n) })}`));
  corps.push(require('./astroLancer').bouton(t));
  return C.envoi([C.conteneur(corps, 0xffc93c)], { allowedMentions: { parse: [] } });
}

// ------------------------------------------------------ MISE A JOUR EN DIRECT
const enAttente = new Map(); // guildId -> timer
function planifierMaj(client, guildId) {
  if (enAttente.has(guildId)) return;
  enAttente.set(guildId, setTimeout(() => {
    enAttente.delete(guildId);
    majMessage(client, guildId).catch((e) => logger.debug('Defi (maj) :', e.message));
  }, 30_000).unref?.() ?? true);
}

async function majMessage(client, guildId) {
  const etat = q.etat.get(guildId);
  const s = semaine();
  if (!etat?.message_id || etat.semaine !== s.id) return;
  const guild = client.guilds.cache.get(guildId);
  const salon = guild?.channels.cache.get(etat.salon_id);
  if (!salon?.isTextBased?.()) return;
  const msg = await salon.messages.fetch(etat.message_id).catch(() => null);
  if (msg) await msg.edit(vue(guild, s));
}

// ------------------------------------------------- CLOTURE ET NOUVEAU DEFI
/** Annonce et recompense le podium d'une semaine terminee. */
async function cloturer(guild, salon, idSemaine) {
  const A = require('./astro');
  const { t, nombre } = traducteur(guild);
  const cfg = config(guild.id);
  const podium = q.classement.all(idSemaine, guild.id, 3);
  const participants = q.tous.all(idSemaine, guild.id).map((l) => l.user_id);
  if (!participants.length) return;
  const crediter = (uid, [argent, xp]) => {
    const out = [];
    try {
      if (argent && cfg.eco_actif) { require('./economie').crediter(guild.id, uid, argent); out.push(require('./economie').somme(guild.id, argent)); }
    } catch (e) { logger.debug('Defi (monnaie) :', e.message); }
    try {
      if (xp && cfg.xp_actif) { require('./niveaux').ajouterXp(guild.id, uid, xp); out.push(`${nombre(xp)} XP`); }
    } catch (e) { logger.debug('Defi (XP) :', e.message); }
    return out.join(' + ');
  };
  const lignes = podium.map((l, i) => {
    const gain = crediter(l.user_id, PODIUM[i]);
    return `${medaille(i)} <@${l.user_id}> · ⏱️ **${A.formaterTemps(l.temps)}**${gain ? ` · ${gain}` : ''}`;
  });
  const autres = participants.filter((u) => !podium.some((p) => p.user_id === u));
  let participation = '';
  for (const uid of autres) participation = crediter(uid, PARTICIPATION) || participation;

  const niveau = semaine(Date.parse(`${idSemaine}T12:00:00Z`)).niveau;
  await salon.send(C.envoi([C.conteneur([
    C.texte(`## ${E('classement')} ${t('astro.defi_resultats', { niveau, nom: t(`donnees.niveaux_run.${niveau}`) })}`),
    C.texte(lignes.join('\n')),
    ...(autres.length && participation ? [C.texte(`-# ${t('astro.defi_participation', { n: nombre(autres.length), gain: participation })}`)] : []),
  ], 0xffc93c)], { allowedMentions: { users: podium.map((p) => p.user_id) } }));
}

/** Verifie chaque serveur : cloture la semaine passee, publie le nouveau defi. */
async function tour(client) {
  const s = semaine();
  for (const { guild_id: gid, astro_defi: salonId } of q.serveurs.all()) {
    const guild = client.guilds.cache.get(gid);
    const salon = guild?.channels.cache.get(salonId);
    if (!salon?.isTextBased?.()) continue;
    const etat = q.etat.get(gid);
    if (etat?.semaine === s.id && etat.salon_id === salonId) continue;
    try {
      // L'etat est ecrit AVANT d'envoyer quoi que ce soit : si l'envoi
      // echoue, la semaine passee n'est jamais recompensee deux fois.
      const aCloturer = etat && etat.semaine !== s.id ? etat.semaine : null;
      q.ecrireEtat.run(gid, s.id, null, salon.id);
      if (aCloturer) await cloturer(guild, salon, aCloturer).catch((e) => logger.avertissement(`Defi Wumi Run, cloture (${guild.name}) :`, e.message));
      const msg = await salon.send(vue(guild, s));
      q.ecrireEtat.run(gid, s.id, msg.id, salon.id);
    } catch (e) {
      logger.avertissement(`Defi Wumi Run (${guild.name}) :`, e.message);
    }
  }
}

function demarrer(client) {
  tour(client).catch((e) => logger.avertissement('Defi Wumi Run :', e.message));
  setInterval(() => tour(client).catch((e) => logger.avertissement('Defi Wumi Run :', e.message)), 15 * 60_000).unref?.();
}

module.exports = { semaine, enregistrer, vue, tour, demarrer, cloturer, q, PODIUM, PARTICIPATION };
