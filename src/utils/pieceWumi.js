/**
 * La piece de Wumi Run, redessinee en vecteur.
 *
 * C'est la meme piece d'or que celle qu'on ramasse dans le jeu (coin_gold du
 * pack Kenney) : hexagone pointe en haut, contour sombre, or chaud, hexagone
 * interieur plus fonce et barre claire au centre. Le sprite d'origine ne fait
 * que 38 px ; le redessiner permet de l'afficher net a n'importe quelle taille
 * sur les cartes (profil, classement de l'economie) et dans l'emoji du bot.
 *
 * Voir outils/generer-piece.js pour regenerer src/assets/emojis/bp_wumicoin.png.
 */
const COUL = {
  contour: '#32323f',
  or: '#efa828',
  orClair: '#f4b128',
  orFonce: '#e39027',
  creux: '#d2811b',
  creuxFonce: '#c67118',
  barre: '#f8bd2c',
};

/** Hexagone pointe en haut, coins arrondis. */
function hexagone(ctx, cx, cy, r, arrondi) {
  const pts = [];
  for (let i = 0; i < 6; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 3;
    pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[(i + 1) % 6];
    const mx = (x1 + x2) / 2;
    const my = (y1 + y2) / 2;
    if (i === 0) ctx.moveTo(mx, my);
    ctx.arcTo(x2, y2, (x2 + pts[(i + 2) % 6][0]) / 2, (y2 + pts[(i + 2) % 6][1]) / 2, arrondi);
  }
  ctx.closePath();
}

/**
 * Dessine la piece dans le carre (x, y, taille).
 * @param {CanvasRenderingContext2D} ctx
 */
function dessinerPiece(ctx, x, y, taille) {
  const cx = x + taille / 2;
  const cy = y + taille / 2;
  const R = taille / 2;
  ctx.save();
  // Le sprite est un hexagone un peu elargi (38 x 40 px) : on etire en largeur.
  ctx.translate(cx, cy);
  ctx.scale(1.1, 1);
  ctx.translate(-cx, -cy);

  // Contour sombre
  hexagone(ctx, cx, cy, R, R * 0.22);
  ctx.fillStyle = COUL.contour;
  ctx.fill();

  // Corps en or, un peu plus clair en haut
  const rc = R * 0.84;
  hexagone(ctx, cx, cy, rc, R * 0.14);
  const g = ctx.createLinearGradient(0, cy - rc, 0, cy + rc);
  g.addColorStop(0, COUL.orClair);
  g.addColorStop(0.55, COUL.or);
  g.addColorStop(1, COUL.orFonce);
  ctx.fillStyle = g;
  ctx.fill();

  // Hexagone en creux, plus fonce en haut (l'ombre du rebord)
  const ri = R * 0.48;
  hexagone(ctx, cx, cy + R * 0.02, ri, R * 0.08);
  const gi = ctx.createLinearGradient(0, cy - ri, 0, cy + ri);
  gi.addColorStop(0, COUL.creuxFonce);
  gi.addColorStop(0.5, COUL.creux);
  gi.addColorStop(1, COUL.orFonce);
  ctx.fillStyle = gi;
  ctx.fill();

  // Barre claire au centre
  const lb = R * 0.17;
  const hb = R * 0.5;
  const xb = cx - lb / 2;
  const yb = cy - hb / 2 + R * 0.03;
  const rb = lb / 2.4;
  ctx.beginPath();
  ctx.moveTo(xb + rb, yb);
  ctx.arcTo(xb + lb, yb, xb + lb, yb + hb, rb);
  ctx.arcTo(xb + lb, yb + hb, xb, yb + hb, rb);
  ctx.arcTo(xb, yb + hb, xb, yb, rb);
  ctx.arcTo(xb, yb, xb + lb, yb, rb);
  ctx.closePath();
  ctx.fillStyle = COUL.barre;
  ctx.fill();

  ctx.restore();
}

module.exports = { dessinerPiece, COUL_PIECE: COUL };
