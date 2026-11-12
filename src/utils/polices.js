const path = require('node:path');
const fs = require('node:fs');
const { GlobalFonts } = require('@napi-rs/canvas');
const logger = require('./logger');

let chargees = false;

/** Enregistre les polices Poppins livrees avec le bot (une seule fois). */
function chargerPolices() {
  if (chargees) return;
  const dossier = path.join(__dirname, '..', 'assets', 'fonts');
  const fichiers = [
    ['Poppins-Regular.ttf', 'Poppins', 400],
    ['Poppins-Medium.ttf', 'Poppins Medium', 500],
    ['Poppins-Bold.ttf', 'Poppins Bold', 700],
    ['Poppins-Light.ttf', 'Poppins Light', 300],
  ];
  let ok = 0;
  for (const [fichier, nom] of fichiers) {
    const chemin = path.join(dossier, fichier);
    if (!fs.existsSync(chemin)) continue;
    try {
      GlobalFonts.registerFromPath(chemin, nom);
      ok++;
    } catch (e) {
      logger.avertissement(`Police ${fichier} non chargee :`, e.message);
    }
  }
  if (ok === 0) {
    logger.avertissement(
      "Aucune police trouvee dans src/assets/fonts : les images utiliseront la police systeme."
    );
  }
  chargees = true;
}

module.exports = { chargerPolices };
