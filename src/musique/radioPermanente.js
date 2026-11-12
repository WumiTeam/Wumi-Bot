/**
 * La RADIO PERMANENTE : un salon vocal ou une radio tourne 24 h/24.
 *
 *  - activee par /radio station:… permanente:oui (Gerer le serveur), depuis
 *    le salon vocal voulu ; elle met aussi le serveur en mode 24/7 ;
 *  - relancee au demarrage du bot, quand le flux coupe, quand la file d'une
 *    musique demandee entre-temps se termine, et 1 min apres une deconnexion ;
 *  - coupee par /music 24-7 actif:non (ou /radio … permanente:non).
 *
 * Le panneau du lecteur s'affiche dans le chat du salon vocal lui-meme.
 */
const { PermissionFlagsBits } = require('discord.js');
const { config, majConfig, db } = require('../database/db');
const RADIOS = require('./radios');
const logger = require('../utils/logger');

function radio(id) {
  return RADIOS.find((r) => r.id === id) ?? null;
}

function activer(guildId, salonId, stationId) {
  majConfig(guildId, { radio_salon: salonId, radio_station: stationId, musique_247: 1 });
}

function desactiver(guildId) {
  majConfig(guildId, { radio_salon: null, radio_station: null });
  const { musique } = require('./lecteur');
  const l = musique.obtenir(guildId);
  if (l) l.radioPermanente = false;
}

/** Lance (ou relance) la radio d'un serveur. */
async function lancer(guildId) {
  const { musique } = require('./lecteur');
  const cfg = config(guildId);
  const station = radio(cfg.radio_station);
  if (!cfg.radio_salon || !station || !musique.disponible()) return false;
  const guild = musique.client?.guilds.cache.get(guildId);
  const salon = guild?.channels.cache.get(cfg.radio_salon);
  if (!salon?.isVoiceBased?.()) return false;
  if (!salon.permissionsFor(guild.members.me)?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak])) return false;

  let l = musique.obtenir(guildId);
  if (l && (l.modeJeu || l.salonVocal !== salon.id)) return false; // occupe ailleurs : on ne vole pas le lecteur
  if (l?.actuelle) {
    l.radioPermanente = true;
    return true; // de la musique joue deja : la radio reprendra apres
  }
  const res = await musique.resoudre(station.url).catch(() => null);
  const piste = res?.pistes?.[0];
  if (!piste) return false;
  piste.info = { ...piste.info, title: station.nom, author: station.genre, isStream: true };
  if (!l) l = await musique.creer(guild, salon.id, salon.id);
  l.radioPermanente = true;
  l.ajouter([piste], null);
  await l.demarrerSiBesoin();
  return true;
}

/** Appele quand la file est vide : on attend un peu, puis on relance. */
async function relancer(guildId) {
  const ok = await lancer(guildId).catch(() => false);
  if (!ok) setTimeout(() => lancer(guildId).catch(() => null), 60_000).unref?.();
}

/** Au demarrage : toutes les radios permanentes, une par une. */
async function toutLancer() {
  const lignes = db.prepare('SELECT guild_id FROM config WHERE radio_salon IS NOT NULL').all();
  for (const { guild_id: id } of lignes) {
    await lancer(id).catch((e) => logger.debug(`Radio permanente (${id}) :`, e.message));
    await new Promise((r) => setTimeout(r, 1_500));
  }
}

module.exports = { activer, desactiver, lancer, relancer, toutLancer, radio };
