/**
 * Wumi 3.1 · LA CARTE A COLLECTIONNER, DA v3.
 * Cadre et effets selon la rarete (les legendaires et mythiques sont des
 * cartes pleine image, dorees ou arc-en-ciel), personnages de persos.js.
 */
const path = require('node:path');
const { createCanvas, GlobalFonts } = require('@napi-rs/canvas');
const { perso } = require('./persos');
const LOOKS = require('./looks');

let polices = false;
function chargerPolices() {
  if (polices) return;
  polices = true;
  const P = path.join(__dirname, '..', '..', '..', 'outils', 'polices-bannieres');
  try {
    GlobalFonts.registerFromPath(path.join(P, 'InterDisplay-Black.otf'), 'WumiTitre');
    GlobalFonts.registerFromPath(path.join(P, 'Inter-Bold.otf'), 'WumiGras');
  } catch { require('../polices').chargerPolices(); }
}

const W = 600;
const H = 870;
const BRUN = '#221b10';

const RARETE = {
  commune: { nom: 'COMMUNE', etoiles: 1, cadre: ['#5a4a36', '#3a2f22'], texte: '#cdbfa8' },
  peu_commune: { nom: 'PEU COMMUNE', etoiles: 2, cadre: ['#7ad89a', '#2f8f57'], texte: '#8fe3ab' },
  rare: { nom: 'RARE', etoiles: 3, cadre: ['#7cc4ff', '#2f6fd6'], texte: '#8fd0ff' },
  epique: { nom: 'ÉPIQUE', etoiles: 4, cadre: ['#d59bff', '#7b3fe0'], texte: '#d9a8ff' },
  legendaire: { nom: 'LÉGENDAIRE', etoiles: 5, cadre: ['#fff1a8', '#f5a623', '#b8650a'], texte: '#ffd36a' },
  mythique: { nom: 'MYTHIQUE', etoiles: 6, cadre: ['#ff6bd6', '#ffd36a', '#6bffb8', '#6bc8ff', '#b46bff'], texte: '#ffffff' },
};

const FAMILLE = {
  pixel: { nom: 'PIXEL', fond: ['#ff9d1b', '#e0630a'], motif: 'grille' },
  glitch: { nom: 'GLITCH', fond: ['#3fe0a0', '#127a5a'], motif: 'glitch' },
  nuage: { nom: 'NUAGE', fond: ['#8fd0ff', '#3f86e0'], motif: 'nuages' },
  neon: { nom: 'NÉON', fond: ['#ff5fa8', '#7a2fd6'], motif: 'lignes' },
  nuit: { nom: 'NUIT', fond: ['#3b2f6e', '#140f2e'], motif: 'etoiles' },
  cosmos: { nom: 'COSMOS', fond: ['#2a1650', '#0b0820'], motif: 'etoiles' },
  feu: { nom: 'FEU', fond: ['#ffb347', '#d6300a'], motif: 'rayons' },
};

// ------------------------------------------------------------ utilitaires
function arrondi(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); }
function degrade(ctx, couleurs, x0, y0, x1, y1) {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  couleurs.forEach((c, i) => g.addColorStop(couleurs.length === 1 ? 0 : i / (couleurs.length - 1), c));
  return g;
}
function etincelle(ctx, x, y, r, couleur = '#fff', a = 1) {
  ctx.save(); ctx.globalAlpha = a; ctx.fillStyle = couleur;
  ctx.beginPath();
  ctx.moveTo(x, y - r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.quadraticCurveTo(x, y, x, y + r);
  ctx.quadraticCurveTo(x, y, x - r, y); ctx.quadraticCurveTo(x, y, x, y - r); ctx.fill();
  ctx.restore();
}
function graine(n) { let s = n * 9301 + 49297; return () => { s = (s * 9301 + 49297) % 233280; return s / 233280; }; }

function motif(ctx, type, x, y, w, h, n) {
  const r = graine(n);
  ctx.save();
  if (type === 'grille') {
    ctx.strokeStyle = 'rgba(255,255,255,0.10)'; ctx.lineWidth = 2;
    for (let i = x; i < x + w; i += 40) { ctx.beginPath(); ctx.moveTo(i, y); ctx.lineTo(i, y + h); ctx.stroke(); }
    for (let j = y; j < y + h; j += 40) { ctx.beginPath(); ctx.moveTo(x, j); ctx.lineTo(x + w, j); ctx.stroke(); }
  } else if (type === 'etoiles') {
    for (let i = 0; i < 40; i++) { ctx.fillStyle = `rgba(255,255,255,${0.3 + r() * 0.6})`; ctx.beginPath(); ctx.arc(x + r() * w, y + r() * h, 0.8 + r() * 2.2, 0, 7); ctx.fill(); }
    for (let i = 0; i < 6; i++) etincelle(ctx, x + r() * w, y + r() * h, 5 + r() * 8, '#fff', 0.8);
  } else if (type === 'nuages') {
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    for (let i = 0; i < 6; i++) { const cx = x + r() * w; const cy = y + r() * h; for (const [dx, dr] of [[-30, 26], [0, 36], [32, 24]]) { ctx.beginPath(); ctx.arc(cx + dx, cy, dr, 0, 7); ctx.fill(); } }
  } else if (type === 'lignes') {
    ctx.strokeStyle = 'rgba(255,255,255,0.14)'; ctx.lineWidth = 3;
    for (let i = -h; i < w; i += 36) { ctx.beginPath(); ctx.moveTo(x + i, y + h); ctx.lineTo(x + i + h, y); ctx.stroke(); }
  } else if (type === 'glitch') {
    for (let i = 0; i < 14; i++) { ctx.fillStyle = ['rgba(255,95,210,0.22)', 'rgba(95,230,255,0.22)', 'rgba(255,255,255,0.14)'][i % 3]; ctx.fillRect(x + r() * w, y + r() * h, 30 + r() * 120, 4 + r() * 10); }
  } else if (type === 'rayons') {
    rayons(ctx, x + w / 2, y + h * 0.55, Math.max(w, h), 'rgba(255,255,255,0.12)', 18);
  }
  ctx.restore();
}
function rayons(ctx, cx, cy, R, couleur, n) {
  ctx.save(); ctx.fillStyle = couleur;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2; const b = a + Math.PI / n;
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R); ctx.lineTo(cx + Math.cos(b) * R, cy + Math.sin(b) * R); ctx.closePath(); ctx.fill();
  }
  ctx.restore();
}

// ------------------------------------------------------------ la carte
function cadre(ctx, rar, x, y, w, h, r, epaisseur) {
  const tmp = createCanvas(w, h);
  const t = tmp.getContext('2d');
  t.fillStyle = degrade(t, rar.cadre, 0, 0, w, h);
  arrondi(t, 0, 0, w, h, r); t.fill();
  t.globalCompositeOperation = 'destination-out';
  arrondi(t, epaisseur, epaisseur, w - epaisseur * 2, h - epaisseur * 2, r - epaisseur); t.fill();
  ctx.drawImage(tmp, x, y);
}

function etoilesRarete(ctx, n, x, y, couleur) {
  for (let i = 0; i < n; i++) {
    const cx = x + i * 26; ctx.fillStyle = couleur;
    ctx.beginPath();
    for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + (k * Math.PI) / 5; const rr = k % 2 ? 4.5 : 10; ctx.lineTo(cx + Math.cos(a) * rr, y + Math.sin(a) * rr); }
    ctx.closePath(); ctx.fill();
  }
}

function barre(ctx, x, y, w, libelle, valeur, couleur) {
  ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.font = '17px WumiGras'; ctx.fillText(libelle, x, y);
  ctx.textAlign = 'right'; ctx.fillStyle = '#fff'; ctx.font = '20px WumiTitre'; ctx.fillText(String(valeur), x + w, y); ctx.textAlign = 'left';
  ctx.fillStyle = 'rgba(255,255,255,0.12)'; arrondi(ctx, x, y + 10, w, 9, 5); ctx.fill();
  ctx.fillStyle = couleur; arrondi(ctx, x, y + 10, Math.max(9, (w * valeur) / 100), 9, 5); ctx.fill();
}

function carte(c, opts = {}) {
  chargerPolices();
  const rar = RARETE[c.rarete];
  const fam = FAMILLE[c.element] ?? FAMILLE.pixel;
  const pleine = c.rarete === 'legendaire' || c.rarete === 'mythique';
  const cv = createCanvas(W, H);
  const ctx = cv.getContext('2d');

  // fond de carte
  ctx.fillStyle = '#120d08'; arrondi(ctx, 0, 0, W, H, 34); ctx.fill();
  ctx.save(); arrondi(ctx, 0, 0, W, H, 34); ctx.clip();

  // illustration
  const ax = 22; const ay = 22; const aw = W - 44; const ah = pleine ? H - 44 : 572;
  ctx.save(); arrondi(ctx, ax, ay, aw, ah, 22); ctx.clip();
  ctx.fillStyle = degrade(ctx, fam.fond, ax, ay, ax + aw * 0.3, ay + ah);
  ctx.fillRect(ax, ay, aw, ah);
  if (c.rarete === 'legendaire') rayons(ctx, W / 2, ay + ah * 0.42, 900, 'rgba(255,240,180,0.16)', 24);
  if (c.rarete === 'mythique') {
    const g = ctx.createRadialGradient(W / 2, ay + ah * 0.42, 10, W / 2, ay + ah * 0.42, 420);
    g.addColorStop(0, 'rgba(255,120,220,0.55)'); g.addColorStop(0.5, 'rgba(120,80,255,0.25)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(ax, ay, aw, ah);
  }
  motif(ctx, fam.motif, ax, ay, aw, ah, c.numero);
  // halo derriere le personnage
  const hy = ay + (pleine ? ah * 0.42 : ah * 0.55);
  const halo = ctx.createRadialGradient(W / 2, hy, 10, W / 2, hy, 260);
  halo.addColorStop(0, pleine ? 'rgba(255,240,200,0.65)' : 'rgba(255,255,255,0.35)'); halo.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = halo; ctx.fillRect(ax, ay, aw, ah);
  // personnage
  const taille = pleine ? 400 : 340;
  perso(ctx, W / 2, hy + (pleine ? 0 : 10), taille, LOOKS[c.numero] ?? { corps: 'wumi', yeux: 'joie' });
  if (pleine) {
    // voile sombre en bas pour le texte
    const v = ctx.createLinearGradient(0, H - 330, 0, H);
    v.addColorStop(0, 'rgba(18,13,8,0)'); v.addColorStop(0.45, 'rgba(18,13,8,0.75)'); v.addColorStop(1, 'rgba(18,13,8,0.95)');
    ctx.fillStyle = v; ctx.fillRect(ax, ay, aw, ah);
    // reflet holo
    const hg = ctx.createLinearGradient(0, 0, W, H);
    const cols = c.rarete === 'mythique' ? ['255,107,214', '255,211,106', '107,255,184', '107,200,255'] : ['255,241,168', '255,255,255', '255,211,106', '255,255,255'];
    cols.forEach((col, i) => hg.addColorStop(i / (cols.length - 1), `rgba(${col},0.16)`));
    ctx.globalCompositeOperation = 'overlay'; ctx.fillStyle = hg; ctx.fillRect(ax, ay, aw, ah); ctx.globalCompositeOperation = 'source-over';
    const r = graine(c.numero + 7);
    for (let i = 0; i < 14; i++) etincelle(ctx, ax + r() * aw, ay + r() * ah * 0.6, 4 + r() * 10, c.rarete === 'mythique' ? '#fff' : '#fff1a8', 0.9);
  }
  ctx.restore();

  // en-tete : etoiles de rarete + numero
  etoilesRarete(ctx, rar.etoiles, 52, 62, pleine ? '#fff' : 'rgba(255,255,255,0.95)');
  ctx.fillStyle = 'rgba(18,13,8,0.55)'; arrondi(ctx, W - 108, 40, 70, 42, 21); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.font = '22px WumiTitre'; ctx.textAlign = 'center'; ctx.fillText(`#${String(c.numero).padStart(2, '0')}`, W - 73, 69); ctx.textAlign = 'left';

  // bloc d'infos
  const by = pleine ? H - 250 : 612;
  let nomY = by + 40;
  ctx.font = '48px WumiTitre';
  if (pleine) {
    const ng = ctx.createLinearGradient(0, nomY - 44, 0, nomY + 6);
    (c.rarete === 'mythique' ? ['#ffffff', '#ffd6f5'] : ['#fff6c8', '#ffb53a']).forEach((x, i) => ng.addColorStop(i, x));
    ctx.fillStyle = ng; ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = 14;
  } else ctx.fillStyle = '#fff';
  let tn = 48;
  while (ctx.measureText(c.nom).width > W - 92 && tn > 28) { tn -= 2; ctx.font = `${tn}px WumiTitre`; }
  ctx.fillText(c.nom, 46, nomY); ctx.shadowBlur = 0;
  // pastilles famille + rarete
  ctx.font = '16px WumiGras';
  const pf = (opts.nomElement ?? fam.nom).toUpperCase(); const lf = ctx.measureText(pf).width + 28;
  ctx.fillStyle = degrade(ctx, fam.fond, 46, 0, 46 + lf, 0); arrondi(ctx, 46, nomY + 18, lf, 30, 15); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.fillText(pf, 60, nomY + 39);
  const nomRar = (opts.nomRarete ?? rar.nom).toUpperCase();
  const lr = ctx.measureText(nomRar).width + 28;
  ctx.strokeStyle = rar.texte; ctx.lineWidth = 2; arrondi(ctx, 56 + lf, nomY + 18, lr, 30, 15); ctx.stroke();
  ctx.fillStyle = rar.texte; ctx.fillText(nomRar, 70 + lf, nomY + 39);
  // stats
  const sy = nomY + 90;
  const [l1, l2] = opts.libelles ?? ['PUISSANCE', 'ÉCLAT'];
  barre(ctx, 46, sy, 240, l1, c.puissance ?? 50, '#ff9d1b');
  barre(ctx, 314, sy, 240, l2, c.eclat ?? 50, rar.cadre[1] ?? '#ffd36a');
  // petite phrase (cartes a cadre)
  if (!pleine && opts.phrase) {
    ctx.fillStyle = 'rgba(255,255,255,0.62)'; ctx.font = '19px WumiGras';
    ctx.fillText(opts.phrase, 46, sy + 72, W - 92);
  }
  // pied
  ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.font = '15px WumiGras';
  ctx.fillText(`wumi. · ${opts.nomSerie ?? 'Série 1'} · ${String(c.numero).padStart(3, '0')}/${String(opts.total ?? 72).padStart(3, '0')}`, 46, H - 40);
  ctx.restore();

  // cadre de rarete par-dessus tout
  const ep = { commune: 8, peu_commune: 10, rare: 10, epique: 12, legendaire: 16, mythique: 16 }[c.rarete];
  cadre(ctx, rar, 0, 0, W, H, 34, ep);
  if (pleine) { // double filet interieur
    ctx.strokeStyle = c.rarete === 'mythique' ? 'rgba(255,255,255,0.7)' : 'rgba(255,241,168,0.85)'; ctx.lineWidth = 2;
    arrondi(ctx, ep + 6, ep + 6, W - (ep + 6) * 2, H - (ep + 6) * 2, 24); ctx.stroke();
    // ruban de rarete
    const nr = (opts.nomRarete ?? rar.nom).toUpperCase();
    ctx.font = '18px WumiTitre'; const lt = ctx.measureText(nr).width + 40;
    ctx.fillStyle = degrade(ctx, rar.cadre, W / 2 - lt / 2, 0, W / 2 + lt / 2, 0);
    ctx.beginPath(); ctx.roundRect(W / 2 - lt / 2, 0, lt, 34, [0, 0, 14, 14]); ctx.fill();
    ctx.fillStyle = BRUN; ctx.textAlign = 'center'; ctx.fillText(nr, W / 2, 24); ctx.textAlign = 'left';
  }
  if (opts.brillante) brillante(ctx, c, opts);
  return cv;
}

/** Carte brillante : voile holo arc-en-ciel, etincelles et pastille. */
function brillante(ctx, c, opts) {
  ctx.save(); arrondi(ctx, 0, 0, W, H, 34); ctx.clip();
  const g = ctx.createLinearGradient(0, 0, W, H);
  ['255,107,214', '255,211,106', '107,255,184', '107,200,255', '180,107,255'].forEach((col, i) => g.addColorStop(i / 4, `rgba(${col},0.22)`));
  ctx.globalCompositeOperation = 'overlay'; ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); ctx.globalCompositeOperation = 'source-over';
  const r = graine(c.numero * 13);
  for (let i = 0; i < 16; i++) etincelle(ctx, 30 + r() * (W - 60), 90 + r() * 420, 5 + r() * 10, '#fff6c8', 0.95);
  ctx.restore();
  const t = (opts.nomBrillante ?? 'BRILLANTE').toUpperCase();
  ctx.font = '17px WumiTitre'; const lt = ctx.measureText(t).width + 50;
  ctx.fillStyle = 'rgba(18,13,8,0.75)'; arrondi(ctx, 40, 92, lt, 34, 17); ctx.fill();
  etincelle(ctx, 60, 109, 8, '#fff6c8'); ctx.fillStyle = '#fff6c8'; ctx.fillText(t, 76, 115);
}


module.exports = { carte, W, H };

/** Le paquet ferme (booster), DA v3 : sachet orange, Wumi et deux amis. */
function booster(opts = {}) {
  chargerPolices();
  const w = 420; const h = 640;
  const cv = createCanvas(w, h);
  const ctx = cv.getContext('2d');
  const sachet = () => {
    ctx.beginPath(); ctx.moveTo(20, 30);
    for (let x = 20; x <= w - 20; x += 20) ctx.lineTo(x + 10, x % 40 ? 18 : 30);
    ctx.lineTo(w - 20, h - 30);
    for (let x = w - 20; x >= 20; x -= 20) ctx.lineTo(x - 10, x % 40 ? h - 18 : h - 30);
    ctx.closePath();
  };
  sachet();
  ctx.fillStyle = degrade(ctx, ['#ffcf6a', '#ff9d1b', '#d9600a'], 0, 0, w, h); ctx.fill();
  ctx.save(); sachet(); ctx.clip();
  rayons(ctx, w / 2, 330, 600, 'rgba(255,255,255,0.10)', 20);
  const hg = ctx.createLinearGradient(0, 0, w, h);
  ['255,107,214', '255,255,255', '107,200,255', '255,255,255'].forEach((c, i) => hg.addColorStop(i / 3, `rgba(${c},0.14)`));
  ctx.fillStyle = hg; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = 'rgba(34,27,16,0.88)'; ctx.fillRect(0, 60, w, 92); ctx.fillRect(0, h - 150, w, 96);
  ctx.fillStyle = '#ffd36a'; ctx.fillRect(0, 60, w, 4); ctx.fillRect(0, 148, w, 4); ctx.fillRect(0, h - 150, w, 4); ctx.fillRect(0, h - 58, w, 4);
  const r = graine(3);
  for (let i = 0; i < 14; i++) etincelle(ctx, 30 + r() * (w - 60), 170 + r() * 300, 4 + r() * 9, '#fff', 0.9);
  // la bande
  perso(ctx, 88, 400, 130, { corps: 'bloop', yeux: 'joie' });
  perso(ctx, 332, 400, 130, { corps: 'robot', yeux: 'etoiles' });
  perso(ctx, w / 2, 300, 210, { corps: 'wumi', yeux: 'etoiles', acc: ['etincelles'] });
  ctx.restore();
  ctx.lineWidth = 8; ctx.strokeStyle = '#221b10'; sachet(); ctx.stroke();
  ctx.textAlign = 'center';
  ctx.fillStyle = '#fff'; ctx.font = '60px WumiTitre'; ctx.fillText(opts.haut ?? 'wumi.', w / 2, 128);
  ctx.fillStyle = '#ffd36a'; ctx.font = '26px WumiTitre'; ctx.fillText(opts.titre ?? 'CARTES', w / 2, h - 104);
  ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.font = '19px WumiGras'; ctx.fillText(opts.sous ?? 'Série 1 · 5 cartes', w / 2, h - 74);
  if (opts.nombre > 1) {
    ctx.fillStyle = '#221b10'; ctx.beginPath(); ctx.arc(w - 62, 200, 44, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#ffd36a'; ctx.lineWidth = 4; ctx.stroke();
    ctx.fillStyle = '#ffd36a'; ctx.font = '34px WumiTitre'; ctx.fillText(`×${opts.nombre}`, w - 62, 213);
  }
  ctx.textAlign = 'left';
  return cv;
}

module.exports.booster = booster;
