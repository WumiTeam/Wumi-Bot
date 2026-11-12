/**
 * /lfg — recherche de joueurs. Voir src/utils/lfg.js.
 */
const { SlashCommandBuilder, InteractionContextType, PermissionFlagsBits } = require('discord.js');
const C = require('../../utils/composants');
const lfg = require('../../utils/lfg');
const { traducteur, localisations, t: tr, DEFAUT } = require('../../utils/langues');

const d = (o, cle) => o.setDescription(tr(cle, DEFAUT)).setDescriptionLocalizations(localisations(cle));

module.exports = {
  categorie: 'utilitaires',

  data: d(new SlashCommandBuilder().setName('lfg'), 'lfg.description_commande')
    .setContexts(InteractionContextType.Guild)
    .addStringOption((o) => d(o.setName('game').setNameLocalizations({ fr: 'jeu' }), 'lfg.opt_jeu').setRequired(true).setMaxLength(60))
    .addIntegerOption((o) => d(o.setName('players').setNameLocalizations({ fr: 'joueurs' }), 'lfg.opt_joueurs').setRequired(true).setMinValue(2).setMaxValue(20))
    .addStringOption((o) => d(o.setName('details'), 'lfg.opt_details').setMaxLength(200))
    .addIntegerOption((o) => d(o.setName('expires').setNameLocalizations({ fr: 'expire' }), 'lfg.opt_expire').addChoices(
      { name: '30 min', value: 30 }, { name: '1 h', value: 60 }, { name: '2 h', value: 120 }, { name: '6 h', value: 360 },
    )),

  async execute(interaction) {
    const { t } = traducteur(interaction);
    const salon = interaction.channel;
    if (!salon?.permissionsFor(interaction.guild.members.me)?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages])) {
      return interaction.reply(C.erreurPrivee(t('lfg.droits')));
    }
    const nettoyer = (s) => (s ? String(s).replace(/@(everyone|here)/gi, '@​$1').trim() : null);
    try {
      await lfg.publier(salon, {
        hote: interaction.user.id,
        jeu: nettoyer(interaction.options.getString('game')),
        details: nettoyer(interaction.options.getString('details')),
        places: interaction.options.getInteger('players'),
        dureeMin: interaction.options.getInteger('expires') ?? 120,
      }, t);
    } catch {
      return interaction.reply(C.erreurPrivee(t('lfg.echec')));
    }
    return interaction.reply(C.succesPrive(t('lfg.publie')));
  },
};
