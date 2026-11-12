/**
 * Qui commande le bot, et ou.
 *
 * Sur un bot prive, la question ne se pose pas : le proprietaire du serveur est
 * l'auteur du bot. Sur un bot public, ce sont deux personnes differentes, et
 * confondre les deux est la faute qui donne a n'importe quel administrateur de
 * serveur les commandes de TOUT le bot.
 *
 * Trois notions, a ne pas melanger :
 *
 *   LE FONDATEUR       toi. Identifie par son identifiant Discord, liste dans
 *                      OWNER_IDS. Il peut faire quitter un serveur au bot,
 *                      bloquer quelqu'un, voir l'etat global. Personne d'autre.
 *
 *   LE SERVEUR SUPPORT ton serveur a toi, ou vivent les commandes /admin et ou
 *                      le bot signale ses propres erreurs. SUPPORT_GUILD_ID.
 *
 *   UN ADMIN DE SERVEUR quelqu'un qui a « Gerer le serveur » quelque part. Il
 *                      configure SON serveur, avec /demarrer et /config. Il
 *                      n'a aucun pouvoir sur le bot ni sur les autres serveurs.
 *
 * La liste noire vit ici aussi : bloquer, c'est une decision de fondateur.
 */
const { req } = require('../database/db');
const logger = require('./logger');

/** Les identifiants Discord des fondateurs, lus une fois. */
function fondateurs() {
  return String(process.env.OWNER_IDS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => /^\d{17,20}$/.test(s));
}

/** Cette personne est-elle fondatrice du bot ? */
function estFondateur(userId) {
  return fondateurs().includes(String(userId));
}

/** L'identifiant du serveur support, ou null s'il n'est pas configure. */
function serveurSupport() {
  const id = String(process.env.SUPPORT_GUILD_ID ?? '').trim();
  return /^\d{17,20}$/.test(id) ? id : null;
}

/** Ce serveur est-il le serveur support ? */
function estSupport(guildId) {
  const id = serveurSupport();
  return !!id && String(guildId) === id;
}

// ------------------------------------------------------------- LISTE NOIRE

/**
 * Ce serveur ou ce membre est-il bloque ?
 * @returns {{id: string, genre: string, raison: string|null, date: number}|null}
 */
function bloque(id) {
  try {
    return req.estBloque.get(String(id)) ?? null;
  } catch (e) {
    // Une base momentanement indisponible ne doit pas bloquer tout le monde :
    // en cas de doute, on laisse passer.
    logger.debug('Liste noire :', e.message);
    return null;
  }
}

/** Bloque un serveur ou un membre. */
function bloquer(id, genre, { raison = null, par = null } = {}) {
  if (!['serveur', 'membre'].includes(genre)) throw new Error('genre inconnu');
  req.bloquer.run({ id: String(id), genre, raison, par: par ? String(par) : null, date: Date.now() });
}

/** Debloque. Renvoie vrai si quelque chose a ete retire. */
function debloquer(id) {
  return req.debloquer.run(String(id)).changes > 0;
}

/** Toute la liste, la plus recente d'abord. */
function listeNoire() {
  return req.listeNoire.all();
}

/**
 * Quitte les serveurs bloques. Appele au demarrage : un serveur peut avoir ete
 * bloque pendant que le bot etait eteint.
 * @returns {Promise<string[]>} les serveurs quittes
 */
async function quitterLesBloques(client) {
  const quittes = [];
  for (const ligne of listeNoire().filter((l) => l.genre === 'serveur')) {
    const guild = client.guilds.cache.get(ligne.id);
    if (!guild) continue;
    await guild.leave().catch((e) => logger.avertissement(`Sortie de ${ligne.id} :`, e.message));
    quittes.push(ligne.id);
    logger.info(`Serveur bloque quitte : ${guild.name} (${ligne.id}).`);
  }
  return quittes;
}

module.exports = {
  fondateurs,
  estFondateur,
  serveurSupport,
  estSupport,
  bloque,
  bloquer,
  debloquer,
  listeNoire,
  quitterLesBloques,
};
