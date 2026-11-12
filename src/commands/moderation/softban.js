/**
 * /softban — bannit puis debannit aussitot.
 *
 * Le membre est expulse ET ses messages recents sont effaces, mais il peut
 * revenir avec une invitation. C'est la reponse classique a un compte pirate
 * qui a spamme des liens partout : on nettoie sans punir definitivement la
 * personne derriere.
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
    .setName('softban')
    .setDescription(tr('softban.description_commande', DEFAUT))
    .setDescriptionLocalizations(localisations('softban.description_commande'))
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .setContexts(InteractionContextType.Guild)
    .addUserOption((o) => o
      .setName('member')
      .setNameLocalizations({ fr: 'membre' })
      .setDescription(tr('softban.opt_membre', DEFAUT))
      .setDescriptionLocalizations(localisations('softban.opt_membre'))
      .setRequired(true))
    .addStringOption((o) => o
      .setName('reason')
      .setNameLocalizations({ fr: 'raison' })
      .setDescription(tr('softban.opt_raison', DEFAUT))
      .setDescriptionLocalizations(localisations('softban.opt_raison'))
      .setMaxLength(400))
    .addIntegerOption((o) => o
      .setName('days')
      .setNameLocalizations({ fr: 'jours' })
      .setDescription(tr('softban.opt_jours', DEFAUT))
      .setDescriptionLocalizations(localisations('softban.opt_jours'))
      .setMinValue(1)
      .setMaxValue(7)),

  async execute(interaction) {
    const { t } = traducteur(interaction);
    const cible = interaction.options.getUser('member');
    const raison = interaction.options.getString('reason') ?? t('sanction.sans_raison');
    const jours = interaction.options.getInteger('days') ?? 1;

    const membre = await interaction.guild.members.fetch(cible.id).catch(() => null);
    if (!membre) return interaction.reply(C.erreurPrivee(t('softban.absent')));
    const cle = peutSanctionner(interaction.member, membre, interaction.guild.members.me);
    if (cle) return interaction.reply(C.erreurPrivee(t(cle)));
    if (!membre.bannable) return interaction.reply(C.erreurPrivee(t('sanction.pas_gerable')));

    await interaction.deferReply();

    let id;
    try {
      id = await enregistrer({
        guild: interaction.guild,
        cible,
        moderateur: interaction.user,
        type: 'softban',
        raison,
        action: async () => {
          await interaction.guild.members.ban(cible.id, {
            reason: `Softban : ${raison} — ${interaction.user.tag}`,
            deleteMessageSeconds: jours * 86400,
          });
          // Le debannissement doit suivre, meme si Discord tousse une fois.
          await interaction.guild.members.unban(cible.id, 'Softban : levée immédiate')
            .catch(() => interaction.guild.members.unban(cible.id, 'Softban : levée immédiate (2e essai)'));
        },
      });
    } catch (e) {
      return interaction.editReply(C.erreur(t('softban.impossible', { erreur: e.message })));
    }

    return interaction.editReply(C.succes(
      t('softban.fait', { membre: cible.username, n: jours })
      + `\n> ${t('sanction.raison', { raison })}`
      + `\n-# ${t('sanction.numero', { n: id })}`
    ));
  },
};
