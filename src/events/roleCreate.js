const { Events, AuditLogEvent } = require('discord.js');
const conf = require('../../config');
const journal = require('../utils/journal');
const { E } = require('../utils/emojis');

module.exports = {
  name: Events.GuildRoleCreate,
  async execute(role) {
    const { t } = journal.tj(role.guild);
    const par = await journal.executeur(role.guild, AuditLogEvent.RoleCreate, role.id);
    await journal.fiche(role.guild, 'serveur', {
      titre: `${E('role')} ${t('journal.role_cree')}`,
      couleur: conf.couleurs.succes,
      texte: `${role} · \`${role.name}\``,
      champs: [par ? { nom: t('journal.par'), valeur: `${par.user}`, court: true } : null],
      pied: `ID ${role.id}`,
    });
  },
};
