const { Events, EmbedBuilder } = require('discord.js');
const conf = require('../../config');
const { config } = require('../database/db');
const { ajouterXp, appliquerRecompenses, infosNiveau, estExclu } = require('../utils/niveaux');
const automod = require('../utils/automod');
const logger = require('../utils/logger');
const { E } = require('../utils/emojis');
const capacites = require('../utils/capacites');

module.exports = {
  name: Events.MessageCreate,
  async execute(message, client) {
    // Modmail : un MP a Wumi part vers l'equipe du support.
    if (!message.guild) {
      if (!message.author.bot) await require('../utils/modmail').surMP(message).catch((e) => logger.avertissement('Modmail :', e.message));
      return;
    }
    if (message.author.bot || message.system) return;

    // Modmail : la reponse du staff dans un fil part en MP au membre.
    if (message.channel.isThread?.()) require('../utils/modmail').surMessageStaff(message).catch((e) => logger.debug('Modmail :', e.message));

    let cfg;
    try {
      cfg = config(message.guild.id);
    } catch (e) {
      return logger.erreur('Config serveur :', e.message);
    }

    // Evenement de Noel (serveur support) : un objet tombe parfois de la neige.
    require('../utils/noel').surMessage(message).catch(() => null);

    // Statistiques d'activite (avant tout filtrage : on compte ce qui a ete ecrit)
    require('../utils/activite').noterMessage(message.guild.id, message.channel.id);

    // Statistiques par membre : heures actives et salons preferes
    try {
      require('../utils/statsMembre').noter(message.guild.id, message.author.id, message.channel.id);
    } catch (e) {
      logger.debug('Statistiques par membre :', e.message);
    }

    // Tickets : premiere reponse du staff (temps de reponse, prise en charge auto)
    require('../utils/tickets').surMessage(message, cfg).catch((e) => logger.debug('Ticket :', e.message));

    // Missions : un message de plus, et le salon compte comme "salon different"
    if (!message.author.bot) {
      const missions = require('../utils/missions');
      missions.noter(message.guild.id, message.author.id, 'messages', 1);
      missions.noter(message.guild.id, message.author.id, 'salons', 1, message.channel.id);
    }

    // ------------------------------------------------------------- AUTOMOD
    const supprime = await automod.traiter(message, cfg, client).catch((e) => {
      logger.erreur('Automod :', e.message);
      return false;
    });
    if (supprime) return;

    // ------------------------------------------------------ SALON COMPTEUR
    if (cfg.compteur_salon && cfg.compteur_salon === message.channel.id) {
      await require('../utils/compteur').traiter(message).catch((e) => logger.debug('Compteur :', e.message));
    }

    // -------------------------------------------------- PREMIER MESSAGE
    // Apres l'automod : on n'accueille pas chaleureusement un message qui
    // vient d'etre supprime pour spam.
    await require('../utils/premierMessage')
      .traiter(message)
      .catch((e) => logger.avertissement('Premier message :', e.message));

    // ---------------------------------------------------------------- FAQ
    // Repond aux questions frequentes ; n'empeche pas le gain d'XP.
    if (cfg.faq_actif) {
      await require('../utils/faq')
        .repondreAuto(message)
        .catch((e) => logger.avertissement('FAQ automatique :', e.message));
    }

    // ------------------------------------------------------------------ XP
    if (!cfg.xp_actif) return;
    if (estExclu(message.guild.id, message.channel.id, message.member)) return;
    // La longueur minimale sert a ne pas payer les « ok » et les « ptdr ».
    // Sans l'intent de contenu, message.content est vide pour tout le monde :
    // appliquer la regle reviendrait a supprimer l'XP du serveur entier sans
    // que personne comprenne pourquoi. On la saute, et le reste marche.
    if (capacites.contenuMessages() && (message.content ?? '').trim().length < conf.xp.longueurMiniMessage) return;

    const cle = `${message.guild.id}-${message.author.id}`;
    const maintenant = Date.now();
    const dernier = client.cooldownsXp.get(cle) ?? 0;
    if (maintenant - dernier < conf.xp.cooldownSecondes * 1000) return;
    client.cooldownsXp.set(cle, maintenant);

    // Le multiplicateur combine config.js, roles bonus, evenement double XP,
    // objets en cours et etoiles de prestige.
    const progression = require('../utils/progression');
    const multi = progression.multiplicateur(message.guild.id, message.author.id, message.member);
    const brut = Math.floor(Math.random() * (conf.xp.parMessageMax - conf.xp.parMessageMin + 1)) + conf.xp.parMessageMin;
    const gain = Math.max(1, Math.round(brut * multi.total));

    let resultat;
    try {
      resultat = ajouterXp(message.guild.id, message.author.id, gain, { messages: 1, dernierGain: maintenant });
    } catch (e) {
      return logger.erreur('Ajout XP :', e.message);
    }

    // Monnaie gagnee en meme temps que l'XP (meme delai d'attente)
    if (cfg.eco_actif && cfg.eco_gain_message > 0) {
      try {
        require('../utils/economie').crediter(message.guild.id, message.author.id, cfg.eco_gain_message);
      } catch (e) {
        logger.erreur('Gain de monnaie :', e.message);
      }
    }

    // Badges : verifies apres chaque gain, ils s'annoncent avec la montee de niveau
    const nouveauxBadges = progression.verifierBadges(message.guild.id, message.author.id, message.member);
    if (nouveauxBadges.length && cfg.salon_levelup !== 'off') {
      const salonBadges =
        cfg.salon_levelup && !['actuel', 'mp'].includes(cfg.salon_levelup)
          ? message.guild.channels.cache.get(cfg.salon_levelup)
          : message.channel;
      await salonBadges
        ?.send({
          embeds: [
            new EmbedBuilder()
              .setColor(conf.couleurs.succes)
              .setDescription(
                `${E('badge')} <@${message.author.id}> débloque ${nouveauxBadges.map((b) => `${b.emoji} **${b.nom}**`).join(', ')} !`
              ),
          ],
        })
        .catch(() => null);
    }

    if (resultat.niveauApres <= resultat.niveauAvant) return;
    logger.action('montée de niveau', message.member?.displayName ?? message.author.username, message.channel?.name,
      `niveau ${resultat.niveauApres}`);

    // --------------------------------------------------------- MONTEE DE NIVEAU
    const niveau = resultat.niveauApres;
    const roles = await appliquerRecompenses(message.member, niveau).catch(() => []);

    const destination = cfg.salon_levelup ?? 'actuel';
    if (destination === 'off') return;

    const texte =
      (cfg.message_levelup || '{mention} passe **niveau {niveau}** ! {emoji}')
        .replaceAll('{mention}', `<@${message.author.id}>`)
        .replaceAll('{pseudo}', message.author.username)
        .replaceAll('{niveau}', String(niveau))
        .replaceAll('{emoji}', E('niveaux')) +
      (roles.length ? `\nTu debloques ${roles.map((r) => `<@&${r.id}>`).join(', ')} !` : '');

    const embed = new EmbedBuilder()
      .setColor(conf.couleurs.succes)
      .setDescription(texte)
      .setThumbnail(message.author.displayAvatarURL({ size: 128 }))
      .setFooter({
        text:
          `${infosNiveau(resultat.xpApres).xpTotal} XP au total` +
          (multi.total > 1.01 ? ` · bonus actuel ×${multi.total.toFixed(2).replace(/\.?0+$/, '')}` : ''),
      });

    try {
      if (destination === 'mp') {
        await message.author.send({ embeds: [embed] }).catch(() => null);
      } else if (destination === 'actuel') {
        await message.channel.send({ embeds: [embed] });
      } else {
        const salon = message.guild.channels.cache.get(destination);
        if (salon?.isTextBased()) await salon.send({ embeds: [embed] });
        else await message.channel.send({ embeds: [embed] });
      }
    } catch (e) {
      logger.avertissement('Annonce de niveau non envoyee :', e.message);
    }
  },
};
