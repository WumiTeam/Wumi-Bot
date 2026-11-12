const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, MessageFlags } = require('discord.js');
const conf = require('../../config');
const { req, config } = require('../database/db');
const { embeds, tronquer } = require('./outils');
const logger = require('./logger');
const { E } = require('./emojis');
const capacites = require('./capacites');

// Mots trop courants pour porter du sens dans une recherche
const VIDES = new Set([
  'le','la','les','un','une','des','du','de','au','aux','et','ou','a','à','en','dans','sur','pour','par','avec','sans',
  'je','tu','il','elle','on','nous','vous','ils','elles','me','te','se','mon','ma','mes','ton','ta','tes','son','sa','ses',
  'ce','cet','cette','ces','qui','que','quoi','dont','ou','est','sont','suis','es','ai','as','avons','avez','ont','etre',
  'avoir','faire','fait','peut','peux','pouvez','comment','pourquoi','quand','combien','quel','quelle','quels','quelles',
  'y','ne','pas','plus','moins','tres','bien','svp','stp','salut','bonjour','merci','the','is','how',
  'ca','va','oui','non','si','la','ici','tout','tous','toute','tres','deja','encore','aussi','donc','alors',
  'veux','veut','voudrais','aimerais','sais','sait','dire','savoir','besoin','probleme','aide','aider',
]);

/**
 * Deux mots se correspondent-ils ?
 * On tolere les variations de conjugaison et de pluriel via un prefixe commun,
 * pour que « connecte » retrouve « connecter ».
 */
function memeMot(a, b) {
  if (a === b) return true;
  if (a.length < 5 || b.length < 5) return false;
  return a.slice(0, 4) === b.slice(0, 4) && Math.abs(a.length - b.length) <= 3;
}

const derniereReponse = new Map(); // salonId -> { faqId, date }

/** Normalise et decoupe un texte en mots utiles. */
function motsUtiles(texte) {
  return texte
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    // On garde les mots de 2 lettres : « ip », « mc »... portent souvent tout le sens
    .filter((m) => m.length >= 2 && !VIDES.has(m));
}

/**
 * Score de correspondance entre un message et une fiche, de 0 a 100.
 *
 * On combine deux mesures :
 *  - quelle part de la question du membre est couverte par la fiche ;
 *  - combien de mots-cles de la fiche sont retrouves, plafonne a 3 pour ne pas
 *    penaliser les fiches qui en declarent beaucoup.
 * Diviser simplement par le vocabulaire complet de la fiche rendrait le score
 * inatteignable des qu'on ajoute des mots-cles, ce qui serait contre-productif.
 */
function score(motsMessage, fiche) {
  if (!motsMessage.length) return 0;

  const cles = motsUtiles(fiche.mots_cles || '');
  const question = motsUtiles(fiche.question);
  const ensemble = [...new Set([...cles, ...question])];
  if (!ensemble.length) return 0;

  const communs = motsMessage.filter((m) => ensemble.some((f) => memeMot(m, f)));
  if (!communs.length) return 0;

  const clesTrouvees = cles.filter((c) => motsMessage.some((m) => memeMot(m, c))).length;

  const couvertureMessage = communs.length / motsMessage.length;
  const signalCles = cles.length ? Math.min(clesTrouvees, 3) / Math.min(cles.length, 3) : couvertureMessage;

  let resultat = 100 * (0.6 * couvertureMessage + 0.4 * signalCles);

  // Un seul mot en commun reste une coincidence : on plafonne
  if (communs.length < 2) resultat = Math.min(resultat, 50);

  return Math.round(resultat);
}

/** Cherche la meilleure fiche pour un texte donne. */
function chercher(guildId, texte) {
  const fiches = req.toutesFaq.all(guildId);
  if (!fiches.length) return null;

  const mots = motsUtiles(texte);
  let meilleure = null;
  for (const fiche of fiches) {
    const s = score(mots, fiche);
    if (!meilleure || s > meilleure.score) meilleure = { fiche, score: s };
  }
  return meilleure;
}

/** Embed d'affichage d'une fiche. */
function construireEmbed(fiche, automatique = false) {
  return new EmbedBuilder()
    .setColor(conf.couleurs.principale)
    .setTitle(`${E('message')} ${tronquer(fiche.question, 250)}`)
    .setDescription(tronquer(fiche.reponse, 4000))
    .setFooter({
      text: automatique
        ? `Réponse automatique · fiche #${fiche.id} · /faq voir pour tout consulter`
        : `Fiche #${fiche.id} · consultée ${fiche.utilisations} fois`,
    });
}

function boutons(ficheId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`faq_inutile:${ficheId}`)
      .setLabel("Ce n'était pas ma question")
      .setEmoji('🙅')
      .setStyle(ButtonStyle.Secondary)
  );
}

/**
 * Analyse un message et repond si une fiche correspond assez bien.
 * @returns {Promise<boolean>} true si une reponse a ete envoyee
 */
async function repondreAuto(message) {
  const cfg = config(message.guild.id);
  if (!cfg.faq_actif) return false;
  // Sans le contenu des messages, aucune question n'est lisible.
  if (!capacites.contenuMessages()) {
    capacites.signalerUneFois('faq', 'Reponses automatiques de la FAQ');
    return false;
  }

  const contenu = message.content ?? '';
  // On ne reagit qu'a ce qui ressemble a une question
  if (contenu.length < 12) return false;
  if (!contenu.includes('?') && !/^(comment|pourquoi|ou|quand|combien|est-ce|c'est quoi|quelqu'un sait)/i.test(contenu.trim())) {
    return false;
  }

  const resultat = chercher(message.guild.id, contenu);
  if (!resultat || resultat.score < cfg.faq_seuil) return false;

  // Anti-repetition : pas deux fois la meme fiche dans le meme salon coup sur coup
  const precedent = derniereReponse.get(message.channel.id);
  if (precedent && precedent.faqId === resultat.fiche.id && Date.now() - precedent.date < 5 * 60_000) return false;
  derniereReponse.set(message.channel.id, { faqId: resultat.fiche.id, date: Date.now() });

  try {
    await message.reply({
      embeds: [construireEmbed(resultat.fiche, true)],
      components: [boutons(resultat.fiche.id)],
      allowedMentions: { repliedUser: false },
    });
    req.incrementerFaq.run(resultat.fiche.id);
    return true;
  } catch (e) {
    logger.avertissement('Réponse FAQ :', e.message);
    return false;
  }
}

/** Bouton « ce n'était pas ma question » : la réponse automatique est retirée. */
async function gererInteraction(interaction) {
  try {
    if (!interaction.isButton()) return;
    if (!interaction.customId.startsWith('faq_inutile')) return;

    // Seul l'auteur de la question (ou un moderateur) peut retirer la reponse
    const question = interaction.message.reference?.messageId
      ? await interaction.channel.messages.fetch(interaction.message.reference.messageId).catch(() => null)
      : null;

    const autorise =
      !question ||
      question.author.id === interaction.user.id ||
      interaction.memberPermissions?.has('ManageMessages');

    if (!autorise) {
      return interaction.reply({
        embeds: [embeds.erreur("Seule la personne qui a posé la question peut retirer cette réponse.")],
        flags: MessageFlags.Ephemeral,
      });
    }

    await interaction.message.delete().catch(() => null);
    return interaction.reply({
      embeds: [embeds.info('Réponse retirée. Un membre de l\'équipe te répondra.')],
      flags: MessageFlags.Ephemeral,
    });
  } catch (e) {
    logger.erreur('Interaction FAQ :', e.message);
  }
}

module.exports = { motsUtiles, score, chercher, construireEmbed, boutons, repondreAuto, gererInteraction };
