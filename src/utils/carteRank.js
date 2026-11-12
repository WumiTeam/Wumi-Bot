const { createCanvas, loadImage } = require('@napi-rs/canvas');
const conf = require('../../config');
const { chargerPolices } = require('./polices');
const { rectArrondi, cercleImage, tronquerTexte, eclaircir, assombrir } = require('./canvasOutils');
const { dessinerFond } = require('./fondCarte');
const themes = require('./themesRank');
const { formaterNombre, abreger } = require('./outils');

/**
 * Genere la carte de rank d'un membre.
 * @param {object} donnees
 * @param {string} donnees.pseudo        nom affiche
 * @param {string} donnees.tag           @identifiant
 * @param {string} donnees.avatarUrl     URL PNG de l'avatar
 * @param {number} donnees.niveau
 * @param {number} donnees.rang
 * @param {number} donnees.totalMembres
 * @param {number} donnees.xpActuel      XP dans le niveau courant
 * @param {number} donnees.xpRequis      XP necessaire pour le niveau suivant
 * @param {number} donnees.xpTotal
 * @param {number} donnees.messages
 * @param {string} [donnees.accent]      couleur du role "#rrggbb" (theme Nature uniquement)
 * @param {object} [donnees.theme]       theme de carte (voir themesRank.js)
 * @param {string} [donnees.fondPerso]   chemin d'une image de fond personnelle
 * @param {number} [donnees.prestige]    nombre d'etoiles de prestige
 * @param {object[]} [donnees.badges]    badges a afficher ({ emoji, nom })
 * @returns {Promise<Buffer>} PNG
 */
/** Petite etoile pleine, dessinee a la main (la police n'a pas d'emoji). */
function etoile(ctx, cx, cy, rayon, couleur) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? rayon : rayon * 0.45;
    const angle = (Math.PI / 5) * i - Math.PI / 2;
    const x = cx + Math.cos(angle) * r;
    const y = cy + Math.sin(angle) * r;
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fillStyle = couleur;
  ctx.fill();
}

/** Rangee d'etoiles de prestige. */
function dessinerEtoiles(ctx, x, y, combien, couleur, theme) {
  for (let i = 0; i < combien; i++) {
    etoile(ctx, x + i * 22 + 8, y, 9, couleur);
    // Fin liseré pour que l'etoile reste lisible sur un fond charge
    ctx.strokeStyle = theme.sombre ? 'rgba(0,0,0,0.35)' : 'rgba(255,255,255,0.75)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }
}

async function genererCarteRank(donnees) {
  chargerPolices();

  const L = conf.carte.largeur;
  const H = conf.carte.hauteur;
  const theme = donnees.theme ?? themes.parCle(themes.CLE_DEFAUT);

  // La couleur du role ne s'applique qu'aux themes qui l'autorisent : sinon
  // le theme achete perdrait justement ce qui le distingue.
  // Sur fond clair, un accent trop pale devient illisible : on l'assombrit au besoin.
  const roleUtilise = theme.suitLeRole ? donnees.accent : null;
  const accent = roleUtilise ? assombrir(roleUtilise, 0.12) : theme.accent;
  const accent2 = roleUtilise ? eclaircir(assombrir(roleUtilise, 0.12), 0.2) : theme.accent2;

  const canvas = createCanvas(L, H);
  const ctx = canvas.getContext('2d');

  // ---------------------------------------------------------------- FOND
  // Un fond personnel remplace le decor commun ; le miroir n'a alors plus de
  // sens puisque l'image n'a pas ete pensee pour cette carte.
  await dessinerFond(ctx, L, H, 28, theme.voile, donnees.fondPerso ? false : conf.carte.miroirRank, theme, donnees.fondPerso);

  // Bordure fine
  rectArrondi(ctx, 1.5, 1.5, L - 3, H - 3, 27);
  ctx.strokeStyle = theme.bordure;
  ctx.lineWidth = 3;
  ctx.stroke();

  // -------------------------------------------------------------- AVATAR
  const tailleAvatar = 178;
  const ax = 48;
  const ay = (H - tailleAvatar) / 2;
  const centreX = ax + tailleAvatar / 2;
  const centreY = ay + tailleAvatar / 2;
  const rayonAnneau = tailleAvatar / 2 + 13;

  // Pastille pour detacher l'avatar du decor (claire ou sombre selon le theme)
  ctx.beginPath();
  ctx.arc(centreX, centreY, rayonAnneau + 7, 0, Math.PI * 2);
  ctx.fillStyle = theme.pastille;
  ctx.fill();

  // Anneau de progression
  ctx.beginPath();
  ctx.arc(centreX, centreY, rayonAnneau, 0, Math.PI * 2);
  ctx.strokeStyle = theme.bordure;
  ctx.lineWidth = 8;
  ctx.stroke();

  const progression = Math.max(0, Math.min(1, donnees.xpRequis ? donnees.xpActuel / donnees.xpRequis : 0));
  if (progression > 0) {
    const anneauGrad = ctx.createLinearGradient(
      centreX - rayonAnneau,
      centreY - rayonAnneau,
      centreX + rayonAnneau,
      centreY + rayonAnneau
    );
    anneauGrad.addColorStop(0, accent);
    anneauGrad.addColorStop(1, accent2);
    ctx.beginPath();
    ctx.arc(centreX, centreY, rayonAnneau, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * progression);
    ctx.strokeStyle = anneauGrad;
    ctx.lineWidth = 8;
    ctx.lineCap = 'round';
    ctx.stroke();
    ctx.lineCap = 'butt';
  }

  try {
    const avatar = await loadImage(donnees.avatarUrl);
    cercleImage(ctx, avatar, ax, ay, tailleAvatar);
  } catch {
    // Avatar indisponible : cercle de repli avec l'initiale
    ctx.beginPath();
    ctx.arc(centreX, centreY, tailleAvatar / 2, 0, Math.PI * 2);
    ctx.fillStyle = accent;
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = '86px "Poppins Bold", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText((donnees.pseudo || '?').charAt(0).toUpperCase(), centreX, centreY + 4);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
  }

  // ------------------------------------------------------- RANG ET NIVEAU
  const droite = L - 45;
  ctx.textAlign = 'right';

  ctx.font = '22px "Poppins Medium", sans-serif';
  const largeurNiveau = ctx.measureText('NIVEAU ').width;
  ctx.font = '52px "Poppins Bold", sans-serif';
  const largeurValeurNiveau = ctx.measureText(String(donnees.niveau)).width;

  ctx.fillStyle = accent;
  ctx.fillText(String(donnees.niveau), droite, 78);
  ctx.font = '22px "Poppins Medium", sans-serif';
  ctx.fillStyle = theme.texteSecondaire;
  ctx.fillText('NIVEAU', droite - largeurValeurNiveau - 12, 78);

  ctx.font = '40px "Poppins Bold", sans-serif';
  ctx.fillStyle = theme.texte;
  const texteRang = `#${donnees.rang}`;
  const largeurRang = ctx.measureText(texteRang).width;
  const xRang = droite - largeurValeurNiveau - largeurNiveau - 46;
  ctx.fillText(texteRang, xRang, 74);
  ctx.font = '20px "Poppins Medium", sans-serif';
  ctx.fillStyle = theme.texteSecondaire;
  ctx.fillText('RANG', xRang - largeurRang - 10, 74);

  ctx.textAlign = 'left';

  // ------------------------------------------------------------- PSEUDO
  const xTexte = 272;
  ctx.font = '44px "Poppins Bold", sans-serif';
  ctx.fillStyle = theme.texte;
  ctx.fillText(tronquerTexte(ctx, donnees.pseudo, 420), xTexte, 145);

  ctx.font = '22px "Poppins", sans-serif';
  ctx.fillStyle = theme.texteSecondaire;
  const identifiant = donnees.tag ? `@${donnees.tag}` : '';
  ctx.fillText(tronquerTexte(ctx, identifiant, 300), xTexte, 177);

  // Etoiles de prestige, a la suite de l'identifiant
  const prestige = Number(donnees.prestige) || 0;
  if (prestige > 0) {
    const apres = xTexte + Math.min(ctx.measureText(identifiant).width, 300) + (identifiant ? 14 : 0);
    dessinerEtoiles(ctx, apres, 170, Math.min(prestige, 5), accent, theme);
    if (prestige > 5) {
      ctx.font = '17px "Poppins Bold", sans-serif';
      ctx.fillStyle = accent;
      ctx.fillText(`×${prestige}`, apres + 5 * 22 + 4, 177);
    }
  }

  // ------------------------------------------------------------ BARRE XP
  const barreX = xTexte;
  const barreY = 222;
  const barreL = L - barreX - 45;
  const barreH = 36;

  // Ligne d'infos au-dessus de la barre, cote gauche : la zone de droite est
  // occupee par le relief du decor, on n'y pose donc pas de texte.
  ctx.font = '19px "Poppins", sans-serif';
  ctx.fillStyle = theme.texteSecondaire;
  // Les badges sont annonces par leur nombre : la police embarquee ne contient
  // pas d'emoji, et des initiales isolees ("B V R F") ne voulaient rien dire.
  // Le detail se lit dans /badges.
  const nbBadges = (donnees.badges ?? []).length;
  const infos = [
    `${abreger(donnees.xpTotal)} XP au total`,
    donnees.messages ? `${abreger(donnees.messages)} message${donnees.messages > 1 ? 's' : ''}` : null,
    nbBadges ? `${nbBadges} badge${nbBadges > 1 ? 's' : ''}` : null,
    `${Math.floor(progression * 100)} % du niveau ${donnees.niveau + 1}`,
  ]
    .filter(Boolean)
    .join('   •   ');
  ctx.fillText(tronquerTexte(ctx, infos, barreL), barreX, barreY - 12);

  // Piste de la barre
  rectArrondi(ctx, barreX, barreY, barreL, barreH, barreH / 2);
  ctx.fillStyle = theme.piste;
  ctx.fill();
  ctx.strokeStyle = theme.bordure;
  ctx.lineWidth = 2;
  ctx.stroke();

  // Remplissage
  const largeurRemplie = Math.max(progression > 0 ? barreH : 0, barreL * progression);
  if (largeurRemplie > 0) {
    const grad = ctx.createLinearGradient(barreX, 0, barreX + barreL, 0);
    grad.addColorStop(0, accent);
    grad.addColorStop(1, accent2);
    rectArrondi(ctx, barreX, barreY, largeurRemplie, barreH, barreH / 2);
    ctx.fillStyle = grad;
    ctx.fill();

    // Reflet leger sur la moitie haute
    rectArrondi(ctx, barreX + 5, barreY + 4, Math.max(0, largeurRemplie - 10), barreH / 2 - 4, barreH / 4);
    ctx.fillStyle = theme.reflet;
    ctx.fill();
  }

  // Compteur d'XP au centre de la barre : blanc s'il tombe dans la zone remplie,
  // couleur du theme s'il repose sur la piste vide.
  const xCompteur = barreX + barreL / 2;
  ctx.font = '19px "Poppins Bold", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = xCompteur < barreX + largeurRemplie - 10 ? '#ffffff' : theme.texte;
  ctx.fillText(
    `${formaterNombre(donnees.xpActuel)} / ${formaterNombre(donnees.xpRequis)} XP`,
    xCompteur,
    barreY + barreH / 2 + 1
  );
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';

  return canvas.encode('png');
}

module.exports = { genererCarteRank, etoile, dessinerEtoiles };
