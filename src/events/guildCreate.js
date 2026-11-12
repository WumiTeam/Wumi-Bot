const { Events } = require('discord.js');
const { config } = require('../database/db');
const logger = require('../utils/logger');

module.exports = {
  name: Events.GuildCreate,
  async execute(guild, client) {
    // Un serveur bloque repart tout de suite : pas de ligne de config, pas de
    // message d'accueil, rien. C'est le seul moyen d'empecher un serveur
    // sanctionne de revenir en boucle.
    const fondateur = require('../utils/fondateur');
    const sanction = fondateur.bloque(guild.id);
    if (sanction) {
      logger.avertissement(
        `Serveur bloque : ${guild.name} (${guild.id}) — sortie immediate`
        + (sanction.raison ? ` (${sanction.raison})` : '')
      );
      await guild.leave().catch((e) => logger.erreur('Sortie impossible :', e.message));
      return;
    }

    config(guild.id); // cree la ligne de configuration

    // Serveur support : role « Utilisateur de Wumi » pour qui l'a ajoute.
    require('../utils/rolesSupport').botAjoute(client, guild).catch((e) => logger.debug('Roles support :', e.message));

    const totaux = require('../utils/totaux');
    const totalServeurs = await totaux.serveurs(client);
    logger.succes(
      `Ajoute au serveur ${guild.name} (${guild.memberCount} membres) — `
      + `${totalServeurs} serveur(s) au total.`
    );
    if (totaux.estPremierShard(client)) require('../utils/echelle').verifier(totalServeurs);

    // Le message d'accueil : c'est lui qui explique au serveur ce que le bot
    // sait faire et par ou commencer. Un echec ici — salon interdit, prives
    // fermes — ne doit pas empecher le bot de servir le serveur.
    let ou = null;
    try {
      ou = await require('../utils/accueil').souhaiterBienvenue(guild, client);
      if (!ou) logger.avertissement(`${guild.name} : aucun endroit ou poster le message d'accueil.`);
    } catch (e) {
      logger.avertissement(`Message d'accueil sur ${guild.name} :`, e.message);
    }

    // Le journal du serveur support. En dernier, et sans jamais faire echouer
    // l'arrivee : si la notification ne part pas, le bot sert quand meme le
    // serveur — c'est l'inverse qui serait absurde.
    try {
      await require('../utils/journalBot').arrivee(client, guild, { ou: ou?.ou ?? null });
    } catch (e) {
      logger.debug('Journal du bot :', e.message);
    }
  },
};
