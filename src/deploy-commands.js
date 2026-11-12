require('dotenv').config();

const fs = require('node:fs');
const path = require('node:path');
const { REST, Routes } = require('discord.js');
const logger = require('./utils/logger');

// Deux jeux de commandes, et ils ne vont PAS au meme endroit.
//
//   publiques   tout le monde, sur tous les serveurs -> deploiement global
//   fondateur   /admin et compagnie -> UNIQUEMENT sur le serveur support
//
// Une commande se declare fondateur avec `fondateur: true` dans son module.
// C'est ce qui fait que personne, sur aucun autre serveur, ne voit meme leur
// existence en tapant « / ».
//
// ------------------------------------------------------------------------
// LE PIEGE QUI A COUTE UNE SOIREE
//
// `rest.put(applicationGuildCommands(...))` REMPLACE la liste d'un serveur.
// Ce n'est pas un ajout. Une version precedente de ce fichier envoyait
// d'abord les 54 commandes publiques sur les serveurs de GUILD_ID, PUIS les
// commandes de fondateur sur le serveur support — avec un second put. Quand
// le serveur support figurait aussi dans GUILD_ID (le cas de tout le monde au
// debut : c'est le meme serveur), le second put effacait les 54 premieres et
// il ne restait plus que /admin.
//
// Symptome exact : « je ne vois que les commandes admin sur mon serveur ».
//
// La regle, maintenant : UN SEUL put par serveur, avec la liste complete de
// ce que ce serveur doit avoir.
// ------------------------------------------------------------------------
const commandes = [];
const commandesFondateur = [];

function parcourir(dossier) {
  for (const entree of fs.readdirSync(dossier, { withFileTypes: true })) {
    const chemin = path.join(dossier, entree.name);
    if (entree.isDirectory()) parcourir(chemin);
    else if (entree.name.endsWith('.js')) {
      const commande = require(chemin);
      if (!commande?.data) continue;
      // Les commandes en beta vivent, comme celles du fondateur, sur le seul
      // serveur support.
      (commande.fondateur || commande.beta || commande.support ? commandesFondateur : commandes).push(commande.data.toJSON());
    }
  }
}

parcourir(path.join(__dirname, 'commands'));

const CLIENT_ID = String(process.env.CLIENT_ID ?? '').trim();
const SUPPORT = String(process.env.SUPPORT_GUILD_ID ?? '').trim();
const estUnId = (v) => /^\d{17,20}$/.test(v);

/**
 * Ce qu'un serveur donne doit avoir : les commandes publiques, plus celles du
 * fondateur s'il s'agit du serveur support. En une seule liste, donc en un
 * seul envoi.
 */
function listePour(guildId) {
  return guildId === SUPPORT ? [...commandes, ...commandesFondateur] : [...commandes];
}

async function deployerServeur(rest, guildId, corps) {
  try {
    const d = await rest.put(Routes.applicationGuildCommands(CLIENT_ID, guildId), { body: corps });
    const dont = guildId === SUPPORT && commandesFondateur.length
      ? ` (dont ${commandesFondateur.length} de fondateur)`
      : '';
    logger.succes(`${d.length} commande(s) deployee(s) sur le serveur ${guildId}${dont}.`);
    return true;
  } catch (e) {
    const aide = e?.code === 50001
      ? " — le bot n'est pas sur ce serveur, ou il y a ete invite sans la case « applications.commands »"
      : '';
    logger.erreur(`Serveur ${guildId} : ${e.message}${aide}`);
    return false;
  }
}

const rest = new REST().setToken(process.env.DISCORD_TOKEN);

/**
 * Blueprint est un bot PUBLIC : le deploiement normal est global, une seule
 * fois, et tout serveur qui ajoute le bot recoit les commandes.
 *
 * GUILD_ID sert a une chose : voir une modification tout de suite sur ses
 * propres serveurs, sans attendre l'heure de propagation du global. Il accepte
 * plusieurs identifiants separes par des virgules.
 *
 * ATTENTION AUX DOUBLONS : une commande deployee sur un serveur ET en global
 * apparait DEUX FOIS dans la liste, et Discord ne les melange pas.
 * `node src/deploy-commands.js --vider` efface les copies locales.
 *
 * TROIS FACONS DE LANCER :
 *   node src/deploy-commands.js          global si GUILD_ID est vide,
 *                                        sinon les serveurs de GUILD_ID
 *   node src/deploy-commands.js --tout   les deux : tout de suite sur tes
 *                                        serveurs, ET en global pour les autres
 *   node src/deploy-commands.js --vider  enleve les copies locales
 */
const serveurs = String(process.env.GUILD_ID ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const vider = process.argv.includes('--vider');
const tout = process.argv.includes('--tout');

/**
 * La commande d'entree de l'Activite (type 4, PRIMARY_ENTRY_POINT).
 *
 * Discord la cree tout seul quand on active les Activites dans le Developer
 * Portal, et REFUSE un deploiement global qui ne la contient pas (erreur
 * 50240). On la reprend donc telle qu'elle existe, en passant son gestionnaire
 * a APP_HANDLER (1) : c'est le bot qui recoit le clic, et il peut refuser
 * tout serveur autre que le serveur support.
 */
async function commandeEntree() {
  let existantes = [];
  try {
    existantes = await rest.get(Routes.applicationCommands(CLIENT_ID));
  } catch (e) {
    logger.avertissement('Lecture des commandes globales existantes impossible :', e.message);
  }
  const entree = existantes.find((c) => c.type === 4);
  const activite = String(process.env.ACTIVITE_ACTIVE ?? '').trim().toLowerCase() === 'true';
  if (!entree && !activite) return null;

  return {
    ...(entree?.id ? { id: entree.id } : {}),
    name: entree?.name ?? 'launch',
    description: entree?.description || 'Vérification du serveur support Wumi',
    description_localizations: { fr: 'Vérification du serveur support Wumi', 'en-US': 'Wumi support server verification' },
    type: 4,
    handler: 1, // APP_HANDLER : le bot decide (et refuse hors du serveur support)
    contexts: [0],
    integration_types: [0],
  };
}

/** Le global : tout serveur qui ajoute le bot recoit cette liste. */
async function deployerGlobal() {
  const entree = await commandeEntree();
  const corps = entree ? [...commandes, entree] : commandes;
  if (entree) logger.info(`Commande d'entrée de l'Activité incluse (« ${entree.name} »).`);
  const donnees = await rest.put(Routes.applicationCommands(CLIENT_ID), { body: corps });
  logger.succes(`${donnees.length} commandes deployees globalement (propagation jusqu'a 1 h).`);
  logger.info('Tout serveur qui ajoute le bot les recevra, sans rien relancer.');
  return donnees.length;
}

/** Les commandes de fondateur seules, quand le support n'est pas deja traite. */
async function deployerFondateurSeul() {
  if (!commandesFondateur.length) return;
  if (!estUnId(SUPPORT)) {
    logger.avertissement(
      `${commandesFondateur.length} commande(s) de fondateur NON deployee(s) : `
      + 'renseigne SUPPORT_GUILD_ID dans le .env pour les installer sur ton serveur support.'
    );
    return;
  }
  // Le serveur support recoit les commandes de fondateur EN PLUS des
  // publiques s'il en a une copie locale ; sinon les publiques lui viennent du
  // global, et sa liste locale ne contient que les commandes de fondateur.
  const corps = serveurs.includes(SUPPORT) ? listePour(SUPPORT) : commandesFondateur;
  await deployerServeur(rest, SUPPORT, corps);
}

(async () => {
  try {
    if (!estUnId(CLIENT_ID)) {
      logger.erreur('CLIENT_ID absent ou invalide dans le .env : rien ne peut etre deploye.');
      process.exit(1);
    }

    if (vider) {
      if (!serveurs.length) {
        logger.erreur('--vider a besoin de GUILD_ID dans le .env pour savoir quels serveurs nettoyer.');
        process.exit(1);
      }
      for (const serveur of serveurs) {
        // Le serveur support garde ses commandes de fondateur : elles
        // n'existent qu'en local, les vider les ferait disparaitre pour de bon.
        const corps = serveur === SUPPORT ? commandesFondateur : [];
        try {
          await rest.put(Routes.applicationGuildCommands(CLIENT_ID, serveur), { body: corps });
          logger.succes(
            serveur === SUPPORT
              ? `Serveur support ${serveur} : copies locales effacees, ${corps.length} commande(s) de fondateur conservee(s).`
              : `Copies locales effacees sur le serveur ${serveur}.`
          );
        } catch (e) {
          logger.erreur(`Serveur ${serveur} : ${e.message}`);
        }
      }
      logger.info('Seules les commandes globales restent. Redemarre ton client Discord (Ctrl+R) pour voir la liste a jour.');
      return;
    }

    logger.info(
      `Deploiement de ${commandes.length} commande(s) publique(s)`
      + (commandesFondateur.length ? ` et ${commandesFondateur.length} de fondateur...` : '...')
    );

    // ---------------------------------------------------------- LE GLOBAL
    if (!serveurs.length || tout) {
      await deployerGlobal();
    }

    // ------------------------------------------------------- LES SERVEURS
    if (!serveurs.length) {
      await deployerFondateurSeul();
      return;
    }

    // Un serveur a la fois : si l'un echoue — bot absent, case manquante — on
    // veut savoir LEQUEL, pas voir tout le deploiement tomber sans dire ou.
    let echecs = 0;
    for (const serveur of serveurs) {
      const ok = await deployerServeur(rest, serveur, listePour(serveur));
      if (!ok) echecs++;
    }

    // Le serveur support n'etait pas dans la liste : il lui faut quand meme
    // ses commandes de fondateur, qui n'existent nulle part ailleurs.
    if (!serveurs.includes(SUPPORT)) await deployerFondateurSeul();

    logger.avertissement(
      "Deploiement local : ces commandes s'ajoutent aux globales, donc elles apparaissent en double "
      + "sur ces serveurs. `node src/deploy-commands.js --vider` enleve les copies locales quand tu as fini d'essayer."
    );
    if (echecs) process.exit(1);
  } catch (e) {
    logger.erreur('Deploiement echoue :', e);
    process.exit(1);
  }
})();
