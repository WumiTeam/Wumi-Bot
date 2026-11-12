const { EmbedBuilder } = require('discord.js');
const conf = require('../../config');
const { req } = require('../database/db');
const { envoyerLog } = require('./logs');
const { formaterDuree, ts } = require('./outils');
const logger = require('./logger');
const { E } = require('./emojis');
const { traducteur } = require('./langues');

/**
 * `nom` reste en francais en dur : les CLES ('warn', 'ban'...) sont la
 * donnee stockee en base, et appels.js importe cet objet pour son emoji ET
 * pour `.nom` — le toucher casserait un module hors de mon lot. L'AFFICHAGE
 * traduit passe par `sanctions.type.<cle>` plus bas, avec ce `nom` comme
 * repli pour un type qui n'aurait pas encore sa cle.
 */
const libelles = {
  warn: { nom: 'Avertissement', get emoji() { return E('avertissement'); }, couleur: conf.couleurs.avertissement },
  mute: { nom: 'Mute', get emoji() { return E('muet'); }, couleur: 0xe67e22 },
  unmute: { nom: 'Unmute', get emoji() { return E('vocal'); }, couleur: conf.couleurs.succes },
  kick: { nom: 'Expulsion', get emoji() { return E('porte'); }, couleur: 0xe67e22 },
  ban: { nom: 'Bannissement', get emoji() { return E('moderation'); }, couleur: conf.couleurs.erreur },
  unban: { nom: 'Debannissement', get emoji() { return E('recycler'); }, couleur: conf.couleurs.succes },
  automod: { nom: 'Automod', get emoji() { return E('robot'); }, couleur: 0x9b59b6 },
  clear: { nom: 'Purge', get emoji() { return E('balai'); }, couleur: conf.couleurs.info },
  lockdown: { nom: 'Verrouillage', get emoji() { return E('verrou'); }, couleur: conf.couleurs.erreur },
  softban: { nom: 'Softban', get emoji() { return E('balai'); }, couleur: 0xe67e22 },
  massban: { nom: 'Bannissement de masse', get emoji() { return E('alerte'); }, couleur: conf.couleurs.erreur },
  deconnexion: { nom: 'Déconnexion vocale', get emoji() { return E('vocal'); }, couleur: conf.couleurs.info },
};

/**
 * Enregistre une sanction en base, envoie le log de moderation
 * et previent le membre en message prive.
 */
/**
 * @param {object}   p
 * @param {Function} [p.action] la sanction elle-meme (ban, kick...). Si elle
 *   est fournie, l'ORDRE change : la sanction est notee, le MP part, PUIS
 *   l'action est executee. Sans ca, un membre banni ou expulse ne recevait
 *   jamais son MP — Discord refuse d'ecrire a quelqu'un qui ne partage plus
 *   aucun serveur avec le bot. Si l'action echoue, la sanction est retiree de
 *   l'historique et l'erreur remonte : l'historique ne ment jamais.
 */
async function enregistrer({ guild, cible, moderateur, type, raison, duree = null, prevenirEnMp = true, extra = null, action = null }) {
  const date = Date.now();
  // L'enregistrement en base ne bouge pas : meme repli francais qu'avant,
  // quelle que soit la langue du serveur — c'est une regle metier, pas de
  // l'affichage.
  const info = req.ajouterSanction.run({
    guild_id: guild.id,
    user_id: cible.id,
    moderateur_id: moderateur.id,
    type,
    raison: raison ?? 'Aucune raison fournie',
    duree,
    date,
  });
  const id = info.lastInsertRowid;
  const meta = libelles[type] ?? { nom: type, emoji: E('epingle'), couleur: conf.couleurs.principale };

  // `enregistrer()` connait `guild` : c'est ici, et seulement ici, qu'elle
  // peut savoir dans quelle langue ecrire le log et le MP.
  const { t, existe, langue } = traducteur(guild);
  const nomAffiche = existe(`sanctions.type.${type}`) ? t(`sanctions.type.${type}`) : meta.nom;
  // La raison ELLE-MEME (quand le moderateur en a ecrit une) est une donnee :
  // jamais traduite. Seul le texte de repli quand il n'y en a pas suit la
  // langue du serveur, puisque c'est une phrase du bot, pas un mot du
  // moderateur.
  const raisonAffichee = raison ?? t('sanction.sans_raison');

  logger.action(
    `sanction ${type}`,
    moderateur.username ?? moderateur.id,
    null,
    `sur ${cible.username ?? cible.id}${duree ? `, ${Math.round(duree / 60000)} min` : ''} — ${raison ?? 'sans raison'}`
  );

  /** Envoie le MP au membre. Renvoie vrai s'il est parti. */
  const prevenir = async () => {
    if (!prevenirEnMp || typeof cible.send !== 'function') return false;
    if (['unban', 'clear', 'lockdown', 'deconnexion'].includes(type)) return false;

    const mp = new EmbedBuilder()
      .setColor(meta.couleur)
      .setTitle(`${meta.emoji} ${nomAffiche}`)
      .setDescription(t('sanction.mp_description', { serveur: guild.name }))
      .addFields({ name: t('sanction.log_raison'), value: raisonAffichee })
      .setTimestamp(date);
    if (duree) mp.addFields({ name: t('sanction.log_duree'), value: formaterDuree(duree, langue), inline: true });

    // Bouton de contestation, si les appels sont ouverts sur ce serveur.
    const message = { embeds: [mp] };
    try {
      const appels = require('./appels');
      if (appels.actif(guild.id) && appels.CONTESTABLES.includes(type)) {
        mp.setFooter({ text: t('sanction.mp_footer_contestable', { id }) });
        message.components = [appels.boutonContester(id)];
      }
    } catch (e) {
      logger.avertissement('Bouton de contestation :', e.message);
    }
    return Boolean(await cible.send(message).catch(() => null));
  };

  // -------------------------------------------- MP, PUIS L'ACTION ELLE-MEME
  let mpEnvoye = false;
  if (action) {
    mpEnvoye = await prevenir();
    try {
      await action();
    } catch (e) {
      req.supprimerSanction.run(id, guild.id);
      throw e;
    }
  }

  // ------------------------------------------------------------- LOG
  const embed = new EmbedBuilder()
    .setColor(meta.couleur)
    .setAuthor({ name: `${meta.emoji} ${nomAffiche} — #${id}`, iconURL: cible.displayAvatarURL?.() || undefined })
    .addFields(
      { name: t('sanction.log_membre'), value: `${cible} \`${cible.tag ?? cible.username}\`\n\`${cible.id}\``, inline: true },
      { name: t('sanction.log_moderateur'), value: `${moderateur} \`${moderateur.tag ?? moderateur.username}\``, inline: true },
      { name: t('sanction.log_raison'), value: raisonAffichee }
    )
    .setFooter({ text: t('sanction.log_footer', { id }) })
    .setTimestamp(date);

  if (duree) {
    embed.addFields({
      name: t('sanction.log_duree'),
      value: t('sanction.log_duree_fin', { duree: formaterDuree(duree, langue), fin: ts(date + duree, 'R') }),
      inline: true,
    });
  }
  if (extra) embed.addFields(extra);
  if (action && prevenirEnMp && !['unban', 'clear', 'lockdown', 'deconnexion'].includes(type)) {
    embed.addFields({ name: t('sanction.log_mp'), value: mpEnvoye ? '✅' : `❌ ${t('sanction.log_mp_ferme')}`, inline: true });
  }

  await envoyerLog(guild, 'moderation', embed);

  // Sans action fournie (warn, mute...), le membre est toujours la : le MP
  // peut partir apres, comme avant.
  if (!action) await prevenir();

  return id;
}

/** Nombre d'avertissements actifs d'un membre. */
function avertissementsActifs(guildId, userId) {
  return req.avertissementsActifs.all(guildId, userId);
}

module.exports = { enregistrer, avertissementsActifs, libelles };
