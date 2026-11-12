/**
 * Le panneau de configuration.
 *
 * POURQUOI IL REMPLACE LES SOUS-COMMANDES
 * `/config` avait une quarantaine de sous-commandes reparties en douze
 * groupes. Sur son propre serveur, on finit par les connaitre. Sur un serveur
 * inconnu, personne ne parcourt douze groupes pour trouver ou se regle le
 * salon des logs : on essaie deux fois, on ne trouve pas, on retire le bot.
 *
 * COMMENT IL EST FAIT
 * Tout part d'UNE TABLE. Chaque reglage declare sa colonne en base et son
 * type ; l'affichage, l'edition et la sauvegarde en decoulent. Ajouter un
 * reglage, c'est ajouter une ligne dans CATEGORIES — pas une sous-commande,
 * pas un `case`, pas une phrase a traduire a trois endroits.
 *
 * Le nom et l'aide de chaque reglage vivent dans src/langues/, sous la cle
 * `config.r.<colonne>` : le panneau est donc bilingue par construction.
 *
 * LES LIMITES DE DISCORD, QU'ON NE PEUT PAS IGNORER
 *  - 40 composants par message : d'ou des categories de 8 reglages au plus,
 *    et une pagination au-dela ;
 *  - 25 options par menu deroulant : d'ou le decoupage en categories fines ;
 *  - 5 champs par fenetre, et seulement du texte : un salon ou un role se
 *    choisissent donc par menu, jamais par formulaire.
 */
const {
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ChannelSelectMenuBuilder,
  RoleSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ChannelType,
  PermissionFlagsBits,
  MessageFlags,
  AttachmentBuilder,
} = require('discord.js');
const conf = require('../../config');
const { config, majConfig, db, req } = require('../database/db');
const { E } = require('./emojis');
const C = require('./composants');
const { traducteur, existe, LANGUES } = require('./langues');
const fondateur = require('./fondateur');


/**
 * LES IMPORTS EN ATTENTE DE CONFIRMATION.
 *
 * Entre le moment ou quelqu'un envoie son fichier et celui ou il clique sur
 * « Confirmer », il faut bien garder quelque part CE QUI VA ETRE ECRIT. On ne
 * le met pas dans le customId du bouton : Discord le limite a 100 caracteres,
 * et surtout un customId est fourni par le CLIENT — quelqu'un pourrait donc
 * fabriquer un bouton qui ecrit ce qu'il veut. La liste reste ici, cote bot.
 *
 * Elle s'oublie au bout de cinq minutes : un import qu'on n'a pas confirme en
 * cinq minutes, on ne s'en souvient plus assez pour le confirmer sans relire.
 */
const IMPORTS_EN_ATTENTE = new Map();
const IMPORT_EXPIRE_MS = 5 * 60_000;

function poserImport(userId, analyse) {
  const jeton = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  IMPORTS_EN_ATTENTE.set(jeton, { userId, ...analyse });
  setTimeout(() => IMPORTS_EN_ATTENTE.delete(jeton), IMPORT_EXPIRE_MS).unref?.();
  return jeton;
}

const SALONS_TEXTE = [ChannelType.GuildText, ChannelType.GuildAnnouncement];
const PAR_PAGE = 8;

/**
 * LA TABLE.
 * `cle` est le nom exact de la colonne en base : c'est ce qui relie le panneau
 * au reste du bot sans table de correspondance a maintenir.
 */
const CATEGORIES = [
  {
    cle: 'arrivees', emoji: 'salut',
    reglages: [
      { cle: 'salon_bienvenue', type: 'salon' },
      { cle: 'message_bienvenue', type: 'texte', long: true, max: 1500 },
      { cle: 'carte_bienvenue', type: 'bool' },
      { cle: 'mp_bienvenue', type: 'texte', long: true, max: 1500 },
      { cle: 'role_auto', type: 'role' },
      { cle: 'premier_actif', type: 'bool' },
      { cle: 'premier_message', type: 'texte', long: true, max: 500 },
      { cle: 'premier_reaction', type: 'texte', max: 32 },
    ],
  },
  {
    cle: 'departs', emoji: 'porte',
    reglages: [
      { cle: 'salon_aurevoir', type: 'salon' },
      { cle: 'message_aurevoir', type: 'texte', long: true, max: 1500 },
    ],
  },
  {
    cle: 'niveaux', emoji: 'niveaux',
    reglages: [
      { cle: 'xp_actif', type: 'bool' },
      { cle: 'xp_vocal_actif', type: 'bool' },
      { cle: 'salon_levelup', type: 'salon', speciaux: ['actuel', 'mp', 'off'] },
      { cle: 'message_levelup', type: 'texte', long: true, max: 500 },
      { cle: 'prestige_actif', type: 'bool' },
      { cle: 'badges_actif', type: 'bool' },
      { cle: 'carte_animee_actif', type: 'bool' },
      { cle: 'fond_perso_actif', type: 'bool' },
    ],
  },
  {
    cle: 'economie', emoji: 'economie',
    reglages: [
      { cle: 'eco_actif', type: 'bool' },
      { cle: 'eco_nom', type: 'texte', max: 32 },
      { cle: 'eco_emoji', type: 'texte', max: 32 },
      { cle: 'eco_daily', type: 'nombre', min: 0, max: 100000 },
      { cle: 'banque_actif', type: 'bool' },
      { cle: 'paye_actif', type: 'bool' },
      { cle: 'braquage_actif', type: 'bool' },
      { cle: 'objets_actif', type: 'bool' },
    ],
  },
  {
    cle: 'missions', emoji: 'mission',
    reglages: [
      { cle: 'missions_actif', type: 'bool' },
      { cle: 'missions_salon', type: 'salon' },
    ],
  },
  {
    cle: 'moderation', emoji: 'moderation',
    reglages: [
      { cle: 'automod_actif', type: 'bool' },
      { cle: 'automod_spam', type: 'bool' },
      { cle: 'automod_invitations', type: 'bool' },
      { cle: 'automod_liens', type: 'bool' },
      { cle: 'automod_mots', type: 'bool' },
      { cle: 'automod_mentions', type: 'bool' },
      { cle: 'automod_majuscules', type: 'bool' },
    ],
  },
  {
    cle: 'securite', emoji: 'bouclier',
    reglages: [
      { cle: 'antiraid_actif', type: 'bool' },
      { cle: 'antiraid_age_min', type: 'nombre', min: 0, max: 365 },
      { cle: 'raid_kick_arrivees', type: 'bool' },
      { cle: 'verif_actif', type: 'bool' },
      { cle: 'verif_role', type: 'role' },
      { cle: 'verif_captcha', type: 'bool' },
      { cle: 'invitations_actif', type: 'bool' },
      { cle: 'invitations_salon', type: 'salon' },
      { cle: 'antiphishing_actif', type: 'bool' },
      { cle: 'antiphishing_action', type: 'choix', valeurs: ['supprimer', 'avertir', 'exclure', 'bannir'] },
      { cle: 'antiphishing_liste_blanche', type: 'texte', long: true, max: 500 },
    ],
  },
  {
    cle: 'logs', emoji: 'note',
    reglages: [
      { cle: 'log_moderation', type: 'salon' },
      { cle: 'log_messages', type: 'salon' },
      { cle: 'log_membres', type: 'salon' },
      { cle: 'log_serveur', type: 'salon' },
      { cle: 'log_vocal', type: 'salon' },
    ],
  },
  {
    cle: 'tickets', emoji: 'tickets',
    reglages: [
      { cle: 'ticket_categorie', type: 'categorie' },
      { cle: 'ticket_role_staff', type: 'role' },
      { cle: 'ticket_logs', type: 'salon' },
      { cle: 'ticket_max', type: 'nombre', min: 1, max: 10 },
      { cle: 'ticket_formulaire', type: 'bool' },
      { cle: 'ticket_banniere', type: 'bool' },
      { cle: 'ticket_inactif_heures', type: 'nombre', min: 0, max: 720 },
    ],
  },
  {
    cle: 'communaute', emoji: 'suggestions',
    reglages: [
      { cle: 'starboard_salon', type: 'salon' },
      { cle: 'starboard_seuil', type: 'nombre', min: 1, max: 50 },
      { cle: 'suggestion_salon', type: 'salon' },
      { cle: 'suggestion_role_staff', type: 'role' },
      { cle: 'suggestion_fil', type: 'bool' },
      { cle: 'cand_salon', type: 'salon' },
      { cle: 'cand_role_staff', type: 'role' },
      { cle: 'faq_actif', type: 'bool' },
      { cle: 'signalement_salon', type: 'salon' },
      { cle: 'appel_salon', type: 'salon' },
    ],
  },
  {
    cle: 'evenements', emoji: 'fete',
    reglages: [
      { cle: 'anniv_salon', type: 'salon' },
      { cle: 'anniv_role', type: 'role' },
      { cle: 'anniv_message', type: 'texte', long: true, max: 500 },
      { cle: 'boost_salon', type: 'salon' },
      { cle: 'boost_role', type: 'role' },
      { cle: 'boost_monnaie', type: 'nombre', min: 0, max: 1000000 },
    ],
  },
  {
    cle: 'votes', emoji: 'etoile',
    reglages: [
      { cle: 'vote_actif', type: 'bool' },
      { cle: 'vote_recompense', type: 'choix', valeurs: ['xp', 'rien'] },
      { cle: 'vote_multi', type: 'nombre', min: 1, max: 5 },
      { cle: 'vote_heures', type: 'nombre', min: 1, max: 48 },
      { cle: 'vote_salon', type: 'salon' },
      { cle: 'bl_alerte', type: 'bool' },
    ],
  },
  {
    cle: 'serveur', emoji: 'config',
    reglages: [
      { cle: 'langue', type: 'choix', valeurs: Object.keys(LANGUES) },
      { cle: 'structure_auto', type: 'bool' },
      { cle: 'structure_max', type: 'nombre', min: 1, max: 30 },
    ],
  },
  {
    // Visible du seul serveur support : ces reglages parlent du bot lui-meme,
    // pas du serveur qui l'heberge.
    cle: 'support', emoji: 'robot', support: true,
    reglages: [
      { cle: 'bot_salon', type: 'salon' },
      { cle: 'alerte_salon', type: 'salon' },
      { cle: 'statut_salon', type: 'salon' },
      { cle: 'bl_salon_examen', type: 'salon' },
      { cle: 'bl_salon_public', type: 'salon' },
    ],
  },
];

/** Toutes les categories visibles sur ce serveur. */
function categoriesDe(guildId) {
  return CATEGORIES.filter((c) => !c.support || fondateur.estSupport(guildId));
}

function trouverCategorie(guildId, cle) {
  return categoriesDe(guildId).find((c) => c.cle === cle) ?? null;
}

function trouverReglage(guildId, cle) {
  for (const categorie of categoriesDe(guildId)) {
    const r = categorie.reglages.find((x) => x.cle === cle);
    if (r) return { ...r, categorie };
  }
  return null;
}

// ---------------------------------------------------------------- AFFICHAGE

/** La valeur d'un reglage, ecrite pour etre lue. */
function valeurLisible(reglage, brut, t) {
  const vide = `\`${t('config.vide')}\``;

  switch (reglage.type) {
    case 'bool':
      return brut ? `${E('succes')} ${t('commun.actif')}` : `${E('erreur')} ${t('commun.inactif')}`;
    case 'salon':
      if (!brut) return vide;
      if (reglage.speciaux?.includes(brut)) return `\`${t(`config.special.${brut}`)}\``;
      return `<#${brut}>`;
    case 'categorie':
      return brut ? `<#${brut}>` : vide;
    case 'role':
      return brut ? `<@&${brut}>` : vide;
    case 'nombre':
      return brut === null || brut === undefined ? vide : `**${brut}**`;
    case 'choix':
      return brut ? `**${t(`config.valeur.${reglage.cle}.${brut}`)}**` : vide;
    default: {
      if (!brut) return vide;
      const court = String(brut).replace(/\n/g, ' ');
      return `\`${court.length > 60 ? `${court.slice(0, 57)}…` : court}\``;
    }
  }
}

/** L'accueil : on choisit une categorie. */
function vueAccueil(interaction, { message = null } = {}) {
  const guildId = interaction.guild.id;
  const { t } = traducteur(interaction);
  const cfg = config(guildId);
  const categories = categoriesDe(guildId);

  const elements = [
    C.texte(`## ${E('config')} ${t('config.titre', { serveur: interaction.guild.name })}`),
    C.texte(t('config.intro')),
  ];

  if (message) elements.push(C.texte(`${E('succes')} ${message}`));

  elements.push(C.separateur());

  // Un apercu : combien de reglages sont poses dans chaque categorie. C'est ce
  // qui montre d'un coup d'oeil ce qui reste a faire.
  const lignes = categories.map((categorie) => {
    const poses = categorie.reglages.filter((r) => {
      const v = cfg[r.cle];
      return r.type === 'bool' ? !!v : v !== null && v !== undefined && v !== '';
    }).length;
    return `${E(categorie.emoji)} **${t(`config.cat.${categorie.cle}`)}** — ${poses}/${categorie.reglages.length}`;
  });
  elements.push(C.texte(lignes.join('\n')));

  elements.push(
    new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('cfg_cat')
        .setPlaceholder(t('config.choisir'))
        .addOptions(categories.map((categorie) =>
          new StringSelectMenuOptionBuilder()
            .setValue(categorie.cle)
            .setLabel(t(`config.cat.${categorie.cle}`))
            .setDescription(t(`config.cat_aide.${categorie.cle}`).slice(0, 100))))
    )
  );

  elements.push(
    new ActionRowBuilder().addComponents(
      // L'export produit un fichier ; l'import, lui, a besoin d'une piece
      // jointe — et un bouton ne sait pas en recevoir. Il passe donc par
      // l'option `fichier` de /config, la seule facon d'en donner une sans
      // reintroduire les sous-commandes qu'on a justement supprimees.
      new ButtonBuilder().setCustomId('cfg_exporter').setLabel(t('config.exporter')).setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('cfg_audit_0').setLabel(t('config.historique')).setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('cfg_raz').setLabel(t('config.remise_a_zero')).setStyle(ButtonStyle.Danger)
    )
  );

  return C.envoi([C.conteneur(elements)], { flags: MessageFlags.Ephemeral });
}

/** Une categorie : la liste de ses reglages, chacun avec son bouton. */
function vueCategorie(interaction, cleCat, { page = 0, message = null } = {}) {
  const guildId = interaction.guild.id;
  const { t } = traducteur(interaction);
  const categorie = trouverCategorie(guildId, cleCat);
  if (!categorie) return vueAccueil(interaction);

  const cfg = config(guildId);
  const { existe } = traducteur(interaction);
  const pages = Math.max(1, Math.ceil(categorie.reglages.length / PAR_PAGE));
  const n = Math.min(Math.max(0, page), pages - 1);
  const tranche = categorie.reglages.slice(n * PAR_PAGE, (n + 1) * PAR_PAGE);

  const elements = [
    C.texte(`## ${E(categorie.emoji)} ${t(`config.cat.${categorie.cle}`)}`),
    C.texte(t(`config.cat_aide.${categorie.cle}`)),
    C.separateur(),
  ];

  if (message) elements.push(C.texte(`${E('succes')} ${message}`));

  for (const reglage of tranche) {
    const valeur = valeurLisible(reglage, cfg[reglage.cle], t);
    const corps = [
      `**${t(`config.r.${reglage.cle}.nom`)}** — ${valeur}`,
      // L'aide n'existe que pour les reglages qui ne parlent pas d'eux-memes :
      // on regarde si elle existe plutot que de la demander pour rien.
      existe(`config.r.${reglage.cle}.aide`) ? `-# ${t(`config.r.${reglage.cle}.aide`)}` : null,
    ].filter(Boolean).join('\n');

    elements.push(
      C.sectionBouton(
        corps,
        new ButtonBuilder()
          .setCustomId(`cfg_ouvrir_${reglage.cle}`)
          .setLabel(reglage.type === 'bool'
            ? (cfg[reglage.cle] ? t('config.desactiver') : t('config.activer'))
            : t('config.modifier'))
          .setStyle(reglage.type === 'bool'
            ? (cfg[reglage.cle] ? ButtonStyle.Secondary : ButtonStyle.Success)
            : ButtonStyle.Primary)
      )
    );
  }

  const navigation = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('cfg_accueil').setLabel(t('config.retour')).setStyle(ButtonStyle.Secondary)
  );
  if (pages > 1) {
    navigation.addComponents(
      new ButtonBuilder()
        .setCustomId(`cfg_page_${cleCat}_${n - 1}`)
        .setLabel(t('commun.precedent'))
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(n <= 0),
      new ButtonBuilder()
        .setCustomId(`cfg_page_${cleCat}_${n + 1}`)
        .setLabel(t('commun.suivant'))
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(n >= pages - 1)
    );
  }
  elements.push(navigation);
  if (pages > 1) elements.push(C.texte(`-# ${t('commun.page', { n: n + 1, total: pages })}`));

  return C.envoi([C.conteneur(elements)], { flags: MessageFlags.Ephemeral });
}

/** L'ecran d'un reglage : le menu ou le choix qui va bien. */
function vueReglage(interaction, cle) {
  const guildId = interaction.guild.id;
  const { t } = traducteur(interaction);
  const reglage = trouverReglage(guildId, cle);
  if (!reglage) return vueAccueil(interaction);

  const cfg = config(guildId);
  const { existe } = traducteur(interaction);
  const elements = [
    C.texte(`## ${t(`config.r.${cle}.nom`)}`),
    C.texte(`${t('config.actuellement')} ${valeurLisible(reglage, cfg[cle], t)}`),
  ];

  if (existe(`config.r.${cle}.aide`)) elements.push(C.texte(`-# ${t(`config.r.${cle}.aide`)}`));

  elements.push(C.separateur());

  if (reglage.type === 'salon' || reglage.type === 'categorie') {
    elements.push(
      new ActionRowBuilder().addComponents(
        new ChannelSelectMenuBuilder()
          .setCustomId(`cfg_poser_${cle}`)
          .setPlaceholder(t('config.choisir_salon'))
          .addChannelTypes(...(reglage.type === 'categorie' ? [ChannelType.GuildCategory] : SALONS_TEXTE))
      )
    );
  } else if (reglage.type === 'role') {
    elements.push(
      new ActionRowBuilder().addComponents(
        new RoleSelectMenuBuilder().setCustomId(`cfg_poser_${cle}`).setPlaceholder(t('config.choisir_role'))
      )
    );
  } else if (reglage.type === 'choix') {
    elements.push(
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(`cfg_poser_${cle}`)
          .setPlaceholder(t('config.choisir'))
          .addOptions(reglage.valeurs.map((v) =>
            new StringSelectMenuOptionBuilder()
              .setValue(v)
              .setLabel(t(`config.valeur.${cle}.${v}`))
              .setDefault(String(cfg[cle]) === v)))
      )
    );
  }

  // Les valeurs speciales d'un reglage (« salon du message », « en privé »…)
  // sont des boutons : ce ne sont pas des salons, un menu de salons ne peut
  // pas les proposer.
  const rangeeBoutons = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`cfg_cat_${reglage.categorie.cle}`)
      .setLabel(t('config.retour'))
      .setStyle(ButtonStyle.Secondary)
  );

  for (const special of reglage.speciaux ?? []) {
    rangeeBoutons.addComponents(
      new ButtonBuilder()
        .setCustomId(`cfg_special_${cle}_${special}`)
        .setLabel(t(`config.special.${special}`))
        .setStyle(ButtonStyle.Primary)
    );
  }

  if (reglage.type === 'texte' || reglage.type === 'nombre') {
    rangeeBoutons.addComponents(
      new ButtonBuilder()
        .setCustomId(`cfg_ecrire_${cle}`)
        .setLabel(t('config.ecrire'))
        .setStyle(ButtonStyle.Primary)
    );
  }

  // On ne propose d'effacer que ce qui peut l'etre : un nombre a des bornes,
  // le vider n'aurait pas de sens.
  if (reglage.type !== 'bool' && reglage.type !== 'nombre' && reglage.type !== 'choix') {
    rangeeBoutons.addComponents(
      new ButtonBuilder()
        .setCustomId(`cfg_vider_${cle}`)
        .setLabel(t('config.vider'))
        .setStyle(ButtonStyle.Danger)
        .setDisabled(!cfg[cle])
    );
  }

  elements.push(rangeeBoutons);

  return C.envoi([C.conteneur(elements)], { flags: MessageFlags.Ephemeral });
}

// ----------------------------------------------------------------- EDITION

/**
 * Ecrit une valeur et renvoie la phrase a afficher.
 *
 * C'EST LE POINT DE PASSAGE UNIQUE de toute modification faite au panneau —
 * les six branches du routeur finissent toutes ici. C'est donc ici, et
 * nulle part ailleurs, qu'on note le changement au journal : ajouter un
 * appel dans chaque branche serait six occasions d'en oublier une, et un
 * journal incomplet est pire qu'un journal absent (on croit qu'il n'y a rien
 * eu alors que personne n'a regarde).
 *
 * @param {string|null} par l'identifiant de qui a change le reglage
 */
function enregistrer(guildId, reglage, valeur, t, par = null) {
  const avant = config(guildId)[reglage.cle];
  majConfig(guildId, { [reglage.cle]: valeur });
  journaliser(guildId, reglage.cle, avant, valeur, par, 'panneau');
  return t('config.enregistre', { nom: t(`config.r.${reglage.cle}.nom`) });
}

/**
 * Note un changement au journal d'audit.
 *
 * L'ECRITURE DU JOURNAL NE DOIT JAMAIS FAIRE ECHOUER UN REGLAGE. Si elle
 * casse, le reglage a deja ete pose et l'administrateur doit voir sa
 * confirmation : un journal est un confort, pas une condition.
 */
function journaliser(guildId, cle, avant, apres, par, source) {
  // Un « changement » qui ne change rien n'apprend rien a personne et noie
  // les vrais dans la liste.
  if (String(avant ?? '') === String(apres ?? '')) return;
  try {
    require('./configAudit').noter({ guildId: String(guildId), cle, avant, apres, par: par ? String(par) : null, source });
  } catch (e) {
    require('./logger').debug('Journal du config :', e.message);
  }
}

function fenetre(reglage, cfg, t) {
  const champ = new TextInputBuilder()
    .setCustomId('valeur')
    .setLabel(t(`config.r.${reglage.cle}.nom`).slice(0, 45))
    .setStyle(reglage.long ? TextInputStyle.Paragraph : TextInputStyle.Short)
    .setRequired(false)
    .setMaxLength(reglage.type === 'nombre' ? 10 : (reglage.max ?? 1000));

  const actuel = cfg[reglage.cle];
  if (actuel !== null && actuel !== undefined && actuel !== '') champ.setValue(String(actuel).slice(0, reglage.max ?? 1000));

  return new ModalBuilder()
    .setCustomId(`cfg_modale_${reglage.cle}`)
    .setTitle(t(`config.r.${reglage.cle}.nom`).slice(0, 45))
    .addComponents(new ActionRowBuilder().addComponents(champ));
}

/**
 * Le routeur du panneau.
 * Tous les identifiants commencent par « cfg_ ».
 */
async function gererInteraction(interaction) {
  const { t } = traducteur(interaction);

  // La permission est reverifiee A CHAQUE CLIC : le panneau reste ouvert
  // plusieurs minutes, et un role peut avoir ete retire entre-temps.
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
    return interaction.reply({ content: t('erreur.permission'), flags: MessageFlags.Ephemeral });
  }

  const guildId = interaction.guild.id;
  const id = interaction.customId;

  // ---- Navigation --------------------------------------------------------
  if (id === 'cfg_accueil') return interaction.update(vueAccueil(interaction));
  if (id === 'cfg_cat') return interaction.update(vueCategorie(interaction, interaction.values[0]));
  if (id.startsWith('cfg_cat_')) return interaction.update(vueCategorie(interaction, id.slice(8)));
  if (id.startsWith('cfg_page_')) {
    const reste = id.slice(9);
    const coupe = reste.lastIndexOf('_');
    return interaction.update(vueCategorie(interaction, reste.slice(0, coupe), { page: Number(reste.slice(coupe + 1)) }));
  }

  // ---- Export des reglages ----------------------------------------------
  if (id === 'cfg_exporter') {
    const transfert = require('./configTransfert');
    const donnees = transfert.construireExport(interaction.guild);
    const nombre = Object.keys(donnees.reglages).length;
    // Un nom de fichier qui porte le nom du serveur : quand on en exporte
    // trois, on ne sait plus lequel est lequel une semaine plus tard.
    const nom = `blueprint-${interaction.guild.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 30) || 'config'}.json`;
    const fichier = new AttachmentBuilder(Buffer.from(JSON.stringify(donnees, null, 2), 'utf8'), { name: nom });

    return interaction.reply(C.envoiPrive([
      C.conteneur([
        C.texte(`## ${E('dossier')} ${t('configplus.export.titre')}`),
        C.texte(t('configplus.export.texte', { n: nombre })),
        C.texte(`-# ${t('configplus.export.rappel')}`),
      ]),
    ], { files: [fichier] }));
  }

  // ---- Journal des changements -------------------------------------------
  if (id.startsWith('cfg_audit_')) {
    const configAudit = require('./configAudit');
    const page = Math.max(0, Number(id.slice('cfg_audit_'.length)) || 0);
    const PAR_PAGE_AUDIT = 10;
    const total = configAudit.compter(guildId);
    const lignes = configAudit.lister(guildId, PAR_PAGE_AUDIT, page * PAR_PAGE_AUDIT);
    const pages = Math.max(1, Math.ceil(total / PAR_PAGE_AUDIT));

    const valeur = (v) => {
      if (v === null || v === undefined || v === '') return `\`${t('commun.aucun')}\``;
      return `\`${String(v).slice(0, 40)}\``;
    };

    // TOUTES les lignes dans UN bloc de texte : un composant par ligne ferait
    // exploser la limite des 40 des la deuxieme page.
    const corps = lignes.length
      ? lignes.map((l) => {
        const nom = l.cle === '*'
          ? t('configplus.audit.tout')
          : (existe(`config.r.${l.cle}.nom`) ? t(`config.r.${l.cle}.nom`) : `\`${l.cle}\``);
        return `**${nom}** · ${valeur(l.avant)} → ${valeur(l.apres)}\n`
          + `-# ${l.par ? `<@${l.par}>` : t('configplus.audit.inconnu')} · <t:${Math.floor(l.date / 1000)}:R>`
          + (l.source && l.source !== 'panneau' ? ` · ${t(`configplus.audit.source.${l.source}`)}` : '');
      }).join('\n')
      : t('configplus.audit.vide');

    const navigation = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('cfg_accueil').setLabel(t('config.retour')).setStyle(ButtonStyle.Secondary)
    );
    if (pages > 1) {
      navigation.addComponents(
        new ButtonBuilder().setCustomId(`cfg_audit_${page - 1}`).setLabel(t('commun.precedent'))
          .setStyle(ButtonStyle.Secondary).setDisabled(page <= 0),
        new ButtonBuilder().setCustomId(`cfg_audit_${page + 1}`).setLabel(t('commun.suivant'))
          .setStyle(ButtonStyle.Secondary).setDisabled(page >= pages - 1)
      );
    }

    return interaction.update(C.envoi([
      C.conteneur([
        C.texte(`## ${E('note')} ${t('configplus.audit.titre')}`),
        C.texte(corps),
        C.separateur(),
        C.texte(`-# ${t('commun.page', { n: page + 1, total: pages })} · ${t('configplus.audit.conserve', { n: require('./configAudit').JOURS_CONSERVES })}`),
        navigation,
      ]),
    ], { flags: MessageFlags.Ephemeral }));
  }

  // ---- Import : la confirmation ------------------------------------------
  if (id.startsWith('cfg_import_ok_')) {
    const jeton = id.slice('cfg_import_ok_'.length);
    const attente = IMPORTS_EN_ATTENTE.get(jeton);
    if (!attente || attente.userId !== interaction.user.id) {
      return interaction.update(C.envoi([
        C.conteneur([C.texte(`${E('erreur')} ${t('configplus.import.expire')}`)], conf.couleurs.erreur),
      ], { flags: MessageFlags.Ephemeral }));
    }
    IMPORTS_EN_ATTENTE.delete(jeton);

    const transfert = require('./configTransfert');
    const ecrits = transfert.appliquer(guildId, attente.changements, interaction.user.id);
    return interaction.update(vueAccueil(interaction, {
      message: t('configplus.import.fait', { n: ecrits, ignores: attente.ignoresSalonRole }),
    }));
  }

  // ---- Remise a zero -----------------------------------------------------
  if (id === 'cfg_raz') {
    return interaction.update(C.envoi([
      C.conteneur([
        C.texte(`## ${E('avertissement')} ${t('config.raz_titre')}`),
        C.texte(t('config.raz_texte')),
        new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('cfg_accueil').setLabel(t('commun.annuler')).setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId('cfg_raz_ok').setLabel(t('config.raz_confirmer')).setStyle(ButtonStyle.Danger)
        ),
      ], conf.couleurs.erreur),
    ], { flags: MessageFlags.Ephemeral }));
  }

  if (id === 'cfg_raz_ok') {
    // La langue survit : quelqu'un qui remet ses reglages a plat ne demande
    // pas a se retrouver devant un bot qui ne parle plus sa langue.
    const langue = config(guildId).langue;
    db.prepare('DELETE FROM config WHERE guild_id = ?').run(guildId);
    config(guildId);
    majConfig(guildId, { langue });
    // La remise a zero efface tout : c'est le changement le plus lourd que le
    // panneau sache faire, et donc celui qu'il faut le plus pouvoir retrouver
    // au journal trois jours plus tard.
    // `avant`/`apres` distincts a dessein : `journaliser` ignore les
    // changements qui ne changent rien, et deux `null` seraient silencieux.
    journaliser(guildId, '*', 'tous les reglages', 'valeurs par defaut', interaction.user?.id ?? null, 'remise_a_zero');
    return interaction.update(vueAccueil(interaction, { message: t('config.raz_fait') }));
  }

  // ---- Un reglage --------------------------------------------------------
  if (id.startsWith('cfg_ouvrir_')) {
    const cle = id.slice(11);
    const reglage = trouverReglage(guildId, cle);
    if (!reglage) return interaction.update(vueAccueil(interaction));

    // Un oui/non n'a pas besoin d'un ecran a lui : le bouton fait l'aller-retour.
    if (reglage.type === 'bool') {
      const nouveau = config(guildId)[cle] ? 0 : 1;
      const message = enregistrer(guildId, reglage, nouveau, t, interaction.user?.id ?? null);
      return interaction.update(vueCategorie(interaction, reglage.categorie.cle, { message }));
    }
    return interaction.update(vueReglage(interaction, cle));
  }

  if (id.startsWith('cfg_poser_')) {
    const cle = id.slice(10);
    const reglage = trouverReglage(guildId, cle);
    if (!reglage) return interaction.update(vueAccueil(interaction));
    const message = enregistrer(guildId, reglage, interaction.values?.[0] ?? null, t, interaction.user?.id ?? null);
    return interaction.update(vueCategorie(interaction, reglage.categorie.cle, { message }));
  }

  if (id.startsWith('cfg_special_')) {
    const reste = id.slice(12);
    const coupe = reste.lastIndexOf('_');
    const cle = reste.slice(0, coupe);
    const reglage = trouverReglage(guildId, cle);
    if (!reglage) return interaction.update(vueAccueil(interaction));
    const message = enregistrer(guildId, reglage, reste.slice(coupe + 1), t, interaction.user?.id ?? null);
    return interaction.update(vueCategorie(interaction, reglage.categorie.cle, { message }));
  }

  if (id.startsWith('cfg_vider_')) {
    const cle = id.slice(10);
    const reglage = trouverReglage(guildId, cle);
    if (!reglage) return interaction.update(vueAccueil(interaction));
    const message = enregistrer(guildId, reglage, null, t, interaction.user?.id ?? null);
    return interaction.update(vueCategorie(interaction, reglage.categorie.cle, { message }));
  }

  if (id.startsWith('cfg_ecrire_')) {
    const cle = id.slice(11);
    const reglage = trouverReglage(guildId, cle);
    if (!reglage) return interaction.update(vueAccueil(interaction));
    return interaction.showModal(fenetre(reglage, config(guildId), t));
  }

  if (id.startsWith('cfg_modale_')) {
    const cle = id.slice(11);
    const reglage = trouverReglage(guildId, cle);
    if (!reglage) return interaction.reply({ content: t('erreur.generique'), flags: MessageFlags.Ephemeral });

    const brut = interaction.fields.getTextInputValue('valeur').trim();

    if (reglage.type === 'nombre') {
      const n = Number(brut.replace(',', '.'));
      if (!Number.isFinite(n) || n < reglage.min || n > reglage.max) {
        return interaction.reply({
          content: t('config.nombre_invalide', { min: reglage.min, max: reglage.max }),
          flags: MessageFlags.Ephemeral,
        });
      }
      const message = enregistrer(guildId, reglage, n, t, interaction.user?.id ?? null);
      return interaction.reply({ ...vueCategorie(interaction, reglage.categorie.cle, { message }) });
    }

    const message = enregistrer(guildId, reglage, brut || null, t, interaction.user?.id ?? null);
    return interaction.reply({ ...vueCategorie(interaction, reglage.categorie.cle, { message }) });
  }

  return null;
}

module.exports = {
  poserImport,
  CATEGORIES,
  categoriesDe,
  trouverReglage,
  valeurLisible,
  vueAccueil,
  vueCategorie,
  vueReglage,
  gererInteraction,
  PAR_PAGE,
};
