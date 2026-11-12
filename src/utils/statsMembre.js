/**
 * Statistiques d'activite par membre : heures actives et salons preferes.
 *
 * Les heures sont comptees en heure de Paris, pas en heure machine : le bot
 * peut tourner sur un serveur en UTC, les membres, eux, vivent a Paris.
 */
const { req } = require('../database/db');

// On lit la partie "hour" plutot que la chaine complete : en francais,
// Intl rend "14 h" et Number("14 h") vaut NaN. Le NaN passait en NULL dans la
// base, la contrainte d'unicite ne jouait plus et chaque message creait une
// ligne. formatToParts evite le probleme a la source.
const FORMAT_HEURE = new Intl.DateTimeFormat('fr-FR', {
  timeZone: 'Europe/Paris',
  hour: '2-digit',
  hour12: false,
});

/** Heure de Paris (0 a 23) pour une date donnee. */
function heureParis(date = new Date()) {
  const partie = FORMAT_HEURE.formatToParts(date).find((p) => p.type === 'hour');
  const h = Number.parseInt(partie?.value ?? '', 10);
  return Number.isInteger(h) ? h % 24 : new Date(date).getUTCHours();
}

/** Enregistre un message : une heure et un salon de plus pour ce membre. */
function noter(guildId, userId, channelId, date = new Date()) {
  req.noterHeure.run(guildId, userId, heureParis(date));
  req.noterSalonMembre.run(guildId, userId, channelId);
  // Les compteurs du mois, pour /wrapped.
  require('./wrapped').noterMessage(guildId, userId, channelId);
  // Le compagnon /pet grandit avec l'activite de son maitre.
  require('./pets').activite(guildId, userId, 1);
}

/** Tableau de 24 entrees (index = heure) avec le nombre de messages. */
function heures(guildId, userId) {
  const tableau = new Array(24).fill(0);
  for (const l of req.heuresDe.all(guildId, userId)) {
    if (Number.isInteger(l.heure) && l.heure >= 0 && l.heure < 24) tableau[l.heure] = l.messages;
  }
  return tableau;
}

/** Salons ou le membre ecrit le plus. */
function salons(guildId, userId, limite = 5) {
  return req.salonsDe.all(guildId, userId, limite);
}

/**
 * Plage horaire favorite : la fenetre de 3 heures la plus chargee.
 * Une heure isolee ne veut pas dire grand-chose, une plage si.
 */
function plageFavorite(tableau) {
  const total = tableau.reduce((a, b) => a + b, 0);
  if (!total) return null;
  let meilleure = 0;
  let debut = 0;
  for (let h = 0; h < 24; h++) {
    const somme = tableau[h] + tableau[(h + 1) % 24] + tableau[(h + 2) % 24];
    if (somme > meilleure) {
      meilleure = somme;
      debut = h;
    }
  }
  return { debut, fin: (debut + 3) % 24, messages: meilleure, part: meilleure / total };
}

/** Heure la plus chargee, ou null si le membre n'a rien ecrit. */
function heurePic(tableau) {
  const total = tableau.reduce((a, b) => a + b, 0);
  if (!total) return null;
  let pic = 0;
  for (let h = 1; h < 24; h++) if (tableau[h] > tableau[pic]) pic = h;
  return { heure: pic, messages: tableau[pic] };
}

module.exports = { heureParis, noter, heures, salons, plageFavorite, heurePic };
