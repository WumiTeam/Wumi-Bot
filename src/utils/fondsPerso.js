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
  const r = await enregistrerVers(chemin(guildId, userId), piece, require('./langues').langueDe(guildId));
  if (r.ok) req.definirFondPerso.run(guildId, userId, `${guildId}-${userId}.png`, Date.now());
  return r;
}

/** Telecharge une image, la recadre au format des cartes et l'ecrit dans `destination`. */
async function enregistrerVers(destination, piece, langue = 'fr') {
  // 2.24 : la raison d'un refus est dans la langue du serveur.
  const t = (cle, v) => require('./langues').t(`fond.${cle}`, langue, v);
  if (!piece) return { ok: false, raison: t('aucune') };
  if (piece.size > TAILLE_MAX) {
    return { ok: false, raison: t('trop_lourde', { n: Math.round(piece.size / 1048576) }) };
  }
  const type = (piece.contentType ?? '').split(';')[0].trim();
  if (type && !TYPES.includes(type)) {
    return { ok: false, raison: t('format') };
  }

  let octets;
  try {
    // 2.24 : `piece.octets` (image deja en memoire, envoyee par le tableau de
    // bord) ou `piece.url` (piece jointe Discord).
    if (piece.octets) octets = piece.octets;
    else {
      const reponse = await fetch(piece.url, { signal: AbortSignal.timeout(20_000) });
      if (!reponse.ok) throw new Error(`telechargement impossible (${reponse.status})`);
      octets = Buffer.from(await reponse.arrayBuffer());
    }
  } catch (e) {
    return { ok: false, raison: t('illisible', { erreur: e.message }) };
  }
  return enregistrerOctets(destination, octets, langue);
}

/** Recadre et enregistre une image deja telechargee. */
async function enregistrerOctets(destination, octets, langue = 'fr') {
  const t = (cle, v) => require('./langues').t(`fond.${cle}`, langue, v);
  if (octets.length > TAILLE_MAX) return { ok: false, raison: t('trop_lourde', { n: Math.round(octets.length / 1048576) }) };
  let image;
  try {
    image = await loadImage(octets);
  } catch (e) {
    return { ok: false, raison: t('illisible', { erreur: e.message }) };
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
    fs.writeFileSync(destination, png);
    try { require('./fondCarte').oublierFondPerso(destination); } catch { /* pas en cache */ }
    return { ok: true, octets: png.length };
  } catch (e) {
    logger.erreur('Fond personnel :', e.message);
    return { ok: false, raison: t('echec') };
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

/**
 * Chemin du fond a utiliser pour la carte d'un membre, ou null :
 * son fond personnel s'il en a un (et que le serveur l'autorise), sinon le
 * fond du serveur s'il est premium (Wumi 2.22).
 */
function fondDe(guildId, userId) {
  if (actif(guildId)) {
    const ligne = req.fondPersoDe.get(guildId, userId);
    const complet = chemin(guildId, userId);
    if (ligne && fs.existsSync(complet)) return complet;
  }
  return fondServeur(guildId);
}

// ------------------------------------------------ FOND DU SERVEUR (PREMIUM)
/**
 * Un serveur premium peut poser UN fond pour les cartes de tous ses membres
 * (rang, profil, montee de niveau). Le fichier reste sur le disque si le
 * premium s'arrete, mais il n'est plus utilise : il revient tout seul si le
 * premium reprend.
 */
const cheminServeur = (guildId) => path.join(dossier(), `serveur-${guildId}.png`);

function fondServeur(guildId) {
  try {
    if (!require('./premium').estPremium(guildId)) return null;
  } catch {
    return null;
  }
  const f = cheminServeur(guildId);
  return fs.existsSync(f) ? f : null;
}

/** Fond du serveur depuis des octets (tableau de bord, 2.24). */
async function enregistrerServeurOctets(guildId, octets) {
  return enregistrerOctets(cheminServeur(guildId), octets, require('./langues').langueDe(guildId));
}

async function enregistrerServeur(guildId, piece) {
  return enregistrerVers(cheminServeur(guildId), piece, require('./langues').langueDe(guildId));
}

function retirerServeur(guildId) {
  const f = cheminServeur(guildId);
  try { fs.rmSync(f, { force: true }); } catch { /* deja absent */ }
  try { require('./fondCarte').oublierFondPerso(f); } catch { /* pas en cache */ }
}

module.exports = { enregistrer, retirer, fondDe, actif, dossier, LARGEUR, HAUTEUR, fondServeur, enregistrerServeur, enregistrerServeurOctets, retirerServeur, cheminServeur };
