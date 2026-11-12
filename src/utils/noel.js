/**
 * L'EVENEMENT DE NOEL du serveur support (decembre).
 *
 * Quand on discute dans les salons de la communaute, il arrive qu'un objet
 * « tombe de la neige » sous un message. Pendant 30 secondes, chacun peut
 * cliquer sur Ramasser (une fois) et decouvre ce qu'il a trouve :
 *   ☃️ bonhomme de neige  +1   (le plus souvent)
 *   🧦 vieille chaussette −1   (le piege)
 *   🎁 cadeau             +3   (rare)
 * Rien n'est visible avant de cliquer : c'est tout le sel du jeu.
 * Le premier a ramasser gagne +1 de bonus. Au bout de 30 secondes, tout fond.
 *
 * Classement : /noel classement, et un message tenu a jour dans un salon.
 * L'evenement s'arrete tout seul a la date de fin (31 decembre 23:59 par
 * defaut) et publie le podium final.
 *
 * Reglages (support_reglages, via /admin noel) :
 *   noel.actif, noel.salons (JSON : salons ou categories), noel.chance (%),
 *   noel.fin (ms), noel.classement_salon, noel.classement_msg, noel.fini
 * Composants : prefixe « noel_ ».
 */
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const C = require('./composants');
const store = require('./supportStore');
const fondateur = require('./fondateur');
const { db } = require('../database/db');
const logger = require('./logger');

db.exec(`
CREATE TABLE IF NOT EXISTS noel_points (
  user_id     TEXT PRIMARY KEY,
  points      INTEGER NOT NULL DEFAULT 0,
  neiges      INTEGER NOT NULL DEFAULT 0,
  chaussettes INTEGER NOT NULL DEFAULT 0,
  cadeaux     INTEGER NOT NULL DEFAULT 0,
  maj_le      INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_noel_points ON noel_points (points DESC, maj_le ASC);
`);

const q = {
  ajouter: db.prepare(`INSERT INTO noel_points (user_id, points, neiges, chaussettes, cadeaux, maj_le)
    VALUES (@user_id, MAX(0, @points), @neiges, @chaussettes, @cadeaux, @maj_le)
    ON CONFLICT(user_id) DO UPDATE SET points = MAX(0, points + @points), neiges = neiges + @neiges,
      chaussettes = chaussettes + @chaussettes, cadeaux = cadeaux + @cadeaux, maj_le = @maj_le`),
  lire: db.prepare('SELECT * FROM noel_points WHERE user_id = ?'),
  top: db.prepare('SELECT * FROM noel_points WHERE points > 0 OR neiges + chaussettes + cadeaux > 0 ORDER BY points DESC, maj_le ASC LIMIT ?'),
  rang: db.prepare('SELECT COUNT(*) AS n FROM noel_points WHERE points > ? OR (points = ? AND maj_le < ?)'),
  joueurs: db.prepare('SELECT COUNT(*) AS n FROM noel_points'),
  vider: db.prepare('DELETE FROM noel_points'),
};

const OBJETS = {
  neige: { emoji: '☃️', points: 1, poids: 72 },
  chaussette: { emoji: '🧦', points: -1, poids: 20 },
  cadeau: { emoji: '🎁', points: 3, poids: 8 },
};
const DUREE_OBJET = 30_000;
const PAUSE_SALON = 60_000;
const COULEUR = 0xd7263d;

const objets = new Map(); // id -> { type, salonId, messageId, fin, pris }
const derniereChute = new Map(); // salonId -> timestamp
let compteur = 0;

/* --------------------------------------------------------------- reglages */

function finParDefaut() {
  const annee = new Date().getUTCFullYear();
  return require('./evenements').lireDate(`31/12/${annee}`, '23:59', 'Europe/Paris');
}

function reglages() {
  let salons = [];
  try { salons = JSON.parse(store.lire('noel.salons') || '[]'); } catch { salons = []; }
  return {
    actif: store.lire('noel.actif') === '1',
    salons,
    chance: Math.min(100, Math.max(1, Number(store.lire('noel.chance')) || 8)),
    fin: Number(store.lire('noel.fin')) || finParDefaut(),
    classementSalon: store.lire('noel.classement_salon'),
    classementMsg: store.lire('noel.classement_msg'),
    fini: store.lire('noel.fini') === '1',
  };
}

const enCours = (r = reglages()) => r.actif && !r.fini && Date.now() < r.fin;

/* ------------------------------------------------------------------ chute */

function tirer() {
  const total = Object.values(OBJETS).reduce((s, o) => s + o.poids, 0);
  let x = Math.random() * total;
  for (const [cle, o] of Object.entries(OBJETS)) {
    x -= o.poids;
    if (x < 0) return cle;
  }
  return 'neige';
}

function t(guild) {
  return require('./langues').traducteur(guild).t;
}

/** Appele a chaque message. Fait (parfois) tomber un objet. */
async function surMessage(message) {
  if (!message.guild || !fondateur.estSupport(message.guild.id)) return;
  const r = reglages();
  if (!enCours(r)) return;
  const salon = message.channel;
  if (!r.salons.includes(salon.id) && !r.salons.includes(salon.parentId)) return;
  // Sans l'intent « contenu des messages », le texte est vide : on ne filtre pas.
  if (require('./capacites').contenuMessages() && (message.content ?? '').trim().length < 2 && !message.attachments?.size) return;
  const maintenant = Date.now();
  if (maintenant - (derniereChute.get(salon.id) ?? 0) < PAUSE_SALON) return;
  if ([...objets.values()].some((o) => o.salonId === salon.id && !o.pris && o.fin > maintenant)) return;
  if (Math.random() * 100 >= r.chance) return;

  await faireTomber(salon);
}

/**
 * Fait tomber une poignee de neige dans un salon (aussi utilise par /admin noel test).
 *
 * Depuis la 2.11.2, TOUT LE MONDE peut ramasser pendant 30 secondes, une fois
 * par chute : chacun tire son propre objet (secret jusqu'au clic). Le premier
 * gagne +1 point de bonus, pour garder un peu de course. Le message liste en
 * direct qui a ramasse quoi.
 */
async function faireTomber(salon) {
  const maintenant = Date.now();
  derniereChute.set(salon.id, maintenant);
  const id = `${maintenant.toString(36)}${(compteur += 1).toString(36)}`;
  const tr = t(salon.guild);
  const objet = { salonId: salon.id, fin: maintenant + DUREE_OBJET, joueurs: [], fini: false };
  const msg = await salon.send({ components: [vueChute(id, objet, tr)], flags: MessageFlags.IsComponentsV2 }).catch(() => null);
  if (!msg) return;
  objet.messageId = msg.id;
  objets.set(id, objet);
  setTimeout(() => fondre(msg, id, tr).catch(() => null), DUREE_OBJET).unref?.();
}

function signe(n) {
  return n > 0 ? `+${n}` : `${n}`;
}

/** Le message d'une chute, en cours ou terminee. */
function vueChute(id, o, tr) {
  const lignes = o.joueurs.slice(0, 20).map((j) =>
    `${OBJETS[j.type].emoji} <@${j.userId}> **${signe(j.points)}**${j.premier ? ` · ⚡ ${tr('noel.premier')}` : ''}`);
  if (o.joueurs.length > 20) lignes.push(`-# ${tr('noel.et_autres', { n: o.joueurs.length - 20 })}`);

  if (o.fini) {
    return C.conteneur([
      C.texte(`### 💧 ${tr('noel.fondu_titre')}`),
      C.texte(lignes.length ? lignes.join('\n') : `-# ${tr('noel.fondu_personne')}`),
      C.texte(`-# ${tr('noel.fondu_pied', { n: o.joueurs.length })}`),
    ], lignes.length ? COULEUR : 0x80869c);
  }

  return C.conteneur([
    C.texte(`### ❄️ ${tr('noel.tombe')}`),
    C.texte(`-# ${tr('noel.tombe_aide', { quand: `<t:${Math.floor(o.fin / 1000)}:R>` })}`),
    lignes.length ? C.texte(lignes.join('\n')) : null,
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`noel_r:${id}`).setEmoji('🧤')
        .setLabel(o.joueurs.length ? tr('noel.ramasser_n', { n: o.joueurs.length }) : tr('noel.ramasser'))
        .setStyle(ButtonStyle.Success),
    ),
  ], COULEUR);
}

async function fondre(msg, id, tr) {
  const o = objets.get(id);
  objets.delete(id);
  if (!o) return;
  o.fini = true;
  await msg.edit({ components: [vueChute(id, o, tr)], allowedMentions: { parse: [] } }).catch(() => null);
}

/** Le bouton Ramasser (prefixe noel_). */
async function gererInteraction(interaction) {
  const tr = t(interaction.guild);
  const id = interaction.customId.split(':')[1];
  const o = objets.get(id);
  if (!o || o.fini || o.fin < Date.now()) return interaction.reply(C.erreurPrivee(tr('noel.trop_tard')));

  const deja = o.joueurs.find((j) => j.userId === interaction.user.id);
  if (deja) {
    return interaction.reply(C.infoPrivee(tr('noel.deja', { emoji: OBJETS[deja.type].emoji, n: signe(deja.points) })));
  }

  const maintenant = Date.now();
  const type = tirer();
  const premier = o.joueurs.length === 0;
  const points = OBJETS[type].points + (premier ? 1 : 0);
  o.joueurs.push({ userId: interaction.user.id, type, points, premier });

  q.ajouter.run({
    user_id: interaction.user.id,
    points,
    neiges: type === 'neige' ? 1 : 0,
    chaussettes: type === 'chaussette' ? 1 : 0,
    cadeaux: type === 'cadeau' ? 1 : 0,
    maj_le: maintenant,
  });

  await interaction.update({ components: [vueChute(id, o, tr)], allowedMentions: { parse: [] } });
  const total = q.lire.get(interaction.user.id)?.points ?? 0;
  return interaction.followUp(C.infoPrivee(
    `${OBJETS[type].emoji} ${tr(`noel.toi_${type}`)} **${signe(points)}**${premier ? ` (⚡ ${tr('noel.premier')})` : ''}\n-# ${tr('noel.total', { n: total })}`
  )).catch(() => null);
}

/* ------------------------------------------------------------- classement */

function stats(userId) {
  const s = q.lire.get(userId);
  if (!s) return null;
  return { ...s, rang: q.rang.get(s.points, s.points, s.maj_le).n + 1 };
}

function classement(tr, { userId = null, final = false, n = 10 } = {}) {
  const r = reglages();
  const top = q.top.all(n);
  const medailles = ['🥇', '🥈', '🥉'];
  const lignes = top.map((s, i) => `${medailles[i] ?? `\`${i + 1}.\``} <@${s.user_id}> · **${s.points}** ${tr('noel.pts')} · ☃️ ${s.neiges} 🎁 ${s.cadeaux} 🧦 ${s.chaussettes}`);
  const blocs = [
    C.texte(`## 🎄 ${final ? tr('noel.final_titre') : tr('noel.classement_titre')}`),
    C.texte(lignes.length ? lignes.join('\n') : tr('noel.classement_vide')),
  ];
  if (userId) {
    const moi = stats(userId);
    if (moi && !top.some((s) => s.user_id === userId)) blocs.push(C.separateur(), C.texte(tr('noel.toi', { rang: moi.rang, n: moi.points })));
  }
  blocs.push(C.texte(`-# ${final ? tr('noel.final_pied', { n: q.joueurs.get().n }) : tr('noel.classement_pied', { quand: `<t:${Math.floor(r.fin / 1000)}:R>`, n: q.joueurs.get().n })}`));
  return { components: [C.conteneur(blocs, COULEUR)], flags: MessageFlags.IsComponentsV2, allowedMentions: { parse: [] } };
}

/** Toutes les 5 minutes : le classement affiche, et la fin de l'evenement. */
async function tour(client) {
  const support = fondateur.serveurSupport();
  const guild = support && client.guilds.cache.get(support);
  if (!guild) return;
  const r = reglages();
  if (!r.actif || r.fini) return;
  const tr = t(guild);
  const salon = r.classementSalon && guild.channels.cache.get(r.classementSalon);
  const termine = Date.now() >= r.fin;

  if (salon?.isTextBased?.()) {
    const charge = classement(tr, { final: termine });
    let fait = false;
    if (r.classementMsg) {
      fait = await salon.messages.edit(r.classementMsg, { components: charge.components }).then(() => true).catch(() => false);
    }
    if (!fait) {
      const m = await salon.send(charge).catch(() => null);
      if (m) store.ecrire('noel.classement_msg', m.id);
    }
  }
  if (termine) {
    store.ecrire('noel.fini', '1');
    const annonce = salon ?? guild.channels.cache.get(r.salons.find((id) => guild.channels.cache.get(id)?.isTextBased?.()));
    const podium = q.top.all(3);
    if (annonce?.isTextBased?.()) {
      await annonce.send({
        content: `🎄 ${tr('noel.fin_annonce')} ${podium.map((s, i) => `${['🥇', '🥈', '🥉'][i]} <@${s.user_id}> (${s.points})`).join('  ')}`,
        allowedMentions: { users: podium.map((s) => s.user_id) },
      }).catch(() => null);
    }
    logger.info?.('Evenement de Noel termine.');
  }
}

function demarrer(client) {
  setInterval(() => tour(client).catch((e) => logger.debug('Noel :', e.message)), 5 * 60_000).unref?.();
}

module.exports = { faireTomber, OBJETS, reglages, enCours, surMessage, gererInteraction, stats, classement, tour, demarrer, tirer, vider: () => q.vider.run(), q };
