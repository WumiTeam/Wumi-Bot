/**
 * Les roles automatiques du SERVEUR SUPPORT.
 *
 *  UTILISATEUR DE WUMI
 *    Donne a chaque membre du serveur support qui a Wumi chez lui : il est
 *    proprietaire d'un serveur ou Wumi est, ou c'est lui qui l'y a ajoute
 *    (lu dans le journal d'audit a l'arrivee du bot). Retire quand ce n'est
 *    plus vrai. Verifie a l'arrivee sur le support, a chaque ajout ou depart
 *    du bot, et toutes les 6 h pour tout le monde.
 *
 *  BETA-TESTEUR
 *    Un panneau avec un bouton pour le prendre ou le rendre. Les commandes
 *    marquees `beta: true` ne sont deployees que sur le serveur support et
 *    ne repondent qu'a ce role (et au fondateur) : on y teste les nouveautes
 *    avant de les ouvrir a tout le monde.
 *
 * Reglages (table support_reglages) : role.utilisateur, role.beta.
 * Composants : prefixe « srole_ ».
 */
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, AuditLogEvent, PermissionFlagsBits, MessageFlags } = require('discord.js');
const C = require('./composants');
const store = require('./supportStore');
const fondateur = require('./fondateur');
const { db } = require('../database/db');
const logger = require('./logger');

db.exec(`
CREATE TABLE IF NOT EXISTS support_ajouts (
  guild_id  TEXT PRIMARY KEY,
  user_id   TEXT NOT NULL,
  le        INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_support_ajouts_user ON support_ajouts (user_id);
`);
const q = {
  noter: db.prepare(`INSERT INTO support_ajouts (guild_id, user_id, le) VALUES (?, ?, ?)
    ON CONFLICT(guild_id) DO UPDATE SET user_id = excluded.user_id, le = excluded.le`),
  deUser: db.prepare('SELECT guild_id FROM support_ajouts WHERE user_id = ?'),
  tous: db.prepare('SELECT guild_id, user_id FROM support_ajouts'),
};

function serveur(client) {
  const id = fondateur.serveurSupport();
  return id ? client.guilds.cache.get(id) ?? null : null;
}

/** Les utilisateurs « qui ont Wumi » : proprietaires et ajouteurs. */
function utilisateurs(client) {
  const ids = new Set();
  for (const g of client.guilds.cache.values()) {
    if (fondateur.estSupport(g.id)) continue;
    if (g.ownerId) ids.add(g.ownerId);
  }
  for (const r of q.tous.all()) if (client.guilds.cache.has(r.guild_id)) ids.add(r.user_id);
  return ids;
}

function aWumi(client, userId) {
  for (const g of client.guilds.cache.values()) {
    if (!fondateur.estSupport(g.id) && g.ownerId === userId) return true;
  }
  return q.deUser.all(userId).some((r) => client.guilds.cache.has(r.guild_id));
}

/** Met le role d'un membre du support a jour. */
async function majMembre(client, membre) {
  const role = store.lire('role.utilisateur');
  if (!role || !membre || membre.user.bot) return;
  const doit = aWumi(client, membre.id);
  const a = membre.roles.cache.has(role);
  if (doit && !a) await membre.roles.add(role, 'Wumi est sur un de ses serveurs').catch(() => null);
  if (!doit && a) await membre.roles.remove(role, 'Wumi n\'est plus sur ses serveurs').catch(() => null);
}

async function majUtilisateur(client, userId) {
  const g = serveur(client);
  if (!g || !userId) return;
  const membre = await g.members.fetch(userId).catch(() => null);
  if (membre) await majMembre(client, membre);
}

/** Tout le serveur support d'un coup. Renvoie { ajoutes, retires }. */
async function synchroniser(client) {
  const g = serveur(client);
  const role = store.lire('role.utilisateur');
  if (!g || !role) return { ajoutes: 0, retires: 0 };
  const ids = utilisateurs(client);
  const membres = await g.members.fetch().catch(() => g.members.cache);
  let ajoutes = 0;
  let retires = 0;
  for (const m of membres.values()) {
    if (m.user.bot) continue;
    const doit = ids.has(m.id);
    const a = m.roles.cache.has(role);
    if (doit && !a && await m.roles.add(role, 'Wumi est sur un de ses serveurs').then(() => true).catch(() => false)) ajoutes += 1;
    if (!doit && a && await m.roles.remove(role, 'Wumi n\'est plus sur ses serveurs').then(() => true).catch(() => false)) retires += 1;
  }
  return { ajoutes, retires };
}

/** Le bot arrive sur un serveur : qui l'a ajoute ? */
async function botAjoute(client, guild) {
  let auteur = null;
  if (guild.members.me?.permissions.has(PermissionFlagsBits.ViewAuditLog)) {
    const journal = await guild.fetchAuditLogs({ type: AuditLogEvent.BotAdd, limit: 5 }).catch(() => null);
    auteur = journal?.entries.find((e) => e.target?.id === client.user.id)?.executor?.id ?? null;
  }
  if (auteur) q.noter.run(guild.id, auteur, Date.now());
  await majUtilisateur(client, guild.ownerId);
  if (auteur && auteur !== guild.ownerId) await majUtilisateur(client, auteur);
}

async function botRetire(client, guild) {
  await majUtilisateur(client, guild.ownerId);
  for (const r of q.tous.all()) if (r.guild_id === guild.id) await majUtilisateur(client, r.user_id);
}

/* ------------------------------------------------------------------- beta */

function estBeta(membre) {
  if (!membre) return false;
  if (fondateur.estFondateur(membre.id)) return true;
  const role = store.lire('role.beta');
  return Boolean(role && membre.roles?.cache?.has(role));
}

function panneauBeta(t) {
  return {
    components: [C.conteneur([
      C.texte(`## 🧪 ${t('support.roles.beta_titre')}`),
      C.texte(t('support.roles.beta_texte')),
      C.texte(`-# ${t('support.roles.beta_pied')}`),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('srole_beta').setEmoji('🧪').setLabel(t('support.roles.beta_bouton')).setStyle(ButtonStyle.Primary),
      ),
    ], 0x8b7cf6)],
    flags: MessageFlags.IsComponentsV2,
  };
}

async function gererInteraction(interaction) {
  const { t } = require('./langues').traducteur(interaction);
  if (!interaction.guild || !fondateur.estSupport(interaction.guild.id)) return interaction.reply(C.erreurPrivee(t('support.reserve_support')));
  if (interaction.customId !== 'srole_beta') return interaction.deferUpdate();
  const role = store.lire('role.beta');
  if (!role) return interaction.reply(C.erreurPrivee(t('support.roles.beta_pas_configure')));
  const a = interaction.member.roles.cache.has(role);
  try {
    if (a) await interaction.member.roles.remove(role, 'Beta-testeur : desinscription');
    else await interaction.member.roles.add(role, 'Beta-testeur : inscription');
  } catch {
    return interaction.reply(C.erreurPrivee(t('support.roles.role_impossible')));
  }
  return interaction.reply(C.succesPrive(t(a ? 'support.roles.beta_quitte' : 'support.roles.beta_rejoint')));
}

/** Toutes les 6 h. */
function demarrer(client) {
  const tour = () => synchroniser(client).catch((e) => logger.debug('Roles support :', e.message));
  setTimeout(tour, 2 * 60_000).unref?.();
  setInterval(tour, 6 * 3_600_000).unref?.();
}

module.exports = { synchroniser, majMembre, majUtilisateur, botAjoute, botRetire, estBeta, panneauBeta, gererInteraction, demarrer, aWumi, utilisateurs };
