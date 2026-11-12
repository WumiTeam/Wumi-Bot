const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  InteractionContextType,
  ChannelType,
  MessageFlags,
} = require('discord.js');
const conf = require('../../../config');
const C = require('../../utils/composants');
const { req, config, majConfig } = require('../../database/db');
const verification = require('../../utils/verification');
const statistiques = require('../../utils/statistiques');
const { E } = require('../../utils/emojis');
const { traducteur, localisations, t: tr, DEFAUT } = require('../../utils/langues');

const SALONS_TEXTE = [ChannelType.GuildText, ChannelType.GuildAnnouncement];

module.exports = {
  categorie: 'config',

  data: new SlashCommandBuilder()
    .setName('server')
    .setNameLocalizations({ fr: 'serveur' })
    .setDescription(tr('serveur.description_commande', DEFAUT))
    .setDescriptionLocalizations(localisations('serveur.description_commande'))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setContexts(InteractionContextType.Guild)

    .addSubcommandGroup((g) =>
      g
        // « verification » s'ecrit pareil dans les deux langues : pas de localisation de nom.
        .setName('verification')
        .setDescription(tr('serveur.grp_verification', DEFAUT))
        .setDescriptionLocalizations(localisations('serveur.grp_verification'))
        .addSubcommand((s) =>
          s
            .setName('enable')
            .setNameLocalizations({ fr: 'activer' })
            .setDescription(tr('serveur.sous_activer', DEFAUT))
            .setDescriptionLocalizations(localisations('serveur.sous_activer'))
            .addRoleOption((o) =>
              o
                .setName('role')
                .setDescription(tr('serveur.opt_role', DEFAUT))
                .setDescriptionLocalizations(localisations('serveur.opt_role'))
                .setRequired(true)
            )
            .addBooleanOption((o) =>
              o
                .setName('captcha')
                .setDescription(tr('serveur.opt_captcha', DEFAUT))
                .setDescriptionLocalizations(localisations('serveur.opt_captcha'))
            )
        )
        .addSubcommand((s) =>
          s
            .setName('disable')
            .setNameLocalizations({ fr: 'desactiver' })
            .setDescription(tr('serveur.sous_desactiver', DEFAUT))
            .setDescriptionLocalizations(localisations('serveur.sous_desactiver'))
        )
        .addSubcommand((s) =>
          s
            .setName('panel')
            .setNameLocalizations({ fr: 'panneau' })
            .setDescription(tr('serveur.sous_panneau', DEFAUT))
            .setDescriptionLocalizations(localisations('serveur.sous_panneau'))
            .addChannelOption((o) =>
              o
                .setName('channel')
                .setNameLocalizations({ fr: 'salon' })
                .setDescription(tr('serveur.opt_salon_panneau', DEFAUT))
                .setDescriptionLocalizations(localisations('serveur.opt_salon_panneau'))
                .addChannelTypes(...SALONS_TEXTE)
            )
        )
        .addSubcommand((s) =>
          s
            .setName('text')
            .setNameLocalizations({ fr: 'texte' })
            .setDescription(tr('serveur.sous_texte', DEFAUT))
            .setDescriptionLocalizations(localisations('serveur.sous_texte'))
            .addStringOption((o) =>
              o
                .setName('title')
                .setNameLocalizations({ fr: 'titre' })
                .setDescription(tr('serveur.opt_titre', DEFAUT))
                .setDescriptionLocalizations(localisations('serveur.opt_titre'))
                .setMaxLength(200)
            )
            // « message » s'ecrit pareil dans les deux langues.
            .addStringOption((o) =>
              o
                .setName('message')
                .setDescription(tr('serveur.opt_message', DEFAUT))
                .setDescriptionLocalizations(localisations('serveur.opt_message'))
                .setMaxLength(1500)
            )
            .addStringOption((o) =>
              o
                .setName('button')
                .setNameLocalizations({ fr: 'bouton' })
                .setDescription(tr('serveur.opt_bouton', DEFAUT))
                .setDescriptionLocalizations(localisations('serveur.opt_bouton'))
                .setMaxLength(60)
            )
        )
        .addSubcommand((s) =>
          s
            .setName('status')
            .setNameLocalizations({ fr: 'etat' })
            .setDescription(tr('serveur.sous_etat', DEFAUT))
            .setDescriptionLocalizations(localisations('serveur.sous_etat'))
        )
    )

    .addSubcommandGroup((g) =>
      // « stats » s'ecrit pareil dans les deux langues : pas de localisation de nom.
      g
        .setName('stats')
        .setDescription(tr('serveur.grp_stats', DEFAUT))
        .setDescriptionLocalizations(localisations('serveur.grp_stats'))
        .addSubcommand((s) =>
          s
            .setName('create')
            .setNameLocalizations({ fr: 'creer' })
            .setDescription(tr('serveur.sous_creer', DEFAUT))
            .setDescriptionLocalizations(localisations('serveur.sous_creer'))
            .addStringOption((o) =>
              o
                .setName('template')
                .setNameLocalizations({ fr: 'modele' })
                // Libelle de commande : Discord n'y affiche pas les emojis
                // d'application, l'Unicode brut est obligatoire.
                .setDescription(tr('serveur.opt_modele', DEFAUT))
                .setDescriptionLocalizations(localisations('serveur.opt_modele'))
                .setRequired(true)
                .setMaxLength(90)
            )
            .addChannelOption((o) =>
              o
                .setName('category')
                .setNameLocalizations({ fr: 'categorie' })
                .setDescription(tr('serveur.opt_categorie', DEFAUT))
                .setDescriptionLocalizations(localisations('serveur.opt_categorie'))
                .addChannelTypes(ChannelType.GuildCategory)
            )
        )
        .addSubcommand((s) =>
          s
            .setName('link')
            .setNameLocalizations({ fr: 'lier' })
            .setDescription(tr('serveur.sous_lier', DEFAUT))
            .setDescriptionLocalizations(localisations('serveur.sous_lier'))
            .addChannelOption((o) =>
              o
                .setName('channel')
                .setNameLocalizations({ fr: 'salon' })
                .setDescription(tr('serveur.opt_salon_lier', DEFAUT))
                .setDescriptionLocalizations(localisations('serveur.opt_salon_lier'))
                .setRequired(true)
            )
            .addStringOption((o) =>
              o
                .setName('template')
                .setNameLocalizations({ fr: 'modele' })
                .setDescription(tr('serveur.opt_modele', DEFAUT))
                .setDescriptionLocalizations(localisations('serveur.opt_modele'))
                .setRequired(true)
                .setMaxLength(90)
            )
        )
        .addSubcommand((s) =>
          s
            .setName('remove')
            .setNameLocalizations({ fr: 'retirer' })
            .setDescription(tr('serveur.sous_retirer', DEFAUT))
            .setDescriptionLocalizations(localisations('serveur.sous_retirer'))
            .addChannelOption((o) =>
              o
                .setName('channel')
                .setNameLocalizations({ fr: 'salon' })
                .setDescription(tr('serveur.opt_salon_retirer', DEFAUT))
                .setDescriptionLocalizations(localisations('serveur.opt_salon_retirer'))
                .setRequired(true)
            )
        )
        .addSubcommand((s) =>
          s
            .setName('list')
            .setNameLocalizations({ fr: 'liste' })
            .setDescription(tr('serveur.sous_liste', DEFAUT))
            .setDescriptionLocalizations(localisations('serveur.sous_liste'))
        )
        .addSubcommand((s) =>
          s
            .setName('refresh')
            .setNameLocalizations({ fr: 'actualiser' })
            .setDescription(tr('serveur.sous_actualiser', DEFAUT))
            .setDescriptionLocalizations(localisations('serveur.sous_actualiser'))
        )
    ),

  async execute(interaction) {
    const { t } = traducteur(interaction);
    const groupe = interaction.options.getSubcommandGroup();
    const sous = interaction.options.getSubcommand();
    if (!interaction.guild) {
  return interaction.reply({
    content: "Cette commande ne peut être utilisée que dans un serveur.",
    ephemeral: true,
  });
}
const guildId = interaction.guild.id;

    // ==================================================== VERIFICATION
    if (groupe === 'verification') {
      const cfg = config(guildId);

      if (sous === 'enable') {
        const role = interaction.options.getRole('role');
        if (role.managed || role.position >= interaction.guild.members.me.roles.highest.position) {
          return interaction.reply(C.erreurPrivee(t('serveur.verif_role_impossible', { role: `${role}` })));
        }
        const captcha = interaction.options.getBoolean('captcha');
        majConfig(guildId, {
          verif_actif: 1,
          verif_role: role.id,
          verif_captcha: captcha ? 1 : 0,
        });
        return interaction.reply(C.succes(
          `${t('serveur.verif_activee', { role: `${role}` })}\n`
          + `${captcha ? t('serveur.verif_captcha_actif') : t('serveur.verif_captcha_inactif')}\n\n`
          + t('serveur.verif_a_faire')
        ));
      }

      if (sous === 'disable') {
        majConfig(guildId, { verif_actif: 0 });
        return interaction.reply(C.succes(t('serveur.verif_desactivee')));
      }

      if (sous === 'panel') {
        if (!cfg.verif_actif || !cfg.verif_role) {
          return interaction.reply(C.erreurPrivee(t('serveur.verif_pas_prete')));
        }
        const salon = interaction.options.getChannel('channel') ?? interaction.channel;
        await salon.send(verification.construirePanneau(interaction.guild));
        return interaction.reply(C.succesPrive(t('serveur.verif_panneau_publie', { salon: `${salon}` })));
      }

      if (sous === 'text') {
        const valeurs = {};
        const titre = interaction.options.getString('title');
        const message = interaction.options.getString('message');
        const bouton = interaction.options.getString('button');
        if (titre !== null) valeurs.verif_titre = titre;
        if (message !== null) valeurs.verif_message = message.replaceAll('\\n', '\n');
        if (bouton !== null) valeurs.verif_bouton = bouton;
        if (!Object.keys(valeurs).length) {
          return interaction.reply(C.erreurPrivee(t('serveur.verif_aucune_option')));
        }
        majConfig(guildId, valeurs);
        return interaction.reply(C.succes(t('serveur.verif_texte_maj')));
      }

      // status
      return interaction.reply(C.envoi([C.conteneur([
        C.texte(`## ${E('securite')} ${t('serveur.verif_etat_titre')}`),
        C.texte([
          `**${t('serveur.verif_etat_etat')}** — ${cfg.verif_actif ? `${E('succes')} ${t('serveur.verif_etat_active')}` : `${E('erreur')} ${t('serveur.verif_etat_desactivee')}`}`,
          `**${t('serveur.verif_etat_role')}** — ${cfg.verif_role ? `<@&${cfg.verif_role}>` : `\`${t('serveur.verif_etat_role_aucun')}\``}`,
          `**${t('serveur.verif_etat_captcha')}** — ${cfg.verif_captcha ? t('commun.oui') : t('commun.non')}`,
        ].join('\n')),
        C.texte(`-# ${t('serveur.verif_etat_pied')}`),
      ], conf.couleurs.principale)]));
    }

    // ================================================ SALONS STATISTIQUES
    if (sous === 'list') {
      const salons = req.statsSalons.all(guildId);
      return interaction.reply(C.envoi([C.conteneur([
        C.texte(`## ${E('statistiques')} ${t('serveur.stats_titre')}`),
        C.texte(salons.length
          ? salons.map((s) => `<#${s.channel_id}> → \`${s.modele}\``).join('\n')
          : t('serveur.stats_aucun')),
        C.separateur(),
        C.texte(`**${t('serveur.stats_variables_titre')}**\n${Object.keys(statistiques.VARIABLES).map((v) => `\`${v}\``).join(' · ')}`),
        C.texte(`**${t('serveur.stats_savoir_titre')}**\n${t('serveur.stats_savoir_valeur', { minutes: Math.max(10, conf.statistiques.intervalleMinutes) })}`),
      ], conf.couleurs.principale)]));
    }

    if (sous === 'refresh') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const n = await statistiques.actualiserGuild(interaction.guild);
      return interaction.editReply(C.succes(
        t('serveur.stats_actualisees', { n }) + (n === 0 ? `\n-# ${t('serveur.stats_rien_a_faire')}` : '')
      ));
    }

    if (sous === 'remove') {
      const salon = interaction.options.getChannel('channel');
      const res = req.retirerStatSalon.run(guildId, salon.id);
      return res.changes
        ? interaction.reply(C.succes(t('serveur.stats_retire', { salon: `${salon}` })))
        : interaction.reply(C.erreurPrivee(t('serveur.stats_pas_suivi')));
    }

    const modele = interaction.options.getString('template');
    if (!Object.keys(statistiques.VARIABLES).some((v) => modele.includes(v))) {
      const variables = Object.keys(statistiques.VARIABLES).map((v) => `\`${v}\``).join(' · ');
      const exemple = `${E('membres')} {membres} ${t('serveur.stats_mot_membres')}`;
      return interaction.reply(C.erreurPrivee(t('serveur.stats_modele_invalide', { variables, exemple })));
    }

    // ------------------------------------------------------------- LIER
    if (sous === 'link') {
      const salon = interaction.options.getChannel('channel');
      req.ajouterStatSalon.run(guildId, salon.id, modele);
      await statistiques.actualiserGuild(interaction.guild).catch(() => null);
      return interaction.reply(C.succes(t('serveur.stats_lie', {
        salon: `${salon}`,
        rendu: statistiques.rendre(modele, interaction.guild),
      })));
    }

    // ------------------------------------------------------------ CREER
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const categorie = interaction.options.getChannel('category');
    let salon;
    try {
      salon = await interaction.guild.channels.create({
        name: statistiques.rendre(modele, interaction.guild),
        type: ChannelType.GuildVoice,
        parent: categorie?.id ?? null,
        permissionOverwrites: [
          { id: interaction.guild.roles.everyone.id, deny: [PermissionFlagsBits.Connect] },
        ],
        reason: `Salon statistique créé par ${interaction.user.tag}`,
      });
    } catch (e) {
      return interaction.editReply(C.erreur(t('serveur.stats_creation_impossible', { erreur: e.message })));
    }

    req.ajouterStatSalon.run(guildId, salon.id, modele);

    return interaction.editReply(C.succes(t('serveur.stats_cree', {
      nom: salon.name,
      minutes: Math.max(10, conf.statistiques.intervalleMinutes),
    })));
  },
};
