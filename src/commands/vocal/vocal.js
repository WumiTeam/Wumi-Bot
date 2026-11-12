const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  InteractionContextType,
  ChannelType,
} = require('discord.js');
const conf = require('../../../config');
const C = require('../../utils/composants');
const { req } = require('../../database/db');
const { ts } = require('../../utils/outils');
const vocaux = require('../../utils/vocauxTemporaires');
const { E } = require('../../utils/emojis');
const { traducteur, localisations, t: tr, DEFAUT } = require('../../utils/langues');

module.exports = {
  categorie: 'vocal',

  data: new SlashCommandBuilder()
    .setName('voice')
    .setNameLocalizations({ fr: 'vocal' })
    .setDescription(tr('vocal.description_commande', DEFAUT))
    .setDescriptionLocalizations(localisations('vocal.description_commande'))
    .setContexts(InteractionContextType.Guild)

    .addSubcommand((s) =>
      s
        .setName('name')
        .setNameLocalizations({ fr: 'nom' })
        .setDescription(tr('vocal.sous_nom', DEFAUT))
        .setDescriptionLocalizations(localisations('vocal.sous_nom'))
        .addStringOption((o) =>
          o.setName('name').setNameLocalizations({ fr: 'nom' }).setDescription(tr('vocal.opt_nom', DEFAUT)).setDescriptionLocalizations(localisations('vocal.opt_nom')).setRequired(true).setMaxLength(100)
        )
    )
    .addSubcommand((s) =>
      s
        .setName('limit')
        .setNameLocalizations({ fr: 'places' })
        .setDescription(tr('vocal.sous_places', DEFAUT))
        .setDescriptionLocalizations(localisations('vocal.sous_places'))
        .addIntegerOption((o) =>
          o.setName('number').setNameLocalizations({ fr: 'nombre' }).setDescription(tr('vocal.opt_nombre', DEFAUT)).setDescriptionLocalizations(localisations('vocal.opt_nombre')).setRequired(true).setMinValue(0).setMaxValue(99)
        )
    )
    .addSubcommand((s) => s.setName('lock').setNameLocalizations({ fr: 'verrouiller' }).setDescription(tr('vocal.sous_verrouiller', DEFAUT)).setDescriptionLocalizations(localisations('vocal.sous_verrouiller')))
    .addSubcommand((s) => s.setName('unlock').setNameLocalizations({ fr: 'deverrouiller' }).setDescription(tr('vocal.sous_deverrouiller', DEFAUT)).setDescriptionLocalizations(localisations('vocal.sous_deverrouiller')))
    .addSubcommand((s) => s.setName('hide').setNameLocalizations({ fr: 'cacher' }).setDescription(tr('vocal.sous_cacher', DEFAUT)).setDescriptionLocalizations(localisations('vocal.sous_cacher')))
    .addSubcommand((s) => s.setName('show').setNameLocalizations({ fr: 'afficher' }).setDescription(tr('vocal.sous_afficher', DEFAUT)).setDescriptionLocalizations(localisations('vocal.sous_afficher')))
    .addSubcommand((s) =>
      s
        .setName('allow')
        .setNameLocalizations({ fr: 'autoriser' })
        .setDescription(tr('vocal.sous_autoriser', DEFAUT))
        .setDescriptionLocalizations(localisations('vocal.sous_autoriser'))
        .addUserOption((o) =>
          o.setName('member').setNameLocalizations({ fr: 'membre' }).setDescription(tr('vocal.opt_membre_autoriser', DEFAUT)).setDescriptionLocalizations(localisations('vocal.opt_membre_autoriser')).setRequired(true)
        )
    )
    .addSubcommand((s) =>
      s
        .setName('kick')
        .setNameLocalizations({ fr: 'expulser' })
        .setDescription(tr('vocal.sous_expulser', DEFAUT))
        .setDescriptionLocalizations(localisations('vocal.sous_expulser'))
        .addUserOption((o) =>
          o.setName('member').setNameLocalizations({ fr: 'membre' }).setDescription(tr('vocal.opt_membre_expulser', DEFAUT)).setDescriptionLocalizations(localisations('vocal.opt_membre_expulser')).setRequired(true)
        )
    )
    .addSubcommand((s) =>
      s
        .setName('transfer')
        .setNameLocalizations({ fr: 'transferer' })
        .setDescription(tr('vocal.sous_transferer', DEFAUT))
        .setDescriptionLocalizations(localisations('vocal.sous_transferer'))
        .addUserOption((o) =>
          o.setName('member').setNameLocalizations({ fr: 'membre' }).setDescription(tr('vocal.opt_membre_transferer', DEFAUT)).setDescriptionLocalizations(localisations('vocal.opt_membre_transferer')).setRequired(true)
        )
    )
    .addSubcommand((s) => s.setName('panel').setNameLocalizations({ fr: 'panneau' }).setDescription(tr('vocal.sous_panneau', DEFAUT)).setDescriptionLocalizations(localisations('vocal.sous_panneau')))

    .addSubcommandGroup((g) =>
      g
        // « config » s'ecrit pareil dans les deux langues.
        .setName('config')
        .setDescription(tr('vocal.grp_config', DEFAUT))
        .setDescriptionLocalizations(localisations('vocal.grp_config'))
        .addSubcommand((s) =>
          s
            .setName('create-hub')
            .setNameLocalizations({ fr: 'creer-hub' })
            .setDescription(tr('vocal.sous_config_creer_hub', DEFAUT))
            .setDescriptionLocalizations(localisations('vocal.sous_config_creer_hub'))
            .addStringOption((o) =>
              o.setName('name').setNameLocalizations({ fr: 'nom' }).setDescription(tr('vocal.opt_hub_nom', DEFAUT)).setDescriptionLocalizations(localisations('vocal.opt_hub_nom')).setMaxLength(90)
            )
            .addChannelOption((o) =>
              o.setName('category').setNameLocalizations({ fr: 'categorie' }).setDescription(tr('vocal.opt_hub_categorie', DEFAUT)).setDescriptionLocalizations(localisations('vocal.opt_hub_categorie')).addChannelTypes(ChannelType.GuildCategory)
            )
            .addStringOption((o) =>
              o.setName('template').setNameLocalizations({ fr: 'modele' }).setDescription(tr('vocal.opt_hub_modele', DEFAUT)).setDescriptionLocalizations(localisations('vocal.opt_hub_modele')).setMaxLength(90)
            )
            .addIntegerOption((o) =>
              o.setName('limit').setNameLocalizations({ fr: 'places' }).setDescription(tr('vocal.opt_hub_places', DEFAUT)).setDescriptionLocalizations(localisations('vocal.opt_hub_places')).setMinValue(0).setMaxValue(99)
            )
        )
        .addSubcommand((s) =>
          s
            .setName('link-hub')
            .setNameLocalizations({ fr: 'lier-hub' })
            .setDescription(tr('vocal.sous_config_lier_hub', DEFAUT))
            .setDescriptionLocalizations(localisations('vocal.sous_config_lier_hub'))
            .addChannelOption((o) =>
              o.setName('channel').setNameLocalizations({ fr: 'salon' }).setDescription(tr('vocal.opt_lier_salon', DEFAUT)).setDescriptionLocalizations(localisations('vocal.opt_lier_salon')).setRequired(true).addChannelTypes(ChannelType.GuildVoice)
            )
            .addStringOption((o) =>
              o.setName('template').setNameLocalizations({ fr: 'modele' }).setDescription(tr('vocal.opt_lier_modele', DEFAUT)).setDescriptionLocalizations(localisations('vocal.opt_lier_modele')).setMaxLength(90)
            )
            .addIntegerOption((o) =>
              o.setName('limit').setNameLocalizations({ fr: 'places' }).setDescription(tr('vocal.opt_lier_places', DEFAUT)).setDescriptionLocalizations(localisations('vocal.opt_lier_places')).setMinValue(0).setMaxValue(99)
            )
        )
        .addSubcommand((s) =>
          s
            .setName('remove-hub')
            .setNameLocalizations({ fr: 'retirer-hub' })
            .setDescription(tr('vocal.sous_config_retirer_hub', DEFAUT))
            .setDescriptionLocalizations(localisations('vocal.sous_config_retirer_hub'))
            .addChannelOption((o) =>
              o.setName('channel').setNameLocalizations({ fr: 'salon' }).setDescription(tr('vocal.opt_retirer_salon', DEFAUT)).setDescriptionLocalizations(localisations('vocal.opt_retirer_salon')).setRequired(true).addChannelTypes(ChannelType.GuildVoice)
            )
        )
        .addSubcommand((s) =>
          s
            .setName('list')
            .setNameLocalizations({ fr: 'liste' })
            .setDescription(tr('vocal.sous_config_liste', DEFAUT))
            .setDescriptionLocalizations(localisations('vocal.sous_config_liste'))
        )
    ),

  async execute(interaction) {
    const { t } = traducteur(interaction);
    const groupe = interaction.options.getSubcommandGroup(false);
    const sous = interaction.options.getSubcommand();
    const guildId = interaction.guild.id;

    // ==================================================== CONFIGURATION
    if (groupe === 'config') {
      if (!interaction.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
        return interaction.reply(C.erreurPrivee(t('vocal.config_permission')));
      }

      if (sous === 'list') {
        const hubs = req.hubs.all(guildId);
        const actifs = req.vocauxTempGuild.all(guildId);
        return interaction.reply(C.envoi([C.conteneur([
          C.texte(`## ${E('vocal')} ${t('vocal.liste_titre')}`),
          C.texte(
            `**${t('vocal.liste_hubs_titre', { n: hubs.length })}**\n`
            + (hubs.length
              ? hubs.map((h) => t('vocal.liste_hubs_ligne', {
                  salon: `<#${h.channel_id}>`,
                  modele: h.modele,
                  // La cle ne porte pas l'espace de separation : t() la retire
                  // (trim), donc l'espace est ajoute ici, hors de tout t().
                  places: h.limite_defaut ? ` · ${t('vocal.liste_hubs_ligne_places', { n: h.limite_defaut })}` : '',
                })).join('\n')
              : t('vocal.liste_hubs_vide'))
          ),
          C.texte(
            `**${t('vocal.liste_actifs_titre', { n: actifs.length })}**\n`
            + (actifs.length
              ? actifs.map((a) => t('vocal.liste_actifs_ligne', {
                  salon: `<#${a.channel_id}>`,
                  membre: `<@${a.proprietaire_id}>`,
                  date: ts(a.cree_le, 'R'),
                })).join('\n')
              : t('vocal.liste_actifs_vide'))
          ),
          C.texte(`**${t('vocal.liste_variables_titre')}**\n${t('vocal.liste_variables_valeur')}`),
        ], conf.couleurs.principale)]));
      }

      if (sous === 'remove-hub') {
        const salon = interaction.options.getChannel('channel');
        const res = req.retirerHub.run(guildId, salon.id);
        return interaction.reply(res.changes
          ? C.succes(t('vocal.retirer_hub_fait', { salon: `${salon}` }))
          : C.erreurPrivee(t('vocal.retirer_hub_absent')));
      }

      // t() laisse {pseudo} intact (aucune variable de ce nom fournie) : ce
      // gabarit est ensuite consomme par vocaux.nommer(), pas par t() lui-meme.
      const modele = interaction.options.getString('template') ?? `${E('vocal')} ${t('vocal.modele_defaut')}`;
      const places = interaction.options.getInteger('limit') ?? 0;

      // ------------------------------------------------------ LIER
      if (sous === 'link-hub') {
        const salon = interaction.options.getChannel('channel');
        req.ajouterHub.run({
          guild_id: guildId,
          channel_id: salon.id,
          categorie_id: salon.parentId,
          modele,
          limite_defaut: places,
        });
        return interaction.reply(C.succes(t('vocal.lier_hub_fait', { salon: `${salon}` })));
      }

      // ----------------------------------------------------- CREER
      await interaction.deferReply();

      const categorie = interaction.options.getChannel('category');
      let salon;
      try {
        salon = await interaction.guild.channels.create({
          name: interaction.options.getString('name') ?? t('vocal.hub_nom_defaut'),
          type: ChannelType.GuildVoice,
          parent: categorie?.id ?? null,
          reason: t('vocal.raison_creer_hub', { membre: interaction.user.tag }),
        });
      } catch (e) {
        return interaction.editReply(C.erreur(t('vocal.creer_hub_impossible', { erreur: e.message })));
      }

      req.ajouterHub.run({
        guild_id: guildId,
        channel_id: salon.id,
        categorie_id: categorie?.id ?? salon.parentId,
        modele,
        limite_defaut: places,
      });

      const moi = interaction.guild.members.me;
      const manque = [
        !moi.permissions.has(PermissionFlagsBits.ManageChannels) ? t('vocal.perm_gerer_salons') : null,
        !moi.permissions.has(PermissionFlagsBits.MoveMembers) ? t('vocal.perm_deplacer_membres') : null,
      ].filter(Boolean);

      return interaction.editReply(C.succes(t('vocal.creer_hub_fait', {
        salon: `${salon}`,
        nom: vocaux.nommer(modele, interaction.member, 1),
        // Meme raison qu'au-dessus : l'espace se met hors du t() imbrique.
        places: places ? ` (${t('vocal.creer_hub_places_suffixe', { n: places })})` : '',
        suite: manque.length
          ? t('vocal.creer_hub_manque_permission', { liste: manque.join(` ${t('vocal.et')} `) })
          : t('vocal.creer_hub_ok'),
      })));
    }

    // ================================================== DANS SON SALON
    const salonVocal = interaction.member.voice?.channel;
    if (!salonVocal) {
      return interaction.reply(C.erreurPrivee(t('vocal.hors_salon')));
    }

    const ligne = req.vocalTemp.get(salonVocal.id);
    if (!ligne) {
      return interaction.reply(C.erreurPrivee(t('vocal.pas_temporaire')));
    }

    if (!vocaux.estProprietaire(interaction.member, salonVocal.id)) {
      return interaction.reply(C.erreurPrivee(t('vocal.pas_proprietaire', { proprietaire: `<@${ligne.proprietaire_id}>` })));
    }

    const everyone = interaction.guild.roles.everyone.id;

    switch (sous) {
      case 'name': {
        const nom = interaction.options.getString('name');
        await salonVocal.setName(nom, t('vocal.raison_renomme', { membre: interaction.user.tag }));
        return interaction.reply(C.succes(t('vocal.renomme', { nom })));
      }
      case 'limit': {
        const nombre = interaction.options.getInteger('number');
        await salonVocal.setUserLimit(nombre);
        return interaction.reply(C.succes(nombre === 0 ? t('vocal.places_illimitees') : t('vocal.places_limitees', { n: nombre })));
      }
      case 'lock':
        await salonVocal.permissionOverwrites.edit(everyone, { Connect: false });
        return interaction.reply(C.succes(t('vocal.verrouille')));
      case 'unlock':
        await salonVocal.permissionOverwrites.edit(everyone, { Connect: null });
        return interaction.reply(C.succes(t('vocal.deverrouille')));
      case 'hide':
        await salonVocal.permissionOverwrites.edit(everyone, { ViewChannel: false });
        return interaction.reply(C.succes(t('vocal.cache')));
      case 'show':
        await salonVocal.permissionOverwrites.edit(everyone, { ViewChannel: null });
        return interaction.reply(C.succes(t('vocal.affiche')));
      case 'allow': {
        const membre = interaction.options.getUser('member');
        await salonVocal.permissionOverwrites.edit(membre.id, { ViewChannel: true, Connect: true });
        return interaction.reply(C.succes(t('vocal.autorise', { membre: `${membre}` })));
      }
      case 'kick': {
        const cible = interaction.options.getUser('member');
        if (cible.id === interaction.user.id) {
          return interaction.reply(C.erreurPrivee(t('vocal.expulsion_soi')));
        }
        const membreCible = salonVocal.members.get(cible.id);
        if (!membreCible) {
          return interaction.reply(C.erreurPrivee(t('vocal.expulsion_absent')));
        }
        await salonVocal.permissionOverwrites.edit(cible.id, { Connect: false }).catch(() => null);
        await membreCible.voice.disconnect(t('vocal.raison_expulsion', { membre: interaction.user.tag })).catch(() => null);
        return interaction.reply(C.succes(t('vocal.expulse', { membre: `${cible}` })));
      }
      case 'transfer': {
        const cible = interaction.options.getUser('member');
        if (!salonVocal.members.has(cible.id)) {
          return interaction.reply(C.erreurPrivee(t('vocal.transfert_absent')));
        }
        req.changerProprietaire.run(cible.id, salonVocal.id);
        await salonVocal.permissionOverwrites
          .edit(cible.id, { ViewChannel: true, Connect: true, ManageChannels: true, MoveMembers: true, SendMessages: true })
          .catch(() => null);
        return interaction.reply(C.succes(t('vocal.transfert_fait', { membre: `${cible}` })));
      }
      default:
        return interaction.reply(C.envoi(vocaux.panneauV2(salonVocal, ligne.proprietaire_id)));
    }
  },
};
