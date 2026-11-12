const { Events, EmbedBuilder } = require('discord.js');
const conf = require('../../config');
const { config, req } = require('../database/db');
const { envoyerLog } = require('../utils/logs');
const { ajouterXp, appliquerRecompenses, estExclu } = require('../utils/niveaux');
const { formaterDuree } = require('../utils/outils');
const logger = require('../utils/logger');
const { E } = require('../utils/emojis');

/** Le membre peut-il gagner de l'XP dans son salon vocal actuel ? */
function eligible(etat, cfg) {
  if (!etat.channel) return false;
  if (!cfg.xp_actif || !cfg.xp_vocal_actif || conf.xp.xpVocalParMinute <= 0) return false;
  if (etat.member?.user?.bot) return false;
  if (etat.channel.id === etat.guild.afkChannelId) return false;
  // Micro coupe : on compte quand meme (beaucoup ecoutent sans parler).
  // Casque coupe (sourdine totale) : la personne n'est pas vraiment la.
  if (conf.xp.ignorerVocalMute && (etat.selfDeaf || etat.serverDeaf)) return false;
  if (conf.xp.ignorerVocalSolo && etat.channel.members.filter((m) => !m.user.bot).size < 2) return false;
  if (estExclu(etat.guild.id, etat.channel.id, etat.member)) return false;
  return true;
}

/** Cloture une session vocale et attribue l'XP correspondant. */
async function cloturerSession(client, etat, cfg) {
  const cle = `${etat.guild.id}-${etat.id}`;
  const debut = client.vocal.get(cle);
  if (!debut) return;
  client.vocal.delete(cle);

  const secondes = Math.floor((Date.now() - debut) / 1000);
  if (secondes < 60) return;

  const minutes = Math.floor(secondes / 60);
  require('../utils/activite').noter(etat.guild.id, { vocal: minutes });
  require('../utils/missions').noter(etat.guild.id, etat.id, 'vocal', minutes);
  require('../utils/wrapped').noterVocal(etat.guild.id, etat.id, minutes);
  require('../utils/pets').activite(etat.guild.id, etat.id, Math.min(minutes, 120));
  // Meme multiplicateur que pour les messages : roles, evenement, objets, prestige.
  const multi = require('../utils/progression').multiplicateur(etat.guild.id, etat.id, etat.member);
  const gain = Math.round(minutes * conf.xp.xpVocalParMinute * multi.total);
  if (gain <= 0) return;

  let resultat;
  try {
    resultat = ajouterXp(etat.guild.id, etat.id, gain, { secondesVocal: secondes });
  } catch (e) {
    return logger.erreur('XP vocal :', e.message);
  }

  require('../utils/progression').verifierBadges(etat.guild.id, etat.id, etat.member);

  if (resultat.niveauApres > resultat.niveauAvant && etat.member) {
    logger.action('montée de niveau', etat.member.displayName, null, `niveau ${resultat.niveauApres}, en vocal`);
    const roles = await appliquerRecompenses(etat.member, resultat.niveauApres).catch(() => []);
    const destination = cfg.salon_levelup ?? 'actuel';
    if (destination === 'off') return;

    const embed = new EmbedBuilder()
      .setColor(conf.couleurs.succes)
      .setDescription(
        `${E('niveaux')} <@${etat.id}> passe **niveau ${resultat.niveauApres}** grace au vocal !` +
          (roles.length ? `\nTu debloques ${roles.map((r) => `<@&${r.id}>`).join(', ')} !` : '')
      );

    try {
      if (destination === 'mp') await etat.member.send({ embeds: [embed] }).catch(() => null);
      else {
        const salon = destination === 'actuel' ? etat.channel : etat.guild.channels.cache.get(destination);
        if (salon?.isTextBased()) await salon.send({ embeds: [embed] });
      }
    } catch {
      /* ignore */
    }
  }
}

/**
 * Le temps vocal n'etait credite qu'a la FIN d'une session, et les sessions
 * vivent en memoire : un redemarrage du bot les perdait, et quelqu'un reste
 * en vocal pendant le redemarrage n'etait plus jamais compte.
 *
 *  - demarrerSessions() : au demarrage, on ouvre une session pour chaque
 *    membre deja en vocal et eligible ;
 *  - crediterEnCours() : toutes les 5 min, on credite le temps ecoule des
 *    sessions ouvertes et on les relance. /profil est donc presque a jour,
 *    et un redemarrage ne fait perdre que quelques minutes au pire.
 */
function demarrerSessions(client) {
  let n = 0;
  for (const guild of client.guilds.cache.values()) {
    let cfg;
    try { cfg = config(guild.id); } catch { continue; }
    for (const etat of guild.voiceStates.cache.values()) {
      const cle = `${guild.id}-${etat.id}`;
      if (!client.vocal.has(cle) && eligible(etat, cfg)) {
        client.vocal.set(cle, Date.now());
        n += 1;
      }
    }
  }
  return n;
}

async function crediterEnCours(client) {
  for (const [cle, debut] of [...client.vocal.entries()]) {
    if (Date.now() - debut < 60_000) continue;
    const [guildId, userId] = cle.split('-');
    const guild = client.guilds.cache.get(guildId);
    const etat = guild?.voiceStates.cache.get(userId);
    if (!guild || !etat?.channel) {
      client.vocal.delete(cle);
      continue;
    }
    let cfg;
    try { cfg = config(guildId); } catch { continue; }
    await cloturerSession(client, etat, cfg).catch(() => null);
    if (eligible(etat, cfg)) client.vocal.set(cle, Date.now());
  }
}

module.exports = {
  demarrerSessions,
  crediterEnCours,
  name: Events.VoiceStateUpdate,
  async execute(avant, apres, client) {
    const guild = apres.guild ?? avant.guild;
    if (!guild) return;

    let cfg;
    try {
      cfg = config(guild.id);
    } catch {
      return;
    }

    // ------------------------------------------------ VOCAUX TEMPORAIRES
    const vocaux = require('../utils/vocauxTemporaires');
    try {
      // Arrivee dans un salon d'accueil : on cree le salon perso
      if (apres.channelId && apres.channelId !== avant.channelId) {
        const hub = req.hub.get(apres.channelId);
        if (hub && apres.member && !apres.member.user.bot) {
          await vocaux.creerPour(apres.member, hub);
        }
      }
      // Depart d'un salon temporaire : suppression s'il est vide
      if (avant.channelId && avant.channelId !== apres.channelId && avant.channel) {
        if (req.vocalTemp.get(avant.channelId)) await vocaux.verifierApresDepart(avant.channel);
      }
    } catch (e) {
      logger.avertissement('Vocaux temporaires :', e.message);
    }

    const cle = `${guild.id}-${apres.id ?? avant.id}`;

    // --------------------------------------------------------------- XP VOCAL
    const etaitEligible = client.vocal.has(cle);
    const estEligibleMaintenant = eligible(apres, cfg);

    if (etaitEligible && !estEligibleMaintenant) {
      await cloturerSession(client, avant.channel ? avant : apres, cfg);
    } else if (!etaitEligible && estEligibleMaintenant) {
      client.vocal.set(cle, Date.now());
    }

    // Quand quelqu'un rejoint, les autres du salon deviennent eligibles
    if (apres.channel && apres.channelId !== avant.channelId) {
      for (const membre of apres.channel.members.values()) {
        const k = `${guild.id}-${membre.id}`;
        if (!client.vocal.has(k) && eligible(membre.voice, cfg)) client.vocal.set(k, Date.now());
      }
    }

    // ------------------------------------------------------------------ LOGS
    const membre = apres.member ?? avant.member;
    const base = () =>
      new EmbedBuilder()
        .setAuthor({ name: membre?.user.tag ?? '?', iconURL: membre?.user.displayAvatarURL() || undefined })
        .setFooter({ text: `ID : ${membre?.id ?? '?'}` })
        .setTimestamp();

    const { t, duree } = require('../utils/langues').traducteur(guild);
    let ligne = null;
    let couleur = conf.couleurs.info;
    if (!avant.channelId && apres.channelId) {
      ligne = `${E('vocal')} ${t('journal.vocal_rejoint', { salon: `${apres.channel}` })}`;
      couleur = conf.couleurs.succes;
    } else if (avant.channelId && !apres.channelId) {
      const debut = client.vocal.get(cle);
      ligne = `${E('muet')} ${debut ? t('journal.vocal_quitte_duree', { salon: `${avant.channel}`, duree: duree(Date.now() - debut) }) : t('journal.vocal_quitte', { salon: `${avant.channel}` })}`;
      couleur = conf.couleurs.erreur;
    } else if (avant.channelId !== apres.channelId) {
      ligne = `↔️ ${t('journal.vocal_deplace', { avant: `${avant.channel}`, apres: `${apres.channel}` })}`;
    } else if (avant.streaming !== apres.streaming) {
      ligne = `${apres.streaming ? '🖥️' : '⏹️'} ${t(apres.streaming ? 'journal.vocal_stream_on' : 'journal.vocal_stream_off', { salon: `${apres.channel}` })}`;
    }
    if (ligne) await envoyerLog(guild, 'vocal', base().setColor(couleur).setDescription(ligne));
  },
};
