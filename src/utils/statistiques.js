const { ChannelType, PermissionFlagsBits } = require('discord.js');
const conf = require('../../config');
const { req } = require('../database/db');
const logger = require('./logger');

const VARIABLES = {
  '{membres}': (g) => g.memberCount,
  '{humains}': (g) => g.members.cache.filter((m) => !m.user.bot).size || g.memberCount,
  '{bots}': (g) => g.members.cache.filter((m) => m.user.bot).size,
  '{enligne}': (g) => g.members.cache.filter((m) => m.presence && m.presence.status !== 'offline').size,
  '{boosts}': (g) => g.premiumSubscriptionCount ?? 0,
  '{niveau}': (g) => g.premiumTier ?? 0,
  '{salons}': (g) => g.channels.cache.filter((c) => c.type !== ChannelType.GuildCategory).size,
  '{roles}': (g) => Math.max(0, g.roles.cache.size - 1),
};

/** Remplace les variables d'un modele par leurs valeurs actuelles. */
function rendre(modele, guild) {
  let sortie = modele;
  for (const [cle, calcul] of Object.entries(VARIABLES)) {
    if (!sortie.includes(cle)) continue;
    let valeur = 0;
    try {
      valeur = calcul(guild) ?? 0;
    } catch {
      valeur = 0;
    }
    sortie = sortie.replaceAll(cle, Number(valeur).toLocaleString('fr-FR').replace(/ | /g, ' '));
  }
  return sortie.slice(0, 100);
}

/**
 * Met a jour les salons statistiques d'un serveur.
 * Discord limite a 2 renommages par salon toutes les 10 minutes : les appels
 * trop rapprochés sont simplement ignores par l'API, sans erreur.
 */
async function actualiserGuild(guild) {
  const salons = req.statsSalons.all(guild.id);
  if (!salons.length) return 0;

  let modifies = 0;
  for (const ligne of salons) {
    const salon = guild.channels.cache.get(ligne.channel_id);
    if (!salon) {
      req.retirerStatSalon.run(guild.id, ligne.channel_id);
      continue;
    }
    if (!salon.permissionsFor(guild.members.me)?.has(PermissionFlagsBits.ManageChannels)) continue;

    const nom = rendre(ligne.modele, guild);
    if (nom === salon.name) continue;

    try {
      await salon.setName(nom, 'Mise à jour des statistiques');
      modifies++;
    } catch (e) {
      logger.debug(`Salon statistique ${salon.id} non renomme : ${e.message}`);
    }
  }
  return modifies;
}

/** Met a jour tous les serveurs qui ont des salons statistiques. */
async function actualiserTout(client) {
  const lignes = req.tousStatsSalons.all();
  const guildIds = [...new Set(lignes.map((l) => l.guild_id))];
  for (const id of guildIds) {
    const guild = client.guilds.cache.get(id);
    if (guild) await actualiserGuild(guild).catch((e) => logger.avertissement('Statistiques :', e.message));
  }
}

/** Demarre la boucle de mise a jour periodique. */
function demarrer(client) {
  const minutes = Math.max(10, conf.statistiques.intervalleMinutes);
  setTimeout(() => actualiserTout(client).catch(() => null), 15_000); // premiere passe apres le demarrage
  setInterval(() => actualiserTout(client).catch(() => null), minutes * 60_000);
}

module.exports = { VARIABLES, rendre, actualiserGuild, actualiserTout, demarrer };
