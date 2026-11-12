/**
 * /theme — les habillages de la carte /rank.
 *
 * La liste porte un bouton par theme, dont l'action depend de ce que le membre
 * possede deja : « Acheter » s'il ne l'a pas, « Équiper » s'il l'a, et le
 * theme en cours est grise. Un menu deroulant en bas permet d'ESSAYER un
 * theme avant de l'acheter, sans depenser un sou.
 *
 * Une section Components V2 n'accepte qu'UN bouton a sa droite : d'ou le choix
 * d'un bouton contextuel plutot que deux (acheter + essayer) par ligne.
 */
const {
  SlashCommandBuilder,
  AttachmentBuilder,
  InteractionContextType,
  MessageFlags,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  ActionRowBuilder,
} = require('discord.js');
const { req, config } = require('../../database/db');
const themes = require('../../utils/themesRank');
const eco = require('../../utils/economie');
const { infosNiveau, rangDe } = require('../../utils/niveaux');
const { genererCarteRank } = require('../../utils/carteRank');
const { E } = require('../../utils/emojis');
const C = require('../../utils/composants');
const { traducteur, localisations, t: tr, DEFAUT } = require('../../utils/langues');

/**
 * Les cles disponibles, pretes pour les choix d'une option de commande.
 *
 * `name` vient de `themes.liste()`, donc de `config.js` (themesRank) : le nom
 * et la description de chaque theme sont des donnees de configuration du bot,
 * en francais en dur, sans equivalent anglais. On ne peut pas leur donner de
 * `name_localizations` sans une table de traduction separee qui risquerait de
 * partir en decalage avec config.js — signale dans le rapport plutot que
 * bricole ici.
 */
const CHOIX = themes.liste().slice(0, 25).map((t) => ({ name: `${t.emoji ?? ''} ${t.nom}`.trim(), value: t.cle }));

/** Genere un apercu de carte avec les vraies donnees du membre (ou un exemple). */
async function apercu(interaction, theme) {
  const guildId = interaction.guild.id;
  const ligne = req.getXp.get(guildId, interaction.user.id);
  const membre = interaction.member;

  const infos = infosNiveau(ligne?.xp ?? 0);
  // Sans XP, on montre un exemple plutot qu'une carte vide a zero.
  const exemple = !ligne || ligne.xp <= 0;

  return genererCarteRank({
    pseudo: membre?.displayName ?? interaction.user.username,
    tag: interaction.user.username,
    avatarUrl: interaction.user.displayAvatarURL({ extension: 'png', size: 256 }),
    niveau: exemple ? 12 : infos.niveau,
    rang: exemple ? 7 : rangDe(guildId, ligne.xp),
    totalMembres: req.totalMembresXp.get(guildId).n,
    xpActuel: exemple ? 640 : infos.xpActuel,
    xpRequis: exemple ? 1000 : infos.xpRequis,
    xpTotal: exemple ? 12_400 : infos.xpTotal,
    messages: exemple ? 1240 : ligne.messages,
    accent: membre?.displayHexColor && membre.displayHexColor !== '#000000' ? membre.displayHexColor : null,
    theme,
  });
}

/** Achete un theme et l'equipe dans la foulee. Partage bouton / commande. */
function acheterTheme(interaction, cle) {
  const { t } = traducteur(interaction);
  const guildId = interaction.guild.id;
  const userId = interaction.user.id;
  if (!themes.existe(cle)) return { ok: false, message: t('theme.introuvable') };
  const theme = themes.parCle(cle);

  if (!config(guildId).eco_actif) {
    return { ok: false, message: t('theme.eco_desactivee') };
  }
  if (themes.possede(guildId, userId, cle)) {
    return { ok: false, message: t('theme.deja_possede', { nom: theme.nom }) };
  }

  const solde = eco.solde(guildId, userId);
  if (solde < theme.prix) {
    return {
      ok: false,
      message: t('theme.solde_insuffisant', {
        manque: eco.somme(guildId, theme.prix - solde),
        nom: theme.nom,
        solde: eco.somme(guildId, solde),
      }),
    };
  }

  // Debit, achat, puis equipement : c'est ce qu'on attend apres un achat.
  eco.crediter(guildId, userId, -theme.prix, false);
  themes.acheter(guildId, userId, cle);
  themes.equiper(guildId, userId, cle);
  return { ok: true, theme, message: t('theme.achete_fait', { nom: theme.nom, somme: eco.somme(guildId, theme.prix) }) };
}

/** Equipe un theme deja possede. */
function equiperTheme(interaction, cle) {
  const { t } = traducteur(interaction);
  const guildId = interaction.guild.id;
  const userId = interaction.user.id;
  if (!themes.existe(cle)) return { ok: false, message: t('theme.introuvable') };
  const theme = themes.parCle(cle);
  if (!themes.possede(guildId, userId, cle)) {
    return { ok: false, message: t('theme.pas_possede', { nom: theme.nom, somme: eco.somme(guildId, theme.prix) }) };
  }
  themes.equiper(guildId, userId, cle);
  return { ok: true, theme, message: t('theme.equipe_fait', { nom: theme.nom }) };
}

/** La liste des themes, chacun avec le bouton qui correspond a son etat. */
function vueThemes(interaction) {
  const { t, nombre } = traducteur(interaction);
  const guildId = interaction.guild.id;
  const userId = interaction.user.id;
  const possedes = themes.possessions(guildId, userId);
  const actuel = themes.themeDe(guildId, userId).cle;
  const m = eco.monnaie(guildId);
  const solde = eco.solde(guildId, userId);

  const elements = [
    C.texte(`## ${E('palette')} ${t('theme.titre')}\n${t('theme.solde_ligne', { solde: nombre(solde), monnaie: m.nom })}`),
    C.separateur(),
  ];

  for (const th of themes.liste().slice(0, 10)) {
    const aLui = possedes.includes(th.cle);
    const equipe = th.cle === actuel;

    const etat = equipe
      ? t('theme.etat_equipe')
      : aLui
        ? t('theme.etat_debloque')
        : th.prix === 0
          ? t('theme.etat_offert')
          : `${m.emoji} ${nombre(th.prix)}`;

    const bouton = new ButtonBuilder()
      .setCustomId(equipe ? `thm_rien_${th.cle}` : aLui || th.prix === 0 ? `thm_eq_${th.cle}` : `thm_ach_${th.cle}`)
      .setLabel(equipe ? t('theme.bouton_equipe') : aLui || th.prix === 0 ? t('theme.bouton_equiper') : t('theme.bouton_acheter'))
      .setStyle(equipe ? ButtonStyle.Secondary : aLui || th.prix === 0 ? ButtonStyle.Primary : ButtonStyle.Success)
      .setDisabled(equipe || (!aLui && th.prix > 0 && solde < th.prix));

    // th.nom / th.description : donnees de config.js, pas traduites (voir CHOIX plus haut).
    elements.push(
      C.sectionBouton(`${th.emoji ?? E('palette')} **${th.nom}** — ${etat}\n-# ${th.description}`, bouton)
    );
  }

  elements.push(C.separateur());
  elements.push(
    new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`thm_try_${userId}`)
        .setPlaceholder(t('theme.select_placeholder'))
        .addOptions(
          themes.liste().slice(0, 25).map((th) => ({
            label: th.nom,
            value: th.cle,
            description: th.description?.slice(0, 100),
          }))
        )
    )
  );

  return C.envoi([C.conteneur(elements)]);
}

module.exports = {
  categorie: 'niveau',

  data: new SlashCommandBuilder()
    .setName('theme')
    .setDescription(tr('theme.description_commande', DEFAUT))
    .setDescriptionLocalizations(localisations('theme.description_commande'))
    .setContexts(InteractionContextType.Guild)

    .addSubcommand((s) => s
      .setName('liste')
      .setNameLocalizations({ 'en-US': 'list' })
      .setDescription(tr('theme.sous_liste', DEFAUT))
      .setDescriptionLocalizations(localisations('theme.sous_liste')))
    .addSubcommand((s) => s
      .setName('apercu')
      .setNameLocalizations({ 'en-US': 'preview' })
      .setDescription(tr('theme.sous_apercu', DEFAUT))
      .setDescriptionLocalizations(localisations('theme.sous_apercu'))
      .addStringOption((o) => o
        .setName('theme')
        .setDescription(tr('theme.opt_theme_apercu', DEFAUT))
        .setDescriptionLocalizations(localisations('theme.opt_theme_apercu'))
        .setRequired(true)
        .addChoices(...CHOIX)))
    .addSubcommand((s) => s
      .setName('acheter')
      .setNameLocalizations({ 'en-US': 'buy' })
      .setDescription(tr('theme.sous_acheter', DEFAUT))
      .setDescriptionLocalizations(localisations('theme.sous_acheter'))
      .addStringOption((o) => o
        .setName('theme')
        .setDescription(tr('theme.opt_theme_acheter', DEFAUT))
        .setDescriptionLocalizations(localisations('theme.opt_theme_acheter'))
        .setRequired(true)
        .addChoices(...CHOIX)))
    .addSubcommand((s) => s
      .setName('equiper')
      .setNameLocalizations({ 'en-US': 'equip' })
      .setDescription(tr('theme.sous_equiper', DEFAUT))
      .setDescriptionLocalizations(localisations('theme.sous_equiper'))
      .addStringOption((o) => o
        .setName('theme')
        .setDescription(tr('theme.opt_theme_equiper', DEFAUT))
        .setDescriptionLocalizations(localisations('theme.opt_theme_equiper'))
        .setRequired(true)
        .addChoices(...CHOIX))),

  async execute(interaction) {
    const { t } = traducteur(interaction);
    const sous = interaction.options.getSubcommand();
    const guildId = interaction.guild.id;
    const userId = interaction.user.id;
    const cle = interaction.options.getString('theme');

    // ------------------------------------------------------------- LISTE
    if (sous === 'liste') return interaction.reply(vueThemes(interaction));

    if (!themes.existe(cle)) {
      return interaction.reply(C.erreurPrivee(t('theme.introuvable')));
    }
    const theme = themes.parCle(cle);

    // ------------------------------------------------------------ APERCU
    if (sous === 'apercu') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const png = await apercu(interaction, theme);
      const debloque = themes.possede(guildId, userId, cle);
      const nomFichier = `apercu-${cle}.png`;
      return interaction.editReply(
        // PIEGE V2 : une piece jointe ne s'affiche plus toute seule, il faut
        // la referencer explicitement par C.image('attachment://...').
        C.envoi([C.conteneur([
          C.texte(debloque
            ? t('theme.apercu_debloque', { nom: theme.nom })
            : t('theme.apercu_a_acheter', { nom: theme.nom, somme: eco.somme(guildId, theme.prix) })),
          C.image(`attachment://${nomFichier}`, t('theme.alt_apercu', { nom: theme.nom })),
        ])], { files: [new AttachmentBuilder(png, { name: nomFichier })] })
      );
    }

    // ----------------------------------------------------------- ACHETER
    if (sous === 'acheter') {
      const r = acheterTheme(interaction, cle);
      if (!r.ok) return interaction.reply(C.erreurPrivee(r.message));

      await interaction.deferReply();
      const png = await apercu(interaction, r.theme);
      const nomFichier = `apercu-${cle}.png`;
      return interaction.editReply(
        C.envoi([C.conteneur([
          C.texte(`${E('succes')} ${t('theme.achete_public', { id: userId, nom: r.theme.nom })}`),
          C.image(`attachment://${nomFichier}`, t('theme.alt_apercu', { nom: r.theme.nom })),
        ])], { files: [new AttachmentBuilder(png, { name: nomFichier })] })
      );
    }

    // ---------------------------------------------------------- EQUIPER
    const r = equiperTheme(interaction, cle);
    if (!r.ok) return interaction.reply(C.erreurPrivee(r.message));

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const png = await apercu(interaction, r.theme);
    const nomFichier = `apercu-${cle}.png`;
    return interaction.editReply(
      C.envoi([C.conteneur([
        C.texte(`${E('succes')} ${t('theme.equipe_public', { nom: r.theme.nom })}`),
        C.image(`attachment://${nomFichier}`, t('theme.alt_apercu', { nom: r.theme.nom })),
      ])], { files: [new AttachmentBuilder(png, { name: nomFichier })] })
    );
  },

  /** Boutons et menu de la liste. Route via le prefixe « thm_ ». */
  async gererInteraction(interaction) {
    const { t } = traducteur(interaction);
    const [, action, ...reste] = interaction.customId.split('_');

    // ---- Essayer : le menu deroulant ---------------------------------
    if (action === 'try') {
      const auteurId = reste.join('_');
      if (interaction.user.id !== auteurId) {
        return interaction.reply(C.erreurPrivee(t('theme.liste_pilotee')));
      }
      const cle = interaction.values?.[0];
      if (!themes.existe(cle)) return null;
      const theme = themes.parCle(cle);

      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const png = await apercu(interaction, theme);
      const aLui = themes.possede(interaction.guild.id, interaction.user.id, cle);
      const nomFichier = `apercu-${cle}.png`;
      return interaction.editReply(
        C.envoi([C.conteneur([
          C.texte(aLui
            ? t('theme.essai_possede', { nom: theme.nom })
            : t('theme.essai_a_acheter', { nom: theme.nom, somme: eco.somme(interaction.guild.id, theme.prix) })),
          C.image(`attachment://${nomFichier}`, t('theme.alt_apercu', { nom: theme.nom })),
        ])], { files: [new AttachmentBuilder(png, { name: nomFichier })] })
      );
    }

    const cle = reste.join('_');
    if (action === 'rien') return interaction.deferUpdate();

    const r = action === 'ach' ? acheterTheme(interaction, cle) : equiperTheme(interaction, cle);
    if (!r.ok) return interaction.reply(C.erreurPrivee(r.message));

    // La liste change d'etat apres un achat ou un equipement : on la
    // rafraichit, sinon les boutons mentiraient jusqu'au prochain /theme.
    await interaction.update(vueThemes(interaction));

    const png = await apercu(interaction, r.theme);
    const nomFichier = `apercu-${cle}.png`;
    return interaction.followUp(
      C.envoiPrive([C.conteneur([
        C.texte(`${E('succes')} ${r.message}`),
        C.image(`attachment://${nomFichier}`, t('theme.alt_apercu', { nom: r.theme.nom })),
      ])], { files: [new AttachmentBuilder(png, { name: nomFichier })] })
    );
  },

  // Exportes pour les tests
  acheterTheme,
  equiperTheme,
  vueThemes,
};
