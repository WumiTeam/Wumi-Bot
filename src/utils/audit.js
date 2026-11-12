/**
 * /audit — le bilan de securite d'un serveur.
 *
 * Wumi passe en revue les roles, les salons et les reglages du serveur, puis
 * rend une note sur 100 et la liste des problemes, du plus grave au plus
 * leger. Quand un probleme se corrige sans risque, il porte un bouton
 * « Corriger » ; sinon on explique quoi faire.
 *
 * GRAVITES : critique (-25), important (-10), conseil (-3). La note ne
 * descend pas sous 0.
 *
 * L'audit peut aussi tourner seul chaque semaine dans un salon staff
 * (config.audit_salon) et prevenir si la note a baisse.
 *
 * Rien ici n'est destructeur : les corrections retirent des permissions
 * dangereuses ou durcissent un reglage, elles ne suppriment jamais un role,
 * un salon ni un webhook.
 */
const {
  PermissionFlagsBits: P, PermissionsBitField, ChannelType, ButtonBuilder, ButtonStyle,
  ActionRowBuilder, GuildVerificationLevel, GuildExplicitContentFilter,
  GuildDefaultMessageNotifications, GuildMFALevel, MessageFlags,
} = require('discord.js');
const conf = require('../../config');
const C = require('./composants');
const { db, config, majConfig } = require('../database/db');
const logger = require('./logger');

const POIDS = { critique: 25, important: 10, conseil: 3 };
const ORDRE = ['critique', 'important', 'conseil'];
const PASTILLE = { critique: '🔴', important: '🟠', conseil: '🔵' };

// Les permissions qui ne doivent JAMAIS etre donnees a @everyone.
const DANGER_EVERYONE = [
  P.Administrator, P.ManageGuild, P.ManageRoles, P.ManageChannels, P.BanMembers,
  P.KickMembers, P.ManageWebhooks, P.ManageMessages, P.ModerateMembers,
  P.ManageGuildExpressions, P.ManageNicknames, P.ViewAuditLog, P.MentionEveryone,
];
// Les permissions qui rendent un bot dangereux s'il est pirate.
const DANGER_BOT = [P.Administrator, P.ManageGuild, P.ManageRoles, P.BanMembers, P.ManageChannels, P.ManageWebhooks];
// Ce dont Wumi a besoin pour faire tout son travail.
const BESOINS_WUMI = [
  P.ManageRoles, P.ManageChannels, P.ModerateMembers, P.BanMembers, P.KickMembers,
  P.ManageMessages, P.ViewAuditLog, P.EmbedLinks, P.AttachFiles,
];

const NOM_PERM = (bit) => Object.entries(P).find(([, v]) => v === bit)?.[0] ?? String(bit);

/** Les roles que Wumi distribue lui-meme (recompenses, boutique, panneaux…). */
function rolesDistribues(guildId) {
  const ids = new Set();
  const cfg = config(guildId);
  for (const id of [cfg.role_auto, cfg.verif_role]) if (id) ids.add(id);
  const tables = [
    ['recompenses', 'role_id'], ['invitations_recompenses', 'role_id'],
    ['boutique', 'role_id'], ['candidatures_types', 'role_id'],
  ];
  for (const [table, col] of tables) {
    try {
      for (const r of db.prepare(`SELECT ${col} AS id FROM ${table} WHERE guild_id = ? AND ${col} IS NOT NULL`).all(guildId)) ids.add(r.id);
    } catch { /* table absente sur une vieille base */ }
  }
  try {
    for (const m of db.prepare('SELECT roles FROM menus_roles WHERE guild_id = ?').all(guildId)) {
      for (const r of JSON.parse(m.roles || '[]')) if (r.role_id) ids.add(r.role_id);
    }
  } catch { /* idem */ }
  return ids;
}

/**
 * Lance toutes les verifications. Renvoie { score, problemes, verifs, ok }.
 * Chaque probleme : { code, gravite, cle, vars, correctif? }
 */
async function analyser(guild) {
  const me = guild.members.me ?? await guild.members.fetchMe();
  const everyone = guild.roles.everyone;
  const problemes = [];
  let verifs = 0;
  const ajouter = (p) => problemes.push(p);
  const verif = () => { verifs += 1; };

  // 1. @everyone et les permissions dangereuses.
  verif();
  const dangerEveryone = DANGER_EVERYONE.filter((b) => everyone.permissions.has(b, false));
  if (dangerEveryone.length) {
    const admin = dangerEveryone.includes(P.Administrator);
    const seulementMention = dangerEveryone.length === 1 && dangerEveryone[0] === P.MentionEveryone;
    ajouter({
      code: 'everyone_perms',
      gravite: admin ? 'critique' : seulementMention ? 'important' : 'critique',
      cle: admin ? 'audit.p_everyone_admin' : 'audit.p_everyone_perms',
      vars: { perms: dangerEveryone.map(NOM_PERM).join(', ') },
      correctif: me.permissions.has(P.ManageRoles),
    });
  }

  // 2. Les bots (autres que Wumi) avec des permissions dangereuses.
  verif();
  await guild.members.fetch().catch(() => null);
  const botsDangereux = guild.members.cache.filter((m) => m.user.bot && m.id !== me.id
    && DANGER_BOT.some((b) => m.permissions.has(b)));
  const botsAdmin = botsDangereux.filter((m) => m.permissions.has(P.Administrator));
  if (botsAdmin.size) {
    ajouter({ code: 'bots_admin', gravite: 'important', cle: 'audit.p_bots_admin', vars: { n: botsAdmin.size, liste: botsAdmin.map((m) => m.user.username).slice(0, 8).join(', ') } });
  } else if (botsDangereux.size) {
    ajouter({ code: 'bots_perms', gravite: 'conseil', cle: 'audit.p_bots_perms', vars: { n: botsDangereux.size, liste: botsDangereux.map((m) => m.user.username).slice(0, 8).join(', ') } });
  }

  // 3. Trop d'administrateurs humains.
  verif();
  const admins = guild.members.cache.filter((m) => !m.user.bot && m.id !== guild.ownerId && m.permissions.has(P.Administrator));
  if (admins.size > 5) {
    ajouter({ code: 'trop_admins', gravite: 'conseil', cle: 'audit.p_trop_admins', vars: { n: admins.size } });
  }

  // 4. Double authentification pour la moderation.
  verif();
  if (guild.mfaLevel === GuildMFALevel.None) {
    ajouter({ code: 'mfa', gravite: 'important', cle: 'audit.p_mfa', vars: {} });
  }

  // 5. Niveau de verification.
  verif();
  if (guild.verificationLevel <= GuildVerificationLevel.Low && !config(guild.id).verif_captcha) {
    ajouter({ code: 'verif', gravite: 'important', cle: 'audit.p_verif', vars: {}, correctif: me.permissions.has(P.ManageGuild) });
  }

  // 6. Filtre de contenu explicite.
  verif();
  if (guild.explicitContentFilter === GuildExplicitContentFilter.Disabled) {
    ajouter({ code: 'filtre', gravite: 'conseil', cle: 'audit.p_filtre', vars: {}, correctif: me.permissions.has(P.ManageGuild) });
  }

  // 7. Notifications par defaut sur un gros serveur.
  verif();
  if (guild.defaultMessageNotifications === GuildDefaultMessageNotifications.AllMessages && guild.memberCount > 100) {
    ajouter({ code: 'notifs', gravite: 'conseil', cle: 'audit.p_notifs', vars: { n: guild.memberCount }, correctif: me.permissions.has(P.ManageGuild) });
  }

  // 8. Salons prives qui fuient : la categorie est cachee, le salon non.
  verif();
  const fuites = guild.channels.cache.filter((c) => {
    if (!c.parent || c.type === ChannelType.GuildCategory || c.isThread?.()) return false;
    if (c.permissionsLocked) return false;
    const catVisible = c.parent.permissionsFor(everyone)?.has(P.ViewChannel);
    const salonVisible = c.permissionsFor(everyone)?.has(P.ViewChannel);
    return catVisible === false && salonVisible === true;
  });
  if (fuites.size) {
    ajouter({ code: 'fuite', gravite: 'important', cle: 'audit.p_fuite', vars: { n: fuites.size, liste: fuites.map((c) => `<#${c.id}>`).slice(0, 10).join(', ') }, correctif: me.permissions.has(P.ManageRoles) && me.permissions.has(P.ManageChannels), cibles: fuites.map((c) => c.id) });
  }

  // 9. Salons ou @everyone peut mentionner tout le monde.
  verif();
  const mentions = guild.channels.cache.filter((c) => c.permissionOverwrites?.cache.get(everyone.id)?.allow.has(P.MentionEveryone));
  if (mentions.size) {
    ajouter({ code: 'mention', gravite: 'important', cle: 'audit.p_mention', vars: { n: mentions.size, liste: mentions.map((c) => `<#${c.id}>`).slice(0, 10).join(', ') }, correctif: me.permissions.has(P.ManageRoles) && me.permissions.has(P.ManageChannels), cibles: mentions.map((c) => c.id) });
  }

  // 10. Les roles que Wumi distribue mais ne peut pas donner (trop haut).
  verif();
  const top = me.roles.highest.position;
  const bloques = [...rolesDistribues(guild.id)].map((id) => guild.roles.cache.get(id)).filter((r) => r && r.position >= top);
  if (bloques.length) {
    ajouter({ code: 'hierarchie', gravite: 'important', cle: 'audit.p_hierarchie', vars: { n: bloques.length, liste: bloques.map((r) => `<@&${r.id}>`).slice(0, 10).join(', '), wumi: `<@&${me.roles.highest.id}>` } });
  }

  // 11. Les permissions qui manquent a Wumi.
  verif();
  const manquent = BESOINS_WUMI.filter((b) => !me.permissions.has(b));
  if (manquent.length) {
    ajouter({ code: 'wumi_perms', gravite: 'conseil', cle: 'audit.p_wumi_perms', vars: { perms: manquent.map(NOM_PERM).join(', ') } });
  }

  // 12. Webhooks crees par des membres (souvent oublies, parfois voles).
  verif();
  if (me.permissions.has(P.ManageWebhooks)) {
    const hooks = await guild.fetchWebhooks().catch(() => null);
    const humains = hooks?.filter((w) => w.owner && !w.owner.bot && !w.applicationId) ?? new Map();
    if (humains.size > 3) {
      ajouter({ code: 'webhooks', gravite: 'conseil', cle: 'audit.p_webhooks', vars: { n: humains.size } });
    }
  }

  // 13. Les protections de Wumi.
  const cfg = config(guild.id);
  verif();
  if (!cfg.log_moderation && !cfg.log_serveur) ajouter({ code: 'logs', gravite: 'conseil', cle: 'audit.p_logs', vars: {} });
  verif();
  if (!cfg.antiraid_actif) ajouter({ code: 'antiraid', gravite: 'conseil', cle: 'audit.p_antiraid', vars: {}, correctif: true });
  verif();
  if (!cfg.automod_actif) ajouter({ code: 'automod', gravite: 'conseil', cle: 'audit.p_automod', vars: {}, correctif: true });

  problemes.sort((a, b) => ORDRE.indexOf(a.gravite) - ORDRE.indexOf(b.gravite));
  const score = Math.max(0, 100 - problemes.reduce((s, p) => s + POIDS[p.gravite], 0));
  return { score, problemes, verifs, ok: verifs - problemes.length };
}

function mention(score, t) {
  if (score >= 90) return { txt: t('audit.note_excellent'), emoji: '🟢', couleur: 0x2fbf71 };
  if (score >= 70) return { txt: t('audit.note_bon'), emoji: '🟡', couleur: 0xf5c518 };
  if (score >= 45) return { txt: t('audit.note_moyen'), emoji: '🟠', couleur: conf.couleurs.avertissement };
  return { txt: t('audit.note_faible'), emoji: '🔴', couleur: conf.couleurs.erreur };
}

function barre(score) {
  const pleins = Math.round(score / 10);
  return '▰'.repeat(pleins) + '▱'.repeat(10 - pleins);
}

/** Le rapport, en Components V2. `avant` = note precedente (audit hebdo). */
function rapport(guild, resultat, t, { avant = null, prive = true } = {}) {
  const { score, problemes, verifs, ok } = resultat;
  const m = mention(score, t);
  const blocs = [
    C.texte(`## 🛡️ ${t('audit.titre')} · ${guild.name}`),
    C.texte(`### ${m.emoji} ${score}/100 · ${m.txt}\n\`${barre(score)}\`\n-# ${t('audit.resume', { ok, total: verifs })}`),
  ];
  if (avant != null && avant !== score) {
    blocs.push(C.texte(score < avant ? `⚠️ ${t('audit.baisse', { avant, apres: score })}` : `📈 ${t('audit.hausse', { avant, apres: score })}`));
  }

  if (!problemes.length) {
    blocs.push(C.separateur(), C.texte(`✅ ${t('audit.parfait')}`));
  }

  let boutons = 0;
  for (const g of ORDRE) {
    const liste = problemes.filter((p) => p.gravite === g);
    if (!liste.length) continue;
    blocs.push(C.separateur(), C.texte(`**${PASTILLE[g]} ${t(`audit.gravite_${g}`)}** · ${liste.length}`));
    for (const p of liste) {
      const contenu = t(p.cle, p.vars);
      if (p.correctif && boutons < 15) {
        boutons += 1;
        blocs.push(C.sectionBouton(contenu, new ButtonBuilder()
          .setCustomId(`aud_fix:${p.code}`)
          .setLabel(t('audit.corriger'))
          .setStyle(g === 'critique' ? ButtonStyle.Danger : ButtonStyle.Secondary)));
      } else {
        blocs.push(C.texte(contenu));
      }
    }
  }

  blocs.push(C.separateur(), new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('aud_relancer').setLabel(t('audit.relancer')).setEmoji('🔄').setStyle(ButtonStyle.Primary)
  ));
  blocs.push(C.texte(`-# ${t('audit.pied')}`));

  const charge = { components: [C.conteneur(blocs, m.couleur)], flags: MessageFlags.IsComponentsV2, allowedMentions: { parse: [] } };
  if (prive) charge.flags |= MessageFlags.Ephemeral;
  return charge;
}

/** Applique une correction. Renvoie la cle de message de succes. */
async function corriger(guild, code, raison) {
  const everyone = guild.roles.everyone;
  switch (code) {
    case 'everyone_perms': {
      const perms = new PermissionsBitField(everyone.permissions).remove(DANGER_EVERYONE);
      await everyone.setPermissions(perms, raison);
      return 'audit.fix_everyone';
    }
    case 'verif':
      await guild.setVerificationLevel(GuildVerificationLevel.Medium, raison);
      return 'audit.fix_verif';
    case 'filtre':
      await guild.setExplicitContentFilter(GuildExplicitContentFilter.AllMembers, raison);
      return 'audit.fix_filtre';
    case 'notifs':
      await guild.setDefaultMessageNotifications(GuildDefaultMessageNotifications.OnlyMentions, raison);
      return 'audit.fix_notifs';
    case 'fuite': {
      const r = await analyser(guild);
      const p = r.problemes.find((x) => x.code === 'fuite');
      for (const id of p?.cibles ?? []) await guild.channels.cache.get(id)?.lockPermissions().catch(() => null);
      return 'audit.fix_fuite';
    }
    case 'mention': {
      const r = await analyser(guild);
      const p = r.problemes.find((x) => x.code === 'mention');
      for (const id of p?.cibles ?? []) {
        await guild.channels.cache.get(id)?.permissionOverwrites.edit(everyone, { MentionEveryone: null }, { reason: raison }).catch(() => null);
      }
      return 'audit.fix_mention';
    }
    case 'antiraid':
      majConfig(guild.id, { antiraid_actif: 1 });
      return 'audit.fix_antiraid';
    case 'automod':
      majConfig(guild.id, { automod_actif: 1 });
      return 'audit.fix_automod';
    default:
      throw new Error('correctif inconnu');
  }
}

/** Les boutons du rapport (prefixe aud_). */
async function gererInteraction(interaction) {
  const { t } = require('./langues').traducteur(interaction);
  const guild = interaction.guild;
  if (!guild) return;
  if (!interaction.memberPermissions?.has(P.ManageGuild)) {
    return interaction.reply(C.erreurPrivee(t('audit.reserve')));
  }

  const prive = interaction.message?.flags?.has(MessageFlags.Ephemeral) ?? true;
  if (interaction.customId === 'aud_relancer') {
    await interaction.deferUpdate();
    const r = await analyser(guild);
    return interaction.editReply(rapport(guild, r, t, { prive }));
  }

  const code = interaction.customId.split(':')[1];
  // Toucher aux roles demande aussi de pouvoir le faire soi-meme.
  if (['everyone_perms', 'fuite', 'mention'].includes(code) && !interaction.memberPermissions.has(P.ManageRoles)) {
    return interaction.reply(C.erreurPrivee(t('audit.reserve_roles')));
  }
  await interaction.deferUpdate();
  let cle;
  try {
    cle = await corriger(guild, code, t('audit.raison', { membre: interaction.user.username }));
  } catch (e) {
    logger.debug('Audit : correction impossible —', e.message);
    return interaction.followUp(C.erreurPrivee(t('audit.fix_echec')));
  }
  const r = await analyser(guild);
  await interaction.editReply(rapport(guild, r, t, { prive }));
  return interaction.followUp(C.succesPrive(t(cle)));
}

/** L'audit hebdomadaire, appele toutes les heures depuis ready.js. */
async function tourHebdo(client) {
  const SEMAINE = 7 * 24 * 3_600_000;
  for (const guild of client.guilds.cache.values()) {
    const cfg = config(guild.id);
    if (!cfg.audit_salon) continue;
    if (cfg.audit_date && Date.now() - cfg.audit_date < SEMAINE) continue;
    const salon = guild.channels.cache.get(cfg.audit_salon);
    if (!salon?.isTextBased?.()) continue;
    try {
      const { t } = require('./langues').traducteur(guild);
      const r = await analyser(guild);
      await salon.send(rapport(guild, r, t, { avant: cfg.audit_score ?? null, prive: false }));
      majConfig(guild.id, { audit_score: r.score, audit_date: Date.now() });
    } catch (e) {
      logger.debug(`Audit hebdo (${guild.id}) —`, e.message);
      majConfig(guild.id, { audit_date: Date.now() });
    }
  }
}

module.exports = { analyser, rapport, corriger, gererInteraction, tourHebdo, mention, rolesDistribues, DANGER_EVERYONE };
