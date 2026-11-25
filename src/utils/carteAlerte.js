/**
 * La CARTE D'ALERTE (2.40) : l'image jointe aux annonces de la veille
 * (direct Twitch, nouvelle video YouTube, TikTok, Instagram, RSS).
 *
 * 1600 x 640, aux couleurs de Wumi : la vignette en grand a gauche avec une
 * pastille de plateforme (« EN DIRECT », « NOUVELLE VIDEO »), puis a droite
 * l'avatar de la chaine, son nom, le titre et une ligne d'infos (jeu,
 * spectateurs). La couleur de la plateforme ne sert qu'a la pastille et a
 * l'anneau de l'avatar : le reste suit la DA de Wumi.
 *
 * Si la vignette ne se charge pas, on dessine un aplat de la plateforme : la
 * carte reste lisible, l'annonce part quand meme.
 */
const { createCanvas, loadImage } = require('@napi-rs/canvas');
const { chargerPolices } = require('./polices');
const { rectArrondi, cercleImage, tronquerTexte } = require('./canvasOutils');
const { mascotte, logo, filigrane, nomMarque } = require('./mascotte');

const L = 1600;
const H = 640;
const P = 'Poppins';
const COUL = { fond: '#120d08', carte: '#1c140b', texte: '#f7f1e8', doux: '#c9b9a2', discret: '#8a7a66', orange: '#ff9d1b' };

/** Couleur et pictogramme de chaque plateforme (pastille et anneau). */
const PLATEFORMES = {
  twitch: { couleur: '#9146ff', pastille: '#e91916' },
  youtube: { couleur: '#ff0033', pastille: '#ff0033' },
  tiktok: { couleur: '#fe2c55', pastille: '#fe2c55' },
  instagram: { couleur: '#d6249f', pastille: '#d6249f' },
  rss: { couleur: '#ff9d1b', pastille: '#ff9d1b' },
};

async function image(url) {
  if (!url) return null;
  try { return await loadImage(url); } catch { return null; }
}

/** Coupe un texte en lignes qui tiennent dans « largeur ». */
function lignes(ctx, texte, largeur, max) {
  const mots = String(texte ?? '').split(/\s+/).filter(Boolean);
  const out = [];
  let ligne = '';
  for (const mot of mots) {
    const essai = ligne ? `${ligne} ${mot}` : mot;
    if (ctx.measureText(essai).width <= largeur) { ligne = essai; continue; }
    if (ligne) out.push(ligne);
    ligne = mot;
    if (out.length === max) break;
  }
  if (out.length < max && ligne) out.push(ligne);
  if (out.length === max && mots.join(' ') !== out.join(' ')) {
    out[max - 1] = tronquerTexte(ctx, `${out[max - 1]}…`, largeur);
  }
  return out.slice(0, max);
}

/**
 * @param {object} d
 * @param {string} d.type          twitch | youtube | tiktok | instagram | rss
 * @param {string} d.pastille      « EN DIRECT », « NOUVELLE VIDÉO »…
 * @param {string} d.nom           nom de la chaine
 * @param {string} [d.titre]
 * @param {string} [d.infos]       « Just Chatting · 1 204 spectateurs »
 * @param {string} [d.image]       vignette
 * @param {string} [d.avatar]
 * @param {boolean} [d.direct]
 * @returns {Promise<Buffer>} PNG
 */
async function genererCarteAlerte(d) {
  chargerPolices();
  const pf = PLATEFORMES[d.type] ?? PLATEFORMES.rss;
  const canvas = createCanvas(L, H);
  const ctx = canvas.getContext('2d');
  const [vignette, avatar] = await Promise.all([image(d.image), image(d.avatar)]);

  // ------------------------------------------------------------- DECOR
  ctx.fillStyle = COUL.fond;
  ctx.fillRect(0, 0, L, H);
  rectArrondi(ctx, 0, 0, L, H, 36);
  ctx.save();
  ctx.clip();
  ctx.fillStyle = COUL.carte;
  ctx.fillRect(0, 0, L, H);
  let g = ctx.createRadialGradient(1300, 0, 10, 1300, 0, 760);
  g.addColorStop(0, 'rgba(255, 140, 20, 0.26)');
  g.addColorStop(1, 'rgba(28, 20, 11, 0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, L, H);
  g = ctx.createRadialGradient(L, H, 10, L, H, 700);
  g.addColorStop(0, 'rgba(200, 110, 30, 0.18)');
  g.addColorStop(1, 'rgba(28, 20, 11, 0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, L, H);
  ctx.globalAlpha = 0.025;
  filigrane(ctx, L - 520, H - 360, 560, '#ffffff');
  ctx.globalAlpha = 1;
  ctx.restore();
  rectArrondi(ctx, 1, 1, L - 2, H - 2, 36);
  ctx.strokeStyle = 'rgba(255, 170, 60, 0.22)';
  ctx.lineWidth = 2;
  ctx.stroke();

  // ---------------------------------------------------------- VIGNETTE
  const xv = 40;
  const yv = 40;
  const lv = 1000;
  const hv = H - 80; // 560 : la vignette 16:9 est recadree « cover »
  ctx.save();
  rectArrondi(ctx, xv, yv, lv, hv, 26);
  ctx.clip();
  if (vignette) {
    const r = Math.max(lv / vignette.width, hv / vignette.height);
    const l = vignette.width * r;
    const h = vignette.height * r;
    ctx.drawImage(vignette, xv + (lv - l) / 2, yv + (hv - h) / 2, l, h);
  } else {
    const gv = ctx.createLinearGradient(xv, yv, xv + lv, yv + hv);
    gv.addColorStop(0, pf.couleur);
    gv.addColorStop(1, '#221b10');
    ctx.fillStyle = gv;
    ctx.fillRect(xv, yv, lv, hv);
    logo(ctx, xv + lv / 2 - 110, yv + hv / 2 - 110, 220);
  }
  // Voile bas, pour la pastille et la lisibilite
  const gb = ctx.createLinearGradient(0, yv, 0, yv + hv);
  gb.addColorStop(0, 'rgba(0,0,0,0.35)');
  gb.addColorStop(0.3, 'rgba(0,0,0,0)');
  ctx.fillStyle = gb;
  ctx.fillRect(xv, yv, lv, hv);
  ctx.restore();
  rectArrondi(ctx, xv + 0.5, yv + 0.5, lv - 1, hv - 1, 26);
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Pastille de plateforme
  ctx.font = `26px "${P} Bold", sans-serif`;
  const lp = ctx.measureText(d.pastille).width + (d.direct ? 74 : 48);
  rectArrondi(ctx, xv + 24, yv + 24, lp, 52, 14);
  ctx.fillStyle = pf.pastille;
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  let xt = xv + 48;
  if (d.direct) {
    ctx.beginPath();
    ctx.arc(xt + 7, yv + 50, 8, 0, Math.PI * 2);
    ctx.fill();
    xt += 26;
  }
  ctx.fillText(d.pastille, xt, yv + 60);

  // -------------------------------------------------------- COLONNE DROITE
  const xd = 1090;
  const ld = L - xd - 56;
  const ta = 112;
  const ya = 70;
  ctx.beginPath();
  ctx.arc(xd + ta / 2, ya + ta / 2, ta / 2 + 6, 0, Math.PI * 2);
  ctx.strokeStyle = pf.couleur;
  ctx.lineWidth = 5;
  ctx.stroke();
  if (avatar) cercleImage(ctx, avatar, xd, ya, ta);
  else {
    ctx.save();
    ctx.beginPath();
    ctx.arc(xd + ta / 2, ya + ta / 2, ta / 2, 0, Math.PI * 2);
    ctx.clip();
    logo(ctx, xd, ya, ta, { rayon: 0 });
    ctx.restore();
  }

  ctx.fillStyle = COUL.texte;
  ctx.font = `36px "${P} Bold", sans-serif`;
  ctx.fillText(tronquerTexte(ctx, d.nom, ld - ta - 28), xd + ta + 24, ya + 50);
  ctx.fillStyle = COUL.discret;
  ctx.font = `22px "${P} Medium", sans-serif`;
  ctx.fillText(tronquerTexte(ctx, d.plateforme ?? '', ld - ta - 28), xd + ta + 26, ya + 86);

  // Titre
  ctx.fillStyle = COUL.texte;
  ctx.font = `38px "${P} Bold", sans-serif`;
  const lt = lignes(ctx, d.titre || d.pastille, ld, 4);
  let y = 268;
  for (const l of lt) { ctx.fillText(l, xd, y); y += 50; }

  // Infos
  if (d.infos) {
    ctx.fillStyle = COUL.doux;
    ctx.font = `26px "${P} Medium", sans-serif`;
    ctx.fillText(tronquerTexte(ctx, d.infos, ld), xd, Math.min(y + 18, H - 110));
  }

  // Marque
  ctx.font = `28px "${P} Bold", sans-serif`;
  ctx.textAlign = 'right';
  ctx.fillStyle = COUL.orange;
  ctx.fillText('.', L - 56, H - 64);
  const point = ctx.measureText('.').width;
  ctx.fillStyle = COUL.doux;
  ctx.fillText(nomMarque(), L - 56 - point - 1, H - 64);
  const lw = ctx.measureText(nomMarque()).width;
  ctx.textAlign = 'left';
  logo(ctx, L - 56 - point - lw - 50, H - 96, 38);

  return canvas.encode('png');
}

module.exports = { genererCarteAlerte, PLATEFORMES };
