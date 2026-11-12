/**
 * Les paliers d'avertissements : « a 3 avertissements actifs, mute 1 h »...
 *
 * Avant Wumi 2.0, l'echelle etait la meme pour tous les serveurs, ecrite dans
 * warn.js. Chaque serveur peut maintenant avoir la sienne (/paliers, ou le
 * tableau de bord). Elle est gardee en JSON dans config.paliers_avert ; vide,
 * c'est l'echelle par defaut ci-dessous qui s'applique.
 */
const { config, majConfig } = require('../database/db');

const DEFAUT = {
  3: { type: 'mute', duree: 60 * 60 * 1000 },
  5: { type: 'mute', duree: 24 * 60 * 60 * 1000 },
  7: { type: 'kick' },
  10: { type: 'ban' },
};

const TYPES = ['mute', 'kick', 'ban'];
const MAX_PALIERS = 10;
const MUTE_MAX = 28 * 24 * 60 * 60 * 1000; // limite Discord d'un timeout

/** Verifie et nettoie une echelle venue de la base ou d'un formulaire. */
function nettoyer(brut) {
  const sortie = {};
  for (const [n, p] of Object.entries(brut ?? {})) {
    const nombre = Number(n);
    if (!Number.isInteger(nombre) || nombre < 1 || nombre > 50) continue;
    if (!p || !TYPES.includes(p.type)) continue;
    if (p.type === 'mute') {
      const duree = Number(p.duree);
      if (!Number.isFinite(duree) || duree < 60_000) continue;
      sortie[nombre] = { type: 'mute', duree: Math.min(duree, MUTE_MAX) };
    } else {
      sortie[nombre] = { type: p.type };
    }
  }
  return sortie;
}

/** L'echelle d'un serveur. */
function lire(guildId) {
  const brut = config(guildId).paliers_avert;
  if (!brut) return { ...DEFAUT };
  try {
    return nettoyer(JSON.parse(brut));
  } catch {
    return { ...DEFAUT };
  }
}

function ecrire(guildId, paliers) {
  const propre = nettoyer(paliers);
  if (Object.keys(propre).length > MAX_PALIERS) throw new Error('trop de paliers');
  majConfig(guildId, { paliers_avert: JSON.stringify(propre) });
  return propre;
}

/** Revenir a l'echelle par defaut. */
function reinitialiser(guildId) {
  majConfig(guildId, { paliers_avert: null });
}

/** Ajoute, remplace ou retire (type 'aucune') un palier. */
function definir(guildId, nombre, type, duree = null) {
  const paliers = lire(guildId);
  if (type === 'aucune') delete paliers[nombre];
  else paliers[nombre] = type === 'mute' ? { type, duree } : { type };
  return ecrire(guildId, paliers);
}

module.exports = { DEFAUT, TYPES, MAX_PALIERS, MUTE_MAX, lire, ecrire, definir, reinitialiser, nettoyer };
