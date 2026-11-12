const { EmbedBuilder } = require('discord.js');
const config = require('../../config');
const { E } = require('./emojis');

// ------------------------------------------------------------------- EMBEDS
function embed(couleur, description) {
  return new EmbedBuilder().setColor(couleur).setDescription(description);
}

// Les quatre embeds tout prets : c'est par eux que passe la grande majorite
// des reponses du bot, donc c'est la que les emojis se voient le plus.
const embeds = {
  succes: (texte) => embed(config.couleurs.succes, `${E('succes')} ${texte}`),
  erreur: (texte) => embed(config.couleurs.erreur, `${E('erreur')} ${texte}`),
  avertissement: (texte) => embed(config.couleurs.avertissement, `${E('avertissement')} ${texte}`),
  info: (texte) => embed(config.couleurs.info, `${E('info')} ${texte}`),
  brut: (couleur = config.couleurs.principale) => new EmbedBuilder().setColor(couleur),
};

// ------------------------------------------------------------------ DUREES
/**
 * Convertit "10m", "2h30m", "7j" en millisecondes.
 * Unites acceptees : s (secondes), m (minutes), h (heures), j/d (jours), sem/w (semaines).
 * Renvoie null si le format est invalide.
 */
function parserDuree(texte) {
  if (!texte) return null;
  const regex = /(\d+)\s*(sem|semaines?|w|j|jours?|d|h|heures?|m|min|minutes?|s|sec|secondes?)/gi;
  const unites = {
    s: 1000, sec: 1000, seconde: 1000, secondes: 1000,
    m: 60000, min: 60000, minute: 60000, minutes: 60000,
    h: 3600000, heure: 3600000, heures: 3600000,
    j: 86400000, jour: 86400000, jours: 86400000, d: 86400000,
    sem: 604800000, semaine: 604800000, semaines: 604800000, w: 604800000,
  };
  let total = 0;
  let trouve = false;
  let m;
  while ((m = regex.exec(texte.toLowerCase())) !== null) {
    const valeur = parseInt(m[1], 10);
    const unite = unites[m[2]];
    if (!unite) continue;
    total += valeur * unite;
    trouve = true;
  }
  return trouve ? total : null;
}

/** Formate une duree en millisecondes en francais lisible ("2 h 30 min"). */
/**
 * Une duree en toutes lettres, dans la langue demandee.
 *
 * ELLE DELEGUE AU MOTEUR DE TRADUCTION. Cette fonction ecrivait « 7 j 3 h »
 * en francais quelle que soit la langue du serveur — et comme elle sert aux
 * sanctions, aux exclusions temporaires et aux logs vocaux, un serveur
 * anglais entierement traduit se retrouvait avec des « j » et des « min »
 * francais au milieu de ses phrases anglaises.
 *
 * Le `require` est PARESSEUX (dans le corps, pas en tete de fichier) parce
 * que langues.js et outils.js sont charges tres tot, dans un ordre qui
 * dépend de l'appelant : se requerir mutuellement au chargement donnerait un
 * module a moitie construit.
 *
 * La langue par defaut reste le francais, pour que les dizaines d'appels
 * existants qui ne la passent pas continuent de se comporter comme avant.
 *
 * @param {number|null} ms la duree, ou null pour « permanent »
 * @param {string} [langue] 'fr' ou 'en'
 */
function formaterDuree(ms, langue = 'fr') {
  return require('./langues').duree(ms, langue);
}

/** Formate un nombre avec des espaces fins ("1 234 567"). */
function formaterNombre(n) {
  return Number(n).toLocaleString('fr-FR').replace(/ | /g, ' ');
}

/** Abrege un grand nombre (1 250 -> 1,25k). */
function abreger(n) {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 2 : 1).replace('.', ',')}k`;
  return `${(n / 1_000_000).toFixed(2).replace('.', ',')}M`;
}

/** Remplace les variables d'un message personnalise. */
function remplacerVariables(texte, { membre, guild }) {
  if (!texte) return texte;
  return texte
    .replaceAll('{mention}', membre ? `<@${membre.id}>` : '')
    .replaceAll('{pseudo}', membre ? (membre.user?.username ?? membre.displayName ?? '') : '')
    .replaceAll('{tag}', membre ? (membre.user?.tag ?? membre.user?.username ?? '') : '')
    .replaceAll('{id}', membre ? membre.id : '')
    .replaceAll('{serveur}', guild ? guild.name : '')
    .replaceAll('{membres}', guild ? String(guild.memberCount) : '')
    .replaceAll('{compte}', guild ? String(guild.memberCount) : '');
}

/** Tronque une chaine pour tenir dans un champ d'embed. */
function tronquer(texte, max = 1024) {
  if (!texte) return texte;
  return texte.length > max ? `${texte.slice(0, max - 1)}…` : texte;
}

/** Verifie que le moderateur peut agir sur la cible (hierarchie + proprietaire). */
/**
 * Peut-on sanctionner ce membre ?
 *
 * ELLE REND UNE CLE DE TRADUCTION, PAS UNE PHRASE.
 *
 * Cette fonction est appelee par /ban, /kick, /mute, /warn et les
 * signalements. Tant qu'elle rendait du francais en dur, ces cinq endroits
 * pouvaient bien etre traduits : le serveur anglais recevait quand meme
 * « Ce membre a un role egal ou superieur au tien ». Une seule phrase en dur
 * au fond d'un utilitaire suffit a trahir tout le reste.
 *
 * Elle rend donc `null` (c'est bon) ou une cle que l'appelant passe a SON
 * traducteur, qui connait la langue du serveur.
 *
 * @returns {string|null} une cle de `sanction.*`, ou null si rien ne s'oppose
 */
function peutSanctionner(auteur, cible, moi) {
  if (cible.id === auteur.id) return 'sanction.soi_meme';
  if (cible.id === cible.guild.ownerId) return 'sanction.proprietaire';
  if (auteur.id !== auteur.guild.ownerId && cible.roles.highest.position >= auteur.roles.highest.position) {
    return 'sanction.role_superieur';
  }
  if (moi && cible.roles.highest.position >= moi.roles.highest.position) {
    return 'sanction.role_superieur_bot';
  }
  if (moi && !cible.manageable) return 'sanction.pas_gerable';
  return null;
}

/** Timestamp Discord dynamique. */
function ts(date, style = 'f') {
  return `<t:${Math.floor(new Date(date).getTime() / 1000)}:${style}>`;
}

/**
 * Une barre de progression en caracteres.
 * Utilisee la ou une image serait disproportionnee — un profil global, une
 * fiche. Les blocs pleins et vides se lisent dans toutes les polices, y
 * compris sur telephone.
 */
function barreProgression(part, largeur = 16) {
  const remplis = Math.max(0, Math.min(largeur, Math.round((part ?? 0) * largeur)));
  return '█'.repeat(remplis) + '░'.repeat(largeur - remplis);
}

module.exports = {
  embeds,
  barreProgression,
  parserDuree,
  formaterDuree,
  formaterNombre,
  abreger,
  remplacerVariables,
  tronquer,
  peutSanctionner,
  ts,
};
