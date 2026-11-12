/**
 * /giveaway — les concours du serveur.
 *
 * Reserve a l'equipe : lancer un concours, c'est promettre un lot au nom du
 * serveur. Participer, en revanche, est ouvert a tous, par un bouton.
 *
 * L'annonce publique (Components V2, banniere, chances bonus) est construite
 * par gw.messageConcours() dans src/utils/giveaways.js.
 *
 * gererInteraction (le bouton « Participer ») n'est PAS ici : il est exporte
 * par src/utils/giveaways.js et route directement par interactionCreate.js
 * via le prefixe « gw_ ». Ce fichier-ci n'a jamais eu cette fonction.
 */
const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  InteractionContextType,
  MessageFlags,
  ChannelType,
} = require('discord.js');
const conf = require('../../../config');
const { db, req } = require('../../database/db');
const { parserDuree, tronquer, ts } = require('../../utils/outils');
const C = require('../../utils/composants');
const { E } = require('../../utils/emojis');
const gw = require('../../utils/giveaways');
const { traducteur, localisations, t: tr, DEFAUT } = require('../../utils/langues');

const DUREE_MIN = 60_000;            // une minute
const DUREE_MAX = 60 * 86_400_000;   // deux mois

module.exports = {
  categorie: 'utilitaires',

  data: new SlashCommandBuilder()
    .setName('giveaway')
    .setDescription(tr('giveaway.description_commande', DEFAUT))
    .setDescriptionLocalizations(localisations('giveaway.description_commande'))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setContexts(InteractionContextType.Guild)
    .addSubcommand((s) => s
      .setName('start')
      .setNameLocalizations({ fr: 'lancer' })
      .setDescription(tr('giveaway.sous_lancer', DEFAUT))
      .setDescriptionLocalizations(localisations('giveaway.sous_lancer'))
      .addStringOption((o) => o
        .setName('prize')
        .setNameLocalizations({ fr: 'lot' })
        .setDescription(tr('giveaway.opt_lot', DEFAUT))
        .setDescriptionLocalizations(localisations('giveaway.opt_lot'))
        .setRequired(true)
        .setMaxLength(200))
      .addStringOption((o) => o
        .setName('duration')
        .setNameLocalizations({ fr: 'duree' })
        .setDescription(tr('giveaway.opt_duree', DEFAUT))
        .setDescriptionLocalizations(localisations('giveaway.opt_duree'))
        .setRequired(true))
      .addIntegerOption((o) => o
        .setName('winners')
        .setNameLocalizations({ fr: 'gagnants' })
        .setDescription(tr('giveaway.opt_gagnants', DEFAUT))
        .setDescriptionLocalizations(localisations('giveaway.opt_gagnants'))
        .setMinValue(1)
        .setMaxValue(20))
      .addChannelOption((o) => o
        .setName('channel')
        .setNameLocalizations({ fr: 'salon' })
        .setDescription(tr('giveaway.opt_salon', DEFAUT))
        .setDescriptionLocalizations(localisations('giveaway.opt_salon'))
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement))
      .addRoleOption((o) => o
        .setName('required-role')
        .setNameLocalizations({ fr: 'role-requis' })
        .setDescription(tr('giveaway.opt_role_requis', DEFAUT))
        .setDescriptionLocalizations(localisations('giveaway.opt_role_requis')))
      .addIntegerOption((o) => o
        .setName('min-level')
        .setNameLocalizations({ fr: 'niveau-min' })
        .setDescription(tr('giveaway.opt_niveau_min', DEFAUT))
        .setDescriptionLocalizations(localisations('giveaway.opt_niveau_min'))
        .setMinValue(1))
      .addRoleOption((o) => o
        .setName('bonus-role')
        .setNameLocalizations({ fr: 'role-bonus' })
        .setDescription(tr('giveaway.v2.opt_role_bonus', DEFAUT))
        .setDescriptionLocalizations(localisations('giveaway.v2.opt_role_bonus')))
      .addBooleanOption((o) => o
        .setName('boosters')
        .setDescription(tr('giveaway.v2.opt_boosters', DEFAUT))
        .setDescriptionLocalizations(localisations('giveaway.v2.opt_boosters')))
      .addIntegerOption((o) => o
        .setName('bonus')
        .setDescription(tr('giveaway.v2.opt_bonus', DEFAUT))
        .setDescriptionLocalizations(localisations('giveaway.v2.opt_bonus'))
        .setMinValue(2)
        .setMaxValue(10)))
    .addSubcommand((s) => s
      .setName('end')
      .setNameLocalizations({ fr: 'terminer' })
      .setDescription(tr('giveaway.sous_terminer', DEFAUT))
      .setDescriptionLocalizations(localisations('giveaway.sous_terminer'))
      .addIntegerOption((o) => o
        .setName('giveaway')
        .setNameLocalizations({ fr: 'concours' })
        .setDescription(tr('giveaway.opt_concours_terminer', DEFAUT))
        .setDescriptionLocalizations(localisations('giveaway.opt_concours_terminer'))
        .setRequired(true)))
    .addSubcommand((s) => s
      .setName('reroll')
      .setNameLocalizations({ fr: 'relancer' })
      .setDescription(tr('giveaway.sous_relancer', DEFAUT))
      .setDescriptionLocalizations(localisations('giveaway.sous_relancer'))
      .addIntegerOption((o) => o
        .setName('giveaway')
        .setNameLocalizations({ fr: 'concours' })
        .setDescription(tr('giveaway.opt_concours_relancer', DEFAUT))
        .setDescriptionLocalizations(localisations('giveaway.opt_concours_relancer'))
        .setRequired(true)))
    .addSubcommand((s) => s
      .setName('cancel')
      .setNameLocalizations({ fr: 'annuler' })
      .setDescription(tr('giveaway.sous_annuler', DEFAUT))
      .setDescriptionLocalizations(localisations('giveaway.sous_annuler'))
      .addIntegerOption((o) => o
        .setName('giveaway')
        .setNameLocalizations({ fr: 'concours' })
        .setDescription(tr('giveaway.opt_concours_annuler', DEFAUT))
        .setDescriptionLocalizations(localisations('giveaway.opt_concours_annuler'))
        .setRequired(true)))
    .addSubcommand((s) => s
      .setName('list')
      .setNameLocalizations({ fr: 'liste' })
      .setDescription(tr('giveaway.sous_liste', DEFAUT))
      .setDescriptionLocalizations(localisations('giveaway.sous_liste'))),

  async execute(interaction, client) {
    const { t, nombre, duree: enDuree } = traducteur(interaction);
    const sous = interaction.options.getSubcommand();
    const guildId = interaction.guild.id;

    // -------------------------------------------------------------- START
    if (sous === 'start') {
      const duree = parserDuree(interaction.options.getString('duration'));
      if (!duree || duree < DUREE_MIN || duree > DUREE_MAX) {
        return interaction.reply(C.erreurPrivee(t('giveaway.duree_incomprise')));
      }

      const salon = interaction.options.getChannel('channel') ?? interaction.channel;
      const moi = interaction.guild.members.me;
      if (!salon.permissionsFor(moi)?.has(PermissionFlagsBits.SendMessages)) {
        return interaction.reply(C.erreurPrivee(t('erreur.salon_interdit', { salon })));
      }

      const role = interaction.options.getRole('required-role');
      const info = req.creerGiveaway.run({
        guild_id: guildId,
        channel_id: salon.id,
        lot: interaction.options.getString('prize'),
        gagnants: interaction.options.getInteger('winners') ?? 1,
        fin: Date.now() + duree,
        organise_par: interaction.user.id,
        role_requis: role?.id ?? null,
        niveau_min: interaction.options.getInteger('min-level') ?? 0,
        cree_le: Date.now(),
      });

      const bonusRole = interaction.options.getRole('bonus-role');
      const boosters = interaction.options.getBoolean('boosters') ?? false;
      db.prepare('UPDATE giveaways SET bonus_role = ?, bonus = ?, bonus_boosters = ? WHERE id = ?')
        .run(bonusRole?.id ?? null, interaction.options.getInteger('bonus') ?? 2, boosters ? 1 : 0, Number(info.lastInsertRowid));

      const ligne = req.giveaway.get(Number(info.lastInsertRowid));
      const annonce = gw.messageConcours(ligne);
      const message = await salon
        .send(C.envoi(annonce.composants, { files: annonce.fichiers }))
        .catch(() => null);

      if (!message) {
        req.cloreGiveaway.run('annule', null, ligne.id);
        return interaction.reply(C.erreurPrivee(t('giveaway.publication_echouee')));
      }
      req.majMessageGiveaway.run(message.id, ligne.id);

      return interaction.reply(C.succesPrive(
        t('giveaway.lance_intro', { n: ligne.id, salon })
        + `\n${t('giveaway.lance_duree', { duree: enDuree(duree), n: ligne.gagnants })}`
      ));
    }

    // --------------------------------------------------------------- LIST
    if (sous === 'list') {
      const encours = req.giveawaysDe.all(guildId, 'encours');
      return interaction.reply(C.envoiPrive([
        C.conteneur([
          C.texte(`## ${E('cadeau')} ${t('giveaway.liste_titre')}`),
          C.texte(
            encours
              .map((l) => t('giveaway.liste_ligne', {
                id: l.id,
                lot: tronquer(l.lot, 60),
                n: req.compterParticipants.get(l.id).n,
                fin: ts(l.fin, 'R'),
              }))
              .join('\n') || t('giveaway.liste_vide')
          ),
        ], conf.couleurs.principale),
      ]));
    }

    // -------------------------- END / REROLL / CANCEL -------------------
    const id = interaction.options.getInteger('giveaway');
    const ligne = req.giveawayDe.get(id, guildId);
    if (!ligne) {
      return interaction.reply(C.erreurPrivee(t('giveaway.concours_introuvable', { n: id })));
    }

    if (sous === 'reroll') {
      if (ligne.statut !== 'termine') {
        return interaction.reply(C.erreurPrivee(t('giveaway.relancer_refuse')));
      }
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const gagnants = await gw.terminer(client, ligne, { relance: true });
      return interaction.editReply(gagnants.length
        ? C.succes(t('giveaway.relance_gagnants', { gagnants: gagnants.map((g) => `<@${g}>`).join(', ') }))
        : C.avertissement(t('giveaway.relance_aucun_participant')));
    }

    if (ligne.statut !== 'encours') {
      return interaction.reply(C.avertissementPrivee(t('giveaway.deja_statut', { n: id, statut: t(`giveaway.statuts.${ligne.statut}`) })));
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const gagnants = await gw.terminer(client, ligne, { statut: sous === 'cancel' ? 'annule' : 'termine' });

    return interaction.editReply(C.succes(
      sous === 'cancel'
        ? t('giveaway.annule_succes', { n: id })
        : gagnants.length
          ? t('giveaway.termine_gagnants', { n: id, gagnants: gagnants.map((g) => `<@${g}>`).join(', ') })
          : t('giveaway.termine_aucun_participant', { n: id })
    ));
  },
};
