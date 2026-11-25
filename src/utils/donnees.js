/**
 * Les DONNEES de config.js dans la langue du serveur (Wumi 2.24).
 *
 * Les themes de carte, les objets de la boutique et les badges sont decrits
 * dans config.js, en francais. Leur nom et leur description traduits vivent
 * sous `donnees.<type>.<cle>.nom|description` dans les fichiers de langue ;
 * le reste (prix, couleurs, emoji, effet) reste dans config.js.
 *
 * Une donnee sans traduction garde son texte de config.js : on n'affiche
 * jamais une cle brute.
 */
const langues = require('./langues');

/** Une copie de `objet` avec nom et description dans `langue`. */
function localiser(type, cle, objet, langue) {
  if (!objet || !cle || !langue) return objet;
  const base = `donnees.${type}.${cle}`;
  const sortie = { ...objet };
  if (langues.existe(`${base}.nom`, langue)) sortie.nom = langues.t(`${base}.nom`, langue);
  if (langues.existe(`${base}.description`, langue)) sortie.description = langues.t(`${base}.description`, langue);
  return sortie;
}

/** La langue d'un serveur (raccourci). */
const langueDe = (guildId) => langues.langueDe(guildId);

/**
 * Le nom d'une donnee dans les deux langues, pour les choix de commande :
 * Discord affiche a chacun le nom dans SA langue.
 */
function nomsChoix(type, cle, objet, prefixe = '') {
  const fr = localiser(type, cle, objet, 'fr')?.nom ?? objet.nom;
  const en = localiser(type, cle, objet, 'en')?.nom ?? objet.nom;
  const nom = (n) => `${prefixe}${n}`.trim().slice(0, 100);
  return { name: nom(fr), name_localizations: { 'en-US': nom(en), 'en-GB': nom(en) } };
}

module.exports = { localiser, langueDe, nomsChoix };
