/**
 * LE LANCEUR DE SHARDS.
 *
 * A partir de 2500 serveurs, Discord REFUSE qu'un seul processus se connecte.
 * Il faut repartir le bot sur plusieurs processus — des « shards » — chacun
 * s'occupant d'une part des serveurs. Ce fichier est le chef d'orchestre : il
 * ne parle pas a Discord, il lance des copies de src/index.js et les surveille.
 *
 * ON NE LANCE PAS CE FICHIER AVANT D'EN AVOIR BESOIN.
 *
 *   node src/index.js    <- le lancement normal, un seul processus
 *   node src/shard.js    <- quand le bot approche des 2500 serveurs
 *
 * Un shard coute de la memoire (chaque processus charge tout le bot). En
 * dessous de 2000 serveurs, le sharding ne fait que consommer plus pour rien.
 * `total: 'auto'` demande a Discord combien il en faut : c'est lui qui sait.
 *
 * CE QUI CHANGE POUR LE CODE
 * Chaque shard ne voit QUE ses serveurs. `client.guilds.cache.size` ne donne
 * donc plus le total du bot, mais celui du shard — un chiffre trop petit, et
 * faux en silence. Partout ou un total compte (/botinfo, le journal, les
 * paliers), on passe par `client.shard.fetchClientValues()`.
 *
 * LA BASE DE DONNEES
 * SQLite tient tres bien plusieurs lecteurs, mais un seul ecrivain a la fois.
 * En mode WAL — celui du bot — plusieurs processus peuvent ecrire tour a tour
 * sans se corrompre, ce qui suffit largement a cette echelle. Si un jour les
 * ecritures se marchent dessus (« database is locked » a repetition), c'est le
 * signe qu'il faut sortir la base du processus (PostgreSQL), pas ajouter des
 * shards.
 */
require('dotenv').config();

const path = require('node:path');
const { ShardingManager } = require('discord.js');
const logger = require('./utils/logger');

const jeton = String(process.env.DISCORD_TOKEN ?? '').trim();
if (!jeton) {
  console.error('\nDISCORD_TOKEN manquant dans le fichier .env.\n');
  process.exit(1);
}

// `totalShards` peut etre force par le .env pour essayer a petite echelle :
// SHARDS=2 lance deux processus meme avec trois serveurs, ce qui est le seul
// moyen de verifier que les totaux se calculent bien avant d'en avoir besoin.
const force = Number(process.env.SHARDS);
const total = Number.isInteger(force) && force > 0 ? force : 'auto';

const manager = new ShardingManager(path.join(__dirname, 'index.js'), {
  token: jeton,
  totalShards: total,
  respawn: true,
  // Un shard qui tombe emporte ses serveurs avec lui : on le relance, mais
  // pas en boucle folle — Discord limite les connexions.
  mode: 'process',
});

manager.on('shardCreate', (shard) => {
  logger.info(`Shard ${shard.id} lance.`);

  shard.on('ready', () => logger.succes(`Shard ${shard.id} connecte.`));
  shard.on('disconnect', () => logger.avertissement(`Shard ${shard.id} deconnecte.`));
  shard.on('reconnecting', () => logger.info(`Shard ${shard.id} se reconnecte...`));
  shard.on('death', (processus) => {
    logger.erreur(`Shard ${shard.id} est mort (code ${processus.exitCode}). Il va etre relance.`);
  });
  shard.on('error', (e) => logger.erreur(`Shard ${shard.id} :`, e.message));
});

manager
  .spawn({ timeout: 120_000 })
  .then((shards) => logger.succes(`${shards.size} shard(s) en service.`))
  .catch((e) => {
    logger.erreur('Lancement des shards :', e.message);
    process.exit(1);
  });

// Un arret propre : on ferme les shards avant de rendre la main, sinon les
// processus enfants survivent au parent.
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    logger.info('Arret des shards...');
    for (const shard of manager.shards.values()) shard.kill();
    process.exit(0);
  });
}
