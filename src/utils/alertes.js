/**
 * Les erreurs du bot, envoyees dans LOG_ERREURS sur le serveur support.
 *
 * Une erreur qui passe inapercue dans une fenetre fermee, c'est un systeme
 * qui ne marche plus sans que personne ne le sache.
 *
 * Trois precautions, sans lesquelles le remede serait pire que le mal :
 *  - on regroupe les erreurs identiques : une boucle qui echoue cent fois
 *    donne un message, puis un rappel avec le compteur ;
 *  - on limite la cadence par erreur (LOG_ERREURS_PAUSE, 120 s par defaut) ;
 *  - une erreur pendant l'envoi de l'alerte n'en declenche pas une autre.
 *
 * Reglages du .env :
 *   LOG_ERREURS          le salon
 *   LOG_ERREURS_MENTION  qui pinger a une erreur NOUVELLE (un ID de role ou de
 *                        membre ; vide = personne). Les repetitions ne pingent
 *                        jamais.
 *   LOG_ERREURS_PAUSE    secondes minimum entre deux alertes d'une meme erreur
 */
const { AttachmentBuilder } = require('discord.js');
const conf = require('../../config');
const logger = require('./logger');
const journal = require('./journalSupport');
const C = require('./composants');

const OUBLI_MS = 30 * 60_000; // au-dela, une erreur identique redevient neuve
const EXTRAIT = 1800; // caracteres de trace montres dans le message

const pause = () => Math.max(10, Number(process.env.LOG_ERREURS_PAUSE) || 120) * 1000;

let client = null;
let desabonner = null;
let enTrainDEnvoyer = false;
let menage = null;

// signature -> { compte, envoye, premier, dernier, dernierEnvoi, derniereLigne }
const vues = new Map();

/**
 * Signature d'une erreur : sa premiere ligne, sans les chiffres.
 * "Commande rank : timeout apres 3000 ms" et "… apres 5000 ms" sont le meme
 * probleme ; les distinguer ferait deux alertes pour rien.
 */
function signature(texte) {
  return (texte.split('\n')[0] ?? texte).replace(/\d+/g, '#').slice(0, 200);
}

/** La mention a mettre devant une erreur neuve, ou null. */
function mention() {
  const id = String(process.env.LOG_ERREURS_MENTION ?? '').trim();
  if (!/^\d{17,20}$/.test(id)) return null;
  // On ne sait pas si c'est un role ou un membre : on essaie le role si le
  // serveur support le connait, sinon on mentionne un membre.
  const support = require('./fondateur').serveurSupport();
  const guild = support ? client?.guilds?.cache?.get(support) : null;
  return guild?.roles?.cache?.has(id) ? `<@&${id}>` : `<@${id}>`;
}

/** Ou l'erreur est nee : le premier fichier du projet dans la trace. */
function origine(texte) {
  const m = texte.match(/\(?([^\s()]*src[\\/][^\s():]+):(\d+):\d+\)?/);
  if (!m) return null;
  const chemin = m[1].split(/src[\\/]/).pop();
  return `src/${chemin.replace(/\\/g, '/')}:${m[2]}`;
}

async function envoyer(entree, neuve) {
  if (!journal.salonId('erreurs')) return;

  const texte = entree.derniereLigne.texte;
  const repetitions = entree.compte - (entree.envoye ?? 0);
  const ou = origine(texte);
  const trop = texte.length > EXTRAIT;

  const elements = [
    C.texte(`## ${neuve ? '🚨 Nouvelle erreur' : '🔁 Erreur répétée'}\n**${signature(texte).replace(/[`*_]/g, '').slice(0, 180)}**`),
    C.texte(`\`\`\`js\n${texte.slice(0, EXTRAIT).replace(/```/g, 'ˋˋˋ')}${trop ? '\n…' : ''}\n\`\`\``),
    C.separateur(),
    C.texte([
      ou ? `📍 **Origine** · \`${ou}\`` : null,
      repetitions > 1 ? `🔁 **${repetitions} fois** depuis la dernière alerte` : null,
      `🕒 **Première fois** · <t:${Math.floor(entree.premier / 1000)}:R>`,
      `🖥️ **Process** · PID ${process.pid}${client?.shard ? ` · shard ${client.shard.ids.join(',')}` : ''} · ${Math.round(process.memoryUsage().rss / 1048576)} Mo`,
    ].filter(Boolean).join('\n')),
    C.texte(`-# Console du panneau → filtre « Erreurs » pour le détail · <t:${Math.floor(entree.derniereLigne.date / 1000)}:f>`),
  ];

  // Trace complete en piece jointe quand elle ne tient pas dans le message.
  const fichiers = trop
    ? [new AttachmentBuilder(Buffer.from(texte, 'utf8'), { name: 'trace.txt' })]
    : [];

  await journal.envoyer('erreurs', [C.conteneur(elements, conf.couleurs.erreur)], {
    fichiers,
    mention: neuve ? mention() : null,
  });

  entree.envoye = entree.compte;
  entree.dernierEnvoi = Date.now();
}

/** Recoit une ligne d'erreur du logger. */
function noter(ligne) {
  if (!client || enTrainDEnvoyer) return;

  const cle = signature(ligne.texte);
  const maintenant = Date.now();
  let entree = vues.get(cle);

  // Passe la fenetre d'oubli, on repart de zero : c'est un nouvel incident.
  if (entree && maintenant - entree.dernier > OUBLI_MS) entree = null;

  const neuve = !entree;
  if (!entree) {
    entree = { compte: 0, envoye: 0, premier: maintenant, dernier: maintenant, dernierEnvoi: 0 };
    vues.set(cle, entree);
  }
  entree.compte++;
  entree.dernier = maintenant;
  entree.derniereLigne = ligne;

  if (maintenant - entree.dernierEnvoi < pause()) return;

  enTrainDEnvoyer = true;
  Promise.resolve(envoyer(entree, neuve))
    .catch(() => null)
    .finally(() => {
      enTrainDEnvoyer = false;
    });
}

/** Branche les alertes. A appeler une fois le bot connecte. */
function demarrer(clientDiscord) {
  client = clientDiscord;
  journal.brancher(clientDiscord);
  if (desabonner) desabonner();
  desabonner = logger.surErreur(noter);

  // Menage : sans ca, un bot qui tourne des mois garderait une entree par
  // erreur distincte jamais revue.
  if (menage) clearInterval(menage);
  menage = setInterval(() => {
    const limite = Date.now() - OUBLI_MS;
    for (const [cle, e] of vues) if (e.dernier < limite) vues.delete(cle);
  }, OUBLI_MS);
  menage.unref?.();

  if (journal.salonId('erreurs')) logger.info('Alertes d\'erreur actives (LOG_ERREURS).');
  else logger.info('Alertes d\'erreur inactives : renseigne LOG_ERREURS dans le .env.');
}

function arreter() {
  if (desabonner) desabonner();
  if (menage) clearInterval(menage);
  desabonner = null;
  menage = null;
  client = null;
  vues.clear();
}

module.exports = { demarrer, arreter, noter, signature, origine, OUBLI_MS };
