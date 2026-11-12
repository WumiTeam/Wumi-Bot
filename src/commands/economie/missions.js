const {
  SlashCommandBuilder,
  ButtonBuilder,
  ButtonStyle,
  InteractionContextType,
  MessageFlags,
} = require('discord.js');
const conf = require('../../../config');
const { config } = require('../../database/db');
const missions = require('../../utils/missions');
const eco = require('../../utils/economie');
const { E } = require('../../utils/emojis');
const C = require('../../utils/composants');
const { traducteur, localisations, t: tr, DEFAUT } = require('../../utils/langues');

const PLEIN = '█';
const VIDE = '░';

/** Petite barre de progression en caracteres. */
function barre(valeur, but, largeur = 10) {
  const part = but > 0 ? Math.min(1, valeur / but) : 0;
  const remplis = Math.round(part * largeur);
  return PLEIN.repeat(remplis) + VIDE.repeat(largeur - remplis);
}

/**
 * Moment ou la periode change, en timestamp Discord.
 * On avance heure par heure jusqu'a ce que l'identifiant de periode change :
 * c'est exact quelle que soit l'heure de la machine et gere le changement d'heure.
 */
function finDe(nomPeriode) {
  const calcul = nomPeriode === 'semaine' ? missions.semaine : missions.jour;
  const courant = calcul();
  const pas = 3_600_000;
  const maxi = nomPeriode === 'semaine' ? 24 * 8 : 26;
  let t = Date.now();
  for (let i = 0; i < maxi; i++) {
    t += pas;
    if (calcul(new Date(t)) !== courant) break;
  }
  return `<t:${Math.floor(t / 1000)}:R>`;
}

/**
 * Construit l'affichage complet des missions d'un membre, en Components V2.
 *
 * `traducteur` accepte un identifiant de serveur directement : cette fonction
 * n'a pas besoin de toute l'interaction, seulement de `guildId` pour savoir
 * dans quelle langue ecrire.
 */
function affichage(guildId, userId, m) {
  const { t, nombre } = traducteur(guildId);
  const etat = missions.etat(guildId, userId);
  let aReclamer = false;

  const elements = [
    C.texte(`## ${E('mission')} ${t('missions.titre')}`),
  ];

  for (const p of etat) {
    if (!p.missions.length) continue;

    elements.push(C.separateur());
    elements.push(C.texte(`**${t(`missions.periode_${p.nom}`)}** · ${t('missions.renouvelle', { quand: finDe(p.nom) })}`));

    const lignes = p.missions.map((mi) => {
      const icone = mi.reclamee ? E('piece') : mi.accomplie ? E('succes') : '▫️';
      if (!mi.reclamee && mi.accomplie) aReclamer = true;
      return (
        `${icone} **${mi.nom}** — ${mi.description}\n`
        + `\`${barre(mi.valeur, mi.but)}\` ${nombre(mi.valeur)}/${nombre(mi.but)} · `
        + t('missions.recompense', { xp: nombre(mi.xp), monnaie: `${m.emoji} ${nombre(mi.monnaie)}` })
      );
    });

    const recompenseBonus = p.nom === 'jour' ? conf.missions.bonusJournee : conf.missions.bonusSemaine;
    if (recompenseBonus) {
      const etatBonus = p.bonusPris
        ? `${E('piece')} ${t('missions.bonus_encaisse')}`
        : p.toutesAccomplies ? `${E('succes')} ${t('missions.bonus_a_reclamer')}` : `▫️ ${t('missions.bonus_tout')}`;
      if (p.toutesAccomplies && !p.bonusPris) aReclamer = true;
      lignes.push(
        `${E('cadeau')} **${t('missions.bonus')}** — ${etatBonus}\n`
        + `-# ${t('missions.recompense', { xp: nombre(recompenseBonus.xp), monnaie: `${m.emoji} ${nombre(recompenseBonus.monnaie)}` })}`
      );
    }

    elements.push(C.texte(lignes.join('\n\n')));
  }

  elements.push(C.separateur());
  elements.push(
    C.sectionBouton(
      `-# ${t('missions.solde', { n: nombre(eco.solde(guildId, userId)), monnaie: m.nom })}`,
      new ButtonBuilder()
        .setCustomId('mis_reclamer')
        .setLabel(aReclamer ? t('missions.bouton_reclamer') : t('missions.bouton_rien'))
        .setEmoji(E('cadeau'))
        .setStyle(aReclamer ? ButtonStyle.Success : ButtonStyle.Secondary)
        .setDisabled(!aReclamer)
    )
  );

  return C.envoi([C.conteneur(elements)]);
}

/** Bouton "Reclamer mes recompenses". */
async function gererInteraction(interaction) {
  if (!interaction.isButton() || interaction.customId !== 'mis_reclamer') return;

  const { t, nombre } = traducteur(interaction);
  const guildId = interaction.guild.id;
  const userId = interaction.user.id;
  const resultat = missions.reclamer(guildId, userId);
  const m = eco.monnaie(guildId);

  if (resultat.rien) {
    return interaction.reply(C.infoPrivee(t('missions.rien')));
  }

  // Un gain d'XP peut faire monter de niveau : on applique les roles de recompense.
  if (resultat.niveau && interaction.member) {
    await require('../../utils/niveaux')
      .appliquerRecompenses(interaction.member, resultat.niveau)
      .catch(() => []);
  }

  const detail = [
    t('missions.encaisse', { xp: nombre(resultat.xp), somme: eco.somme(guildId, resultat.monnaie) }),
    resultat.noms.length ? t('missions.liste_missions', { liste: resultat.noms.map((n) => `**${n}**`).join(', ') }) : null,
    resultat.bonus.includes('jour') ? `${E('cadeau')} ${t('missions.bonus_jour')}` : null,
    resultat.bonus.includes('semaine') ? `${E('cadeau')} ${t('missions.bonus_semaine')}` : null,
    resultat.niveau ? `${E('niveaux')} ${t('missions.niveau', { n: nombre(resultat.niveau) })}` : null,
  ]
    .filter(Boolean)
    .join('\n');

  // On met a jour le message d'origine pour que les compteurs suivent.
  await interaction.update(affichage(guildId, userId, m)).catch(() => null);
  return interaction.followUp(C.succesPrive(detail)).catch(() => null);
}

module.exports = {
  categorie: 'economie',

  data: new SlashCommandBuilder()
    .setName('missions')
    .setDescription(tr('missions.description_commande', DEFAUT))
    .setDescriptionLocalizations(localisations('missions.description_commande'))
    .setContexts(InteractionContextType.Guild),

  gererInteraction,

  async execute(interaction) {
    const { t } = traducteur(interaction);
    const guildId = interaction.guild.id;

    if (!conf.missions?.actif || !config(guildId).missions_actif) {
      return interaction.reply(C.avertissementPrivee(t('missions.desactivees')));
    }

    // Ephemere : chaque membre voit ses propres compteurs, et le bouton
    // n'est cliquable que par celui qui a lance la commande.
    //
    // BUG CORRIGE AU PASSAGE : l'ancien code faisait
    // `{ ...affichage(...), flags: MessageFlags.Ephemeral }`, ce qui
    // REMPLACAIT entierement les drapeaux au lieu de les combiner — le
    // drapeau IsComponentsV2 pose par `affichage()` disparaissait, alors que
    // les composants envoyes (ContainerBuilder…) l'exigent. On combine les
    // deux drapeaux au lieu de les ecraser.
    const vue = affichage(guildId, interaction.user.id, eco.monnaie(guildId));
    return interaction.reply({ ...vue, flags: (vue.flags ?? 0) | MessageFlags.Ephemeral });
  },
};
