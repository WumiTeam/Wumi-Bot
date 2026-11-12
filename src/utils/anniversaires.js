/**
 * Les anniversaires.
 *
 * ON NE GARDE PAS L'ANNEE PAR DEFAUT.
 * Souhaiter un anniversaire demande le jour et le mois. L'annee, elle, donne
 * l'age — une information autrement plus sensible, et que beaucoup de serveurs
 * n'ont aucune raison de detenir. Elle reste donc facultative, et vaut 0 quand
 * elle n'est pas donnee. Le bot n'affiche jamais d'age nulle part.
 *
 * LE TOUR DE MINUIT
 * Le bot regarde toutes les demi-heures qui est ne aujourd'hui, en heure de
 * Paris comme le reste du bot. Une colonne `dernier` retient la derniere annee
 * souhaitee : c'est ce qui empeche de souhaiter douze fois le meme
 * anniversaire dans la journee, meme si le bot redemarre.
 */
const { EmbedBuilder } = require('discord.js');
const conf = require('../../config');
const { config, req } = require('../database/db');
const { E } = require('./emojis');
const { remplacerVariables } = require('./outils');
const capacites = require('./capacites');
const logger = require('./logger');

const TOUR_MS = 30 * 60_000;
const MOIS = [
  'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
];

let minuterie = null;

/** La date du jour a Paris, en {jour, mois, annee}. */
function aujourdhui(date = new Date()) {
  const [a, m, j] = new Intl.DateTimeFormat('fr-CA', {
    timeZone: 'Europe/Paris',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
    .format(date)
    .split('-')
    .map(Number);
  return { jour: j, mois: m, annee: a };
}

/** Une date lisible : « 14 juillet ». */
function enClair(ligne) {
  return `${ligne.jour} ${MOIS[ligne.mois - 1] ?? '?'}`;
}

/**
 * Le 29 fevrier existe une annee sur quatre.
 * Sans ca, ces gens-la ne seraient souhaites qu'aux annees bissextiles — ce
 * qui est drole une fois, et vexant les trois autres. On les souhaite le
 * 28 fevrier les annees ordinaires.
 */
function estSonJour(ligne, date) {
  if (ligne.jour === date.jour && ligne.mois === date.mois) return true;
  if (ligne.jour !== 29 || ligne.mois !== 2) return false;
  const bissextile = (date.annee % 4 === 0 && date.annee % 100 !== 0) || date.annee % 400 === 0;
  return !bissextile && date.mois === 2 && date.jour === 28;
}

/** Valide un jour et un mois. Renvoie null si la date n'existe pas. */
function valider(jour, mois) {
  if (!Number.isInteger(jour) || !Number.isInteger(mois)) return null;
  if (mois < 1 || mois > 12 || jour < 1) return null;
  // 29 fevrier accepte : c'est une vraie date de naissance.
  const max = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][mois - 1];
  return jour <= max ? { jour, mois } : null;
}

/** Souhaite un anniversaire sur un serveur. */
async function souhaiter(client, ligne, date) {
  const guild = client.guilds.cache.get(ligne.guild_id);
  if (!guild) return false;

  let cfg;
  try {
    cfg = config(ligne.guild_id);
  } catch {
    return false;
  }
  if (!cfg.anniv_salon) return false;

  const salon = guild.channels.cache.get(cfg.anniv_salon);
  const membre = await guild.members.fetch(ligne.user_id).catch(() => null);
  // Un membre parti n'a plus d'anniversaire a souhaiter ici.
  if (!membre) {
    req.marquerSouhaite.run(String(date.annee), ligne.guild_id, ligne.user_id);
    return false;
  }

  if (salon) {
    const modele = cfg.anniv_message
      || `${E('fete')} Joyeux anniversaire {mention} ! Toute l'équipe te souhaite une excellente journée.`;
    await salon
      .send({
        embeds: [
          new EmbedBuilder()
            .setColor(conf.couleurs.succes)
            .setDescription(remplacerVariables(modele, { membre, guild }))
            .setThumbnail(membre.user.displayAvatarURL({ size: 128 })),
        ],
        allowedMentions: { users: [membre.id] },
      })
      .catch((e) => logger.debug('Anniversaire :', e.message));
  }

  // Le role du jour, s'il y en a un.
  if (cfg.anniv_role) {
    const role = guild.roles.cache.get(cfg.anniv_role);
    if (role?.editable) await membre.roles.add(role, 'Anniversaire').catch(() => null);
  }

  req.marquerSouhaite.run(String(date.annee), ligne.guild_id, ligne.user_id);
  logger.action('Anniversaire', membre.user.username, guild.name);
  return true;
}

/**
 * Retire le role d'anniversaire a ceux dont ce n'est plus le jour.
 * Demande la liste des membres : sans cet intent, on ne peut pas savoir qui
 * porte le role, et on laisse tomber plutot que de deviner.
 */
async function retirerRoles(client, date) {
  if (!capacites.membres()) return 0;
  let retires = 0;

  for (const guild of client.guilds.cache.values()) {
    let cfg;
    try {
      cfg = config(guild.id);
    } catch {
      continue;
    }
    if (!cfg.anniv_role) continue;

    const role = guild.roles.cache.get(cfg.anniv_role);
    if (!role?.editable || !role.members.size) continue;

    for (const membre of role.members.values()) {
      const ligne = req.anniversaireDe.get(guild.id, membre.id);
      if (ligne && estSonJour(ligne, date)) continue;
      await membre.roles.remove(role, 'Fin de journée d\'anniversaire').catch(() => null);
      retires++;
    }
  }
  return retires;
}

/** Le tour : qui est ne aujourd'hui, et qui doit rendre son role. */
async function verifier(client) {
  const date = aujourdhui();

  let lignes;
  try {
    lignes = req.anniversairesDuJour.all(date.mois, date.jour);
    // Le 28 fevrier d'une annee ordinaire, on ajoute les 29 fevrier.
    if (date.mois === 2 && date.jour === 28) {
      lignes = lignes.concat(req.anniversairesDuJour.all(2, 29).filter((l) => estSonJour(l, date)));
    }
  } catch (e) {
    return logger.avertissement('Anniversaires :', e.message);
  }

  for (const ligne of lignes) {
    if (ligne.dernier === String(date.annee)) continue; // deja souhaite cette annee
    try {
      await souhaiter(client, ligne, date);
    } catch (e) {
      logger.avertissement('Anniversaire :', e.message);
    }
  }

  await retirerRoles(client, date).catch(() => null);
}

function demarrer(client) {
  minuterie = setInterval(() => verifier(client).catch(() => null), TOUR_MS);
  setTimeout(() => verifier(client).catch(() => null), 30_000);
}

function arreter() {
  if (minuterie) clearInterval(minuterie);
  minuterie = null;
}

module.exports = {
  aujourdhui,
  enClair,
  estSonJour,
  valider,
  souhaiter,
  retirerRoles,
  verifier,
  demarrer,
  arreter,
  MOIS,
};
