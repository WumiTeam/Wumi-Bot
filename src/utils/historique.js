/**
 * Tout ce que le bot sait d'un membre, rassemble en une seule lecture.
 *
 * Le bot enregistre des choses sur un membre dans une douzaine de tables. Les
 * consulter demandait jusqu'ici cinq commandes differentes : ce module fait la
 * tournee une bonne fois et rend un objet unique.
 *
 * Chaque bloc est isole : si un systeme n'est pas installe ou si sa table est
 * vide, la fiche affiche simplement rien a cet endroit plutot que d'echouer.
 */
const { req, config } = require('../database/db');
const { infosNiveau, rangDe } = require('./niveaux');
const logger = require('./logger');
const { E } = require('./emojis');

const LIMITE = 5; // elements detailles par section

/** Execute une lecture en avalant les erreurs : une table absente n'a pas a casser la fiche. */
function sur(defaut, lecture) {
  try {
    const r = lecture();
    return r ?? defaut;
  } catch (e) {
    logger.debug('Historique :', e.message);
    return defaut;
  }
}

/** Transforme [{type, n}] en { type: n }. */
function parCle(lignes, cle = 'type') {
  const o = {};
  for (const l of lignes ?? []) o[l[cle]] = l.n;
  return o;
}

/**
 * Rassemble la fiche d'un membre.
 * @param {string} guildId
 * @param {string} userId
 * @param {import('discord.js').GuildMember|null} membre
 */
function rassembler(guildId, userId, membre = null) {
  const cfg = sur({}, () => config(guildId));

  // ------------------------------------------------------------ ACTIVITE
  const ligneXp = sur(null, () => req.getXp.get(guildId, userId));
  const infos = infosNiveau(ligneXp?.xp ?? 0);
  const activite = {
    niveau: infos.niveau,
    xp: ligneXp?.xp ?? 0,
    xpActuel: infos.xpActuel,
    xpRequis: infos.xpRequis,
    rang: ligneXp?.xp ? sur(null, () => rangDe(guildId, ligneXp.xp)) : null,
    totalClasses: sur(0, () => req.totalMembresXp.get(guildId).n),
    messages: ligneXp?.messages ?? 0,
    secondesVocal: ligneXp?.secondes_vocal ?? 0,
    prestige: ligneXp?.prestige ?? 0,
    dernierGain: ligneXp?.dernier_gain ?? 0,
    badges: sur([], () => require('./progression').badgesDe(guildId, userId)),
    heures: sur(new Array(24).fill(0), () => require('./statsMembre').heures(guildId, userId)),
    salons: sur([], () => require('./statsMembre').salons(guildId, userId, 3)),
    theme: sur(null, () => require('./themesRank').themeDe(guildId, userId)?.nom ?? null),
  };
  activite.plage = sur(null, () => require('./statsMembre').plageFavorite(activite.heures));

  // ------------------------------------------------------------ ECONOMIE
  const compte = sur({ solde: 0, banque: 0 }, () => require('./banque').compte(guildId, userId));
  const economie = {
    actif: Boolean(cfg.eco_actif),
    monnaie: sur({ nom: 'pièces', emoji: E('economie') }, () => require('./economie').monnaie(guildId)),
    solde: compte.solde ?? 0,
    banque: compte.banque ?? 0,
    rang: sur(null, () => require('./economie').rang(guildId, compte.solde ?? 0)),
    achats: sur([], () => req.achatsDe.all(guildId, userId)),
    inventaire: sur([], () => require('./objets').inventaire(guildId, userId)),
    effets: sur([], () => require('./objets').effets(guildId, userId)),
  };

  // ---------------------------------------------------------- MODERATION
  const sanctions = sur([], () => req.sanctionsRecentesDe.all(guildId, userId, LIMITE));
  const moderation = {
    sanctions,
    compte: parCle(sur([], () => req.compterSanctionsDe.all(guildId, userId))),
    avertissementsActifs: sur([], () => req.avertissementsActifs.all(guildId, userId)).length,
    appels: sur([], () => req.appelsDe.all(guildId, userId, LIMITE)),
    signalementsRecus: sur(0, () => req.compterSignalementsRecus.get(guildId, userId).n),
    signalementsEmis: sur(0, () => req.signalementsEmis.get(guildId, userId).n),
    // Si la personne fait partie de l'equipe, ce chiffre est le plus parlant
    // de toute la fiche : combien de sanctions elle a prononcees.
    sanctionsPrononcees: sur(0, () => req.sanctionsPrononcees.get(guildId, userId).n),
  };
  moderation.total = Object.values(moderation.compte).reduce((a, b) => a + b, 0);

  // ---------------------------------------------------------- COMMUNAUTE
  const communaute = {
    invitations: sur({ total: 0, vrais: 0, faux: 0, partis: 0, bonus: 0 }, () =>
      require('./invitations').totalDe(guildId, userId)
    ),
    arrivee: sur(null, () => req.arriveeDe.get(guildId, userId)),
    tickets: parCle(sur([], () => req.compterTicketsDe.all(guildId, userId)), 'statut'),
    ticketsRecents: sur([], () => req.ticketsDe.all(guildId, userId, LIMITE)),
    suggestions: parCle(sur([], () => req.compterSuggestionsDe.all(guildId, userId)), 'statut'),
    suggestionsRecentes: sur([], () => req.suggestionsDe.all(guildId, userId, LIMITE)),
    candidatures: sur([], () => req.candidaturesDe.all(guildId, userId, LIMITE)),
    missions: sur(null, () => require('./missions').etat(guildId, userId)),
  };
  communaute.ticketsTotal = Object.values(communaute.tickets).reduce((a, b) => a + b, 0);
  communaute.suggestionsTotal = Object.values(communaute.suggestions).reduce((a, b) => a + b, 0);

  // ------------------------------------------------------------ IDENTITE
  const identite = {
    id: userId,
    pseudo: membre?.displayName ?? null,
    arriveLe: membre?.joinedTimestamp ?? null,
    compteCreeLe: membre?.user?.createdTimestamp ?? null,
    boostDepuis: membre?.premiumSinceTimestamp ?? null,
    roles: membre?.roles?.cache
      ? [...membre.roles.cache.values()]
          .filter((r) => r.id !== guildId)
          .sort((a, b) => b.position - a.position)
          .map((r) => ({ id: r.id, nom: r.name }))
      : [],
  };

  return { identite, activite, economie, moderation, communaute };
}

/**
 * Une phrase qui resume la fiche : ce qu'on lit en premier.
 * Elle dit ce qui merite l'attention, pas ce qui existe.
 */
function resume(fiche) {
  const points = [];
  const m = fiche.moderation;

  if (m.avertissementsActifs >= 3) points.push(`${E('avertissement')} **${m.avertissementsActifs} avertissements actifs**`);
  else if (m.avertissementsActifs) points.push(`${m.avertissementsActifs} avertissement${m.avertissementsActifs > 1 ? 's' : ''} actif${m.avertissementsActifs > 1 ? 's' : ''}`);

  if (m.compte.ban) points.push(`déjà banni ${m.compte.ban} fois`);
  if (m.compte.kick) points.push(`expulsé ${m.compte.kick} fois`);
  if (m.signalementsRecus >= 3) points.push(`${E('avertissement')} **${m.signalementsRecus} de ses messages signalés**`);
  if (m.sanctionsPrononcees) points.push(`a prononcé ${m.sanctionsPrononcees} sanction${m.sanctionsPrononcees > 1 ? 's' : ''}`);
  if (fiche.communaute.invitations.total >= 5) points.push(`${fiche.communaute.invitations.total} membres amenés`);
  if (fiche.activite.prestige) points.push(`prestige ${fiche.activite.prestige}`);

  if (!points.length) {
    return m.total ? 'Rien de particulier à signaler.' : 'Aucun antécédent : ce membre n\'a jamais été sanctionné.';
  }
  return points.join(' · ');
}

module.exports = { rassembler, resume, LIMITE };
