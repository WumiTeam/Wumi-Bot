const path = require('node:path');
const fs = require('node:fs');
const { loadImage } = require('@napi-rs/canvas');
const conf = require('../../config');
const { rectArrondi } = require('./canvasOutils');
const logger = require('./logger');

let cache; // l'image de fond n'est lue qu'une fois puis gardee en memoire
let dejaPrevenu = false;
const cachePerso = new Map(); // chemin -> image, pour les fonds personnels

/** Charge (et met en cache) l'image de fond definie dans config.js. */
async function chargerFond() {
  if (cache !== undefined) return cache;
  const chemin = path.join(__dirname, '..', 'assets', 'images', conf.carte.imageFond);
  if (!fs.existsSync(chemin)) {
    if (!dejaPrevenu) {
      logger.avertissement(`Image de fond introuvable (${chemin}) : les cartes utiliseront un fond uni.`);
      dejaPrevenu = true;
    }
    cache = null;
    return cache;
  }
  try {
    cache = await loadImage(chemin);
  } catch (e) {
    logger.avertissement('Image de fond illisible :', e.message);
    cache = null;
  }
  return cache;
}

/** Charge (et met en cache) un fond personnel enregistre sur le disque. */
async function chargerFondPerso(chemin) {
  if (cachePerso.has(chemin)) return cachePerso.get(chemin);
  try {
    const image = await loadImage(chemin);
    // Cache borne : au-dela, on oublie le plus ancien plutot que de gonfler
    // indefiniment la memoire sur un gros serveur.
    if (cachePerso.size > 50) cachePerso.delete(cachePerso.keys().next().value);
    cachePerso.set(chemin, image);
    return image;
  } catch (e) {
    logger.avertissement('Fond personnel illisible :', e.message);
    cachePerso.set(chemin, null);
    return null;
  }
}

/** Oublie un fond personnel du cache (apres remplacement ou suppression). */
function oublierFondPerso(chemin) {
  cachePerso.delete(chemin);
}

/**
 * Petit generateur pseudo-aleatoire reproductible : les etoiles tombent
 * toujours au meme endroit, la carte ne "scintille" pas d'un appel a l'autre.
 */
function suite(graine) {
  let n = graine;
  return () => {
    n = (n * 1103515245 + 12345) % 2147483648;
    return n / 2147483648;
  };
}

/** Sème des etoiles sur un fond sombre. */
function dessinerEtoiles(ctx, L, H) {
  const alea = suite(20260905);
  for (let i = 0; i < 90; i++) {
    const x = alea() * L;
    const y = alea() * H;
    const r = 0.6 + alea() * 1.4;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255, 255, 255, ${0.15 + alea() * 0.5})`;
    ctx.fill();
  }
}

/**
 * Dessine le fond d'une carte : image cadree facon "cover", puis voile.
 * @param {object} ctx contexte canvas
 * @param {number} L largeur de la carte
 * @param {number} H hauteur de la carte
 * @param {number} rayon rayon des coins arrondis
 * @param {number} [voile] opacite du voile (defaut : config.js)
 * @param {boolean} [miroir] retourne le decor horizontalement
 * @param {object} [theme] theme de carte (voileCouleur, degrade, etoiles)
 * @param {string} [fondPerso] chemin d'une image personnelle qui remplace le decor
 */
async function dessinerFond(ctx, L, H, rayon, voile = conf.carte.voile, miroir = false, theme = {}, fondPerso = null) {
  ctx.save();
  rectArrondi(ctx, 0, 0, L, H, rayon);
  ctx.clip();

  // Couleur de base (visible si l'image manque ou comporte de la transparence)
  ctx.fillStyle = conf.carte.fondSecondaire;
  ctx.fillRect(0, 0, L, H);

  // Themes sans decor : degrade plein, eventuellement etoile.
  if (theme.degrade) {
    const grad = ctx.createLinearGradient(0, 0, L, H);
    grad.addColorStop(0, theme.degrade[0]);
    grad.addColorStop(1, theme.degrade[1] ?? theme.degrade[0]);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, L, H);
    if (theme.etoiles) dessinerEtoiles(ctx, L, H);
    ctx.restore();
    return;
  }

  // Un fond personnel passe avant le decor commun, mais apres les degrades :
  // un theme sans decor (Minuit, Or) garde son identite.
  const image = fondPerso ? await chargerFondPerso(fondPerso) : await chargerFond();
  if (image) {
    // Cadrage "cover" : l'image couvre toute la carte sans deformation
    const ratio = Math.max(L / image.width, H / image.height);
    const l = image.width * ratio;
    const h = image.height * ratio;
    ctx.save();
    if (miroir) {
      // Retourne le decor : la roche passe a droite, la branche a gauche,
      // ce qui degage le coin superieur droit ou s'affichent rang et niveau.
      ctx.translate(L, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(image, (L - l) / 2, (H - h) / 2, l, h);
    ctx.restore();
  }

  if (voile > 0) {
    ctx.fillStyle = `rgba(${theme.voileCouleur ?? '255, 255, 255'}, ${voile})`;
    ctx.fillRect(0, 0, L, H);
  }

  ctx.restore();
}

module.exports = { dessinerFond, chargerFond, oublierFondPerso };
