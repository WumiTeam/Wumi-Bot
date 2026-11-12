const { EmbedBuilder, GuildVerificationLevel } = require('discord.js');
const conf = require('../../config');
const { config, majConfig } = require('../database/db');
const { envoyerLog } = require('./logs');
const logger = require('./logger');
const { E } = require('./emojis');
const { traducteur } = require('./langues');

const minuteries = new Map(); // guildId -> Timeout de fin de lockdown

/** Active le mode raid : verification maximale + alerte moderation. */
async function declencherLockdown(guild, raison, client) {
  const cfg = config(guild.id);
  if (cfg.antiraid_verrouille) return;

  majConfig(guild.id, { antiraid_verrouille: 1 });

  try {
    if (guild.verificationLevel !== GuildVerificationLevel.VeryHigh) {
      await guild.setVerificationLevel(GuildVerificationLevel.VeryHigh, 'Anti-raid : mode verrouillage');
    }
  } catch (e) {
    logger.avertissement(`Anti-raid : niveau de verification non modifie (${e.message})`);
  }

  const embed = new EmbedBuilder()
    .setColor(conf.couleurs.erreur)
    .setTitle(`${E('alerte')} ${traducteur(guild).t('journal.antiraid_titre')}`)
    .setDescription(
      [
        raison,
        '',
        traducteur(guild).t('journal.antiraid_texte', { action: conf.antiRaid.actionPendantRaid, n: conf.antiRaid.dureeLockdownMinutes }),
      ].join('\n')
    )
    .setTimestamp();
  await envoyerLog(guild, 'moderation', embed);
  logger.avertissement(`Anti-raid declenche sur ${guild.name} : ${raison}`);

  clearTimeout(minuteries.get(guild.id));
  minuteries.set(
    guild.id,
    setTimeout(() => leverLockdown(guild, 'Levee automatique').catch(() => null), conf.antiRaid.dureeLockdownMinutes * 60_000)
  );
}

/** Desactive le mode raid. */
async function leverLockdown(guild, raison = 'Levee manuelle') {
  const cfg = config(guild.id);
  if (!cfg.antiraid_verrouille) return false;
  majConfig(guild.id, { antiraid_verrouille: 0 });
  clearTimeout(minuteries.get(guild.id));
  minuteries.delete(guild.id);

  try {
    await guild.setVerificationLevel(GuildVerificationLevel.Medium, 'Anti-raid : fin du verrouillage');
  } catch {
    /* ignore */
  }

  await envoyerLog(
    guild,
    'moderation',
    new EmbedBuilder().setColor(conf.couleurs.succes).setTitle(`${E('succes')} ${traducteur(guild).t('journal.antiraid_fin')}`).setDescription(raison).setTimestamp()
  );
  return true;
}

/**
 * Enregistre une arrivee et declenche le lockdown si le seuil est depasse.
 * @returns {boolean} true si un raid vient d'etre detecte
 */
function enregistrerArrivee(client, guild) {
  const cle = guild.id;
  const maintenant = Date.now();
  const fenetre = conf.antiRaid.joinsFenetreSecondes * 1000;
  const liste = (client.arrivees.get(cle) ?? []).filter((d) => maintenant - d < fenetre);
  liste.push(maintenant);
  client.arrivees.set(cle, liste);
  return liste.length >= conf.antiRaid.joinsSeuil;
}

/** Oublie un serveur : appele quand le bot en est retire. */
function oublierServeur(guildId) {
  const t = minuteries.get(guildId);
  if (t) clearTimeout(t);
  minuteries.delete(guildId);
}

module.exports = { declencherLockdown, leverLockdown, enregistrerArrivee, oublierServeur };
