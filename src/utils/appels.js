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
function actif(guildId) {
  try {
    const cfg = config(guildId);
    return Boolean(cfg.appel_actif && cfg.appel_salon);
  } catch {
    return false;
  }
}

/** Bouton "Contester" ajoute au message prive de sanction. */
function boutonContester(sanctionId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`app_ouvrir_${sanctionId}`).setLabel('Contester cette sanction').setEmoji(E('courrier')).setStyle(ButtonStyle.Secondary)
  );
}

/**
 * Verifie qu'une sanction peut encore etre contestee.
 * Renvoie null si tout va bien, sinon le message a afficher.
 */
function verifierRecevabilite(sanction, userId) {
  if (!sanction) return "Cette sanction n'existe plus.";
  if (sanction.user_id !== userId) return "Cette sanction ne te concerne pas.";
  if (!CONTESTABLES.includes(sanction.type)) return 'Ce type de sanction ne se conteste pas.';
  if (!actif(sanction.guild_id)) return "Les appels ne sont pas ouverts sur ce serveur.";

  const delai = (config(sanction.guild_id).appel_delai_jours ?? 14) * JOUR;
  if (delai > 0 && Date.now() - sanction.date > delai) {
    return `Le delai pour contester est depasse (${config(sanction.guild_id).appel_delai_jours} jours).`;
  }

  const precedents = req.appelDeSanction.all(sanction.id);
  if (precedents.some((a) => a.statut === 'attente')) return "Tu as deja un appel en attente pour cette sanction.";
  if (precedents.length) return 'Cette sanction a deja ete examinee en appel.';
  return null;
}

/** Ouvre le formulaire de contestation. */
async function ouvrirFormulaire(interaction, sanctionId) {
  const sanction = req.sanctionParIdGlobal.get(Number(sanctionId));
  const refus = verifierRecevabilite(sanction, interaction.user.id);
  if (refus) {
    return interaction.reply({ embeds: [embeds.erreur(refus)], flags: MessageFlags.Ephemeral });
  }

  const fenetre = new ModalBuilder()
    .setCustomId(`app_modal_${sanction.id}`)
    .setTitle(`Contester la sanction #${sanction.id}`)
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('texte')
          .setLabel('Explique ton point de vue')
          .setPlaceholder("Ce qui s'est passe, pourquoi tu penses que la sanction n'est pas justifiee...")
          .setStyle(TextInputStyle.Paragraph)
          .setMinLength(20)
          .setMaxLength(1000)
          .setRequired(true)
      )
    );

  return interaction.showModal(fenetre);
}

/** Boutons proposes a l'equipe sous un appel. */
function boutons(id, actifs = true) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`app_accepter_${id}`).setLabel("Accepter l'appel").setEmoji(E('succes')).setStyle(ButtonStyle.Success).setDisabled(!actifs),
    new ButtonBuilder().setCustomId(`app_refuser_${id}`).setLabel("Refuser l'appel").setEmoji(E('erreur')).setStyle(ButtonStyle.Danger).setDisabled(!actifs)
  );
}

/** Fiche envoyee a l'equipe, avec l'historique du membre. */
function fiche(appel, sanction, utilisateur) {
  const meta = libelles[sanction.type] ?? { nom: sanction.type, emoji: E('epingle') };
  const historique = req.sanctionsDe.all(sanction.guild_id, sanction.user_id);
  const compte = historique.reduce((acc, s) => {
    acc[s.type] = (acc[s.type] ?? 0) + 1;
    return acc;
  }, {});
  const resume =
    Object.entries(compte)
      .map(([type, n]) => `${libelles[type]?.emoji ?? E('epingle')} ${n} ${libelles[type]?.nom.toLowerCase() ?? type}`)
      .join(' · ') || 'aucun antecedent';

  return new EmbedBuilder()
    .setColor(conf.couleurs.info)
    .setTitle(`${E('courrier')} Appel #${appel.id}`)
    .setAuthor(
      utilisateur
        ? { name: utilisateur.tag ?? utilisateur.username, iconURL: utilisateur.displayAvatarURL?.() || undefined }
        : { name: 'Membre inconnu' }
    )
    .addFields(
      { name: 'Membre', value: `<@${sanction.user_id}>\n\`${sanction.user_id}\``, inline: true },
      {
        name: 'Sanction contestee',
        value: `${meta.emoji} ${meta.nom} **#${sanction.id}**\n${ts(sanction.date, 'R')}${sanction.duree ? `\nDuree : ${formaterDuree(sanction.duree)}` : ''}`,
        inline: true,
      },
      { name: 'Moderateur', value: `<@${sanction.moderateur_id}>`, inline: true },
      { name: 'Raison de la sanction', value: tronquer(sanction.raison || 'Aucune', 1000) },
      { name: 'Ce que dit le membre', value: tronquer(appel.texte || '', 1000) },
      { name: `Historique (${historique.length} sanction${historique.length > 1 ? 's' : ''})`, value: resume }
    )
    .setFooter({ text: 'Accepter leve la sanction · Refuser la maintient' })
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
      embeds: [embeds.erreur("Le salon des appels n'est plus accessible. Contacte un responsable du serveur.")],
      flags: MessageFlags.Ephemeral,
    });
  }

  const date = Date.now();
  const info = req.creerAppel.run({ guild_id: sanction.guild_id, sanction_id: sanction.id, user_id: interaction.user.id, texte, date });
  const appel = { id: Number(info.lastInsertRowid), sanction_id: sanction.id, user_id: interaction.user.id, texte, date };

  await salon
    .send({ embeds: [fiche(appel, sanction, interaction.user)], components: [boutons(appel.id)] })
    .catch((e) => logger.avertissement('Appel non transmis :', e.message));

  return interaction.reply({
    embeds: [
      embeds.succes(
        `Ton appel **#${appel.id}** a ete transmis a l'equipe de **${guild.name}**.\nTu recevras la reponse ici meme, en message prive. Inutile de relancer.`
      ),
    ],
    flags: MessageFlags.Ephemeral,
  });
}

/** Leve concretement la sanction quand l'appel est accepte. */
async function leverSanction(guild, sanction) {
  req.desactiverSanctionGlobal.run(sanction.id);

  if (sanction.type === 'ban') {
    const leve = await guild.bans.remove(sanction.user_id, `Appel #${sanction.id} accepte`).catch(() => null);
    return leve ? 'bannissement leve' : 'bannissement deja leve';
  }
  if (sanction.type === 'mute' || sanction.type === 'automod') {
    const membre = await guild.members.fetch(sanction.user_id).catch(() => null);
    if (!membre) return 'membre absent du serveur';
    const leve = await membre.timeout(null, `Appel #${sanction.id} accepte`).catch(() => null);
    return leve ? 'mute leve' : 'mute non levable';
  }
  if (sanction.type === 'warn') return 'avertissement annule';
  return 'aucune action automatique (expulsion)';
}

/** Ouvre la fenetre de reponse de l'equipe. */
async function ouvrirReponse(interaction, decision, appelId) {
  const fenetre = new ModalBuilder()
    .setCustomId(`app_rep_${decision}_${appelId}`)
    .setTitle(decision === 'accepter' ? "Accepter l'appel" : "Refuser l'appel")
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('reponse')
          .setLabel('Message envoye au membre')
          .setPlaceholder(
            decision === 'accepter'
              ? 'Ta sanction est levee, fais attention a...'
              : 'Apres verification, la sanction est maintenue parce que...'
          )
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
  const appel = req.appelParId.get(Number(idBrut));
  if (!appel || appel.statut !== 'attente') {
    return interaction.reply({ embeds: [embeds.info('Cet appel a deja ete traite.')], flags: MessageFlags.Ephemeral });
  }

  const sanction = req.sanctionParIdGlobal.get(appel.sanction_id);
  const reponse = interaction.fields.getTextInputValue('reponse').trim();
  const accepte = decision === 'accepter';

  await interaction.deferUpdate();

  let effet = 'sanction maintenue';
  if (accepte && sanction) {
    effet = await leverSanction(interaction.guild, sanction).catch((e) => {
      logger.avertissement('Levee de sanction :', e.message);
      return 'levee impossible (permissions ?)';
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
    .setTitle(accepte ? `${E('succes')} Ton appel a ete accepte` : `${E('erreur')} Ton appel a ete refuse`)
    .setDescription(
      accepte
        ? `L'equipe de **${interaction.guild.name}** a revu ta sanction **#${appel.sanction_id}** : elle est levee.`
        : `L'equipe de **${interaction.guild.name}** a examine ta sanction **#${appel.sanction_id}** et la maintient.`
    )
    .setTimestamp();
  if (reponse) mp.addFields({ name: "Message de l'equipe", value: tronquer(reponse, 1000) });
  const envoye = await membre?.send({ embeds: [mp] }).then(() => true).catch(() => false);

  // ---------------------------------------------------- fiche et logs
  const embed = EmbedBuilder.from(interaction.message.embeds[0])
    .setColor(accepte ? conf.couleurs.succes : conf.couleurs.erreur)
    .addFields({
      name: accepte ? `${E('succes')} Appel accepte` : `${E('erreur')} Appel refuse`,
      value: [
        `Par <@${interaction.user.id}> ${ts(Date.now(), 'R')}`,
        `Effet : ${effet}`,
        reponse ? `Reponse : ${tronquer(reponse, 300)}` : null,
        envoye ? null : `${E('avertissement')} Le membre n'a pas pu etre prevenu (messages prives fermes).`,
      ]
        .filter(Boolean)
        .join('\n'),
    })
    .setFooter({ text: `Appel #${appel.id}` });

  await interaction.editReply({ embeds: [embed], components: [boutons(appel.id, false)] }).catch(() => null);

  await envoyerLog(
    interaction.guild,
    'moderation',
    new EmbedBuilder()
      .setColor(accepte ? conf.couleurs.succes : conf.couleurs.erreur)
      .setAuthor({ name: `${E('courrier')} Appel #${appel.id} ${accepte ? 'accepte' : 'refuse'}`, iconURL: interaction.user.displayAvatarURL() || undefined })
      .setDescription(
        [
          `**Membre :** <@${appel.user_id}>`,
          `**Sanction :** #${appel.sanction_id}`,
          `**Decision :** ${accepte ? 'acceptee' : 'refusee'} — ${effet}`,
          `**Par :** <@${interaction.user.id}>`,
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
      return interaction.reply({ embeds: [embeds.erreur("Reserve a l'equipe de moderation.")], flags: MessageFlags.Ephemeral });
    }
    if (interaction.isButton() && (parties[1] === 'accepter' || parties[1] === 'refuser')) {
      const appel = req.appelParId.get(Number(parties[2]));
      if (!appel) return interaction.reply({ embeds: [embeds.erreur('Appel introuvable.')], flags: MessageFlags.Ephemeral });
      if (appel.statut !== 'attente') {
        return interaction.reply({
          embeds: [embeds.info(`Cet appel a deja ete traite par <@${appel.traite_par}>.`)],
          flags: MessageFlags.Ephemeral,
        });
      }
      return await ouvrirReponse(interaction, parties[1], appel.id);
    }
    if (interaction.isModalSubmit() && parties[1] === 'rep') return await appliquerDecision(interaction);
  } catch (e) {
    logger.erreur('Appel :', e);
    const reponse = { embeds: [embeds.erreur('Une erreur est survenue.')], flags: MessageFlags.Ephemeral };
    if (interaction.replied || interaction.deferred) await interaction.followUp(reponse).catch(() => null);
    else await interaction.reply(reponse).catch(() => null);
  }
}

module.exports = { actif, boutonContester, verifierRecevabilite, ouvrirFormulaire, gererInteraction, fiche, boutons, CONTESTABLES };
