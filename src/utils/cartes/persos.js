/**
 * Wumi 3.1 · LES PERSONNAGES DES CARTES (DA v3).
 *
 * Wumi (la tete du logo, avec ses expressions) et sa bande d'amis, tous dans
 * le meme style : corps brun noir, yeux blancs, silhouettes simples. Tout est
 * trace dans un carre de 128 unites, puis mis a l'echelle par la carte.
 *
 *   perso(ctx, cx, cy, taille, { corps, yeux, acc: [...] , accent })
 */
const path = require('node:path');
const BRUN = '#221b10';
const BLANC = '#ffffff';

let EXPR = null;
function expressionsWumi() {
  if (!EXPR) EXPR = require(path.join(__dirname, '..', '..', '..', 'outils', 'generer-emojis-tete'));
  return EXPR;
}

// ------------------------------------------------------------ petits outils
function ovale(ctx, x, y, rx, ry, c, a = 0) { ctx.fillStyle = c; ctx.beginPath(); ctx.ellipse(x, y, rx, ry, a, 0, Math.PI * 2); ctx.fill(); }
function rond(ctx, x, y, r, c) { ovale(ctx, x, y, r, r, c); }
function trait(ctx, l, c = BRUN) { ctx.strokeStyle = c; ctx.lineWidth = l; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; }
function rr(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); }
function etoile(ctx, cx, cy, r, c, pointes = 5, creux = 0.45) {
  ctx.fillStyle = c; ctx.beginPath();
  for (let i = 0; i < pointes * 2; i++) { const a = -Math.PI / 2 + (i * Math.PI) / pointes; const q = i % 2 ? r * creux : r; ctx.lineTo(cx + Math.cos(a) * q, cy + Math.sin(a) * q); }
  ctx.closePath(); ctx.fill();
}
function coeur(ctx, cx, cy, r, c) {
  ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(cx, cy + r * 0.9);
  ctx.bezierCurveTo(cx - r * 1.4, cy - r * 0.1, cx - r * 0.7, cy - r * 1.2, cx, cy - r * 0.45);
  ctx.bezierCurveTo(cx + r * 0.7, cy - r * 1.2, cx + r * 1.4, cy - r * 0.1, cx, cy + r * 0.9); ctx.fill();
}
function etincelle(ctx, x, y, r, c = BLANC) {
  ctx.fillStyle = c; ctx.beginPath();
  ctx.moveTo(x, y - r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.quadraticCurveTo(x, y, x, y + r);
  ctx.quadraticCurveTo(x, y, x - r, y); ctx.quadraticCurveTo(x, y, x, y - r); ctx.fill();
}
function texte(ctx, t, x, y, taille, c = BLANC, police = 'WumiTitre') { ctx.fillStyle = c; ctx.font = `${taille}px ${police}, "Poppins Bold"`; ctx.textAlign = 'center'; ctx.fillText(t, x, y); ctx.textAlign = 'left'; }
function bulle(ctx, x, y, w, h, c = BLANC) { rr(ctx, x, y, w, h, h / 2.4); ctx.fillStyle = c; ctx.fill(); ctx.beginPath(); ctx.moveTo(x + w * 0.25, y + h - 1); ctx.lineTo(x + w * 0.12, y + h + 9); ctx.lineTo(x + w * 0.45, y + h - 1); ctx.fill(); }

// ------------------------------------------------------------ les corps
// Chaque corps se dessine et renvoie ses reperes : yeux (g, d, r), sommet.
const CORPS = {
  wumi: (ctx) => {
    const { base } = expressionsWumi();
    const g = base(ctx, { tuile: false });
    return { wumi: g, g: [37, 62], d: [91, 62], r: 12, haut: 22, bas: 106 };
  },
  bloop: (ctx) => {
    ctx.fillStyle = BRUN; ctx.beginPath(); ctx.moveTo(64, 30);
    ctx.bezierCurveTo(104, 30, 120, 72, 116, 96); ctx.bezierCurveTo(112, 118, 16, 118, 12, 96); ctx.bezierCurveTo(8, 72, 24, 30, 64, 30); ctx.fill();
    ovale(ctx, 40, 113, 12, 6, BRUN); ovale(ctx, 88, 113, 12, 6, BRUN);
    return { g: [44, 74], d: [84, 74], r: 12, haut: 30, bas: 116, joues: [[28, 92], [100, 92]] };
  },
  robot: (ctx) => {
    trait(ctx, 5); ctx.beginPath(); ctx.moveTo(64, 32); ctx.lineTo(64, 16); ctx.stroke();
    rond(ctx, 64, 13, 6, '#ff9d1b');
    rr(ctx, 16, 32, 96, 74, 22); ctx.fillStyle = BRUN; ctx.fill();
    rr(ctx, 8, 56, 12, 26, 5); ctx.fill(); rr(ctx, 108, 56, 12, 26, 5); ctx.fill();
    rr(ctx, 34, 104, 18, 12, 4); ctx.fill(); rr(ctx, 76, 104, 18, 12, 4); ctx.fill();
    return { g: [45, 66], d: [83, 66], r: 12, haut: 32, bas: 116, joues: [[30, 88], [98, 88]] };
  },
  fantome: (ctx) => {
    ctx.fillStyle = BRUN; ctx.beginPath(); ctx.moveTo(18, 110); ctx.lineTo(18, 62);
    ctx.bezierCurveTo(18, 6, 110, 6, 110, 62); ctx.lineTo(110, 110);
    for (let i = 0; i < 4; i++) { const x = 110 - i * 23; ctx.quadraticCurveTo(x - 6, 122, x - 11.5, 110); ctx.quadraticCurveTo(x - 17, 98, x - 23, 110); }
    ctx.closePath(); ctx.fill();
    return { g: [46, 60], d: [82, 60], r: 12, haut: 20, bas: 118, joues: [[32, 80], [96, 80]] };
  },
  oiseau: (ctx) => {
    ctx.fillStyle = BRUN;
    ctx.beginPath(); ctx.moveTo(58, 24); ctx.quadraticCurveTo(56, 10, 66, 8); ctx.quadraticCurveTo(64, 16, 70, 22); ctx.quadraticCurveTo(76, 10, 86, 14); ctx.quadraticCurveTo(76, 18, 74, 28); ctx.fill();
    ovale(ctx, 64, 70, 50, 46, BRUN);
    ctx.beginPath(); ctx.moveTo(16, 70); ctx.quadraticCurveTo(-2, 86, 10, 100); ctx.quadraticCurveTo(22, 90, 26, 80); ctx.fill();
    ctx.beginPath(); ctx.moveTo(112, 70); ctx.quadraticCurveTo(130, 86, 118, 100); ctx.quadraticCurveTo(106, 90, 102, 80); ctx.fill();
    ctx.fillStyle = '#ffb53a'; ctx.beginPath(); ctx.moveTo(56, 76); ctx.lineTo(72, 76); ctx.lineTo(64, 88); ctx.closePath(); ctx.fill();
    trait(ctx, 4, '#ffb53a'); ctx.beginPath(); ctx.moveTo(52, 114); ctx.lineTo(52, 122); ctx.moveTo(76, 114); ctx.lineTo(76, 122); ctx.stroke();
    return { g: [44, 60], d: [84, 60], r: 13, haut: 24, bas: 118, joues: [[30, 82], [98, 82]] };
  },
  etoile: (ctx) => {
    ctx.fillStyle = BRUN; ctx.beginPath();
    for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5; const q = i % 2 ? 30 : 60; ctx.lineTo(64 + Math.cos(a) * q, 70 + Math.sin(a) * q); }
    ctx.closePath(); ctx.lineJoin = 'round'; ctx.strokeStyle = BRUN; ctx.lineWidth = 14; ctx.stroke(); ctx.fill();
    return { g: [50, 70], d: [78, 70], r: 9, haut: 12, bas: 120, joues: [[40, 84], [88, 84]] };
  },
  bug: (ctx) => {
    trait(ctx, 4); ctx.beginPath(); ctx.moveTo(52, 34); ctx.quadraticCurveTo(44, 16, 32, 14); ctx.moveTo(76, 34); ctx.quadraticCurveTo(84, 16, 96, 14); ctx.stroke();
    rond(ctx, 31, 13, 5, BRUN); rond(ctx, 97, 13, 5, BRUN);
    trait(ctx, 5); ctx.beginPath();
    for (const y of [74, 90, 104]) { ctx.moveTo(26, y); ctx.lineTo(8, y + 6); ctx.moveTo(102, y); ctx.lineTo(120, y + 6); }
    ctx.stroke();
    ovale(ctx, 64, 76, 42, 46, BRUN);
    ctx.strokeStyle = 'rgba(255,255,255,0.14)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(64, 92); ctx.lineTo(64, 118); ctx.stroke();
    return { g: [48, 62], d: [80, 62], r: 11, haut: 30, bas: 122, joues: [[36, 80], [92, 80]] };
  },
};

// ------------------------------------------------------------ les yeux (amis)
function yeux(ctx, style, R) {
  const { g, d, r } = R;
  const deux = (f) => { f(g, true); f(d, false); };
  switch (style) {
    case 'joie': trait(ctx, r * 0.45, BLANC); deux(([x, y]) => { ctx.beginPath(); ctx.arc(x, y + r * 0.35, r * 0.75, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke(); }); break;
    case 'endormi': trait(ctx, r * 0.4, BLANC); deux(([x, y]) => { ctx.beginPath(); ctx.arc(x, y - r * 0.3, r * 0.7, Math.PI * 0.15, Math.PI * 0.85); ctx.stroke(); }); break;
    case 'malin': deux(([x, y], gch) => { ovale(ctx, x, y, r, r * 0.95, BLANC); ctx.fillStyle = BRUN; ctx.beginPath(); ctx.moveTo(x - r * 1.3, y - r * (gch ? 1.25 : 0.2)); ctx.lineTo(x + r * 1.3, y - r * (gch ? 0.2 : 1.25)); ctx.lineTo(x + r * 1.3, y - r * 1.6); ctx.lineTo(x - r * 1.3, y - r * 1.6); ctx.fill(); rond(ctx, x + (gch ? r * 0.25 : -r * 0.25), y + r * 0.2, r * 0.38, BRUN); }); break;
    case 'colere': deux(([x, y], gch) => { ovale(ctx, x, y, r, r * 0.95, BLANC); ctx.fillStyle = BRUN; ctx.beginPath(); ctx.moveTo(x - r * 1.3, y - r * (gch ? 1.4 : 0.05)); ctx.lineTo(x + r * 1.3, y - r * (gch ? 0.05 : 1.4)); ctx.lineTo(x + r * 1.3, y - r * 1.8); ctx.lineTo(x - r * 1.3, y - r * 1.8); ctx.fill(); rond(ctx, x, y + r * 0.25, r * 0.4, BRUN); }); break;
    case 'choc': deux(([x, y]) => { rond(ctx, x, y, r * 1.25, BLANC); rond(ctx, x, y, r * 0.35, BRUN); }); break;
    case 'grands': deux(([x, y]) => { ovale(ctx, x, y, r * 1.15, r * 1.3, BLANC); rond(ctx, x + r * 0.2, y + r * 0.2, r * 0.55, BRUN); rond(ctx, x - r * 0.1, y - r * 0.15, r * 0.22, BLANC); }); break;
    case 'etoiles': deux(([x, y]) => etoile(ctx, x, y, r * 1.35, '#ffd84a')); break;
    case 'amour': deux(([x, y]) => coeur(ctx, x, y, r * 1.1, '#ff4d6d')); break;
    case 'triste': deux(([x, y], gch) => { ovale(ctx, x, y, r, r * 0.95, BLANC); ctx.fillStyle = BRUN; ctx.beginPath(); ctx.moveTo(x - r * 1.3, y - r * (gch ? 0.1 : 1.3)); ctx.lineTo(x + r * 1.3, y - r * (gch ? 1.3 : 0.1)); ctx.lineTo(x + r * 1.3, y - r * 1.8); ctx.lineTo(x - r * 1.3, y - r * 1.8); ctx.fill(); }); ovale(ctx, d[0] + r * 0.4, d[1] + r * 1.4, r * 0.32, r * 0.5, '#8fd3ff'); break;
    case 'croix': trait(ctx, r * 0.42, BLANC); deux(([x, y]) => { const q = r * 0.7; ctx.beginPath(); ctx.moveTo(x - q, y - q); ctx.lineTo(x + q, y + q); ctx.moveTo(x + q, y - q); ctx.lineTo(x - q, y + q); ctx.stroke(); }); break;
    case 'clin': ovale(ctx, g[0], g[1], r, r * 0.95, BLANC); trait(ctx, r * 0.42, BLANC); ctx.beginPath(); ctx.arc(d[0], d[1] + r * 0.35, r * 0.75, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke(); break;
    case 'mdr': trait(ctx, r * 0.42, BLANC); ctx.beginPath(); ctx.moveTo(g[0] - r * 0.7, g[1] - r * 0.7); ctx.lineTo(g[0] + r * 0.6, g[1]); ctx.lineTo(g[0] - r * 0.7, g[1] + r * 0.7); ctx.moveTo(d[0] + r * 0.7, d[1] - r * 0.7); ctx.lineTo(d[0] - r * 0.6, d[1]); ctx.lineTo(d[0] + r * 0.7, d[1] + r * 0.7); ctx.stroke(); break;
    case 'lunettes': { const c = '#1a140c'; rr(ctx, g[0] - r * 1.6, g[1] - r, r * 3.2, r * 2, r * 0.6); ctx.fillStyle = c; ctx.fill(); rr(ctx, d[0] - r * 1.6, d[1] - r, r * 3.2, r * 2, r * 0.6); ctx.fill(); trait(ctx, 3, BLANC); rr(ctx, g[0] - r * 1.6, g[1] - r, r * 3.2, r * 2, r * 0.6); ctx.stroke(); rr(ctx, d[0] - r * 1.6, d[1] - r, r * 3.2, r * 2, r * 0.6); ctx.stroke(); ovale(ctx, g[0] - r * 0.5, g[1] - r * 0.3, r * 0.5, r * 0.22, 'rgba(255,255,255,0.5)', -0.5); ovale(ctx, d[0] - r * 0.5, d[1] - r * 0.3, r * 0.5, r * 0.22, 'rgba(255,255,255,0.5)', -0.5); break; }
    default: deux(([x, y]) => ovale(ctx, x, y, r, r * 0.95, BLANC));
  }
}

// ------------------------------------------------------------ accessoires
// d = reperes du corps ; acc dessine dans l'espace 128. « arriere » : avant le corps.
const ARRIERE = new Set(['casque', 'cape', 'aura', 'anneau', 'traine', 'flammes', 'nebuleuse', 'spirale', 'rayons', 'fusee', 'ecran']);
const ACC = {
  // tete
  couronne: (ctx, d) => {
    const y = d.haut - 4; const g = ctx.createLinearGradient(0, y - 30, 0, y); g.addColorStop(0, '#fff1a8'); g.addColorStop(1, '#f5a623');
    ctx.fillStyle = g; ctx.strokeStyle = '#8a4a05'; ctx.lineWidth = 2; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(42, y); ctx.lineTo(38, y - 24); ctx.lineTo(51, y - 13); ctx.lineTo(64, y - 30); ctx.lineTo(77, y - 13); ctx.lineTo(90, y - 24); ctx.lineTo(86, y); ctx.closePath(); ctx.fill(); ctx.stroke();
    for (const [x, yy, c] of [[64, y - 9, '#e0453a'], [50, y - 6, '#4fc3e8'], [78, y - 6, '#5fd6b5']]) rond(ctx, x, yy, 3, c);
  },
  couronneGlitch: (ctx, d) => { ctx.save(); ctx.globalAlpha = 0.7; ctx.translate(-3, 0); ctx.filter = 'none'; ACC.couronne(ctx, d); ctx.restore(); ctx.save(); ctx.globalCompositeOperation = 'screen'; ctx.translate(3, 1); ACC.couronne(ctx, d); ctx.restore(); },
  casquette: (ctx, d) => { const y = d.haut + 6; ctx.fillStyle = '#e0453a'; ctx.beginPath(); ctx.arc(64, y + 8, 34, Math.PI, 0); ctx.fill(); rr(ctx, 64, y + 2, 52, 10, 5); ctx.fill(); rond(ctx, 64, y - 26, 4, '#fff'); },
  bandeau: (ctx, d) => {
    const y = d.g[1] - d.r * 1.9; ctx.fillStyle = '#e0453a';
    ctx.beginPath(); ctx.moveTo(14, y + 4); ctx.quadraticCurveTo(64, y - 8, 116, y + 2); ctx.lineTo(116, y + 12); ctx.quadraticCurveTo(64, y + 2, 14, y + 14); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(114, y + 4); ctx.quadraticCurveTo(128, y - 2, 136, y - 16); ctx.lineTo(132, y); ctx.quadraticCurveTo(140, y + 4, 140, y + 16); ctx.quadraticCurveTo(128, y + 10, 114, y + 12); ctx.closePath(); ctx.fill();
    rond(ctx, 64, y + 1, 3.5, '#fff');
  },
  bonnet: (ctx, d) => { const y = d.haut + 4; ctx.fillStyle = '#6b7cff'; ctx.beginPath(); ctx.moveTo(30, y + 6); ctx.quadraticCurveTo(64, y - 30, 104, y - 8); ctx.quadraticCurveTo(112, y + 14, 98, y + 10); ctx.quadraticCurveTo(70, y - 4, 30, y + 6); ctx.fill(); rond(ctx, 108, y + 12, 7, '#fff'); for (let i = 0; i < 4; i++) etoile(ctx, 48 + i * 14, y - 6 + (i % 2) * 4, 3, '#ffd84a'); },
  capuche: (ctx, d) => { ctx.fillStyle = '#3b3550'; ctx.beginPath(); ctx.moveTo(6, 110); ctx.quadraticCurveTo(0, 10, 64, 8); ctx.quadraticCurveTo(128, 10, 122, 110); ctx.quadraticCurveTo(110, 40, 64, 36); ctx.quadraticCurveTo(18, 40, 6, 110); ctx.fill(); },
  casqueSpatial: (ctx) => { ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 4; ctx.fillStyle = 'rgba(160,220,255,0.14)'; ctx.beginPath(); ctx.arc(64, 66, 62, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); ovale(ctx, 34, 32, 14, 6, 'rgba(255,255,255,0.5)', -0.7); rond(ctx, 64, 2, 5, '#ff9d1b'); },
  casque: (ctx) => { trait(ctx, 7, '#1a140c'); ctx.beginPath(); ctx.arc(64, 72, 56, Math.PI * 1.08, Math.PI * 1.92); ctx.stroke(); },
  casqueCoques: (ctx) => { for (const x of [12, 116]) { rr(ctx, x - 9, 58, 18, 30, 8); ctx.fillStyle = '#ff9d1b'; ctx.fill(); rr(ctx, x - 5, 63, 10, 20, 5); ctx.fillStyle = '#1a140c'; ctx.fill(); } },
  antennes: (ctx) => { trait(ctx, 3, '#d9d9e8'); for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(64 + s * 30, 30); ctx.lineTo(64 + s * 44, 6); ctx.stroke(); rond(ctx, 64 + s * 44, 6, 5, '#ff9d1b'); } },
  nuage: (ctx, d) => { const y = d.haut - 10; for (const [x, r] of [[50, 11], [64, 15], [80, 11]]) rond(ctx, x, y, r, '#fff'); rr(ctx, 40, y, 50, 10, 5); ctx.fillStyle = '#fff'; ctx.fill(); },
  wifi: (ctx, d) => { const y = d.haut - 4; trait(ctx, 5, '#fff'); for (const r of [10, 20, 30]) { ctx.beginPath(); ctx.arc(64, y + 4, r, Math.PI * 1.25, Math.PI * 1.75); ctx.stroke(); } rond(ctx, 64, y + 4, 4, '#fff'); },
  joystick: (ctx, d) => { const y = d.haut; trait(ctx, 5, '#d9d9e8'); ctx.beginPath(); ctx.moveTo(64, y); ctx.lineTo(64, y - 18); ctx.stroke(); rond(ctx, 64, y - 22, 9, '#e0453a'); },
  pixels: (ctx, d) => { const c = ['#ffd36a', '#ff9d1b', '#fff']; [[22, d.haut - 6, 8], [102, d.haut - 2, 10], [112, d.haut + 14, 6], [14, d.haut + 16, 6]].forEach(([x, y, s], i) => { ctx.fillStyle = c[i % 3]; ctx.fillRect(x, y, s, s); }); },
  drapeau: (ctx, d) => { trait(ctx, 3, '#d9d9e8'); ctx.beginPath(); ctx.moveTo(108, d.bas); ctx.lineTo(108, d.haut - 6); ctx.stroke(); ctx.fillStyle = '#5fd67a'; ctx.beginPath(); ctx.moveTo(108, d.haut - 6); ctx.lineTo(132, d.haut + 2); ctx.lineTo(108, d.haut + 10); ctx.fill(); },
  // visage / corps
  joues: (ctx, d) => { for (const [x, y] of d.joues ?? [[24, 84], [104, 84]]) ovale(ctx, x, y, 7, 4, 'rgba(255,120,140,0.6)'); },
  pansement: (ctx, d) => { ctx.save(); ctx.translate(d.d[0] + 4, d.d[1] + d.r * 1.9); ctx.rotate(-0.5); rr(ctx, -12, -4, 24, 8, 3); ctx.fillStyle = '#ffd6b0'; ctx.fill(); ctx.fillStyle = '#e8b98f'; ctx.fillRect(-3, -4, 6, 8); ctx.restore(); },
  scotch: (ctx, d) => { const y = d.g[1] + d.r * 2; ctx.save(); ctx.translate(64, y); ctx.rotate(-0.08); rr(ctx, -20, -5, 40, 10, 2); ctx.fillStyle = '#d9d9e8'; ctx.fill(); ctx.restore(); },
  zz: (ctx, d) => { texte(ctx, 'z', 104, d.haut + 4, 16); texte(ctx, 'Z', 116, d.haut - 12, 22); },
  fumee: (ctx, d) => { for (const [x, y, r] of [[98, d.haut - 4, 8], [108, d.haut - 16, 10], [96, d.haut - 26, 7]]) rond(ctx, x, y, r, 'rgba(200,200,210,0.85)'); },
  // tenu en main / a cote
  manette: (ctx, d) => { const y = d.bas - 18; rr(ctx, 34, y, 60, 24, 12); ctx.fillStyle = '#4a4a6a'; ctx.fill(); rond(ctx, 80, y + 9, 3.5, '#e0453a'); rond(ctx, 86, y + 15, 3.5, '#5fd6b5'); ctx.fillStyle = '#d9d9e8'; ctx.fillRect(42, y + 10, 12, 4); ctx.fillRect(46, y + 6, 4, 12); },
  clavier: (ctx, d) => { const y = d.bas - 14; rr(ctx, 20, y, 88, 20, 5); ctx.fillStyle = '#4a4a6a'; ctx.fill(); ctx.fillStyle = '#d9d9e8'; for (let i = 0; i < 7; i++) for (let j = 0; j < 2; j++) ctx.fillRect(25 + i * 11.5, y + 3 + j * 8, 9, 5); },
  coeurs: (ctx, d) => { [[18, d.haut], [32, d.haut - 12], [46, d.haut - 4]].forEach(([x, y]) => coeur(ctx, x, y, 7, '#ff4d6d')); },
  eclair: (ctx, d) => { ctx.fillStyle = '#ffd84a'; ctx.beginPath(); ctx.moveTo(114, d.haut + 2); ctx.lineTo(100, d.haut + 30); ctx.lineTo(110, d.haut + 30); ctx.lineTo(102, d.haut + 52); ctx.lineTo(124, d.haut + 20); ctx.lineTo(113, d.haut + 20); ctx.lineTo(122, d.haut + 2); ctx.closePath(); ctx.fill(); },
  eclairs: (ctx, d) => { ACC.eclair(ctx, d); ctx.save(); ctx.translate(128, 0); ctx.scale(-1, 1); ACC.eclair(ctx, d); ctx.restore(); },
  chrono: (ctx, d) => { const x = 18; const y = d.bas - 16; rond(ctx, x, y, 13, '#d9d9e8'); rond(ctx, x, y, 10, '#fff'); trait(ctx, 2.5); ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - 7); ctx.moveTo(x, y); ctx.lineTo(x + 5, y + 2); ctx.stroke(); rr(ctx, x - 3, y - 18, 6, 5, 1); ctx.fillStyle = '#d9d9e8'; ctx.fill(); },
  gemme: (ctx, d) => { const x = 108; const y = d.bas - 22; ctx.fillStyle = '#5fe0ff'; ctx.beginPath(); ctx.moveTo(x, y - 14); ctx.lineTo(x + 12, y - 4); ctx.lineTo(x, y + 14); ctx.lineTo(x - 12, y - 4); ctx.closePath(); ctx.fill(); ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.beginPath(); ctx.moveTo(x, y - 14); ctx.lineTo(x - 5, y - 4); ctx.lineTo(x, y + 14); ctx.closePath(); ctx.fill(); },
  boost: (ctx, d) => { const x = 110; const y = d.bas - 24; ctx.fillStyle = '#ff73fa'; ctx.beginPath(); ctx.moveTo(x, y - 16); ctx.lineTo(x + 13, y); ctx.lineTo(x, y + 16); ctx.lineTo(x - 13, y); ctx.closePath(); ctx.fill(); ctx.fillStyle = '#ffd6fb'; ctx.beginPath(); ctx.moveTo(x, y - 8); ctx.lineTo(x + 6, y); ctx.lineTo(x, y + 8); ctx.lineTo(x - 6, y); ctx.closePath(); ctx.fill(); },
  fleche: (ctx, d, sens = -1) => { const x = 110; const y = d.haut + 24; ctx.fillStyle = '#fff'; ctx.save(); ctx.translate(x, y); if (sens > 0) ctx.rotate(Math.PI); ctx.beginPath(); ctx.moveTo(0, -18); ctx.lineTo(13, -2); ctx.lineTo(5, -2); ctx.lineTo(5, 16); ctx.lineTo(-5, 16); ctx.lineTo(-5, -2); ctx.lineTo(-13, -2); ctx.closePath(); ctx.fill(); ctx.restore(); },
  flecheBas: (ctx, d) => ACC.fleche(ctx, d, 1),
  chargement: (ctx, d) => { const x = 108; const y = d.haut + 8; for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; rond(ctx, x + Math.cos(a) * 12, y + Math.sin(a) * 12, 2 + i * 0.4, `rgba(255,255,255,${0.25 + i * 0.09})`); } },
  synchro: (ctx, d) => { const x = 108; const y = d.haut + 10; trait(ctx, 4, '#fff'); ctx.beginPath(); ctx.arc(x, y, 12, 0.3, Math.PI - 0.3); ctx.stroke(); ctx.beginPath(); ctx.arc(x, y, 12, Math.PI + 0.3, -0.3); ctx.stroke(); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(x - 17, y - 2); ctx.lineTo(x - 7, y - 2); ctx.lineTo(x - 12, y + 6); ctx.fill(); ctx.beginPath(); ctx.moveTo(x + 17, y + 2); ctx.lineTo(x + 7, y + 2); ctx.lineTo(x + 12, y - 6); ctx.fill(); },
  cookie: (ctx, d) => { const x = 108; const y = d.bas - 20; rond(ctx, x, y, 15, '#d99a4e'); for (const [a, b] of [[-5, -4], [5, -6], [2, 5], [-6, 6], [8, 3]]) rond(ctx, x + a, y + b, 2.4, '#5a3410'); },
  maison: (ctx, d) => { const x = 108; const y = d.bas - 18; ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(x - 16, y - 2); ctx.lineTo(x, y - 18); ctx.lineTo(x + 16, y - 2); ctx.closePath(); ctx.fill(); rr(ctx, x - 12, y - 4, 24, 20, 2); ctx.fill(); rr(ctx, x - 4, y + 4, 8, 12, 1); ctx.fillStyle = '#ff9d1b'; ctx.fill(); },
  bouclier: (ctx, d, c = '#4fc3e8') => { const x = 106; const y = d.bas - 30; ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(x, y - 20); ctx.quadraticCurveTo(x + 16, y - 14, x + 18, y - 14); ctx.quadraticCurveTo(x + 18, y + 10, x, y + 22); ctx.quadraticCurveTo(x - 18, y + 10, x - 18, y - 14); ctx.quadraticCurveTo(x - 16, y - 14, x, y - 20); ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.stroke(); etoile(ctx, x, y, 7, '#fff'); },
  bouclierFeu: (ctx, d) => ACC.bouclier(ctx, d, '#ff6a2b'),
  loupe: (ctx, d) => { const x = 104; const y = d.bas - 34; trait(ctx, 6, '#8a5a2b'); ctx.beginPath(); ctx.moveTo(x + 8, y + 10); ctx.lineTo(x + 20, y + 24); ctx.stroke(); ctx.fillStyle = 'rgba(200,240,255,0.5)'; ctx.beginPath(); ctx.arc(x, y, 12, 0, Math.PI * 2); ctx.fill(); trait(ctx, 4, '#d9d9e8'); ctx.stroke(); },
  point404: (ctx, d) => { bulle(ctx, 84, d.haut - 22, 40, 22); texte(ctx, '404', 104, d.haut - 6, 14, BRUN); },
  exclam: (ctx, d) => { bulle(ctx, 92, d.haut - 22, 28, 26, '#ff4d6d'); texte(ctx, '!', 106, d.haut - 2, 22); },
  enveloppes: (ctx, d) => { for (const [x, y, a] of [[106, d.haut + 6, 0.2], [20, d.haut + 14, -0.25], [112, d.bas - 22, -0.1]]) { ctx.save(); ctx.translate(x, y); ctx.rotate(a); rr(ctx, -12, -8, 24, 16, 3); ctx.fillStyle = '#fff'; ctx.fill(); trait(ctx, 2, '#ff9d1b'); ctx.beginPath(); ctx.moveTo(-11, -7); ctx.lineTo(0, 1); ctx.lineTo(11, -7); ctx.stroke(); ctx.restore(); } },
  sablier: (ctx, d) => { const x = 108; const y = d.bas - 28; ctx.fillStyle = '#d9d9e8'; ctx.fillRect(x - 12, y - 18, 24, 4); ctx.fillRect(x - 12, y + 14, 24, 4); ctx.fillStyle = '#ffd36a'; ctx.beginPath(); ctx.moveTo(x - 9, y - 14); ctx.lineTo(x + 9, y - 14); ctx.lineTo(x, y); ctx.lineTo(x + 9, y + 14); ctx.lineTo(x - 9, y + 14); ctx.lineTo(x, y); ctx.closePath(); ctx.fill(); },
  pointes: (ctx, d) => { ctx.fillStyle = '#7dffb0'; for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; const x = 64 + Math.cos(a) * 50; const y = 76 + Math.sin(a) * 52; rond(ctx, x, y, 6, '#7dffb0'); } },
  annuler: (ctx, d) => { const x = 108; const y = d.haut + 16; trait(ctx, 6, '#fff'); ctx.beginPath(); ctx.arc(x, y, 13, Math.PI * 1.2, Math.PI * 0.8, false); ctx.stroke(); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(x - 20, y - 12); ctx.lineTo(x - 4, y - 12); ctx.lineTo(x - 13, y + 2); ctx.closePath(); ctx.fill(); },
  triste: (ctx, d) => { bulle(ctx, 86, d.haut - 24, 36, 26, '#2f6fd6'); texte(ctx, ':(', 104, d.haut - 5, 16); },
  film: (ctx, d) => { const x = 108; const y = d.bas - 24; rr(ctx, x - 14, y - 12, 28, 24, 3); ctx.fillStyle = '#4a4a6a'; ctx.fill(); ctx.fillStyle = '#ffd36a'; ctx.beginPath(); ctx.moveTo(x - 4, y - 6); ctx.lineTo(x + 6, y); ctx.lineTo(x - 4, y + 6); ctx.fill(); texte(ctx, 'GIF', x, y - 16, 10); },
  coeurSticker: (ctx, d) => { coeur(ctx, 108, d.haut + 18, 15, '#fff'); coeur(ctx, 108, d.haut + 18, 11, '#ff4d6d'); },
  micro: (ctx, d) => { const x = 108; const y = d.bas - 30; rr(ctx, x - 7, y - 16, 14, 22, 7); ctx.fillStyle = '#d9d9e8'; ctx.fill(); trait(ctx, 3, '#d9d9e8'); ctx.beginPath(); ctx.arc(x, y - 2, 11, 0, Math.PI); ctx.moveTo(x, y + 9); ctx.lineTo(x, y + 18); ctx.stroke(); rond(ctx, x + 10, y - 20, 3, '#ff4d6d'); },
  bulleCoeur: (ctx, d) => { bulle(ctx, 86, d.haut - 22, 34, 26); coeur(ctx, 103, d.haut - 9, 7, '#ff4d6d'); },
  diese: (ctx, d) => { bulle(ctx, 88, d.haut - 24, 30, 28, '#ff5fa8'); texte(ctx, '#', 103, d.haut - 3, 20); },
  arobase: (ctx, d) => { bulle(ctx, 88, d.haut - 24, 30, 28, '#5865f2'); texte(ctx, '@', 103, d.haut - 4, 18); },
  megaphone: (ctx, d) => { const x = 104; const y = d.haut + 20; ctx.fillStyle = '#ff9d1b'; ctx.beginPath(); ctx.moveTo(x - 10, y - 6); ctx.lineTo(x + 14, y - 16); ctx.lineTo(x + 14, y + 16); ctx.lineTo(x - 10, y + 6); ctx.closePath(); ctx.fill(); rr(ctx, x - 16, y - 7, 8, 14, 2); ctx.fillStyle = '#d9d9e8'; ctx.fill(); trait(ctx, 2.5, '#fff'); for (const r of [6, 11]) { ctx.beginPath(); ctx.arc(x + 16, y, r, -0.6, 0.6); ctx.stroke(); } },
  cloche: (ctx, d) => { const x = 106; const y = d.haut + 10; ctx.fillStyle = '#ffd36a'; ctx.beginPath(); ctx.moveTo(x - 14, y + 10); ctx.quadraticCurveTo(x - 12, y - 14, x, y - 14); ctx.quadraticCurveTo(x + 12, y - 14, x + 14, y + 10); ctx.closePath(); ctx.fill(); rond(ctx, x, y + 13, 4, '#ffd36a'); rond(ctx, x + 12, y - 12, 6, '#ff4d6d'); },
  camera: (ctx, d) => { const x = 106; const y = d.bas - 26; rr(ctx, x - 16, y - 10, 24, 20, 4); ctx.fillStyle = '#4a4a6a'; ctx.fill(); ctx.beginPath(); ctx.moveTo(x + 8, y - 4); ctx.lineTo(x + 18, y - 10); ctx.lineTo(x + 18, y + 10); ctx.lineTo(x + 8, y + 4); ctx.fill(); rond(ctx, x - 10, y - 14, 3.5, '#ff4d6d'); },
  lune: (ctx, d) => { const x = 104; const y = d.haut - 2; rond(ctx, x, y, 14, '#ffe9a8'); ctx.save(); ctx.globalCompositeOperation = 'destination-out'; rond(ctx, x + 7, y - 5, 12, '#000'); ctx.restore(); },
  lunePleine: (ctx, d) => { const x = 104; const y = d.haut - 2; rond(ctx, x, y, 14, '#ffe9a8'); rond(ctx, x - 4, y - 3, 3, 'rgba(0,0,0,0.12)'); rond(ctx, x + 5, y + 4, 2.5, 'rgba(0,0,0,0.12)'); },
  marteau: (ctx, d) => { ctx.save(); ctx.translate(106, d.bas - 34); ctx.rotate(0.5); trait(ctx, 5, '#8a5a2b'); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, 30); ctx.stroke(); rr(ctx, -14, -10, 28, 14, 3); ctx.fillStyle = '#d9d9e8'; ctx.fill(); ctx.restore(); },
  coche: (ctx, d) => { const x = 106; const y = d.haut + 14; rr(ctx, x - 13, y - 13, 26, 26, 5); ctx.fillStyle = '#fff'; ctx.fill(); trait(ctx, 4, '#2f9e5b'); ctx.beginPath(); ctx.moveTo(x - 7, y); ctx.lineTo(x - 2, y + 6); ctx.lineTo(x + 8, y - 6); ctx.stroke(); },
  epee: (ctx, d) => { ctx.save(); ctx.translate(108, d.bas - 22); ctx.rotate(-0.4); ctx.fillStyle = '#d9d9e8'; ctx.beginPath(); ctx.moveTo(-3, 0); ctx.lineTo(-3, -40); ctx.lineTo(0, -46); ctx.lineTo(3, -40); ctx.lineTo(3, 0); ctx.fill(); ctx.fillStyle = '#ffd36a'; ctx.fillRect(-10, 0, 20, 4); ctx.fillStyle = '#8a5a2b'; ctx.fillRect(-2.5, 4, 5, 12); ctx.restore(); },
  // decor (derriere)
  cape: (ctx) => { ctx.fillStyle = '#c0262f'; ctx.beginPath(); ctx.moveTo(26, 70); ctx.quadraticCurveTo(0, 110, 6, 126); ctx.lineTo(122, 126); ctx.quadraticCurveTo(128, 110, 102, 70); ctx.closePath(); ctx.fill(); },
  aura: (ctx) => { const g = ctx.createRadialGradient(64, 70, 10, 64, 70, 70); g.addColorStop(0, 'rgba(255,255,255,0.0)'); g.addColorStop(0.6, 'rgba(255,240,160,0.35)'); g.addColorStop(1, 'rgba(255,240,160,0)'); ctx.fillStyle = g; ctx.fillRect(-10, -10, 148, 148); },
  anneau: (ctx) => { ctx.save(); ctx.translate(64, 72); ctx.rotate(-0.25); ctx.strokeStyle = '#ffd36a'; ctx.lineWidth = 6; ctx.beginPath(); ctx.ellipse(0, 0, 70, 16, 0, 0, Math.PI * 2); ctx.stroke(); ctx.restore(); },
  anneaux: (ctx) => { ACC.anneau(ctx); ctx.save(); ctx.translate(64, 72); ctx.rotate(0.5); ctx.strokeStyle = '#8fd3ff'; ctx.lineWidth = 4; ctx.beginPath(); ctx.ellipse(0, 0, 68, 14, 0, 0, Math.PI * 2); ctx.stroke(); ctx.restore(); },
  traine: (ctx) => { const g = ctx.createLinearGradient(0, 120, 64, 70); g.addColorStop(0, 'rgba(255,211,106,0)'); g.addColorStop(1, 'rgba(255,211,106,0.9)'); ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(-20, 134); ctx.lineTo(44, 54); ctx.lineTo(84, 92); ctx.closePath(); ctx.fill(); },
  flammes: (ctx) => { for (const [x, h, c] of [[28, 40, '#ff6a2b'], [64, 56, '#ffb347'], [100, 40, '#ff6a2b'], [46, 30, '#ffd36a'], [82, 30, '#ffd36a']]) { ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(x - 16, 100); ctx.quadraticCurveTo(x - 14, 100 - h, x, 96 - h - 10); ctx.quadraticCurveTo(x + 14, 100 - h, x + 16, 100); ctx.closePath(); ctx.fill(); } },
  nebuleuse: (ctx) => { for (const [x, y, r, c] of [[30, 40, 40, 'rgba(255,95,210,0.35)'], [100, 50, 44, 'rgba(95,180,255,0.35)'], [64, 100, 40, 'rgba(160,100,255,0.35)']]) { const g = ctx.createRadialGradient(x, y, 2, x, y, r); g.addColorStop(0, c); g.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2); } },
  spirale: (ctx) => { ctx.strokeStyle = 'rgba(200,170,255,0.75)'; ctx.lineWidth = 5; ctx.beginPath(); for (let t = 0; t < 18; t += 0.1) { const r = 4 + t * 3.6; ctx.lineTo(64 + Math.cos(t) * r, 70 + Math.sin(t) * r * 0.55); } ctx.stroke(); },
  rayons: (ctx) => { ctx.fillStyle = 'rgba(255,240,180,0.45)'; for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2; ctx.beginPath(); ctx.moveTo(64, 70); ctx.lineTo(64 + Math.cos(a) * 90, 70 + Math.sin(a) * 90); ctx.lineTo(64 + Math.cos(a + 0.12) * 90, 70 + Math.sin(a + 0.12) * 90); ctx.fill(); } },
  fusee: (ctx) => { for (const [x, h, c] of [[50, 26, '#ff6a2b'], [64, 36, '#ffd36a'], [78, 26, '#ff6a2b']]) { ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(x - 8, 112); ctx.quadraticCurveTo(x, 112 + h * 1.4, x + 8, 112); ctx.closePath(); ctx.fill(); } },
  ecran: (ctx) => { rr(ctx, -4, 6, 136, 100, 10); ctx.fillStyle = '#1f5fd6'; ctx.fill(); ctx.fillStyle = 'rgba(255,255,255,0.15)'; for (let i = 0; i < 6; i++) ctx.fillRect(4, 16 + i * 14, 40 + (i * 23) % 60, 5); },
  etincelles: (ctx) => { for (const [x, y, r] of [[14, 24, 7], [116, 30, 9], [110, 98, 6], [12, 92, 5]]) etincelle(ctx, x, y, r, '#fff6c8'); },
};

/** Dessine un personnage dans un carre de cote « t » centre en (cx, cy). */
function perso(ctx, cx, cy, t, p) {
  ctx.save();
  ctx.translate(cx - t / 2, cy - t / 2);
  ctx.scale(t / 128, t / 128);
  const acc = p.acc ?? [];
  // ombre au sol
  ovale(ctx, 64, 124, 46, 6, 'rgba(0,0,0,0.25)');
  // decor arriere (reperes approximatifs avant le corps : ceux de Wumi)
  const reperesDefaut = { g: [37, 62], d: [91, 62], r: 12, haut: 22, bas: 106 };
  for (const a of acc) if (ARRIERE.has(a)) ACC[a](ctx, reperesDefaut);
  const R = CORPS[p.corps ?? 'wumi'](ctx);
  if (R.wumi) {
    const { EXPRESSIONS } = expressionsWumi();
    (EXPRESSIONS[p.yeux] ?? EXPRESSIONS.wumi)(ctx, R.wumi);
  } else {
    yeux(ctx, p.yeux ?? 'rond', R);
    if (p.joues !== false) ACC.joues(ctx, R);
  }
  if (acc.includes('casque')) ACC.casqueCoques(ctx, R);
  for (const a of acc) if (!ARRIERE.has(a)) ACC[a](ctx, R);
  ctx.restore();
}

module.exports = { perso, CORPS, ACC };
