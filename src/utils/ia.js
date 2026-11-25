/**
 * Wumi 2.32 : les modeles d'IA, executes EN LOCAL sur le serveur du bot
 * (aucune API, aucun message envoye ailleurs).
 *
 * Bibliotheque : @huggingface/transformers (ONNX). Elle est OPTIONNELLE : si
 * elle n'est pas installee (`npm install @huggingface/transformers`), toutes
 * les fonctions ci-dessous repondent « indisponible » et le bot tourne comme
 * avant. `IA_DESACTIVEE=1` dans le .env coupe tout sans desinstaller.
 *
 * Modeles (telecharges une fois dans data/modeles au premier usage) :
 *  - toxicite : onnx-community/bert-multilingual-toxicity-classifier-ONNX
 *               (textdetox, multilingue, licence OpenRAIL++), ~180 Mo en int8
 *  - images   : AdamCodd/vit-base-nsfw-detector (Apache-2.0), ~90 Mo en int8
 *  - traduction : Xenova/opus-mt-* (Helsinki-NLP, CC-BY-4.0), ~80 Mo par paire
 *
 * Tout passe par UNE file d'attente : une seule inference a la fois, pour ne
 * jamais saturer le processeur du serveur. Si la file deborde (gros raid de
 * messages), les verifications IA sont sautees plutot que de retarder le bot.
 */
const path = require('node:path');
const logger = require('./logger');

const MODELES = {
  toxicite: 'onnx-community/bert-multilingual-toxicity-classifier-ONNX',
  images: 'AdamCodd/vit-base-nsfw-detector',
  // 2.33 : comprend le SENS d'une phrase, dans plus de 50 langues (FAQ).
  // Mesure sur le serveur (2.33.1) : MiniLM separe trop mal les bonnes et les
  // mauvaises fiches ; mpnet (~280 Mo) les distingue nettement.
  semantique: 'Xenova/paraphrase-multilingual-mpnet-base-v2',
};
const SEMANTIQUE_REPOS_MS = 30 * 60_000; // libere apres 30 min sans question
const FILE_MAX = 25;          // inferences en attente au-dela desquelles on saute
const DELAI_MAX_MS = 20_000;  // une inference qui depasse ce delai est abandonnee
const TRADUCTEURS_MAX = 2;    // paires de traduction gardees en memoire
const TRADUCTEUR_REPOS_MS = 15 * 60_000; // liberees apres 15 min sans usage

let bibliotheque = null;      // le module, une fois charge
let etat = process.env.IA_DESACTIVEE === '1' ? 'desactivee' : 'inconnue';
let chargement = null;

/** Charge @huggingface/transformers (module ESM) une seule fois. */
async function lib() {
  if (bibliotheque) return bibliotheque;
  if (etat === 'desactivee' || etat === 'absente') return null;
  chargement ??= import('@huggingface/transformers')
    .then((m) => {
      m.env.cacheDir = process.env.IA_DOSSIER || path.join(__dirname, '..', '..', 'data', 'modeles');
      m.env.allowLocalModels = false;
      bibliotheque = m;
      etat = 'prete';
      return m;
    })
    .catch((e) => {
      etat = 'absente';
      logger.avertissement('IA : @huggingface/transformers absent, fonctions IA desactivees (' + e.message + ')');
      return null;
    });
  return chargement;
}

/** La bibliotheque est-elle utilisable ? (sans la charger si on ne sait pas encore) */
function disponible() {
  return etat !== 'desactivee' && etat !== 'absente';
}

/** Comme disponible(), mais en verifiant vraiment (charge la bibliotheque une fois). */
async function pret() {
  return (await lib()) !== null;
}

// ---------------------------------------------------------------- FILE
let enCours = Promise.resolve();
let attente = 0;
/** Execute `travail` quand les inferences precedentes sont finies. null si la file deborde. */
function enFile(travail) {
  if (attente >= FILE_MAX) return Promise.resolve(null);
  attente++;
  const suite = enCours.then(async () => {
    let minuteur;
    try {
      return await Promise.race([
        travail(),
        new Promise((_, rej) => { minuteur = setTimeout(() => rej(new Error('delai depasse')), DELAI_MAX_MS); }),
      ]);
    } finally {
      clearTimeout(minuteur);
      attente--;
    }
  });
  enCours = suite.catch(() => null);
  return suite;
}

// ---------------------------------------------------------------- PIPELINES
const pipelines = new Map();     // nom -> Promise<pipeline>
async function pipelineDe(tache, modele) {
  const m = await lib();
  if (!m) return null;
  if (!pipelines.has(modele)) {
    const debut = Date.now();
    logger.info(`IA : chargement de ${modele}…`);
    const p = m.pipeline(tache, modele, { dtype: 'q8' })
      .then((pipe) => { logger.succes(`IA : ${modele} pret (${Math.round((Date.now() - debut) / 1000)} s)`); return pipe; })
      .catch((e) => { pipelines.delete(modele); throw e; });
    pipelines.set(modele, p);
  }
  return pipelines.get(modele);
}

/** Libere une pipeline (traductions peu utilisees). */
async function liberer(modele) {
  const p = pipelines.get(modele);
  pipelines.delete(modele);
  try { await (await p)?.dispose?.(); } catch { /* deja liberee */ }
}

/** Precharge un modele en arriere-plan (a l'activation d'un module). */
function prechauffer(quoi) {
  if (!disponible()) return;
  const [tache, modele] = {
    images: ['image-classification', MODELES.images],
    sens: ['feature-extraction', MODELES.semantique],
  }[quoi] ?? ['text-classification', MODELES.toxicite];
  if (quoi === 'sens') garderSemantique();
  pipelineDe(tache, modele).catch((e) => logger.avertissement(`IA : ${modele} indisponible :`, e.message));
}

// ---------------------------------------------------------------- TOXICITE
/**
 * Probabilite (0 a 1) qu'un texte soit toxique. null si l'IA est indisponible
 * ou occupee.
 */
async function toxicite(texte) {
  if (!disponible() || !texte?.trim()) return null;
  return enFile(async () => {
    const pipe = await pipelineDe('text-classification', MODELES.toxicite);
    if (!pipe) return null;
    const sorties = await pipe(texte.slice(0, 1000), { top_k: null });
    return scoreToxique(sorties);
  }).catch((e) => { logger.debug('IA toxicite :', e.message); return null; });
}

/** Lit le score « toxique » dans la sortie du classifieur, quels que soient les noms des etiquettes. */
function scoreToxique(sorties) {
  const liste = (Array.isArray(sorties?.[0]) ? sorties[0] : sorties) ?? [];
  const toxique = liste.find((s) => /toxic|LABEL_1|^1$/i.test(String(s.label)));
  if (toxique) return toxique.score;
  const neutre = liste.find((s) => /neutral|non|LABEL_0|^0$/i.test(String(s.label)));
  return neutre ? 1 - neutre.score : null;
}

// ---------------------------------------------------------------- IMAGES
/** Probabilite (0 a 1) qu'une image (URL) soit NSFW. */
async function nsfw(url) {
  if (!disponible() || !url) return null;
  return enFile(async () => {
    const pipe = await pipelineDe('image-classification', MODELES.images);
    if (!pipe) return null;
    const sorties = await pipe(url, { top_k: null });
    const n = (sorties ?? []).find((s) => /^nsfw$/i.test(s.label));
    if (n) return n.score;
    const s = (sorties ?? []).find((x) => /^sfw$/i.test(x.label));
    return s ? 1 - s.score : null;
  }).catch((e) => { logger.debug('IA images :', e.message); return null; });
}

// ---------------------------------------------------------------- SENS (2.33)
let reposSemantique = null;
function garderSemantique() {
  clearTimeout(reposSemantique);
  reposSemantique = setTimeout(() => liberer(MODELES.semantique), SEMANTIQUE_REPOS_MS);
  reposSemantique.unref?.();
}

/**
 * Un vecteur de sens (norme 1) pour chaque texte : deux phrases qui veulent
 * dire la meme chose, meme dans deux langues differentes, ont des vecteurs
 * proches. null si l'IA est indisponible ou occupee.
 */
async function vecteurs(textes) {
  const liste = (Array.isArray(textes) ? textes : [textes]).map((x) => String(x ?? '').slice(0, 600));
  if (!disponible() || !liste.length) return null;
  return enFile(async () => {
    const pipe = await pipelineDe('feature-extraction', MODELES.semantique);
    if (!pipe) return null;
    garderSemantique();
    const sortie = await pipe(liste, { pooling: 'mean', normalize: true });
    return sortie.tolist();
  }).catch((e) => { logger.debug('IA sens :', e.message); return null; });
}

/** Similarite cosinus de deux vecteurs de norme 1 (-1 a 1). */
function similarite(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

// ---------------------------------------------------------------- TRADUCTION
// Paires disponibles en ONNX chez Xenova (Helsinki-NLP / opus-mt).
const PAIRES = new Set([
  'de-en', 'de-es', 'de-fr', 'en-de', 'en-es', 'en-fr', 'en-it',
  'es-de', 'es-en', 'es-fr', 'es-it', 'fr-de', 'fr-en', 'fr-es', 'it-en', 'it-es',
]);
// Jetons de langue cible du modele en-mul (pour le portugais).
const JETON_MUL = { pt: '>>por<<', it: '>>ita<<', es: '>>spa<<', fr: '>>fra<<', de: '>>deu<<' };

/**
 * Les etapes de traduction de `source` vers `cible`, en passant par l'anglais
 * quand il n'existe pas de modele direct. Chaque etape : { modele, prefixe }.
 */
function etapes(source, cible) {
  if (source === cible) return [];
  if (PAIRES.has(`${source}-${cible}`)) return [{ modele: `Xenova/opus-mt-${source}-${cible}` }];
  const versAnglais = source === 'en' ? []
    : [{ modele: PAIRES.has(`${source}-en`) ? `Xenova/opus-mt-${source}-en` : 'Xenova/opus-mt-mul-en' }];
  if (cible === 'en') return versAnglais;
  const depuisAnglais = PAIRES.has(`en-${cible}`)
    ? { modele: `Xenova/opus-mt-en-${cible}` }
    : { modele: 'Xenova/opus-mt-en-mul', prefixe: JETON_MUL[cible] };
  return [...versAnglais, depuisAnglais];
}

const utilisation = [];  // modeles de traduction, du plus recent au plus ancien
const minuteurs = new Map();
function retenir(modele) {
  const i = utilisation.indexOf(modele);
  if (i >= 0) utilisation.splice(i, 1);
  utilisation.unshift(modele);
  while (utilisation.length > TRADUCTEURS_MAX) liberer(utilisation.pop());
  // Un modele de traduction occupe ~200 Mo de memoire : on le rend apres un
  // quart d'heure sans traduction (il se recharge en 2 s au besoin).
  clearTimeout(minuteurs.get(modele));
  const m = setTimeout(() => {
    minuteurs.delete(modele);
    const j = utilisation.indexOf(modele);
    if (j >= 0) utilisation.splice(j, 1);
    liberer(modele);
  }, TRADUCTEUR_REPOS_MS);
  m.unref?.();
  minuteurs.set(modele, m);
}

/** Decoupe un texte en morceaux de phrases (les modeles opus-mt sont limites a ~512 jetons). */
function morceaux(texte, max = 400) {
  const sortie = [];
  for (const ligne of texte.split('\n')) {
    if (!ligne.trim()) { sortie.push({ texte: ligne, vide: true }); continue; }
    let courant = '';
    for (const phrase of ligne.match(/[^.!?…]+[.!?…]*\s*/g) ?? [ligne]) {
      if ((courant + phrase).length > max && courant) { sortie.push({ texte: courant }); courant = ''; }
      courant += phrase;
    }
    if (courant) sortie.push({ texte: courant });
  }
  return sortie;
}

/**
 * Traduit `texte` de `source` vers `cible` (fr, en, es, de, pt, it).
 * Renvoie le texte traduit, ou null si l'IA est indisponible.
 */
async function traduire(texte, source, cible) {
  if (!disponible() || !texte?.trim()) return null;
  const plan = etapes(source, cible);
  if (!plan.length) return texte;
  return enFile(async () => {
    let parties = morceaux(texte.slice(0, 2000));
    for (const etape of plan) {
      const pipe = await pipelineDe('translation', etape.modele);
      if (!pipe) return null;
      retenir(etape.modele);
      const traduites = [];
      for (const p of parties) {
        if (p.vide) { traduites.push(p); continue; }
        const [r] = await pipe((etape.prefixe ? `${etape.prefixe} ` : '') + p.texte.trim(), { max_new_tokens: 512 });
        traduites.push({ texte: r?.translation_text ?? p.texte });
      }
      parties = traduites;
    }
    return parties.map((p) => p.texte.trim()).join('\n').replace(/\n{3,}/g, '\n\n').trim();
  }).catch((e) => { logger.avertissement('IA traduction :', e.message); return null; });
}

// ---------------------------------------------------------------- LANGUE
// Detection de la langue d'un message par mots courants : suffisant pour des
// phrases de chat, instantane et sans modele a charger.
const MOTS = {
  fr: 'le la les de des du un une et est je tu il elle nous vous ils pas ne que qui quoi pour dans sur avec ce cette mais ou au aux mon ton son moi toi ça ca oui non bonjour salut merci tres bien fait sont suis es avez',
  en: 'the a an and is are was were i you he she we they not that what who for in on with this but or my your his her me it yes no hello hi thanks very good do does have has will can just',
  es: 'el la los las de del un una y es son yo tu el ella nosotros no que quien para en con este esta pero o mi su me si hola gracias muy bien hace tengo eres estoy esta como por',
  de: 'der die das den dem des ein eine und ist sind ich du er sie wir ihr nicht dass was wer fur in auf mit dieser aber oder mein dein sein mich ja nein hallo danke sehr gut hat habe bin bist wie',
  pt: 'o a os as de do da dos das um uma e é sou eu tu ele ela nos voce voces nao que quem para em no na com este esta mas ou meu seu me sim ola obrigado muito bem tem tenho como por',
  it: 'il lo la gli le di del della un una e è sono io tu lui lei noi voi non che chi per in con questo questa ma o mio tuo suo mi si ciao grazie molto bene ha ho sei come anche',
};
const DICO = Object.fromEntries(Object.entries(MOTS).map(([l, m]) => [l, new Set(m.split(' '))]));

/** Langue probable d'un texte parmi fr/en/es/de/pt/it, ou null si trop court. */
function detecterLangue(texte) {
  const mots = String(texte ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z\s']/g, ' ').split(/[\s']+/).filter(Boolean);
  if (!mots.length) return null;
  const scores = Object.fromEntries(Object.keys(DICO).map((l) => [l, 0]));
  for (const m of mots) for (const l of Object.keys(DICO)) if (DICO[l].has(m)) scores[l]++;
  // Indices forts propres a une langue (accents d'origine)
  const brut = String(texte);
  if (/[ñ¿¡]/i.test(brut)) scores.es += 2;
  if (/[ß]|\b(ich|nicht|und)\b/i.test(brut)) scores.de += 1;
  if (/[ãõ]|ção|ções/i.test(brut)) scores.pt += 2;
  if (/[àèìòù]\b|\b(è|perché|anche)\b/i.test(brut)) scores.it += 1;
  if (/\b(c'est|j'ai|qu'il|d'un|l'on)\b|[êœ]/i.test(brut)) scores.fr += 2;
  const [meilleure, score] = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];
  return score > 0 ? meilleure : null;
}

module.exports = {
  MODELES,
  disponible,
  pret,
  etat: () => etat,
  prechauffer,
  toxicite,
  scoreToxique,
  nsfw,
  traduire,
  etapes,
  morceaux,
  detecterLangue,
  vecteurs,
  similarite,
};
