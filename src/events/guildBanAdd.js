const { Events, AuditLogEvent } = require('discord.js');
const conf = require('../../config');
const journal = require('../utils/journal');
const { E } = require('../utils/emojis');

module.exports = {
  name: Events.GuildBanAdd,
  async execute(ban) {
    const { t } = journal.tj(ban.guild);
    const par = await journal.executeur(ban.guild, AuditLogEvent.MemberBanAdd, ban.user.id);
    await journal.fiche(ban.guild, 'moderation', {
      titre: `${E('moderation')} ${t('journal.ban_titre')}`,
      couleur: conf.couleurs.erreur,
      vignette: ban.user.displayAvatarURL({ size: 128 }),
      champs: [
        { nom: t('journal.membre'), valeur: `${ban.user} \`${ban.user.id}\``, court: true },
        { nom: t('journal.par'), valeur: par ? `${par.user}` : t('journal.inconnu'), court: true },
        { nom: t('journal.raison'), valeur: ban.reason || par?.raison || t('journal.aucune_raison') },
      ],
      liens: [journal.lienProfil(ban.guild, ban.user.id)],
    });
  },
};
