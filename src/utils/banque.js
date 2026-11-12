/**
 * Banque, transferts entre membres et braquages.
 *
 * Regle de fond : la banque est un abri. Ce qui y est depose rapporte des
 * interets et ne peut jamais etre vole — seul ce qui traine en poche est
 * braquable. C'est ce qui donne un interet a deposer.
 */
const conf = require('../../config');
const { req, config, db } = require('../database/db');
const eco = require('./economie');
const objets = require('./objets');
const logger = require('./logger');

const JOUR = 86_400_000;
const B = conf.economie?.banque ?? {};
const P = conf.economie?.paiement ?? {};
const V = conf.economie?.braquage ?? {};

/** Ligne d'economie d'un membre, creee au besoin. */
function compte(guildId, userId) {
  let ligne = req.getEco.get(guildId, userId);
  if (!ligne) {
    eco.crediter(guildId, userId, 0, false);
    ligne = req.getEco.get(guildId, userId);
  }
  return ligne;
}

/** Poche + banque. */
function fortune(guildId, userId) {
  const c = compte(guildId, userId);
  return { poche: c.solde, banque: c.banque ?? 0, total: c.solde + (c.banque ?? 0) };
}

// ------------------------------------------------------------------ BANQUE
/** Depose de la poche vers la banque. */
function deposer(guildId, userId, montant) {
  const c = compte(guildId, userId);
  const minimum = B.depotMinimum ?? 1;
  if (montant < minimum) return { ok: false, raison: `Le depot minimum est de ${minimum}.` };
  if (montant > c.solde) return { ok: false, raison: 'Tu n\'as pas cette somme en poche.' };

  req.majBanque.run({ guild_id: guildId, user_id: userId, solde: -montant, banque: montant });
  return { ok: true, ...fortune(guildId, userId) };
}

/** Retire de la banque vers la poche. */
function retirer(guildId, userId, montant) {
  const c = compte(guildId, userId);
  if (montant <= 0) return { ok: false, raison: 'Montant invalide.' };
  if (montant > (c.banque ?? 0)) return { ok: false, raison: 'Tu n\'as pas cette somme a la banque.' };

  req.majBanque.run({ guild_id: guildId, user_id: userId, solde: montant, banque: -montant });
  return { ok: true, ...fortune(guildId, userId) };
}

/**
 * Verse les interets dus a un membre.
 * On ne verse qu'une fois par tranche de 24 h, et on plafonne : sans plafond,
 * un gros depot rapporterait sans limite et casserait l'economie.
 */
function verserInterets(guildId, userId) {
  const c = compte(guildId, userId);
  const banque = c.banque ?? 0;
  if (banque <= 0) return { ok: false, raison: 'Rien a la banque.' };

  const ecoule = Date.now() - (c.dernier_interet ?? 0);
  if (ecoule < JOUR) return { ok: false, resteMs: JOUR - ecoule };

  // Plusieurs jours sans passer : on verse au plus 7 jours d'interets.
  const jours = Math.min(7, Math.floor(ecoule / JOUR));
  const brut = Math.floor(banque * (B.tauxJournalier ?? 0.02) * jours);
  const interets = Math.min(brut, B.plafondInterets ?? 5000);
  if (interets <= 0) return { ok: false, raison: 'Somme trop faible pour produire des interets.' };

  req.majInteret.run(interets, Date.now(), guildId, userId);
  return { ok: true, interets, jours, banque: banque + interets };
}

// -------------------------------------------------------------- TRANSFERTS
/** Envoie de la monnaie a un autre membre, taxe deduite. */
function payer(guildId, deId, versId, montant) {
  if (deId === versId) return { ok: false, raison: 'Tu ne peux pas te payer toi-meme.' };
  const min = P.minimum ?? 1;
  const max = P.maximum ?? 1_000_000;
  if (montant < min) return { ok: false, raison: `Le minimum est de ${min}.` };
  if (montant > max) return { ok: false, raison: `Le maximum est de ${max} par envoi.` };

  const emetteur = compte(guildId, deId);
  if (montant > emetteur.solde) return { ok: false, raison: "Tu n'as pas cette somme en poche." };

  const taxe = Math.floor((montant * (P.taxePourcent ?? 0)) / 100);
  const recu = montant - taxe;

  // Le montant complet quitte l'emetteur, seul le net arrive : la taxe
  // disparait de la circulation, ce qui evite l'inflation.
  eco.crediter(guildId, deId, -montant, false);
  eco.crediter(guildId, versId, recu, false);

  return { ok: true, envoye: montant, taxe, recu };
}

// --------------------------------------------------------------- BRAQUAGE
/** Le membre peut-il tenter un braquage maintenant ? */
function etatBraquage(guildId, userId) {
  const c = compte(guildId, userId);
  const delai = (V.delaiHeures ?? 6) * 3_600_000;
  const reste = (c.dernier_braquage ?? 0) + delai - Date.now();
  return { disponible: reste <= 0, resteMs: Math.max(0, reste) };
}

/**
 * Tente de braquer un membre.
 * Ne touche jamais a la banque de la cible, et une cible fraichement
 * braquee est protegee — sinon un seul membre riche serait harcele.
 */
function braquer(guildId, voleurId, cibleId) {
  if (voleurId === cibleId) return { ok: false, raison: 'Tu ne peux pas te braquer toi-meme.' };

  const etat = etatBraquage(guildId, voleurId);
  if (!etat.disponible) return { ok: false, raison: 'attente', resteMs: etat.resteMs };

  if (objets.aEffet(guildId, cibleId, 'protection')) {
    return { ok: false, raison: 'Cette personne a un coffre-fort actif : impossible de la braquer.' };
  }

  const cible = compte(guildId, cibleId);
  const minimum = V.soldeMinimumCible ?? 500;
  if (cible.solde < minimum) {
    return { ok: false, raison: `Cette personne a moins de ${minimum} en poche : elle n'a rien a voler.` };
  }

  const voleur = compte(guildId, voleurId);
  const amende = Math.floor((voleur.solde * (V.amendePourcent ?? 20)) / 100);
  if (voleur.solde < amende || voleur.solde <= 0) {
    return { ok: false, raison: "Tu n'as pas de quoi payer l'amende si tu echoues. Reviens avec un peu d'avance." };
  }

  req.majBraquage.run(Date.now(), guildId, voleurId);
  const reussi = Math.random() < (V.chanceReussite ?? 0.35);

  if (reussi) {
    const butin = Math.max(1, Math.floor(cible.solde * (V.partVolee ?? 0.15)));
    eco.crediter(guildId, cibleId, -butin, false);
    eco.crediter(guildId, voleurId, butin, false);
    // La cible est tranquille pendant quelques heures.
    if (V.protectionHeures > 0) {
      req.poserEffet.run(guildId, cibleId, 'protection', '', Date.now() + V.protectionHeures * 3_600_000);
    }
    return { ok: true, reussi: true, butin };
  }

  eco.crediter(guildId, voleurId, -amende, false);
  return { ok: true, reussi: false, amende };
}

// ----------------------------------------------------------------- TACHES
/** Verse les interets a tout le monde une fois par jour. */
function interetsAutomatiques() {
  let verses = 0;
  try {
    for (const ligne of req.comptesAvecBanque.all()) {
      try {
        if (!config(ligne.guild_id).banque_actif) continue;
      } catch {
        continue;
      }
      if (verserInterets(ligne.guild_id, ligne.user_id).ok) verses++;
    }
  } catch (e) {
    logger.avertissement('Interets bancaires :', e.message);
  }
  if (verses) logger.info(`Interets verses a ${verses} compte(s).`);
  return verses;
}

module.exports = {
  compte,
  fortune,
  deposer,
  retirer,
  verserInterets,
  payer,
  etatBraquage,
  braquer,
  interetsAutomatiques,
};
