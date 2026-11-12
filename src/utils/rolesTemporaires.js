/**
 * Les roles temporaires : « donne @Event a X pendant 7 jours ».
 *
 * Comme pour les bans temporaires, la fin est ECRITE EN BASE et relue toutes
 * les minutes : un setTimeout ne survivrait pas a un redemarrage du bot, et un
 * role temporaire qui ne part jamais est pire qu'un role permanent assume.
 *
 * Si le role ou le membre a disparu entre-temps, la ligne est simplement
 * effacee. Si le bot ne peut plus retirer le role (hierarchie changee), on
 * reessaie au tour suivant pendant 24 h, puis on abandonne en le disant.
 */
const { db } = require('../database/db');
const logger = require('./logger');

db.exec(`
CREATE TABLE IF NOT EXISTS roles_temporaires (
  guild_id  TEXT NOT NULL,
  user_id   TEXT NOT NULL,
  role_id   TEXT NOT NULL,
  fin       INTEGER NOT NULL,
  par       TEXT,
  PRIMARY KEY (guild_id, user_id, role_id)
);
CREATE INDEX IF NOT EXISTS idx_roles_temporaires_fin ON roles_temporaires (fin);
`);

const q = {
  poser: db.prepare(`
    INSERT INTO roles_temporaires (guild_id, user_id, role_id, fin, par) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(guild_id, user_id, role_id) DO UPDATE SET fin = excluded.fin, par = excluded.par
  `),
  retirer: db.prepare('DELETE FROM roles_temporaires WHERE guild_id = ? AND user_id = ? AND role_id = ?'),
  echus: db.prepare('SELECT * FROM roles_temporaires WHERE fin <= ? LIMIT 50'),
  de: db.prepare('SELECT * FROM roles_temporaires WHERE guild_id = ? AND user_id = ? ORDER BY fin ASC'),
};

const ABANDON_MS = 24 * 3_600_000;
let minuterie = null;

function poser(guildId, userId, roleId, fin, par = null) {
  q.poser.run(guildId, userId, roleId, fin, par);
}

/** Le role a ete retire a la main : plus rien a retirer plus tard. */
function oublier(guildId, userId, roleId) {
  q.retirer.run(guildId, userId, roleId);
}

function de(guildId, userId) {
  return q.de.all(guildId, userId);
}

async function tour(client) {
  for (const ligne of q.echus.all(Date.now())) {
    const guild = client.guilds.cache.get(ligne.guild_id);
    // Serveur sur un autre shard : ce n'est pas a nous de le traiter.
    if (!guild) {
      if (!client.shard) q.retirer.run(ligne.guild_id, ligne.user_id, ligne.role_id);
      continue;
    }
    const membre = await guild.members.fetch(ligne.user_id).catch(() => null);
    const role = guild.roles.cache.get(ligne.role_id);
    if (!membre || !role || !membre.roles.cache.has(role.id)) {
      q.retirer.run(ligne.guild_id, ligne.user_id, ligne.role_id);
      continue;
    }
    try {
      await membre.roles.remove(role, 'Rôle temporaire expiré');
      q.retirer.run(ligne.guild_id, ligne.user_id, ligne.role_id);
    } catch (e) {
      if (Date.now() - ligne.fin > ABANDON_MS) {
        q.retirer.run(ligne.guild_id, ligne.user_id, ligne.role_id);
        logger.avertissement(`Rôle temporaire ${role.name} non retiré à ${membre.user.username} sur ${guild.name} (abandon) :`, e.message);
      }
    }
  }
}

function demarrer(client) {
  if (minuterie) clearInterval(minuterie);
  const lancer = () => tour(client).catch((e) => logger.avertissement('Rôles temporaires :', e.message));
  lancer();
  minuterie = setInterval(lancer, 60_000);
  minuterie.unref?.();
}

module.exports = { poser, oublier, de, demarrer, tour };
