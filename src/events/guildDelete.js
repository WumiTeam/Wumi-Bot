/**
 * Le bot vient d'etre retire d'un serveur.
 *
 * Tout ce que le bot savait de ce serveur part avec lui : l'XP, l'economie,
 * les sanctions, les tickets, les reglages. C'est ce qu'un bot public doit
 * faire — garder les donnees d'un serveur qui ne veut plus de vous n'a aucune
 * justification, et c'est ce que la politique de confidentialite promet.
 *
 * Discord declenche aussi cet evenement pendant une PANNE, quand un serveur
 * devient temporairement injoignable. On ne touche a rien dans ce cas : le
 * champ `available` le dit, et l'effacer serait catastrophique.
 */
const { Events } = require('discord.js');
const { supprimerServeur } = require('../database/db');
const logger = require('../utils/logger');

module.exports = {
  name: Events.GuildDelete,
  async execute(guild, client) {
    // Panne Discord, pas un depart : le serveur revient tout seul.
    if (guild.available === false) {
      logger.avertissement(`Serveur ${guild.name ?? guild.id} injoignable (panne Discord) — rien n'est efface.`);
      return;
    }
    require('../utils/rolesSupport').botRetire(client, guild).catch(() => null);

    // Les caches en memoire d'abord : ils sont ranges par serveur, autant ne
    // pas les trainer jusqu'au prochain redemarrage.
    for (const collection of [client?.cooldownsXp, client?.vocal, client?.antiSpam, client?.automodStrikes]) {
      if (!collection) continue;
      for (const cle of collection.keys()) {
        if (typeof cle === 'string' && cle.startsWith(`${guild.id}-`)) collection.delete(cle);
      }
    }
    client?.arrivees?.delete(guild.id);
    try {
      require('../utils/invitations').cache.delete(guild.id);
      require('../utils/antiRaid').oublierServeur(guild.id);
    } catch (e) {
      logger.debug('Nettoyage memoire :', e.message);
    }

    // La date d'arrivee est lue AVANT l'effacement : apres, elle n'existe
    // plus. C'est elle qui dit si le bot est reste trois mois ou trois
    // minutes — et trois minutes, ca veut dire que quelque chose n'a pas plu.
    let arriveLe = null;
    try {
      const membreBot = guild.members?.me;
      arriveLe = membreBot?.joinedTimestamp ?? null;
    } catch {
      arriveLe = null;
    }

    let efface = [];
    try {
      efface = supprimerServeur(guild.id);
      const total = efface.reduce((n, e) => n + e.lignes, 0);
      logger.info(
        `Retire du serveur ${guild.name ?? guild.id} — ${total} ligne(s) effacee(s)`
        + (efface.length ? ` (${efface.map((e) => `${e.table} ×${e.lignes}`).join(', ')})` : '')
      );
    } catch (e) {
      logger.erreur(`Effacement des donnees de ${guild.id} :`, e.message);
    }

    try {
      await require('../utils/journalBot').depart(client, guild, { efface, arriveLe });
    } catch (e) {
      logger.debug('Journal du bot :', e.message);
    }
  },
};
