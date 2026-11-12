const { Events, AttachmentBuilder } = require('discord.js');
const conf = require('../../config');
const { config } = require('../database/db');
const { remplacerVariables, ts, tronquer } = require('../utils/outils');
const { genererCarteBienvenue } = require('../utils/carteBienvenue');
const logger = require('../utils/logger');
const { E } = require('../utils/emojis');

module.exports = {
  name: Events.GuildMemberRemove,
  async execute(membre) {
    const cfg = config(membre.guild.id);
    require('../utils/activite').noter(membre.guild.id, { departs: 1 });

    const passe = membre.joinedTimestamp ? Math.floor((Date.now() - membre.joinedTimestamp) / 86_400_000) : null;
    logger.action('départ', membre.user?.username ?? membre.id, null, passe === null ? null : `resté ${passe} jour(s)`);

    await require('../utils/invitations')
      .traiterDepart(membre)
      .catch((e) => logger.avertissement('Suivi des invitations (départ) :', e.message));

    const roles = membre.roles?.cache
      ? membre.roles.cache
          .filter((r) => r.id !== membre.guild.id)
          .map((r) => r.name)
          .join(', ')
      : null;

    {
      const journal = require('../utils/journal');
      const { t, duree } = journal.tj(membre.guild);
      const exclu = await journal.executeur(membre.guild, require('discord.js').AuditLogEvent.MemberKick, membre.id);
      await journal.fiche(membre.guild, 'membres', {
        titre: `${E('porte')} ${t(exclu ? 'journal.expulse_titre' : 'journal.depart_titre', { nom: membre.user.username })}`,
        couleur: conf.couleurs.aurevoir,
        vignette: membre.user.displayAvatarURL({ size: 256 }),
        texte: `${membre.user} \`${membre.id}\``,
        champs: [
          { nom: t('journal.avait_rejoint'), valeur: membre.joinedTimestamp ? `${ts(membre.joinedTimestamp)} · ${t('journal.reste', { duree: duree(Date.now() - membre.joinedTimestamp) })}` : t('journal.inconnu') },
          { nom: t('journal.roles'), valeur: tronquer(roles || t('journal.aucun')) },
          { nom: t('journal.membres_restants'), valeur: String(membre.guild.memberCount), court: true },
          exclu ? { nom: t('journal.par'), valeur: `${exclu.user}${exclu.raison ? ` · ${exclu.raison}` : ''}`, court: true } : null,
        ],
      });
    }

    if (!cfg.salon_aurevoir) return;
    const salon = membre.guild.channels.cache.get(cfg.salon_aurevoir);
    if (!salon?.isTextBased()) return;

    const texte = remplacerVariables(cfg.message_aurevoir || require('../utils/langues').traducteur(membre.guild).t('journal.aurevoir_defaut'), {
      membre,
      guild: membre.guild,
    });

    const message = { content: texte };
    if (cfg.carte_bienvenue) {
      try {
        const png = await genererCarteBienvenue({
          pseudo: membre.user.username,
          avatarUrl: membre.user.displayAvatarURL({ extension: 'png', size: 256 }),
          serveur: membre.guild.name,
          numeroMembre: membre.guild.memberCount,
          depart: true,
          textes: (() => {
            const { t } = require('../utils/langues').traducteur(membre.guild);
            return { titre: t('bienvenue.carte_titre_depart'), sous: t('bienvenue.carte_sous_depart', { n: membre.guild.memberCount, serveur: membre.guild.name }) };
          })(),
        });
        message.files = [new AttachmentBuilder(png, { name: 'aurevoir.png' })];
      } catch (e) {
        logger.avertissement("Carte d'au revoir non generee :", e.message);
      }
    }

    await salon.send(message).catch(() => null);
  },
};
