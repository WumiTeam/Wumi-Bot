const { Events } = require('discord.js');

// Le starboard recompte les etoiles a chaque changement.
module.exports = {
  name: Events.MessageReactionRemoveEmoji,
  async execute(reaction) {
    await require('../utils/starboard').traiter(reaction).catch(() => null);
  },
};
