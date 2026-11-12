const { Events, AuditLogEvent } = require('discord.js');
const conf = require('../../config');
const journal = require('../utils/journal');
const { E } = require('../utils/emojis');

module.exports = {
  name: Events.MessageBulkDelete,
  async execute(messages, salon) {
    const guild = salon?.guild;
    if (!guild) return;
    const { t } = journal.tj(guild);
    const par = await journal.executeur(guild, AuditLogEvent.MessageBulkDelete, salon.id);
    // Qui ecrivait le plus parmi les messages supprimes (quand ils etaient en cache).
    const auteurs = new Map();
    for (const m of messages.values()) if (m.author) auteurs.set(m.author.id, (auteurs.get(m.author.id) ?? 0) + 1);
    const top = [...auteurs.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([id, n]) => `<@${id}> ×${n}`).join(' · ');
    await journal.fiche(guild, 'messages', {
      titre: `${E('balai')} ${t('journal.groupe_titre')}`,
      couleur: conf.couleurs.erreur,
      texte: t('journal.groupe_texte', { n: messages.size, salon: `${salon}` }),
      champs: [
        par ? { nom: t('journal.par'), valeur: `${par.user}`, court: true } : null,
        top ? { nom: t('journal.auteurs'), valeur: top } : null,
      ],
    });
  },
};
