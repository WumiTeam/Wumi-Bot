const { EmbedBuilder } = require('discord.js');
const conf = require('../../config');
const { db } = require('../database/db');
const { envoyerLog } = require('./logs');
const logger = require('./logger');
const { E } = require('./emojis');

/**
 * Desactive en base les mutes dont la duree est ecoulee.
 * (Le timeout Discord expire tout seul cote API : on ne fait que tenir la base a jour.)
 */
function verifierMutesExpires() {
  const maintenant = Date.now();
  const expires = db
    .prepare("SELECT id, date, duree FROM sanctions WHERE type = 'mute' AND actif = 1 AND duree IS NOT NULL")
    .all()
    .filter((s) => s.date + s.duree <= maintenant);

  if (expires.length === 0) return;
  const maj = db.prepare('UPDATE sanctions SET actif = 0 WHERE id = ?');
  db.exec('BEGIN');
  try {
    for (const l of expires) maj.run(l.id);
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
  logger.debug(`${expires.length} mute(s) marque(s) comme expire(s).`);
}

/**
 * Debannit les membres dont le bannissement temporaire est termine.
 * Fiable meme apres un redemarrage du bot puisque tout est stocke en base.
 */
async function verifierBansExpires(client) {
  const maintenant = Date.now();
  const expires = db
    .prepare("SELECT * FROM sanctions WHERE type = 'ban' AND actif = 1 AND duree IS NOT NULL")
    .all()
    .filter((s) => s.date + s.duree <= maintenant);

  for (const sanction of expires) {
    db.prepare('UPDATE sanctions SET actif = 0 WHERE id = ?').run(sanction.id);
    const guild = client.guilds.cache.get(sanction.guild_id);
    if (!guild) continue;

    const banni = await guild.bans.fetch(sanction.user_id).catch(() => null);
    if (!banni) continue;

    await guild.bans.remove(sanction.user_id, 'Fin du bannissement temporaire').catch(() => null);
    await envoyerLog(
      guild,
      'moderation',
      new EmbedBuilder()
        .setColor(conf.couleurs.succes)
        .setTitle(`${E('recycler')} ${require('./langues').traducteur(guild).t('journal.tempban_fin')}`)
        .setDescription(require('./langues').traducteur(guild).t('journal.tempban_texte', { membre: `<@${sanction.user_id}> \`${sanction.user_id}\`` }))
        .setFooter({ text: `#${sanction.id}` })
        .setTimestamp()
    );
    logger.info(`Debannissement automatique de ${sanction.user_id} sur ${guild.name}.`);
  }
}

module.exports = { verifierMutesExpires, verifierBansExpires };
