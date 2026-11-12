/**
 * Clic droit sur un message › Applications › « Sanctionner l'auteur ».
 * Le message est rappele dans le panneau et peut etre supprime en meme temps.
 * Voir src/utils/sanctionRapide.js.
 */
const { ContextMenuCommandBuilder, ApplicationCommandType, PermissionFlagsBits, InteractionContextType } = require('discord.js');
const C = require('../../utils/composants');
const { traducteur, t: tr } = require('../../utils/langues');

module.exports = {
  categorie: 'moderation',

  data: new ContextMenuCommandBuilder()
    .setName('Sanction author')
    .setNameLocalizations({ fr: tr('sr.nom_message', 'fr') })
    .setType(ApplicationCommandType.Message)
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .setContexts(InteractionContextType.Guild),

  async execute(interaction) {
    const message = interaction.targetMessage;
    if (message.author.bot || message.system) return interaction.reply(C.erreurPrivee(traducteur(interaction).t('sr.message_bot')));
    return require('../../utils/sanctionRapide').ouvrir(interaction, { cible: message.author, message });
  },
};
