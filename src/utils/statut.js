/**
 * L'ETAT DU BOT, ECRIT DANS UN FICHIER QUE LE SITE SAIT LIRE.
 *
 * POURQUOI UN FICHIER, ET PAS UNE PAGE QUI INTERROGE LE BOT
 *
 * Le site est un tas de fichiers statiques : GitHub Pages, Netlify, un dossier
 * sur un VPS. Il n'a pas de serveur a qui demander « le bot est-il en ligne ? ».
 * Et ouvrir le bot au monde entier pour repondre a cette question serait
 * ajouter une porte d'entree pour une ligne de texte.
 *
 * Le bot ecrit donc `site/statut.json` a intervalle regulier. La page le lit
 * en une requete, a cote d'elle-meme, sans rien ouvrir du tout.
 *
 * CE QUE CA DONNE SELON L'HEBERGEMENT :
 *   - un VPS qui sert le dossier `site/`      -> statut vraiment en direct ;
 *   - GitHub Pages                            -> le statut de la derniere fois
 *                                                que le site a ete publie.
 * Dans les deux cas la page affiche la DATE du relevé, pour ne jamais faire
 * croire a du direct quand ca n'en est pas. Une page de statut qui ment est
 * pire que pas de page de statut.
 *
 * CE QU'IL N'Y A PAS DEDANS, ET C'EST VOLONTAIRE
 * Aucun nom de serveur, aucun identifiant, aucun membre. Ce fichier est
 * PUBLIC : il ne porte que des totaux. Publier la liste des serveurs d'un bot,
 * c'est publier ou se trouvent ses utilisateurs.
 */
const fs = require('node:fs');
const path = require('node:path');
const logger = require('./logger');
const totaux = require('./totaux');

const RACINE = path.join(__dirname, '..', '..');
const FICHIER = path.join(RACINE, 'site', 'statut.json');
const INTERVALLE_MS = 5 * 60_000;

let minuterie = null;
let debutProcessus = Date.now();

/**
 * Le releve courant.
 * @param {object} client
 * @returns {Promise<object>} des totaux, et rien de nominatif
 */
async function releve(client) {
  // En mode shards, ces deux fonctions interrogent tous les shards ; sans
  // shards elles lisent le cache local. Le reste du fichier n'a pas a savoir.
  const [serveurs, membres] = await Promise.all([
    totaux.serveurs(client).catch(() => null),
    totaux.membres(client).catch(() => null),
  ]);

  // `ws.ping` vaut -1 tant que le premier battement n'est pas revenu : mieux
  // vaut ne rien afficher qu'afficher « -1 ms ».
  const latence = Math.round(client?.ws?.ping ?? -1);

  return {
    version: 1,
    enLigne: Boolean(client?.isReady?.()),
    date: Date.now(),
    serveurs,
    membres,
    latenceMs: latence >= 0 ? latence : null,
    demarreLe: debutProcessus,
    // Le nombre de shards, seulement s'il y en a : sur une installation
    // ordinaire cette ligne n'a aucun sens et n'apparait pas.
    shards: client?.shard?.count ?? null,
  };
}

// ------------------------------------------------------------- HISTORIQUE
/**
 * Un releve toutes les 5 minutes, garde 90 jours : c'est ce que la page de
 * statut (wumi.fr/statut) affiche en barres de disponibilite. Un trou entre
 * deux releves = le bot etait eteint ou deconnecte.
 */
let qHisto = null;
function historique() {
  if (qHisto) return qHisto;
  const { db } = require('../database/db');
  db.exec(`
    CREATE TABLE IF NOT EXISTS statut_historique (
      date      INTEGER PRIMARY KEY,
      en_ligne  INTEGER NOT NULL,
      latence   INTEGER,
      serveurs  INTEGER
    );
  `);
  qHisto = {
    noter: db.prepare('INSERT OR REPLACE INTO statut_historique (date, en_ligne, latence, serveurs) VALUES (?, ?, ?, ?)'),
    purger: db.prepare('DELETE FROM statut_historique WHERE date < ?'),
    depuis: db.prepare('SELECT * FROM statut_historique WHERE date >= ? ORDER BY date ASC'),
  };
  return qHisto;
}

function noterHistorique(donnees) {
  try {
    const h = historique();
    h.noter.run(donnees.date, donnees.enLigne ? 1 : 0, donnees.latenceMs, donnees.serveurs);
    h.purger.run(Date.now() - 91 * 86_400_000);
  } catch (e) {
    logger.debug('Statut : historique non note —', e.message);
  }
}

/**
 * Le resume que sert l'API publique : disponibilite par jour sur 90 jours,
 * et les coupures recentes (un trou de plus de 12 minutes entre deux releves).
 */
function resumeHistorique(jours = 90) {
  const PAS = INTERVALLE_MS;
  const debut = Date.now() - jours * 86_400_000;
  const releves = historique().depuis.all(debut);
  const parJour = new Map();
  for (const r of releves) {
    const jour = new Date(r.date).toISOString().slice(0, 10);
    const j = parJour.get(jour) ?? { jour, releves: 0, enLigne: 0, latences: [], premier: r.date };
    j.releves++;
    if (r.en_ligne) j.enLigne++;
    if (r.latence !== null && r.latence !== undefined) j.latences.push(r.latence);
    parJour.set(jour, j);
  }

  const sortie = [];
  for (let i = jours - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86_400_000);
    const jour = d.toISOString().slice(0, 10);
    const j = parJour.get(jour);
    if (!j) {
      sortie.push({ jour, dispo: null, latence: null });
      continue;
    }
    // Releves attendus : une journee entiere, sauf aujourd'hui et le jour
    // du tout premier releve (le suivi n'existait pas avant).
    const debutJour = Date.parse(`${jour}T00:00:00Z`);
    const finJour = Math.min(Date.now(), debutJour + 86_400_000);
    const depart = releves[0] && releves[0].date > debutJour ? releves[0].date : debutJour;
    const attendus = Math.max(1, Math.floor((finJour - depart) / PAS));
    sortie.push({
      jour,
      dispo: Math.min(1, j.enLigne / attendus),
      latence: j.latences.length ? Math.round(j.latences.reduce((a, b) => a + b, 0) / j.latences.length) : null,
    });
  }

  const incidents = [];
  for (let i = 1; i < releves.length; i++) {
    const trou = releves[i].date - releves[i - 1].date;
    if (trou > PAS * 2.4) incidents.push({ debut: releves[i - 1].date, fin: releves[i].date, duree: trou });
  }
  return { jours: sortie, incidents: incidents.slice(-10).reverse() };
}

/** Ecrit le releve. Un echec d'ecriture ne doit jamais arreter le bot. */
async function ecrire(client) {
  try {
    fs.mkdirSync(path.dirname(FICHIER), { recursive: true });
    const donnees = await releve(client);
    noterHistorique(donnees);
    // Ecriture atomique : un fichier a moitie ecrit, lu au mauvais moment par
    // le serveur web, donnerait un JSON invalide et une page cassee.
    const temporaire = FICHIER + '.tmp';
    fs.writeFileSync(temporaire, JSON.stringify(donnees, null, 2));
    fs.renameSync(temporaire, FICHIER);
    return donnees;
  } catch (e) {
    logger.debug('Statut : ecriture impossible —', e.message);
    return null;
  }
}

// ------------------------------------- LE MEME ETAT, DANS UN SALON DISCORD
/**
 * Publie l'etat dans le salon choisi sur le SERVEUR SUPPORT.
 *
 * ON MODIFIE UN MESSAGE, ON N'EN POSTE PAS UN NOUVEAU. Republier toutes les
 * cinq minutes ferait 288 messages par jour dans le salon : au bout d'une
 * semaine, plus personne ne le regarde. L'identifiant du message est garde en
 * base (`statut_message`) ; s'il a ete supprime entre-temps, on en repose un
 * et on retient le nouveau.
 *
 * COMME AILLEURS : uniquement sur le serveur support, et un echec ici ne doit
 * jamais empecher le releve du fichier de s'ecrire.
 */
async function publier(client, donnees, options = {}) {
  const { config, majConfig } = require('../database/db');
  const fondateur = require('./fondateur');
  const support = fondateur.serveurSupport();
  if (!support) return null;

  const cfg = config(support);
  if (!cfg.statut_salon) return null;

  const guild = client?.guilds?.cache?.get(support);
  const salon = guild?.channels?.cache?.get(cfg.statut_salon);
  if (!salon?.isTextBased?.()) return null;

  const { PermissionsBitField } = require('discord.js');
  if (!salon.permissionsFor(guild.members.me)?.has(PermissionsBitField.Flags.SendMessages)) return null;

  const charge = await construireMessage(client, donnees, options);

  // On tente d'abord la modification ; si le message a disparu, on repose.
  if (cfg.statut_message) {
    try {
      const message = await salon.messages.fetch(cfg.statut_message);
      await message.edit(charge);
      return message.id;
    } catch {
      // supprime, ou dans un autre salon depuis : on repart de zero.
    }
  }

  try {
    const message = await salon.send(charge);
    majConfig(support, { statut_message: message.id });
    return message.id;
  } catch (e) {
    logger.debug('Statut : publication impossible —', e.message);
    return null;
  }
}

/**
 * Disponibilite sur une periode : releves « en ligne » / releves attendus.
 * Les attendus partent du tout premier releve si le suivi est plus recent
 * que la periode (sinon un bot installe hier afficherait 3 % sur 30 jours).
 */
function disponibilite(ms) {
  try {
    const depuis = Date.now() - ms;
    const releves = historique().depuis.all(depuis);
    if (!releves.length) return null;
    const depart = Math.max(depuis, releves[0].date);
    const attendus = Math.max(1, Math.round((Date.now() - depart) / INTERVALLE_MS) + 1);
    const ok = releves.filter((r) => r.en_ligne).length;
    return Math.min(1, ok / attendus);
  } catch {
    return null;
  }
}

const pourcent = (x) => (x === null ? '—' : `${(Math.floor(x * 10000) / 100).toLocaleString('fr-FR')} %`);

/** 14 carres, un par jour, du plus ancien au plus recent. */
function barre(jours = 14) {
  try {
    return resumeHistorique(jours).jours.map((j) => {
      if (j.dispo === null) return '⬛';
      if (j.dispo >= 0.99) return '🟩';
      if (j.dispo >= 0.9) return '🟨';
      return '🟥';
    }).join('');
  } catch {
    return null;
  }
}

/** Le message lui-meme, en Components V2. `arret` = le bot est en train de s'eteindre. */
async function construireMessage(client, donnees, { arret = false } = {}) {
  const conf = require('../../config');
  const C = require('./composants');
  const { E } = require('./emojis');
  const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
  const { t } = require('./langues').traducteur(require('./fondateur').serveurSupport());

  const enLigne = donnees.enLigne && !arret;
  const nb = (n) => (n === null || n === undefined ? '—' : new Intl.NumberFormat('fr-FR').format(n));
  // Incidents et maintenances annonces par le fondateur (src/utils/incidents.js).
  const inc = require('./incidents');
  const b = inc.bandeau();
  const etatIncident = b && enLigne && b.niveau !== 'prevue'
    ? (b.niveau === 'maintenance' ? `🛠️ ${t('incident.etat_global_maintenance')}` : `⚠️ ${t(`incident.etat_global_${b.niveau}`)}`)
    : null;
  const etat = arret
    ? `🟠 ${t('statut.etat_arret')}`
    : etatIncident ?? (enLigne ? `${E('enligne')} ${t('statut.etat_ok')}` : `${E('horsligne')} ${t('statut.etat_ko')}`);

  const blocs = [
    C.texte(`## ${t('statut.titre')}\n### ${etat}`),
    ...(b ? [C.texte(b.liste.slice(0, 3).map((i) => inc.ligneEtat(i, t)).join('\n\n')), C.separateur()] : []),
    C.texte(
      `**${t('statut.serveurs')}** · ${nb(donnees.serveurs)}\n`
      + `**${t('statut.membres')}** · ${nb(donnees.membres)}\n`
      + `**${t('statut.latence')}** · ${donnees.latenceMs === null ? '—' : `${donnees.latenceMs} ms`}\n`
      + `**${t('statut.demarre')}** · <t:${Math.floor(donnees.demarreLe / 1000)}:R>`
      + (donnees.shards ? `\n**${t('statut.shards')}** · ${donnees.shards}` : '')
    ),
    C.separateur(),
    C.texte(
      `**${t('statut.dispo')}**\n`
      + `24 h · ${pourcent(disponibilite(86_400_000))}  ·  `
      + `7 ${t('statut.jours')} · ${pourcent(disponibilite(7 * 86_400_000))}  ·  `
      + `30 ${t('statut.jours')} · ${pourcent(disponibilite(30 * 86_400_000))}`
      + (barre() ? `\n${barre()}\n-# ${t('statut.barre_legende')}` : '')
    ),
  ];

  const boutons = [];
  const site = require('./liens').site() ?? 'https://wumi.fr';
  boutons.push(new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel(t('statut.bouton_page')).setEmoji('📊').setURL(`${site.replace(/\/+$/, '')}/statut/`));
  if (process.env.DASHBOARD_URL && /^https:\/\//.test(process.env.DASHBOARD_URL)) {
    boutons.push(new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel(t('statut.bouton_dashboard')).setEmoji('🛠️').setURL(process.env.DASHBOARD_URL));
  }
  blocs.push(new ActionRowBuilder().addComponents(boutons));

  // L'horodatage relatif de Discord se met a jour tout seul dans le message :
  // s'il indique « il y a 2 heures », le bot ne releve plus rien, il est
  // donc eteint, meme si la derniere couleur affichee etait le vert.
  blocs.push(C.texte(`-# ${t('statut.releve')} <t:${Math.floor(donnees.date / 1000)}:R> · ${t('statut.releve_aide')}`));

  return C.envoi([
    C.conteneur(blocs, arret ? conf.couleurs.avertissement : !enLigne ? conf.couleurs.erreur : (b?.couleur ?? conf.couleurs.succes)),
  ]);
}

/**
 * Choisit (ou retire) le salon de statut du serveur support. L'ancien
 * message est supprime pour ne pas laisser un statut fige qui mentirait.
 */
async function configurerSalon(client, salonId) {
  const { config, majConfig } = require('../database/db');
  const support = require('./fondateur').serveurSupport();
  if (!support) return null;
  const cfg = config(support);
  if (cfg.statut_salon && cfg.statut_message) {
    const guild = client.guilds.cache.get(support);
    const ancien = guild?.channels?.cache?.get(cfg.statut_salon);
    await ancien?.messages?.delete(cfg.statut_message).catch(() => null);
  }
  majConfig(support, { statut_salon: salonId ?? null, statut_message: null });
  if (!salonId) return null;
  const donnees = await releve(client);
  return publier(client, donnees);
}

/**
 * Juste avant l'arret (pm2 restart/stop envoie SIGINT) : on passe le message
 * en orange. pm2 tue le processus 1,6 s apres : on se limite a 1,2 s.
 */
let arretPrevu = false;
function surveillerArret(client) {
  if (arretPrevu || process.env.NODE_ENV === 'test') return;
  arretPrevu = true;
  let enCours = false;
  const fin = async (signal) => {
    if (enCours) return;
    enCours = true;
    try {
      const donnees = await releve(client);
      await Promise.race([publier(client, donnees, { arret: true }), new Promise((r) => setTimeout(r, 1200))]);
    } catch {
      /* on s'arrete quand meme */
    }
    process.exit(signal === 'SIGINT' ? 130 : 0);
  };
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => fin(signal));
}

/** Demarre les releves periodiques. */
function demarrer(client) {
  debutProcessus = Date.now() - Math.round((process.uptime() ?? 0) * 1000);
  arreter();

  const tour = async () => {
    const donnees = await ecrire(client);
    // La publication Discord ne doit jamais empecher le fichier de s'ecrire :
    // c'est pour ca qu'elle vient APRES, et qu'elle avale ses erreurs.
    if (donnees) await publier(client, donnees).catch(() => null);
  };

  surveillerArret(client);

  // Un premier releve tout de suite : sans ca le fichier garderait l'etat du
  // redemarrage precedent pendant cinq minutes.
  tour().catch(() => null);
  minuterie = setInterval(() => tour().catch(() => null), INTERVALLE_MS);
  // Ne pas retenir le processus en vie pour ca.
  minuterie.unref?.();
}

function arreter() {
  if (minuterie) clearInterval(minuterie);
  minuterie = null;
}

/** Republie tout de suite le message de statut (apres un incident). */
async function rafraichir(client) {
  const donnees = await releve(client);
  return publier(client, donnees).catch(() => null);
}

/** Poste l'annonce d'un incident dans le salon de statut du support. */
async function annoncerIncident(client, incident) {
  const { config } = require('../database/db');
  const support = require('./fondateur').serveurSupport();
  const salon = support && client.guilds.cache.get(support)?.channels.cache.get(config(support).statut_salon);
  if (!salon?.isTextBased?.()) return false;
  const { t } = require('./langues').traducteur(support);
  const msg = await salon.send(require('./incidents').annonce(incident, t)).catch(() => null);
  return Boolean(msg);
}

module.exports = { rafraichir, annoncerIncident, releve, ecrire, publier, construireMessage, configurerSalon, disponibilite, demarrer, arreter, resumeHistorique, FICHIER, INTERVALLE_MS };
