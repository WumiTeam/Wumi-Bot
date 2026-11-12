/**
 * Arrivees et departs du bot, dans le salon LOG_SERVEURS du serveur support.
 *
 * TROIS PRECAUTIONS QUI COMPTENT :
 *
 * 1. UNIQUEMENT SUR LE SERVEUR SUPPORT. Ces messages nomment d'autres
 *    serveurs, leur taille et leur proprietaire : ca ne regarde que l'auteur
 *    du bot. Le salon se regle dans le .env (LOG_SERVEURS), voir
 *    src/utils/journalSupport.js.
 *
 * 2. UN DEPART N'EST PAS TOUJOURS UN DEPART. Discord declenche le meme
 *    evenement pendant une panne ; guildDelete filtre ce cas avant d'appeler
 *    ce module.
 *
 * 3. RIEN ICI NE DOIT CASSER L'ARRIVEE DU BOT. Tout echec est avale.
 */
const { AuditLogEvent, PermissionsBitField } = require('discord.js');
const conf = require('../../config');
const journal = require('./journalSupport');
const totaux = require('./totaux');

/** Qui a ajoute le bot, si le journal d'audit veut bien le dire. */
async function quiAAjoute(guild) {
  try {
    const moi = guild.members.me;
    if (!moi?.permissions?.has(PermissionsBitField.Flags.ViewAuditLog)) return null;
    const journaux = await guild.fetchAuditLogs({ type: AuditLogEvent.BotAdd, limit: 5 });
    const entree = journaux.entries.find((e) => e.target?.id === guild.client.user.id);
    return entree?.executor ?? null;
  } catch {
    return null;
  }
}

const nombre = (n) => Number(n ?? 0).toLocaleString('fr-FR');
const date = (ms, style = 'D') => `<t:${Math.floor(ms / 1000)}:${style}>`;

/** Le bot vient d'arriver quelque part. */
async function arrivee(client, guild, { ou = null } = {}) {
  if (!journal.salonId('serveurs')) return false;

  const [auteur, proprio, total] = await Promise.all([
    quiAAjoute(guild),
    guild.fetchOwner().catch(() => null),
    totaux.serveurs(client),
  ]);

  const bots = guild.members.cache.filter((m) => m.user.bot).size;
  return journal.noter('serveurs', {
    titre: `📥 Nouveau serveur · ${guild.name}`,
    couleur: conf.couleurs.succes,
    vignette: guild.iconURL({ size: 256 }) ?? client.user.displayAvatarURL(),
    lignes: [
      `**Membres** · ${nombre(guild.memberCount)}${bots ? ` (dont ${bots} bot(s) en cache)` : ''}`,
      `**Créé** · ${date(guild.createdTimestamp)} (${date(guild.createdTimestamp, 'R')})`,
      `**Propriétaire** · ${proprio ? `${proprio.user.username} (\`${proprio.id}\`)` : '_inconnu_'}`,
      `**Ajouté par** · ${auteur ? `${auteur.username} (\`${auteur.id}\`)` : '_journal d\'audit inaccessible_'}`,
      `**Boosts** · niveau ${guild.premiumTier} · ${guild.premiumSubscriptionCount ?? 0} boost(s)`,
      `**Langue** · ${guild.preferredLocale ?? '?'}`,
      '',
      `🌍 **Total : ${nombre(total)} serveur(s)**`,
    ],
    pied: `ID ${guild.id}${ou ? ` · accueil posté ${ou === 'prive' ? 'en privé' : 'dans un salon'}` : ''}`,
  });
}

/** Le bot vient d'etre retire. */
async function depart(client, guild, { efface = [], arriveLe = null } = {}) {
  if (!journal.salonId('serveurs')) return false;

  const lignes = efface.reduce((n, e) => n + e.lignes, 0);
  const total = await totaux.serveurs(client);
  const sejour = arriveLe ? Date.now() - arriveLe : null;
  // Moins d'une heure : quelque chose n'a pas plu. Ca merite d'etre vu.
  const express = sejour !== null && sejour < 3_600_000;

  return journal.noter('serveurs', {
    titre: `📤 Serveur perdu · ${guild.name ?? guild.id}`,
    couleur: conf.couleurs.erreur,
    vignette: guild.iconURL?.({ size: 256 }) ?? client.user.displayAvatarURL(),
    lignes: [
      `**Membres** · ${nombre(guild.memberCount)}`,
      arriveLe ? `**Présent depuis** · ${date(arriveLe, 'R')}${express ? ' ⚠️ _départ express_' : ''}` : null,
      `**Données effacées** · ${nombre(lignes)} ligne(s)`,
      '',
      `🌍 **Total : ${nombre(total)} serveur(s)**`,
    ],
    pied: `ID ${guild.id}`,
  });
}

/** Ancienne API, gardee pour le panneau qui l'appelle encore. */
function salon() {
  return journal.salonId('serveurs');
}

module.exports = { arrivee, depart, salon };
