/**
 * Clic droit sur un membre › Applications › « Sanctionner ».
 * Voir src/utils/sanctionRapide.js.
 */
const { ContextMenuCommandBuilder, ApplicationCommandType, PermissionFlagsBits, InteractionContextType } = require('discord.js');
const { t: tr } = require('../../utils/langues');

module.exports = {
  categorie: 'moderation',

  data: new ContextMenuCommandBuilder()
    .setName('Sanction')
    .setNameLocalizations({ fr: tr('sr.nom_membre', 'fr') })
    .setType(ApplicationCommandType.User)
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .setContexts(InteractionContextType.Guild),

  async execute(interaction) {
    return require('../../utils/sanctionRapide').ouvrir(interaction, { cible: interaction.targetUser });
  },
};
