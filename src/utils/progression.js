/**
 * Multiplicateurs d'XP, week-ends double XP, prestige et badges.
 *
 * Le multiplicateur final est le produit de quatre sources :
 *   config.js (global) x role le plus genereux x evenement x objet en cours.
 * On prend le MEILLEUR role plutot que le produit de tous : sinon un membre
 * cumulant trois roles bonus gagnerait des quantites absurdes.
 */
const conf = require('../../config');
const { req, config } = require('../database/db');
const objets = require('./objets');
const logger = require('./logger');

const PRESTIGE = conf.progression?.prestige ?? {};
const DOUBLE = conf.progression?.doubleXp ?? {};
const BADGES = conf.progression?.badges ?? {};
const JOUR = 86_400_000;

// ------------------------------------------------------------ EVENEMENT XP
/** Heure et jour a Paris, quelle que soit l'heure de la machine. */
function maintenantParis(date = new Date()) {
  const parties = new Intl.DateTimeFormat('fr-FR', {
    timeZone: 'Europe/Paris',
    weekday: 'short',
    hour: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const jour = parties.find((p) => p.type === 'weekday')?.value ?? '';
  const heure = Number(parties.find((p) => p.type === 'hour')?.value ?? 0);
  // "lun.", "mar."... -> 1..7
  const index = ['dim', 'lun', 'mar', 'mer', 'jeu', 'ven', 'sam'].indexOf(jour.slice(0, 3).toLowerCase());
  return { jourSemaine: index, heure };
}

/** Sommes-nous dans un week-end double XP ? */
function weekEndDoubleXp(date = new Date()) {
  if (!DOUBLE.weekEndAutomatique) return false;
  const { jourSemaine, heure } = maintenantParis(date);
  if (jourSemaine === 5) return heure >= (DOUBLE.debutVendrediHeure ?? 18); // vendredi soir
  if (jourSemaine === 6) return true; // samedi
  if (jourSemaine === 0) return heure < (DOUBLE.finDimancheHeure ?? 23); // dimanche
  return false;
}

/** Un evenement double XP est-il en cours (automatique ou lance a la main) ? */
function evenementActif(guildId) {
  try {
    const jusqua = config(guildId).double_xp_jusqu_a ?? 0;
    if (jusqua > Date.now()) return { actif: true, manuel: true, jusqua };
  } catch {
    /* config illisible : on retombe sur l'automatique */
  }
  if (weekEndDoubleXp()) return { actif: true, manuel: false };
  return { actif: false };
}

// ---------------------------------------------------------- MULTIPLICATEUR
/** Meilleur multiplicateur apporte par les roles du membre. */
function multiplicateurRoles(guildId, membre) {
  if (!membre?.roles?.cache) return 1;
  const regles = req.multiplicateurs.all(guildId);
  if (!regles.length) return 1;
  const applicables = regles.filter((r) => membre.roles.cache.has(r.role_id)).map((r) => r.multiplicateur);
  return applicables.length ? Math.max(...applicables) : 1;
}

/** Bonus permanent apporte par les etoiles de prestige. */
function bonusPrestige(guildId, userId) {
  const etoiles = req.getXp.get(guildId, userId)?.prestige ?? 0;
  return 1 + etoiles * (PRESTIGE.bonusXpParEtoile ?? 0);
}

/**
 * Multiplicateur total applique a un gain d'XP, avec le detail.
 * Le detail sert a expliquer au membre d'ou vient son bonus.
 */
function multiplicateur(guildId, userId, membre) {
  const base = conf.xp.multiplicateur ?? 1;
  const roles = multiplicateurRoles(guildId, membre);
  const evenement = evenementActif(guildId);
  const parEvenement = evenement.actif ? (DOUBLE.multiplicateur ?? 2) : 1;
  const parObjet = objets.multiplicateurXp(guildId, userId);
  const parPrestige = bonusPrestige(guildId, userId);

  return {
    total: base * roles * parEvenement * parObjet * parPrestige,
    base,
    roles,
    evenement: parEvenement,
    objet: parObjet,
    prestige: parPrestige,
    evenementManuel: evenement.manuel === true,
  };
}

// ------------------------------------------------------------------ PRESTIGE
/** Le membre peut-il passer un prestige ? */
function peutPrestige(guildId, userId) {
  const cfg = config(guildId);
  if (!cfg.prestige_actif) return { ok: false, raison: 'Le prestige est desactive sur ce serveur.' };

  const ligne = req.getXp.get(guildId, userId);
  if (!ligne) return { ok: false, raison: "Tu n'as pas encore d'XP." };

  const etoiles = ligne.prestige ?? 0;
  if (etoiles >= (PRESTIGE.maximum ?? 10)) {
    return { ok: false, raison: `Tu as atteint le prestige maximum (${PRESTIGE.maximum} étoiles).` };
  }

  const { infosNiveau } = require('./niveaux');
  const niveau = infosNiveau(ligne.xp).niveau;
  const requis = PRESTIGE.niveauRequis ?? 50;
  if (niveau < requis) return { ok: false, raison: `Il faut être **niveau ${requis}** pour passer un prestige (tu es niveau ${niveau}).` };

  return { ok: true, niveau, etoiles };
}

/** Passe un prestige : l'XP repart a zero, l'etoile reste. */
function passerPrestige(guildId, userId) {
  const verif = peutPrestige(guildId, userId);
  if (!verif.ok) return verif;

  req.majPrestige.run(guildId, userId);
  const etoiles = verif.etoiles + 1;
  const monnaie = PRESTIGE.monnaieOfferte ?? 0;
  if (monnaie > 0) require('./economie').crediter(guildId, userId, monnaie);

  return { ok: true, etoiles, monnaie, bonus: Math.round(etoiles * (PRESTIGE.bonusXpParEtoile ?? 0) * 100) };
}

// -------------------------------------------------------------------- BADGES
/** Catalogue complet des badges. */
function listeBadges() {
  return Object.entries(BADGES).map(([cle, b]) => ({ cle, ...b }));
}

/**
 * Badges obtenus par un membre, dans l'ordre d'obtention.
 * Les badges deja gagnes restent en base quand un responsable ferme le
 * systeme : on les cache seulement, et les rouvrir les rend tels quels.
 * Sans ca, les cartes et /profil afficheraient encore des badges alors que
 * `/badges` repond que le systeme est desactive.
 */
function badgesDe(guildId, userId) {
  try {
    if (!config(guildId).badges_actif) return [];
  } catch {
    return [];
  }
  return req.badgesDe
    .all(guildId, userId)
    .map((l) => ({ ...BADGES[l.cle], cle: l.cle, obtenu_le: l.obtenu_le }))
    .filter((b) => b.nom);
}

/**
 * Verifie tous les badges d'un membre et attribue ceux qui sont merites.
 * Renvoie la liste des badges NOUVELLEMENT obtenus, pour pouvoir l'annoncer.
 */
function verifierBadges(guildId, userId, membre = null) {
  try {
    if (!config(guildId).badges_actif) return [];
  } catch {
    return [];
  }

  const ligne = req.getXp.get(guildId, userId);
  const { infosNiveau } = require('./niveaux');

  // Les valeurs sont lues une seule fois, meme si aucun badge ne les utilise :
  // c'est negligeable et ca garde le code lisible.
  const valeurs = {
    messages: ligne?.messages ?? 0,
    vocal: Math.floor((ligne?.secondes_vocal ?? 0) / 60),
    niveau: infosNiveau(ligne?.xp ?? 0).niveau,
    prestige: ligne?.prestige ?? 0,
    invitations: (() => {
      try {
        return require('./invitations').totalDe(guildId, userId).total;
      } catch {
        return 0;
      }
    })(),
    anciennete: membre?.joinedTimestamp ? Math.floor((Date.now() - membre.joinedTimestamp) / JOUR) : 0,
  };

  const nouveaux = [];
  for (const [cle, badge] of Object.entries(BADGES)) {
    const valeur = valeurs[badge.type];
    if (valeur === undefined || valeur < badge.seuil) continue;
    if (req.aLeBadge.get(guildId, userId, cle)) continue;
    req.donnerBadge.run(guildId, userId, cle, Date.now());
    nouveaux.push({ cle, ...badge });
  }
  return nouveaux;
}

/** Lance un evenement double XP pour N heures. */
function lancerEvenement(guildId, heures) {
  const jusqua = Date.now() + heures * 3_600_000;
  require('../database/db').majConfig(guildId, { double_xp_jusqu_a: jusqua });
  logger.info(`Evenement double XP lance sur ${guildId} pour ${heures} h.`);
  return jusqua;
}

/** Arrete l'evenement en cours. */
function arreterEvenement(guildId) {
  require('../database/db').majConfig(guildId, { double_xp_jusqu_a: 0 });
}

module.exports = {
  weekEndDoubleXp,
  evenementActif,
  multiplicateur,
  multiplicateurRoles,
  bonusPrestige,
  peutPrestige,
  passerPrestige,
  listeBadges,
  badgesDe,
  verifierBadges,
  lancerEvenement,
  arreterEvenement,
};
