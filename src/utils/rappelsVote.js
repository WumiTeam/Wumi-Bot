/**
 * RAPPEL DE VOTE et SERIE DE VOTES (Wumi 2.23).
 *
 * Rappel : un membre qui l'a demande (bouton « Me rappeler » de /vote) recoit
 * UN message prive quand il peut revoter, douze heures apres son dernier vote.
 * Jamais plus d'un rappel par vote, et un bouton pour l'arreter.
 *
 * Serie : voter a nouveau dans les 36 heures qui suivent le vote precedent
 * prolonge la serie ; sinon elle repart a 1. La recompense de vote (le
 * multiplicateur d'XP) dure une heure de plus par vote de serie, jusqu'a +12 h.
 */
const { ButtonBuilder, ButtonStyle, ActionRowBuilder } = require('discord.js');
const { db } = require('../database/db');
const C = require('./composants');
const { E } = require('./emojis');
const { t } = require('./langues');
const logger = require('./logger');

const DOUZE_HEURES = 12 * 3_600_000;
const FENETRE_SERIE = 36 * 3_600_000;
const BONUS_MAX_HEURES = 12;

// Colonnes ajoutees a la table globale `votes`.
const colonnes = new Set(db.prepare('PRAGMA table_info(votes)').all().map((c) => c.name));
for (const [nom, type] of [['rappel', 'INTEGER NOT NULL DEFAULT 0'], ['rappel_envoye', 'INTEGER'], ['serie', 'INTEGER NOT NULL DEFAULT 0'], ['langue', 'TEXT'], ['precedent', 'INTEGER']]) {
  if (!colonnes.has(nom)) db.exec(`ALTER TABLE votes ADD COLUMN ${nom} ${type}`);
}

const q = {
  lire: db.prepare('SELECT * FROM votes WHERE user_id = ?'),
  activer: db.prepare(`
    INSERT INTO votes (user_id, dernier_vote, total, rappel, langue) VALUES (?, 0, 0, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET rappel = excluded.rappel, langue = excluded.langue
  `),
  aRappeler: db.prepare('SELECT user_id, langue, serie FROM votes WHERE rappel = 1 AND dernier_vote > 0 AND dernier_vote <= ? AND (rappel_envoye IS NULL OR rappel_envoye < dernier_vote) LIMIT 50'),
  marquer: db.prepare('UPDATE votes SET rappel_envoye = ? WHERE user_id = ?'),
  // Appele APRES noterVote : `precedent` garde la date du vote d'avant.
  serie: db.prepare('UPDATE votes SET serie = ?, precedent = ? WHERE user_id = ?'),
};

/** Le rappel est-il actif pour ce membre ? */
function rappelActif(userId) {
  return Boolean(q.lire.get(String(userId))?.rappel);
}

/** Active ou coupe le rappel. `langue` : celle du serveur ou il l'a demande. */
function basculer(userId, langue) {
  const actif = !rappelActif(userId);
  q.activer.run(String(userId), actif ? 1 : 0, langue ?? null);
  return actif;
}

/**
 * Met a jour la serie juste avant d'enregistrer un nouveau vote.
 * @param {number|null} dernierAvant date du vote precedent (avant ce vote)
 * @returns {number} la serie apres ce vote
 */
function avancerSerie(userId, dernierAvant, maintenant = Date.now()) {
  const ligne = q.lire.get(String(userId));
  const continue_ = dernierAvant && maintenant - dernierAvant <= FENETRE_SERIE;
  const serie = continue_ ? (ligne?.serie ?? 0) + 1 : 1;
  q.serie.run(serie, dernierAvant ?? null, String(userId));
  return serie;
}

/** Heures de bonus de serie : +1 h par vote de serie apres le premier, plafonne. */
function bonusSerie(serie) {
  return Math.max(0, Math.min(BONUS_MAX_HEURES, (serie ?? 1) - 1));
}

function serieDe(userId) {
  const l = q.lire.get(String(userId));
  if (!l?.serie || !l.dernier_vote) return 0;
  // Une serie dont la fenetre est passee est deja perdue.
  return Date.now() - l.dernier_vote > FENETRE_SERIE ? 0 : l.serie;
}

/** Le bouton a mettre sous /vote. */
function bouton(userId, langue) {
  const actif = rappelActif(userId);
  return new ButtonBuilder()
    .setCustomId(`vote_rappel_${userId}`)
    .setLabel(t(actif ? 'vote.rappel.bouton_arreter' : 'vote.rappel.bouton_activer', langue))
    .setEmoji(actif ? '🔕' : '🔔')
    .setStyle(ButtonStyle.Secondary);
}

async function tour(client) {
  const lien = require('./topgg').lienVote(client) ?? 'https://top.gg';
  for (const l of q.aRappeler.all(Date.now() - DOUZE_HEURES)) {
    q.marquer.run(Date.now(), l.user_id); // marque avant d'envoyer : jamais deux rappels
    const langue = l.langue ?? 'en';
    try {
      const user = await client.users.fetch(l.user_id);
      const serie = serieDe(l.user_id);
      await user.send(C.envoi([C.conteneur([
        C.texte(`## ${E('etoile')} ${t('vote.rappel.titre', langue)}\n${t('vote.rappel.texte', langue)}`),
        ...(serie > 1 ? [C.texte(`${E('feu')} ${t('vote.rappel.serie', langue, { n: serie })}`)] : []),
        new ActionRowBuilder().addComponents(
          new ButtonBuilder().setLabel(t('vote.v2.bouton_voter', langue)).setEmoji('⭐').setStyle(ButtonStyle.Link).setURL(lien),
          new ButtonBuilder().setCustomId(`vote_stop_${l.user_id}`).setLabel(t('vote.rappel.bouton_arreter', langue)).setEmoji('🔕').setStyle(ButtonStyle.Secondary),
        ),
        C.texte(`-# ${t('vote.rappel.pied', langue)}`),
      ], 0xf5b941)]));
    } catch (e) {
      // MP fermes : on coupe le rappel plutot que d'insister.
      logger.debug('Rappel de vote :', e.message);
      q.activer.run(l.user_id, 0, langue);
    }
  }
}

function demarrer(client) {
  setInterval(() => tour(client).catch((e) => logger.avertissement('Rappels de vote :', e.message)), 5 * 60_000).unref?.();
}

module.exports = { rappelActif, basculer, avancerSerie, bonusSerie, serieDe, bouton, tour, demarrer, DOUZE_HEURES, FENETRE_SERIE };
