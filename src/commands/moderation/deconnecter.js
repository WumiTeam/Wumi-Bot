/**
 * /vocal-mod — deconnecte un membre d'un salon vocal (ou deplace tout un
 * salon vers un autre).
 *
 * Plus doux qu'un mute ou un kick : le membre reste sur le serveur, il est
 * juste sorti du vocal ou il derangeait. Le deplacement de masse sert apres
 * un evenement, ou pour vider un salon a fermer.
 */
const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  InteractionContextType,
  ChannelType,
} = require('discord.js');
const C = require('../../utils/composants');
const { peutSanctionner } = require('../../utils/outils');
const { enregistrer } = require('../../utils/sanctions');
const { traducteur, localisations, t: tr, DEFAUT } = require('../../utils/langues');

const VOCAUX = [ChannelType.GuildVoice, ChannelType.GuildStageVoice];

module.exports = {
  categorie: 'moderation',

  data: new SlashCommandBuilder()
    .setName('voicemod')
    .setNameLocalizations({ fr: 'vocal-mod' })
    .setDescription(tr('vocalmod.description_commande', DEFAUT))
    .setDescriptionLocalizations(localisations('vocalmod.description_commande'))
    .setDefaultMemberPermissions(PermissionFlagsBits.MoveMembers)
    .setContexts(InteractionContextType.Guild)
    .addSubcommand((s) => s
      .setName('disconnect')
      .setNameLocalizations({ fr: 'deconnecter' })
      .setDescription(tr('vocalmod.sous_deconnecter', DEFAUT))
      .setDescriptionLocalizations(localisations('vocalmod.sous_deconnecter'))
      .addUserOption((o) => o
        .setName('member')
        .setNameLocalizations({ fr: 'membre' })
        .setDescription(tr('vocalmod.opt_membre', DEFAUT))
        .setDescriptionLocalizations(localisations('vocalmod.opt_membre'))
        .setRequired(true))
      .addStringOption((o) => o
        .setName('reason')
        .setNameLocalizations({ fr: 'raison' })
        .setDescription(tr('vocalmod.opt_raison', DEFAUT))
        .setDescriptionLocalizations(localisations('vocalmod.opt_raison'))
        .setMaxLength(300)))
    .addSubcommand((s) => s
      .setName('move-all')
      .setNameLocalizations({ fr: 'deplacer-tout' })
      .setDescription(tr('vocalmod.sous_deplacer', DEFAUT))
      .setDescriptionLocalizations(localisations('vocalmod.sous_deplacer'))
      .addChannelOption((o) => o
        .setName('from')
        .setNameLocalizations({ fr: 'depuis' })
        .setDescription(tr('vocalmod.opt_depuis', DEFAUT))
        .setDescriptionLocalizations(localisations('vocalmod.opt_depuis'))
        .addChannelTypes(...VOCAUX)
        .setRequired(true))
      .addChannelOption((o) => o
        .setName('to')
        .setNameLocalizations({ fr: 'vers' })
        .setDescription(tr('vocalmod.opt_vers', DEFAUT))
        .setDescriptionLocalizations(localisations('vocalmod.opt_vers'))
        .addChannelTypes(...VOCAUX))),

  async execute(interaction) {
    const { t } = traducteur(interaction);
    const sous = interaction.options.getSubcommand();

    if (sous === 'disconnect') {
      const cible = interaction.options.getUser('member');
      const raison = interaction.options.getString('reason') ?? t('sanction.sans_raison');
      const membre = await interaction.guild.members.fetch(cible.id).catch(() => null);
      if (!membre?.voice?.channelId) return interaction.reply(C.erreurPrivee(t('vocalmod.pas_en_vocal')));
      const cle = peutSanctionner(interaction.member, membre, interaction.guild.members.me);
      if (cle) return interaction.reply(C.erreurPrivee(t(cle)));

      const salon = membre.voice.channel;
      try {
        await membre.voice.disconnect(`${raison} — ${interaction.user.tag}`);
      } catch (e) {
        return interaction.reply(C.erreurPrivee(t('vocalmod.impossible', { erreur: e.message })));
      }
      await enregistrer({ guild: interaction.guild, cible, moderateur: interaction.user, type: 'deconnexion', raison, prevenirEnMp: false });
      return interaction.reply(C.succes(t('vocalmod.deconnecte', { membre: `${membre}`, salon: `${salon}` })));
    }

    // ------------------------------------------------------- DEPLACER TOUT
    const depuis = interaction.options.getChannel('from');
    const vers = interaction.options.getChannel('to');
    const presents = [...depuis.members.values()];
    if (!presents.length) return interaction.reply(C.infoPrivee(t('vocalmod.vide', { salon: `${depuis}` })));
    if (vers && vers.id === depuis.id) return interaction.reply(C.erreurPrivee(t('vocalmod.meme_salon')));

    await interaction.deferReply();
    let ok = 0;
    for (const m of presents) {
      // Deplacer (ou deconnecter si aucune destination)
      const fait = await m.voice.setChannel(vers ?? null, `${interaction.user.tag} : /vocal-mod`).then(() => true).catch(() => false);
      if (fait) ok++;
    }
    return interaction.editReply(C.succes(vers
      ? t('vocalmod.deplaces', { n: ok, total: presents.length, depuis: `${depuis}`, vers: `${vers}` })
      : t('vocalmod.vides', { n: ok, total: presents.length, depuis: `${depuis}` })));
  },
};
