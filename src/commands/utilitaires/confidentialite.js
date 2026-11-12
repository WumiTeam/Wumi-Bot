/**
 * /confidentialite — voir et effacer ce que le bot sait de toi.
 *
 * Sur un bot prive, on connait l'auteur et on lui fait confiance. Sur un bot
 * public, personne ne connait personne : il faut pouvoir VERIFIER, pas
 * seulement lire une promesse. D'ou `voir`, qui compte les lignes reellement
 * presentes en base, et `effacer`, qui les retire.
 *
 * Discord demande aussi une politique de confidentialite pour verifier une
 * application. Celle-ci est dans CONFIDENTIALITE.md ; la commande en donne le
 * resume utile, en jeu.
 *
 * AUCUNE REGLE D'EFFACEMENT NE CHANGE ICI. Les sanctions et les signalements
 * restent hors de portee de `/confidentialite effacer`, exactement comme
 * avant — c'est ecrit dans CONFIDENTIALITE.md.
 */
const {
  SlashCommandBuilder,
  InteractionContextType,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
} = require('discord.js');
const conf = require('../../../config');
const { donneesMembre, supprimerMembre } = require('../../database/db');
const { E } = require('../../utils/emojis');
const C = require('../../utils/composants');
const capacites = require('../../utils/capacites');
const { traducteur, localisations, t: tr, DEFAUT } = require('../../utils/langues');

/** Les noms de table -> cle de traduction, pour ne pas afficher du jargon de base. */
const TABLES = [
  'xp', 'economie', 'inventaire', 'achats', 'effets', 'badges', 'missions', 'missions_bonus',
  'membre_heures', 'membre_salons', 'rank_themes', 'rank_choix', 'cartes_perso', 'tickets',
  'suggestions', 'suggestions_votes', 'candidatures', 'appels', 'invitations', 'invitations_arrivees',
  'premiers_messages', 'anniversaires', 'giveaway_participants', 'sanctions', 'signalements',
];
/** Libelles lisibles, en francais — gardes pour compatibilite (voir plus bas). */
const LIBELLES = Object.fromEntries(TABLES.map((table) => [table, tr(`confidentialite.tables.${table}`, DEFAUT)]));

function vueDonnees(interaction) {
  const { t } = traducteur(interaction);
  const lignes = donneesMembre(interaction.guild.id, interaction.user.id);
  const total = lignes.reduce((n, l) => n + l.lignes, 0);

  if (!total) {
    return C.envoiPrive([C.conteneur([
      C.texte(`## ${E('securite')} ${t('confidentialite.titre_vue')}`),
      C.texte(t('confidentialite.vide')),
    ])]);
  }

  const elements = [
    C.texte(`## ${E('securite')} ${t('confidentialite.titre_vue')}`),
    C.texte(lignes.map((l) => `• ${TABLES.includes(l.table) ? t(`confidentialite.tables.${l.table}`) : l.table} — **${l.lignes}**`).join('\n')),
    C.separateur(),
    C.texte(`**${E('info')} ${t('confidentialite.champ_pas_garde_titre')}**\n${t('confidentialite.champ_pas_garde_valeur')}`),
    C.texte(`**${E('corbeille')} ${t('confidentialite.champ_effacer_titre')}**\n${t('confidentialite.champ_effacer_valeur')}`),
  ];

  if (!capacites.contenuMessages()) {
    elements.push(C.texte(`**${E('avertissement')} ${t('confidentialite.champ_intents_titre')}**\n${t('confidentialite.champ_intents_valeur')}`));
  }

  return C.envoiPrive([C.conteneur(elements)]);
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('privacy')
    .setNameLocalizations({ fr: 'confidentialite' })
    .setDescription(tr('confidentialite.description_commande', DEFAUT))
    .setDescriptionLocalizations(localisations('confidentialite.description_commande'))
    .setContexts(InteractionContextType.Guild)
    .addSubcommand((s) => s
      .setName('view')
      .setNameLocalizations({ fr: 'voir' })
      .setDescription(tr('confidentialite.sous_voir', DEFAUT))
      .setDescriptionLocalizations(localisations('confidentialite.sous_voir')))
    .addSubcommand((s) => s
      .setName('delete')
      .setNameLocalizations({ fr: 'effacer' })
      .setDescription(tr('confidentialite.sous_effacer', DEFAUT))
      .setDescriptionLocalizations(localisations('confidentialite.sous_effacer'))),

  categorie: 'utilitaires',

  async execute(interaction) {
    const { t } = traducteur(interaction);

    if (interaction.options.getSubcommand() === 'view') {
      return interaction.reply(vueDonnees(interaction));
    }

    // Effacer est irreversible : on demande confirmation, et le bouton porte
    // l'identifiant de celui qui a lance la commande.
    const lignes = donneesMembre(interaction.guild.id, interaction.user.id);
    const total = lignes.reduce((n, l) => n + l.lignes, 0);

    if (!total) {
      return interaction.reply(C.infoPrivee(t('confidentialite.effacer_rien')));
    }

    const confirmation = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`conf_oui_${interaction.user.id}`)
        .setLabel(t('confidentialite.bouton_oui'))
        .setStyle(ButtonStyle.Danger)
        .setEmoji(E('corbeille')),
      new ButtonBuilder()
        .setCustomId(`conf_non_${interaction.user.id}`)
        .setLabel(t('commun.annuler'))
        .setStyle(ButtonStyle.Secondary)
    );

    return interaction.reply(C.envoiPrive([
      C.conteneur([
        C.texte(`## ${E('avertissement')} ${t('confidentialite.confirm_titre')}`),
        C.texte(
          t('confidentialite.confirm_intro', { n: total })
          + `\n\n${t('confidentialite.confirm_irreversible')}\n`
          + t('confidentialite.confirm_exception')
        ),
        confirmation,
      ], conf.couleurs.avertissement),
    ]));
  },

  /** Boutons. Route depuis interactionCreate via le prefixe « conf_ ». */
  async gererInteraction(interaction) {
    const { t } = traducteur(interaction);
    const auteurId = interaction.customId.split('_').pop();
    if (interaction.user.id !== auteurId) {
      return interaction.reply(C.erreurPrivee(t('confidentialite.pas_pour_toi')));
    }

    if (interaction.customId.startsWith('conf_non_')) {
      return interaction.update(C.envoi([C.conteneur([
        C.texte(`${E('info')} ${t('confidentialite.annule')}`),
      ])]));
    }

    const efface = supprimerMembre(interaction.guild.id, interaction.user.id);
    const total = efface.reduce((n, e) => n + e.lignes, 0);

    return interaction.update(C.envoi([
      C.conteneur([
        C.texte(`## ${E('succes')} ${t('confidentialite.succes_titre')}`),
        C.texte(
          t('confidentialite.succes_corps', { n: total })
          + `\n\n${t('confidentialite.succes_suite')}`
        ),
      ], conf.couleurs.succes),
    ]));
  },

  // Exportes pour les tests
  LIBELLES,
  vueDonnees,
};
