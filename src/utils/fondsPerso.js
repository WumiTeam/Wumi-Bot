/**
 * Fonds de carte personnels.
 *
 * L'image envoyee par le membre est telechargee UNE fois, redimensionnee et
 * enregistree en local. On ne garde jamais l'adresse d'origine : les liens
 * Discord expirent, et refaire une requete vers l'exterieur a chaque /rank
 * serait lent et fragile.
 */
const fs = require('node:fs');
const path = require('node:path');
const { createCanvas, loadImage } = require('@napi-rs/canvas');
const { req, config } = require('../database/db');
const logger = require('./logger');

const TAILLE_MAX = 8 * 1024 * 1024; // 8 Mo a l'envoi
const LARGEUR = 1500;
const HAUTEUR = 500;
const TYPES = ['image/png', 'image/jpeg', 'image/webp'];

function dossier() {
  const base = path.join(path.dirname(require('../database/db').cheminDb), 'fonds');
  fs.mkdirSync(base, { recursive: true });
  return base;
}

function chemin(guildId, userId) {
  return path.join(dossier(), `${guildId}-${userId}.png`);
}

/** Le systeme est-il ouvert sur ce serveur ? */
function actif(guildId) {
  try {
    return Boolean(config(guildId).fond_perso_actif);
  } catch {
    return false;
  }
}

/**
 * Telecharge et enregistre le fond d'un membre.
 * @param {object} piece piece jointe Discord (name, url, size, contentType)
 */
async function enregistrer(guildId, userId, piece) {
  if (!piece) return { ok: false, raison: 'Aucune image fournie.' };
  if (piece.size > TAILLE_MAX) {
    return { ok: false, raison: `Image trop lourde (${Math.round(piece.size / 1048576)} Mo). Maximum 8 Mo.` };
  }
  const type = (piece.contentType ?? '').split(';')[0].trim();
  if (type && !TYPES.includes(type)) {
    return { ok: false, raison: 'Format non reconnu. Envoie une image PNG, JPEG ou WebP.' };
  }

  let image;
  try {
    const reponse = await fetch(piece.url, { signal: AbortSignal.timeout(20_000) });
    if (!reponse.ok) throw new Error(`telechargement impossible (${reponse.status})`);
    const octets = Buffer.from(await reponse.arrayBuffer());
    if (octets.length > TAILLE_MAX) throw new Error('image trop lourde');
    image = await loadImage(octets);
  } catch (e) {
    return { ok: false, raison: `Image illisible : ${e.message}` };
  }

  // Recadrage "cover" : on remplit le format des cartes sans deformer.
  const canvas = createCanvas(LARGEUR, HAUTEUR);
  const ctx = canvas.getContext('2d');
  const ratio = Math.max(LARGEUR / image.width, HAUTEUR / image.height);
  const l = image.width * ratio;
  const h = image.height * ratio;
  ctx.drawImage(image, (LARGEUR - l) / 2, (HAUTEUR - h) / 2, l, h);

  try {
    const png = await canvas.encode('png');
    fs.writeFileSync(chemin(guildId, userId), png);
    req.definirFondPerso.run(guildId, userId, `${guildId}-${userId}.png`, Date.now());
    return { ok: true, octets: png.length };
  } catch (e) {
    logger.erreur('Fond personnel :', e.message);
    return { ok: false, raison: "Impossible d'enregistrer l'image." };
  }
}

/** Retire le fond personnel d'un membre. */
function retirer(guildId, userId) {
  req.retirerFondPerso.run(guildId, userId);
  try {
    fs.rmSync(chemin(guildId, userId), { force: true });
  } catch {
    /* fichier deja absent */
  }
}

/** Chemin du fond personnel d'un membre, ou null. */
function fondDe(guildId, userId) {
  if (!actif(guildId)) return null;
  const ligne = req.fondPersoDe.get(guildId, userId);
  if (!ligne) return null;
  const complet = chemin(guildId, userId);
  return fs.existsSync(complet) ? complet : null;
}

module.exports = { enregistrer, retirer, fondDe, actif, dossier, LARGEUR, HAUTEUR };
