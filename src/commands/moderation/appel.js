/**
 * /appeal — contester une sanction, et cote equipe, voir ce qui attend.
 *
 * LE GROS DU SYSTEME N'EST PAS ICI. Le formulaire, la fiche envoyee a
 * l'equipe et la decision vivent dans src/utils/appels.js ; les composants
 * « app_* » y sont routes directement par src/events/interactionCreate.js.
 * Cette commande n'est qu'une porte d'entree, et ne definit donc AUCUN
 * customId.
 */
const {
  SlashCommandBuilder,
  InteractionContextType,
  PermissionsBitField,
} = require('discord.js');
const conf = require('../../../config');
const { req } = require('../../database/db');
const appels = require('../../utils/appels');
const { libelles } = require('../../utils/sanctions');
const C = require('../../utils/composants');
const { ts, tronquer } = require('../../utils/outils');
const { E } = require('../../utils/emojis');
const { traducteur, localisations, t: tr, DEFAUT } = require('../../utils/langues');

// Au-dela, la liste devient illisible et frole les 4000 caracteres d'un bloc.
const MAX_LIGNES = 15;

/**
 * LES REFUS DE `verifierRecevabilite` SONT ENCORE DU FRANCAIS EN DUR.
 *
 * src/utils/appels.js ne m'appartient pas et sert aussi aux boutons de
 * contestation : on ne le touche pas. On retraduit donc ses phrases ICI, ou
 * l'on connait la langue du serveur — sinon un serveur anglais recevrait du
 * francais au milieu d'une commande par ailleurs traduite.
 *
 * Le jour ou cet utilitaire rendra une CLE (comme `peutSanctionner` le fait
 * deja), le premier test ci-dessous la reconnait et la table devient inutile
 * sans que rien ne casse. Et une phrase inconnue est rendue telle quelle :
 * du francais vaut mieux qu'un message vide.
 */
const REFUS = [
  [/^Cette sanction n'existe plus\.$/, 'appel.refus.inexistante'],
  [/^Cette sanction ne te concerne pas\.$/, 'appel.refus.pas_la_tienne'],
  [/^Ce type de sanction ne se conteste pas\.$/, 'appel.refus.non_contestable'],
  [/^Les appels ne sont pas ouverts sur ce serveur\.$/, 'appel.refus.ferme'],
  [/^Tu as deja un appel en attente pour cette sanction\.$/, 'appel.refus.en_attente'],
  [/^Cette sanction a deja ete examinee en appel\.$/, 'appel.refus.deja_examinee'],
  [
    /^Le delai pour contester est depasse \((\d+) jours?\)\.$/,
    'appel.refus.delai',
    (m, t) => ({ duree: t('commun.duree.jour', { n: Number(m[1]) }) }),
  ],
];

/** Rend la phrase de refus dans la langue du serveur. */
function traduireRefus(t, message) {
  if (/^[a-z_]+(\.[a-z_]+)+$/.test(message)) return t(message); // c'est deja une cle
  for (const [motif, cle, variables] of REFUS) {
    const trouve = motif.exec(message);
    if (trouve) return t(cle, variables ? variables(trouve, t) : {});
  }
  return message;
}

module.exports = {
  categorie: 'moderation',

  data: new SlashCommandBuilder()
    .setName('appeal')
    .setNameLocalizations({ fr: 'appel' })
    .setDescription(tr('appel.description_commande', DEFAUT))
    .setDescriptionLocalizations(localisations('appel.description_commande'))
    .setContexts(InteractionContextType.Guild)

    .addSubcommand((s) => s
      .setName('dispute')
      .setNameLocalizations({ fr: 'contester' })
      .setDescription(tr('appel.sous_contester', DEFAUT))
      .setDescriptionLocalizations(localisations('appel.sous_contester'))
      .addIntegerOption((o) => o
        .setName('case')
        .setNameLocalizations({ fr: 'numero' })
        .setDescription(tr('appel.opt_numero', DEFAUT))
        .setDescriptionLocalizations(localisations('appel.opt_numero'))
        .setRequired(true)
        .setMinValue(1)))

    .addSubcommand((s) => s
      .setName('list')
      .setNameLocalizations({ fr: 'liste' })
      .setDescription(tr('appel.sous_liste', DEFAUT))
      .setDescriptionLocalizations(localisations('appel.sous_liste'))),

  async execute(interaction) {
    const { t, existe } = traducteur(interaction);
    const sous = interaction.options.getSubcommand();
    const guildId = interaction.guild.id;

    // ------------------------------------------------------------ LISTE
    if (sous === 'list') {
      if (!interaction.memberPermissions.has(PermissionsBitField.Flags.ModerateMembers)) {
        return interaction.reply(C.erreurPrivee(t('appel.staff_seulement')));
      }

      const attente = req.appelsEnAttente.all(guildId);
      if (!attente.length) return interaction.reply(C.infoPrivee(t('appel.aucun_attente')));

      const lignes = attente.slice(0, MAX_LIGNES).map((a) => {
        const sanction = req.sanctionParIdGlobal.get(a.sanction_id);
        const type = sanction?.type ?? '?';
        // `libelles` porte encore des noms francais : on ne garde que l'emoji
        // et on prend le nom traduit quand il existe.
        const emoji = libelles[type]?.emoji ?? E('epingle');
        const nom = existe(`appel.type.${type}`) ? t(`appel.type.${type}`) : type;
        return `**#${a.id}** · <@${a.user_id}> · ${emoji} ${nom} #${a.sanction_id} · ${ts(a.date, 'R')}\n> ${tronquer(a.texte || '', 150)}`;
      });

      return interaction.reply(C.envoiPrive([C.conteneur([
        C.texte(`## ${E('courrier')} ${t('appel.titre_liste', { n: attente.length })}`),
        // Le filet de securite : un bloc de texte est plafonne a 4000 signes.
        C.texte(tronquer(lignes.join('\n\n'), C.MAX_TEXTE)),
        C.separateur(),
        C.texte(`-# ${t('appel.pied_liste')}`),
      ], conf.couleurs.info)]));
    }

    // -------------------------------------------------------- CONTESTER
    const numero = interaction.options.getInteger('case');
    const sanction = req.sanctionParIdGlobal.get(numero);

    // On ne dit pas si la sanction existe chez quelqu'un d'autre : le message
    // est le meme dans les deux cas, sinon on donnerait des informations.
    if (!sanction || sanction.guild_id !== guildId) {
      return interaction.reply(C.erreurPrivee(t('appel.sanction_introuvable', { n: numero })));
    }

    const refus = appels.verifierRecevabilite(sanction, interaction.user.id);
    if (refus) return interaction.reply(C.erreurPrivee(traduireRefus(t, refus)));

    return appels.ouvrirFormulaire(interaction, sanction.id);
  },
};
