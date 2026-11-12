/**
 * L'image du CLASSEMENT (/classement), Wumi 2.14.
 *
 * Une carte nuit : en-tete du serveur (icone, nom, periode, page), une
 * pastille avec le type de classement, puis deux colonnes de cinq lignes.
 * Chaque ligne : rang, avatar, pseudo, valeur, et une barre proportionnelle
 * au premier de la page — on voit d'un coup d'oeil les ecarts. La ligne de la
 * personne qui a tape la commande est mise en avant, et sa place est rappelee
 * en bas meme si elle n'est pas sur la page.
 */
const { createCanvas, loadImage } = require('@napi-rs/canvas');
const { chargerPolices } = require('./polices');
const { rectArrondi, cercleImage, tronquerTexte } = require('./canvasOutils');
const { dessinerPiece } = require('./pieceWumi');

const L = 1600;
const P = 'Poppins';
const COUL = {
  fond: '#0a0c18',
  carte: '#10142a',
  ligne: 'rgba(255,255,255,0.035)',
  ligneMoi: 'rgba(88,166,255,0.13)',
  bordure: 'rgba(255,255,255,0.08)',
  bordureMoi: 'rgba(120,150,255,0.55)',
  texte: '#eef0fb',
  doux: '#a3a9c9',
  discret: '#6f7598',
  piste: 'rgba(255,255,255,0.07)',
  bleu: '#58a6ff',
  violet: '#8b8cff',
  or: '#f5c451',
  argent: '#c9d1e3',
  bronze: '#e0975a',
};

async function image(url) {
  if (!url) return null;
  try { return await loadImage(url); } catch { return null; }
}

function initiales(nom) {
  const mots = String(nom ?? '?').replace(/[^\p{L}\p{N} ]/gu, ' ').trim().split(/\s+/).filter(Boolean);
  return ((mots[0]?.[0] ?? '?') + (mots[1]?.[0] ?? '')).toUpperCase();
}

/** Petite fleche montante (pictogramme de la pastille). */
function fleche(ctx, x, y, couleur) {
  ctx.save();
  ctx.strokeStyle = couleur;
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(x, y + 14); ctx.lineTo(x + 9, y + 5); ctx.lineTo(x + 15, y + 11); ctx.lineTo(x + 26, y);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x + 18, y); ctx.lineTo(x + 26, y); ctx.lineTo(x + 26, y + 8);
  ctx.stroke();
  ctx.restore();
}

/**
 * @param {object} d
 * @param {string} d.serveur
 * @param {string} [d.icone]
 * @param {string} d.sousTitre          « 30 derniers jours · page 1/3 »
 * @param {string} d.pastille           « Classement des niveaux »
 * @param {{rang, nom, avatar, valeur, part, moi}[]} d.lignes  10 maximum
 * @param {string} [d.pied]             « Ta place : #3 · 19,8k XP »
 * @param {boolean} [d.piece]           montants : la piece de Wumi Run en pictogramme et devant chaque valeur
 * @returns {Promise<Buffer>}
 */
async function genererCarteClassement(d) {
  chargerPolices();
  const lignes = d.lignes.slice(0, 10);
  const parColonne = 5;
  const hLigne = 112;
  const ecart = 14;
  const haut = 210;
  const H = haut + parColonne * (hLigne + ecart) + 90;
  const canvas = createCanvas(L, H);
  const ctx = canvas.getContext('2d');

  // ------------------------------------------------------------- DECOR
  ctx.fillStyle = COUL.fond;
  ctx.fillRect(0, 0, L, H);
  rectArrondi(ctx, 24, 24, L - 48, H - 48, 34);
  ctx.save();
  ctx.clip();
  ctx.fillStyle = COUL.carte;
  ctx.fillRect(0, 0, L, H);
  let g = ctx.createRadialGradient(260, 40, 10, 260, 40, 900);
  g.addColorStop(0, 'rgba(70,100,220,0.30)');
  g.addColorStop(1, 'rgba(16,20,42,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, L, H);
  g = ctx.createRadialGradient(L - 120, H - 60, 10, L - 120, H - 60, 800);
  g.addColorStop(0, 'rgba(120,90,220,0.18)');
  g.addColorStop(1, 'rgba(16,20,42,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, L, H);
  // Le « W. » de Wumi en filigrane, a droite
  ctx.globalAlpha = 0.035;
  ctx.fillStyle = '#ffffff';
  ctx.font = `760px "${P} Bold", sans-serif`;
  ctx.fillText('w.', L - 820, H - 60);
  ctx.globalAlpha = 1;
  ctx.restore();
  rectArrondi(ctx, 24.5, 24.5, L - 49, H - 49, 34);
  ctx.strokeStyle = 'rgba(120,140,255,0.22)';
  ctx.lineWidth = 2;
  ctx.stroke();

  // ------------------------------------------------------------ EN-TETE
  const xi = 80;
  const yi = 74;
  const ti = 92;
  const icone = await image(d.icone);
  rectArrondi(ctx, xi, yi, ti, ti, 22);
  ctx.save();
  ctx.clip();
  if (icone) ctx.drawImage(icone, xi, yi, ti, ti);
  else {
    const gi = ctx.createLinearGradient(xi, yi, xi + ti, yi + ti);
    gi.addColorStop(0, '#5b7cfa'); gi.addColorStop(1, '#7c6cf0');
    ctx.fillStyle = gi;
    ctx.fillRect(xi, yi, ti, ti);
    ctx.fillStyle = '#fff';
    ctx.font = `38px "${P} Bold", sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(initiales(d.serveur), xi + ti / 2, yi + ti / 2 + 14);
    ctx.textAlign = 'left';
  }
  ctx.restore();

  ctx.fillStyle = COUL.texte;
  for (const taille of [48, 42, 36]) {
    ctx.font = `${taille}px "${P} Bold", sans-serif`;
    if (ctx.measureText(d.serveur).width <= 860 || taille === 36) break;
  }
  ctx.fillText(tronquerTexte(ctx, d.serveur, 860), xi + ti + 30, yi + 48);
  ctx.font = `24px "${P}", sans-serif`;
  ctx.fillStyle = COUL.doux;
  ctx.fillText(tronquerTexte(ctx, d.sousTitre, 860), xi + ti + 32, yi + 86);

  // Pastille du type de classement
  ctx.font = `24px "${P} Medium", sans-serif`;
  const lp = ctx.measureText(d.pastille).width + 110;
  const xp = L - 80 - lp;
  const yp = yi + 14;
  rectArrondi(ctx, xp, yp, lp, 64, 32);
  ctx.fillStyle = 'rgba(88,120,255,0.10)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(120,140,255,0.45)';
  ctx.lineWidth = 2;
  ctx.stroke();
  if (d.piece) dessinerPiece(ctx, xp + 28, yp + 14, 36);
  else fleche(ctx, xp + 30, yp + 25, COUL.violet);
  ctx.fillStyle = COUL.texte;
  ctx.fillText(d.pastille, xp + 76, yp + 41);

  // ------------------------------------------------------------- LIGNES
  const xGauche = 80;
  const lCol = (L - 160 - 30) / 2;
  const avatars = await Promise.all(lignes.map((l) => image(l.avatar)));
  lignes.forEach((l, i) => {
    const col = i < parColonne ? 0 : 1;
    const x = xGauche + col * (lCol + 30);
    const y = haut + (i % parColonne) * (hLigne + ecart);
    rectArrondi(ctx, x, y, lCol, hLigne, 22);
    ctx.fillStyle = l.moi ? COUL.ligneMoi : COUL.ligne;
    ctx.fill();
    ctx.strokeStyle = l.moi ? COUL.bordureMoi : COUL.bordure;
    ctx.lineWidth = l.moi ? 2.5 : 1.5;
    ctx.stroke();

    // Rang : or / argent / bronze pour le podium
    const couleurRang = { 1: COUL.or, 2: COUL.argent, 3: COUL.bronze }[l.rang] ?? COUL.doux;
    ctx.fillStyle = couleurRang;
    ctx.font = `${l.rang >= 100 ? 26 : 32}px "${P} Bold", sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(`#${l.rang}`, x + 58, y + hLigne / 2 + 11);
    ctx.textAlign = 'left';

    // Avatar
    const ta = 64;
    const xa = x + 106;
    const ya = y + (hLigne - ta) / 2;
    if (avatars[i]) cercleImage(ctx, avatars[i], xa, ya, ta);
    else {
      ctx.beginPath();
      ctx.arc(xa + ta / 2, ya + ta / 2, ta / 2, 0, Math.PI * 2);
      ctx.fillStyle = '#2b3266';
      ctx.fill();
      ctx.fillStyle = COUL.texte;
      ctx.font = `24px "${P} Bold", sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(initiales(l.nom), xa + ta / 2, ya + ta / 2 + 9);
      ctx.textAlign = 'left';
    }
    if (l.rang <= 3) {
      ctx.beginPath();
      ctx.arc(xa + ta / 2, ya + ta / 2, ta / 2 + 3, 0, Math.PI * 2);
      ctx.strokeStyle = couleurRang;
      ctx.lineWidth = 3;
      ctx.stroke();
    }

    // Pseudo + valeur
    const xt = xa + ta + 24;
    const lt = x + lCol - 30 - xt;
    ctx.font = `28px "${P} Bold", sans-serif`;
    const valeurL = ctx.measureText(l.valeur).width + (d.piece ? 40 : 0);
    ctx.font = `28px "${P} Medium", sans-serif`;
    ctx.fillStyle = COUL.texte;
    ctx.fillText(tronquerTexte(ctx, l.nom, lt - valeurL - 24), xt, y + 48);
    ctx.font = `28px "${P} Bold", sans-serif`;
    ctx.textAlign = 'right';
    ctx.fillText(l.valeur, x + lCol - 30, y + 48);
    ctx.textAlign = 'left';
    if (d.piece) dessinerPiece(ctx, x + lCol - 30 - valeurL, y + 22, 32);

    // Barre
    const yb = y + 70;
    rectArrondi(ctx, xt, yb, lt, 12, 6);
    ctx.fillStyle = COUL.piste;
    ctx.fill();
    const gb = ctx.createLinearGradient(xt, 0, xt + lt, 0);
    // Montants : barre doree, aux couleurs de la piece de Wumi Run
    gb.addColorStop(0, d.piece ? '#f8bd2c' : COUL.bleu);
    gb.addColorStop(1, d.piece ? '#e39027' : COUL.violet);
    rectArrondi(ctx, xt, yb, Math.max(12, lt * Math.min(1, l.part)), 12, 6);
    ctx.fillStyle = gb;
    ctx.fill();
  });

  // --------------------------------------------------------------- PIED
  const yPied = H - 68;
  if (d.pied) {
    ctx.font = `22px "${P}", sans-serif`;
    ctx.fillStyle = COUL.doux;
    ctx.fillText(d.pied, 82, yPied);
  }
  ctx.textAlign = 'right';
  ctx.font = `26px "${P} Bold", sans-serif`;
  ctx.fillStyle = COUL.bleu;
  ctx.fillText('.', L - 82, yPied);
  const point = ctx.measureText('.').width;
  ctx.fillStyle = COUL.texte;
  ctx.fillText('wumi', L - 82 - point - 1, yPied);
  ctx.textAlign = 'left';

  return canvas.encode('png');
}

module.exports = { genererCarteClassement, initiales };
