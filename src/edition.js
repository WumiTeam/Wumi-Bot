/**
 * Wumi 2.35 · LES EDITIONS : faire tourner le meme code comme un AUTRE bot
 * (son propre token, sa base, sa langue, ses modules, son deck de cartes).
 *
 *   WUMI_EDITION=auvergne   -> src/editions/auvergne.js
 *   (vide)                  -> Wumi normal, rien ne change
 *
 * Avantage sur une copie du projet : chaque correction de Wumi profite aussi
 * a l'edition, il n'y a qu'un code a maintenir.
 */
const NOM = String(process.env.WUMI_EDITION ?? '').trim().toLowerCase();
const PROFILS = { auvergne: () => require('./editions/auvergne'), modmail: () => require('./editions/modmail') };
const profil = NOM && PROFILS[NOM] ? PROFILS[NOM]() : null;

/** Cette commande existe-t-elle dans l'edition ? (toujours oui pour Wumi) */
function commandeAutorisee(categorie, nomFichier, nomCommande) {
  if (!profil) return true;
  if (categorie === 'fondateur') return false;
  if (!profil.categories.includes(categorie)) return false;
  return !profil.sans.includes(nomFichier) && !profil.sans.includes(nomCommande);
}

module.exports = { nom: profil ? NOM : null, profil, actif: Boolean(profil), commandeAutorisee };
