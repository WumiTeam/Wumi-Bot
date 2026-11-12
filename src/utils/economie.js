const { req, config } = require('../database/db');
const { formaterNombre } = require('./outils');
const { E } = require('./emojis');

const JOUR = 86_400_000;

/**
 * Un emoji affichable par Discord : Unicode, ou personnalise au format
 * <:nom:id> / <a:nom:id>. Un texte comme « :Wumis: » (nom tape sans que
 * Discord l'ait converti) s'afficherait tel quel : on le refuse.
 */
function emojiValide(v) {
  if (!v) return false;
  if (/^<a?:\w{2,32}:\d{17,20}>$/.test(v)) return true;
  return /^(\p{Extended_Pictographic}|\p{Regional_Indicator}|[#*0-9]\uFE0F?\u20E3)/u.test(v) && !/[\w:]/.test(v.replace(/\uFE0F|\u20E3/g, '').replace(/[#*0-9]/g, ''));
}

/**
 * Transforme ce que l'equipe a tape en emoji utilisable, en cherchant au
 * besoin un « :nom: » parmi les emojis du serveur. null si introuvable.
 */
function resoudreEmoji(guild, brut) {
  const v = String(brut ?? '').trim();
  if (emojiValide(v)) return v;
  const nom = v.match(/^:?(\w{2,32}):?$/)?.[1];
  if (!nom) return null;
  const trouve = guild?.emojis?.cache?.find((e) => e.name === nom)
    ?? guild?.emojis?.cache?.find((e) => e.name?.toLowerCase() === nom.toLowerCase());
  return trouve ? trouve.toString() : null;
}

/** Nom et emoji de la monnaie du serveur (piece de Wumi Run par defaut). */
function monnaie(guildId) {
  const cfg = config(guildId);
  return { nom: cfg.eco_nom || 'pièces', emoji: emojiValide(cfg.eco_emoji) ? cfg.eco_emoji : E('economie') };
}

/** Formate un montant avec l'emoji et le nom de la monnaie. */
function somme(guildId, montant) {
  const m = monnaie(guildId);
  return `${m.emoji} **${formaterNombre(montant)}** ${m.nom}`;
}

/** Solde d'un membre (0 si aucune ligne). */
function solde(guildId, userId) {
  return req.getEco.get(guildId, userId)?.solde ?? 0;
}

/** Credite (montant positif) ou debite (negatif) un membre. */
function crediter(guildId, userId, montant, compteCommeGain = true) {
  req.crediter.run({
    guild_id: guildId,
    user_id: userId,
    montant,
    gagne: compteCommeGain && montant > 0 ? montant : 0,
  });
  return solde(guildId, userId);
}

/**
 * Etat de la recompense quotidienne.
 * La serie augmente si le dernier retrait date de moins de 48 h.
 */
function etatDaily(guildId, userId) {
  const ligne = req.getEco.get(guildId, userId);
  const dernier = ligne?.dernier_daily ?? 0;
  const maintenant = Date.now();
  const ecoule = maintenant - dernier;

  return {
    disponible: ecoule >= JOUR,
    resteMs: Math.max(0, JOUR - ecoule),
    serie: ecoule < 2 * JOUR ? (ligne?.serie_daily ?? 0) : 0,
  };
}

/** Applique la recompense quotidienne et renvoie le detail. */
function reclamerDaily(guildId, userId) {
  const cfg = config(guildId);
  const etat = etatDaily(guildId, userId);
  if (!etat.disponible) return { ok: false, resteMs: etat.resteMs };

  const serie = etat.serie + 1;
  // Bonus de serie : +10 % par jour consecutif, plafonne a +100 %
  const bonus = Math.min(serie - 1, 10) * 0.1;
  const gain = Math.round(cfg.eco_daily * (1 + bonus));

  crediter(guildId, userId, gain);
  req.majDaily.run({ guild_id: guildId, user_id: userId, date: Date.now(), serie });
  require('./missions').noter(guildId, userId, 'daily', 1);

  return { ok: true, gain, serie, bonus: Math.round(bonus * 100), base: cfg.eco_daily };
}

/** Etat et resultat de la commande de travail. */
function travailler(guildId, userId) {
  const cfg = config(guildId);
  const ligne = req.getEco.get(guildId, userId);
  const delai = cfg.eco_travail_delai * 60_000;
  const reste = (ligne?.dernier_travail ?? 0) + delai - Date.now();
  if (reste > 0) return { ok: false, resteMs: reste };

  const min = Math.min(cfg.eco_travail_min, cfg.eco_travail_max);
  const max = Math.max(cfg.eco_travail_min, cfg.eco_travail_max);
  const gain = Math.floor(Math.random() * (max - min + 1)) + min;

  crediter(guildId, userId, gain);
  req.majTravail.run(guildId, userId, Date.now());
  require('./missions').noter(guildId, userId, 'travail', 1);
  return { ok: true, gain };
}

/** Rang d'un membre dans le classement des soldes. */
function rang(guildId, montant) {
  return req.rangEco.get(guildId, montant).n + 1;
}

module.exports = { monnaie, emojiValide, resoudreEmoji, somme, solde, crediter, etatDaily, reclamerDaily, travailler, rang };
