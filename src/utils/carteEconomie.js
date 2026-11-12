/**
 * Les cartes image de l'ECONOMIE (Wumi 2.17).
 *
 * Meme famille visuelle que la carte de classement : fond nuit, halos doux,
 * filigrane « w. », Poppins. L'or de la piece de Wumi Run remplace le bleu
 * comme couleur d'accent.
 *
 *   genererCarteSolde  le portefeuille d'un membre (/economy solde)
 *   genererCarteGain   un gain : recompense quotidienne ou travail
 *
 * Aucun emoji dans le canvas : la police embarquee n'en contient pas, ils
 * sortiraient en carres vides. Tous les textes arrivent deja traduits.
 */
const { createCanvas, loadImage } = require('@napi-rs/canvas');
const { chargerPolices } = require('./polices');
const { rectArrondi, cercleImage, tronquerTexte } = require('./canvasOutils');
const { dessinerPiece } = require('./pieceWumi');
const { initiales } = require('./carteClassement');

const P = 'Poppins';
const COUL = {
  fond: '#0a0c18',
  carte: '#10142a',
  encart: 'rgba(255,255,255,0.04)',
  bordure: 'rgba(255,255,255,0.08)',
  texte: '#eef0fb',
  doux: '#a3a9c9',
  discret: '#6f7598',
  piste: 'rgba(255,255,255,0.07)',
  or: '#f8bd2c',
  orFonce: '#e39027',
  vert: '#4ade80',
  feu: '#ff8a3d',
};

async function image(url) {
  if (!url) return null;
  try { return await loadImage(url); } catch { return null; }
}

/** Fond nuit + halo dore + filigrane, commun aux deux cartes. */
function decor(ctx, L, H) {
  ctx.fillStyle = COUL.fond;
  ctx.fillRect(0, 0, L, H);
  rectArrondi(ctx, 20, 20, L - 40, H - 40, 30);
  ctx.save();
  ctx.clip();
  ctx.fillStyle = COUL.carte;
  ctx.fillRect(0, 0, L, H);
  let g = ctx.createRadialGradient(L - 200, 40, 10, L - 200, 40, 700);
  g.addColorStop(0, 'rgba(248,189,44,0.20)');
  g.addColorStop(1, 'rgba(16,20,42,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, L, H);
  g = ctx.createRadialGradient(120, H, 10, 120, H, 650);
  g.addColorStop(0, 'rgba(90,110,230,0.20)');
  g.addColorStop(1, 'rgba(16,20,42,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, L, H);
  ctx.globalAlpha = 0.03;
  ctx.fillStyle = '#ffffff';
  ctx.font = `${Math.round(H * 1.5)}px "${P} Bold", sans-serif`;
  ctx.fillText('w.', L - H * 1.25, H - 30);
  ctx.globalAlpha = 1;
  ctx.restore();
  rectArrondi(ctx, 20.5, 20.5, L - 41, H - 41, 30);
  ctx.strokeStyle = 'rgba(248,189,44,0.22)';
  ctx.lineWidth = 2;
  ctx.stroke();
}

/** Encart translucide. */
function encart(ctx, x, y, l, h, r = 20) {
  rectArrondi(ctx, x, y, l, h, r);
  ctx.fillStyle = COUL.encart;
  ctx.fill();
  ctx.strokeStyle = COUL.bordure;
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

/** Avatar rond, ou initiales sur fond bleu nuit. */
function avatar(ctx, img, nom, x, y, t, anneau = COUL.or) {
  if (img) cercleImage(ctx, img, x, y, t);
  else {
    ctx.beginPath();
    ctx.arc(x + t / 2, y + t / 2, t / 2, 0, Math.PI * 2);
    ctx.fillStyle = '#2b3266';
    ctx.fill();
    ctx.fillStyle = COUL.texte;
    ctx.font = `${Math.round(t * 0.36)}px "${P} Bold", sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(initiales(nom), x + t / 2, y + t / 2 + t * 0.13);
    ctx.textAlign = 'left';
  }
  ctx.beginPath();
  ctx.arc(x + t / 2, y + t / 2, t / 2 + 4, 0, Math.PI * 2);
  ctx.strokeStyle = anneau;
  ctx.lineWidth = 4;
  ctx.stroke();
}

/** Plus grande taille de police (Bold) pour que `texte` tienne dans `l`. */
function ajuster(ctx, texte, l, tailles, graisse = 'Bold') {
  for (const t of tailles) {
    ctx.font = `${t}px "${P} ${graisse}", sans-serif`;
    if (ctx.measureText(texte).width <= l) return t;
  }
  return tailles[tailles.length - 1];
}

/** Pastille arrondie (« #3 », « +20 % »...). Renvoie sa largeur. */
function pastille(ctx, texte, x, y, { fond = 'rgba(248,189,44,0.12)', bord = 'rgba(248,189,44,0.5)', couleur = COUL.or, taille = 22, alignDroite = false } = {}) {
  ctx.font = `${taille}px "${P} Bold", sans-serif`;
  const l = ctx.measureText(texte).width + taille * 1.4;
  const h = taille * 1.9;
  const x0 = alignDroite ? x - l : x;
  rectArrondi(ctx, x0, y, l, h, h / 2);
  ctx.fillStyle = fond;
  ctx.fill();
  ctx.strokeStyle = bord;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = couleur;
  ctx.textAlign = 'center';
  ctx.fillText(texte, x0 + l / 2, y + h / 2 + taille * 0.36);
  ctx.textAlign = 'left';
  return l;
}

/**
 * Les 10 crans de la serie quotidienne (bonus plafonne a +100 % au jour 11).
 * Les crans gagnes sont dores, le prochain clignote en contour.
 */
function crans(ctx, x, y, l, serie) {
  const n = 10;
  const ecart = 8;
  const lc = (l - ecart * (n - 1)) / n;
  for (let i = 0; i < n; i++) {
    const xi = x + i * (lc + ecart);
    rectArrondi(ctx, xi, y, lc, 14, 7);
    if (i < Math.min(serie, n)) {
      const g = ctx.createLinearGradient(xi, 0, xi + lc, 0);
      g.addColorStop(0, COUL.or);
      g.addColorStop(1, COUL.orFonce);
      ctx.fillStyle = g;
      ctx.fill();
    } else {
      ctx.fillStyle = COUL.piste;
      ctx.fill();
      if (i === serie) {
        ctx.strokeStyle = 'rgba(248,189,44,0.6)';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }
  }
}

/** Petite flamme vectorielle (serie). */
function flamme(ctx, x, y, t) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(t / 32, t / 32);
  ctx.beginPath();
  ctx.moveTo(16, 0);
  ctx.bezierCurveTo(22, 9, 29, 13, 28, 22);
  ctx.bezierCurveTo(27, 29, 22, 32, 16, 32);
  ctx.bezierCurveTo(9, 32, 4, 28, 4, 21);
  ctx.bezierCurveTo(4, 15, 8, 12, 10, 8);
  ctx.bezierCurveTo(11, 13, 13, 15, 15, 15);
  ctx.bezierCurveTo(14, 9, 14, 5, 16, 0);
  ctx.closePath();
  const g = ctx.createLinearGradient(0, 0, 0, 32);
  g.addColorStop(0, '#ffd166');
  g.addColorStop(1, COUL.feu);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(16, 24, 5, 7, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,240,200,0.85)';
  ctx.fill();
  ctx.restore();
}

/** Signature « wumi. » en bas a droite. */
function signature(ctx, L, y) {
  ctx.textAlign = 'right';
  ctx.font = `24px "${P} Bold", sans-serif`;
  ctx.fillStyle = COUL.or;
  ctx.fillText('.', L - 64, y);
  const point = ctx.measureText('.').width;
  ctx.fillStyle = COUL.texte;
  ctx.fillText('wumi', L - 64 - point - 1, y);
  ctx.textAlign = 'left';
}

/**
 * Le portefeuille.
 * @param {object} d
 * @param {string} d.nom
 * @param {string} [d.avatar]
 * @param {string} d.total          montant formate (« 12 480 »)
 * @param {string} d.monnaie        « pièces »
 * @param {string} [d.rang]         « #3 » (absent : non classe)
 * @param {{titre, valeur}[]} d.tuiles  3 tuiles : poche, banque, total gagne
 * @param {number} d.serie          jours d'affilee
 * @param {string} d.serieTitre     « Série quotidienne »
 * @param {string} d.serieTexte     « 4 jours · +30 % »
 * @param {string} d.daily          « Récompense prête » / « Dans 3 h »
 * @param {boolean} d.dailyPret
 * @param {string} d.libelleTotal   « Fortune totale »
 */
async function genererCarteSolde(d) {
  chargerPolices();
  const L = 1200;
  const H = 560;
  const c = createCanvas(L, H);
  const ctx = c.getContext('2d');
  decor(ctx, L, H);

  // En-tete : avatar, pseudo, rang
  const av = await image(d.avatar);
  avatar(ctx, av, d.nom, 64, 60, 96);
  ctx.fillStyle = COUL.texte;
  ajuster(ctx, d.nom, 640, [42, 36, 30]);
  ctx.fillText(tronquerTexte(ctx, d.nom, 640), 190, 104);
  ctx.font = `22px "${P}", sans-serif`;
  ctx.fillStyle = COUL.doux;
  ctx.fillText(d.libelleTotal, 191, 142);
  pastille(ctx, d.rang ?? '—', L - 64, 72, { alignDroite: true, taille: 26 });

  // Montant principal
  dessinerPiece(ctx, 64, 190, 92);
  ctx.fillStyle = COUL.texte;
  const tm = ajuster(ctx, d.total, 760, [84, 72, 60, 50]);
  ctx.fillText(d.total, 176, 190 + 46 + tm * 0.36);
  const lt = ctx.measureText(d.total).width;
  ctx.font = `30px "${P} Medium", sans-serif`;
  ctx.fillStyle = COUL.or;
  ctx.fillText(tronquerTexte(ctx, d.monnaie, L - 64 - (176 + lt + 18)), 176 + lt + 18, 190 + 46 + tm * 0.36);

  // Trois tuiles
  const yT = 318;
  const hT = 104;
  const ecart = 18;
  const lT = (L - 128 - ecart * 2) / 3;
  d.tuiles.slice(0, 3).forEach((tu, i) => {
    const x = 64 + i * (lT + ecart);
    encart(ctx, x, yT, lT, hT);
    ctx.font = `16px "${P} Medium", sans-serif`;
    ctx.fillStyle = COUL.discret;
    ctx.fillText(tu.titre.toUpperCase(), x + 22, yT + 34);
    ctx.fillStyle = COUL.texte;
    ajuster(ctx, tu.valeur, lT - 44, [34, 30, 26, 22]);
    ctx.fillText(tronquerTexte(ctx, tu.valeur, lT - 44), x + 22, yT + 78);
  });

  // Serie + recompense quotidienne
  const yS = 440;
  encart(ctx, 64, yS, L - 128, 72);
  flamme(ctx, 86, yS + 20, 32);
  ctx.font = `20px "${P} Bold", sans-serif`;
  ctx.fillStyle = COUL.texte;
  ctx.fillText(d.serieTexte, 130, yS + 44);
  const lst = ctx.measureText(d.serieTexte).width;
  crans(ctx, 130 + lst + 24, yS + 29, 300, d.serie);
  pastille(ctx, d.daily, L - 82, yS + 16, d.dailyPret
    ? { alignDroite: true, taille: 20, fond: 'rgba(74,222,128,0.12)', bord: 'rgba(74,222,128,0.55)', couleur: COUL.vert }
    : { alignDroite: true, taille: 20, fond: 'rgba(255,255,255,0.05)', bord: COUL.bordure, couleur: COUL.doux });

  return c.encode('png');
}

/**
 * Un gain (quotidien ou travail).
 * @param {object} d
 * @param {string} d.nom
 * @param {string} [d.avatar]
 * @param {string} d.titre          « Récompense quotidienne »
 * @param {string} d.montant        « +110 »
 * @param {string} d.monnaie
 * @param {string} d.sousTitre      activite du travail, ou base + bonus
 * @param {string} [d.badge]        « +10 % »
 * @param {number} [d.serie]        crans de serie (quotidien uniquement)
 * @param {string} [d.serieTexte]
 * @param {string} d.solde          « Solde : 556 pièces »
 */
async function genererCarteGain(d) {
  chargerPolices();
  const L = 1200;
  const H = d.serie != null ? 470 : 400;
  const c = createCanvas(L, H);
  const ctx = c.getContext('2d');
  decor(ctx, L, H);

  // Grosse piece a droite, avec un halo
  const tp = 180;
  const xp = L - 80 - tp;
  const yp = 64;
  const g = ctx.createRadialGradient(xp + tp / 2, yp + tp / 2, 10, xp + tp / 2, yp + tp / 2, tp);
  g.addColorStop(0, 'rgba(248,189,44,0.35)');
  g.addColorStop(1, 'rgba(248,189,44,0)');
  ctx.fillStyle = g;
  ctx.fillRect(xp - tp / 2, yp - tp / 2, tp * 2, tp * 2);
  dessinerPiece(ctx, xp, yp, tp);

  const av = await image(d.avatar);
  avatar(ctx, av, d.nom, 64, 62, 60);
  ctx.font = `26px "${P} Bold", sans-serif`;
  ctx.fillStyle = COUL.texte;
  ctx.fillText(tronquerTexte(ctx, d.titre, 560), 148, 90);
  ctx.font = `20px "${P}", sans-serif`;
  ctx.fillStyle = COUL.doux;
  ctx.fillText(tronquerTexte(ctx, d.nom, 560), 148, 118);

  // Montant gagne
  ctx.fillStyle = COUL.or;
  const tm = ajuster(ctx, d.montant, 560, [96, 84, 72, 60]);
  const yM = 160 + tm * 0.82;
  ctx.fillText(d.montant, 60, yM);
  const lm = ctx.measureText(d.montant).width;
  ctx.font = `32px "${P} Medium", sans-serif`;
  ctx.fillStyle = COUL.texte;
  ctx.fillText(tronquerTexte(ctx, d.monnaie, xp - 40 - (60 + lm + 16)), 60 + lm + 16, yM);
  if (d.badge) pastille(ctx, d.badge, 64, yM + 18, { taille: 20 });

  ctx.font = `21px "${P}", sans-serif`;
  ctx.fillStyle = COUL.doux;
  const xs = d.badge ? 64 + (ctx.measureText(d.badge).width + 28) + 30 : 64;
  ctx.fillText(tronquerTexte(ctx, d.sousTitre, xp - 40 - xs), xs, yM + 46);

  if (d.serie != null) {
    const yS = yM + 82;
    flamme(ctx, 64, yS, 28);
    ctx.font = `20px "${P} Bold", sans-serif`;
    ctx.fillStyle = COUL.texte;
    ctx.fillText(d.serieTexte, 102, yS + 22);
    const ls = ctx.measureText(d.serieTexte).width;
    crans(ctx, 102 + ls + 22, yS + 9, 380, d.serie);
  }

  // Pied : nouveau solde a gauche, signature a droite
  const yP = H - 58;
  dessinerPiece(ctx, 64, yP - 24, 30);
  ctx.font = `22px "${P} Medium", sans-serif`;
  ctx.fillStyle = COUL.doux;
  ctx.fillText(tronquerTexte(ctx, d.solde, L - 300), 104, yP);
  signature(ctx, L, yP);
  return c.encode('png');
}

module.exports = { genererCarteSolde, genererCarteGain };
