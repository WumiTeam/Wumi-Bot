/**
 * Les sections avancees du tableau de bord : statistiques, roles-reactions,
 * createur d'embeds et sanctions.
 *
 * Meme regle que dashboard.js : l'acces au serveur (Gerer le serveur) est deja
 * verifie avant d'arriver ici, et CHAQUE action re-verifie ce qui la concerne
 * (position du role, droits dans le salon...) aupres du bot, maintenant.
 */
const { ChannelType, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { db, req } = require('../database/db');
const logger = require('../utils/logger');

const DANGEREUSES = [
  PermissionFlagsBits.Administrator, PermissionFlagsBits.ManageGuild, PermissionFlagsBits.ManageRoles,
  PermissionFlagsBits.ManageChannels, PermissionFlagsBits.BanMembers, PermissionFlagsBits.KickMembers,
  PermissionFlagsBits.ModerateMembers, PermissionFlagsBits.ManageMessages, PermissionFlagsBits.ManageWebhooks,
  PermissionFlagsBits.MentionEveryone,
];

const SEMAINE = 7 * 86_400_000;

function noterJournal(guildId, cle, apres, par) {
  try {
    require('../utils/configAudit').noter({ guildId, cle, avant: null, apres, par, source: 'dashboard' });
  } catch {
    /* le journal est un confort */
  }
}

// ------------------------------------------------------------ STATISTIQUES
async function statistiques(guild, jours) {
  const activite = require('../utils/activite');
  const n = [7, 30, 90].includes(jours) ? jours : 30;

  const serie = activite.serie(guild.id, n);
  const avant = activite.serie(guild.id, n * 2).slice(0, n);
  const somme = (liste, cle) => liste.reduce((s, x) => s + (x[cle] ?? 0), 0);

  const salons = activite.topSalons(guild.id, n, 8).map((l) => ({
    id: l.channel_id,
    nom: guild.channels.cache.get(l.channel_id)?.name ?? null,
    total: l.total,
  }));

  let membres = [];
  try {
    const lignes = db.prepare('SELECT user_id, messages, xp FROM xp WHERE guild_id = ? ORDER BY messages DESC LIMIT 10').all(guild.id);
    const trouves = lignes.length ? await guild.members.fetch({ user: lignes.map((l) => l.user_id) }).catch(() => null) : null;
    membres = lignes.map((l) => {
      const m = trouves?.get(l.user_id) ?? guild.members.cache.get(l.user_id);
      return {
        id: l.user_id,
        nom: m?.displayName ?? null,
        avatar: m ? m.displayAvatarURL({ size: 64, extension: 'png' }) : null,
        messages: l.messages,
        xp: l.xp,
      };
    });
  } catch (e) {
    logger.debug('Dashboard stats membres :', e.message);
  }

  // Sanctions des 12 dernieres semaines, par type.
  const semaines = [];
  const debut = Date.now() - 12 * SEMAINE;
  for (let i = 0; i < 12; i++) semaines.push({ debut: debut + i * SEMAINE, warn: 0, mute: 0, kick: 0, ban: 0 });
  try {
    const lignes = db.prepare('SELECT type, date FROM sanctions WHERE guild_id = ? AND date >= ?').all(guild.id, debut);
    for (const l of lignes) {
      const i = Math.min(11, Math.floor((l.date - debut) / SEMAINE));
      const type = l.type === 'automod' ? 'warn' : l.type;
      if (semaines[i] && type in semaines[i]) semaines[i][type]++;
    }
  } catch {
    /* pas de table : zero partout */
  }

  return {
    jours: n,
    serie,
    totaux: {
      messages: somme(serie, 'messages'),
      messagesAvant: somme(avant, 'messages'),
      arrivees: somme(serie, 'arrivees'),
      departs: somme(serie, 'departs'),
      vocalMinutes: somme(serie, 'vocal'),
    },
    salons,
    membres,
    semaines,
  };
}

// --------------------------------------------------------- ROLES-REACTIONS
function rolesPourListe(guild, menu, rr) {
  return rr.roles(menu).map((x) => ({
    role_id: x.role_id,
    nom: guild.roles.cache.get(x.role_id)?.name ?? null,
    emoji: x.emoji ?? null,
    label: x.label ?? null,
  }));
}

function listeRR(guild) {
  const rr = require('../utils/rolesReactions');
  return rr.q.duServeur.all(guild.id).map((m) => ({
    id: m.id,
    titre: m.titre,
    description: m.description,
    mode: m.mode,
    unique: Boolean(m.unique_role),
    salon: m.channel_id,
    lien: m.message_id ? `https://discord.com/channels/${guild.id}/${m.channel_id}/${m.message_id}` : null,
    roles: rolesPourListe(guild, m, rr),
  }));
}

/** Le meme controle que /roles-reactions, pour un membre connecte au site. */
async function problemeRole(guild, membre, roleId) {
  const role = guild.roles.cache.get(String(roleId));
  if (!role || role.id === guild.id) return 'role_invalide';
  if (role.managed) return 'role_gere';
  if (!role.editable) return 'role_trop_haut_bot';
  if (guild.ownerId !== membre.id && role.position >= membre.roles.highest.position) return 'role_trop_haut_toi';
  if (DANGEREUSES.some((p) => role.permissions.has(p))) return 'role_dangereux';
  return null;
}

function salonEcrivable(guild, id) {
  const salon = guild.channels.cache.get(String(id ?? ''));
  if (!salon || ![ChannelType.GuildText, ChannelType.GuildAnnouncement].includes(salon.type)) return null;
  const moi = guild.members.me;
  const droits = salon.permissionsFor(moi);
  if (!droits?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages])) return null;
  return salon;
}

const propre = (v, max) => {
  const t = String(v ?? '').trim();
  return t ? t.slice(0, max) : null;
};

async function actionRR(guild, membre, corps) {
  const rr = require('../utils/rolesReactions');
  const action = String(corps.action ?? '');

  if (action === 'creer') {
    if (rr.q.compter.get(guild.id).n >= rr.MAX_MENUS) return { erreur: 'trop_menus' };
    const titre = propre(corps.titre, 100);
    if (!titre) return { erreur: 'titre_requis' };
    const salon = salonEcrivable(guild, corps.salon);
    if (!salon) return { erreur: 'salon_invalide' };
    const liste = [];
    for (const x of Array.isArray(corps.roles) ? corps.roles.slice(0, rr.MAX_ROLES) : []) {
      const souci = await problemeRole(guild, membre, x.role_id);
      if (souci) return { erreur: souci, role: x.role_id };
      if (x.emoji && !rr.emojiValide(String(x.emoji))) return { erreur: 'emoji_invalide' };
      if (liste.some((y) => y.role_id === x.role_id)) continue;
      liste.push({ role_id: String(x.role_id), emoji: propre(x.emoji, 64), label: propre(x.label, 80) });
    }
    if (!liste.length) return { erreur: 'aucun_role' };

    const r = rr.q.creer.run({
      guild_id: guild.id,
      channel_id: salon.id,
      titre,
      description: propre(corps.description, 1000),
      mode: corps.mode === 'menu' ? 'menu' : 'boutons',
      unique_role: corps.unique ? 1 : 0,
      roles: JSON.stringify(liste),
      cree_le: Date.now(),
    });
    const menu = rr.q.lire.get(Number(r.lastInsertRowid), guild.id);
    try {
      const message = await salon.send(rr.construire(menu, guild));
      rr.q.message.run(message.id, salon.id, menu.id);
    } catch (e) {
      rr.q.supprimer.run(menu.id, guild.id);
      return { erreur: 'envoi_impossible', detail: e.message };
    }
    noterJournal(guild.id, `roles-reactions #${menu.id}`, `créé dans #${salon.name}`, membre.id);
    return { ok: true, panneaux: listeRR(guild) };
  }

  const menu = rr.q.lire.get(Number(corps.id), guild.id);
  if (!menu) return { erreur: 'introuvable' };

  if (action === 'supprimer') {
    rr.q.supprimer.run(menu.id, guild.id);
    const salon = guild.channels.cache.get(menu.channel_id);
    if (salon && menu.message_id) await salon.messages.delete(menu.message_id).catch(() => null);
    noterJournal(guild.id, `roles-reactions #${menu.id}`, 'supprimé', membre.id);
    return { ok: true, panneaux: listeRR(guild) };
  }

  if (action === 'ajouter' || action === 'retirer') {
    const liste = rr.roles(menu);
    const roleId = String(corps.role_id ?? '');
    if (action === 'ajouter') {
      const souci = await problemeRole(guild, membre, roleId);
      if (souci) return { erreur: souci };
      if (liste.some((x) => x.role_id === roleId)) return { erreur: 'deja' };
      if (liste.length >= rr.MAX_ROLES) return { erreur: 'trop_roles' };
      if (corps.emoji && !rr.emojiValide(String(corps.emoji))) return { erreur: 'emoji_invalide' };
      liste.push({ role_id: roleId, emoji: propre(corps.emoji, 64), label: propre(corps.label, 80) });
    } else {
      const reste = liste.filter((x) => x.role_id !== roleId);
      if (reste.length === liste.length) return { erreur: 'pas_dedans' };
      liste.length = 0;
      liste.push(...reste);
    }
    rr.q.roles.run(JSON.stringify(liste), menu.id);
    const ok = await rr.rafraichir(rr.q.lire.get(menu.id, guild.id), guild).catch(() => false);
    noterJournal(guild.id, `roles-reactions #${menu.id}`, `${action} ${guild.roles.cache.get(roleId)?.name ?? roleId}`, membre.id);
    return { ok: true, messagePerdu: !ok, panneaux: listeRR(guild) };
  }

  return { erreur: 'action_inconnue' };
}

// ------------------------------------------------------------------ EMBEDS
async function publierEmbed(guild, membre, corps) {
  const { _interne: e } = require('../commands/utilitaires/embed');
  const salon = salonEcrivable(guild, corps.salon);
  if (!salon) return { erreur: 'salon_invalide' };
  const moi = salon.permissionsFor(guild.members.me);
  if (!moi?.has(PermissionFlagsBits.EmbedLinks)) return { erreur: 'droits_bot' };
  if (!salon.permissionsFor(membre)?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages])) return { erreur: 'droits_toi' };

  const couleur = e.couleur(corps.couleur);
  if (couleur === undefined) return { erreur: 'couleur_invalide' };
  const image = propre(corps.image, 500);
  if (image && !e.urlValide(image)) return { erreur: 'image_invalide' };

  const b = {
    titre: propre(corps.titre, 256),
    description: propre(corps.description, 4000),
    couleur,
    image,
    pied: propre(corps.pied, 2048),
    boutons: [],
  };
  if (!b.titre && !b.description) return { erreur: 'vide' };
  for (const x of Array.isArray(corps.boutons) ? corps.boutons.slice(0, 5) : []) {
    const label = propre(x.label, 80);
    const url = propre(x.url, 512);
    if (!label || !url) continue;
    if (!e.urlValide(url)) return { erreur: 'url_invalide' };
    b.boutons.push({ label, url });
  }

  const composants = b.boutons.length
    ? [new ActionRowBuilder().addComponents(b.boutons.map((x) => new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel(x.label).setURL(x.url)))]
    : [];
  try {
    const message = await salon.send({ embeds: [e.construireEmbed(b)], components: composants, allowedMentions: { parse: [] } });
    noterJournal(guild.id, 'embed', `publié dans #${salon.name}`, membre.id);
    return { ok: true, lien: message.url };
  } catch (err) {
    return { erreur: 'envoi_impossible', detail: err.message };
  }
}

// --------------------------------------------------------------- SANCTIONS
async function listeSanctions(guild, { page = 1, type = '', membre = '' } = {}) {
  const PAR = 25;
  const conditions = ['guild_id = ?'];
  const params = [guild.id];
  if (['warn', 'mute', 'kick', 'ban', 'automod', 'unban', 'unmute', 'softban'].includes(type)) {
    conditions.push('type = ?');
    params.push(type);
  }
  if (/^\d{17,20}$/.test(membre)) {
    conditions.push('user_id = ?');
    params.push(membre);
  }
  const ou = conditions.join(' AND ');
  const total = db.prepare(`SELECT COUNT(*) AS n FROM sanctions WHERE ${ou}`).get(...params).n;
  const p = Math.max(1, Math.min(Number(page) || 1, Math.max(1, Math.ceil(total / PAR))));
  const lignes = db.prepare(`SELECT * FROM sanctions WHERE ${ou} ORDER BY date DESC LIMIT ? OFFSET ?`).all(...params, PAR, (p - 1) * PAR);

  const ids = [...new Set(lignes.flatMap((l) => [l.user_id, l.moderateur_id]))].filter((x) => /^\d{17,20}$/.test(x));
  const noms = new Map();
  const client = guild.client;
  await Promise.all(ids.map(async (id) => {
    const m = guild.members.cache.get(id);
    if (m) return noms.set(id, m.displayName);
    const u = client.users.cache.get(id) ?? (await client.users.fetch(id).catch(() => null));
    return noms.set(id, u?.username ?? null);
  }));

  return {
    total,
    page: p,
    pages: Math.max(1, Math.ceil(total / PAR)),
    lignes: lignes.map((l) => ({
      id: l.id,
      type: l.type,
      membre: { id: l.user_id, nom: noms.get(l.user_id) ?? null },
      moderateur: { id: l.moderateur_id, nom: noms.get(l.moderateur_id) ?? (l.moderateur_id === client.user?.id ? 'Wumi' : null) },
      raison: l.raison,
      duree: l.duree,
      date: l.date,
      actif: Boolean(l.actif),
    })),
  };
}

async function retirerSanction(guild, membre, id) {
  // Retirer une sanction de l'historique, c'est de la moderation : on exige
  // en plus « Moderer les membres », comme sur Discord.
  if (guild.ownerId !== membre.id && !membre.permissions.has(PermissionFlagsBits.ModerateMembers)) return { erreur: 'droits_moderation' };
  const s = req.sanctionParId.get(Number(id), guild.id);
  if (!s) return { erreur: 'introuvable' };
  req.supprimerSanction.run(s.id, guild.id);
  noterJournal(guild.id, `sanction #${s.id}`, `retirée (${s.type})`, membre.id);
  return { ok: true };
}

module.exports = { statistiques, listeRR, actionRR, publierEmbed, listeSanctions, retirerSanction, problemeRole };
