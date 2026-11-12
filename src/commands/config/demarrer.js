/**
 * /demarrer — la configuration guidee, pour un serveur qui vient d'ajouter le bot.
 *
 * Blueprint a une cinquantaine de commandes et une centaine de reglages. Sur
 * son propre serveur, on prend le temps. Sur un serveur inconnu, personne ne
 * lit une documentation : soit les trois reglages qui comptent sont poses en
 * deux minutes, soit le bot est retire.
 *
 * PARTI PRIS : chaque etape ENREGISTRE tout de suite.
 * L'assistant ne garde aucun etat en memoire, et ne demande pas de « valider »
 * a la fin. Quelqu'un qui s'arrete au milieu garde ce qu'il a deja regle, un
 * redemarrage du bot ne perd rien, et deux personnes peuvent meme lancer
 * l'assistant en meme temps sans se marcher dessus. Un assistant a etat aurait
 * demande une table, un menage des sessions abandonnees, et un bug de plus.
 *
 * Le message est ephemere (visible du seul admin) : on y parle de salons de
 * logs et de moderation, ce n'est pas une conversation publique.
 */
const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  InteractionContextType,
  ChannelSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  ChannelType,
} = require('discord.js');
const conf = require('../../../config');
const C = require('../../utils/composants');
const { config, majConfig } = require('../../database/db');
const { E } = require('../../utils/emojis');
const { permissionsManquantes } = require('../../utils/accueil');
const { traducteur, localisations, t: tr, DEFAUT } = require('../../utils/langues');

/**
 * Les etapes, dans l'ordre. Chacune sait se decrire, lire l'etat actuel et
 * l'ecrire. Ajouter une etape, c'est ajouter un objet ici — le reste suit.
 *
 * Le titre et l'explication ne sont plus dans cette table : ils vivent sous
 * `demarrer.etape.<cle>.*` dans les fichiers de langue, pour que l'assistant
 * parle la langue du serveur.
 */
const ETAPES = [
  { cle: 'bienvenue', emoji: 'salut', colonne: 'salon_bienvenue', type: 'salon' },
  { cle: 'logs', emoji: 'moderation', colonne: 'log_moderation', type: 'salon' },
  { cle: 'xp', emoji: 'niveaux', colonne: 'xp_actif', type: 'oui-non' },
  { cle: 'economie', emoji: 'economie', colonne: 'eco_actif', type: 'oui-non' },
  { cle: 'automod', emoji: 'robot', colonne: 'automod_actif', type: 'oui-non' },
];

/** L'etape suivante, ou null si on est au bout. */
function etapeSuivante(index) {
  return index + 1 < ETAPES.length ? index + 1 : null;
}

/** L'affichage d'une etape. */
function vueEtape(interaction, index) {
  const { t } = traducteur(interaction);
  const etape = ETAPES[index];
  const cfg = config(interaction.guild.id);
  const actuel = cfg[etape.colonne];

  const elements = [
    C.texte(`-# ${t('demarrer.entete', { n: index + 1, total: ETAPES.length })}`),
    C.texte(`## ${E(etape.emoji)} ${t(`demarrer.etape.${etape.cle}.titre`)}`),
    C.texte(t(`demarrer.etape.${etape.cle}.explication`)),
  ];

  if (etape.type === 'salon' && actuel) {
    elements.push(C.texte(`${t('config.actuellement')} <#${actuel}>`));
  } else if (etape.type === 'oui-non') {
    elements.push(C.texte(
      `${t('config.actuellement')} ${actuel ? `${E('succes')} ${t('commun.actif')}` : `${E('erreur')} ${t('commun.inactif')}`}`
    ));
  }

  elements.push(C.separateur());

  // Les identifiants « dem_… » sont dans la table de routage de
  // interactionCreate : ils ne changent pas.
  if (etape.type === 'salon') {
    elements.push(new ActionRowBuilder().addComponents(
      new ChannelSelectMenuBuilder()
        .setCustomId(`dem_salon_${index}`)
        .setPlaceholder(t('config.choisir_salon'))
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        .setMinValues(1)
        .setMaxValues(1)
    ));
  } else {
    elements.push(new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`dem_oui_${index}`)
        .setLabel(t('config.activer'))
        .setStyle(ButtonStyle.Success)
        .setEmoji(E('succes')),
      new ButtonBuilder()
        .setCustomId(`dem_non_${index}`)
        .setLabel(t('demarrer.laisser_desactive'))
        .setStyle(ButtonStyle.Secondary)
        .setEmoji(E('erreur'))
    ));
  }

  elements.push(new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`dem_passer_${index}`)
      .setLabel(etapeSuivante(index) === null ? t('demarrer.terminer') : t('demarrer.passer'))
      .setStyle(ButtonStyle.Secondary)
  ));

  return C.envoiPrive([C.conteneur(elements, conf.couleurs.principale)]);
}

/** Le recapitulatif de fin. */
function vueFin(interaction) {
  const { t } = traducteur(interaction);
  const cfg = config(interaction.guild.id);

  const lignes = ETAPES.map((etape) => {
    const titre = t(`demarrer.etape.${etape.cle}.titre`);
    const valeur = cfg[etape.colonne];
    if (etape.type === 'salon') {
      return valeur
        ? `${E('succes')} **${titre}** — <#${valeur}>`
        : `${E('horsligne')} **${titre}** — ${t('demarrer.non_regle')}`;
    }
    return valeur
      ? `${E('succes')} **${titre}** — ${t('commun.actif')}`
      : `${E('horsligne')} **${titre}** — ${t('commun.inactif')}`;
  });

  const elements = [
    C.texte(`## ${E('succes')} ${t('demarrer.fin_titre')}`),
    C.texte(lignes.join('\n')),
    C.separateur(),
    C.texte(`**${E('info')} ${t('demarrer.suite_titre')}**\n${t('demarrer.suite_valeur')}`),
  ];

  // permissionsManquantes accepte un traducteur : sans lui, les noms de
  // permissions reviendraient dans la langue de repli.
  const manque = permissionsManquantes(interaction.guild, t);
  if (manque.length) {
    elements.push(C.separateur());
    elements.push(C.texte(
      `**${E('avertissement')} ${t('accueil.permissions_titre')}**\n`
      + t('demarrer.permissions_valeur', { liste: manque.join('**, **') })
    ));
  }

  return C.envoiPrive([C.conteneur(elements, conf.couleurs.succes)]);
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setup')
    .setNameLocalizations({ fr: 'demarrer' })
    .setDescription(tr('demarrer.description_commande', DEFAUT))
    .setDescriptionLocalizations(localisations('demarrer.description_commande'))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setContexts(InteractionContextType.Guild),

  categorie: 'config',

  async execute(interaction) {
    return interaction.reply(vueEtape(interaction, 0));
  },

  /** Boutons et menus. Route depuis interactionCreate via le prefixe « dem_ ». */
  async gererInteraction(interaction) {
    // Le message est ephemere : seul celui qui a lance la commande le voit, il
    // n'y a donc personne d'autre a ecarter. Mais la permission, elle, peut
    // avoir ete retiree entre-temps.
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
      const { t } = traducteur(interaction);
      return interaction.reply(C.erreurPrivee(t('demarrer.permission_requise')));
    }

    const [, action, brut] = interaction.customId.split('_');
    const index = Number(brut);
    if (!Number.isInteger(index) || !ETAPES[index]) return null;
    const etape = ETAPES[index];

    // On enregistre tout de suite : rien n'est garde en memoire.
    if (action === 'salon') {
      majConfig(interaction.guild.id, { [etape.colonne]: interaction.values?.[0] ?? null });
    } else if (action === 'oui') {
      majConfig(interaction.guild.id, { [etape.colonne]: 1 });
    } else if (action === 'non') {
      majConfig(interaction.guild.id, { [etape.colonne]: 0 });
    }

    const suivante = etapeSuivante(index);
    return interaction.update(suivante === null ? vueFin(interaction) : vueEtape(interaction, suivante));
  },

  // Exportes pour les tests
  ETAPES,
  vueEtape,
  vueFin,
};
