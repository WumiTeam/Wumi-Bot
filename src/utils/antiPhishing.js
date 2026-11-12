/**
 * Anti-phishing : compare les liens postes a une liste publique de domaines
 * signales, tenue par la communaute Discord Anti-Scam
 * (https://phish.sinking.yachts).
 *
 * LA REGLE LA PLUS IMPORTANTE DU FICHIER
 * Une source tierce qui tombe en panne ne doit JAMAIS desactiver la
 * protection. Un bot qui laisse tout passer parce que sinking.yachts ne
 * repond plus est pire qu'un bot sans anti-phishing : il donne un faux
 * sentiment de securite. D'ou le CACHE SUR DISQUE, a cote de la base : au
 * demarrage on le lit en premier (synchrone, sans reseau), et un
 * rafraichissement qui echoue garde tout simplement la derniere liste connue.
 *
 * LES RUSES QU'ON DOIT REPERER
 * Un lien de phishing se cache rarement sous le domaine signale lui-meme :
 * "login.discord-gifts.com" quand "discord-gifts.com" est la liste. On
 * verifie donc le domaine ET chacun de ses domaines parents, jamais l'inverse
 * (un domaine signale ne bloque pas ce qui le contient, seulement ce qui est
 * dessous). On normalise aussi la casse, les espaces glissees dans le nom
 * (une ruse pour tromper une comparaison naive) et le point final d'un nom de
 * domaine ecrit sous sa forme absolue ("exemple.com.").
 *
 * LA LISTE BLANCHE GAGNE TOUJOURS
 * Chaque serveur peut declarer des domaines jamais bloques (son propre site,
 * un partenaire...). Elle est verifiee avant la liste publique : un domaine
 * blanchi ne declenche jamais rien, meme signale ailleurs.
 */
const fs = require('node:fs');
const path = require('node:path');
const conf = require('../../config');
const logger = require('./logger');

const A = conf.antiphishing ?? {};
const SOURCE_TOUT = A.sourceTout ?? 'https://phish.sinking.yachts/v2/all';
const SOURCE_RECENTS = A.sourceRecents ?? 'https://phish.sinking.yachts/v2/recent/';
const FICHIER_CACHE = A.fichierCache ?? 'antiphishing-cache.json';
const DELAI_REQUETE = 15_000;
// Marge ajoutee a la fenetre "recents" : le temps ecoule entre la reponse du
// serveur et l'ecriture de `derniereMaj` ne doit jamais faire manquer un
// domaine ajoute juste avant.
const MARGE_RECENTS_SECONDES = 300;

let domainesSignales = new Set();
let derniereMaj = 0;
// Global au bot, pas par serveur : la liste bloquee est la meme partout, et
// c'est une statistique de fonctionnement, pas une donnee a conserver entre
// deux demarrages.
let compteurBlocages = 0;

// ------------------------------------------------------------------ DISQUE
/** Chemin du fichier de cache, toujours a cote de la base de donnees. */
function cheminCache() {
  const { cheminDb } = require('../database/db');
  return path.join(path.dirname(cheminDb), FICHIER_CACHE);
}

/**
 * Lit le cache disque et remplace la liste en memoire.
 * Ne fait jamais planter l'appelant : un cache absent ou illisible n'est pas
 * une erreur, juste le signe qu'on demarre a vide en attendant le reseau.
 * @returns {boolean} vrai si le cache a pu etre lu
 */
function chargerDepuisDisque() {
  try {
    const brut = fs.readFileSync(cheminCache(), 'utf8');
    const donnees = JSON.parse(brut);
    if (!Array.isArray(donnees.domaines)) return false;
    domainesSignales = new Set(donnees.domaines.map(normaliserDomaine).filter(Boolean));
    derniereMaj = Number(donnees.maj) || 0;
    return true;
  } catch {
    return false;
  }
}

/** Ecrit la liste courante sur disque, avec sa date. */
function ecrireSurDisque() {
  try {
    fs.mkdirSync(path.dirname(cheminCache()), { recursive: true });
    fs.writeFileSync(
      cheminCache(),
      JSON.stringify({ domaines: [...domainesSignales], maj: derniereMaj })
    );
  } catch (e) {
    // Le cache est un confort, pas une condition : la liste reste utilisable
    // en memoire meme si l'ecriture echoue (disque plein, permissions...).
    logger.avertissement('Anti-phishing : ecriture du cache impossible :', e.message);
  }
}

// Protection des la premiere seconde : lu au chargement du module, bien avant
// que quoi que ce soit n'appelle demarrer(). Aucun acces reseau ici.
chargerDepuisDisque();

// ------------------------------------------------------------------ RESEAU
async function recuperer(url) {
  const reponse = await fetch(url, {
    signal: AbortSignal.timeout(DELAI_REQUETE),
    headers: { 'User-Agent': 'ZhaakBot/1.0 (anti-phishing)' },
  });
  if (!reponse.ok) {
    throw new Error(`${reponse.status} ${(await reponse.text().catch(() => '')).slice(0, 200)}`);
  }
  const donnees = await reponse.json();
  if (!Array.isArray(donnees)) throw new Error('reponse inattendue (pas un tableau de domaines)');
  return donnees;
}

/**
 * Rafraichit la liste depuis le reseau.
 *
 * Le tout premier appel (rien en memoire) recupere la liste COMPLETE ; les
 * suivants ne redemandent que les AJOUTS depuis le dernier rafraichissement,
 * pour ne pas retelecharger des dizaines de milliers de domaines toutes les
 * heures.
 *
 * Un echec ne modifie RIEN : la liste en memoire (et donc le cache disque au
 * dernier succes) reste telle quelle. C'est le coeur de la resilience du
 * module — voir l'entete du fichier.
 *
 * @param {{force?: boolean}} options force : redemande la liste complete
 * @returns {Promise<{ok: boolean, total: number, raison?: string}>}
 */
async function rafraichir({ force = false } = {}) {
  const dejaChargee = domainesSignales.size > 0;
  try {
    if (force || !dejaChargee) {
      const liste = await recuperer(SOURCE_TOUT);
      domainesSignales = new Set(liste.map(normaliserDomaine).filter(Boolean));
    } else {
      const secondes = Math.ceil((Date.now() - derniereMaj) / 1000) + MARGE_RECENTS_SECONDES;
      const liste = await recuperer(`${SOURCE_RECENTS}${secondes}`);
      for (const domaine of liste) {
        const n = normaliserDomaine(domaine);
        if (n) domainesSignales.add(n);
      }
    }
    derniereMaj = Date.now();
    ecrireSurDisque();
    return { ok: true, total: domainesSignales.size };
  } catch (e) {
    logger.avertissement(
      `Anti-phishing : rafraichissement impossible, liste conservee (${domainesSignales.size} domaines) :`,
      e.message
    );
    return { ok: false, raison: e.message, total: domainesSignales.size };
  }
}

/**
 * Lance le rafraichissement periodique.
 * A appeler une fois au demarrage du bot (voir src/events/ready.js).
 */
function demarrer() {
  rafraichir().catch(() => null);
  const minutes = Math.max(15, A.intervalleMinutes ?? 60);
  const id = setInterval(() => rafraichir().catch(() => null), minutes * 60_000);
  id.unref?.();
  return id;
}

// --------------------------------------------------------------- DOMAINES
/**
 * Normalise un nom de domaine pour la comparaison : casse, espaces glissees
 * dans le nom (invisibles ou non — une ruse pour tromper une comparaison
 * naive), et point final d'un nom de domaine absolu ("exemple.com.").
 */
function normaliserDomaine(brut) {
  return String(brut ?? '')
    .toLowerCase()
    .replace(/[​-‍﻿]/g, '')
    .replace(/\s+/g, '')
    .replace(/\.+$/, '');
}

/** Le nom d'hote d'un lien — qu'il s'agisse d'une adresse complete ou d'un domaine nu. */
function hoteDe(lien) {
  const m = String(lien ?? '')
    .trim()
    .match(/^(?:[a-z][a-z0-9+.-]*:\/\/)?(?:www\.)?([^/\s?#:]+)/i);
  return m ? normaliserDomaine(m[1]) : null;
}

/**
 * Le domaine (ou l'un de ses domaines PARENTS) est-il dans l'ensemble ?
 * "login.discord-gifts.com" correspond a "discord-gifts.com", jamais
 * l'inverse — sinon blanchir "discord-gifts.com" blanchirait par megarde
 * n'importe quel autre "*.com".
 */
function correspond(hote, ensemble) {
  if (!hote || !ensemble.size) return false;
  if (ensemble.has(hote)) return true;
  const parties = hote.split('.');
  for (let i = 1; i < parties.length - 1; i++) {
    if (ensemble.has(parties.slice(i).join('.'))) return true;
  }
  return false;
}

/** Coupe une liste blanche texte ("a.com, b.com") en domaines normalises. */
function listeBlancheDepuis(texte) {
  return String(texte ?? '')
    .split(',')
    .map((d) => d.trim())
    .filter(Boolean);
}

/**
 * Ce lien pointe-t-il vers un domaine signale ?
 * La liste blanche du serveur est verifiee EN PREMIER : elle gagne toujours
 * sur la liste publique, meme si le domaine y figure.
 * @param {string} lien une adresse complete ou un simple domaine
 * @param {{listeBlanche?: string[]}} options domaines jamais bloques sur ce serveur
 */
function estSignale(lien, { listeBlanche = [] } = {}) {
  const hote = hoteDe(lien);
  if (!hote) return false;

  const blanche = new Set(listeBlanche.map(normaliserDomaine).filter(Boolean));
  if (correspond(hote, blanche)) return false;

  if (correspond(hote, domainesSignales)) {
    compteurBlocages++;
    return true;
  }
  return false;
}

/** Combien de liens ont ete bloques depuis le demarrage du bot. */
function compteur() {
  return compteurBlocages;
}

/** Etat de la liste, pour un diagnostic ou un affichage. */
function etat() {
  return { total: domainesSignales.size, derniereMaj, blocages: compteurBlocages };
}

module.exports = {
  estSignale,
  hoteDe,
  listeBlancheDepuis,
  compteur,
  etat,
  demarrer,
  rafraichir,
  chargerDepuisDisque,
  cheminCache,
};
