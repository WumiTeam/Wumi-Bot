const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  InteractionContextType,
  ChannelType,
  MessageFlags,
} = require('discord.js');
const conf = require('../../../config');
const C = require('../../utils/composants');
const { req } = require('../../database/db');
const veille = require('../../utils/veille');
const { ts, tronquer } = require('../../utils/outils');
const { E } = require('../../utils/emojis');
const { traducteur, localisations, t: tr, DEFAUT } = require('../../utils/langues');

const SALONS_TEXTE = [ChannelType.GuildText, ChannelType.GuildAnnouncement];

module.exports = {
  categorie: 'config',

  data: new SlashCommandBuilder()
    .setName('watch')
    .setNameLocalizations({ fr: 'veille' })
    .setDescription(tr('veille.description_commande', DEFAUT))
    .setDescriptionLocalizations(localisations('veille.description_commande'))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setContexts(InteractionContextType.Guild)

    .addSubcommand((s) =>
      s
        .setName('add')
        .setNameLocalizations({ fr: 'ajouter' })
        .setDescription(tr('veille.sous_ajouter', DEFAUT))
        .setDescriptionLocalizations(localisations('veille.sous_ajouter'))
        .addStringOption((o) =>
          o
            // « type » s'ecrit pareil dans les deux langues.
            .setName('type')
            .setDescription(tr('veille.opt_type', DEFAUT))
            .setDescriptionLocalizations(localisations('veille.opt_type'))
            .setRequired(true)
            // Discord n'affiche pas les emojis d'application dans les choix
            // d'une commande : ils s'y liraient « <:bp_twitch:123> ». Unicode.
            .addChoices(
              { name: tr('veille.type_twitch', DEFAUT), name_localizations: localisations('veille.type_twitch'), value: 'twitch' },
              { name: tr('veille.type_tiktok', DEFAUT), name_localizations: localisations('veille.type_tiktok'), value: 'tiktok' },
              { name: tr('veille.type_instagram', DEFAUT), name_localizations: localisations('veille.type_instagram'), value: 'instagram' },
              { name: tr('veille.type_youtube', DEFAUT), name_localizations: localisations('veille.type_youtube'), value: 'youtube' },
              { name: tr('veille.type_rss', DEFAUT), name_localizations: localisations('veille.type_rss'), value: 'rss' }
            )
        )
        .addChannelOption((o) =>
          o
            .setName('channel')
            .setNameLocalizations({ fr: 'salon' })
            .setDescription(tr('veille.opt_salon', DEFAUT))
            .setDescriptionLocalizations(localisations('veille.opt_salon'))
            .setRequired(true)
            .addChannelTypes(...SALONS_TEXTE)
        )
        .addStringOption((o) =>
          o
            // « source » s'ecrit pareil dans les deux langues.
            .setName('source')
            .setDescription(tr('veille.opt_source', DEFAUT))
            .setDescriptionLocalizations(localisations('veille.opt_source'))
            .setMaxLength(300)
        )
        .addRoleOption((o) =>
          // « role » s'ecrit pareil dans les deux langues (sans accent, comme
          // partout ailleurs dans le bot).
          o
            .setName('role')
            .setDescription(tr('veille.opt_role', DEFAUT))
            .setDescriptionLocalizations(localisations('veille.opt_role'))
        )
        .addStringOption((o) =>
          o
            .setName('name')
            .setNameLocalizations({ fr: 'nom' })
            .setDescription(tr('veille.opt_nom', DEFAUT))
            .setDescriptionLocalizations(localisations('veille.opt_nom'))
            .setMaxLength(60)
        )
        .addStringOption((o) =>
          o
            // « message » s'ecrit pareil dans les deux langues.
            .setName('message')
            .setDescription(tr('veille.opt_message', DEFAUT))
            .setDescriptionLocalizations(localisations('veille.opt_message'))
            .setMaxLength(200)
        )
    )
    .addSubcommand((s) =>
      s
        .setName('list')
        .setNameLocalizations({ fr: 'liste' })
        .setDescription(tr('veille.sous_liste', DEFAUT))
        .setDescriptionLocalizations(localisations('veille.sous_liste'))
    )
    .addSubcommand((s) =>
      s
        .setName('remove')
        .setNameLocalizations({ fr: 'retirer' })
        .setDescription(tr('veille.sous_retirer', DEFAUT))
        .setDescriptionLocalizations(localisations('veille.sous_retirer'))
        .addIntegerOption((o) =>
          o
            .setName('number')
            .setNameLocalizations({ fr: 'numero' })
            .setDescription(tr('veille.opt_numero', DEFAUT))
            .setDescriptionLocalizations(localisations('veille.opt_numero'))
            .setRequired(true)
            .setMinValue(1)
        )
    )
    .addSubcommand((s) =>
      s
        .setName('test')
        .setNameLocalizations({ fr: 'tester' })
        .setDescription(tr('veille.sous_tester', DEFAUT))
        .setDescriptionLocalizations(localisations('veille.sous_tester'))
        .addIntegerOption((o) =>
          o
            .setName('number')
            .setNameLocalizations({ fr: 'numero' })
            .setDescription(tr('veille.opt_numero', DEFAUT))
            .setDescriptionLocalizations(localisations('veille.opt_numero'))
            .setRequired(true)
            .setMinValue(1)
        )
    )
    .addSubcommand((s) =>
      s
        .setName('token')
        .setNameLocalizations({ fr: 'jeton' })
        .setDescription(tr('veille.sous_jeton', DEFAUT))
        .setDescriptionLocalizations(localisations('veille.sous_jeton'))
    ),

  async execute(interaction) {
    const { t } = traducteur(interaction);
    const sous = interaction.options.getSubcommand();
    const guildId = interaction.guild.id;

    // ------------------------------------------------------------ AJOUTER
    if (sous === 'add') {
      const type = interaction.options.getString('type');
      const salon = interaction.options.getChannel('channel');
      const source = interaction.options.getString('source')?.trim() ?? '';
      const role = interaction.options.getRole('role');

      if (type !== 'instagram' && !source) {
        return interaction.reply(C.erreurPrivee(
          type === 'youtube'
            ? t('veille.ajouter_source_manquante_youtube')
            : t('veille.ajouter_source_manquante_generique')
        ));
      }
      if (type === 'rss' && !/^https?:\/\//i.test(source)) {
        return interaction.reply(C.erreurPrivee(t('veille.ajouter_rss_invalide')));
      }

      const moi = interaction.guild.members.me;
      if (!salon.permissionsFor(moi)?.has(PermissionFlagsBits.SendMessages)) {
        return interaction.reply(C.erreurPrivee(t('veille.ajouter_salon_interdit', { salon: `${salon}` })));
      }

      // Plafond par serveur : chaque source est une requete reseau sur une
      // minuterie. Sans limite, un serveur peut a lui seul saturer le bot pour
      // tous les autres. Le premium releve ce plafond, il ne l'enleve pas.
      const limites = require('../../utils/limites');
      const place = limites.place('veille', guildId, req.veillesDe.all(guildId).length);
      if (!place.ok) {
        return interaction.reply(C.erreurPrivee(
          t('veille.ajouter_plafond', { deja: place.deja })
          + (place.gagnerait ? `\n${t('veille.ajouter_plafond_premium', { n: place.gagnerait })}` : '')
        ));
      }

      await interaction.deferReply();

      // On teste la source avant de l'enregistrer : mieux vaut une erreur
      // maintenant qu'une source silencieusement morte pendant des semaines.
      // verifierSource sait qu'une chaine Twitch hors ligne est valide — c'est
      // meme son etat habituel — la ou un simple « lire » la croirait vide.
      let verif;
      try {
        verif = await veille.verifierSource(type, source);
      } catch (e) {
        const guide = type === 'instagram'
          ? t('veille.ajouter_guide_instagram')
          : type === 'twitch'
            ? t('veille.ajouter_guide_twitch')
            : '';
        return interaction.editReply(C.erreur(t('veille.ajouter_lecture_impossible', { erreur: tronquer(e.message, 400) }) + guide));
      }
      const elements = verif.elements;

      const info = req.ajouterVeille.run({
        guild_id: guildId,
        type,
        source: source || 'compte du jeton',
        nom: interaction.options.getString('name') ?? verif.nom ?? veille.TYPES[type].nom,
        salon_id: salon.id,
        role_id: role?.id ?? null,
        message: interaction.options.getString('message') ?? null,
        cree_le: Date.now(),
      });

      // On note l'etat actuel sans l'annoncer : seule la suite declenchera un
      // message. Une chaine hors ligne n'a rien a noter, mais on la marque
      // quand meme comme initialisee, sinon son premier direct serait pris
      // pour un premier passage et jamais annonce.
      req.majVeille.run({
        id: Number(info.lastInsertRowid),
        dernier: elements[0]?.id ?? 'hors-ligne',
        derniere_date: elements[0]?.date ?? 0,
      });

      const cadence = t('veille.cadence', { n: type === 'twitch' ? conf.veille.intervalleTwitchMinutes : conf.veille.intervalleMinutes });
      const etat = type === 'twitch'
        ? (verif.enDirect
            ? t('veille.etat_twitch_direct', { nom: verif.nom })
            : t('veille.etat_twitch_hors_ligne', { nom: verif.nom }))
        : t('veille.etat_derniere_pub', { titre: tronquer(elements[0].titre, 150) });

      return interaction.editReply(C.succes(
        t('veille.ajoutee_titre', { n: info.lastInsertRowid, salon: `${salon}` })
        + (role ? t('veille.ajoutee_role', { role: `${role}` }) : '')
        + `.\n${etat}\n${cadence}`
      ));
    }

    // -------------------------------------------------------------- LISTE
    if (sous === 'list') {
      const sources = req.veillesDe.all(guildId);
      if (!sources.length) {
        return interaction.reply(C.infoPrivee(t('veille.liste_vide')));
      }

      const jeton = veille.etatJeton();
      const lignes = sources.map((s) => {
        const meta = veille.TYPES[s.type] ?? veille.TYPES.rss;
        return [
          t('veille.liste_ligne_tete', { n: s.id, emoji: meta.emoji, nom: s.nom, salon: `<#${s.salon_id}>` })
            + (s.role_id ? t('veille.liste_ligne_role', { role: `<@&${s.role_id}>` }) : ''),
          `> ${s.type === 'instagram' ? t('veille.liste_ligne_compte_jeton') : tronquer(s.source, 90)}`,
          `> ${s.derniere_date ? t('veille.liste_ligne_vue', { date: ts(s.derniere_date, 'R') }) : t('veille.liste_ligne_jamais')}`,
          s.erreurs ? `> ${E('avertissement')} ${t('veille.liste_ligne_erreurs', { n: s.erreurs, erreur: tronquer(s.derniere_erreur ?? '', 120) })}` : null,
        ]
          .filter(Boolean)
          .join('\n');
      });

      return interaction.reply(C.envoi([C.conteneur([
        C.texte(`## 📡 ${t('veille.liste_titre', { n: sources.length })}`),
        C.texte(lignes.join('\n\n')),
        C.texte(`-# ${t('veille.liste_pied', { minutes: conf.veille.intervalleMinutes })}${jeton.present && jeton.joursRestants !== null ? t('veille.liste_pied_jeton', { jours: jeton.joursRestants }) : ''}`),
      ], conf.couleurs.principale)]));
    }

    // ------------------------------------------------------------- JETON
    if (sous === 'token') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const avant = veille.etatJeton();
      if (!avant.present) {
        return interaction.editReply(C.avertissement(t('veille.jeton_absent')));
      }

      const resultat = await veille.renouvelerJeton(true);
      const apres = veille.etatJeton();
      return interaction.editReply(resultat.ok
        ? C.succes(t('veille.jeton_renouvele', { date: ts(apres.expireLe, 'D') }))
        : C.erreur(t('veille.jeton_echec', { raison: tronquer(resultat.raison, 400) })));
    }

    // ------------------------------------------------- RETIRER ET TESTER
    const numero = interaction.options.getInteger('number');
    const source = req.veilleParId.get(numero);
    if (!source || source.guild_id !== guildId) {
      return interaction.reply(C.erreurPrivee(t('veille.introuvable', { n: numero })));
    }

    if (sous === 'remove') {
      req.retirerVeille.run(numero, guildId);
      return interaction.reply(C.succes(t('veille.retiree', { nom: source.nom })));
    }

    // tester : on remet le compteur a zero pour forcer une annonce
    await interaction.deferReply();
    req.majVeille.run({ id: source.id, dernier: null, derniere_date: 1 });
    const resultat = await veille.verifierUne(interaction.client, { ...source, dernier: null, derniere_date: 1 });

    if (resultat.erreur) {
      return interaction.editReply(C.erreur(t('veille.test_lecture_impossible', { erreur: tronquer(resultat.erreur, 400) })));
    }
    if (resultat.ignore) return interaction.editReply(C.erreur(t('veille.test_ignoree', { motif: resultat.ignore })));
    if (resultat.rien) return interaction.editReply(C.info(t('veille.test_rien')));

    return interaction.editReply(C.succes(t('veille.test_reussi', { n: resultat.annonces, salon: `<#${source.salon_id}>` })));
  },
};
