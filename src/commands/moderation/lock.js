/**
 * /lock — verrouille ou deverrouille un salon (ou tout le serveur).
 *
 * L'ANNONCE POSTEE DANS LE SALON RESTE UN EMBED CLASSIQUE, PAS DU COMPONENTS
 * V2. `envoyerLog` (src/utils/logs.js, hors de mon lot) attend un embed et le
 * reenvoie tel quel a la fois au salon des logs et — ici — au salon concerne :
 * changer ca reviendrait a toucher un utilitaire partage. Seule la reponse a
 * l'interaction (`interaction.editReply`) passe en V2.
 */
const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  PermissionsBitField,
  EmbedBuilder,
  ChannelType,
  InteractionContextType,
} = require('discord.js');
const conf = require('../../../config');
const C = require('../../utils/composants');
const { envoyerLog } = require('../../utils/logs');
const { E } = require('../../utils/emojis');
const { traducteur, localisations, t: tr, DEFAUT } = require('../../utils/langues');

module.exports = {
  categorie: 'moderation',

  data: new SlashCommandBuilder()
    .setName('lock')
    .setNameLocalizations({ fr: 'verrouiller' })
    .setDescription(tr('lock.description_commande', DEFAUT))
    .setDescriptionLocalizations(localisations('lock.description_commande'))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .setContexts(InteractionContextType.Guild)
    .addSubcommand((s) => s
      .setName('channel')
      .setNameLocalizations({ fr: 'salon' })
      .setDescription(tr('lock.sous_salon', DEFAUT))
      .setDescriptionLocalizations(localisations('lock.sous_salon'))
      .addChannelOption((o) => o
        .setName('channel')
        .setNameLocalizations({ fr: 'salon' })
        .setDescription(tr('lock.opt_salon', DEFAUT))
        .setDescriptionLocalizations(localisations('lock.opt_salon'))
        .addChannelTypes(ChannelType.GuildText))
      .addStringOption((o) => o
        .setName('reason')
        .setNameLocalizations({ fr: 'raison' })
        .setDescription(tr('lock.opt_raison', DEFAUT))
        .setDescriptionLocalizations(localisations('lock.opt_raison'))
        .setMaxLength(400)))
    .addSubcommand((s) => s
      .setName('open')
      .setNameLocalizations({ fr: 'ouvrir' })
      .setDescription(tr('lock.sous_ouvrir', DEFAUT))
      .setDescriptionLocalizations(localisations('lock.sous_ouvrir'))
      .addChannelOption((o) => o
        .setName('channel')
        .setNameLocalizations({ fr: 'salon' })
        .setDescription(tr('lock.opt_salon_ouvrir', DEFAUT))
        .setDescriptionLocalizations(localisations('lock.opt_salon_ouvrir'))
        .addChannelTypes(ChannelType.GuildText)))
    .addSubcommand((s) => s
      .setName('server')
      .setNameLocalizations({ fr: 'serveur' })
      .setDescription(tr('lock.sous_serveur', DEFAUT))
      .setDescriptionLocalizations(localisations('lock.sous_serveur'))
      .addStringOption((o) => o
        .setName('reason')
        .setNameLocalizations({ fr: 'raison' })
        .setDescription(tr('lock.opt_raison_serveur', DEFAUT))
        .setDescriptionLocalizations(localisations('lock.opt_raison_serveur'))
        .setMaxLength(400)))
    .addSubcommand((s) => s
      .setName('open-server')
      .setNameLocalizations({ fr: 'ouvrir-serveur' })
      .setDescription(tr('lock.sous_ouvrir_serveur', DEFAUT))
      .setDescriptionLocalizations(localisations('lock.sous_ouvrir_serveur'))),

  async execute(interaction) {
    const { t } = traducteur(interaction);
    const sous = interaction.options.getSubcommand();
    const raison = interaction.options.getString('reason') ?? t('sanction.sans_raison');
    const everyone = interaction.guild.roles.everyone;

    const basculer = async (salon, verrouiller) => {
      await salon.permissionOverwrites.edit(everyone, {
        SendMessages: verrouiller ? false : null,
        AddReactions: verrouiller ? false : null,
        CreatePublicThreads: verrouiller ? false : null,
        CreatePrivateThreads: verrouiller ? false : null,
        SendMessagesInThreads: verrouiller ? false : null,
      }, { reason: `${raison} — ${interaction.user.tag}` });
    };

    // ------------------------------------------------------- SALON UNIQUE
    if (sous === 'channel' || sous === 'open') {
      const salon = interaction.options.getChannel('channel') ?? interaction.channel;
      const verrouiller = sous === 'channel';

      if (!salon.permissionsFor(interaction.guild.members.me).has(PermissionsBitField.Flags.ManageRoles)) {
        return interaction.reply(C.erreurPrivee(t('lock.manque_permission', { permission: t('permissions.ManageRoles') })));
      }

      await interaction.deferReply();
      await basculer(salon, verrouiller);

      const couleur = verrouiller ? conf.couleurs.erreur : conf.couleurs.succes;
      const texte = verrouiller
        ? `${E('verrou')} ${t('lock.verrouille', { par: interaction.user })}\n> ${raison}`
        : `${E('deverrou')} ${t('lock.deverrouille', { par: interaction.user })}`;

      if (salon.id !== interaction.channel.id) {
        await salon.send({ embeds: [new EmbedBuilder().setColor(couleur).setDescription(texte)] }).catch(() => null);
      }
      await envoyerLog(interaction.guild, 'moderation', new EmbedBuilder().setColor(couleur).setDescription(texte).setTitle(salon.name).setTimestamp());

      return interaction.editReply(C.envoi([C.conteneur([C.texte(texte)], couleur)]));
    }

    // ---------------------------------------------------------- SERVEUR
    const verrouiller = sous === 'server';
    await interaction.deferReply();

    const salons = interaction.guild.channels.cache.filter(
      (c) => c.type === ChannelType.GuildText && c.permissionsFor(interaction.guild.members.me)?.has(PermissionsBitField.Flags.ManageRoles)
    );

    let ok = 0;
    for (const salon of salons.values()) {
      try {
        await basculer(salon, verrouiller);
        ok++;
      } catch {
        /* salon ignore */
      }
    }

    await envoyerLog(
      interaction.guild,
      'moderation',
      new EmbedBuilder()
        .setColor(verrouiller ? conf.couleurs.erreur : conf.couleurs.succes)
        .setTitle(verrouiller ? `${E('verrou')} ${t('lock.log_serveur_verrouille')}` : `${E('deverrou')} ${t('lock.log_serveur_deverrouille')}`)
        .setDescription(`${t('lock.log_salons_traites', { n: ok, par: interaction.user })}\n> ${raison}`)
        .setTimestamp()
    );

    return interaction.editReply(C.succes(
      verrouiller ? t('lock.salons_verrouilles', { n: ok }) : t('lock.salons_deverrouilles', { n: ok })
    ));
  },
};
