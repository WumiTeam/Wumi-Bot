/**
 * /play — joue une musique (recherche SoundCloud, ou lien). Avec
 * l'autocompletion : les resultats s'affichent pendant qu'on tape.
 */
const { SlashCommandBuilder, InteractionContextType } = require('discord.js');
const { musique } = require('../../musique/lecteur');
const { traducteur, localisations, t: tr, DEFAUT } = require('../../utils/langues');

const d = (o, cle) => o.setDescription(tr(cle, DEFAUT)).setDescriptionLocalizations(localisations(cle));

module.exports = {
  categorie: 'musique',

  data: d(new SlashCommandBuilder().setName('play').setNameLocalizations({ fr: 'jouer' }), 'musique.play_description')
    .setContexts(InteractionContextType.Guild)
    .addStringOption((o) => d(o.setName('search').setNameLocalizations({ fr: 'recherche' }), 'musique.opt_recherche')
      .setRequired(true).setMaxLength(300).setAutocomplete(true))
    .addBooleanOption((o) => d(o.setName('next').setNameLocalizations({ fr: 'ensuite' }), 'musique.opt_ensuite')),

  async autocomplete(interaction) {
    const choix = await musique.suggestions(interaction.options.getFocused()).catch(() => []);
    return interaction.respond(choix).catch(() => null);
  },

  async execute(interaction) {
    const { t } = traducteur(interaction);
    return require('./musique').lancerLecture(interaction, t, {
      requete: interaction.options.getString('search'),
      suivant: interaction.options.getBoolean('next') ?? false,
    });
  },
};
