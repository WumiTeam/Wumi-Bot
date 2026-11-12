require('dotenv').config();

const fs = require('node:fs');
const path = require('node:path');
const { Client, Collection, GatewayIntentBits, Partials } = require('discord.js');

const logger = require('./utils/logger');
const { chargerPolices } = require('./utils/polices');

if (!process.env.DISCORD_TOKEN) {
  logger.erreur("DISCORD_TOKEN manquant : copie .env.example en .env et remplis-le.");
  process.exit(1);
}

const capacites = require('./utils/capacites');

/**
 * Fabrique un client avec le jeu d'intents demande.
 *
 * Le client est fabrique par une FONCTION parce qu'on peut avoir a
 * recommencer : discord.js lit les intents a la construction, on ne peut pas
 * les changer apres coup. Voir `connecter()` plus bas.
 */
function fabriquerClient(permis) {
  const c = new Client({
    intents: capacites.intents(permis),
    partials: [Partials.Message, Partials.Channel, Partials.GuildMember, Partials.User, Partials.Reaction],
    allowedMentions: { parse: ['users', 'roles'] },
  });

  c.commandes = new Collection();
  c.cooldownsXp = new Collection(); // `${guildId}-${userId}` -> timestamp
  c.vocal = new Collection(); // `${guildId}-${userId}` -> timestamp d'entree
  c.antiSpam = new Collection(); // `${guildId}-${userId}` -> [{ contenu, date }]
  c.automodStrikes = new Collection(); // `${guildId}-${userId}` -> [dates]
  c.arrivees = new Collection(); // guildId -> [dates]
  return c;
}

let client = fabriquerClient({ contenuMessages: true, membres: true });

// Le chargement des commandes vit dans son propre module : le panneau
// s'en sert aussi pour les recharger a chaud, sans redemarrer le bot.
const { chargerCommandes } = require('./utils/chargeur');

// ----------------------------------------------------------------- EVENTS
function chargerEvenements(cible, dossier) {
  for (const fichier of fs.readdirSync(dossier).filter((f) => f.endsWith('.js'))) {
    const evenement = require(path.join(dossier, fichier));
    if (evenement.once) cible.once(evenement.name, (...args) => evenement.execute(...args, cible));
    else cible.on(evenement.name, (...args) => evenement.execute(...args, cible));
  }
}

/** Commandes et evenements sur un client donne. */
function preparer(cible) {
  chargerCommandes(cible);
  chargerEvenements(cible, path.join(__dirname, 'events'));
  return cible;
}

chargerPolices();
preparer(client);
logger.info(`${client.commandes.size} commandes chargees.`);

// --------------------------------------------------------- FILET DE SECURITE
process.on('unhandledRejection', (raison) => logger.erreur('Promesse rejetee :', raison));
process.on('uncaughtException', (erreur) => logger.erreur('Exception non capturee :', erreur));

/**
 * Se connecte, en abandonnant un intent privilegie a la fois si Discord le
 * refuse.
 *
 * Un bot PUBLIC ne peut pas tenir pour acquis qu'il a les intents
 * privilegies : au-dela de 100 serveurs, Discord les accorde au cas par cas et
 * peut dire non. Avec l'ancien code, un refus faisait planter le demarrage —
 * le bot ne repondait plus nulle part, y compris sur les serveurs ou tout
 * allait bien.
 *
 * Ici, on essaie avec tout, puis sans le contenu des messages, puis sans rien
 * de privilegie. A chaque repli, le client est REFABRIQUE (discord.js fige les
 * intents a la construction) et on dit clairement ce qui est perdu.
 */
async function connecter() {
  const essais = [
    { contenuMessages: true, membres: true },
    { contenuMessages: false, membres: true },
    { contenuMessages: true, membres: false },
    { contenuMessages: false, membres: false },
  ];

  for (const [i, permis] of essais.entries()) {
    if (i > 0) {
      client.destroy().catch(() => null);
      client = preparer(fabriquerClient(permis));
    }
    capacites.definir(permis);

    try {
      await client.login(process.env.DISCORD_TOKEN);
      const etat = capacites.resume();
      if (!etat.complet) {
        logger.avertissement(
          `Demarre SANS ${etat.manquants.join(' ni ')} : Discord ne l'accorde pas a cette application.`
        );
        for (const perdu of etat.perdu) logger.avertissement(`  · desactive : ${perdu}`);
        logger.avertissement(
          '  Developer Portal > ton application > Bot > Privileged Gateway Intents. '
          + 'Au-dela de 100 serveurs il faut faire verifier l\'application.'
        );
      }
      return;
    } catch (e) {
      const refus = e?.code === 'DisallowedIntents' || /disallowed intents/i.test(e?.message ?? '');
      if (!refus) {
        logger.erreur('Connexion impossible :', e.message);
        process.exit(1);
      }
      if (i === essais.length - 1) {
        logger.erreur('Connexion impossible meme sans intent privilegie :', e.message);
        process.exit(1);
      }
      logger.avertissement('Intent privilegie refuse par Discord, nouvel essai avec moins.');
    }
  }
}

connecter();

// Un getter : `client` est remplace si un intent est refuse, et une simple
// affectation aurait fige l'ancien client pour tous ceux qui l'importent.
module.exports = { get client() { return client; } };
