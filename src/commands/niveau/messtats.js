const { SlashCommandBuilder, AttachmentBuilder, InteractionContextType } = require('discord.js');
const { req } = require('../../database/db');
const stats = require('../../utils/statsMembre');
const { infosNiveau } = require('../../utils/niveaux');
const { genererGraphiqueMembre } = require('../../utils/graphiqueMembre');
const C = require('../../utils/composants');
const { traducteur, localisations, t: tr, DEFAUT } = require('../../utils/langues');

module.exports = {
  categorie: 'niveau',

  data: new SlashCommandBuilder()
    .setName('messtats')
    .setDescription(tr('messtats.description_commande', DEFAUT))
    .setDescriptionLocalizations(localisations('messtats.description_commande'))
    .addUserOption((o) => o
      .setName('member')
      .setNameLocalizations({ fr: 'membre' })
      .setDescription(tr('messtats.opt_membre', DEFAUT))
      .setDescriptionLocalizations(localisations('messtats.opt_membre')))
    .setContexts(InteractionContextType.Guild),

  async execute(interaction) {
    const { t } = traducteur(interaction);
    await interaction.deferReply();

    const guildId = interaction.guild.id;
    const cible = interaction.options.getUser('member') ?? interaction.user;
    if (cible.bot) {
      return interaction.editReply(C.erreur(t('messtats.pas_de_bot')));
    }

    const heures = stats.heures(guildId, cible.id);
    const total = heures.reduce((a, b) => a + b, 0);
    const brutSalons = stats.salons(guildId, cible.id, 5);

    if (!total && !brutSalons.length) {
      return interaction.editReply(C.info(
        cible.id === interaction.user.id
          ? t('messtats.vide_soi')
          : t('messtats.vide_autre', { pseudo: cible.username })
      ));
    }

    // Les salons sont stockes par identifiant : on resout les noms ici, et on
    // ecarte ceux qui n'existent plus plutot que d'afficher un identifiant brut.
    const salons = [];
    for (const s of brutSalons) {
      const salon = interaction.guild.channels.cache.get(s.channel_id) ?? null;
      if (salon) salons.push({ nom: salon.name, messages: s.messages });
    }

    const ligne = req.getXp.get(guildId, cible.id);
    const membre = await interaction.guild.members.fetch(cible.id).catch(() => null);
    const pseudo = membre?.displayName ?? cible.username;

    const png = await genererGraphiqueMembre({
      pseudo,
      serveur: interaction.guild.name,
      avatarUrl: cible.displayAvatarURL({ extension: 'png', size: 128 }),
      heures,
      salons,
      messages: ligne?.messages ?? total,
      secondesVocal: ligne?.secondes_vocal ?? 0,
      niveau: infosNiveau(ligne?.xp ?? 0).niveau,
      plage: stats.plageFavorite(heures),
    });

    const nomFichier = `messtats-${cible.id}.png`;
    return interaction.editReply(C.envoi([
      C.conteneur([C.image(`attachment://${nomFichier}`, t('messtats.alt', { pseudo }))]),
    ], { files: [new AttachmentBuilder(png, { name: nomFichier })] }));
  },
};
