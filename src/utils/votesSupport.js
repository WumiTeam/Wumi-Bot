/**
 * Les votes top.gg dans LOG_VOTES.
 *
 * Deux sources :
 *   - le WEBHOOK top.gg (src/public/serveur.js, route /topgg) : top.gg previent
 *     a chaque vote, en direct. Demande une adresse publique en HTTPS.
 *   - la RECLAMATION via /voter : marche sans rien exposer, mais seulement
 *     pour ceux qui reclament leur recompense.
 *
 * Si le webhook est actif, la reclamation est notee plus discretement pour
 * ne pas compter deux fois le meme vote dans le salon.
 */
const conf = require('../../config');
const journal = require('./journalSupport');
const { req } = require('../database/db');

/** Nombre de votes que le bot connait pour cette personne. */
function compteVotes(userId) {
  try {
    return req.lireVote.get(String(userId))?.total ?? null;
  } catch {
    return null;
  }
}

/** Un vote recu par le webhook top.gg. */
async function voteRecu(client, { user, type, isWeekend }) {
  const membre = await client.users.fetch(String(user)).catch(() => null);
  const test = type === 'test';
  return journal.noter('votes', {
    titre: test ? '🧪 Vote de test (top.gg)' : '⭐ Nouveau vote sur top.gg',
    couleur: test ? conf.couleurs.info : conf.couleurs.succes,
    vignette: membre?.displayAvatarURL() ?? client.user.displayAvatarURL(),
    lignes: [
      `**Votant** · ${membre ? `${membre} · ${membre.username}` : 'inconnu'} (\`${user}\`)`,
      isWeekend ? '🎉 **Week-end** · le vote compte double sur top.gg' : null,
      `**Prochain vote possible** · <t:${Math.floor((Date.now() + 12 * 3_600_000) / 1000)}:R>`,
    ],
    pied: 'Webhook top.gg',
  });
}

/** Quelqu'un a reclame sa recompense avec /voter. */
async function recompenseReclamee(interaction) {
  const webhookActif = Boolean(String(process.env.TOPGG_WEBHOOK_AUTH ?? '').trim());
  const total = compteVotes(interaction.user.id);
  return journal.noter('votes', {
    titre: webhookActif ? '🎁 Récompense de vote réclamée' : '⭐ Vote top.gg',
    couleur: conf.couleurs.succes,
    vignette: interaction.user.displayAvatarURL(),
    lignes: [
      `**Membre** · ${interaction.user} · ${interaction.user.username} (\`${interaction.user.id}\`)`,
      `**Serveur** · ${interaction.guild?.name ?? 'MP'}${interaction.guild ? ` (\`${interaction.guild.id}\`)` : ''}`,
      total !== null ? `**Votes réclamés au total** · ${total}` : null,
    ],
    pied: '/voter',
  });
}

module.exports = { voteRecu, recompenseReclamee };
