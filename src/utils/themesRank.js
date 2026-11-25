const conf = require('../../config');
const { req } = require('../database/db');

// Charge a la demande : premium.js lit aussi la base, et un theme n'en a
// besoin que pour les themes premium.
const estPremium = (guildId) => require('./premium').estPremium(guildId);

const THEMES = conf.themesRank ?? {};
const CLE_DEFAUT = Object.keys(THEMES)[0] ?? 'nature';

/** Couleurs de texte deduites du theme : un theme sombre porte du texte clair. */
function habillage(theme) {
  return theme.sombre
    ? {
        texte: '#ffffff',
        texteSecondaire: 'rgba(255, 255, 255, 0.72)',
        piste: 'rgba(0, 0, 0, 0.38)',
        bordure: 'rgba(255, 255, 255, 0.18)',
        pastille: 'rgba(20, 22, 26, 0.80)',
        reflet: 'rgba(255, 255, 255, 0.18)',
      }
    : {
        texte: conf.carte.texte,
        texteSecondaire: conf.carte.texteSecondaire,
        piste: 'rgba(255, 255, 255, 0.75)',
        bordure: 'rgba(27, 36, 25, 0.12)',
        pastille: 'rgba(255, 255, 255, 0.92)',
        reflet: 'rgba(255, 255, 255, 0.20)',
      };
}

/** Theme complet (cle + couleurs de texte) a partir de sa cle. */
function parCle(cle, langue = null) {
  const brut = THEMES[cle] ?? THEMES[CLE_DEFAUT] ?? {};
  const theme = {
    cle: THEMES[cle] ? cle : CLE_DEFAUT,
    ...brut,
    voile: brut.voile ?? conf.carte.voile,
    accent: brut.accent ?? conf.carte.accent,
    accent2: brut.accent2 ?? conf.carte.accentSecondaire,
    ...habillage(brut),
  };
  // 2.24 : nom et description dans la langue demandee (voir utils/donnees.js).
  return langue ? require('./donnees').localiser('themes', theme.cle, theme, langue) : theme;
}

/** Tous les themes, dans l'ordre du fichier de configuration. */
function liste(langue = null) {
  return Object.keys(THEMES).map((cle) => parCle(cle, langue));
}

/** Un theme existe-t-il ? */
function existe(cle) {
  return Object.hasOwn(THEMES, cle);
}

/** Le membre a-t-il acces a ce theme ? (les themes gratuits le sont pour tous) */
function possede(guildId, userId, cle) {
  if (!existe(cle)) return false;
  // Theme premium (2.22) : offert sur un serveur premium, ferme ailleurs.
  if (THEMES[cle].premium) return estPremium(guildId);
  if ((THEMES[cle].prix ?? 0) <= 0) return true;
  return Boolean(req.possede.get(guildId, userId, cle));
}

/** Cles des themes accessibles au membre. */
function possessions(guildId, userId) {
  const achetes = req.possessions.all(guildId, userId).map((l) => l.cle);
  return Object.keys(THEMES).filter((cle) => (THEMES[cle].premium
    ? estPremium(guildId)
    : (THEMES[cle].prix ?? 0) <= 0 || achetes.includes(cle)));
}

/** Enregistre l'achat d'un theme. */
function acheter(guildId, userId, cle) {
  req.posseder.run(guildId, userId, cle);
}

/** Definit le theme equipe. */
function equiper(guildId, userId, cle) {
  req.choisirTheme.run(guildId, userId, cle);
}

/**
 * Theme equipe par un membre.
 * Si le theme choisi a disparu de la configuration, on revient au theme par defaut
 * plutot que de casser la generation de la carte.
 */
/**
 * 2.24 : le theme par defaut d'un serveur premium (choisi sur le tableau de
 * bord), pour les membres qui n'en ont equipe aucun. Null sinon.
 */
function themeServeur(guildId) {
  try {
    if (!require('./premium').estPremium(guildId)) return null;
    const cle = require('../database/db').config(guildId).theme_defaut;
    return cle && existe(cle) ? cle : null;
  } catch {
    return null;
  }
}

function themeDe(guildId, userId) {
  const ligne = req.themeChoisi.get(guildId, userId);
  const cle = ligne?.cle && existe(ligne.cle) && possede(guildId, userId, ligne.cle) ? ligne.cle : (themeServeur(guildId) ?? CLE_DEFAUT);
  return parCle(cle, require('./donnees').langueDe(guildId));
}

module.exports = { THEMES, CLE_DEFAUT, parCle, liste, existe, possede, possessions, acheter, equiper, themeDe, themeServeur };
