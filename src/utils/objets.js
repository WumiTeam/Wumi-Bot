/**
 * Objets consommables et effets temporaires.
 *
 * Un objet s'achete en boutique, se range dans l'inventaire, puis s'utilise.
 * L'utilisation pose un "effet" qui expire tout seul au bout d'un moment ;
 * rien n'est jamais applique de facon definitive.
 */
const conf = require('../../config');
const { req, config } = require('../database/db');
const logger = require('./logger');

const OBJETS = conf.economie?.objets ?? {};

/** Catalogue complet, cle comprise. */
function liste() {
  return Object.entries(OBJETS).map(([cle, o]) => ({ cle, ...o }));
}

function parCle(cle) {
  return OBJETS[cle] ? { cle, ...OBJETS[cle] } : null;
}

function existe(cle) {
  return Object.hasOwn(OBJETS, cle);
}

/** Inventaire lisible d'un membre. */
function inventaire(guildId, userId) {
  return req.inventaireDe
    .all(guildId, userId)
    .map((l) => ({ ...parCle(l.objet), quantite: l.quantite }))
    .filter((o) => o.cle);
}

/** Ajoute N exemplaires d'un objet. */
function donner(guildId, userId, cle, quantite = 1) {
  if (!existe(cle)) return false;
  req.ajouterObjet.run(guildId, userId, cle, quantite);
  return true;
}

/** Effets actifs d'un membre. */
function effets(guildId, userId) {
  return req.effetsDe.all(guildId, userId, Date.now());
}

/** Le membre a-t-il un effet de ce type en cours ? */
function aEffet(guildId, userId, type) {
  return effets(guildId, userId).some((e) => e.type === type);
}

/**
 * Multiplicateur d'XP apporte par les objets en cours.
 * Si plusieurs potions se cumulent, on garde la meilleure plutot que de
 * les multiplier entre elles : sinon deux elixirs donneraient x9.
 */
function multiplicateurXp(guildId, userId) {
  const valeurs = effets(guildId, userId)
    .filter((e) => e.type === 'xp_multi')
    .map((e) => Number(e.valeur) || 1);
  return valeurs.length ? Math.max(...valeurs) : 1;
}

/**
 * Utilise un objet de l'inventaire.
 * Renvoie { ok, message } — le message est destine au membre.
 */
function utiliser(guildId, userId, cle) {
  const objet = parCle(cle);
  if (!objet) return { ok: false, message: "Cet objet n'existe pas." };

  const possede = req.objetDe.get(guildId, userId, cle)?.quantite ?? 0;
  if (possede <= 0) return { ok: false, message: `Tu n'as pas de **${objet.nom}** dans ton inventaire.` };

  // Un effet du meme type deja en cours : on evite de gaspiller l'objet.
  if (objet.effet !== 'coupe_file' && aEffet(guildId, userId, objet.effet)) {
    return { ok: false, message: `Tu as deja un effet **${objet.nom}** en cours. Attends qu'il se termine.` };
  }

  req.retirerObjet.run(guildId, userId, cle);
  const expire = Date.now() + (objet.duree ?? 60) * 60_000;
  req.poserEffet.run(guildId, userId, objet.effet, String(objet.valeur ?? ''), expire);

  return { ok: true, objet, expire };
}

/** Nettoie les effets expires et rend les roles de couleur. */
async function purger(client) {
  const expires = req.effetsExpires.all(Date.now());
  for (const effet of expires) {
    try {
      if (effet.type === 'couleur' && effet.valeur) {
        const guild = client?.guilds.cache.get(effet.guild_id);
        const membre = await guild?.members.fetch(effet.user_id).catch(() => null);
        const role = guild?.roles.cache.get(effet.valeur);
        if (membre && role) await membre.roles.remove(role, 'Effet de couleur expire').catch(() => null);
        // Le role n'a plus de porteur : on le supprime pour ne pas encombrer.
        if (role && role.members.size === 0) await role.delete('Role de couleur inutilise').catch(() => null);
      }
    } catch (e) {
      logger.debug('Purge des effets :', e.message);
    }
    req.retirerEffet.run(effet.id);
  }
  req.nettoyerInventaire.run();
}

/** Les objets sont-ils actifs sur ce serveur ? */
function actif(guildId) {
  try {
    return Boolean(config(guildId).objets_actif) && Object.keys(OBJETS).length > 0;
  } catch {
    return false;
  }
}

module.exports = { OBJETS, liste, parCle, existe, inventaire, donner, effets, aEffet, multiplicateurXp, utiliser, purger, actif };
