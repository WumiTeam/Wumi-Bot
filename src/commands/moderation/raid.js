/**
 * /raid — le bouton rouge pendant un raid. Voir src/utils/modeRaid.js.
 */
const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  InteractionContextType,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
} = require('discord.js');
const conf = require('../../../config');
const C = require('../../utils/composants');
const raid = require('../../utils/modeRaid');
const { req } = require('../../database/db');
const { parserDuree } = require('../../utils/outils');
const { traducteur, localisations, t: tr, DEFAUT } = require('../../utils/langues');

module.exports = {
  categorie: 'moderation',

  data: new SlashCommandBuilder()
    .setName('raid')
    .setDescription(tr('raid.description_commande', DEFAUT))
    .setDescriptionLocalizations(localisations('raid.description_commande'))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setContexts(InteractionContextType.Guild)
    .addSubcommand((s) => s
      .setName('on')
      .setNameLocalizations({ fr: 'activer' })
      .setDescription(tr('raid.sous_activer', DEFAUT))
      .setDescriptionLocalizations(localisations('raid.sous_activer'))
      .addStringOption((o) => o
        .setName('duration')
        .setNameLocalizations({ fr: 'duree' })
        .setDescription(tr('raid.opt_duree', DEFAUT))
        .setDescriptionLocalizations(localisations('raid.opt_duree')))
      .addStringOption((o) => o
        .setName('reason')
        .setNameLocalizations({ fr: 'raison' })
        .setDescription(tr('raid.opt_raison', DEFAUT))
        .setDescriptionLocalizations(localisations('raid.opt_raison'))
        .setMaxLength(300))
      .addBooleanOption((o) => o
        .setName('slowmode')
        .setDescription(tr('raid.opt_slowmode', DEFAUT))
        .setDescriptionLocalizations(localisations('raid.opt_slowmode'))))
    .addSubcommand((s) => s
      .setName('off')
      .setNameLocalizations({ fr: 'desactiver' })
      .setDescription(tr('raid.sous_desactiver', DEFAUT))
      .setDescriptionLocalizations(localisations('raid.sous_desactiver')))
    .addSubcommand((s) => s
      .setName('clean')
      .setNameLocalizations({ fr: 'nettoyer' })
      .setDescription(tr('raid.sous_nettoyer', DEFAUT))
      .setDescriptionLocalizations(localisations('raid.sous_nettoyer'))
      .addIntegerOption((o) => o
        .setName('minutes')
        .setDescription(tr('raid.opt_minutes', DEFAUT))
        .setDescriptionLocalizations(localisations('raid.opt_minutes'))
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(1440))
      .addStringOption((o) => o
        .setName('action')
        .setDescription(tr('raid.opt_action', DEFAUT))
        .setDescriptionLocalizations(localisations('raid.opt_action'))
        .setRequired(true)
        .addChoices(
          { name: 'Kick', name_localizations: { fr: 'Expulser' }, value: 'kick' },
          { name: 'Ban', name_localizations: { fr: 'Bannir' }, value: 'ban' }
        )))
    .addSubcommand((s) => s
      .setName('status')
      .setNameLocalizations({ fr: 'statut' })
      .setDescription(tr('raid.sous_statut', DEFAUT))
      .setDescriptionLocalizations(localisations('raid.sous_statut'))),

  async execute(interaction) {
    const { t, duree: enDuree } = traducteur(interaction);
    const guild = interaction.guild;
    const sous = interaction.options.getSubcommand();
    const quand = (ms) => `<t:${Math.floor(ms / 1000)}:R>`;

    // ------------------------------------------------------------ STATUT
    if (sous === 'status') {
      const e = raid.etat(guild.id);
      if (!e) return interaction.reply(C.infoPrivee(t('raid.inactif')));
      return interaction.reply(C.avertissementPrivee([
        `**${t('raid.actif_titre')}**`,
        t('raid.depuis', { quand: quand(e.depuis) }),
        e.fin ? t('raid.fin', { quand: quand(e.fin) }) : t('raid.sans_fin'),
        e.par ? t('raid.par', { membre: `<@${e.par}>` }) : null,
        t('raid.expulses', { n: e.expulses }),
      ].filter(Boolean).join('\n')));
    }

    // ----------------------------------------------------------- ACTIVER
    if (sous === 'on') {
      const texte = interaction.options.getString('duration');
      const duree = texte ? parserDuree(texte) : 60 * 60_000; // 1 h par defaut
      if (texte && !duree) return interaction.reply(C.erreurPrivee(t('sanction.duree_invalide')));
      if (raid.etat(guild.id)) return interaction.reply(C.infoPrivee(t('raid.deja_actif')));

      await interaction.deferReply();
      const r = await raid.activer(guild, {
        duree,
        par: interaction.user.id,
        raison: interaction.options.getString('reason'),
        slowmode: interaction.options.getBoolean('slowmode') ?? true,
      });
      return interaction.editReply(C.avertissement([
        `🚨 **${t('raid.active')}**`,
        r.verification ? `• ${t('raid.resume_verification')}` : `• ${t('raid.resume_verification_ko')}`,
        `• ${t('raid.resume_slowmode', { n: r.salons })}`,
        `• ${t('raid.resume_arrivees')}`,
        '',
        t('raid.fin_auto', { duree: enDuree(duree) }),
      ].join('\n')));
    }

    // -------------------------------------------------------- DESACTIVER
    if (sous === 'off') {
      await interaction.deferReply();
      const r = await raid.desactiver(guild, { par: interaction.user.id });
      if (!r) return interaction.editReply(C.info(t('raid.inactif')));
      return interaction.editReply(C.succes(`${t('raid.desactive')}\n${t('raid.bilan', { n: r.expulses, salons: r.restaures })}`));
    }

    // ---------------------------------------------------------- NETTOYER
    const minutes = interaction.options.getInteger('minutes');
    const action = interaction.options.getString('action');
    const permission = action === 'ban' ? PermissionFlagsBits.BanMembers : PermissionFlagsBits.KickMembers;
    if (!interaction.member.permissions.has(permission)) return interaction.reply(C.erreurPrivee(t('erreur.permission')));

    await interaction.deferReply({ flags: 64 });
    const cibles = [...(await raid.arrivesRecemment(guild, minutes)).values()]
      .filter((m) => (action === 'ban' ? m.bannable : m.kickable));
    if (!cibles.length) return interaction.editReply(C.info(t('raid.personne', { n: minutes })));

    const apercu = cibles.slice(0, 15).map((m) => `• ${m.user.username} · <t:${Math.floor(m.joinedTimestamp / 1000)}:R>`).join('\n');
    const rangee = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('raid_ok').setStyle(ButtonStyle.Danger)
        .setLabel(t(action === 'ban' ? 'raid.confirmer_ban' : 'raid.confirmer_kick', { n: cibles.length })),
      new ButtonBuilder().setCustomId('raid_non').setStyle(ButtonStyle.Secondary).setLabel(t('commun.annuler'))
    );
    const message = await interaction.editReply(C.avertissement(
      `${t('raid.question', { n: cibles.length, minutes })}\n${apercu}${cibles.length > 15 ? `\n${t('raid.et_autres', { n: cibles.length - 15 })}` : ''}`,
      { elements: [rangee], allowedMentions: { parse: [] } }
    ));
    const clic = await message.awaitMessageComponent({
      componentType: ComponentType.Button,
      filter: (i) => i.user.id === interaction.user.id,
      time: 30_000,
    }).catch(() => null);
    if (!clic || clic.customId !== 'raid_ok') return interaction.editReply(C.info(t('commun.annule_court')));
    await clic.update(C.info(t('raid.en_cours', { n: cibles.length })));

    const raison = `${t('raid.audit_nettoyage', { n: minutes })} — ${interaction.user.tag}`;
    let touches = [];
    if (action === 'ban') {
      const r = await guild.bans.bulkCreate(cibles.map((m) => m.id), { reason: raison, deleteMessageSeconds: 3600 }).catch(() => null);
      touches = r?.bannedUsers ?? [];
    } else {
      for (const m of cibles) if (await m.kick(raison).then(() => true).catch(() => false)) touches.push(m.id);
    }
    const faits = touches.length;

    const date = Date.now();
    for (const id of touches) {
      req.ajouterSanction.run({
        guild_id: guild.id, user_id: id, moderateur_id: interaction.user.id,
        type: action === 'ban' ? 'massban' : 'kick', raison, duree: null, date,
      });
    }
    return interaction.editReply(C.succes(t(action === 'ban' ? 'raid.nettoye_ban' : 'raid.nettoye_kick', { n: faits, total: cibles.length })));
  },
};
