/**
 * Carte de rank animee (GIF).
 *
 * La barre d'XP se remplit, l'anneau tourne et un reflet balaie la barre.
 * On reste sur un nombre d'images volontairement modeste : un GIF de
 * 1000 x 300 coute cher a encoder, et Discord n'affiche de toute facon
 * qu'une animation courte en boucle.
 */
const { GIFEncoder, quantize, applyPalette } = require('gifenc');
const { createCanvas, loadImage } = require('@napi-rs/canvas');
const conf = require('../../config');
const { chargerPolices } = require('./polices');
const { rectArrondi, cercleImage, tronquerTexte, eclaircir, assombrir } = require('./canvasOutils');
const { dessinerFond } = require('./fondCarte');
const themes = require('./themesRank');
const { formaterNombre, abreger } = require('./outils');
const { dessinerEtoiles } = require('./carteRank');

const IMAGES = 18; // ~1,8 s a 100 ms
const DELAI = 100;
const COULEURS = 128; // palette : au-dela le fichier grossit sans gain visible

/**
 * Adoucit une progression lineaire : demarrage franc, arrivee en douceur.
 * Sans ca, la barre s'arrete net et l'animation parait cassee.
 */
function adoucir(t) {
  return 1 - Math.pow(1 - t, 3);
}

/**
 * Genere la carte animee.
 * Memes donnees que genererCarteRank, plus `fondPerso`, `prestige` et `badges`.
 * @returns {Promise<Buffer>} GIF
 */
async function genererCarteAnimee(donnees) {
  chargerPolices();

  const L = conf.carte.largeur;
  const H = conf.carte.hauteur;
  const theme = donnees.theme ?? themes.parCle(themes.CLE_DEFAUT);
  const role = theme.suitLeRole ? donnees.accent : null;
  const accent = role ? assombrir(role, 0.12) : theme.accent;
  const accent2 = role ? eclaircir(assombrir(role, 0.12), 0.2) : theme.accent2;

  const progression = Math.max(0, Math.min(1, donnees.xpRequis ? donnees.xpActuel / donnees.xpRequis : 0));

  // Le fond ne change pas d'une image a l'autre : on le dessine une seule fois
  // et on le reutilise, sinon on relirait le decor dix-huit fois.
  const fond = createCanvas(L, H);
  const fctx = fond.getContext('2d');
  await dessinerFond(fctx, L, H, 28, theme.voile, donnees.fondPerso ? false : conf.carte.miroirRank, theme, donnees.fondPerso);
  rectArrondi(fctx, 1.5, 1.5, L - 3, H - 3, 27);
  fctx.strokeStyle = theme.bordure;
  fctx.lineWidth = 3;
  fctx.stroke();

  let avatar = null;
  try {
    avatar = await loadImage(donnees.avatarUrl);
  } catch {
    /* on dessinera l'initiale a la place */
  }

  const canvas = createCanvas(L, H);
  const ctx = canvas.getContext('2d');
  const encodeur = GIFEncoder();

  const tailleAvatar = 178;
  const ax = 48;
  const ay = (H - tailleAvatar) / 2;
  const cx = ax + tailleAvatar / 2;
  const cy = ay + tailleAvatar / 2;
  const rayonAnneau = tailleAvatar / 2 + 13;

  const barreX = 272;
  const barreY = 222;
  const barreL = L - barreX - 45;
  const barreH = 36;

  for (let image = 0; image < IMAGES; image++) {
    const t = image / (IMAGES - 1);
    // La barre se remplit sur les deux premiers tiers, puis reste pleine :
    // le dernier tiers sert au reflet qui passe dessus.
    const avancee = adoucir(Math.min(1, t / 0.66)) * progression;

    ctx.clearRect(0, 0, L, H);
    ctx.drawImage(fond, 0, 0);

    // ---------------------------------------------------------- AVATAR
    ctx.beginPath();
    ctx.arc(cx, cy, rayonAnneau + 7, 0, Math.PI * 2);
    ctx.fillStyle = theme.pastille;
    ctx.fill();

    ctx.beginPath();
    ctx.arc(cx, cy, rayonAnneau, 0, Math.PI * 2);
    ctx.strokeStyle = theme.bordure;
    ctx.lineWidth = 8;
    ctx.stroke();

    if (avancee > 0) {
      const grad = ctx.createLinearGradient(cx - rayonAnneau, cy - rayonAnneau, cx + rayonAnneau, cy + rayonAnneau);
      grad.addColorStop(0, accent);
      grad.addColorStop(1, accent2);
      ctx.beginPath();
      ctx.arc(cx, cy, rayonAnneau, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * avancee);
      ctx.strokeStyle = grad;
      ctx.lineWidth = 8;
      ctx.lineCap = 'round';
      ctx.stroke();
      ctx.lineCap = 'butt';
    }

    if (avatar) cercleImage(ctx, avatar, ax, ay, tailleAvatar);
    else {
      ctx.beginPath();
      ctx.arc(cx, cy, tailleAvatar / 2, 0, Math.PI * 2);
      ctx.fillStyle = accent;
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.font = '86px "Poppins Bold", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText((donnees.pseudo || '?').charAt(0).toUpperCase(), cx, cy + 4);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
    }

    // --------------------------------------------------- RANG ET NIVEAU
    const droite = L - 45;
    ctx.textAlign = 'right';
    ctx.font = '22px "Poppins Medium", sans-serif';
    const lNiveau = ctx.measureText('NIVEAU ').width;
    ctx.font = '52px "Poppins Bold", sans-serif';
    const lValeur = ctx.measureText(String(donnees.niveau)).width;

    ctx.fillStyle = accent;
    ctx.fillText(String(donnees.niveau), droite, 78);
    ctx.font = '22px "Poppins Medium", sans-serif';
    ctx.fillStyle = theme.texteSecondaire;
    ctx.fillText('NIVEAU', droite - lValeur - 12, 78);

    ctx.font = '40px "Poppins Bold", sans-serif';
    ctx.fillStyle = theme.texte;
    const texteRang = `#${donnees.rang}`;
    const lRang = ctx.measureText(texteRang).width;
    const xRang = droite - lValeur - lNiveau - 46;
    ctx.fillText(texteRang, xRang, 74);
    ctx.font = '20px "Poppins Medium", sans-serif';
    ctx.fillStyle = theme.texteSecondaire;
    ctx.fillText('RANG', xRang - lRang - 10, 74);
    ctx.textAlign = 'left';

    // ------------------------------------------------------------ TEXTE
    ctx.font = '44px "Poppins Bold", sans-serif';
    ctx.fillStyle = theme.texte;
    ctx.fillText(tronquerTexte(ctx, donnees.pseudo, 420), barreX, 145);

    ctx.font = '22px "Poppins", sans-serif';
    ctx.fillStyle = theme.texteSecondaire;
    const identifiant = donnees.tag ? `@${donnees.tag}` : '';
    ctx.fillText(tronquerTexte(ctx, identifiant, 300), barreX, 177);

    const prestige = Number(donnees.prestige) || 0;
    if (prestige > 0) {
      const apres = barreX + Math.min(ctx.measureText(identifiant).width, 300) + (identifiant ? 14 : 0);
      dessinerEtoiles(ctx, apres, 170, Math.min(prestige, 5), accent, theme);
      if (prestige > 5) {
        ctx.font = '17px "Poppins Bold", sans-serif';
        ctx.fillStyle = accent;
        ctx.fillText(`×${prestige}`, apres + 5 * 22 + 4, 177);
      }
    }

    ctx.font = '19px "Poppins", sans-serif';
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

    // --------------------------------------------------------- BARRE XP
    rectArrondi(ctx, barreX, barreY, barreL, barreH, barreH / 2);
    ctx.fillStyle = theme.piste;
    ctx.fill();
    ctx.strokeStyle = theme.bordure;
    ctx.lineWidth = 2;
    ctx.stroke();

    const rempli = Math.max(avancee > 0 ? barreH : 0, barreL * avancee);
    if (rempli > 0) {
      const grad = ctx.createLinearGradient(barreX, 0, barreX + barreL, 0);
      grad.addColorStop(0, accent);
      grad.addColorStop(1, accent2);
      rectArrondi(ctx, barreX, barreY, rempli, barreH, barreH / 2);
      ctx.fillStyle = grad;
      ctx.fill();

      // Reflet qui balaie la partie remplie
      ctx.save();
      rectArrondi(ctx, barreX, barreY, rempli, barreH, barreH / 2);
      ctx.clip();
      const balayage = barreX - 120 + ((t * 1.6) % 1.6) * (barreL + 240);
      const brillance = ctx.createLinearGradient(balayage - 60, 0, balayage + 60, 0);
      brillance.addColorStop(0, 'rgba(255,255,255,0)');
      brillance.addColorStop(0.5, 'rgba(255,255,255,0.35)');
      brillance.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = brillance;
      ctx.fillRect(barreX, barreY, rempli, barreH);
      ctx.restore();
    }

    ctx.font = '19px "Poppins Bold", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const xc = barreX + barreL / 2;
    ctx.fillStyle = xc < barreX + rempli - 10 ? '#ffffff' : theme.texte;
    ctx.fillText(
      `${formaterNombre(Math.round(donnees.xpActuel * (avancee / (progression || 1))))} / ${formaterNombre(donnees.xpRequis)} XP`,
      xc,
      barreY + barreH / 2 + 1
    );
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';

    const donneesImage = ctx.getImageData(0, 0, L, H).data;
    const palette = quantize(donneesImage, COULEURS);
    const indices = applyPalette(donneesImage, palette);
    encodeur.writeFrame(indices, L, H, { palette, delay: DELAI });
  }

  encodeur.finish();
  return Buffer.from(encodeur.bytes());
}

module.exports = { genererCarteAnimee, IMAGES };
