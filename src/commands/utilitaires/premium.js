/**
 * /premium — Wumi Premium (refait en 2.22).
 *
 *   info         ce que le premium apporte, l'etat sur ce serveur, l'abonnement
 *   bot          Wumi a l'image du serveur : surnom, avatar, banniere, bio
 *   fond-cartes  un fond pour les cartes de tous les membres (rang, profil, niveau)
 *
 * LA REGLE NE CHANGE PAS : rien de ce qui est gratuit ne devient payant. Le
 * premium releve des plafonds (src/utils/limites.js) et ajoute des choses
 * NOUVELLES, reservees aux serveurs qui le soutiennent : themes de carte
 * exclusifs, fond de cartes du serveur, bot personnalise.
 *
 * LE BOUTON D'ABONNEMENT EST UN BOUTON A PART : `ButtonStyle.Premium` ne porte
 * que l'identifiant du SKU, Discord y met le nom, le prix et le paiement. On ne
 * fabrique jamais de page de paiement.
 */
const {
  SlashCommandBuilder,
  InteractionContextType,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  MessageFlags,
  PermissionFlagsBits,
  AttachmentBuilder,
} = require('discord.js');
const { E } = require('../../utils/emojis');
const C = require('../../utils/composants');
const premium = require('../../utils/premium');
const limites = require('../../utils/limites');
const liens = require('../../utils/liens');
const themes = require('../../utils/themesRank');
const fondsPerso = require('../../utils/fondsPerso');
const logger = require('../../utils/logger');
const { traducteur, localisations, t: tr, DEFAUT } = require('../../utils/langues');
const { ts } = require('../../utils/outils');
const essai = require('../../utils/essaiPremium');

const d = (o, cle) => o.setDescription(tr(cle, DEFAUT)).setDescriptionLocalizations(localisations(cle));
const OR = 0xf5b941;
const TYPES_IMAGE = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];

/** Le bouton d'abonnement Discord et le lien du support. */
function boutons(t, etat, guildId = null, langue = null) {
  const rangee = new ActionRowBuilder();
  // 2.24 : l'essai gratuit, tant que le serveur ne l'a pas utilise.
  if (guildId && !etat.premium && essai.disponibilite(guildId) === 'ok') rangee.addComponents(essai.bouton(langue));
  if (premium.sku() && (!etat.premium || etat.source === 'essai')) rangee.addComponents(new ButtonBuilder().setStyle(ButtonStyle.Premium).setSKUId(premium.sku()));
  if (liens.support()) rangee.addComponents(new ButtonBuilder().setLabel(t('invite.bouton_support')).setStyle(ButtonStyle.Link).setURL(liens.support()));
  return rangee.components.length ? rangee : null;
}

/** Refus commun : il faut le premium. */
function sansPremium(t, guildId = null, langue = null) {
  const etat = { premium: false };
  const r = boutons(t, etat, guildId, langue);
  return C.envoiPrive([C.conteneur([
    C.texte(`## ${E('etoile')} ${t('premium.requis_titre')}\n${t('premium.requis')}`),
    ...(r ? [r] : [C.texte(`-# ${t('premium.bientot')}`)]),
  ], OR)]);
}

function vueInfo(interaction) {
  const { t, nombre, langue } = traducteur(interaction);
  const guildId = interaction.guild.id;
  const etat = premium.details(guildId);
  const blocs = [C.texte(`## ${E('etoile')} ${t('premium.titre')}`)];

  blocs.push(C.texte(etat.premium
    ? `${E('succes')} ${t('premium.actif', { serveur: interaction.guild.name })}`
      + (etat.jusqu_a ? `\n${t('premium.jusqu_a')} ${ts(etat.jusqu_a, 'D')} (${ts(etat.jusqu_a, 'R')})` : `\n${t('premium.sans_limite')}`)
      + `\n-# ${t(`premium.source.${etat.source}`)}`
    : t('premium.inactif') + (essai.disponibilite(guildId) === 'ok' ? `\n\n🎁 ${t('premium.essai.ligne')}` : '')));
  blocs.push(C.separateur());

  // Les exclusivites.
  const exclusifs = themes.liste(require('../../utils/langues').langueDe(guildId)).filter((th) => th.premium).map((th) => `${th.emoji ?? ''} ${th.nom}`.trim()).join(' · ');
  blocs.push(C.texte([
    `### ${t('premium.exclusif_titre')}`,
    `${E('palette')} **${t('premium.ex_themes')}** · ${exclusifs}`,
    `-# ${t('premium.ex_themes_detail')}`,
    `${E('dossier')} **${t('premium.ex_fond')}** · \`/premium fond-cartes\``,
    `-# ${t('premium.ex_fond_detail')}`,
    `${E('robot')} **${t('premium.ex_bot')}** · \`/premium bot\``,
    `-# ${t('premium.ex_bot_detail')}`,
  ].join('\n')));

  // Les plafonds, tires de la table des limites (toujours exacts).
  const lignes = Object.entries(limites.PLAFONDS).map(([nom, p]) =>
    `${E('xp')} **${t(`premium.limite.${nom}`)}** · ${nombre(p.gratuit)} → **${nombre(p.premium)}**`);
  blocs.push(C.texte(`### ${t('premium.plafonds_titre')}\n${lignes.join('\n')}`));
  blocs.push(C.separateur());
  blocs.push(C.texte(`-# ${t('premium.jamais_retire')}`));

  const r = boutons(t, etat, guildId, langue);
  blocs.push(r ?? C.texte(`-# ${t('premium.bientot')}`));
  return C.envoi([C.conteneur(blocs, OR)], { flags: MessageFlags.Ephemeral });
}

async function telecharger(piece) {
  if (!piece) return null;
  const type = (piece.contentType ?? '').split(';')[0].trim();
  if (type && !TYPES_IMAGE.includes(type)) throw new Error('format');
  if (piece.size > 8 * 1024 * 1024) throw new Error('taille');
  const r = await fetch(piece.url, { signal: AbortSignal.timeout(20_000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return Buffer.from(await r.arrayBuffer());
}

/** Lance l'essai gratuit (commande ou bouton). Renvoie la reponse a envoyer. */
function lancerEssai(interaction) {
  const { t, langue } = traducteur(interaction);
  if (!interaction.inGuild()) return C.erreurPrivee(t('commun.serveur_uniquement'));
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) return C.erreurPrivee(t('premium.essai.permission'));
  const dispo = essai.disponibilite(interaction.guildId);
  if (dispo === 'premium') return C.infoPrivee(t('premium.essai.deja_premium'));
  if (dispo === 'deja') return C.infoPrivee(t('premium.essai.deja'));
  const fin = essai.lancer(interaction.guildId, interaction.user.id, langue);
  if (!fin) return C.erreurPrivee(t('premium.essai.deja'));
  return C.envoi([C.conteneur([
    C.texte(`## 🎁 ${t('premium.essai.lance_titre')}\n${t('premium.essai.lance', {
      serveur: interaction.guild?.name ?? '', fin: `${ts(fin, 'D')} (${ts(fin, 'R')})`,
      E_palette: E('palette'), E_dossier: E('dossier'), E_robot: E('robot'), E_xp: E('xp'),
    })}`),
  ], OR)]);
}

module.exports = {
  categorie: 'utilitaires',

  /** Boutons « prm_ » : l'essai gratuit. */
  async gererInteraction(interaction) {
    if (interaction.customId === 'prm_essai') return interaction.reply(lancerEssai(interaction));
    return null;
  },

  data: d(new SlashCommandBuilder().setName('premium'), 'premium.description_commande')
    .setContexts(InteractionContextType.Guild)
    .addSubcommand((s) => d(s.setName('info'), 'premium.sous_info'))
    .addSubcommand((s) => d(s.setName('trial').setNameLocalizations({ fr: 'essai' }), 'premium.sous_essai'))
    .addSubcommand((s) => d(s.setName('bot'), 'premium.sous_bot')
      .addStringOption((o) => d(o.setName('name').setNameLocalizations({ fr: 'nom' }), 'premium.opt_nom').setMaxLength(32))
      .addAttachmentOption((o) => d(o.setName('avatar'), 'premium.opt_avatar'))
      .addAttachmentOption((o) => d(o.setName('banner').setNameLocalizations({ fr: 'banniere' }), 'premium.opt_banniere'))
      .addStringOption((o) => d(o.setName('bio'), 'premium.opt_bio').setMaxLength(190))
      .addBooleanOption((o) => d(o.setName('reset').setNameLocalizations({ fr: 'reinitialiser' }), 'premium.opt_reset_bot')))
    .addSubcommand((s) => d(s.setName('card-background').setNameLocalizations({ fr: 'fond-cartes' }), 'premium.sous_fond')
      .addAttachmentOption((o) => d(o.setName('image'), 'premium.opt_image'))
      .addBooleanOption((o) => d(o.setName('remove').setNameLocalizations({ fr: 'retirer' }), 'premium.opt_retirer'))),

  async execute(interaction) {
    const { t } = traducteur(interaction);
    const sous = interaction.options.getSubcommand(false) ?? 'info';
    const guild = interaction.guild;
    if (sous === 'info') return interaction.reply(vueInfo(interaction));
    if (sous === 'trial') return interaction.reply(lancerEssai(interaction));

    if (!interaction.memberPermissions.has(PermissionFlagsBits.ManageGuild)) return interaction.reply(C.erreurPrivee(t('premium.permission')));
    if (!premium.estPremium(guild.id)) return interaction.reply(sansPremium(t, guild.id, traducteur(interaction).langue));

    // ------------------------------------------------- BOT A TON IMAGE
    if (sous === 'bot') {
      const reset = interaction.options.getBoolean('reset');
      const nom = interaction.options.getString('name');
      const bio = interaction.options.getString('bio');
      const avatar = interaction.options.getAttachment('avatar');
      const banniere = interaction.options.getAttachment('banner');
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const maj = {};
      try {
        if (reset) Object.assign(maj, { nick: null, avatar: null, banner: null, bio: null });
        else {
          if (nom !== null) maj.nick = nom;
          if (bio !== null) maj.bio = bio;
          if (avatar) maj.avatar = await telecharger(avatar);
          if (banniere) maj.banner = await telecharger(banniere);
        }
      } catch (e) {
        return interaction.editReply(C.erreur(t(e.message === 'format' ? 'premium.image_format' : e.message === 'taille' ? 'premium.image_taille' : 'premium.image_illisible')));
      }
      if (!Object.keys(maj).length) return interaction.editReply(C.info(t('premium.bot_rien')));
      try {
        await guild.members.editMe({ ...maj, reason: `Wumi Premium · ${interaction.user.tag}` });
      } catch (e) {
        logger.avertissement('Premium (profil du bot) :', e.message);
        return interaction.editReply(C.erreur(t('premium.bot_echec', { erreur: e.message.slice(0, 150) })));
      }
      const fait = reset ? [t('premium.bot_reinitialise')] : [
        maj.nick !== undefined && `${E('note')} ${t('premium.bot_nom', { nom: maj.nick || '—' })}`,
        maj.avatar && `${E('palette')} ${t('premium.bot_avatar')}`,
        maj.banner && `${E('palette')} ${t('premium.bot_banniere')}`,
        maj.bio !== undefined && `${E('message')} ${t('premium.bot_bio')}`,
      ].filter(Boolean);
      return interaction.editReply(C.envoi([C.conteneur([
        C.sectionVignette(`## ${E('robot')} ${t('premium.bot_titre')}\n${fait.join('\n')}`, guild.members.me?.displayAvatarURL({ size: 128 }) ?? interaction.client.user.displayAvatarURL()),
        C.texte(`-# ${t('premium.bot_pied')}`),
      ], OR)]));
    }

    // ------------------------------------------------- FOND DES CARTES
    if (interaction.options.getBoolean('remove')) {
      fondsPerso.retirerServeur(guild.id);
      return interaction.reply(C.succesPrive(t('premium.fond_retire')));
    }
    const image = interaction.options.getAttachment('image');
    if (!image) {
      return interaction.reply(C.infoPrivee(t(fondsPerso.fondServeur(guild.id) ? 'premium.fond_actuel' : 'premium.fond_aucun')));
    }
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const r = await fondsPerso.enregistrerServeur(guild.id, image);
    if (!r.ok) return interaction.editReply(C.erreur(r.raison));

    // Apercu : la carte de montee de niveau de l'auteur avec le nouveau fond.
    try {
      const { genererCarteNiveau } = require('../../utils/carteNiveau');
      const png = await genererCarteNiveau({
        pseudo: interaction.member?.displayName ?? interaction.user.username,
        avatarUrl: interaction.user.displayAvatarURL({ extension: 'png', size: 256 }),
        avant: 9, niveau: 10, xpActuel: 120, xpRequis: 600, xpTotal: 6120, bonus: null, rang: 1, roles: [],
        fond: fondsPerso.fondServeur(guild.id),
        textes: {
          titre: t('niveaux_carte.carte_titre'), niveau: t('niveaux_carte.carte_niveau'), xp: t('niveaux_carte.carte_xp'),
          total: t('niveaux_carte.carte_total'), bonus: t('niveaux_carte.carte_bonus'), rang: t('niveaux_carte.carte_rang'), role: t('niveaux_carte.carte_role'),
        },
      });
      return interaction.editReply(C.envoi([C.conteneur([
        C.texte(`## ${E('succes')} ${t('premium.fond_ok_titre')}\n${t('premium.fond_ok')}`),
        C.image('attachment://apercu-fond.png'),
      ], OR)], { files: [new AttachmentBuilder(png, { name: 'apercu-fond.png' })] }));
    } catch (e) {
      logger.debug('Apercu du fond :', e.message);
      return interaction.editReply(C.succes(t('premium.fond_ok')));
    }
  },
};
