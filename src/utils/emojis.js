/**
 * Les emojis de Blueprint, installes par le bot lui-meme.
 *
 * Discord distingue deux sortes d'emojis personnalises :
 *   - ceux d'un SERVEUR, qui prennent un des 50 emplacements et ne marchent
 *     que la ;
 *   - ceux d'une APPLICATION, qui appartiennent au bot, ne prennent aucun
 *     emplacement et fonctionnent sur tous les serveurs ou il est present.
 *
 * On utilise les seconds. Concretement : au demarrage, le bot regarde ce qu'il
 * a deja et televerse ce qui manque depuis src/assets/emojis/. Il n'y a donc
 * aucun identifiant a recopier a la main, et rien a refaire en ajoutant le bot
 * a un nouveau serveur.
 *
 * REGLE QUI COMMANDE TOUT LE MODULE : le bot doit fonctionner exactement pareil
 * sans ces emojis. L'installation peut echouer — droits, panne d'API, quota —
 * et ce n'est jamais une raison pour qu'un message ne parte pas. Chaque nom a
 * donc un repli en emoji Unicode, et `E()` renvoie toujours quelque chose.
 *
 * ATTENTION SI TU CHANGES UN DESSIN : Discord ne sait pas remplacer l'image
 * d'un emoji deja televerse. Il faut le supprimer sur le portail developpeur,
 * puis relancer le bot : il le recreera avec le nouveau dessin. Les anciens
 * messages qui pointaient dessus afficheront un carre vide, c'est normal.
 */
const fs = require('node:fs');
const path = require('node:path');
const logger = require('./logger');

const DOSSIER = path.join(__dirname, '..', 'assets', 'emojis');
const PREFIXE = 'bp_';

/**
 * Le repli Unicode de chaque emoji. C'est aussi la liste de reference : un nom
 * absent d'ici ne sera jamais installe, meme si le fichier existe.
 *
 * Chaque repli est l'emoji Unicode que le code utilisait avant, pour que le
 * bot sans ses emojis rende exactement ce qu'il rendait auparavant.
 */
const REPLIS = {
  // Categories de commandes
  niveaux: '📈',
  economie: '🪙',
  tickets: '🎫',
  suggestions: '💡',
  candidatures: '📋',
  vocal: '🔊',
  musique: '🎵',
  invitations: '📨',
  utilitaires: '🧰',
  moderation: '🔨',
  config: '⚙️',

  // Etats
  succes: '✅',
  erreur: '❌',
  avertissement: '⚠️',
  info: 'ℹ️',
  enligne: '🟢',
  horsligne: '🔴',
  chantier: '🚧',
  sablier: '⏳',

  // Niveaux, classements, recompenses
  xp: '🔼',
  classement: '🏆',
  badge: '🎖️',
  mission: '🎯',
  etoile: '⭐',
  premier: '🥇',
  deuxieme: '🥈',
  troisieme: '🥉',
  feu: '🔥',

  // Economie
  wumicoin: '🪙',   // la piece de Wumi Run, monnaie par defaut (Wumi 2.17)
  piece: '💰',
  panier: '🛒',
  colis: '📦',
  cadeau: '🎁',
  sac: '🎒',

  // Moderation et securite
  verrou: '🔒',
  deverrou: '🔓',
  securite: '🔐',
  bouclier: '🛡️',
  alerte: '🚨',
  robot: '🤖',
  balai: '🧹',
  corbeille: '🗑️',
  recycler: '♻️',
  muet: '🔇',
  drapeau: '🚩',

  // Membres et serveur
  membres: '👥',
  porte: '🚪',
  couronne: '👑',
  role: '🎭',
  salut: '👋',
  fete: '🎉',
  message: '💬',
  epingle: '📌',
  boost: '💜',
  dossier: '📁',
  oeil: '👁️',

  // Veille
  twitch: '🟣',
  youtube: '▶️',
  tiktok: '🎵',
  instagram: '📸',
  rss: '📰',

  // Divers
  pouceHaut: '👍',
  pouceBas: '👎',
  urne: '🗳️',
  courrier: '📩',
  statistiques: '📊',
  palette: '🎨',
  outil: '🛠️',
  note: '📝',
  disquette: '💾',
  loupe: '🔍',
  langue: '🌐',
};

/** nom court -> « <:bp_nom:123> », rempli au demarrage. */
const installes = new Map();

/**
 * L'emoji a afficher pour ce nom.
 * Renvoie le personnalise s'il est installe, sinon l'Unicode. Jamais vide :
 * un message ne doit pas se retrouver avec un trou parce qu'un emoji manque.
 */
function E(nom) {
  const alias = ALIAS[nom];
  if (alias && installes.has(alias)) return installes.get(alias);
  return installes.get(nom) ?? REPLIS[nom] ?? '';
}

/**
 * Noms qui empruntent le dessin d'un autre quand il est installe. Depuis 2.17,
 * l'economie et ses montants utilisent la piece de Wumi Run : Discord ne sait
 * pas remplacer l'image d'un emoji existant, donc on ajoute un emoji neuf et
 * on redirige les anciens noms vers lui.
 */
const ALIAS = { economie: 'wumicoin', piece: 'wumicoin' };

/** Vrai si les emojis personnalises sont en place (pour le panneau, /aide…). */
function personnalises() {
  return installes.size > 0;
}

/** Etat lisible, pour un diagnostic. */
function etat() {
  return {
    installes: installes.size,
    attendus: Object.keys(REPLIS).length,
    manquants: Object.keys(REPLIS).filter((n) => !installes.has(n)),
  };
}

/**
 * Met les emojis de l'application a jour : recense l'existant, televerse ce
 * qui manque. Ne supprime jamais rien — un emoji retire du dossier reste sur
 * l'application, et c'est voulu : un message ancien qui le referencait
 * continue de l'afficher.
 *
 * @returns {Promise<{installes: number, ajoutes: number, echecs: string[]}>}
 */
async function synchroniser(client) {
  installes.clear();
  const echecs = [];
  let ajoutes = 0;

  let existants;
  try {
    existants = await client.application.emojis.fetch();
  } catch (e) {
    logger.avertissement('Emojis : impossible de lire ceux de l\'application :', e.message);
    return { installes: 0, ajoutes: 0, echecs: [e.message] };
  }

  const parNom = new Map();
  for (const emoji of existants.values()) parNom.set(emoji.name, emoji);

  for (const nom of Object.keys(REPLIS)) {
    const complet = PREFIXE + nom;
    const deja = parNom.get(complet);
    if (deja) {
      installes.set(nom, deja.toString());
      continue;
    }

    const fichier = path.join(DOSSIER, `${complet}.png`);
    if (!fs.existsSync(fichier)) continue; // pas de fichier : on garde le repli

    try {
      const cree = await client.application.emojis.create({
        attachment: fs.readFileSync(fichier),
        name: complet,
      });
      installes.set(nom, cree.toString());
      ajoutes++;
    } catch (e) {
      // Un echec ici n'est pas grave : le repli Unicode prend la suite.
      echecs.push(`${complet} : ${e.message}`);
    }
  }

  if (ajoutes) logger.succes(`Emojis : ${ajoutes} televerse(s) sur l'application.`);
  if (installes.size) logger.info(`Emojis : ${installes.size}/${Object.keys(REPLIS).length} personnalises actifs.`);
  for (const e of echecs) logger.avertissement('Emojis :', e);

  return { installes: installes.size, ajoutes, echecs };
}

module.exports = { E, synchroniser, personnalises, etat, REPLIS, PREFIXE };
