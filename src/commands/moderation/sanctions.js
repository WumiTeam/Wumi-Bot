/**
 * /sanctions — consulte et gere l'historique des sanctions d'un serveur.
 *
 *   liste    l'historique d'un membre, PAGINE (boutons) et filtrable par type
 *   voir     le detail d'une sanction (#id)
 *   raison   corrige la raison d'une sanction
 *   retirer  supprime une sanction de l'historique
 *   vider    desactive tous les avertissements d'un membre
 *
 * LE BUG « column index out of range » (corrige dans database/db.js) :
 * `req.sanctionParId` etait declare DEUX FOIS dans l'objet des requetes, la
 * seconde fois avec un seul parametre. La seconde ecrasait la premiere, et
 * l'appel ci-dessous, qui passe (id, serveur), plantait. Les variantes sans
 * serveur, utilisees par les appels, s'appellent maintenant *Global.
 *
 * COMPONENTS V2 plafonne a 40 composants par message : la page tient dans
 * UN bloc de texte (8 sanctions par page), quelle que soit la taille du
 * casier.
 */
const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  InteractionContextType,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');
const conf = require('../../../config');
const { db, req } = require('../../database/db');
const { ts, tronquer } = require('../../utils/outils');
const { libelles } = require('../../utils/sanctions');
const { E } = require('../../utils/emojis');
const C = require('../../utils/composants');
const { traducteur, localisations, t: tr, DEFAUT } = require('../../utils/langues');

const PAR_PAGE = 8;

const TYPES = ['warn', 'mute', 'kick', 'ban', 'softban', 'unban', 'unmute', 'automod', 'massban', 'deconnexion'];

const modifierRaison = db.prepare('UPDATE sanctions SET raison = ? WHERE id = ? AND guild_id = ?');

/** Le nom affiche d'un type de sanction, dans la langue du serveur. */
function nomType(t, existe, type) {
  return existe(`sanctions.type.${type}`) ? t(`sanctions.type.${type}`) : (libelles[type]?.nom ?? type);
}

/** Une page de l'historique, prete a etre envoyee ou mise a jour. */
function construirePage(interaction, cible, page, filtre) {
  const { t, existe, duree: enDuree } = traducteur(interaction);
  const tout = req.sanctionsDe.all(interaction.guild.id, cible.id);
  const historique = filtre ? tout.filter((s) => s.type === filtre) : tout;

  if (!historique.length) {
    return C.info(filtre
      ? t('sanctions.vide_filtre', { membre: cible.username, type: nomType(t, existe, filtre) })
      : t('sanctions.vide', { membre: cible.username }));
  }

  const pages = Math.max(1, Math.ceil(historique.length / PAR_PAGE));
  const p = Math.min(Math.max(1, page), pages);
  const tranche = historique.slice((p - 1) * PAR_PAGE, p * PAR_PAGE);

  const actifs = tout.filter((s) => s.type === 'warn' && s.actif).length;
  const compte = tout.reduce((acc, s) => {
    acc[s.type] = (acc[s.type] ?? 0) + 1;
    return acc;
  }, {});

  const lignes = tranche.map((s) => {
    const meta = libelles[s.type] ?? { emoji: E('epingle') };
    const barre = s.type === 'warn' && !s.actif ? '~~' : '';
    return [
      `${meta.emoji} **${nomType(t, existe, s.type)}** · \`#${s.id}\` · ${ts(s.date, 'R')}`,
      `> ${barre}${tronquer(s.raison ?? t('sanction.sans_raison'), 180)}${barre}`,
      `> ${t('sanctions.par', { moderateur: `<@${s.moderateur_id}>` })}${s.duree ? ` · ${t('sanctions.duree', { duree: enDuree(s.duree) })}` : ''}`,
    ].join('\n');
  });

  const resume = Object.entries(compte)
    .map(([type, n]) => `${libelles[type]?.emoji ?? E('epingle')} ${nomType(t, existe, type)} : ${n}`)
    .join(' · ');

  const f = filtre ?? '-';
  const navigation = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`sanc_p:${cible.id}:1:${f}`).setEmoji('⏮️').setStyle(ButtonStyle.Secondary).setDisabled(p <= 1),
    new ButtonBuilder().setCustomId(`sanc_p:${cible.id}:${p - 1}:${f}`).setEmoji('◀️').setStyle(ButtonStyle.Secondary).setDisabled(p <= 1),
    new ButtonBuilder().setCustomId(`sanc_x:${p}`).setLabel(`${p} / ${pages}`).setStyle(ButtonStyle.Secondary).setDisabled(true),
    new ButtonBuilder().setCustomId(`sanc_p:${cible.id}:${p + 1}:${f}`).setEmoji('▶️').setStyle(ButtonStyle.Secondary).setDisabled(p >= pages),
    new ButtonBuilder().setCustomId(`sanc_p:${cible.id}:${pages}:${f}`).setEmoji('⏭️').setStyle(ButtonStyle.Secondary).setDisabled(p >= pages)
  );

  return C.envoi([C.conteneur([
    C.sectionVignette(
      `## ${E('moderation')} ${t('sanctions.titre', { pseudo: cible.username })}\n<@${cible.id}> · \`${cible.id}\``
      + (filtre ? `\n${t('sanctions.filtre_actif', { type: nomType(t, existe, filtre) })}` : ''),
      cible.displayAvatarURL()
    ),
    C.separateur(),
    C.texte(tronquer(lignes.join('\n\n'), C.MAX_TEXTE)),
    C.separateur(),
    C.texte(
      `### ${t('sanctions.resume')}\n`
      + `${t('sanctions.total', { n: tout.length })} · ${t('sanctions.actifs', { n: actifs })}\n`
      + resume
    ),
    pages > 1 ? navigation : null,
    C.texte(`-# ${t('sanctions.pied_page', { id: cible.id })}`),
  ], conf.couleurs.avertissement)]);
}

module.exports = {
  categorie: 'moderation',

  data: new SlashCommandBuilder()
    .setName('sanctions')
    .setDescription(tr('sanctions.description_commande', DEFAUT))
    .setDescriptionLocalizations(localisations('sanctions.description_commande'))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .setContexts(InteractionContextType.Guild)
    .addSubcommand((s) => s
      .setName('list')
      .setNameLocalizations({ fr: 'liste' })
      .setDescription(tr('sanctions.sous_liste', DEFAUT))
      .setDescriptionLocalizations(localisations('sanctions.sous_liste'))
      .addUserOption((o) => o
        .setName('member')
        .setNameLocalizations({ fr: 'membre' })
        .setDescription(tr('sanctions.opt_membre', DEFAUT))
        .setDescriptionLocalizations(localisations('sanctions.opt_membre'))
        .setRequired(true))
      .addStringOption((o) => o
        .setName('type')
        .setDescription(tr('sanctions.opt_type', DEFAUT))
        .setDescriptionLocalizations(localisations('sanctions.opt_type'))
        .addChoices(...TYPES.map((ty) => ({
          name: tr(`sanctions.type.${ty}`, 'en'),
          name_localizations: { fr: tr(`sanctions.type.${ty}`, 'fr') },
          value: ty,
        })))))
    .addSubcommand((s) => s
      .setName('view')
      .setNameLocalizations({ fr: 'voir' })
      .setDescription(tr('sanctions.sous_voir', DEFAUT))
      .setDescriptionLocalizations(localisations('sanctions.sous_voir'))
      .addIntegerOption((o) => o
        .setName('id')
        .setDescription(tr('sanctions.opt_id', DEFAUT))
        .setDescriptionLocalizations(localisations('sanctions.opt_id'))
        .setRequired(true)
        .setMinValue(1)))
    .addSubcommand((s) => s
      .setName('reason')
      .setNameLocalizations({ fr: 'raison' })
      .setDescription(tr('sanctions.sous_raison', DEFAUT))
      .setDescriptionLocalizations(localisations('sanctions.sous_raison'))
      .addIntegerOption((o) => o
        .setName('id')
        .setDescription(tr('sanctions.opt_id', DEFAUT))
        .setDescriptionLocalizations(localisations('sanctions.opt_id'))
        .setRequired(true)
        .setMinValue(1))
      .addStringOption((o) => o
        .setName('text')
        .setNameLocalizations({ fr: 'texte' })
        .setDescription(tr('sanctions.opt_texte', DEFAUT))
        .setDescriptionLocalizations(localisations('sanctions.opt_texte'))
        .setRequired(true)
        .setMaxLength(400)))
    .addSubcommand((s) => s
      .setName('remove')
      .setNameLocalizations({ fr: 'retirer' })
      .setDescription(tr('sanctions.sous_retirer', DEFAUT))
      .setDescriptionLocalizations(localisations('sanctions.sous_retirer'))
      .addIntegerOption((o) => o
        .setName('id')
        .setDescription(tr('sanctions.opt_id', DEFAUT))
        .setDescriptionLocalizations(localisations('sanctions.opt_id'))
        .setRequired(true)
        .setMinValue(1)))
    .addSubcommand((s) => s
      .setName('clear')
      .setNameLocalizations({ fr: 'vider' })
      .setDescription(tr('sanctions.sous_vider', DEFAUT))
      .setDescriptionLocalizations(localisations('sanctions.sous_vider'))
      .addUserOption((o) => o
        .setName('member')
        .setNameLocalizations({ fr: 'membre' })
        .setDescription(tr('sanctions.opt_membre', DEFAUT))
        .setDescriptionLocalizations(localisations('sanctions.opt_membre'))
        .setRequired(true))),

  async execute(interaction) {
    const { t, existe, duree: enDuree } = traducteur(interaction);
    const sous = interaction.options.getSubcommand();
    const guildId = interaction.guild.id;

    // ------------------------------------------------------------- VOIR
    if (sous === 'view') {
      const id = interaction.options.getInteger('id');
      const s = req.sanctionParId.get(id, guildId);
      if (!s) return interaction.reply(C.erreurPrivee(t('sanctions.introuvable', { n: id })));
      const cible = await interaction.client.users.fetch(s.user_id).catch(() => null);
      const meta = libelles[s.type] ?? { emoji: E('epingle'), couleur: conf.couleurs.principale };
      const appels = (() => {
        try { return req.appelDeSanction.all(s.id); } catch { return []; }
      })();

      return interaction.reply(C.envoiPrive([C.conteneur([
        C.sectionVignette(
          `## ${meta.emoji} ${nomType(t, existe, s.type)} · \`#${s.id}\`\n`
          + `**${t('sanction.log_membre')}** · <@${s.user_id}> (\`${s.user_id}\`)\n`
          + `**${t('sanction.log_moderateur')}** · <@${s.moderateur_id}>\n`
          + `**${t('sanctions.date')}** · ${ts(s.date)} (${ts(s.date, 'R')})`
          + (s.duree ? `\n**${t('sanction.log_duree')}** · ${enDuree(s.duree)} → ${ts(s.date + s.duree, 'R')}` : '')
          + (s.type === 'warn' ? `\n**${t('sanctions.etat')}** · ${s.actif ? t('sanctions.etat_actif') : t('sanctions.etat_inactif')}` : ''),
          cible?.displayAvatarURL() ?? interaction.guild.iconURL() ?? interaction.client.user.displayAvatarURL()
        ),
        C.separateur(),
        C.texte(`**${t('sanction.log_raison')}**\n>>> ${s.raison ?? t('sanction.sans_raison')}`),
        appels.length ? C.texte(`-# ${t('sanctions.appels', { n: appels.length })}`) : null,
      ], meta.couleur ?? conf.couleurs.principale)]));
    }

    // ----------------------------------------------------------- RAISON
    if (sous === 'reason') {
      const id = interaction.options.getInteger('id');
      const texte = interaction.options.getString('text');
      const s = req.sanctionParId.get(id, guildId);
      if (!s) return interaction.reply(C.erreurPrivee(t('sanctions.introuvable', { n: id })));
      modifierRaison.run(texte, id, guildId);
      return interaction.reply(C.succes(
        t('sanctions.raison_modifiee', { n: id })
        + `\n> ~~${tronquer(s.raison ?? '—', 150)}~~\n> ${texte}`
      ));
    }

    // ------------------------------------------------------------- RETIRER
    if (sous === 'remove') {
      const id = interaction.options.getInteger('id');
      const sanction = req.sanctionParId.get(id, guildId);
      if (!sanction) {
        return interaction.reply(C.erreurPrivee(t('sanctions.introuvable', { n: id })));
      }
      req.supprimerSanction.run(id, guildId);
      return interaction.reply(C.succes(
        t('sanctions.retiree', { n: id, type: nomType(t, existe, sanction.type) })
      ));
    }

    // -------------------------------------------------------------- VIDER
    if (sous === 'clear') {
      const cible = interaction.options.getUser('member');
      const res = req.viderAvertissements.run(guildId, cible.id);
      return interaction.reply(C.succes(t('sanctions.videes', { n: Number(res.changes), membre: cible.username })));
    }

    // -------------------------------------------------------------- LISTE
    const cible = interaction.options.getUser('member');
    const filtre = interaction.options.getString('type');
    return interaction.reply(construirePage(interaction, cible, 1, filtre));
  },

  /** Les boutons de pagination (sanc_p:<membre>:<page>:<filtre>). */
  async gererInteraction(interaction) {
    const { t } = traducteur(interaction);
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ModerateMembers)) {
      return interaction.reply(C.erreurPrivee(t('erreur.permission')));
    }
    const [, userId, page, filtre] = interaction.customId.split(':');
    const cible = await interaction.client.users.fetch(userId).catch(() => null);
    if (!cible) return interaction.deferUpdate();
    return interaction.update(construirePage(interaction, cible, Number(page) || 1, filtre === '-' ? null : filtre));
  },
};
