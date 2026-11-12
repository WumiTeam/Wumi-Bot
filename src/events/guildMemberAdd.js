const { Events, EmbedBuilder } = require('discord.js');
const conf = require('../../config');
const { config } = require('../database/db');
const { envoyerLog } = require('../utils/logs');
const { embeds, ts } = require('../utils/outils');
const { enregistrerArrivee, declencherLockdown } = require('../utils/antiRaid');
const logger = require('../utils/logger');
const { E } = require('../utils/emojis');

const JOUR = 86_400_000;

module.exports = {
  name: Events.GuildMemberAdd,
  async execute(membre, client) {
    if (membre.user.bot && membre.guild.id === undefined) return;
    const cfg = config(membre.guild.id);
    if (require('../utils/fondateur').estSupport(membre.guild.id)) {
      require('../utils/rolesSupport').majMembre(client, membre).catch(() => null);
    }
    require('../utils/activite').noter(membre.guild.id, { arrivees: 1 });
    const ageCompte = Date.now() - membre.user.createdTimestamp;

    const jours = Math.floor(ageCompte / 86_400_000);
    logger.action('arrivée', membre.user.username, null, `compte créé il y a ${jours} jour(s)`);

    // ------------------------------------------------- BLOCKLIST COMMUNAUTAIRE
    // Une alerte au staff, si ce serveur l'a demandee. Le bot ne sanctionne
    // pas : une fiche approuvee a tort ferait sinon bannir quelqu'un partout
    // a la fois, sans recours.
    require('../utils/blocklist')
      .alerterArrivee(membre)
      .catch((e) => logger.debug('Alerte blocklist :', e.message));

    // ------------------------------------------------------------ MODE RAID
    // Active a la main avec /raid activer : les nouveaux venus sont expulses
    // (avec un MP qui explique) tant que le mode dure.
    try {
      if (await require('../utils/modeRaid').filtrerArrivee(membre)) return;
    } catch (e) {
      logger.debug('Mode raid :', e.message);
    }

    // ------------------------------------------------------------ ANTI-RAID
    if (cfg.antiraid_actif && !membre.user.bot) {
      // Compte trop recent
      const { t: tr } = require('../utils/langues').traducteur(membre.guild);
      if (cfg.antiraid_age_min > 0 && ageCompte < cfg.antiraid_age_min * JOUR) {
        await membre
          .send({
            embeds: [
              embeds.avertissement(
                tr('journal.ar_trop_recent_mp', { serveur: membre.guild.name, n: cfg.antiraid_age_min })
              ),
            ],
          })
          .catch(() => null);
        await membre.kick(`Anti-raid : compte de moins de ${cfg.antiraid_age_min} jours`).catch(() => null);
        await envoyerLog(
          membre.guild,
          'moderation',
          new EmbedBuilder()
            .setColor(conf.couleurs.avertissement)
            .setTitle(`${E('bouclier')} ${tr('journal.ar_trop_recent')}`)
            .setDescription(tr('journal.ar_trop_recent_log', { membre: `${membre.user.tag} (\`${membre.id}\`)`, quand: ts(membre.user.createdTimestamp, 'R') }))
            .setTimestamp()
        );
        return;
      }

      // Vague d'arrivees
      const raid = enregistrerArrivee(client, membre.guild);
      if (raid) {
        await declencherLockdown(
          membre.guild,
          tr('journal.ar_vague', { n: conf.antiRaid.joinsSeuil, s: conf.antiRaid.joinsFenetreSecondes }),
          client
        ).catch((e) => logger.erreur('Lockdown :', e.message));
      }

      // Pendant un verrouillage, on applique l'action configuree
      if (config(membre.guild.id).antiraid_verrouille && conf.antiRaid.actionPendantRaid !== 'aucune') {
        const action = conf.antiRaid.actionPendantRaid;
        await membre
          .send({ embeds: [embeds.avertissement(tr('journal.ar_pendant_mp', { serveur: membre.guild.name }))] })
          .catch(() => null);
        if (action === 'ban') await membre.ban({ reason: 'Anti-raid : arrivee pendant un raid' }).catch(() => null);
        else await membre.kick('Anti-raid : arrivee pendant un raid').catch(() => null);
        return;
      }
    }

    // -------------------------------------------------- SUIVI DES INVITATIONS
    // Fait en premier : le cache des invitations doit etre compare au plus tot.
    await require('../utils/invitations')
      .traiterArrivee(membre)
      .catch((e) => logger.avertissement('Suivi des invitations :', e.message));

    // ------------------------------------------------------------ ROLE AUTO
    if (cfg.role_auto) {
      const role = membre.guild.roles.cache.get(cfg.role_auto);
      if (role?.editable) await membre.roles.add(role, 'Role automatique a l\'arrivee').catch(() => null);
    }

    // --------------------------------------------------------------- LOG
    {
      const { t, duree } = require('../utils/journal').tj(membre.guild);
      await require('../utils/journal').fiche(membre.guild, 'membres', {
        titre: `${E('salut')} ${t('journal.arrivee_titre', { nom: membre.user.username })}`,
        couleur: conf.couleurs.bienvenue,
        vignette: membre.user.displayAvatarURL({ size: 256 }),
        texte: `${membre} \`${membre.id}\`${membre.user.bot ? ' · 🤖' : ''}`,
        champs: [
          { nom: t('journal.compte_cree'), valeur: `${ts(membre.user.createdTimestamp)} (${ts(membre.user.createdTimestamp, 'R')})` },
          { nom: t('journal.membres_total'), valeur: String(membre.guild.memberCount), court: true },
          ageCompte < 7 * JOUR ? { nom: `${E('avertissement')} ${t('journal.compte_recent_titre')}`, valeur: t('journal.compte_recent', { duree: duree(ageCompte) }) } : null,
        ],
        liens: [require('../utils/journal').lienProfil(membre.guild, membre.id)],
      });
    }

    // --------------------------------------------------------- BIENVENUE
    // Partage avec /welcome test : voir src/utils/bienvenue.js
    await require('../utils/bienvenue').envoyerBienvenue(membre);
  },
};
