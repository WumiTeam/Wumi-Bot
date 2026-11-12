/**
 * Export et import des reglages du panneau /config (point 11).
 *
 * LA REGLE QUI COMPTE PLUS QUE TOUT
 * Un identifiant de salon, de role ou de categorie ne s'importe JAMAIS. Ces
 * identifiants sont propres a un serveur : les copier d'un serveur a l'autre
 * donnerait des reglages qui pointent vers des salons qui n'existent pas ici —
 * un bot qui a l'air configure mais qui n'ecrit nulle part, pire qu'un bot
 * visiblement pas configure. La table CATEGORIES de panneauConfig.js dit le
 * `type` de chaque reglage : tout ce qui est `salon`, `role` ou `categorie`
 * est donc exclu de l'IMPORT (mais pas de l'export : le fichier garde ces
 * valeurs pour que l'utilisateur puisse compter combien ont ete ignorees).
 *
 * L'EXPORT REQUIERT panneauConfig.js, PAS L'INVERSE. panneauConfig.js importe
 * bien ce module (pour le bouton Exporter et l'historique), mais seulement a
 * l'INTERIEUR de ses fonctions (require paresseux) : au moment ou ce fichier
 * fait `require('./panneauConfig')` a la volee, l'autre module est deja
 * completement charge, ce qui evite le cycle require -> require.
 */
const { config, db, majConfig } = require('../database/db');
const configAudit = require('./configAudit');

// Change seulement si la FORME du fichier change (une cle qui change de sens,
// par exemple). Un fichier d'une autre version est refuse plutot que
// mal-interprete.
const VERSION = 1;

/** Les categories qui peuvent voyager d'un serveur a l'autre : jamais celle du serveur support. */
function categoriesExportables() {
  const { CATEGORIES } = require('./panneauConfig');
  return CATEGORIES.filter((c) => !c.support);
}

/** cle -> reglage, pour les seuls reglages exportables. */
function carteReglages() {
  const carte = new Map();
  for (const categorie of categoriesExportables()) {
    for (const reglage of categorie.reglages) carte.set(reglage.cle, reglage);
  }
  return carte;
}

/**
 * Construit l'objet a ecrire dans le fichier .json.
 * @param {{id: string, name: string}} guild
 */
function construireExport(guild) {
  const cfg = config(guild.id);
  const reglages = {};
  for (const [cle, reglage] of carteReglages()) {
    const valeur = cfg[reglage.cle];
    if (valeur === null || valeur === undefined || valeur === '') continue;
    reglages[cle] = valeur;
  }
  return {
    version: VERSION,
    date: Date.now(),
    serveur: guild.name,
    reglages,
  };
}

/** Une valeur du fichier correspond-elle a ce que le reglage attend ? */
function validerValeur(reglage, valeur) {
  switch (reglage.type) {
    case 'bool': {
      if (valeur === true || valeur === 1) return { ok: true, valeur: 1 };
      if (valeur === false || valeur === 0) return { ok: true, valeur: 0 };
      return { ok: false };
    }
    case 'nombre': {
      if (typeof valeur !== 'number' || !Number.isFinite(valeur)) return { ok: false };
      if (reglage.min !== undefined && valeur < reglage.min) return { ok: false };
      if (reglage.max !== undefined && valeur > reglage.max) return { ok: false };
      return { ok: true, valeur };
    }
    case 'choix': {
      if (typeof valeur !== 'string' || !reglage.valeurs.includes(valeur)) return { ok: false };
      return { ok: true, valeur };
    }
    default: { // texte
      if (valeur === null) return { ok: true, valeur: null };
      if (typeof valeur !== 'string') return { ok: false };
      if (reglage.max && valeur.length > reglage.max) return { ok: false };
      return { ok: true, valeur };
    }
  }
}

/**
 * Analyse un fichier .json recu en import. Ne touche PAS la base : c'est
 * appliquer() qui ecrit, une fois l'utilisateur passe par la confirmation.
 *
 * @returns {{erreur: string, variables?: object}
 *         | {version: number, changements: Array<{cle: string, valeur: *}>, ignoresSalonRole: number}}
 */
function analyser(guildId, texteBrut) {
  let donnees;
  try {
    donnees = JSON.parse(texteBrut);
  } catch {
    return { erreur: 'configplus.import.pas_json' };
  }

  if (!donnees || typeof donnees !== 'object' || Array.isArray(donnees)) {
    return { erreur: 'configplus.import.pas_json' };
  }

  if (donnees.version !== VERSION) {
    return { erreur: 'configplus.import.version_inconnue', variables: { version: String(donnees.version) } };
  }

  if (!donnees.reglages || typeof donnees.reglages !== 'object' || Array.isArray(donnees.reglages)) {
    return { erreur: 'configplus.import.format_invalide' };
  }

  const carte = carteReglages();
  const changements = [];
  let ignoresSalonRole = 0;

  for (const [cle, valeur] of Object.entries(donnees.reglages)) {
    const reglage = carte.get(cle);
    // Cle absente de la table CATEGORIES : un fichier bricole ne doit pas
    // pouvoir ecrire n'importe quelle colonne. On l'ignore, silencieusement.
    if (!reglage) continue;

    if (reglage.type === 'salon' || reglage.type === 'role' || reglage.type === 'categorie') {
      ignoresSalonRole += 1;
      continue;
    }

    const verif = validerValeur(reglage, valeur);
    // Un reglage RECONNU mais dont la valeur ne correspond pas a son type
    // (un nombre hors bornes, une chaine la ou on attend vrai/faux...) refuse
    // le fichier ENTIER plutot que d'appliquer une partie douteuse : mieux
    // vaut le dire clairement que deviner ce que l'utilisateur voulait.
    if (!verif.ok) {
      return { erreur: 'configplus.import.valeur_invalide', variables: { nom: cle } };
    }

    changements.push({ cle, valeur: verif.valeur });
  }

  return { version: donnees.version, changements, ignoresSalonRole };
}

/**
 * Ecrit les changements retenus par analyser(), et journalise chacun.
 * Node 22 (node:sqlite) n'a pas de db.transaction() : la transaction est
 * ouverte et fermee a la main, comme partout ailleurs dans le projet.
 * @returns {number} le nombre de reglages effectivement changes
 */
function appliquer(guildId, changements, parId) {
  if (!changements.length) return 0;

  const avant = config(guildId);
  const valeurs = {};
  for (const { cle, valeur } of changements) valeurs[cle] = valeur;

  let ecrits = 0;
  db.exec('BEGIN');
  try {
    majConfig(guildId, valeurs);
    for (const { cle, valeur } of changements) {
      const ancienne = avant[cle];
      if (String(ancienne ?? '') === String(valeur ?? '')) continue;
      configAudit.noter({ guildId, cle, avant: ancienne, apres: valeur, par: parId, source: 'import' });
      ecrits += 1;
    }
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
  return ecrits;
}

module.exports = { VERSION, categoriesExportables, carteReglages, construireExport, analyser, appliquer };
