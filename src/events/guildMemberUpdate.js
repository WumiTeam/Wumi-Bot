const { Events, AuditLogEvent } = require('discord.js');
const journal = require('../utils/journal');
const conf = require('../../config');
const { tronquer } = require('../utils/outils');
const { E } = require('../utils/emojis');

module.exports = {
  name: Events.GuildMemberUpdate,
  async execute(avant, apres) {
    // ------------------------------------------------------------- BOOST
    if (avant.premiumSince !== apres.premiumSince) {
      const boosts = require('../utils/boosts');
      if (!avant.premiumSince && apres.premiumSince) {
        await boosts.traiterBoost(apres).catch((e) => require('../utils/logger').erreur('Boost :', e.message));
      } else if (avant.premiumSince && !apres.premiumSince) {
        await boosts.traiterFinBoost(apres).catch(() => null);
      }
    }

    const { t, duree } = journal.tj(apres.guild);
    const champs = [];

    // Pseudo de serveur
    if (avant.nickname !== apres.nickname) {
      champs.push({ nom: t('journal.pseudo'), valeur: `\`${avant.nickname ?? t('journal.aucun_pseudo')}\` → \`${apres.nickname ?? t('journal.aucun_pseudo')}\`` });
    }

    // Roles
    const ajoutes = apres.roles.cache.filter((r) => !avant.roles.cache.has(r.id));
    const retires = avant.roles.cache.filter((r) => !apres.roles.cache.has(r.id));
    if (ajoutes.size) champs.push({ nom: `➕ ${t('journal.roles_ajoutes')}`, valeur: tronquer(ajoutes.map((r) => `${r}`).join(', ')) });
    if (retires.size) champs.push({ nom: `➖ ${t('journal.roles_retires')}`, valeur: tronquer(retires.map((r) => `${r}`).join(', ')) });

    // Timeout (mute)
    let typeAudit = AuditLogEvent.MemberRoleUpdate;
    if (avant.communicationDisabledUntilTimestamp !== apres.communicationDisabledUntilTimestamp) {
      typeAudit = AuditLogEvent.MemberUpdate;
      if (apres.communicationDisabledUntilTimestamp && apres.communicationDisabledUntilTimestamp > Date.now()) {
        champs.push({
          nom: `${E('muet')} ${t('journal.muet_titre')}`,
          valeur: t('journal.muet_jusqua', { date: `<t:${Math.floor(apres.communicationDisabledUntilTimestamp / 1000)}:f>`, duree: duree(apres.communicationDisabledUntilTimestamp - Date.now()) }),
        });
      } else {
        champs.push({ nom: `${E('vocal')} ${t('journal.muet_retire_titre')}`, valeur: t('journal.muet_retire') });
      }
    } else if (avant.nickname !== apres.nickname && !ajoutes.size && !retires.size) {
      typeAudit = AuditLogEvent.MemberUpdate;
    }

    if (champs.length === 0) return;
    const par = await journal.executeur(apres.guild, typeAudit, apres.id);

    await journal.fiche(apres.guild, 'membres', {
      titre: `${E('role')} ${t('journal.maj_titre')}`,
      couleur: conf.couleurs.info,
      vignette: apres.user.displayAvatarURL({ size: 128 }),
      texte: `${apres} \`${apres.id}\``,
      champs: [...champs, par && par.user.id !== apres.id ? { nom: t('journal.par'), valeur: `${par.user}`, court: true } : null],
    });
  },
};
