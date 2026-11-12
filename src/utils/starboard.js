/**
 * Le STARBOARD : un message qui recoit assez de ⭐ est republie dans un salon
 * « meilleurs messages ».
 *
 *  - on ne compte ni l'auteur (s'etoiler soi-meme ne compte pas) ni les bots ;
 *  - le compteur du message republie se met a jour a chaque etoile ;
 *  - s'il redescend sous le seuil, le message republie est retire ;
 *  - un message d'un salon NSFW n'est jamais republie dans un salon qui ne
 *    l'est pas ;
 *  - les etoiles posees dans le salon starboard lui-meme sont ignorees.
 *
 * Les evenements sont traites un par un par message : dix etoiles en une
 * seconde ne creent pas dix messages republies.
 */
const {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits, MessageFlags,
} = require('discord.js');
const { db, config } = require('../database/db');
const C = require('./composants');
const logger = require('./logger');

db.exec(`
CREATE TABLE IF NOT EXISTS starboard (
  guild_id    TEXT NOT NULL,
  message_id  TEXT NOT NULL,
  channel_id  TEXT NOT NULL,
  star_id     TEXT,
  nombre      INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (guild_id, message_id)
);
`);
const q = {
  lire: db.prepare('SELECT * FROM starboard WHERE guild_id = ? AND message_id = ?'),
  ecrire: db.prepare(`
    INSERT INTO starboard (guild_id, message_id, channel_id, star_id, nombre) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(guild_id, message_id) DO UPDATE SET star_id = excluded.star_id, nombre = excluded.nombre
  `),
  supprimer: db.prepare('DELETE FROM starboard WHERE guild_id = ? AND message_id = ?'),
  top: db.prepare('SELECT COUNT(*) AS n, MAX(nombre) AS max FROM starboard WHERE guild_id = ? AND star_id IS NOT NULL'),
};

const OR = 0xf5b301;

/** La reaction correspond-elle a l'emoji choisi ? (unicode, ou <:nom:id>) */
function memeEmoji(reaction, choisi) {
  const voulu = String(choisi || '⭐').trim();
  const perso = voulu.match(/:(\d{17,20})>$/);
  if (perso) return reaction.emoji.id === perso[1];
  return !reaction.emoji.id && reaction.emoji.name === voulu;
}

/** Le message republie, en Components V2. */
function construire(message, nombre, emoji, t) {
  const auteur = message.member?.displayName ?? message.author?.username ?? '?';
  const avatar = message.author?.displayAvatarURL?.({ size: 128, extension: 'png' }) ?? null;
  const entete = `**${auteur}** · <#${message.channel.id}>`;
  const texte = (message.content ?? '').trim().slice(0, 3500);

  const blocs = [C.texte(`### ${emoji} ${nombre}`)];
  blocs.push(avatar ? C.sectionVignette(`${entete}${texte ? `\n${texte}` : ''}`, avatar) : C.texte(`${entete}${texte ? `\n${texte}` : ''}`));

  // La premiere image : piece jointe ou image d'un embed.
  const image = [...(message.attachments?.values?.() ?? [])].find((a) => a.contentType?.startsWith('image/'))?.url
    ?? message.embeds?.find((e) => e.image?.url || e.thumbnail?.url)?.image?.url
    ?? null;
  if (image) blocs.push(C.image(image));

  blocs.push(new ActionRowBuilder().addComponents(
    new ButtonBuilder().setStyle(ButtonStyle.Link).setURL(message.url).setLabel(t('starboard.aller'))
  ));
  blocs.push(C.texte(`-# <t:${Math.floor(message.createdTimestamp / 1000)}:f>`));
  return { components: [C.conteneur(blocs, OR)], flags: MessageFlags.IsComponentsV2, allowedMentions: { parse: [] } };
}

const files = new Map();
function enFile(cle, travail) {
  const avant = files.get(cle) ?? Promise.resolve();
  const suite = avant.then(travail, travail);
  files.set(cle, suite.catch(() => null));
  suite.finally(() => {
    if (files.get(cle) === suite) files.delete(cle);
  }).catch(() => null);
  return suite;
}

/** Appele a chaque ajout ou retrait de reaction. */
async function traiter(reaction) {
  try {
    if (reaction.partial) reaction = await reaction.fetch();
  } catch {
    return;
  }
  const message = reaction.message.partial ? await reaction.message.fetch().catch(() => null) : reaction.message;
  const guild = message?.guild;
  if (!guild) return;
  const cfg = config(guild.id);
  if (!cfg.starboard_salon || !memeEmoji(reaction, cfg.starboard_emoji)) return;
  if (message.channel.id === cfg.starboard_salon || message.author?.bot) return;

  return enFile(`${guild.id}:${message.id}`, async () => {
    const salon = guild.channels.cache.get(cfg.starboard_salon);
    if (!salon?.isTextBased?.()) return;
    if (!salon.permissionsFor(guild.members.me)?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages])) return;
    if (message.channel.nsfw && !salon.nsfw) return;

    // Le vrai nombre : sans l'auteur et sans les bots.
    const actuelle = message.reactions.cache.find((r) => memeEmoji(r, cfg.starboard_emoji));
    let nombre = 0;
    if (actuelle) {
      const users = await actuelle.users.fetch({ limit: 100 }).catch(() => null);
      nombre = users ? users.filter((u) => !u.bot && u.id !== message.author?.id).size : actuelle.count;
    }

    const { t } = require('./langues').traducteur(guild);
    const deja = q.lire.get(guild.id, message.id);
    const seuil = Math.max(1, cfg.starboard_seuil ?? 3);
    const emoji = cfg.starboard_emoji || '⭐';

    if (nombre >= seuil) {
      const charge = construire(message, nombre, emoji, t);
      if (deja?.star_id) {
        const ancien = await salon.messages.fetch(deja.star_id).catch(() => null);
        if (ancien) {
          await ancien.edit({ components: charge.components }).catch(() => null);
          q.ecrire.run(guild.id, message.id, message.channel.id, deja.star_id, nombre);
          return;
        }
      }
      const envoye = await salon.send(charge).catch((e) => {
        logger.debug('Starboard : envoi impossible —', e.message);
        return null;
      });
      if (envoye) q.ecrire.run(guild.id, message.id, message.channel.id, envoye.id, nombre);
      return;
    }

    // Sous le seuil : on retire la republication s'il y en avait une.
    if (deja?.star_id) {
      await salon.messages.delete(deja.star_id).catch(() => null);
      q.supprimer.run(guild.id, message.id);
    }
  });
}

/** Le message d'origine est supprime : la republication aussi. */
async function messageSupprime(guild, messageId) {
  const deja = q.lire.get(guild.id, messageId);
  if (!deja) return;
  q.supprimer.run(guild.id, messageId);
  const salon = guild.channels.cache.get(config(guild.id).starboard_salon);
  if (salon && deja.star_id) await salon.messages.delete(deja.star_id).catch(() => null);
}

module.exports = { traiter, messageSupprime, memeEmoji, construire, resume: (g) => q.top.get(g) };
