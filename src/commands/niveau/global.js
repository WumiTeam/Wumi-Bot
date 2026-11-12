/**
 * /global — l'XP qui compte partout.
 *
 * Le classement d'un serveur ne vaut que pour lui : c'est ce qui lui donne un
 * sens. Mais quelqu'un qui croise le bot sur cinq serveurs n'avait nulle part
 * la trace de ce qu'il a fait en tout. C'est ce que cette commande montre.
 *
 * CE QU'ELLE NE DIT PAS, ET C'EST VOULU
 * Jamais SUR QUELS serveurs quelqu'un est passe. Le bot ne l'enregistre meme
 * pas : la table ne garde qu'un total. Un classement mondial qui revelerait
 * les serveurs de chacun serait un annuaire de presence, pas un jeu.
 *
 * Le classement montre les pseudos Discord globaux, ceux que tout le monde
 * voit deja en cliquant sur un profil — pas les surnoms de serveur, qui sont
 * propres a un endroit.
 */
const {
  SlashCommandBuilder,
  InteractionContextType,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  MessageFlags,
} = require('discord.js');
const conf = require('../../../config');
const { E } = require('../../utils/emojis');
const C = require('../../utils/composants');
const xpGlobal = require('../../utils/xpGlobal');
const { traducteur, localisations, t: tr, DEFAUT } = require('../../utils/langues');
const { ts, barreProgression } = require('../../utils/outils');

/** Le profil global d'une personne. */
async function vueProfil(interaction, cible) {
  const { t, nombre, duree } = traducteur(interaction);
  const p = xpGlobal.profil(cible.id);

  const elements = [
    C.texte(`## ${E('classement')} ${t('global.titre', { pseudo: cible.username })}`),
  ];

  if (!p.xp) {
    elements.push(C.texte(t('global.vide')));
    return C.envoi([C.conteneur(elements, conf.couleurs.principale)], { flags: MessageFlags.Ephemeral });
  }

  elements.push(
    C.texte([
      `${t('global.niveau')} **${p.niveau}**`
        + (p.rang ? ` · ${t('global.rang', { rang: nombre(p.rang), total: nombre(p.total) })}` : ''),
      `${nombre(p.xp)} ${t('global.xp')}`,
      `\`${barreProgression(p.progression, 16)}\` ${nombre(p.xpActuel)} / ${nombre(p.xpRequis)}`,
    ].join('\n')),
    C.separateur(),
    C.texte([
      `${E('message')} ${nombre(p.messages)} ${t('global.messages')}`,
      `${E('vocal')} ${duree(p.secondesVocal * 1000)} ${t('global.en_vocal')}`,
      p.depuis ? `${E('sablier')} ${t('global.depuis')} ${ts(p.depuis, 'R')}` : null,
    ].filter(Boolean).join('\n')),
    C.texte(`-# ${t('global.jamais_les_serveurs')}`)
  );

  return C.envoi([C.conteneur(elements, conf.couleurs.principale)], { flags: MessageFlags.Ephemeral });
}

/** Le classement mondial. */
async function vueClassement(interaction, client) {
  const { t, nombre } = traducteur(interaction);
  const lignes = xpGlobal.classement(10);

  const elements = [C.texte(`## ${E('premier')} ${t('global.classement_titre')}`)];

  if (!lignes.length) {
    elements.push(C.texte(t('global.classement_vide')));
    return C.envoi([C.conteneur(elements, conf.couleurs.principale)], { flags: MessageFlags.Ephemeral });
  }

  const MEDAILLES = [E('premier'), E('deuxieme'), E('troisieme')];
  const rendus = [];
  for (const [i, l] of lignes.entries()) {
    // Le pseudo public, pas le surnom de serveur : ce classement n'appartient
    // a aucun serveur. Une personne introuvable est sautee plutot qu'affichee
    // comme un numero.
    const utilisateur = await client.users.fetch(l.user_id).catch(() => null);
    if (!utilisateur) continue;
    const place = MEDAILLES[i] ?? `**${i + 1}.**`;
    const infos = xpGlobal.profil(l.user_id);
    rendus.push(`${place} **${utilisateur.username}** — ${t('global.niveau')} ${infos.niveau} · ${nombre(l.xp)} XP`);
  }

  elements.push(C.texte(rendus.join('\n') || t('global.classement_vide')));

  const moi = xpGlobal.profil(interaction.user.id);
  if (moi.rang) elements.push(C.texte(`-# ${t('global.ta_place', { rang: nombre(moi.rang), total: nombre(moi.total) })}`));

  return C.envoi([C.conteneur(elements, conf.couleurs.principale)], { flags: MessageFlags.Ephemeral });
}

module.exports = {
  categorie: 'niveau',

  data: new SlashCommandBuilder()
    .setName('global')
    .setDescription(tr('global.description_commande', DEFAUT))
    .setDescriptionLocalizations(localisations('global.description_commande'))
    .setContexts(InteractionContextType.Guild)
    .addSubcommand((s) =>
      s
        .setName('profil')
        .setNameLocalizations({ 'en-US': 'profile' })
        .setDescription(tr('global.sous_profil', DEFAUT))
        .setDescriptionLocalizations(localisations('global.sous_profil'))
        .addUserOption((o) =>
          o
            .setName('membre')
            .setNameLocalizations({ 'en-US': 'member' })
            .setDescription(tr('global.option_membre', DEFAUT))
            .setDescriptionLocalizations(localisations('global.option_membre'))))
    .addSubcommand((s) =>
      s
        .setName('classement')
        .setNameLocalizations({ 'en-US': 'leaderboard' })
        .setDescription(tr('global.sous_classement', DEFAUT))
        .setDescriptionLocalizations(localisations('global.sous_classement')))
    .addSubcommand((s) =>
      s
        .setName('effacer')
        .setNameLocalizations({ 'en-US': 'erase' })
        .setDescription(tr('global.sous_effacer', DEFAUT))
        .setDescriptionLocalizations(localisations('global.sous_effacer'))),

  async execute(interaction, client) {
    const { t } = traducteur(interaction);
    const sous = interaction.options.getSubcommand();

    if (sous === 'classement') return interaction.reply(await vueClassement(interaction, client));

    if (sous === 'effacer') {
      // Chacun efface le sien, sans demander a personne : ce compteur ne
      // concerne aucun serveur en particulier, donc aucun administrateur.
      const elements = [
        C.texte(`## ${E('corbeille')} ${t('global.effacer_titre')}`),
        C.texte(t('global.effacer_texte')),
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`glb_effacer_${interaction.user.id}`)
            .setLabel(t('global.effacer_confirmer'))
            .setStyle(ButtonStyle.Danger)
        ),
      ];
      return interaction.reply(
        C.envoi([C.conteneur(elements, conf.couleurs.erreur)], { flags: MessageFlags.Ephemeral })
      );
    }

    const cible = interaction.options.getUser('membre') ?? interaction.user;
    return interaction.reply(await vueProfil(interaction, cible));
  },

  /** Le bouton d'effacement. */
  async gererInteraction(interaction) {
    const { t } = traducteur(interaction);
    const userId = interaction.customId.slice('glb_effacer_'.length);

    // Le bouton ne vaut que pour celui qui l'a demande : le message est
    // ephemere, mais un identifiant devinable ne doit pas suffire.
    if (interaction.user.id !== userId) {
      return interaction.reply({ content: t('erreur.pas_pour_toi'), flags: MessageFlags.Ephemeral });
    }

    const efface = xpGlobal.effacer(userId);
    return interaction.update(
      C.envoi([
        C.conteneur([
          C.texte(`${E(efface ? 'succes' : 'info')} ${t(efface ? 'global.efface' : 'global.rien_a_effacer')}`),
        ], efface ? conf.couleurs.succes : conf.couleurs.info),
      ], { flags: MessageFlags.Ephemeral })
    );
  },

  // Exportes pour les tests
  vueProfil,
  vueClassement,
};
