/**
 * Fermeture automatique des tickets INACTIFS (publics et support).
 *
 * Un ticket oublie reste ouvert des semaines, et la liste des tickets ouverts
 * finit par ne plus rien vouloir dire. Ici, toutes les 15 minutes :
 *
 *   1. un ticket sans message depuis N heures recoit une RELANCE, avec un
 *      bouton « Garder ouvert » ;
 *   2. si personne n'ecrit ni ne clique dans les N/2 heures qui suivent
 *      (au moins 1 h), il est ferme proprement : transcription, archive, MP.
 *
 * N se regle par serveur (config.ticket_inactif_heures, 0 = jamais) et, pour
 * le support, avec le reglage 'ticket.inactif_heures'. Les messages du bot
 * ne comptent pas comme de l'activite.
 */
const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { db } = require('../database/db');
const C = require('./composants');
const logger = require('./logger');
const { traducteur } = require('./langues');

const TOUR_MS = 15 * 60_000;
const HEURE = 3_600_000;

/** Date du dernier message HUMAIN du salon (ou de la creation du ticket). */
async function derniereActivite(salon, ticket) {
  const recents = await salon.messages.fetch({ limit: 20 }).catch(() => null);
  const humain = recents?.find((m) => !m.author.bot);
  return Math.max(humain?.createdTimestamp ?? 0, ticket.cree_le);
}

async function traiter({ salon, ticket, heures, prefixe, relancer, fermer }) {
  const { t } = traducteur(salon.guild);
  const limite = heures * HEURE;
  const grace = Math.max(HEURE, limite / 2);
  const activite = await derniereActivite(salon, ticket);
  const maintenant = Date.now();

  // Quelqu'un a ecrit depuis la relance : on oublie la relance.
  if (ticket.relance_le && activite > ticket.relance_le) {
    relancer(null);
    return;
  }

  if (!ticket.relance_le) {
    if (maintenant - activite < limite) return;
    relancer(maintenant);
    await salon.send(C.avertissement(
      t('ticket.v2.relance', { membre: `<@${ticket.user_id}>`, delai: `<t:${Math.floor((maintenant + grace) / 1000)}:R>` }),
      {
        elements: [new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`${prefixe}garder`).setStyle(ButtonStyle.Success).setEmoji('✋').setLabel(t('ticket.v2.bouton_garder'))
        )],
      }
    )).catch(() => null);
    return;
  }

  if (maintenant - ticket.relance_le >= grace) {
    await salon.send(C.info(t('ticket.v2.ferme_inactif'))).catch(() => null);
    await fermer(t('ticket.v2.raison_inactif', { n: heures }));
  }
}

async function tour(client) {
  await require('./tickets').alerterSansReponse(client).catch((e) => logger.debug('Alerte tickets :', e.message));
  // ---- Tickets publics, serveur par serveur
  const ouverts = db.prepare(`
    SELECT t.* , c.ticket_inactif_heures AS heures FROM tickets t
    JOIN config c ON c.guild_id = t.guild_id
    WHERE t.statut = 'ouvert' AND c.ticket_inactif_heures > 0
  `).all();
  const publics = require('./tickets');
  for (const ticket of ouverts) {
    const guild = client.guilds.cache.get(ticket.guild_id);
    const salon = guild?.channels.cache.get(ticket.channel_id);
    if (!salon) continue;
    await traiter({
      salon,
      ticket,
      heures: ticket.heures,
      prefixe: 'ticket_',
      relancer: (v) => publics.q.relance.run(v, ticket.channel_id),
      fermer: (raison) => publics.fermerCoeur({ guild, salon, ticket, fermePar: null, raison }),
    }).catch((e) => logger.debug('Ticket inactif :', e.message));
  }

  // ---- Tickets du support
  const store = require('./supportStore');
  const heures = store.lireNombre('ticket.inactif_heures');
  const support = require('./fondateur').serveurSupport();
  const guild = support ? client.guilds.cache.get(support) : null;
  if (!heures || !guild) return;
  const tickets = require('./ticketsSupport');
  for (const ticket of store.q.ouverts.all()) {
    const salon = guild.channels.cache.get(ticket.channel_id);
    if (!salon) continue;
    await traiter({
      salon,
      ticket,
      heures,
      prefixe: 'stk_',
      relancer: (v) => store.q.relance.run(v, ticket.channel_id),
      fermer: (raison) => tickets.fermerCoeur({ guild, salon, ticket, fermePar: null, raison }),
    }).catch((e) => logger.debug('Ticket support inactif :', e.message));
  }
}

let minuterie = null;
function demarrer(client) {
  if (minuterie) clearInterval(minuterie);
  const lancer = () => tour(client).catch((e) => logger.avertissement('Tickets inactifs :', e.message));
  setTimeout(lancer, 60_000).unref?.();
  minuterie = setInterval(lancer, TOUR_MS);
  minuterie.unref?.();
}

module.exports = { demarrer, tour, traiter };
