/**
 * /evenement — une soiree ou un tournoi avec inscriptions par bouton, places
 * limitees, liste d'attente et rappel 15 min avant. Voir src/utils/evenements.js.
 */
const { SlashCommandBuilder, InteractionContextType, PermissionFlagsBits, ChannelType, escapeMarkdown } = require('discord.js');
const C = require('../../utils/composants');
const ev = require('../../utils/evenements');
const { traducteur, localisations, t: tr, DEFAUT } = require('../../utils/langues');

const d = (o, cle) => o.setDescription(tr(cle, DEFAUT)).setDescriptionLocalizations(localisations(cle));

module.exports = {
  categorie: 'utilitaires',

  data: d(new SlashCommandBuilder().setName('event').setNameLocalizations({ fr: 'evenement' }), 'evenement.description_commande')
    .setContexts(InteractionContextType.Guild)
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageEvents)
    .addSubcommand((s) => d(s.setName('create').setNameLocalizations({ fr: 'creer' }), 'evenement.sous_creer')
      .addStringOption((o) => d(o.setName('title').setNameLocalizations({ fr: 'titre' }), 'evenement.opt_titre').setRequired(true).setMaxLength(100))
      .addStringOption((o) => d(o.setName('date'), 'evenement.opt_date').setRequired(true).setMaxLength(10))
      .addStringOption((o) => d(o.setName('time').setNameLocalizations({ fr: 'heure' }), 'evenement.opt_heure').setRequired(true).setMaxLength(5))
      .addIntegerOption((o) => d(o.setName('slots').setNameLocalizations({ fr: 'places' }), 'evenement.opt_places').setMinValue(1).setMaxValue(500))
      .addStringOption((o) => d(o.setName('description'), 'evenement.opt_description').setMaxLength(1000))
      .addChannelOption((o) => d(o.setName('channel').setNameLocalizations({ fr: 'salon' }), 'evenement.opt_salon').addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement))
      .addRoleOption((o) => d(o.setName('role'), 'evenement.opt_role'))
      .addStringOption((o) => d(o.setName('timezone').setNameLocalizations({ fr: 'fuseau' }), 'evenement.opt_fuseau').setMaxLength(40))
      .addStringOption((o) => d(o.setName('repeat').setNameLocalizations({ fr: 'repeter' }), 'evenement.opt_repeter').addChoices(
        { name: 'Chaque jour · Daily', value: 'quotidien' },
        { name: 'Chaque semaine · Weekly', value: 'hebdo' },
        { name: 'Toutes les 2 semaines · Every 2 weeks', value: 'bimensuel' },
        { name: 'Chaque mois · Monthly', value: 'mensuel' },
      ))
      .addIntegerOption((o) => d(o.setName('duration').setNameLocalizations({ fr: 'duree' }), 'evenement.opt_duree').setMinValue(15).setMaxValue(1440))
      .addBooleanOption((o) => d(o.setName('discord-event').setNameLocalizations({ fr: 'evenement-discord' }), 'evenement.opt_natif')))
    .addSubcommand((s) => d(s.setName('list').setNameLocalizations({ fr: 'liste' }), 'evenement.sous_liste')),

  async execute(interaction) {
    const { t } = traducteur(interaction);
    const guild = interaction.guild;

    if (interaction.options.getSubcommand() === 'list') {
      const liste = ev.aVenir(guild.id);
      return interaction.reply(C.envoiPrive([C.conteneur([
        C.texte(`## 📅 ${t('evenement.liste_titre')}`),
        C.texte(liste.length
          ? liste.map((e) => `**${escapeMarkdown(e.titre)}** · <t:${Math.floor(e.debut / 1000)}:f> · ${JSON.parse(e.inscrits).length}${e.places ? `/${e.places}` : ''} 👥 · [→](https://discord.com/channels/${e.guild_id}/${e.channel_id}/${e.message_id})`).join('\n')
          : t('evenement.liste_vide')),
      ], 0x3ddc97)], { allowedMentions: { parse: [] } }));
    }

    const fuseau = interaction.options.getString('timezone')?.trim() || 'Europe/Paris';
    if (!ev.fuseauValide(fuseau)) return interaction.reply(C.erreurPrivee(t('evenement.fuseau_invalide')));
    const debut = ev.lireDate(interaction.options.getString('date'), interaction.options.getString('time'), fuseau);
    if (!debut) return interaction.reply(C.erreurPrivee(t('evenement.date_invalide')));
    if (debut < Date.now() + 60_000) return interaction.reply(C.erreurPrivee(t('evenement.date_passee')));
    if (debut > Date.now() + 366 * 24 * 3_600_000) return interaction.reply(C.erreurPrivee(t('evenement.date_loin')));

    const salon = interaction.options.getChannel('channel') ?? interaction.channel;
    if (!salon?.permissionsFor(guild.members.me)?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages])) {
      return interaction.reply(C.erreurPrivee(t('evenement.droits', { salon: `${salon}` })));
    }
    const role = interaction.options.getRole('role');
    if (role && !role.mentionable && !salon.permissionsFor(guild.members.me)?.has(PermissionFlagsBits.MentionEveryone)) {
      return interaction.reply(C.erreurPrivee(t('evenement.role_mention', { role: `${role}` })));
    }

    await interaction.deferReply({ flags: require('discord.js').MessageFlags.Ephemeral });
    try {
      const e = await ev.creer(guild, salon, {
        createur: interaction.user.id,
        titre: interaction.options.getString('title'),
        description: interaction.options.getString('description'),
        debut,
        places: interaction.options.getInteger('slots') ?? 0,
        role: role?.id ?? null,
        repetition: interaction.options.getString('repeat'),
        duree: interaction.options.getInteger('duration') ?? 120,
        fuseau,
        natif: interaction.options.getBoolean('discord-event') ?? true,
      }, t);
      return interaction.editReply(C.succes(
        t('evenement.cree', { salon: `${salon}`, quand: `<t:${Math.floor(e.debut / 1000)}:F>` })
        + (e.repetition ? `\n🔁 ${t('evenement.cree_repete', { rythme: t(`evenement.rep.${e.repetition}`) })}` : '')
        + (e.discord_id ? `\n📌 ${t('evenement.cree_natif')}` : (interaction.options.getBoolean('discord-event') === false ? '' : `\n-# ${t('evenement.natif_impossible')}`))
      ));
    } catch {
      return interaction.editReply(C.erreur(t('evenement.echec')));
    }
  },
};
