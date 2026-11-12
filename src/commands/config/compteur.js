/**
 * /compteur — le salon ou les membres comptent ensemble (voir utils/compteur.js).
 */
const { SlashCommandBuilder, InteractionContextType, PermissionFlagsBits, ChannelType } = require('discord.js');
const conf = require('../../../config');
const C = require('../../utils/composants');
const compteur = require('../../utils/compteur');
const { traducteur, localisations, t: tr, DEFAUT } = require('../../utils/langues');

const d = (o, cle) => o.setDescription(tr(cle, DEFAUT)).setDescriptionLocalizations(localisations(cle));

module.exports = {
  categorie: 'config',

  data: d(new SlashCommandBuilder().setName('counting').setNameLocalizations({ fr: 'compteur' }), 'compteur.description_commande')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .setContexts(InteractionContextType.Guild)
    .addSubcommand((s) => d(s.setName('channel').setNameLocalizations({ fr: 'salon' }), 'compteur.sous_salon')
      .addChannelOption((o) => d(o.setName('channel').setNameLocalizations({ fr: 'salon' }), 'compteur.opt_salon')
        .setRequired(true).addChannelTypes(ChannelType.GuildText)))
    .addSubcommand((s) => d(s.setName('view').setNameLocalizations({ fr: 'voir' }), 'compteur.sous_voir'))
    .addSubcommand((s) => d(s.setName('reset').setNameLocalizations({ fr: 'zero' }), 'compteur.sous_zero'))
    .addSubcommand((s) => d(s.setName('disable').setNameLocalizations({ fr: 'desactiver' }), 'compteur.sous_desactiver')),

  async execute(interaction) {
    const { t } = traducteur(interaction);
    const guild = interaction.guild;
    const sous = interaction.options.getSubcommand();

    if (sous === 'channel') {
      const salon = interaction.options.getChannel('channel');
      const droits = salon.permissionsFor(guild.members.me);
      if (!droits?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.AddReactions, PermissionFlagsBits.ReadMessageHistory])) {
        return interaction.reply(C.erreurPrivee(t('compteur.droits', { salon: `${salon}` })));
      }
      compteur.definirSalon(guild.id, salon.id);
      const e = compteur.etat(guild.id);
      await salon.send({ content: `🔢 ${t('compteur.annonce', { n: e.actuel + 1 })}`, allowedMentions: { parse: [] } }).catch(() => null);
      return interaction.reply(C.succesPrive(t('compteur.defini', { salon: `${salon}` })));
    }

    if (sous === 'disable') {
      compteur.definirSalon(guild.id, null);
      return interaction.reply(C.succesPrive(t('compteur.desactive')));
    }

    if (sous === 'reset') {
      compteur.remettre(guild.id);
      return interaction.reply(C.succesPrive(t('compteur.remis')));
    }

    const salon = compteur.salon(guild.id);
    const e = compteur.etat(guild.id);
    return interaction.reply(C.envoiPrive([C.conteneur([
      C.texte(`## 🔢 ${t('compteur.titre')}`),
      C.texte([
        `**${t('compteur.label_salon')}** · ${salon ? `<#${salon}>` : t('compteur.aucun')}`,
        `**${t('compteur.label_actuel')}** · ${e.actuel}${e.dernier_user ? ` (<@${e.dernier_user}>)` : ''}`,
        `**${t('compteur.label_record')}** · ${e.record}${e.record_date ? ` · <t:${Math.floor(e.record_date / 1000)}:D>` : ''}`,
        `**${t('compteur.label_echecs')}** · ${e.echecs}`,
      ].join('\n')),
      C.texte(`-# ${t('compteur.regles')}`),
    ], conf.couleurs.principale)]));
  },
};
