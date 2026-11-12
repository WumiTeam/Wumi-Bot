const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const conf = require('../../config');
const { req, config } = require('../database/db');
const { envoyerLog } = require('./logs');
const { ts } = require('./outils');
const logger = require('./logger');
const { E } = require('./emojis');

const JOUR = 86_400_000;

/**
 * Cache des invitations par serveur : Map<guildId, Map<code, { uses, inviteur }>>.
 * On compare l'etat avant/apres une arrivee pour deviner l'invitation utilisee.
 */
const cache = new Map();

/** Recharge le cache des invitations d'un serveur. */
async function rafraichirCache(guild) {
  if (!guild.members.me?.permissions.has(PermissionFlagsBits.ManageGuild)) return null;
  try {
    const invitations = await guild.invites.fetch();
    const carte = new Map();
    for (const inv of invitations.values()) {
      carte.set(inv.code, { uses: inv.uses ?? 0, inviteur: inv.inviter?.id ?? null });
    }
    // L'URL personnalisee du serveur (serveurs partenaires / niveau 3)
    if (guild.vanityURLCode) {
      const vanity = await guild.fetchVanityData().catch(() => null);
      if (vanity) carte.set(`vanity:${guild.vanityURLCode}`, { uses: vanity.uses ?? 0, inviteur: null });
    }
    cache.set(guild.id, carte);
    return carte;
  } catch (e) {
    logger.avertissement(`Cache des invitations de ${guild.name} :`, e.message);
    return null;
  }
}

/** Charge le cache de tous les serveurs au demarrage. */
async function initialiser(client) {
  for (const guild of client.guilds.cache.values()) {
    if (config(guild.id).invitations_actif) await rafraichirCache(guild);
  }
  logger.info(`Invitations mises en cache pour ${cache.size} serveur(s).`);
}

/**
 * Determine quelle invitation vient d'etre utilisee, en comparant
 * le nombre d'utilisations avant et apres l'arrivee du membre.
 */
async function detecterInvitation(guild) {
  const avant = cache.get(guild.id);
  const apres = await rafraichirCache(guild);
  if (!avant || !apres) return null;

  for (const [code, donnees] of apres) {
    const precedent = avant.get(code);
    if (precedent && donnees.uses > precedent.uses) return { code, inviteur: donnees.inviteur };
  }
  // Invitation a usage unique : elle a disparu apres avoir servi
  for (const [code, donnees] of avant) {
    if (!apres.has(code)) return { code, inviteur: donnees.inviteur };
  }
  return null;
}

/** Total effectif d'un membre : invitations valides + bonus manuel. */
function totalDe(guildId, userId) {
  const stats = req.statsInvitations.get(guildId, userId);
  const bonus = req.bonusInvitations.get(guildId, userId)?.bonus ?? 0;
  return {
    valides: stats.valides,
    partis: stats.partis,
    faux: stats.faux,
    bonus,
    total: stats.valides + bonus,
  };
}

/** Attribue les roles-recompenses correspondant au nombre d'invitations. */
async function appliquerRecompenses(membre, total) {
  const paliers = req.recompensesInvitJusqua.all(membre.guild.id, total);
  const ajoutes = [];
  for (const p of paliers) {
    const role = membre.guild.roles.cache.get(p.role_id);
    if (!role || !role.editable || membre.roles.cache.has(role.id)) continue;
    try {
      await membre.roles.add(role, `Recompense : ${p.palier} invitations`);
      ajoutes.push(role);
    } catch {
      /* hierarchie insuffisante */
    }
  }
  return ajoutes;
}

/**
 * Traite l'arrivee d'un membre : identifie l'inviteur, enregistre,
 * applique les recompenses et annonce dans le salon configure.
 */
async function traiterArrivee(membre) {
  const guild = membre.guild;
  const cfg = config(guild.id);
  if (!cfg.invitations_actif) return;

  const trouve = await detecterInvitation(guild);
  const ageCompte = Date.now() - membre.user.createdTimestamp;
  const faux = cfg.invitations_age_min > 0 && ageCompte < cfg.invitations_age_min * JOUR ? 1 : 0;

  req.enregistrerArrivee.run({
    guild_id: guild.id,
    user_id: membre.id,
    inviteur_id: trouve?.inviteur ?? null,
    code: trouve?.code ?? null,
    faux,
    date: Date.now(),
  });

  if (!trouve?.inviteur) return;

  // Les faux comptes ne comptent pas comme mission accomplie.
  if (!faux) require('./missions').noter(guild.id, trouve.inviteur, 'invitation', 1);

  const stats = totalDe(guild.id, trouve.inviteur);
  const inviteur = await guild.members.fetch(trouve.inviteur).catch(() => null);
  const roles = inviteur ? await appliquerRecompenses(inviteur, stats.total).catch(() => []) : [];

  const tj = (cle, v) => require('./langues').traducteur(guild).t(cle, v);
  const embed = new EmbedBuilder()
    .setColor(conf.couleurs.succes)
    .setAuthor({ name: `${E('invitations')} ${tj('journal.arrivee_titre', { nom: membre.user.tag })}`, iconURL: membre.user.displayAvatarURL() || undefined })
    .setDescription(
      [
        tj('journal.invite_par', { membre: `${membre}`, inviteur: `<@${trouve.inviteur}>` }),
        tj('journal.invite_total', { n: stats.total }),
        faux ? `${E('avertissement')} ${tj('journal.invite_suspect', { quand: ts(membre.user.createdTimestamp, 'R') })}` : null,
        roles.length ? `${E('cadeau')} ${tj('journal.invite_debloque', { roles: roles.map((r) => `<@&${r.id}>`).join(', ') })}` : null,
      ]
        .filter(Boolean)
        .join('\n')
    )
    .setFooter({ text: `Code · ${trouve.code}` })
    .setTimestamp();

  const salon = cfg.invitations_salon ? guild.channels.cache.get(cfg.invitations_salon) : null;
  if (salon?.isTextBased()) await salon.send({ embeds: [embed] }).catch(() => null);
  else await envoyerLog(guild, 'membres', embed);
}

/** Marque une arrivee comme "partie" quand le membre quitte le serveur. */
async function traiterDepart(membre) {
  const cfg = config(membre.guild.id);
  if (!cfg.invitations_actif) return;

  const arrivee = req.arriveeDe.get(membre.guild.id, membre.id);
  if (!arrivee?.inviteur_id || arrivee.parti) return;

  req.marquerParti.run(membre.guild.id, membre.id);

  const salon = cfg.invitations_salon ? membre.guild.channels.cache.get(cfg.invitations_salon) : null;
  if (!salon?.isTextBased()) return;

  const stats = totalDe(membre.guild.id, arrivee.inviteur_id);
  await salon
    .send({
      embeds: [
        new EmbedBuilder()
          .setColor(conf.couleurs.erreur)
          .setAuthor({ name: `${E('porte')} ${membre.user.tag} est parti`, iconURL: membre.user.displayAvatarURL() || undefined })
          .setDescription(
            `Invité par <@${arrivee.inviteur_id}>, arrivé ${ts(arrivee.date, 'R')}.\nIl lui reste **${stats.total}** invitation${
              stats.total > 1 ? 's' : ''
            }.`
          )
          .setTimestamp(),
      ],
    })
    .catch(() => null);
}

module.exports = { cache, rafraichirCache, initialiser, detecterInvitation, totalDe, appliquerRecompenses, traiterArrivee, traiterDepart };
