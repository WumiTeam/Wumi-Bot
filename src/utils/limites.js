/**
 * Ce qu'un serveur a le droit de faire, selon qu'il est premium ou non.
 *
 * PRINCIPE : LE PREMIUM AUGMENTE DES PLAFONDS, IL NE DEVERROUILLE PAS DES
 * FONCTIONS.
 *
 * C'est un choix, et il n'est pas anodin. Rendre une fonction payante retire
 * quelque chose a ceux qui l'utilisaient deja — c'est la meilleure facon de
 * se faire detester par les serveurs qui vous ont fait confiance les premiers.
 * Augmenter un plafond, au contraire, ne retire rien a personne : le serveur
 * gratuit garde exactement ce qu'il avait, et celui qui paie en a plus.
 *
 * Les plafonds gratuits ne sont pas non plus arbitraires : chaque source de
 * veille est une requete reseau sur une minuterie, chaque concours un
 * balayage. Ils existaient AVANT le premium, pour que dix serveurs ne puissent
 * pas saturer le bot pour les mille autres.
 */
const conf = require('../../config');
const premium = require('./premium');

/**
 * gratuit / premium pour chaque plafond.
 * Une valeur absente de config.js prend le defaut ecrit ici.
 */
const PLAFONDS = {
  // Sources d'annonces automatiques (Twitch, YouTube, Instagram, TikTok, RSS)
  veille: { gratuit: conf.limites?.veilleParServeur ?? 10, premium: 30 },
  // Photographies de la structure du serveur
  structure: { gratuit: 10, premium: 30 },
  // Concours en cours en meme temps
  giveaways: { gratuit: 5, premium: 25 },
  // Tickets ouverts par membre
  tickets: { gratuit: 3, premium: 10 },
};

/** Le plafond qui s'applique a ce serveur. */
function plafond(nom, guildId) {
  const p = PLAFONDS[nom];
  if (!p) return Infinity;
  return premium.estPremium(guildId) ? p.premium : p.gratuit;
}

/**
 * Reste-t-il de la place ?
 * @returns {{ok: boolean, plafond: number, deja: number, premium: boolean}}
 */
function place(nom, guildId, deja) {
  const max = plafond(nom, guildId);
  return {
    ok: deja < max,
    plafond: max,
    deja,
    premium: premium.estPremium(guildId),
    // Ce qu'un passage au premium apporterait. Sert a n'en parler QUE quand
    // ca change vraiment quelque chose : proposer le premium a quelqu'un qui
    // l'a deja, ou qui n'y gagnerait rien, c'est de la publicite bete.
    gagnerait: !premium.estPremium(guildId) && PLAFONDS[nom].premium > PLAFONDS[nom].gratuit
      ? PLAFONDS[nom].premium
      : null,
  };
}

module.exports = { PLAFONDS, plafond, place };
