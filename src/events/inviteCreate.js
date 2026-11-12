const { Events } = require('discord.js');
const { config } = require('../database/db');
const { rafraichirCache } = require('../utils/invitations');

module.exports = {
  name: Events.InviteCreate,
  async execute(invitation) {
    if (!invitation.guild) return;
    if (!config(invitation.guild.id).invitations_actif) return;
    // Le cache doit connaitre la nouvelle invitation avant qu'elle ne serve
    await rafraichirCache(invitation.guild).catch(() => null);
  },
};
