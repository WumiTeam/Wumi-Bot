/**
 * Lance l'Activite Wumi pour jouer a Astro Run (/astro jouer, bouton
 * « Jouer », commande d'entree hors du serveur support).
 */
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, ApplicationFlags } = require('discord.js');
const C = require('./composants');
const fondateur = require('./fondateur');
const logger = require('./logger');
const { traducteur } = require('./langues');

/** L'Activite est-elle branchee (Developer Portal + .env) ? */
function disponible() {
  return String(process.env.ACTIVITE_ACTIVE ?? '').trim().toLowerCase() === 'true'
    && Boolean(String(process.env.CLIENT_SECRET ?? '').trim());
}

/**
 * Les Activites sont-elles activees dans le Developer Portal ? Discord le dit
 * par le drapeau EMBEDDED de l'application. Sans lui, launchActivity() est
 * refuse ET rend l'interaction inutilisable : il faut verifier AVANT.
 * Relu toutes les 5 minutes, pour voir l'activation sans redemarrer.
 */
let embarque = { valeur: null, lu: 0 };
async function activitesActivees(client) {
  if (embarque.valeur !== null && Date.now() - embarque.lu < 5 * 60_000) return embarque.valeur;
  try {
    const app = await client.application.fetch();
    embarque = { valeur: Boolean(app.flags?.has(ApplicationFlags.Embedded)), lu: Date.now() };
  } catch {
    embarque = { valeur: embarque.valeur ?? true, lu: Date.now() };
  }
  return embarque.valeur;
}

async function lancer(interaction) {
  const { t } = traducteur(interaction);
  if (!disponible()) return interaction.reply(C.infoPrivee(t('astro.indisponible')));
  if (!(await activitesActivees(interaction.client))) {
    return interaction.reply(C.infoPrivee(t('astro.portail'))).catch(() => null);
  }
  // Sur le support, l'Activite ouvre d'abord la verification : on retient
  // que ce membre veut jouer, la page le renverra vers le jeu.
  if (interaction.guild && fondateur.estSupport(interaction.guild.id)) require('./astro').noterIntention(interaction.channelId);
  try {
    await interaction.launchActivity();
  } catch (e) {
    logger.avertissement('Lancement d\'Astro Run :', e.message);
    embarque.lu = 0; // relire le drapeau au prochain essai
    if (interaction.replied || interaction.deferred) return null;
    return interaction.reply(C.avertissementPrivee(t('astro.lancement_impossible'))).catch(() => null);
  }
  return null;
}

/** Le bouton « Jouer » qu'on peut poser sous un message (customId astro_jouer). */
function bouton(t) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('astro_jouer').setStyle(ButtonStyle.Success).setEmoji('🚀').setLabel(t('astro.bouton_jouer'))
  );
}

module.exports = { lancer, bouton, disponible, activitesActivees, gererInteraction: lancer };
