/**
 * Les murs qu'un bot public finit par rencontrer.
 *
 * Ils n'arrivent pas progressivement : ce sont des seuils, et on les decouvre
 * en general le jour ou quelque chose casse. Autant les annoncer avant.
 *
 *   100 serveurs  Discord exige une VERIFICATION de l'application pour
 *                 continuer a accorder les intents privilegies (liste des
 *                 membres, contenu des messages). Le dossier prend des
 *                 semaines : il faut le deposer AVANT d'y etre.
 *
 *  2500 serveurs  Discord impose le SHARDING : le bot doit se decouper en
 *                 plusieurs connexions. Un seul processus ne peut plus se
 *                 connecter du tout — ce n'est pas un ralentissement, c'est un
 *                 refus.
 */
const logger = require('./logger');

const SEUILS = [
  {
    a: 75,
    titre: 'Verification Discord a preparer',
    texte:
      'Le bot approche des 100 serveurs. A 100, Discord exige une verification de '
      + "l'application pour garder les intents privilegies. Le dossier se depose dans le "
      + 'Developer Portal, et la reponse prend des semaines : mieux vaut le faire maintenant.',
  },
  {
    a: 100,
    titre: 'Seuil de verification atteint',
    texte:
      'Le bot est sur 100 serveurs ou plus. Si la verification n\'est pas faite, Discord peut '
      + 'retirer les intents privilegies. Le bot continuera de tourner — il sait faire sans — '
      + 'mais l\'automod, la FAQ automatique et les messages de bienvenue s\'arreteront.',
  },
  {
    a: 2000,
    titre: 'Sharding a prevoir',
    texte:
      'Le bot approche des 2500 serveurs, ou Discord impose le sharding. Au-dela, un processus '
      + 'unique ne peut plus se connecter du tout. Il faudra passer par un ShardingManager, et '
      + 'sortir la base SQLite du processus (un seul fichier ne se partage pas bien entre shards).',
  },
];

let dejaDit = 0;

/**
 * Previent une seule fois par seuil franchi.
 * @param {number} serveurs nombre de serveurs
 */
function verifier(serveurs) {
  for (const seuil of SEUILS) {
    if (serveurs >= seuil.a && dejaDit < seuil.a) {
      dejaDit = seuil.a;
      logger.avertissement(`${seuil.titre} (${serveurs} serveurs) — ${seuil.texte}`);
    }
  }
}

module.exports = { verifier, SEUILS };
