const { EmbedBuilder } = require('discord.js');
const conf = require('../../config');
const { config } = require('../database/db');
const { envoyerLog } = require('./logs');
const { remplacerVariables } = require('./outils');
const logger = require('./logger');
const { E } = require('./emojis');

// Une fonction : l'emoji du bot n'existe qu'apres la connexion a Discord.
const MESSAGE_DEFAUT = () =>
  `Merci {mention} pour ton boost ! ${E('boost')}\n**{serveur}** compte maintenant **{boosts}** boost(s), niveau **{niveau}**.`;

/** Remplace les variables du message de remerciement. */
function texteRemerciement(modele, membre) {
  return remplacerVariables(modele || MESSAGE_DEFAUT(), { membre, guild: membre.guild })
    .replaceAll('{boosts}', String(membre.guild.premiumSubscriptionCount ?? 0))
    .replaceAll('{niveau}', String(membre.guild.premiumTier ?? 0));
}

/** Un membre vient de booster : remerciement, role et monnaie. */
async function traiterBoost(membre) {
  const cfg = config(membre.guild.id);

  // Role de booster maison (en plus du role Discord automatique)
  let role = null;
  if (cfg.boost_role) {
    role = membre.guild.roles.cache.get(cfg.boost_role);
    if (role?.editable && !membre.roles.cache.has(role.id)) {
      await membre.roles.add(role, 'Boost du serveur').catch(() => null);
    }
  }

  // Recompense en monnaie
  let gain = 0;
  if (cfg.eco_actif && cfg.boost_monnaie > 0) {
    try {
      require('./economie').crediter(membre.guild.id, membre.id, cfg.boost_monnaie);
      gain = cfg.boost_monnaie;
    } catch (e) {
      logger.avertissement('Récompense de boost :', e.message);
    }
  }

  const embed = new EmbedBuilder()
    .setColor(0xf47fff)
    .setTitle(`${E('boost')} ${require('./langues').traducteur(membre.guild).t('journal.boost_titre')}`)
    .setDescription(texteRemerciement(cfg.boost_message, membre))
    .setThumbnail(membre.user.displayAvatarURL({ size: 256 }))
    .setTimestamp();

  const extras = [
    role ? require('./langues').traducteur(membre.guild).t('journal.boost_role', { role: `${role}` }) : null,
    gain ? require('./langues').traducteur(membre.guild).t('journal.boost_gain', { somme: require('./economie').somme(membre.guild.id, gain) }) : null,
  ].filter(Boolean);
  if (extras.length) embed.addFields({ name: require('./langues').traducteur(membre.guild).t('journal.boost_recompenses'), value: extras.join('\n') });

  const salon = cfg.boost_salon ? membre.guild.channels.cache.get(cfg.boost_salon) : null;
  if (salon?.isTextBased()) {
    await salon.send({ content: `${membre}`, embeds: [embed] }).catch(() => null);
  }

  await envoyerLog(membre.guild, 'membres', embed);
  logger.info(`${membre.user.tag} a boosté ${membre.guild.name}.`);
}

/** Le boost s'est arrete : on retire le role maison. */
async function traiterFinBoost(membre) {
  const cfg = config(membre.guild.id);
  if (!cfg.boost_role) return;

  const role = membre.guild.roles.cache.get(cfg.boost_role);
  if (role?.editable && membre.roles.cache.has(role.id)) {
    await membre.roles.remove(role, 'Fin du boost').catch(() => null);
  }

  await envoyerLog(
    membre.guild,
    'membres',
    new EmbedBuilder()
      .setColor(conf.couleurs.avertissement)
      .setAuthor({ name: `${E('boost')} ${require('./langues').traducteur(membre.guild).t('journal.boost_fin', { nom: membre.user.tag })}`, iconURL: membre.user.displayAvatarURL() || undefined })
      .setDescription(role ? require('./langues').traducteur(membre.guild).t('journal.boost_fin_role', { role: `${role}` }) : '—')
      .setTimestamp()
  );
}

module.exports = { MESSAGE_DEFAUT, texteRemerciement, traiterBoost, traiterFinBoost };
