/**
 * Le MODE RAID, en un clic (/raid).
 *
 * L'anti-raid automatique (antiRaid.js) reagit tout seul a une vague
 * d'arrivees. Ici, c'est le bouton rouge du moderateur qui VOIT le raid :
 *
 *   activer    verification au maximum, slowmode sur les salons ouverts a
 *              tous, expulsion des nouveaux venus (avec un MP qui explique),
 *              pendant une duree donnee ;
 *   desactiver tout remettre EXACTEMENT comme avant (niveau de verification
 *              et slowmode d'origine de chaque salon, gardes en base) ;
 *   nettoyer   expulser ou bannir d'un coup les comptes arrives dans les N
 *              dernieres minutes.
 *
 * L'etat est en base : un redemarrage du bot pendant un raid ne laisse pas le
 * serveur verrouille pour toujours, et la fin automatique est relue chaque
 * minute.
 */
const {
  GuildVerificationLevel,
  ChannelType,
  PermissionFlagsBits,
} = require('discord.js');
const conf = require('../../config');
const { db, config } = require('../database/db');
const { envoyerLog } = require('./logs');
const logger = require('./logger');
const { traducteur } = require('./langues');

db.exec(`
CREATE TABLE IF NOT EXISTS mode_raid (
  guild_id      TEXT PRIMARY KEY,
  depuis        INTEGER NOT NULL,
  fin           INTEGER,
  par           TEXT,
  raison        TEXT,
  niveau_avant  INTEGER,
  slowmodes     TEXT,              -- JSON { salonId: ancien slowmode }
  expulses      INTEGER NOT NULL DEFAULT 0
);
`);

const q = {
  lire: db.prepare('SELECT * FROM mode_raid WHERE guild_id = ?'),
  poser: db.prepare(`
    INSERT INTO mode_raid (guild_id, depuis, fin, par, raison, niveau_avant, slowmodes)
    VALUES (@guild_id, @depuis, @fin, @par, @raison, @niveau_avant, @slowmodes)
  `),
  effacer: db.prepare('DELETE FROM mode_raid WHERE guild_id = ?'),
  expulse: db.prepare('UPDATE mode_raid SET expulses = expulses + 1 WHERE guild_id = ?'),
  echus: db.prepare('SELECT guild_id FROM mode_raid WHERE fin IS NOT NULL AND fin <= ?'),
};

const SLOWMODE_RAID = 10; // secondes
const MAX_SALONS = 60;     // au-dela, Discord nous limiterait trop longtemps

function etat(guildId) {
  return q.lire.get(guildId) ?? null;
}

/** Les salons textuels ou @everyone peut ecrire : ceux qu'un raid inonde. */
function salonsOuverts(guild) {
  const tous = guild.roles.everyone;
  return guild.channels.cache.filter((c) => c.type === ChannelType.GuildText
    && c.permissionsFor(tous)?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages])
    && c.manageable);
}

async function activer(guild, { duree = null, par, raison = null, slowmode = true } = {}) {
  if (etat(guild.id)) return { deja: true };
  const { t } = traducteur(guild);
  const resume = { verification: false, salons: 0 };

  const niveauAvant = guild.verificationLevel;
  try {
    if (niveauAvant !== GuildVerificationLevel.VeryHigh) {
      await guild.setVerificationLevel(GuildVerificationLevel.VeryHigh, t('raid.audit_activer'));
    }
    resume.verification = true;
  } catch (e) {
    logger.avertissement(`Mode raid (${guild.name}) : vérification non modifiée —`, e.message);
  }

  const slowmodes = {};
  if (slowmode) {
    for (const salon of [...salonsOuverts(guild).values()].slice(0, MAX_SALONS)) {
      if (salon.rateLimitPerUser >= SLOWMODE_RAID) continue;
      slowmodes[salon.id] = salon.rateLimitPerUser ?? 0;
      const ok = await salon.setRateLimitPerUser(SLOWMODE_RAID, t('raid.audit_activer')).then(() => true).catch(() => false);
      if (ok) resume.salons++;
      else delete slowmodes[salon.id];
    }
  }

  q.poser.run({
    guild_id: guild.id,
    depuis: Date.now(),
    fin: duree ? Date.now() + duree : null,
    par: par ?? null,
    raison,
    niveau_avant: niveauAvant,
    slowmodes: JSON.stringify(slowmodes),
  });

  await envoyerLog(guild, 'moderation', {
    color: conf.couleurs.erreur,
    title: `🚨 ${t('raid.log_active')}`,
    description: [
      par ? t('raid.log_par', { membre: `<@${par}>` }) : null,
      raison ? t('raid.log_raison', { raison }) : null,
      duree ? t('raid.log_fin', { fin: `<t:${Math.floor((Date.now() + duree) / 1000)}:R>` }) : t('raid.log_sans_fin'),
      t('raid.log_resume', { n: resume.salons }),
    ].filter(Boolean).join('\n'),
    timestamp: new Date().toISOString(),
  });
  logger.avertissement(`Mode raid activé sur ${guild.name}`);
  return resume;
}

async function desactiver(guild, { par = null, automatique = false } = {}) {
  const e = etat(guild.id);
  if (!e) return null;
  const { t } = traducteur(guild);
  q.effacer.run(guild.id);

  if (e.niveau_avant !== null && e.niveau_avant !== undefined && guild.verificationLevel !== e.niveau_avant) {
    await guild.setVerificationLevel(e.niveau_avant, t('raid.audit_desactiver')).catch(() => null);
  }
  let restaures = 0;
  let slowmodes = {};
  try {
    slowmodes = JSON.parse(e.slowmodes ?? '{}');
  } catch {
    slowmodes = {};
  }
  for (const [id, avant] of Object.entries(slowmodes)) {
    const salon = guild.channels.cache.get(id);
    // Si quelqu'un a change le slowmode a la main pendant le raid, on ne
    // l'ecrase pas : on ne restaure que ce qu'on a pose.
    if (!salon || salon.rateLimitPerUser !== SLOWMODE_RAID) continue;
    if (await salon.setRateLimitPerUser(avant, t('raid.audit_desactiver')).then(() => true).catch(() => false)) restaures++;
  }

  await envoyerLog(guild, 'moderation', {
    color: conf.couleurs.succes,
    title: `✅ ${t('raid.log_desactive')}`,
    description: [
      automatique ? t('raid.log_auto') : (par ? t('raid.log_par', { membre: `<@${par}>` }) : null),
      t('raid.log_bilan', { n: e.expulses, duree: require('./langues').duree(Date.now() - e.depuis, traducteur(guild).langue) }),
      t('raid.log_restaures', { n: restaures }),
    ].filter(Boolean).join('\n'),
    timestamp: new Date().toISOString(),
  });
  return { expulses: e.expulses, restaures, depuis: e.depuis };
}

/**
 * Un nouveau venu pendant un raid : MP, puis expulsion.
 * @returns {Promise<boolean>} vrai si le membre a ete expulse
 */
async function filtrerArrivee(membre) {
  if (membre.user.bot) return false;
  const e = etat(membre.guild.id);
  if (!e) return false;
  if (!config(membre.guild.id).raid_kick_arrivees) return false;
  if (!membre.kickable) return false;

  const { t } = traducteur(membre.guild);
  await membre.send(t('raid.mp_arrivee', { serveur: membre.guild.name })).catch(() => null);
  const ok = await membre.kick(t('raid.audit_arrivee')).then(() => true).catch(() => false);
  if (ok) q.expulse.run(membre.guild.id);
  return ok;
}

/**
 * Les comptes arrives dans les N dernieres minutes, hors bots et hors staff.
 * Sans l'intent « membres », seul le cache est visible : on le dit.
 */
async function arrivesRecemment(guild, minutes) {
  await guild.members.fetch().catch(() => null);
  const depuis = Date.now() - minutes * 60_000;
  return guild.members.cache.filter((m) => !m.user.bot
    && (m.joinedTimestamp ?? 0) >= depuis
    && !m.permissions.has(PermissionFlagsBits.ManageMessages)
    && m.id !== guild.ownerId);
}

async function verifierEchus(client) {
  for (const { guild_id: id } of q.echus.all(Date.now())) {
    const guild = client.guilds.cache.get(id);
    if (!guild) continue;
    await desactiver(guild, { automatique: true }).catch((e) => logger.avertissement('Fin du mode raid :', e.message));
  }
}

let minuterie = null;
function demarrer(client) {
  if (minuterie) clearInterval(minuterie);
  verifierEchus(client).catch(() => null);
  minuterie = setInterval(() => verifierEchus(client).catch(() => null), 60_000);
  minuterie.unref?.();
}

module.exports = { etat, activer, desactiver, filtrerArrivee, arrivesRecemment, demarrer, SLOWMODE_RAID };
