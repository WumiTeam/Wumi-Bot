/**
 * /voter — voter pour le bot sur top.gg, et reclamer sa recompense.
 *
 * Le vote se renouvelle toutes les douze heures. Le bot ne recoit aucune
 * notification (voir src/utils/topgg.js pour le pourquoi) : c'est le membre
 * qui clique sur « J'ai vote », et le bot demande alors a top.gg.
 *
 * UNE RECOMPENSE PAR VOTE, PAS PAR SERVEUR. Un vote vaut pour le bot entier,
 * pas pour un serveur : quelqu'un present sur dix serveurs ne doit pas
 * encaisser dix fois. Le suivi est donc global (table `votes`), et la
 * recompense tombe sur le serveur ou la personne reclame.
 */
const {
  SlashCommandBuilder,
  InteractionContextType,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
} = require('discord.js');
const conf = require('../../../config');
const { config, req } = require('../../database/db');
const C = require('../../utils/composants');
const { E } = require('../../utils/emojis');
const topgg = require('../../utils/topgg');
const { banniere } = require('../../utils/bannieres');
const { traducteur, localisations, t: tr, DEFAUT } = require('../../utils/langues');
const logger = require('../../utils/logger');

const DOUZE_HEURES = 12 * 3_600_000;

/** Le temps restant avant de pouvoir revoter, ou 0. */
function attenteRestante(userId) {
  const ligne = req.lireVote.get(String(userId));
  if (!ligne) return 0;
  const passe = Date.now() - ligne.dernier_vote;
  return passe >= DOUZE_HEURES ? 0 : DOUZE_HEURES - passe;
}

/** Une petite jauge texte : ▰▰▰▱▱▱▱▱▱▱ */
function jauge(fraction, cases = 12) {
  const pleines = Math.round(Math.max(0, Math.min(1, fraction)) * cases);
  return '▰'.repeat(pleines) + '▱'.repeat(cases - pleines);
}

/** L'ecran de la commande, en Components V2 : banniere, raisons, statut, boutons. */
function vueVote(interaction, client) {
  const { t, duree, langue, nombre } = traducteur(interaction);
  const cfg = config(interaction.guild.id);
  const reste = attenteRestante(interaction.user.id);
  const ligne = req.lireVote.get(String(interaction.user.id));
  const communaute = req.totalVotes.get();
  const bot = client.user?.username ?? 'Wumi';
  const b = banniere('vote', langue);
  const recompenseActive = cfg.vote_actif && cfg.vote_recompense === 'xp';

  // Pourquoi voter
  const raisons = [
    `${E('etoile')} ${t('vote.v3.raison_classement')}`,
    `${E('classement')} ${t('vote.v3.raison_decouvrir', { bot })}`,
    recompenseActive
      ? `${E('cadeau')} ${t('vote.v3.raison_recompense', { multi: cfg.vote_multi, heures: cfg.vote_heures })}`
      : `${E('cadeau')} ${t('vote.v3.raison_merci')}`,
  ];

  // Ton statut
  const statut = [];
  if (reste > 0) {
    statut.push(`${E('sablier')} ${t('vote.v3.attente', { quand: `<t:${Math.floor((Date.now() + reste) / 1000)}:R>` })}`);
    statut.push(`\`${jauge(1 - reste / DOUZE_HEURES)}\` ${Math.floor((1 - reste / DOUZE_HEURES) * 100)} %`);
  } else {
    statut.push(`${E('succes')} ${t('vote.v3.pret')}`);
  }
  if (ligne?.total) {
    const rang = req.rangVote.get(ligne.total)?.rang ?? 1;
    statut.push(`${E('classement')} ${t('vote.v3.tes_votes', { n: ligne.total, rang })}`);
  } else {
    statut.push(`-# ${t('vote.v3.premier_vote')}`);
  }

  const boutons = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setLabel(t('vote.v2.bouton_voter')).setEmoji('⭐').setStyle(ButtonStyle.Link).setURL(topgg.lienVote(client) ?? 'https://top.gg')
  );
  if (reste <= 0) {
    boutons.addComponents(new ButtonBuilder()
      .setCustomId(`vote_verif_${interaction.user.id}`)
      .setLabel(t('vote.v2.bouton_reclamer'))
      .setStyle(ButtonStyle.Success)
      .setEmoji(E('succes')));
  }

  const conteneur = C.conteneur([
    b ? C.image(b.url, t('vote.v2.titre', { bot })) : null,
    C.texte(`# ${E('etoile')} ${t('vote.v2.titre', { bot })}\n${t('vote.v3.intro')}`),
    C.separateur(),
    C.texte(`### ${t('vote.v3.pourquoi')}\n${raisons.join('\n')}`),
    C.separateur(),
    C.texte(`### ${t('vote.v3.statut')}\n${statut.join('\n')}`),
    boutons,
    C.texte(`-# ${t('vote.v3.pied', { total: nombre(communaute?.total ?? 0), membres: nombre(communaute?.membres ?? 0) })}`),
  ], conf.couleurs.principale);

  return C.envoiPrive([conteneur], { files: b ? [b.fichier()] : [] });
}

/** L'ecran de remerciement, une fois le vote verifie. */
function vueMerci(interaction, message) {
  const { t, langue } = traducteur(interaction);
  const b = banniere('vote', langue);
  const prochain = Math.floor((Date.now() + DOUZE_HEURES) / 1000);
  const total = req.lireVote.get(String(interaction.user.id))?.total ?? 1;
  return C.envoiPrive([C.conteneur([
    b ? C.image(b.url) : null,
    C.texte(`# ${E('succes')} ${t('vote.v3.merci_titre')}\n${message}`),
    C.separateur(),
    C.texte(`${E('classement')} ${t('vote.v3.compteur', { n: total })}\n${E('sablier')} ${t('vote.v3.prochain', { quand: `<t:${prochain}:R>` })}`),
  ], conf.couleurs.succes)], { files: b ? [b.fichier()] : [] });
}

/** Pose la recompense et renvoie ce qu'il faut dire. */
async function recompenser(interaction) {
  const { t } = traducteur(interaction);
  const guildId = interaction.guild.id;
  const cfg = config(guildId);

  req.noterVote.run({ user_id: interaction.user.id, date: Date.now(), guild_id: guildId });
  topgg.oublier(interaction.user.id);

  if (!cfg.vote_actif || cfg.vote_recompense !== 'xp') return t('vote.v2.merci');

  // On se branche sur le systeme d'effets existant : le multiplicateur d'XP
  // sait deja lire un effet `xp_multi`.
  const heures = Math.max(1, Math.min(48, cfg.vote_heures ?? 12));
  const multi = Math.max(1, Math.min(5, cfg.vote_multi ?? 2));
  req.poserEffet.run(guildId, interaction.user.id, 'xp_multi', String(multi), Date.now() + heures * 3_600_000);
  return t('vote.v2.merci_recompense', { multi, heures });
}

module.exports = {
  data: new SlashCommandBuilder()
    // Un anglophone tape « /vote », un francophone « /voter ».
    .setName('vote')
    .setNameLocalizations({ fr: 'voter' })
    .setDescription(tr('vote.description_commande', DEFAUT))
    .setDescriptionLocalizations(localisations('vote.description_commande'))
    .setContexts(InteractionContextType.Guild),

  categorie: 'utilitaires',

  async execute(interaction, client) {
    const { t } = traducteur(interaction);
    if (!topgg.actif()) return interaction.reply(C.infoPrivee(t('vote.v2.pas_inscrit')));
    return interaction.reply(vueVote(interaction, client));
  },

  /** Le bouton « J'ai vote ». Route depuis interactionCreate via « vote_ ». */
  async gererInteraction(interaction, client) {
    const { t, duree } = traducteur(interaction);
    const auteurId = interaction.customId.split('_').pop();
    if (interaction.user.id !== auteurId) return interaction.reply(C.erreurPrivee(t('vote.v2.pas_ton_bouton')));

    // Le deja-reclame se verifie AVANT d'appeler top.gg.
    const reste = attenteRestante(interaction.user.id);
    if (reste > 0) return interaction.update(C.avertissement(t('vote.v2.deja', { duree: duree(reste) })));

    await interaction.deferUpdate();
    const vote = await topgg.aVote(interaction.user.id, client);

    // null, ce n'est pas « non » : c'est top.gg injoignable.
    if (vote === null) return interaction.editReply(C.erreur(t('vote.v2.injoignable')));
    if (!vote) return interaction.editReply(C.avertissement(t('vote.v2.pas_encore')));

    const message = await recompenser(interaction);
    logger.action('Vote top.gg', interaction.user.username, interaction.guild?.name);
    require('../../utils/votesSupport').recompenseReclamee(interaction).catch(() => null);

    // L'annonce publique, si le serveur en a choisi une.
    const cfg = config(interaction.guild.id);
    if (cfg.vote_salon) {
      interaction.guild.channels.cache.get(cfg.vote_salon)
        ?.send(C.envoi([C.conteneur([
          C.texte(`${E('etoile')} ${t('vote.v2.annonce', { membre: `<@${interaction.user.id}>` })}`),
        ], conf.couleurs.succes)]))
        .catch(() => null);
    }

    return interaction.editReply(vueMerci(interaction, message));
  },

  // Exportes pour les tests
  attenteRestante,
  vueVote,
  vueMerci,
  jauge,
};
