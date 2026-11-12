/**
 * /starboard — les messages les plus etoiles republies dans un salon.
 */
const { SlashCommandBuilder, InteractionContextType, PermissionFlagsBits, ChannelType } = require('discord.js');
const conf = require('../../../config');
const C = require('../../utils/composants');
const { config, majConfig } = require('../../database/db');
const { traducteur, localisations, t: tr, DEFAUT } = require('../../utils/langues');

const d = (o, cle) => o.setDescription(tr(cle, DEFAUT)).setDescriptionLocalizations(localisations(cle));

module.exports = {
  categorie: 'config',

  data: d(new SlashCommandBuilder().setName('starboard'), 'starboard.description_commande')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setContexts(InteractionContextType.Guild)
    .addSubcommand((s) => d(s.setName('channel').setNameLocalizations({ fr: 'salon' }), 'starboard.sous_salon')
      .addChannelOption((o) => d(o.setName('channel').setNameLocalizations({ fr: 'salon' }), 'starboard.opt_salon')
        .setRequired(true).addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement))
      .addIntegerOption((o) => d(o.setName('threshold').setNameLocalizations({ fr: 'seuil' }), 'starboard.opt_seuil').setMinValue(1).setMaxValue(50))
      .addStringOption((o) => d(o.setName('emoji'), 'starboard.opt_emoji').setMaxLength(64)))
    .addSubcommand((s) => d(s.setName('view').setNameLocalizations({ fr: 'voir' }), 'starboard.sous_voir'))
    .addSubcommand((s) => d(s.setName('disable').setNameLocalizations({ fr: 'desactiver' }), 'starboard.sous_desactiver')),

  async execute(interaction) {
    const { t } = traducteur(interaction);
    const guild = interaction.guild;
    const sous = interaction.options.getSubcommand();

    if (sous === 'disable') {
      majConfig(guild.id, { starboard_salon: null });
      return interaction.reply(C.succesPrive(t('starboard.desactive')));
    }

    if (sous === 'channel') {
      const salon = interaction.options.getChannel('channel');
      if (!salon.permissionsFor(guild.members.me)?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks])) {
        return interaction.reply(C.erreurPrivee(t('starboard.droits', { salon: `${salon}` })));
      }
      const maj = { starboard_salon: salon.id };
      const seuil = interaction.options.getInteger('threshold');
      if (seuil) maj.starboard_seuil = seuil;
      const emoji = interaction.options.getString('emoji')?.trim();
      if (emoji) {
        if (!require('../../utils/rolesReactions').emojiValide(emoji)) return interaction.reply(C.erreurPrivee(t('rr.emoji_invalide')));
        maj.starboard_emoji = emoji;
      }
      majConfig(guild.id, maj);
      const cfg = config(guild.id);
      return interaction.reply(C.succesPrive(t('starboard.defini', { salon: `${salon}`, seuil: cfg.starboard_seuil, emoji: cfg.starboard_emoji })));
    }

    const cfg = config(guild.id);
    const r = require('../../utils/starboard').resume(guild.id);
    return interaction.reply(C.envoiPrive([C.conteneur([
      C.texte(`## ${cfg.starboard_emoji || '⭐'} ${t('starboard.titre')}`),
      C.texte([
        `**${t('starboard.label_salon')}** · ${cfg.starboard_salon ? `<#${cfg.starboard_salon}>` : t('starboard.aucun')}`,
        `**${t('starboard.label_seuil')}** · ${cfg.starboard_seuil} ${cfg.starboard_emoji || '⭐'}`,
        `**${t('starboard.label_publies')}** · ${r?.n ?? 0}${r?.max ? ` · ${t('starboard.label_max', { n: r.max })}` : ''}`,
      ].join('\n')),
      C.texte(`-# ${t('starboard.regles')}`),
    ], conf.couleurs.principale)]));
  },
};
