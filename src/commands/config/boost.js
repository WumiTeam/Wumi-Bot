/**
 * /boost — ce que le serveur offre a ceux qui le boostent.
 *
 * Discord donne deja un role de booster ; ce module ajoute ce que Discord ne
 * fait pas : un remerciement ecrit ou l'on veut, un role maison en plus, et
 * une somme versee par l'economie du serveur.
 */
const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  InteractionContextType,
  ChannelType,
} = require('discord.js');
const C = require('../../utils/composants');
const { config, majConfig } = require('../../database/db');
const { ts, tronquer } = require('../../utils/outils');
const boosts = require('../../utils/boosts');
const { E } = require('../../utils/emojis');
const { traducteur, localisations, t: tr, DEFAUT } = require('../../utils/langues');

/** Le rose des boosts Discord : la meme couleur partout ou l'on en parle. */
const COULEUR_BOOST = 0xf47fff;

/** Au-dela, la liste ne tient plus dans un bloc de texte V2. */
const MAX_BOOSTERS = 40;

module.exports = {
  categorie: 'config',

  data: new SlashCommandBuilder()
    .setName('boost')
    .setDescription(tr('boost.description_commande', DEFAUT))
    .setDescriptionLocalizations(localisations('boost.description_commande'))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setContexts(InteractionContextType.Guild)

    .addSubcommand((s) =>
      s
        .setName('channel')
        .setNameLocalizations({ fr: 'salon' })
        .setDescription(tr('boost.sous_salon', DEFAUT))
        .setDescriptionLocalizations(localisations('boost.sous_salon'))
        .addChannelOption((o) =>
          o
            .setName('channel')
            .setNameLocalizations({ fr: 'salon' })
            .setDescription(tr('boost.opt_salon', DEFAUT))
            .setDescriptionLocalizations(localisations('boost.opt_salon'))
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        )
    )
    .addSubcommand((s) =>
      s
        .setName('message')
        .setDescription(tr('boost.sous_message', DEFAUT))
        .setDescriptionLocalizations(localisations('boost.sous_message'))
        .addStringOption((o) =>
          o
            .setName('text')
            .setNameLocalizations({ fr: 'texte' })
            .setDescription(tr('boost.opt_texte', DEFAUT))
            .setDescriptionLocalizations(localisations('boost.opt_texte'))
            .setRequired(true)
            .setMaxLength(1500)
        )
    )
    .addSubcommand((s) =>
      s
        .setName('role')
        .setDescription(tr('boost.sous_role', DEFAUT))
        .setDescriptionLocalizations(localisations('boost.sous_role'))
        .addRoleOption((o) =>
          o
            .setName('role')
            .setDescription(tr('boost.opt_role', DEFAUT))
            .setDescriptionLocalizations(localisations('boost.opt_role'))
        )
    )
    .addSubcommand((s) =>
      s
        .setName('reward')
        .setNameLocalizations({ fr: 'recompense' })
        .setDescription(tr('boost.sous_recompense', DEFAUT))
        .setDescriptionLocalizations(localisations('boost.sous_recompense'))
        .addIntegerOption((o) =>
          o
            .setName('amount')
            .setNameLocalizations({ fr: 'montant' })
            .setDescription(tr('boost.opt_montant', DEFAUT))
            .setDescriptionLocalizations(localisations('boost.opt_montant'))
            .setRequired(true)
            .setMinValue(0)
            .setMaxValue(1000000)
        )
    )
    .addSubcommand((s) =>
      s
        .setName('list')
        .setNameLocalizations({ fr: 'liste' })
        .setDescription(tr('boost.sous_liste', DEFAUT))
        .setDescriptionLocalizations(localisations('boost.sous_liste'))
    )
    .addSubcommand((s) =>
      s
        .setName('view')
        .setNameLocalizations({ fr: 'voir' })
        .setDescription(tr('boost.sous_voir', DEFAUT))
        .setDescriptionLocalizations(localisations('boost.sous_voir'))
    ),

  async execute(interaction) {
    const { t, nombre } = traducteur(interaction);
    const sous = interaction.options.getSubcommand();
    const guildId = interaction.guild.id;
    const cfg = config(guildId);

    switch (sous) {
      case 'channel': {
        const salon = interaction.options.getChannel('channel');
        majConfig(guildId, { boost_salon: salon?.id ?? null });
        return interaction.reply(C.succes(salon
          ? t('boost.salon_defini', { salon: `${salon}` })
          : t('boost.salon_vide')));
      }

      case 'message': {
        const texte = interaction.options.getString('text');
        majConfig(guildId, { boost_message: texte.replaceAll('\\n', '\n') });
        // L'apercu garde le rose des boosts : on veut voir le message tel
        // qu'il apparaitra, pas dans le cadre vert d'une confirmation.
        return interaction.reply(C.envoi([
          C.bandeau('succes', t('boost.message_enregistre')),
          C.conteneur([
            C.texte(`## ${E('boost')} ${t('boost.apercu_titre')}`),
            C.texte(boosts.texteRemerciement(texte, interaction.member)),
          ], COULEUR_BOOST),
        ]));
      }

      case 'role': {
        const role = interaction.options.getRole('role');
        if (role && (role.managed || role.position >= interaction.guild.members.me.roles.highest.position)) {
          return interaction.reply(C.erreurPrivee(t('boost.role_impossible', { role: `${role}` })));
        }
        majConfig(guildId, { boost_role: role?.id ?? null });
        return interaction.reply(C.succes(role
          ? t('boost.role_defini', { role: `${role}` })
          : t('boost.role_vide')));
      }

      case 'reward': {
        const montant = interaction.options.getInteger('amount');
        majConfig(guildId, { boost_monnaie: montant });
        if (montant > 0 && !cfg.eco_actif) {
          return interaction.reply(C.avertissement(t('boost.recompense_sans_economie', { montant: nombre(montant) })));
        }
        return interaction.reply(C.succes(montant === 0
          ? t('boost.recompense_aucune')
          : t('boost.recompense_definie', {
            montant: nombre(montant),
            monnaie: require('../../utils/economie').monnaie(guildId).nom,
          })));
      }

      case 'list': {
        await interaction.deferReply();
        const membres = await interaction.guild.members.fetch().catch(() => null);
        const boosters = membres ? [...membres.values()].filter((m) => m.premiumSince) : [];
        boosters.sort((a, b) => a.premiumSinceTimestamp - b.premiumSinceTimestamp);

        const corps = boosters.length
          ? boosters.slice(0, MAX_BOOSTERS)
            .map((m) => t('boost.liste_ligne', { membre: `${m}`, date: ts(m.premiumSinceTimestamp, 'R') }))
            .join('\n')
          : t('boost.liste_vide');

        return interaction.editReply(C.envoi([C.conteneur([
          C.texte(`## ${E('boost')} ${t('boost.liste_titre', { serveur: interaction.guild.name })}`),
          C.texte(tronquer(corps, C.MAX_TEXTE)),
          C.texte(`-# ${t('boost.liste_pied', {
            n: interaction.guild.premiumSubscriptionCount ?? 0,
            niveau: interaction.guild.premiumTier,
          })}`),
        ], COULEUR_BOOST)]));
      }

      default: {
        const recompense = cfg.boost_monnaie
          ? `${nombre(cfg.boost_monnaie)}${cfg.eco_actif ? '' : ` *(${t('boost.config_recompense_sans_eco')})*`}`
          : t('commun.aucun');

        return interaction.reply(C.envoi([C.conteneur([
          C.texte(`## ${E('boost')} ${t('boost.config_titre')}`),
          C.texte([
            `**${t('boost.config_salon')}** — ${cfg.boost_salon ? `<#${cfg.boost_salon}>` : `\`${t('boost.config_salon_defaut')}\``}`,
            `**${t('boost.config_role')}** — ${cfg.boost_role ? `<@&${cfg.boost_role}>` : `\`${t('commun.aucun')}\``}`,
            `**${t('boost.config_recompense')}** — ${recompense}`,
          ].join('\n')),
          C.separateur(),
          C.texte(`**${t('boost.config_message')}**\n\`\`\`${tronquer(cfg.boost_message || boosts.MESSAGE_DEFAUT(), 900)}\`\`\``),
          C.texte(`**${t('boost.config_boosts')}** — ${t('boost.config_boosts_valeur', {
            n: interaction.guild.premiumSubscriptionCount ?? 0,
            niveau: interaction.guild.premiumTier,
          })}`),
        ], COULEUR_BOOST)]));
      }
    }
  },
};
