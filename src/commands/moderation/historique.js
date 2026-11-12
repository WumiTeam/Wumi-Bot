/**
 * /historique — la fiche complete d'un membre, en une commande.
 *
 * Le bot enregistre des choses sur un membre dans une douzaine de tables :
 * XP, solde, sanctions, tickets, suggestions, invitations, missions. Les
 * consulter demandait cinq commandes differentes, et personne ne les enchaine
 * quand il faut decider vite si un membre merite un avertissement ou un role.
 *
 * Le module qui rassemble tout existait deja (src/utils/historique.js) ; il
 * lui manquait une porte d'entree. La voici.
 *
 * DEUX PARTIS PRIS :
 *
 * 1. LE RESUME EN PREMIER. La fiche s'ouvre sur une phrase qui dit ce qui
 *    merite l'attention — pas sur un mur de compteurs. « Aucun antecedent »
 *    est une reponse aussi utile que « 3 avertissements actifs ».
 *
 * 2. EPHEMERE, ET RESERVEE. On y lit des sanctions et des signalements : ce
 *    n'est pas une fiche qu'on affiche devant le serveur.
 */
const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  InteractionContextType,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  MessageFlags,
} = require('discord.js');
const conf = require('../../../config');
const { E } = require('../../utils/emojis');
const C = require('../../utils/composants');
const { traducteur, localisations, t: tr, DEFAUT } = require('../../utils/langues');
const historique = require('../../utils/historique');
const { ts, tronquer } = require('../../utils/outils');

const SECTIONS = ['resume', 'activite', 'economie', 'moderation', 'communaute'];

const EMOJI_SECTION = {
  resume: 'loupe',
  activite: 'niveaux',
  economie: 'economie',
  moderation: 'moderation',
  communaute: 'suggestions',
};

/** Un compteur lisible : « 3 » ou « — » quand il n'y a rien. */
const n = (valeur) => (valeur ? `**${valeur}**` : '—');

function corpsSection(fiche, section, t, nombre, duree) {
  if (section === 'activite') {
    const a = fiche.activite;
    return [
      `${t('historique.niveau')} : **${a.niveau}**${a.prestige ? ` · ${t('historique.prestige')} ${a.prestige}` : ''}`,
      `${t('historique.xp')} : **${nombre(a.xp)}**${a.rang ? ` · ${t('historique.rang')} #${a.rang}/${a.totalClasses}` : ''}`,
      `${t('historique.messages')} : ${n(nombre(a.messages))} · ${t('historique.vocal')} : ${n(duree(a.secondesVocal * 1000))}`,
      a.plage ? `${t('historique.plage')} : **${a.plage}**` : null,
      a.salons?.length ? `${t('historique.salons')} : ${a.salons.map((s) => `<#${s.salon_id}>`).join(' ')}` : null,
      a.badges?.length ? `${t('historique.badges')} : ${a.badges.length}` : null,
    ].filter(Boolean).join('\n');
  }

  if (section === 'economie') {
    const e = fiche.economie;
    if (!e.actif) return t('historique.eco_inactive');
    return [
      `${t('historique.solde')} : **${nombre(e.solde)}** ${e.monnaie.nom}${e.rang ? ` · #${e.rang}` : ''}`,
      `${t('historique.banque')} : ${n(nombre(e.banque))}`,
      e.inventaire?.length ? `${t('historique.objets')} : ${e.inventaire.map((o) => `${o.nom} ×${o.quantite}`).join(', ')}` : null,
      e.effets?.length ? `${t('historique.effets')} : ${e.effets.length}` : null,
      e.achats?.length
        ? `${t('historique.achats')} :\n${e.achats.slice(0, 5).map((a) => `· ${tronquer(a.nom ?? '?', 40)} — ${nombre(a.prix)} (${ts(a.date, 'R')})`).join('\n')}`
        : `${t('historique.achats')} : —`,
    ].filter(Boolean).join('\n');
  }

  if (section === 'moderation') {
    const m = fiche.moderation;
    const types = Object.entries(m.compte).map(([type, combien]) => `${type} ×${combien}`).join(' · ');
    return [
      `${t('historique.sanctions')} : ${n(m.total)}${types ? ` (${types})` : ''}`,
      `${t('historique.avertissements_actifs')} : ${n(m.avertissementsActifs)}`,
      `${t('historique.signalements_recus')} : ${n(m.signalementsRecus)} · ${t('historique.signalements_emis')} : ${n(m.signalementsEmis)}`,
      m.sanctionsPrononcees ? `${t('historique.prononcees')} : **${m.sanctionsPrononcees}**` : null,
      m.sanctions?.length
        ? `${t('historique.dernieres')} :\n${m.sanctions.slice(0, 5).map((s) => `· **${s.type}** — ${tronquer(s.raison ?? '—', 50)} (${ts(s.date, 'R')})`).join('\n')}`
        : null,
      m.appels?.length ? `${t('historique.appels')} : ${m.appels.length}` : null,
    ].filter(Boolean).join('\n');
  }

  // Communaute
  const c = fiche.communaute;
  return [
    `${t('historique.invitations')} : ${n(c.invitations.total)}`,
    `${t('historique.tickets')} : ${n(c.ticketsTotal)} · ${t('historique.suggestions')} : ${n(c.suggestionsTotal)}`,
    c.candidatures?.length ? `${t('historique.candidatures')} : ${c.candidatures.length}` : null,
    c.arrivee?.invite_par ? `${t('historique.invite_par')} : <@${c.arrivee.invite_par}>` : null,
    c.ticketsRecents?.length
      ? `${t('historique.tickets_recents')} :\n${c.ticketsRecents.slice(0, 5).map((x) => `· #${x.numero} ${tronquer(x.sujet ?? '—', 40)} (${x.statut})`).join('\n')}`
      : null,
  ].filter(Boolean).join('\n');
}

/** La fiche complete. */
function vueFiche(interaction, cible, membre, section = 'resume') {
  const { t, nombre, duree } = traducteur(interaction);
  const fiche = historique.rassembler(interaction.guild.id, cible.id, membre);

  const elements = [
    C.texte(`## ${E('loupe')} ${t('historique.titre', { pseudo: membre?.displayName ?? cible.username })}`),
    C.texte(`<@${cible.id}> · \`${cible.id}\``),
    C.texte(`-# ${historique.resume(fiche)}`),
    C.separateur(),
  ];

  if (section === 'resume') {
    const a = fiche.activite;
    const m = fiche.moderation;
    const c = fiche.communaute;
    elements.push(C.texte([
      `${E('niveaux')} ${t('historique.niveau')} **${a.niveau}** · ${nombre(a.messages)} ${t('historique.messages').toLowerCase()}`,
      fiche.economie.actif ? `${E('economie')} **${nombre(fiche.economie.solde)}** ${fiche.economie.monnaie.nom}` : null,
      `${E('moderation')} ${n(m.total)} ${t('historique.sanctions').toLowerCase()} · ${n(m.avertissementsActifs)} ${t('historique.actifs')}`,
      `${E('suggestions')} ${n(c.ticketsTotal)} ${t('historique.tickets').toLowerCase()} · ${n(c.invitations.total)} ${t('historique.invitations').toLowerCase()}`,
      fiche.identite.arriveLe ? `${E('porte')} ${t('historique.arrive')} ${ts(fiche.identite.arriveLe, 'R')}` : null,
      fiche.identite.compteCreeLe ? `${E('sablier')} ${t('historique.compte_cree')} ${ts(fiche.identite.compteCreeLe, 'R')}` : null,
    ].filter(Boolean).join('\n')));
  } else {
    elements.push(C.texte(corpsSection(fiche, section, t, nombre, duree)));
  }

  // Une rangee de boutons pour changer de section. Le bouton de la section
  // affichee est desactive : c'est la facon la plus simple de dire « tu es
  // ici » sans ajouter une ligne de texte.
  const rangee = new ActionRowBuilder().addComponents(
    ...SECTIONS.map((s) =>
      new ButtonBuilder()
        .setCustomId(`hist_${s}_${cible.id}`)
        .setLabel(t(`historique.section.${s}`))
        .setEmoji(E(EMOJI_SECTION[s]))
        .setStyle(s === section ? ButtonStyle.Primary : ButtonStyle.Secondary)
        .setDisabled(s === section))
  );
  elements.push(rangee);

  return C.envoi([C.conteneur(elements, conf.couleurs.principale)], { flags: MessageFlags.Ephemeral });
}

module.exports = {
  categorie: 'moderation',

  data: new SlashCommandBuilder()
    .setName('historique')
    .setNameLocalizations({ 'en-US': 'history' })
    .setDescription(tr('historique.description_commande', DEFAUT))
    .setDescriptionLocalizations(localisations('historique.description_commande'))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .setContexts(InteractionContextType.Guild)
    .addUserOption((o) =>
      o
        .setName('membre')
        .setNameLocalizations({ 'en-US': 'member' })
        .setDescription(tr('historique.option_membre', DEFAUT))
        .setDescriptionLocalizations(localisations('historique.option_membre'))
        .setRequired(true)),

  async execute(interaction) {
    const cible = interaction.options.getUser('membre');
    const membre = await interaction.guild.members.fetch(cible.id).catch(() => null);
    return interaction.reply(vueFiche(interaction, cible, membre));
  },

  /** Les boutons de section. */
  async gererInteraction(interaction) {
    const { t } = traducteur(interaction);
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ModerateMembers)) {
      return interaction.reply({ content: t('erreur.permission'), flags: MessageFlags.Ephemeral });
    }

    // hist_<section>_<userId>
    const reste = interaction.customId.slice(5);
    const coupe = reste.lastIndexOf('_');
    const section = reste.slice(0, coupe);
    const userId = reste.slice(coupe + 1);
    if (!SECTIONS.includes(section)) return null;

    const cible = await interaction.client.users.fetch(userId).catch(() => null);
    if (!cible) return interaction.reply({ content: t('erreur.generique'), flags: MessageFlags.Ephemeral });
    const membre = await interaction.guild.members.fetch(userId).catch(() => null);

    return interaction.update(vueFiche(interaction, cible, membre, section));
  },

  // Exportes pour les tests
  vueFiche,
  SECTIONS,
};
