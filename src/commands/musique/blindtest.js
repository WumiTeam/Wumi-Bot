/**
 * /blindtest — le jeu musical dans le vocal. Voir src/musique/blindtest.js.
 */
const { SlashCommandBuilder, InteractionContextType, PermissionFlagsBits } = require('discord.js');
const C = require('../../utils/composants');
const { config } = require('../../database/db');
const { musique } = require('../../musique/lecteur');
const bt = require('../../musique/blindtest');
const { traducteur, localisations, t: tr, DEFAUT } = require('../../utils/langues');

const d = (o, cle) => o.setDescription(tr(cle, DEFAUT)).setDescriptionLocalizations(localisations(cle));
const NOMS = {
  hits_fr: ['French hits', 'Hits français'], monde: ['World hits', 'Hits internationaux'], annees80: ['80s', 'Années 80'],
  annees2000: ['2000s', 'Années 2000'], rap_fr: ['French rap', 'Rap français'], melange: ['Mix', 'Mélange'],
};

module.exports = {
  categorie: 'musique',

  data: d(new SlashCommandBuilder().setName('blindtest'), 'blindtest.description_commande')
    .setContexts(InteractionContextType.Guild)
    .addSubcommand((s) => d(s.setName('start').setNameLocalizations({ fr: 'lancer' }), 'blindtest.sous_lancer')
      .addStringOption((o) => d(o.setName('theme'), 'blindtest.opt_theme')
        .addChoices(...bt.THEMES.map((k) => ({ name: NOMS[k][0], name_localizations: { fr: NOMS[k][1] }, value: k }))))
      .addIntegerOption((o) => d(o.setName('rounds').setNameLocalizations({ fr: 'manches' }), 'blindtest.opt_manches').setMinValue(3).setMaxValue(20)))
    .addSubcommand((s) => d(s.setName('stop').setNameLocalizations({ fr: 'arreter' }), 'blindtest.sous_arreter')),

  async execute(interaction) {
    const { t } = traducteur(interaction);
    const guild = interaction.guild;

    if (interaction.options.getSubcommand() === 'stop') {
      const partie = bt.enCours(guild.id);
      if (!partie) return interaction.reply(C.erreurPrivee(t('blindtest.aucune')));
      const dj = config(guild.id).musique_dj;
      const peut = partie.auteur === interaction.user.id
        || interaction.memberPermissions.has(PermissionFlagsBits.ManageGuild)
        || (dj && interaction.member.roles.cache.has(dj));
      if (!peut) return interaction.reply(C.erreurPrivee(t('blindtest.arret_reserve')));
      bt.arreter(guild.id);
      return interaction.reply(C.succes(t('blindtest.arrete')));
    }

    if (!musique.configure()) return interaction.reply(C.erreurPrivee(t('musique.non_configure')));
    if (!musique.disponible()) return interaction.reply(C.erreurPrivee(t('musique.indisponible')));
    if (bt.enCours(guild.id)) return interaction.reply(C.erreurPrivee(t('blindtest.en_cours')));
    const vocal = interaction.member.voice?.channel;
    if (!vocal) return interaction.reply(C.erreurPrivee(t('musique.rejoins_vocal')));
    const perms = vocal.permissionsFor(guild.members.me);
    if (!perms?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak])) {
      return interaction.reply(C.erreurPrivee(t('musique.droits_vocal', { salon: `${vocal}` })));
    }
    if (!interaction.channel?.permissionsFor(guild.members.me)?.has([PermissionFlagsBits.SendMessages, PermissionFlagsBits.AddReactions])) {
      return interaction.reply(C.erreurPrivee(t('blindtest.droits_salon')));
    }

    let lecteur = musique.obtenir(guild.id);
    if (lecteur && (lecteur.salonVocal !== vocal.id || lecteur.actuelle)) {
      return interaction.reply(C.erreurPrivee(t('blindtest.musique_en_cours')));
    }
    await interaction.deferReply();
    const nouveauLecteur = !lecteur;
    if (!lecteur) {
      try {
        lecteur = await musique.creer(guild, vocal.id, interaction.channelId);
      } catch {
        return interaction.editReply(C.erreur(t('musique.connexion_echec')));
      }
    }
    const theme = interaction.options.getString('theme') ?? 'melange';
    const manches = interaction.options.getInteger('rounds') ?? 10;
    bt.lancer({ guild, salon: interaction.channel, lecteur, theme, manches, auteur: interaction.user.id, t, nouveauLecteur });
    return interaction.editReply(C.succes(t('blindtest.lance', { vocal: `${vocal}` })));
  },
};
