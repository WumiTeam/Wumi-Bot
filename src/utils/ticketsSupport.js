/**
 * Les tickets du SERVEUR SUPPORT de Wumi.
 *
 * C'est une copie « haut de gamme » du systeme /ticket, reservee a ton serveur
 * support et configurable uniquement par toi (/admin ticket ...) :
 *
 *   - panneau Components V2 avec banniere, menu de motifs ;
 *   - un FORMULAIRE DIFFERENT par motif (bug, premium, partenariat...) ;
 *   - fiche du demandeur pour l'equipe (anciennete, serveurs ou il a Wumi,
 *     premium, liste noire, tickets precedents) ;
 *   - prise en charge, priorite, ajout d'un membre, transcription a la demande ;
 *   - a la fermeture : transcription HTML dans LOG_TICKETS, copie en MP au
 *     membre avec une note de satisfaction de 1 a 5.
 *
 * Tous les identifiants de composants commencent par « stk_ » (voir
 * src/events/interactionCreate.js).
 */
const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  UserSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  AttachmentBuilder,
  ChannelType,
  PermissionFlagsBits,
} = require('discord.js');
const conf = require('../../config');
const C = require('./composants');
const store = require('./supportStore');
const fondateur = require('./fondateur');
const journal = require('./journalSupport');
const logger = require('./logger');
const { banniere } = require('./bannieres');
const { traducteur } = require('./langues');
const { genererTranscription } = require('./transcription');

// ------------------------------------------------------------------- MOTIFS
/**
 * Chaque motif a son emoji, sa couleur et SON formulaire. Les textes vivent
 * dans les fichiers de langue sous support.ticket.motif.<cle>.*
 * Discord limite un formulaire a 5 champs, et un libelle a 45 caracteres.
 */
const MOTIFS = {
  question: {
    emoji: '❓',
    couleur: 0x66bcff,
    champs: [
      { id: 'question', style: 'long', requis: true, min: 10, max: 1500 },
    ],
  },
  bug: {
    emoji: '🐛',
    couleur: 0xff2860,
    champs: [
      { id: 'commande', style: 'court', requis: true, max: 100 },
      { id: 'probleme', style: 'long', requis: true, min: 15, max: 1500 },
      { id: 'attendu', style: 'long', requis: false, max: 800 },
      { id: 'serveur', style: 'court', requis: false, max: 30 },
    ],
  },
  musique: {
    emoji: '🎵',
    couleur: 0x8b7cf6,
    champs: [
      { id: 'commande', style: 'court', requis: true, max: 200 },
      { id: 'probleme', style: 'long', requis: true, min: 10, max: 1500 },
      { id: 'serveur', style: 'court', requis: false, max: 30 },
    ],
  },
  premium: {
    emoji: '💎',
    couleur: 0xb18cff,
    champs: [
      { id: 'serveur', style: 'court', requis: true, max: 30 },
      { id: 'demande', style: 'long', requis: true, min: 10, max: 1500 },
    ],
  },
  partenariat: {
    emoji: '🤝',
    couleur: 0x1ed760,
    champs: [
      { id: 'projet', style: 'court', requis: true, max: 150 },
      { id: 'audience', style: 'court', requis: false, max: 100 },
      { id: 'proposition', style: 'long', requis: true, min: 20, max: 1500 },
    ],
  },
  appel: {
    emoji: '⚖️',
    couleur: 0xffa919,
    champs: [
      { id: 'identifiant', style: 'court', requis: true, max: 30 },
      { id: 'raison', style: 'long', requis: true, min: 20, max: 1500 },
    ],
  },
  autre: {
    emoji: '📨',
    couleur: 0xdce3ff,
    champs: [
      { id: 'sujet', style: 'court', requis: true, min: 3, max: 100 },
      { id: 'detail', style: 'long', requis: true, min: 10, max: 1500 },
    ],
  },
};

const PRIORITES = {
  basse: { emoji: '🟢', prefixe: '' },
  normale: { emoji: '🔵', prefixe: '' },
  haute: { emoji: '🟠', prefixe: '🟠' },
  urgente: { emoji: '🔴', prefixe: '🔴' },
};

/**
 * Les REPONSES RAPIDES de l'equipe : un menu dans chaque ticket, qui poste une
 * reponse toute prete (textes dans support.ticket.rapides.<cle>).
 */
const RAPIDES = {
  role: '🔝', permissions: '🔑', musique: '🎵', dashboard: '🌐', audit: '🛡️', infos: '📸', attente: '⏳', merci: '🙏',
};

// ------------------------------------------------------------------- OUTILS
const tr = (guild) => traducteur(guild ?? fondateur.serveurSupport());
const pad = (n) => String(n).padStart(4, '0');
const quand = (ms, style = 'R') => `<t:${Math.floor(ms / 1000)}:${style}>`;

/** Fait partie de l'equipe support ? (toi, le role staff, ou un admin du serveur) */
function estStaff(membre) {
  if (!membre) return false;
  if (fondateur.estFondateur(membre.id)) return true;
  const staff = store.lire('ticket.staff');
  if (staff && membre.roles?.cache?.has(staff)) return true;
  return Boolean(membre.permissions?.has?.(PermissionFlagsBits.ManageGuild));
}

/** Ce composant est-il bien utilise sur le serveur support ? */
function surSupport(interaction) {
  return interaction.guild && fondateur.estSupport(interaction.guild.id);
}

/** Nom de salon propre : « 🐛・0042-pseudo ». */
function nomSalon(ticket, pseudo) {
  const motif = MOTIFS[ticket.motif] ?? MOTIFS.autre;
  const prio = PRIORITES[ticket.priorite]?.prefixe ?? '';
  const propre = String(pseudo ?? 'membre')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 20) || 'membre';
  return `${prio}${motif.emoji}・${pad(ticket.numero)}-${propre}`;
}

// ------------------------------------------------------------------ PANNEAU
/** Le message du panneau, pret a etre envoye dans un salon. */
function construirePanneau(guild) {
  const { t, langue } = tr(guild);
  const b = banniere('panneau', langue);

  const menu = new StringSelectMenuBuilder()
    .setCustomId('stk_motif')
    .setPlaceholder(t('support.ticket.panneau_menu'))
    .addOptions(Object.entries(MOTIFS).map(([cle, m]) => ({
      label: t(`support.ticket.motif.${cle}.nom`).slice(0, 100),
      description: t(`support.ticket.motif.${cle}.desc`).slice(0, 100),
      value: cle,
      emoji: m.emoji,
    })));

  const liens = [];
  if (process.env.SITE_URL) {
    liens.push(new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel(t('support.ticket.bouton_site')).setEmoji('🌐').setURL(process.env.SITE_URL));
  }
  const clientId = String(process.env.CLIENT_ID ?? '').trim();
  if (/^\d{17,20}$/.test(clientId)) {
    liens.push(new ButtonBuilder()
      .setStyle(ButtonStyle.Link)
      .setLabel(t('support.ticket.bouton_inviter'))
      .setEmoji('➕')
      .setURL(`https://discord.com/oauth2/authorize?client_id=${clientId}&scope=bot+applications.commands&permissions=8`));
  }

  const lignesMotifs = Object.entries(MOTIFS)
    .map(([cle, m]) => `${m.emoji} **${t(`support.ticket.motif.${cle}.nom`)}** — ${t(`support.ticket.motif.${cle}.desc`)}`)
    .join('\n');

  const conteneur = C.conteneur([
    b ? C.image(b.url, t('support.ticket.panneau_alt')) : null,
    C.texte(`# ${t('support.ticket.panneau_titre')}\n${t('support.ticket.panneau_intro')}`),
    C.separateur(),
    C.texte(`### ${t('support.ticket.panneau_motifs')}\n${lignesMotifs}`),
    C.separateur(),
    C.texte(t('support.ticket.panneau_regles')),
    new ActionRowBuilder().addComponents(menu),
    liens.length ? new ActionRowBuilder().addComponents(...liens) : null,
    C.texte(`-# ${t('support.ticket.panneau_pied')}`),
  ], conf.couleurs.principale);

  return C.envoi([conteneur], { files: b ? [b.fichier()] : [] });
}

// ---------------------------------------------------------------- FORMULAIRE
function construireFormulaire(cle, guild) {
  const { t } = tr(guild);
  const motif = MOTIFS[cle];
  const modal = new ModalBuilder()
    .setCustomId(`stk_form:${cle}`)
    .setTitle(`${motif.emoji} ${t(`support.ticket.motif.${cle}.nom`)}`.slice(0, 45));

  for (const champ of motif.champs) {
    const base = `support.ticket.motif.${cle}.champ.${champ.id}`;
    const entree = new TextInputBuilder()
      .setCustomId(champ.id)
      .setLabel(t(`${base}.label`).slice(0, 45))
      .setPlaceholder(t(`${base}.aide`).slice(0, 100))
      .setStyle(champ.style === 'long' ? TextInputStyle.Paragraph : TextInputStyle.Short)
      .setRequired(champ.requis)
      .setMaxLength(champ.max);
    if (champ.min) entree.setMinLength(champ.min);
    modal.addComponents(new ActionRowBuilder().addComponents(entree));
  }
  return modal;
}

/** Ce qui empeche d'ouvrir un ticket, ou null. */
function probleme(interaction) {
  const { t } = tr(interaction.guild);
  const limite = Math.max(1, store.lireNombre('ticket.limite') || 1);

  // Les tickets dont le salon a ete supprime a la main ne comptent plus.
  const ouverts = store.q.ouvertsDe.all(interaction.user.id).filter((tk) => {
    if (interaction.guild.channels.cache.has(tk.channel_id)) return true;
    store.q.fermer.run({ channel_id: tk.channel_id, ferme_le: Date.now(), ferme_par: null, raison: 'Salon supprimé', messages: null });
    return false;
  });
  if (ouverts.length >= limite) {
    return t('support.ticket.deja_ouvert', { salons: ouverts.map((tk) => `<#${tk.channel_id}>`).join(', ') });
  }
  if (!interaction.guild.members.me.permissions.has(PermissionFlagsBits.ManageChannels)) {
    return t('support.ticket.permission_bot');
  }
  return null;
}

// ------------------------------------------------------------- FICHE MEMBRE
/** Ce que l'equipe a besoin de savoir sur la personne, d'un coup d'oeil. */
function fiche(client, membre, t) {
  const user = membre.user;
  const proprio = client.guilds.cache.filter((g) => g.ownerId === user.id);
  const liste = [...proprio.values()]
    .sort((a, b) => (b.memberCount ?? 0) - (a.memberCount ?? 0))
    .slice(0, 5)
    .map((g) => `\`${g.id}\` ${g.name.slice(0, 40)} · ${g.memberCount ?? '?'}`);

  let premium = t('support.ticket.fiche_non');
  try {
    const p = require('./premium');
    const siens = [...proprio.keys()].filter((id) => p.estPremium(id));
    if (siens.length) premium = t('support.ticket.fiche_premium_oui', { n: siens.length });
  } catch {
    /* module premium absent : on n'affiche rien de faux */
  }

  const bloque = fondateur.bloque(user.id);
  const precedents = store.q.ouvertsDe.all(user.id).length;
  let total = 0;
  try {
    total = require('../database/db').db
      .prepare('SELECT COUNT(*) AS n FROM support_tickets WHERE user_id = ?').get(user.id).n;
  } catch {
    total = precedents;
  }

  return [
    `### 👤 ${t('support.ticket.fiche_titre')}`,
    `**${t('support.ticket.fiche_compte')}** · ${quand(user.createdTimestamp)}`,
    `**${t('support.ticket.fiche_arrive')}** · ${membre.joinedTimestamp ? quand(membre.joinedTimestamp) : '?'}`,
    `**${t('support.ticket.fiche_serveurs', { n: proprio.size })}**${liste.length ? `\n${liste.join('\n')}` : ''}`,
    `**${t('support.ticket.fiche_premium')}** · ${premium}`,
    `**${t('support.ticket.fiche_bloque')}** · ${bloque ? `⛔ ${t('support.ticket.fiche_oui')}${bloque.raison ? ` — ${bloque.raison}` : ''}` : t('support.ticket.fiche_non')}`,
    `**${t('support.ticket.fiche_tickets')}** · ${Math.max(0, total - 1)}`,
  ].join('\n');
}

// ----------------------------------------------------------- MESSAGE D'ACCUEIL
/**
 * Le message d'accueil du ticket, reconstruit a chaque changement (prise en
 * charge, priorite) : en V2 on ne peut pas modifier un seul champ, on
 * renvoie tout le conteneur.
 */
function construireAccueil(ticket, membre, client) {
  const { t, langue } = tr(membre.guild);
  const motif = MOTIFS[ticket.motif] ?? MOTIFS.autre;
  const prio = PRIORITES[ticket.priorite] ?? PRIORITES.normale;
  const b = banniere('ticket', langue);

  const boutons = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('stk_prendre')
      .setStyle(ticket.pris_par ? ButtonStyle.Secondary : ButtonStyle.Primary)
      .setEmoji('🙋')
      .setLabel(ticket.pris_par ? t('support.ticket.bouton_pris') : t('support.ticket.bouton_prendre'))
      .setDisabled(Boolean(ticket.pris_par)),
    new ButtonBuilder().setCustomId('stk_fermer').setStyle(ButtonStyle.Danger).setEmoji('🔒').setLabel(t('support.ticket.bouton_fermer')),
    new ButtonBuilder().setCustomId('stk_transcription').setStyle(ButtonStyle.Secondary).setEmoji('📄').setLabel(t('support.ticket.bouton_transcription')),
    new ButtonBuilder().setCustomId('stk_diag').setStyle(ButtonStyle.Secondary).setEmoji('🩺').setLabel(t('support.ticket.bouton_diag'))
  );

  const menuRapide = new StringSelectMenuBuilder()
    .setCustomId('stk_rapide')
    .setPlaceholder(t('support.ticket.rapide_menu'))
    .addOptions(Object.entries(RAPIDES).map(([cle, emoji]) => ({
      label: t(`support.ticket.rapides.${cle}.label`).slice(0, 100),
      value: cle,
      emoji,
    })));

  const menuPriorite = new StringSelectMenuBuilder()
    .setCustomId('stk_priorite')
    .setPlaceholder(t('support.ticket.priorite_menu'))
    .addOptions(Object.entries(PRIORITES).map(([cle, p]) => ({
      label: t(`support.ticket.priorite.${cle}`),
      value: cle,
      emoji: p.emoji,
      default: cle === ticket.priorite,
    })));

  const ajout = new UserSelectMenuBuilder()
    .setCustomId('stk_ajouter')
    .setPlaceholder(t('support.ticket.ajouter_menu'))
    .setMinValues(1)
    .setMaxValues(1);

  const etat = [
    `${prio.emoji} **${t('support.ticket.priorite_label')}** · ${t(`support.ticket.priorite.${ticket.priorite}`)}`,
    `🙋 **${t('support.ticket.pris_label')}** · ${ticket.pris_par ? `<@${ticket.pris_par}> ${quand(ticket.pris_le)}` : t('support.ticket.personne')}`,
    `🕒 **${t('support.ticket.ouvert_label')}** · ${quand(ticket.cree_le, 'f')}`,
  ].join('\n');

  const conteneur = C.conteneur([
    b ? C.image(b.url) : null,
    C.sectionVignette(
      `## ${motif.emoji} ${t('support.ticket.accueil_titre', { numero: pad(ticket.numero), motif: t(`support.ticket.motif.${ticket.motif}.nom`) })}\n`
      + t('support.ticket.accueil_texte', { membre: `<@${ticket.user_id}>` }),
      membre.user.displayAvatarURL({ size: 256 })
    ),
    C.separateur(),
    C.texte(fiche(client, membre, t)),
    C.separateur(),
    C.texte(etat),
    boutons,
    new ActionRowBuilder().addComponents(menuPriorite),
    new ActionRowBuilder().addComponents(ajout),
    new ActionRowBuilder().addComponents(menuRapide),
    C.texte(`-# ${t('support.ticket.accueil_pied')}`),
  ], motif.couleur);

  return { conteneur, fichiers: b ? [b.fichier()] : [] };
}

/** Le recapitulatif du formulaire, avec sa banniere. */
function construireRecap(ticket, reponses, guild) {
  const { t, langue } = tr(guild);
  const motif = MOTIFS[ticket.motif] ?? MOTIFS.autre;
  const b = banniere('formulaire', langue);

  const blocs = reponses.map((r) => `**${r.question}**\n${r.reponse ? `>>> ${r.reponse}` : `> _${t('support.ticket.sans_reponse')}_`}`);
  // Un bloc de texte V2 plafonne a 4000 caracteres : on repartit.
  const textes = [];
  let courant = '';
  for (const bloc of blocs) {
    if ((courant + bloc).length > 3800) {
      textes.push(courant);
      courant = '';
    }
    courant += `${courant ? '\n\n' : ''}${bloc}`;
  }
  if (courant) textes.push(courant);

  const conteneur = C.conteneur([
    b ? C.image(b.url) : null,
    C.texte(`## 📋 ${t('support.ticket.recap_titre')} · ${motif.emoji} ${t(`support.ticket.motif.${ticket.motif}.nom`)}`),
    C.separateur(),
    ...textes.map((x) => C.texte(x)),
    C.texte(`-# ${t('support.ticket.recap_pied')}`),
  ], motif.couleur);

  return { conteneur, fichiers: b ? [b.fichier()] : [] };
}

// ------------------------------------------------------------------ OUVERTURE
async function ouvrir(interaction, cle) {
  const { t } = tr(interaction.guild);
  const guild = interaction.guild;
  const motif = MOTIFS[cle];
  if (!motif) return interaction.reply(C.erreurPrivee(t('support.ticket.motif_inconnu')));

  const souci = probleme(interaction);
  if (souci) return interaction.reply(C.avertissementPrivee(souci));

  await interaction.deferReply({ flags: 64 });

  // Les reponses du formulaire, avec la question telle qu'elle a ete posee.
  const reponses = motif.champs.map((champ) => ({
    question: t(`support.ticket.motif.${cle}.champ.${champ.id}.label`),
    reponse: (interaction.fields.getTextInputValue(champ.id) ?? '').trim(),
  }));

  const numero = (store.q.dernierNumero.get().n ?? 0) + 1;
  const moi = guild.members.me;
  const staff = store.lire('ticket.staff');
  const voir = [
    PermissionFlagsBits.ViewChannel,
    PermissionFlagsBits.SendMessages,
    PermissionFlagsBits.ReadMessageHistory,
    PermissionFlagsBits.AttachFiles,
    PermissionFlagsBits.EmbedLinks,
  ];
  const autorisations = [
    { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
    { id: interaction.user.id, allow: voir },
    { id: moi.id, allow: [...voir, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.ManageMessages] },
  ];
  if (staff && guild.roles.cache.has(staff)) {
    autorisations.push({ id: staff, allow: [...voir, PermissionFlagsBits.ManageMessages] });
  }
  // Toi, meme sans role staff.
  for (const id of String(process.env.OWNER_IDS ?? '').split(',').map((s) => s.trim())) {
    if (/^\d{17,20}$/.test(id) && id !== interaction.user.id && guild.members.cache.has(id)) {
      autorisations.push({ id, allow: [...voir, PermissionFlagsBits.ManageMessages] });
    }
  }

  const categorie = store.lire('ticket.categorie');
  const parent = categorie && guild.channels.cache.get(categorie)?.type === ChannelType.GuildCategory ? categorie : null;
  const brouillon = { numero, motif: cle, priorite: 'normale' };

  let salon;
  try {
    salon = await guild.channels.create({
      name: nomSalon(brouillon, interaction.user.username),
      type: ChannelType.GuildText,
      parent,
      topic: `Ticket support #${pad(numero)} · ${interaction.user.username} (${interaction.user.id}) · ${t(`support.ticket.motif.${cle}.nom`)}`.slice(0, 1024),
      permissionOverwrites: autorisations,
      reason: `Ticket support ouvert par ${interaction.user.username}`,
    });
  } catch (e) {
    logger.erreur('Ticket support (creation du salon) :', e);
    return interaction.editReply(C.erreur(t('support.ticket.creation_impossible', { erreur: e.message })));
  }

  store.q.creer.run({
    numero,
    channel_id: salon.id,
    user_id: interaction.user.id,
    motif: cle,
    reponses: JSON.stringify(reponses),
    cree_le: Date.now(),
  });
  const ticket = store.q.parSalon.get(salon.id);

  const accueil = construireAccueil(ticket, interaction.member, interaction.client);
  const recap = construireRecap(ticket, reponses, guild);
  const pings = [`<@${interaction.user.id}>`, staff ? `<@&${staff}>` : null].filter(Boolean).join(' ');

  try {
    await salon.send(C.envoi([C.texte(pings), accueil.conteneur], { files: accueil.fichiers }));
    await salon.send(C.envoi([recap.conteneur], { files: recap.fichiers }));
  } catch (e) {
    logger.erreur('Ticket support (message d\'accueil) :', e);
  }

  journal.noter('tickets', {
    titre: `🎫 Ticket #${pad(numero)} ouvert · ${MOTIFS[cle].emoji} ${t(`support.ticket.motif.${cle}.nom`)}`,
    couleur: MOTIFS[cle].couleur,
    vignette: interaction.user.displayAvatarURL(),
    lignes: [
      `**Membre** · ${interaction.user} · ${interaction.user.username} (\`${interaction.user.id}\`)`,
      `**Salon** · ${salon}`,
      '',
      ...reponses.slice(0, 3).map((r) => `**${r.question}** · ${(r.reponse || '—').slice(0, 200).replace(/\n/g, ' ')}`),
    ],
  });

  return interaction.editReply(C.succes(t('support.ticket.ouvert', { salon: `${salon}` }), {
    elements: [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel(t('support.ticket.aller')).setURL(salon.url)
    )],
  }));
}

// ---------------------------------------------------------- ACTIONS DE STAFF
/** Reconstruit le message d'accueil apres un changement. */
async function rafraichir(interaction, ticket) {
  const membre = await interaction.guild.members.fetch(ticket.user_id).catch(() => null);
  if (!membre) return interaction.deferUpdate().catch(() => null);
  const accueil = construireAccueil(ticket, membre, interaction.client);
  return interaction.update({
    components: [C.texte(`<@${ticket.user_id}>`), accueil.conteneur],
    files: accueil.fichiers,
    attachments: [],
  });
}

async function prendre(interaction, ticket) {
  const { t } = tr(interaction.guild);
  store.q.prendre.run(interaction.user.id, Date.now(), ticket.channel_id);
  await rafraichir(interaction, store.q.parSalon.get(ticket.channel_id));
  await interaction.channel.send(C.info(t('support.ticket.pris_annonce', { membre: `${interaction.user}` }))).catch(() => null);
}

async function changerPriorite(interaction, ticket) {
  const { t } = tr(interaction.guild);
  const valeur = interaction.values[0];
  if (!PRIORITES[valeur]) return interaction.deferUpdate();
  store.q.priorite.run(valeur, ticket.channel_id);
  const neuf = store.q.parSalon.get(ticket.channel_id);
  await rafraichir(interaction, neuf);

  // Renommer coute cher (2 par 10 min chez Discord) : seulement si le nom change.
  const auteur = await interaction.client.users.fetch(ticket.user_id).catch(() => null);
  const nom = nomSalon(neuf, auteur?.username);
  if (interaction.channel.name !== nom) interaction.channel.setName(nom).catch(() => null);
  await interaction.channel.send(C.info(t('support.ticket.priorite_annonce', {
    membre: `${interaction.user}`,
    priorite: `${PRIORITES[valeur].emoji} ${t(`support.ticket.priorite.${valeur}`)}`,
  }))).catch(() => null);
}

async function ajouter(interaction, ticket) {
  const { t } = tr(interaction.guild);
  const id = interaction.values[0];
  if (id === ticket.user_id) return interaction.reply(C.infoPrivee(t('support.ticket.deja_dedans')));
  await interaction.channel.permissionOverwrites.edit(id, {
    ViewChannel: true,
    SendMessages: true,
    ReadMessageHistory: true,
    AttachFiles: true,
  });
  // Le menu garde la selection visible : on rafraichit pour le vider.
  await rafraichir(interaction, ticket);
  await interaction.channel.send(C.succes(t('support.ticket.ajoute', { membre: `<@${id}>`, par: `${interaction.user}` }))).catch(() => null);
}

async function transcription(interaction, ticket) {
  const { t } = tr(interaction.guild);
  await interaction.deferReply({ flags: 64 });
  const auteur = await interaction.client.users.fetch(ticket.user_id).catch(() => null);
  const tr2 = await genererTranscription(interaction.channel, adapter(ticket, t), {
    auteur: auteur?.username ?? ticket.user_id,
    fermePar: `${interaction.user.username} (${t('support.ticket.transcription_partielle')})`,
  });
  return interaction.editReply({
    ...C.succes(t('support.ticket.transcription_prete', { n: tr2.nombre })),
    files: [new AttachmentBuilder(tr2.html, { name: `ticket-support-${pad(ticket.numero)}.html` })],
  });
}

/** La transcription attend une ligne de la table `tickets` : on lui en donne la forme. */
function adapter(ticket, t) {
  let reponses = [];
  try {
    reponses = JSON.parse(ticket.reponses ?? '[]');
  } catch {
    reponses = [];
  }
  return {
    numero: ticket.numero,
    type: t(`support.ticket.motif.${ticket.motif}.nom`),
    user_id: ticket.user_id,
    cree_le: ticket.cree_le,
    sujet: reponses[0]?.reponse?.slice(0, 200) ?? null,
    description: reponses.slice(1).map((r) => `${r.question} : ${r.reponse}`).join('\n') || null,
  };
}

// ------------------------------------------------------------------ FERMETURE
function demanderFermeture(interaction, ticket) {
  const { t } = tr(interaction.guild);
  const modal = new ModalBuilder()
    .setCustomId('stk_fermeture')
    .setTitle(t('support.ticket.fermer_titre', { numero: pad(ticket.numero) }).slice(0, 45))
    .addComponents(new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('raison')
        .setLabel(t('support.ticket.fermer_raison').slice(0, 45))
        .setPlaceholder(t('support.ticket.fermer_aide').slice(0, 100))
        .setStyle(TextInputStyle.Short)
        .setMaxLength(300)
        .setRequired(false)
    ));
  return interaction.showModal(modal);
}

async function fermer(interaction, ticket, raison = null) {
  const { t } = tr(interaction.guild);
  await interaction.reply(C.info(t('support.ticket.fermeture_en_cours')));
  return fermerCoeur({ guild: interaction.guild, salon: interaction.channel, ticket, fermePar: interaction.user, raison });
}

/**
 * La fermeture SANS interaction : sert au bouton et a la fermeture
 * automatique des tickets inactifs (src/utils/ticketsInactifs.js).
 * `fermePar` vaut null pour une fermeture automatique.
 */
async function fermerCoeur({ guild, salon, ticket, fermePar = null, raison = null }) {
  const { t, langue } = tr(guild);
  const client = guild.client;
  const parNom = fermePar?.username ?? 'Wumi';
  const auteur = await client.users.fetch(ticket.user_id).catch(() => null);
  let html = null;
  let nombre = 0;
  try {
    const r = await genererTranscription(salon, adapter(ticket, t), {
      auteur: auteur?.username ?? ticket.user_id,
      fermePar: parNom,
      raison,
    });
    html = r.html;
    nombre = r.nombre;
  } catch (e) {
    logger.avertissement('Transcription du ticket support :', e.message);
  }

  store.q.fermer.run({
    channel_id: salon.id,
    ferme_le: Date.now(),
    ferme_par: fermePar?.id ?? null,
    raison,
    messages: nombre,
  });

  const motif = MOTIFS[ticket.motif] ?? MOTIFS.autre;
  const nomFichier = `ticket-support-${pad(ticket.numero)}.html`;
  const piece = () => (html ? new AttachmentBuilder(html, { name: nomFichier }) : null);
  const duree = require('./langues').duree(Date.now() - ticket.cree_le, langue);

  // --- Archive dans LOG_TICKETS
  await journal.noter('tickets', {
    titre: `🔒 Ticket #${pad(ticket.numero)} fermé · ${motif.emoji} ${t(`support.ticket.motif.${ticket.motif}.nom`)}`,
    couleur: conf.couleurs.erreur,
    vignette: auteur?.displayAvatarURL() ?? null,
    lignes: [
      `**Ouvert par** · ${auteur ? `${auteur} · ${auteur.username}` : ticket.user_id} (\`${ticket.user_id}\`)`,
      `**Fermé par** · ${fermePar ? `${fermePar}` : 'fermeture automatique (inactivité)'}`,
      `**Pris en charge** · ${ticket.pris_par ? `<@${ticket.pris_par}>` : '—'}`,
      `**Priorité** · ${PRIORITES[ticket.priorite]?.emoji ?? ''} ${ticket.priorite}`,
      `**Durée** · ${duree} · **Messages** · ${nombre}`,
      `**Raison** · ${raison ?? '—'}`,
    ],
  }, { fichiers: html ? [piece()] : [] });

  // --- Copie au membre, avec la note de satisfaction
  if (auteur) {
    const b = banniere('ferme', langue);
    const notes = new ActionRowBuilder().addComponents(
      [1, 2, 3, 4, 5].map((n) => new ButtonBuilder()
        .setCustomId(`stk_note:${ticket.id}:${n}`)
        .setStyle(n >= 4 ? ButtonStyle.Success : ButtonStyle.Secondary)
        .setLabel('★'.repeat(n)))
    );
    const mp = C.conteneur([
      b ? C.image(b.url) : null,
      C.texte(`## ${t('support.ticket.mp_titre', { numero: pad(ticket.numero) })}\n${t('support.ticket.mp_texte', { serveur: guild.name })}`),
      C.separateur(),
      C.texte([
        `${motif.emoji} **${t('support.ticket.mp_motif')}** · ${t(`support.ticket.motif.${ticket.motif}.nom`)}`,
        `⏱️ **${t('support.ticket.mp_duree')}** · ${duree}`,
        raison ? `📝 **${t('support.ticket.mp_raison')}** · ${raison}` : null,
      ].filter(Boolean).join('\n')),
      C.separateur(),
      C.texte(`### ${t('support.ticket.mp_note_titre')}\n${t('support.ticket.mp_note_texte')}`),
      notes,
      C.texte(`-# ${t('support.ticket.mp_pied')}`),
    ], conf.couleurs.principale);

    const fichiers = [b?.fichier(), piece()].filter(Boolean);
    await auteur.send(C.envoi([mp], { files: fichiers })).catch(() => null);
  }

  await salon.send(C.avertissement(t('support.ticket.supprime_bientot'))).catch(() => null);
  setTimeout(() => salon.delete(`Ticket support #${ticket.numero} fermé par ${parNom}`).catch(() => null), 6000);
}

// --------------------------------------------------------- NOTE (EN PRIVE)
async function noter(interaction) {
  const [, id, n] = interaction.customId.split(':');
  const note = Math.min(5, Math.max(1, Number(n)));
  const ticket = store.q.parId.get(Number(id));
  const { t } = tr(null);

  if (!ticket || ticket.user_id !== interaction.user.id) {
    return interaction.reply(C.erreurPrivee(t('erreur.pas_pour_toi')));
  }
  const fait = store.q.noter.run(note, ticket.id).changes > 0;
  if (!fait) return interaction.reply(C.infoPrivee(t('support.ticket.note_deja')));

  // On remplace la rangee de boutons par le merci, sans toucher au reste.
  const neuf = interaction.message.components.map((c) => c.toJSON());
  const conteneur = neuf.find((c) => c.type === 17);
  if (conteneur) {
    conteneur.components = conteneur.components
      .filter((x) => x.type !== 1)
      .map((x) => (x.type === 10 && x.content?.includes(t('support.ticket.mp_note_titre'))
        ? { ...x, content: `### ${t('support.ticket.mp_note_titre')}\n${t('support.ticket.note_merci', { etoiles: '★'.repeat(note) + '☆'.repeat(5 - note) })}` }
        : x));
  }
  await interaction.update({ components: neuf }).catch(() => interaction.reply(C.succesPrive(t('support.ticket.note_merci', { etoiles: '★'.repeat(note) }))));

  journal.noter('tickets', {
    titre: `${note >= 4 ? '💙' : note >= 3 ? '🤍' : '💔'} Note ${note}/5 · ticket #${pad(ticket.numero)}`,
    couleur: note >= 4 ? conf.couleurs.succes : note >= 3 ? conf.couleurs.avertissement : conf.couleurs.erreur,
    lignes: [
      `**Membre** · ${interaction.user} (\`${interaction.user.id}\`)`,
      `**Satisfaction** · ${'★'.repeat(note)}${'☆'.repeat(5 - note)}`,
      ticket.pris_par ? `**Pris en charge par** · <@${ticket.pris_par}>` : null,
    ],
  });
}

// -------------------------------------------------------------------- ROUTAGE
async function gererInteraction(interaction) {
  // La note arrive en MP : pas de serveur, et c'est normal.
  if (interaction.isButton() && interaction.customId.startsWith('stk_note:')) return noter(interaction);

  const { t } = tr(interaction.guild);
  if (!surSupport(interaction)) return interaction.reply(C.erreurPrivee(t('support.reserve_support')));

  try {
    // ---- Ouverture
    if (interaction.isStringSelectMenu() && interaction.customId === 'stk_motif') {
      const cle = interaction.values[0];
      const souci = probleme(interaction);
      if (souci) return interaction.reply(C.avertissementPrivee(souci));
      return interaction.showModal(construireFormulaire(cle, interaction.guild));
    }
    if (interaction.isModalSubmit() && interaction.customId.startsWith('stk_form:')) {
      return await ouvrir(interaction, interaction.customId.split(':')[1]);
    }

    // ---- Dans un ticket
    const ticket = store.q.parSalon.get(interaction.channelId);
    if (!ticket || ticket.statut !== 'ouvert') {
      return interaction.reply(C.erreurPrivee(t('support.ticket.hors_ticket')));
    }
    const staff = estStaff(interaction.member);

    if (interaction.isButton() && interaction.customId === 'stk_garder') {
      if (!staff && interaction.user.id !== ticket.user_id) return interaction.reply(C.erreurPrivee(t('erreur.pas_pour_toi')));
      store.q.relance.run(null, ticket.channel_id);
      return interaction.update(C.succes(t('ticket.v2.garde', { membre: `${interaction.user}` })));
    }

    if (interaction.isButton() && interaction.customId === 'stk_fermer') {
      if (!staff && interaction.user.id !== ticket.user_id) return interaction.reply(C.erreurPrivee(t('support.ticket.fermer_refuse')));
      return demanderFermeture(interaction, ticket);
    }
    if (interaction.isModalSubmit() && interaction.customId === 'stk_fermeture') {
      if (!staff && interaction.user.id !== ticket.user_id) return interaction.reply(C.erreurPrivee(t('support.ticket.fermer_refuse')));
      const raison = interaction.fields.getTextInputValue('raison')?.trim() || null;
      return await fermer(interaction, ticket, raison);
    }

    // Le reste est reserve a l'equipe.
    if (!staff) return interaction.reply(C.erreurPrivee(t('support.ticket.staff_seulement')));

    if (interaction.isButton() && interaction.customId === 'stk_prendre') return await prendre(interaction, ticket);
    if (interaction.isButton() && interaction.customId === 'stk_transcription') return await transcription(interaction, ticket);
    if (interaction.isStringSelectMenu() && interaction.customId === 'stk_priorite') return await changerPriorite(interaction, ticket);
    if (interaction.isUserSelectMenu() && interaction.customId === 'stk_ajouter') return await ajouter(interaction, ticket);
    if (interaction.isStringSelectMenu() && interaction.customId === 'stk_rapide') return await repondreVite(interaction, ticket);
    if (interaction.isButton() && interaction.customId === 'stk_diag') return await diagnostic(interaction, ticket);
  } catch (e) {
    logger.erreur(`Ticket support (${interaction.customId}) :`, e);
    const r = C.erreurPrivee(t('support.ticket.erreur'));
    if (interaction.replied || interaction.deferred) await interaction.followUp(r).catch(() => null);
    else await interaction.reply(r).catch(() => null);
  }
  return null;
}

// ---------------------------------------------------------- REPONSES RAPIDES
async function repondreVite(interaction, ticket) {
  const { t } = tr(interaction.guild);
  const cle = interaction.values[0];
  if (!RAPIDES[cle]) return interaction.deferUpdate();
  await interaction.deferUpdate();
  // Le menu revient a vide pour pouvoir resservir.
  const membre = await interaction.guild.members.fetch(ticket.user_id).catch(() => null);
  if (membre) {
    const { conteneur } = construireAccueil(ticket, membre, interaction.client);
    await interaction.message.edit({ components: [conteneur] }).catch(() => null);
  }
  await interaction.channel.send({
    components: [C.conteneur([
      C.texte(t(`support.ticket.rapides.${cle}.texte`, { membre: `<@${ticket.user_id}>`, site: 'https://wumi.fr' })),
      C.texte(`-# ${RAPIDES[cle]} ${interaction.member.displayName}`),
    ], conf.couleurs.principale)],
    flags: require('discord.js').MessageFlags.IsComponentsV2,
    allowedMentions: { users: [ticket.user_id] },
  });
  return null;
}

// --------------------------------------------------------------- DIAGNOSTIC
/**
 * Le bouton 🩺 : l'etat de Wumi sur le(s) serveur(s) du demandeur — ceux
 * cites dans le formulaire, sinon ceux dont il est proprietaire.
 */
function serveursDuTicket(client, ticket) {
  const ids = new Set();
  try {
    for (const r of JSON.parse(ticket.reponses || '[]')) {
      for (const id of String(r.reponse ?? '').match(/\d{17,20}/g) ?? []) ids.add(id);
    }
  } catch { /* reponses illisibles : on passe aux serveurs possedes */ }
  for (const g of client.guilds.cache.values()) if (g.ownerId === ticket.user_id && !fondateur.estSupport(g.id)) ids.add(g.id);
  return [...ids].slice(0, 3);
}

function decrireProbleme(p, t) {
  switch (p.categorie) {
    case 'permissions': return t('support.ticket.diag_perms', { liste: p.permissions.join(', ') });
    case 'role_bas': return t('support.ticket.diag_roles', { n: p.roles.length });
    case 'salon_supprime': return t('support.ticket.diag_salon_supprime', { n: p.reglages.length });
    case 'salon_illisible': return t('support.ticket.diag_salon_illisible', { n: p.reglages.length });
    case 'fonction_incomplete': return t('support.ticket.diag_incomplet', { nom: p.paire?.nom ?? p.paire?.cle ?? '?' });
    case 'intent': return t('support.ticket.diag_intent');
    default: return p.categorie;
  }
}

async function diagnostic(interaction, ticket) {
  const { t } = tr(interaction.guild);
  const client = interaction.client;
  const ids = serveursDuTicket(client, ticket);
  const { diagnostiquer } = require('./diagnostic');
  const blocs = [C.texte(`## 🩺 ${t('support.ticket.diag_titre')}`)];
  if (!ids.length) blocs.push(C.texte(t('support.ticket.diag_aucun')));
  for (const id of ids) {
    const g = client.guilds.cache.get(id);
    if (!g) {
      blocs.push(C.separateur(), C.texte(`**\`${id}\`** · ❌ ${t('support.ticket.diag_absent')}`));
      continue;
    }
    const d = diagnostiquer(g);
    const lignes = [
      `**${g.name.slice(0, 60)}** · \`${g.id}\` · ${g.memberCount ?? '?'} 👥`,
      d.sain ? `✅ ${t('support.ticket.diag_sain')}` : null,
      ...d.bloquant.map((p) => `🔴 ${decrireProbleme(p, t)}`),
      ...d.attention.map((p) => `🟠 ${decrireProbleme(p, t)}`),
    ];
    try {
      const { musique } = require('../musique/lecteur');
      if (musique.configure()) {
        const l = musique.obtenir(g.id);
        lignes.push(`🎵 ${musique.disponible() ? t('support.ticket.diag_musique_ok') : t('support.ticket.diag_musique_ko')}${l ? ` · ${t('support.ticket.diag_musique_joue', { salon: `<#${l.salonVocal}>` })}` : ''}`);
      }
    } catch { /* pas de musique sur cette instance */ }
    blocs.push(C.separateur(), C.texte(lignes.filter(Boolean).join('\n')));
  }
  return interaction.reply(C.envoiPrive([C.conteneur(blocs, 0x58a6ff)], { allowedMentions: { parse: [] } }));
}

// ---------------------------------------------------------------- STATISTIQUES
function statistiques() {
  const s = store.q.stats.get() ?? {};
  return {
    total: s.total ?? 0,
    ouverts: s.ouverts ?? 0,
    note: s.note ? Math.round(s.note * 10) / 10 : null,
    notes: s.notes ?? 0,
    priseMoyenne: s.prise_moyenne ?? null,
    dureeMoyenne: s.duree_moyenne ?? null,
  };
}

module.exports = {
  MOTIFS,
  RAPIDES,
  serveursDuTicket,
  PRIORITES,
  construirePanneau,
  construireFormulaire,
  construireAccueil,
  construireRecap,
  gererInteraction,
  statistiques,
  estStaff,
  nomSalon,
  fermerCoeur,
};
