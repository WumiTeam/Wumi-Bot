/**
 * Les bannieres du serveur support (src/assets/bannieres/*.png).
 *
 * Elles sont dessinees une fois pour toutes par outils/generer-bannieres.js.
 * Ici on se contente de les lire (une fois, puis en memoire) et de fournir de
 * quoi les afficher dans un message Components V2 :
 *
 *     const b = banniere('ticket', 'fr');
 *     C.image(b.url)            // dans le conteneur
 *     { files: [b.fichier()] }  // a l'envoi
 *
 * Rappel V2 : une piece jointe ne s'affiche PAS toute seule, il faut une
 * galerie qui pointe dessus avec attachment://nom.
 */
const fs = require('node:fs');
const path = require('node:path');
const { AttachmentBuilder } = require('discord.js');

const DOSSIER = path.join(__dirname, '..', 'assets', 'bannieres');
const cache = new Map();

function lireFichier(nom, langue) {
  for (const l of [langue, 'fr', 'en']) {
    const chemin = path.join(DOSSIER, `${nom}.${l}.png`);
    const cle = `${nom}.${l}`;
    if (cache.has(cle)) return { cle, data: cache.get(cle) };
    if (fs.existsSync(chemin)) {
      const data = fs.readFileSync(chemin);
      cache.set(cle, data);
      return { cle, data };
    }
  }
  return null;
}

/**
 * @param {'panneau'|'ticket'|'formulaire'|'ferme'|'verification'} nom
 * @param {string} langue
 * @returns {{ url: string, fichier: () => AttachmentBuilder } | null}
 */
function banniere(nom, langue = 'fr') {
  const trouve = lireFichier(nom, langue);
  if (!trouve) return null;
  const nomFichier = `wumi-${nom}.png`;
  return {
    url: `attachment://${nomFichier}`,
    fichier: () => new AttachmentBuilder(trouve.data, { name: nomFichier }),
  };
}

module.exports = { banniere };
