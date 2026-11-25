/**
 * La carte de MONTEE DE NIVEAU (Wumi 2.19).
 *
 * Meme famille visuelle que les cartes d'economie et de classement : fond
 * nuit quadrille comme wumi.fr, halos doux, filigrane « w. », Poppins.
 * L'accent change avec le palier du niveau, pour que les grands niveaux se
 * remarquent :
 *   1-9 bleu · 10-24 bronze · 25-49 argent · 50-74 or · 75-99 rubis · 100+ diamant
 *
 * Aucun emoji dans le canvas (la police n'en contient pas). Tous les textes
 * arrivent deja traduits dans `d.textes`.
 */
const { createCanvas, loadImage } = require('@napi-rs/canvas');
const { mascotte, filigrane, nomMarque } = require('./mascotte');
const { chargerPolices } = require('./polices');
const { rectArrondi, cercleImage, tronquerTexte } = require('./canvasOutils');
const { initiales } = require('./carteClassement');

const P = 'Poppins';
const L = 1200;
const H = 420;

const COUL = {
  fond: '#110c07',
  carte: '#1a130b',
  grille: 'rgba(255,255,255,0.035)',
  encart: 'rgba(255,255,255,0.04)',
  bordure: 'rgba(255,255,255,0.08)',
  texte: '#f7f1e8',
  doux: '#bcae9a',
  discret: '#8a7a66',
  piste: 'rgba(255,255,255,0.08)',
};

/** Palier -> [couleur claire, couleur foncee, rgb du halo]. */
function palier(niveau) {
  if (niveau >= 100) return { a: '#7ce7ff', b: '#a78bfa', rgb: '124,231,255' };
  if (niveau >= 75) return { a: '#ff6b8b', b: '#e0245e', rgb: '255,107,139' };
  if (niveau >= 50) return { a: '#f8bd2c', b: '#e39027', rgb: '248,189,44' };
  if (niveau >= 25) return { a: '#e3e8f4', b: '#9aa6c2', rgb: '210,220,240' };
  if (niveau >= 10) return { a: '#f0a36b', b: '#c46a35', rgb: '240,163,107' };
  return { a: '#ffbe5c', b: '#ff9d1b', rgb: '255,157,27' };
}

function rgb(hex) {
  const h = String(hex).replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((x) => x + x).join('') : h.slice(0, 6), 16);
  return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
}

/** Les couleurs d'un theme de carte, au format d'un palier (+ teinte du fond). */
function couleursTheme(th) {
  return { a: th.accent2 ?? th.accent, b: th.accent, rgb: rgb(th.accent), teinte: th.degrade ?? [th.accent, th.accent2 ?? th.accent] };
}

async function image(url) {
  if (!url) return null;
  try { return await loadImage(url); } catch { return null; }
}

function degrade(ctx, x0, x1, c) {
  const g = ctx.createLinearGradient(x0, 0, x1, 0);
  g.addColorStop(0, c.a);
  g.addColorStop(1, c.b);
  return g;
}

function decor(ctx, c, fond = null) {
  ctx.fillStyle = COUL.fond;
  ctx.fillRect(0, 0, L, H);
  rectArrondi(ctx, 20, 20, L - 40, H - 40, 30);
  ctx.save();
  ctx.clip();
  ctx.fillStyle = COUL.carte;
  ctx.fillRect(0, 0, L, H);
  // Fond image (fond perso du membre, ou fond premium du serveur), assombri
  // pour que le texte reste lisible.
  if (fond) {
    const k = Math.max(L / fond.width, H / fond.height);
    ctx.drawImage(fond, (L - fond.width * k) / 2, (H - fond.height * k) / 2, fond.width * k, fond.height * k);
    const v = ctx.createLinearGradient(0, 0, L, 0);
    v.addColorStop(0, 'rgba(18,13,8,0.55)');
    v.addColorStop(0.35, 'rgba(18,13,8,0.78)');
    v.addColorStop(1, 'rgba(18,13,8,0.86)');
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, L, H);
  }
  // Teinte du theme : un voile de ses couleurs sur toute la carte.
  if (c.teinte && !fond) {
    const t = ctx.createLinearGradient(0, 0, L, H);
    t.addColorStop(0, c.teinte[0]);
    t.addColorStop(1, c.teinte[1] ?? c.teinte[0]);
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = t;
    ctx.fillRect(0, 0, L, H);
    ctx.globalAlpha = 1;
  }
  // Quadrillage du site.
  ctx.strokeStyle = COUL.grille;
  ctx.lineWidth = 1;
  for (let x = 20; x < L; x += 40) { ctx.beginPath(); ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, H); ctx.stroke(); }
  for (let y = 20; y < H; y += 40) { ctx.beginPath(); ctx.moveTo(0, y + 0.5); ctx.lineTo(L, y + 0.5); ctx.stroke(); }
  // Halos : l'accent du palier derriere l'avatar, un bleu doux a droite.
  let g = ctx.createRadialGradient(190, H / 2, 10, 190, H / 2, 420);
  g.addColorStop(0, `rgba(${c.rgb},0.28)`);
  g.addColorStop(1, 'rgba(26,18,10,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, L, H);
  g = ctx.createRadialGradient(L - 120, 0, 10, L - 120, 0, 600);
  g.addColorStop(0, 'rgba(255,140,30,0.16)');
  g.addColorStop(1, 'rgba(26,18,10,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, L, H);
  // Filigrane.
  ctx.globalAlpha = 0.035;
  ctx.fillStyle = '#ffffff';
  filigrane(ctx, L - H * 1.15, H * 0.12, H * 1.05, '#ffffff');
  ctx.globalAlpha = 1;
  // Etincelles.
  for (const [x, y, t] of [[350, 64, 4], [1135, 340, 3], [960, 70, 3], [1110, 96, 3], [360, 336, 3]]) etoile(ctx, x, y, t, c.a);
  ctx.restore();
  rectArrondi(ctx, 20.5, 20.5, L - 41, H - 41, 30);
  ctx.strokeStyle = `rgba(${c.rgb},0.35)`;
  ctx.lineWidth = 2;
  ctx.stroke();
}

/** Petite etoile a 4 branches. */
function etoile(ctx, x, y, t, couleur) {
  ctx.save();
  ctx.globalAlpha = 0.7;
  ctx.fillStyle = couleur;
  ctx.beginPath();
  ctx.moveTo(x, y - t * 3);
  ctx.quadraticCurveTo(x, y, x + t * 3, y);
  ctx.quadraticCurveTo(x, y, x, y + t * 3);
  ctx.quadraticCurveTo(x, y, x - t * 3, y);
  ctx.quadraticCurveTo(x, y, x, y - t * 3);
  ctx.fill();
  ctx.restore();
}

/** Avatar dans un anneau lumineux (plein a la montee de niveau). */
function avatarAnneau(ctx, img, nom, cx, cy, r, progression, c) {
  // Piste puis arc de progression.
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(cx, cy, r + 18, 0, Math.PI * 2);
  ctx.strokeStyle = COUL.piste;
  ctx.lineWidth = 12;
  ctx.stroke();
  const p = Math.max(0.02, Math.min(1, progression));
  const debut = -Math.PI / 2;
  ctx.beginPath();
  ctx.arc(cx, cy, r + 18, debut, debut + p * Math.PI * 2 - 0.0001);
  const g = ctx.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
  g.addColorStop(0, c.a);
  g.addColorStop(1, c.b);
  ctx.strokeStyle = g;
  ctx.shadowColor = `rgba(${c.rgb},0.7)`;
  ctx.shadowBlur = 18;
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.lineCap = 'butt';
  // Avatar.
  if (img) cercleImage(ctx, img, cx - r, cy - r, r * 2);
  else {
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = '#4a3216';
    ctx.fill();
    ctx.fillStyle = COUL.texte;
    ctx.font = `${Math.round(r * 0.72)}px "${P} Bold", sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(initiales(nom), cx, cy + r * 0.26);
    ctx.textAlign = 'left';
  }
}

/** Badge du niveau sous l'avatar. */
function badgeNiveau(ctx, texte, cx, y, c) {
  ctx.font = `30px "${P} Bold", sans-serif`;
  const l = Math.max(84, ctx.measureText(texte).width + 44);
  const h = 50;
  rectArrondi(ctx, cx - l / 2, y, l, h, h / 2);
  ctx.fillStyle = degrade(ctx, cx - l / 2, cx + l / 2, c);
  ctx.shadowColor = `rgba(${c.rgb},0.6)`;
  ctx.shadowBlur = 20;
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = COUL.carte;
  ctx.lineWidth = 5;
  ctx.stroke();
  ctx.fillStyle = '#120d08';
  ctx.textAlign = 'center';
  ctx.fillText(texte, cx, y + 36);
  ctx.textAlign = 'left';
}

/** Pastille arrondie. Renvoie sa largeur. */
function pastille(ctx, texte, x, y, c, { forte = false } = {}) {
  const t = 21;
  ctx.font = `${t}px "${P} ${forte ? 'Bold' : 'Medium'}", sans-serif`;
  const l = ctx.measureText(texte).width + 34;
  const h = 42;
  rectArrondi(ctx, x, y, l, h, h / 2);
  ctx.fillStyle = forte ? `rgba(${c.rgb},0.16)` : COUL.encart;
  ctx.fill();
  ctx.strokeStyle = forte ? `rgba(${c.rgb},0.55)` : COUL.bordure;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.fillStyle = forte ? c.a : COUL.doux;
  ctx.fillText(texte, x + 17, y + 28);
  return l;
}

/**
 * @param {object} d
 *   pseudo, avatarUrl, avant, niveau, xpActuel, xpRequis, xpTotal,
 *   bonus (nombre ou null), rang (nombre ou null), roles (noms),
 *   nombre (formateur de nombres de la langue, facultatif),
 *   fond (chemin d'une image de fond, facultatif),
 *   textes: { titre, niveau, xp, total, bonus, rang, role }
 *     ex. { titre: 'LEVEL UP', niveau: 'LEVEL', xp: '{a} / {b} XP to level {n}',
 *           total: '{n} XP total', bonus: 'Bonus ×{n}', rang: '#{n} on the server',
 *           role: 'Unlocked: {r}' }
 */
async function genererCarteNiveau(d) {
  chargerPolices();
  const fmt = d.nombre ?? ((n) => n.toLocaleString('en-US'));
  // 2.25.3 : un theme de carte (celui du membre, ou celui du serveur) donne
  // ses couleurs a la carte ; le theme Wumi par defaut garde les paliers.
  const c = d.theme && d.theme.cle && d.theme.cle !== 'Wumi' ? couleursTheme(d.theme) : palier(d.niveau);
  const cv = createCanvas(L, H);
  const ctx = cv.getContext('2d');
  decor(ctx, c, d.fond ? await image(d.fond) : null);

  // ---- Avatar et anneau
  const cx = 200;
  const cy = 186;
  const r = 104;
  const img = await image(d.avatarUrl);
  // L'anneau est plein : on fete le niveau atteint. La barre montre la suite.
  avatarAnneau(ctx, img, d.pseudo, cx, cy, r, 1, c);
  badgeNiveau(ctx, String(d.niveau), cx, cy + r + 2, c);

  // ---- Titre
  const x = 400;
  const lmax = L - x - 70;
  ctx.font = `22px "${P} Bold", sans-serif`;
  ctx.fillStyle = c.a;
  const titre = d.textes.titre.split('').join(String.fromCharCode(8202));
  ctx.fillText(titre, x, 92);
  const lt = ctx.measureText(titre).width;
  ctx.fillStyle = degrade(ctx, x + lt + 16, x + lt + 140, c);
  rectArrondi(ctx, x + lt + 16, 83, 110, 3, 1.5);
  ctx.globalAlpha = 0.5;
  ctx.fill();
  ctx.globalAlpha = 1;

  // ---- Pseudo
  ctx.font = `40px "${P} Medium", sans-serif`;
  ctx.fillStyle = COUL.texte;
  ctx.fillText(tronquerTexte(ctx, d.pseudo, lmax), x, 142);

  // ---- « LEVEL 4 -> 5 »
  const yN = 232;
  ctx.font = `30px "${P} Medium", sans-serif`;
  ctx.fillStyle = COUL.discret;
  ctx.fillText(d.textes.niveau, x, yN);
  let xx = x + ctx.measureText(d.textes.niveau).width + 18;
  ctx.font = `64px "${P} Bold", sans-serif`;
  ctx.fillStyle = COUL.discret;
  ctx.fillText(String(d.avant), xx, yN + 4);
  xx += ctx.measureText(String(d.avant)).width + 22;
  // Fleche.
  ctx.save();
  ctx.translate(xx, yN - 18);
  ctx.strokeStyle = c.a;
  ctx.lineWidth = 5;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(0, 0); ctx.lineTo(34, 0);
  ctx.moveTo(22, -12); ctx.lineTo(34, 0); ctx.lineTo(22, 12);
  ctx.stroke();
  ctx.restore();
  xx += 56;
  ctx.font = `76px "${P} Bold", sans-serif`;
  ctx.fillStyle = degrade(ctx, xx, xx + ctx.measureText(String(d.niveau)).width, c);
  ctx.shadowColor = `rgba(${c.rgb},0.55)`;
  ctx.shadowBlur = 24;
  ctx.fillText(String(d.niveau), xx, yN + 8);
  ctx.shadowBlur = 0;

  // ---- Barre vers le niveau suivant
  const yB = 268;
  rectArrondi(ctx, x, yB, lmax, 16, 8);
  ctx.fillStyle = COUL.piste;
  ctx.fill();
  const p = d.xpRequis ? Math.max(0.03, Math.min(1, d.xpActuel / d.xpRequis)) : 0;
  rectArrondi(ctx, x, yB, lmax * p, 16, 8);
  ctx.fillStyle = degrade(ctx, x, x + lmax * p, c);
  ctx.fill();
  ctx.font = `20px "${P} Medium", sans-serif`;
  ctx.fillStyle = COUL.doux;
  ctx.textAlign = 'right';
  ctx.fillText(
    d.textes.xp.replace('{a}', fmt(d.xpActuel)).replace('{b}', fmt(d.xpRequis)).replace('{n}', String(d.niveau + 1)),
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
  ajouter(d.textes.total.replace('{n}', fmt(d.xpTotal)));
  if (d.rang) ajouter(d.textes.rang.replace('{n}', d.rang));
  if (d.bonus && d.bonus > 1.01) ajouter(d.textes.bonus.replace('{n}', String(+d.bonus.toFixed(2))));

  return cv.encode('png');
}

// Les briques du decor, reprises par la carte de boost (2.28).
const outils = { decor, avatarAnneau, badgeNiveau, pastille, degrade, image, COUL, L, H, P };

module.exports = { genererCarteNiveau, palier, outils };
