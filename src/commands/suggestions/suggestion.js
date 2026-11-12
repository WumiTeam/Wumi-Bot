const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  InteractionContextType,
  MessageFlags,
  ChannelType,
} = require('discord.js');
const conf = require('../../../config');
const C = require('../../utils/composants');
const { req, config, majConfig } = require('../../database/db');
const { formaterDuree, tronquer } = require('../../utils/outils');
const { infosNiveau } = require('../../utils/niveaux');
const suggestions = require('../../utils/suggestions');
const { E } = require('../../utils/emojis');
const { traducteur, localisations, t: tr, DEFAUT } = require('../../utils/langues');

const SALONS_TEXTE = [ChannelType.GuildText, ChannelType.GuildAnnouncement];

// Le libelle affiche d'un statut. src/utils/suggestions.js (hors de mon lot)
// a sa propre copie en dur en francais (STATUTS[x].nom) pour ses embeds a lui
// (encore classiques, pas Components V2) — celle-ci sert aux quelques
// endroits ou SUGGESTION.JS affiche lui-meme le statut, pour que ce soit
// traduit plutot que de reprendre le francais en dur de l'utilitaire.
const NOM_STATUT = {
  attente: 'suggestion.statut_attente',
  encours: 'suggestion.statut_encours',
  acceptee: 'suggestion.statut_acceptee',
  refusee: 'suggestion.statut_refusee',
};

module.exports = {
  categorie: 'suggestions',

  data: new SlashCommandBuilder()
    // « suggestion » s'ecrit pareil dans les deux langues : pas de localisation de nom.
    .setName('suggestion')
    .setDescription(tr('suggestion.description_commande', DEFAUT))
    .setDescriptionLocalizations(localisations('suggestion.description_commande'))
    .setContexts(InteractionContextType.Guild)

    .addSubcommand((s) =>
      s
        .setName('send')
        .setNameLocalizations({ fr: 'envoyer' })
        .setDescription(tr('suggestion.sous_envoyer', DEFAUT))
        .setDescriptionLocalizations(localisations('suggestion.sous_envoyer'))
        .addStringOption((o) =>
          o
            .setName('idea')
            .setNameLocalizations({ fr: 'idee' })
            .setDescription(tr('suggestion.opt_idee', DEFAUT))
            .setDescriptionLocalizations(localisations('suggestion.opt_idee'))
            .setRequired(true)
            .setMinLength(10)
            .setMaxLength(1800)
        )
    )
    .addSubcommand((s) =>
      s
        .setName('view')
        .setNameLocalizations({ fr: 'voir' })
        .setDescription(tr('suggestion.sous_voir', DEFAUT))
        .setDescriptionLocalizations(localisations('suggestion.sous_voir'))
        .addIntegerOption((o) =>
          o
            .setName('number')
            .setNameLocalizations({ fr: 'numero' })
            .setDescription(tr('suggestion.opt_numero_voir', DEFAUT))
            .setDescriptionLocalizations(localisations('suggestion.opt_numero_voir'))
            .setRequired(true)
            .setMinValue(1)
        )
    )
    .addSubcommand((s) =>
      s
        .setName('list')
        .setNameLocalizations({ fr: 'liste' })
        .setDescription(tr('suggestion.sous_liste', DEFAUT))
        .setDescriptionLocalizations(localisations('suggestion.sous_liste'))
        .addStringOption((o) =>
          o
            .setName('status')
            .setNameLocalizations({ fr: 'statut' })
            .setDescription(tr('suggestion.opt_statut', DEFAUT))
            .setDescriptionLocalizations(localisations('suggestion.opt_statut'))
            .addChoices(
              { name: tr('suggestion.choix_attente', DEFAUT), name_localizations: localisations('suggestion.choix_attente'), value: 'attente' },
              { name: tr('suggestion.choix_encours', DEFAUT), name_localizations: localisations('suggestion.choix_encours'), value: 'encours' },
              { name: tr('suggestion.choix_acceptee', DEFAUT), name_localizations: localisations('suggestion.choix_acceptee'), value: 'acceptee' },
              { name: tr('suggestion.choix_refusee', DEFAUT), name_localizations: localisations('suggestion.choix_refusee'), value: 'refusee' }
            )
        )
        // « page » s'ecrit pareil dans les deux langues.
        .addIntegerOption((o) => o.setName('page').setDescription(tr('suggestion.opt_page', DEFAUT)).setDescriptionLocalizations(localisations('suggestion.opt_page')).setMinValue(1))
    )
    .addSubcommand((s) =>
      s
        .setName('accept')
        .setNameLocalizations({ fr: 'accepter' })
        .setDescription(tr('suggestion.sous_accepter', DEFAUT))
        .setDescriptionLocalizations(localisations('suggestion.sous_accepter'))
        .addIntegerOption((o) =>
          o.setName('number').setNameLocalizations({ fr: 'numero' }).setDescription(tr('suggestion.opt_numero', DEFAUT)).setDescriptionLocalizations(localisations('suggestion.opt_numero')).setRequired(true).setMinValue(1)
        )
        .addStringOption((o) =>
          o.setName('reason').setNameLocalizations({ fr: 'raison' }).setDescription(tr('suggestion.opt_raison', DEFAUT)).setDescriptionLocalizations(localisations('suggestion.opt_raison')).setMaxLength(900)
        )
    )
    .addSubcommand((s) =>
      s
        .setName('reject')
        .setNameLocalizations({ fr: 'refuser' })
        .setDescription(tr('suggestion.sous_refuser', DEFAUT))
        .setDescriptionLocalizations(localisations('suggestion.sous_refuser'))
        .addIntegerOption((o) =>
          o.setName('number').setNameLocalizations({ fr: 'numero' }).setDescription(tr('suggestion.opt_numero', DEFAUT)).setDescriptionLocalizations(localisations('suggestion.opt_numero')).setRequired(true).setMinValue(1)
        )
        .addStringOption((o) =>
          o.setName('reason').setNameLocalizations({ fr: 'raison' }).setDescription(tr('suggestion.opt_raison', DEFAUT)).setDescriptionLocalizations(localisations('suggestion.opt_raison')).setMaxLength(900)
        )
    )
    .addSubcommand((s) =>
      s
        .setName('in-progress')
        .setNameLocalizations({ fr: 'encours' })
        .setDescription(tr('suggestion.sous_encours', DEFAUT))
        .setDescriptionLocalizations(localisations('suggestion.sous_encours'))
        .addIntegerOption((o) =>
          o.setName('number').setNameLocalizations({ fr: 'numero' }).setDescription(tr('suggestion.opt_numero', DEFAUT)).setDescriptionLocalizations(localisations('suggestion.opt_numero')).setRequired(true).setMinValue(1)
        )
        .addStringOption((o) =>
          o.setName('reason').setNameLocalizations({ fr: 'raison' }).setDescription(tr('suggestion.opt_raison', DEFAUT)).setDescriptionLocalizations(localisations('suggestion.opt_raison')).setMaxLength(900)
        )
    )
    .addSubcommand((s) =>
      s
        .setName('delete')
        .setNameLocalizations({ fr: 'supprimer' })
        .setDescription(tr('suggestion.sous_supprimer', DEFAUT))
        .setDescriptionLocalizations(localisations('suggestion.sous_supprimer'))
        .addIntegerOption((o) =>
          o.setName('number').setNameLocalizations({ fr: 'numero' }).setDescription(tr('suggestion.opt_numero', DEFAUT)).setDescriptionLocalizations(localisations('suggestion.opt_numero')).setRequired(true).setMinValue(1)
        )
    )

    .addSubcommandGroup((g) =>
      g
        // « config » s'ecrit pareil dans les deux langues.
        .setName('config')
        .setDescription(tr('suggestion.grp_config', DEFAUT))
        .setDescriptionLocalizations(localisations('suggestion.grp_config'))
        .addSubcommand((s) =>
          s
            .setName('channel')
            .setNameLocalizations({ fr: 'salon' })
            .setDescription(tr('suggestion.sous_config_salon', DEFAUT))
            .setDescriptionLocalizations(localisations('suggestion.sous_config_salon'))
            .addChannelOption((o) =>
              o.setName('channel').setNameLocalizations({ fr: 'salon' }).setDescription(tr('suggestion.opt_salon', DEFAUT)).setDescriptionLocalizations(localisations('suggestion.opt_salon')).addChannelTypes(...SALONS_TEXTE)
            )
        )
        .addSubcommand((s) =>
          s
            // « staff » s'ecrit pareil dans les deux langues.
            .setName('staff')
            .setDescription(tr('suggestion.sous_config_staff', DEFAUT))
            .setDescriptionLocalizations(localisations('suggestion.sous_config_staff'))
            .addRoleOption((o) =>
              // « role » s'ecrit pareil dans les deux langues (sans accent).
              o.setName('role').setDescription(tr('suggestion.opt_role', DEFAUT)).setDescriptionLocalizations(localisations('suggestion.opt_role'))
            )
        )
        .addSubcommand((s) =>
          s
            .setName('thread')
            .setNameLocalizations({ fr: 'fil' })
            .setDescription(tr('suggestion.sous_config_fil', DEFAUT))
            .setDescriptionLocalizations(localisations('suggestion.sous_config_fil'))
            .addBooleanOption((o) =>
              o.setName('enabled').setNameLocalizations({ fr: 'actif' }).setDescription(tr('suggestion.opt_actif', DEFAUT)).setDescriptionLocalizations(localisations('suggestion.opt_actif')).setRequired(true)
            )
        )
        .addSubcommand((s) =>
          s
            .setName('min-level')
            .setNameLocalizations({ fr: 'niveau-minimum' })
            .setDescription(tr('suggestion.sous_config_niveau_min', DEFAUT))
            .setDescriptionLocalizations(localisations('suggestion.sous_config_niveau_min'))
            .addIntegerOption((o) =>
              o.setName('level').setNameLocalizations({ fr: 'niveau' }).setDescription(tr('suggestion.opt_niveau', DEFAUT)).setDescriptionLocalizations(localisations('suggestion.opt_niveau')).setRequired(true).setMinValue(0).setMaxValue(200)
            )
        )
        .addSubcommand((s) =>
          s
            .setName('cooldown')
            .setNameLocalizations({ fr: 'delai' })
            .setDescription(tr('suggestion.sous_config_delai', DEFAUT))
            .setDescriptionLocalizations(localisations('suggestion.sous_config_delai'))
            // « minutes » s'ecrit pareil dans les deux langues.
            .addIntegerOption((o) =>
              o.setName('minutes').setDescription(tr('suggestion.opt_minutes', DEFAUT)).setDescriptionLocalizations(localisations('suggestion.opt_minutes')).setRequired(true).setMinValue(0).setMaxValue(10080)
            )
        )
        .addSubcommand((s) =>
          s
            .setName('view')
            .setNameLocalizations({ fr: 'voir' })
            .setDescription(tr('suggestion.sous_config_voir', DEFAUT))
            .setDescriptionLocalizations(localisations('suggestion.sous_config_voir'))
        )
    ),

  async execute(interaction) {
    const { t, langue } = traducteur(interaction);
    const groupe = interaction.options.getSubcommandGroup(false);
    const sous = interaction.options.getSubcommand();
    const guildId = interaction.guild.id;
    const cfg = config(guildId);

    // ==================================================== CONFIGURATION
    if (groupe === 'config') {
      if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
        return interaction.reply(C.erreurPrivee(t('suggestion.config_permission')));
      }

      switch (sous) {
        case 'channel': {
          const salon = interaction.options.getChannel('channel');
          majConfig(guildId, { suggestion_salon: salon?.id ?? null });
          return interaction.reply(C.succes(salon
            ? t('suggestion.config_salon_defini', { salon: `${salon}` })
            : t('suggestion.config_salon_desactive')));
        }
        case 'staff': {
          const role = interaction.options.getRole('role');
          majConfig(guildId, { suggestion_role_staff: role?.id ?? null });
          return interaction.reply(C.succes(role
            ? t('suggestion.config_staff_defini', { role: `${role}` })
            : t('suggestion.config_staff_defaut')));
        }
        case 'thread': {
          const actif = interaction.options.getBoolean('enabled');
          majConfig(guildId, { suggestion_fil: actif ? 1 : 0 });
          return interaction.reply(C.succes(actif ? t('suggestion.config_fil_actif') : t('suggestion.config_fil_inactif')));
        }
        case 'min-level': {
          const niveau = interaction.options.getInteger('level');
          majConfig(guildId, { suggestion_niveau_min: niveau });
          return interaction.reply(C.succes(niveau === 0
            ? t('suggestion.config_niveau_aucun')
            : t('suggestion.config_niveau_defini', { n: niveau })));
        }
        case 'cooldown': {
          const minutes = interaction.options.getInteger('minutes');
          majConfig(guildId, { suggestion_cooldown: minutes });
          return interaction.reply(C.succes(minutes === 0
            ? t('suggestion.config_delai_aucun')
            : t('suggestion.config_delai_defini', { duree: formaterDuree(minutes * 60000, langue) })));
        }
        default: {
          const compte = (statut) => req.compterSuggestions.get(guildId, statut).n;
          return interaction.reply(C.envoi([C.conteneur([
            C.texte(`## ${E('suggestions')} ${t('suggestion.config_titre')}`),
            C.texte([
              `**${t('suggestion.config_salon_label')}** — ${cfg.suggestion_salon ? `<#${cfg.suggestion_salon}>` : `\`${t('suggestion.config_salon_non_defini')}\``}`,
              `**${t('suggestion.config_staff_label')}** — ${cfg.suggestion_role_staff ? `<@&${cfg.suggestion_role_staff}>` : `\`${t('suggestion.config_staff_valeur')}\``}`,
              `**${t('suggestion.config_fil_label')}** — ${cfg.suggestion_fil ? `${E('succes')} ${t('commun.actif')}` : `${E('erreur')} ${t('commun.inactif')}`}`,
              `**${t('suggestion.config_niveau_label')}** — ${cfg.suggestion_niveau_min ? t('suggestion.config_niveau_valeur', { n: cfg.suggestion_niveau_min }) : t('suggestion.config_niveau_aucun_valeur')}`,
              `**${t('suggestion.config_delai_label')}** — ${cfg.suggestion_cooldown ? formaterDuree(cfg.suggestion_cooldown * 60000, langue) : t('suggestion.config_delai_aucun_valeur')}`,
              `**${t('suggestion.config_total_label')}** — ${cfg.suggestion_compteur ?? 0}`,
            ].join('\n')),
            C.separateur(),
            C.texte(`**${t('suggestion.config_repartition_label')}**\n${t('suggestion.config_repartition_valeur', {
              attente: `${E('urne')} ${compte('attente')}`,
              encours: `${E('chantier')} ${compte('encours')}`,
              acceptee: `${E('succes')} ${compte('acceptee')}`,
              refusee: `${E('erreur')} ${compte('refusee')}`,
            })}`),
          ], conf.couleurs.principale)]));
        }
      }
    }

    // ============================================================ ENVOYER
    if (sous === 'send') {
      if (!cfg.suggestion_salon) {
        return interaction.reply(C.erreurPrivee(t('suggestion.envoyer_desactive')));
      }

      const salon = interaction.guild.channels.cache.get(cfg.suggestion_salon);
      if (!salon?.isTextBased()) {
        return interaction.reply(C.erreurPrivee(t('suggestion.envoyer_salon_introuvable')));
      }

      // Condition de niveau
      if (cfg.suggestion_niveau_min > 0) {
        const ligne = req.getXp.get(guildId, interaction.user.id);
        const niveau = infosNiveau(ligne?.xp ?? 0).niveau;
        if (niveau < cfg.suggestion_niveau_min) {
          return interaction.reply(C.avertissementPrivee(t('suggestion.envoyer_niveau_requis', { n: cfg.suggestion_niveau_min, niveau })));
        }
      }

      // Delai entre deux suggestions
      if (cfg.suggestion_cooldown > 0) {
        const derniere = req.derniereSuggestionDe.get(guildId, interaction.user.id)?.derniere;
        if (derniere) {
          const reste = derniere + cfg.suggestion_cooldown * 60000 - Date.now();
          if (reste > 0) {
            return interaction.reply(C.avertissementPrivee(t('suggestion.envoyer_delai', { reste: formaterDuree(reste, langue) })));
          }
        }
      }

      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      // Le contenu de la suggestion est ecrit par un membre : c'est une
      // DONNEE, jamais traduite ni reformulee.
      const idee = interaction.options.getString('idea');
      const numero = (cfg.suggestion_compteur ?? 0) + 1;

      req.incrementerCompteurSuggestion.run(guildId);
      require('../../utils/missions').noter(guildId, interaction.user.id, 'suggestion', 1);
      const info = req.creerSuggestion.run({
        guild_id: guildId,
        numero,
        user_id: interaction.user.id,
        texte: idee,
        date: Date.now(),
      });

      const suggestion = req.suggestionParId.get(Number(info.lastInsertRowid));

      // construireEmbed()/boutons() viennent de src/utils/suggestions.js, hors
      // de mon lot : le message publie dans le salon reste un embed classique,
      // pas Components V2 (voir le rapport final).
      let message;
      try {
        message = await salon.send({
          embeds: [suggestions.construireEmbed(suggestion, interaction.user)],
          components: [suggestions.boutons(suggestion)],
        });
      } catch (e) {
        req.supprimerSuggestion.run(suggestion.id);
        return interaction.editReply(C.erreur(t('suggestion.envoyer_publication_impossible', { erreur: e.message })));
      }

      let fil = null;
      if (cfg.suggestion_fil) {
        fil = await message
          .startThread({ name: `Suggestion #${numero}`.slice(0, 100), autoArchiveDuration: 1440 })
          .catch(() => null);
      }

      req.lierSuggestion.run(salon.id, message.id, fil?.id ?? null, suggestion.id);

      return interaction.editReply(C.succes(t('suggestion.envoyer_publiee', { n: numero, lien: message.url })));
    }

    // =============================================================== VOIR
    if (sous === 'view') {
      const numero = interaction.options.getInteger('number');
      const suggestion = req.suggestionParNumero.get(guildId, numero);
      if (!suggestion) {
        return interaction.reply(C.erreurPrivee(t('suggestion.voir_introuvable', { n: numero })));
      }
      const auteur = await interaction.client.users.fetch(suggestion.user_id).catch(() => null);
      // construireEmbed() vient de l'utilitaire (hors de mon lot) : reste un
      // embed classique, donc cette reponse ne passe pas par Components V2.
      const embed = suggestions.construireEmbed(suggestion, auteur);
      if (suggestion.channel_id && suggestion.message_id) {
        embed.addFields({
          name: t('suggestion.voir_champ_message'),
          value: `https://discord.com/channels/${guildId}/${suggestion.channel_id}/${suggestion.message_id}`,
        });
      }
      return interaction.reply({ embeds: [embed] });
    }

    // ============================================================== LISTE
    if (sous === 'list') {
      const statut = interaction.options.getString('status') ?? 'attente';
      const page = (interaction.options.getInteger('page') ?? 1) - 1;
      const total = req.compterSuggestions.get(guildId, statut).n;
      const lignes = req.listeSuggestions.all(guildId, statut, 10, page * 10);
      const meta = suggestions.STATUTS[statut];
      const statutLabel = t(NOM_STATUT[statut]);

      if (!lignes.length) {
        return interaction.reply(C.info(t('suggestion.liste_vide', { statut: statutLabel.toLowerCase() })));
      }

      return interaction.reply(C.envoi([C.conteneur([
        C.texte(`## ${meta.emoji} ${t('suggestion.liste_titre', { statut: statutLabel, n: total })}`),
        C.texte(lignes
          .map((s) => {
            const v = req.comptesVotes.get(s.id);
            return t('suggestion.liste_ligne', {
              numero: s.numero,
              membre: `<@${s.user_id}>`,
              pour: `${E('pouceHaut')} ${v.pour}`,
              contre: `${E('pouceBas')} ${v.contre}`,
              // Le texte de la suggestion est une DONNEE ecrite par un membre.
              texte: tronquer(s.texte.replace(/\n/g, ' '), 150),
            });
          })
          .join('\n')),
        C.texte(`-# ${t('suggestion.liste_pied', { page: page + 1, total: Math.max(1, Math.ceil(total / 10)) })}`),
      ], meta.couleur)]));
    }

    // =================================================== ACTIONS EQUIPE
    if (!suggestions.estStaff(interaction.member)) {
      return interaction.reply(C.erreurPrivee(t('suggestion.staff_requis')));
    }

    const numero = interaction.options.getInteger('number');

    if (sous === 'delete') {
      const suggestion = req.suggestionParNumero.get(guildId, numero);
      if (!suggestion) {
        return interaction.reply(C.erreurPrivee(t('suggestion.supprimer_introuvable', { n: numero })));
      }
      if (suggestion.channel_id && suggestion.message_id) {
        const salon = interaction.guild.channels.cache.get(suggestion.channel_id);
        const message = await salon?.messages.fetch(suggestion.message_id).catch(() => null);
        await message?.delete().catch(() => null);
      }
      req.supprimerVotes.run(suggestion.id);
      req.supprimerSuggestion.run(suggestion.id);
      return interaction.reply(C.succes(t('suggestion.supprimee', { n: numero })));
    }

    // accepter/refuser/encours : suggestions.repondre() (hors de mon lot)
    // repond lui-meme a l'interaction, avec ses propres embeds classiques en
    // dur en francais (voir le rapport final).
    const statuts = { accept: 'acceptee', reject: 'refusee', 'in-progress': 'encours' };
    return suggestions.repondre(interaction, numero, statuts[sous], interaction.options.getString('reason'));
  },
};
