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
 * si ce disque lache, tout part ensemble. Une fois par jour (Wumi 2.21 ;
 * c'etait une fois par semaine), on envoie donc la derniere copie en message
 * prive a chaque fondateur (OWNER_IDS), ou dans le salon SAUVEGARDE_SALON.
 *
 * La copie envoyee est COMPRESSEE puis CHIFFREE (AES-256-GCM, avec la cle
 * CHIFFREMENT_CLE du .env) : le fichier qui dort sur Discord est illisible
 * sans la cle. Pour restaurer : node outils/restaurer-sauvegarde.js fichier.
 *
 * La cle n'est JAMAIS envoyee. Le message montre seulement son empreinte (les
 * 8 premiers caracteres de son SHA-256) : elle permet de verifier que la cle
 * rangee dans ton gestionnaire de mots de passe est bien la bonne.
 *
 * La date du dernier envoi est notee dans un petit fichier du dossier : un
 * redemarrage ne declenche pas un deuxieme envoi.
 */
const { emballer, deballer, empreinteCle } = require('./sauvegardesFormat');

const LIMITE_OCTETS = 9.5 * 1024 * 1024; // les bots ne peuvent pas envoyer plus de 10 Mo
const fichierEnvoi = () => path.join(assurerDossier(), '.dernier-envoi');
const intervalleEnvoi = () => (conf.sauvegardes.envoiHeures ?? 24) * 3_600_000;

function dernierEnvoi() {
  try {
    return Number(fs.readFileSync(fichierEnvoi(), 'utf8')) || 0;
  } catch {
    return 0;
  }
}

async function envoyerHorsServeur(client, { forcer = false } = {}) {
  if (!forcer && Date.now() - dernierEnvoi() < intervalleEnvoi()) return null;
  const copie = lister()[0];
  if (!copie) return null;

  const { AttachmentBuilder } = require('discord.js');
  const brut = fs.readFileSync(copie.chemin);
  let paquet;
  try {
    paquet = emballer(brut);
  } catch (e) {
    logger.erreur('Sauvegarde hors serveur : chiffrement impossible :', e.message);
    return null;
  }
  const date = new Date(copie.date).toLocaleString('fr-FR', { timeZone: 'Europe/Paris' });
  const taille = (n) => `${(n / 1024 / 1024).toFixed(2)} Mo`;
  const empreinte = empreinteCle();

  const texte = paquet.length <= LIMITE_OCTETS
    ? `🗄️ **Sauvegarde quotidienne de Wumi** · ${date}\n`
      + `Base : ${taille(brut.length)} · envoyée : ${taille(paquet.length)} (compressée et chiffrée)\n`
      + `Clé de chiffrement : empreinte \`${empreinte}\`\n`
      + '-# Ce fichier est illisible sans la clé CHIFFREMENT_CLE du .env : garde-la dans ton gestionnaire de mots de passe. '
      + 'Pour restaurer : `node outils/restaurer-sauvegarde.js fichier.wumibak`, bot arrêté.'
    : `⚠️ **Sauvegarde quotidienne de Wumi** · ${date}\n`
      + `La copie chiffrée fait ${taille(paquet.length)} : trop lourde pour Discord (10 Mo max). `
      + 'Récupère-la à la main avec WinSCP dans `data/sauvegardes/`.';
  const nomFichier = copie.nom.replace(/\.db$/, '.wumibak');
  const fichiers = paquet.length <= LIMITE_OCTETS ? [new AttachmentBuilder(paquet, { name: nomFichier })] : [];

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
      logger.avertissement('Envoi de la sauvegarde quotidienne :', e.message);
    }
  }
  if (ok) {
    fs.writeFileSync(fichierEnvoi(), String(Date.now()));
    logger.succes(`Sauvegarde quotidienne envoyée (${ok} destinataire(s), ${taille(paquet.length)}).`);
  }
  return { ok, taille: paquet.length, trop: paquet.length > LIMITE_OCTETS };
}

module.exports = { creer, lister, nettoyer, derniere, sauvegardeAutomatique, tailleBase, dossier, assurerDossier, envoyerHorsServeur, dernierEnvoi, emballer, deballer, empreinteCle };
