/**
 * /autorole — le role donne automatiquement a chaque nouveau membre.
 *
 * Le reglage existait deja (config.role_auto, utilise par guildMemberAdd),
 * mais il fallait passer par /config. Le site promettait /autorole : la
 * voici, avec les verifications qui evitent les mauvaises surprises.
 */
const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  InteractionContextType,
} = require('discord.js');
const C = require('../../utils/composants');
const { config, majConfig } = require('../../database/db');
const { traducteur, localisations, t: tr, DEFAUT } = require('../../utils/langues');

const SENSIBLES = [
  PermissionFlagsBits.Administrator,
  PermissionFlagsBits.ManageGuild,
  PermissionFlagsBits.ManageRoles,
  PermissionFlagsBits.BanMembers,
  PermissionFlagsBits.KickMembers,
  PermissionFlagsBits.ModerateMembers,
  PermissionFlagsBits.ManageMessages,
  PermissionFlagsBits.ManageChannels,
  PermissionFlagsBits.MentionEveryone,
];

module.exports = {
  categorie: 'config',

  data: new SlashCommandBuilder()
    .setName('autorole')
    .setDescription(tr('autorole.description_commande', DEFAUT))
    .setDescriptionLocalizations(localisations('autorole.description_commande'))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .setContexts(InteractionContextType.Guild)
    .addSubcommand((s) => s
      .setName('set')
      .setNameLocalizations({ fr: 'definir' })
      .setDescription(tr('autorole.sous_definir', DEFAUT))
      .setDescriptionLocalizations(localisations('autorole.sous_definir'))
      .addRoleOption((o) => o
        .setName('role')
        .setDescription(tr('autorole.opt_role', DEFAUT))
        .setDescriptionLocalizations(localisations('autorole.opt_role'))
        .setRequired(true)))
    .addSubcommand((s) => s
      .setName('disable')
      .setNameLocalizations({ fr: 'desactiver' })
      .setDescription(tr('autorole.sous_desactiver', DEFAUT))
      .setDescriptionLocalizations(localisations('autorole.sous_desactiver')))
    .addSubcommand((s) => s
      .setName('view')
      .setNameLocalizations({ fr: 'voir' })
      .setDescription(tr('autorole.sous_voir', DEFAUT))
      .setDescriptionLocalizations(localisations('autorole.sous_voir'))),

  async execute(interaction) {
    const { t } = traducteur(interaction);
    const sous = interaction.options.getSubcommand();
    const guildId = interaction.guild.id;

    if (sous === 'disable') {
      majConfig(guildId, { role_auto: null });
      return interaction.reply(C.succes(t('autorole.desactive')));
    }

    if (sous === 'view') {
      const id = config(guildId).role_auto;
      const role = id ? interaction.guild.roles.cache.get(id) : null;
      if (!role) return interaction.reply(C.infoPrivee(t('autorole.aucun')));
      return interaction.reply(C.infoPrivee(
        t('autorole.actuel', { role: `${role}` }) + (role.editable ? '' : `\n⚠️ ${t('autorole.trop_haut', { role: `${role}` })}`)
      ));
    }

    const role = interaction.options.getRole('role');
    if (role.managed || role.id === guildId) return interaction.reply(C.erreurPrivee(t('autorole.gere')));
    if (!role.editable) return interaction.reply(C.erreurPrivee(t('autorole.trop_haut', { role: `${role}` })));
    if (SENSIBLES.some((p) => role.permissions.has(p))) return interaction.reply(C.erreurPrivee(t('autorole.dangereux', { role: `${role}` })));

    majConfig(guildId, { role_auto: role.id });
    return interaction.reply(C.succes(t('autorole.defini', { role: `${role}` }), { allowedMentions: { parse: [] } }));
  },
};
