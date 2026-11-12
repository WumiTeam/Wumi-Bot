const { Events } = require('discord.js');

/**
 * Chaque nouvelle ligne du journal d'audit passe par l'anti-nuke
 * (src/utils/antiNuke.js). Il faut l'intent GuildModeration (deja demande)
 * et la permission « Voir les logs du serveur » pour Wumi.
 */
module.exports = {
  name: Events.GuildAuditLogEntryCreate,
  async execute(entree, guild) {
    await require('../utils/antiNuke').surEntree(entree, guild);
  },
};
