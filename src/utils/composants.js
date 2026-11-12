/**
 * Boite a outils Components V2.
 *
 * Discord propose depuis peu une seconde facon de composer un message : au lieu
 * d'un embed unique, on empile des composants — conteneurs, blocs de texte,
 * separateurs, sections, galeries. C'est plus souple qu'un embed : on peut
 * mettre un bouton A COTE d'un paragraphe, couper proprement, alterner texte et
 * images.
 *
 * DEUX PIEGES, tous les deux silencieux :
 *
 * 1. Le drapeau IsComponentsV2 DESACTIVE `content` et `embeds`. Un message qui
 *    porte le drapeau et un `content` ne montrera pas le content — sans erreur.
 *    D'ou `envoi()` ci-dessous, qui pose le drapeau et rien d'autre : si on
 *    passe par lui, on ne peut pas se tromper.
 *
 * 2. Les fichiers joints ne s'affichent plus tout seuls. Une image doit etre
 *    exposee par une galerie ou une vignette, sinon elle reste invisible alors
 *    meme qu'elle est bien envoyee.
 *
 * Limites Discord : 40 composants par message, 4000 caracteres par bloc de
 * texte. `verifier()` les controle plutot que de laisser l'API renvoyer un
 * « Invalid Form Body » illisible.
 */
const {
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  SectionBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  ThumbnailBuilder,
  MessageFlags,
} = require('discord.js');
const conf = require('../../config');

const MAX_COMPOSANTS = 40;
const MAX_TEXTE = 4000;

/** Un bloc de texte. Le markdown Discord y fonctionne, titres ## compris. */
function texte(contenu) {
  const t = String(contenu ?? '');
  if (t.length > MAX_TEXTE) {
    throw new Error(`bloc de texte trop long (${t.length}/${MAX_TEXTE} caracteres)`);
  }
  return new TextDisplayBuilder().setContent(t);
}

/** Un trait de separation. `grand` double l'espace autour. */
function separateur(grand = false) {
  return new SeparatorBuilder()
    .setDivider(true)
    .setSpacing(grand ? SeparatorSpacingSize.Large : SeparatorSpacingSize.Small);
}

/** Un espace sans trait : pour aerer sans decouper. */
function espace(grand = false) {
  return new SeparatorBuilder()
    .setDivider(false)
    .setSpacing(grand ? SeparatorSpacingSize.Large : SeparatorSpacingSize.Small);
}

/**
 * Un paragraphe avec un bouton a sa droite. C'est ce qu'un embed ne sait pas
 * faire : ses boutons sont toujours relegues sous le message entier.
 */
function sectionBouton(contenu, bouton) {
  return new SectionBuilder().addTextDisplayComponents(texte(contenu)).setButtonAccessory(bouton);
}

/** Un paragraphe avec une vignette a sa droite. */
function sectionVignette(contenu, url, description = null) {
  const vignette = new ThumbnailBuilder().setURL(url);
  if (description) vignette.setDescription(description);
  return new SectionBuilder().addTextDisplayComponents(texte(contenu)).setThumbnailAccessory(vignette);
}

/** Une image pleine largeur. `url` accepte « attachment://nom.png ». */
function image(url, description = null) {
  const item = new MediaGalleryItemBuilder().setURL(url);
  if (description) item.setDescription(description);
  return new MediaGalleryBuilder().addItems(item);
}

/**
 * Le conteneur : le cadre a filet colore qui remplace l'embed.
 * @param {Array} elements composants deja construits, dans l'ordre d'affichage
 * @param {number} [couleur] filet de gauche ; la couleur du bot par defaut
 */
function conteneur(elements, couleur = conf.couleurs.principale) {
  const c = new ContainerBuilder().setAccentColor(couleur);
  for (const e of elements.filter(Boolean)) {
    if (e instanceof TextDisplayBuilder) c.addTextDisplayComponents(e);
    else if (e instanceof SeparatorBuilder) c.addSeparatorComponents(e);
    else if (e instanceof SectionBuilder) c.addSectionComponents(e);
    else if (e instanceof MediaGalleryBuilder) c.addMediaGalleryComponents(e);
    else c.addActionRowComponents(e); // rangee de boutons ou de menus
  }
  return c;
}

/** Compte les composants d'un arbre, pour verifier la limite des 40. */
function compter(composant) {
  const j = typeof composant?.toJSON === 'function' ? composant.toJSON() : composant;
  let n = 1;
  for (const enfant of j?.components ?? []) n += compter(enfant);
  if (j?.accessory) n += 1;
  return n;
}

/**
 * Prepare l'objet a passer a reply / editReply / update.
 *
 * On ne laisse volontairement PAS passer `content` ni `embeds` : avec ce
 * drapeau ils sont ignores en silence, et croire qu'on a envoye un texte qui
 * n'arrive jamais est le genre de bug qu'on cherche pendant une heure.
 */
function envoi(composants, options = {}) {
  const liste = Array.isArray(composants) ? composants : [composants];

  if ('content' in options || 'embeds' in options) {
    throw new Error("Components V2 : `content` et `embeds` sont ignores par Discord, tout le texte doit passer par des blocs de texte");
  }

  const total = liste.reduce((n, c) => n + compter(c), 0);
  if (total > MAX_COMPOSANTS) {
    throw new Error(`trop de composants (${total}/${MAX_COMPOSANTS})`);
  }

  return { ...options, components: liste, flags: (options.flags ?? 0) | MessageFlags.IsComponentsV2 };
}

/** Le meme, en message ephemere (visible du seul destinataire). */
function envoiPrive(composants, options = {}) {
  return envoi(composants, { ...options, flags: (options.flags ?? 0) | MessageFlags.Ephemeral });
}

// ------------------------------------------------- LES QUATRE REPONSES COURTES
/**
 * LE PENDANT V2 DE `embeds.succes` / `erreur` / `avertissement` / `info`.
 *
 * POURQUOI CES HUIT FONCTIONS EXISTENT.
 *
 * Quatre-vingt-dix pour cent des reponses du bot sont une phrase et une
 * couleur : « banni », « salon introuvable », « il te manque une permission ».
 * Tant que le seul moyen de les ecrire en V2 etait
 * `envoi([conteneur([texte(...)], couleur)])`, convertir cinquante commandes
 * voulait dire recopier cette ligne cinq cents fois — et se tromper de
 * couleur, d'emoji ou de drapeau ephemere quelque part.
 *
 * Ici, la couleur et l'emoji sont choisis par le NOM de la fonction. On ne
 * peut plus mettre l'emoji d'erreur sur un message de succes, et le passage
 * d'une commande a V2 redevient ce qu'il doit etre : un remplacement mot pour
 * mot.
 *
 *   AVANT  interaction.reply({ embeds: [embeds.erreur(msg)], flags: Ephemeral })
 *   APRES  interaction.reply(C.erreurPrivee(msg))
 *
 * `elements` sert aux rares cas ou la phrase ne suffit pas : on ajoute une
 * rangee de boutons ou un separateur SOUS le texte, sans perdre le cadre.
 */
const BANDEAUX = {
  succes: { emoji: 'succes', couleur: 'succes' },
  erreur: { emoji: 'erreur', couleur: 'erreur' },
  avertissement: { emoji: 'avertissement', couleur: 'avertissement' },
  info: { emoji: 'info', couleur: 'info' },
};

/** Le conteneur seul, quand on veut l'empiler avec d'autres. */
function bandeau(type, contenu, elements = []) {
  const { E } = require('./emojis');
  const style = BANDEAUX[type];
  if (!style) throw new Error(`bandeau inconnu : ${type}`);
  return conteneur(
    [texte(`${E(style.emoji)} ${contenu}`), ...elements],
    conf.couleurs[style.couleur]
  );
}

const reponses = {};
for (const type of Object.keys(BANDEAUX)) {
  // Publique : tout le salon la voit.
  reponses[type] = (contenu, { elements = [], ...options } = {}) =>
    envoi([bandeau(type, contenu, elements)], options);

  // Privee : le seul destinataire la voit. Le nom porte le « e » du feminin
  // (erreurPrivee, infoPrivee) parce qu'on le lit dans du code francais toute
  // la journee, et qu'un nom qui accroche l'oeil se relit mal.
  const feminin = type === 'succes' ? 'Prive' : 'Privee';
  reponses[type + feminin] = (contenu, { elements = [], ...options } = {}) =>
    envoiPrive([bandeau(type, contenu, elements)], options);
}

module.exports = {
  texte,
  separateur,
  espace,
  sectionBouton,
  sectionVignette,
  image,
  conteneur,
  envoi,
  envoiPrive,
  bandeau,
  ...reponses,
  compter,
  MAX_COMPOSANTS,
  MAX_TEXTE,
};
