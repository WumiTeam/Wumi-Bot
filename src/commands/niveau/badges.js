const { SlashCommandBuilder, InteractionContextType } = require('discord.js');
const conf = require('../../../config');
const { req, config } = require('../../database/db');
const progression = require('../../utils/progression');
const { infosNiveau } = require('../../utils/niveaux');
const { ts } = require('../../utils/outils');
const { E } = require('../../utils/emojis');
const C = require('../../utils/composants');
const { traducteur, localisations, t: tr, DEFAUT } = require('../../utils/langues');

const JOUR = 86_400_000;

/** Valeur actuelle d'un membre pour un type de badge, et son unite. */
function avancement(guildId, userId, membre, type) {
  const ligne = req.getXp.get(guildId, userId);
  switch (type) {
    case 'messages':
      return { valeur: ligne?.messages ?? 0, unite: 'messages' };
    case 'vocal':
      return { valeur: Math.floor((ligne?.secondes_vocal ?? 0) / 60), unite: 'minutes de vocal' };
    case 'niveau':
      return { valeur: infosNiveau(ligne?.xp ?? 0).niveau, unite: 'niveau' };
    case 'prestige':
      return { valeur: ligne?.prestige ?? 0, unite: 'étoiles' };
    case 'invitations':
      try {
        return { valeur: require('../../utils/invitations').totalDe(guildId, userId).total, unite: 'invitations' };
      } catch {
        return { valeur: 0, unite: 'invitations' };
      }
    case 'anciennete':
      return {
        valeur: membre?.joinedTimestamp ? Math.floor((Date.now() - membre.joinedTimestamp) / JOUR) : 0,
        unite: 'jours sur le serveur',
      };
    default:
      return { valeur: 0, unite: '' };
  }
}

module.exports = {
  categorie: 'niveau',

  data: new SlashCommandBuilder()
    .setName('badges')
    .setDescription(tr('badges.description_commande', DEFAUT))
    .setDescriptionLocalizations(localisations('badges.description_commande'))
    .addUserOption((o) => o
      .setName('member')
      .setNameLocalizations({ fr: 'membre' })
      .setDescription(tr('badges.opt_membre', DEFAUT))
      .setDescriptionLocalizations(localisations('badges.opt_membre')))
    .setContexts(InteractionContextType.Guild),

  async execute(interaction) {
    const { t, nombre } = traducteur(interaction);
    const guildId = interaction.guild.id;
    if (!config(guildId).badges_actif) {
      return interaction.reply(C.avertissement(t('badges.desactives')));
    }

    const cible = interaction.options.getUser('member') ?? interaction.user;
    const membre = await interaction.guild.members.fetch(cible.id).catch(() => null);

    // On revalide au passage : un membre qui n'a pas parle depuis la mise a
    // jour recupere quand meme ses badges en consultant la commande.
    if (cible.id === interaction.user.id) progression.verifierBadges(guildId, cible.id, membre);

    const obtenus = progression.badgesDe(guildId, cible.id);
    const cles = new Set(obtenus.map((b) => b.cle));
    const totalBadges = progression.listeBadges().length;
    const restants = progression.listeBadges().filter((b) => !cles.has(b.cle));

    // b.nom / b.description / b.emoji viennent de config.js (progression.badges) :
    // ce sont des donnees, pas de l'interface. On ne les traduit pas, comme les
    // pseudos ou les raisons de sanction (voir la spec, section "Ce qu'on NE
    // traduit PAS").
    const texteObtenus = obtenus.length
      ? obtenus.map((b) => `${b.emoji} **${b.nom}** — ${b.description}\n*${t('badges.obtenu', { quand: ts(b.obtenu_le, 'R') })}*`).join('\n')
      : t('badges.aucun');

    const elements = [
      C.texte(`## ${E('badge')} ${t('badges.titre', { pseudo: membre?.displayName ?? cible.username })}`),
      C.texte(`### ${E('badge')} ${t('badges.section_debloques', { n: nombre(obtenus.length) })}`),
      C.texte(texteObtenus),
    ];

    if (restants.length) {
      const lignes = restants.slice(0, 10).map((b) => {
        const a = avancement(guildId, cible.id, membre, b.type);
        const part = Math.min(100, Math.round((a.valeur / b.seuil) * 100));
        return `${b.emoji} **${b.nom}** — ${b.description}\n\`${nombre(a.valeur)} / ${nombre(b.seuil)}\` (${part} %)`;
      });
      elements.push(
        C.separateur(),
        C.texte(`### ${E('verrou')} ${t('badges.section_a_debloquer', { n: nombre(restants.length) })}`),
        C.texte(lignes.join('\n'))
      );
    }

    elements.push(C.texte(`-# ${t('badges.pied', { n: nombre(obtenus.length), total: nombre(totalBadges) })}`));

    return interaction.reply(C.envoi([C.conteneur(elements, conf.couleurs.principale)]));
  },
};
