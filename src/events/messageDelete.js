const { Events, AuditLogEvent } = require('discord.js');
const journal = require('../utils/journal');
const conf = require('../../config');
const { tronquer } = require('../utils/outils');
const { E } = require('../utils/emojis');
const capacites = require('../utils/capacites');

module.exports = {
  name: Events.MessageDelete,
  async execute(message) {
    if (!message.guild) return;
    require('../utils/starboard').messageSupprime(message.guild, message.id).catch(() => null);
    if (message.partial && !message.author) return;
    if (message.author?.bot) return;
    require('../utils/snipe').noter('supprimes', message);

    // Qui a supprime ? (audit log, disponible seulement si ce n'est pas l'auteur)
    let auteurSuppression = null;
    try {
      const logs = await message.guild.fetchAuditLogs({ type: AuditLogEvent.MessageDelete, limit: 5 });
      const entree = logs.entries.find(
        (e) => e.target?.id === message.author?.id && e.extra?.channel?.id === message.channel.id && Date.now() - e.createdTimestamp < 8000
      );
      if (entree) auteurSuppression = entree.executor;
    } catch {
      /* permission ViewAuditLog manquante */
    }

    const { t } = journal.tj(message.guild);
    const contenu = capacites.contenuMessages()
      ? tronquer(message.content || t('journal.non_cache'))
      : t('journal.contenu_interdit');
    await journal.fiche(message.guild, 'messages', {
      titre: `${E('corbeille')} ${t('journal.msg_supprime')}`,
      couleur: conf.couleurs.erreur,
      vignette: message.author?.displayAvatarURL({ size: 128 }),
      champs: [
        { nom: t('journal.auteur'), valeur: message.author ? `${message.author} \`${message.author.id}\`` : t('journal.inconnu'), court: true },
        { nom: t('journal.salon'), valeur: `${message.channel}`, court: true },
        auteurSuppression && auteurSuppression.id !== message.author?.id ? { nom: t('journal.supprime_par'), valeur: `${auteurSuppression}`, court: true } : null,
        { nom: t('journal.contenu'), valeur: contenu },
        message.attachments?.size ? { nom: t('journal.pieces', { n: message.attachments.size }), valeur: tronquer(message.attachments.map((a) => a.name).join('\n')) } : null,
      ],
    });
  },
};
