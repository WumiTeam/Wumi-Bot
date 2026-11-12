const fs = require('node:fs');
const path = require('node:path');
const conf = require('../../config');
const { db, cheminDb } = require('../database/db');
const logger = require('./logger');

const dossier = () => path.resolve(conf.sauvegardes.dossier);

/** Cree le dossier de sauvegardes s'il n'existe pas. */
function assurerDossier() {
  fs.mkdirSync(dossier(), { recursive: true });
  return dossier();
}

/** Liste les sauvegardes existantes, de la plus recente a la plus ancienne. */
function lister() {
  assurerDossier();
  return fs
    .readdirSync(dossier())
    .filter((f) => f.startsWith('zhaak-') && f.endsWith('.db'))
    .map((f) => {
      const complet = path.join(dossier(), f);
      const stats = fs.statSync(complet);
      return { nom: f, chemin: complet, taille: stats.size, date: stats.mtimeMs };
    })
    .sort((a, b) => b.date - a.date);
}

/**
 * Cree une copie coherente de la base.
 * VACUUM INTO produit un fichier propre et compacte, meme pendant que le bot ecrit.
 */
function creer(suffixe = '') {
  assurerDossier();
  const horodatage = new Date()
    .toISOString()
    .replace(/[:.]/g, '-')
    .slice(0, 19);
  const nom = `zhaak-${horodatage}${suffixe ? `-${suffixe}` : ''}.db`;
  const destination = path.join(dossier(), nom);

  // Les apostrophes sont doublees : la destination arrive dans une chaine SQL
  db.exec(`VACUUM INTO '${destination.replaceAll("'", "''")}'`);

  const taille = fs.statSync(destination).size;
  nettoyer();
  return { nom, chemin: destination, taille };
}

/** Supprime les sauvegardes au-dela du nombre a conserver. */
function nettoyer() {
  const fichiers = lister();
  const aSupprimer = fichiers.slice(conf.sauvegardes.aConserver);
  for (const f of aSupprimer) {
    try {
      fs.unlinkSync(f.chemin);
    } catch (e) {
      logger.avertissement('Suppression de sauvegarde :', e.message);
    }
  }
  return aSupprimer.length;
}

/** Date de la sauvegarde la plus recente, ou 0. */
function derniere() {
  return lister()[0]?.date ?? 0;
}

/**
 * Lance une sauvegarde si la derniere date de plus de l'intervalle configure.
 * Appele au demarrage puis toutes les heures.
 */
function sauvegardeAutomatique() {
  if (!conf.sauvegardes.actif) return null;
  const intervalle = conf.sauvegardes.intervalleHeures * 3_600_000;
  if (Date.now() - derniere() < intervalle) return null;

  try {
    const res = creer('auto');
    logger.succes(`Sauvegarde automatique : ${res.nom} (${(res.taille / 1024).toFixed(0)} Ko)`);
    return res;
  } catch (e) {
    logger.erreur('Sauvegarde automatique :', e.message);
    return null;
  }
}

/** Taille actuelle de la base en octets. */
function tailleBase() {
  try {
    return fs.statSync(cheminDb).size;
  } catch {
    return 0;
  }
}

// ------------------------------------------------- COPIE HORS DU SERVEUR
/**
 * Les copies du dossier data/sauvegardes sont sur le MEME disque que la base :
 * si ce disque lache, tout part ensemble. Une fois par semaine, on envoie donc
 * la derniere copie, compressee, en message prive a chaque fondateur
 * (OWNER_IDS), ou dans le salon SAUVEGARDE_SALON s'il est defini.
 *
 * La date du dernier envoi est notee dans un petit fichier du dossier : un
 * redemarrage ne declenche pas un deuxieme envoi.
 */
const SEMAINE_MS = 7 * 86_400_000;
const LIMITE_OCTETS = 9.5 * 1024 * 1024; // les bots ne peuvent pas envoyer plus de 10 Mo
const fichierEnvoi = () => path.join(assurerDossier(), '.dernier-envoi');

function dernierEnvoi() {
  try {
    return Number(fs.readFileSync(fichierEnvoi(), 'utf8')) || 0;
  } catch {
    return 0;
  }
}

async function envoyerHorsServeur(client, { forcer = false } = {}) {
  if (!forcer && Date.now() - dernierEnvoi() < SEMAINE_MS) return null;
  const copie = lister()[0];
  if (!copie) return null;

  const zlib = require('node:zlib');
  const { AttachmentBuilder } = require('discord.js');
  const brut = fs.readFileSync(copie.chemin);
  const gz = zlib.gzipSync(brut, { level: 9 });
  const date = new Date(copie.date).toLocaleString('fr-FR', { timeZone: 'Europe/Paris' });
  const taille = (n) => `${(n / 1024 / 1024).toFixed(2)} Mo`;

  const texte = gz.length <= LIMITE_OCTETS
    ? `🗄️ **Sauvegarde hebdomadaire de Wumi** · ${date}\n`
      + `Base : ${taille(brut.length)} · compressée : ${taille(gz.length)}\n`
      + '-# Garde ce fichier en lieu sûr. Pour restaurer : décompresse-le (7-Zip), renomme-le en zhaak.db et remplace data/zhaak.db, bot arrêté.'
    : `⚠️ **Sauvegarde hebdomadaire de Wumi** · ${date}\n`
      + `La copie compressée fait ${taille(gz.length)} : trop lourde pour Discord (10 Mo max). `
      + 'Récupère-la à la main avec WinSCP dans `data/sauvegardes/`.';
  const fichiers = gz.length <= LIMITE_OCTETS ? [new AttachmentBuilder(gz, { name: `${copie.nom}.gz` })] : [];

  const destinations = [];
  const salonId = String(process.env.SAUVEGARDE_SALON ?? '').trim();
  if (salonId) {
    const salon = await client.channels.fetch(salonId).catch(() => null);
    if (salon?.isTextBased?.()) destinations.push(salon);
  }
  if (!destinations.length) {
    for (const id of require('./fondateur').fondateurs()) {
      const user = await client.users.fetch(id).catch(() => null);
      if (user) destinations.push(user);
    }
  }

  let ok = 0;
  for (const d of destinations) {
    try {
      await d.send({ content: texte, files: fichiers });
      ok++;
    } catch (e) {
      logger.avertissement('Envoi de la sauvegarde hebdomadaire :', e.message);
    }
  }
  if (ok) {
    fs.writeFileSync(fichierEnvoi(), String(Date.now()));
    logger.succes(`Sauvegarde hebdomadaire envoyée (${ok} destinataire(s), ${taille(gz.length)}).`);
  }
  return { ok, taille: gz.length, trop: gz.length > LIMITE_OCTETS };
}

module.exports = { creer, lister, nettoyer, derniere, sauvegardeAutomatique, tailleBase, dossier, assurerDossier, envoyerHorsServeur, dernierEnvoi };
