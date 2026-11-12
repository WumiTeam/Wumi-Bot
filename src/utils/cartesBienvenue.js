/**
 * Les cartes de bienvenue PERSONNALISEES (Wumi 2.13).
 *
 * Un serveur peut creer jusqu'a 5 « designs » de carte. Chacun a :
 *   - un style de mise en page (centre, gauche, minimal) ;
 *   - une image de fond (envoyee par l'admin, recadree et gardee en local) ;
 *   - une couleur d'accent ;
 *   - un titre (« BIENVENUE ») et un sous-titre avec variables.
 *
 * A chaque arrivee, la carte est tiree au hasard parmi les designs actifs
 * (mode « aleatoire »), ou c'est toujours le meme (mode « fixe »). Sans aucun
 * design, la carte par defaut de Wumi est utilisee comme avant.
 */
const fs = require('node:fs');
const path = require('node:path');
const { createCanvas, loadImage } = require('@napi-rs/canvas');
const { db, config } = require('../database/db');
const logger = require('./logger');

db.exec(`
CREATE TABLE IF NOT EXISTS bienvenue_cartes (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  nom      TEXT NOT NULL,
  style    TEXT NOT NULL DEFAULT 'centre',
  fond     TEXT,
  couleur  TEXT,
  titre    TEXT,
  sous     TEXT,
  actif    INTEGER NOT NULL DEFAULT 1,
  cree_le  INTEGER NOT NULL,
  UNIQUE (guild_id, nom)
);
`);

const q = {
  liste: db.prepare('SELECT * FROM bienvenue_cartes WHERE guild_id = ? ORDER BY id'),
  actives: db.prepare('SELECT * FROM bienvenue_cartes WHERE guild_id = ? AND actif = 1 ORDER BY id'),
  parNom: db.prepare('SELECT * FROM bienvenue_cartes WHERE guild_id = ? AND nom = ?'),
  creer: db.prepare('INSERT INTO bienvenue_cartes (guild_id, nom, style, couleur, titre, sous, cree_le) VALUES (?, ?, ?, ?, ?, ?, ?)'),
  maj: db.prepare('UPDATE bienvenue_cartes SET style = ?, couleur = ?, titre = ?, sous = ?, actif = ?, fond = ? WHERE id = ?'),
  supprimer: db.prepare('DELETE FROM bienvenue_cartes WHERE id = ?'),
  compter: db.prepare('SELECT COUNT(*) AS n FROM bienvenue_cartes WHERE guild_id = ?'),
};

const MAX = 5;
const STYLES = ['centre', 'gauche', 'minimal'];
const TAILLE_MAX = 8 * 1024 * 1024;
const TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
const LARGEUR = 1000;
const HAUTEUR = 400;

function dossier() {
  const base = path.join(path.dirname(require('../database/db').cheminDb), 'fonds');
  fs.mkdirSync(base, { recursive: true });
  return base;
}
const cheminFond = (fichier) => (fichier ? path.join(dossier(), fichier) : null);

/** Couleur #rrggbb, ou undefined si invalide (null = pas de couleur). */
function couleur(texte) {
  if (!texte) return null;
  const m = String(texte).trim().replace(/^#/, '').match(/^[0-9a-f]{6}$/i);
  return m ? `#${m[0].toLowerCase()}` : undefined;
}

/**
 * Telecharge, recadre (1000 x 400) et enregistre le fond d'un design.
 * @returns {Promise<{ok: true, fichier: string} | {ok: false, raison: string}>}
 */
async function enregistrerFond(guildId, id, piece) {
  if (piece.size > TAILLE_MAX) return { ok: false, raison: 'trop_lourd' };
  const type = (piece.contentType ?? '').split(';')[0].trim();
  if (type && !TYPES.includes(type)) return { ok: false, raison: 'format' };
  let image;
  try {
    const reponse = await fetch(piece.url, { signal: AbortSignal.timeout(20_000) });
    if (!reponse.ok) throw new Error(String(reponse.status));
    const octets = Buffer.from(await reponse.arrayBuffer());
    if (octets.length > TAILLE_MAX) throw new Error('trop lourd');
    image = await loadImage(octets);
  } catch (e) {
    logger.avertissement('Fond de bienvenue :', e.message);
    return { ok: false, raison: 'illisible' };
  }
  const canvas = createCanvas(LARGEUR, HAUTEUR);
  const ctx = canvas.getContext('2d');
  const ratio = Math.max(LARGEUR / image.width, HAUTEUR / image.height);
  ctx.drawImage(image, (LARGEUR - image.width * ratio) / 2, (HAUTEUR - image.height * ratio) / 2, image.width * ratio, image.height * ratio);
  // Nom unique a chaque envoi : le cache d'images ne garde jamais l'ancien fond.
  const fichier = `bienvenue-${guildId}-${id}-${Date.now().toString(36)}.png`;
  fs.writeFileSync(path.join(dossier(), fichier), await canvas.encode('png'));
  return { ok: true, fichier };
}

function effacerFond(fichier) {
  if (!fichier) return;
  try { fs.rmSync(path.join(dossier(), fichier), { force: true }); } catch { /* deja absent */ }
}

/** Le design a utiliser pour une arrivee, ou null (carte par defaut). */
function choisir(guildId) {
  const actives = q.actives.all(guildId);
  if (!actives.length) return null;
  let cfg;
  try { cfg = config(guildId); } catch { cfg = {}; }
  if (cfg.bienvenue_carte_fixe) {
    const fixe = actives.find((c) => c.id === cfg.bienvenue_carte_fixe);
    if (fixe) return fixe;
  }
  return actives[Math.floor(Math.random() * actives.length)];
}

/** Le design tel que le dessin l'attend (chemin du fond resolu). */
function pourDessin(design) {
  if (!design) return null;
  const fond = cheminFond(design.fond);
  return {
    style: STYLES.includes(design.style) ? design.style : 'centre',
    fond: fond && fs.existsSync(fond) ? fond : null,
    couleur: design.couleur,
    titre: design.titre,
    sous: design.sous,
  };
}

module.exports = { q, MAX, STYLES, couleur, enregistrerFond, effacerFond, choisir, pourDessin };
