const { Events, ActivityType } = require('discord.js');
const logger = require('../utils/logger');
const { config } = require('../database/db');
const { verifierMutesExpires, verifierBansExpires } = require('../utils/taches');

module.exports = {
  name: Events.ClientReady,
  once: true,
  async execute(client) {
    logger.succes(`Connecte en tant que ${client.user.tag}`);

    // Le journal du support et les alertes d'erreur EN PREMIER : une erreur
    // pendant le reste du demarrage doit deja remonter dans LOG_ERREURS.
    const journal = require('../utils/journalSupport');
    journal.brancher(client);
    journal.ecouterConnexion(client);
    try {
      require('../utils/alertes').demarrer(client);
    } catch (e) {
      logger.avertissement('Alertes :', e.message);
    }
    // Le total du BOT, pas celui de ce shard : avec plusieurs processus,
    // client.guilds.cache.size ne voit qu'une part des serveurs.
    const totaux = require('../utils/totaux');
    const totalServeurs = await totaux.serveurs(client);
    logger.info(`${totalServeurs} serveur(s), ${client.users.cache.size} utilisateur(s) en cache.`);
    // Le palier ne se signale qu'une fois pour tout le bot.
    if (totaux.estPremierShard(client)) require('../utils/echelle').verifier(totalServeurs);

    // Un serveur a pu etre bloque pendant que le bot etait eteint.
    await require('../utils/fondateur')
      .quitterLesBloques(client)
      .catch((e) => logger.avertissement('Liste noire :', e.message));

    client.user.setPresence({
      activities: [{ name: `${totalServeurs} serveurs | /aide`, type: ActivityType.Watching }],
      status: 'online',
    });

    // Cree la ligne de config des serveurs deja rejoints
    for (const guild of client.guilds.cache.values()) {
      try {
        config(guild.id);
      } catch (e) {
        logger.erreur(`Config initiale de ${guild.name} :`, e.message);
      }
    }

    // Cache des invitations (necessaire pour identifier qui invite qui)
    await require('../utils/invitations')
      .initialiser(client)
      .catch((e) => logger.avertissement('Cache des invitations :', e.message));

    // Salons vocaux temporaires laisses vides par un arret precedent
    await require('../utils/vocauxTemporaires')
      .nettoyerAuDemarrage(client)
      .catch((e) => logger.avertissement('Nettoyage des vocaux temporaires :', e.message));

    // Salons statistiques (mise a jour periodique)
    require('../utils/statistiques').demarrer(client);

    // Rapport d'activite hebdomadaire du lundi (Wumi 2.12)
    require('../utils/rapportStats').demarrer(client);

    // Taches periodiques : mutes expires et debannissements automatiques
    const taches = async () => {
      try {
        verifierMutesExpires();
        await verifierBansExpires(client);
      } catch (e) {
        logger.erreur('Taches periodiques :', e.message);
      }
    };
    await taches();
    setInterval(taches, 60_000);

    // Wumi 2.0 : roles temporaires, mode raid (fin automatique), tickets
    // inactifs. Chacun dans son module, chacun relu depuis la base.
    for (const [nom, module] of [
      ['Rôles temporaires', '../utils/rolesTemporaires'],
      ['Mode raid', '../utils/modeRaid'],
      ['Tickets inactifs', '../utils/ticketsInactifs'],
    ]) {
      try {
        require(module).demarrer(client);
      } catch (e) {
        logger.erreur(`${nom} :`, e.message);
      }
    }

    // Sauvegardes : une au demarrage si besoin, puis verification chaque heure
    const sauvegardes = require('../utils/sauvegardes');
    const tourSauvegarde = () => {
      sauvegardes.sauvegardeAutomatique();
      // Une fois par semaine, une copie part hors du serveur (MP au fondateur).
      sauvegardes.envoyerHorsServeur(client).catch((e) => logger.erreur('Sauvegarde hors serveur :', e.message));
    };
    tourSauvegarde();
    setInterval(tourSauvegarde, 3_600_000);

    // Musique (Wumi 2.7) : seulement si Lavalink est configure dans le .env.
    try {
      require('../musique/lecteur').musique.init(client);
    } catch (e) {
      logger.erreur('Musique :', e.message);
    }

    // Serveur support : roles Utilisateur de Wumi, toutes les 6 h.
    require('../utils/rolesSupport').demarrer(client);

    // XP vocal : sessions des membres deja en vocal, credit toutes les 5 min.
    {
      const vocal = require('./voiceStateUpdate');
      const n = vocal.demarrerSessions(client);
      if (n) logger.info(`XP vocal : ${n} session(s) reprise(s) au demarrage.`);
      setInterval(() => vocal.crediterEnCours(client).catch((e) => logger.erreur('XP vocal :', e.message)), 5 * 60_000).unref?.();
    }

    // Evenement de Noel du support : classement et fin automatique.
    require('../utils/noel').demarrer(client);

    // LFG (Wumi 2.10) : annonces expirees, vocaux de groupe vides.
    setInterval(() => require('../utils/lfg').tour(client).catch((e) => logger.erreur('LFG :', e.message)), 60_000);

    // Evenements (Wumi 2.8) : rappels 15 min avant, chaque minute.
    setInterval(() => require('../utils/evenements').tour(client).catch((e) => logger.erreur('Evenements :', e.message)), 60_000);

    // Audit de securite hebdomadaire (Wumi 2.6), verifie chaque heure.
    const tourAudit = () => require('../utils/audit').tourHebdo(client).catch((e) => logger.erreur('Audit hebdo :', e.message));
    setTimeout(tourAudit, 5 * 60_000);
    setInterval(tourAudit, 3_600_000);

    // Emojis de l'application : le bot televerse les siens s'ils manquent.
    // Volontairement sans await : c'est un confort, pas une condition de
    // demarrage, et le bot doit repondre meme si Discord met du temps.
    require('../utils/emojis')
      .synchroniser(client)
      .catch((e) => logger.avertissement('Emojis :', e.message));

    // top.gg : publication du nombre de serveurs (dort sans jeton)
    try {
      require('../utils/topgg').demarrer(client);
    } catch (e) {
      logger.avertissement('top.gg :', e.message);
    }

    // Anniversaires : le tour de garde, toutes les demi-heures
    try {
      require('../utils/anniversaires').demarrer(client);
    } catch (e) {
      logger.erreur('Anniversaires :', e.message);
    }

    // Concours : les echus sont termines, meme si le bot etait eteint
    try {
      require('../utils/giveaways').demarrer(client);
    } catch (e) {
      logger.erreur('Concours :', e.message);
    }

    // Premium : on lit ce que Discord connait comme abonnements, et on ecoute
    // les souscriptions en direct. Sans SKU configure, seul l'octroi manuel
    // fonctionne — et ca ne demande rien au demarrage.
    try {
      require('../utils/premium').demarrer(client);
    } catch (e) {
      logger.erreur('Premium :', e.message);
    }

    // Veille : annonces automatiques des nouveaux posts
    try {
      require('../utils/veille').demarrer(client);
    } catch (e) {
      logger.erreur('Veille :', e.message);
    }

    // Anti-phishing : le cache disque est deja charge (au require du module,
    // avant meme ce demarrage) ; on lance juste le rafraichissement reseau
    // periodique.
    try {
      require('../utils/antiPhishing').demarrer();
    } catch (e) {
      logger.erreur('Anti-phishing :', e.message);
    }

    // Statut public : le bot ecrit ses totaux dans site/statut.json, que la
    // page de statut lit. Sur un shard, seul le premier ecrit — les autres
    // ecriraient le meme fichier en meme temps avec les memes chiffres.
    try {
      if (require('../utils/totaux').estPremierShard(client)) {
        require('../utils/statut').demarrer(client);
      }
    } catch (e) {
      logger.debug('Statut :', e.message);
    }

    // Serveur public : l'Activite de verification et le webhook top.gg. Il ne
    // demarre que sur le shard qui porte le serveur support (c'est lui qui
    // peut donner le role), et seulement si SERVEUR_PUBLIC_PORT est rempli.
    try {
      require('../public/serveur').demarrer(client);
    } catch (e) {
      logger.erreur('Serveur public :', e.message);
    }

    // Le message « en ligne » du journal, une fois tout branche.
    if (totaux.estPremierShard(client)) {
      const conf = require('../../config');
      const pkg = require('../../package.json');
      const etat = require('../utils/capacites').resume();
      journal.noter('demarrage', {
        titre: '🟢 Wumi est en ligne',
        couleur: conf.couleurs.succes,
        vignette: client.user.displayAvatarURL(),
        lignes: [
          `**Compte** · ${client.user.username} (\`${client.user.id}\`)`,
          `**Serveurs** · ${totalServeurs.toLocaleString('fr-FR')}`,
          `**Commandes** · ${client.commandes.size}`,
          `**Version** · ${pkg.version} · Node ${process.version}`,
          `**Intents** · ${etat.complet ? 'tous accordés' : `manquants : ${etat.manquants.join(', ')}`}`,
          `**Ping** · ${client.ws.ping >= 0 ? `${client.ws.ping} ms` : '…'}`,
        ],
      });
    }

    // Panneau de controle local (desactive tant que PANNEAU_ACTIF n'est pas a true)
    try {
      require('../panneau/serveur').demarrer(client);
    } catch (e) {
      logger.erreur('Panneau de controle :', e.message);
    }

    // Effets a duree limitee (potions, couleurs, coffre-fort) : verifies
    // souvent, sinon un membre garde sa couleur une heure de trop.
    const effets = async () => {
      try {
        await require('../utils/objets').purger(client);
      } catch (e) {
        logger.avertissement('Purge des effets :', e.message);
      }
    };
    await effets();
    setInterval(effets, 5 * 60_000);

    // Menage quotidien : vieilles statistiques, vieilles missions, interets,
    // et une photo de la structure de chaque serveur.
    const menage = () => {
      try {
        require('../utils/activite').purger();
        require('../utils/missions').purger();
        require('../utils/banque').interetsAutomatiques();
      } catch (e) {
        logger.avertissement('Menage quotidien :', e.message);
      }

      const structure = require('../utils/structure');
      const { config } = require('../database/db');
      for (const guild of client.guilds.cache.values()) {
        try {
          if (!config(guild.id).structure_auto) continue;
          // Inutile de reprendre une photo identique a la precedente : la
          // rotation effacerait les anciennes pour rien.
          const derniere = structure.lister(guild.id, 1)[0];
          const photo = derniere ? structure.charger(derniere.id, guild.id) : null;
          if (photo && structure.comparer(photo.contenu, guild).total === 0) continue;
          structure.enregistrer(guild, { automatique: true });
        } catch (e) {
          logger.debug('Photo de structure :', guild.id, e.message);
        }
      }
    };
    menage();
    setInterval(menage, 24 * 3_600_000);
  },
};
