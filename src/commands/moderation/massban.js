/**
 * /massban — bannit jusqu'a 200 comptes d'un coup, par identifiant.
 *
 * Pour les raids : on colle la liste des IDs (separes par des espaces, des
 * virgules ou des retours a la ligne) et Discord les bannit en UNE requete
 * (bulk ban). Une confirmation est demandee : une erreur de copier-coller ici
 * fait beaucoup de degats.
 *
 * Proteges d'office : toi-meme, le proprietaire, le bot, et tout membre dont
 * le role est egal ou superieur au tien.
 */
const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  InteractionContextType,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
} = require('discord.js');
const conf = require('../../../config');
const C = require('../../utils/composants');
const { req } = require('../../database/db');
const { envoyerLog } = require('../../utils/logs');
const { traducteur, localisations, t: tr, DEFAUT } = require('../../utils/langues');

const MAX = 200;

module.exports = {
  categorie: 'moderation',

  data: new SlashCommandBuilder()
    .setName('massban')
    .setDescription(tr('massban.description_commande', DEFAUT))
    .setDescriptionLocalizations(localisations('massban.description_commande'))
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .setContexts(InteractionContextType.Guild)
    .addStringOption((o) => o
      .setName('ids')
      .setDescription(tr('massban.opt_ids', DEFAUT))
      .setDescriptionLocalizations(localisations('massban.opt_ids'))
      .setRequired(true)
      .setMaxLength(6000))
    .addStringOption((o) => o
      .setName('reason')
      .setNameLocalizations({ fr: 'raison' })
      .setDescription(tr('massban.opt_raison', DEFAUT))
      .setDescriptionLocalizations(localisations('massban.opt_raison'))
      .setMaxLength(300))
    .addBooleanOption((o) => o
      .setName('purge')
      .setNameLocalizations({ fr: 'purger' })
      .setDescription(tr('massban.opt_purger', DEFAUT))
      .setDescriptionLocalizations(localisations('massban.opt_purger'))),

  async execute(interaction) {
    const { t } = traducteur(interaction);
    const guild = interaction.guild;
    const raison = interaction.options.getString('reason') ?? t('massban.raison_defaut');
    const purger = interaction.options.getBoolean('purge') ?? true;

    const ids = [...new Set((interaction.options.getString('ids').match(/\d{17,20}/g) ?? []))];
    if (!ids.length) return interaction.reply(C.erreurPrivee(t('massban.aucun_id')));
    if (ids.length > MAX) return interaction.reply(C.erreurPrivee(t('massban.trop', { max: MAX })));

    // ----------------------------------------------------- QUI EST PROTEGE
    const protege = new Set([interaction.user.id, guild.ownerId, interaction.client.user.id]);
    const auteurPos = interaction.member.roles.highest.position;
    const estProprio = interaction.user.id === guild.ownerId;
    // Discord ne rend que 100 membres par demande : on decoupe.
    const membres = new Map();
    for (let i = 0; i < ids.length; i += 100) {
      const lot = await guild.members.fetch({ user: ids.slice(i, i + 100) }).catch(() => null);
      for (const [id, m] of lot ?? []) membres.set(id, m);
    }
    for (const m of membres.values()) {
      if (!estProprio && m.roles.highest.position >= auteurPos) protege.add(m.id);
      if (!m.bannable) protege.add(m.id);
    }
    const cibles = ids.filter((id) => !protege.has(id));
    const ignores = ids.length - cibles.length;
    if (!cibles.length) return interaction.reply(C.erreurPrivee(t('massban.tous_proteges')));

    // ------------------------------------------------------- CONFIRMATION
    const rangee = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('massban_ok').setStyle(ButtonStyle.Danger).setLabel(t('massban.confirmer', { n: cibles.length })),
      new ButtonBuilder().setCustomId('massban_non').setStyle(ButtonStyle.Secondary).setLabel(t('commun.annuler'))
    );
    const reponse = await interaction.reply({
      ...C.avertissementPrivee(
        t('massban.question', { n: cibles.length, presents: membres.size })
        + (ignores ? `\n${t('massban.ignores', { n: ignores })}` : '')
        + `\n> ${t('sanction.raison', { raison })}`,
        { elements: [rangee] }
      ),
      withResponse: true,
    });

    const clic = await reponse.resource.message.awaitMessageComponent({
      componentType: ComponentType.Button,
      filter: (i) => i.user.id === interaction.user.id,
      time: 30_000,
    }).catch(() => null);

    if (!clic || clic.customId !== 'massban_ok') {
      return interaction.editReply(C.info(t('massban.annule')));
    }
    await clic.update(C.info(t('massban.en_cours', { n: cibles.length })));

    // ------------------------------------------------------------ ACTION
    let resultat;
    try {
      resultat = await guild.bans.bulkCreate(cibles, {
        reason: `Massban : ${raison} — ${interaction.user.tag}`,
        deleteMessageSeconds: purger ? 86400 : 0,
      });
    } catch (e) {
      return interaction.editReply(C.erreur(t('massban.impossible', { erreur: e.message })));
    }

    const bannis = resultat.bannedUsers ?? [];
    const rates = resultat.failedUsers ?? [];
    const date = Date.now();
    for (const id of bannis) {
      req.ajouterSanction.run({
        guild_id: guild.id, user_id: id, moderateur_id: interaction.user.id,
        type: 'massban', raison, duree: null, date,
      });
    }

    await envoyerLog(guild, 'moderation', {
      color: conf.couleurs.erreur,
      title: `🚨 ${t('massban.log_titre', { n: bannis.length })}`,
      description: `${t('sanction.log_moderateur')} : ${interaction.user}\n${t('sanction.log_raison')} : ${raison}`,
      fields: [{ name: 'IDs', value: bannis.slice(0, 60).map((id) => `\`${id}\``).join(' ').slice(0, 1024) || '—' }],
      timestamp: new Date(date).toISOString(),
    });

    return interaction.editReply(C.succes(
      t('massban.fait', { n: bannis.length })
      + (rates.length ? `\n${t('massban.rates', { n: rates.length })}` : '')
      + (ignores ? `\n${t('massban.ignores', { n: ignores })}` : '')
    ));
  },
};
