/**
 * /diagnostic — le bot dit LUI-MEME ce qui est mal regle.
 *
 * POURQUOI CE FICHIER EXISTE
 * Le probleme le plus frequent qu'un serveur inconnu remonte au support
 * n'est presque jamais un bug : c'est un reglage qui pointe dans le vide. Un
 * salon de bienvenue supprime, un role de niveau range sous celui du bot,
 * une permission retiree en cours de route — rien ne plante, la fonction se
 * contente de ne rien faire, et il faut trois jours a l'administrateur pour
 * comprendre pourquoi. `diagnostiquer()` compare ce que le bot A avec ce dont
 * CHAQUE fonction ACTIVEE a besoin, et le dit tout de suite.
 *
 * CE FICHIER NE REPARE RIEN — il lit, et rend une liste de constats. La mise
 * en forme (traduction, Components V2) vit dans la commande
 * (src/commands/utilitaires/diagnostic.js) ; ici, uniquement des donnees
 * simples (pas d'instances discord.js dans ce qui est renvoye), pour que le
 * test puisse tout verifier sans passer par une interaction Discord.
 */
const { PermissionsBitField } = require('discord.js');
const { config, req } = require('../database/db');
const liens = require('./liens');
const capacites = require('./capacites');
const panneauConfig = require('./panneauConfig');

/**
 * FONCTIONS À MOITIÉ RÉGLÉES — LA TABLE EXPLICITE.
 *
 * La table CATEGORIES de panneauConfig.js dit le TYPE et le NOM de chaque
 * reglage, mais pas lequel a besoin d'un autre pour agir : ce lien-la n'est
 * ecrit nulle part ailleurs. D'ou cette petite table, verifiee ligne par
 * ligne contre le code qui lit vraiment ces colonnes (references ci-dessous)
 * — pas devinee.
 *
 *   id      identifiant stable, pour le test et pour la traduction
 *           (`diagnostic.incomplet_<id>`) ;
 *   signal  cle dont la valeur (texte non vide, ou bool vrai) montre que
 *           l'administrateur a VOULU utiliser la fonction ;
 *   requis  cle indispensable qui, vide, l'empeche d'agir ;
 *   gravite 'bloquant' quand le code lu montre la fonction entierement
 *           coupee sans ce reglage ; 'attention' quand seul un a-cote
 *           (l'organisation, une annonce) est perdu.
 */
const PAIRES_INCOMPLETES = [
  // src/events/guildMemberAdd.js : `if (!cfg.salon_bienvenue) return;` arrive
  // AVANT la lecture de message_bienvenue (qui a pourtant un texte de repli) :
  // un message personnalise sans salon choisi ne part jamais.
  { id: 'bienvenue', signal: 'message_bienvenue', requis: 'salon_bienvenue', gravite: 'bloquant' },
  // src/events/guildMemberRemove.js : meme garde sur salon_aurevoir.
  { id: 'aurevoir', signal: 'message_aurevoir', requis: 'salon_aurevoir', gravite: 'bloquant' },
  // src/utils/verification.js : `if (!cfg.verif_actif || !cfg.verif_role) { ... }`
  // renvoie une erreur a chaque clic tant que les deux ne sont pas la.
  { id: 'verification', signal: 'verif_actif', requis: 'verif_role', gravite: 'bloquant' },
  // src/utils/appels.js : `Boolean(cfg.appel_actif && cfg.appel_salon)` — sans
  // salon, la fonction entiere reste eteinte quoi que dise l'interrupteur.
  { id: 'appels', signal: 'appel_actif', requis: 'appel_salon', gravite: 'bloquant' },
  // src/utils/candidatures.js : `if (!cfg.cand_salon) { ... }` bloque le
  // depot d'une candidature meme quand un role de staff est deja choisi.
  { id: 'candidatures', signal: 'cand_role_staff', requis: 'cand_salon', gravite: 'bloquant' },
  // src/commands/suggestions/suggestion.js : `if (!cfg.suggestion_salon) { ... }`
  // bloque l'envoi d'une suggestion, meme cas de figure.
  { id: 'suggestions', signal: 'suggestion_role_staff', requis: 'suggestion_salon', gravite: 'bloquant' },
  // src/utils/tickets.js : sans categorie, le salon du ticket se cree quand
  // meme, juste a la racine du serveur — genant, pas casse.
  { id: 'tickets', signal: 'ticket_role_staff', requis: 'ticket_categorie', gravite: 'attention' },
];

const NECESSAIRES_SALON = [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages];
const NECESSAIRES_CATEGORIE = [PermissionsBitField.Flags.ManageChannels];

/** Les permissions demandees a l'invitation (liens.js) qui manquent vraiment. */
function permissionsManquantes(moi) {
  return liens.PERMISSIONS.filter((nom) => !moi.permissions.has(PermissionsBitField.Flags[nom]));
}

/**
 * Les roles que le bot doit pouvoir distribuer — recompenses de niveau,
 * objets de boutique, postes de candidature, paliers d'invitations — et
 * qu'il ne pourra PAS donner : trop haut dans la hierarchie, ou gere par une
 * integration (un role de boost, un autre bot...).
 *
 * Un role deja supprime n'est volontairement pas signale ici : c'est un
 * reglage mort, pas un probleme de hierarchie, et ce n'est pas ce que ce
 * point-la du diagnostic a pour metier de trouver.
 */
function rolesTropBas(guild, moi) {
  const plafond = moi.roles.highest.position;
  const sortie = [];

  const verifier = (roleId, source, detail) => {
    if (!roleId) return;
    const role = guild.roles.cache.get(roleId);
    if (!role) return;
    if (role.managed) sortie.push({ roleId, source, detail, raison: 'gere' });
    else if (role.position >= plafond) sortie.push({ roleId, source, detail, raison: 'position' });
  };

  for (const r of req.recompenses.all(guild.id)) verifier(r.role_id, 'niveau', r.niveau);
  for (const r of req.recompensesInvit.all(guild.id)) verifier(r.role_id, 'invitation', r.palier);
  for (const a of req.articles.all(guild.id)) verifier(a.role_id, 'boutique', a.nom);
  for (const c of req.typesCandidatures.all(guild.id)) verifier(c.role_id, 'candidature', c.label);

  return sortie;
}

/**
 * Parcourt tous les reglages de type `salon` et `categorie` de la table
 * CATEGORIES (panneauConfig.js — c'est la source de verite, pas une liste
 * recopiee ici) et separe deux cas bien distincts :
 *   - le salon enregistre n'existe plus (supprime depuis) ;
 *   - il existe, mais le bot n'y a plus le droit d'ecrire (ou, pour une
 *     categorie, plus le droit d'y creer de salon).
 */
function verifierSalons(guild, moi) {
  const cfg = config(guild.id);
  const supprimes = [];
  const illisibles = [];

  for (const categorie of panneauConfig.categoriesDe(guild.id)) {
    for (const reglage of categorie.reglages) {
      if (reglage.type !== 'salon' && reglage.type !== 'categorie') continue;

      const valeur = cfg[reglage.cle];
      if (!valeur) continue;
      // Les valeurs speciales ('actuel', 'mp', 'off'...) ne sont pas des
      // identifiants de salon : rien a verifier pour elles.
      if (reglage.speciaux?.includes(valeur)) continue;

      const salon = guild.channels.cache.get(valeur);
      if (!salon) {
        supprimes.push({ cle: reglage.cle, salonId: valeur });
        continue;
      }

      // Sans acces au membre du bot, impossible de juger des permissions :
      // le salon existe deja, c'est deja ca de verifie.
      if (!moi) continue;
      const necessaires = reglage.type === 'categorie' ? NECESSAIRES_CATEGORIE : NECESSAIRES_SALON;
      if (!salon.permissionsFor(moi)?.has(necessaires)) {
        illisibles.push({ cle: reglage.cle, salonId: valeur });
      }
    }
  }

  return { supprimes, illisibles };
}

/** Les fonctions dont le reglage indispensable est reste vide. Voir PAIRES_INCOMPLETES. */
function fonctionsIncompletes(guild) {
  const cfg = config(guild.id);
  return PAIRES_INCOMPLETES.filter((p) => Boolean(cfg[p.signal]) && !cfg[p.requis]);
}

/**
 * Les intents prives manquants COTE APPLICATION (pas un reglage de serveur :
 * voir src/utils/capacites.js, la meme source que /admin), et si ca concerne
 * vraiment CE serveur. Un administrateur de serveur ne peut rien faire au
 * Developer Portal du bot lui-meme : autant ne le signaler comme bloquant que
 * quand une fonction qu'il a lui-meme activee en depend vraiment.
 */
function intentsConcernes(guild) {
  const resume = capacites.resume();
  if (resume.complet) return null;

  const cfg = config(guild.id);
  const utiliseMembres = Boolean(
    cfg.salon_bienvenue || cfg.salon_aurevoir || cfg.mp_bienvenue || cfg.invitations_actif || cfg.antiraid_actif
  );
  const utiliseContenu = Boolean(cfg.automod_actif || cfg.faq_actif);

  const concerne = resume.manquants.filter(
    (m) => (m === 'membres' && utiliseMembres) || (m === 'contenuMessages' && utiliseContenu)
  );

  return { manquants: resume.manquants, concerne };
}

/**
 * Le diagnostic complet d'un serveur.
 *
 * @param {object} guild un Guild discord.js — ou, pour les tests, tout objet
 *   qui en offre la meme forme minimale : `id`, `channels.cache.get(id)`,
 *   `roles.cache.get(id)`, `members.me` (permissions, roles.highest.position).
 * @returns {{bloquant: object[], attention: object[], sain: boolean, roleBotConnu: boolean}}
 *   `sain` est vrai quand rien, dans aucun des deux niveaux, n'a ete trouve.
 */
function diagnostiquer(guild) {
  const moi = guild.members?.me ?? null;
  const bloquant = [];
  const attention = [];

  if (moi) {
    const permissions = permissionsManquantes(moi);
    if (permissions.length) bloquant.push({ categorie: 'permissions', permissions });

    const roles = rolesTropBas(guild, moi);
    if (roles.length) bloquant.push({ categorie: 'role_bas', roles });
  }

  const { supprimes, illisibles } = verifierSalons(guild, moi);
  if (supprimes.length) bloquant.push({ categorie: 'salon_supprime', reglages: supprimes });
  if (illisibles.length) bloquant.push({ categorie: 'salon_illisible', reglages: illisibles });

  for (const paire of fonctionsIncompletes(guild)) {
    (paire.gravite === 'attention' ? attention : bloquant).push({ categorie: 'fonction_incomplete', paire });
  }

  const intents = intentsConcernes(guild);
  if (intents) {
    (intents.concerne.length ? bloquant : attention).push({ categorie: 'intent', ...intents });
  }

  return {
    bloquant,
    attention,
    sain: bloquant.length === 0 && attention.length === 0,
    // Sans le membre du bot, les points 1 et 2 n'ont pas pu tourner : la
    // commande s'en sert pour le dire plutot que de laisser croire que tout
    // va bien.
    roleBotConnu: !!moi,
  };
}

module.exports = {
  PAIRES_INCOMPLETES,
  diagnostiquer,
  permissionsManquantes,
  rolesTropBas,
  verifierSalons,
  fonctionsIncompletes,
  intentsConcernes,
};
