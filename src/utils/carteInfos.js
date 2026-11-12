/**
 * Les fiches visuelles de /serverinfo et /userinfo (Wumi 2.13).
 *
 * Meme grammaire que les bannieres Wumi : fond nuit, halo bleu, tuiles
 * translucides. Le decor du haut reprend la banniere du serveur ou du membre
 * quand il en a une (assombrie pour que le texte reste lisible).
 *
 * Les textes arrivent deja traduits (champ `l` = libelles) : ce fichier ne
 * fait que dessiner.
 */
const { createCanvas, loadImage } = require('@napi-rs/canvas');
const { chargerPolices } = require('./polices');
const { rectArrondi, cercleImage, tronquerTexte } = require('./canvasOutils');

const L = 1200;
const P = 'Poppins';
const COUL = {
  fond: '#0b0e1c',
  carte: 'rgba(255, 255, 255, 0.055)',
  bordure: 'rgba(255, 255, 255, 0.09)',
  texte: '#eef0fb',
  doux: '#a3a9c9',
  discret: '#6f7598',
  bleu: '#58a6ff',
  violet: '#a78bfa',
  vert: '#4ade80',
  rouge: '#f87171',
};

async function image(url) {
  if (!url) return null;
  try { return await loadImage(url); } catch { return null; }
}

/** Fond nuit + decor du haut (banniere floutee ou halo). */
function decor(ctx, H, banniere, accent) {
  ctx.fillStyle = COUL.fond;
  ctx.fillRect(0, 0, L, H);
  const hautDecor = 210;
  if (banniere) {
    // Couvre la largeur, centre verticalement, puis voile sombre en degrade.
    const ratio = Math.max(L / banniere.width, hautDecor / banniere.height);
    const lb = banniere.width * ratio;
    const hb = banniere.height * ratio;
    ctx.save();
    ctx.globalAlpha = 0.85;
    ctx.drawImage(banniere, (L - lb) / 2, (hautDecor - hb) / 2, lb, hb);
    ctx.restore();
    const g = ctx.createLinearGradient(0, 0, 0, hautDecor + 40);
    g.addColorStop(0, 'rgba(11,14,28,0.25)');
    g.addColorStop(1, 'rgba(11,14,28,1)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, L, hautDecor + 40);
  } else {
    let g = ctx.createRadialGradient(180, 60, 10, 180, 60, 620);
    g.addColorStop(0, accent ? `${accent}cc` : 'rgba(58,120,182,0.9)');
    g.addColorStop(1, 'rgba(11,14,28,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, L, H);
    g = ctx.createRadialGradient(L - 60, H, 10, L - 60, H, 700);
    g.addColorStop(0, 'rgba(88,86,140,0.45)');
    g.addColorStop(1, 'rgba(11,14,28,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, L, H);
  }
  // Grille legere, comme les bannieres
  ctx.strokeStyle = 'rgba(255,255,255,0.03)';
  ctx.lineWidth = 1;
  for (let x = 0; x <= L; x += 60) { ctx.beginPath(); ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, H); ctx.stroke(); }
  for (let y = 0; y <= H; y += 60) { ctx.beginPath(); ctx.moveTo(0, y + 0.5); ctx.lineTo(L, y + 0.5); ctx.stroke(); }
}

/** Avatar ou icone rond, avec anneau. */
function rond(ctx, img, x, y, taille, accent, initiale) {
  ctx.beginPath();
  ctx.arc(x + taille / 2, y + taille / 2, taille / 2 + 8, 0, Math.PI * 2);
  ctx.fillStyle = COUL.fond;
  ctx.fill();
  if (img) cercleImage(ctx, img, x, y, taille);
  else {
    ctx.beginPath();
    ctx.arc(x + taille / 2, y + taille / 2, taille / 2, 0, Math.PI * 2);
    ctx.fillStyle = accent ?? COUL.bleu;
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = `${Math.round(taille * 0.45)}px "${P} Bold", sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText((initiale || '?').charAt(0).toUpperCase(), x + taille / 2, y + taille * 0.65);
    ctx.textAlign = 'left';
  }
  ctx.beginPath();
  ctx.arc(x + taille / 2, y + taille / 2, taille / 2 + 3, 0, Math.PI * 2);
  ctx.strokeStyle = accent ?? COUL.bleu;
  ctx.lineWidth = 5;
  ctx.stroke();
}

/** Tuile : petit intitule, grosse valeur, complement colore facultatif. */
function tuile(ctx, x, y, l, h, intitule, valeur, complement, couleurComplement) {
  rectArrondi(ctx, x, y, l, h, 18);
  ctx.fillStyle = COUL.carte;
  ctx.fill();
  ctx.strokeStyle = COUL.bordure;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.textAlign = 'left';
  ctx.font = `14px "${P} Medium", sans-serif`;
  ctx.fillStyle = COUL.doux;
  ctx.fillText(tronquerTexte(ctx, intitule.toUpperCase(), l - 36), x + 20, y + 32);
  for (const taille of [36, 32, 28, 24, 20]) {
    ctx.font = `${taille}px "${P} Bold", sans-serif`;
    if (ctx.measureText(valeur).width <= l - 40 || taille === 20) break;
  }
  ctx.fillStyle = COUL.texte;
  ctx.fillText(tronquerTexte(ctx, valeur, l - 40), x + 20, y + 74);
  if (complement) {
    ctx.font = `15px "${P}", sans-serif`;
    ctx.fillStyle = couleurComplement ?? COUL.discret;
    ctx.fillText(tronquerTexte(ctx, complement, l - 40), x + 20, y + 100);
  }
}

/** En-tete : rond + nom + sous-titre. */
function entete(ctx, img, nom, sous, accent, ligne3) {
  rond(ctx, img, 56, 120, 150, accent, nom);
  ctx.textAlign = 'left';
  ctx.fillStyle = COUL.texte;
  for (const taille of [52, 46, 40, 34]) {
    ctx.font = `${taille}px "${P} Bold", sans-serif`;
    if (ctx.measureText(nom).width <= 900 || taille === 34) break;
  }
  ctx.fillText(tronquerTexte(ctx, nom, 920), 240, 200);
  ctx.font = `20px "${P}", sans-serif`;
  ctx.fillStyle = COUL.doux;
  ctx.fillText(tronquerTexte(ctx, sous, 920), 242, 234);
  if (ligne3) {
    ctx.font = `16px "${P} Medium", sans-serif`;
    ctx.fillStyle = COUL.discret;
    ctx.fillText(tronquerTexte(ctx, ligne3, 920), 242, 262);
  }
}

function signature(ctx, H) {
  ctx.textAlign = 'right';
  ctx.font = `18px "${P} Bold", sans-serif`;
  ctx.fillStyle = COUL.discret;
  ctx.fillStyle = COUL.bleu;
  ctx.fillText('.', L - 52, H - 26);
  const point = ctx.measureText('.').width;
  ctx.fillStyle = COUL.discret;
  ctx.fillText('wumi', L - 52 - point - 1, H - 26);
  ctx.textAlign = 'left';
}

/**
 * @param {object} d { nom, sous, ligne3, icone, banniere,
 *   tuiles: [{intitule, valeur, complement, couleur}] (4),
 *   boost: { niveau, boosts, prochain, libelle }, activite: number[] (14 j), l: { activite } }
 */
async function genererCarteServeur(d) {
  chargerPolices();
  const H = 560;
  const canvas = createCanvas(L, H);
  const ctx = canvas.getContext('2d');
  decor(ctx, H, await image(d.banniere), null);
  entete(ctx, await image(d.icone), d.nom, d.sous, COUL.bleu, d.ligne3);

  const y = 300;
  const lt = (L - 112 - 3 * 16) / 4;
  d.tuiles.slice(0, 4).forEach((x, i) => tuile(ctx, 56 + i * (lt + 16), y, lt, 116, x.intitule, x.valeur, x.complement, x.couleur));

  // Bas : boosts (barre vers le palier suivant) + petite courbe d'activite.
  const yb = 436;
  const lb = (L - 112 - 16) * 0.55;
  rectArrondi(ctx, 56, yb, lb, 88, 18);
  ctx.fillStyle = COUL.carte; ctx.fill();
  ctx.strokeStyle = COUL.bordure; ctx.lineWidth = 1.5; ctx.stroke();
  ctx.font = `14px "${P} Medium", sans-serif`;
  ctx.fillStyle = COUL.doux;
  ctx.fillText(d.boost.libelle.toUpperCase(), 76, yb + 30);
  ctx.textAlign = 'right';
  ctx.fillStyle = COUL.texte;
  ctx.font = `15px "${P} Bold", sans-serif`;
  ctx.fillText(d.boost.droite, 56 + lb - 20, yb + 30);
  ctx.textAlign = 'left';
  const bx = 76; const by = yb + 50; const bl = lb - 40; const bh = 16;
  rectArrondi(ctx, bx, by, bl, bh, 8); ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.fill();
  const part = Math.max(0.02, Math.min(1, d.boost.part));
  const g = ctx.createLinearGradient(bx, 0, bx + bl, 0);
  g.addColorStop(0, '#f47fff'); g.addColorStop(1, COUL.violet);
  rectArrondi(ctx, bx, by, bl * part, bh, 8); ctx.fillStyle = g; ctx.fill();

  const xa = 56 + lb + 16;
  const la = L - 56 - xa;
  rectArrondi(ctx, xa, yb, la, 88, 18);
  ctx.fillStyle = COUL.carte; ctx.fill();
  ctx.strokeStyle = COUL.bordure; ctx.stroke();
  ctx.font = `14px "${P} Medium", sans-serif`;
  ctx.fillStyle = COUL.doux;
  ctx.fillText(d.l.activite.toUpperCase(), xa + 20, yb + 30);
  const serie = d.activite ?? [];
  const max = Math.max(1, ...serie);
  if (serie.length > 1 && serie.some((v) => v > 0)) {
    const gx = xa + 20; const gy = yb + 42; const gl = la - 40; const gh = 34;
    const px = (i) => gx + (i * gl) / (serie.length - 1);
    const py = (v) => gy + gh - (v / max) * gh;
    ctx.beginPath(); ctx.moveTo(px(0), gy + gh);
    serie.forEach((v, i) => ctx.lineTo(px(i), py(v)));
    ctx.lineTo(px(serie.length - 1), gy + gh); ctx.closePath();
    ctx.fillStyle = 'rgba(88,166,255,0.18)'; ctx.fill();
    ctx.beginPath();
    serie.forEach((v, i) => (i ? ctx.lineTo(px(i), py(v)) : ctx.moveTo(px(i), py(v))));
    ctx.strokeStyle = COUL.bleu; ctx.lineWidth = 2.5; ctx.lineJoin = 'round'; ctx.stroke();
  } else {
    ctx.font = `15px "${P}", sans-serif`;
    ctx.fillStyle = COUL.discret;
    ctx.fillText('—', xa + 20, yb + 66);
  }
  return canvas.encode('png');
}

/**
 * @param {object} d { nom, sous, ligne3, avatar, banniere, accent,
 *   tuiles: [...] (4), roles: [{nom, couleur}], l: { roles, aucun } }
 */
async function genererCarteMembre(d) {
  chargerPolices();
  const H = 540;
  const canvas = createCanvas(L, H);
  const ctx = canvas.getContext('2d');
  decor(ctx, H, await image(d.banniere), d.accent);
  entete(ctx, await image(d.avatar), d.nom, d.sous, d.accent, d.ligne3);

  const y = 300;
  const lt = (L - 112 - 3 * 16) / 4;
  d.tuiles.slice(0, 4).forEach((x, i) => tuile(ctx, 56 + i * (lt + 16), y, lt, 116, x.intitule, x.valeur, x.complement, x.couleur));

  // Roles en pastilles
  const yr = 446;
  ctx.font = `14px "${P} Medium", sans-serif`;
  ctx.fillStyle = COUL.doux;
  ctx.fillText(d.l.roles.toUpperCase(), 58, yr);
  let x = 56;
  const yp = yr + 14;
  ctx.font = `16px "${P} Medium", sans-serif`;
  const roles = d.roles ?? [];
  if (!roles.length) {
    ctx.fillStyle = COUL.discret;
    ctx.fillText(d.l.aucun, 58, yp + 26);
  }
  for (const r of roles) {
    const texte = tronquerTexte(ctx, r.nom, 220);
    const lp = ctx.measureText(texte).width + 44;
    if (x + lp > L - 150) break;
    rectArrondi(ctx, x, yp, lp, 38, 19);
    ctx.fillStyle = 'rgba(255,255,255,0.06)'; ctx.fill();
    ctx.strokeStyle = COUL.bordure; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.beginPath(); ctx.arc(x + 19, yp + 19, 6, 0, Math.PI * 2);
    ctx.fillStyle = r.couleur && r.couleur !== '#000000' ? r.couleur : COUL.discret; ctx.fill();
    ctx.fillStyle = COUL.texte;
    ctx.fillText(texte, x + 32, yp + 25);
    x += lp + 10;
  }
  signature(ctx, H);
  return canvas.encode('png');
}

module.exports = { genererCarteServeur, genererCarteMembre, COUL };
