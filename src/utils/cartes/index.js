/**
 * Wumi 2.34 · LES CARTES A COLLECTIONNER.
 *
 * Chaque serveur a sa propre partie (comme l'economie) :
 *   - un booster tous les N messages comptes (meme delai anti-spam que l'XP),
 *   - un booster gratuit par jour (/cartes quotidien),
 *   - des boosters a acheter avec la monnaie du serveur.
 * Un booster = 5 cartes. Les cartes NE PEUVENT PAS etre donnees ni echangees :
 * c'est voulu. Les doubles se recyclent en poussiere (100 = un booster).
 *
 * Les cartes tirees sont enregistrees DES l'ouverture : quitter l'animation
 * en cours de route ne fait rien perdre.
 */
const { db, config } = require('../../database/db');
// 2.35 : une edition peut avoir son propre deck (ex. l'Auvergne).
const EDITION = require('../../edition').profil?.cartes ?? null;
const { SERIE1, FAMILLES, RARETES, PAR_NUMERO, TOTAL } = EDITION ? EDITION.serie() : require('./serie1');

db.exec(`
CREATE TABLE IF NOT EXISTS cartes_joueurs (
  guild_id   TEXT NOT NULL,
  user_id    TEXT NOT NULL,
  boosters   INTEGER NOT NULL DEFAULT 0,
  poussiere  INTEGER NOT NULL DEFAULT 0,
  compteur   INTEGER NOT NULL DEFAULT 0,
  ouverts    INTEGER NOT NULL DEFAULT 0,
  quotidien  INTEGER NOT NULL DEFAULT 0,
  deck       TEXT NOT NULL DEFAULT '[]',
  PRIMARY KEY (guild_id, user_id)
);
CREATE TABLE IF NOT EXISTS cartes_collection (
  guild_id   TEXT NOT NULL,
  user_id    TEXT NOT NULL,
  numero     INTEGER NOT NULL,
  brillante  INTEGER NOT NULL DEFAULT 0,
  quantite   INTEGER NOT NULL DEFAULT 1,
  premiere   INTEGER NOT NULL,
  PRIMARY KEY (guild_id, user_id, numero, brillante)
);
CREATE INDEX IF NOT EXISTS idx_cartes_collection_guild ON cartes_collection (guild_id, user_id);
`);

const q = {
  joueur: db.prepare('SELECT * FROM cartes_joueurs WHERE guild_id = ? AND user_id = ?'),
  creer: db.prepare('INSERT OR IGNORE INTO cartes_joueurs (guild_id, user_id) VALUES (?, ?)'),
  maj: db.prepare(`UPDATE cartes_joueurs SET boosters = @boosters, poussiere = @poussiere, compteur = @compteur,
    ouverts = @ouverts, quotidien = @quotidien, deck = @deck WHERE guild_id = @guild_id AND user_id = @user_id`),
  ajouterCarte: db.prepare(`INSERT INTO cartes_collection (guild_id, user_id, numero, brillante, quantite, premiere)
    VALUES (?, ?, ?, ?, 1, ?) ON CONFLICT (guild_id, user_id, numero, brillante) DO UPDATE SET quantite = quantite + 1`),
  collection: db.prepare('SELECT numero, brillante, quantite, premiere FROM cartes_collection WHERE guild_id = ? AND user_id = ?'),
  fixerQuantite: db.prepare('UPDATE cartes_collection SET quantite = ? WHERE guild_id = ? AND user_id = ? AND numero = ? AND brillante = ?'),
  classement: db.prepare(`SELECT user_id, COUNT(DISTINCT numero) AS differentes, SUM(quantite) AS total, SUM(brillante) AS brillantes
    FROM cartes_collection WHERE guild_id = ? GROUP BY user_id ORDER BY differentes DESC, brillantes DESC, total DESC LIMIT ?`),
};

const BOOSTERS_MAX = 20;          // stock maximum (gagne ou achete)
const ACHAT_MAX = 10;             // boosters par achat
const QUOTIDIEN_MS = 20 * 3_600_000;
const CHANCE_BRILLANTE = 1 / 40;
const POUSSIERE_BOOSTER = 100;
const OUVERTURE_MAX = 5;           // boosters ouverts d'un coup (3.1)
const POUSSIERE = { commune: 5, peu_commune: 10, rare: 25, epique: 60, legendaire: 150, mythique: 500 };

// Chances par emplacement du booster (en %, la somme fait 100).
const EMPLACEMENTS = [
  { commune: 70, peu_commune: 30 },
  { commune: 70, peu_commune: 30 },
  { commune: 70, peu_commune: 30 },
  { rare: 75, epique: 20, legendaire: 4.5, mythique: 0.5 },
  { commune: 40, peu_commune: 30, rare: 18, epique: 9, legendaire: 2.7, mythique: 0.3 },
];
const PAR_RARETE = Object.fromEntries(RARETES.map((r) => [r, SERIE1.filter((c) => c.rarete === r)]));

function reglages(guildId) {
  const cfg = config(guildId);
  return {
    actif: cfg.cartes_actif !== 0,
    prix: cfg.cartes_prix ?? 500,
    messages: Math.max(10, cfg.cartes_messages ?? 100),
    quotidien: cfg.cartes_quotidien !== 0,
    economie: Boolean(cfg.eco_actif),
  };
}

function joueur(guildId, userId) {
  q.creer.run(guildId, userId);
  const j = q.joueur.get(guildId, userId);
  return { ...j, deck: JSON.parse(j.deck || '[]') };
}

function sauver(j) {
  q.maj.run({ ...j, deck: JSON.stringify(j.deck ?? []) });
}

// ---------------------------------------------------------------- TIRAGE
function rareteAuHasard(table, hasard = Math.random) {
  const total = Object.values(table).reduce((a, b) => a + b, 0);
  let x = hasard() * total;
  for (const [r, p] of Object.entries(table)) {
    x -= p;
    if (x < 0) return r;
  }
  return Object.keys(table)[0];
}

/** Les 5 cartes d'un booster : [{ carte, brillante }]. */
function tirer(hasard = Math.random) {
  return EMPLACEMENTS.map((table) => {
    const liste = PAR_RARETE[rareteAuHasard(table, hasard)];
    return { carte: liste[Math.floor(hasard() * liste.length)], brillante: hasard() < CHANCE_BRILLANTE };
  });
}

/** Ouvre un booster du stock. null s'il n'y en a pas. */
function ouvrir(guildId, userId, nombre = 1) {
  const j = joueur(guildId, userId);
  if (j.boosters <= 0) return null;
  // 3.1 : jusqu'a OUVERTURE_MAX boosters d'un coup.
  const n = Math.max(1, Math.min(Math.floor(nombre) || 1, OUVERTURE_MAX, j.boosters));
  const avant = new Set(q.collection.all(guildId, userId).map((l) => l.numero));
  const tirage = [];
  for (let i = 0; i < n; i++) tirage.push(...tirer());
  const maintenant = Date.now();
  db.exec('BEGIN');
  try {
    j.boosters -= n;
    j.ouverts += n;
    sauver(j);
    for (const t of tirage) q.ajouterCarte.run(guildId, userId, t.carte.numero, t.brillante ? 1 : 0, maintenant);
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
  // « nouvelle » : jamais eue avant ce booster (la 2e du meme booster n'est plus nouvelle)
  const vues = new Set(avant);
  const cartes = tirage.map((t) => {
    const nouvelle = !vues.has(t.carte.numero);
    vues.add(t.carte.numero);
    return { ...t, nouvelle };
  });
  // Revelees de la moins rare a la plus rare : le suspense jusqu'au bout.
  cartes.sort((a, b) => RARETES.indexOf(a.carte.rarete) - RARETES.indexOf(b.carte.rarete) || a.brillante - b.brillante);
  return { cartes, restants: j.boosters, ouverts: n };
}

// ---------------------------------------------------------------- GAINS
/**
 * Un message compte (appele la ou l'XP est donnee, donc meme anti-spam).
 * @returns {boolean} true si un booster vient d'etre gagne
 */
function noterMessage(guildId, userId) {
  const r = reglages(guildId);
  if (!r.actif) return false;
  const j = joueur(guildId, userId);
  if (j.boosters >= BOOSTERS_MAX) return false;
  j.compteur++;
  let gagne = false;
  if (j.compteur >= r.messages) {
    j.compteur = 0;
    j.boosters++;
    gagne = true;
  }
  sauver(j);
  return gagne;
}

/** Booster quotidien. { ok, prochain } */
function quotidien(guildId, userId) {
  const j = joueur(guildId, userId);
  const prochain = j.quotidien + QUOTIDIEN_MS;
  if (Date.now() < prochain) return { ok: false, prochain };
  if (j.boosters >= BOOSTERS_MAX) return { ok: false, plein: true };
  j.quotidien = Date.now();
  j.boosters++;
  sauver(j);
  return { ok: true, boosters: j.boosters };
}

/** Achat avec la monnaie du serveur. */
function acheter(guildId, userId, nombre) {
  const r = reglages(guildId);
  const eco = require('../economie');
  const j = joueur(guildId, userId);
  const n = Math.max(1, Math.min(ACHAT_MAX, nombre, BOOSTERS_MAX - j.boosters));
  if (BOOSTERS_MAX - j.boosters <= 0) return { ok: false, raison: 'plein' };
  const cout = n * r.prix;
  if (eco.solde(guildId, userId) < cout) return { ok: false, raison: 'solde', cout };
  eco.crediter(guildId, userId, -cout, false);
  j.boosters += n;
  sauver(j);
  return { ok: true, n, cout, boosters: j.boosters };
}

/** Ce que le recyclage des doubles rapporterait, sans rien toucher. */
function estimerRecyclage(guildId, userId) {
  let poussiere = 0;
  let cartes = 0;
  for (const l of q.collection.all(guildId, userId)) {
    if (l.quantite <= 1) continue;
    const c = PAR_NUMERO.get(l.numero);
    if (!c) continue;
    cartes += l.quantite - 1;
    poussiere += (l.quantite - 1) * POUSSIERE[c.rarete] * (l.brillante ? 3 : 1);
  }
  return { cartes, poussiere };
}

/** Recycle tous les doubles (on garde un exemplaire de chaque). */
function recycler(guildId, userId) {
  const est = estimerRecyclage(guildId, userId);
  if (!est.cartes) return { ...est, boosters: 0 };
  const j = joueur(guildId, userId);
  db.exec('BEGIN');
  try {
    for (const l of q.collection.all(guildId, userId)) {
      if (l.quantite > 1) q.fixerQuantite.run(1, guildId, userId, l.numero, l.brillante);
    }
    j.poussiere += est.poussiere;
    let boosters = 0;
    while (j.poussiere >= POUSSIERE_BOOSTER && j.boosters < BOOSTERS_MAX) {
      j.poussiere -= POUSSIERE_BOOSTER;
      j.boosters++;
      boosters++;
    }
    sauver(j);
    db.exec('COMMIT');
    return { ...est, boosters, reste: j.poussiere };
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

// ---------------------------------------------------------------- COLLECTION
/** Map numero -> { quantite, brillante (bool), premiere } */
function collection(guildId, userId) {
  const m = new Map();
  for (const l of q.collection.all(guildId, userId)) {
    const e = m.get(l.numero) ?? { quantite: 0, brillante: false, premiere: l.premiere };
    e.quantite += l.quantite;
    if (l.brillante) e.brillante = true;
    e.premiere = Math.min(e.premiere, l.premiere);
    m.set(l.numero, e);
  }
  return m;
}

function resume(guildId, userId) {
  const col = collection(guildId, userId);
  const j = joueur(guildId, userId);
  const r = reglages(guildId);
  return {
    differentes: col.size,
    total: TOTAL,
    pourcent: Math.floor((col.size / TOTAL) * 100),
    brillantes: [...col.values()].filter((x) => x.brillante).length,
    boosters: j.boosters,
    poussiere: j.poussiere,
    compteur: j.compteur,
    messages: r.messages,
    ouverts: j.ouverts,
    quotidien: j.quotidien + QUOTIDIEN_MS,
    deck: j.deck,
  };
}

/** Choisit les cartes de la vitrine (5 max, possedees, sans doublon). */
function definirDeck(guildId, userId, numeros) {
  const col = collection(guildId, userId);
  const deck = [...new Set(numeros.filter((n) => col.has(n)))].slice(0, 5);
  const j = joueur(guildId, userId);
  j.deck = deck;
  sauver(j);
  return deck;
}

function classement(guildId, limite = 10) {
  return q.classement.all(guildId, limite);
}

module.exports = { OUVERTURE_MAX,
  EDITION, SERIE1, FAMILLES, RARETES, PAR_NUMERO, TOTAL,
  BOOSTERS_MAX, ACHAT_MAX, POUSSIERE, POUSSIERE_BOOSTER, EMPLACEMENTS, CHANCE_BRILLANTE,
  reglages, joueur, tirer, ouvrir, noterMessage, quotidien, acheter, estimerRecyclage, recycler,
  collection, resume, definirDeck, classement,
};
