/**
 * Petit logger console avec couleurs et horodatage.
 *
 * Chaque ligne est aussi gardee en memoire dans un tampon circulaire : c'est
 * ce que le panneau web affiche dans son onglet Console. Le tampon vit dans le
 * processus, il n'ecrit rien sur le disque et disparait au redemarrage — les
 * logs durables, ce sont les salons de logs Discord.
 */
const couleurs = {
  reset: '\x1b[0m',
  gris: '\x1b[90m',
  rouge: '\x1b[31m',
  vert: '\x1b[32m',
  jaune: '\x1b[33m',
  bleu: '\x1b[34m',
  cyan: '\x1b[36m',
};

// La taille du tampon se regle dans config.js. Le require est protege : le
// logger est charge tres tot, avant que la config ne soit forcement lisible.
let reglages = { lignes: 2000, actions: true, detail: true };
try {
  reglages = { ...reglages, ...(require('../../config').console ?? {}) };
} catch {
  /* config illisible : on garde les valeurs par defaut */
}

const TAILLE_TAMPON = Math.max(100, Math.min(20_000, reglages.lignes || 2000));
const LONGUEUR_MAX = 2000; // une trace d'erreur ne doit pas manger le tampon

const tampon = [];
let compteur = 0; // identifiant croissant : sert de curseur au panneau

/** Enleve les codes couleur ANSI : le panneau affiche du texte, pas du terminal. */
function sansCouleurs(texte) {
  // eslint-disable-next-line no-control-regex
  return texte.replace(/\x1b\[[0-9;]*m/g, '');
}

/** Met un argument quelconque en texte lisible. */
function enTexte(v) {
  if (typeof v === 'string') return v;
  if (v instanceof Error) return v.stack || v.message;
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

function memoriser(niveau, args) {
  let texte = sansCouleurs(args.map(enTexte).join(' '));
  if (texte.length > LONGUEUR_MAX) texte = `${texte.slice(0, LONGUEUR_MAX)}… (${texte.length} caractères)`;
  tampon.push({ id: ++compteur, date: Date.now(), niveau, texte });
  if (tampon.length > TAILLE_TAMPON) tampon.shift();
}

// Abonnes prevenus a chaque erreur. Le logger ne connait pas Discord — c'est
// le module d'alerte qui s'abonne, une fois le bot connecte.
const abonnes = [];

/** S'abonner aux erreurs. Renvoie de quoi se desabonner. */
function surErreur(rappel) {
  abonnes.push(rappel);
  return () => {
    const i = abonnes.indexOf(rappel);
    if (i >= 0) abonnes.splice(i, 1);
  };
}

function ecrire(couleur, etiquette, niveau, args) {
  memoriser(niveau, args);

  if (niveau === 'erreur' && abonnes.length) {
    const ligne = tampon[tampon.length - 1];
    for (const rappel of abonnes) {
      // Un abonne qui plante ne doit surtout pas empecher le log : on serait
      // aveugle au moment precis ou on a besoin de voir.
      try {
        rappel(ligne);
      } catch {
        /* ignore */
      }
    }
  }

  console.log(
    `${couleurs.gris}[${new Date().toLocaleString('fr-FR', { timeZone: 'Europe/Paris' })}]${couleurs.reset} ` +
      `${couleur}${etiquette}${couleurs.reset}`,
    ...args
  );
}

/**
 * Lignes posterieures a un curseur.
 * @param {number} depuis identifiant de la derniere ligne deja recue (0 = tout)
 * @param {number} limite nombre maximum de lignes rendues
 */
function lignes(depuis = 0, limite = TAILLE_TAMPON) {
  const suite = depuis > 0 ? tampon.filter((l) => l.id > depuis) : tampon.slice();
  // Si le panneau a ete ferme longtemps, son curseur peut pointer avant le
  // debut du tampon : on rend alors la fin, et le panneau le signale.
  const coupe = suite.length > limite ? suite.slice(-limite) : suite;
  return {
    lignes: coupe,
    curseur: compteur,
    total: tampon.length,
    // Vrai si des lignes ont ete perdues entre le curseur du panneau et le tampon.
    trou: depuis > 0 && tampon.length > 0 && depuis < tampon[0].id - 1,
  };
}

function vider() {
  tampon.length = 0;
  return compteur;
}

/**
 * Une action d'un membre : commande lancee, bouton clique, arrivee, sanction…
 *
 * C'est le niveau le plus bavard, et le plus utile pour comprendre ce qui
 * s'est passe sur le serveur. Il a son propre niveau pour qu'on puisse le
 * filtrer d'un clic dans le panneau, ou le couper dans config.js.
 *
 * @param {string} quoi  le geste, en un mot ou deux : "/rank", "bouton", "arrivee"
 * @param {string} qui   le pseudo, deja mis en forme
 * @param {string} [ou]  le salon, sans le diese
 * @param {string} [note] ce qu'il faut savoir en plus (duree, resultat, raison)
 */
function action(quoi, qui, ou = null, note = null) {
  if (!reglages.actions) return;
  const morceaux = [quoi];
  if (qui) morceaux.push(`par ${qui}`);
  if (ou && reglages.detail) morceaux.push(`dans #${ou}`);
  if (note) morceaux.push(`— ${note}`);
  ecrire(couleurs.bleu, 'ACTION', 'action', [morceaux.join(' ')]);
}

module.exports = {
  info: (...a) => ecrire(couleurs.cyan, 'INFO ', 'info', a),
  succes: (...a) => ecrire(couleurs.vert, 'OK   ', 'succes', a),
  avertissement: (...a) => ecrire(couleurs.jaune, 'WARN ', 'avertissement', a),
  erreur: (...a) => ecrire(couleurs.rouge, 'ERREUR', 'erreur', a),
  debug: (...a) => {
    if (process.env.DEBUG === 'true') ecrire(couleurs.gris, 'DEBUG', 'debug', a);
  },
  action,
  surErreur,
  actionsActives: () => Boolean(reglages.actions),
  detailActif: () => Boolean(reglages.detail),
  lignes,
  vider,
  TAILLE_TAMPON,
};
