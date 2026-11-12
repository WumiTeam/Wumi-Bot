const { SlashCommandBuilder, PermissionFlagsBits, InteractionContextType } = require('discord.js');
const conf = require('../../../config');
const { req } = require('../../database/db');
const { infosNiveau, xpTotalPourNiveau, appliquerRecompenses } = require('../../utils/niveaux');
const { ts } = require('../../utils/outils');
const { E } = require('../../utils/emojis');
const C = require('../../utils/composants');
const { traducteur, localisations, t: tr, DEFAUT } = require('../../utils/langues');

module.exports = {
  categorie: 'niveau',

  data: new SlashCommandBuilder()
    .setName('xp')
    .setDescription(tr('xp.description_commande', DEFAUT))
    .setDescriptionLocalizations(localisations('xp.description_commande'))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setContexts(InteractionContextType.Guild)
    .addSubcommand((s) => s
      .setName('ajouter')
      .setNameLocalizations({ 'en-US': 'add' })
      .setDescription(tr('xp.sous_ajouter', DEFAUT))
      .setDescriptionLocalizations(localisations('xp.sous_ajouter'))
      .addUserOption((o) => o
        .setName('member')
        .setNameLocalizations({ fr: 'membre' })
        .setDescription(tr('xp.opt_membre', DEFAUT))
        .setDescriptionLocalizations(localisations('xp.opt_membre'))
        .setRequired(true))
      .addIntegerOption((o) => o
        .setName('amount')
        .setNameLocalizations({ fr: 'montant' })
        .setDescription(tr('xp.opt_montant', DEFAUT))
        .setDescriptionLocalizations(localisations('xp.opt_montant'))
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(100_000_000))
    )
    .addSubcommand((s) => s
      .setName('retirer')
      .setNameLocalizations({ 'en-US': 'remove' })
      .setDescription(tr('xp.sous_retirer', DEFAUT))
      .setDescriptionLocalizations(localisations('xp.sous_retirer'))
      .addUserOption((o) => o
        .setName('member')
        .setNameLocalizations({ fr: 'membre' })
        .setDescription(tr('xp.opt_membre', DEFAUT))
        .setDescriptionLocalizations(localisations('xp.opt_membre'))
        .setRequired(true))
      .addIntegerOption((o) => o
        .setName('amount')
        .setNameLocalizations({ fr: 'montant' })
        .setDescription(tr('xp.opt_montant', DEFAUT))
        .setDescriptionLocalizations(localisations('xp.opt_montant'))
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(100_000_000))
    )
    .addSubcommand((s) => s
      .setName('definir')
      .setNameLocalizations({ 'en-US': 'set' })
      .setDescription(tr('xp.sous_definir', DEFAUT))
      .setDescriptionLocalizations(localisations('xp.sous_definir'))
      .addUserOption((o) => o
        .setName('member')
        .setNameLocalizations({ fr: 'membre' })
        .setDescription(tr('xp.opt_membre', DEFAUT))
        .setDescriptionLocalizations(localisations('xp.opt_membre'))
        .setRequired(true))
      .addIntegerOption((o) => o
        .setName('amount')
        .setNameLocalizations({ fr: 'montant' })
        .setDescription(tr('xp.opt_montant_total', DEFAUT))
        .setDescriptionLocalizations(localisations('xp.opt_montant_total'))
        .setRequired(true)
        .setMinValue(0)
        .setMaxValue(100_000_000))
    )
    .addSubcommand((s) => s
      .setName('niveau')
      .setNameLocalizations({ 'en-US': 'level' })
      .setDescription(tr('xp.sous_niveau', DEFAUT))
      .setDescriptionLocalizations(localisations('xp.sous_niveau'))
      .addUserOption((o) => o
        .setName('member')
        .setNameLocalizations({ fr: 'membre' })
        .setDescription(tr('xp.opt_membre', DEFAUT))
        .setDescriptionLocalizations(localisations('xp.opt_membre'))
        .setRequired(true))
      .addIntegerOption((o) => o
        .setName('level')
        .setNameLocalizations({ fr: 'niveau' })
        .setDescription(tr('xp.opt_niveau_vise', DEFAUT))
        .setDescriptionLocalizations(localisations('xp.opt_niveau_vise'))
        .setRequired(true)
        .setMinValue(0)
        .setMaxValue(500))
    )
    .addSubcommand((s) => s
      .setName('reset')
      .setDescription(tr('xp.sous_reset', DEFAUT))
      .setDescriptionLocalizations(localisations('xp.sous_reset'))
      .addUserOption((o) => o
        .setName('member')
        .setNameLocalizations({ fr: 'membre' })
        .setDescription(tr('xp.opt_membre', DEFAUT))
        .setDescriptionLocalizations(localisations('xp.opt_membre'))
        .setRequired(true))
    )
    .addSubcommand((s) => s
      .setName('reset-serveur')
      .setNameLocalizations({ 'en-US': 'reset-server' })
      .setDescription(tr('xp.sous_reset_serveur', DEFAUT))
      .setDescriptionLocalizations(localisations('xp.sous_reset_serveur')))
    .addSubcommandGroup((g) => g
      .setName('recompense')
      .setNameLocalizations({ 'en-US': 'reward' })
      .setDescription(tr('xp.groupe_recompense', DEFAUT))
      .setDescriptionLocalizations(localisations('xp.groupe_recompense'))
      .addSubcommand((s) => s
        .setName('ajouter')
        .setNameLocalizations({ 'en-US': 'add' })
        .setDescription(tr('xp.recompense_sous_ajouter', DEFAUT))
        .setDescriptionLocalizations(localisations('xp.recompense_sous_ajouter'))
        .addIntegerOption((o) => o
          .setName('level')
          .setNameLocalizations({ fr: 'niveau' })
          .setDescription(tr('xp.recompense_opt_niveau', DEFAUT))
          .setDescriptionLocalizations(localisations('xp.recompense_opt_niveau'))
          .setRequired(true)
          .setMinValue(1))
        .addRoleOption((o) => o
          .setName('role')
          .setDescription(tr('xp.recompense_opt_role', DEFAUT))
          .setDescriptionLocalizations(localisations('xp.recompense_opt_role'))
          .setRequired(true))
      )
      .addSubcommand((s) => s
        .setName('retirer')
        .setNameLocalizations({ 'en-US': 'remove' })
        .setDescription(tr('xp.recompense_sous_retirer', DEFAUT))
        .setDescriptionLocalizations(localisations('xp.recompense_sous_retirer'))
        .addIntegerOption((o) => o
          .setName('level')
          .setNameLocalizations({ fr: 'niveau' })
          .setDescription(tr('xp.recompense_opt_niveau_retirer', DEFAUT))
          .setDescriptionLocalizations(localisations('xp.recompense_opt_niveau_retirer'))
          .setRequired(true)
          .setMinValue(1))
      )
      .addSubcommand((s) => s
        .setName('liste')
        .setNameLocalizations({ 'en-US': 'list' })
        .setDescription(tr('xp.recompense_sous_liste', DEFAUT))
        .setDescriptionLocalizations(localisations('xp.recompense_sous_liste')))
    )

    // ------------------------------------------------------- MULTIPLICATEURS
    .addSubcommandGroup((g) => g
      .setName('bonus')
      .setDescription(tr('xp.groupe_bonus', DEFAUT))
      .setDescriptionLocalizations(localisations('xp.groupe_bonus'))
      .addSubcommand((s) => s
        .setName('definir')
        .setNameLocalizations({ 'en-US': 'set' })
        .setDescription(tr('xp.bonus_sous_definir', DEFAUT))
        .setDescriptionLocalizations(localisations('xp.bonus_sous_definir'))
        .addRoleOption((o) => o
          .setName('role')
          .setDescription(tr('xp.bonus_opt_role', DEFAUT))
          .setDescriptionLocalizations(localisations('xp.bonus_opt_role'))
          .setRequired(true))
        .addNumberOption((o) => o
          .setName('multiplier')
          .setNameLocalizations({ fr: 'multiplicateur' })
          .setDescription(tr('xp.bonus_opt_multiplicateur', DEFAUT))
          .setDescriptionLocalizations(localisations('xp.bonus_opt_multiplicateur'))
          .setRequired(true)
          .setMinValue(0.1)
          .setMaxValue(10))
      )
      .addSubcommand((s) => s
        .setName('retirer')
        .setNameLocalizations({ 'en-US': 'remove' })
        .setDescription(tr('xp.bonus_sous_retirer', DEFAUT))
        .setDescriptionLocalizations(localisations('xp.bonus_sous_retirer'))
        .addRoleOption((o) => o
          .setName('role')
          .setDescription(tr('xp.bonus_opt_role_retirer', DEFAUT))
          .setDescriptionLocalizations(localisations('xp.bonus_opt_role_retirer'))
          .setRequired(true))
      )
      .addSubcommand((s) => s
        .setName('liste')
        .setNameLocalizations({ 'en-US': 'list' })
        .setDescription(tr('xp.bonus_sous_liste', DEFAUT))
        .setDescriptionLocalizations(localisations('xp.bonus_sous_liste')))
    )

    // ------------------------------------------------------------ EVENEMENT
    .addSubcommandGroup((g) => g
      .setName('evenement')
      .setNameLocalizations({ 'en-US': 'event' })
      .setDescription(tr('xp.groupe_evenement', DEFAUT))
      .setDescriptionLocalizations(localisations('xp.groupe_evenement'))
      .addSubcommand((s) => s
        .setName('lancer')
        .setNameLocalizations({ 'en-US': 'start' })
        .setDescription(tr('xp.evenement_sous_lancer', DEFAUT))
        .setDescriptionLocalizations(localisations('xp.evenement_sous_lancer'))
        .addIntegerOption((o) => o
          .setName('hours')
          .setNameLocalizations({ fr: 'heures' })
          .setDescription(tr('xp.evenement_opt_heures', DEFAUT))
          .setDescriptionLocalizations(localisations('xp.evenement_opt_heures'))
          .setRequired(true)
          .setMinValue(1)
          .setMaxValue(168))
      )
      .addSubcommand((s) => s
        .setName('arreter')
        .setNameLocalizations({ 'en-US': 'stop' })
        .setDescription(tr('xp.evenement_sous_arreter', DEFAUT))
        .setDescriptionLocalizations(localisations('xp.evenement_sous_arreter')))
      .addSubcommand((s) => s
        .setName('etat')
        .setNameLocalizations({ 'en-US': 'status' })
        .setDescription(tr('xp.evenement_sous_etat', DEFAUT))
        .setDescriptionLocalizations(localisations('xp.evenement_sous_etat')))
    ),

  async execute(interaction) {
    const { t, nombre } = traducteur(interaction);
    const groupe = interaction.options.getSubcommandGroup(false);
    const sous = interaction.options.getSubcommand();
    const guildId = interaction.guild.id;

    // ---------------------------------------------------- MULTIPLICATEURS
    if (groupe === 'bonus') {
      const progression = require('../../utils/progression');

      if (sous === 'definir') {
        const role = interaction.options.getRole('role');
        const valeur = interaction.options.getNumber('multiplier');
        req.definirMultiplicateur.run(guildId, role.id, valeur);
        return interaction.reply(C.succes(t('xp.bonus_defini', { role, multiplicateur: nombre(valeur) })));
      }

      if (sous === 'retirer') {
        const role = interaction.options.getRole('role');
        req.retirerMultiplicateur.run(guildId, role.id);
        return interaction.reply(C.succes(t('xp.bonus_retire', { role })));
      }

      const regles = req.multiplicateurs.all(guildId);
      const evenement = progression.evenementActif(guildId);
      const etatEvenement = evenement.actif
        ? t('xp.bonus_evenement_oui', {
            multiplicateur: nombre(conf.progression.doubleXp.multiplicateur),
            detail: evenement.manuel ? t('xp.bonus_evenement_manuel') : t('xp.bonus_evenement_auto'),
          })
        : t('xp.bonus_evenement_non');

      const elements = [
        C.texte(`## ${t('xp.bonus_titre')}`),
        C.texte(regles.length
          ? regles
              .sort((a, b) => b.multiplicateur - a.multiplicateur)
              .map((r) => t('xp.bonus_ligne', { role: `<@&${r.role_id}>`, multiplicateur: nombre(r.multiplicateur) }))
              .join('\n')
          : t('xp.bonus_aucun')),
        C.separateur(),
        C.texte(
          `**${t('xp.bonus_autres_titre')}**\n`
          + [
            t('xp.bonus_global', { multiplicateur: nombre(conf.xp.multiplicateur) }),
            t('xp.bonus_evenement_ligne', { etat: etatEvenement }),
            t('xp.bonus_prestige', { n: nombre(Math.round(conf.progression.prestige.bonusXpParEtoile * 100)) }),
            t('xp.bonus_objets'),
          ].join('\n')
        ),
      ];
      return interaction.reply(C.envoi([C.conteneur(elements)]));
    }

    // ---------------------------------------------------------- EVENEMENT
    if (groupe === 'evenement') {
      const progression = require('../../utils/progression');

      if (sous === 'lancer') {
        const heures = interaction.options.getInteger('hours');
        const jusqua = progression.lancerEvenement(guildId, heures);
        return interaction.reply(C.envoi([C.conteneur([
          C.texte(`## ${E('niveaux')} ${t('xp.evenement_lance_titre')}`),
          C.texte(t('xp.evenement_lance_desc', {
            multiplicateur: nombre(conf.progression.doubleXp.multiplicateur),
            jusquaF: ts(jusqua, 'F'),
            jusquaR: ts(jusqua, 'R'),
          })),
        ], conf.couleurs.succes)]));
      }

      if (sous === 'arreter') {
        progression.arreterEvenement(guildId);
        return interaction.reply(C.succes(t('xp.evenement_arrete')));
      }

      const etat = progression.evenementActif(guildId);
      return interaction.reply(C.info(
        etat.actif
          ? etat.manuel
            ? t('xp.evenement_etat_manuel', { jusquaF: ts(etat.jusqua, 'F'), jusquaR: ts(etat.jusqua, 'R') })
            : t('xp.evenement_etat_auto')
          : t('xp.evenement_etat_aucun')
      ));
    }

    // ------------------------------------------------------- RECOMPENSES
    if (groupe === 'recompense') {
      if (sous === 'ajouter') {
        const niveau = interaction.options.getInteger('level');
        const role = interaction.options.getRole('role');

        if (role.managed) {
          return interaction.reply(C.erreurPrivee(t('xp.recompense_role_gere')));
        }
        if (role.position >= interaction.guild.members.me.roles.highest.position) {
          return interaction.reply(C.erreurPrivee(t('xp.recompense_role_trop_haut', { role })));
        }

        req.ajouterRecompense.run(guildId, niveau, role.id);
        return interaction.reply(C.succes(t('xp.recompense_ajoutee', { role, niveau: nombre(niveau) })));
      }

      if (sous === 'retirer') {
        const niveau = interaction.options.getInteger('level');
        const res = req.retirerRecompense.run(guildId, niveau);
        return interaction.reply(
          res.changes
            ? C.succes(t('xp.recompense_retiree', { niveau: nombre(niveau) }))
            : C.erreurPrivee(t('xp.recompense_aucune_a_ce_niveau', { niveau: nombre(niveau) }))
        );
      }

      const liste = req.recompenses.all(guildId);
      if (!liste.length) {
        return interaction.reply(C.info(t('xp.recompense_vide')));
      }
      return interaction.reply(C.envoi([C.conteneur([
        C.texte(`## ${E('cadeau')} ${t('xp.recompense_titre')}`),
        C.texte(liste.map((r) => t('xp.recompense_ligne', { niveau: nombre(r.niveau), role: `<@&${r.role_id}>` })).join('\n')),
      ])]));
    }

    // -------------------------------------------------------- RESET SERVEUR
    if (sous === 'reset-serveur') {
      const res = req.resetXpGuild.run(guildId);
      return interaction.reply(C.succes(t('xp.reset_serveur_fait', { n: res.changes })));
    }

    // ------------------------------------------------------------- MEMBRE
    const cible = interaction.options.getUser('member');
    if (cible.bot) {
      return interaction.reply(C.erreurPrivee(t('xp.bots_pas_xp')));
    }

    const actuel = req.getXp.get(guildId, cible.id)?.xp ?? 0;
    let nouveau = actuel;

    switch (sous) {
      case 'ajouter':
        nouveau = actuel + interaction.options.getInteger('amount');
        break;
      case 'retirer':
        nouveau = Math.max(0, actuel - interaction.options.getInteger('amount'));
        break;
      case 'definir':
        nouveau = interaction.options.getInteger('amount');
        break;
      case 'niveau':
        nouveau = xpTotalPourNiveau(interaction.options.getInteger('level'));
        break;
      case 'reset':
        req.supprimerXp.run(guildId, cible.id);
        return interaction.reply(C.succes(t('xp.reset_fait', { membre: cible })));
      default:
        return;
    }

    req.setXp.run(guildId, cible.id, nouveau);
    const infos = infosNiveau(nouveau);

    const membre = await interaction.guild.members.fetch(cible.id).catch(() => null);
    if (membre) await appliquerRecompenses(membre, infos.niveau).catch(() => null);

    return interaction.reply(C.succes(t('xp.mis_a_jour', {
      membre: cible,
      avant: nombre(actuel),
      apres: nombre(nouveau),
      niveau: nombre(infos.niveau),
    })));
  },
};
