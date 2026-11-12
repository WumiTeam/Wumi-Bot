/**
 * Le premium.
 *
 * DEUX PORTES D'ENTREE, ET C'EST VOULU.
 *
 * 1. L'ABONNEMENT DISCORD (les « entitlements »). C'est celui que tu as
 *    choisi : l'abonnement se paie dans Discord, Discord encaisse et reverse.
 *    Mais Discord ne l'ouvre qu'a une application VERIFIEE, appartenant a une
 *    equipe, avec des conditions et une politique de confidentialite en ligne
 *    et un compte de paiement configure. Tant que ce n'est pas fait, aucun
 *    abonnement ne peut exister — et le code ci-dessous ne trouve rien.
 *
 * 2. L'OCTROI MANUEL. Une commande de fondateur pose un premium sur un serveur
 *    pour une duree donnee. Ca sert des aujourd'hui (remercier un serveur qui
 *    aide, depanner quelqu'un), et ca sert de filet le jour ou un paiement
 *    Discord se perd.
 *
 * Les deux se lisent au meme endroit : `estPremium(guildId)`. Le reste du bot
 * n'a jamais a savoir d'ou vient le droit.
 *
 * POURQUOI UN CACHE
 * Une porte premium peut etre interrogee a chaque message (un multiplicateur
 * d'XP, par exemple). Relire la base a chaque fois serait absurde : on garde
 * la reponse une minute, et toute ecriture vide le cache.
 */
const { db, req } = require('../database/db');
const logger = require('./logger');
const fondateur = require('./fondateur');

const CACHE_MS = 60_000;
const cache = new Map(); // guildId -> { valeur, jusqu_a }

/** L'identifiant du SKU vendu sur Discord, s'il y en a un. */
function sku() {
  return String(process.env.PREMIUM_SKU_ID ?? '').trim() || null;
}

/** Le premium est-il seulement configurable ? */
function actif() {
  return true; // l'octroi manuel marche toujours ; le SKU est un plus
}

function oublier(guildId = null) {
  if (guildId) cache.delete(String(guildId));
  else cache.clear();
}

/**
 * Le premium d'un serveur, tel qu'il est ecrit en base.
 * @returns {{source: string, jusqu_a: number|null, par: string|null}|null}
 */
function ligne(guildId) {
  try {
    return req.premiumDe.get(String(guildId)) ?? null;
  } catch (e) {
    logger.debug('Premium :', e.message);
    return null;
  }
}

/**
 * Ce serveur a-t-il le premium ?
 * Une date de fin passee vaut non — sans qu'on ait besoin d'une tache de
 * menage : la comparaison suffit, et la ligne sera nettoyee plus tard.
 */
function estPremium(guildId) {
  if (!guildId) return false;
  const cle = String(guildId);

  const garde = cache.get(cle);
  if (garde && garde.jusqu_a > Date.now()) return garde.valeur;

  const l = ligne(cle);
  const valeur = Boolean(l) && (l.jusqu_a === null || l.jusqu_a > Date.now());
  cache.set(cle, { valeur, jusqu_a: Date.now() + CACHE_MS });
  return valeur;
}

/** Le detail, pour l'afficher. */
function details(guildId) {
  const l = ligne(guildId);
  if (!l) return { premium: false, source: null, jusqu_a: null };
  const encore = l.jusqu_a === null || l.jusqu_a > Date.now();
  return { premium: encore, source: l.source, jusqu_a: l.jusqu_a, par: l.par };
}

/**
 * Pose un premium.
 * @param {string} guildId
 * @param {object} options
 * @param {string} options.source 'discord' (abonnement) ou 'offert'
 * @param {number|null} options.jusqu_a date de fin, ou null pour sans limite
 */
function accorder(guildId, { source = 'offert', jusqu_a = null, par = null, sku_id = null } = {}) {
  req.poserPremium.run({
    guild_id: String(guildId),
    source,
    jusqu_a,
    par,
    sku_id,
    date: Date.now(),
  });
  oublier(guildId);
  logger.info(`Premium ${source} pose sur ${guildId}${jusqu_a ? ` jusqu'au ${new Date(jusqu_a).toISOString().slice(0, 10)}` : ''}.`);
  return details(guildId);
}

/** Retire le premium. */
function retirer(guildId) {
  const partait = estPremium(guildId);
  req.retirerPremium.run(String(guildId));
  oublier(guildId);
  if (partait) logger.info(`Premium retire de ${guildId}.`);
  return partait;
}

/** Tous les serveurs premium, pour la console du fondateur. */
function liste() {
  try {
    return req.premiums.all(Date.now());
  } catch {
    return [];
  }
}

// ------------------------------------------------------------- DISCORD
/**
 * Lit les abonnements que Discord connait, et les recopie en base.
 *
 * ON NE FAIT CONFIANCE QU'A DISCORD pour la source « discord » : un
 * abonnement disparu chez eux doit disparaitre ici, sinon un serveur garderait
 * son premium apres avoir arrete de payer. Les premiums offerts a la main, eux,
 * ne sont jamais touches par cette synchronisation.
 */
async function synchroniser(client) {
  if (!sku()) return { lus: 0, poses: 0, retires: 0 };

  let entitlements;
  try {
    entitlements = await client.application.entitlements.fetch({ excludeEnded: true });
  } catch (e) {
    logger.avertissement('Premium : impossible de lire les abonnements —', e.message);
    return { lus: 0, poses: 0, retires: 0 };
  }

  const vus = new Set();
  let poses = 0;

  for (const e of entitlements.values()) {
    if (e.skuId !== sku()) continue;
    const guildId = e.guildId;
    if (!guildId) continue; // un abonnement pris par une personne, pas par un serveur
    vus.add(guildId);

    const fin = e.endsTimestamp ?? null;
    const avant = ligne(guildId);
    if (!avant || avant.source !== 'discord' || avant.jusqu_a !== fin) {
      accorder(guildId, { source: 'discord', jusqu_a: fin, sku_id: e.skuId });
      poses++;
    }
  }

  // Ce que Discord ne connait plus et qui vient de lui : on retire.
  let retires = 0;
  for (const l of liste()) {
    if (l.source !== 'discord') continue;
    if (vus.has(l.guild_id)) continue;
    retirer(l.guild_id);
    retires++;
  }

  if (poses || retires) logger.info(`Premium : ${poses} pose(s), ${retires} retire(s) d'apres Discord.`);
  return { lus: vus.size, poses, retires };
}

/**
 * Branche les evenements d'abonnement.
 * Discord previent en direct quand quelqu'un souscrit ou resilie : c'est plus
 * rapide et plus sur que d'attendre le prochain balayage.
 */
function ecouter(client) {
  if (!sku()) return;

  // Le journal du support (LOG_PREMIUM) : qui souscrit, qui part.
  const journaliser = (titre, e, couleur) => {
    try {
      const nom = client.guilds.cache.get(e.guildId)?.name ?? e.guildId;
      require('./journalSupport').noter('premium', {
        titre,
        couleur,
        lignes: [
          `**Serveur** · ${nom} (\`${e.guildId}\`)`,
          e.userId ? `**Membre** · <@${e.userId}> (\`${e.userId}\`)` : null,
          e.endsTimestamp ? `**Fin** · <t:${Math.floor(e.endsTimestamp / 1000)}:R>` : null,
        ],
        pied: `SKU ${e.skuId}`,
      });
    } catch {
      /* le journal est un confort */
    }
  };

  client.on('entitlementCreate', (e) => {
    if (e.skuId !== sku() || !e.guildId) return;
    accorder(e.guildId, { source: 'discord', jusqu_a: e.endsTimestamp ?? null, sku_id: e.skuId });
    journaliser('💎 Nouvel abonnement premium', e, 0xb18cff);
  });

  client.on('entitlementUpdate', (avant, apres) => {
    if (apres.skuId !== sku() || !apres.guildId) return;
    if (apres.deleted) retirer(apres.guildId);
    else accorder(apres.guildId, { source: 'discord', jusqu_a: apres.endsTimestamp ?? null, sku_id: apres.skuId });
  });

  client.on('entitlementDelete', (e) => {
    if (e.skuId !== sku() || !e.guildId) return;
    const l = ligne(e.guildId);
    // Un premium offert a la main survit a la fin d'un abonnement Discord.
    if (l?.source === 'discord') retirer(e.guildId);
    journaliser('💔 Abonnement premium terminé', e, 0xff2860);
  });
}

let minuterie = null;

function demarrer(client) {
  ecouter(client);
  if (!sku()) return;
  // Un balayage de temps en temps rattrape ce qu'un evenement manque (bot
  // eteint au moment de la resiliation, par exemple).
  minuterie = setInterval(() => synchroniser(client).catch(() => null), 30 * 60_000);
  setTimeout(() => synchroniser(client).catch(() => null), 20_000);
}

function arreter() {
  if (minuterie) clearInterval(minuterie);
  minuterie = null;
}

/**
 * Le fondateur a toujours le premium sur ses propres serveurs.
 * Sinon il ne pourrait pas essayer ce qu'il vend.
 */
function estPremiumOuFondateur(guildId, userId) {
  return estPremium(guildId) || fondateur.estFondateur(userId);
}

module.exports = {
  estPremium,
  estPremiumOuFondateur,
  details,
  accorder,
  retirer,
  liste,
  synchroniser,
  ecouter,
  demarrer,
  arreter,
  oublier,
  sku,
  actif,
};
