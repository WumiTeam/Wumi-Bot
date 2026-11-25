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
 * 3.0.3 : la piece de la nouvelle DA (comme l'emoji ku_wumicoin) — disque
 * dore, tranche orange foncee, la mascotte brun noir aux yeux blancs frappee
 * au centre. L'ancienne piece hexagonale de Wumi Run est retiree des cartes.
 * @param {CanvasRenderingContext2D} ctx
 */
function dessinerPiece(ctx, x, y, taille) {
  const { mascotte, hauteur } = require('./mascotte');
  const T = taille;
  const cx = x + T / 2;
  const cy = y + T / 2;
  const R = T / 2;
  ctx.save();
  // tranche
  ctx.fillStyle = '#c96f00';
  ctx.beginPath(); ctx.arc(cx, cy + R * 0.05, R * 0.97, 0, Math.PI * 2); ctx.fill();
  // face
  const g = ctx.createLinearGradient(x, y, x + T, y + T);
  g.addColorStop(0, '#ffd36a');
  g.addColorStop(1, '#ff9d1b');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(cx, cy, R * 0.95, 0, Math.PI * 2); ctx.fill();
  // cercle grave
  ctx.strokeStyle = 'rgba(160, 80, 0, 0.55)';
  ctx.lineWidth = Math.max(1, T * 0.035);
  ctx.beginPath(); ctx.arc(cx, cy, R * 0.76, 0, Math.PI * 2); ctx.stroke();
  // mascotte
  const l = T * 0.56;
  mascotte(ctx, cx - l / 2, cy - hauteur(l) / 2 + T * 0.02, l, '#221b10', '#ffffff');
  // reflet
  ctx.fillStyle = 'rgba(255,255,255,0.45)';
  ctx.beginPath(); ctx.ellipse(x + T * 0.3, y + T * 0.23, T * 0.11, T * 0.055, -0.7, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

module.exports = { dessinerPiece, COUL_PIECE: COUL };
