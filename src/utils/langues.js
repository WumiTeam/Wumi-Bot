/**
 * Les langues du bot.
 *
 * Blueprint est un bot public : la moitie des serveurs qui l'ajoutent ne
 * parlent pas francais. Chaque serveur choisit donc sa langue, et tout ce que
 * le bot ecrit passe par ici.
 *
 * COMMENT CA MARCHE
 * Chaque phrase porte une cle (« boutique.solde ») et vit dans un fichier par
 * langue, dans src/langues/. Le code ne contient plus la phrase, seulement la
 * cle :
 *
 *     const { t } = traducteur(interaction);
 *     t('boutique.solde', { n: 5200 })
 *
 * TROIS REGLES QUI EVITENT LES DEGATS
 *
 * 1. UNE CLE MANQUANTE N'EFFACE JAMAIS LE MESSAGE. Si l'anglais manque, on
 *    retombe sur le francais ; si le francais manque aussi, on affiche la cle.
 *    Un texte moche vaut mieux qu'un embed vide, et la cle dit ou regarder.
 *
 * 2. LES CLES MANQUANTES SONT SIGNALEES UNE FOIS, pas a chaque message : un
 *    bot sur mille serveurs qui journalise la meme cle mille fois par minute
 *    noie son propre journal.
 *
 * 3. LES TEXTES SONT RELUS AU DEMARRAGE. Une accolade mal fermee, une
 *    variable qui n'existe pas — mieux vaut le savoir en demarrant que devant
 *    un utilisateur.
 *
 * LE PLURIEL
 * « {n} jour || {n} jours » : ce qui est avant le || sert au singulier, ce qui
 * est apres au pluriel. C'est choisi sur `n`. L'anglais et le francais ne
 * coupent pas au meme endroit (0 est pluriel en anglais, singulier en
 * francais) : chaque langue decide chez elle.
 */
const fs = require('node:fs');
const path = require('node:path');
const logger = require('./logger');

const DOSSIER = path.join(__dirname, '..', 'langues');
const DEFAUT = 'fr';          // la langue de repli, celle qui est toujours complete
const NEUVE = 'en';           // la langue d'un serveur qui vient d'ajouter le bot

/** Les langues proposees. `nom` est affiche dans les reglages. */
// 2.31 : espagnol, allemand, portugais (Bresil) et italien. `discord` liste
// les codes de Discord ou poser la traduction des commandes ; `pluriel` dit
// quand passer au pluriel (le francais et le portugais gardent 0 et 1 au
// singulier ; l'espagnol, l'allemand et l'italien seulement 1).
const LANGUES = {
  fr: { nom: 'Français', drapeau: '🇫🇷', intl: 'fr-FR', discord: 'fr', pluriel: (n) => Math.abs(n) >= 2 },
  en: { nom: 'English', drapeau: '🇬🇧', intl: 'en-US', discord: 'en-US', pluriel: (n) => Math.abs(n) >= 2 },
  es: { nom: 'Español', drapeau: '🇪🇸', intl: 'es-ES', discord: ['es-ES', 'es-419'], pluriel: (n) => Math.abs(n) !== 1 },
  de: { nom: 'Deutsch', drapeau: '🇩🇪', intl: 'de-DE', discord: 'de', pluriel: (n) => Math.abs(n) !== 1 },
  pt: { nom: 'Português (Brasil)', drapeau: '🇧🇷', intl: 'pt-BR', discord: 'pt-BR', pluriel: (n) => Math.abs(n) >= 2 },
  it: { nom: 'Italiano', drapeau: '🇮🇹', intl: 'it-IT', discord: 'it', pluriel: (n) => Math.abs(n) !== 1 },
};

/** Ou chercher un texte absent : la langue, puis l'anglais, puis le francais. */
const chaine = (langue) => [...new Set([langue, NEUVE, DEFAUT])];

/** Le format Intl d'une langue (dates, nombres). */
const intl = (langue) => LANGUES[langue]?.intl ?? 'fr-FR';

/** La langue du bot qui correspond a une langue Discord (« es-419 » -> « es »). */
function depuisDiscord(locale) {
  const fixe = require('../edition').profil?.langue;
  if (fixe) return fixe;
  const l = String(locale ?? '').toLowerCase();
  if (l.startsWith('pt')) return 'pt';
  const court = l.slice(0, 2);
  return LANGUES[court] ? court : null;
}

const textes = new Map();     // langue -> { cle: phrase }
const signalees = new Set();  // cles deja signalees, pour ne le dire qu'une fois

/** Aplatit { a: { b: 'x' } } en { 'a.b': 'x' }. */
function aplatir(objet, prefixe = '', sortie = {}) {
  for (const [cle, valeur] of Object.entries(objet)) {
    const complete = prefixe ? `${prefixe}.${cle}` : cle;
    if (valeur && typeof valeur === 'object' && !Array.isArray(valeur)) aplatir(valeur, complete, sortie);
    else sortie[complete] = String(valeur);
  }
  return sortie;
}

function charger() {
  textes.clear();
  for (const code of Object.keys(LANGUES)) {
    const fichier = path.join(DOSSIER, `${code}.json`);
    try {
      textes.set(code, aplatir(JSON.parse(fs.readFileSync(fichier, 'utf8'))));
    } catch (e) {
      // Une langue illisible ne doit pas empecher le bot de demarrer : il
      // tournera dans la langue de repli, et le journal dit pourquoi.
      textes.set(code, {});
      logger.erreur(`Langue ${code} illisible :`, e.message);
    }
  }
  return textes;
}
charger();

/** Remplace {nom} par sa valeur, et tranche le pluriel. */
function appliquer(phrase, variables, langue = DEFAUT) {
  let sortie = phrase;

  if (sortie.includes('||')) {
    const [un, plusieurs] = sortie.split('||');
    const n = Number(variables.n ?? 0);
    sortie = (LANGUES[langue]?.pluriel ?? LANGUES.fr.pluriel)(n) ? plusieurs : un;
  }

  return sortie.trim().replace(/\{(\w+)\}/g, (entier, nom) =>
    (Object.hasOwn(variables, nom) ? String(variables[nom]) : entier));
}

/**
 * Traduit une cle.
 * @param {string} cle       par exemple 'boutique.solde'
 * @param {string} langue    'fr' ou 'en'
 * @param {object} variables ce qui remplace les {accolades}
 */
function t(cle, langue = DEFAUT, variables = {}) {
  const dans = textes.get(langue) ?? textes.get(DEFAUT) ?? {};
  let phrase;
  let trouvee = langue;
  for (const l of chaine(langue)) {
    phrase = textes.get(l)?.[cle];
    if (phrase !== undefined) { trouvee = l; break; }
  }

  if (phrase === undefined) {
    if (!signalees.has(cle)) {
      signalees.add(cle);
      logger.avertissement(`Texte manquant : ${cle} (${langue})`);
    }
    return cle;
  }

  if (dans[cle] === undefined && !signalees.has(`${langue}:${cle}`)) {
    signalees.add(`${langue}:${cle}`);
    logger.debug(`Texte non traduit en ${langue} : ${cle}`);
  }

  const sortie = appliquer(phrase, variables, trouvee);
  // 2.35 : dans une edition, le bot porte son propre nom.
  const marque = require('../edition').profil?.marque;
  return marque && typeof sortie === 'string' ? sortie.replace(/\bWumi\b/g, marque) : sortie;
}

/**
 * Ce texte existe-t-il ?
 *
 * Sert aux textes FACULTATIFS — l'aide d'un reglage, par exemple. Sans ca, on
 * appellerait t() pour savoir s'il y a quelque chose a afficher, et chaque
 * reglage sans aide ferait un avertissement dans le journal a chaque
 * ouverture du panneau. Un texte facultatif absent n'est pas un probleme :
 * c'est un choix.
 */
function existe(cle, langue = DEFAUT) {
  return chaine(langue).some((l) => textes.get(l)?.[cle] !== undefined);
}

/** La langue d'un serveur. Jamais d'exception : au pire, la langue de repli. */
function langueDe(guildId) {
  // 2.35 : une edition a une langue fixe (ex. tout en francais).
  const edition = require('../edition');
  if (edition.profil?.langue) return edition.profil.langue;
  if (!guildId) return DEFAUT;
  try {
    const { config } = require('../database/db');
    const code = config(guildId).langue;
    return LANGUES[code] ? code : DEFAUT;
  } catch {
    return DEFAUT;
  }
}

/** Un nombre ecrit comme on l'ecrit dans cette langue (1 234 / 1,234). */
function nombre(valeur, langue = DEFAUT) {
  return new Intl.NumberFormat(intl(langue)).format(valeur ?? 0);
}

/**
 * Une duree lisible. On garde les deux plus grosses unites : « 2 h 30 min »
 * plutot que « 2 heures 30 minutes 12 secondes », qui ne sert a personne.
 */
function duree(ms, langue = DEFAUT) {
  if (ms === null || ms === undefined) return t('commun.duree.permanent', langue);
  const total = Math.max(0, Math.floor(ms / 1000));
  if (total < 1) return t('commun.duree.instant', langue);

  const unites = [
    ['jour', Math.floor(total / 86400)],
    ['heure', Math.floor((total % 86400) / 3600)],
    ['minute', Math.floor((total % 3600) / 60)],
    ['seconde', total % 60],
  ].filter(([, n]) => n > 0).slice(0, 2);

  return unites.map(([u, n]) => t(`commun.duree.${u}`, langue, { n })).join(' ');
}

/**
 * Le traducteur d'un serveur : `t` sait deja dans quelle langue ecrire.
 * Accepte une interaction, un serveur, ou un identifiant.
 */
function traducteur(source) {
  const guildId = typeof source === 'string'
    ? source
    : source?.guild?.id ?? source?.guildId ?? source?.id ?? null;
  const langue = langueDe(guildId);

  return {
    langue,
    t: (cle, variables) => t(cle, langue, variables),
    existe: (cle) => existe(cle, langue),
    nombre: (valeur) => nombre(valeur, langue),
    duree: (ms) => duree(ms, langue),
  };
}

/**
 * Les localisations a passer a Discord pour le nom et la description d'une
 * commande. Discord affiche la description dans la langue de CHAQUE
 * utilisateur, sans que le bot ait quoi que ce soit a faire.
 */
function localisations(cle) {
  const sortie = {};
  for (const [code, info] of Object.entries(LANGUES)) {
    const phrase = textes.get(code)?.[cle];
    if (phrase) for (const d of [].concat(info.discord)) sortie[d] = phrase.slice(0, 100);
  }
  return Object.keys(sortie).length ? sortie : null;
}

/**
 * Ce qui manque, langue par langue. Sert au test de couverture et a la
 * commande de diagnostic : on veut savoir ce qui n'est pas traduit AVANT que
 * quelqu'un le lise.
 */
function couverture() {
  const reference = Object.keys(textes.get(DEFAUT) ?? {});
  const sortie = {};
  for (const code of Object.keys(LANGUES)) {
    const dans = textes.get(code) ?? {};
    const manquantes = reference.filter((c) => dans[c] === undefined);
    const enTrop = Object.keys(dans).filter((c) => !reference.includes(c));
    sortie[code] = {
      total: reference.length,
      traduites: reference.length - manquantes.length,
      manquantes,
      enTrop,
    };
  }
  return sortie;
}

/**
 * Relit tous les textes au demarrage.
 * Cherche les accolades mal fermees et les pluriels a rallonge — deux fautes
 * qui ne se voient qu'au moment ou la phrase s'affiche, c'est-a-dire trop tard.
 */
function verifier() {
  const problemes = [];
  for (const [code, dans] of textes) {
    for (const [cle, phrase] of Object.entries(dans)) {
      const ouvrantes = (phrase.match(/\{/g) ?? []).length;
      const fermantes = (phrase.match(/\}/g) ?? []).length;
      if (ouvrantes !== fermantes) problemes.push(`${code}:${cle} — accolade mal fermée`);
      if (phrase.split('||').length > 2) problemes.push(`${code}:${cle} — plus d'un ||`);
    }
  }
  return problemes;
}

module.exports = {
  t,
  existe,
  traducteur,
  langueDe,
  nombre,
  duree,
  localisations,
  couverture,
  verifier,
  charger,
  LANGUES,
  DEFAUT,
  NEUVE,
  intl,
  depuisDiscord,
};
