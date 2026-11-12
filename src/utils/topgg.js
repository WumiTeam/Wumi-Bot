/**
 * top.gg : publier le nombre de serveurs, et savoir qui a vote.
 *
 * top.gg est l'annuaire de bots Discord le plus frequente. Deux choses s'y
 * jouent :
 *   - le NOMBRE DE SERVEURS, qui decide du classement, et qu'il faut publier
 *     soi-meme (top.gg ne le devine pas) ;
 *   - les VOTES, qui se renouvellent toutes les douze heures et font remonter
 *     le bot dans la liste.
 *
 * POURQUOI ON INTERROGE AU LIEU D'ETRE PREVENU
 * top.gg sait prevenir un bot a chaque vote, mais il faut pour cela une
 * adresse publique en HTTPS : port ouvert sur la box, nom de domaine,
 * certificat. Le panneau de Blueprint, lui, est volontairement ferme a
 * l'exterieur. On fait donc l'inverse : c'est le bot qui demande a top.gg
 * « est-ce que cette personne a vote ? » quand elle reclame sa recompense.
 * Rien a ouvrir, rien a exposer.
 *
 * La contrepartie est que le membre doit reclamer lui-meme avec /voter.
 *
 * SANS JETON, TOUT CECI DORT. Le module verifie TOPGG_TOKEN et ne fait rien
 * s'il est absent : un bot qui n'est pas encore sur top.gg fonctionne
 * exactement pareil.
 */
const conf = require('../../config');
const logger = require('./logger');

const BASE = 'https://top.gg/api';

// top.gg limite a 60 requetes par minute sur les routes de bot, et bloque une
// heure en cas de depassement. Une reponse « a vote » reste vraie douze
// heures : la garder une minute suffit largement a absorber les clics repetes.
const CACHE_MS = 60_000;
const cache = new Map(); // userId -> { vote: boolean, jusqua: number }

let minuterie = null;

/** Le jeton, ou null. */
function jeton() {
  const t = String(process.env.TOPGG_TOKEN ?? '').trim();
  return t.length > 20 ? t : null;
}

/** L'identifiant de l'application, indispensable pour toutes les routes. */
function identifiant(client) {
  // Le parenthesage est obligatoire : melanger ?? et || sans parentheses est
  // une erreur de syntaxe en JavaScript, pas un avertissement.
  return client?.user?.id ?? (String(process.env.CLIENT_ID ?? '').trim() || null);
}

/** Est-ce que top.gg est configure ? */
function actif() {
  return jeton() !== null;
}

/** Le lien de vote, a donner aux membres. */
function lienVote(client) {
  const id = identifiant(client);
  return id ? `https://top.gg/bot/${id}/vote` : null;
}

/** Le lien de la page du bot. */
function lienPage(client) {
  const id = identifiant(client);
  return id ? `https://top.gg/bot/${id}` : null;
}

/**
 * Un appel a top.gg, avec un delai maximum.
 * Une panne de top.gg ne doit jamais faire attendre une commande : trois
 * secondes, et on abandonne.
 */
async function appel(chemin, options = {}) {
  const controleur = new AbortController();
  const stop = setTimeout(() => controleur.abort(), 3000);
  try {
    const reponse = await fetch(BASE + chemin, {
      ...options,
      signal: controleur.signal,
      headers: { Authorization: jeton(), 'Content-Type': 'application/json', ...(options.headers ?? {}) },
    });
    if (reponse.status === 429) throw new Error('top.gg limite les appels (429), on reessaiera plus tard');
    if (!reponse.ok) throw new Error(`top.gg a repondu ${reponse.status}`);
    const texte = await reponse.text();
    return texte ? JSON.parse(texte) : {};
  } finally {
    clearTimeout(stop);
  }
}

/**
 * Publie le nombre de serveurs.
 * C'est ce chiffre qui apparait sur la fiche du bot et qui pese dans le
 * classement ; personne ne le met a jour a votre place.
 */
async function publierStats(client) {
  if (!actif()) return false;
  const id = identifiant(client);
  if (!id) return false;

  const totaux = require('./totaux');

  // UN SEUL SHARD PUBLIE. Sinon, chacun enverrait SON compte — huit shards,
  // huit chiffres, chacun valant un huitieme de la verite, et le dernier
  // arrive ecrase les autres. Le bot afficherait donc huit fois moins de
  // serveurs qu'il n'en a, sans qu'aucune erreur ne soit levee.
  if (!totaux.estPremierShard(client)) return false;

  const serveurs = await totaux.serveurs(client);
  try {
    await appel(`/bots/${id}/stats`, {
      method: 'POST',
      body: JSON.stringify({ server_count: serveurs }),
    });
    logger.debug(`top.gg : ${serveurs} serveur(s) publies.`);
    return true;
  } catch (e) {
    logger.avertissement('top.gg :', e.message);
    return false;
  }
}

/**
 * Cette personne a-t-elle vote dans les douze dernieres heures ?
 * @returns {Promise<boolean|null>} null si top.gg est injoignable — a ne PAS
 *   confondre avec false, qui veut dire « elle n'a pas vote ».
 */
async function aVote(userId, client) {
  if (!actif()) return null;
  const id = identifiant(client);
  if (!id) return null;

  const connu = cache.get(String(userId));
  if (connu && connu.jusqua > Date.now()) return connu.vote;

  try {
    const reponse = await appel(`/bots/${id}/check?userId=${encodeURIComponent(userId)}`);
    const vote = Number(reponse?.voted) === 1;
    cache.set(String(userId), { vote, jusqua: Date.now() + CACHE_MS });
    return vote;
  } catch (e) {
    logger.avertissement('top.gg (verification de vote) :', e.message);
    return null;
  }
}

/**
 * Le webhook top.gg vient de signaler un vote : on le retient, /voter n'aura
 * pas besoin de redemander a top.gg pendant la minute qui suit.
 */
function marquerVote(userId) {
  cache.set(String(userId), { vote: true, jusqua: Date.now() + CACHE_MS });
}

/** Oublie ce qu'on savait d'une personne : utile juste apres une recompense. */
function oublier(userId) {
  cache.delete(String(userId));
}

/**
 * Publie le nombre de serveurs au demarrage, puis regulierement.
 * Sans jeton, ne demarre rien du tout.
 */
function demarrer(client) {
  if (!actif()) {
    logger.info('top.gg : pas de jeton, les votes et la publication sont en sommeil.');
    return;
  }
  const minutes = Math.max(15, conf.topgg?.intervalleMinutes ?? 30);
  setTimeout(() => publierStats(client), 20_000); // apres le demarrage
  minuterie = setInterval(() => publierStats(client), minutes * 60_000);
  logger.succes(`top.gg : nombre de serveurs publie toutes les ${minutes} minutes.`);
}

function arreter() {
  if (minuterie) clearInterval(minuterie);
  minuterie = null;
  cache.clear();
}

module.exports = { actif, lienVote, lienPage, publierStats, aVote, oublier, marquerVote, demarrer, arreter, identifiant };
