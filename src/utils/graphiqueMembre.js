/**
 * Graphique d'activite d'un membre (/messtats).
 *
 * Deux lectures, une seule image : quand la personne ecrit dans la journee,
 * et ou elle ecrit. Meme charte que le tableau de bord du serveur.
 */
const { createCanvas, loadImage } = require('@napi-rs/canvas');
const { chargerPolices } = require('./polices');
const { rectArrondi, cercleImage } = require('./canvasOutils');
const { C, P, barre, bloc, tuile, borneHaute, nb } = require('./graphiqueActivite');

const L = 1200;
const MARGE = 28;

/** Coupe un texte trop long en ajoutant une ellipse. */
function tronquer(ctx, texte, largeurMax) {
  if (ctx.measureText(texte).width <= largeurMax) return texte;
  let t = texte;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > largeurMax) t = t.slice(0, -1);
  return `${t}…`;
}

const hh = (h) => `${String(h).padStart(2, '0')} h`;

/** Duree lisible a partir de secondes : "3 h 20" ou "45 min". */
function duree(secondes) {
  const m = Math.floor(secondes / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return m % 60 ? `${h} h ${String(m % 60).padStart(2, '0')}` : `${h} h`;
}

// ------------------------------------------------------------------ PANNEAUX

/**
 * Messages par heure : 24 barres, heure de Paris.
 * Une seule serie, donc pas de legende ; seul le pic est etiquete.
 */
function panneauHeures(ctx, x, y, l, h, heures) {
  bloc(ctx, x, y, l, h, 'Quand ce membre écrit', 'messages par heure de la journée (heure de Paris)');

  const gx = x + 58;
  // 18 px de plus que le titre : l'etiquette du pic se pose au-dessus de la
  // barre la plus haute sans jamais deborder sur le sous-titre.
  const gy = y + 92;
  const gl = l - 58 - 28;
  const gh = h - 92 - 42;

  const max = Math.max(...heures, 1);
  const haut = borneHaute(max);

  // Grille et axe des ordonnees. borneHaute rend toujours un multiple de 5 ;
  // on decoupe en 4 quand c'est possible, sinon en 5, pour n'afficher que des
  // graduations entieres (0 / 1 / 2 / 3 plutot que 0 / 1,67 / 3,33).
  const divisions = haut % 4 === 0 ? 4 : 5;
  ctx.textAlign = 'right';
  ctx.font = `12px "${P}", sans-serif`;
  for (let i = 0; i <= divisions; i++) {
    const v = (haut / divisions) * i;
    const yy = gy + gh - (gh * i) / divisions;
    ctx.strokeStyle = C.grille;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(gx, Math.round(yy) + 0.5);
    ctx.lineTo(gx + gl, Math.round(yy) + 0.5);
    ctx.stroke();
    ctx.fillStyle = C.texteDiscret;
    ctx.fillText(nb(Math.round(v)), gx - 10, yy + 4);
  }

  // Barres : 2 px de respiration entre deux barres voisines
  const pas = gl / 24;
  const largeur = Math.max(6, pas - 6);
  let pic = 0;
  for (let i = 1; i < 24; i++) if (heures[i] > heures[pic]) pic = i;

  for (let i = 0; i < 24; i++) {
    const valeur = heures[i];
    if (valeur <= 0) continue;
    const hb = Math.max(3, (valeur / haut) * gh);
    ctx.fillStyle = i === pic ? C.serie : 'rgba(47, 122, 60, 0.55)';
    barre(ctx, gx + i * pas + (pas - largeur) / 2, gy + gh - hb, largeur, hb, 4, 'haut');
  }

  // Axe des heures : une graduation sur trois, sinon c'est illisible
  ctx.textAlign = 'center';
  ctx.fillStyle = C.texteDiscret;
  ctx.font = `12px "${P}", sans-serif`;
  for (let i = 0; i < 24; i += 3) {
    ctx.fillText(hh(i), gx + i * pas + pas / 2, gy + gh + 22);
  }
  ctx.strokeStyle = C.bordure;
  ctx.beginPath();
  ctx.moveTo(gx, Math.round(gy + gh) + 0.5);
  ctx.lineTo(gx + gl, Math.round(gy + gh) + 0.5);
  ctx.stroke();

  // Etiquette du pic, uniquement s'il y a de quoi etiqueter
  if (heures[pic] > 0) {
    const hb = Math.max(3, (heures[pic] / haut) * gh);
    const texte = `${nb(heures[pic])} msg`;
    ctx.font = `12px "${P} Bold", sans-serif`;
    // Recentree dans le cadre : sur une barre de bord, le texte deborderait.
    const demi = ctx.measureText(texte).width / 2 + 4;
    const cx = Math.min(Math.max(gx + pic * pas + pas / 2, gx + demi), gx + gl - demi);
    ctx.fillStyle = C.texte;
    ctx.fillText(texte, cx, gy + gh - hb - 8);
  }
}

/** Salons preferes : barres horizontales, une seule serie. */
function panneauSalons(ctx, x, y, l, h, salons) {
  bloc(ctx, x, y, l, h, 'Où ce membre écrit', 'salons les plus utilisés');

  if (!salons.length) {
    ctx.textAlign = 'left';
    ctx.fillStyle = C.texteDiscret;
    ctx.font = `14px "${P}", sans-serif`;
    ctx.fillText('Aucun message enregistré pour le moment.', x + 20, y + 92);
    return;
  }

  const max = Math.max(...salons.map((s) => s.messages), 1);
  const gx = x + 20;
  const gl = l - 40;
  const hauteurLigne = 44;
  let ligne = y + 80;

  ctx.textAlign = 'left';
  for (const salon of salons) {
    ctx.font = `14px "${P} Medium", sans-serif`;
    ctx.fillStyle = C.texte;
    const nom = tronquer(ctx, `# ${salon.nom}`, 220);
    ctx.fillText(nom, gx, ligne + 20);

    const bx = gx + 240;
    const bl = gl - 240 - 90;
    rectArrondi(ctx, bx, ligne + 6, bl, 20, 10);
    ctx.fillStyle = C.serieClaire;
    ctx.fill();

    const remplie = Math.max(6, (salon.messages / max) * bl);
    ctx.fillStyle = C.serie;
    barre(ctx, bx, ligne + 6, remplie, 20, 10, 'droite');

    ctx.font = `14px "${P} Bold", sans-serif`;
    ctx.fillStyle = C.texteSecondaire;
    ctx.textAlign = 'right';
    ctx.fillText(nb(salon.messages), gx + gl, ligne + 21);
    ctx.textAlign = 'left';

    ligne += hauteurLigne;
  }
}

// --------------------------------------------------------------- EN-TETE

async function enTete(ctx, x, y, l, h, d) {
  bloc(ctx, x, y, l, h);

  const taille = 76;
  const ax = x + 22;
  const ay = y + (h - taille) / 2;

  let avatar = null;
  if (d.avatarUrl) {
    try {
      avatar = await loadImage(d.avatarUrl);
    } catch {
      /* on dessine l'initiale */
    }
  }
  if (avatar) cercleImage(ctx, avatar, ax, ay, taille);
  else {
    ctx.beginPath();
    ctx.arc(ax + taille / 2, ay + taille / 2, taille / 2, 0, Math.PI * 2);
    ctx.fillStyle = C.serie;
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = `36px "${P} Bold", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText((d.pseudo || '?').charAt(0).toUpperCase(), ax + taille / 2, ay + taille / 2 + 2);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
  }

  ctx.textAlign = 'left';
  ctx.fillStyle = C.texte;
  ctx.font = `28px "${P} Bold", sans-serif`;
  ctx.fillText(tronquer(ctx, d.pseudo, 520), ax + taille + 20, y + h / 2 - 2);

  ctx.fillStyle = C.texteDiscret;
  ctx.font = `14px "${P}", sans-serif`;
  ctx.fillText(tronquer(ctx, `sur ${d.serveur}`, 520), ax + taille + 20, y + h / 2 + 22);
}

// ----------------------------------------------------------------- RENDU

/**
 * Genere le graphique d'activite d'un membre.
 * @param {object} d
 * @param {string} d.pseudo
 * @param {string} d.serveur
 * @param {string|null} d.avatarUrl
 * @param {number[]} d.heures        24 entrees, index = heure de Paris
 * @param {Array}  d.salons          [{ nom, messages }]
 * @param {number} d.messages        total de messages comptes pour l'XP
 * @param {number} d.secondesVocal
 * @param {number} d.niveau
 * @param {object|null} d.plage      { debut, fin, part }
 * @returns {Promise<Buffer>} PNG
 */
async function genererGraphiqueMembre(d) {
  chargerPolices();

  const nbSalons = Math.min(d.salons.length, 5);
  const hSalons = 80 + Math.max(1, nbSalons) * 44 + 12;
  const H = MARGE + 112 + 16 + 104 + 16 + 280 + 16 + hSalons + MARGE;

  const canvas = createCanvas(L, H);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = C.surface;
  ctx.fillRect(0, 0, L, H);

  const l = L - MARGE * 2;
  let y = MARGE;

  await enTete(ctx, MARGE, y, l, 112, d);
  y += 112 + 16;

  // Quatre chiffres-cles
  const lt = (l - 3 * 16) / 4;
  const total = d.heures.reduce((a, b) => a + b, 0);
  tuile(ctx, MARGE, y, lt, 104, 'Messages', nb(d.messages), `niveau ${d.niveau}`);
  tuile(ctx, MARGE + (lt + 16), y, lt, 104, 'Temps en vocal', duree(d.secondesVocal), d.secondesVocal ? null : 'jamais connecté');
  tuile(
    ctx,
    MARGE + (lt + 16) * 2,
    y,
    lt,
    104,
    'Heures favorites',
    d.plage ? `${hh(d.plage.debut)} – ${hh(d.plage.fin)}` : '—',
    d.plage ? `${Math.round(d.plage.part * 100)} % de ses messages` : 'pas encore de données'
  );
  tuile(
    ctx,
    MARGE + (lt + 16) * 3,
    y,
    lt,
    104,
    'Salon préféré',
    d.salons[0] ? tronquerTuile(ctx, `# ${d.salons[0].nom}`) : '—',
    d.salons[0] ? `${nb(d.salons[0].messages)} messages` : 'pas encore de données'
  );
  y += 104 + 16;

  panneauHeures(ctx, MARGE, y, l, 280, d.heures);
  y += 280 + 16;

  panneauSalons(ctx, MARGE, y, l, hSalons, d.salons.slice(0, 5));

  // Note de bas de page : dire d'ou viennent les chiffres evite les
  // malentendus sur "je pensais avoir plus de messages".
  ctx.textAlign = 'left';
  ctx.fillStyle = C.texteDiscret;
  ctx.font = `11px "${P}", sans-serif`;
  ctx.fillText(
    `${nb(total)} messages situés dans la journée · le suivi par heure a démarré après le comptage total`,
    MARGE + 2,
    H - MARGE + 16
  );

  return canvas.encode('png');
}

/** Nom de salon coupe pour tenir dans une tuile. */
function tronquerTuile(ctx, texte) {
  ctx.font = `30px "${P} Bold", sans-serif`;
  return tronquer(ctx, texte, 224);
}

module.exports = { genererGraphiqueMembre };
