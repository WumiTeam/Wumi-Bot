/**
 * /kick — expulser un membre du serveur, sans purge de messages.
 */
const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  InteractionContextType,
} = require('discord.js');
const C = require('../../utils/composants');
const { peutSanctionner } = require('../../utils/outils');
const { enregistrer } = require('../../utils/sanctions');
const { traducteur, localisations, t: tr, DEFAUT } = require('../../utils/langues');

module.exports = {
  categorie: 'moderation',

  data: new SlashCommandBuilder()
    .setName('kick')
    .setNameLocalizations({ fr: 'expulser' })
    .setDescription(tr('kick.description_commande', DEFAUT))
    .setDescriptionLocalizations(localisations('kick.description_commande'))
    .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
    .setContexts(InteractionContextType.Guild)
    .addUserOption((o) => o
      .setName('member')
      .setNameLocalizations({ fr: 'membre' })
      .setDescription(tr('kick.opt_membre', DEFAUT))
      .setDescriptionLocalizations(localisations('kick.opt_membre'))
      .setRequired(true))
    .addStringOption((o) => o
      .setName('reason')
      .setNameLocalizations({ fr: 'raison' })
      .setDescription(tr('kick.opt_raison', DEFAUT))
      .setDescriptionLocalizations(localisations('kick.opt_raison'))
      .setMaxLength(400)),

  async execute(interaction) {
    const { t } = traducteur(interaction);

    const cible = interaction.options.getUser('member');
    const raison = interaction.options.getString('reason') ?? t('sanction.sans_raison');

    const membre = await interaction.guild.members.fetch(cible.id).catch(() => null);
    if (!membre) {
      return interaction.reply(C.erreurPrivee(t('kick.absent')));
    }

    // peutSanctionner rend une CLE, pas une phrase : c'est ici qu'on la
    // traduit, parce que c'est ici qu'on connait la langue du serveur.
    const cle = peutSanctionner(interaction.member, membre, interaction.guild.members.me);
    if (cle) return interaction.reply(C.erreurPrivee(t(cle)));

    await interaction.deferReply();

    // enregistrer() envoie le MP AVANT d'expulser, puis expulse ; si
    // l'expulsion echoue, la sanction est retiree de l'historique.
    let id;
    try {
      id = await enregistrer({
        guild: interaction.guild,
        cible,
        moderateur: interaction.user,
        type: 'kick',
        raison,
        action: () => membre.kick(`${raison} — ${interaction.user.tag}`),
      });
    } catch (e) {
      return interaction.editReply(C.erreur(t('kick.impossible', { erreur: e.message })));
    }

    return interaction.editReply(C.succes(
      t('kick.fait', { membre: cible.tag })
      + `\n> ${t('sanction.raison', { raison })}`
      + `\n-# ${t('sanction.numero', { n: id })}`
    ));
  },
};
