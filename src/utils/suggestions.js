const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  PermissionFlagsBits,
  MessageFlags,
} = require('discord.js');
const conf = require('../../config');
const { req, config } = require('../database/db');
const { embeds, ts, tronquer } = require('./outils');
const { envoyerLog } = require('./logs');
const logger = require('./logger');
const { E } = require('./emojis');
const { traducteur } = require('./langues');

// 2.24 : tout ce que ce module ecrit est dans la langue du serveur.
const T = (guildId) => traducteur(guildId).t;

// `nom` reste le francais (journaux internes) ; `cle` donne le libelle traduit.
const STATUTS = {
  attente: { nom: 'En attente', cle: 'suggestion.statut_attente', get emoji() { return E('urne'); }, couleur: 0x5f6b59 },
  encours: { nom: 'En cours de réalisation', cle: 'suggestion.statut_encours', get emoji() { return E('chantier'); }, couleur: conf.couleurs.avertissement },
  acceptee: { nom: 'Acceptée', cle: 'suggestion.statut_acceptee', get emoji() { return E('succes'); }, couleur: conf.couleurs.succes },
  refusee: { nom: 'Refusée', cle: 'suggestion.statut_refusee', get emoji() { return E('erreur'); }, couleur: conf.couleurs.erreur },
};

/** Barre de progression des votes. */
function barre(pour, contre, largeur = 12, t = T(null)) {
  const total = pour + contre;
  if (total === 0) return `\`▱▱▱▱▱▱▱▱▱▱▱▱\` ${t('suggestion.u.aucun_vote')}`;
  const remplies = Math.round((pour / total) * largeur);
  return `\`${'▰'.repeat(remplies)}${'▱'.repeat(largeur - remplies)}\` ${t('suggestion.u.barre_pour', { p: Math.round((pour / total) * 100), n: total })}`;
}

/** Construit l'embed d'une suggestion a partir de sa ligne en base. */
function construireEmbed(suggestion, auteur) {
  const votes = req.comptesVotes.get(suggestion.id);
  const meta = STATUTS[suggestion.statut] ?? STATUTS.attente;
  const t = T(suggestion.guild_id);

  const embed = new EmbedBuilder()
    .setColor(meta.couleur)
    .setAuthor({
      name: auteur ? `${auteur.tag ?? auteur.username}` : t('suggestion.u.membre_inconnu'),
      iconURL: auteur?.displayAvatarURL?.() || null,
    })
    .setTitle(`${meta.emoji} ${t('suggestion.u.titre', { n: suggestion.numero, statut: t(meta.cle) })}`)
    .setDescription(tronquer(suggestion.texte, 3800))
    .addFields({ name: t('suggestion.u.votes'), value: `${barre(votes.pour, votes.contre, 12, t)}\n${E('pouceHaut')} **${votes.pour}**   ·   ${E('pouceBas')} **${votes.contre}**` })
    .setFooter({ text: t('suggestion.u.proposee_par', { auteur: auteur?.tag ?? suggestion.user_id }) })
    .setTimestamp(suggestion.date);

  if (suggestion.statut !== 'attente' && suggestion.staff_id) {
    embed.addFields({
      name: t('suggestion.u.reponse_equipe'),
      value: `${suggestion.reponse || t('suggestion.u.sans_raison')}\n-# ${t('suggestion.u.par', { staff: `<@${suggestion.staff_id}>` })} · ${ts(
        suggestion.repondu_le ?? Date.now(),
        'R'
      )}`,
    });
  }

  return embed;
}

/** Boutons de vote (desactives une fois la suggestion tranchee). */
function boutons(suggestion) {
  const votes = req.comptesVotes.get(suggestion.id);
  const clos = suggestion.statut !== 'attente' && suggestion.statut !== 'encours';
  const t = T(suggestion.guild_id);

  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`sugg_pour:${suggestion.id}`)
      .setLabel(t('suggestion.u.pour', { n: votes.pour }))
      .setEmoji(E('pouceHaut'))
      .setStyle(ButtonStyle.Success)
      .setDisabled(clos),
    new ButtonBuilder()
      .setCustomId(`sugg_contre:${suggestion.id}`)
      .setLabel(t('suggestion.u.contre', { n: votes.contre }))
      .setEmoji(E('pouceBas'))
      .setStyle(ButtonStyle.Danger)
      .setDisabled(clos),
    new ButtonBuilder()
      .setCustomId(`sugg_votants:${suggestion.id}`)
      .setLabel(t('suggestion.u.detail'))
      .setEmoji(E('statistiques'))
      .setStyle(ButtonStyle.Secondary)
  );
}

/** Le membre fait-il partie de l'equipe qui traite les suggestions ? */
function estStaff(membre) {
  const cfg = config(membre.guild.id);
  if (membre.permissions.has(PermissionFlagsBits.ManageMessages)) return true;
  if (cfg.suggestion_role_staff && membre.roles.cache.has(cfg.suggestion_role_staff)) return true;
  return false;
}

/** Rafraichit le message d'origine d'une suggestion. */
async function rafraichirMessage(client, suggestion) {
  if (!suggestion.channel_id || !suggestion.message_id) return;
  try {
    const salon = await client.channels.fetch(suggestion.channel_id).catch(() => null);
    if (!salon?.isTextBased()) return;
    const message = await salon.messages.fetch(suggestion.message_id).catch(() => null);
    if (!message) return;
    const auteur = await client.users.fetch(suggestion.user_id).catch(() => null);
    await message.edit({ embeds: [construireEmbed(suggestion, auteur)], components: [boutons(suggestion)] });
  } catch (e) {
    logger.avertissement('Rafraichissement suggestion :', e.message);
  }
}

// ---------------------------------------------------------------------- VOTES
async function voter(interaction, suggestionId, valeur) {
  const t = T(interaction.guild?.id);
  const suggestion = req.suggestionParId.get(Number(suggestionId));
  if (!suggestion) {
    return interaction.reply({ embeds: [embeds.erreur(t('suggestion.u.n_existe_plus'))], flags: MessageFlags.Ephemeral });
  }
  if (suggestion.statut === 'acceptee' || suggestion.statut === 'refusee') {
    return interaction.reply({ embeds: [embeds.info(t('suggestion.u.votes_clos'))], flags: MessageFlags.Ephemeral });
  }

  const actuel = req.voteDe.get(suggestion.id, interaction.user.id)?.valeur;
  let texte;
  if (actuel === valeur) {
    req.retirerVote.run(suggestion.id, interaction.user.id);
    texte = t('suggestion.u.vote_retire');
  } else {
    req.voterSuggestion.run(suggestion.id, interaction.user.id, valeur);
    texte = t(`suggestion.u.vote_${actuel ? 'change_' : ''}${valeur === 1 ? 'pour' : 'contre'}`);
  }

  const auteur = await interaction.client.users.fetch(suggestion.user_id).catch(() => null);
  await interaction.update({ embeds: [construireEmbed(suggestion, auteur)], components: [boutons(suggestion)] });
  await interaction.followUp({ embeds: [embeds.succes(texte)], flags: MessageFlags.Ephemeral }).catch(() => null);
}

/** Liste des votants, visible uniquement par la personne qui clique. */
async function detailVotes(interaction, suggestionId) {
  const t = T(interaction.guild?.id);
  const suggestion = req.suggestionParId.get(Number(suggestionId));
  if (!suggestion) {
    return interaction.reply({ embeds: [embeds.erreur(t('suggestion.u.n_existe_plus'))], flags: MessageFlags.Ephemeral });
  }

  const votants = req.votantsSuggestion.all(suggestion.id);
  const pour = votants.filter((v) => v.valeur === 1).map((v) => `<@${v.user_id}>`);
  const contre = votants.filter((v) => v.valeur === -1).map((v) => `<@${v.user_id}>`);

  const embed = new EmbedBuilder()
    .setColor(conf.couleurs.principale)
    .setTitle(`${E('statistiques')} ${t('suggestion.u.votes_de', { n: suggestion.numero })}`)
    .addFields(
      { name: `${E('pouceHaut')} ${t('suggestion.u.liste_pour', { n: pour.length })}`, value: tronquer(pour.join(', ') || t('suggestion.u.personne')) },
      { name: `${E('pouceBas')} ${t('suggestion.u.liste_contre', { n: contre.length })}`, value: tronquer(contre.join(', ') || t('suggestion.u.personne')) }
    );

  return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
}

// ------------------------------------------------------------------ REPONSES
/** Change le statut d'une suggestion et previent son auteur. */
async function repondre(interaction, numero, statut, reponse) {
  const t = T(interaction.guild.id);
  const suggestion = req.suggestionParNumero.get(interaction.guild.id, numero);
  if (!suggestion) {
    return interaction.reply({ embeds: [embeds.erreur(t('suggestion.u.introuvable', { n: numero }))], flags: MessageFlags.Ephemeral });
  }

  await interaction.deferReply();

  req.repondreSuggestion.run({
    id: suggestion.id,
    statut,
    staff_id: interaction.user.id,
    reponse: reponse ?? null,
    repondu_le: Date.now(),
  });

  const misAJour = req.suggestionParId.get(suggestion.id);
  await rafraichirMessage(interaction.client, misAJour);

  const meta = STATUTS[statut];
  const libelle = t(meta.cle).toLowerCase();

  // Ferme le fil de discussion quand la suggestion est tranchee
  if (misAJour.thread_id && (statut === 'acceptee' || statut === 'refusee')) {
    const fil = await interaction.guild.channels.fetch(misAJour.thread_id).catch(() => null);
    if (fil?.isThread()) await fil.setArchived(true, `Suggestion ${meta.nom.toLowerCase()}`).catch(() => null);
  }

  // Previent l'auteur en message prive
  const auteur = await interaction.client.users.fetch(suggestion.user_id).catch(() => null);
  if (auteur) {
    const votes = req.comptesVotes.get(suggestion.id);
    await auteur
      .send({
        embeds: [
          new EmbedBuilder()
            .setColor(meta.couleur)
            .setTitle(`${meta.emoji} ${t('suggestion.u.ta_suggestion', { n: suggestion.numero, statut: libelle })}`)
            .setDescription(tronquer(suggestion.texte, 1000))
            .addFields(
              { name: t('suggestion.u.reponse_equipe'), value: reponse || t('suggestion.u.sans_raison') },
              { name: t('suggestion.u.votes'), value: `${E('pouceHaut')} ${votes.pour} · ${E('pouceBas')} ${votes.contre}`, inline: true }
            )
            .setFooter({ text: interaction.guild.name, iconURL: interaction.guild.iconURL() ?? undefined })
            .setTimestamp(),
        ],
      })
      .catch(() => null);
  }

  await envoyerLog(
    interaction.guild,
    'moderation',
    new EmbedBuilder()
      .setColor(meta.couleur)
      .setTitle(`${meta.emoji} ${t('suggestion.u.titre', { n: suggestion.numero, statut: t(meta.cle) })}`)
      .addFields(
        { name: require('./langues').traducteur(interaction.guild).t('journal.auteur'), value: `<@${suggestion.user_id}>`, inline: true },
        { name: require('./langues').traducteur(interaction.guild).t('journal.par'), value: `${interaction.user}`, inline: true },
        { name: require('./langues').traducteur(interaction.guild).t('journal.reponse'), value: reponse || '—' }
      )
      .setTimestamp()
  );

  return interaction.editReply({
    embeds: [embeds.succes(t('suggestion.u.marquee', { n: suggestion.numero, statut: libelle }))],
  });
}

// -------------------------------------------------------------------- ROUTAGE
async function gererInteraction(interaction) {
  try {
    if (!interaction.isButton()) return;
    const [action, id] = interaction.customId.split(':');
    if (action === 'sugg_pour') return await voter(interaction, id, 1);
    if (action === 'sugg_contre') return await voter(interaction, id, -1);
    if (action === 'sugg_votants') return await detailVotes(interaction, id);
  } catch (e) {
    logger.erreur('Interaction suggestion :', e);
    const reponse = { embeds: [embeds.erreur(T(interaction.guild?.id)('suggestion.u.erreur'))], flags: MessageFlags.Ephemeral };
    if (interaction.replied || interaction.deferred) await interaction.followUp(reponse).catch(() => null);
    else await interaction.reply(reponse).catch(() => null);
  }
}

module.exports = { STATUTS, construireEmbed, boutons, estStaff, rafraichirMessage, repondre, gererInteraction, barre };
