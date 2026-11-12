const { Events } = require('discord.js');

// Le starboard recompte les etoiles a chaque changement.
module.exports = {
  name: Events.MessageReactionRemove,
  async execute(reaction) {
    await require('../utils/starboard').traiter(reaction).catch(() => null);
  },
};
