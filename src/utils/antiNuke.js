/**
 * ANTI-NUKE — quand quelqu'un DE L'INTERIEUR casse le serveur.
 *
 * L'anti-raid protege contre les vagues d'arrivees. L'anti-nuke protege
 * contre l'autre attaque classique : un admin pirate (ou un bot ajoute trop
 * vite) qui supprime les salons et les roles et bannit tout le monde en
 * quelques secondes.
 *
 * COMMENT ON VOIT L'ATTAQUE
 * Le journal d'audit (evenement GuildAuditLogEntryCreate) dit QUI a fait
 * quoi. On compte, par auteur, les actions destructrices sur une fenetre
 * glissante (antinuke_fenetre secondes). Chaque action a un poids :
 * supprimer un salon ou un role, bannir, expulser = 1 ; creer un salon, un
 * role ou un webhook, supprimer un emoji = 0,5 (le spam de creation est aussi
 * une attaque, mais plus lente) ; donner la permission Administrateur a un
 * role = 2 ; un « prune » de membres = le seuil d'un coup.
 * Au seuil (antinuke_seuil), on agit, une seule fois par auteur et par
 * tranche de 5 minutes.
 *
 * CE QU'ON FAIT
 *   - un BOT est toujours expulse (ou banni si la sanction est « ban ») :
 *     son role gere ne peut pas lui etre retire ;
 *   - un humain perd tous les roles que Wumi peut retirer (sanction par
 *     defaut « roles », reversible), ou est expulse / banni ;
 *   - le proprietaire recoit un MP, et le salon d'alerte un rapport complet,
 *     avec la commande pour tout remettre en place (/structure reparer).
 *
 * QUI EST EPARGNE
 * Le proprietaire, Wumi lui-meme et la liste de confiance (antinuke_confiance,
 * des identifiants de membres ou de bots). Seul le proprietaire configure
 * l'anti-nuke : un admin pirate ne doit pas pouvoir le couper.
 */
const { AuditLogEvent, PermissionFlagsBits } = require('discord.js');
const conf = require('../../config');
const C = require('./composants');
const { config } = require('../database/db');
const { traducteur } = require('./langues');
const logger = require('./logger');

const POIDS = {
  [AuditLogEvent.ChannelDelete]: { poids: 1, cle: 'salon_supprime' },
  [AuditLogEvent.RoleDelete]: { poids: 1, cle: 'role_supprime' },
  [AuditLogEvent.MemberBanAdd]: { poids: 1, cle: 'ban' },
  [AuditLogEvent.MemberKick]: { poids: 1, cle: 'kick' },
  [AuditLogEvent.ChannelCreate]: { poids: 0.5, cle: 'salon_cree' },
  [AuditLogEvent.RoleCreate]: { poids: 0.5, cle: 'role_cree' },
  [AuditLogEvent.WebhookCreate]: { poids: 0.5, cle: 'webhook' },
  [AuditLogEvent.EmojiDelete]: { poids: 0.5, cle: 'emoji_supprime' },
};
const COOLDOWN_MS = 5 * 60_000;

// `${guildId}-${auteurId}` -> [{ t, poids, cle, cible }]
const historique = new Map();
// `${guildId}-${auteurId}` -> timestamp de la derniere riposte
const ripostes = new Map();

function confiance(cfg) {
  try {
    const l = JSON.parse(cfg.antinuke_confiance || '[]');
    return Array.isArray(l) ? l : [];
  } catch {
    return [];
  }
}

/** Le poids d'une entree du journal, ou null si elle ne nous interesse pas. */
function evaluer(entree, seuil) {
  if (POIDS[entree.action]) return POIDS[entree.action];
  if (entree.action === AuditLogEvent.MemberPrune) return { poids: seuil, cle: 'prune' };
  // Un role qui gagne la permission Administrateur.
  if (entree.action === AuditLogEvent.RoleUpdate) {
    const perm = entree.changes?.find((c) => c.key === 'permissions');
    if (perm) {
      const avant = BigInt(perm.old ?? 0);
      const apres = BigInt(perm.new ?? 0);
      const admin = PermissionFlagsBits.Administrator;
      if (!(avant & admin) && (apres & admin)) return { poids: 2, cle: 'admin_donne' };
    }
  }
  return null;
}

/** Nom lisible de la cible (salon supprime, membre banni…). */
function nomCible(entree) {
  const nom = entree.changes?.find((c) => c.key === 'name')?.old ?? entree.target?.name ?? entree.target?.tag ?? entree.target?.username;
  return nom ? String(nom).slice(0, 40) : (entree.targetId ? `ID ${entree.targetId}` : null);
}

/** Point d'entree : une nouvelle ligne dans le journal d'audit. */
async function surEntree(entree, guild) {
  if (!guild || !entree?.executorId) return;
  let cfg;
  try { cfg = config(guild.id); } catch { return; }
  if (!cfg.antinuke_actif) return;

  const auteurId = entree.executorId;
  if (auteurId === guild.ownerId || auteurId === guild.client.user.id) return;
  if (confiance(cfg).includes(auteurId)) return;

  const seuil = Math.max(2, cfg.antinuke_seuil ?? 4);
  const action = evaluer(entree, seuil);
  if (!action) return;

  const cle = `${guild.id}-${auteurId}`;
  const maintenant = Date.now();
  const fenetre = Math.max(5, cfg.antinuke_fenetre ?? 15) * 1000;
  const liste = (historique.get(cle) ?? []).filter((a) => maintenant - a.t < fenetre);
  liste.push({ t: maintenant, poids: action.poids, cle: action.cle, cible: nomCible(entree) });
  historique.set(cle, liste);

  const total = liste.reduce((s, a) => s + a.poids, 0);
  if (total < seuil) return;
  if (maintenant - (ripostes.get(cle) ?? 0) < COOLDOWN_MS) return;
  ripostes.set(cle, maintenant);

  await riposter(guild, auteurId, liste, cfg).catch((e) => logger.erreur('Anti-nuke :', e.message));
}

/** Neutralise l'auteur et previent. */
async function riposter(guild, auteurId, actions, cfg) {
  const { t } = traducteur(guild.id);
  const membre = await guild.members.fetch(auteurId).catch(() => null);
  const estBot = membre?.user?.bot ?? false;
  const sanction = cfg.antinuke_sanction ?? 'roles';
  const raison = t('antinuke.raison');
  let resultat;

  try {
    if (!membre) {
      resultat = t('antinuke.res_parti');
    } else if (sanction === 'ban') {
      await guild.members.ban(auteurId, { reason: raison });
      resultat = t('antinuke.res_banni');
    } else if (estBot || sanction === 'kick') {
      await membre.kick(raison);
      resultat = t(estBot ? 'antinuke.res_bot_expulse' : 'antinuke.res_expulse');
    } else {
      const gardes = membre.roles.cache.filter((r) => r.managed || !r.editable || r.id === guild.id);
      const retires = membre.roles.cache.size - gardes.size;
      await membre.roles.set(gardes.map((r) => r.id), raison);
      const restants = gardes.filter((r) => r.id !== guild.id && !r.managed && r.permissions.has(PermissionFlagsBits.Administrator));
      resultat = t('antinuke.res_roles', { n: retires }) + (restants.size ? `\n${t('antinuke.res_roles_restants', { roles: restants.map((r) => r.name).join(', ') })}` : '');
    }
  } catch (e) {
    resultat = t('antinuke.res_echec', { erreur: e.message });
  }

  // Le detail : combien de quoi, et quelques cibles.
  const parType = new Map();
  for (const a of actions) {
    const e = parType.get(a.cle) ?? { n: 0, cibles: [] };
    e.n += 1;
    if (a.cible) e.cibles.push(a.cible);
    parType.set(a.cle, e);
  }
  const detail = [...parType.entries()].map(([k, e]) => {
    const cibles = e.cibles.slice(0, 4).map((c) => `\`${c}\``).join(', ');
    return `• ${t(`antinuke.type.${k}`)} ×${e.n}${cibles ? ` — ${cibles}` : ''}`;
  }).join('\n');

  const structure = require('./structure');
  const photo = structure.lister(guild.id, 1)[0];
  const reparer = photo
    ? t('antinuke.reparer_photo', { n: photo.id, date: `<t:${Math.floor(photo.cree_le / 1000)}:R>` })
    : t('antinuke.reparer_sans_photo');

  const qui = membre ? `<@${auteurId}> · \`${membre.user.username}\`${estBot ? ' 🤖' : ''} · \`${auteurId}\`` : `\`${auteurId}\``;
  const rapport = C.envoi([C.conteneur([
    C.texte(`## 🚨 ${t('antinuke.titre')}\n${t('antinuke.intro', { serveur: guild.name })}`),
    C.separateur(),
    C.texte(`**${t('antinuke.auteur')}**\n${qui}`),
    C.texte(`**${t('antinuke.actions', { n: actions.length, s: Math.round((actions.at(-1).t - actions[0].t) / 1000) })}**\n${detail}`),
    C.texte(`**${t('antinuke.mesure')}**\n${resultat}`),
    C.separateur(),
    C.texte(`**${t('antinuke.ensuite')}**\n${reparer}`),
  ], conf.couleurs.erreur)]);

  const salon = cfg.antinuke_salon ? guild.channels.cache.get(cfg.antinuke_salon) : null;
  if (salon?.isTextBased()) await salon.send(rapport).catch(() => null);
  const proprio = await guild.fetchOwner().catch(() => null);
  if (proprio && proprio.id !== auteurId) await proprio.send(rapport).catch(() => null);
  logger.avertissement(`Anti-nuke sur ${guild.name} : ${auteurId} (${actions.length} actions) -> ${sanction}`);
}

/** Ce qu'il faut pour que l'anti-nuke marche, pour /antinuke voir. */
function diagnostic(guild) {
  const moi = guild.members.me;
  const plusHaut = guild.roles.cache.filter((r) => r.id !== guild.id).sort((a, b) => b.position - a.position).first();
  return {
    journal: moi?.permissions.has(PermissionFlagsBits.ViewAuditLog) ?? false,
    roles: moi?.permissions.has(PermissionFlagsBits.ManageRoles) ?? false,
    expulser: moi?.permissions.has([PermissionFlagsBits.KickMembers, PermissionFlagsBits.BanMembers]) ?? false,
    enHaut: Boolean(moi && plusHaut && moi.roles.highest.id === plusHaut.id),
  };
}

// Pour les tests
function _reinitialiser() {
  historique.clear();
  ripostes.clear();
}

module.exports = { surEntree, riposter, evaluer, diagnostic, confiance, POIDS, _reinitialiser };
