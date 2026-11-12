/**
 * /faq — les fiches de questions frequentes du serveur.
 *
 * LES FICHES ELLES-MEMES RESTENT EN EMBED CLASSIQUE.
 * `faq.construireEmbed()` (src/utils/faq.js) rend l'embed d'une fiche — c'est
 * un utilitaire partage, hors de ce lot, donc on ne le reecrit pas en
 * Components V2 : un message ne peut pas melanger le drapeau V2 et un embed
 * classique (le second serait ignore). Les reponses qui montrent une fiche
 * (ajouter, modifier, afficher, chercher-trouve) restent donc des embeds
 * classiques ; tout le reste (refus, erreurs, liste, test) passe en V2.
 *
 * gererInteraction (bouton « pas ma question ») n'est PAS ici : il est
 * exporte par src/utils/faq.js et route directement par interactionCreate.js
 * via le prefixe « faq_ ». Ce fichier-ci n'a jamais eu cette fonction.
 */
const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  InteractionContextType,
  MessageFlags,
} = require('discord.js');
const conf = require('../../../config');
const { req, config, majConfig } = require('../../database/db');
const { embeds, tronquer } = require('../../utils/outils');
const C = require('../../utils/composants');
const faq = require('../../utils/faq');
const { E } = require('../../utils/emojis');
const { traducteur, localisations, t: tr, DEFAUT } = require('../../utils/langues');

module.exports = {
  categorie: 'utilitaires',

  data: new SlashCommandBuilder()
    .setName('faq')
    .setDescription(tr('faq.description_commande', DEFAUT))
    .setDescriptionLocalizations(localisations('faq.description_commande'))
    .setContexts(InteractionContextType.Guild)

    .addSubcommand((s) => s
      .setName('search')
      .setNameLocalizations({ fr: 'chercher' })
      .setDescription(tr('faq.sous_chercher', DEFAUT))
      .setDescriptionLocalizations(localisations('faq.sous_chercher'))
      .addStringOption((o) => o
        .setName('question')
        .setDescription(tr('faq.opt_question_chercher', DEFAUT))
        .setDescriptionLocalizations(localisations('faq.opt_question_chercher'))
        .setRequired(true)
        .setMaxLength(300)))
    .addSubcommand((s) => s
      .setName('show')
      .setNameLocalizations({ fr: 'afficher' })
      .setDescription(tr('faq.sous_afficher', DEFAUT))
      .setDescriptionLocalizations(localisations('faq.sous_afficher'))
      .addIntegerOption((o) => o
        .setName('number')
        .setNameLocalizations({ fr: 'numero' })
        .setDescription(tr('faq.opt_numero_afficher', DEFAUT))
        .setDescriptionLocalizations(localisations('faq.opt_numero_afficher'))
        .setRequired(true)
        .setMinValue(1)))
    .addSubcommand((s) => s
      .setName('list')
      .setNameLocalizations({ fr: 'liste' })
      .setDescription(tr('faq.sous_liste', DEFAUT))
      .setDescriptionLocalizations(localisations('faq.sous_liste')))
    .addSubcommand((s) => s
      .setName('add')
      .setNameLocalizations({ fr: 'ajouter' })
      .setDescription(tr('faq.sous_ajouter', DEFAUT))
      .setDescriptionLocalizations(localisations('faq.sous_ajouter'))
      .addStringOption((o) => o
        .setName('question')
        .setDescription(tr('faq.opt_question_ajouter', DEFAUT))
        .setDescriptionLocalizations(localisations('faq.opt_question_ajouter'))
        .setRequired(true)
        .setMaxLength(250))
      .addStringOption((o) => o
        .setName('answer')
        .setNameLocalizations({ fr: 'reponse' })
        .setDescription(tr('faq.opt_reponse_ajouter', DEFAUT))
        .setDescriptionLocalizations(localisations('faq.opt_reponse_ajouter'))
        .setRequired(true)
        .setMaxLength(1800))
      .addStringOption((o) => o
        .setName('keywords')
        .setNameLocalizations({ fr: 'mots-cles' })
        .setDescription(tr('faq.opt_motscles_ajouter', DEFAUT))
        .setDescriptionLocalizations(localisations('faq.opt_motscles_ajouter'))
        .setMaxLength(300)))
    .addSubcommand((s) => s
      .setName('edit')
      .setNameLocalizations({ fr: 'modifier' })
      .setDescription(tr('faq.sous_modifier', DEFAUT))
      .setDescriptionLocalizations(localisations('faq.sous_modifier'))
      .addIntegerOption((o) => o
        .setName('number')
        .setNameLocalizations({ fr: 'numero' })
        .setDescription(tr('faq.opt_numero_modifier', DEFAUT))
        .setDescriptionLocalizations(localisations('faq.opt_numero_modifier'))
        .setRequired(true)
        .setMinValue(1))
      .addStringOption((o) => o
        .setName('question')
        .setDescription(tr('faq.opt_question_modifier', DEFAUT))
        .setDescriptionLocalizations(localisations('faq.opt_question_modifier'))
        .setMaxLength(250))
      .addStringOption((o) => o
        .setName('answer')
        .setNameLocalizations({ fr: 'reponse' })
        .setDescription(tr('faq.opt_reponse_modifier', DEFAUT))
        .setDescriptionLocalizations(localisations('faq.opt_reponse_modifier'))
        .setMaxLength(1800))
      .addStringOption((o) => o
        .setName('keywords')
        .setNameLocalizations({ fr: 'mots-cles' })
        .setDescription(tr('faq.opt_motscles_modifier', DEFAUT))
        .setDescriptionLocalizations(localisations('faq.opt_motscles_modifier'))
        .setMaxLength(300)))
    .addSubcommand((s) => s
      .setName('remove')
      .setNameLocalizations({ fr: 'retirer' })
      .setDescription(tr('faq.sous_retirer', DEFAUT))
      .setDescriptionLocalizations(localisations('faq.sous_retirer'))
      .addIntegerOption((o) => o
        .setName('number')
        .setNameLocalizations({ fr: 'numero' })
        .setDescription(tr('faq.opt_numero_retirer', DEFAUT))
        .setDescriptionLocalizations(localisations('faq.opt_numero_retirer'))
        .setRequired(true)
        .setMinValue(1)))
    .addSubcommand((s) => s
      .setName('auto')
      .setDescription(tr('faq.sous_auto', DEFAUT))
      .setDescriptionLocalizations(localisations('faq.sous_auto'))
      .addBooleanOption((o) => o
        .setName('enabled')
        .setNameLocalizations({ fr: 'actif' })
        .setDescription(tr('faq.opt_actif', DEFAUT))
        .setDescriptionLocalizations(localisations('faq.opt_actif'))
        .setRequired(true))
      .addIntegerOption((o) => o
        .setName('threshold')
        .setNameLocalizations({ fr: 'seuil' })
        .setDescription(tr('faq.opt_seuil', DEFAUT))
        .setDescriptionLocalizations(localisations('faq.opt_seuil'))
        .setMinValue(30)
        .setMaxValue(95)))
    .addSubcommand((s) => s
      .setName('test')
      .setNameLocalizations({ fr: 'tester' })
      .setDescription(tr('faq.sous_tester', DEFAUT))
      .setDescriptionLocalizations(localisations('faq.sous_tester'))
      .addStringOption((o) => o
        .setName('text')
        .setNameLocalizations({ fr: 'phrase' })
        .setDescription(tr('faq.opt_phrase', DEFAUT))
        .setDescriptionLocalizations(localisations('faq.opt_phrase'))
        .setRequired(true)
        .setMaxLength(300))),

  async execute(interaction) {
    const { t, nombre } = traducteur(interaction);
    const sous = interaction.options.getSubcommand();
    const guildId = interaction.guild.id;
    const equipe = interaction.member.permissions.has(PermissionFlagsBits.ManageMessages);
    const refus = () => interaction.reply(C.erreurPrivee(t('faq.equipe_seulement')));

    // ========================================================== AJOUTER
    if (sous === 'add') {
      if (!equipe) return refus();
      const info = req.ajouterFaq.run({
        guild_id: guildId,
        question: interaction.options.getString('question'),
        reponse: interaction.options.getString('answer'),
        mots_cles: interaction.options.getString('keywords') ?? '',
        auteur_id: interaction.user.id,
        date: Date.now(),
      });
      const fiche = req.faq.get(Number(info.lastInsertRowid), guildId);
      // Melange embed classique + fiche : voir la note en tete de fichier.
      return interaction.reply({
        embeds: [
          embeds.succes(t('faq.ajoutee', { n: fiche.id })),
          faq.construireEmbed(fiche),
        ],
      });
    }

    // ========================================================= MODIFIER
    if (sous === 'edit') {
      if (!equipe) return refus();
      const fiche = req.faq.get(interaction.options.getInteger('number'), guildId);
      if (!fiche) return interaction.reply(C.erreurPrivee(t('faq.fiche_introuvable')));

      req.majFaq.run({
        id: fiche.id,
        question: interaction.options.getString('question') ?? fiche.question,
        reponse: interaction.options.getString('answer') ?? fiche.reponse,
        mots_cles: interaction.options.getString('keywords') ?? fiche.mots_cles,
      });
      return interaction.reply({
        embeds: [
          embeds.succes(t('faq.modifiee', { n: fiche.id })),
          faq.construireEmbed(req.faq.get(fiche.id, guildId)),
        ],
      });
    }

    // ========================================================== RETIRER
    if (sous === 'remove') {
      if (!equipe) return refus();
      const numero = interaction.options.getInteger('number');
      const res = req.retirerFaq.run(numero, guildId);
      if (!res.changes) return interaction.reply(C.erreurPrivee(t('faq.fiche_introuvable')));
      return interaction.reply(C.succes(t('faq.retiree', { n: numero })));
    }

    // ============================================================= AUTO
    if (sous === 'auto') {
      if (!equipe) return refus();
      const actif = interaction.options.getBoolean('enabled');
      const seuil = interaction.options.getInteger('threshold');
      majConfig(guildId, { faq_actif: actif ? 1 : 0, ...(seuil !== null ? { faq_seuil: seuil } : {}) });
      const cfg = config(guildId);
      return interaction.reply(C.succes(
        actif
          ? t('faq.auto_activee', { seuil: nombre(cfg.faq_seuil) })
          : t('faq.auto_desactivee')
      ));
    }

    // =========================================================== TESTER
    if (sous === 'test') {
      if (!equipe) return refus();
      const phrase = interaction.options.getString('text');
      const resultat = faq.chercher(guildId, phrase);
      const cfg = config(guildId);

      if (!resultat) {
        return interaction.reply(C.infoPrivee(t('faq.tester_aucune_fiche')));
      }

      const reussi = resultat.score >= cfg.faq_seuil;
      return interaction.reply(C.envoiPrive([
        C.conteneur([
          C.texte(`## ${E('loupe')} ${t('faq.tester_titre')}`),
          C.texte(
            [
              t('faq.tester_phrase', { phrase: tronquer(phrase, 200) }),
              t('faq.tester_meilleure', { n: resultat.fiche.id, question: tronquer(resultat.fiche.question, 100) }),
              t('faq.tester_score', { score: nombre(resultat.score), seuil: nombre(cfg.faq_seuil) }),
            ].join('\n')
          ),
          C.separateur(),
          C.texte(reussi
            ? `${E('succes')} ${t('faq.tester_repondrait')}`
            : `${E('erreur')} ${t('faq.tester_ne_repondrait_pas')}`),
          C.separateur(),
          C.texte(`**${t('faq.tester_champ_mots')}**\n${faq.motsUtiles(phrase).join(', ') || t('faq.tester_aucun_mot')}`),
        ], reussi ? conf.couleurs.succes : conf.couleurs.avertissement),
      ]));
    }

    // ============================================================ LISTE
    if (sous === 'list') {
      const fiches = req.toutesFaq.all(guildId);
      if (!fiches.length) {
        return interaction.reply(C.infoPrivee(t('faq.liste_aucune')));
      }
      return interaction.reply(C.envoiPrive([
        C.conteneur([
          C.texte(`## ${E('message')} ${t('faq.liste_titre', { n: nombre(fiches.length) })}`),
          C.texte(tronquer(
            fiches
              .map((f) => `**#${f.id}** · ${tronquer(f.question, 100)}${f.utilisations ? ` · ${t('faq.liste_ligne_consultations', { n: f.utilisations })}` : ''}`)
              .join('\n'),
            4000
          )),
          C.separateur(),
          C.texte(`-# ${t('faq.liste_pied')}`),
        ], conf.couleurs.principale),
      ]));
    }

    // ========================================================= AFFICHER
    if (sous === 'show') {
      const fiche = req.faq.get(interaction.options.getInteger('number'), guildId);
      if (!fiche) return interaction.reply(C.erreurPrivee(t('faq.fiche_introuvable')));
      req.incrementerFaq.run(fiche.id);
      return interaction.reply({ embeds: [faq.construireEmbed(fiche)] });
    }

    // ========================================================= CHERCHER
    const question = interaction.options.getString('question');
    const resultat = faq.chercher(guildId, question);

    if (!resultat || resultat.score < 25) {
      return interaction.reply(C.infoPrivee(t('faq.chercher_pas_trouve')));
    }

    req.incrementerFaq.run(resultat.fiche.id);
    return interaction.reply({ embeds: [faq.construireEmbed(resultat.fiche)], flags: MessageFlags.Ephemeral });
  },
};
