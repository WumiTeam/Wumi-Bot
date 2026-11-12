const { Events, MessageFlags } = require('discord.js');
const logger = require('../utils/logger');
const { embeds } = require('../utils/outils');
const fondateur = require('../utils/fondateur');
const { traducteur } = require('../utils/langues');

/** Nom lisible du membre, pour la console. */
const qui = (interaction) => interaction.member?.displayName ?? interaction.user?.username ?? 'inconnu';
/** Nom du salon, sans le diese : la console l'ajoute elle-meme. */
const ou = (interaction) => interaction.channel?.name ?? null;

/**
 * Ce que le membre vient de lancer, ecrit court.
 * Une commande avec groupe et sous-commande donne "/serveur structure auto",
 * ce qui est exactement ce qu'on veut lire dans un journal.
 */
function nomAction(interaction) {
  if (interaction.isChatInputCommand()) {
    const groupe = interaction.options.getSubcommandGroup(false);
    const sous = interaction.options.getSubcommand(false);
    return `/${[interaction.commandName, groupe, sous].filter(Boolean).join(' ')}`;
  }
  if (interaction.isMessageContextMenuCommand() || interaction.isUserContextMenuCommand()) {
    return `clic droit « ${interaction.commandName} »`;
  }
  if (interaction.isButton()) return `bouton ${interaction.customId}`;
  if (interaction.isAnySelectMenu()) return `menu ${interaction.customId}`;
  if (interaction.isModalSubmit()) return `formulaire ${interaction.customId}`;
  return 'interaction';
}

// Chaque prefixe de customId mene a son module. La table remplace la pile de
// `if` d'avant : ajouter un systeme, c'est ajouter une ligne.
const COMPOSANTS = {
  ticket_: () => require('../utils/tickets').gererInteraction,
  sugg_: () => require('../utils/suggestions').gererInteraction,
  cand_: () => require('../utils/candidatures').gererInteraction,
  verif_: () => require('../utils/verification').gererInteraction,
  voc_: () => require('../utils/vocauxTemporaires').gererInteraction,
  faq_: () => require('../utils/faq').gererInteraction,
  sig_: () => require('../utils/signalements').gererInteraction,
  mis_: () => require('../commands/economie/missions').gererInteraction,
  pres_: () => require('../commands/niveau/prestige').gererInteraction,
  app_: () => require('../utils/appels').gererInteraction,
  aide_: () => require('../commands/utilitaires/aide').gererInteraction,
  dem_: () => require('../commands/config/demarrer').gererInteraction,
  cfg_: () => require('../commands/config/config').gererInteraction,
  conf_: () => require('../commands/utilitaires/confidentialite').gererInteraction,
  vote_: () => require('../commands/utilitaires/voter').gererInteraction,
  bl_: () => require('../utils/blocklist').gererInteraction,
  bout_: () => require('../commands/economie/boutique').gererInteraction,
  obj_: () => require('../commands/economie/objet').gererInteraction,
  thm_: () => require('../commands/niveau/theme').gererInteraction,
  gw_: () => require('../utils/giveaways').gererInteraction,
  hist_: () => require('../commands/moderation/historique').gererInteraction,
  glb_: () => require('../commands/niveau/global').gererInteraction,
  // Serveur support : tickets et verification par Activite
  stk_: () => require('../utils/ticketsSupport').gererInteraction,
  svf_: () => require('../utils/verificationSupport').gererInteraction,
  sanc_: () => require('../commands/moderation/sanctions').gererInteraction,
  // Wumi 2.2 : roles-reactions, morpion, createur d'embeds
  rr_: () => require('../utils/rolesReactions').gererInteraction,
  ttt_: () => require('../commands/utilitaires/tictactoe').gererInteraction,
  emb_: () => require('../commands/utilitaires/embed').gererInteraction,
  // Wumi 2.3 : jeux
  p4_: () => require('../commands/utilitaires/puissance4').gererInteraction,
  pdu_: () => require('../commands/utilitaires/pendu').gererInteraction,
  quiz_: () => require('../commands/utilitaires/quiz').gererInteraction,
  aud_: () => require('../utils/audit').gererInteraction,
  mus_: () => require('../commands/musique/musique').gererInteraction,
  evt_: () => require('../utils/evenements').gererInteraction,
  srole_: () => require('../utils/rolesSupport').gererInteraction,
  pet_: () => require('../utils/pets').gererInteraction,
  lfg_: () => require('../utils/lfg').gererInteraction,
  noel_: () => require('../utils/noel').gererInteraction,
  // Wumi 2.11.4 : panneaux idee / bug du serveur support
  sp_: () => require('../utils/panneauxSupport').gererInteraction,
  mm_: () => require('../utils/modmail').gererInteraction,
  sr_: () => require('../utils/sanctionRapide').gererInteraction,
  astro_: () => require('../utils/astroLancer').gererInteraction,
  eco_: () => require('../commands/economie/economie').gererInteraction,
};

/** Le journal des commandes du serveur support (LOG_COMMANDES). */
function journaliser(interaction, ok, debut) {
  try {
    require('../utils/journalSupport').commande({
      action: nomAction(interaction),
      qui: interaction.user?.username ?? '?',
      quiId: interaction.user?.id ?? '?',
      serveur: interaction.guild?.name ?? null,
      serveurId: interaction.guild?.id ?? null,
      ok,
      ms: Date.now() - debut,
    });
  } catch {
    /* le journal est un confort */
  }
}

module.exports = {
  name: Events.InteractionCreate,
  async execute(interaction, client) {
    // -------------------------------------------------- AUTOCOMPLETION
    // Elle part a chaque frappe au clavier : la tracer noierait la console.
    if (interaction.isAutocomplete()) {
      const commande = client.commandes.get(interaction.commandName);
      if (!commande?.autocomplete) return;
      try {
        await commande.autocomplete(interaction);
      } catch (e) {
        logger.erreur(`Autocompletion ${interaction.commandName} :`, e.message);
      }
      return;
    }

    // La langue du serveur, une fois pour toute l'interaction.
    const { t } = traducteur(interaction);

    // ------------------------------------------------------- LISTE NOIRE
    // Avant tout le reste, et pour TOUT ce qui est cliquable : commandes,
    // boutons, menus. Bloquer seulement les commandes laisserait un membre
    // bloque piloter le bot par les boutons, ce qui ne bloque rien du tout.
    const sanction = fondateur.bloque(interaction.user.id);
    if (sanction) {
      return interaction.reply({
        embeds: [embeds.erreur(
          t('erreur.bloque')
          + (sanction.raison ? `\n${t('erreur.bloque_raison', { raison: sanction.raison })}` : '')
        )],
        flags: MessageFlags.Ephemeral,
      }).catch(() => null);
    }

    const debut = Date.now();
    /** Ecrit la ligne de journal, avec la duree si le detail est demande. */
    const tracer = (note = null) => {
      const duree = Date.now() - debut;
      const bout = logger.detailActif() ? [note, `${duree} ms`].filter(Boolean).join(', ') : note;
      logger.action(nomAction(interaction), qui(interaction), ou(interaction), bout);
    };

    // ------------------------------- BOUTONS, MENUS ET FENETRES
    // Les autres composants (pagination du classement) sont pris en charge
    // par leur propre collecteur : on les laisse passer sans rien faire.
    //
    // isAnySelectMenu() ET NON isStringSelectMenu() : Discord compte SIX
    // sortes de menus deroulants, et isStringSelectMenu() n'en reconnait
    // qu'une, celle dont on ecrit les choix a la main. Un menu qui propose les
    // SALONS du serveur — celui de /demarrer — est d'une autre sorte : il
    // n'entrait donc dans aucune branche, personne ne repondait, et Discord
    // affichait « Blueprint n'a pas repondu a temps » au bout de trois
    // secondes. Le bot allait tres bien : il n'avait simplement pas ecoute.
    if (interaction.isButton() || interaction.isAnySelectMenu() || interaction.isModalSubmit()) {
      const prefixe = Object.keys(COMPOSANTS).find((p) => interaction.customId?.startsWith(p));
      if (!prefixe) return;
      try {
        await COMPOSANTS[prefixe]()(interaction, client);
        tracer();
      } catch (erreur) {
        tracer('échec');
        logger.erreur(`Composant ${interaction.customId} :`, erreur);
      }
      return;
    }

    // ----------------------------------------- COMMANDE D'ENTREE DE L'ACTIVITE
    // Quand l'Activite est activee dans le Developer Portal, Discord cree une
    // commande « d'entree » (le bouton du lanceur d'applications). On la
    // traite nous-memes : c'est ce qui permet de refuser tout serveur autre
    // que le serveur support.
    if (interaction.isPrimaryEntryPointCommand?.()) {
      try {
        await require('../utils/verificationSupport').gererEntree(interaction);
        tracer('activité');
      } catch (erreur) {
        tracer('échec');
        logger.erreur('Commande d\'entrée de l\'Activité :', erreur);
      }
      return;
    }

    // Commandes slash et commandes de menu contextuel (clic droit sur un message ou un membre)
    if (!interaction.isChatInputCommand()
      && !interaction.isMessageContextMenuCommand()
      && !interaction.isUserContextMenuCommand()) return;

    const commande = client.commandes.get(interaction.commandName);
    if (!commande) {
      tracer('commande inconnue');
      return interaction.reply({
        embeds: [embeds.erreur(t('erreur.commande_inconnue'))],
        flags: MessageFlags.Ephemeral,
      });
    }

    // Les commandes en beta : serveur support, role Beta-testeur.
    if (commande.beta && !require('../utils/rolesSupport').estBeta(interaction.member)) {
      tracer('beta');
      return interaction.reply({ embeds: [embeds.erreur(t('support.roles.beta_reserve'))], flags: MessageFlags.Ephemeral });
    }

    try {
      await commande.execute(interaction, client);
      tracer();
      journaliser(interaction, true, debut);
    } catch (erreur) {
      tracer('échec');
      journaliser(interaction, false, debut);
      logger.erreur(`Commande ${interaction.commandName} :`, erreur);
      const reponse = {
        embeds: [embeds.erreur(t('erreur.generique'))],
        flags: MessageFlags.Ephemeral,
      };
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(reponse).catch(() => null);
      } else {
        await interaction.reply(reponse).catch(() => null);
      }
    }
  },
};
