/**
 * RAPPORT HEBDOMADAIRE D'ACTIVITE — chaque lundi matin, pour le staff.
 *
 * Le lundi a partir de 9 h (heure de Paris), chaque serveur qui a choisi un
 * salon (/stats rapport) recoit le bilan de la semaine ecoulee (lundi a
 * dimanche) : messages, membres, vocal, comparaison avec la semaine d'avant,
 * salons et heures de pointe, et ce qui merite l'attention du staff.
 *
 * Un seul envoi par semaine : la date du lundi est notee dans
 * stats_rapport_dernier. Si le bot etait eteint lundi, le rapport part au
 * redemarrage, tant qu'on est encore dans la semaine.
 */
const { AttachmentBuilder } = require('discord.js');
const conf = require('../../config');
const C = require('./composants');
const { req, majConfig } = require('../database/db');
const activite = require('./activite');
const { genererGraphique } = require('./graphiqueActivite');
const { traducteur } = require('./langues');
const logger = require('./logger');

const HEURE_ENVOI = 9;

/** Jour de la semaine a Paris : 1 = lundi … 7 = dimanche. */
function jourSemaine(date = new Date()) {
  const nom = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Paris', weekday: 'short' }).format(date);
  return ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(nom) + 1;
}

/** Le lundi de la semaine en cours (AAAA-MM-JJ, Paris). */
function lundiCourant(date = new Date()) {
  return activite.jour(new Date(date.getTime() - (jourSemaine(date) - 1) * 86_400_000));
}

const fleche = (p) => (p === null ? '' : p > 0 ? ` · 📈 **+${p} %**` : p < 0 ? ` · 📉 **${p} %**` : ' · ➖ **0 %**');

/**
 * Construit le rapport des 7 derniers jours complets (hier compris).
 * @returns {Promise<object|null>} le message, ou null s'il n'y a rien a dire
 */
async function construire(guild, apercu = false) {
  const { t, nombre } = traducteur(guild.id);
  const semaine = activite.serie(guild.id, 8).slice(0, 7); // J-7 .. J-1
  const cette = activite.totaux(guild.id, 7, 1);
  const avant = activite.totaux(guild.id, 7, 8);
  if (!cette.messages && !cette.arrivees && !cette.departs && !cette.vocal) return null;

  const heures = activite.heures(guild.id, semaine[0].jour, semaine.at(-1).jour);
  const pic = heures.reduce((best, v, i) => (v > heures[best] ? i : best), 0);
  const meilleur = semaine.reduce((a, b) => (b.messages > a.messages ? b : a), semaine[0]);
  const salons = activite.topSalons(guild.id, 8, 3).map((s) => {
    const c = guild.channels.cache.get(s.channel_id);
    return { nom: c ? `#${c.name}` : '#?', id: s.channel_id, total: s.total, existe: Boolean(c) };
  });
  const evoMsg = activite.evolution(cette.messages, avant.messages);
  const evoVocal = activite.evolution(cette.vocal, avant.vocal);
  const net = cette.arrivees - cette.departs;

  // Ce qui merite l'attention du staff : on ne le dit que si c'est net.
  const alertes = [];
  if (evoMsg !== null && evoMsg <= -25) alertes.push(t('stats.rapport_alerte_baisse', { p: Math.abs(evoMsg) }));
  if (net < 0 && cette.departs >= 3) alertes.push(t('stats.rapport_alerte_departs', { n: nombre(cette.departs), a: nombre(cette.arrivees) }));
  if (evoMsg !== null && evoMsg >= 25) alertes.push(t('stats.rapport_alerte_hausse', { p: evoMsg }));
  if (!alertes.length) alertes.push(t('stats.rapport_rien'));

  const jourLisible = (iso) => `<t:${Math.floor(new Date(`${iso}T12:00:00Z`).getTime() / 1000)}:D>`;
  const blocs = [
    C.texte(`## 📊 ${t('stats.rapport_titre', { serveur: guild.name })}\n${t('stats.rapport_periode', { du: jourLisible(semaine[0].jour), au: jourLisible(semaine.at(-1).jour) })}`),
    C.separateur(),
    C.texte([
      `💬 **${t('stats.champ_messages')}** — ${nombre(cette.messages)}${fleche(evoMsg)}`,
      `👥 **${t('stats.champ_membres')}** — ${net >= 0 ? '+' : ''}${nombre(net)} · ${t('stats.rapport_mouvements', { a: nombre(cette.arrivees), d: nombre(cette.departs) })}`,
      `🎙️ **${t('stats.champ_vocal')}** — ${t('stats.rapport_vocal', { h: nombre(Math.round(cette.vocal / 60)) })}${fleche(evoVocal)}`,
    ].join('\n')),
    C.texte([
      `**${t('stats.rapport_temps_forts')}**`,
      t('stats.rapport_meilleur_jour', { date: jourLisible(meilleur.jour), n: nombre(meilleur.messages) }),
      heures.some((v) => v) ? t('stats.rapport_pic', { h: pic, h2: (pic + 1) % 24 }) : null,
      salons.length ? t('stats.rapport_salons', { liste: salons.map((s) => (s.existe ? `<#${s.id}>` : s.nom)).join(', ') }) : null,
    ].filter(Boolean).join('\n')),
    C.texte(`**${t('stats.rapport_attention')}**\n${alertes.map((a) => `• ${a}`).join('\n')}`),
  ];

  const options = {};
  try {
    const png = await genererGraphique({ serveur: guild.name, serie: semaine, salons, heures, avant });
    options.files = [new AttachmentBuilder(png, { name: 'semaine.png' })];
    blocs.push(C.image('attachment://semaine.png'));
  } catch (e) {
    logger.avertissement('Graphique du rapport hebdo :', e.message);
  }
  blocs.push(C.texte(`-# ${t(apercu ? 'stats.rapport_pied_apercu' : 'stats.rapport_pied')}`));

  return { blocs, options };
}

/** Un passage : envoie les rapports dus. */
async function tour(client) {
  if (jourSemaine() === 1 && activite.heure() < HEURE_ENVOI) return; // lundi, trop tot
  const lundi = lundiCourant();
  let lignes;
  try {
    lignes = req.serveursRapportStats.all();
  } catch (e) {
    return logger.debug('Rapport hebdo :', e.message);
  }
  for (const l of lignes) {
    if (l.stats_rapport_dernier === lundi) continue;
    const guild = client.guilds.cache.get(l.guild_id);
    if (!guild) continue;
    // Note avant l'envoi : un echec ne doit pas relancer le rapport chaque minute.
    majConfig(guild.id, { stats_rapport_dernier: lundi });
    const salon = guild.channels.cache.get(l.stats_rapport_salon);
    if (!salon?.isTextBased()) continue;
    try {
      const rapport = await construire(guild);
      if (!rapport) continue;
      await salon.send(C.envoi([C.conteneur(rapport.blocs, conf.couleurs.principale)], rapport.options));
    } catch (e) {
      logger.avertissement(`Rapport hebdo (${guild.name}) :`, e.message);
    }
  }
}

function demarrer(client) {
  const lancer = () => tour(client).catch((e) => logger.erreur('Rapport hebdo :', e.message));
  setTimeout(lancer, 30_000).unref?.();
  setInterval(lancer, 10 * 60_000).unref?.();
}

module.exports = { construire, tour, demarrer, jourSemaine, lundiCourant };
