/**
 * Les salons de logs du BOT, sur le serveur support.
 *
 * A ne pas confondre avec src/utils/logs.js : celui-la ecrit dans les salons
 * de logs de CHAQUE serveur (messages supprimes, sanctions...). Ici, c'est le
 * journal de l'auteur du bot : ou il arrive, d'ou il part, qui vote, ce qui
 * plante. Ca ne regarde que toi, donc ca ne s'ecrit QUE sur le serveur support.
 *
 * LES SALONS SE REGLENT DANS LE .env, un par sujet :
 *
 *   LOG_ERREURS        les erreurs du bot (regroupees, cadencees)
 *   LOG_SERVEURS       le bot est ajoute / retire d'un serveur
 *   LOG_VOTES          les votes top.gg
 *   LOG_DEMARRAGE      demarrage, deconnexions, reconnexions
 *   LOG_COMMANDES      chaque commande utilisee (bavard : laisse vide si tu
 *                      n'en veux pas)
 *   LOG_TICKETS        tickets du support : ouverture, fermeture, transcriptions
 *   LOG_VERIFICATION   les verifications du serveur support
 *   LOG_ADMIN          ce que tu fais avec /admin (blocages, premium, sorties)
 *   LOG_PREMIUM        abonnements premium (souscription, fin)
 *   LOG_DEFAUT         salon fourre-tout : sert a tout sujet laisse vide
 *
 * POURQUOI PAR L'API ET PAS PAR LE CACHE
 * Avec plusieurs shards, le serveur support n'est connu que d'UN processus.
 * Ecrire par `client.rest` avec l'ID du salon marche depuis n'importe lequel :
 * pas besoin que le salon soit en cache.
 *
 * RIEN ICI NE DOIT FAIRE PLANTER LE BOT, ni declencher une erreur qui
 * declencherait un log d'erreur qui echouerait... Tout echec finit en
 * avertissement console, jamais en logger.erreur.
 */
const { Routes, MessageFlags } = require('discord.js');
const conf = require('../../config');
const logger = require('./logger');
const C = require('./composants');

const SUJETS = {
  erreurs: 'LOG_ERREURS',
  serveurs: 'LOG_SERVEURS',
  votes: 'LOG_VOTES',
  demarrage: 'LOG_DEMARRAGE',
  commandes: 'LOG_COMMANDES',
  tickets: 'LOG_TICKETS',
  verification: 'LOG_VERIFICATION',
  admin: 'LOG_ADMIN',
  premium: 'LOG_PREMIUM',
};

/** Les reglages historiques en base, gardes en repli pour ne rien casser. */
const REPLI_BASE = {
  erreurs: 'alerte_salon',
  serveurs: 'bot_salon',
};

let client = null;

const estUnId = (v) => /^\d{17,20}$/.test(String(v ?? '').trim());

/** Branche le module sur le client (appele au demarrage). */
function brancher(c) {
  client = c;
}

/**
 * L'ID du salon d'un sujet, ou null.
 * Ordre : la variable du sujet, l'ancien reglage en base, LOG_DEFAUT.
 */
function salonId(sujet) {
  const variable = SUJETS[sujet];
  if (!variable) return null;

  const direct = String(process.env[variable] ?? '').trim();
  if (estUnId(direct)) return direct;

  const colonne = REPLI_BASE[sujet];
  if (colonne) {
    try {
      const support = require('./fondateur').serveurSupport();
      if (support) {
        const { db } = require('../database/db');
        const ligne = db.prepare(`SELECT ${colonne} AS id FROM config WHERE guild_id = ?`).get(support);
        if (estUnId(ligne?.id)) return ligne.id;
      }
    } catch {
      /* base indisponible : on passe au repli suivant */
    }
  }

  const defaut = String(process.env.LOG_DEFAUT ?? '').trim();
  return estUnId(defaut) ? defaut : null;
}

/** L'etat de chaque sujet, pour /admin logs. */
function etat() {
  return Object.entries(SUJETS).map(([sujet, variable]) => ({
    sujet,
    variable,
    salon: salonId(sujet),
    direct: estUnId(process.env[variable]),
  }));
}

/**
 * Envoie un message Components V2 dans le salon d'un sujet.
 * @param {string} sujet       une cle de SUJETS
 * @param {Array}  composants  conteneurs deja construits
 * @param {object} [options]
 * @param {Array}  [options.fichiers]  AttachmentBuilder a joindre
 * @param {string} [options.mention]   texte de mention (role/membre) a pinger
 * @returns {Promise<boolean>}
 */
async function envoyer(sujet, composants, { fichiers = [], mention = null } = {}) {
  if (!client) return false;
  const id = salonId(sujet);
  if (!id) return false;

  try {
    const liste = Array.isArray(composants) ? composants : [composants];
    if (mention) liste.unshift(C.texte(mention));
    const corps = {
      components: liste.map((c) => (typeof c.toJSON === 'function' ? c.toJSON() : c)),
      flags: MessageFlags.IsComponentsV2,
      allowed_mentions: { parse: ['users', 'roles'] },
    };

    const files = [];
    for (const f of fichiers) {
      // AttachmentBuilder -> format attendu par @discordjs/rest
      const data = f.attachment ?? f.data;
      files.push({ name: f.name, data });
    }

    await client.rest.post(Routes.channelMessages(id), { body: corps, files: files.length ? files : undefined });
    return true;
  } catch (e) {
    logger.avertissement(`Journal du bot (${sujet}) non envoye :`, e.message);
    return false;
  }
}

// --------------------------------------------------------------- RACCOURCIS
/**
 * Une carte simple : titre, lignes, vignette facultative.
 * Tout ce module fabrique ses messages avec elle, pour que les logs aient
 * tous la meme allure.
 */
function carte({ titre, lignes = [], couleur = conf.couleurs.principale, vignette = null, pied = null, extra = [] }) {
  const corps = [`## ${titre}`, ...lignes.filter(Boolean)].join('\n');
  const elements = [
    vignette ? C.sectionVignette(corps.slice(0, 3900), vignette) : C.texte(corps.slice(0, 3900)),
    ...extra,
  ];
  const quand = `<t:${Math.floor(Date.now() / 1000)}:f>`;
  elements.push(C.texte(`-# ${pied ? `${pied} · ` : ''}${quand}`));
  return C.conteneur(elements, couleur);
}

/** Raccourci : envoyer une carte. */
function noter(sujet, options, envoi = {}) {
  return envoyer(sujet, [carte(options)], envoi);
}

// -------------------------------------------------------- JOURNAL DES COMMANDES
/**
 * Une commande par message noierait le salon en une soiree. On les met en
 * file, et on envoie un paquet toutes les 15 secondes au plus.
 */
const file = [];
let minuterie = null;

function commande({ action, qui, quiId, serveur, serveurId, ok = true, ms = null }) {
  if (!salonId('commandes')) return;
  const ligne = `${ok ? '🟢' : '🔴'} \`${action}\` · ${qui} (\`${quiId}\`) · ${serveur ?? 'MP'}${serveurId ? ` (\`${serveurId}\`)` : ''}${ms !== null ? ` · ${ms} ms` : ''}`;
  file.push(ligne);
  if (file.length > 200) file.splice(0, file.length - 200);
  if (!minuterie) {
    minuterie = setTimeout(viderCommandes, 15_000);
    minuterie.unref?.();
  }
}

async function viderCommandes() {
  minuterie = null;
  if (!file.length) return;
  const lot = file.splice(0, 25);
  await envoyer('commandes', [C.conteneur([
    C.texte(lot.join('\n').slice(0, 3900)),
  ], conf.couleurs.info)]);
  if (file.length) {
    minuterie = setTimeout(viderCommandes, 5_000);
    minuterie.unref?.();
  }
}

// ------------------------------------------------------------- DEMARRAGE
/**
 * Les evenements de connexion. Ecoutes ici plutot que dans src/events : ils
 * n'interessent que ce journal.
 */
function ecouterConnexion(c) {
  // Une coupure de quelques secondes arrive tous les jours : on ne signale
  // la reprise que si la coupure a ete longue, sinon le salon devient du bruit.
  const coupures = new Map(); // shardId -> date de deconnexion

  c.on('shardDisconnect', (evenement, shardId) => {
    coupures.set(shardId, Date.now());
    noter('demarrage', {
      titre: '🔴 Shard déconnecté',
      couleur: conf.couleurs.erreur,
      lignes: [`Shard **#${shardId}** · code \`${evenement?.code ?? '?'}\``],
    });
  });

  c.on('shardResume', (shardId, rejoues) => {
    const depuis = coupures.get(shardId);
    coupures.delete(shardId);
    if (!depuis || Date.now() - depuis < 60_000) return;
    noter('demarrage', {
      titre: '🟢 Shard reconnecté',
      couleur: conf.couleurs.succes,
      lignes: [`Shard **#${shardId}** · ${rejoues} évènement(s) rejoué(s) · coupure de ${Math.round((Date.now() - depuis) / 1000)} s`],
    });
  });

  c.on('shardError', (erreur, shardId) => {
    logger.avertissement(`Shard #${shardId} :`, erreur?.message ?? erreur);
  });
}

module.exports = {
  SUJETS,
  brancher,
  salonId,
  etat,
  envoyer,
  carte,
  noter,
  commande,
  ecouterConnexion,
};
