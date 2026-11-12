/**
 * /admin — les commandes du fondateur du bot.
 *
 * Elles ne sont PAS deployees en global : `deploy-commands.js` les reconnait a
 * leur drapeau `fondateur: true` et les envoie uniquement sur le serveur
 * support. Personne d'autre ne les voit, meme en tapant « / ».
 *
 * Deux verrous quand meme, parce qu'un deploiement se rate et qu'une commande
 * peut trainer ailleurs :
 *   - il faut etre dans OWNER_IDS ;
 *   - il faut etre sur le serveur support.
 * Les deux, pas l'un ou l'autre. Un fondateur qui lance /admin depuis le
 * serveur de quelqu'un d'autre se fait refuser aussi : ces commandes parlent
 * de TOUS les serveurs, elles n'ont rien a faire ailleurs.
 */
const {
  SlashCommandBuilder,
  InteractionContextType,
  ChannelType,
} = require('discord.js');
const conf = require('../../../config');
const { db } = require('../../database/db');
const { formaterNombre, tronquer } = require('../../utils/outils');
const { E } = require('../../utils/emojis');
const fondateur = require('../../utils/fondateur');
const capacites = require('../../utils/capacites');
const logger = require('../../utils/logger');
const C = require('../../utils/composants');
const { traducteur, localisations, t: tr, DEFAUT } = require('../../utils/langues');
const adminSupport = require('../../utils/adminSupport');
const journal = require('../../utils/journalSupport');

/** Trace une action de fondateur dans LOG_ADMIN. */
function tracer(interaction, titre, lignes = [], couleur = conf.couleurs.info) {
  journal.noter('admin', {
    titre,
    couleur,
    lignes: [...lignes, `**Par** · ${interaction.user} (\`${interaction.user.id}\`)`],
    pied: `/admin ${interaction.options.getSubcommandGroup(false) ?? ''} ${interaction.options.getSubcommand(false) ?? ''}`.replace(/\s+/g, ' ').trim(),
  });
}

const PAR_PAGE = 15;

/** Compte une table, sans planter si elle n'existe pas encore. */
function compter(table, ou = '') {
  try {
    return db.prepare(`SELECT COUNT(*) AS n FROM ${table} ${ou}`).get().n;
  } catch {
    return 0;
  }
}

module.exports = {
  // Lu par deploy-commands.js : cette commande va sur le serveur support, pas
  // en global.
  fondateur: true,
  categorie: 'config',

  data: new SlashCommandBuilder()
    .setName('admin')
    .setDescription(tr('admin.description_commande', DEFAUT))
    .setDescriptionLocalizations(localisations('admin.description_commande'))
    .setContexts(InteractionContextType.Guild)
    .addSubcommand((s) => s
      .setName('status')
      .setNameLocalizations({ fr: 'etat' })
      .setDescription(tr('admin.sous_etat', DEFAUT))
      .setDescriptionLocalizations(localisations('admin.sous_etat')))
    .addSubcommand((s) => s
      .setName('servers')
      .setNameLocalizations({ fr: 'serveurs' })
      .setDescription(tr('admin.sous_serveurs', DEFAUT))
      .setDescriptionLocalizations(localisations('admin.sous_serveurs'))
      .addIntegerOption((o) => o
        .setName('page')
        .setDescription(tr('admin.opt_page', DEFAUT))
        .setDescriptionLocalizations(localisations('admin.opt_page'))
        .setMinValue(1))
      .addStringOption((o) => o
        .setName('search')
        .setNameLocalizations({ fr: 'chercher' })
        .setDescription(tr('admin.opt_chercher', DEFAUT))
        .setDescriptionLocalizations(localisations('admin.opt_chercher'))))
    .addSubcommand((s) => s
      .setName('leave')
      .setNameLocalizations({ fr: 'quitter' })
      .setDescription(tr('admin.sous_quitter', DEFAUT))
      .setDescriptionLocalizations(localisations('admin.sous_quitter'))
      .addStringOption((o) => o
        .setName('server')
        .setNameLocalizations({ fr: 'serveur' })
        .setDescription(tr('admin.opt_serveur', DEFAUT))
        .setDescriptionLocalizations(localisations('admin.opt_serveur'))
        .setRequired(true)))
    .addSubcommand((s) => s
      .setName('block')
      .setNameLocalizations({ fr: 'bloquer' })
      .setDescription(tr('admin.sous_bloquer', DEFAUT))
      .setDescriptionLocalizations(localisations('admin.sous_bloquer'))
      .addStringOption((o) => o
        .setName('type')
        .setNameLocalizations({ fr: 'genre' })
        .setDescription(tr('admin.opt_genre', DEFAUT))
        .setDescriptionLocalizations(localisations('admin.opt_genre'))
        .setRequired(true)
        // Les valeurs restent en francais : elles sont ecrites telles quelles
        // en base par src/utils/fondateur.js (`bloquer`), qui n'accepte que
        // 'serveur' ou 'membre' et qu'on ne touche pas. Seul le libelle
        // affiche est traduit.
        .addChoices(
          { name: tr('admin.choix_serveur', DEFAUT), name_localizations: localisations('admin.choix_serveur'), value: 'serveur' },
          { name: tr('admin.choix_membre', DEFAUT), name_localizations: localisations('admin.choix_membre'), value: 'membre' }
        ))
      .addStringOption((o) => o
        .setName('id')
        .setNameLocalizations({ fr: 'identifiant' })
        .setDescription(tr('admin.opt_identifiant', DEFAUT))
        .setDescriptionLocalizations(localisations('admin.opt_identifiant'))
        .setRequired(true))
      .addStringOption((o) => o
        .setName('reason')
        .setNameLocalizations({ fr: 'raison' })
        .setDescription(tr('admin.opt_raison', DEFAUT))
        .setDescriptionLocalizations(localisations('admin.opt_raison'))
        .setMaxLength(300)))
    .addSubcommand((s) => s
      .setName('unblock')
      .setNameLocalizations({ fr: 'debloquer' })
      .setDescription(tr('admin.sous_debloquer', DEFAUT))
      .setDescriptionLocalizations(localisations('admin.sous_debloquer'))
      .addStringOption((o) => o
        .setName('id')
        .setNameLocalizations({ fr: 'identifiant' })
        .setDescription(tr('admin.opt_identifiant', DEFAUT))
        .setDescriptionLocalizations(localisations('admin.opt_identifiant'))
        .setRequired(true)))
    .addSubcommand((s) => s
      .setName('blacklist')
      .setNameLocalizations({ fr: 'listenoire' })
      .setDescription(tr('admin.sous_listenoire', DEFAUT))
      .setDescriptionLocalizations(localisations('admin.sous_listenoire')))

    // ------------------------------------------------------------- PREMIUM
    // L'octroi manuel : il sert des aujourd'hui (remercier un serveur qui
    // aide, depanner quelqu'un) et il sert de filet le jour ou un paiement
    // Discord se perd en route.
    .addSubcommand((s) => s
      .setName('premium')
      .setDescription(tr('admin.sous_premium', DEFAUT))
      .setDescriptionLocalizations(localisations('admin.sous_premium'))
      .addStringOption((o) => o
        .setName('server')
        .setNameLocalizations({ fr: 'serveur' })
        .setDescription(tr('admin.opt_serveur', DEFAUT))
        .setDescriptionLocalizations(localisations('admin.opt_serveur'))
        .setRequired(true))
      .addIntegerOption((o) => o
        .setName('days')
        .setNameLocalizations({ fr: 'jours' })
        .setDescription(tr('admin.opt_jours', DEFAUT))
        .setDescriptionLocalizations(localisations('admin.opt_jours'))
        .setMinValue(1)
        .setMaxValue(3650)))
    .addSubcommand((s) => s
      .setName('premium-remove')
      .setNameLocalizations({ fr: 'premium-retirer' })
      .setDescription(tr('admin.sous_premium_retirer', DEFAUT))
      .setDescriptionLocalizations(localisations('admin.sous_premium_retirer'))
      .addStringOption((o) => o
        .setName('server')
        .setNameLocalizations({ fr: 'serveur' })
        .setDescription(tr('admin.opt_serveur', DEFAUT))
        .setDescriptionLocalizations(localisations('admin.opt_serveur'))
        .setRequired(true)))
    .addSubcommand((s) => s
      .setName('premium-list')
      .setNameLocalizations({ fr: 'premiums' })
      .setDescription(tr('admin.sous_premiums', DEFAUT))
      .setDescriptionLocalizations(localisations('admin.sous_premiums')))

    // ------------------------------------------------------ JOURNAL DU BOT
    .addSubcommand((s) => s
      .setName('logs')
      .setDescription(tr('admin.sous_logs', DEFAUT))
      .setDescriptionLocalizations(localisations('admin.sous_logs'))
      .addBooleanOption((o) => o
        .setName('test')
        .setDescription(tr('admin.opt_logs_test', DEFAUT))
        .setDescriptionLocalizations(localisations('admin.opt_logs_test'))))
    .addSubcommand((s) => s
      .setName('status-channel')
      .setNameLocalizations({ fr: 'salon-statut' })
      .setDescription(tr('admin.sous_salon_statut', DEFAUT))
      .setDescriptionLocalizations(localisations('admin.sous_salon_statut'))
      .addChannelOption((o) => o
        .setName('channel')
        .setNameLocalizations({ fr: 'salon' })
        .setDescription(tr('admin.opt_salon_statut', DEFAUT))
        .setDescriptionLocalizations(localisations('admin.opt_salon_statut'))
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement))
      .addBooleanOption((o) => o
        .setName('disable')
        .setNameLocalizations({ fr: 'desactiver' })
        .setDescription(tr('admin.opt_statut_off', DEFAUT))
        .setDescriptionLocalizations(localisations('admin.opt_statut_off'))))

    // ------------------------------------------- TICKETS DU SERVEUR SUPPORT
    // Voir src/utils/adminSupport.js : toute la logique est la-bas.
    .addSubcommandGroup((g) => adminSupport.groupeTicket(g))
    .addSubcommandGroup((g) => adminSupport.groupeVerification(g))
    .addSubcommandGroup((g) => adminSupport.groupeRoles(g))
    .addSubcommandGroup((g) => adminSupport.groupeIncident(g))
    .addSubcommandGroup((g) => adminSupport.groupeNoel(g))
    .addSubcommandGroup((g) => adminSupport.groupePanneaux(g)),

  async autocomplete(interaction) {
    if (!fondateur.estFondateur(interaction.user.id)) return interaction.respond([]);
    if (interaction.options.getSubcommandGroup(false) === 'incident') return adminSupport.autocompleteIncident(interaction);
    return interaction.respond([]);
  },

  async execute(interaction, client) {
    const { t } = traducteur(interaction);

    // ------------------------------------------------------------ VERROUS
    if (!fondateur.estFondateur(interaction.user.id)) {
      logger.avertissement(
        `/admin refuse a ${interaction.user.tag ?? interaction.user.id} sur ${interaction.guild?.name}.`
      );
      return interaction.reply(C.erreurPrivee(t('admin.permission_refusee')));
    }
    if (!fondateur.estSupport(interaction.guild.id)) {
      return interaction.reply(C.erreurPrivee(t('admin.serveur_support_requis')));
    }

    const sous = interaction.options.getSubcommand();
    const groupe = interaction.options.getSubcommandGroup(false);

    // ------------------------------------------- TICKETS / VERIFICATION
    if (groupe === 'ticket' || groupe === 'verification' || groupe === 'roles' || groupe === 'incident' || groupe === 'christmas' || groupe === 'panels') {
      return adminSupport.executer(interaction, client, { groupe, sous, tracer });
    }
    if (sous === 'logs') return adminSupport.logs(interaction, client);

    // ---------------------------------------------------- SALON DE STATUT
    if (sous === 'status-channel') {
      const statut = require('../../utils/statut');
      if (interaction.options.getBoolean('disable')) {
        await statut.configurerSalon(client, null);
        return interaction.reply(C.succesPrive(t('admin.statut_off')));
      }
      const salon = interaction.options.getChannel('channel');
      if (!salon) {
        const actuel = require('../../database/db').config(interaction.guild.id).statut_salon;
        return interaction.reply(C.infoPrivee(actuel ? t('admin.statut_actuel', { salon: `<#${actuel}>` }) : t('admin.statut_aucun')));
      }
      const { PermissionsBitField: P } = require('discord.js');
      const droits = salon.permissionsFor(interaction.guild.members.me);
      if (!droits?.has([P.Flags.ViewChannel, P.Flags.SendMessages, P.Flags.ReadMessageHistory])) {
        return interaction.reply(C.erreurPrivee(t('admin.statut_droits', { salon: `${salon}` })));
      }
      await interaction.deferReply({ flags: 64 });
      const id = await statut.configurerSalon(client, salon.id);
      return interaction.editReply(id
        ? C.succes(t('admin.statut_ok', { salon: `${salon}`, lien: `https://discord.com/channels/${interaction.guild.id}/${salon.id}/${id}` }))
        : C.erreur(t('admin.statut_echec', { salon: `${salon}` })));
    }

    // ------------------------------------------------------------ PREMIUM
    if (sous === 'premium' || sous === 'premium-remove' || sous === 'premium-list') {
      const premium = require('../../utils/premium');

      if (sous === 'premium-list') {
        const lignes = premium.liste();
        return interaction.reply(C.envoiPrive([C.conteneur([
          C.texte(`## ${E('etoile')} ${t('admin.premiums_titre')}`),
          C.texte(
            lignes.length
              ? lignes.map((l) => {
                  const g = client.guilds.cache.get(l.guild_id);
                  const fin = l.jusqu_a ? `<t:${Math.floor(l.jusqu_a / 1000)}:R>` : t('admin.sans_limite');
                  const source = l.source === 'offert' ? t('admin.source_offert') : t('admin.source_discord');
                  return t('admin.premiums_ligne', { serveur: g?.name ?? l.guild_id, source, fin });
                }).join('\n')
              : t('admin.premiums_vide')
          ),
        ], conf.couleurs.principale)]));
      }

      const serveurId = interaction.options.getString('server').trim();
      if (!/^\d{17,20}$/.test(serveurId)) {
        return interaction.reply(C.erreurPrivee(t('admin.identifiant_invalide')));
      }
      const nomServeur = client.guilds.cache.get(serveurId)?.name ?? serveurId;

      if (sous === 'premium-remove') {
        const avait = premium.retirer(serveurId);
        if (avait) tracer(interaction, '💔 Premium retiré', [`**Serveur** · ${nomServeur} (\`${serveurId}\`)`], conf.couleurs.avertissement);
        return interaction.reply(avait
          ? C.succesPrive(t('admin.premium_retire', { serveur: nomServeur }))
          : C.infoPrivee(t('admin.premium_absent', { serveur: nomServeur })));
      }

      const jours = interaction.options.getInteger('days');
      const fin = jours ? Date.now() + jours * 86_400_000 : null;
      premium.accorder(serveurId, { source: 'offert', jusqu_a: fin, par: interaction.user.id });
      tracer(interaction, '💎 Premium offert', [
        `**Serveur** · ${nomServeur} (\`${serveurId}\`)`,
        `**Jusqu'au** · ${fin ? `<t:${Math.floor(fin / 1000)}:D>` : 'sans limite'}`,
      ], 0xb18cff);

      return interaction.reply(C.succesPrive(
        t('admin.premium_offert', { serveur: nomServeur })
        + (fin ? t('admin.premium_jusquau', { date: `<t:${Math.floor(fin / 1000)}:D>` }) : t('admin.premium_sans_fin'))
      ));
    }

    // --------------------------------------------------------------- ETAT
    if (sous === 'status') {
      const serveurs = client.guilds.cache;
      const membres = serveurs.reduce((n, g) => n + (g.memberCount ?? 0), 0);
      const etatIntents = capacites.resume();
      const memoire = Math.round(process.memoryUsage().rss / 1024 / 1024);
      const debout = Math.floor(process.uptime());
      const labelsIntents = { contenuMessages: t('admin.intent_contenu_messages'), membres: t('admin.intent_membres') };

      return interaction.reply(C.envoiPrive([C.conteneur([
        C.texte(`## ${E('statistiques')} ${t('admin.etat_titre')}`),
        C.texte(
          `**${t('admin.etat_serveurs')}** · ${formaterNombre(serveurs.size)}\n`
          + `**${t('admin.etat_membres')}** · ${formaterNombre(membres)}\n`
          + `**${t('admin.etat_commandes')}** · ${client.commandes.size}\n`
          + `**${t('admin.etat_xp')}** · ${formaterNombre(compter('xp'))}\n`
          + `**${t('admin.etat_sanctions')}** · ${formaterNombre(compter('sanctions'))}\n`
          + `**${t('admin.etat_tickets')}** · ${formaterNombre(compter('tickets'))}\n`
          + `**${t('admin.etat_veille')}** · ${formaterNombre(compter('veille'))}\n`
          + `**${t('admin.etat_listenoire')}** · ${formaterNombre(compter('liste_noire'))}\n`
          + `**${t('admin.etat_memoire')}** · ${memoire} Mo`
        ),
        C.separateur(),
        C.texte(
          `**${t('admin.etat_intents')}** · ${etatIntents.complet
            ? `${E('succes')} ${t('admin.etat_intents_ok')}`
            : `${E('avertissement')} ${t('admin.etat_intents_manque', { liste: etatIntents.manquants.map((m) => labelsIntents[m] ?? m).join(', ') })}`}\n`
          + `**${t('admin.etat_debout')}** · <t:${Math.floor(Date.now() / 1000) - debout}:R>`
        ),
      ], conf.couleurs.principale)]));
    }

    // ----------------------------------------------------------- SERVEURS
    if (sous === 'servers') {
      const filtre = (interaction.options.getString('search') ?? '').toLowerCase();
      const tous = [...client.guilds.cache.values()]
        .filter((g) => !filtre || g.name.toLowerCase().includes(filtre))
        .sort((a, b) => (b.memberCount ?? 0) - (a.memberCount ?? 0));

      const pages = Math.max(1, Math.ceil(tous.length / PAR_PAGE));
      const page = Math.min(interaction.options.getInteger('page') ?? 1, pages);
      const tranche = tous.slice((page - 1) * PAR_PAGE, page * PAR_PAGE);

      const lignes = tranche.map((g) => {
        const xp = /^\d+$/.test(g.id) ? compter('xp', `WHERE guild_id = '${g.id}'`) : 0;
        return t('admin.serveurs_ligne', { id: g.id, nom: tronquer(g.name, 40), n: formaterNombre(g.memberCount ?? 0), xp });
      });

      return interaction.reply(C.envoiPrive([C.conteneur([
        C.texte(`## ${E('membres')} ${t('admin.serveurs_titre', { n: tous.length, filtre: filtre ? t('admin.serveurs_filtre', { filtre }) : '' })}`),
        C.texte(lignes.join('\n') || '_-_'),
        C.separateur(),
        C.texte(`-# ${t('admin.serveurs_pied', { page, pages })}`),
      ], conf.couleurs.principale)]));
    }

    // ------------------------------------------------------------ QUITTER
    if (sous === 'leave') {
      const id = interaction.options.getString('server');
      const guild = client.guilds.cache.get(id);
      if (!guild) {
        return interaction.reply(C.erreurPrivee(t('admin.quitter_absent', { id })));
      }
      const nom = guild.name;
      await guild.leave();
      tracer(interaction, '🚪 Serveur quitté', [`**Serveur** · ${nom} (\`${id}\`)`, `**Membres** · ${guild.memberCount ?? '?'}`], conf.couleurs.avertissement);
      // Les donnees partent toutes seules : guildDelete s'en charge.
      return interaction.reply(C.succesPrive(t('admin.quitter_fait', { nom })));
    }

    // ------------------------------------------------------------ BLOQUER
    if (sous === 'block') {
      const genre = interaction.options.getString('type');
      const id = interaction.options.getString('id').trim();
      const raison = interaction.options.getString('reason');

      if (!/^\d{17,20}$/.test(id)) {
        return interaction.reply(C.erreurPrivee(t('admin.identifiant_discord_invalide')));
      }
      // Se bloquer soi-meme fermerait la porte de l'interieur.
      if (genre === 'membre' && fondateur.estFondateur(id)) {
        return interaction.reply(C.erreurPrivee(t('admin.bloquer_fondateur_interdit')));
      }
      if (genre === 'serveur' && fondateur.estSupport(id)) {
        return interaction.reply(C.erreurPrivee(t('admin.bloquer_support_interdit')));
      }

      fondateur.bloquer(id, genre, { raison, par: interaction.user.id });
      tracer(interaction, '⛔ Ajout à la liste noire', [
        `**${genre === 'serveur' ? 'Serveur' : 'Membre'}** · \`${id}\`${genre === 'membre' ? ` (<@${id}>)` : ''}`,
        `**Raison** · ${raison ?? '—'}`,
      ], conf.couleurs.erreur);

      let sortie = '';
      if (genre === 'serveur') {
        const guild = client.guilds.cache.get(id);
        if (guild) {
          await guild.leave().catch(() => null);
          sortie = t('admin.bloque_quitte', { nom: guild.name });
        }
      }

      return interaction.reply(C.succesPrive(
        t('admin.bloque_fait', { genre: genre === 'serveur' ? t('admin.genre_serveur_label') : t('admin.genre_membre_label'), id })
        + (raison ? t('admin.bloque_raison', { raison }) : '')
        + sortie
      ));
    }

    // ---------------------------------------------------------- DEBLOQUER
    if (sous === 'unblock') {
      const id = interaction.options.getString('id').trim();
      const retire = fondateur.debloquer(id);
      if (retire) tracer(interaction, '♻️ Retiré de la liste noire', [`**ID** · \`${id}\``], conf.couleurs.succes);
      return interaction.reply(retire
        ? C.succesPrive(t('admin.debloque_fait', { id }))
        : C.avertissementPrivee(t('admin.debloque_absent', { id })));
    }

    // --------------------------------------------------------- LISTE NOIRE
    const liste = fondateur.listeNoire();
    const lignes = liste.map((l) => {
      const quand = `<t:${Math.floor(l.date / 1000)}:d>`;
      const quoi = l.genre === 'serveur' ? E('membres') : E('moderation');
      return t('admin.listenoire_ligne', { quoi, id: l.id, quand, raison: l.raison ? t('admin.listenoire_raison_suffixe', { raison: tronquer(l.raison, 80) }) : '' });
    });

    return interaction.reply(C.envoiPrive([C.conteneur([
      C.texte(`## ${E('drapeau')} ${t('admin.listenoire_titre', { n: liste.length })}`),
      C.texte(lignes.join('\n') || t('admin.listenoire_vide')),
    ], liste.length ? conf.couleurs.avertissement : conf.couleurs.info)]));
  },
};
