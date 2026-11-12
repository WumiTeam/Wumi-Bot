/**
 * /audit — le bilan de securite du serveur. Toute la logique est dans
 * src/utils/audit.js.
 *
 *   lancer        le rapport, visible du seul admin
 *   hebdo         le rapport poste chaque semaine dans un salon staff
 *   hebdo-off     arrete le rapport hebdomadaire
 */
const { SlashCommandBuilder, InteractionContextType, PermissionFlagsBits, ChannelType, MessageFlags } = require('discord.js');
const C = require('../../utils/composants');
const { majConfig } = require('../../database/db');
const audit = require('../../utils/audit');
const { traducteur, localisations, t: tr, DEFAUT } = require('../../utils/langues');

const d = (o, cle) => o.setDescription(tr(cle, DEFAUT)).setDescriptionLocalizations(localisations(cle));

module.exports = {
  categorie: 'config',

  data: d(new SlashCommandBuilder().setName('audit'), 'audit.description_commande')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setContexts(InteractionContextType.Guild)
    .addSubcommand((s) => d(s.setName('run').setNameLocalizations({ fr: 'lancer' }), 'audit.sous_lancer'))
    .addSubcommand((s) => d(s.setName('weekly').setNameLocalizations({ fr: 'hebdo' }), 'audit.sous_hebdo')
      .addChannelOption((o) => d(o.setName('channel').setNameLocalizations({ fr: 'salon' }), 'audit.opt_salon')
        .setRequired(true).addChannelTypes(ChannelType.GuildText)))
    .addSubcommand((s) => d(s.setName('weekly-off').setNameLocalizations({ fr: 'hebdo-off' }), 'audit.sous_hebdo_off')),

  async execute(interaction) {
    const { t } = traducteur(interaction);
    const guild = interaction.guild;
    const sous = interaction.options.getSubcommand();

    if (sous === 'weekly-off') {
      majConfig(guild.id, { audit_salon: null });
      return interaction.reply(C.succesPrive(t('audit.hebdo_off')));
    }

    if (sous === 'weekly') {
      const salon = interaction.options.getChannel('channel');
      if (!salon.permissionsFor(guild.members.me)?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages])) {
        return interaction.reply(C.erreurPrivee(t('audit.droits', { salon: `${salon}` })));
      }
      if (salon.permissionsFor(guild.roles.everyone)?.has(PermissionFlagsBits.ViewChannel)) {
        return interaction.reply(C.erreurPrivee(t('audit.salon_public', { salon: `${salon}` })));
      }
      // audit_date a null : le premier rapport part au prochain passage (moins d'une heure).
      majConfig(guild.id, { audit_salon: salon.id, audit_date: null });
      return interaction.reply(C.succesPrive(t('audit.hebdo_on', { salon: `${salon}` })));
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const r = await audit.analyser(guild);
    return interaction.editReply(audit.rapport(guild, r, t, { prive: false }));
  },
};
