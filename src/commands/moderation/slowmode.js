/**
 * /slowmode — regle le mode lent d'un salon.
 */
const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
  InteractionContextType,
} = require('discord.js');
const C = require('../../utils/composants');
const { parserDuree } = require('../../utils/outils');
const { traducteur, localisations, t: tr, DEFAUT } = require('../../utils/langues');

module.exports = {
  categorie: 'moderation',

  data: new SlashCommandBuilder()
    .setName('slowmode')
    .setNameLocalizations({ fr: 'mode-lent' })
    .setDescription(tr('slowmode.description_commande', DEFAUT))
    .setDescriptionLocalizations(localisations('slowmode.description_commande'))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .setContexts(InteractionContextType.Guild)
    .addStringOption((o) => o
      .setName('duration')
      .setNameLocalizations({ fr: 'duree' })
      .setDescription(tr('slowmode.opt_duree', DEFAUT))
      .setDescriptionLocalizations(localisations('slowmode.opt_duree'))
      .setRequired(true))
    .addChannelOption((o) => o
      .setName('channel')
      .setNameLocalizations({ fr: 'salon' })
      .setDescription(tr('slowmode.opt_salon', DEFAUT))
      .setDescriptionLocalizations(localisations('slowmode.opt_salon'))
      .addChannelTypes(ChannelType.GuildText)),

  async execute(interaction) {
    const { t, duree: enDuree } = traducteur(interaction);

    const saisie = interaction.options.getString('duration');
    const salon = interaction.options.getChannel('channel') ?? interaction.channel;

    const duree = saisie.trim() === '0' ? 0 : parserDuree(saisie);
    if (duree === null) {
      return interaction.reply(C.erreurPrivee(t('slowmode.duree_invalide')));
    }

    const secondes = Math.floor(duree / 1000);
    if (secondes > 21600) {
      return interaction.reply(C.erreurPrivee(t('slowmode.maximum')));
    }

    await salon.setRateLimitPerUser(secondes, t('slowmode.audit', { moderateur: interaction.user.tag }));

    return interaction.reply(C.succes(
      secondes === 0
        ? t('slowmode.desactive', { salon })
        : t('slowmode.regle', { duree: enDuree(secondes * 1000), salon })
    ));
  },
};
