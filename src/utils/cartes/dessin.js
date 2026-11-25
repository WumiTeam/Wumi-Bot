/**
 * Wumi 2.34 · LE DESSIN DES CARTES, DU BOOSTER ET DU CLASSEUR.
 *
 * Tout est dessine par @napi-rs/canvas ; l'illustration de chaque creature
 * vient de creatures.js (SVG), le reste (cadre, textes, effets) est trace ici.
 */
const { createCanvas, loadImage, Path2D } = require('@napi-rs/canvas');
const { chargerPolices } = require('../polices');
const { svg, ELEMENTS } = require('./creatures');

const W = 600;
const H = 870;

const RARETES = {
  commune: { etoiles: 1, cadre: ['#d9dce8', '#8d93ad'], texte: '#5b6080' },
  peu_commune: { etoiles: 2, cadre: ['#9ff0b5', '#2f9e5b'], texte: '#1f6b3d' },
  rare: { etoiles: 3, cadre: ['#8fd3ff', '#2a6fd6'], texte: '#1d4f9e' },
  epique: { etoiles: 4, cadre: ['#e0a8ff', '#7b3fd6'], texte: '#5a2aa8' },
  legendaire: { etoiles: 5, cadre: ['#ffe27a', '#ff9d2e'], texte: '#a06a00' },
  mythique: { etoiles: 6, cadre: ['#ff8fd1', '#8f6bff'], texte: '#ff8fd1', arcEnCiel: true },
};

// Petits symboles d'element (traces, pas d'emoji : rendu identique partout).
function symbole(ctx, element, x, y, r) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(r / 20, r / 20);
  ctx.fillStyle = '#fff';
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 3;
  ctx.lineJoin = 'round';
  const p = new Path2D({
    pixel: 'M-14 -14 H-2 V-2 H-14Z M2 -14 H14 V-2 H2Z M-14 2 H-2 V14 H-14Z M2 2 H14 V14 H2Z',
    nuage: 'M-12 10 C-19 10 -19 0 -12 -1 C-12 -10 0 -13 4 -6 C10 -10 17 -4 14 2 C19 3 18 10 13 10Z',
    glitch: 'M-15 -4 H-5 V-12 H5 V-4 H15 V4 H5 V12 H-5 V4 H-15Z',
    neon: 'M3 -17 L-10 3 L-1 3 L-4 17 L10 -4 L1 -4Z',
    nuit: 'M5 -15 C-6 -13 -13 -3 -11 7 C-9 15 2 18 10 13 C1 12 -5 4 -3 -5 C-2 -10 1 -13 5 -15Z',
    cosmos: 'M0 -16 L4 -5 L16 -5 L6 2 L10 14 L0 7 L-10 14 L-6 2 L-16 -5 L-4 -5Z',
    volcans: 'M-17 13 L-6 -9 L-2 -5 L2 -5 L6 -9 L17 13Z',
    eaux: 'M0 -16 C7 -6 11 0 11 6 C11 13 6 16 0 16 C-6 16 -11 13 -11 6 C-11 0 -7 -6 0 -16Z',
    monuments: 'M-12 14 V-6 H-8 V-13 H-4 V-6 H-2 V-13 H2 V-6 H4 V-13 H8 V-6 H12 V14 H3 V6 A3 3 0 0 0 -3 6 V14Z',
    terroir: 'M-15 10 L15 10 L15 -1 L-15 -11Z',
    nature: 'M-10 12 C-14 -4 -4 -14 13 -14 C13 4 4 14 -10 12Z',
    aventure: 'M-15 12 L0 -14 L15 12 H4 L0 4 L-4 12Z',
  }[element]);
  ctx.fill(p);
  ctx.restore();
}

function arrondi(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

function etoile(ctx, cx, cy, r, plein) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * 0.45 : r;
    ctx.lineTo(cx + rr * Math.cos(a), cy + rr * Math.sin(a));
  }
  ctx.closePath();
  ctx.fillStyle = plein ? '#ffd34d' : 'rgba(255,255,255,0.18)';
  ctx.fill();
  if (plein) { ctx.lineWidth = 2.5; ctx.strokeStyle = '#2a2547'; ctx.stroke(); }
}

function lignes(ctx, texte, largeur) {
  const mots = texte.split(' ');
  const res = [];
  let l = '';
  for (const m of mots) {
    const essai = l ? `${l} ${m}` : m;
    if (ctx.measureText(essai).width > largeur && l) { res.push(l); l = m; } else l = essai;
  }
  if (l) res.push(l);
  return res;
}

/** Decor de fond de l'illustration, selon l'element. */
function decor(ctx, element, x, y, w, h, graine) {
  let s = graine;
  const alea = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  ctx.save();
  arrondi(ctx, x, y, w, h, 22);
  ctx.clip();
  const e = ELEMENTS[element];
  const g = ctx.createLinearGradient(x, y, x, y + h);
  g.addColorStop(0, e.fond[0]);
  g.addColorStop(1, e.fond[1]);
  ctx.fillStyle = g;
  ctx.fillRect(x, y, w, h);
  // rayons doux
  ctx.globalAlpha = 0.12;
  ctx.fillStyle = '#fff';
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(x + w / 2, y + h * 0.55);
    ctx.lineTo(x + w / 2 + Math.cos(a) * 600, y + h * 0.55 + Math.sin(a) * 600);
    ctx.lineTo(x + w / 2 + Math.cos(a + 0.18) * 600, y + h * 0.55 + Math.sin(a + 0.18) * 600);
    ctx.fill();
  }
  // petites formes
  ctx.globalAlpha = 0.25;
  for (let i = 0; i < 14; i++) {
    const px = x + alea() * w;
    const py = y + alea() * h;
    const r = 4 + alea() * 10;
    if (element === 'cosmos' || element === 'nuit') { etoile(ctx, px, py, r, false); continue; }
    ctx.beginPath();
    ctx.arc(px, py, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** Reflet arc-en-ciel des legendaires et des cartes brillantes. */
function holo(ctx, x, y, w, h, force) {
  ctx.save();
  arrondi(ctx, x, y, w, h, 26);
  ctx.clip();
  ctx.globalCompositeOperation = 'overlay';
  ctx.globalAlpha = force;
  const g = ctx.createLinearGradient(x, y, x + w, y + h);
  ['#ff5f6d', '#ffc371', '#fff95b', '#5bff9d', '#5bc8ff', '#a45bff', '#ff5fd2'].forEach((c, i, t) => g.addColorStop(i / (t.length - 1), c));
  ctx.fillStyle = g;
  ctx.fillRect(x, y, w, h);
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = force * 0.9;
  for (let i = 0; i < 5; i++) {
    const b = ctx.createLinearGradient(x + i * 150 - 100, y, x + i * 150 + 40, y + h);
    b.addColorStop(0, 'rgba(255,255,255,0)');
    b.addColorStop(0.5, 'rgba(255,255,255,0.5)');
    b.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = b;
    ctx.fillRect(x, y, w, h);
  }
  ctx.restore();
}

/** Petite etincelle a quatre branches. */
function etincelle(ctx, x, y, r, alpha = 0.9, couleur = null) {
  ctx.save();
  ctx.globalAlpha = alpha;
  if (couleur) ctx.fillStyle = couleur;
  ctx.beginPath();
  ctx.moveTo(x, y - r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.quadraticCurveTo(x, y, x, y + r);
  ctx.quadraticCurveTo(x, y, x - r, y);
  ctx.quadraticCurveTo(x, y, x, y - r);
  ctx.fill();
  ctx.restore();
}

/** Texte espace (lettres ecartees), facon numero de serie. */
function espace(ctx, texte, x, y, ecart, alignDroite = false) {
  const larg = [...texte].reduce((a, ch) => a + ctx.measureText(ch).width + ecart, -ecart);
  let cx = alignDroite ? x - larg : x;
  for (const ch of texte) { ctx.fillText(ch, cx, y); cx += ctx.measureText(ch).width + ecart; }
  return larg;
}

function degradeRarete(ctx, r, x0, y0, x1, y1) {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  if (r.arcEnCiel) {
    ['#ff5f6d', '#ffc371', '#fff95b', '#5bff9d', '#5bc8ff', '#a45bff', '#ff5fd2'].forEach((c, i, t) => g.addColorStop(i / (t.length - 1), c));
  } else {
    g.addColorStop(0, r.cadre[0]);
    g.addColorStop(1, r.cadre[1]);
  }
  return g;
}

/** Hexagone pointe en haut (la forme de la piece Wumi). */
function hexa(ctx, cx, cy, r) {
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 3;
    ctx.lineTo(cx + r * Math.cos(a), cy + r * Math.sin(a));
  }
  ctx.closePath();
}

/** Motif de fond propre a chaque famille. */
function motif(ctx, element, x, y, w, h) {
  ctx.save();
  ctx.globalAlpha = 0.16;
  ctx.strokeStyle = '#ffffff';
  ctx.fillStyle = '#ffffff';
  ctx.lineWidth = 6;
  if (element === 'pixel') {
    for (let i = 0; i < 40; i++) ctx.fillRect(x + ((i * 83) % w), y + ((i * 47) % h), 22, 22);
  } else if (element === 'nuage') {
    for (let k = 1; k < 7; k++) { ctx.beginPath(); ctx.arc(x + w / 2, y + h + 40, k * 70, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke(); }
  } else if (element === 'glitch') {
    for (let i = 0; i < 14; i++) ctx.fillRect(x, y + ((i * 61) % h), ((i * 137) % w) + 60, 8 + (i % 3) * 6);
  } else if (element === 'neon') {
    ctx.lineWidth = 4;
    for (let i = -h; i < w; i += 46) { ctx.beginPath(); ctx.moveTo(x + i, y + h); ctx.lineTo(x + i + h, y); ctx.stroke(); }
  } else {
    for (let i = 0; i < 26; i++) etincelle(ctx, x + ((i * 97) % w), y + ((i * 59) % h), 4 + (i % 4) * 4, 0.9, '#ffffff');
  }
  ctx.restore();
}

function barre(ctx, x, y, w, libelle, valeur, couleur) {
  ctx.font = '19px "Poppins Bold"';
  ctx.fillStyle = '#6b6890';
  espace(ctx, libelle, x, y, 1.5);
  ctx.textAlign = 'right';
  ctx.fillStyle = '#1b1838';
  ctx.font = '22px "Poppins Bold"';
  ctx.fillText(String(valeur), x + w, y);
  ctx.textAlign = 'left';
  arrondi(ctx, x, y + 18, w, 14, 7);
  ctx.fillStyle = '#e6e4f5';
  ctx.fill();
  arrondi(ctx, x, y + 18, Math.max(14, (w * valeur) / 100), 14, 7);
  ctx.fillStyle = couleur;
  ctx.fill();
}

/**
 * Une carte. `c` = { numero, nom, element, rarete, texte, puissance, eclat, ...pieces }.
 * opts : { total, brillante, nomElement, nomRarete, nomSerie, libelles: [puissance, eclat] }
 *
 * Le style Wumi : illustration plein cadre en haut, une feuille claire qui
 * remonte dessus en bas, des hexagones (la piece Wumi) pour la rarete et le
 * numero, et des jauges pour les stats.
 */
async function carte(c, opts = {}) {
  chargerPolices();
  const r = RARETES[c.rarete];
  const e = ELEMENTS[c.element];
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');
  const B = 16; // epaisseur du bord

  // Bord de rarete (plein, ou arc-en-ciel)
  arrondi(ctx, 0, 0, W, H, 44);
  ctx.fillStyle = degradeRarete(ctx, r, 0, 0, W, H);
  ctx.fill();

  ctx.save();
  arrondi(ctx, B, B, W - 2 * B, H - 2 * B, 32);
  ctx.clip();

  // Illustration plein cadre
  const ih = 560;
  const g = ctx.createLinearGradient(0, B, W, ih);
  g.addColorStop(0, e.fond[0]);
  g.addColorStop(1, e.fond[1]);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, ih + 60);
  motif(ctx, c.element, B, B, W - 2 * B, ih);
  const halo = ctx.createRadialGradient(W / 2, 330, 10, W / 2, 330, 260);
  halo.addColorStop(0, 'rgba(255,255,255,0.45)');
  halo.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = halo;
  ctx.fillRect(0, 0, W, ih);
  if (c.scene) {
    // Edition « lieux » : un paysage dessine plein cadre a la place de la creature.
    const paysage = await loadImage(Buffer.from(require('./auvergne/scenes').scene(c.scene, c.numero)));
    ctx.drawImage(paysage, B, B, W - 2 * B, ih);
  } else {
    const art = await loadImage(Buffer.from(svg(c)));
    ctx.drawImage(art, W / 2 - 250, 95, 500, 500);
  }

  // Feuille claire, bord superieur en vague douce
  const fy = 540;
  ctx.beginPath();
  ctx.moveTo(0, fy + 30);
  ctx.bezierCurveTo(W * 0.25, fy - 10, W * 0.55, fy + 40, W, fy);
  ctx.lineTo(W, H);
  ctx.lineTo(0, H);
  ctx.closePath();
  ctx.fillStyle = '#fbfaff';
  ctx.fill();
  ctx.restore();

  // Liseré interieur blanc
  arrondi(ctx, B + 6, B + 6, W - 2 * B - 12, H - 2 * B - 12, 28);
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(255,255,255,0.55)';
  ctx.stroke();

  // Rarete : hexagones en haut a gauche
  const total = Math.max(5, r.etoiles);
  for (let i = 0; i < total; i++) {
    hexa(ctx, 58 + i * 34, 62, 14);
    ctx.fillStyle = i < r.etoiles ? '#ffffff' : 'rgba(255,255,255,0.25)';
    ctx.fill();
    if (i < r.etoiles) { ctx.lineWidth = 3; ctx.strokeStyle = r.cadre[1]; ctx.stroke(); }
  }
  // Numero dans un grand hexagone en haut a droite
  hexa(ctx, W - 72, 72, 40);
  ctx.fillStyle = 'rgba(27,24,56,0.78)';
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = r.cadre[0];
  ctx.stroke();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffffff';
  ctx.font = '13px "Poppins Bold"';
  ctx.fillText('N°', W - 72, 56);
  ctx.font = '24px "Poppins Bold"';
  ctx.fillText(String(c.numero).padStart(2, '0'), W - 72, 80);
  ctx.textAlign = 'left';

  // Nom
  ctx.fillStyle = '#1b1838';
  ctx.font = '50px "Poppins Bold"';
  ctx.fillText(c.nom, 46, 612, W - 92);

  // Famille (puce pleine) + rarete (texte colore)
  ctx.font = '19px "Poppins Bold"';
  const fam = (opts.nomElement ?? c.element).toUpperCase();
  const lf = [...fam].reduce((a, ch) => a + ctx.measureText(ch).width + 2, -2) + 66;
  arrondi(ctx, 46, 646, lf, 40, 20);
  const gf = ctx.createLinearGradient(46, 0, 46 + lf, 0);
  gf.addColorStop(0, e.fond[0]);
  gf.addColorStop(1, e.fond[1]);
  ctx.fillStyle = gf;
  ctx.fill();
  symbole(ctx, c.element, 70, 666, 13);
  ctx.fillStyle = '#ffffff';
  espace(ctx, fam, 92, 667, 2);
  ctx.fillStyle = r.texte;
  espace(ctx, (opts.nomRarete ?? c.rarete).toUpperCase(), 46 + lf + 16, 667, 2);

  // Jauges
  const [l1, l2] = opts.libelles ?? ['PUISSANCE', 'ÉCLAT'];
  barre(ctx, 46, 724, 236, l1, c.puissance ?? 50, e.fond[1]);
  barre(ctx, 318, 724, 236, l2, c.eclat ?? 50, r.cadre[1]);

  // Pied : logo W + serie
  ctx.font = '17px "Poppins Medium"';
  ctx.fillStyle = '#9a97b8';
  ctx.fillText(`${opts.marque ?? 'Wumi'} · ${opts.nomSerie ?? 'Série 1'} · ${String(c.numero).padStart(3, '0')}/${String(opts.total ?? 48).padStart(3, '0')}`, 46, H - 52);

  if (r.arcEnCiel) holo(ctx, B, B, W - 2 * B, 540, 0.2);
  if (opts.brillante) {
    holo(ctx, 0, 0, W, 560, 0.22);
    let gr = c.numero * 977 + 3;
    const hasard = () => ((gr = (gr * 9301 + 49297) % 233280) / 233280);
    for (let i = 0; i < 16; i++) etincelle(ctx, B + hasard() * (W - 2 * B), 110 + hasard() * 420, 5 + hasard() * 10, 0.95, '#fff6a8');
    ctx.font = '17px "Poppins Bold"';
    const t = 'BRILLANTE';
    const lt = [...t].reduce((a, ch) => a + ctx.measureText(ch).width + 2, -2) + 44;
    arrondi(ctx, 40, 92, lt, 34, 17);
    ctx.fillStyle = 'rgba(27,24,56,0.8)';
    ctx.fill();
    etincelle(ctx, 58, 109, 8, 1, '#fff6a8');
    ctx.fillStyle = '#fff6a8';
    espace(ctx, t, 72, 110, 2);
  }
  return canvas;
}

/** Le paquet ferme (booster). */
async function booster(opts = {}) {
  chargerPolices();
  const w = 420, h = 640;
  const canvas = createCanvas(w, h);
  const ctx = canvas.getContext('2d');
  // Sachet : bords cranteles en haut et en bas
  ctx.beginPath();
  ctx.moveTo(20, 30);
  for (let x = 20; x <= w - 20; x += 20) ctx.lineTo(x + 10, x % 40 ? 18 : 30);
  ctx.lineTo(w - 20, h - 30);
  for (let x = w - 20; x >= 20; x -= 20) ctx.lineTo(x - 10, x % 40 ? h - 18 : h - 30);
  ctx.closePath();
  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, '#3b2a8f');
  g.addColorStop(0.55, '#1b1840');
  g.addColorStop(1, '#8f2f7a');
  ctx.fillStyle = g;
  ctx.fill();
  ctx.save();
  ctx.clip();
  holo(ctx, 0, 0, w, h, 0.16);
  for (let i = 0; i < 17; i++) etincelle(ctx, 40 + ((i * 97) % (w - 80)), 90 + ((i * 53) % (h - 180)), 4 + (i % 4) * 3, 0.6, '#ffffff');
  // bandes
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.fillRect(0, 70, w, 10);
  ctx.fillRect(0, h - 80, w, 10);
  ctx.restore();
  ctx.lineWidth = 8;
  ctx.strokeStyle = '#2a2547';
  ctx.stroke();

  // Mascotte au centre
  const vedette = await loadImage(Buffer.from(opts.vedette?.sujet
    ? require('./auvergne/scenes').scene(opts.vedette, 1)
    : svg(opts.vedette ?? { element: 'cosmos', corps: 'robot', yeux: 'ecran', oreilles: 'antenne', bouche: 'sourire' })));
  ctx.beginPath();
  ctx.arc(w / 2, 300, 140, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.15)';
  ctx.fill();
  if (opts.vedette?.sujet) {
    // un paysage dans un medaillon rond
    ctx.save();
    ctx.beginPath();
    ctx.arc(w / 2, 300, 132, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(vedette, w / 2 - 140, 168, 280, 276);
    ctx.restore();
    ctx.beginPath();
    ctx.arc(w / 2, 300, 132, 0, Math.PI * 2);
    ctx.lineWidth = 8;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();
  } else ctx.drawImage(vedette, w / 2 - 170, 140, 340, 340);

  ctx.textAlign = 'center';
  ctx.fillStyle = '#fff';
  ctx.font = '52px "Poppins Bold"';
  ctx.lineWidth = 10;
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#2a2547';
  ctx.strokeText(opts.haut ?? 'WUMI', w / 2, 128);
  ctx.fillText(opts.haut ?? 'WUMI', w / 2, 128);
  ctx.font = '24px "Poppins Bold"';
  ctx.strokeText(opts.titre ?? 'CRÉATURES', w / 2, 520);
  ctx.fillText(opts.titre ?? 'CRÉATURES', w / 2, 520);
  ctx.font = '20px "Poppins Medium"';
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.fillText(opts.sous ?? 'Série 1 · 5 cartes', w / 2, 556);
  return canvas;
}

/** Emplacement vide du classeur : la silhouette d'une carte pas encore trouvee. */
function vide(numero, opts = {}) {
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');
  arrondi(ctx, 0, 0, W, H, 44);
  ctx.fillStyle = '#2a2650';
  ctx.fill();
  ctx.setLineDash([22, 16]);
  arrondi(ctx, 18, 18, W - 36, H - 36, 32);
  ctx.lineWidth = 6;
  ctx.strokeStyle = 'rgba(255,255,255,0.22)';
  ctx.stroke();
  ctx.setLineDash([]);
  hexa(ctx, W / 2, H / 2 - 40, 120);
  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  ctx.fill();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(255,255,255,0.45)';
  ctx.font = '150px "Poppins Bold"';
  ctx.fillText('?', W / 2, H / 2 - 30);
  ctx.font = '44px "Poppins Bold"';
  ctx.fillText(`N° ${String(numero).padStart(2, '0')}`, W / 2, H - 150);
  if (opts.texte) {
    ctx.font = '30px "Poppins Medium"';
    ctx.fillText(opts.texte, W / 2, H - 95);
  }
  return canvas;
}

/**
 * Une page de classeur : jusqu'a 8 emplacements (4 x 2).
 * emplacements : [{ carte, possedee, brillante, quantite }]
 */
async function page(emplacements, opts = {}) {
  chargerPolices();
  const s = 0.4, w = W * s, h = H * s, m = 22, entete = 96;
  const cols = 4;
  const lignesN = Math.ceil(emplacements.length / cols);
  const canvas = createCanvas(cols * w + (cols + 1) * m, entete + lignesN * (h + m) + m);
  const ctx = canvas.getContext('2d');
  const fond = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
  fond.addColorStop(0, '#1d1a3f');
  fond.addColorStop(1, '#2b1f52');
  ctx.fillStyle = fond;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  if (opts.element) {
    const e = ELEMENTS[opts.element];
    ctx.fillStyle = e.fond[1];
    ctx.fillRect(0, 0, canvas.width, 8);
    ctx.beginPath();
    ctx.arc(m + 26, 50, 24, 0, Math.PI * 2);
    ctx.fillStyle = e.fond[1];
    ctx.fill();
    symbole(ctx, opts.element, m + 26, 50, 16);
  }
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffffff';
  ctx.font = '34px "Poppins Bold"';
  ctx.fillText(opts.titre ?? '', m + (opts.element ? 62 : 0), 50, canvas.width - 360);
  ctx.textAlign = 'right';
  ctx.font = '26px "Poppins Medium"';
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.fillText(opts.compteur ?? '', canvas.width - m, 50);
  ctx.textAlign = 'left';

  for (const [i, em] of emplacements.entries()) {
    const x = m + (i % cols) * (w + m);
    const y = entete + Math.floor(i / cols) * (h + m);
    const cv = em.possedee ? await carte(em.carte, { ...opts.optsCarte?.(em.carte), brillante: em.brillante }) : vide(em.carte.numero);
    ctx.drawImage(cv, x, y, w, h);
    if (em.possedee && em.quantite > 1) {
      const t = `x${em.quantite}`;
      ctx.font = '24px "Poppins Bold"';
      const lt = ctx.measureText(t).width + 24;
      arrondi(ctx, x + w - lt - 10, y + h - 46, lt, 36, 18);
      ctx.fillStyle = '#1b1838';
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.fillText(t, x + w - lt + 2, y + h - 27);
    }
  }
  return canvas;
}

/** Une rangee de cartes (recapitulatif d'un booster, vitrine). */
async function rangee(cartes, opts = {}) {
  chargerPolices();
  const s = opts.echelle ?? 0.45, w = W * s, h = H * s, m = 20;
  const n = Math.max(1, cartes.length);
  const canvas = createCanvas(n * w + (n + 1) * m, h + 2 * m);
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  for (const [i, c] of cartes.entries()) {
    const cv = c ? await carte(c.carte, { ...opts.optsCarte?.(c.carte), brillante: c.brillante }) : vide('?');
    ctx.drawImage(cv, m + i * (w + m), m, w, h);
  }
  return canvas;
}

module.exports = { carte, booster, vide, page, rangee, RARETES, W, H };
