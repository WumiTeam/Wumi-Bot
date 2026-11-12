/**
 * Ce que Discord accorde vraiment au bot.
 *
 * Deux des intents dont Blueprint se sert sont dits « privilegies » :
 *
 *   GuildMembers    la liste des membres, donc les arrivees et les departs ;
 *   MessageContent  le TEXTE des messages, donc l'automod et la FAQ.
 *
 * Tant que le bot est sur moins de 100 serveurs, ils s'activent d'un clic dans
 * le Developer Portal. Au-dela, Discord exige une verification de
 * l'application et une demande ecrite, et peut refuser. Un bot public doit
 * donc continuer de tourner SANS eux, en desactivant proprement ce qui en
 * depend — pas en plantant au demarrage, et pas en donnant zero XP a tout le
 * monde sans que personne comprenne pourquoi.
 *
 * C'est le role de ce module : il retient ce qui a ete accorde, et le reste du
 * code lui demande « est-ce que je peux ? » au lieu de le supposer.
 */
const { GatewayIntentBits } = require('discord.js');
const logger = require('./logger');

/** Ce que chaque intent privilegie permet, en clair. */
const DEPENDANCES = {
  contenuMessages: [
    "l'automod (mots interdits, liens, majuscules, spam)",
    "l'anti-phishing (comparaison des liens a la liste de domaines signales)",
    'les reponses automatiques de la FAQ',
    'le texte des messages dans les logs et les signalements',
  ],
  membres: [
    'les messages de bienvenue et d\'au revoir',
    'le suivi des invitations',
    'l\'anti-raid (comptes trop recents, vagues d\'arrivees)',
    'les salons statistiques de membres',
  ],
};

let accorde = { contenuMessages: true, membres: true };
const dejaDit = new Set();

/** Enregistre ce que la connexion a reellement obtenu. */
function definir({ contenuMessages, membres }) {
  accorde = { contenuMessages, membres };
}

/** Le bot peut-il lire le texte des messages ? */
function contenuMessages() {
  return accorde.contenuMessages;
}

/** Le bot recoit-il les evenements de membres ? */
function membres() {
  return accorde.membres;
}

/**
 * Note qu'une fonction a ete sautee faute d'intent, une seule fois par
 * fonction. Sans ce garde, un serveur actif remplirait le journal d'une ligne
 * par message.
 */
function signalerUneFois(fonction, quoi) {
  if (dejaDit.has(fonction)) return;
  dejaDit.add(fonction);
  logger.avertissement(`${quoi} : desactive, l'intent correspondant n'est pas accorde a l'application.`);
}

/** L'etat, en clair, pour le demarrage et pour /confidentialite. */
function resume() {
  const manquants = [];
  if (!accorde.contenuMessages) manquants.push('contenuMessages');
  if (!accorde.membres) manquants.push('membres');
  return {
    ...accorde,
    complet: manquants.length === 0,
    manquants,
    perdu: manquants.flatMap((m) => DEPENDANCES[m]),
  };
}

/** La liste d'intents a demander, selon ce qu'on sait deja possible. */
function intents({ contenuMessages: c = true, membres: m = true } = {}) {
  const liste = [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildModeration,
    GatewayIntentBits.GuildExpressions,
    GatewayIntentBits.GuildInvites,
    // Wumi 2.4 : le starboard compte les reactions (intent non privilegie).
    GatewayIntentBits.GuildMessageReactions,
    // Wumi 2.13 : modmail du support (MP au bot). Intent non privilegie.
    GatewayIntentBits.DirectMessages,
  ];
  if (m) liste.push(GatewayIntentBits.GuildMembers);
  if (c) liste.push(GatewayIntentBits.MessageContent);
  return liste;
}

module.exports = { definir, contenuMessages, membres, signalerUneFois, resume, intents, DEPENDANCES };
