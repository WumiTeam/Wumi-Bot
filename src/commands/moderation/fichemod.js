/**
 * Clic droit sur un membre > Applications > « Fiche modération ».
 *
 * Tout ce qu'un moderateur veut savoir AVANT d'agir, en un clic et sans
 * taper de commande : anciennete du compte, arrivee sur le serveur,
 * sanctions (et avertissements actifs), notes du staff, mute en cours.
 * Reponse privee : la fiche ne s'affiche qu'au moderateur.
 */
const {
  ContextMenuCommandBuilder,
  ApplicationCommandType,
  PermissionFlagsBits,
  InteractionContextType,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');
const conf = require('../../../config');
const { req } = require('../../database/db');
const C = require('../../utils/composants');
const { libelles } = require('../../utils/sanctions');
const { E } = require('../../utils/emojis');
const { traducteur, t: tr } = require('../../utils/langues');

const quand = (ms, style = 'R') => `<t:${Math.floor(ms / 1000)}:${style}>`;

module.exports = {
  categorie: 'moderation',

  data: new ContextMenuCommandBuilder()
    .setName('Moderation card')
    .setNameLocalizations({ fr: tr('fichemod.nom', 'fr') })
    .setType(ApplicationCommandType.User)
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .setContexts(InteractionContextType.Guild),

  async execute(interaction) {
    const { t, existe } = traducteur(interaction);
    const user = interaction.targetUser;
    const membre = interaction.targetMember
      ? await interaction.guild.members.fetch(user.id).catch(() => null)
      : null;
    const guildId = interaction.guild.id;

    const sanctions = req.sanctionsDe.all(guildId, user.id);
    const actifs = sanctions.filter((s) => s.type === 'warn' && s.actif).length;
    const compte = sanctions.reduce((acc, s) => ({ ...acc, [s.type]: (acc[s.type] ?? 0) + 1 }), {});
    const nom = (type) => (existe(`sanctions.type.${type}`) ? t(`sanctions.type.${type}`) : (libelles[type]?.nom ?? type));

    let notes = [];
    try {
      notes = require('./note').requetes.de.all(guildId, user.id);
    } catch {
      notes = [];
    }

    const ageCompte = Date.now() - user.createdTimestamp;
    const recent = ageCompte < 7 * 86_400_000;
    const mute = membre?.communicationDisabledUntilTimestamp > Date.now() ? membre.communicationDisabledUntilTimestamp : null;
    const ban = membre ? null : await interaction.guild.bans.fetch(user.id).catch(() => null);

    // Un petit indice de risque, juste pour attirer l'oeil : pas un verdict.
    let risque = 0;
    if (recent) risque += 2;
    risque += Math.min(3, actifs);
    if ((compte.ban ?? 0) + (compte.kick ?? 0) + (compte.softban ?? 0) > 0) risque += 2;
    if (!user.avatar) risque += 1;
    const niveau = risque >= 5 ? '🔴' : risque >= 3 ? '🟠' : '🟢';

    const identite = [
      `## ${E('loupe')} ${t('fichemod.titre', { membre: user.username })}`,
      `<@${user.id}> · \`${user.id}\`${user.bot ? ' · 🤖' : ''}`,
      `**${t('fichemod.compte')}** · ${quand(user.createdTimestamp, 'D')} (${quand(user.createdTimestamp)})${recent ? ` ⚠️ ${t('fichemod.recent')}` : ''}`,
      membre?.joinedTimestamp ? `**${t('fichemod.arrive')}** · ${quand(membre.joinedTimestamp, 'D')} (${quand(membre.joinedTimestamp)})` : `**${t('fichemod.statut')}** · ${ban ? `⛔ ${t('fichemod.banni')}` : t('fichemod.absent')}`,
      mute ? `**${t('fichemod.mute')}** · ${t('fichemod.mute_fin', { fin: quand(mute) })}` : null,
      `**${t('fichemod.risque')}** · ${niveau}`,
    ].filter(Boolean).join('\n');

    const resume = sanctions.length
      ? Object.entries(compte).map(([type, n]) => `${libelles[type]?.emoji ?? E('epingle')} ${nom(type)} · **${n}**`).join('\n')
        + `\n${t('fichemod.avertissements_actifs', { n: actifs })}`
      : t('fichemod.aucune_sanction');

    const dernieres = sanctions.slice(0, 3)
      .map((s) => `\`#${s.id}\` ${libelles[s.type]?.emoji ?? ''} ${nom(s.type)} · ${quand(s.date)} — ${(s.raison ?? '').slice(0, 80)}`)
      .join('\n');

    const blocNotes = notes.length
      ? notes.slice(0, 3).map((n) => `\`#${n.id}\` <@${n.auteur_id}> · ${quand(n.date)}\n> ${n.texte.slice(0, 150)}`).join('\n')
      : t('fichemod.aucune_note');

    const roles = membre
      ? membre.roles.cache.filter((r) => r.id !== guildId).sort((a, b) => b.position - a.position).map((r) => `${r}`).slice(0, 12).join(' ')
      : null;

    return interaction.reply(C.envoiPrive([C.conteneur([
      C.sectionVignette(identite, user.displayAvatarURL({ size: 256 })),
      C.separateur(),
      C.texte(`### ${t('fichemod.sanctions')}\n${resume}${dernieres ? `\n\n${dernieres}` : ''}`),
      C.separateur(),
      C.texte(`### ${t('fichemod.notes', { n: notes.length })}\n${blocNotes}`),
      roles ? C.separateur() : null,
      roles ? C.texte(`### ${t('fichemod.roles')}\n${roles}`) : null,
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`sanc_p:${user.id}:1:-`).setStyle(ButtonStyle.Secondary).setEmoji('📜').setLabel(t('fichemod.voir_historique'))
      ),
    ], risque >= 5 ? conf.couleurs.erreur : risque >= 3 ? conf.couleurs.avertissement : conf.couleurs.info)], {
      allowedMentions: { parse: [] },
    }));
  },
};
