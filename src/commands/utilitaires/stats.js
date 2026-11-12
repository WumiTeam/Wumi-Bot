const { AttachmentBuilder, ChannelType, InteractionContextType, MessageFlags, PermissionFlagsBits, SlashCommandBuilder } = require('discord.js');
const conf = require('../../../config');
const { serie, topSalons, heures, totaux, evolution, jourMoins } = require('../../utils/activite');
const { majConfig, config } = require('../../database/db');
const rapportStats = require('../../utils/rapportStats');
const { genererGraphique } = require('../../utils/graphiqueActivite');
const C = require('../../utils/composants');
const logger = require('../../utils/logger');
const { E } = require('../../utils/emojis');
const { traducteur, localisations, t: tr, DEFAUT } = require('../../utils/langues');

/** Nom lisible d'un salon, meme s'il a ete supprime depuis. */
function nomSalon(guild, id) {
  const salon = guild.channels.cache.get(id);
  return salon ? `#${salon.name}` : '#salon-supprime';
}

module.exports = {
  categorie: 'utilitaires',

  data: new SlashCommandBuilder()
    .setName('stats')
    .setDescription(tr('stats.description_commande', DEFAUT))
    .setDescriptionLocalizations(localisations('stats.description_commande'))
    .setContexts(InteractionContextType.Guild)
    .addSubcommand((s) => s
      .setName('server')
      .setNameLocalizations({ fr: 'serveur' })
      .setDescription(tr('stats.sous_serveur', DEFAUT))
      .setDescriptionLocalizations(localisations('stats.sous_serveur'))
      .addIntegerOption((o) => o
        .setName('days')
        .setNameLocalizations({ fr: 'jours' })
        .setDescription(tr('stats.opt_jours', DEFAUT))
        .setDescriptionLocalizations(localisations('stats.opt_jours'))
        .setMinValue(7)
        .setMaxValue(90)))
    .addSubcommand((s) => s
      .setName('report')
      .setNameLocalizations({ fr: 'rapport' })
      .setDescription(tr('stats.sous_rapport', DEFAUT))
      .setDescriptionLocalizations(localisations('stats.sous_rapport'))
      .addChannelOption((o) => o
        .setName('channel')
        .setNameLocalizations({ fr: 'salon' })
        .setDescription(tr('stats.opt_salon_rapport', DEFAUT))
        .setDescriptionLocalizations(localisations('stats.opt_salon_rapport'))
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement))
      .addBooleanOption((o) => o
        .setName('disable')
        .setNameLocalizations({ fr: 'desactiver' })
        .setDescription(tr('stats.opt_desactiver_rapport', DEFAUT))
        .setDescriptionLocalizations(localisations('stats.opt_desactiver_rapport')))),

  async execute(interaction) {
    if (interaction.options.getSubcommand() === 'report') return rapport(interaction);

    const { t, nombre } = traducteur(interaction);
    const jours = interaction.options.getInteger('days') ?? 30;
    const guild = interaction.guild;

    await interaction.deferReply();

    const donnees = serie(guild.id, jours);
    const totalMessages = donnees.reduce((s, j) => s + j.messages, 0);

    // Rien a montrer tant que le bot n'a pas tourne au moins un jour.
    if (!totalMessages && !donnees.some((j) => j.arrivees || j.departs || j.vocal)) {
      return interaction.editReply(C.info(t('stats.aucune_activite')));
    }

    const salons = topSalons(guild.id, jours, 5).map((s) => ({
      nom: nomSalon(guild, s.channel_id),
      total: s.total,
    }));

    const arrivees = donnees.reduce((s, j) => s + j.arrivees, 0);
    const departs = donnees.reduce((s, j) => s + j.departs, 0);
    const vocal = donnees.reduce((s, j) => s + j.vocal, 0);
    const meilleur = donnees.reduce((a, b) => (b.messages > a.messages ? b : a), donnees[0]);
    const delta = arrivees - departs;
    const avant = totaux(guild.id, jours, jours);
    const evo = (a, b) => {
      const p = evolution(a, b);
      return p === null ? '' : ` · ${p >= 0 ? '📈 +' : '📉 '}${p} %`;
    };
    const parHeure = heures(guild.id, jourMoins(jours - 1));
    const totalHeures = parHeure.reduce((a, b) => a + b, 0);
    const pics = parHeure.map((v, h) => [v, h]).sort((a, b) => b[0] - a[0]).slice(0, 3).filter(([v]) => v > 0).map(([, h]) => h);

    const elements = [
      C.texte(`## ${E('statistiques')} ${t('stats.titre', { serveur: guild.name })}`),
      C.texte(t('stats.periode', { jours: nombre(jours) }) + (avant.messages ? `\n-# ${t('stats.comparaison', { jours: nombre(jours) })}` : '')),
      C.separateur(),
      C.texte(
        `**${t('stats.champ_messages')}**\n${t('stats.valeur_messages', { total: nombre(totalMessages), parJour: nombre(Math.round(totalMessages / jours)) })}${evo(totalMessages, avant.messages)}\n\n`
        + `**${t('stats.champ_membres')}**\n${t('stats.valeur_membres', { signe: delta >= 0 ? '+' : '', delta: nombre(delta), arrivees: nombre(arrivees), departs: nombre(departs) })}\n\n`
        + `**${t('stats.champ_vocal')}**\n${t('stats.valeur_vocal', { h: nombre(Math.round(vocal / 60)) })}${evo(vocal, avant.vocal)}`
      ),
    ];

    if (pics.length) {
      elements.push(C.texte(`**${t('stats.champ_heures')}**\n${pics.map((h) => t('stats.ligne_heure', { h, h2: (h + 1) % 24, p: Math.round((parHeure[h] / totalHeures) * 100) })).join('\n')}`));
    }

    // Les valeurs restent lisibles meme si l'image ne charge pas.
    if (salons.length) {
      elements.push(C.texte(
        `**${t('stats.champ_salons_actifs')}**\n`
        + salons.map((s, i) => t('stats.ligne_salon', { rang: i + 1, nom: s.nom, n: nombre(s.total) })).join('\n')
      ));
    }

    const options = {};

    try {
      const png = await genererGraphique({ serveur: guild.name, serie: donnees, salons, heures: parHeure, avant: avant.messages || avant.vocal ? avant : null });
      options.files = [new AttachmentBuilder(png, { name: 'activite.png' })];
      elements.push(C.image('attachment://activite.png'));
    } catch (e) {
      logger.avertissement("Graphique d'activite non genere :", e.message);
    }

    elements.push(C.texte(`-# ${t('stats.pied', { date: `${meilleur.jour.slice(8, 10)}/${meilleur.jour.slice(5, 7)}`, n: nombre(meilleur.messages) })}`));

    return interaction.editReply(C.envoi([C.conteneur(elements, conf.couleurs.principale)], options));
  },
};

/** /stats rapport : choisir le salon du rapport du lundi, ou en voir un apercu. */
async function rapport(interaction) {
  const { t } = traducteur(interaction);
  const guild = interaction.guild;
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
    return interaction.reply(C.erreurPrivee(t('stats.rapport_permission')));
  }
  const salon = interaction.options.getChannel('channel');
  const couper = interaction.options.getBoolean('disable');

  if (couper) {
    majConfig(guild.id, { stats_rapport_salon: null });
    return interaction.reply(C.succesPrive(t('stats.rapport_coupe')));
  }
  if (salon) {
    const moi = guild.members.me;
    if (!salon.permissionsFor(moi)?.has([PermissionFlagsBits.SendMessages, PermissionFlagsBits.AttachFiles, PermissionFlagsBits.ViewChannel])) {
      return interaction.reply(C.erreurPrivee(t('stats.rapport_salon_droits', { salon: `${salon}` })));
    }
    // Le premier rapport part LUNDI PROCHAIN, pas tout de suite.
    majConfig(guild.id, { stats_rapport_salon: salon.id, stats_rapport_dernier: rapportStats.lundiCourant() });
  }

  // Dans tous les cas : un apercu de ce que le staff recevra.
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const cfg = config(guild.id);
  const entete = C.texte(cfg.stats_rapport_salon
    ? (salon ? t('stats.rapport_active', { salon: `<#${cfg.stats_rapport_salon}>` }) : t('stats.rapport_etat', { salon: `<#${cfg.stats_rapport_salon}>` }))
    : t('stats.rapport_inactif'));
  const contenu = await rapportStats.construire(guild, true).catch(() => null);
  if (!contenu) return interaction.editReply(C.envoi([C.conteneur([entete, C.texte(`-# ${t('stats.rapport_vide')}`)], conf.couleurs.principale)]));
  return interaction.editReply(C.envoi([C.conteneur([entete, C.separateur(), ...contenu.blocs], conf.couleurs.principale)], contenu.options));
}
