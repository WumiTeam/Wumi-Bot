/**
 * Les emojis « tete de Wumi » (2.40) : la mascotte du logo (brun noir sur
 * tuile orange) avec une expression par emoji, pour le serveur support.
 *
 *   node outils/generer-emojis-tete.js [--planche]
 *
 * Sortie : src/assets/emojis/tete/wumi_<expression>.png (128 x 128).
 * Plus ku_wumicoin.png (la piece de Wumi, emoji d'application du bot).
 * --planche : data/planche-emojis-tete.png pour tout voir d'un coup.
 */
const fs = require('node:fs');
const path = require('node:path');
const { createCanvas } = require('@napi-rs/canvas');
const { mascotte, hauteur } = require('../src/utils/mascotte');

const T = 128;
const SORTIE = path.join(__dirname, '..', 'src', 'assets', 'emojis', 'tete');
const BRUN = '#221b10';
const ORANGE = '#ff9d1b';
const BLANC = '#ffffff';
// Couleur des petits accents hors du visage (« ? », « zz », confettis) :
// blancs sur la tuile orange, orange sur les stickers (generer-stickers.js).
const OPTIONS = { accent: BLANC };

// Geometrie de la mascotte (boite 766 x 598) : centres et rayons des yeux.
const OEIL = { g: [248, 378], d: [520, 378], rx: 80, ry: 77 };

/** Tuile orange + corps plein (yeux bouches) ; renvoie la projection. */
function base(ctx, { tuile = true } = {}) {
  if (tuile) {
    ctx.fillStyle = ORANGE;
    ctx.beginPath();
    ctx.roundRect(0, 0, T, T, T * 0.24);
    ctx.fill();
  }
  const l = T * 0.86;
  const k = l / 766;
  const x0 = (T - l) / 2;
  const y0 = (T - hauteur(l)) / 2 + T * 0.04;
  mascotte(ctx, x0, y0, l, BRUN, BRUN);
  return { k, p: (x, y) => [x0 + x * k, y0 + y * k], logo: () => mascotte(ctx, x0, y0, l, BRUN, BLANC) };
}

function ovale(ctx, [cx, cy], rx, ry, couleur) {
  ctx.fillStyle = couleur;
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
}

function trait(ctx, largeur, couleur = BLANC) {
  ctx.strokeStyle = couleur;
  ctx.lineWidth = largeur;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
}

function coeur(ctx, cx, cy, r, couleur) {
  ctx.fillStyle = couleur;
  ctx.beginPath();
  ctx.moveTo(cx, cy + r * 0.9);
  ctx.bezierCurveTo(cx - r * 1.4, cy - r * 0.1, cx - r * 0.7, cy - r * 1.2, cx, cy - r * 0.45);
  ctx.bezierCurveTo(cx + r * 0.7, cy - r * 1.2, cx + r * 1.4, cy - r * 0.1, cx, cy + r * 0.9);
  ctx.fill();
}

function etoile(ctx, cx, cy, r, couleur) {
  ctx.fillStyle = couleur;
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * 0.45 : r;
    ctx.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fill();
}

function larme(ctx, x, y, r) {
  ctx.fillStyle = '#8fd3ff';
  ctx.beginPath();
  ctx.moveTo(x, y - r * 1.6);
  ctx.quadraticCurveTo(x + r * 1.1, y, x, y + r);
  ctx.quadraticCurveTo(x - r * 1.1, y, x, y - r * 1.6);
  ctx.fill();
}

const yeux = (ctx, g, f) => { for (const c of [OEIL.g, OEIL.d]) f(g.p(...c), c === OEIL.g); };
const R = 13.5; // rayon d'un oeil a 128 px

/**
 * Un oeil blanc, avec une paupiere brune optionnelle decoupee DANS l'oeil :
 * paupiere = [hauteur cote exterieur, hauteur cote interieur] en fraction du
 * rayon, mesuree depuis le haut (0 = rien, 1 = jusqu'au milieu).
 */
function oeil(ctx, [x, y], gauche, { paupiere = null, pupille = null, r = R } = {}) {
  ovale(ctx, [x, y], r, r * 0.98, BLANC);
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(x, y, r + 0.5, r + 0.5, 0, 0, Math.PI * 2);
  ctx.clip();
  if (pupille) ovale(ctx, [x + pupille[0] * r, y + pupille[1] * r], r * 0.42, r * 0.42, BRUN);
  if (paupiere) {
    const [ext, int] = paupiere;
    const s = gauche ? -1 : 1; // cote exterieur
    ctx.fillStyle = BRUN;
    ctx.beginPath();
    ctx.moveTo(x + s * r * 1.2, y - r - 1);
    ctx.lineTo(x + s * r * 1.2, y - r + ext * r);
    ctx.lineTo(x - s * r * 1.2, y - r + int * r);
    ctx.lineTo(x - s * r * 1.2, y - r - 1);
    ctx.fill();
  }
  ctx.restore();
}

/** Les expressions. Chaque entree dessine sur une base deja posee. */
const EXPRESSIONS = {
  // les vrais yeux du logo
  wumi: (ctx, g) => g.logo(),

  joie: (ctx, g) => yeux(ctx, g, ([x, y]) => {
    trait(ctx, 9); ctx.beginPath(); ctx.arc(x, y + 6, 12, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke();
  }),

  amour: (ctx, g) => yeux(ctx, g, ([x, y]) => coeur(ctx, x, y, 16, '#ff4d6d')),

  etoiles: (ctx, g) => yeux(ctx, g, ([x, y]) => etoile(ctx, x, y, 17, '#ffd84a')),

  triste: (ctx, g) => {
    yeux(ctx, g, (c, gauche) => oeil(ctx, c, gauche, { paupiere: [1.0, 0.35], pupille: [0, 0.35] }));
    const [x, y] = g.p(...OEIL.d);
    larme(ctx, x + 8, y + 22, 6);
  },

  pleure: (ctx, g) => yeux(ctx, g, ([x, y]) => {
    trait(ctx, 8); ctx.beginPath(); ctx.arc(x, y - 4, 11, Math.PI * 0.15, Math.PI * 0.85); ctx.stroke();
    ctx.fillStyle = '#8fd3ff';
    ctx.beginPath(); ctx.roundRect(x - 5, y + 6, 10, 30, 5); ctx.fill();
  }),

  colere: (ctx, g) => yeux(ctx, g, (c, gauche) => oeil(ctx, c, gauche, { paupiere: [0.3, 1.15], pupille: [gauche ? 0.3 : -0.3, 0.3] })),

  choc: (ctx, g) => yeux(ctx, g, (c, gauche) => oeil(ctx, c, gauche, { r: R * 1.3, pupille: [0, 0] })),

  dodo: (ctx, g) => {
    yeux(ctx, g, ([x, y]) => { trait(ctx, 8); ctx.beginPath(); ctx.arc(x, y - 6, 11, Math.PI * 0.15, Math.PI * 0.85); ctx.stroke(); });
    ctx.fillStyle = OPTIONS.accent;
    ctx.font = 'bold 26px sans-serif';
    ctx.fillText('z', 96, 34);
    ctx.font = 'bold 18px sans-serif';
    ctx.fillText('z', 110, 20);
  },

  clin: (ctx, g) => yeux(ctx, g, ([x, y], gauche) => {
    if (gauche) oeil(ctx, [x, y], gauche);
    else { trait(ctx, 9); ctx.beginPath(); ctx.arc(x, y + 6, 12, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke(); }
  }),

  cool: (ctx, g) => {
    const [xg, y] = g.p(...OEIL.g);
    const [xd] = g.p(...OEIL.d);
    ctx.fillStyle = '#0d0a06';
    ctx.strokeStyle = BLANC;
    ctx.lineWidth = 3;
    for (const x of [xg, xd]) { ctx.beginPath(); ctx.roundRect(x - 21, y - 14, 42, 28, 9); ctx.fill(); ctx.stroke(); }
    ctx.beginPath(); ctx.moveTo(xg + 21, y - 6); ctx.lineTo(xd - 21, y - 6); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    for (const x of [xg, xd]) { ctx.beginPath(); ctx.ellipse(x - 9, y - 5, 6, 3, -0.5, 0, Math.PI * 2); ctx.fill(); }
  },

  reflexion: (ctx, g) => {
    yeux(ctx, g, (c, gauche) => oeil(ctx, c, gauche, { pupille: [0.35, -0.45] }));
    ctx.fillStyle = OPTIONS.accent;
    ctx.font = 'bold 34px sans-serif';
    ctx.fillText('?', 100, 36);
  },

  mdr: (ctx, g) => yeux(ctx, g, ([x, y], gauche) => {
    trait(ctx, 8);
    const s = gauche ? 1 : -1;
    ctx.beginPath(); ctx.moveTo(x - 12 * s, y - 12); ctx.lineTo(x + 10 * s, y); ctx.lineTo(x - 12 * s, y + 12); ctx.stroke();
    larme(ctx, x - 16 * s, y + 20, 5);
  }),

  louche: (ctx, g) => yeux(ctx, g, (c, gauche) => oeil(ctx, c, gauche, { paupiere: [0.95, 0.95], pupille: [0.45, 0.3] })),

  fete: (ctx, g) => {
    EXPRESSIONS.joie(ctx, g);
    const confettis = [[18, 22, OPTIONS.accent, 0.6], [108, 18, '#221b10', -0.4], [110, 46, OPTIONS.accent, 1.1], [16, 52, '#221b10', -0.9], [64, 12, OPTIONS.accent, 0.2], [40, 14, '#221b10', 1.3]];
    for (const [x, y, c, a] of confettis) { ctx.fillStyle = c; ctx.save(); ctx.translate(x, y); ctx.rotate(a); ctx.fillRect(-6, -3, 12, 6); ctx.restore(); }
  },

  salut: (ctx, g) => {
    EXPRESSIONS.joie(ctx, g);
    ctx.font = '34px "Noto Color Emoji", sans-serif';
  },

  ok: (ctx, g) => {
    EXPRESSIONS.wumi(ctx, g);
    ctx.fillStyle = '#3ddc97';
    ctx.beginPath(); ctx.arc(104, 104, 20, 0, Math.PI * 2); ctx.fill();
    trait(ctx, 6); ctx.beginPath(); ctx.moveTo(95, 104); ctx.lineTo(102, 111); ctx.lineTo(114, 97); ctx.stroke();
  },

  non: (ctx, g) => {
    EXPRESSIONS.triste(ctx, g);
    ctx.fillStyle = '#ff4d4d';
    ctx.beginPath(); ctx.arc(104, 104, 20, 0, Math.PI * 2); ctx.fill();
    trait(ctx, 6); ctx.beginPath(); ctx.moveTo(97, 97); ctx.lineTo(111, 111); ctx.moveTo(111, 97); ctx.lineTo(97, 111); ctx.stroke();
  },
};
delete EXPRESSIONS.salut;

/** La piece de Wumi : disque dore, la mascotte frappee au centre. */
function piece() {
  const c = createCanvas(T, T);
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, T, T);
  g.addColorStop(0, '#ffd36a');
  g.addColorStop(1, '#ff9d1b');
  ctx.fillStyle = '#c96f00';
  ctx.beginPath(); ctx.arc(T / 2, T / 2 + 3, T / 2 - 4, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(T / 2, T / 2, T / 2 - 5, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = 'rgba(160, 80, 0, 0.55)';
  ctx.lineWidth = 4;
  ctx.beginPath(); ctx.arc(T / 2, T / 2, T / 2 - 16, 0, Math.PI * 2); ctx.stroke();
  const l = T * 0.56;
  mascotte(ctx, (T - l) / 2, (T - hauteur(l)) / 2 + 3, l, BRUN, BLANC);
  ctx.fillStyle = 'rgba(255,255,255,0.45)';
  ctx.beginPath(); ctx.ellipse(38, 30, 14, 7, -0.7, 0, Math.PI * 2); ctx.fill();
  return c;
}

module.exports = { EXPRESSIONS, base, T, OPTIONS };
if (require.main === module) (async () => {
  fs.mkdirSync(SORTIE, { recursive: true });
  const rendus = [];
  for (const [nom, f] of Object.entries(EXPRESSIONS)) {
    const c = createCanvas(T, T);
    const ctx = c.getContext('2d');
    f(ctx, base(ctx));
    const png = await c.encode('png');
    fs.writeFileSync(path.join(SORTIE, `wumi_${nom}.png`), png);
    rendus.push([nom, c]);
  }
  const p = piece();
  fs.writeFileSync(path.join(__dirname, '..', 'src', 'assets', 'emojis', 'ku_wumicoin.png'), await p.encode('png'));
  rendus.push(['wumicoin', p]);
  console.log(`${rendus.length} emojis -> ${SORTIE} (+ ku_wumicoin.png)`);

  if (process.argv.includes('--planche')) {
    const col = 6;
    const pl = createCanvas(col * 160 + 20, Math.ceil(rendus.length / col) * 180 + 20);
    const x = pl.getContext('2d');
    x.fillStyle = '#313338';
    x.fillRect(0, 0, pl.width, pl.height);
    rendus.forEach(([nom, c], i) => {
      const cx = 20 + (i % col) * 160;
      const cy = 20 + Math.floor(i / col) * 180;
      x.drawImage(c, cx + 8, cy, 128, 128);
      x.fillStyle = '#dbdee1';
      x.font = '16px sans-serif';
      x.fillText(nom, cx + 10, cy + 150);
    });
    fs.mkdirSync(path.join(__dirname, '..', 'data'), { recursive: true });
    fs.writeFileSync(path.join(__dirname, '..', 'data', 'planche-emojis-tete.png'), await pl.encode('png'));
  }
})();
