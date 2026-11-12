/**
 * /unmute — rendre la parole a un membre exclu temporairement.
 *
 * La sanction `mute` est marquee inactive en base EN PLUS de la levee du
 * timeout Discord : sans ca, la tache periodique continuerait de croire qu'il
 * y a un mute a lever, et l'historique du membre montrerait une sanction en
 * cours alors qu'il parle depuis une heure.
 */
const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  InteractionContextType,
} = require('discord.js');
const { db } = require('../../database/db');
const C = require('../../utils/composants');
const { enregistrer } = require('../../utils/sanctions');
const { traducteur, localisations, t: tr, DEFAUT } = require('../../utils/langues');

module.exports = {
  categorie: 'moderation',

  data: new SlashCommandBuilder()
    .setName('unmute')
    .setDescription(tr('unmute.description_commande', DEFAUT))
    .setDescriptionLocalizations(localisations('unmute.description_commande'))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .setContexts(InteractionContextType.Guild)
    .addUserOption((o) => o
      .setName('member')
      .setNameLocalizations({ fr: 'membre' })
      .setDescription(tr('unmute.opt_membre', DEFAUT))
      .setDescriptionLocalizations(localisations('unmute.opt_membre'))
      .setRequired(true))
    .addStringOption((o) => o
      .setName('reason')
      .setNameLocalizations({ fr: 'raison' })
      .setDescription(tr('unmute.opt_raison', DEFAUT))
      .setDescriptionLocalizations(localisations('unmute.opt_raison'))
      .setMaxLength(400)),

  async execute(interaction) {
    const { t } = traducteur(interaction);

    const cible = interaction.options.getUser('member');
    const raison = interaction.options.getString('reason') ?? t('sanction.sans_raison');

    const membre = await interaction.guild.members.fetch(cible.id).catch(() => null);
    if (!membre) {
      return interaction.reply(C.erreurPrivee(t('unmute.pas_sur_serveur')));
    }
    if (!membre.isCommunicationDisabled()) {
      return interaction.reply(C.erreurPrivee(t('unmute.pas_muet')));
    }

    await interaction.deferReply();
    await membre.timeout(null, t('unmute.audit', { raison, moderateur: interaction.user.tag }));

    db.prepare("UPDATE sanctions SET actif = 0 WHERE guild_id = ? AND user_id = ? AND type = 'mute'").run(interaction.guild.id, cible.id);

    await enregistrer({
      guild: interaction.guild,
      cible,
      moderateur: interaction.user,
      type: 'unmute',
      raison,
    });

    return interaction.editReply(C.succes(t('unmute.fait', { membre: cible.tag })));
  },
};
