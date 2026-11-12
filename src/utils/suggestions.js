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

const STATUTS = {
  attente: { nom: 'En attente', get emoji() { return E('urne'); }, couleur: 0x5f6b59 },
  encours: { nom: 'En cours de réalisation', get emoji() { return E('chantier'); }, couleur: conf.couleurs.avertissement },
  acceptee: { nom: 'Acceptée', get emoji() { return E('succes'); }, couleur: conf.couleurs.succes },
  refusee: { nom: 'Refusée', get emoji() { return E('erreur'); }, couleur: conf.couleurs.erreur },
};

/** Barre de progression des votes. */
function barre(pour, contre, largeur = 12) {
  const total = pour + contre;
  if (total === 0) return '`▱▱▱▱▱▱▱▱▱▱▱▱` aucun vote';
  const remplies = Math.round((pour / total) * largeur);
  return `\`${'▰'.repeat(remplies)}${'▱'.repeat(largeur - remplies)}\` **${Math.round((pour / total) * 100)} %** pour · ${total} vote${
    total > 1 ? 's' : ''
  }`;
}

/** Construit l'embed d'une suggestion a partir de sa ligne en base. */
function construireEmbed(suggestion, auteur) {
  const votes = req.comptesVotes.get(suggestion.id);
  const meta = STATUTS[suggestion.statut] ?? STATUTS.attente;

  const embed = new EmbedBuilder()
    .setColor(meta.couleur)
    .setAuthor({
      name: auteur ? `${auteur.tag ?? auteur.username}` : 'Membre inconnu',
      iconURL: auteur?.displayAvatarURL?.() || null,
    })
    .setTitle(`${meta.emoji} Suggestion #${suggestion.numero} · ${meta.nom}`)
    .setDescription(tronquer(suggestion.texte, 3800))
    .addFields({ name: 'Votes', value: `${barre(votes.pour, votes.contre)}\n${E('pouceHaut')} **${votes.pour}**   ·   ${E('pouceBas')} **${votes.contre}**` })
    .setFooter({ text: `Proposée par ${auteur?.tag ?? suggestion.user_id}` })
    .setTimestamp(suggestion.date);

  if (suggestion.statut !== 'attente' && suggestion.staff_id) {
    embed.addFields({
      name: `Réponse de l'équipe`,
      value: `${suggestion.reponse || '*Aucune raison donnée*'}\n-# par <@${suggestion.staff_id}> · ${ts(
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

  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`sugg_pour:${suggestion.id}`)
      .setLabel(`Pour · ${votes.pour}`)
      .setEmoji(E('pouceHaut'))
      .setStyle(ButtonStyle.Success)
      .setDisabled(clos),
    new ButtonBuilder()
      .setCustomId(`sugg_contre:${suggestion.id}`)
      .setLabel(`Contre · ${votes.contre}`)
      .setEmoji(E('pouceBas'))
      .setStyle(ButtonStyle.Danger)
      .setDisabled(clos),
    new ButtonBuilder()
      .setCustomId(`sugg_votants:${suggestion.id}`)
      .setLabel('Détail des votes')
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
  const suggestion = req.suggestionParId.get(Number(suggestionId));
  if (!suggestion) {
    return interaction.reply({ embeds: [embeds.erreur('Cette suggestion n\'existe plus.')], flags: MessageFlags.Ephemeral });
  }
  if (suggestion.statut === 'acceptee' || suggestion.statut === 'refusee') {
    return interaction.reply({ embeds: [embeds.info('Les votes sont clos sur cette suggestion.')], flags: MessageFlags.Ephemeral });
  }

  const actuel = req.voteDe.get(suggestion.id, interaction.user.id)?.valeur;
  let texte;
  if (actuel === valeur) {
    req.retirerVote.run(suggestion.id, interaction.user.id);
    texte = 'Vote retiré.';
  } else {
    req.voterSuggestion.run(suggestion.id, interaction.user.id, valeur);
    texte = actuel ? `Vote changé : **${valeur === 1 ? 'pour' : 'contre'}**.` : `Vote enregistré : **${valeur === 1 ? 'pour' : 'contre'}**.`;
  }

  const auteur = await interaction.client.users.fetch(suggestion.user_id).catch(() => null);
  await interaction.update({ embeds: [construireEmbed(suggestion, auteur)], components: [boutons(suggestion)] });
  await interaction.followUp({ embeds: [embeds.succes(texte)], flags: MessageFlags.Ephemeral }).catch(() => null);
}

/** Liste des votants, visible uniquement par la personne qui clique. */
async function detailVotes(interaction, suggestionId) {
  const suggestion = req.suggestionParId.get(Number(suggestionId));
  if (!suggestion) {
    return interaction.reply({ embeds: [embeds.erreur("Cette suggestion n'existe plus.")], flags: MessageFlags.Ephemeral });
  }

  const votants = req.votantsSuggestion.all(suggestion.id);
  const pour = votants.filter((v) => v.valeur === 1).map((v) => `<@${v.user_id}>`);
  const contre = votants.filter((v) => v.valeur === -1).map((v) => `<@${v.user_id}>`);

  const embed = new EmbedBuilder()
    .setColor(conf.couleurs.principale)
    .setTitle(`${E('statistiques')} Votes de la suggestion #${suggestion.numero}`)
    .addFields(
      { name: `${E('pouceHaut')} Pour (${pour.length})`, value: tronquer(pour.join(', ') || '*personne*') },
      { name: `${E('pouceBas')} Contre (${contre.length})`, value: tronquer(contre.join(', ') || '*personne*') }
    );

  return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
}

// ------------------------------------------------------------------ REPONSES
/** Change le statut d'une suggestion et previent son auteur. */
async function repondre(interaction, numero, statut, reponse) {
  const suggestion = req.suggestionParNumero.get(interaction.guild.id, numero);
  if (!suggestion) {
    return interaction.reply({ embeds: [embeds.erreur(`Aucune suggestion #${numero} sur ce serveur.`)], flags: MessageFlags.Ephemeral });
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
            .setTitle(`${meta.emoji} Ta suggestion #${suggestion.numero} : ${meta.nom.toLowerCase()}`)
            .setDescription(tronquer(suggestion.texte, 1000))
            .addFields(
              { name: "Réponse de l'équipe", value: reponse || '*Aucune raison donnée*' },
              { name: 'Votes', value: `${E('pouceHaut')} ${votes.pour} · ${E('pouceBas')} ${votes.contre}`, inline: true }
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
      .setTitle(`${meta.emoji} Suggestion #${suggestion.numero} — ${meta.nom}`)
      .addFields(
        { name: require('./langues').traducteur(interaction.guild).t('journal.auteur'), value: `<@${suggestion.user_id}>`, inline: true },
        { name: require('./langues').traducteur(interaction.guild).t('journal.par'), value: `${interaction.user}`, inline: true },
        { name: require('./langues').traducteur(interaction.guild).t('journal.reponse'), value: reponse || '—' }
      )
      .setTimestamp()
  );

  return interaction.editReply({
    embeds: [embeds.succes(`Suggestion **#${suggestion.numero}** marquée **${meta.nom.toLowerCase()}**. L'auteur a été prévenu.`)],
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
    const reponse = { embeds: [embeds.erreur('Une erreur est survenue sur cette suggestion.')], flags: MessageFlags.Ephemeral };
    if (interaction.replied || interaction.deferred) await interaction.followUp(reponse).catch(() => null);
    else await interaction.reply(reponse).catch(() => null);
  }
}

module.exports = { STATUTS, construireEmbed, boutons, estStaff, rafraichirMessage, repondre, gererInteraction, barre };
