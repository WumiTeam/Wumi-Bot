/**
 * /review (/avis) — laisser un avis sur Wumi (2.40). Voir src/utils/avis.js.
 * Un avis par personne : en ecrire un nouveau remplace l'ancien.
 */
const { SlashCommandBuilder } = require('discord.js');
const C = require('../../utils/composants');
const avis = require('../../utils/avis');
const { req } = require('../../database/db');
const { traducteur, localisations, t: tr, DEFAUT } = require('../../utils/langues');

const d = (o, cle) => o.setDescription(tr(cle, DEFAUT)).setDescriptionLocalizations(localisations(cle));
const NOTES = [5, 4, 3, 2, 1].map((n) => ({ name: `${'★'.repeat(n)}${'☆'.repeat(5 - n)} (${n}/5)`, value: n }));

module.exports = {
  categorie: 'utilitaires',

  data: d(new SlashCommandBuilder().setName('review').setNameLocalizations({ fr: 'avis' }), 'avis.description_commande')
    .addSubcommand((s) => d(s.setName('write').setNameLocalizations({ fr: 'ecrire' }), 'avis.sous_ecrire')
      .addIntegerOption((o) => d(o.setName('rating').setNameLocalizations({ fr: 'note' }), 'avis.opt_note').setRequired(true).addChoices(...NOTES))
      .addStringOption((o) => d(o.setName('text').setNameLocalizations({ fr: 'texte' }), 'avis.opt_texte').setRequired(true).setMinLength(10).setMaxLength(300)))
    .addSubcommand((s) => d(s.setName('view').setNameLocalizations({ fr: 'voir' }), 'avis.sous_voir'))
    .addSubcommand((s) => d(s.setName('delete').setNameLocalizations({ fr: 'supprimer' }), 'avis.sous_supprimer')),

  async execute(interaction) {
    const { t, langue } = traducteur(interaction);
    const sous = interaction.options.getSubcommand();
    const actuel = req.lireAvis.get(interaction.user.id);

    if (sous === 'delete') {
      if (!actuel) return interaction.reply(C.erreurPrivee(t('avis.aucun')));
      req.supprimerAvis.run(interaction.user.id);
      return interaction.reply(C.succesPrive(t('avis.supprime')));
    }
    if (sous === 'view') {
      if (!actuel) return interaction.reply(C.infoPrivee(t('avis.aucun')));
      return interaction.reply(C.infoPrivee(t('avis.le_tien', {
        etoiles: avis.etoiles(actuel.note), texte: actuel.texte, statut: t(`avis.statut_${actuel.statut}`),
      })));
    }

    await interaction.deferReply({ flags: 64 });
    const note = interaction.options.getInteger('rating');
    const texte = interaction.options.getString('text');
    await avis.deposer(interaction.client, interaction.user, note, texte, langue);
    return interaction.editReply(C.succes(t('avis.merci', { etoiles: avis.etoiles(note) })));
  },
};
