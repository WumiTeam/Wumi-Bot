/**
 * /item — les objets du serveur, achetables et utilisables d'un clic.
 *
 * La liste porte un bouton « Acheter » par objet, et l'inventaire un bouton
 * « Utiliser ». Fini le `/item use item:potion_xp` a retaper.
 *
 * Un cas demande plus : la couleur de pseudo a besoin d'un code hexadecimal.
 * Le bouton ouvre donc une petite fenetre ou on le saisit, plutot que de
 * renvoyer le membre a la commande — c'est le seul objet dans ce cas.
 */
const {
  SlashCommandBuilder,
  InteractionContextType,
  MessageFlags,
  PermissionFlagsBits,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
} = require('discord.js');
const { config } = require('../../database/db');
const objets = require('../../utils/objets');
const eco = require('../../utils/economie');
const { ts } = require('../../utils/outils');
const { E } = require('../../utils/emojis');
const C = require('../../utils/composants');
const { traducteur, localisations, t: tr, DEFAUT } = require('../../utils/langues');

const CHOIX = objets
  .liste()
  .slice(0, 25)
  .map((o) => ({ name: `${o.emoji ?? ''} ${o.nom} — ${o.prix}`.trim(), value: o.cle }));

/** Cree (ou reutilise) un role de couleur, et l'applique au membre. */
async function appliquerCouleur(interaction, hex) {
  const { t } = traducteur(interaction);
  const guild = interaction.guild;
  // Un nom de role : Discord n'y rend pas les emojis d'application.
  const nom = `🎨 ${hex}`;
  let role = guild.roles.cache.find((r) => r.name === nom);

  if (!role) {
    const moi = guild.members.me;
    role = await guild.roles.create({
      name: nom,
      color: hex,
      reason: t('objet.raison_audit'),
      // Juste sous le bot pour que la couleur soit reellement visible.
      position: Math.max(1, moi.roles.highest.position - 1),
    });
  }
  await interaction.member.roles.add(role, t('objet.raison_audit'));
  return role;
}

/**
 * Achete un objet. Partage par le bouton et par `/item buy`.
 * @returns {{ok: boolean, message: string}}
 */
function acheterObjet(interaction, cle, quantite = 1) {
  const { t } = traducteur(interaction);
  const guildId = interaction.guild.id;
  const userId = interaction.user.id;
  const objet = objets.parCle(cle);
  if (!objet) return { ok: false, message: t('objet.inexistant') };
  if (!config(guildId).eco_actif) return { ok: false, message: t('objet.eco_desactivee') };

  const cout = objet.prix * quantite;
  const solde = eco.solde(guildId, userId);
  if (solde < cout) {
    return {
      ok: false,
      message: `${t('objet.manque', { somme: eco.somme(guildId, cout - solde) })}\n${t('objet.tu_as', { somme: eco.somme(guildId, solde) })}`,
    };
  }

  eco.crediter(guildId, userId, -cout, false);
  objets.donner(guildId, userId, cle, quantite);
  require('../../utils/missions').noter(guildId, userId, 'achat', 1);

  return {
    ok: true,
    message:
      `${t('objet.achete', { emoji: objet.emoji, nom: objet.nom, n: quantite, somme: eco.somme(guildId, cout) })}\n`
      + t('objet.reste', { somme: eco.somme(guildId, eco.solde(guildId, userId)) }),
  };
}

/**
 * Utilise un objet. Partage par le bouton, la fenetre de couleur et la
 * commande — les trois chemins ne peuvent donc pas diverger.
 */
async function utiliserObjet(interaction, cle, couleur = null) {
  const { t } = traducteur(interaction);
  const guildId = interaction.guild.id;
  const userId = interaction.user.id;
  const objet = objets.parCle(cle);
  if (!objet) return { ok: false, message: t('objet.inexistant') };

  if (objet.effet === 'couleur' && (!couleur || !/^#?[0-9a-f]{6}$/i.test(couleur))) {
    return { ok: false, message: t('objet.couleur_invalide') };
  }

  const r = objets.utiliser(guildId, userId, cle);
  if (!r.ok) {
    // src/utils/objets.js#utiliser rend un message en français fige — c'est
    // un utilitaire partage, hors de ce lot, qu'on ne modifie pas. On
    // reconnait ici l'ensemble fini de ce qu'il peut renvoyer plutot que
    // d'afficher son français brut a un serveur anglophone.
    if (r.message.includes('inventaire')) return { ok: false, message: t('objet.pas_dans_inventaire', { nom: objet.nom }) };
    if (r.message.includes('deja un effet')) return { ok: false, message: t('objet.effet_deja_actif', { nom: objet.nom }) };
    return { ok: false, message: t('objet.inexistant') };
  }

  // La couleur demande de creer un role : si ca echoue, on rend l'objet.
  if (objet.effet === 'couleur') {
    try {
      const hex = couleur.startsWith('#') ? couleur : `#${couleur}`;
      const role = await appliquerCouleur(interaction, hex);
      const dernier = objets.effets(guildId, userId).find((e) => e.type === 'couleur');
      if (dernier) require('../../database/db').db.prepare('UPDATE effets SET valeur = ? WHERE id = ?').run(role.id, dernier.id);
    } catch (e) {
      objets.donner(guildId, userId, cle, 1);
      return { ok: false, message: t('objet.role_impossible', { erreur: e.message }) };
    }
  }

  return { ok: true, message: t('objet.utilise', { emoji: objet.emoji, nom: objet.nom, quand: ts(r.expire, 'R') }) };
}

/** La liste des objets en vente, avec un bouton par objet. */
function vueListe(interaction) {
  const { t, nombre } = traducteur(interaction);
  const guildId = interaction.guild.id;
  const m = eco.monnaie(guildId);
  const solde = eco.solde(guildId, interaction.user.id);

  const elements = [
    C.texte(`## ${E('sac')} ${t('objet.liste_titre')}\n${t('objet.solde_ligne', { n: nombre(solde), monnaie: m.nom })}`),
    C.separateur(),
  ];

  for (const o of objets.liste().slice(0, 10)) {
    elements.push(
      C.sectionBouton(
        `${o.emoji ?? E('colis')} **${o.nom}** — ${m.emoji} ${nombre(o.prix)}\n-# ${o.description}`,
        new ButtonBuilder()
          .setCustomId(`obj_ach_${o.cle}`)
          .setLabel(t('objet.bouton_acheter'))
          .setStyle(solde >= o.prix ? ButtonStyle.Success : ButtonStyle.Secondary)
      )
    );
  }

  return C.envoi([C.conteneur(elements)]);
}

/** L'inventaire, avec un bouton « Utiliser » par objet possede. */
function vueInventaire(interaction) {
  const { t, nombre, existe } = traducteur(interaction);
  const guildId = interaction.guild.id;
  const userId = interaction.user.id;
  const sac = objets.inventaire(guildId, userId);
  const actifs = objets.effets(guildId, userId);

  const elements = [C.texte(`## ${E('sac')} ${t('objet.inventaire_titre', { membre: interaction.user.username })}`)];

  if (!sac.length) {
    elements.push(C.texte(t('objet.sac_vide')));
  } else {
    elements.push(C.separateur());
    for (const o of sac.slice(0, 10)) {
      elements.push(
        C.sectionBouton(
          `${o.emoji ?? E('colis')} **${o.nom}** ×${nombre(o.quantite)}\n-# ${o.description}`,
          new ButtonBuilder()
            .setCustomId(`obj_use_${o.cle}`)
            .setLabel(t('objet.bouton_utiliser'))
            .setStyle(ButtonStyle.Primary)
        )
      );
    }
  }

  if (actifs.length) {
    elements.push(C.separateur());
    const lignes = actifs.map((e) => {
      // Le nom lisible d'un effet vit dans `objet.effet.*` ; un type qu'on ne
      // connait pas s'affiche tel quel plutot que de disparaitre.
      const nom = existe(`objet.effet.${e.type}`) ? t(`objet.effet.${e.type}`, { n: e.valeur }) : e.type;
      return t('objet.effet_ligne', { nom, quand: ts(e.expire_le, 'R') });
    });
    elements.push(C.texte(`**${t('objet.effets_titre')}**\n${lignes.join('\n')}`));
  }

  return C.envoi([C.conteneur(elements)], { flags: MessageFlags.Ephemeral });
}

module.exports = {
  categorie: 'economie',

  data: new SlashCommandBuilder()
    .setName('item')
    .setNameLocalizations({ fr: 'objet' })
    .setDescription(tr('objet.description_commande', DEFAUT))
    .setDescriptionLocalizations(localisations('objet.description_commande'))
    .setContexts(InteractionContextType.Guild)

    .addSubcommand((s) => s
      .setName('list')
      .setNameLocalizations({ fr: 'liste' })
      .setDescription(tr('objet.sous_liste', DEFAUT))
      .setDescriptionLocalizations(localisations('objet.sous_liste')))
    .addSubcommand((s) => s
      .setName('inventory')
      .setNameLocalizations({ fr: 'inventaire' })
      .setDescription(tr('objet.sous_inventaire', DEFAUT))
      .setDescriptionLocalizations(localisations('objet.sous_inventaire')))
    .addSubcommand((s) => s
      .setName('buy')
      .setNameLocalizations({ fr: 'acheter' })
      .setDescription(tr('objet.sous_acheter', DEFAUT))
      .setDescriptionLocalizations(localisations('objet.sous_acheter'))
      .addStringOption((o) => o
        .setName('item')
        .setNameLocalizations({ fr: 'objet' })
        .setDescription(tr('objet.opt_objet', DEFAUT))
        .setDescriptionLocalizations(localisations('objet.opt_objet'))
        .setRequired(true).addChoices(...CHOIX))
      .addIntegerOption((o) => o
        .setName('quantity')
        .setNameLocalizations({ fr: 'quantite' })
        .setDescription(tr('objet.opt_quantite', DEFAUT))
        .setDescriptionLocalizations(localisations('objet.opt_quantite'))
        .setMinValue(1).setMaxValue(20)))
    .addSubcommand((s) => s
      .setName('use')
      .setNameLocalizations({ fr: 'utiliser' })
      .setDescription(tr('objet.sous_utiliser', DEFAUT))
      .setDescriptionLocalizations(localisations('objet.sous_utiliser'))
      .addStringOption((o) => o
        .setName('item')
        .setNameLocalizations({ fr: 'objet' })
        .setDescription(tr('objet.opt_objet', DEFAUT))
        .setDescriptionLocalizations(localisations('objet.opt_objet'))
        .setRequired(true).addChoices(...CHOIX))
      .addStringOption((o) => o
        .setName('color')
        .setNameLocalizations({ fr: 'couleur' })
        .setDescription(tr('objet.opt_couleur', DEFAUT))
        .setDescriptionLocalizations(localisations('objet.opt_couleur'))
        .setMaxLength(7)))
    .addSubcommand((s) => s
      .setName('give')
      .setNameLocalizations({ fr: 'donner' })
      .setDescription(tr('objet.sous_donner', DEFAUT))
      .setDescriptionLocalizations(localisations('objet.sous_donner'))
      .addUserOption((o) => o
        .setName('member')
        .setNameLocalizations({ fr: 'membre' })
        .setDescription(tr('objet.opt_membre', DEFAUT))
        .setDescriptionLocalizations(localisations('objet.opt_membre'))
        .setRequired(true))
      .addStringOption((o) => o
        .setName('item')
        .setNameLocalizations({ fr: 'objet' })
        .setDescription(tr('objet.opt_objet', DEFAUT))
        .setDescriptionLocalizations(localisations('objet.opt_objet'))
        .setRequired(true).addChoices(...CHOIX))
      .addIntegerOption((o) => o
        .setName('quantity')
        .setNameLocalizations({ fr: 'quantite' })
        .setDescription(tr('objet.opt_quantite_donner', DEFAUT))
        .setDescriptionLocalizations(localisations('objet.opt_quantite_donner'))
        .setMinValue(1).setMaxValue(50))),

  async execute(interaction) {
    const { t } = traducteur(interaction);
    const guildId = interaction.guild.id;
    const sous = interaction.options.getSubcommand();

    if (!objets.actif(guildId)) {
      return interaction.reply(C.avertissementPrivee(t('objet.desactives')));
    }

    // --------------------------------------------------------------- LIST
    if (sous === 'list') return interaction.reply(vueListe(interaction));

    // ---------------------------------------------------------- INVENTORY
    if (sous === 'inventory') return interaction.reply(vueInventaire(interaction));

    // ------------------------------------------------------------- GIVE
    if (sous === 'give') {
      if (!interaction.memberPermissions.has(PermissionFlagsBits.ManageGuild)) {
        return interaction.reply(C.erreurPrivee(t('objet.reserve_equipe')));
      }
      const cible = interaction.options.getUser('member');
      const cle = interaction.options.getString('item');
      const quantite = interaction.options.getInteger('quantity') ?? 1;
      objets.donner(guildId, cible.id, cle, quantite);
      const o = objets.parCle(cle);
      return interaction.reply(C.succes(t('objet.offert', { emoji: o.emoji, nom: o.nom, n: quantite, membre: cible.id })));
    }

    const cle = interaction.options.getString('item');
    const objet = objets.parCle(cle);
    if (!objet) return interaction.reply(C.erreurPrivee(t('objet.inexistant')));

    // ------------------------------------------------------------ BUY
    if (sous === 'buy') {
      const r = acheterObjet(interaction, cle, interaction.options.getInteger('quantity') ?? 1);
      return interaction.reply(r.ok ? C.succes(r.message) : C.erreurPrivee(r.message));
    }

    // ----------------------------------------------------------- USE
    const r = await utiliserObjet(interaction, cle, interaction.options.getString('color'));
    return interaction.reply(r.ok ? C.succes(r.message) : C.erreurPrivee(r.message));
  },

  /** Boutons et fenetre de couleur. Route via le prefixe « obj_ ». */
  async gererInteraction(interaction) {
    const { t } = traducteur(interaction);
    const [, action, ...reste] = interaction.customId.split('_');
    const cle = reste.join('_'); // certaines cles contiennent un souligne

    if (!objets.actif(interaction.guild.id)) {
      return interaction.reply(C.avertissementPrivee(t('objet.desactives')));
    }

    // ---- Acheter -----------------------------------------------------
    if (action === 'ach') {
      const r = acheterObjet(interaction, cle, 1);
      return interaction.reply(r.ok ? C.succesPrive(r.message) : C.erreurPrivee(r.message));
    }

    // ---- Utiliser ----------------------------------------------------
    if (action === 'use') {
      const objet = objets.parCle(cle);
      // La couleur a besoin d'un code hexadecimal : on ouvre une fenetre
      // plutot que de renvoyer le membre vers la commande.
      if (objet?.effet === 'couleur') {
        return interaction.showModal(
          new ModalBuilder()
            .setCustomId(`obj_col_${cle}`)
            .setTitle(t('objet.modal_titre'))
            .addComponents(
              new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                  .setCustomId('hex')
                  .setLabel(t('objet.modal_label'))
                  .setPlaceholder('#5c8a3a')
                  .setStyle(TextInputStyle.Short)
                  .setMinLength(6)
                  .setMaxLength(7)
                  .setRequired(true)
              )
            )
        );
      }
      const r = await utiliserObjet(interaction, cle);
      return interaction.reply(r.ok ? C.succesPrive(r.message) : C.erreurPrivee(r.message));
    }

    // ---- La fenetre de couleur a ete validee -------------------------
    if (action === 'col') {
      const hex = interaction.fields.getTextInputValue('hex').trim();
      const r = await utiliserObjet(interaction, cle, hex);
      return interaction.reply(r.ok ? C.succesPrive(r.message) : C.erreurPrivee(r.message));
    }

    return null;
  },

  // Exportes pour les tests
  acheterObjet,
  utiliserObjet,
  vueListe,
  vueInventaire,
};
