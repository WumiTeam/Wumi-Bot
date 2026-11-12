/**
 * /blocklist — la liste communautaire des membres signales.
 *
 * `proposer` est ouverte a tout administrateur de serveur : c'est ce qui fait
 * vivre une liste partagee. Rien n'est publie sans l'accord du staff du
 * serveur support (voir src/utils/blocklist.js).
 *
 * `verifier` et `liste` sont ouvertes a tous : une liste que personne ne peut
 * consulter ne sert a rien.
 *
 * `retirer` est reservee au staff du support : une fiche se retire, sinon une
 * erreur serait definitive.
 *
 * LES REFUS DE `blocklist.proposer()` SONT ENCORE DU FRANCAIS EN DUR.
 * src/utils/blocklist.js ne m'appartient pas : on ne le touche pas. On
 * retraduit donc ses phrases ICI, comme le fait deja /appeal avec
 * src/utils/appels.js — meme raisonnement, meme piege evite.
 */
const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  MessageFlags,
  InteractionContextType,
} = require('discord.js');
const conf = require('../../../config');
const { req } = require('../../database/db');
const C = require('../../utils/composants');
const { tronquer, ts } = require('../../utils/outils');
const { E } = require('../../utils/emojis');
const blocklist = require('../../utils/blocklist');
const fondateur = require('../../utils/fondateur');
const { traducteur, localisations, t: tr, DEFAUT } = require('../../utils/langues');

const PAR_PAGE = 10;

/** Les phrases renvoyees par blocklist.proposer() quand ca echoue. */
const REFUS = [
  [/^Le serveur support du bot n'est pas configuré : la blocklist est indisponible\.$/, 'blocklist.refus.sans_support'],
  [/^Le salon d'examen n'est pas configuré sur le serveur support\.$/, 'blocklist.refus.sans_salon_examen'],
  [/^Cette personne a déjà une proposition en attente d'examen\.$/, 'blocklist.refus.deja_en_attente'],
  [/^Cette personne est déjà sur la liste \(fiche #(\d+)\)\.$/, 'blocklist.refus.deja_sur_la_liste', (m) => ({ n: m[1] })],
  [/^On ne se propose pas soi-même\.$/, 'blocklist.refus.soi_meme'],
  [/^Cette personne ne peut pas être proposée\.$/, 'blocklist.refus.intouchable'],
  [/^Les bots ne vont pas sur la blocklist\.$/, 'blocklist.refus.bot'],
  [/^Tu as déjà proposé (\d+) fiches cette heure-ci\. Reviens plus tard\.$/, 'blocklist.refus.trop_souvent', (m) => ({ n: m[1] })],
  [/^La proposition n'a pas pu être transmise au staff\. Réessaie plus tard\.$/, 'blocklist.refus.non_transmise'],
];

/** Rend la phrase de refus dans la langue du serveur. */
function traduireRefus(t, message) {
  for (const [motif, cle, variables] of REFUS) {
    const trouve = motif.exec(message);
    if (trouve) return t(cle, variables ? variables(trouve) : {});
  }
  return message; // phrase inconnue : mieux vaut du francais qu'un message vide
}

module.exports = {
  categorie: 'moderation',

  data: new SlashCommandBuilder()
    .setName('blocklist')
    .setDescription(tr('blocklist.description_commande', DEFAUT))
    .setDescriptionLocalizations(localisations('blocklist.description_commande'))
    .setContexts(InteractionContextType.Guild)
    .addSubcommand((s) => s
      .setName('check')
      .setNameLocalizations({ fr: 'verifier' })
      .setDescription(tr('blocklist.sous_verifier', DEFAUT))
      .setDescriptionLocalizations(localisations('blocklist.sous_verifier'))
      .addStringOption((o) => o
        .setName('id')
        .setNameLocalizations({ fr: 'identifiant' })
        .setDescription(tr('blocklist.opt_identifiant', DEFAUT))
        .setDescriptionLocalizations(localisations('blocklist.opt_identifiant'))
        .setRequired(true)))
    .addSubcommand((s) => s
      .setName('submit')
      .setNameLocalizations({ fr: 'proposer' })
      .setDescription(tr('blocklist.sous_proposer', DEFAUT))
      .setDescriptionLocalizations(localisations('blocklist.sous_proposer'))
      .addStringOption((o) => o
        .setName('id')
        .setNameLocalizations({ fr: 'identifiant' })
        .setDescription(tr('blocklist.opt_identifiant_proposer', DEFAUT))
        .setDescriptionLocalizations(localisations('blocklist.opt_identifiant_proposer'))
        .setRequired(true))
      .addStringOption((o) => o
        .setName('reason')
        .setNameLocalizations({ fr: 'raison' })
        .setDescription(tr('blocklist.opt_raison', DEFAUT))
        .setDescriptionLocalizations(localisations('blocklist.opt_raison'))
        .setRequired(true)
        .setMaxLength(1000))
      .addStringOption((o) => o
        .setName('proof')
        .setNameLocalizations({ fr: 'preuve' })
        .setDescription(tr('blocklist.opt_preuve', DEFAUT))
        .setDescriptionLocalizations(localisations('blocklist.opt_preuve'))
        .setMaxLength(300)))
    .addSubcommand((s) => s
      .setName('list')
      .setNameLocalizations({ fr: 'liste' })
      .setDescription(tr('blocklist.sous_liste', DEFAUT))
      .setDescriptionLocalizations(localisations('blocklist.sous_liste'))
      .addIntegerOption((o) => o
        .setName('page')
        .setDescription(tr('blocklist.opt_page', DEFAUT))
        .setDescriptionLocalizations(localisations('blocklist.opt_page'))
        .setMinValue(1)))
    .addSubcommand((s) => s
      .setName('remove')
      .setNameLocalizations({ fr: 'retirer' })
      .setDescription(tr('blocklist.sous_retirer', DEFAUT))
      .setDescriptionLocalizations(localisations('blocklist.sous_retirer'))
      .addIntegerOption((o) => o
        .setName('entry')
        .setNameLocalizations({ fr: 'fiche' })
        .setDescription(tr('blocklist.opt_fiche', DEFAUT))
        .setDescriptionLocalizations(localisations('blocklist.opt_fiche'))
        .setRequired(true))),

  async execute(interaction, client) {
    const { t } = traducteur(interaction);
    const sous = interaction.options.getSubcommand();

    // ------------------------------------------------------------ VERIFIER
    if (sous === 'check') {
      const brut = interaction.options.getString('id').trim();
      const id = brut.replace(/[<@!>]/g, '');
      if (!/^\d{17,20}$/.test(id)) {
        return interaction.reply(C.erreurPrivee(t('blocklist.identifiant_invalide')));
      }

      const f = blocklist.fiche(id);
      if (!f) {
        return interaction.reply(C.succesPrive(t('blocklist.pas_fichee', { id })));
      }

      return interaction.reply(C.envoiPrive([C.conteneur([
        C.texte(`## ${E('avertissement')} ${t('blocklist.sur_la_liste')}`),
        C.texte(
          `**${t('blocklist.champ_pseudo')}** · ${f.cible_pseudo ?? t('blocklist.pseudo_inconnu')}\n`
          + `**${t('blocklist.champ_fiche')}** · #${f.id}\n`
          + `**${t('blocklist.champ_publiee')}** · ${ts(f.traite_le ?? f.date, 'R')}`
        ),
        C.separateur(),
        C.texte(tronquer(f.raison, 1000)),
        C.separateur(),
        C.texte(`-# ${t('blocklist.pied_fiche')}`),
      ], conf.couleurs.erreur)]));
    }

    // -------------------------------------------------------------- LISTE
    if (sous === 'list') {
      const total = req.compterBlocklist.get('approuve').n;
      const pages = Math.max(1, Math.ceil(total / PAR_PAGE));
      const page = Math.min(interaction.options.getInteger('page') ?? 1, pages);
      const lignes = req.blocklistApprouvees.all(PAR_PAGE, (page - 1) * PAR_PAGE);

      return interaction.reply(C.envoiPrive([C.conteneur([
        C.texte(`## ${E('drapeau')} ${t('blocklist.liste_titre')} — ${t('blocklist.compteur', { n: total })}`),
        C.texte(
          lignes
            .map((l) => `**#${l.id}** \`${l.cible_id}\` ${l.cible_pseudo ?? ''} — ${tronquer(l.raison, 90)}`)
            .join('\n') || t('blocklist.liste_vide')
        ),
        C.separateur(),
        C.texte(`-# ${t('commun.page', { n: page, total: pages })} · ${t('blocklist.detail_astuce')}`),
      ], conf.couleurs.principale)]));
    }

    // ----------------------------------------------------------- PROPOSER
    if (sous === 'submit') {
      if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
        return interaction.reply(C.erreurPrivee(t('blocklist.permission_proposer', { permission: t('blocklist.permission_nom') })));
      }

      const brut = interaction.options.getString('id').trim();
      const cibleId = brut.replace(/[<@!>]/g, '');
      if (!/^\d{17,20}$/.test(cibleId)) {
        return interaction.reply(C.erreurPrivee(t('blocklist.identifiant_invalide')));
      }

      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      const cible = await client.users.fetch(cibleId).catch(() => null);
      const resultat = await blocklist.proposer(interaction, client, {
        cible,
        cibleId,
        raison: interaction.options.getString('reason'),
        preuve: interaction.options.getString('proof'),
      });

      if (!resultat.ok) return interaction.editReply(C.erreur(traduireRefus(t, resultat.raison)));

      return interaction.editReply(C.succes(t('blocklist.propose', { n: resultat.id })));
    }

    // ------------------------------------------------------------ RETIRER
    const estStaffSupport = fondateur.estSupport(interaction.guild.id)
      && interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild);
    if (!estStaffSupport && !fondateur.estFondateur(interaction.user.id)) {
      return interaction.reply(C.erreurPrivee(t('blocklist.retirer_interdit')));
    }

    const id = interaction.options.getInteger('entry');
    const ligne = req.blocklistParId.get(id);
    if (!ligne || ligne.statut !== 'approuve') {
      return interaction.reply(C.erreurPrivee(t('blocklist.fiche_inexistante', { n: id })));
    }

    req.traiterBlocklist.run({
      id, statut: 'retire', motif: null, par: interaction.user.id, date: Date.now(), public_id: ligne.public_id,
    });

    // On efface aussi le message public : laisser l'accusation en ligne apres
    // avoir retire la fiche serait pire que de ne pas l'avoir retiree.
    if (ligne.public_id) {
      const salon = blocklist.salonPublic(client);
      await salon?.messages?.delete(ligne.public_id).catch(() => null);
    }

    return interaction.reply(C.succesPrive(t('blocklist.retiree', { n: id })));
  },
};
