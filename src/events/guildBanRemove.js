const { Events, AuditLogEvent } = require('discord.js');
const conf = require('../../config');
const journal = require('../utils/journal');
const { E } = require('../utils/emojis');

module.exports = {
  name: Events.GuildBanRemove,
  async execute(ban) {
    const { t } = journal.tj(ban.guild);
    const par = await journal.executeur(ban.guild, AuditLogEvent.MemberBanRemove, ban.user.id);
    await journal.fiche(ban.guild, 'moderation', {
      titre: `${E('recycler')} ${t('journal.deban_titre')}`,
      couleur: conf.couleurs.succes,
      vignette: ban.user.displayAvatarURL({ size: 128 }),
      champs: [
        { nom: t('journal.membre'), valeur: `${ban.user} \`${ban.user.id}\``, court: true },
        par ? { nom: t('journal.par'), valeur: `${par.user}`, court: true } : null,
      ],
    });
  },
};
