/**
 * /paliers — l'echelle automatique des avertissements de CE serveur.
 *
 *   voir            l'echelle actuelle
 *   definir         « a N avertissements : mute 2h / expulsion / ban / rien »
 *   reinitialiser   revenir a l'echelle par defaut (3 → mute 1 h, 5 → 24 h,
 *                   7 → expulsion, 10 → ban)
 */
const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  InteractionContextType,
} = require('discord.js');
const conf = require('../../../config');
const C = require('../../utils/composants');
const paliers = require('../../utils/paliers');
const { parserDuree } = require('../../utils/outils');
const { E } = require('../../utils/emojis');
const { traducteur, localisations, t: tr, DEFAUT } = require('../../utils/langues');

/** L'echelle ecrite pour etre lue. */
function decrire(echelle, t, enDuree) {
  const lignes = Object.entries(echelle)
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([n, p]) => {
      const action = p.type === 'mute'
        ? `${E('muet')} ${t('paliers.action_mute', { duree: enDuree(p.duree) })}`
        : p.type === 'kick' ? `${E('porte')} ${t('paliers.action_kick')}` : `${E('moderation')} ${t('paliers.action_ban')}`;
      return t('paliers.ligne', { n, action });
    });
  return lignes.length ? lignes.join('\n') : t('paliers.vide');
}

module.exports = {
  categorie: 'moderation',
  decrire,

  data: new SlashCommandBuilder()
    .setName('warnsteps')
    .setNameLocalizations({ fr: 'paliers' })
    .setDescription(tr('paliers.description_commande', DEFAUT))
    .setDescriptionLocalizations(localisations('paliers.description_commande'))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setContexts(InteractionContextType.Guild)
    .addSubcommand((s) => s
      .setName('view')
      .setNameLocalizations({ fr: 'voir' })
      .setDescription(tr('paliers.sous_voir', DEFAUT))
      .setDescriptionLocalizations(localisations('paliers.sous_voir')))
    .addSubcommand((s) => s
      .setName('set')
      .setNameLocalizations({ fr: 'definir' })
      .setDescription(tr('paliers.sous_definir', DEFAUT))
      .setDescriptionLocalizations(localisations('paliers.sous_definir'))
      .addIntegerOption((o) => o
        .setName('warnings')
        .setNameLocalizations({ fr: 'avertissements' })
        .setDescription(tr('paliers.opt_nombre', DEFAUT))
        .setDescriptionLocalizations(localisations('paliers.opt_nombre'))
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(50))
      .addStringOption((o) => o
        .setName('action')
        .setDescription(tr('paliers.opt_action', DEFAUT))
        .setDescriptionLocalizations(localisations('paliers.opt_action'))
        .setRequired(true)
        .addChoices(
          { name: 'Mute', name_localizations: { fr: 'Mute' }, value: 'mute' },
          { name: 'Kick', name_localizations: { fr: 'Expulsion' }, value: 'kick' },
          { name: 'Ban', name_localizations: { fr: 'Bannissement' }, value: 'ban' },
          { name: 'Nothing (remove this step)', name_localizations: { fr: 'Rien (retirer ce palier)' }, value: 'aucune' }
        ))
      .addStringOption((o) => o
        .setName('duration')
        .setNameLocalizations({ fr: 'duree' })
        .setDescription(tr('paliers.opt_duree', DEFAUT))
        .setDescriptionLocalizations(localisations('paliers.opt_duree'))))
    .addSubcommand((s) => s
      .setName('reset')
      .setNameLocalizations({ fr: 'reinitialiser' })
      .setDescription(tr('paliers.sous_reinitialiser', DEFAUT))
      .setDescriptionLocalizations(localisations('paliers.sous_reinitialiser'))),

  async execute(interaction) {
    const { t, duree: enDuree } = traducteur(interaction);
    const sous = interaction.options.getSubcommand();
    const guildId = interaction.guild.id;

    if (sous === 'reset') {
      paliers.reinitialiser(guildId);
      return interaction.reply(C.succes(`${t('paliers.reinitialise')}\n\n${decrire(paliers.lire(guildId), t, enDuree)}`));
    }

    if (sous === 'set') {
      const n = interaction.options.getInteger('warnings');
      const action = interaction.options.getString('action');
      let duree = null;
      if (action === 'mute') {
        const texte = interaction.options.getString('duration');
        duree = texte ? parserDuree(texte) : null;
        if (!duree) return interaction.reply(C.erreurPrivee(t('paliers.duree_requise')));
        if (duree > paliers.MUTE_MAX) return interaction.reply(C.erreurPrivee(t('paliers.duree_trop_longue')));
      }
      const actuels = paliers.lire(guildId);
      if (action !== 'aucune' && !actuels[n] && Object.keys(actuels).length >= paliers.MAX_PALIERS) {
        return interaction.reply(C.erreurPrivee(t('paliers.trop', { max: paliers.MAX_PALIERS })));
      }
      const echelle = paliers.definir(guildId, n, action, duree);
      return interaction.reply(C.succes(`${t(action === 'aucune' ? 'paliers.retire' : 'paliers.defini', { n })}\n\n${decrire(echelle, t, enDuree)}`));
    }

    return interaction.reply(C.envoi([C.conteneur([
      C.texte(`## ${E('avertissement')} ${t('paliers.titre')}`),
      C.texte(decrire(paliers.lire(guildId), t, enDuree)),
      C.separateur(),
      C.texte(`-# ${t('paliers.pied')}`),
    ], conf.couleurs.avertissement)]));
  },
};
