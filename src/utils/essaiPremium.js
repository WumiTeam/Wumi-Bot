/**
 * L'ESSAI GRATUIT DE WUMI PREMIUM (Wumi 2.24).
 *
 * Sept jours de premium, offerts UNE fois par serveur, lances par quelqu'un
 * qui peut gerer le serveur (`/premium essai`, ou le bouton du message
 * d'arrivee et de `/premium info`).
 *
 * L'essai est un premium comme un autre (source « essai », date de fin) :
 * tout le bot le lit avec `estPremium()`, sans rien savoir de plus. Il est
 * note a part dans `premium_essais`, et cette ligne n'est JAMAIS effacee :
 * c'est elle qui empeche un deuxieme essai.
 *
 * Un abonnement pris pendant l'essai le remplace (premium.js pose la source
 * « discord » par-dessus). Un premium offert a la main n'est jamais ecrase.
 *
 * Fin de l'essai :
 *   - la veille, un message prive a celui qui l'a lance ;
 *   - a la fin, un dernier message avec le bouton d'abonnement, et le profil
 *     du bot sur ce serveur (avatar, banniere, bio) revient a celui de Wumi :
 *     c'est la seule chose que le premium pose chez Discord et qui ne
 *     s'eteindrait pas toute seule.
 */
const { ButtonBuilder, ButtonStyle, ActionRowBuilder } = require('discord.js');
const { db } = require('../database/db');
const premium = require('./premium');
const C = require('./composants');
const { E } = require('./emojis');
const { t } = require('./langues');
const logger = require('./logger');

const DUREE = 7 * 86_400_000;
const VEILLE = 86_400_000;
const OR = 0xf5b941;

db.exec(`
CREATE TABLE IF NOT EXISTS premium_essais (
  guild_id     TEXT PRIMARY KEY,
  par          TEXT,
  langue       TEXT,
  debut        INTEGER NOT NULL,
  fin          INTEGER NOT NULL,
  rappel_veille INTEGER NOT NULL DEFAULT 0,
  rappel_fin    INTEGER NOT NULL DEFAULT 0
);
`);

const q = {
  lire: db.prepare('SELECT * FROM premium_essais WHERE guild_id = ?'),
  creer: db.prepare('INSERT INTO premium_essais (guild_id, par, langue, debut, fin) VALUES (?, ?, ?, ?, ?)'),
  aRappelerVeille: db.prepare('SELECT * FROM premium_essais WHERE rappel_veille = 0 AND fin - ? <= ? AND fin > ? LIMIT 25'),
  aTerminer: db.prepare('SELECT * FROM premium_essais WHERE rappel_fin = 0 AND fin <= ? LIMIT 25'),
  veilleFaite: db.prepare('UPDATE premium_essais SET rappel_veille = 1 WHERE guild_id = ?'),
  finFaite: db.prepare('UPDATE premium_essais SET rappel_fin = 1, rappel_veille = 1 WHERE guild_id = ?'),
};

/** L'essai de ce serveur, s'il y en a eu un. */
function essaiDe(guildId) {
  return q.lire.get(String(guildId)) ?? null;
}

/**
 * Ce serveur peut-il lancer son essai ?
 * @returns {'ok'|'deja'|'premium'}
 */
function disponibilite(guildId) {
  if (essaiDe(guildId)) return 'deja';
  if (premium.estPremium(guildId)) return 'premium';
  return 'ok';
}

/** Lance l'essai. Renvoie la date de fin, ou null si ce n'est pas possible. */
function lancer(guildId, userId, langue, maintenant = Date.now()) {
  if (disponibilite(guildId) !== 'ok') return null;
  const fin = maintenant + DUREE;
  q.creer.run(String(guildId), String(userId), langue ?? null, maintenant, fin);
  premium.accorder(guildId, { source: 'essai', jusqu_a: fin, par: String(userId) });
  try {
    require('./journalSupport').noter('premium', {
      titre: '🎁 Essai premium lancé',
      couleur: OR,
      lignes: [`**Serveur** · \`${guildId}\``, `**Par** · <@${userId}>`, `**Fin** · <t:${Math.floor(fin / 1000)}:R>`],
    });
  } catch {
    /* le journal est un confort */
  }
  return fin;
}

/** Le bouton « Essayer gratuitement » (7 jours). */
function bouton(langue) {
  return new ButtonBuilder()
    .setCustomId('prm_essai')
    .setLabel(t('premium.essai.bouton', langue))
    .setEmoji('🎁')
    .setStyle(ButtonStyle.Success);
}

/** Le premium de cet essai est-il toujours celui de l'essai ? */
function toujoursEnEssai(guildId) {
  const l = premium.details(guildId);
  return l.source === 'essai';
}

async function ecrire(client, ligne, cle, avecBouton) {
  if (!ligne.par) return;
  const langue = ligne.langue ?? 'en';
  const guild = client.guilds.cache.get(ligne.guild_id);
  const nom = guild?.name ?? ligne.guild_id;
  const rangee = new ActionRowBuilder();
  if (avecBouton && premium.sku()) rangee.addComponents(new ButtonBuilder().setStyle(ButtonStyle.Premium).setSKUId(premium.sku()));
  rangee.addComponents(new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel(t('premium.essai.bouton_site', langue)).setURL('https://wumi.fr/premium/'));
  const user = await client.users.fetch(ligne.par).catch(() => null);
  if (!user) return;
  await user.send(C.envoi([C.conteneur([
    C.texte(`## ${E('etoile')} ${t(`premium.essai.${cle}_titre`, langue)}\n${t(`premium.essai.${cle}`, langue, { serveur: nom, fin: `<t:${Math.floor(ligne.fin / 1000)}:R>` })}`),
    rangee,
  ], OR)])).catch((e) => logger.debug('Essai premium (MP) :', e.message));
}

/** Rend au bot son profil d'origine sur ce serveur (avatar, banniere, bio). */
async function rendreProfil(client, guildId) {
  const guild = client.guilds.cache.get(guildId);
  if (!guild) return;
  await guild.members.editMe({ avatar: null, banner: null, bio: null, reason: 'Fin de Wumi Premium' })
    .catch((e) => logger.debug('Profil du bot (fin du premium) :', e.message));
  try { require('../database/db').majConfig(guildId, { profil_bio: null }); } catch { /* rien */ }
}

async function tour(client, maintenant = Date.now()) {
  for (const l of q.aRappelerVeille.all(maintenant, VEILLE, maintenant)) {
    q.veilleFaite.run(l.guild_id);
    if (toujoursEnEssai(l.guild_id)) await ecrire(client, l, 'veille', true);
  }
  for (const l of q.aTerminer.all(maintenant)) {
    q.finFaite.run(l.guild_id);
    // Abonne entre-temps ? Rien a dire, rien a retirer.
    if (premium.estPremium(l.guild_id)) continue;
    await rendreProfil(client, l.guild_id);
    await ecrire(client, l, 'fin', true);
  }
}

function demarrer(client) {
  setInterval(() => tour(client).catch((e) => logger.avertissement('Essais premium :', e.message)), 15 * 60_000).unref?.();
  setTimeout(() => tour(client).catch(() => null), 30_000).unref?.();
}

module.exports = { essaiDe, disponibilite, lancer, bouton, tour, demarrer, rendreProfil, DUREE };
