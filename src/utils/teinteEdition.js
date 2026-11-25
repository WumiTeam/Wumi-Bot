/**
 * 2.40 : la DA d'une EDITION sur les images, sans toucher aux dessinateurs.
 *
 * Les cartes (rank, classement, bienvenue, economie...) ont leurs couleurs
 * ecrites en dur, aux tons chauds de Wumi. Pour une edition qui a sa propre
 * teinte (da.teinte, en degres), on intercepte les couleurs AU MOMENT ou elles
 * sont donnees au canvas (fillStyle, strokeStyle, shadowColor, degrades) et on
 * fait tourner la teinte des tons chauds (orange, ambre, brun) vers celle de
 * l'edition. Les images (avatars, photos, vignettes) passent par drawImage et
 * ne sont jamais touchees : un visage reste un visage.
 *
 * Ne fait rien pour Wumi normal.
 */
let actif = false;

function rgbVersHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return [h * 60, s, l];
}

function hslVersRgb(h, s, l) {
  h = ((h % 360) + 360) % 360 / 360;
  if (s === 0) return [l, l, l].map((v) => Math.round(v * 255));
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const f = (t) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [f(h + 1 / 3), f(h), f(h - 1 / 3)].map((v) => Math.round(v * 255));
}

/** Transforme une couleur CSS si elle est dans les tons chauds de Wumi. */
function convertir(couleur, cible) {
  if (typeof couleur !== 'string') return couleur;
  let r; let g; let b; let a = null;
  let m = /^#([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(couleur.trim());
  if (m) {
    r = parseInt(m[1].slice(0, 2), 16); g = parseInt(m[1].slice(2, 4), 16); b = parseInt(m[1].slice(4, 6), 16);
    if (m[2]) a = parseInt(m[2], 16) / 255;
  } else {
    m = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/i.exec(couleur.trim());
    if (!m) return couleur;
    [r, g, b] = [m[1], m[2], m[3]].map(Number);
    if (m[4] !== undefined) a = Number(m[4]);
  }
  const [h, s, l] = rgbVersHsl(r, g, b);
  // Tons chauds de Wumi : de l'orange-rouge au jaune ambre, un peu satures.
  if (h < 12 || h > 52 || s < 0.18) return couleur;
  const [nr, ng, nb] = hslVersRgb(cible + (h - 33) * 0.6, s * 0.72, l);
  return a === null ? `rgb(${nr}, ${ng}, ${nb})` : `rgba(${nr}, ${ng}, ${nb}, ${a})`;
}

/** A appeler une fois au demarrage d'une edition qui a da.teinte. */
function activer(cible) {
  if (actif || typeof cible !== 'number') return;
  actif = true;
  const canvas = require('@napi-rs/canvas');
  const ctx = canvas.createCanvas(1, 1).getContext('2d');
  const proto = Object.getPrototypeOf(ctx);
  for (const prop of ['fillStyle', 'strokeStyle', 'shadowColor']) {
    const d = Object.getOwnPropertyDescriptor(proto, prop);
    if (!d?.set) continue;
    Object.defineProperty(proto, prop, { ...d, set(v) { d.set.call(this, convertir(v, cible)); } });
  }
  const grad = Object.getPrototypeOf(ctx.createLinearGradient(0, 0, 1, 1));
  const ajouter = grad.addColorStop;
  grad.addColorStop = function addColorStop(o, c) { return ajouter.call(this, o, convertir(c, cible)); };
}

module.exports = { activer, convertir };
