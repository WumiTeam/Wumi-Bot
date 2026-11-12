const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  InteractionContextType,
  ChannelType,
} = require('discord.js');
const conf = require('../../../config');
const { req, config, majConfig } = require('../../database/db');
const { ts, formaterNombre } = require('../../utils/outils');
const invitations = require('../../utils/invitations');
const { E } = require('../../utils/emojis');
const C = require('../../utils/composants');
const { traducteur, localisations, t: tr, DEFAUT } = require('../../utils/langues');

// Une FONCTION, pas un tableau : les emojis du bot ne sont connus qu'apres
// la connexion a Discord, et un tableau construit au chargement du module
// figerait les replis Unicode pour toute la duree du processus.
const MEDAILLES = () => [E('premier'), E('deuxieme'), E('troisieme')];

module.exports = {
  categorie: 'invitations',

  data: new SlashCommandBuilder()
    .setName('invitations')
    .setDescription(tr('invitations.description_commande', DEFAUT))
    .setDescriptionLocalizations(localisations('invitations.description_commande'))
    .setContexts(InteractionContextType.Guild)

    .addSubcommand((s) => s
      .setName('view')
      .setNameLocalizations({ fr: 'voir' })
      .setDescription(tr('invitations.sous_voir', DEFAUT))
      .setDescriptionLocalizations(localisations('invitations.sous_voir'))
      .addUserOption((o) => o
        .setName('member')
        .setNameLocalizations({ fr: 'membre' })
        .setDescription(tr('invitations.opt_membre', DEFAUT))
        .setDescriptionLocalizations(localisations('invitations.opt_membre'))))
    .addSubcommand((s) => s
      .setName('leaderboard')
      .setNameLocalizations({ fr: 'classement' })
      .setDescription(tr('invitations.sous_classement', DEFAUT))
      .setDescriptionLocalizations(localisations('invitations.sous_classement'))
      .addIntegerOption((o) => o
        .setName('page')
        .setDescription(tr('invitations.opt_page', DEFAUT))
        .setDescriptionLocalizations(localisations('invitations.opt_page'))
        .setMinValue(1)))
    .addSubcommand((s) => s
      .setName('who')
      .setNameLocalizations({ fr: 'qui' })
      .setDescription(tr('invitations.sous_qui', DEFAUT))
      .setDescriptionLocalizations(localisations('invitations.sous_qui'))
      .addUserOption((o) => o
        .setName('member')
        .setNameLocalizations({ fr: 'membre' })
        .setDescription(tr('invitations.opt_membre_qui', DEFAUT))
        .setDescriptionLocalizations(localisations('invitations.opt_membre_qui'))
        .setRequired(true)))
    .addSubcommand((s) => s
      .setName('bonus')
      .setDescription(tr('invitations.sous_bonus', DEFAUT))
      .setDescriptionLocalizations(localisations('invitations.sous_bonus'))
      .addUserOption((o) => o
        .setName('member')
        .setNameLocalizations({ fr: 'membre' })
        .setDescription(tr('invitations.opt_membre_bonus', DEFAUT))
        .setDescriptionLocalizations(localisations('invitations.opt_membre_bonus'))
        .setRequired(true))
      .addIntegerOption((o) => o
        .setName('number')
        .setNameLocalizations({ fr: 'nombre' })
        .setDescription(tr('invitations.opt_nombre', DEFAUT))
        .setDescriptionLocalizations(localisations('invitations.opt_nombre'))
        .setRequired(true)))

    .addSubcommandGroup((g) => g
      .setName('config')
      .setDescription(tr('invitations.groupe_config', DEFAUT))
      .setDescriptionLocalizations(localisations('invitations.groupe_config'))
      .addSubcommand((s) => s
        .setName('enable')
        .setNameLocalizations({ fr: 'activer' })
        .setDescription(tr('invitations.sous_activer', DEFAUT))
        .setDescriptionLocalizations(localisations('invitations.sous_activer'))
        .addBooleanOption((o) => o
          .setName('enabled')
          .setNameLocalizations({ fr: 'actif' })
          .setDescription(tr('invitations.opt_actif', DEFAUT))
          .setDescriptionLocalizations(localisations('invitations.opt_actif'))
          .setRequired(true)))
      .addSubcommand((s) => s
        .setName('channel')
        .setNameLocalizations({ fr: 'salon' })
        .setDescription(tr('invitations.sous_salon', DEFAUT))
        .setDescriptionLocalizations(localisations('invitations.sous_salon'))
        .addChannelOption((o) => o
          .setName('channel')
          .setNameLocalizations({ fr: 'salon' })
          .setDescription(tr('invitations.opt_salon', DEFAUT))
          .setDescriptionLocalizations(localisations('invitations.opt_salon'))
          .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)))
      .addSubcommand((s) => s
        .setName('min-age')
        .setNameLocalizations({ fr: 'age-minimum' })
        .setDescription(tr('invitations.sous_age_minimum', DEFAUT))
        .setDescriptionLocalizations(localisations('invitations.sous_age_minimum'))
        .addIntegerOption((o) => o
          .setName('days')
          .setNameLocalizations({ fr: 'jours' })
          .setDescription(tr('invitations.opt_jours', DEFAUT))
          .setDescriptionLocalizations(localisations('invitations.opt_jours'))
          .setRequired(true)
          .setMinValue(0)
          .setMaxValue(90)))
      .addSubcommand((s) => s
        .setName('reward-add')
        .setNameLocalizations({ fr: 'recompense-ajouter' })
        .setDescription(tr('invitations.sous_recompense_ajouter', DEFAUT))
        .setDescriptionLocalizations(localisations('invitations.sous_recompense_ajouter'))
        .addIntegerOption((o) => o
          .setName('threshold')
          .setNameLocalizations({ fr: 'palier' })
          .setDescription(tr('invitations.opt_palier', DEFAUT))
          .setDescriptionLocalizations(localisations('invitations.opt_palier'))
          .setRequired(true)
          .setMinValue(1))
        .addRoleOption((o) => o
          .setName('role')
          .setDescription(tr('invitations.opt_role', DEFAUT))
          .setDescriptionLocalizations(localisations('invitations.opt_role'))
          .setRequired(true)))
      .addSubcommand((s) => s
        .setName('reward-remove')
        .setNameLocalizations({ fr: 'recompense-retirer' })
        .setDescription(tr('invitations.sous_recompense_retirer', DEFAUT))
        .setDescriptionLocalizations(localisations('invitations.sous_recompense_retirer'))
        .addIntegerOption((o) => o
          .setName('threshold')
          .setNameLocalizations({ fr: 'palier' })
          .setDescription(tr('invitations.opt_palier_retirer', DEFAUT))
          .setDescriptionLocalizations(localisations('invitations.opt_palier_retirer'))
          .setRequired(true)
          .setMinValue(1)))
      .addSubcommand((s) => s
        .setName('view')
        .setNameLocalizations({ fr: 'voir' })
        .setDescription(tr('invitations.sous_config_voir', DEFAUT))
        .setDescriptionLocalizations(localisations('invitations.sous_config_voir')))),

  async execute(interaction) {
    const { t, nombre } = traducteur(interaction);
    const groupe = interaction.options.getSubcommandGroup(false);
    const sous = interaction.options.getSubcommand();
    const guildId = interaction.guild.id;

    // ==================================================== CONFIGURATION
    if (groupe === 'config') {
      if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
        return interaction.reply(C.erreurPrivee(t('invitations.permission_config')));
      }

      switch (sous) {
        case 'enable': {
          const actif = interaction.options.getBoolean('enabled');
          if (actif && !interaction.guild.members.me.permissions.has(PermissionFlagsBits.ManageGuild)) {
            return interaction.reply(C.erreurPrivee(t('invitations.permission_manque_lire')));
          }
          majConfig(guildId, { invitations_actif: actif ? 1 : 0 });
          if (actif) await invitations.rafraichirCache(interaction.guild);
          return interaction.reply(C.succes(t(actif ? 'invitations.suivi_active' : 'invitations.suivi_desactive')));
        }
        case 'channel': {
          const salon = interaction.options.getChannel('channel');
          majConfig(guildId, { invitations_salon: salon?.id ?? null });
          return interaction.reply(C.succes(salon
            ? t('invitations.salon_annonces_defini', { salon })
            : t('invitations.salon_annonces_logs')));
        }
        case 'min-age': {
          const jours = interaction.options.getInteger('days');
          majConfig(guildId, { invitations_age_min: jours });
          return interaction.reply(C.succes(jours === 0
            ? t('invitations.age_min_aucun')
            : t('invitations.age_min_defini', { jours })));
        }
        case 'reward-add': {
          const palier = interaction.options.getInteger('threshold');
          const role = interaction.options.getRole('role');
          if (role.managed || role.position >= interaction.guild.members.me.roles.highest.position) {
            return interaction.reply(C.erreurPrivee(t('invitations.role_trop_haut', { role })));
          }
          req.ajouterRecompenseInvit.run(guildId, palier, role.id);
          return interaction.reply(C.succes(t('invitations.recompense_ajoutee', { role, palier })));
        }
        case 'reward-remove': {
          const palier = interaction.options.getInteger('threshold');
          const res = req.retirerRecompenseInvit.run(guildId, palier);
          return interaction.reply(res.changes
            ? C.succes(t('invitations.recompense_retiree', { palier }))
            : C.erreurPrivee(t('invitations.recompense_absente')));
        }
        default: {
          const cfg = config(guildId);
          const recompenses = req.recompensesInvit.all(guildId);
          return interaction.reply(C.envoi([C.conteneur([
            C.texte(`## ${E('invitations')} ${t('invitations.config_titre')}`),
            C.texte(
              `**${t('invitations.config_suivi_label')}** · ${cfg.invitations_actif ? `${E('succes')} ${t('invitations.config_suivi_actif')}` : `${E('erreur')} ${t('invitations.config_suivi_inactif')}`}\n`
              + `**${t('invitations.config_salon_label')}** · ${cfg.invitations_salon ? `<#${cfg.invitations_salon}>` : `\`${t('invitations.config_salon_valeur')}\``}\n`
              + `**${t('invitations.config_suspects_label')}** · ${cfg.invitations_age_min ? t('invitations.config_suspects_valeur', { n: cfg.invitations_age_min }) : t('invitations.config_suspects_aucun')}`
            ),
            C.separateur(),
            C.texte(
              `**${t('invitations.config_recompenses_label', { n: recompenses.length })}**\n`
              + (recompenses.length
                ? recompenses.map((r) => t('invitations.config_recompense_ligne', { palier: r.palier, role: `<@&${r.role_id}>` })).join('\n')
                : t('invitations.config_recompenses_vide'))
            ),
            C.texte(`-# ${t('invitations.config_pied')}`),
          ], conf.couleurs.principale)]));
        }
      }
    }

    const cfg = config(guildId);

    // ============================================================ BONUS
    if (sous === 'bonus') {
      if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
        return interaction.reply(C.erreurPrivee(t('invitations.permission_bonus')));
      }
      const cible = interaction.options.getUser('member');
      const nb = interaction.options.getInteger('number');
      const actuel = req.bonusInvitations.get(guildId, cible.id)?.bonus ?? 0;
      const nouveau = actuel + nb;
      req.definirBonus.run(guildId, cible.id, nouveau);
      const stats = invitations.totalDe(guildId, cible.id);
      return interaction.reply(C.succes(
        `${t('invitations.bonus_fait', { membre: cible, avant: actuel, apres: nouveau })}\n`
        + t('invitations.bonus_total', { total: t('invitations.total_montant', { n: stats.total }) })
      ));
    }

    // ============================================================== QUI
    if (sous === 'who') {
      const cible = interaction.options.getUser('member');
      const arrivee = req.arriveeDe.get(guildId, cible.id);
      if (!arrivee) {
        return interaction.reply(C.info(t('invitations.qui_absent', { membre: cible })));
      }
      return interaction.reply(C.envoi([C.conteneur([
        C.texte(`### ${cible.tag}`),
        C.texte(
          [
            arrivee.inviteur_id ? t('invitations.qui_invite_par', { inviteur: `<@${arrivee.inviteur_id}>` }) : t('invitations.qui_invite_inconnu'),
            t('invitations.qui_arrive', { date: ts(arrivee.date), relatif: ts(arrivee.date, 'R') }),
            arrivee.code ? t('invitations.qui_code', { code: arrivee.code }) : null,
            arrivee.faux ? `${E('avertissement')} ${t('invitations.qui_suspect')}` : null,
            arrivee.parti ? `${E('porte')} ${t('invitations.qui_parti')}` : null,
          ]
            .filter(Boolean)
            .join('\n')
        ),
      ], conf.couleurs.principale)]));
    }

    // ======================================================= CLASSEMENT
    if (sous === 'leaderboard') {
      const total = req.totalInviteurs.get(guildId).n;
      if (total === 0) {
        return interaction.reply(C.info(cfg.invitations_actif
          ? t('invitations.classement_vide_actif')
          : t('invitations.classement_vide_inactif')));
      }

      const page = Math.max(0, (interaction.options.getInteger('page') ?? 1) - 1);
      const lignes = req.classementInvitations.all(guildId, 10, page * 10);

      const corps = lignes
        .map((l, i) => {
          const position = page * 10 + i + 1;
          const bonus = req.bonusInvitations.get(guildId, l.inviteur_id)?.bonus ?? 0;
          const prefixe = MEDAILLES()[position - 1] ?? `\`#${String(position).padStart(2, ' ')}\``;
          const details = [
            `${l.valides} ${t('invitations.mot_valides')}`,
            bonus ? `${bonus} ${t('invitations.mot_bonus')}` : null,
            l.partis ? `${l.partis} ${t('invitations.mot_partis')}` : null,
            l.faux ? `${l.faux} ${t('invitations.mot_suspects')}` : null,
          ].filter(Boolean).join(' · ');
          return `${prefixe} <@${l.inviteur_id}> — ${t('invitations.total_montant', { n: l.valides + bonus })}\n> ${details}`;
        })
        .join('\n');

      return interaction.reply(C.envoi([C.conteneur([
        C.texte(`## ${E('invitations')} ${t('invitations.classement_titre', { serveur: interaction.guild.name })}`),
        C.texte(corps),
        C.separateur(),
        C.texte(`-# ${t('commun.page', { n: nombre(page + 1), total: nombre(Math.max(1, Math.ceil(total / 10))) })} · ${t('invitations.recruteur_pluriel', { n: total })}`),
      ], conf.couleurs.principale)]));
    }

    // ============================================================= VOIR
    const cible = interaction.options.getUser('member') ?? interaction.user;
    const stats = invitations.totalDe(guildId, cible.id);
    const derniers = req.invitesDe.all(guildId, cible.id, 5);
    const prochain = req.recompensesInvit.all(guildId).find((r) => r.palier > stats.total);

    return interaction.reply(C.envoi([C.conteneur([
      C.texte(`## ${t('invitations.voir_titre', { membre: cible.tag })}`),
      C.texte(t('invitations.voir_total', { n: stats.total, total: nombre(stats.total) })),
      C.separateur(),
      C.texte(
        `**${E('succes')} ${t('invitations.voir_valides')}** · ${stats.valides}\n`
        + `**${E('porte')} ${t('invitations.voir_partis')}** · ${stats.partis}\n`
        + `**${E('avertissement')} ${t('invitations.voir_suspects')}** · ${stats.faux}`
        + (stats.bonus ? `\n**${E('cadeau')} ${t('invitations.voir_bonus')}** · ${stats.bonus}` : '')
      ),
      ...(prochain
        ? [C.separateur(), C.texte(`**${t('invitations.voir_prochaine_recompense_label')}**\n${t('invitations.voir_prochaine_recompense', { role: `<@&${prochain.role_id}>`, palier: prochain.palier, reste: prochain.palier - stats.total })}`)]
        : []),
      ...(derniers.length
        ? [C.separateur(), C.texte(`**${t('invitations.voir_dernieres_label')}**\n${derniers
            .map((d) => `<@${d.user_id}> · ${ts(d.date, 'R')}${d.parti ? ` ${E('porte')}` : d.faux ? ` ${E('avertissement')}` : ''}`)
            .join('\n')}`)]
        : []),
      ...(!cfg.invitations_actif ? [C.texte(`-# ${t('invitations.voir_pied_desactive')}`)] : []),
    ], conf.couleurs.principale)]));
  },
};
