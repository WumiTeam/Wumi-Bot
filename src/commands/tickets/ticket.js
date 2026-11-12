const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  InteractionContextType,
  ChannelType,
} = require('discord.js');
const conf = require('../../../config');
const C = require('../../utils/composants');
const { req, config, majConfig } = require('../../database/db');
const { ts } = require('../../utils/outils');
const { construirePanneau, fermerTicket } = require('../../utils/tickets');
const { E } = require('../../utils/emojis');
const { traducteur, localisations, t: tr, DEFAUT } = require('../../utils/langues');

const SALONS_TEXTE = [ChannelType.GuildText, ChannelType.GuildAnnouncement];

module.exports = {
  categorie: 'tickets',

  data: new SlashCommandBuilder()
    // « ticket » s'ecrit pareil dans les deux langues : pas de localisation de nom.
    .setName('ticket')
    .setDescription(tr('ticket.description_commande', DEFAUT))
    .setDescriptionLocalizations(localisations('ticket.description_commande'))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .setContexts(InteractionContextType.Guild)

    .addSubcommand((s) =>
      s
        .setName('panel')
        .setNameLocalizations({ fr: 'panneau' })
        .setDescription(tr('ticket.sous_panneau', DEFAUT))
        .setDescriptionLocalizations(localisations('ticket.sous_panneau'))
        .addChannelOption((o) =>
          o.setName('channel').setNameLocalizations({ fr: 'salon' }).setDescription(tr('ticket.opt_salon_panneau', DEFAUT)).setDescriptionLocalizations(localisations('ticket.opt_salon_panneau')).addChannelTypes(...SALONS_TEXTE)
        )
    )
    .addSubcommand((s) =>
      s
        .setName('close')
        .setNameLocalizations({ fr: 'fermer' })
        .setDescription(tr('ticket.sous_fermer', DEFAUT))
        .setDescriptionLocalizations(localisations('ticket.sous_fermer'))
        .addStringOption((o) =>
          o.setName('reason').setNameLocalizations({ fr: 'raison' }).setDescription(tr('ticket.opt_raison', DEFAUT)).setDescriptionLocalizations(localisations('ticket.opt_raison')).setMaxLength(200)
        )
    )
    .addSubcommand((s) =>
      s
        .setName('add')
        .setNameLocalizations({ fr: 'ajouter' })
        .setDescription(tr('ticket.sous_ajouter', DEFAUT))
        .setDescriptionLocalizations(localisations('ticket.sous_ajouter'))
        .addUserOption((o) =>
          o.setName('member').setNameLocalizations({ fr: 'membre' }).setDescription(tr('ticket.opt_membre_ajouter', DEFAUT)).setDescriptionLocalizations(localisations('ticket.opt_membre_ajouter')).setRequired(true)
        )
    )
    .addSubcommand((s) =>
      s
        .setName('remove')
        .setNameLocalizations({ fr: 'retirer' })
        .setDescription(tr('ticket.sous_retirer', DEFAUT))
        .setDescriptionLocalizations(localisations('ticket.sous_retirer'))
        .addUserOption((o) =>
          o.setName('member').setNameLocalizations({ fr: 'membre' }).setDescription(tr('ticket.opt_membre_retirer', DEFAUT)).setDescriptionLocalizations(localisations('ticket.opt_membre_retirer')).setRequired(true)
        )
    )
    .addSubcommand((s) =>
      s
        .setName('rename')
        .setNameLocalizations({ fr: 'renommer' })
        .setDescription(tr('ticket.sous_renommer', DEFAUT))
        .setDescriptionLocalizations(localisations('ticket.sous_renommer'))
        .addStringOption((o) =>
          o.setName('name').setNameLocalizations({ fr: 'nom' }).setDescription(tr('ticket.opt_nom', DEFAUT)).setDescriptionLocalizations(localisations('ticket.opt_nom')).setRequired(true).setMaxLength(90)
        )
    )
    .addSubcommand((s) =>
      s
        .setName('list')
        .setNameLocalizations({ fr: 'liste' })
        .setDescription(tr('ticket.sous_liste', DEFAUT))
        .setDescriptionLocalizations(localisations('ticket.sous_liste'))
    )
    .addSubcommand((s) =>
      s
        // « stats » s'ecrit pareil dans les deux langues.
        .setName('stats')
        .setDescription(tr('ticket.v2.sous_stats', DEFAUT))
        .setDescriptionLocalizations(localisations('ticket.v2.sous_stats'))
        .addIntegerOption((o) =>
          o.setName('days').setNameLocalizations({ fr: 'jours' }).setDescription(tr('ticket.v2.opt_jours', DEFAUT)).setDescriptionLocalizations(localisations('ticket.v2.opt_jours')).setMinValue(1).setMaxValue(365)
        )
    )

    .addSubcommandGroup((g) =>
      g
        // « config » s'ecrit pareil dans les deux langues.
        .setName('config')
        .setDescription(tr('ticket.grp_config', DEFAUT))
        .setDescriptionLocalizations(localisations('ticket.grp_config'))
        .addSubcommand((s) =>
          s
            .setName('category')
            .setNameLocalizations({ fr: 'categorie' })
            .setDescription(tr('ticket.sous_config_categorie', DEFAUT))
            .setDescriptionLocalizations(localisations('ticket.sous_config_categorie'))
            .addChannelOption((o) =>
              o.setName('category').setNameLocalizations({ fr: 'categorie' }).setDescription(tr('ticket.opt_categorie', DEFAUT)).setDescriptionLocalizations(localisations('ticket.opt_categorie')).addChannelTypes(ChannelType.GuildCategory)
            )
        )
        .addSubcommand((s) =>
          s
            // « staff » s'ecrit pareil dans les deux langues.
            .setName('staff')
            .setDescription(tr('ticket.sous_config_staff', DEFAUT))
            .setDescriptionLocalizations(localisations('ticket.sous_config_staff'))
            .addRoleOption((o) =>
              // « role » s'ecrit pareil dans les deux langues (sans accent).
              o.setName('role').setDescription(tr('ticket.opt_role', DEFAUT)).setDescriptionLocalizations(localisations('ticket.opt_role'))
            )
        )
        .addSubcommand((s) =>
          s
            // « logs » s'ecrit pareil dans les deux langues.
            .setName('logs')
            .setDescription(tr('ticket.sous_config_logs', DEFAUT))
            .setDescriptionLocalizations(localisations('ticket.sous_config_logs'))
            .addChannelOption((o) =>
              o.setName('channel').setNameLocalizations({ fr: 'salon' }).setDescription(tr('ticket.opt_salon_logs', DEFAUT)).setDescriptionLocalizations(localisations('ticket.opt_salon_logs')).addChannelTypes(...SALONS_TEXTE)
            )
        )
        .addSubcommand((s) =>
          s
            .setName('limit')
            .setNameLocalizations({ fr: 'limite' })
            .setDescription(tr('ticket.sous_config_limite', DEFAUT))
            .setDescriptionLocalizations(localisations('ticket.sous_config_limite'))
            .addIntegerOption((o) =>
              o.setName('number').setNameLocalizations({ fr: 'nombre' }).setDescription(tr('ticket.opt_nombre', DEFAUT)).setDescriptionLocalizations(localisations('ticket.opt_nombre')).setRequired(true).setMinValue(0).setMaxValue(10)
            )
        )
        .addSubcommand((s) =>
          s
            .setName('form')
            .setNameLocalizations({ fr: 'formulaire' })
            .setDescription(tr('ticket.sous_config_formulaire', DEFAUT))
            .setDescriptionLocalizations(localisations('ticket.sous_config_formulaire'))
            .addBooleanOption((o) =>
              o.setName('enabled').setNameLocalizations({ fr: 'actif' }).setDescription(tr('ticket.opt_actif', DEFAUT)).setDescriptionLocalizations(localisations('ticket.opt_actif')).setRequired(true)
            )
        )
        .addSubcommand((s) =>
          s
            .setName('panel-text')
            .setNameLocalizations({ fr: 'panneau-texte' })
            .setDescription(tr('ticket.sous_config_panneau_texte', DEFAUT))
            .setDescriptionLocalizations(localisations('ticket.sous_config_panneau_texte'))
            .addStringOption((o) =>
              o.setName('title').setNameLocalizations({ fr: 'titre' }).setDescription(tr('ticket.opt_titre', DEFAUT)).setDescriptionLocalizations(localisations('ticket.opt_titre')).setMaxLength(200)
            )
            // « message » s'ecrit pareil dans les deux langues.
            .addStringOption((o) =>
              o.setName('message').setDescription(tr('ticket.opt_message', DEFAUT)).setDescriptionLocalizations(localisations('ticket.opt_message')).setMaxLength(1500)
            )
            .addStringOption((o) =>
              o.setName('button').setNameLocalizations({ fr: 'bouton' }).setDescription(tr('ticket.opt_bouton', DEFAUT)).setDescriptionLocalizations(localisations('ticket.opt_bouton')).setMaxLength(60)
            )
        )
        .addSubcommand((s) =>
          s
            .setName('type-add')
            .setNameLocalizations({ fr: 'type-ajouter' })
            .setDescription(tr('ticket.sous_config_type_ajouter', DEFAUT))
            .setDescriptionLocalizations(localisations('ticket.sous_config_type_ajouter'))
            .addStringOption((o) =>
              o.setName('name').setNameLocalizations({ fr: 'nom' }).setDescription(tr('ticket.opt_type_nom', DEFAUT)).setDescriptionLocalizations(localisations('ticket.opt_type_nom')).setRequired(true).setMaxLength(80)
            )
            // « emoji » s'ecrit pareil dans les deux langues.
            .addStringOption((o) =>
              o.setName('emoji').setDescription(tr('ticket.opt_type_emoji', DEFAUT)).setDescriptionLocalizations(localisations('ticket.opt_type_emoji')).setMaxLength(10)
            )
            // « description » s'ecrit pareil dans les deux langues.
            .addStringOption((o) =>
              o.setName('description').setDescription(tr('ticket.opt_type_description', DEFAUT)).setDescriptionLocalizations(localisations('ticket.opt_type_description')).setMaxLength(90)
            )
        )
        .addSubcommand((s) =>
          s
            .setName('type-remove')
            .setNameLocalizations({ fr: 'type-retirer' })
            .setDescription(tr('ticket.sous_config_type_retirer', DEFAUT))
            .setDescriptionLocalizations(localisations('ticket.sous_config_type_retirer'))
            .addStringOption((o) =>
              o.setName('name').setNameLocalizations({ fr: 'nom' }).setDescription(tr('ticket.opt_type_retirer_nom', DEFAUT)).setDescriptionLocalizations(localisations('ticket.opt_type_retirer_nom')).setRequired(true).setAutocomplete(true)
            )
        )
        .addSubcommand((s) =>
          s
            .setName('banner')
            .setNameLocalizations({ fr: 'banniere' })
            .setDescription(tr('ticket.v2.sous_banniere', DEFAUT))
            .setDescriptionLocalizations(localisations('ticket.v2.sous_banniere'))
            .addBooleanOption((o) =>
              o.setName('enabled').setNameLocalizations({ fr: 'actif' }).setDescription(tr('ticket.opt_actif', DEFAUT)).setDescriptionLocalizations(localisations('ticket.opt_actif')).setRequired(true)
            )
        )
        .addSubcommand((s) =>
          s
            .setName('inactivity')
            .setNameLocalizations({ fr: 'inactivite' })
            .setDescription(tr('ticket.v2.sous_inactivite', DEFAUT))
            .setDescriptionLocalizations(localisations('ticket.v2.sous_inactivite'))
            .addIntegerOption((o) =>
              o.setName('hours').setNameLocalizations({ fr: 'heures' }).setDescription(tr('ticket.v2.opt_heures', DEFAUT)).setDescriptionLocalizations(localisations('ticket.v2.opt_heures')).setRequired(true).setMinValue(0).setMaxValue(720)
            )
        )
        .addSubcommand((s) =>
          s
            .setName('alert')
            .setNameLocalizations({ fr: 'alerte' })
            .setDescription(tr('ticket.v2.sous_alerte', DEFAUT))
            .setDescriptionLocalizations(localisations('ticket.v2.sous_alerte'))
            .addIntegerOption((o) =>
              o.setName('minutes').setDescription(tr('ticket.v2.opt_minutes', DEFAUT)).setDescriptionLocalizations(localisations('ticket.v2.opt_minutes')).setRequired(true).setMinValue(0).setMaxValue(10080)
            )
        )
        .addSubcommand((s) =>
          s
            .setName('view')
            .setNameLocalizations({ fr: 'voir' })
            .setDescription(tr('ticket.sous_config_voir', DEFAUT))
            .setDescriptionLocalizations(localisations('ticket.sous_config_voir'))
        )
    ),

  async autocomplete(interaction) {
    const saisie = interaction.options.getFocused().toLowerCase();
    const types = req.typesTickets
      .all(interaction.guild.id)
      // t.label est ecrit par un membre du staff : une DONNEE, pas une chaine d'interface.
      .filter((t) => t.label.toLowerCase().includes(saisie))
      .slice(0, 25);
    return interaction.respond(types.map((t) => ({ name: t.label, value: t.cle })));
  },

  async execute(interaction) {
    const { t } = traducteur(interaction);
    const groupe = interaction.options.getSubcommandGroup(false);
    const sous = interaction.options.getSubcommand();
    const guildId = interaction.guild.id;

    // ==================================================== CONFIGURATION
    if (groupe === 'config') {
      if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
        return interaction.reply(C.erreurPrivee(t('ticket.config_permission')));
      }

      switch (sous) {
        case 'category': {
          const categorie = interaction.options.getChannel('category');
          majConfig(guildId, { ticket_categorie: categorie?.id ?? null });
          return interaction.reply(C.succes(categorie
            ? t('ticket.config_categorie_definie', { categorie: categorie.name })
            : t('ticket.config_categorie_racine')));
        }
        case 'staff': {
          const role = interaction.options.getRole('role');
          majConfig(guildId, { ticket_role_staff: role?.id ?? null });
          return interaction.reply(C.succes(role
            ? t('ticket.config_staff_definie', { role: `${role}` })
            : t('ticket.config_staff_aucun')));
        }
        case 'logs': {
          const salon = interaction.options.getChannel('channel');
          majConfig(guildId, { ticket_logs: salon?.id ?? null });
          return interaction.reply(C.succes(salon
            ? t('ticket.config_logs_definis', { salon: `${salon}` })
            : t('ticket.config_logs_defaut')));
        }
        case 'limit': {
          const nombre = interaction.options.getInteger('number');
          majConfig(guildId, { ticket_max: nombre });
          return interaction.reply(C.succes(nombre === 0
            ? t('ticket.config_limite_illimitee')
            : t('ticket.config_limite_definie', { n: nombre })));
        }
        case 'form': {
          const actif = interaction.options.getBoolean('enabled');
          majConfig(guildId, { ticket_formulaire: actif ? 1 : 0 });
          return interaction.reply(C.succes(actif
            ? t('ticket.config_formulaire_active')
            : t('ticket.config_formulaire_desactive')));
        }
        case 'panel-text': {
          const valeurs = {};
          const titre = interaction.options.getString('title');
          const message = interaction.options.getString('message');
          const bouton = interaction.options.getString('button');
          if (titre !== null) valeurs.ticket_titre = titre;
          if (message !== null) valeurs.ticket_message = message.replaceAll('\\n', '\n');
          if (bouton !== null) valeurs.ticket_bouton = bouton;
          if (!Object.keys(valeurs).length) {
            return interaction.reply(C.erreurPrivee(t('ticket.config_panneau_texte_manque')));
          }
          majConfig(guildId, valeurs);
          return interaction.reply(C.succes(t('ticket.config_panneau_texte_maj')));
        }
        case 'banner': {
          const actif = interaction.options.getBoolean('enabled');
          majConfig(guildId, { ticket_banniere: actif ? 1 : 0 });
          return interaction.reply(C.succes(t(actif ? 'ticket.v2.banniere_active' : 'ticket.v2.banniere_desactivee')));
        }
        case 'alert': {
          const minutes = interaction.options.getInteger('minutes');
          majConfig(guildId, { ticket_alerte_minutes: minutes });
          return interaction.reply(C.succes(minutes ? t('ticket.v2.alerte_ok', { n: minutes }) : t('ticket.v2.alerte_off')));
        }
        case 'inactivity': {
          const heures = interaction.options.getInteger('hours');
          majConfig(guildId, { ticket_inactif_heures: heures });
          return interaction.reply(C.succes(heures ? t('ticket.v2.inactivite_ok', { n: heures }) : t('ticket.v2.inactivite_off')));
        }
        case 'type-add': {
          const nom = interaction.options.getString('name');
          const cle = nom
            .toLowerCase()
            .normalize('NFD')
            .replace(/[̀-ͯ]/g, '')
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, '')
            .slice(0, 40);
          if (!cle) {
            return interaction.reply(C.erreurPrivee(t('ticket.config_type_nom_invalide')));
          }
          if (req.typesTickets.all(guildId).length >= 25) {
            return interaction.reply(C.erreurPrivee(t('ticket.config_type_max')));
          }
          req.ajouterTypeTicket.run(
            guildId,
            cle,
            nom,
            interaction.options.getString('emoji') ?? null,
            interaction.options.getString('description') ?? null
          );
          return interaction.reply(C.succes(t('ticket.config_type_ajoute', { nom })));
        }
        case 'type-remove': {
          const cle = interaction.options.getString('name');
          const res = req.retirerTypeTicket.run(guildId, cle);
          return interaction.reply(res.changes
            ? C.succes(t('ticket.config_type_retire'))
            : C.erreurPrivee(t('ticket.config_type_introuvable')));
        }
        default: {
          const cfg = config(guildId);
          const types = req.typesTickets.all(guildId);
          const stats = req.statsTickets.get(guildId);
          return interaction.reply(C.envoi([C.conteneur([
            C.texte(`## ${E('tickets')} ${t('ticket.config_titre')}`),
            C.texte([
              `**${t('ticket.config_categorie_label')}** — ${cfg.ticket_categorie ? `<#${cfg.ticket_categorie}>` : `\`${t('ticket.config_categorie_valeur_racine')}\``}`,
              `**${t('ticket.config_staff_label')}** — ${cfg.ticket_role_staff ? `<@&${cfg.ticket_role_staff}>` : `\`${t('ticket.config_staff_valeur_aucun')}\``}`,
              `**${t('ticket.config_archivage_label')}** — ${cfg.ticket_logs ? `<#${cfg.ticket_logs}>` : `\`${t('ticket.config_archivage_valeur')}\``}`,
              `**${t('ticket.config_limite_label')}** — ${cfg.ticket_max === 0 ? t('ticket.config_limite_valeur_illimitee') : cfg.ticket_max}`,
              `**${t('ticket.config_formulaire_label')}** — ${cfg.ticket_formulaire ? `${E('succes')} ${t('commun.actif')}` : `${E('erreur')} ${t('commun.inactif')}`}`,
              `**${t('ticket.v2.banniere_label')}** — ${cfg.ticket_banniere ? `${E('succes')} ${t('commun.actif')}` : `${E('erreur')} ${t('commun.inactif')}`}`,
              `**${t('ticket.v2.inactivite_label')}** — ${cfg.ticket_inactif_heures ? t('ticket.v2.inactivite_valeur', { n: cfg.ticket_inactif_heures }) : t('commun.inactif')}`,
              `**${t('ticket.v2.alerte_label')}** — ${cfg.ticket_alerte_minutes ? t('ticket.v2.alerte_valeur', { n: cfg.ticket_alerte_minutes }) : t('commun.inactif')}`,
              `**${t('ticket.config_crees_label')}** — ${cfg.ticket_compteur ?? 0}`,
              `**${t('ticket.config_ouverts_label')}** — ${stats?.ouverts ?? 0}`,
            ].join('\n')),
            C.separateur(),
            C.texte(
              `**${t('ticket.config_motifs_label', { n: types.length })}**\n`
              + (types.length ? types.map((tt) => `${tt.emoji ?? '•'} ${tt.label}`).join('\n') : t('ticket.config_motifs_vide'))
            ),
            C.texte(`-# ${t('ticket.config_pied')}`),
          ], conf.couleurs.principale)]));
        }
      }
    }

    // ========================================================== PANNEAU
    if (sous === 'panel') {
      if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
        return interaction.reply(C.erreurPrivee(t('ticket.panneau_permission')));
      }
      const salon = interaction.options.getChannel('channel') ?? interaction.channel;
      await salon.send(construirePanneau(interaction.guild));
      return interaction.reply(C.succesPrive(t('ticket.panneau_publie', { salon: `${salon}` })));
    }

    // =========================================================== STATS
    if (sous === 'stats') return statistiques(interaction);

    // =========================================================== LISTE
    if (sous === 'list') {
      const ouverts = req.ticketsOuverts.all(guildId);
      if (!ouverts.length) return interaction.reply(C.info(t('ticket.liste_vide')));

      return interaction.reply(C.envoi([C.conteneur([
        C.texte(`## ${E('tickets')} ${t('ticket.liste_titre', { n: ouverts.length })}`),
        C.texte(ouverts
          .slice(0, 20)
          .map((tk) => t('ticket.liste_ligne', {
            numero: tk.numero,
            salon: `<#${tk.channel_id}>`,
            membre: `<@${tk.user_id}>`,
            date: ts(tk.cree_le, 'R'),
            pris: tk.pris_par ? t('ticket.liste_ligne_pris', { membre: `<@${tk.pris_par}>` }) : t('ticket.liste_ligne_non_pris'),
          }))
          .join('\n')),
        ouverts.length > 20 ? C.texte(`-# ${t('ticket.liste_pied_reste', { n: ouverts.length })}`) : null,
      ], conf.couleurs.principale)]));
    }

    // ================================================== DANS UN TICKET
    const ticket = req.ticketParSalon.get(interaction.channel.id);
    if (!ticket || ticket.statut === 'ferme') {
      return interaction.reply(C.erreurPrivee(t('ticket.hors_ticket')));
    }

    if (sous === 'close') {
      return fermerTicket(interaction, interaction.options.getString('reason'));
    }

    if (sous === 'rename') {
      const nom = interaction.options.getString('name');
      await interaction.channel.setName(nom, t('ticket.raison_renomme', { membre: interaction.user.tag }));
      return interaction.reply(C.succes(t('ticket.renomme', { nom })));
    }

    const membre = interaction.options.getUser('member');
    if (sous === 'add') {
      await interaction.channel.permissionOverwrites.edit(membre.id, {
        ViewChannel: true,
        SendMessages: true,
        ReadMessageHistory: true,
        AttachFiles: true,
      });
      return interaction.reply(C.succes(t('ticket.membre_ajoute', { membre: `${membre}` })));
    }

    if (sous === 'remove') {
      if (membre.id === ticket.user_id) {
        return interaction.reply(C.erreurPrivee(t('ticket.retrait_impossible')));
      }
      await interaction.channel.permissionOverwrites.delete(membre.id).catch(() => null);
      return interaction.reply(C.succes(t('ticket.membre_retire', { membre: `${membre}` })));
    }
  },
};

/**
 * /ticket stats : la charge de l'equipe et sa reactivite.
 * Temps de premiere reponse, notes des membres, classement du staff.
 */
async function statistiques(interaction) {
  const { t, langue, nombre, duree } = traducteur(interaction);
  const { q } = require('../../utils/tickets');
  const jours = interaction.options.getInteger('days') ?? 30;
  const depuis = Date.now() - jours * 86_400_000;
  const g = q.statsGlobal.get(interaction.guild.id, depuis);
  const ouverts = q.ouverts.get(interaction.guild.id).n;
  if (!g.total) return interaction.reply(C.info(t('ticket.v2.stats_vide', { n: jours })));

  const etoiles = (n) => (n ? `${(Math.round(n * 10) / 10).toLocaleString(langue)} ★` : '—');
  const rep = (ms) => (ms ? duree(Math.max(60_000, Math.round(ms)), langue) : '—');
  const staff = q.statsStaff.all(interaction.guild.id, depuis);
  const medailles = ['🥇', '🥈', '🥉'];

  return interaction.reply(C.envoi([C.conteneur([
    C.texte(`## 📊 ${t('ticket.v2.stats_titre')}\n${t('ticket.v2.stats_periode', { n: nombre(jours) })}`),
    C.separateur(),
    C.texte([
      `🎫 **${t('ticket.v2.stats_ouverts')}** · ${nombre(g.total)} (${t('ticket.v2.stats_en_cours', { n: nombre(ouverts) })})`,
      `✅ **${t('ticket.v2.stats_fermes')}** · ${nombre(g.fermes ?? 0)}`,
      `⚡ **${t('ticket.v2.stats_reponse')}** · ${rep(g.reponse)}`,
      `⭐ **${t('ticket.v2.stats_note')}** · ${etoiles(g.note)}${g.notes ? ` · ${t('ticket.v2.stats_avis', { n: nombre(g.notes) })}` : ''}`,
      g.sans_reponse ? `⚠️ ${t('ticket.v2.stats_sans_reponse', { n: nombre(g.sans_reponse) })}` : null,
    ].filter(Boolean).join('\n')),
    C.separateur(),
    C.texte(`### ${t('ticket.v2.stats_equipe')}\n${staff.length
      ? staff.map((s, i) => `${medailles[i] ?? `**${i + 1}.**`} <@${s.pris_par}> · ${t('ticket.v2.stats_ligne', { n: nombre(s.n), reponse: rep(s.reponse), note: etoiles(s.note) })}`).join('\n')
      : t('ticket.v2.stats_equipe_vide')}`),
    C.texte(`-# ${t('ticket.v2.stats_pied')}`),
  ], conf.couleurs.principale)]));
}

