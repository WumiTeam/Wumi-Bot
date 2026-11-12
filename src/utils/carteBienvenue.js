const { createCanvas, loadImage } = require('@napi-rs/canvas');
const fs = require('node:fs');
const conf = require('../../config');
const { chargerPolices } = require('./polices');
const { rectArrondi, cercleImage, tronquerTexte, eclaircir } = require('./canvasOutils');
const { dessinerFond } = require('./fondCarte');
const themes = require('./themesRank');

/**
 * Genere la banniere de bienvenue (ou d'au revoir) d'un membre.
 * @param {object} d
 * @param {string} d.pseudo
 * @param {string} d.avatarUrl
 * @param {string} d.serveur
 * @param {number} d.numeroMembre  position du membre (memberCount)
 * @param {boolean} [d.depart]     true pour une carte "au revoir"
 * @param {string} [d.accent]
 * @param {object} [d.design]  design personnalise { style, fond, couleur } (voir cartesBienvenue.js)
 * @param {object} [d.textes]  { titre, sous } deja traduits et remplis
 * @returns {Promise<Buffer>} PNG
 */
async function genererCarteBienvenue(d) {
  chargerPolices();
  if (d.design && !d.depart) return carteDesign(d);

  const L = 1000;
  const H = 400;

  // LA CARTE DE BIENVENUE SUIT LE MEME THEME QUE /rank ET /profil.
  //
  // Avant, elle etait la seule a peindre ses couleurs a la main, avec la
  // palette d'origine du bot : voile blanc, texte sombre, halo blanc. Les
  // cartes de rang, elles, etaient passees au systeme de themes — donc au
  // decor violet sombre de Blueprint. Resultat : trois cartes du meme bot,
  // dans le meme serveur, et une qui ne ressemblait pas aux autres.
  //
  // Le theme pris est celui du SERVEUR (le theme par defaut), pas celui d'un
  // membre : un nouvel arrivant n'en a pas encore, et la carte de depart
  // concerne quelqu'un qui n'est plus la.
  const theme = d.theme ?? themes.parCle(themes.CLE_DEFAUT);

  // Un depart garde sa teinte chaude — c'est ce qui le distingue d'une
  // arrivee au premier coup d'oeil — mais sur le meme decor que le reste.
  const accent = d.accent || (d.depart ? '#d4663f' : theme.accent);
  const accent2 = d.depart ? '#e8895f' : theme.accent2;

  const canvas = createCanvas(L, H);
  const ctx = canvas.getContext('2d');

  // Voile un peu plus leger ici : la carte est plus grande, le decor respire mieux
  await dessinerFond(ctx, L, H, 30, Math.max(0, theme.voile - 0.08), false, theme);

  rectArrondi(ctx, 1.5, 1.5, L - 3, H - 3, 29);
  ctx.strokeStyle = theme.bordure;
  ctx.lineWidth = 3;
  ctx.stroke();

  // ------------------------------------------------------------- AVATAR
  const taille = 160;
  const ax = (L - taille) / 2;
  const ay = 46;
  const centreY = ay + taille / 2;

  // Pastille pour detacher l'avatar du decor. Claire sur un theme clair,
  // sombre sur un theme sombre : un rond blanc sur du violet profond faisait
  // une tache, c'est ce qui sautait le plus aux yeux.
  ctx.beginPath();
  ctx.arc(L / 2, centreY, taille / 2 + 18, 0, Math.PI * 2);
  ctx.fillStyle = theme.pastille;
  ctx.fill();

  ctx.beginPath();
  ctx.arc(L / 2, centreY, taille / 2 + 9, 0, Math.PI * 2);
  const anneau = ctx.createLinearGradient(ax, ay, ax + taille, ay + taille);
  anneau.addColorStop(0, accent);
  anneau.addColorStop(1, eclaircir(accent2, 0.05));
  ctx.strokeStyle = anneau;
  ctx.lineWidth = 7;
  ctx.stroke();

  try {
    const avatar = await loadImage(d.avatarUrl);
    cercleImage(ctx, avatar, ax, ay, taille);
  } catch {
    ctx.beginPath();
    ctx.arc(L / 2, centreY, taille / 2, 0, Math.PI * 2);
    ctx.fillStyle = accent;
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = '78px "Poppins Bold", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText((d.pseudo || '?').charAt(0).toUpperCase(), L / 2, centreY + 4);
    ctx.textBaseline = 'alphabetic';
  }

  ctx.textAlign = 'center';

  // Titre
  ctx.font = '28px "Poppins Medium", sans-serif';
  ctx.fillStyle = accent;
  ctx.fillText(d.textes?.titre ?? (d.depart ? 'AU REVOIR' : 'BIENVENUE'), L / 2, 262);

  // Pseudo
  ctx.font = '46px "Poppins Bold", sans-serif';
  ctx.fillStyle = theme.texte;
  ctx.fillText(tronquerTexte(ctx, d.pseudo, L - 140), L / 2, 314);

  // Sous-titre
  ctx.font = '22px "Poppins", sans-serif';
  ctx.fillStyle = theme.texteSecondaire;
  const sous = d.textes?.sous ?? (d.depart
    ? `Nous sommes maintenant ${d.numeroMembre} sur ${d.serveur}`
    : `Tu es le ${d.numeroMembre}${d.numeroMembre === 1 ? 'er' : 'e'} membre de ${d.serveur}`);
  ctx.fillText(tronquerTexte(ctx, sous, L - 110), L / 2, 352);

  ctx.textAlign = 'left';
  return canvas.encode('png');
}

// ------------------------------------------------------- DESIGNS PERSO
async function avatarOu(ctx, d, x, y, taille, accent) {
  try {
    const avatar = await loadImage(d.avatarUrl);
    cercleImage(ctx, avatar, x, y, taille);
  } catch {
    ctx.beginPath();
    ctx.arc(x + taille / 2, y + taille / 2, taille / 2, 0, Math.PI * 2);
    ctx.fillStyle = accent;
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = `${Math.round(taille * 0.48)}px "Poppins Bold", sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText((d.pseudo || '?').charAt(0).toUpperCase(), x + taille / 2, y + taille * 0.66);
  }
  ctx.beginPath();
  ctx.arc(x + taille / 2, y + taille / 2, taille / 2 + 5, 0, Math.PI * 2);
  ctx.strokeStyle = accent;
  ctx.lineWidth = 7;
  ctx.stroke();
}

/**
 * Une carte d'un design personnalise : fond de l'admin (ou nuit Wumi),
 * voile sombre pour la lisibilite, texte blanc, accent au choix.
 */
async function carteDesign(d) {
  const L = 1000;
  const H = 400;
  const design = d.design;
  const accent = design.couleur || '#58a6ff';
  const canvas = createCanvas(L, H);
  const ctx = canvas.getContext('2d');

  ctx.save();
  rectArrondi(ctx, 0, 0, L, H, 30);
  ctx.clip();
  ctx.fillStyle = '#0b0e1c';
  ctx.fillRect(0, 0, L, H);
  let fond = null;
  if (design.fond && fs.existsSync(design.fond)) {
    try { fond = await loadImage(design.fond); } catch { fond = null; }
  }
  if (fond) {
    ctx.drawImage(fond, 0, 0, L, H);
  } else {
    const g = ctx.createRadialGradient(L * 0.2, H * 0.1, 10, L * 0.2, H * 0.1, 700);
    g.addColorStop(0, `${accent}aa`);
    g.addColorStop(1, 'rgba(11,14,28,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, L, H);
  }
  // Voile : plus fort du cote du texte.
  const voile = design.style === 'gauche'
    ? ctx.createLinearGradient(0, 0, L, 0)
    : ctx.createLinearGradient(0, 0, 0, H);
  voile.addColorStop(0, design.style === 'gauche' ? 'rgba(8,10,20,0.78)' : 'rgba(8,10,20,0.25)');
  voile.addColorStop(1, design.style === 'gauche' ? 'rgba(8,10,20,0.15)' : 'rgba(8,10,20,0.75)');
  ctx.fillStyle = voile;
  ctx.fillRect(0, 0, L, H);
  ctx.restore();

  rectArrondi(ctx, 1.5, 1.5, L - 3, H - 3, 29);
  ctx.strokeStyle = `${accent}88`;
  ctx.lineWidth = 3;
  ctx.stroke();

  const titre = d.textes?.titre ?? 'BIENVENUE';
  const sous = d.textes?.sous ?? '';
  ctx.shadowColor = 'rgba(0,0,0,0.45)';
  ctx.shadowBlur = 12;

  if (design.style === 'gauche') {
    await avatarOu(ctx, d, 70, 110, 180, accent);
    ctx.textAlign = 'left';
    ctx.font = '26px "Poppins Medium", sans-serif';
    ctx.fillStyle = accent;
    ctx.fillText(tronquerTexte(ctx, titre.toUpperCase(), 620), 300, 165);
    ctx.font = '54px "Poppins Bold", sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(tronquerTexte(ctx, d.pseudo, 640), 298, 228);
    ctx.font = '22px "Poppins", sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.82)';
    ctx.fillText(tronquerTexte(ctx, sous, 640), 300, 272);
  } else if (design.style === 'minimal') {
    await avatarOu(ctx, d, 60, 60, 96, accent);
    ctx.textAlign = 'left';
    ctx.font = '22px "Poppins Medium", sans-serif';
    ctx.fillStyle = accent;
    ctx.fillText(tronquerTexte(ctx, titre.toUpperCase(), 760), 180, 100);
    ctx.font = '22px "Poppins", sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.fillText(tronquerTexte(ctx, sous, 760), 180, 134);
    for (const taille of [96, 84, 72, 60]) {
      ctx.font = `${taille}px "Poppins Bold", sans-serif`;
      if (ctx.measureText(d.pseudo).width <= L - 120 || taille === 60) break;
    }
    ctx.fillStyle = '#ffffff';
    ctx.fillText(tronquerTexte(ctx, d.pseudo, L - 120), 58, 320);
    ctx.shadowBlur = 0;
    ctx.fillStyle = accent;
    rectArrondi(ctx, 60, 344, 120, 8, 4);
    ctx.fill();
  } else {
    await avatarOu(ctx, d, (L - 160) / 2, 40, 160, accent);
    ctx.textAlign = 'center';
    ctx.font = '28px "Poppins Medium", sans-serif';
    ctx.fillStyle = accent;
    ctx.fillText(tronquerTexte(ctx, titre.toUpperCase(), L - 140), L / 2, 258);
    ctx.font = '48px "Poppins Bold", sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(tronquerTexte(ctx, d.pseudo, L - 140), L / 2, 312);
    ctx.font = '22px "Poppins", sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.82)';
    ctx.fillText(tronquerTexte(ctx, sous, L - 110), L / 2, 352);
  }
  ctx.shadowBlur = 0;
  ctx.textAlign = 'left';
  return canvas.encode('png');
}

module.exports = { genererCarteBienvenue };
