/**
 * /shop — les articles du serveur, achetables d'un clic.
 *
 * AVANT, il fallait lire la liste puis retaper `/shop buy number:3`.
 * Le numero etait a recopier de tete, et une faute de frappe achetait autre
 * chose. Maintenant chaque article porte son bouton.
 *
 * Le message reste PUBLIC — une boutique qu'on ne montre pas ne vend rien —
 * et n'importe qui peut acheter depuis la meme liste : la confirmation, elle,
 * est privee (chacun son solde). Seul celui qui a lance la commande change de
 * page, sinon deux personnes qui feuillettent en meme temps se voleraient
 * l'affichage.
 */
const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  InteractionContextType,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
} = require('discord.js');
const conf = require('../../../config');
const { req, config } = require('../../database/db');
const { tronquer } = require('../../utils/outils');
const eco = require('../../utils/economie');
const { E } = require('../../utils/emojis');
const C = require('../../utils/composants');
const { traducteur, localisations, t: tr, DEFAUT } = require('../../utils/langues');

// Six par page : au-dela, on depasse les 40 composants qu'un message
// Components V2 accepte, et la liste devient un mur.
const PAR_PAGE = 6;

/**
 * Achete un article. Utilise par le bouton ET par `/shop buy`, pour que les
 * deux chemins ne puissent pas diverger.
 * @returns {Promise<{ok: boolean, message: string}>}
 */
async function acheter(interaction, id) {
  const { t } = traducteur(interaction);
  const guildId = interaction.guild.id;
  const article = req.article.get(id, guildId);

  if (!article || !article.actif) return { ok: false, message: t('boutique.pas_en_vente', { id }) };
  if (article.stock === 0) return { ok: false, message: t('boutique.rupture', { nom: article.nom }) };

  const disponible = eco.solde(guildId, interaction.user.id);
  if (disponible < article.prix) {
    return {
      ok: false,
      message:
        `${t('boutique.manque', { somme: eco.somme(guildId, article.prix - disponible), nom: article.nom })}\n`
        + t('boutique.tu_as', { somme: eco.somme(guildId, disponible) }),
    };
  }

  // Le role est verifie et attribue AVANT le debit : personne ne doit payer
  // pour un role que le bot ne sait pas donner.
  if (article.role_id) {
    const role = interaction.guild.roles.cache.get(article.role_id);
    if (!role) return { ok: false, message: t('boutique.role_supprime') };
    if (interaction.member.roles.cache.has(role.id)) return { ok: false, message: t('boutique.deja_role', { role: `${role}` }) };
    if (!role.editable) {
      return { ok: false, message: t('boutique.role_trop_bas', { role: `${role}` }) };
    }
    try {
      await interaction.member.roles.add(role, t('boutique.raison_audit', { nom: article.nom }));
    } catch (e) {
      return { ok: false, message: t('boutique.role_impossible', { erreur: e.message }) };
    }
  }

  eco.crediter(guildId, interaction.user.id, -article.prix, false);
  if (article.stock > 0) req.decrementerStock.run(article.id);
  req.enregistrerAchat.run({
    guild_id: guildId,
    user_id: interaction.user.id,
    article_id: article.id,
    nom: article.nom,
    prix: article.prix,
    date: Date.now(),
  });
  require('../../utils/missions').noter(guildId, interaction.user.id, 'achat', 1);

  return {
    ok: true,
    message: [
      t('boutique.achete', { nom: article.nom, somme: eco.somme(guildId, article.prix) }),
      article.role_id ? t('boutique.role_donne', { role: article.role_id }) : null,
      t('boutique.reste', { somme: eco.somme(guildId, eco.solde(guildId, interaction.user.id)) }),
    ].filter(Boolean).join('\n'),
  };
}

/** La vitrine, en Components V2. */
function vueBoutique(interaction, page = 1) {
  const { t, nombre } = traducteur(interaction);
  const guildId = interaction.guild.id;
  const m = eco.monnaie(guildId);
  const tous = req.articles.all(guildId);
  const disponible = eco.solde(guildId, interaction.user.id);

  const pages = Math.max(1, Math.ceil(tous.length / PAR_PAGE));
  const n = Math.min(Math.max(1, page), pages);
  const tranche = tous.slice((n - 1) * PAR_PAGE, n * PAR_PAGE);

  const elements = [
    C.texte(
      `## ${E('panier')} ${t('boutique.vitrine_titre', { serveur: interaction.guild.name })}\n`
      + t('boutique.vitrine_solde', { n: nombre(disponible), monnaie: m.nom })
    ),
    C.separateur(),
  ];

  for (const a of tranche) {
    const abordable = disponible >= a.prix;
    const rupture = a.stock === 0;

    const lignes = [
      `**${a.nom}** — ${m.emoji} ${nombre(a.prix)}`,
      a.description ? `-# ${tronquer(a.description, 150)}` : null,
      a.role_id ? `-# ${t('boutique.ligne_role', { role: a.role_id })}` : null,
      a.stock >= 0 ? `-# ${t('boutique.ligne_stock', { n: nombre(a.stock) })}` : null,
    ].filter(Boolean).join('\n');

    const bouton = new ButtonBuilder()
      .setCustomId(`bout_ach_${a.id}`)
      .setLabel(rupture ? t('boutique.bouton_epuise') : t('boutique.bouton_acheter'))
      .setStyle(abordable && !rupture ? ButtonStyle.Success : ButtonStyle.Secondary)
      .setDisabled(rupture);

    elements.push(C.sectionBouton(lignes, bouton));
  }

  if (pages > 1) {
    elements.push(C.separateur());
    elements.push(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`bout_page_${n - 1}_${interaction.user.id}`)
          .setLabel(t('commun.precedent'))
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(n <= 1),
        new ButtonBuilder()
          .setCustomId(`bout_page_${n + 1}_${interaction.user.id}`)
          .setLabel(t('commun.suivant'))
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(n >= pages)
      )
    );
    // « articles » se decline au singulier/pluriel : on lui passe le compte
    // BRUT (tous.length), jamais une chaine deja formatee par nombre().
    elements.push(C.texte(`-# ${t('commun.page', { n: nombre(n), total: nombre(pages) })} · ${t('boutique.articles', { n: tous.length })}`));
  }

  return C.envoi([C.conteneur(elements)]);
}

module.exports = {
  categorie: 'economie',

  data: new SlashCommandBuilder()
    .setName('shop')
    .setNameLocalizations({ fr: 'boutique' })
    .setDescription(tr('boutique.description_commande', DEFAUT))
    .setDescriptionLocalizations(localisations('boutique.description_commande'))
    .setContexts(InteractionContextType.Guild)

    .addSubcommand((s) => s
      .setName('view')
      .setNameLocalizations({ fr: 'voir' })
      .setDescription(tr('boutique.sous_voir', DEFAUT))
      .setDescriptionLocalizations(localisations('boutique.sous_voir')))
    .addSubcommand((s) => s
      .setName('buy')
      .setNameLocalizations({ fr: 'acheter' })
      .setDescription(tr('boutique.sous_acheter', DEFAUT))
      .setDescriptionLocalizations(localisations('boutique.sous_acheter'))
      .addIntegerOption((o) => o
        .setName('number')
        .setNameLocalizations({ fr: 'numero' })
        .setDescription(tr('boutique.opt_numero', DEFAUT))
        .setDescriptionLocalizations(localisations('boutique.opt_numero'))
        .setRequired(true).setMinValue(1)))
    .addSubcommand((s) => s
      .setName('add')
      .setNameLocalizations({ fr: 'ajouter' })
      .setDescription(tr('boutique.sous_ajouter', DEFAUT))
      .setDescriptionLocalizations(localisations('boutique.sous_ajouter'))
      .addStringOption((o) => o
        .setName('name')
        .setNameLocalizations({ fr: 'nom' })
        .setDescription(tr('boutique.opt_nom', DEFAUT))
        .setDescriptionLocalizations(localisations('boutique.opt_nom'))
        .setRequired(true).setMaxLength(80))
      .addIntegerOption((o) => o
        .setName('price')
        .setNameLocalizations({ fr: 'prix' })
        .setDescription(tr('boutique.opt_prix', DEFAUT))
        .setDescriptionLocalizations(localisations('boutique.opt_prix'))
        .setRequired(true).setMinValue(1))
      .addRoleOption((o) => o
        .setName('role')
        .setDescription(tr('boutique.opt_role', DEFAUT))
        .setDescriptionLocalizations(localisations('boutique.opt_role')))
      .addStringOption((o) => o
        .setName('description')
        .setDescription(tr('boutique.opt_description', DEFAUT))
        .setDescriptionLocalizations(localisations('boutique.opt_description'))
        .setMaxLength(200))
      .addIntegerOption((o) => o
        .setName('stock')
        .setDescription(tr('boutique.opt_stock', DEFAUT))
        .setDescriptionLocalizations(localisations('boutique.opt_stock'))
        .setMinValue(1).setMaxValue(10000)))
    .addSubcommand((s) => s
      .setName('remove')
      .setNameLocalizations({ fr: 'retirer' })
      .setDescription(tr('boutique.sous_retirer', DEFAUT))
      .setDescriptionLocalizations(localisations('boutique.sous_retirer'))
      .addIntegerOption((o) => o
        .setName('number')
        .setNameLocalizations({ fr: 'numero' })
        .setDescription(tr('boutique.opt_numero', DEFAUT))
        .setDescriptionLocalizations(localisations('boutique.opt_numero'))
        .setRequired(true).setMinValue(1))),

  async execute(interaction) {
    const { t } = traducteur(interaction);
    const sous = interaction.options.getSubcommand();
    const guildId = interaction.guild.id;
    const cfg = config(guildId);

    if (!cfg.eco_actif) {
      return interaction.reply(C.avertissementPrivee(t('boutique.eco_desactivee')));
    }

    // ========================================================== ADD
    if (sous === 'add') {
      if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
        return interaction.reply(C.erreurPrivee(t('boutique.reserve_equipe')));
      }
      const role = interaction.options.getRole('role');
      if (role && (role.managed || role.position >= interaction.guild.members.me.roles.highest.position)) {
        return interaction.reply(C.erreurPrivee(t('boutique.role_trop_haut', { role: `${role}` })));
      }

      const nom = interaction.options.getString('name');
      const prix = interaction.options.getInteger('price');
      const info = req.ajouterArticle.run({
        guild_id: guildId,
        nom,
        description: interaction.options.getString('description') ?? null,
        prix,
        role_id: role?.id ?? null,
        stock: interaction.options.getInteger('stock') ?? -1,
      });

      return interaction.reply(C.succes(
        t('boutique.ajoute', { id: info.lastInsertRowid, nom, somme: eco.somme(guildId, prix) })
        + (role ? `\n${t('boutique.ajoute_role', { role: `${role}` })}` : '')
      ));
    }

    // ========================================================== REMOVE
    if (sous === 'remove') {
      if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
        return interaction.reply(C.erreurPrivee(t('boutique.reserve_equipe')));
      }
      const id = interaction.options.getInteger('number');
      const article = req.article.get(id, guildId);
      if (!article) {
        return interaction.reply(C.erreurPrivee(t('boutique.aucun_article', { id })));
      }
      req.retirerArticle.run(id, guildId);
      return interaction.reply(C.succes(t('boutique.retire', { nom: article.nom })));
    }

    // ========================================================== BUY
    if (sous === 'buy') {
      const resultat = await acheter(interaction, interaction.options.getInteger('number'));
      if (!resultat.ok) {
        return interaction.reply(C.erreurPrivee(resultat.message));
      }
      return interaction.reply(C.envoi([
        C.conteneur([
          C.texte(`## ${E('panier')} ${t('boutique.achat_titre')}`),
          C.texte(resultat.message),
        ], conf.couleurs.succes),
      ]));
    }

    // ============================================================= VIEW
    if (!req.articles.all(guildId).length) {
      return interaction.reply(C.info(t('boutique.vide')));
    }

    return interaction.reply(vueBoutique(interaction, 1));
  },

  /** Boutons de la vitrine. Route depuis interactionCreate via « bout_ ». */
  async gererInteraction(interaction) {
    const { t } = traducteur(interaction);
    const [, action, brut, auteurId] = interaction.customId.split('_');

    // Changer de page : reserve a celui qui a lance la commande, sinon deux
    // personnes qui feuillettent en meme temps se voleraient l'affichage.
    if (action === 'page') {
      if (interaction.user.id !== auteurId) {
        return interaction.reply(C.erreurPrivee(t('boutique.pilotee')));
      }
      return interaction.update(vueBoutique(interaction, Number(brut)));
    }

    // Acheter : ouvert a TOUT LE MONDE. C'est une boutique — chacun achete
    // pour soi depuis la meme vitrine, et la confirmation est privee.
    const cfg = config(interaction.guild.id);
    if (!cfg.eco_actif) {
      return interaction.reply(C.avertissementPrivee(t('boutique.eco_desactivee_court')));
    }

    const resultat = await acheter(interaction, Number(brut));
    return interaction.reply(resultat.ok ? C.succesPrive(resultat.message) : C.erreurPrivee(resultat.message));
  },

  // Exportes pour les tests
  acheter,
  vueBoutique,
  PAR_PAGE,
};
