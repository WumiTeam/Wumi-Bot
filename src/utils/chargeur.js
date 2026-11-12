/**
 * Chargement des commandes, utilisable a chaud.
 *
 * Le meme code sert au demarrage et au bouton « Recharger » du panneau : on
 * vide le cache de require pour les fichiers de commandes, puis on relit tout.
 * Ca suffit pour une correction dans une commande ou dans un utilitaire
 * qu'elle utilise, sans couper le bot.
 *
 * Ce que ca ne rattrape PAS : les evenements (deja branches sur le client),
 * config.js et le schema de la base, lus une seule fois au demarrage. Pour
 * ceux-la il faut un vrai redemarrage — le panneau le dit.
 */
const fs = require('node:fs');
const path = require('node:path');
const logger = require('./logger');

const DOSSIER = path.join(__dirname, '..', 'commands');

/** Oublie du cache tout ce qui vient du dossier des commandes et des utilitaires. */
function oublierCache() {
  const commandes = path.join(__dirname, '..', 'commands') + path.sep;
  const utils = path.join(__dirname) + path.sep;
  for (const cle of Object.keys(require.cache)) {
    // Ni ce fichier ni le logger : les oublier casserait les references deja
    // tenues ailleurs (le tampon de la console, par exemple).
    if (cle === __filename || cle.endsWith(path.join('utils', 'logger.js'))) continue;
    if (cle.startsWith(commandes) || cle.startsWith(utils)) delete require.cache[cle];
  }
}

/**
 * Relit toutes les commandes dans client.commandes.
 * @param {object} client
 * @param {boolean} rechargement vrai pour vider le cache avant de relire
 * @returns {{ chargees: number, erreurs: string[] }}
 */
function chargerCommandes(client, rechargement = false) {
  if (rechargement) oublierCache();

  const trouvees = new Map();
  const erreurs = [];

  const parcourir = (dossier) => {
    for (const entree of fs.readdirSync(dossier, { withFileTypes: true })) {
      const chemin = path.join(dossier, entree.name);
      if (entree.isDirectory()) {
        parcourir(chemin);
        continue;
      }
      if (!entree.name.endsWith('.js')) continue;
      try {
        const commande = require(chemin);
        if (!commande?.data || !commande?.execute) {
          erreurs.push(`${entree.name} : data ou execute manquant`);
          continue;
        }
        commande.categorie = path.basename(path.dirname(chemin));
        trouvees.set(commande.data.name, commande);
      } catch (e) {
        // Une commande cassee ne doit pas emporter les autres : on la note et
        // on continue. Au rechargement, l'ancienne version reste en place.
        erreurs.push(`${entree.name} : ${e.message}`);
      }
    }
  };

  parcourir(DOSSIER);

  if (!trouvees.size) {
    erreurs.push('aucune commande valide trouvée : rien remplacé');
    return { chargees: 0, erreurs };
  }

  client.commandes.clear();
  for (const [nom, commande] of trouvees) client.commandes.set(nom, commande);

  for (const e of erreurs) logger.avertissement('Chargement :', e);
  return { chargees: trouvees.size, erreurs };
}

/**
 * Qui relancera le bot s'il s'arrete ?
 * demarrer.bat pose ZHAAK_SUPERVISEUR ; PM2 pose ses propres variables.
 */
function superviseur() {
  if (process.env.pm_id !== undefined || process.env.PM2_HOME) return 'PM2';
  if (process.env.ZHAAK_SUPERVISEUR) return process.env.ZHAAK_SUPERVISEUR;
  return null;
}

module.exports = { chargerCommandes, superviseur, DOSSIER };
