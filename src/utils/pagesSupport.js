/**
 * LES PAGES DU SERVEUR SUPPORT (Wumi 2.27).
 *
 * Un message fait sur discord.builders, exporte en JSON, range dans
 * src/assets/pages-support/<nom>.json (un tableau de conteneurs) :
 *
 *   - le 1er conteneur est LE message, poste dans le salon ;
 *   - ses boutons dont le custom_id commence par « page_ » ouvrent, dans
 *     l'ordre, les conteneurs suivants : 1er bouton page_ -> 2e conteneur,
 *     2e bouton page_ -> 3e conteneur, etc. La page s'affiche EN PRIVE a
 *     celui qui clique ;
 *   - les boutons lien restent des liens.
 *
 * Images : « attachment://<fichier> » designe un fichier du meme dossier.
 * Texte : « {{nom}} » est remplace par l'emoji E(nom) (ex. {{wumi}}).
 *
 * Publication et mise a jour : node outils/publier-pages.js <salon> [nom].
 */
const fs = require('node:fs');
const path = require('node:path');
const { MessageFlags, AttachmentBuilder } = require('discord.js');
const { E } = require('./emojis');

const DOSSIER = path.join(__dirname, '..', 'assets', 'pages-support');
const PREFIXE = 'page_';

function remplacer(valeur, emoji = E) {
  if (typeof valeur === 'string') return valeur.replace(/\{\{(\w+)\}\}/g, (_, nom) => emoji(nom) || '');
  if (Array.isArray(valeur)) return valeur.map((v) => remplacer(v, emoji));
  if (valeur && typeof valeur === 'object') {
    const copie = {};
    for (const [k, v] of Object.entries(valeur)) copie[k] = remplacer(v, emoji);
    return copie;
  }
  return valeur;
}

/** Les fichiers « attachment://x » cites dans ces composants. */
function fichiersDe(composants) {
  const noms = new Set();
  JSON.stringify(composants).replace(/attachment:\/\/([\w.-]+)/g, (_, n) => noms.add(n));
  return [...noms].filter((n) => fs.existsSync(path.join(DOSSIER, n)));
}

function boutonsPage(conteneur) {
  const ids = [];
  const parcourir = (c) => {
    if (c?.type === 2 && typeof c.custom_id === 'string' && c.custom_id.startsWith(PREFIXE)) ids.push(c.custom_id);
    for (const e of c?.components ?? []) parcourir(e);
  };
  parcourir(conteneur);
  return ids;
}

/** { nom, message, pages: Map(custom_id -> conteneur) } pour chaque JSON. */
function charger() {
  const ensembles = [];
  if (!fs.existsSync(DOSSIER)) return ensembles;
  for (const f of fs.readdirSync(DOSSIER).filter((x) => x.endsWith('.json')).sort()) {
    const conteneurs = JSON.parse(fs.readFileSync(path.join(DOSSIER, f), 'utf8'));
    const [message, ...suite] = conteneurs;
    const pages = new Map();
    boutonsPage(message).forEach((id, i) => { if (suite[i]) pages.set(id, suite[i]); });
    ensembles.push({ nom: f.slice(0, -5), message, pages });
  }
  return ensembles;
}

/** Le corps d'envoi (composants V2 + fichiers) pour ces conteneurs. */
function corps(conteneurs, emoji) {
  const composants = remplacer(conteneurs, emoji);
  const fichiers = fichiersDe(composants);
  return {
    components: composants,
    flags: MessageFlags.IsComponentsV2,
    fichiers: fichiers.map((n) => ({ name: n, chemin: path.join(DOSSIER, n) })),
  };
}

function trouverPage(customId) {
  for (const e of charger()) if (e.pages.has(customId)) return e.pages.get(customId);
  return null;
}

async function gererInteraction(interaction) {
  const page = trouverPage(interaction.customId);
  if (!page) {
    return interaction.reply({ content: 'Cette page n’existe plus.', flags: MessageFlags.Ephemeral });
  }
  const c = corps([page]);
  return interaction.reply({
    components: c.components,
    files: c.fichiers.map((f) => new AttachmentBuilder(f.chemin, { name: f.name })),
    flags: c.flags | MessageFlags.Ephemeral,
  });
}

module.exports = { charger, corps, trouverPage, gererInteraction, PREFIXE, DOSSIER };
