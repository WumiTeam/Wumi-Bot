const { Events, ChannelType, AuditLogEvent } = require('discord.js');
const conf = require('../../config');
const journal = require('../utils/journal');
const { E } = require('../utils/emojis');

const TYPES = {
  [ChannelType.GuildText]: 'textuel',
  [ChannelType.GuildVoice]: 'vocal',
  [ChannelType.GuildCategory]: 'categorie',
  [ChannelType.GuildAnnouncement]: 'annonces',
  [ChannelType.GuildStageVoice]: 'conference',
  [ChannelType.GuildForum]: 'forum',
  [ChannelType.GuildMedia]: 'galerie',
};

module.exports = {
  name: Events.ChannelDelete,
  async execute(salon) {
    if (!salon.guild) return;
    const { t } = journal.tj(salon.guild);
    const par = await journal.executeur(salon.guild, AuditLogEvent.ChannelDelete, salon.id);
    await journal.fiche(salon.guild, 'serveur', {
      titre: `${E('corbeille')} ${t('journal.salon_supprime')}`,
      couleur: conf.couleurs.erreur,
      texte: `\`#${salon.name}\``,
      champs: [
        { nom: t('journal.type'), valeur: t(`journal.types.${TYPES[salon.type] ?? 'autre'}`), court: true },
        salon.parent ? { nom: t('journal.categorie'), valeur: salon.parent.name, court: true } : null,
        par ? { nom: t('journal.par'), valeur: `${par.user}`, court: true } : null,
      ],
      pied: `ID ${salon.id}`,
    });
  },
};
