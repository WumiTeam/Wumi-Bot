const { createCanvas } = require('@napi-rs/canvas');
const { chargerPolices } = require('./polices');
const { rectArrondi } = require('./canvasOutils');

/**
 * Palette validee pour le daltonisme (verifiee avec le validateur dataviz) :
 *  - serie unique  : un seul vert, encodage sequentiel
 *  - divergent     : bleu / rouge, la paire vert/rouge echouant la separation protan
 * Les textes n'utilisent jamais la couleur des series.
 */
const C = {
  surface: '#fcfcfb',
  carte: '#ffffff',
  bordure: '#e6e5e1',
  grille: '#eceae5',
  texte: '#0b0b0b',
  texteSecondaire: '#52514e',
  texteDiscret: '#84837e',
  serie: '#2f7a3c', // vert : messages, salons
  serieClaire: 'rgba(47, 122, 60, 0.12)',
  positif: '#2a78d6', // bleu : arrivees
  negatif: '#e34948', // rouge : departs
};

const P = 'Poppins';

/** Arrondit une borne haute a une valeur lisible (10, 20, 50, 100...). */
function borneHaute(valeur) {
  if (valeur <= 5) return 5;
  const magnitude = 10 ** Math.floor(Math.log10(valeur));
  for (const pas of [1, 2, 2.5, 5, 10]) {
    const candidat = pas * magnitude;
    if (candidat >= valeur) return candidat;
  }
  return 10 * magnitude;
}

const nb = (n) => Number(n).toLocaleString('fr-FR').replace(/ | /g, ' ');
const jourCourt = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

/** Rectangle dont seule l'extremite « donnee » est arrondie. */
function barre(ctx, x, y, l, h, rayon, sens) {
  const r = Math.max(0, Math.min(rayon, l / 2, Math.abs(h) / 2, Math.abs(l) / 2));
  ctx.beginPath();
  if (sens === 'haut') {
    ctx.moveTo(x, y + h);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.lineTo(x + l - r, y);
    ctx.quadraticCurveTo(x + l, y, x + l, y + r);
    ctx.lineTo(x + l, y + h);
  } else if (sens === 'bas') {
    ctx.moveTo(x, y);
    ctx.lineTo(x, y + h - r);
    ctx.quadraticCurveTo(x, y + h, x + r, y + h);
    ctx.lineTo(x + l - r, y + h);
    ctx.quadraticCurveTo(x + l, y + h, x + l, y + h - r);
    ctx.lineTo(x + l, y);
  } else {
    // vers la droite
    ctx.moveTo(x, y);
    ctx.lineTo(x + l - r, y);
    ctx.quadraticCurveTo(x + l, y, x + l, y + r);
    ctx.lineTo(x + l, y + h - r);
    ctx.quadraticCurveTo(x + l, y + h, x + l - r, y + h);
    ctx.lineTo(x, y + h);
  }
  ctx.closePath();
  ctx.fill();
}

/** Carte blanche servant de fond a un bloc. */
function bloc(ctx, x, y, l, h, titre, sousTitre) {
  rectArrondi(ctx, x, y, l, h, 14);
  ctx.fillStyle = C.carte;
  ctx.fill();
  ctx.strokeStyle = C.bordure;
  ctx.lineWidth = 1;
  ctx.stroke();

  if (titre) {
    ctx.fillStyle = C.texte;
    ctx.font = `18px "${P} Bold", sans-serif`;
    ctx.textAlign = 'left';
    ctx.fillText(titre, x + 20, y + 32);
  }
  if (sousTitre) {
    ctx.fillStyle = C.texteDiscret;
    ctx.font = `13px "${P}", sans-serif`;
    ctx.fillText(sousTitre, x + 20, y + 52);
  }
}

/** Tuile de chiffre-cle. */
function tuile(ctx, x, y, l, h, libelle, valeur, detail, couleurDetail) {
  bloc(ctx, x, y, l, h);
  ctx.textAlign = 'left';
  ctx.fillStyle = C.texteSecondaire;
  ctx.font = `12px "${P} Medium", sans-serif`;
  ctx.fillText(libelle.toUpperCase(), x + 18, y + 26);

  ctx.fillStyle = C.texte;
  ctx.font = `30px "${P} Bold", sans-serif`;
  ctx.fillText(valeur, x + 18, y + 62);

  if (detail) {
    ctx.fillStyle = couleurDetail ?? C.texteDiscret;
    ctx.font = `13px "${P}", sans-serif`;
    ctx.fillText(detail, x + 18, y + 84);
  }
}

/**
 * Genere le tableau de bord d'activite.
 * @param {object} d
 * @param {string} d.serveur
 * @param {Array}  d.serie      [{ jour, messages, arrivees, departs, vocal }]
 * @param {Array}  d.salons     [{ nom, total }]
 * @param {number[]} [d.heures] 24 cases : messages par heure (heure de Paris)
 * @param {object} [d.avant]    totaux de la periode precedente { messages, arrivees, departs, vocal }
 * @returns {Promise<Buffer>} PNG
 */
async function genererGraphique(d) {
  chargerPolices();

  const L = 1200;
  const avecHeures = Array.isArray(d.heures) && d.heures.some((v) => v > 0);
  const H = avecHeures ? 1200 : 900;
  const canvas = createCanvas(L, H);
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = C.surface;
  ctx.fillRect(0, 0, L, H);

  const serie = d.serie ?? [];
  const marge = 40;
  const largeur = L - marge * 2;

  // ------------------------------------------------------------- EN-TETE
  ctx.textAlign = 'left';
  ctx.fillStyle = C.texte;
  ctx.font = `28px "${P} Bold", sans-serif`;
  ctx.fillText(`Activité de ${d.serveur}`, marge, 52);

  ctx.fillStyle = C.texteSecondaire;
  ctx.font = `15px "${P}", sans-serif`;
  const periode = serie.length ? `du ${jourCourt(serie[0].jour)} au ${jourCourt(serie.at(-1).jour)}` : '';
  ctx.fillText(`${serie.length} derniers jours · ${periode}`, marge, 76);

  // --------------------------------------------------------- CHIFFRES CLES
  const totalMessages = serie.reduce((s, j) => s + j.messages, 0);
  const totalArrivees = serie.reduce((s, j) => s + j.arrivees, 0);
  const totalDeparts = serie.reduce((s, j) => s + j.departs, 0);
  const totalVocal = serie.reduce((s, j) => s + j.vocal, 0);
  const net = totalArrivees - totalDeparts;
  const moyenne = serie.length ? Math.round(totalMessages / serie.length) : 0;
  const meilleur = serie.reduce((a, b) => (b.messages > (a?.messages ?? -1) ? b : a), null);

  const lTuile = (largeur - 3 * 16) / 4;
  const yTuile = 96;
  // Evolution par rapport a la periode precedente, quand on l'a.
  const evo = (actuel, avant) => {
    if (!d.avant || !avant) return null;
    const p = Math.round(((actuel - avant) / avant) * 100);
    return { texte: `${p >= 0 ? '+' : ''}${p} % vs période précédente`, couleur: p >= 0 ? C.positif : C.negatif };
  };
  const evoMessages = evo(totalMessages, d.avant?.messages);
  const evoVocal = evo(totalVocal, d.avant?.vocal);
  tuile(ctx, marge, yTuile, lTuile, 100, 'Messages', nb(totalMessages), evoMessages?.texte ?? `${nb(moyenne)} par jour en moyenne`, evoMessages?.couleur);
  tuile(
    ctx,
    marge + (lTuile + 16),
    yTuile,
    lTuile,
    100,
    'Membres',
    `${net >= 0 ? '+' : ''}${nb(net)}`,
    `${nb(totalArrivees)} arrivées · ${nb(totalDeparts)} départs`,
    net >= 0 ? C.texteDiscret : C.negatif
  );
  tuile(
    ctx,
    marge + 2 * (lTuile + 16),
    yTuile,
    lTuile,
    100,
    'Vocal',
    `${nb(Math.round(totalVocal / 60))} h`,
    evoVocal?.texte ?? 'temps cumulé en vocal',
    evoVocal?.couleur
  );
  tuile(
    ctx,
    marge + 3 * (lTuile + 16),
    yTuile,
    lTuile,
    100,
    'Jour le plus actif',
    meilleur && meilleur.messages ? jourCourt(meilleur.jour) : '—',
    meilleur && meilleur.messages ? `${nb(meilleur.messages)} messages` : 'aucune donnée'
  );

  // ================================================ MESSAGES PAR JOUR (aire)
  const yBloc = 220;
  const hBloc = 280;
  bloc(ctx, marge, yBloc, largeur, hBloc, 'Messages par jour', `moyenne de ${nb(moyenne)} messages par jour`);

  const gx = marge + 60;
  const gy = yBloc + 74;
  const gl = largeur - 100;
  const gh = hBloc - 118;
  const maxMsg = borneHaute(Math.max(1, ...serie.map((j) => j.messages)));

  // Grille et graduations
  ctx.textAlign = 'right';
  ctx.font = `12px "${P}", sans-serif`;
  for (let i = 0; i <= 4; i++) {
    const y = gy + gh - (gh * i) / 4;
    ctx.strokeStyle = C.grille;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(gx, y + 0.5);
    ctx.lineTo(gx + gl, y + 0.5);
    ctx.stroke();
    ctx.fillStyle = C.texteDiscret;
    ctx.fillText(nb(Math.round((maxMsg * i) / 4)), gx - 10, y + 4);
  }

  if (serie.length > 1) {
    const pas = gl / (serie.length - 1);
    const pointX = (i) => gx + i * pas;
    const pointY = (v) => gy + gh - (v / maxMsg) * gh;

    // Aire : lavis a 12 %
    ctx.beginPath();
    ctx.moveTo(pointX(0), gy + gh);
    serie.forEach((j, i) => ctx.lineTo(pointX(i), pointY(j.messages)));
    ctx.lineTo(pointX(serie.length - 1), gy + gh);
    ctx.closePath();
    ctx.fillStyle = C.serieClaire;
    ctx.fill();

    // Courbe
    ctx.beginPath();
    serie.forEach((j, i) => (i ? ctx.lineTo(pointX(i), pointY(j.messages)) : ctx.moveTo(pointX(i), pointY(j.messages))));
    ctx.strokeStyle = C.serie;
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.stroke();

    // Marqueurs : uniquement le maximum et le dernier point
    const iMax = serie.reduce((best, j, i) => (j.messages > serie[best].messages ? i : best), 0);
    const aMarquer = [...new Set([iMax, serie.length - 1])];
    for (const i of aMarquer) {
      const x = pointX(i);
      const y = pointY(serie[i].messages);
      ctx.beginPath();
      ctx.arc(x, y, 6, 0, Math.PI * 2);
      ctx.fillStyle = C.serie;
      ctx.fill();
      ctx.strokeStyle = C.carte; // anneau de surface de 2 px
      ctx.lineWidth = 2;
      ctx.stroke();

      // Le libelle reste toujours dans le cadre : recentre s'il deborde
      // sur les cotes, place sous le point s'il touche le haut du graphe.
      ctx.fillStyle = C.texte;
      ctx.font = `13px "${P} Bold", sans-serif`;
      ctx.textAlign = 'center';
      const etiquette = nb(serie[i].messages);
      const demi = ctx.measureText(etiquette).width / 2 + 4;
      const tx = Math.min(Math.max(x, gx + demi), gx + gl - demi);
      ctx.fillText(etiquette, tx, y - 14 >= gy + 6 ? y - 14 : y + 22);
    }

    // Dates : environ six reperes
    ctx.textAlign = 'center';
    ctx.font = `12px "${P}", sans-serif`;
    ctx.fillStyle = C.texteDiscret;
    const saut = Math.max(1, Math.round(serie.length / 6));
    serie.forEach((j, i) => {
      if (i % saut === 0 || i === serie.length - 1) ctx.fillText(jourCourt(j.jour), pointX(i), gy + gh + 22);
    });
  }

  // ============================== ARRIVEES ET DEPARTS (colonnes divergentes)
  const yBas = yBloc + hBloc + 20;
  const hBas = (avecHeures ? 900 : H) - yBas - 40;
  const lGauche = largeur * 0.56;
  bloc(ctx, marge, yBas, lGauche, hBas, 'Arrivées et départs', 'au-dessus de la ligne : arrivées · en dessous : départs');

  const dx = marge + 50;
  const dy = yBas + 78;
  const dl = lGauche - 80;
  const dh = hBas - 150; // dates et legende ont besoin de place sous le graphe
  const zero = dy + dh / 2;
  const maxMouvement = borneHaute(Math.max(1, ...serie.map((j) => Math.max(j.arrivees, j.departs))));

  // Ligne de base
  ctx.strokeStyle = C.bordure;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(dx, zero + 0.5);
  ctx.lineTo(dx + dl, zero + 0.5);
  ctx.stroke();

  ctx.textAlign = 'right';
  ctx.font = `12px "${P}", sans-serif`;
  ctx.fillStyle = C.texteDiscret;
  ctx.fillText(nb(maxMouvement), dx - 8, dy + 10);
  ctx.fillText('0', dx - 8, zero + 4);
  ctx.fillText(nb(maxMouvement), dx - 8, dy + dh);

  if (serie.length) {
    const slot = dl / serie.length;
    const largeurBarre = Math.min(24, Math.max(3, slot - 3)); // 2 px d'air minimum entre voisines
    serie.forEach((j, i) => {
      const x = dx + i * slot + (slot - largeurBarre) / 2;
      if (j.arrivees) {
        const h = ((dh / 2) * j.arrivees) / maxMouvement;
        ctx.fillStyle = C.positif;
        barre(ctx, x, zero - h, largeurBarre, h, 4, 'haut');
      }
      if (j.departs) {
        const h = ((dh / 2) * j.departs) / maxMouvement;
        ctx.fillStyle = C.negatif;
        barre(ctx, x, zero, largeurBarre, h, 4, 'bas');
      }
    });

    ctx.textAlign = 'center';
    ctx.font = `12px "${P}", sans-serif`;
    ctx.fillStyle = C.texteDiscret;
    const saut = Math.max(1, Math.round(serie.length / 5));
    serie.forEach((j, i) => {
      if (i % saut === 0) ctx.fillText(jourCourt(j.jour), dx + i * slot + slot / 2, dy + dh + 22);
    });
  }

  // Legende : deux series, donc legende obligatoire
  const yLegende = yBas + hBas - 20;
  ctx.textAlign = 'left';
  ctx.font = `13px "${P} Medium", sans-serif`;
  let xL = dx;
  for (const [couleur, libelle] of [
    [C.positif, `Arrivées (${nb(totalArrivees)})`],
    [C.negatif, `Départs (${nb(totalDeparts)})`],
  ]) {
    ctx.fillStyle = couleur;
    rectArrondi(ctx, xL, yLegende - 9, 12, 12, 3);
    ctx.fill();
    ctx.fillStyle = C.texteSecondaire;
    ctx.fillText(libelle, xL + 18, yLegende + 1);
    xL += ctx.measureText(libelle).width + 46;
  }

  // ================================================= SALONS LES PLUS ACTIFS
  const xDroite = marge + lGauche + 16;
  const lDroite = largeur - lGauche - 16;
  bloc(ctx, xDroite, yBas, lDroite, hBas, 'Salons les plus actifs', `sur ${serie.length} jours`);

  const salons = (d.salons ?? []).slice(0, 5);
  if (!salons.length) {
    ctx.textAlign = 'center';
    ctx.font = `14px "${P}", sans-serif`;
    ctx.fillStyle = C.texteDiscret;
    ctx.fillText('Aucune donnée pour le moment', xDroite + lDroite / 2, yBas + hBas / 2);
  } else {
    const maxSalon = Math.max(...salons.map((s) => s.total));
    const yDepart = yBas + 86;
    const hauteurLigne = Math.min(46, (hBas - 110) / salons.length);
    const lBarreMax = lDroite - 160;

    salons.forEach((s, i) => {
      const y = yDepart + i * hauteurLigne;

      ctx.textAlign = 'left';
      ctx.font = `13px "${P} Medium", sans-serif`;
      ctx.fillStyle = C.texteSecondaire;
      let nom = s.nom;
      while (ctx.measureText(nom).width > 120 && nom.length > 4) nom = `${nom.slice(0, -2)}…`;
      ctx.fillText(nom, xDroite + 20, y + 5);

      const l = Math.max(4, (lBarreMax * s.total) / maxSalon);
      ctx.fillStyle = C.serie;
      barre(ctx, xDroite + 148, y - 9, l, 14, 4, 'droite');

      ctx.textAlign = 'left';
      ctx.font = `13px "${P} Bold", sans-serif`;
      ctx.fillStyle = C.texte;
      ctx.fillText(nb(s.total), xDroite + 148 + l + 8, y + 5);
    });
  }

  if (avecHeures) dessinerHeures(ctx, marge, 880, largeur, 280, d.heures);

  return canvas.encode('png');
}

/**
 * Heures de pointe : 24 colonnes, les trois heures les plus actives en couleur
 * pleine, les autres en lavis — on lit d'abord QUAND le serveur vit.
 */
function dessinerHeures(ctx, x, y, l, h, heures) {
  const total = heures.reduce((a, b) => a + b, 0);
  const top = heures.map((v, i) => [v, i]).sort((a, b) => b[0] - a[0]).slice(0, 3).filter(([v]) => v > 0).map(([, i]) => i);
  const sous = top.length ? `pic à ${top[0]} h · ${Math.round((heures[top[0]] / Math.max(1, total)) * 100)} % des messages · heure de Paris` : 'heure de Paris';
  bloc(ctx, x, y, l, h, 'Heures de pointe', sous);

  const gx = x + 60;
  const gy = y + 74;
  const gl = l - 90;
  const gh = h - 118;
  const max = borneHaute(Math.max(1, ...heures));

  ctx.textAlign = 'right';
  ctx.font = `12px "${P}", sans-serif`;
  for (let i = 0; i <= 2; i++) {
    const yy = gy + gh - (gh * i) / 2;
    ctx.strokeStyle = C.grille;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(gx, yy + 0.5);
    ctx.lineTo(gx + gl, yy + 0.5);
    ctx.stroke();
    ctx.fillStyle = C.texteDiscret;
    ctx.fillText(nb(Math.round((max * i) / 2)), gx - 10, yy + 4);
  }

  const slot = gl / 24;
  const lb = Math.min(30, slot - 6);
  heures.forEach((v, i) => {
    const bx = gx + i * slot + (slot - lb) / 2;
    if (v > 0) {
      const bh = Math.max(3, (gh * v) / max);
      ctx.fillStyle = top.includes(i) ? C.serie : 'rgba(47, 122, 60, 0.35)';
      barre(ctx, bx, gy + gh - bh, lb, bh, 4, 'haut');
    }
    if (i % 3 === 0 || top.includes(i)) {
      ctx.textAlign = 'center';
      ctx.font = top.includes(i) ? `12px "${P} Bold", sans-serif` : `12px "${P}", sans-serif`;
      ctx.fillStyle = top.includes(i) ? C.texte : C.texteDiscret;
      ctx.fillText(`${i}h`, bx + lb / 2, gy + gh + 22);
    }
  });
}

// `barre`, `bloc`, `tuile`, `borneHaute` et `nb` sont partages avec le
// graphique par membre (/messtats) : meme grammaire visuelle, un seul endroit
// a corriger si la charte bouge.
module.exports = { genererGraphique, C, P, barre, bloc, tuile, borneHaute, nb };
