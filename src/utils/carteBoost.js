/**
 * La carte de BOOST (Wumi 2.28) : meme famille que la carte de montee de
 * niveau (decor, anneau, pastilles), aux couleurs du Nitro.
 *
 *   avatar dans un anneau rose, badge « TIER 2 » dessous ;
 *   « SERVER BOOST », le pseudo, le nombre de boosts du serveur en grand ;
 *   la barre vers le palier suivant (2, 7, 14 boosts) ;
 *   des pastilles : role debloque, nom du serveur.
 *
 * Tous les textes arrivent deja traduits dans `d.textes`.
 */
const { createCanvas } = require('@napi-rs/canvas');
const { chargerPolices } = require('./polices');
const { rectArrondi, tronquerTexte } = require('./canvasOutils');
const { outils } = require('./carteNiveau');

const { decor, avatarAnneau, badgeNiveau, pastille, degrade, image, COUL, L, H, P } = outils;
const ROSE = { a: '#ff8ef0', b: '#9b6bff', rgb: '244,127,255' };
const PALIERS = [2, 7, 14];

/** Le palier suivant : { n, requis } ou null si le maximum est atteint. */
function suivant(boosts) {
  const i = PALIERS.findIndex((p) => boosts < p);
  return i === -1 ? null : { n: i + 1, requis: PALIERS[i] };
}

/** Un petit losange (le « gem » du boost), dessine au trait. */
function gemme(ctx, x, y, t, c) {
  ctx.save();
  ctx.fillStyle = degrade(ctx, x - t, x + t, c);
  ctx.shadowColor = `rgba(${c.rgb},0.7)`;
  ctx.shadowBlur = 16;
  ctx.beginPath();
  ctx.moveTo(x, y - t);
  ctx.lineTo(x + t * 0.8, y);
  ctx.lineTo(x, y + t);
  ctx.lineTo(x - t * 0.8, y);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/**
 * @param {object} d
 *   pseudo, avatarUrl, boosts (du serveur), palier (0-3), serveur, roles (noms),
 *   nombre (formateur, facultatif),
 *   textes: { titre, boosts, barre, max, badge, role }
 *     ex. { titre: 'SERVER BOOST', boosts: 'BOOSTS', barre: '{a} / {b} boosts to tier {n}',
 *           max: 'Max tier reached', badge: 'TIER {n}', role: 'Unlocked: {r}' }
 */
async function genererCarteBoost(d) {
  chargerPolices();
  const fmt = d.nombre ?? ((n) => n.toLocaleString('en-US'));
  const c = ROSE;
  const cv = createCanvas(L, H);
  const ctx = cv.getContext('2d');
  decor(ctx, c);

  // ---- Avatar
  const cx = 200;
  const cy = 186;
  const r = 104;
  avatarAnneau(ctx, await image(d.avatarUrl), d.pseudo, cx, cy, r, 1, c);
  badgeNiveau(ctx, d.textes.badge.replace('{n}', String(d.palier ?? 0)), cx, cy + r + 2, c);

  // ---- Titre
  const x = 400;
  const lmax = L - x - 70;
  gemme(ctx, x + 9, 84, 13, c);
  ctx.font = `22px "${P} Bold", sans-serif`;
  ctx.fillStyle = c.a;
  const titre = d.textes.titre.split('').join(String.fromCharCode(8202));
  ctx.fillText(titre, x + 32, 92);
  const lt = ctx.measureText(titre).width + 32;
  ctx.fillStyle = degrade(ctx, x + lt + 16, x + lt + 140, c);
  rectArrondi(ctx, x + lt + 16, 83, 110, 3, 1.5);
  ctx.globalAlpha = 0.5;
  ctx.fill();
  ctx.globalAlpha = 1;

  // ---- Pseudo
  ctx.font = `40px "${P} Medium", sans-serif`;
  ctx.fillStyle = COUL.texte;
  ctx.fillText(tronquerTexte(ctx, d.pseudo, lmax), x, 142);

  // ---- Nombre de boosts en grand
  const yN = 232;
  ctx.font = `76px "${P} Bold", sans-serif`;
  const n = fmt(d.boosts);
  ctx.fillStyle = degrade(ctx, x, x + ctx.measureText(n).width, c);
  ctx.shadowColor = `rgba(${c.rgb},0.55)`;
  ctx.shadowBlur = 24;
  ctx.fillText(n, x, yN + 8);
  ctx.shadowBlur = 0;
  const ln = ctx.measureText(n).width;
  ctx.font = `30px "${P} Medium", sans-serif`;
  ctx.fillStyle = COUL.discret;
  ctx.fillText(d.textes.boosts, x + ln + 18, yN);

  // ---- Barre vers le palier suivant
  const yB = 268;
  const s = suivant(d.boosts);
  rectArrondi(ctx, x, yB, lmax, 16, 8);
  ctx.fillStyle = COUL.piste;
  ctx.fill();
  const p = s ? Math.max(0.03, Math.min(1, d.boosts / s.requis)) : 1;
  rectArrondi(ctx, x, yB, lmax * p, 16, 8);
  ctx.fillStyle = degrade(ctx, x, x + lmax * p, c);
  ctx.fill();
  ctx.font = `20px "${P} Medium", sans-serif`;
  ctx.fillStyle = COUL.doux;
  ctx.textAlign = 'right';
  ctx.fillText(
    s ? d.textes.barre.replace('{a}', fmt(d.boosts)).replace('{b}', fmt(s.requis)).replace('{n}', String(s.n)) : d.textes.max,
    x + lmax, yB - 14
  );
  ctx.textAlign = 'left';

  // ---- Pastilles
  let xp = x;
  const yP = 314;
  const ajouter = (texte, forte) => {
    ctx.font = `21px "${P} Bold", sans-serif`;
    if (xp + ctx.measureText(texte).width + 34 > x + lmax) return;
    xp += pastille(ctx, texte, xp, yP, c, { forte }) + 12;
  };
  for (const role of d.roles ?? []) ajouter(d.textes.role.replace('{r}', role), true);
  if (d.serveur) ajouter(d.serveur);

  return cv.encode('png');
}

module.exports = { genererCarteBoost, suivant };
