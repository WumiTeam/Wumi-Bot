/**
 * Wumi 2.33 · LA FAQ REPOND A L'OUVERTURE D'UN TICKET.
 *
 * Quand un membre ouvre un ticket en decrivant son probleme, on cherche une
 * fiche de FAQ qui y repond (mots-cles + sens, voir faq.chercherIntelligent).
 * Si une fiche correspond assez bien, elle est postee dans le ticket avec
 * deux boutons :
 *
 *   ✅ « C'est reglé, merci »  -> le ticket se ferme (raison : resolu par la FAQ)
 *   👋 « J'attends l'equipe »   -> les boutons disparaissent, le staff prend le relais
 *
 * Sert aux tickets de tous les serveurs (tickets.js) ET a ceux du serveur
 * support (ticketsSupport.js). Dans le customId, « p » ou « s » dit lequel.
 *
 * customIds : tfaq_ok:<p|s>:<ficheId>   tfaq_non:<p|s>
 */
const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const conf = require('../../config');
const C = require('./composants');
const { req, config } = require('../database/db');
const { traducteur } = require('./langues');
const { tronquer } = require('./outils');
const logger = require('./logger');

const SEUIL_MIN = 50; // jamais en dessous, meme si le seuil de la FAQ est plus bas
const TEXTE_MIN = 8;

/** Le message a poster, ou null si aucune fiche ne correspond assez. */
async function proposition(guild, texte, systeme) {
  if (!guild || String(texte ?? '').trim().length < TEXTE_MIN) return null;
  const cfg = config(guild.id);
  if (cfg.ticket_faq === 0) return null;
  const faq = require('./faq');
  const resultat = await faq.chercherIntelligent(guild.id, texte);
  if (!resultat || resultat.score < Math.max(cfg.faq_seuil ?? 55, SEUIL_MIN)) return null;

  const { t } = traducteur(guild);
  const fiche = resultat.fiche;
  req.incrementerFaq.run(fiche.id);
  const boutons = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`tfaq_ok:${systeme}:${fiche.id}`).setStyle(ButtonStyle.Success).setEmoji('✅').setLabel(t('ticket_faq.bouton_ok')),
    new ButtonBuilder().setCustomId(`tfaq_non:${systeme}`).setStyle(ButtonStyle.Secondary).setEmoji('👋').setLabel(t('ticket_faq.bouton_non'))
  );
  return C.envoi([C.conteneur([
    C.texte(`### 💡 ${t('ticket_faq.titre')}\n-# ${t('ticket_faq.intro')}`),
    C.separateur(),
    C.texte(`**${tronquer(fiche.question, 250)}**\n${tronquer(fiche.reponse, 3200)}`),
    C.separateur(),
    boutons,
  ], conf.couleurs.principale)]);
}

/** Cherche et poste la proposition dans le salon du ticket. Ne jette jamais. */
async function suggerer({ guild, salon, texte, systeme = 'p' }) {
  try {
    const message = await proposition(guild, texte, systeme);
    if (message) await salon.send(message);
    return Boolean(message);
  } catch (e) {
    logger.avertissement('FAQ du ticket :', e.message);
    return false;
  }
}

/** Le ticket de ce salon, l'auteur, et qui a le droit de cliquer. */
function contexte(interaction, systeme) {
  if (systeme === 's') {
    const store = require('./supportStore');
    const ticket = store.q.parSalon.get(interaction.channelId);
    const support = require('./ticketsSupport');
    return { ticket, staff: support.estStaff(interaction.member), fermer: support.fermerCoeur };
  }
  const tickets = require('./tickets');
  const ticket = req.ticketParSalon.get(interaction.channelId);
  return { ticket, staff: tickets.estStaff(interaction.member, config(interaction.guildId)), fermer: tickets.fermerCoeur };
}

async function gererInteraction(interaction) {
  const { t } = traducteur(interaction.guild);
  const [action, systeme] = interaction.customId.split(':');
  const { ticket, staff, fermer } = contexte(interaction, systeme);
  if (!ticket || ticket.statut !== 'ouvert') return interaction.reply(C.erreurPrivee(t('ticket_faq.plus_ouvert')));
  if (interaction.user.id !== ticket.user_id && !staff) return interaction.reply(C.erreurPrivee(t('ticket_faq.seul_auteur')));

  // Les boutons disparaissent dans les deux cas : la question est tranchee.
  const garder = interaction.message.components
    .map((c) => c.toJSON())
    .map((c) => ({ ...c, components: (c.components ?? []).filter((x) => x.type !== 1) }));

  if (action === 'tfaq_non') {
    garder[0]?.components.push({ type: 10, content: `-# 👋 ${t('ticket_faq.attente')}` });
    return interaction.update({ components: garder });
  }

  garder[0]?.components.push({ type: 10, content: `-# ✅ ${t('ticket_faq.resolu')}` });
  await interaction.update({ components: garder });
  return fermer({
    guild: interaction.guild,
    salon: interaction.channel,
    ticket,
    fermePar: interaction.user,
    raison: t('ticket_faq.raison'),
  });
}

module.exports = { proposition, suggerer, gererInteraction, SEUIL_MIN };
