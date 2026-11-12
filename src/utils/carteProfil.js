const { createCanvas, loadImage } = require('@napi-rs/canvas');
const conf = require('../../config');
const { chargerPolices } = require('./polices');
const { rectArrondi, cercleImage, tronquerTexte, eclaircir, assombrir } = require('./canvasOutils');
const { dessinerFond } = require('./fondCarte');
const themes = require('./themesRank');
const { dessinerEtoiles } = require('./carteRank');
const { formaterNombre, abreger } = require('./outils');
const { dessinerPiece } = require('./pieceWumi');

const L = 1000;
const H = 460;
const P = 'Poppins';

/** Encart translucide qui detache un bloc du decor. */
function encart(ctx, x, y, l, h, theme, rayon = 18) {
  rectArrondi(ctx, x, y, l, h, rayon);
  ctx.fillStyle = theme.sombre ? 'rgba(0, 0, 0, 0.32)' : 'rgba(255, 255, 255, 0.78)';
  ctx.fill();
  ctx.strokeStyle = theme.bordure;
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

/** Une statistique : petit intitule au-dessus, valeur en gros dessous. */
function statistique(ctx, x, y, l, h, theme, intitule, valeur, complement, piece = false) {
  encart(ctx, x, y, l, h, theme);

  ctx.textAlign = 'left';
  ctx.font = `13px "${P} Medium", sans-serif`;
  ctx.fillStyle = theme.texteSecondaire;
  ctx.fillText(intitule.toUpperCase(), x + 16, y + 26);

  // La valeur retrecit plutot que d'etre coupee : "1 an et 3 mois" doit rester lisible.
  ctx.fillStyle = theme.texte;
  for (const taille of [30, 26, 22, 19]) {
    ctx.font = `${taille}px "${P} Bold", sans-serif`;
    if (ctx.measureText(valeur).width <= l - 32 - (piece ? 34 : 0) || taille === 19) break;
  }
  // La piece de Wumi Run devant un montant (Wumi 2.17)
  let xv = x + 16;
  if (piece) {
    dessinerPiece(ctx, xv, y + 37, 28);
    xv += 36;
  }
  ctx.fillText(tronquerTexte(ctx, valeur, l - 16 - (xv - x)), xv, y + 62);

  if (complement) {
    ctx.font = `13px "${P}", sans-serif`;
    ctx.fillStyle = theme.texteSecondaire;
    ctx.fillText(tronquerTexte(ctx, complement, l - 32), x + 16, y + 82);
  }
}

/**
 * Carte de profil complete d'un membre.
 * @param {object} d
 * @param {string} d.pseudo
 * @param {string} d.tag
 * @param {string} d.avatarUrl
 * @param {number} d.niveau
 * @param {number} d.rang
 * @param {number} d.totalMembres
 * @param {number} d.xpActuel
 * @param {number} d.xpRequis
 * @param {number} d.xpTotal
 * @param {number} d.messages
 * @param {number} d.minutesVocal
 * @param {number} d.solde
 * @param {string} d.monnaie          nom de la monnaie du serveur
 * @param {number} d.invitations
 * @param {string} d.anciennete       "3 mois", "1 an"...
 * @param {number} d.avertissements
 * @param {object} [d.missions]       { faites, total }
 * @param {string[]} [d.roles]        noms des roles a afficher
 * @param {string} [d.accent]         couleur du role (theme Nature seulement)
 * @param {object} [d.theme]
 * @returns {Promise<Buffer>} PNG
 */
async function genererCarteProfil(d) {
  chargerPolices();

  const theme = d.theme ?? themes.parCle(themes.CLE_DEFAUT);
  const role = theme.suitLeRole ? d.accent : null;
  const accent = role ? assombrir(role, 0.12) : theme.accent;
  const accent2 = role ? eclaircir(assombrir(role, 0.12), 0.2) : theme.accent2;

  const canvas = createCanvas(L, H);
  const ctx = canvas.getContext('2d');
  ctx.textBaseline = 'alphabetic';

  await dessinerFond(ctx, L, H, 28, theme.voile, conf.carte.miroirRank, theme);

  rectArrondi(ctx, 1.5, 1.5, L - 3, H - 3, 27);
  ctx.strokeStyle = theme.bordure;
  ctx.lineWidth = 3;
  ctx.stroke();

  // ============================================================== EN-TETE
  const taille = 132;
  const ax = 44;
  const ay = 40;
  const cx = ax + taille / 2;
  const cy = ay + taille / 2;

  ctx.beginPath();
  ctx.arc(cx, cy, taille / 2 + 10, 0, Math.PI * 2);
  ctx.fillStyle = theme.pastille;
  ctx.fill();

  try {
    const avatar = await loadImage(d.avatarUrl);
    cercleImage(ctx, avatar, ax, ay, taille);
  } catch {
    ctx.beginPath();
    ctx.arc(cx, cy, taille / 2, 0, Math.PI * 2);
    ctx.fillStyle = accent;
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = `64px "${P} Bold", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText((d.pseudo || '?').charAt(0).toUpperCase(), cx, cy + 3);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
  }

  ctx.beginPath();
  ctx.arc(cx, cy, taille / 2 + 4, 0, Math.PI * 2);
  ctx.strokeStyle = accent;
  ctx.lineWidth = 4;
  ctx.stroke();

  const xTexte = ax + taille + 32;
  ctx.textAlign = 'left';
  ctx.font = `42px "${P} Bold", sans-serif`;
  ctx.fillStyle = theme.texte;
  ctx.fillText(tronquerTexte(ctx, d.pseudo, 420), xTexte, ay + 46);

  ctx.font = `20px "${P}", sans-serif`;
  ctx.fillStyle = theme.texteSecondaire;
  const identifiant = d.tag ? `@${d.tag}` : '';
  ctx.fillText(tronquerTexte(ctx, identifiant, 420), xTexte, ay + 74);

  // Etoiles de prestige, juste apres l'identifiant : meme signe que sur la
  // carte de rank, pour que les deux images se lisent pareil.
  const prestige = Number(d.prestige) || 0;
  if (prestige > 0) {
    const apres = xTexte + Math.min(ctx.measureText(identifiant).width, 420) + (identifiant ? 14 : 0);
    dessinerEtoiles(ctx, apres, ay + 67, Math.min(prestige, 5), accent, theme);
    if (prestige > 5) {
      ctx.font = `17px "${P} Bold", sans-serif`;
      ctx.fillStyle = accent;
      ctx.fillText(`×${prestige}`, apres + 5 * 22 + 4, ay + 74);
    }
  }

  // Roles : petites pastilles, seulement ce qui rentre. Le nombre de badges
  // prend la premiere place : la police embarquee n'a pas d'emoji, et le
  // detail se lit dans /badges.
  const pastilles = [...(d.badges?.length ? [`${d.badges.length} badge${d.badges.length > 1 ? 's' : ''}`] : []), ...(d.roles ?? [])];
  if (pastilles.length) {
    let x = xTexte;
    const y = ay + 96;
    ctx.font = `14px "${P} Medium", sans-serif`;
    for (const nom of pastilles) {
      const largeur = ctx.measureText(nom).width + 22;
      if (x + largeur > xTexte + 430) break;
      rectArrondi(ctx, x, y, largeur, 26, 13);
      ctx.fillStyle = theme.sombre ? 'rgba(255,255,255,0.14)' : 'rgba(27,36,25,0.08)';
      ctx.fill();
      ctx.fillStyle = theme.texteSecondaire;
      ctx.fillText(nom, x + 11, y + 18);
      x += largeur + 8;
    }
  }

  // Rang et niveau, en haut a droite
  const droite = L - 44;
  ctx.textAlign = 'right';
  ctx.font = `22px "${P} Medium", sans-serif`;
  const lNiveau = ctx.measureText('NIVEAU ').width;
  ctx.font = `52px "${P} Bold", sans-serif`;
  const lValeur = ctx.measureText(String(d.niveau)).width;

  ctx.fillStyle = accent;
  ctx.fillText(String(d.niveau), droite, ay + 46);
  ctx.font = `22px "${P} Medium", sans-serif`;
  ctx.fillStyle = theme.texteSecondaire;
  ctx.fillText('NIVEAU', droite - lValeur - 12, ay + 46);

  ctx.font = `36px "${P} Bold", sans-serif`;
  ctx.fillStyle = theme.texte;
  const texteRang = `#${d.rang}`;
  const lRang = ctx.measureText(texteRang).width;
  const xRang = droite - lValeur - lNiveau - 44;
  ctx.fillText(texteRang, xRang, ay + 42);
  ctx.font = `18px "${P} Medium", sans-serif`;
  ctx.fillStyle = theme.texteSecondaire;
  ctx.fillText('RANG', xRang - lRang - 10, ay + 42);
  ctx.textAlign = 'left';

  // ============================================================ BARRE XP
  const bx = 44;
  const by = 208;
  const bl = L - 88;
  const bh = 34;
  const progression = Math.max(0, Math.min(1, d.xpRequis ? d.xpActuel / d.xpRequis : 0));

  ctx.font = `17px "${P}", sans-serif`;
  ctx.fillStyle = theme.texteSecondaire;
  ctx.fillText(`${abreger(d.xpTotal)} XP au total`, bx, by - 12);
  ctx.textAlign = 'right';
  ctx.fillText(`${Math.floor(progression * 100)} % du niveau ${d.niveau + 1}`, bx + bl, by - 12);
  ctx.textAlign = 'left';

  rectArrondi(ctx, bx, by, bl, bh, bh / 2);
  ctx.fillStyle = theme.piste;
  ctx.fill();
  ctx.strokeStyle = theme.bordure;
  ctx.lineWidth = 2;
  ctx.stroke();

  const rempli = Math.max(progression > 0 ? bh : 0, bl * progression);
  if (rempli > 0) {
    const grad = ctx.createLinearGradient(bx, 0, bx + bl, 0);
    grad.addColorStop(0, accent);
    grad.addColorStop(1, accent2);
    rectArrondi(ctx, bx, by, rempli, bh, bh / 2);
    ctx.fillStyle = grad;
    ctx.fill();
    rectArrondi(ctx, bx + 5, by + 4, Math.max(0, rempli - 10), bh / 2 - 4, bh / 4);
    ctx.fillStyle = theme.reflet;
    ctx.fill();
  }

  ctx.font = `17px "${P} Bold", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const xc = bx + bl / 2;
  ctx.fillStyle = xc < bx + rempli - 10 ? '#ffffff' : theme.texte;
  ctx.fillText(`${formaterNombre(d.xpActuel)} / ${formaterNombre(d.xpRequis)} XP`, xc, by + bh / 2 + 1);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';

  // ========================================================= STATISTIQUES
  const marge = 44;
  const ecart = 14;
  const lTuile = (L - marge * 2 - ecart * 3) / 4;
  const yTuile = 272;
  const hTuile = 96;

  const heures = Math.floor((d.minutesVocal ?? 0) / 60);
  const vocal = heures >= 1 ? `${formaterNombre(heures)} h` : `${d.minutesVocal ?? 0} min`;

  statistique(ctx, marge, yTuile, lTuile, hTuile, theme, 'Messages', abreger(d.messages ?? 0), `${vocal} en vocal`);
  statistique(
    ctx,
    marge + lTuile + ecart,
    yTuile,
    lTuile,
    hTuile,
    theme,
    d.monnaie || 'Solde',
    abreger(d.solde ?? 0),
    `rang #${d.rangSolde ?? '?'} au solde`,
    true
  );
  statistique(
    ctx,
    marge + 2 * (lTuile + ecart),
    yTuile,
    lTuile,
    hTuile,
    theme,
    'Invitations',
    formaterNombre(d.invitations ?? 0),
    d.invitations ? 'membres amenes' : 'personne encore'
  );
  statistique(
    ctx,
    marge + 3 * (lTuile + ecart),
    yTuile,
    lTuile,
    hTuile,
    theme,
    'Sur le serveur',
    d.anciennete || '—',
    d.avertissements ? `${d.avertissements} avertissement${d.avertissements > 1 ? 's' : ''}` : 'aucun avertissement'
  );

  // ============================================================ MISSIONS
  if (d.missions && d.missions.total > 0) {
    const y = yTuile + hTuile + 14;
    const h = H - y - 24;
    encart(ctx, marge, y, L - marge * 2, h, theme, 16);

    const part = d.missions.faites / d.missions.total;
    ctx.font = `15px "${P} Medium", sans-serif`;
    ctx.fillStyle = theme.texteSecondaire;
    ctx.fillText('MISSIONS DU JOUR', marge + 16, y + 26);

    ctx.font = `15px "${P} Bold", sans-serif`;
    ctx.fillStyle = theme.texte;
    ctx.textAlign = 'right';
    // Pas d'emoji ici : la police embarquee n'en contient pas et
    // le rendu afficherait un carre vide.
    ctx.fillText(
      part >= 1 ? 'toutes accomplies' : `${d.missions.faites} sur ${d.missions.total}`,
      L - marge - 16,
      y + 26
    );
    ctx.textAlign = 'left';

    // Une case par mission plutot qu'une barre : le compte se lit d'un coup d'oeil
    const xDepart = marge + 16;
    const lDispo = L - marge * 2 - 32;
    const lCase = (lDispo - (d.missions.total - 1) * 8) / d.missions.total;
    for (let i = 0; i < d.missions.total; i++) {
      rectArrondi(ctx, xDepart + i * (lCase + 8), y + 36, lCase, 8, 4);
      // La case vide a besoin de sa propre teinte : la piste blanche
      // disparaitrait sur l'encart clair.
      ctx.fillStyle = i < d.missions.faites ? accent : theme.sombre ? 'rgba(255,255,255,0.18)' : 'rgba(27,36,25,0.16)';
      ctx.fill();
    }
  }

  return canvas.encode('png');
}

module.exports = { genererCarteProfil };
