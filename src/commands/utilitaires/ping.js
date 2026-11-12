const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const conf = require('../../../config');
const { traducteur, localisations, t: tr, DEFAUT } = require('../../utils/langues');

module.exports = {
  categorie: 'utilitaires',

  data: new SlashCommandBuilder()
    .setName('ping')
    .setDescription(tr('ping.description_commande', DEFAUT))
    .setDescriptionLocalizations(localisations('ping.description_commande')),

  async execute(interaction, client) {
    const { t, duree } = traducteur(interaction);

    const debut = Date.now();
    await interaction.deferReply();
    const aller = Date.now() - debut;

    return interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor(client.ws.ping < 200 ? conf.couleurs.succes : conf.couleurs.avertissement)
          .setTitle(`🏓 ${t('ping.titre')}`)
          .addFields(
            { name: t('ping.latence'), value: `${Math.round(client.ws.ping)} ms`, inline: true },
            { name: t('ping.aller_retour'), value: `${aller} ms`, inline: true },
            { name: t('ping.en_ligne'), value: duree(client.uptime), inline: true }
          ),
      ],
    });
  },
};
