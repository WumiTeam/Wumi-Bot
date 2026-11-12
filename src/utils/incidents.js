/**
 * INCIDENTS ET MAINTENANCES — ce que le fondateur annonce sur le statut.
 *
 *   incident     investigation -> identifie -> surveillance -> resolu
 *   maintenance  prevue -> en_cours -> terminee
 *
 * Chaque changement d'etat garde son message (l'historique, comme sur les
 * pages de statut des grands services). Affiche :
 *   - dans le message de statut du salon #bot-status (en tete, et la couleur
 *     change) ;
 *   - par un message d'annonce dans ce meme salon a chaque mise a jour ;
 *   - sur wumi.fr/statut, via /api/statut.
 */
const { db } = require('../database/db');

db.exec(`
CREATE TABLE IF NOT EXISTS incidents (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  type      TEXT NOT NULL,              -- incident | maintenance
  titre     TEXT NOT NULL,
  impact    TEXT NOT NULL DEFAULT 'majeur',
  statut    TEXT NOT NULL,
  debut     INTEGER,                    -- maintenance : debut prevu
  fin       INTEGER,                    -- maintenance : fin prevue ; sinon fin reelle
  cree_le   INTEGER NOT NULL,
  maj_le    INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS incidents_majs (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  incident_id INTEGER NOT NULL,
  statut      TEXT NOT NULL,
  message     TEXT NOT NULL,
  le          INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_incidents_majs ON incidents_majs (incident_id, le);
`);

const ETATS = {
  incident: ['investigation', 'identifie', 'surveillance', 'resolu'],
  maintenance: ['prevue', 'en_cours', 'terminee'],
};
const FINIS = ['resolu', 'terminee'];
const IMPACTS = ['mineur', 'majeur', 'critique'];
const EMOJI = {
  investigation: '🔍', identifie: '🧩', surveillance: '👀', resolu: '✅',
  prevue: '🗓️', en_cours: '🛠️', terminee: '✅',
};
const COULEUR_IMPACT = { mineur: 0xf5c518, majeur: 0xff8a3d, critique: 0xff2860 };

const q = {
  creer: db.prepare('INSERT INTO incidents (type, titre, impact, statut, debut, fin, cree_le, maj_le) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'),
  maj: db.prepare('INSERT INTO incidents_majs (incident_id, statut, message, le) VALUES (?, ?, ?, ?)'),
  etat: db.prepare('UPDATE incidents SET statut = ?, maj_le = ?, fin = COALESCE(?, fin) WHERE id = ?'),
  lire: db.prepare('SELECT * FROM incidents WHERE id = ?'),
  majsDe: db.prepare('SELECT statut, message, le FROM incidents_majs WHERE incident_id = ? ORDER BY le DESC, id DESC'),
  actifs: db.prepare("SELECT * FROM incidents WHERE statut NOT IN ('resolu', 'terminee') ORDER BY cree_le DESC"),
  recents: db.prepare('SELECT * FROM incidents WHERE cree_le >= ? OR statut NOT IN (\'resolu\', \'terminee\') ORDER BY cree_le DESC LIMIT 30'),
  supprimer: db.prepare('DELETE FROM incidents WHERE id = ?'),
  supprimerMajs: db.prepare('DELETE FROM incidents_majs WHERE incident_id = ?'),
};

function complet(i) {
  return i ? { ...i, majs: q.majsDe.all(i.id) } : null;
}

function creer({ type, titre, message, impact = 'majeur', statut, debut = null, fin = null }) {
  if (!ETATS[type]) throw new Error('type');
  const etat = statut && ETATS[type].includes(statut) ? statut : ETATS[type][0];
  const maintenant = Date.now();
  const r = q.creer.run(type, titre, IMPACTS.includes(impact) ? impact : 'majeur', etat, debut, fin, maintenant, maintenant);
  const id = Number(r.lastInsertRowid);
  q.maj.run(id, etat, message, maintenant);
  return complet(q.lire.get(id));
}

/** Nouvelle etape. Renvoie l'incident a jour, ou null si l'etat ne convient pas. */
function mettreAJour(id, statut, message) {
  const i = q.lire.get(id);
  if (!i || !ETATS[i.type].includes(statut)) return null;
  const maintenant = Date.now();
  q.maj.run(id, statut, message, maintenant);
  q.etat.run(statut, maintenant, FINIS.includes(statut) ? maintenant : null, id);
  return complet(q.lire.get(id));
}

function supprimer(id) {
  q.supprimerMajs.run(id);
  return q.supprimer.run(id).changes > 0;
}

const actifs = () => q.actifs.all().map(complet);
const recents = (jours = 14) => q.recents.all(Date.now() - jours * 86_400_000).map(complet);
const lire = (id) => complet(q.lire.get(id));

/** L'etat global a afficher : null si tout va bien. */
function bandeau() {
  const a = actifs();
  if (!a.length) return null;
  const incidents = a.filter((i) => i.type === 'incident');
  const enCours = a.filter((i) => i.type === 'maintenance' && i.statut === 'en_cours');
  const pire = incidents.sort((x, y) => IMPACTS.indexOf(y.impact) - IMPACTS.indexOf(x.impact))[0];
  if (pire) return { niveau: pire.impact, couleur: COULEUR_IMPACT[pire.impact], liste: a };
  if (enCours.length) return { niveau: 'maintenance', couleur: 0x58a6ff, liste: a };
  return { niveau: 'prevue', couleur: null, liste: a };
}

/** Pour /api/statut : rien de prive, des textes publics. */
function pourApi() {
  const f = (i) => ({
    id: i.id, type: i.type, titre: i.titre, impact: i.impact, statut: i.statut,
    debut: i.debut, fin: i.fin, cree_le: i.cree_le, maj_le: i.maj_le,
    majs: i.majs.map((m) => ({ statut: m.statut, message: m.message, le: m.le })),
  });
  return { actifs: actifs().map(f), recents: recents(14).map(f) };
}

/* ------------------------------------------------------------- affichage */

function ligneEtat(i, t) {
  const derniere = i.majs[0];
  const tete = i.type === 'incident'
    ? `${i.impact === 'critique' ? '🔴' : i.impact === 'majeur' ? '🟠' : '🟡'} **${t(`incident.impact_${i.impact}`)}** · ${i.titre}`
    : `🛠️ **${t('incident.maintenance')}** · ${i.titre}`;
  const plage = i.type === 'maintenance' && i.debut
    ? `\n🕒 <t:${Math.floor(i.debut / 1000)}:f>${i.fin ? ` → <t:${Math.floor(i.fin / 1000)}:t>` : ''}`
    : '';
  return `${tete}${plage}\n${EMOJI[i.statut]} **${t(`incident.etat_${i.statut}`)}** — ${derniere?.message ?? ''} · <t:${Math.floor((derniere?.le ?? i.maj_le) / 1000)}:R>`;
}

/** L'annonce postee dans le salon de statut a chaque mise a jour. */
function annonce(i, t) {
  const C = require('./composants');
  const fini = FINIS.includes(i.statut);
  const couleur = fini ? 0x2fbf71 : i.type === 'maintenance' ? 0x58a6ff : COULEUR_IMPACT[i.impact];
  const historique = i.majs.slice(1, 4).map((m) => `-# ${EMOJI[m.statut]} ${t(`incident.etat_${m.statut}`)} · <t:${Math.floor(m.le / 1000)}:R> — ${m.message.slice(0, 150)}`).join('\n');
  return C.envoi([C.conteneur([
    C.texte(`## ${fini ? '✅' : i.type === 'maintenance' ? '🛠️' : '⚠️'} ${i.titre}`),
    C.texte(ligneEtat(i, t)),
    ...(historique ? [C.separateur(), C.texte(historique)] : []),
    C.texte(`-# #${i.id} · ${t('incident.suivre')}`),
  ], couleur)]);
}

module.exports = { ETATS, FINIS, IMPACTS, EMOJI, creer, mettreAJour, supprimer, actifs, recents, lire, bandeau, pourApi, ligneEtat, annonce };
