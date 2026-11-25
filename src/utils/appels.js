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
const { embeds, tronquer, ts, formaterDuree } = require('./outils');
const { envoyerLog } = require('./logs');
const { libelles } = require('./sanctions');
const logger = require('./logger');
const { E } = require('./emojis');

const JOUR = 86_400_000;
// Sanctions contestables : une purge ou un verrouillage ne vise personne en particulier.
const CONTESTABLES = ['warn', 'mute', 'kick', 'ban', 'automod'];

/** Les appels sont-ils utilisables sur ce serveur ? */
// 2.24 : tout ce module parle la langue du serveur de la sanction.
const T = (guildId) => require('./langues').traducteur(guildId);

function actif(guildId) {
  try {
    const cfg = config(guildId);
    return Boolean(cfg.appel_actif && cfg.appel_salon);
  } catch {
    return false;
  }
}

/** Bouton "Contester" ajoute au message prive de sanction. */
function boutonContester(sanctionId, guildId = null) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`app_ouvrir_${sanctionId}`).setLabel(T(guildId).t('appel.u.contester')).setEmoji(E('courrier')).setStyle(ButtonStyle.Secondary)
  );
}

/**
 * Verifie qu'une sanction peut encore etre contestee.
 * Renvoie null si tout va bien, sinon le message a afficher.
 */
function verifierRecevabilite(sanction, userId) {
  if (!sanction) return T(null).t('appel.refus.inexistante');
  const { t } = T(sanction.guild_id);
  if (sanction.user_id !== userId) return t('appel.refus.pas_la_tienne');
  if (!CONTESTABLES.includes(sanction.type)) return t('appel.refus.non_contestable');
  if (!actif(sanction.guild_id)) return t('appel.refus.ferme');

  const jours = config(sanction.guild_id).appel_delai_jours ?? 14;
  if (jours > 0 && Date.now() - sanction.date > jours * JOUR) {
    return t('appel.refus.delai', { duree: t('commun.duree.jour', { n: jours }) });
  }

  const precedents = req.appelDeSanction.all(sanction.id);
  if (precedents.some((a) => a.statut === 'attente')) return t('appel.refus.en_attente');
  if (precedents.length) return t('appel.refus.deja_examinee');
  return null;
}

/** Ouvre le formulaire de contestation. */
async function ouvrirFormulaire(interaction, sanctionId) {
  const sanction = req.sanctionParIdGlobal.get(Number(sanctionId));
  const refus = verifierRecevabilite(sanction, interaction.user.id);
  if (refus) {
    return interaction.reply({ embeds: [embeds.erreur(refus)], flags: MessageFlags.Ephemeral });
  }

  const { t } = T(sanction.guild_id);
  const fenetre = new ModalBuilder()
    .setCustomId(`app_modal_${sanction.id}`)
    .setTitle(t('appel.u.modal_titre', { id: sanction.id }))
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('texte')
          .setLabel(t('appel.u.modal_label'))
          .setPlaceholder(t('appel.u.modal_ph'))
          .setStyle(TextInputStyle.Paragraph)
          .setMinLength(20)
          .setMaxLength(1000)
          .setRequired(true)
      )
    );

  return interaction.showModal(fenetre);
}

/** Boutons proposes a l'equipe sous un appel. */
function boutons(id, actifs = true, guildId = null) {
  const { t } = T(guildId);
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`app_accepter_${id}`).setLabel(t('appel.u.accepter')).setEmoji(E('succes')).setStyle(ButtonStyle.Success).setDisabled(!actifs),
    new ButtonBuilder().setCustomId(`app_refuser_${id}`).setLabel(t('appel.u.refuser')).setEmoji(E('erreur')).setStyle(ButtonStyle.Danger).setDisabled(!actifs)
  );
}

/** Fiche envoyee a l'equipe, avec l'historique du membre. */
function fiche(appel, sanction, utilisateur) {
  const { t, existe } = T(sanction.guild_id);
  const nomType = (type) => (existe(`sanctions.type.${type}`) ? t(`sanctions.type.${type}`) : (libelles[type]?.nom ?? type));
  const meta = libelles[sanction.type] ?? { nom: sanction.type, emoji: E('epingle') };
  const historique = req.sanctionsDe.all(sanction.guild_id, sanction.user_id);
  const compte = historique.reduce((acc, s) => {
    acc[s.type] = (acc[s.type] ?? 0) + 1;
    return acc;
  }, {});
  const resume =
    Object.entries(compte)
      .map(([type, n]) => `${libelles[type]?.emoji ?? E('epingle')} ${n} ${nomType(type).toLowerCase()}`)
      .join(' · ') || t('appel.u.aucun_antecedent');

  return new EmbedBuilder()
    .setColor(conf.couleurs.info)
    .setTitle(`${E('courrier')} ${t('appel.u.titre', { id: appel.id })}`)
    .setAuthor(
      utilisateur
        ? { name: utilisateur.tag ?? utilisateur.username, iconURL: utilisateur.displayAvatarURL?.() || undefined }
        : { name: t('appel.u.membre_inconnu') }
    )
    .addFields(
      { name: t('appel.u.membre'), value: `<@${sanction.user_id}>\n\`${sanction.user_id}\``, inline: true },
      {
        name: t('appel.u.sanction_contestee'),
        value: `${meta.emoji} ${nomType(sanction.type)} **#${sanction.id}**\n${ts(sanction.date, 'R')}${sanction.duree ? `\n${t('appel.u.duree', { duree: formaterDuree(sanction.duree, T(sanction.guild_id).langue) })}` : ''}`,
        inline: true,
      },
      { name: t('appel.u.moderateur'), value: `<@${sanction.moderateur_id}>`, inline: true },
      { name: t('appel.u.raison'), value: tronquer(sanction.raison || t('appel.u.aucune'), 1000) },
      { name: t('appel.u.dit_membre'), value: tronquer(appel.texte || '', 1000) },
      { name: t('appel.u.historique', { n: historique.length }), value: resume }
    )
    .setFooter({ text: t('appel.u.pied') })
    .setTimestamp(appel.date);
}

/** Enregistre l'appel et previent l'equipe. */
async function enregistrerAppel(interaction) {
  const sanctionId = Number(interaction.customId.split('_')[2]);
  const sanction = req.sanctionParIdGlobal.get(sanctionId);
  const refus = verifierRecevabilite(sanction, interaction.user.id);
  if (refus) {
    return interaction.reply({ embeds: [embeds.erreur(refus)], flags: MessageFlags.Ephemeral });
  }

  const texte = interaction.fields.getTextInputValue('texte').trim();
  const guild = interaction.client.guilds.cache.get(sanction.guild_id);
  const salon = guild?.channels.cache.get(config(sanction.guild_id).appel_salon);
  if (!salon?.isTextBased()) {
    return interaction.reply({
      embeds: [embeds.erreur(T(sanction.guild_id).t('appel.u.salon_inaccessible'))],
      flags: MessageFlags.Ephemeral,
    });
  }

  const date = Date.now();
  const info = req.creerAppel.run({ guild_id: sanction.guild_id, sanction_id: sanction.id, user_id: interaction.user.id, texte, date });
  const appel = { id: Number(info.lastInsertRowid), sanction_id: sanction.id, user_id: interaction.user.id, texte, date };

  await salon
    .send({ embeds: [fiche(appel, sanction, interaction.user)], components: [boutons(appel.id, true, sanction.guild_id)] })
    .catch((e) => logger.avertissement('Appel non transmis :', e.message));

  return interaction.reply({
    embeds: [
      embeds.succes(T(sanction.guild_id).t('appel.u.transmis', { id: appel.id, serveur: guild.name })),
    ],
    flags: MessageFlags.Ephemeral,
  });
}

/** Leve concretement la sanction quand l'appel est accepte. */
async function leverSanction(guild, sanction) {
  req.desactiverSanctionGlobal.run(sanction.id);
  const { t } = T(guild.id);

  if (sanction.type === 'ban') {
    const leve = await guild.bans.remove(sanction.user_id, `Appel #${sanction.id} accepte`).catch(() => null);
    return t(leve ? 'appel.u.effet_ban_leve' : 'appel.u.effet_ban_deja');
  }
  if (sanction.type === 'mute' || sanction.type === 'automod') {
    const membre = await guild.members.fetch(sanction.user_id).catch(() => null);
    if (!membre) return t('appel.u.effet_absent');
    const leve = await membre.timeout(null, `Appel #${sanction.id} accepte`).catch(() => null);
    return t(leve ? 'appel.u.effet_mute_leve' : 'appel.u.effet_mute_non');
  }
  if (sanction.type === 'warn') return t('appel.u.effet_warn');
  return t('appel.u.effet_kick');
}

/** Ouvre la fenetre de reponse de l'equipe. */
async function ouvrirReponse(interaction, decision, appelId) {
  const { t } = T(interaction.guild?.id);
  const fenetre = new ModalBuilder()
    .setCustomId(`app_rep_${decision}_${appelId}`)
    .setTitle(t(decision === 'accepter' ? 'appel.u.accepter' : 'appel.u.refuser'))
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('reponse')
          .setLabel(t('appel.u.message_membre'))
          .setPlaceholder(t(decision === 'accepter' ? 'appel.u.ph_accepter' : 'appel.u.ph_refuser'))
          .setStyle(TextInputStyle.Paragraph)
          .setMaxLength(800)
          .setRequired(decision === 'refuser')
      )
    );
  return interaction.showModal(fenetre);
}

/** Applique la decision de l'equipe. */
async function appliquerDecision(interaction) {
  const [, , decision, idBrut] = interaction.customId.split('_');
  const { t } = T(interaction.guild?.id);
  const appel = req.appelParId.get(Number(idBrut));
  if (!appel || appel.statut !== 'attente') {
    return interaction.reply({ embeds: [embeds.info(t('appel.u.deja_traite'))], flags: MessageFlags.Ephemeral });
  }

  const sanction = req.sanctionParIdGlobal.get(appel.sanction_id);
  const reponse = interaction.fields.getTextInputValue('reponse').trim();
  const accepte = decision === 'accepter';

  await interaction.deferUpdate();

  let effet = t('appel.u.effet_maintenue');
  if (accepte && sanction) {
    effet = await leverSanction(interaction.guild, sanction).catch((e) => {
      logger.avertissement('Levee de sanction :', e.message);
      return t('appel.u.effet_impossible');
    });
  }

  req.traiterAppel.run({
    id: appel.id,
    statut: accepte ? 'accepte' : 'refuse',
    traite_par: interaction.user.id,
    reponse: reponse || null,
    date_traitement: Date.now(),
  });

  // ------------------------------------------------- reponse au membre
  const membre = await interaction.client.users.fetch(appel.user_id).catch(() => null);
  const mp = new EmbedBuilder()
    .setColor(accepte ? conf.couleurs.succes : conf.couleurs.erreur)
    .setTitle(accepte ? `${E('succes')} ${t('appel.u.mp_accepte')}` : `${E('erreur')} ${t('appel.u.mp_refuse')}`)
    .setDescription(
      accepte
        ? t('appel.u.mp_accepte_texte', { serveur: interaction.guild.name, id: appel.sanction_id })
        : t('appel.u.mp_refuse_texte', { serveur: interaction.guild.name, id: appel.sanction_id })
    )
    .setTimestamp();
  if (reponse) mp.addFields({ name: t('appel.u.message_equipe'), value: tronquer(reponse, 1000) });
  const envoye = await membre?.send({ embeds: [mp] }).then(() => true).catch(() => false);

  // ---------------------------------------------------- fiche et logs
  const embed = EmbedBuilder.from(interaction.message.embeds[0])
    .setColor(accepte ? conf.couleurs.succes : conf.couleurs.erreur)
    .addFields({
      name: accepte ? `${E('succes')} ${t('appel.u.accepte')}` : `${E('erreur')} ${t('appel.u.refuse')}`,
      value: [
        t('appel.u.par', { staff: `<@${interaction.user.id}>`, quand: ts(Date.now(), 'R') }),
        t('appel.u.effet', { effet }),
        reponse ? t('appel.u.reponse', { texte: tronquer(reponse, 300) }) : null,
        envoye ? null : `${E('avertissement')} ${t('appel.u.non_prevenu')}`,
      ]
        .filter(Boolean)
        .join('\n'),
    })
    .setFooter({ text: t('appel.u.titre', { id: appel.id }) });

  await interaction.editReply({ embeds: [embed], components: [boutons(appel.id, false, interaction.guild?.id)] }).catch(() => null);

  await envoyerLog(
    interaction.guild,
    'moderation',
    new EmbedBuilder()
      .setColor(accepte ? conf.couleurs.succes : conf.couleurs.erreur)
      .setAuthor({ name: `${E('courrier')} ${t('appel.u.log_auteur', { id: appel.id, decision: t(accepte ? 'appel.u.log_accepte' : 'appel.u.log_refuse') })}`, iconURL: interaction.user.displayAvatarURL() || undefined })
      .setDescription(
        [
          t('appel.u.log_membre', { membre: `<@${appel.user_id}>` }),
          t('appel.u.log_sanction', { id: appel.sanction_id }),
          t('appel.u.log_decision', { decision: t(accepte ? 'appel.u.log_accepte' : 'appel.u.log_refuse'), effet }),
          t('appel.u.log_par', { staff: `<@${interaction.user.id}>` }),
        ].join('\n')
      )
      .setTimestamp()
  );
}

/** Point d'entree pour tous les composants prefixes par "app_". */
async function gererInteraction(interaction) {
  try {
    const parties = interaction.customId.split('_');

    if (interaction.isButton() && parties[1] === 'ouvrir') return await ouvrirFormulaire(interaction, parties[2]);
    if (interaction.isModalSubmit() && parties[1] === 'modal') return await enregistrerAppel(interaction);

    // A partir d'ici, ce sont les boutons de l'equipe.
    if (!interaction.memberPermissions?.has(PermissionsBitField.Flags.ModerateMembers)) {
      return interaction.reply({ embeds: [embeds.erreur(T(interaction.guild?.id).t('appel.u.reserve'))], flags: MessageFlags.Ephemeral });
    }
    if (interaction.isButton() && (parties[1] === 'accepter' || parties[1] === 'refuser')) {
      const appel = req.appelParId.get(Number(parties[2]));
      if (!appel) return interaction.reply({ embeds: [embeds.erreur(T(interaction.guild?.id).t('appel.u.introuvable'))], flags: MessageFlags.Ephemeral });
      if (appel.statut !== 'attente') {
        return interaction.reply({
          embeds: [embeds.info(T(interaction.guild?.id).t('appel.u.deja_traite_par', { staff: `<@${appel.traite_par}>` }))],
          flags: MessageFlags.Ephemeral,
        });
      }
      return await ouvrirReponse(interaction, parties[1], appel.id);
    }
    if (interaction.isModalSubmit() && parties[1] === 'rep') return await appliquerDecision(interaction);
  } catch (e) {
    logger.erreur('Appel :', e);
    const reponse = { embeds: [embeds.erreur(T(interaction.guild?.id).t('appel.u.erreur'))], flags: MessageFlags.Ephemeral };
    if (interaction.replied || interaction.deferred) await interaction.followUp(reponse).catch(() => null);
    else await interaction.reply(reponse).catch(() => null);
  }
}

module.exports = { actif, boutonContester, verifierRecevabilite, ouvrirFormulaire, gererInteraction, fiche, boutons, CONTESTABLES };
