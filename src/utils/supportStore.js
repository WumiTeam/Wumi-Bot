/**
 * Les donnees du serveur SUPPORT : tickets support, reglages, verifications.
 *
 * Volontairement a part des tables par serveur (`tickets`, `config`) :
 *   - le systeme de tickets « public » (/ticket) reste disponible sur le
 *     serveur support sans que les deux se marchent dessus ;
 *   - ces tables n'ont PAS de colonne guild_id, donc supprimerServeur() ne
 *     les touche jamais, meme par erreur.
 */
const { db } = require('../database/db');

db.exec(`
CREATE TABLE IF NOT EXISTS support_reglages (
  cle    TEXT PRIMARY KEY,
  valeur TEXT
);

CREATE TABLE IF NOT EXISTS support_tickets (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  numero      INTEGER NOT NULL,
  channel_id  TEXT UNIQUE,
  user_id     TEXT NOT NULL,
  motif       TEXT NOT NULL,
  reponses    TEXT,                       -- JSON [{ question, reponse }]
  statut      TEXT NOT NULL DEFAULT 'ouvert',
  priorite    TEXT NOT NULL DEFAULT 'normale',
  pris_par    TEXT,
  pris_le     INTEGER,
  cree_le     INTEGER NOT NULL,
  ferme_le    INTEGER,
  ferme_par   TEXT,
  raison      TEXT,
  note        INTEGER,                    -- satisfaction 1 a 5
  messages    INTEGER,
  relance_le  INTEGER
);
CREATE INDEX IF NOT EXISTS idx_support_tickets_user ON support_tickets (user_id, statut);

CREATE TABLE IF NOT EXISTS support_verifications (
  user_id  TEXT PRIMARY KEY,
  date     INTEGER NOT NULL,
  methode  TEXT NOT NULL                  -- 'activite' ou 'secours'
);
`);

// Base creee avant la colonne relance_le : on l'ajoute.
if (!db.prepare('PRAGMA table_info(support_tickets)').all().some((c) => c.name === 'relance_le')) {
  db.exec('ALTER TABLE support_tickets ADD COLUMN relance_le INTEGER');
}

const q = {
  lire: db.prepare('SELECT valeur FROM support_reglages WHERE cle = ?'),
  ecrire: db.prepare(`
    INSERT INTO support_reglages (cle, valeur) VALUES (?, ?)
    ON CONFLICT(cle) DO UPDATE SET valeur = excluded.valeur
  `),
  effacer: db.prepare('DELETE FROM support_reglages WHERE cle = ?'),

  creer: db.prepare(`
    INSERT INTO support_tickets (numero, channel_id, user_id, motif, reponses, cree_le)
    VALUES (@numero, @channel_id, @user_id, @motif, @reponses, @cree_le)
  `),
  parSalon: db.prepare('SELECT * FROM support_tickets WHERE channel_id = ?'),
  parId: db.prepare('SELECT * FROM support_tickets WHERE id = ?'),
  ouvertsDe: db.prepare("SELECT * FROM support_tickets WHERE user_id = ? AND statut = 'ouvert'"),
  ouverts: db.prepare("SELECT * FROM support_tickets WHERE statut = 'ouvert' ORDER BY cree_le ASC"),
  prendre: db.prepare('UPDATE support_tickets SET pris_par = ?, pris_le = ? WHERE channel_id = ?'),
  priorite: db.prepare('UPDATE support_tickets SET priorite = ? WHERE channel_id = ?'),
  fermer: db.prepare(`
    UPDATE support_tickets SET statut = 'ferme', ferme_le = @ferme_le, ferme_par = @ferme_par,
      raison = @raison, messages = @messages
    WHERE channel_id = @channel_id
  `),
  noter: db.prepare('UPDATE support_tickets SET note = ? WHERE id = ? AND note IS NULL'),
  relance: db.prepare('UPDATE support_tickets SET relance_le = ? WHERE channel_id = ?'),
  stats: db.prepare(`
    SELECT
      COUNT(*) AS total,
      SUM(statut = 'ouvert') AS ouverts,
      AVG(note) AS note,
      COUNT(note) AS notes,
      AVG(CASE WHEN pris_le IS NOT NULL THEN pris_le - cree_le END) AS prise_moyenne,
      AVG(CASE WHEN ferme_le IS NOT NULL THEN ferme_le - cree_le END) AS duree_moyenne
    FROM support_tickets
  `),
  dernierNumero: db.prepare('SELECT MAX(numero) AS n FROM support_tickets'),

  verifier: db.prepare(`
    INSERT INTO support_verifications (user_id, date, methode) VALUES (?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET date = excluded.date, methode = excluded.methode
  `),
  verification: db.prepare('SELECT * FROM support_verifications WHERE user_id = ?'),
  oublierVerification: db.prepare('DELETE FROM support_verifications WHERE user_id = ?'),
  statsVerif: db.prepare(`
    SELECT COUNT(*) AS total,
      SUM(methode = 'activite') AS activite,
      SUM(date > ?) AS semaine
    FROM support_verifications
  `),
};

// ------------------------------------------------------------------ REGLAGES
/** Les reglages connus, avec leur valeur par defaut. */
const DEFAUTS = {
  'ticket.categorie': null,
  'ticket.staff': null,
  'ticket.limite': '1',
  'ticket.inactif_heures': '0', // 0 = jamais de fermeture automatique
  'ticket.logs': null, // repli si LOG_TICKETS est vide
  'verif.role': null,
  'verif.age_min_jours': '0',
  'verif.retirer_role': null, // role « non verifie » a enlever, facultatif
};

function lire(cle) {
  const ligne = q.lire.get(cle);
  return ligne ? ligne.valeur : (DEFAUTS[cle] ?? null);
}

function ecrire(cle, valeur) {
  if (valeur === null || valeur === undefined || valeur === '') q.effacer.run(cle);
  else q.ecrire.run(cle, String(valeur));
}

function lireNombre(cle) {
  const n = Number(lire(cle));
  return Number.isFinite(n) ? n : 0;
}

module.exports = { q, lire, ecrire, lireNombre, DEFAUTS };
