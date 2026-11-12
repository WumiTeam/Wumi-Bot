/**
 * /automod — la moderation automatique des messages.
 *
 * UN INTERRUPTEUR GENERAL, PUIS SIX MODULES.
 * Couper l'automod d'un serveur ne doit pas demander de couper six reglages
 * un par un : `automod_actif` commande tout, et chaque module garde son propre
 * etat pour qu'on le retrouve tel quel en rallumant.
 *
 * Les seuils (combien de messages font un spam, quel pourcentage de
 * majuscules est de trop) vivent dans config.js et pas en base : ce sont des
 * reglages d'hebergeur, pas des reglages de serveur.
 */
const { SlashCommandBuilder, PermissionFlagsBits, InteractionContextType } = require('discord.js');
const conf = require('../../../config');
const C = require('../../utils/composants');
const { config, majConfig, req } = require('../../database/db');
const { tronquer } = require('../../utils/outils');
const { E } = require('../../utils/emojis');
const { traducteur, localisations, t: tr, DEFAUT } = require('../../utils/langues');

/**
 * Les modules, dans l'ordre d'affichage.
 * La cle est la valeur envoyee par Discord et le suffixe de la cle de
 * traduction ; `colonne` est le nom en base, qui ne bouge jamais.
 */
const MODULES = {
  spam: { colonne: 'automod_spam' },
  invitations: { colonne: 'automod_invitations' },
  liens: { colonne: 'automod_liens' },
  mots: { colonne: 'automod_mots' },
  mentions: { colonne: 'automod_mentions' },
  majuscules: { colonne: 'automod_majuscules' },
};

module.exports = {
  categorie: 'config',

  data: new SlashCommandBuilder()
    .setName('automod')
    .setDescription(tr('automod.description_commande', DEFAUT))
    .setDescriptionLocalizations(localisations('automod.description_commande'))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setContexts(InteractionContextType.Guild)
    .addSubcommand((s) =>
      s
        .setName('enable')
        .setNameLocalizations({ fr: 'activer' })
        .setDescription(tr('automod.sous_activer', DEFAUT))
        .setDescriptionLocalizations(localisations('automod.sous_activer'))
    )
    .addSubcommand((s) =>
      s
        .setName('disable')
        .setNameLocalizations({ fr: 'desactiver' })
        .setDescription(tr('automod.sous_desactiver', DEFAUT))
        .setDescriptionLocalizations(localisations('automod.sous_desactiver'))
    )
    .addSubcommand((s) =>
      s
        .setName('module')
        .setDescription(tr('automod.sous_module', DEFAUT))
        .setDescriptionLocalizations(localisations('automod.sous_module'))
        .addStringOption((o) =>
          o
            .setName('name')
            .setNameLocalizations({ fr: 'nom' })
            .setDescription(tr('automod.opt_module_nom', DEFAUT))
            .setDescriptionLocalizations(localisations('automod.opt_module_nom'))
            .setRequired(true)
            .addChoices(...Object.keys(MODULES).map((v) => ({
              name: tr(`automod.mod.${v}`, DEFAUT),
              name_localizations: localisations(`automod.mod.${v}`),
              value: v,
            })))
        )
        .addBooleanOption((o) =>
          o
            .setName('enabled')
            .setNameLocalizations({ fr: 'actif' })
            .setDescription(tr('automod.opt_module_actif', DEFAUT))
            .setDescriptionLocalizations(localisations('automod.opt_module_actif'))
            .setRequired(true)
        )
    )
    .addSubcommandGroup((g) =>
      g
        .setName('words')
        .setNameLocalizations({ fr: 'mots' })
        .setDescription(tr('automod.grp_mots', DEFAUT))
        .setDescriptionLocalizations(localisations('automod.grp_mots'))
        .addSubcommand((s) =>
          s
            .setName('add')
            .setNameLocalizations({ fr: 'ajouter' })
            .setDescription(tr('automod.grp_mots_ajouter', DEFAUT))
            .setDescriptionLocalizations(localisations('automod.grp_mots_ajouter'))
            .addStringOption((o) =>
              o
                .setName('word')
                .setNameLocalizations({ fr: 'mot' })
                .setDescription(tr('automod.opt_mot_ajouter', DEFAUT))
                .setDescriptionLocalizations(localisations('automod.opt_mot_ajouter'))
                .setRequired(true)
                .setMaxLength(60)
            )
        )
        .addSubcommand((s) =>
          s
            .setName('remove')
            .setNameLocalizations({ fr: 'retirer' })
            .setDescription(tr('automod.grp_mots_retirer', DEFAUT))
            .setDescriptionLocalizations(localisations('automod.grp_mots_retirer'))
            .addStringOption((o) =>
              o
                .setName('word')
                .setNameLocalizations({ fr: 'mot' })
                .setDescription(tr('automod.opt_mot_retirer', DEFAUT))
                .setDescriptionLocalizations(localisations('automod.opt_mot_retirer'))
                .setRequired(true)
                .setAutocomplete(true)
            )
        )
        .addSubcommand((s) =>
          s
            .setName('list')
            .setNameLocalizations({ fr: 'liste' })
            .setDescription(tr('automod.grp_mots_liste', DEFAUT))
            .setDescriptionLocalizations(localisations('automod.grp_mots_liste'))
        )
    )
    .addSubcommandGroup((g) =>
      g
        .setName('exempt')
        .setNameLocalizations({ fr: 'exemption' })
        .setDescription(tr('automod.grp_exemption', DEFAUT))
        .setDescriptionLocalizations(localisations('automod.grp_exemption'))
        .addSubcommand((s) =>
          s
            .setName('add')
            .setNameLocalizations({ fr: 'ajouter' })
            .setDescription(tr('automod.grp_exemption_ajouter', DEFAUT))
            .setDescriptionLocalizations(localisations('automod.grp_exemption_ajouter'))
            .addChannelOption((o) =>
              o
                .setName('channel')
                .setNameLocalizations({ fr: 'salon' })
                .setDescription(tr('automod.opt_exempt_salon', DEFAUT))
                .setDescriptionLocalizations(localisations('automod.opt_exempt_salon'))
            )
            .addRoleOption((o) =>
              o
                .setName('role')
                .setDescription(tr('automod.opt_exempt_role', DEFAUT))
                .setDescriptionLocalizations(localisations('automod.opt_exempt_role'))
            )
        )
        .addSubcommand((s) =>
          s
            .setName('remove')
            .setNameLocalizations({ fr: 'retirer' })
            .setDescription(tr('automod.grp_exemption_retirer', DEFAUT))
            .setDescriptionLocalizations(localisations('automod.grp_exemption_retirer'))
            .addChannelOption((o) =>
              o
                .setName('channel')
                .setNameLocalizations({ fr: 'salon' })
                .setDescription(tr('automod.opt_retirer_salon', DEFAUT))
                .setDescriptionLocalizations(localisations('automod.opt_retirer_salon'))
            )
            .addRoleOption((o) =>
              o
                .setName('role')
                .setDescription(tr('automod.opt_retirer_role', DEFAUT))
                .setDescriptionLocalizations(localisations('automod.opt_retirer_role'))
            )
        )
        .addSubcommand((s) =>
          s
            .setName('list')
            .setNameLocalizations({ fr: 'liste' })
            .setDescription(tr('automod.grp_exemption_liste', DEFAUT))
            .setDescriptionLocalizations(localisations('automod.grp_exemption_liste'))
        )
    )
    .addSubcommand((s) =>
      s
        .setName('status')
        .setNameLocalizations({ fr: 'etat' })
        .setDescription(tr('automod.sous_etat', DEFAUT))
        .setDescriptionLocalizations(localisations('automod.sous_etat'))
    ),

  async autocomplete(interaction) {
    const saisie = interaction.options.getFocused().toLowerCase();
    const mots = req.mots
      .all(interaction.guild.id)
      .map((m) => m.mot)
      .filter((m) => m.includes(saisie))
      .slice(0, 25);
    return interaction.respond(mots.map((m) => ({ name: m, value: m })));
  },

  async execute(interaction) {
    const { t, nombre } = traducteur(interaction);
    const groupe = interaction.options.getSubcommandGroup(false);
    const sous = interaction.options.getSubcommand();
    const guildId = interaction.guild.id;

    // ---------------------------------------------------------- MOTS
    if (groupe === 'words') {
      if (sous === 'add') {
        const mot = interaction.options.getString('word').toLowerCase().trim();
        req.ajouterMot.run(guildId, mot);
        return interaction.reply(C.succesPrive(t('automod.mot_ajoute', { mot })));
      }
      if (sous === 'remove') {
        const mot = interaction.options.getString('word').toLowerCase().trim();
        const res = req.retirerMot.run(guildId, mot);
        return interaction.reply(res.changes
          ? C.succesPrive(t('automod.mot_retire', { mot }))
          : C.erreurPrivee(t('automod.mot_absent', { mot })));
      }

      const mots = req.mots.all(guildId).map((m) => m.mot);
      if (!mots.length) return interaction.reply(C.infoPrivee(t('automod.mots_vide')));

      return interaction.reply(C.envoiPrive([C.conteneur([
        C.texte(`## ${E('drapeau')} ${t('automod.mots_titre', { n: nombre(mots.length) })}`),
        // tronquer garde le bloc sous les 4000 caracteres imposes par V2.
        C.texte(tronquer(mots.map((m) => `\`${m}\``).join(' · '), C.MAX_TEXTE)),
      ], conf.couleurs.principale)]));
    }

    // ----------------------------------------------------- EXEMPTIONS
    if (groupe === 'exempt') {
      if (sous === 'list') {
        const salons = req.exclusions.all(guildId, 'automod_salon').map((e) => `<#${e.cible_id}>`);
        const roles = req.exclusions.all(guildId, 'automod_role').map((e) => `<@&${e.cible_id}>`);
        return interaction.reply(C.envoi([C.conteneur([
          C.texte(`## ${E('bouclier')} ${t('automod.exemptions_titre')}`),
          C.texte(`**${t('automod.exemptions_salons')}**\n${salons.join(', ') || t('commun.aucun')}`),
          C.texte(`**${t('automod.exemptions_roles')}**\n${roles.join(', ') || t('commun.aucun')}`),
          C.texte(`-# ${t('automod.exemptions_note')}`),
        ], conf.couleurs.principale)]));
      }

      const salon = interaction.options.getChannel('channel');
      const role = interaction.options.getRole('role');
      if (!salon && !role) {
        return interaction.reply(C.erreurPrivee(t('automod.exemption_cible_manquante')));
      }

      const action = sous === 'add' ? req.ajouterExclusion : req.retirerExclusion;
      if (salon) action.run(guildId, 'automod_salon', salon.id);
      if (role) action.run(guildId, 'automod_role', role.id);

      const cibles = [salon && `${salon}`, role && `${role}`].filter(Boolean).join(` ${t('automod.et')} `);
      return interaction.reply(C.succes(
        t(sous === 'add' ? 'automod.exemption_ajoutee' : 'automod.exemption_retiree', { cibles })
      ));
    }

    // ------------------------------------------------------- MODULES
    if (sous === 'enable' || sous === 'disable') {
      majConfig(guildId, { automod_actif: sous === 'enable' ? 1 : 0 });
      return interaction.reply(C.succes(t(sous === 'enable' ? 'automod.active' : 'automod.desactive')));
    }

    if (sous === 'module') {
      const nom = interaction.options.getString('name');
      const actif = interaction.options.getBoolean('enabled');
      majConfig(guildId, { [MODULES[nom].colonne]: actif ? 1 : 0 });
      return interaction.reply(C.succes(
        t(actif ? 'automod.module_actif' : 'automod.module_inactif', { module: t(`automod.mod.${nom}`) })
      ));
    }

    // --------------------------------------------------------- ETAT
    const cfg = config(guildId);
    const lignes = Object.entries(MODULES).map(([cle, m]) =>
      `${cfg[m.colonne] ? E('succes') : E('erreur')} ${t(`automod.mod.${cle}`)}`);

    return interaction.reply(C.envoi([C.conteneur([
      C.texte(`## ${E('robot')} ${t('automod.etat_titre')}`),
      C.texte(
        `**${cfg.automod_actif ? `${E('succes')} ${t('automod.etat_general_actif')}` : `${E('erreur')} ${t('automod.etat_general_inactif')}`}**`
        + `\n\n${lignes.join('\n')}`
      ),
      C.separateur(),
      C.texte(`**${t('automod.etat_seuils_titre')}**\n` + [
        t('automod.etat_seuil_spam', { n: conf.automod.spamMessages, secondes: conf.automod.spamFenetreSecondes }),
        t('automod.etat_seuil_repetitions', { n: conf.automod.repetitionMax }),
        t('automod.etat_seuil_mentions', { n: conf.automod.mentionsMax }),
        t('automod.etat_seuil_majuscules', { n: conf.automod.majusculesPourcentMax }),
      ].join('\n')),
      C.texte(`**${t('automod.etat_sanction_titre')}**\n${t('automod.etat_sanction_valeur', {
        n: conf.automod.seuilAvertissements,
        minutes: conf.automod.fenetreAvertissementsMinutes,
        mute: conf.automod.dureeMuteAutoMinutes,
      })}`),
      C.texte(`**${t('automod.etat_mots_titre')}**\n${t('automod.etat_mots_valeur', { n: req.mots.all(guildId).length })}`),
    ], cfg.automod_actif ? conf.couleurs.succes : conf.couleurs.erreur)]));
  },
};
