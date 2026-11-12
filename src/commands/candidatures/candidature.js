const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  InteractionContextType,
  MessageFlags,
  ChannelType,
} = require('discord.js');
const conf = require('../../../config');
const { req, config, majConfig } = require('../../database/db');
const { ts, tronquer } = require('../../utils/outils');
const candidatures = require('../../utils/candidatures');
const { E } = require('../../utils/emojis');
const C = require('../../utils/composants');
const { traducteur, localisations, t: tr, DEFAUT } = require('../../utils/langues');

const SALONS_TEXTE = [ChannelType.GuildText, ChannelType.GuildAnnouncement];

// Les libelles de statut affiches par CETTE commande. `candidatures.STATUTS`
// (src/utils/candidatures.js, un utilitaire partage qu'on ne touche pas) porte
// encore son `.nom` en dur en francais : on ne s'en sert donc que pour la
// couleur et l'emoji, jamais pour le texte, et on retraduit le statut ici.
const LIBELLE_STATUT = {
  attente: 'candidature.statut_attente',
  acceptee: 'candidature.statut_acceptee',
  refusee: 'candidature.statut_refusee',
};

module.exports = {
  categorie: 'candidatures',

  data: new SlashCommandBuilder()
    .setName('application')
    .setNameLocalizations({ fr: 'candidature' })
    .setDescription(tr('candidature.description_commande', DEFAUT))
    .setDescriptionLocalizations(localisations('candidature.description_commande'))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .setContexts(InteractionContextType.Guild)

    .addSubcommand((s) => s
      .setName('panel')
      .setNameLocalizations({ fr: 'panneau' })
      .setDescription(tr('candidature.sous_panneau', DEFAUT))
      .setDescriptionLocalizations(localisations('candidature.sous_panneau'))
      .addChannelOption((o) => o
        .setName('channel')
        .setNameLocalizations({ fr: 'salon' })
        .setDescription(tr('candidature.opt_salon', DEFAUT))
        .setDescriptionLocalizations(localisations('candidature.opt_salon'))
        .addChannelTypes(...SALONS_TEXTE))
      .addStringOption((o) => o
        .setName('language')
        .setNameLocalizations({ fr: 'langue' })
        .setDescription(tr('candidature.opt_langue', DEFAUT))
        .setDescriptionLocalizations(localisations('candidature.opt_langue'))
        .addChoices({ name: 'English', value: 'en' }, { name: 'Français', value: 'fr' })))
    .addSubcommand((s) => s
      .setName('view')
      .setNameLocalizations({ fr: 'voir' })
      .setDescription(tr('candidature.sous_voir', DEFAUT))
      .setDescriptionLocalizations(localisations('candidature.sous_voir'))
      .addIntegerOption((o) => o
        .setName('number')
        .setNameLocalizations({ fr: 'numero' })
        .setDescription(tr('candidature.opt_numero', DEFAUT))
        .setDescriptionLocalizations(localisations('candidature.opt_numero'))
        .setRequired(true)
        .setMinValue(1)))
    .addSubcommand((s) => s
      .setName('list')
      .setNameLocalizations({ fr: 'liste' })
      .setDescription(tr('candidature.sous_liste', DEFAUT))
      .setDescriptionLocalizations(localisations('candidature.sous_liste'))
      .addStringOption((o) => o
        .setName('status')
        .setNameLocalizations({ fr: 'statut' })
        .setDescription(tr('candidature.opt_statut', DEFAUT))
        .setDescriptionLocalizations(localisations('candidature.opt_statut'))
        .addChoices(
          { name: tr('candidature.choix_attente', DEFAUT), name_localizations: localisations('candidature.choix_attente'), value: 'attente' },
          { name: tr('candidature.choix_acceptee', DEFAUT), name_localizations: localisations('candidature.choix_acceptee'), value: 'acceptee' },
          { name: tr('candidature.choix_refusee', DEFAUT), name_localizations: localisations('candidature.choix_refusee'), value: 'refusee' }
        ))
      .addIntegerOption((o) => o
        .setName('page')
        .setDescription(tr('candidature.opt_page', DEFAUT))
        .setDescriptionLocalizations(localisations('candidature.opt_page'))
        .setMinValue(1)))

    .addSubcommandGroup((g) => g
      .setName('position')
      .setNameLocalizations({ fr: 'poste' })
      .setDescription(tr('candidature.groupe_poste', DEFAUT))
      .setDescriptionLocalizations(localisations('candidature.groupe_poste'))
      .addSubcommand((s) => s
        .setName('add')
        .setNameLocalizations({ fr: 'ajouter' })
        .setDescription(tr('candidature.sous_poste_ajouter', DEFAUT))
        .setDescriptionLocalizations(localisations('candidature.sous_poste_ajouter'))
        .addStringOption((o) => o
          .setName('name')
          .setNameLocalizations({ fr: 'nom' })
          .setDescription(tr('candidature.opt_nom', DEFAUT))
          .setDescriptionLocalizations(localisations('candidature.opt_nom'))
          .setRequired(true)
          .setMaxLength(80))
        .addRoleOption((o) => o
          .setName('role')
          .setDescription(tr('candidature.opt_role', DEFAUT))
          .setDescriptionLocalizations(localisations('candidature.opt_role')))
        .addStringOption((o) => o
          .setName('emoji')
          .setDescription(tr('candidature.opt_emoji', DEFAUT))
          .setDescriptionLocalizations(localisations('candidature.opt_emoji'))
          .setMaxLength(10))
        .addStringOption((o) => o
          .setName('description')
          .setDescription(tr('candidature.opt_description', DEFAUT))
          .setDescriptionLocalizations(localisations('candidature.opt_description'))
          .setMaxLength(90))
        .addIntegerOption((o) => o
          .setName('min-level')
          .setNameLocalizations({ fr: 'niveau-minimum' })
          .setDescription(tr('candidature.opt_niveau_minimum', DEFAUT))
          .setDescriptionLocalizations(localisations('candidature.opt_niveau_minimum'))
          .setMinValue(0)
          .setMaxValue(200)))
      .addSubcommand((s) => s
        .setName('questions')
        .setDescription(tr('candidature.sous_poste_questions', DEFAUT))
        .setDescriptionLocalizations(localisations('candidature.sous_poste_questions'))
        .addStringOption((o) => o
          .setName('position')
          .setNameLocalizations({ fr: 'poste' })
          .setDescription(tr('candidature.opt_poste_concerne', DEFAUT))
          .setDescriptionLocalizations(localisations('candidature.opt_poste_concerne'))
          .setRequired(true)
          .setAutocomplete(true))
        .addStringOption((o) => o
          .setName('questions')
          .setDescription(tr('candidature.opt_questions', DEFAUT))
          .setDescriptionLocalizations(localisations('candidature.opt_questions'))
          .setRequired(true)
          .setMaxLength(600)))
      .addSubcommand((s) => s
        .setName('open')
        .setNameLocalizations({ fr: 'ouvrir' })
        .setDescription(tr('candidature.sous_poste_ouvrir', DEFAUT))
        .setDescriptionLocalizations(localisations('candidature.sous_poste_ouvrir'))
        .addStringOption((o) => o
          .setName('position')
          .setNameLocalizations({ fr: 'poste' })
          .setDescription(tr('candidature.opt_poste', DEFAUT))
          .setDescriptionLocalizations(localisations('candidature.opt_poste'))
          .setRequired(true)
          .setAutocomplete(true))
        .addBooleanOption((o) => o
          .setName('open')
          .setNameLocalizations({ fr: 'ouvert' })
          .setDescription(tr('candidature.opt_ouvert', DEFAUT))
          .setDescriptionLocalizations(localisations('candidature.opt_ouvert'))
          .setRequired(true)))
      .addSubcommand((s) => s
        .setName('remove')
        .setNameLocalizations({ fr: 'retirer' })
        .setDescription(tr('candidature.sous_poste_retirer', DEFAUT))
        .setDescriptionLocalizations(localisations('candidature.sous_poste_retirer'))
        .addStringOption((o) => o
          .setName('position')
          .setNameLocalizations({ fr: 'poste' })
          .setDescription(tr('candidature.opt_poste', DEFAUT))
          .setDescriptionLocalizations(localisations('candidature.opt_poste'))
          .setRequired(true)
          .setAutocomplete(true)))
      .addSubcommand((s) => s
        .setName('list')
        .setNameLocalizations({ fr: 'liste' })
        .setDescription(tr('candidature.sous_poste_liste', DEFAUT))
        .setDescriptionLocalizations(localisations('candidature.sous_poste_liste'))))

    .addSubcommandGroup((g) => g
      .setName('config')
      .setDescription(tr('candidature.groupe_config', DEFAUT))
      .setDescriptionLocalizations(localisations('candidature.groupe_config'))
      .addSubcommand((s) => s
        .setName('channel')
        .setNameLocalizations({ fr: 'salon' })
        .setDescription(tr('candidature.sous_config_salon', DEFAUT))
        .setDescriptionLocalizations(localisations('candidature.sous_config_salon'))
        .addChannelOption((o) => o
          .setName('channel')
          .setNameLocalizations({ fr: 'salon' })
          .setDescription(tr('candidature.opt_salon_requis', DEFAUT))
          .setDescriptionLocalizations(localisations('candidature.opt_salon_requis'))
          .setRequired(true)
          .addChannelTypes(...SALONS_TEXTE)))
      .addSubcommand((s) => s
        .setName('staff')
        .setDescription(tr('candidature.sous_config_staff', DEFAUT))
        .setDescriptionLocalizations(localisations('candidature.sous_config_staff'))
        .addRoleOption((o) => o
          .setName('role')
          .setDescription(tr('candidature.opt_role_staff', DEFAUT))
          .setDescriptionLocalizations(localisations('candidature.opt_role_staff'))))
      .addSubcommand((s) => s
        .setName('view')
        .setNameLocalizations({ fr: 'voir' })
        .setDescription(tr('candidature.sous_config_voir', DEFAUT))
        .setDescriptionLocalizations(localisations('candidature.sous_config_voir')))),

  async autocomplete(interaction) {
    const saisie = interaction.options.getFocused().toLowerCase();
    const types = req.typesCandidatures
      .all(interaction.guild.id)
      .filter((t) => t.label.toLowerCase().includes(saisie))
      .slice(0, 25);
    return interaction.respond(types.map((t) => ({ name: t.label, value: t.cle })));
  },

  async execute(interaction) {
    const { t, langue } = traducteur(interaction);
    const groupe = interaction.options.getSubcommandGroup(false);
    const sous = interaction.options.getSubcommand();
    const guildId = interaction.guild.id;

    const besoinAdmin = () => {
      if (interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) return null;
      return interaction.reply(C.erreurPrivee(t('candidature.permission_requise')));
    };

    // ==================================================== CONFIGURATION
    if (groupe === 'config') {
      const refus = besoinAdmin();
      if (refus) return refus;

      if (sous === 'channel') {
        const salon = interaction.options.getChannel('channel');
        majConfig(guildId, { cand_salon: salon.id });
        return interaction.reply(C.succes(t('candidature.config_salon_fait', { salon })));
      }
      if (sous === 'staff') {
        const role = interaction.options.getRole('role');
        majConfig(guildId, { cand_role_staff: role?.id ?? null });
        return interaction.reply(C.succes(
          role ? t('candidature.config_staff_role', { role }) : t('candidature.config_staff_admins')
        ));
      }

      const cfg = config(guildId);
      const compte = (statut) => req.compterCandidatures.get(guildId, statut).n;
      return interaction.reply(C.envoi([C.conteneur([
        C.texte(`## ${E('candidatures')} ${t('candidature.config_titre')}`),
        C.texte(
          `**${t('candidature.config_salon_label')}** · ${cfg.cand_salon ? `<#${cfg.cand_salon}>` : `\`${t('candidature.non_defini')}\``}\n`
          + `**${t('candidature.config_role_staff_label')}** · ${cfg.cand_role_staff ? `<@&${cfg.cand_role_staff}>` : `\`${t('candidature.administrateurs')}\``}\n`
          + `**${t('candidature.config_postes_label')}** · ${req.typesCandidatures.all(guildId).length}`
        ),
        C.separateur(),
        C.texte(
          `**${t('candidature.config_recap_label')}** · ${E('candidatures')} ${compte('attente')} ${t('candidature.en_attente')} · `
          + `${E('succes')} ${compte('acceptee')} ${t('candidature.acceptees')} · ${E('erreur')} ${compte('refusee')} ${t('candidature.refusees')}`
        ),
      ], conf.couleurs.principale)]));
    }

    // ========================================================== POSTES
    if (groupe === 'position') {
      const refus = besoinAdmin();
      if (refus) return refus;

      if (sous === 'add') {
        const nom = interaction.options.getString('name');
        const cle = nom
          .toLowerCase()
          .normalize('NFD')
          .replace(/[̀-ͯ]/g, '')
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '')
          .slice(0, 40);
        if (!cle) {
          return interaction.reply(C.erreurPrivee(t('candidature.nom_invalide')));
        }

        const role = interaction.options.getRole('role');
        if (role && (role.managed || role.position >= interaction.guild.members.me.roles.highest.position)) {
          return interaction.reply(C.erreurPrivee(t('candidature.role_trop_haut', { role })));
        }

        const existant = req.typeCandidature.get(guildId, cle);
        req.ajouterTypeCandidature.run({
          guild_id: guildId,
          cle,
          label: nom,
          emoji: interaction.options.getString('emoji') ?? null,
          description: interaction.options.getString('description') ?? null,
          role_id: role?.id ?? null,
          questions: existant?.questions ?? JSON.stringify(candidatures.QUESTIONS_DEFAUT),
          niveau_min: interaction.options.getInteger('min-level') ?? 0,
          ouvert: 1,
        });

        return interaction.reply(C.succes(
          `${t(existant ? 'candidature.poste_maj' : 'candidature.poste_cree', { nom })}\n${t('candidature.poste_astuce')}`
        ));
      }

      if (sous === 'questions') {
        const cle = interaction.options.getString('position');
        const type = req.typeCandidature.get(guildId, cle);
        if (!type) return interaction.reply(C.erreurPrivee(t('candidature.poste_introuvable')));

        const brut = interaction.options.getString('questions');
        const questions = brut
          .split('|')
          .map((q) => q.trim())
          .filter(Boolean)
          .slice(0, 5)
          .map((q) => ({ label: q.replace(/^\*/, '').trim(), long: q.startsWith('*') }));

        if (!questions.length) {
          return interaction.reply(C.erreurPrivee(t('candidature.questions_invalides')));
        }

        req.ajouterTypeCandidature.run({
          guild_id: guildId,
          cle,
          label: type.label,
          emoji: type.emoji,
          description: type.description,
          role_id: type.role_id,
          questions: JSON.stringify(questions),
          niveau_min: type.niveau_min,
          ouvert: type.ouvert,
        });

        return interaction.reply(C.succes(t('candidature.questions_enregistrees', {
          n: questions.length,
          poste: type.label,
          liste: questions.map((q, i) => `${i + 1}. ${q.label}${q.long ? t('candidature.question_longue') : ''}`).join('\n'),
        })));
      }

      if (sous === 'open') {
        const cle = interaction.options.getString('position');
        const ouvert = interaction.options.getBoolean('open');
        const type = req.typeCandidature.get(guildId, cle);
        if (!type) return interaction.reply(C.erreurPrivee(t('candidature.poste_introuvable')));
        req.ouvrirFermerType.run(ouvert ? 1 : 0, guildId, cle);
        return interaction.reply(C.succes(t(ouvert ? 'candidature.poste_ouvert' : 'candidature.poste_ferme', { nom: type.label })));
      }

      if (sous === 'remove') {
        const cle = interaction.options.getString('position');
        const res = req.retirerTypeCandidature.run(guildId, cle);
        return interaction.reply(res.changes
          ? C.succes(t('candidature.poste_retire'))
          : C.erreurPrivee(t('candidature.poste_introuvable')));
      }

      const types = req.typesCandidatures.all(guildId);
      if (!types.length) {
        return interaction.reply(C.info(t('candidature.aucun_poste')));
      }
      return interaction.reply(C.envoi([C.conteneur([
        C.texte(`## ${E('candidatures')} ${t('candidature.postes_titre', { n: types.length })}`),
        C.texte(
          types
            .map((t2) => {
              const questions = candidatures.lireQuestions(t2, langue);
              return [
                `${t2.emoji ?? '•'} **${t2.label}** ${t2.ouvert ? `${E('enligne')} ${t('candidature.etat_ouvert')}` : `${E('horsligne')} ${t('candidature.etat_ferme')}`}`,
                t2.role_id ? `> ${t('candidature.poste_role_label', { role: `<@&${t2.role_id}>` })}` : null,
                t2.niveau_min ? `> ${t('candidature.poste_niveau_label', { n: t2.niveau_min })}` : null,
                `> ${t('candidature.poste_questions_label', { n: questions.length, liste: tronquer(questions.map((q) => q.label).join(' · '), 150) })}`,
              ]
                .filter(Boolean)
                .join('\n');
            })
            .join('\n\n')
        ),
      ], conf.couleurs.principale)]));
    }

    // ========================================================= PANNEAU
    if (sous === 'panel') {
      const refus = besoinAdmin();
      if (refus) return refus;

      const cfg = config(guildId);
      if (!cfg.cand_salon) {
        return interaction.reply(C.erreurPrivee(t('candidature.salon_non_configure')));
      }
      const salon = interaction.options.getChannel('channel') ?? interaction.channel;
      await salon.send(candidatures.construirePanneau(interaction.guild, interaction.options.getString('language')));
      return interaction.reply(C.succesPrive(t('candidature.panneau_publie', { salon })));
    }

    // ============================================================ VOIR
    if (sous === 'view') {
      const numero = interaction.options.getInteger('number');
      const candidature = req.candidatureParNumero.get(guildId, numero);
      if (!candidature) {
        return interaction.reply(C.erreurPrivee(t('candidature.candidature_introuvable', { n: numero })));
      }
      const auteur = await interaction.client.users.fetch(candidature.user_id).catch(() => null);
      // `construireEmbed` et `boutonsDecision` viennent de src/utils/candidatures.js
      // (partage, hors de portee) : la reponse reste en embed classique, un
      // message Components V2 n'affiche plus du tout les `embeds`.
      return interaction.reply({
        embeds: [candidatures.construireEmbed(candidature, auteur, langue)],
        components: candidature.statut === 'attente' ? [candidatures.boutonsDecision(candidature, langue)] : [],
        flags: MessageFlags.Ephemeral,
      });
    }

    // =========================================================== LISTE
    const statut = interaction.options.getString('status') ?? 'attente';
    const page = Math.max(0, (interaction.options.getInteger('page') ?? 1) - 1);
    const total = req.compterCandidatures.get(guildId, statut).n;
    const lignes = req.listeCandidatures.all(guildId, statut, 10, page * 10);
    const meta = candidatures.STATUTS[statut];
    const libelleStatut = t(LIBELLE_STATUT[statut]);

    if (!lignes.length) {
      return interaction.reply(C.info(t('candidature.liste_vide', { statut: libelleStatut })));
    }

    return interaction.reply(C.envoi([C.conteneur([
      C.texte(`## ${meta.emoji} ${t('candidature.liste_titre', { statut: libelleStatut, n: total })}`),
      C.texte(
        lignes
          .map((c) => `**#${c.numero}** · ${c.type_label} · <@${c.user_id}> · ${ts(c.date, 'R')}`)
          .join('\n')
      ),
      C.separateur(),
      C.texte(`-# ${t('candidature.liste_pied', { n: page + 1, total: Math.max(1, Math.ceil(total / 10)) })}`),
    ], meta.couleur)]));
  },
};
