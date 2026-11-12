const { Events } = require('discord.js');
const { config } = require('../database/db');
const { rafraichirCache } = require('../utils/invitations');

module.exports = {
  name: Events.InviteDelete,
  async execute(invitation) {
    if (!invitation.guild) return;
    if (!config(invitation.guild.id).invitations_actif) return;
    await rafraichirCache(invitation.guild).catch(() => null);
  },
};
