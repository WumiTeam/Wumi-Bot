/**
 * /lfg — RECHERCHE DE JOUEURS.
 *
 *  - une annonce avec le jeu, le nombre de places, et un bouton Rejoindre ;
 *  - quand le groupe est complet, Wumi cree un salon vocal reserve au groupe
 *    (dans la categorie du salon de l'annonce) et mentionne tout le monde ;
 *  - le vocal est supprime quand il reste vide plus de 5 minutes ;
 *  - une annonce qui ne se remplit pas expire (2 h par defaut).
 *
 * Composants : prefixe « lfg_ ». Taches : tour() chaque minute (ready.js).
 */
const {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, MessageFlags, PermissionFlagsBits, escapeMarkdown,
} = require('discord.js');
const C = require('./composants');
const { db } = require('../database/db');
const logger = require('./logger');

db.exec(`
CREATE TABLE IF NOT EXISTS lfg (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id    TEXT NOT NULL,
  channel_id  TEXT NOT NULL,
  message_id  TEXT,
  hote        TEXT NOT NULL,
  jeu         TEXT NOT NULL,
  details     TEXT,
  places      INTEGER NOT NULL,
  membres     TEXT NOT NULL DEFAULT '[]',
  vocal_id    TEXT,
  statut      TEXT NOT NULL DEFAULT 'ouvert',  -- ouvert | complet | ferme | expire | fini
  cree_le     INTEGER NOT NULL,
  expire_le   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_lfg_statut ON lfg (statut);
`);

const q = {
  creer: db.prepare('INSERT INTO lfg (guild_id, channel_id, hote, jeu, details, places, membres, cree_le, expire_le) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'),
  lire: db.prepare('SELECT * FROM lfg WHERE id = ?'),
  message: db.prepare('UPDATE lfg SET message_id = ? WHERE id = ?'),
  membres: db.prepare('UPDATE lfg SET membres = ? WHERE id = ?'),
  statut: db.prepare('UPDATE lfg SET statut = ? WHERE id = ?'),
  vocal: db.prepare("UPDATE lfg SET vocal_id = ?, statut = 'complet' WHERE id = ?"),
  ouvertsDe: db.prepare("SELECT id FROM lfg WHERE guild_id = ? AND hote = ? AND statut = 'ouvert'"),
  expires: db.prepare("SELECT * FROM lfg WHERE statut = 'ouvert' AND expire_le <= ?"),
  vocaux: db.prepare("SELECT * FROM lfg WHERE statut = 'complet' AND vocal_id IS NOT NULL"),
};

const COULEUR = 0x7c5cff;
const videDepuis = new Map(); // vocal_id -> timestamp

function construire(e, t) {
  const membres = JSON.parse(e.membres);
  const ouvert = e.statut === 'ouvert';
  const restant = e.places - membres.length;
  const etat = {
    ouvert: t('lfg.etat_ouvert', { n: restant }),
    complet: `✅ ${t('lfg.etat_complet')}${e.vocal_id ? ` · <#${e.vocal_id}>` : ''}`,
    ferme: `🔒 ${t('lfg.etat_ferme')}`,
    expire: `⌛ ${t('lfg.etat_expire')}`,
    fini: `🏁 ${t('lfg.etat_fini')}`,
  }[e.statut];
  const cases = Array.from({ length: e.places }, (_, i) => (membres[i] ? `\`${i + 1}\` <@${membres[i]}>${membres[i] === e.hote ? ' 👑' : ''}` : `\`${i + 1}\` ${t('lfg.libre')}`));
  const blocs = [
    C.texte(`## 🎮 ${escapeMarkdown(e.jeu)}${e.details ? `\n${escapeMarkdown(e.details)}` : ''}`),
    C.texte(`**${etat}**`),
    C.texte(cases.join('\n')),
    C.texte(`-# ${t('lfg.pied', { membre: `<@${e.hote}>` })}${ouvert ? ` · ${t('lfg.expire', { quand: `<t:${Math.floor(e.expire_le / 1000)}:R>` })}` : ''}`),
  ];
  if (ouvert) {
    blocs.push(new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`lfg_in:${e.id}`).setEmoji('🎮').setLabel(t('lfg.btn_rejoindre')).setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`lfg_out:${e.id}`).setLabel(t('lfg.btn_quitter')).setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`lfg_fermer:${e.id}`).setEmoji('🔒').setStyle(ButtonStyle.Danger),
    ));
  }
  return { components: [C.conteneur(blocs, ouvert ? COULEUR : 0x80869c)], flags: MessageFlags.IsComponentsV2, allowedMentions: { parse: [] } };
}

function traduction(guild) {
  return require('./langues').traducteur(guild).t;
}

async function publier(salon, { hote, jeu, details, places, dureeMin }, t) {
  // Une seule annonce ouverte a la fois par personne : l'ancienne est fermee.
  for (const { id } of q.ouvertsDe.all(salon.guild.id, hote)) {
    q.statut.run('ferme', id);
    await majMessage(salon.client, q.lire.get(id));
  }
  const maintenant = Date.now();
  const r = q.creer.run(salon.guild.id, salon.id, hote, jeu, details ?? null, places, JSON.stringify([hote]), maintenant, maintenant + dureeMin * 60_000);
  const e = q.lire.get(Number(r.lastInsertRowid));
  const msg = await salon.send(construire(e, t));
  q.message.run(msg.id, e.id);
  return { ...e, message_id: msg.id };
}

async function majMessage(client, e) {
  if (!e?.message_id) return;
  const salon = client.guilds.cache.get(e.guild_id)?.channels.cache.get(e.channel_id);
  if (!salon) return;
  await salon.messages.edit(e.message_id, { components: construire(e, traduction(salon.guild)).components }).catch(() => null);
}

/** Le groupe est complet : un vocal reserve, et on previent tout le monde. */
async function completer(interaction, e, t) {
  const guild = interaction.guild;
  const membres = JSON.parse(e.membres);
  const salonAnnonce = guild.channels.cache.get(e.channel_id);
  const me = guild.members.me;
  let vocal = null;
  if (me.permissions.has([PermissionFlagsBits.ManageChannels, PermissionFlagsBits.MoveMembers])) {
    vocal = await guild.channels.create({
      name: `🎮 ${e.jeu}`.slice(0, 90),
      type: ChannelType.GuildVoice,
      parent: salonAnnonce?.parentId ?? null,
      userLimit: Math.min(99, e.places),
      permissionOverwrites: [
        { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.Connect] },
        { id: me.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.MoveMembers] },
        ...membres.map((id) => ({ id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak] })),
      ],
      reason: `LFG #${e.id} complet`,
    }).catch((err) => {
      logger.debug('LFG : vocal impossible —', err.message);
      return null;
    });
  }
  if (vocal) {
    q.vocal.run(vocal.id, e.id);
    videDepuis.set(vocal.id, Date.now());
  } else {
    q.statut.run('complet', e.id);
  }
  const maj = q.lire.get(e.id);
  await majMessage(interaction.client, maj);
  await interaction.channel.send({
    content: `🎮 ${t(vocal ? 'lfg.complet_vocal' : 'lfg.complet_sans_vocal', { jeu: escapeMarkdown(e.jeu), vocal: vocal ? `${vocal}` : '' })}\n${membres.map((id) => `<@${id}>`).join(' ')}`,
    allowedMentions: { users: membres },
  }).catch(() => null);
}

async function gererInteraction(interaction) {
  const t = require('./langues').traducteur(interaction).t;
  const [action, id] = interaction.customId.slice(4).split(':');
  const e = q.lire.get(Number(id));
  if (!e || e.guild_id !== interaction.guildId) return interaction.reply(C.erreurPrivee(t('lfg.introuvable')));
  if (e.statut !== 'ouvert') return interaction.reply(C.erreurPrivee(t('lfg.ferme')));
  const membres = JSON.parse(e.membres);
  const moi = interaction.user.id;

  if (action === 'fermer') {
    const peut = moi === e.hote || interaction.memberPermissions?.has(PermissionFlagsBits.ManageMessages);
    if (!peut) return interaction.reply(C.erreurPrivee(t('lfg.fermer_reserve')));
    q.statut.run('ferme', e.id);
    return interaction.update({ components: construire({ ...e, statut: 'ferme' }, t).components });
  }
  if (action === 'out') {
    if (moi === e.hote) return interaction.reply(C.erreurPrivee(t('lfg.hote_quitte')));
    if (!membres.includes(moi)) return interaction.reply(C.erreurPrivee(t('lfg.pas_dedans')));
    const n = membres.filter((x) => x !== moi);
    q.membres.run(JSON.stringify(n), e.id);
    return interaction.update({ components: construire({ ...e, membres: JSON.stringify(n) }, t).components });
  }
  // in
  if (membres.includes(moi)) return interaction.reply(C.erreurPrivee(t('lfg.deja')));
  if (membres.length >= e.places) return interaction.reply(C.erreurPrivee(t('lfg.plein')));
  membres.push(moi);
  q.membres.run(JSON.stringify(membres), e.id);
  const maj = { ...e, membres: JSON.stringify(membres) };
  await interaction.update({ components: construire(maj, t).components });
  if (membres.length >= e.places) await completer(interaction, maj, t);
  return null;
}

/** Chaque minute : annonces expirees, vocaux vides. */
async function tour(client) {
  const maintenant = Date.now();
  for (const e of q.expires.all(maintenant)) {
    q.statut.run('expire', e.id);
    await majMessage(client, { ...e, statut: 'expire' });
  }
  for (const e of q.vocaux.all()) {
    const salon = client.guilds.cache.get(e.guild_id)?.channels.cache.get(e.vocal_id);
    if (!salon) {
      q.statut.run('fini', e.id);
      videDepuis.delete(e.vocal_id);
      await majMessage(client, { ...e, statut: 'fini' });
      continue;
    }
    if (salon.members.size > 0) {
      videDepuis.delete(e.vocal_id);
      continue;
    }
    const depuis = videDepuis.get(e.vocal_id) ?? maintenant;
    videDepuis.set(e.vocal_id, depuis);
    if (maintenant - depuis >= 5 * 60_000) {
      await salon.delete(`LFG #${e.id} : vocal vide`).catch(() => null);
      videDepuis.delete(e.vocal_id);
      q.statut.run('fini', e.id);
      await majMessage(client, { ...e, statut: 'fini' });
    }
  }
}

module.exports = { publier, construire, gererInteraction, tour, q };
