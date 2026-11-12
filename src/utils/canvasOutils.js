/** Fonctions de dessin reutilisables pour les cartes (rank, bienvenue). */

/** Rectangle a coins arrondis. */
function rectArrondi(ctx, x, y, largeur, hauteur, rayon) {
  const r = Math.min(rayon, largeur / 2, hauteur / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + largeur - r, y);
  ctx.quadraticCurveTo(x + largeur, y, x + largeur, y + r);
  ctx.lineTo(x + largeur, y + hauteur - r);
  ctx.quadraticCurveTo(x + largeur, y + hauteur, x + largeur - r, y + hauteur);
  ctx.lineTo(x + r, y + hauteur);
  ctx.quadraticCurveTo(x, y + hauteur, x, y + hauteur - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

/** Dessine une image en cercle. */
function cercleImage(ctx, image, x, y, taille) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(x + taille / 2, y + taille / 2, taille / 2, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();
  ctx.drawImage(image, x, y, taille, taille);
  ctx.restore();
}

/** Tronque un texte pour qu'il tienne dans une largeur donnee. */
function tronquerTexte(ctx, texte, largeurMax) {
  if (ctx.measureText(texte).width <= largeurMax) return texte;
  let coupe = texte;
  while (coupe.length > 1 && ctx.measureText(`${coupe}…`).width > largeurMax) {
    coupe = coupe.slice(0, -1);
  }
  return `${coupe}…`;
}

/** Convertit une couleur decimale Discord (0x5865f2) en "#rrggbb". */
function hex(decimal) {
  return `#${decimal.toString(16).padStart(6, '0')}`;
}

/** Eclaircit une couleur hex d'un facteur (0-1). */
function eclaircir(couleurHex, facteur) {
  const n = parseInt(couleurHex.replace('#', ''), 16);
  const r = Math.min(255, Math.round(((n >> 16) & 255) + 255 * facteur));
  const g = Math.min(255, Math.round(((n >> 8) & 255) + 255 * facteur));
  const b = Math.min(255, Math.round((n & 255) + 255 * facteur));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

/** Assombrit une couleur hex d'un facteur (0-1). */
function assombrir(couleurHex, facteur) {
  const n = parseInt(couleurHex.replace('#', ''), 16);
  const r = Math.max(0, Math.round(((n >> 16) & 255) * (1 - facteur)));
  const g = Math.max(0, Math.round(((n >> 8) & 255) * (1 - facteur)));
  const b = Math.max(0, Math.round((n & 255) * (1 - facteur)));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

/** Luminosite percue d'une couleur hex (0 = noir, 1 = blanc). */
function luminosite(couleurHex) {
  const n = parseInt(couleurHex.replace('#', ''), 16);
  return (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
}

module.exports = { rectArrondi, cercleImage, tronquerTexte, hex, eclaircir, assombrir, luminosite };
