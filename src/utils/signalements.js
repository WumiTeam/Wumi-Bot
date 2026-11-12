const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  PermissionsBitField,
  MessageFlags,
} = require('discord.js');
const conf = require('../../config');
const { req, config } = require('../database/db');
const { embeds, tronquer, ts, peutSanctionner } = require('./outils');
const { enregistrer } = require('./sanctions');
const { envoyerLog } = require('./logs');
const logger = require('./logger');
const { E } = require('./emojis');
const { traducteur } = require('./langues');

const DUREE_MUTE_MINUTES = 60;

/** Salon ou l'equipe recoit les signalements (null si non configure). */
function salonSignalements(guild) {
  const id = config(guild.id).signalement_salon;
  if (!id) return null;
  const salon = guild.channels.cache.get(id);
  return salon?.isTextBased() ? salon : null;
}

/** Ouvre la fenetre qui demande la raison du signalement. */
async function ouvrirFenetre(interaction) {
  // `ouvrirFenetre` repond elle-meme a l'interaction : elle a donc
  // l'interaction sous la main, et avec elle la langue du serveur.
  const { t } = traducteur(interaction);
  const message = interaction.targetMessage;

  if (!salonSignalements(interaction.guild)) {
    return interaction.reply({
      embeds: [embeds.avertissement(t('signaler.pas_configure'))],
      flags: MessageFlags.Ephemeral,
    });
  }
  if (message.author.bot) {
    return interaction.reply({ embeds: [embeds.erreur(t('signaler.pas_de_bot'))], flags: MessageFlags.Ephemeral });
  }
  if (message.author.id === interaction.user.id) {
    return interaction.reply({ embeds: [embeds.erreur(t('signaler.pas_soi_meme'))], flags: MessageFlags.Ephemeral });
  }
  if (req.signalementEnAttente.get(message.id)) {
    return interaction.reply({
      embeds: [embeds.info(t('signaler.deja_signale'))],
      flags: MessageFlags.Ephemeral,
    });
  }

  // Anti-abus : un signalement toutes les N secondes par membre.
  const delai = (config(interaction.guild.id).signalement_delai ?? 60) * 1000;
  const derniere = req.dernierSignalementDe.get(interaction.guild.id, interaction.user.id)?.derniere ?? 0;
  const reste = delai - (Date.now() - derniere);
  if (reste > 0) {
    return interaction.reply({
      embeds: [embeds.avertissement(t('signaler.trop_vite', { quand: ts(Date.now() + reste, 'R') }))],
      flags: MessageFlags.Ephemeral,
    });
  }

  const fenetre = new ModalBuilder()
    .setCustomId(`sig_modal_${message.channelId}_${message.id}`)
    .setTitle(t('signaler.fenetre_titre'))
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('raison')
          .setLabel(t('signaler.champ_label'))
          .setPlaceholder(t('signaler.champ_exemple'))
          .setStyle(TextInputStyle.Paragraph)
          .setMinLength(5)
          .setMaxLength(500)
          .setRequired(true)
      )
    );

  return interaction.showModal(fenetre);
}

/**
 * Boutons proposes a l'equipe sous un signalement.
 * `t` vient de l'appelant : cette fonction ne repond a aucune interaction,
 * elle n'a donc pas de langue a elle — celle du serveur lui est passee.
 */
function boutons(id, t, actif = true) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`sig_supprimer_${id}`).setLabel(t('signaler.bouton_supprimer')).setEmoji(E('corbeille')).setStyle(ButtonStyle.Danger).setDisabled(!actif),
    new ButtonBuilder().setCustomId(`sig_avertir_${id}`).setLabel(t('signaler.bouton_avertir')).setEmoji(E('avertissement')).setStyle(ButtonStyle.Secondary).setDisabled(!actif),
    new ButtonBuilder().setCustomId(`sig_mute_${id}`).setLabel(t('signaler.bouton_mute', { n: DUREE_MUTE_MINUTES })).setEmoji(E('muet')).setStyle(ButtonStyle.Secondary).setDisabled(!actif),
    new ButtonBuilder().setCustomId(`sig_ignorer_${id}`).setLabel(t('signaler.bouton_ignorer')).setEmoji(E('succes')).setStyle(ButtonStyle.Success).setDisabled(!actif)
  );
}

/**
 * Fiche envoyee a l'equipe.
 * `signalement.contenu` — le texte du message signale — n'est JAMAIS
 * traduit ni reformule : c'est une preuve, gardee telle quelle pour que
 * l'equipe puisse juger meme si le message d'origine a disparu.
 */
function fiche(signalement, guild, t) {
  const embed = new EmbedBuilder()
    .setColor(conf.couleurs.avertissement)
    .setTitle(`${E('drapeau')} ${t('signaler.fiche_titre', { id: signalement.id })}`)
    .addFields(
      { name: t('signaler.fiche_auteur'), value: `<@${signalement.auteur_id}>\n\`${signalement.auteur_id}\``, inline: true },
      { name: t('signaler.fiche_signale_par'), value: `<@${signalement.signaleur_id}>`, inline: true },
      { name: t('signaler.fiche_salon'), value: `<#${signalement.channel_id}>`, inline: true },
      { name: t('signaler.fiche_raison'), value: tronquer(signalement.raison || t('signaler.fiche_aucune'), 1000) },
      {
        name: t('signaler.fiche_message'),
        value: signalement.contenu ? tronquer(signalement.contenu, 1000) : t('signaler.fiche_pas_de_texte'),
      },
      {
        name: t('signaler.fiche_lien'),
        value: `[${t('signaler.fiche_aller')}](https://discord.com/channels/${guild.id}/${signalement.channel_id}/${signalement.message_id})`,
      }
    )
    .setTimestamp(signalement.date);
  return embed;
}

/** Enregistre le signalement et previent l'equipe. */
async function enregistrerSignalement(interaction) {
  const { t } = traducteur(interaction);
  const [, , channelId, messageId] = interaction.customId.split('_');
  const raison = interaction.fields.getTextInputValue('raison').trim();
  const guild = interaction.guild;

  const salonEquipe = salonSignalements(guild);
  if (!salonEquipe) {
    return interaction.reply({
      embeds: [embeds.erreur(t('signaler.salon_supprime'))],
      flags: MessageFlags.Ephemeral,
    });
  }

  const salon = guild.channels.cache.get(channelId);
  const message = await salon?.messages.fetch(messageId).catch(() => null);
  if (!message) {
    return interaction.reply({
      embeds: [embeds.erreur(t('signaler.message_introuvable'))],
      flags: MessageFlags.Ephemeral,
    });
  }

  const date = Date.now();
  const info = req.creerSignalement.run({
    guild_id: guild.id,
    message_id: messageId,
    channel_id: channelId,
    auteur_id: message.author.id,
    signaleur_id: interaction.user.id,
    contenu: message.content?.slice(0, 1800) || null,
    raison,
    date,
  });

  const signalement = {
    id: Number(info.lastInsertRowid),
    guild_id: guild.id,
    message_id: messageId,
    channel_id: channelId,
    auteur_id: message.author.id,
    signaleur_id: interaction.user.id,
    contenu: message.content,
    raison,
    date,
  };

  await salonEquipe
    .send({ embeds: [fiche(signalement, guild, t)], components: [boutons(signalement.id, t)] })
    .catch((e) => logger.avertissement('Signalement non transmis :', e.message));

  return interaction.reply({
    embeds: [embeds.succes(t('signaler.envoye', { id: signalement.id }))],
    flags: MessageFlags.Ephemeral,
  });
}

/** Cloture un signalement : desactive les boutons et note l'action. */
async function cloturer(interaction, signalement, statut, action, couleur) {
  const { t } = traducteur(interaction);
  // `action` arrive deja traduite par l'appelant (gererBouton) : c'est lui
  // qui sait si c'est "Auteur averti" ou "Author warned". Elle est ensuite
  // persistee telle quelle — un simple texte d'affichage, jamais relu dans
  // une autre langue que celle ou il a ete ecrit.
  req.traiterSignalement.run({ id: signalement.id, statut, traite_par: interaction.user.id, action });

  const embed = EmbedBuilder.from(interaction.message.embeds[0])
    .setColor(couleur)
    .addFields({
      name: t('signaler.fiche_traite'),
      value: `${action}\n${t('signaler.fiche_traite_par', { moderateur: `<@${interaction.user.id}>`, quand: ts(Date.now(), 'R') })}`,
    });

  await interaction.update({ embeds: [embed], components: [boutons(signalement.id, t, false)] });

  await envoyerLog(
    interaction.guild,
    'moderation',
    new EmbedBuilder()
      .setColor(couleur)
      .setAuthor({ name: `${E('drapeau')} ${t('signaler.log_titre', { id: signalement.id })}`, iconURL: interaction.user.displayAvatarURL() || undefined })
      .setDescription(
        [
          t('signaler.log_ligne_action', { action }),
          t('signaler.log_ligne_auteur', { auteur: `<@${signalement.auteur_id}>` }),
          t('signaler.log_ligne_signale_par', { signaleur: `<@${signalement.signaleur_id}>` }),
          t('signaler.log_ligne_moderateur', { moderateur: `<@${interaction.user.id}>` }),
        ].join('\n')
      )
      .setTimestamp()
  );
}

/** Boutons de l'equipe sous une fiche de signalement. */
async function gererBouton(interaction) {
  const { t } = traducteur(interaction);
  const [, action, idBrut] = interaction.customId.split('_');
  const signalement = req.signalementParId.get(Number(idBrut));

  if (!interaction.memberPermissions?.has(PermissionsBitField.Flags.ModerateMembers)) {
    // Meme phrase que /appel liste : reutilisee plutot que dupliquee.
    return interaction.reply({ embeds: [embeds.erreur(t('appel.staff_seulement'))], flags: MessageFlags.Ephemeral });
  }
  if (!signalement) {
    return interaction.reply({ embeds: [embeds.erreur(t('signaler.introuvable'))], flags: MessageFlags.Ephemeral });
  }
  if (signalement.statut !== 'attente') {
    return interaction.reply({
      embeds: [embeds.info(t('signaler.deja_traite', { moderateur: `<@${signalement.traite_par}>` }))],
      flags: MessageFlags.Ephemeral,
    });
  }

  // ------------------------------------------------------------- IGNORER
  if (action === 'ignorer') {
    return cloturer(interaction, signalement, 'ignore', t('signaler.action_ignore'), conf.couleurs.succes);
  }

  // ---------------------------------------------------------- SUPPRIMER
  if (action === 'supprimer') {
    const salon = interaction.guild.channels.cache.get(signalement.channel_id);
    const message = await salon?.messages.fetch(signalement.message_id).catch(() => null);
    if (!message) {
      return cloturer(interaction, signalement, 'traite', t('signaler.action_deja_supprime'), conf.couleurs.log);
    }
    const supprime = await message.delete().catch((e) => {
      logger.avertissement('Suppression de message signale :', e.message);
      return null;
    });
    if (!supprime) {
      return interaction.reply({
        embeds: [embeds.erreur(t('signaler.suppression_impossible', { permission: t('permissions.ManageMessages') }))],
        flags: MessageFlags.Ephemeral,
      });
    }
    return cloturer(interaction, signalement, 'traite', t('signaler.action_supprime'), conf.couleurs.erreur);
  }

  // ------------------------------------------------ AVERTIR / MUTE
  const cible = await interaction.guild.members.fetch(signalement.auteur_id).catch(() => null);
  if (!cible) {
    return interaction.reply({
      embeds: [embeds.erreur(t('signaler.auteur_parti'))],
      flags: MessageFlags.Ephemeral,
    });
  }

  // peutSanctionner rend une CLE, pas une phrase : c'est ici qu'on la
  // traduit, parce que c'est ici qu'on connait la langue du serveur.
  const refus = peutSanctionner(interaction.member, cible, interaction.guild.members.me);
  if (refus) {
    return interaction.reply({ embeds: [embeds.erreur(t(refus))], flags: MessageFlags.Ephemeral });
  }

  // Le gabarit est traduit ; `signalement.raison` (ecrite par le membre qui
  // a signale) est une donnee inseree telle quelle, jamais reformulee.
  const raison = t('signaler.raison_sanction', { id: signalement.id, raison: signalement.raison });

  if (action === 'avertir') {
    await enregistrer({ guild: interaction.guild, cible: cible.user, moderateur: interaction.user, type: 'warn', raison });
    return cloturer(interaction, signalement, 'traite', t('signaler.action_averti'), conf.couleurs.avertissement);
  }

  if (action === 'mute') {
    const duree = DUREE_MUTE_MINUTES * 60_000;
    const applique = await cible.timeout(duree, raison).catch((e) => {
      logger.avertissement('Mute depuis un signalement :', e.message);
      return null;
    });
    if (applique === null) {
      return interaction.reply({
        embeds: [embeds.erreur(t('signaler.mute_impossible', { permission: t('permissions.ModerateMembers') }))],
        flags: MessageFlags.Ephemeral,
      });
    }
    await enregistrer({ guild: interaction.guild, cible: cible.user, moderateur: interaction.user, type: 'mute', raison, duree });
    return cloturer(interaction, signalement, 'traite', t('signaler.action_mute', { n: DUREE_MUTE_MINUTES }), conf.couleurs.erreur);
  }
}

/** Point d'entree pour tous les composants prefixes par "sig_". */
async function gererInteraction(interaction) {
  try {
    if (interaction.isModalSubmit()) return await enregistrerSignalement(interaction);
    if (interaction.isButton()) return await gererBouton(interaction);
  } catch (e) {
    logger.erreur('Signalement :', e);
    const { t } = traducteur(interaction);
    const reponse = { embeds: [embeds.erreur(t('erreur.generique'))], flags: MessageFlags.Ephemeral };
    if (interaction.replied || interaction.deferred) await interaction.followUp(reponse).catch(() => null);
    else await interaction.reply(reponse).catch(() => null);
  }
}

module.exports = { ouvrirFenetre, gererInteraction, salonSignalements, DUREE_MUTE_MINUTES };
