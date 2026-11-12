/**
 * /mute — rendre un membre muet via l'exclusion temporaire (timeout) native
 * de Discord. Plafonne a 28 jours : c'est une limite de l'API, pas un choix
 * du bot — au-dela, c'est `/ban` avec une duree qu'il faut utiliser.
 */
const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  InteractionContextType,
} = require('discord.js');
const C = require('../../utils/composants');
const { peutSanctionner, parserDuree } = require('../../utils/outils');
const { enregistrer } = require('../../utils/sanctions');
const { traducteur, localisations, t: tr, DEFAUT } = require('../../utils/langues');

const MAX_TIMEOUT = 28 * 24 * 60 * 60 * 1000; // limite Discord : 28 jours

module.exports = {
  categorie: 'moderation',

  data: new SlashCommandBuilder()
    .setName('mute')
    .setDescription(tr('mute.description_commande', DEFAUT))
    .setDescriptionLocalizations(localisations('mute.description_commande'))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .setContexts(InteractionContextType.Guild)
    .addUserOption((o) => o
      .setName('member')
      .setNameLocalizations({ fr: 'membre' })
      .setDescription(tr('mute.opt_membre', DEFAUT))
      .setDescriptionLocalizations(localisations('mute.opt_membre'))
      .setRequired(true))
    .addStringOption((o) => o
      .setName('duration')
      .setNameLocalizations({ fr: 'duree' })
      .setDescription(tr('mute.opt_duree', DEFAUT))
      .setDescriptionLocalizations(localisations('mute.opt_duree'))
      .setRequired(true))
    .addStringOption((o) => o
      .setName('reason')
      .setNameLocalizations({ fr: 'raison' })
      .setDescription(tr('mute.opt_raison', DEFAUT))
      .setDescriptionLocalizations(localisations('mute.opt_raison'))
      .setMaxLength(400)),

  async execute(interaction) {
    const { t, duree: enDuree } = traducteur(interaction);

    const cible = interaction.options.getUser('member');
    const raison = interaction.options.getString('reason') ?? t('sanction.sans_raison');
    const duree = parserDuree(interaction.options.getString('duration'));

    // Message generique (sanction.duree_invalide) : c'est la meme erreur que
    // /ban, inutile de la reecrire ici avec ses propres exemples.
    if (!duree) {
      return interaction.reply(C.erreurPrivee(t('sanction.duree_invalide')));
    }
    if (duree > MAX_TIMEOUT) {
      return interaction.reply(C.erreurPrivee(t('mute.trop_long')));
    }

    const membre = await interaction.guild.members.fetch(cible.id).catch(() => null);
    if (!membre) {
      return interaction.reply(C.erreurPrivee(t('mute.absent')));
    }

    // peutSanctionner rend une CLE, pas une phrase : c'est ici qu'on la
    // traduit, parce que c'est ici qu'on connait la langue du serveur.
    const cle = peutSanctionner(interaction.member, membre, interaction.guild.members.me);
    if (cle) return interaction.reply(C.erreurPrivee(t(cle)));

    if (!membre.moderatable) {
      return interaction.reply(C.erreurPrivee(t('mute.pas_moderable')));
    }

    await interaction.deferReply();

    try {
      await membre.timeout(duree, `${raison} — ${interaction.user.tag}`);
    } catch (e) {
      return interaction.editReply(C.erreur(t('mute.impossible', { erreur: e.message })));
    }

    const id = await enregistrer({
      guild: interaction.guild,
      cible,
      moderateur: interaction.user,
      type: 'mute',
      raison,
      duree,
    });

    return interaction.editReply(C.succes(
      t('mute.fait', { membre: cible.tag, duree: enDuree(duree) })
      + `\n> ${t('sanction.raison', { raison })}`
      + `\n-# ${t('sanction.numero', { n: id })}`
    ));
  },
};
