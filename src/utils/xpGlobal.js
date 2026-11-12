/**
 * L'XP GLOBAL : un compteur qui monte partout.
 *
 * L'XP d'un serveur ne vaut que sur ce serveur — c'est ce qui fait qu'un
 * classement veut dire quelque chose. Mais quelqu'un qui croise le bot sur
 * cinq serveurs n'a nulle part une trace de tout ce qu'il a fait. D'ou ce
 * second compteur, a cote et non a la place : chaque gain d'XP sur un serveur
 * ajoute la meme chose au compteur global.
 *
 * CE QU'ON N'ENREGISTRE PAS, ET C'EST DELIBERE
 * Pas la liste des serveurs. Savoir qu'une personne a gagne de l'XP sur douze
 * serveurs est une chose ; pouvoir dire LESQUELS en est une autre, et ce
 * n'est l'affaire de personne. La table ne garde qu'un COMPTE de serveurs,
 * jamais leurs identifiants.
 *
 * CHACUN PEUT EFFACER LE SIEN, d'une commande, sans passer par un
 * administrateur : ce compteur ne concerne aucun serveur en particulier.
 */
const { req } = require('../database/db');
const { infosNiveau } = require('./niveaux');
const logger = require('./logger');

/**
 * Ajoute de l'XP au compteur global.
 * Silencieux par construction : un compteur d'affichage ne doit jamais faire
 * echouer le gain d'XP du serveur, qui est la vraie operation.
 */
function ajouter(userId, montant, { messages = 0, secondesVocal = 0 } = {}) {
  if (!userId || montant <= 0) return false;
  try {
    req.ajouterXpGlobal.run({
      user_id: String(userId),
      xp: montant,
      messages,
      secondes_vocal: secondesVocal,
      depuis: Date.now(),
    });
    return true;
  } catch (e) {
    logger.debug('XP global :', e.message);
    return false;
  }
}

/** Le profil global d'une personne. */
function profil(userId) {
  let ligne;
  try {
    ligne = req.xpGlobalDe.get(String(userId));
  } catch {
    ligne = null;
  }
  const xp = ligne?.xp ?? 0;
  const infos = infosNiveau(xp);

  let rang = null;
  let total = 0;
  try {
    if (xp > 0) rang = req.rangGlobal.get(xp).n + 1;
    total = req.totalGlobal.get().n;
  } catch {
    /* base indisponible : on affiche ce qu'on a */
  }

  return {
    xp,
    niveau: infos.niveau,
    xpActuel: infos.xpActuel,
    xpRequis: infos.xpRequis,
    progression: infos.progression,
    messages: ligne?.messages ?? 0,
    secondesVocal: ligne?.secondes_vocal ?? 0,
    depuis: ligne?.depuis ?? null,
    rang,
    total,
  };
}

/**
 * Le classement mondial.
 * Renvoie des identifiants : c'est a l'appelant de decider qui il sait nommer.
 * Une personne que le bot ne connait plus n'a pas a etre montree comme un
 * numero — la commande la saute.
 */
function classement(limite = 10) {
  try {
    return req.classementGlobal.all(Math.max(1, Math.min(50, limite)));
  } catch {
    return [];
  }
}

/** Efface le compteur global d'une personne. */
function effacer(userId) {
  try {
    return req.effacerXpGlobal.run(String(userId)).changes > 0;
  } catch {
    return false;
  }
}

module.exports = { ajouter, profil, classement, effacer };
