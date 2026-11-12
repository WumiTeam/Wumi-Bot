const { req } = require('../database/db');
const logger = require('./logger');

/** Jour courant au format AAAA-MM-JJ, en heure de Paris. */
function jour(date = new Date()) {
  return new Intl.DateTimeFormat('fr-CA', {
    timeZone: 'Europe/Paris',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

/** Jour situe il y a N jours. */
function jourMoins(n) {
  return jour(new Date(Date.now() - n * 86_400_000));
}

/** Incremente un compteur du jour. */
function noter(guildId, champs = {}) {
  try {
    req.noterActivite.run({
      guild_id: guildId,
      jour: jour(),
      messages: champs.messages ?? 0,
      arrivees: champs.arrivees ?? 0,
      departs: champs.departs ?? 0,
      vocal: champs.vocal ?? 0,
    });
  } catch (e) {
    logger.debug('Activite :', e.message);
  }
}

/** Un message de plus, pour le serveur et pour son salon. */
function noterMessage(guildId, channelId) {
  noter(guildId, { messages: 1 });
  try {
    req.noterActiviteSalon.run(guildId, jour(), channelId);
  } catch (e) {
    logger.debug('Activite salon :', e.message);
  }
  try {
    req.noterActiviteHeure.run(guildId, jour(), heure());
  } catch (e) {
    logger.debug('Activite heure :', e.message);
  }
}

/** Heure courante (0-23), en heure de Paris. */
function heure(date = new Date()) {
  const partie = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Paris', hour: 'numeric', hourCycle: 'h23' })
    .formatToParts(date).find((p) => p.type === 'hour');
  return Number(partie?.value ?? 0) % 24;
}

/**
 * Messages par heure de la journee (24 cases) entre deux jours inclus.
 * @returns {number[]}
 */
function heures(guildId, depuis, jusque = jour()) {
  const cases = new Array(24).fill(0);
  for (const l of req.activiteHeures.all(guildId, depuis, jusque)) {
    if (l.heure >= 0 && l.heure < 24) cases[l.heure] = l.total;
  }
  return cases;
}

/**
 * Totaux d'une periode de N jours finissant il y a `decalage` jours.
 * Sert a comparer « cette semaine » a « la semaine d'avant ».
 */
function totaux(guildId, jours, decalage = 0) {
  const depuis = jourMoins(jours - 1 + decalage);
  const jusque = jourMoins(decalage);
  const lignes = req.activiteRecente.all(guildId, depuis).filter((l) => l.jour <= jusque);
  return lignes.reduce((s, l) => ({
    messages: s.messages + l.messages,
    arrivees: s.arrivees + l.arrivees,
    departs: s.departs + l.departs,
    vocal: s.vocal + l.vocal,
  }), { messages: 0, arrivees: 0, departs: 0, vocal: 0 });
}

/** Evolution en pourcentage, ou null si la periode d'avant est vide. */
function evolution(actuel, avant) {
  if (!avant) return null;
  return Math.round(((actuel - avant) / avant) * 100);
}

/**
 * Serie complete sur N jours, trous compris.
 * Les jours sans activite valent zero plutot que d'etre absents,
 * sinon le graphique mentirait sur la forme de la courbe.
 */
function serie(guildId, jours = 30) {
  const depuis = jourMoins(jours - 1);
  const lignes = req.activiteRecente.all(guildId, depuis);
  const parJour = new Map(lignes.map((l) => [l.jour, l]));

  const sortie = [];
  for (let i = jours - 1; i >= 0; i--) {
    const j = jourMoins(i);
    const l = parJour.get(j);
    sortie.push({
      jour: j,
      messages: l?.messages ?? 0,
      arrivees: l?.arrivees ?? 0,
      departs: l?.departs ?? 0,
      vocal: l?.vocal ?? 0,
    });
  }
  return sortie;
}

/** Salons les plus actifs sur la periode. */
function topSalons(guildId, jours = 30, limite = 5) {
  return req.topSalons.all(guildId, jourMoins(jours - 1), limite);
}

/** Supprime les donnees de plus de 180 jours. */
function purger() {
  const limite = jourMoins(180);
  req.purgerActivite.run(limite);
  req.purgerActiviteSalons.run(limite);
  req.purgerActiviteHeures.run(limite);
}

module.exports = { jour, jourMoins, heure, heures, totaux, evolution, noter, noterMessage, serie, topSalons, purger };
