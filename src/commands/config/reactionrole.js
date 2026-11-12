/**
 * /reactionrole — panneaux de roles en libre-service (boutons ou menu).
 * Toute la logique d'affichage et de clic est dans src/utils/rolesReactions.js.
 *
 *   creer     publie un panneau avec son premier role
 *   ajouter   ajoute un role a un panneau (le message se met a jour)
 *   retirer   enleve un role d'un panneau
 *   liste     les panneaux du serveur
 *   supprimer supprime un panneau (et son message)
 */
const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  InteractionContextType,
  ChannelType,
} = require('discord.js');
const conf = require('../../../config');
const C = require('../../utils/composants');
const rr = require('../../utils/rolesReactions');
const { traducteur, localisations, t: tr, DEFAUT } = require('../../utils/langues');

// Ces permissions ne se distribuent pas en libre-service.
const DANGEREUSES = [
  PermissionFlagsBits.Administrator,
  PermissionFlagsBits.ManageGuild,
  PermissionFlagsBits.ManageRoles,
  PermissionFlagsBits.ManageChannels,
  PermissionFlagsBits.BanMembers,
  PermissionFlagsBits.KickMembers,
  PermissionFlagsBits.ModerateMembers,
  PermissionFlagsBits.ManageMessages,
  PermissionFlagsBits.MentionEveryone,
  PermissionFlagsBits.ManageWebhooks,
];

const d = (b, cle) => b.setDescription(tr(cle, DEFAUT)).setDescriptionLocalizations(localisations(cle));
const optId = (o) => d(o.setName('panel').setNameLocalizations({ fr: 'panneau' }), 'rr.opt_id').setRequired(true).setMinValue(1);
const optRole = (o) => d(o.setName('role'), 'rr.opt_role').setRequired(true);
const optEmoji = (o) => d(o.setName('emoji'), 'rr.opt_emoji').setMaxLength(64);
const optLabel = (o) => d(o.setName('label').setNameLocalizations({ fr: 'texte' }), 'rr.opt_label').setMaxLength(80);

/** Peut-on mettre ce role dans un panneau ? Renvoie une cle d'erreur ou null. */
function verifierRole(interaction, role) {
  if (role.managed || role.id === interaction.guild.id) return 'rr.role_gere';
  if (!role.editable) return 'rr.role_trop_haut_bot';
  const proprio = interaction.user.id === interaction.guild.ownerId;
  if (!proprio && role.position >= interaction.member.roles.highest.position) return 'rr.role_trop_haut_toi';
  if (DANGEREUSES.some((p) => role.permissions.has(p))) return 'rr.role_dangereux';
  return null;
}

module.exports = {
  categorie: 'config',

  data: new SlashCommandBuilder()
    .setName('reactionrole')
    .setNameLocalizations({ fr: 'roles-reactions' })
    .setDescription(tr('rr.description_commande', DEFAUT))
    .setDescriptionLocalizations(localisations('rr.description_commande'))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .setContexts(InteractionContextType.Guild)
    .addSubcommand((s) => d(s.setName('create').setNameLocalizations({ fr: 'creer' }), 'rr.sous_creer')
      .addStringOption((o) => d(o.setName('title').setNameLocalizations({ fr: 'titre' }), 'rr.opt_titre').setRequired(true).setMaxLength(100))
      .addRoleOption(optRole)
      .addStringOption(optEmoji)
      .addStringOption(optLabel)
      .addStringOption((o) => d(o.setName('description'), 'rr.opt_description').setMaxLength(1000))
      .addStringOption((o) => d(o.setName('mode'), 'rr.opt_mode').addChoices(
        { name: 'Buttons', name_localizations: { fr: 'Boutons' }, value: 'boutons' },
        { name: 'Dropdown menu', name_localizations: { fr: 'Menu déroulant' }, value: 'menu' }
      ))
      .addBooleanOption((o) => d(o.setName('single').setNameLocalizations({ fr: 'unique' }), 'rr.opt_unique'))
      .addChannelOption((o) => d(o.setName('channel').setNameLocalizations({ fr: 'salon' }), 'rr.opt_salon')
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)))
    .addSubcommand((s) => d(s.setName('add').setNameLocalizations({ fr: 'ajouter' }), 'rr.sous_ajouter')
      .addIntegerOption(optId).addRoleOption(optRole).addStringOption(optEmoji).addStringOption(optLabel))
    .addSubcommand((s) => d(s.setName('remove').setNameLocalizations({ fr: 'retirer' }), 'rr.sous_retirer')
      .addIntegerOption(optId).addRoleOption(optRole))
    .addSubcommand((s) => d(s.setName('list').setNameLocalizations({ fr: 'liste' }), 'rr.sous_liste'))
    .addSubcommand((s) => d(s.setName('delete').setNameLocalizations({ fr: 'supprimer' }), 'rr.sous_supprimer')
      .addIntegerOption(optId)),

  async execute(interaction) {
    const { t } = traducteur(interaction);
    const guild = interaction.guild;
    const sous = interaction.options.getSubcommand();

    // ------------------------------------------------------------- LISTE
    if (sous === 'list') {
      const menus = rr.q.duServeur.all(guild.id);
      if (!menus.length) return interaction.reply(C.infoPrivee(t('rr.liste_vide')));
      const lignes = menus.map((m) => {
        const lien = m.message_id ? `https://discord.com/channels/${guild.id}/${m.channel_id}/${m.message_id}` : null;
        return `\`#${m.id}\` **${m.titre}** · ${rr.roles(m).length} rôle(s) · ${m.mode === 'menu' ? '📋' : '🔘'}${m.unique_role ? ' · 1️⃣' : ''}${lien ? ` · [↗](${lien})` : ''}`;
      });
      return interaction.reply(C.envoiPrive([C.conteneur([
        C.texte(`## 🎭 ${t('rr.liste_titre')}`),
        C.texte(lignes.join('\n')),
        C.texte(`-# ${t('rr.liste_pied')}`),
      ], conf.couleurs.principale)]));
    }

    // ------------------------------------------------------------- CREER
    if (sous === 'create') {
      if (rr.q.compter.get(guild.id).n >= rr.MAX_MENUS) return interaction.reply(C.erreurPrivee(t('rr.trop_menus', { max: rr.MAX_MENUS })));
      const role = interaction.options.getRole('role');
      const souci = verifierRole(interaction, role);
      if (souci) return interaction.reply(C.erreurPrivee(t(souci, { role: `${role}` })));
      const emoji = interaction.options.getString('emoji');
      if (emoji && !rr.emojiValide(emoji)) return interaction.reply(C.erreurPrivee(t('rr.emoji_invalide')));

      const salon = interaction.options.getChannel('channel') ?? interaction.channel;
      if (!salon.permissionsFor(guild.members.me)?.has([PermissionFlagsBits.SendMessages, PermissionFlagsBits.ViewChannel])) {
        return interaction.reply(C.erreurPrivee(t('rr.salon_interdit', { salon: `${salon}` })));
      }

      const r = rr.q.creer.run({
        guild_id: guild.id,
        channel_id: salon.id,
        titre: interaction.options.getString('title'),
        description: interaction.options.getString('description'),
        mode: interaction.options.getString('mode') ?? 'boutons',
        unique_role: interaction.options.getBoolean('single') ? 1 : 0,
        roles: JSON.stringify([{ role_id: role.id, emoji, label: interaction.options.getString('label') }]),
        cree_le: Date.now(),
      });
      const menu = rr.q.lire.get(Number(r.lastInsertRowid), guild.id);
      const message = await salon.send(rr.construire(menu, guild));
      rr.q.message.run(message.id, salon.id, menu.id);
      return interaction.reply(C.succesPrive(t('rr.cree', { n: menu.id, salon: `${salon}` })));
    }

    // ---------------------------------------- AJOUTER / RETIRER / SUPPRIMER
    const id = interaction.options.getInteger('panel');
    const menu = rr.q.lire.get(id, guild.id);
    if (!menu) return interaction.reply(C.erreurPrivee(t('rr.introuvable', { n: id })));

    if (sous === 'delete') {
      rr.q.supprimer.run(id, guild.id);
      const salon = guild.channels.cache.get(menu.channel_id);
      if (salon && menu.message_id) await salon.messages.delete(menu.message_id).catch(() => null);
      return interaction.reply(C.succesPrive(t('rr.supprime', { n: id })));
    }

    const role = interaction.options.getRole('role');
    const liste = rr.roles(menu);

    if (sous === 'add') {
      const souci = verifierRole(interaction, role);
      if (souci) return interaction.reply(C.erreurPrivee(t(souci, { role: `${role}` })));
      if (liste.some((x) => x.role_id === role.id)) return interaction.reply(C.infoPrivee(t('rr.deja', { role: `${role}` })));
      if (liste.length >= rr.MAX_ROLES) return interaction.reply(C.erreurPrivee(t('rr.trop_roles', { max: rr.MAX_ROLES })));
      const emoji = interaction.options.getString('emoji');
      if (emoji && !rr.emojiValide(emoji)) return interaction.reply(C.erreurPrivee(t('rr.emoji_invalide')));
      liste.push({ role_id: role.id, emoji, label: interaction.options.getString('label') });
    } else {
      const avant = liste.length;
      const reste = liste.filter((x) => x.role_id !== role.id);
      if (reste.length === avant) return interaction.reply(C.infoPrivee(t('rr.pas_dedans', { role: `${role}` })));
      liste.length = 0;
      liste.push(...reste);
    }

    rr.q.roles.run(JSON.stringify(liste), menu.id);
    const neuf = rr.q.lire.get(menu.id, guild.id);
    const ok = await rr.rafraichir(neuf, guild).catch(() => false);
    return interaction.reply(C.succesPrive(
      t(sous === 'add' ? 'rr.role_ajoute' : 'rr.role_retire_ok', { role: `${role}`, n: id })
      + (ok ? '' : `\n${t('rr.message_perdu')}`)
    ));
  },
};
