/**
 * /antiraid — la protection contre les vagues d'arrivees.
 *
 * LES SEUILS NE SONT PAS DANS LA BASE, MAIS DANS config.js.
 * C'est volontaire : un seuil de detection mal regle transforme une soiree
 * d'invitations en expulsion de masse. Le serveur choisit s'il veut la
 * protection et a partir de quel age de compte ; le reste — combien
 * d'arrivees en combien de secondes — reste un reglage d'hebergeur.
 * D'ou la petite ligne « ces seuils se modifient dans config.js » : elle dit
 * ou regarder a celui qui cherche, sans faire croire que c'est cliquable.
 */
const { SlashCommandBuilder, PermissionFlagsBits, InteractionContextType } = require('discord.js');
const conf = require('../../../config');
const C = require('../../utils/composants');
const { config, majConfig } = require('../../database/db');
const { declencherLockdown, leverLockdown } = require('../../utils/antiRaid');
const { E } = require('../../utils/emojis');
const { traducteur, localisations, t: tr, DEFAUT } = require('../../utils/langues');

/** Le nom lisible de l'action appliquee pendant un raid, ou la valeur brute. */
function nomAction(t, existe) {
  const cle = `antiraid.action.${conf.antiRaid.actionPendantRaid}`;
  return existe(cle) ? t(cle) : conf.antiRaid.actionPendantRaid;
}

module.exports = {
  categorie: 'config',

  data: new SlashCommandBuilder()
    .setName('antiraid')
    .setDescription(tr('antiraid.description_commande', DEFAUT))
    .setDescriptionLocalizations(localisations('antiraid.description_commande'))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setContexts(InteractionContextType.Guild)
    .addSubcommand((s) =>
      s
        .setName('enable')
        .setNameLocalizations({ fr: 'activer' })
        .setDescription(tr('antiraid.sous_activer', DEFAUT))
        .setDescriptionLocalizations(localisations('antiraid.sous_activer'))
        .addIntegerOption((o) =>
          o
            .setName('minimum-age')
            .setNameLocalizations({ fr: 'age-minimum' })
            .setDescription(tr('antiraid.opt_age', DEFAUT))
            .setDescriptionLocalizations(localisations('antiraid.opt_age'))
            .setMinValue(0)
            .setMaxValue(365)
        )
    )
    .addSubcommand((s) =>
      s
        .setName('disable')
        .setNameLocalizations({ fr: 'desactiver' })
        .setDescription(tr('antiraid.sous_desactiver', DEFAUT))
        .setDescriptionLocalizations(localisations('antiraid.sous_desactiver'))
    )
    .addSubcommand((s) =>
      s
        .setName('lockdown')
        .setNameLocalizations({ fr: 'verrouiller' })
        .setDescription(tr('antiraid.sous_verrouiller', DEFAUT))
        .setDescriptionLocalizations(localisations('antiraid.sous_verrouiller'))
    )
    .addSubcommand((s) =>
      s
        .setName('unlock')
        .setNameLocalizations({ fr: 'deverrouiller' })
        .setDescription(tr('antiraid.sous_deverrouiller', DEFAUT))
        .setDescriptionLocalizations(localisations('antiraid.sous_deverrouiller'))
    )
    .addSubcommand((s) =>
      s
        .setName('status')
        .setNameLocalizations({ fr: 'etat' })
        .setDescription(tr('antiraid.sous_etat', DEFAUT))
        .setDescriptionLocalizations(localisations('antiraid.sous_etat'))
    ),

  async execute(interaction, client) {
    const { t, existe, nombre } = traducteur(interaction);
    const sous = interaction.options.getSubcommand();
    const guildId = interaction.guild.id;

    if (sous === 'enable') {
      const age = interaction.options.getInteger('minimum-age') ?? 0;
      majConfig(guildId, { antiraid_actif: 1, antiraid_age_min: age });
      return interaction.reply(C.succes(
        `${t('antiraid.active')}\n`
        + `> ${t('antiraid.active_seuil', { n: conf.antiRaid.joinsSeuil, secondes: conf.antiRaid.joinsFenetreSecondes })}\n`
        + `> ${age > 0
          ? t('antiraid.active_age_actif', { duree: t('commun.duree.jour', { n: age }) })
          : t('antiraid.active_age_inactif')}\n`
        + `> ${t('antiraid.active_action', { action: nomAction(t, existe) })}\n`
        + `-# ${t('antiraid.note_config')}`
      ));
    }

    if (sous === 'disable') {
      majConfig(guildId, { antiraid_actif: 0 });
      await leverLockdown(interaction.guild, t('antiraid.raison_desactivation')).catch(() => null);
      return interaction.reply(C.succes(t('antiraid.desactive')));
    }

    if (sous === 'lockdown') {
      await declencherLockdown(interaction.guild, t('antiraid.raison_verrouillage', { moderateur: interaction.user.tag }), client);
      return interaction.reply(C.avertissement(t('antiraid.raid_active')));
    }

    if (sous === 'unlock') {
      const leve = await leverLockdown(interaction.guild, t('antiraid.raison_deverrouillage', { moderateur: interaction.user.tag }));
      // Un serveur qui n'etait pas verrouille : personne d'autre n'a besoin de
      // le savoir, la reponse reste privee.
      return interaction.reply(leve
        ? C.succes(t('antiraid.raid_desactive'))
        : C.infoPrivee(t('antiraid.pas_en_raid')));
    }

    const cfg = config(guildId);
    return interaction.reply(C.envoi([C.conteneur([
      C.texte(`## ${E('bouclier')} ${t('antiraid.etat_titre')}`),
      C.texte([
        `**${t('antiraid.etat_protection')}** — ${cfg.antiraid_actif ? `${E('succes')} ${t('commun.actif')}` : `${E('erreur')} ${t('commun.inactif')}`}`,
        `**${t('antiraid.etat_mode')}** — ${cfg.antiraid_verrouille ? `${E('alerte')} ${t('antiraid.etat_mode_encours')}` : `${E('enligne')} ${t('antiraid.etat_mode_normal')}`}`,
        `**${t('antiraid.etat_age')}** — ${cfg.antiraid_age_min ? t('commun.duree.jour', { n: cfg.antiraid_age_min }) : t('antiraid.etat_age_aucun')}`,
      ].join('\n')),
      C.separateur(),
      C.texte([
        `**${t('antiraid.etat_seuil')}** — ${t('antiraid.etat_seuil_valeur', { n: nombre(conf.antiRaid.joinsSeuil), secondes: conf.antiRaid.joinsFenetreSecondes })}`,
        `**${t('antiraid.etat_action')}** — ${nomAction(t, existe)}`,
        `**${t('antiraid.etat_duree')}** — ${t('commun.duree.minute', { n: conf.antiRaid.dureeLockdownMinutes })}`,
      ].join('\n')),
      C.texte(`-# ${t('antiraid.note_config')}`),
    ], cfg.antiraid_verrouille ? conf.couleurs.erreur : conf.couleurs.principale)]));
  },
};
