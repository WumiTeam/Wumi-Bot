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
// Wumi 2.20 : nouveau jeu d'emojis (outils/generer-emojis.js). Discord ne sait
// pas remplacer l'image d'un emoji : on televerse donc les nouveaux sous un
// autre prefixe, et les anciens « bp_ » restent sur l'application pour que les
// vieux messages qui les citent continuent de les afficher.
// Wumi 2.25 : nouveau jeu, dessine a partir des @icons (outils/generer-emojis-at.js),
// sous le prefixe « wi_ ». Si un « wi_ » manque, le « wu_ » de 2.20 sert de repli.
// Wumi 2.36 : jeu « Kubai » (icones Kubai, licence MIT, outils/generer-emojis-kubai.js),
// sous le prefixe « ku_ ». Ordre de preference : ku_, puis wi_, puis wu_.
const PREFIXE = 'ku_';
const ORDRE = ['ku_', 'wi_', 'wu_'];
// Dessins ku_ corriges apres coup : Discord ne remplace pas l'image d'un
// emoji, le nouveau dessin prend donc le nom « ku_<nom>_<version> ».
// 2.36.2 : « langue » (l'icone d'origine contenait un caractere sans police).
const VERSIONS = { langue: 'v2' };
// Le catalogue complet des @icons (705) : « at_<icone> », utilisable par I().
const CATALOGUE = path.join(DOSSIER, 'at');
const PREFIXE_CATALOGUE = 'at_';

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
  wumi: '🔷',      // le logo « W. » (pages du serveur support, 2.27)
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

/** nom court -> « <:wi_nom:123> », rempli au demarrage. */
const installes = new Map();
/** icone du catalogue -> « <:at_icone:123> ». */
const icones = new Map();

/**
 * Une icone du catalogue @icons (ex. I('dragon')), ou `repli` si elle n'est
 * pas (encore) televersee.
 */
function I(nom, repli = '') {
  return icones.get(nom) ?? repli;
}

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
    // Le jeu le plus recent qui existe deja, ou qu'on peut televerser ;
    // sinon un plus ancien, sinon l'Unicode.
    for (const prefixe of ORDRE) {
      const complet = prefixe + nom + (prefixe === PREFIXE && VERSIONS[nom] ? '_' + VERSIONS[nom] : '');
      const deja = parNom.get(complet);
      if (deja) {
        installes.set(nom, deja.toString());
        break;
      }
      const fichier = path.join(DOSSIER, `${complet}.png`);
      if (!fs.existsSync(fichier)) continue;
      try {
        const cree = await client.application.emojis.create({ attachment: fs.readFileSync(fichier), name: complet });
        installes.set(nom, cree.toString());
        ajoutes++;
        break;
      } catch (e) {
        // Un echec ici n'est pas grave : le jeu precedent, puis l'Unicode, prennent la suite.
        echecs.push(`${complet} : ${e.message}`);
      }
    }
  }

  // Le catalogue : on note ce qui existe, et on televerse le reste EN FOND
  // (plusieurs centaines d'emojis : le demarrage n'attend pas).
  for (const emoji of existants.values()) {
    if (emoji.name?.startsWith(PREFIXE_CATALOGUE)) icones.set(emoji.name.slice(PREFIXE_CATALOGUE.length), emoji.toString());
  }
  televerserCatalogue(client, parNom).catch((e) => logger.avertissement('Emojis (catalogue) :', e.message));

  if (ajoutes) logger.succes(`Emojis : ${ajoutes} televerse(s) sur l'application.`);
  if (installes.size) logger.info(`Emojis : ${installes.size}/${Object.keys(REPLIS).length} personnalises actifs.`);
  for (const e of echecs) logger.avertissement('Emojis :', e);

  return { installes: installes.size, ajoutes, echecs };
}

/** Televerse, une a une, les icones du catalogue qui manquent encore. */
async function televerserCatalogue(client, parNom) {
  if (!fs.existsSync(CATALOGUE)) return;
  const manquants = fs.readdirSync(CATALOGUE).filter((f) => f.endsWith('.png')).map((f) => f.slice(0, -4))
    .filter((nom) => !parNom.has(PREFIXE_CATALOGUE + nom)).sort();
  if (!manquants.length) return;
  logger.info(`Emojis : ${manquants.length} icone(s) du catalogue a televerser, en fond.`);
  let faits = 0;
  for (const nom of manquants) {
    try {
      const cree = await client.application.emojis.create({
        attachment: fs.readFileSync(path.join(CATALOGUE, `${nom}.png`)),
        name: PREFIXE_CATALOGUE + nom,
      });
      icones.set(nom, cree.toString());
      faits++;
    } catch (e) {
      logger.avertissement(`Emojis (catalogue) ${nom} :`, e.message);
      // Plafond de l'application atteint : inutile d'insister.
      if (/maximum|limit/i.test(e.message)) break;
    }
  }
  logger.succes(`Emojis : ${faits} icone(s) du catalogue televersee(s).`);
}

// ------------------------------------------------- EMBEDS : AUTEUR ET PIED
// Discord n'affiche PAS les emojis personnalises dans la ligne d'auteur ni
// dans le pied d'un embed : on y lirait « <:wi_instagram:123…> » en clair.
// On retire donc l'emoji du texte et, s'il n'y a pas deja d'icone, on le
// met en icone (meme image, servie par le CDN de Discord).
const MOTIF_EMOJI = /<a?:\w+:(\d+)>\s*/g;

/** Le texte sans ses emojis personnalises. */
function sansEmojis(texte) {
  return typeof texte === 'string' ? texte.replace(MOTIF_EMOJI, '').trim() : texte;
}

/** L'image du premier emoji personnalise du texte, ou null. */
function imageEmoji(texte) {
  const m = /<(a?):\w+:(\d+)>/.exec(typeof texte === 'string' ? texte : '');
  return m ? `https://cdn.discordapp.com/emojis/${m[2]}.${m[1] ? 'gif' : 'png'}` : null;
}

function nettoyerLigne(options, cleTexte) {
  if (!options || typeof options !== 'object' || typeof options[cleTexte] !== 'string') return options;
  if (!/<a?:\w+:\d+>/.test(options[cleTexte])) return options;
  const propre = { ...options, [cleTexte]: sansEmojis(options[cleTexte]) || '​' };
  if (!propre.iconURL && !propre.icon_url) propre.iconURL = imageEmoji(options[cleTexte]);
  return propre;
}

try {
  const { EmbedBuilder } = require('discord.js');
  const proto = EmbedBuilder.prototype;
  if (!proto.__wumiEmojis) {
    const setAuthor = proto.setAuthor;
    const setFooter = proto.setFooter;
    proto.setAuthor = function (options) { return setAuthor.call(this, nettoyerLigne(options, 'name')); };
    proto.setFooter = function (options) { return setFooter.call(this, nettoyerLigne(options, 'text')); };
    Object.defineProperty(proto, '__wumiEmojis', { value: true });
  }
} catch {
  /* discord.js absent (tests isoles) */
}

module.exports = { VERSIONS, E, I, synchroniser, personnalises, etat, REPLIS, PREFIXE, PREFIXE_CATALOGUE, sansEmojis, imageEmoji };
