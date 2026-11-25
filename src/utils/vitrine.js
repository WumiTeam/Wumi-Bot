/**
 * La vitrine du site : les serveurs qui ont Wumi ET qui ont accepte d'etre
 * montres sur wumi.fr (/config › Communaute › « Afficher sur le site »,
 * eteint par defaut). Lue par /api/vitrine (src/public/serveur.js).
 *
 * Rien d'autre que ce qu'un serveur montre deja publiquement : nom, icone,
 * nombre de membres. Les serveurs de moins de MIN_MEMBRES n'apparaissent pas.
 */
const { db } = require('../database/db');
const { enShards } = require('./totaux');

const MIN_MEMBRES = 20;
const MAX = 40;

function idsVolontaires() {
  try {
    return db.prepare('SELECT guild_id FROM config WHERE vitrine_site = 1').all().map((l) => l.guild_id);
  } catch {
    return [];
  }
}

function decrire(c, { ids, min }) {
  const out = [];
  for (const id of ids) {
    const g = c.guilds.cache.get(id);
    if (!g || (g.memberCount ?? 0) < min) continue;
    out.push({ nom: g.name, icone: g.iconURL({ size: 128, extension: 'png' }), membres: g.memberCount ?? 0 });
  }
  return out;
}

async function liste(client) {
  const ids = idsVolontaires();
  if (!ids.length) return [];
  let tous;
  if (enShards(client)) {
    try {
      tous = (await client.shard.broadcastEval(decrire, { context: { ids, min: MIN_MEMBRES } })).flat();
    } catch {
      tous = decrire(client, { ids, min: MIN_MEMBRES });
    }
  } else {
    tous = decrire(client, { ids, min: MIN_MEMBRES });
  }
  return tous.sort((a, b) => b.membres - a.membres).slice(0, MAX);
}

module.exports = { liste, MIN_MEMBRES };
