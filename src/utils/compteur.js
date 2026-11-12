/**
 * Le SALON COMPTEUR : les membres comptent 1, 2, 3... chacun son tour.
 *
 *  - un bon nombre        -> ✅ (et 🏆 quand on bat le record du serveur)
 *  - un mauvais nombre    -> ❌, la serie retombe a 0, on recommence a 1
 *  - deux fois de suite   -> pareil : il faut laisser compter les autres
 *  - un message qui ne commence pas par un nombre est ignore : on peut
 *    discuter dans le salon sans casser la serie.
 *
 * Etat en base (survit aux redemarrages). Le traitement est serialise par
 * serveur : deux messages postes a la meme milliseconde ne valident pas tous
 * les deux le meme nombre.
 */
const { db, config, majConfig } = require('../database/db');
const logger = require('./logger');

db.exec(`
CREATE TABLE IF NOT EXISTS compteur (
  guild_id     TEXT PRIMARY KEY,
  actuel       INTEGER NOT NULL DEFAULT 0,
  dernier_user TEXT,
  record       INTEGER NOT NULL DEFAULT 0,
  record_date  INTEGER,
  echecs       INTEGER NOT NULL DEFAULT 0
);
`);

const q = {
  lire: db.prepare('SELECT * FROM compteur WHERE guild_id = ?'),
  init: db.prepare('INSERT OR IGNORE INTO compteur (guild_id) VALUES (?)'),
  avancer: db.prepare('UPDATE compteur SET actuel = ?, dernier_user = ?, record = MAX(record, ?), record_date = CASE WHEN ? > record THEN ? ELSE record_date END WHERE guild_id = ?'),
  casser: db.prepare('UPDATE compteur SET actuel = 0, dernier_user = NULL, echecs = echecs + 1 WHERE guild_id = ?'),
  remettre: db.prepare('UPDATE compteur SET actuel = 0, dernier_user = NULL WHERE guild_id = ?'),
};

function etat(guildId) {
  q.init.run(guildId);
  return q.lire.get(guildId);
}

/** Le nombre au debut du message (« 42 », « 42 ! », « 1 000 » refuse). */
function lireNombre(texte) {
  const m = String(texte ?? '').trim().match(/^(\d{1,9})(?!\d)(?![\s.,]+\d)/);
  return m ? Number(m[1]) : null;
}

const files = new Map();
function enFile(guildId, travail) {
  const avant = files.get(guildId) ?? Promise.resolve();
  const suite = avant.then(travail, travail);
  files.set(guildId, suite.catch(() => null));
  return suite;
}

async function traiter(message) {
  const n = lireNombre(message.content);
  if (n === null) return;
  const guildId = message.guild.id;

  return enFile(guildId, async () => {
    const e = etat(guildId);
    const attendu = e.actuel + 1;
    const { t } = require('./langues').traducteur(message.guild);

    if (n === attendu && message.author.id !== e.dernier_user) {
      const nouveauRecord = n > e.record;
      q.avancer.run(n, message.author.id, n, n, Date.now(), guildId);
      await message.react(nouveauRecord && n > 1 ? '🏆' : '✅').catch(() => null);
      // Un petit mot a chaque centaine, pour faire la fete sans spammer.
      if (n % 100 === 0) {
        await message.channel.send({ content: `🎉 ${t('compteur.palier', { n })}`, allowedMentions: { parse: [] } }).catch(() => null);
      }
      return;
    }

    // Rate. Si on n'avait pas encore commence, on ne fait pas de drame.
    await message.react('❌').catch(() => null);
    if (e.actuel === 0) {
      await message.reply({ content: t('compteur.commencer'), allowedMentions: { repliedUser: false } }).catch(() => null);
      return;
    }
    q.casser.run(guildId);
    const raison = message.author.id === e.dernier_user ? t('compteur.deux_fois') : t('compteur.mauvais', { attendu });
    await message.reply({
      content: `💥 ${t('compteur.casse', { joueur: `<@${message.author.id}>`, n: e.actuel })} ${raison}\n-# ${t('compteur.record', { n: Math.max(e.record, e.actuel) })} · ${t('compteur.recommencer')}`,
      allowedMentions: { parse: [], repliedUser: false },
    }).catch(() => null);
  }).catch((err) => logger.debug('Compteur :', err.message));
}

function salon(guildId) {
  return config(guildId).compteur_salon ?? null;
}

function definirSalon(guildId, id) {
  majConfig(guildId, { compteur_salon: id });
}

module.exports = { traiter, etat, lireNombre, salon, definirSalon, remettre: (g) => q.remettre.run(g) };
