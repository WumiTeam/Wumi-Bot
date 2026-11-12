/**
 * Les totaux du bot, justes meme quand il tourne en plusieurs morceaux.
 *
 * LE PIEGE DU SHARDING, ET IL EST SILENCIEUX.
 * Chaque shard ne connait QUE les serveurs qu'on lui a confies.
 * `client.guilds.cache.size` ne renvoie donc plus le total du bot mais celui
 * du shard : un chiffre plus petit, jamais une erreur, jamais un plantage.
 * Un bot sur 3000 serveurs qui en annonce 1000 sur top.gg, c'est exactement ce
 * genre de bug — invisible pendant des mois.
 *
 * Tout ce qui compte des serveurs passe donc par ici.
 */
const logger = require('./logger');

/** Le bot tourne-t-il en plusieurs morceaux ? */
function enShards(client) {
  return Boolean(client?.shard);
}

/**
 * Le nombre total de serveurs.
 * Sans sharding, c'est le cache local. Avec, c'est la somme demandee a tous
 * les shards — et si l'un d'eux ne repond pas, on le dit plutot que de rendre
 * un total silencieusement faux.
 */
async function serveurs(client) {
  if (!enShards(client)) return client.guilds.cache.size;
  try {
    const parts = await client.shard.fetchClientValues('guilds.cache.size');
    if (parts.some((n) => n === undefined || n === null)) {
      logger.avertissement('Totaux : un shard n\'a pas repondu, le compte est partiel.');
    }
    return parts.reduce((a, b) => a + (b ?? 0), 0);
  } catch (e) {
    logger.avertissement('Totaux :', e.message);
    return client.guilds.cache.size;
  }
}

/** Le nombre total de membres, tous serveurs confondus. */
async function membres(client) {
  const local = () => client.guilds.cache.reduce((n, g) => n + (g.memberCount ?? 0), 0);
  if (!enShards(client)) return local();
  try {
    const parts = await client.shard.broadcastEval(
      (c) => c.guilds.cache.reduce((n, g) => n + (g.memberCount ?? 0), 0)
    );
    return parts.reduce((a, b) => a + (b ?? 0), 0);
  } catch {
    return local();
  }
}

/**
 * Ce shard est-il celui qui parle au nom de tous ?
 *
 * Certaines choses ne doivent se faire QU'UNE FOIS pour le bot entier :
 * publier le nombre de serveurs sur top.gg, envoyer une alerte de palier. Sans
 * ce garde-fou, huit shards publieraient huit chiffres differents, chacun
 * n'ayant qu'un huitieme de la verite.
 */
function estPremierShard(client) {
  if (!enShards(client)) return true;
  return client.shard.ids.includes(0);
}

module.exports = { serveurs, membres, enShards, estPremierShard };
