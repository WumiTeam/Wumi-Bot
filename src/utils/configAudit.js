/**
 * Le journal d'audit du panneau /config.
 *
 * POURQUOI UNE TABLE A PART, ET UN SEUL POINT D'ECRITURE
 * Le panneau ecrit un reglage a la fois, mais par une bonne douzaine de
 * chemins differents (bouton oui/non, menu de salon, menu de role, fenetre de
 * texte, valeur speciale, import de fichier...). Ajouter l'ecriture du
 * journal dans chacun de ces chemins, c'est l'oublier dans un an quand un
 * treizieme chemin apparaitra. `enregistrer()` dans panneauConfig.js est deja
 * le SEUL endroit qui ecrit un reglage du panneau en base (majConfig) : c'est
 * donc le seul endroit d'ou `noter()` est appele. L'import (/config-import)
 * passe par le meme point, avec `source: 'import'`.
 */
const { req } = require('../database/db');

// Comme activite.js : un semestre suffit a repondre « qui a change quoi »,
// et une table qui grossit sans fin coute de l'espace pour rien.
const JOURS_CONSERVES = 180;

/** Note un changement. `avant`/`apres` sont converties en texte : le journal est un historique, pas une source de verite typee. */
function noter({ guildId, cle, avant, apres, par, source = 'panneau' }) {
  req.ajouterAuditConfig.run({
    guild_id: guildId,
    cle,
    avant: avant === null || avant === undefined ? null : String(avant),
    apres: apres === null || apres === undefined ? null : String(apres),
    par,
    source,
    date: Date.now(),
  });
}

/** Les changements les plus recents d'un serveur, du plus recent au plus ancien. */
function lister(guildId, limite = 20, offset = 0) {
  return req.auditConfig.all(guildId, limite, offset);
}

/** Combien de changements au total, pour la pagination. */
function compter(guildId) {
  return req.compterAuditConfig.get(guildId).n;
}

/** Supprime les entrees de plus de six mois. Appele par le menage quotidien (src/events/ready.js). */
function purger() {
  req.purgerAuditConfig.run(Date.now() - JOURS_CONSERVES * 86_400_000);
}

module.exports = { noter, lister, compter, purger, JOURS_CONSERVES };
