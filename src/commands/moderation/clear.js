/**
 * /clear — purge en masse dans le salon. Discord refuse de supprimer un
 * message de plus de 14 jours par bulkDelete, et les messages epingles sont
 * epargnes deliberement : ces deux garde-fous ne bougent pas.
 */
const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags, EmbedBuilder, InteractionContextType } = require('discord.js');
const conf = require('../../../config');
const C = require('../../utils/composants');
const { envoyerLog } = require('../../utils/logs');
const { E } = require('../../utils/emojis');
const { traducteur, localisations, t: tr, DEFAUT } = require('../../utils/langues');

module.exports = {
  categorie: 'moderation',

  data: new SlashCommandBuilder()
    .setName('clear')
    .setNameLocalizations({ fr: 'purger' })
    .setDescription(tr('clear.description_commande', DEFAUT))
    .setDescriptionLocalizations(localisations('clear.description_commande'))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .setContexts(InteractionContextType.Guild)
    .addIntegerOption((o) => o
      .setName('amount')
      .setNameLocalizations({ fr: 'nombre' })
      .setDescription(tr('clear.opt_nombre', DEFAUT))
      .setDescriptionLocalizations(localisations('clear.opt_nombre'))
      .setRequired(true)
      .setMinValue(1)
      .setMaxValue(100))
    .addUserOption((o) => o
      .setName('member')
      .setNameLocalizations({ fr: 'membre' })
      .setDescription(tr('clear.opt_membre', DEFAUT))
      .setDescriptionLocalizations(localisations('clear.opt_membre')))
    .addStringOption((o) => o
      .setName('filter')
      .setNameLocalizations({ fr: 'filtre' })
      .setDescription(tr('clear.opt_filtre', DEFAUT))
      .setDescriptionLocalizations(localisations('clear.opt_filtre'))
      .addChoices(
        { name: 'Bot messages', name_localizations: { fr: 'Messages de bots' }, value: 'bots' },
        { name: 'Messages with attachments', name_localizations: { fr: 'Messages avec pièces jointes' }, value: 'fichiers' },
        { name: 'Messages with links', name_localizations: { fr: 'Messages avec liens' }, value: 'liens' },
        { name: 'Messages without text', name_localizations: { fr: 'Messages sans texte' }, value: 'vides' }
      )),

  async execute(interaction) {
    const { t } = traducteur(interaction);

    const nombre = interaction.options.getInteger('amount');
    const cible = interaction.options.getUser('member');
    const filtre = interaction.options.getString('filter');

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const messages = await interaction.channel.messages.fetch({ limit: 100 }).catch(() => null);
    if (!messages) {
      return interaction.editReply(C.erreur(t('clear.lecture_impossible')));
    }

    const limite = Date.now() - 14 * 24 * 60 * 60 * 1000; // Discord refuse au-dela de 14 jours
    let selection = [...messages.values()].filter((m) => m.createdTimestamp > limite && !m.pinned);

    if (cible) selection = selection.filter((m) => m.author.id === cible.id);
    if (filtre === 'bots') selection = selection.filter((m) => m.author.bot);
    if (filtre === 'fichiers') selection = selection.filter((m) => m.attachments.size > 0);
    if (filtre === 'liens') selection = selection.filter((m) => /https?:\/\//i.test(m.content));
    if (filtre === 'vides') selection = selection.filter((m) => !m.content?.trim());

    selection = selection.slice(0, nombre);

    if (!selection.length) {
      return interaction.editReply(C.avertissement(t('clear.aucun')));
    }

    const supprimes = await interaction.channel.bulkDelete(selection, true).catch(() => null);
    if (!supprimes) {
      return interaction.editReply(C.erreur(t('clear.impossible', { permission: t('permissions.ManageMessages') })));
    }

    // Log classique : envoyerLog (src/utils/logs.js, hors de mon lot) attend
    // un embed, pas des composants V2.
    await envoyerLog(
      interaction.guild,
      'moderation',
      new EmbedBuilder()
        .setColor(conf.couleurs.info)
        .setTitle(`${E('balai')} ${t('clear.log_titre')}`)
        .addFields(
          { name: t('clear.log_salon'), value: `${interaction.channel}`, inline: true },
          { name: t('clear.log_moderateur'), value: `${interaction.user}`, inline: true },
          { name: t('clear.log_supprimes'), value: String(supprimes.size), inline: true },
          ...(cible ? [{ name: t('clear.log_filtre_membre'), value: `${cible}`, inline: true }] : []),
          ...(filtre ? [{ name: t('clear.log_filtre'), value: filtre, inline: true }] : [])
        )
        .setTimestamp()
    );

    return interaction.editReply(C.succes(t('clear.fait', { n: supprimes.size })));
  },
};
