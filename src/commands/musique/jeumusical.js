/**
 * /musicgame (/jeu-musical) — quiz musical, « Qui l'a choisie ? » et vibe check
 * dans le vocal. Voir src/musique/jeuxMusicaux.js.
 */
const { SlashCommandBuilder, InteractionContextType, PermissionFlagsBits } = require('discord.js');
const C = require('../../utils/composants');
const { config } = require('../../database/db');
const { musique } = require('../../musique/lecteur');
const bt = require('../../musique/blindtest');
const jm = require('../../musique/jeuxMusicaux');
const { traducteur, localisations, t: tr, DEFAUT } = require('../../utils/langues');

const d = (o, cle) => o.setDescription(tr(cle, DEFAUT)).setDescriptionLocalizations(localisations(cle));
const NOMS = {
  hits_fr: ['French hits', 'Hits français'], monde: ['World hits', 'Hits internationaux'], annees80: ['80s', 'Années 80'],
  annees2000: ['2000s', 'Années 2000'], rap_fr: ['French rap', 'Rap français'], melange: ['Mix', 'Mélange'],
};
const theme = (o) => d(o.setName('theme'), 'jeuxmusicaux.opt_theme')
  .addChoices(...bt.THEMES.map((k) => ({ name: NOMS[k][0], name_localizations: { fr: NOMS[k][1] }, value: k })));
const manches = (o) => d(o.setName('rounds').setNameLocalizations({ fr: 'manches' }), 'jeuxmusicaux.opt_manches').setMinValue(3).setMaxValue(20);

module.exports = {
  categorie: 'musique',

  data: d(new SlashCommandBuilder().setName('musicgame').setNameLocalizations({ fr: 'jeu-musical' }), 'jeuxmusicaux.description_commande')
    .setContexts(InteractionContextType.Guild)
    .addSubcommand((s) => d(s.setName('quiz'), 'jeuxmusicaux.sous_quiz').addStringOption(theme).addIntegerOption(manches))
    .addSubcommand((s) => d(s.setName('who-picked').setNameLocalizations({ fr: 'qui-l-a-choisie' }), 'jeuxmusicaux.sous_qui'))
    .addSubcommand((s) => d(s.setName('vibe-check'), 'jeuxmusicaux.sous_vibe').addStringOption(theme).addIntegerOption(manches))
    .addSubcommand((s) => d(s.setName('stop').setNameLocalizations({ fr: 'arreter' }), 'jeuxmusicaux.sous_arreter')),

  async execute(interaction) {
    const { t } = traducteur(interaction);
    const guild = interaction.guild;
    const sous = interaction.options.getSubcommand();

    if (sous === 'stop') {
      const partie = jm.enCours(guild.id);
      if (!partie) return interaction.reply(C.erreurPrivee(t('jeuxmusicaux.aucune')));
      const dj = config(guild.id).musique_dj;
      const peut = partie.auteur === interaction.user.id
        || interaction.memberPermissions.has(PermissionFlagsBits.ManageGuild)
        || (dj && interaction.member.roles.cache.has(dj));
      if (!peut) return interaction.reply(C.erreurPrivee(t('jeuxmusicaux.arret_reserve')));
      jm.arreter(guild.id);
      return interaction.reply(C.succes(t('jeuxmusicaux.arrete')));
    }

    if (!musique.configure()) return interaction.reply(C.erreurPrivee(t('musique.non_configure')));
    if (!musique.disponible()) return interaction.reply(C.erreurPrivee(t('musique.indisponible')));
    if (jm.enCours(guild.id) || bt.enCours(guild.id)) return interaction.reply(C.erreurPrivee(t('jeuxmusicaux.en_cours')));
    const vocal = interaction.member.voice?.channel;
    if (!vocal) return interaction.reply(C.erreurPrivee(t('musique.rejoins_vocal')));
    const perms = vocal.permissionsFor(guild.members.me);
    if (!perms?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak])) {
      return interaction.reply(C.erreurPrivee(t('musique.droits_vocal', { salon: `${vocal}` })));
    }
    if (!interaction.channel?.permissionsFor(guild.members.me)?.has(PermissionFlagsBits.SendMessages)) {
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
    const jeu = { quiz: 'quiz', 'who-picked': 'qui', 'vibe-check': 'vibe' }[sous];
    jm.lancer({
      jeu, guild, salon: interaction.channel, lecteur, t, nouveauLecteur, auteur: interaction.user.id,
      theme: interaction.options.getString('theme') ?? 'melange',
      manches: interaction.options.getInteger('rounds') ?? (jeu === 'vibe' ? 8 : 10),
    });
    return interaction.editReply(C.succes(t('jeuxmusicaux.lance', { jeu: t(`jeuxmusicaux.nom_${jeu}`), vocal: `${vocal}` })));
  },
};
