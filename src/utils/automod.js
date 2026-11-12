const { PermissionsBitField, EmbedBuilder } = require('discord.js');
const conf = require('../../config');
const { req } = require('../database/db');
const { enregistrer } = require('./sanctions');
const { envoyerLog } = require('./logs');
const { tronquer } = require('./outils');
const logger = require('./logger');
const { E } = require('./emojis');
const capacites = require('./capacites');
const antiPhishing = require('./antiPhishing');
const { traducteur } = require('./langues');

const REGEX_INVITATION = /(discord\.(gg|io|me|li)|discord(app)?\.com\/invite)\/[a-z0-9-_]+/i;
const REGEX_LIEN = /https?:\/\/[^\s]+|www\.[^\s]+/i;
// Global (contrairement a REGEX_LIEN) : l'anti-phishing doit examiner CHAQUE
// lien d'un message, pas seulement s'arreter au premier.
const REGEX_LIENS_TOUS = /(?:https?:\/\/|www\.)[^\s<>()[\]]+/gi;

/** Le membre est-il exempte de l'automod ? */
function exempte(message) {
  const membre = message.member;
  if (!membre) return true;
  if (membre.permissions.has(PermissionsBitField.Flags.ManageMessages)) return true;
  if (membre.permissions.has(PermissionsBitField.Flags.Administrator)) return true;

  const salonsExclus = req.exclusions.all(message.guild.id, 'automod_salon').map((e) => e.cible_id);
  if (salonsExclus.includes(message.channel.id) || salonsExclus.includes(message.channel.parentId)) return true;

  const rolesExclus = req.exclusions.all(message.guild.id, 'automod_role').map((e) => e.cible_id);
  if (rolesExclus.some((id) => membre.roles.cache.has(id))) return true;

  return false;
}

/** Normalise un texte pour la detection de mots interdits (accents, leet speak). */
function normaliser(texte) {
  return texte
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // accents
    .replace(/[0@]/g, 'o')
    .replace(/[1!|]/g, 'i')
    .replace(/3/g, 'e')
    .replace(/4/g, 'a')
    .replace(/[5$]/g, 's')
    .replace(/7/g, 't')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Analyse un message. Renvoie le motif de declenchement ou null.
 */
function analyser(message, cfg, client) {
  const contenu = message.content ?? '';

  // --- Invitations Discord
  if (cfg.automod_invitations && REGEX_INVITATION.test(contenu)) {
    return { motif: 'Invitation Discord', detail: 'Les invitations vers d\'autres serveurs sont interdites.' };
  }

  // --- Liens
  if (cfg.automod_liens && REGEX_LIEN.test(contenu)) {
    return { motif: 'Lien interdit', detail: 'Les liens ne sont pas autorises ici.' };
  }

  // --- Mots interdits
  if (cfg.automod_mots) {
    const mots = [...conf.automod.motsInterditsParDefaut, ...req.mots.all(message.guild.id).map((m) => m.mot)];
    if (mots.length) {
      const normalise = normaliser(contenu);
      const trouve = mots.find((mot) => {
        const m = normaliser(mot).trim();
        if (!m) return false;
        return new RegExp(`(^|\\s)${m.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\s|$)`, 'i').test(normalise) || normalise.includes(m);
      });
      if (trouve) return { motif: 'Mot interdit', detail: 'Ton message contient un terme interdit sur ce serveur.' };
    }
  }

  // --- Mentions massives
  if (cfg.automod_mentions) {
    const total = message.mentions.users.size + message.mentions.roles.size;
    if (total > conf.automod.mentionsMax) {
      return { motif: 'Mentions massives', detail: `Maximum ${conf.automod.mentionsMax} mentions par message.` };
    }
  }

  // --- Majuscules
  if (cfg.automod_majuscules && contenu.length > 10) {
    const lettres = contenu.replace(/[^a-zA-ZÀ-ÿ]/g, '');
    if (lettres.length > 8) {
      const majuscules = lettres.replace(/[^A-ZÀ-Þ]/g, '').length;
      if ((majuscules / lettres.length) * 100 > conf.automod.majusculesPourcentMax) {
        return { motif: 'Abus de majuscules', detail: 'Evite d\'ecrire tout en majuscules.' };
      }
    }
  }

  // --- Spam / flood
  if (cfg.automod_spam) {
    const cle = `${message.guild.id}-${message.author.id}`;
    const maintenant = Date.now();
    const fenetre = conf.automod.spamFenetreSecondes * 1000;
    const historique = (client.antiSpam.get(cle) ?? []).filter((m) => maintenant - m.date < fenetre);
    historique.push({ contenu, date: maintenant });
    client.antiSpam.set(cle, historique);

    if (historique.length > conf.automod.spamMessages) {
      client.antiSpam.set(cle, []);
      return { motif: 'Spam', detail: `Pas plus de ${conf.automod.spamMessages} messages en ${conf.automod.spamFenetreSecondes} secondes.` };
    }

    const identiques = historique.filter((m) => m.contenu && m.contenu === contenu).length;
    if (contenu && identiques > conf.automod.repetitionMax) {
      client.antiSpam.set(cle, []);
      return { motif: 'Repetition', detail: 'Arrete de repeter le meme message.' };
    }
  }

  return null;
}

/**
 * Un lien signale par la liste anti-phishing, ou null.
 * Independant des autres regles de l'automod : cfg.automod_liens interdit
 * TOUS les liens si on l'active, alors que l'anti-phishing ne vise que les
 * domaines connus pour piller des comptes — les deux reglages n'ont rien a
 * voir l'un avec l'autre.
 */
function detecterPhishing(message, cfg) {
  const liens = (message.content ?? '').match(REGEX_LIENS_TOUS);
  if (!liens) return null;

  const listeBlanche = antiPhishing.listeBlancheDepuis(cfg.antiphishing_liste_blanche);
  for (const lien of liens) {
    if (antiPhishing.estSignale(lien, { listeBlanche })) {
      return { lien, hote: antiPhishing.hoteDe(lien) };
    }
  }
  return null;
}

/**
 * Agit sur un lien de phishing selon le reglage du serveur.
 * Contrairement au reste de l'automod (toujours supprimer + avertir), quatre
 * niveaux sont proposes : un lien de phishing est plus dangereux qu'un mot
 * interdit, certains serveurs veulent pouvoir exclure ou bannir directement.
 */
async function agirAntiPhishing(message, cfg, client, detection) {
  const { t } = traducteur(message.guild.id);
  const action = cfg.antiphishing_action || 'supprimer';

  await message.delete().catch(() => null);
  logger.action('antiphishing', message.member?.displayName ?? message.author.username, message.channel?.name,
    `${detection.hote} — ${action}`);

  // « supprimer » reste discret : pas d'annonce publique, juste le log. Les
  // trois autres niveaux previennent le salon, comme le reste de l'automod.
  if (action !== 'supprimer') {
    const avis = await message.channel
      .send({
        content: `${message.author}`,
        embeds: [
          new EmbedBuilder()
            .setColor(conf.couleurs.avertissement)
            .setDescription(`${E('bouclier')} **${t('antiphishing.motif')}** — ${t('antiphishing.detail', { domaine: detection.hote })}`),
        ],
      })
      .catch(() => null);
    if (avis) setTimeout(() => avis.delete().catch(() => null), 6000);
  }

  const raisonSanction = t('antiphishing.raison_sanction', { domaine: detection.hote });

  if (action === 'exclure' && message.member?.kickable) {
    await message.member.kick(raisonSanction).catch(() => null);
    await enregistrer({ guild: message.guild, cible: message.author, moderateur: client.user, type: 'kick', raison: raisonSanction })
      .catch((e) => logger.avertissement('Anti-phishing (exclusion) :', e.message));
  } else if (action === 'bannir' && message.member?.bannable) {
    await message.member.ban({ reason: raisonSanction }).catch(() => null);
    await enregistrer({ guild: message.guild, cible: message.author, moderateur: client.user, type: 'ban', raison: raisonSanction })
      .catch((e) => logger.avertissement('Anti-phishing (bannissement) :', e.message));
  }

  await envoyerLog(
    message.guild,
    'moderation',
    new EmbedBuilder()
      .setColor(0xc0392b)
      .setAuthor({ name: `${E('bouclier')} ${t('antiphishing.log_titre')}`, iconURL: message.author.displayAvatarURL() || undefined })
      .addFields(
        { name: t('antiphishing.log_membre'), value: `${message.author} \`${message.author.id}\``, inline: true },
        { name: t('antiphishing.log_domaine'), value: `\`${detection.hote}\``, inline: true },
        { name: t('antiphishing.log_action'), value: t(`antiphishing.action.${action}`), inline: true },
        { name: t('antiphishing.log_lien'), value: tronquer(detection.lien) }
      )
      .setFooter({ text: t('antiphishing.log_total', { n: antiPhishing.compteur() }) })
      .setTimestamp()
  );

  return true;
}

/**
 * Traite un message : supprime, avertit et sanctionne si necessaire.
 * @returns {Promise<boolean>} true si le message a ete supprime
 */
async function traiter(message, cfg, client) {
  // Sans l'intent « contenu des messages », message.content est vide pour
  // TOUS les messages : ni l'automod ni l'anti-phishing ne verraient autre
  // chose que du vide, et laisseraient tout passer en silence. Autant le dire
  // une fois et s'arreter la — mais seulement si l'un des deux est active,
  // sinon on avertirait pour une limitation qui ne gene personne ici.
  if (!capacites.contenuMessages()) {
    if (cfg.automod_actif || cfg.antiphishing_actif) capacites.signalerUneFois('automod', 'Automod');
    return false;
  }
  if (!message.guild || message.author.bot) return false;
  if (exempte(message)) return false;

  // --- Anti-phishing : reglage a part, INDEPENDANT de cfg.automod_actif. Un
  // serveur doit pouvoir se proteger des liens vereux sans activer tout le
  // reste (spam, majuscules...), ce qui ne l'interesse peut-etre pas.
  if (cfg.antiphishing_actif) {
    const detection = detecterPhishing(message, cfg);
    if (detection) return agirAntiPhishing(message, cfg, client, detection);
  }

  if (!cfg.automod_actif) return false;

  const resultat = analyser(message, cfg, client);
  if (!resultat) return false;

  await message.delete().catch(() => null);
  logger.action('automod', message.member?.displayName ?? message.author.username, message.channel?.name,
    `${resultat.motif} — message supprimé`);

  // Avertissement ephemere dans le salon
  const avis = await message.channel
    .send({
      content: `${message.author}`,
      embeds: [
        new EmbedBuilder()
          .setColor(conf.couleurs.avertissement)
          .setDescription(`${E('avertissement')} **${resultat.motif}** — ${resultat.detail}`),
      ],
    })
    .catch(() => null);
  if (avis) setTimeout(() => avis.delete().catch(() => null), 6000);

  // Log
  await envoyerLog(
    message.guild,
    'moderation',
    new EmbedBuilder()
      .setColor(0x9b59b6)
      .setAuthor({ name: `${E('robot')} Automod — ${resultat.motif}`, iconURL: message.author.displayAvatarURL() || undefined })
      .addFields(
        { name: traducteur(message.guild.id).t('journal.membre'), value: `${message.author} \`${message.author.id}\``, inline: true },
        { name: traducteur(message.guild.id).t('journal.salon'), value: `${message.channel}`, inline: true },
        { name: traducteur(message.guild.id).t('journal.contenu'), value: tronquer(message.content || traducteur(message.guild.id).t('journal.vide')) }
      )
      .setTimestamp()
  );

  // Cumul des declenchements -> mute automatique
  const cle = `${message.guild.id}-${message.author.id}`;
  const fenetre = conf.automod.fenetreAvertissementsMinutes * 60_000;
  const maintenant = Date.now();
  const strikes = (client.automodStrikes.get(cle) ?? []).filter((d) => maintenant - d < fenetre);
  strikes.push(maintenant);
  client.automodStrikes.set(cle, strikes);

  if (strikes.length >= conf.automod.seuilAvertissements) {
    client.automodStrikes.set(cle, []);
    const duree = conf.automod.dureeMuteAutoMinutes * 60_000;
    try {
      if (message.member?.moderatable) {
        await message.member.timeout(duree, `Automod : ${resultat.motif} (${strikes.length} declenchements)`);
        await enregistrer({
          guild: message.guild,
          cible: message.author,
          moderateur: client.user,
          type: 'mute',
          raison: `Automod — ${resultat.motif} (${strikes.length} declenchements)`,
          duree,
        });
      }
    } catch (e) {
      logger.avertissement('Mute automatique impossible :', e.message);
    }
  }

  return true;
}

module.exports = { traiter, analyser, exempte, detecterPhishing, agirAntiPhishing };
