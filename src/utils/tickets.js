/**
 * Le systeme de tickets de CHAQUE serveur (/ticket), version Wumi 2.0.
 *
 *   - panneau Components V2 (banniere facultative, ticket_banniere) ;
 *   - motifs propres au serveur (/ticket config type-ajouter) ;
 *   - formulaire facultatif (sujet + detail) ;
 *   - prise en charge, priorite, ajout d'un membre, transcription a la demande ;
 *   - a la fermeture : archive, copie en MP avec une note de 1 a 5 ;
 *   - fermeture automatique des tickets inactifs (ticket_inactif_heures),
 *     voir src/utils/ticketsInactifs.js.
 *
 * TOUT EST TRADUIT (cles ticket.v2.*) : avant, ce fichier ecrivait en
 * francais sur tous les serveurs, y compris anglophones.
 *
 * COMPATIBILITE : les panneaux publies AVANT la mise a jour gardent leurs
 * boutons (ticket_ouvrir, ticket_ouvrir_menu, ticket_prendre, ticket_fermer,
 * ticket_modal_*). Ils continuent donc de marcher sans rien republier.
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
const { db, req, config } = require('../database/db');
const C = require('./composants');
const { envoyerLog } = require('./logs');
const { genererTranscription } = require('./transcription');
const logger = require('./logger');
const { E } = require('./emojis');
const { banniere } = require('./bannieres');
const { traducteur, duree: enDuree } = require('./langues');

const PRIORITES = {
  basse: { emoji: '🟢', prefixe: '' },
  normale: { emoji: '🔵', prefixe: '' },
  haute: { emoji: '🟠', prefixe: '🟠' },
  urgente: { emoji: '🔴', prefixe: '🔴' },
};

const q = {
  prendre: db.prepare('UPDATE tickets SET pris_par = ?, pris_le = ? WHERE channel_id = ?'),
  priorite: db.prepare('UPDATE tickets SET priorite = ? WHERE channel_id = ?'),
  parId: db.prepare('SELECT * FROM tickets WHERE id = ?'),
  noter: db.prepare('UPDATE tickets SET note = ? WHERE id = ? AND note IS NULL'),
  messages: db.prepare('UPDATE tickets SET messages = ? WHERE channel_id = ?'),
  relance: db.prepare('UPDATE tickets SET relance_le = ? WHERE channel_id = ?'),
  liberer: db.prepare('UPDATE tickets SET pris_par = NULL, pris_le = NULL WHERE channel_id = ?'),
  premiereReponse: db.prepare('UPDATE tickets SET premiere_reponse = ? WHERE channel_id = ? AND premiere_reponse IS NULL'),
  alerte: db.prepare('UPDATE tickets SET alerte_le = ? WHERE channel_id = ?'),
  sansReponse: db.prepare(`
    SELECT t.*, c.ticket_alerte_minutes AS minutes, c.ticket_role_staff AS role_staff FROM tickets t
    JOIN config c ON c.guild_id = t.guild_id
    WHERE t.statut = 'ouvert' AND c.ticket_alerte_minutes > 0
      AND t.premiere_reponse IS NULL AND t.alerte_le IS NULL
      AND t.cree_le <= ? - c.ticket_alerte_minutes * 60000
  `),
  statsGlobal: db.prepare(`
    SELECT COUNT(*) AS total,
           SUM(CASE WHEN statut = 'ferme' THEN 1 ELSE 0 END) AS fermes,
           AVG(CASE WHEN premiere_reponse IS NOT NULL THEN premiere_reponse - cree_le END) AS reponse,
           SUM(CASE WHEN premiere_reponse IS NULL AND statut = 'ferme' THEN 1 ELSE 0 END) AS sans_reponse,
           AVG(note) AS note, COUNT(note) AS notes
    FROM tickets WHERE guild_id = ? AND cree_le >= ?
  `),
  statsStaff: db.prepare(`
    SELECT pris_par, COUNT(*) AS n,
           AVG(CASE WHEN premiere_reponse IS NOT NULL THEN premiere_reponse - cree_le END) AS reponse,
           AVG(note) AS note, COUNT(note) AS notes
    FROM tickets WHERE guild_id = ? AND cree_le >= ? AND pris_par IS NOT NULL
    GROUP BY pris_par ORDER BY n DESC LIMIT 10
  `),
  ouverts: db.prepare("SELECT COUNT(*) AS n FROM tickets WHERE guild_id = ? AND statut = 'ouvert'"),
};

const pad = (n) => String(n).padStart(4, '0');
const quand = (ms, style = 'R') => `<t:${Math.floor(ms / 1000)}:${style}>`;

/** Fait partie de l'equipe des tickets de ce serveur ? */
function estStaff(membre, cfg) {
  if (!membre) return false;
  if (membre.permissions?.has?.(PermissionFlagsBits.ManageMessages)) return true;
  return Boolean(cfg.ticket_role_staff && membre.roles?.cache?.has(cfg.ticket_role_staff));
}

function nomSalon(ticket, pseudo) {
  const prio = PRIORITES[ticket.priorite]?.prefixe ?? '';
  const propre = String(pseudo ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 20);
  return `${prio}ticket-${pad(ticket.numero)}${propre ? `-${propre}` : ''}`;
}

// ------------------------------------------------------------------- PANNEAU
function construirePanneau(guild) {
  const { t, langue } = traducteur(guild);
  const cfg = config(guild.id);
  const types = req.typesTickets.all(guild.id);
  const b = cfg.ticket_banniere ? banniere('panneau', langue) : null;

  let rangee;
  if (types.length) {
    rangee = new ActionRowBuilder().addComponents(new StringSelectMenuBuilder()
      .setCustomId('ticket_ouvrir_menu')
      .setPlaceholder(t('ticket.v2.panneau_menu'))
      .addOptions(types.slice(0, 25).map((ty) => ({
        label: ty.label.slice(0, 100),
        value: ty.cle,
        description: ty.description ? ty.description.slice(0, 100) : undefined,
        emoji: ty.emoji || undefined,
      }))));
  } else {
    rangee = new ActionRowBuilder().addComponents(new ButtonBuilder()
      .setCustomId('ticket_ouvrir')
      .setLabel((cfg.ticket_bouton || t('ticket.v2.panneau_bouton')).slice(0, 80))
      .setEmoji(E('tickets'))
      .setStyle(ButtonStyle.Primary));
  }

  const lignesTypes = types.length
    ? types.slice(0, 15).map((ty) => `${ty.emoji ?? '•'} **${ty.label}**${ty.description ? ` — ${ty.description}` : ''}`).join('\n')
    : null;

  const conteneur = C.conteneur([
    b ? C.image(b.url) : null,
    C.texte(`## ${cfg.ticket_titre || `${E('tickets')} ${t('ticket.v2.panneau_titre')}`}\n${cfg.ticket_message || t('ticket.v2.panneau_message')}`),
    lignesTypes ? C.separateur() : null,
    lignesTypes ? C.texte(lignesTypes) : null,
    rangee,
    C.texte(`-# ${guild.name}`),
  ], conf.couleurs.principale);

  return C.envoi([conteneur], { files: b ? [b.fichier()] : [] });
}

// ------------------------------------------------------------------ OUVERTURE
function verifierOuverture(interaction) {
  const { t } = traducteur(interaction);
  const guild = interaction.guild;
  const cfg = config(guild.id);

  const valides = [];
  for (const tk of req.ticketsOuvertsDe.all(guild.id, interaction.user.id)) {
    if (guild.channels.cache.has(tk.channel_id)) valides.push(tk);
    else req.fermerTicket.run({ channel_id: tk.channel_id, ferme_le: Date.now(), ferme_par: null, raison: 'Salon supprimé' });
  }
  if (cfg.ticket_max > 0 && valides.length >= cfg.ticket_max) {
    return t('ticket.v2.deja_ouvert', { n: valides.length, salons: valides.map((tk) => `<#${tk.channel_id}>`).join(', ') });
  }
  if (!guild.members.me.permissions.has(PermissionFlagsBits.ManageChannels)) return t('ticket.v2.permission_bot');
  return null;
}

async function demanderOuverture(interaction, cleType = null) {
  const { t } = traducteur(interaction);
  const probleme = verifierOuverture(interaction);
  if (probleme) return interaction.reply(C.avertissementPrivee(probleme));

  const cfg = config(interaction.guild.id);
  if (!cfg.ticket_formulaire) return ouvrirTicket(interaction, cleType);

  const type = cleType ? req.typeTicket.get(interaction.guild.id, cleType) : null;
  const modal = new ModalBuilder()
    .setCustomId(cleType ? `ticket_modal_ouverture:${cleType}` : 'ticket_modal_ouverture')
    .setTitle((type ? `${type.emoji ? `${type.emoji} ` : ''}${type.label}` : t('ticket.v2.formulaire_titre')).slice(0, 45))
    .addComponents(
      new ActionRowBuilder().addComponents(new TextInputBuilder()
        .setCustomId('sujet')
        .setLabel(t('ticket.v2.formulaire_sujet').slice(0, 45))
        .setPlaceholder(t('ticket.v2.formulaire_sujet_aide').slice(0, 100))
        .setStyle(TextInputStyle.Short)
        .setMinLength(3)
        .setMaxLength(100)
        .setRequired(true)),
      new ActionRowBuilder().addComponents(new TextInputBuilder()
        .setCustomId('description')
        .setLabel(t('ticket.v2.formulaire_detail').slice(0, 45))
        .setPlaceholder(t('ticket.v2.formulaire_detail_aide').slice(0, 100))
        .setStyle(TextInputStyle.Paragraph)
        .setMinLength(10)
        .setMaxLength(1500)
        .setRequired(true))
    );
  return interaction.showModal(modal);
}

/** Le message d'accueil du ticket (reconstruit a chaque changement). */
function construireAccueil(ticket, membre) {
  const guild = membre.guild;
  const { t, langue } = traducteur(guild);
  const cfg = config(guild.id);
  const prio = PRIORITES[ticket.priorite] ?? PRIORITES.normale;
  const b = cfg.ticket_banniere ? banniere('ticket', langue) : null;

  const boutons = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('ticket_prendre')
      .setStyle(ticket.pris_par ? ButtonStyle.Secondary : ButtonStyle.Primary)
      .setEmoji('🙋')
      .setLabel(ticket.pris_par ? t('ticket.v2.bouton_pris') : t('ticket.v2.bouton_prendre'))
      .setDisabled(Boolean(ticket.pris_par)),
    new ButtonBuilder().setCustomId('ticket_fermer').setStyle(ButtonStyle.Danger).setEmoji(E('verrou')).setLabel(t('ticket.v2.bouton_fermer')),
    new ButtonBuilder().setCustomId('ticket_transcription').setStyle(ButtonStyle.Secondary).setEmoji('📄').setLabel(t('ticket.v2.bouton_transcription'))
  );
  // Un ticket pris peut etre rendu a l'equipe (absence, mauvais interlocuteur).
  if (ticket.pris_par) {
    boutons.addComponents(new ButtonBuilder().setCustomId('ticket_liberer').setStyle(ButtonStyle.Secondary).setEmoji('↩️').setLabel(t('ticket.v2.bouton_liberer')));
  }
  const menuPriorite = new StringSelectMenuBuilder()
    .setCustomId('ticket_priorite')
    .setPlaceholder(t('ticket.v2.priorite_menu'))
    .addOptions(Object.entries(PRIORITES).map(([cle, p]) => ({
      label: t(`ticket.v2.priorite.${cle}`), value: cle, emoji: p.emoji, default: cle === (ticket.priorite ?? 'normale'),
    })));
  const ajout = new UserSelectMenuBuilder().setCustomId('ticket_ajouter').setPlaceholder(t('ticket.v2.ajouter_menu')).setMinValues(1).setMaxValues(1);

  const demande = ticket.sujet || ticket.description
    ? [
      ticket.sujet ? `**${E('epingle')} ${t('ticket.v2.sujet')}**\n> ${ticket.sujet}` : null,
      ticket.description ? `**${E('note')} ${t('ticket.v2.detail')}**\n>>> ${ticket.description.slice(0, 1500)}` : null,
    ].filter(Boolean).join('\n\n')
    : t('ticket.v2.sans_formulaire');

  const conteneur = C.conteneur([
    b ? C.image(b.url) : null,
    C.sectionVignette(
      `## ${E('tickets')} ${t('ticket.v2.accueil_titre', { numero: pad(ticket.numero) })}${ticket.type ? ` · ${ticket.type}` : ''}\n`
      + t('ticket.v2.accueil_texte', { membre: `<@${ticket.user_id}>` }),
      membre.user.displayAvatarURL({ size: 256 })
    ),
    C.separateur(),
    C.texte(demande),
    C.separateur(),
    C.texte([
      `${prio.emoji} **${t('ticket.v2.priorite_label')}** · ${t(`ticket.v2.priorite.${ticket.priorite ?? 'normale'}`)}`,
      `🙋 **${t('ticket.v2.pris_label')}** · ${ticket.pris_par ? `<@${ticket.pris_par}>${ticket.pris_le ? ` ${quand(ticket.pris_le)}` : ''}` : t('ticket.v2.personne')}`,
      `🕒 **${t('ticket.v2.ouvert_label')}** · ${quand(ticket.cree_le, 'f')}`,
      ticket.premiere_reponse ? `⚡ **${t('ticket.v2.reponse_label')}** · ${enDuree(ticket.premiere_reponse - ticket.cree_le, langue)}` : null,
    ].filter(Boolean).join('\n')),
    boutons,
    new ActionRowBuilder().addComponents(menuPriorite),
    new ActionRowBuilder().addComponents(ajout),
    C.texte(`-# ${t('ticket.v2.accueil_pied')}`),
  ], conf.couleurs.principale);

  return { conteneur, fichiers: b ? [b.fichier()] : [] };
}

async function ouvrirTicket(interaction, cleType = null, champs = {}) {
  const { t } = traducteur(interaction);
  const guild = interaction.guild;
  const cfg = config(guild.id);

  const probleme = verifierOuverture(interaction);
  if (probleme) return interaction.reply(C.avertissementPrivee(probleme));
  await interaction.deferReply({ flags: 64 });

  const moi = guild.members.me;
  const type = cleType ? req.typeTicket.get(guild.id, cleType) : null;
  const numero = (cfg.ticket_compteur ?? 0) + 1;
  const sujet = champs.sujet?.trim() || null;
  const description = champs.description?.trim() || null;

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
  if (cfg.ticket_role_staff && guild.roles.cache.has(cfg.ticket_role_staff)) {
    autorisations.push({ id: cfg.ticket_role_staff, allow: [...voir, PermissionFlagsBits.ManageMessages] });
  }
  const categorie = cfg.ticket_categorie ? guild.channels.cache.get(cfg.ticket_categorie) : null;

  let salon;
  try {
    salon = await guild.channels.create({
      name: nomSalon({ numero, priorite: 'normale' }, interaction.user.username),
      type: ChannelType.GuildText,
      parent: categorie?.type === ChannelType.GuildCategory ? categorie.id : null,
      topic: `Ticket #${numero} · ${interaction.user.username} (${interaction.user.id})${type ? ` · ${type.label}` : ''}${sujet ? ` · ${sujet}` : ''}`.slice(0, 1024),
      permissionOverwrites: autorisations,
      reason: t('ticket.v2.audit_ouvert', { membre: interaction.user.username }),
    });
  } catch (e) {
    logger.avertissement(`Création du ticket (${guild.name}) :`, e.message);
    return interaction.editReply(C.erreur(t('ticket.v2.creation_impossible', { erreur: e.message })));
  }

  req.incrementerCompteurTicket.run(guild.id);
  req.creerTicket.run({
    guild_id: guild.id, numero, channel_id: salon.id, user_id: interaction.user.id,
    type: type?.label ?? null, sujet, description, cree_le: Date.now(),
  });
  require('./missions').noter(guild.id, interaction.user.id, 'ticket', 1);

  const ticket = req.ticketParSalon.get(salon.id);
  const accueil = construireAccueil(ticket, interaction.member);
  const pings = [`<@${interaction.user.id}>`, cfg.ticket_role_staff ? `<@&${cfg.ticket_role_staff}>` : null].filter(Boolean).join(' ');
  await salon.send(C.envoi([C.texte(pings), accueil.conteneur], { files: accueil.fichiers })).catch((e) => logger.avertissement('Accueil du ticket :', e.message));

  await envoyerLog(guild, 'moderation', {
    color: conf.couleurs.succes,
    title: `${E('tickets')} ${t('ticket.v2.log_ouvert', { numero: pad(numero) })}`,
    description: [
      t('ticket.v2.log_par', { membre: `${interaction.user}`, salon: `${salon}` }),
      type ? t('ticket.v2.log_motif', { motif: type.label }) : null,
      sujet ? t('ticket.v2.log_sujet', { sujet }) : null,
    ].filter(Boolean).join('\n'),
    timestamp: new Date().toISOString(),
  });

  return interaction.editReply(C.succes(t('ticket.v2.ouvert', { salon: `${salon}` }), {
    elements: [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel(t('ticket.v2.aller')).setURL(salon.url)
    )],
  }));
}

// ---------------------------------------------------------- ACTIONS DE STAFF
async function rafraichir(interaction, ticket) {
  const membre = await interaction.guild.members.fetch(ticket.user_id).catch(() => null);
  if (!membre) return interaction.deferUpdate().catch(() => null);
  // Un panneau publie AVANT la mise a jour n'est pas en V2 : on ne peut pas
  // le convertir en le modifiant, on en poste donc un nouveau.
  const accueil = construireAccueil(ticket, membre);
  if (!interaction.message?.flags?.has?.(32768)) {
    await interaction.deferUpdate().catch(() => null);
    await interaction.message?.edit({ components: [] }).catch(() => null);
    return interaction.channel.send(C.envoi([accueil.conteneur], { files: accueil.fichiers }));
  }
  return interaction.update({ components: [C.texte(`<@${ticket.user_id}>`), accueil.conteneur], files: accueil.fichiers, attachments: [] });
}

async function prendreEnCharge(interaction, ticket) {
  const { t } = traducteur(interaction);
  q.prendre.run(interaction.user.id, Date.now(), ticket.channel_id);
  await rafraichir(interaction, req.ticketParSalon.get(ticket.channel_id));
  await interaction.channel.send(C.info(t('ticket.v2.pris_annonce', { membre: `${interaction.user}` }))).catch(() => null);
}

async function liberer(interaction, ticket) {
  const { t } = traducteur(interaction);
  if (!ticket.pris_par) return interaction.deferUpdate();
  q.liberer.run(ticket.channel_id);
  await rafraichir(interaction, req.ticketParSalon.get(ticket.channel_id));
  const cfg = config(interaction.guild.id);
  const ping = cfg.ticket_role_staff ? `<@&${cfg.ticket_role_staff}> ` : '';
  await interaction.channel.send(C.envoi([C.texte(`${ping}↩️ ${t('ticket.v2.libere_annonce', { membre: `${interaction.user}` })}`)])).catch(() => null);
}

/**
 * Le message d'accueil du ticket (pour le mettre a jour hors interaction) :
 * le premier message V2 du bot qui porte le bouton « Prendre en charge ».
 */
async function trouverAccueil(salon) {
  const premiers = await salon.messages.fetch({ after: '0', limit: 5 }).catch(() => null);
  return premiers?.find((m) => m.author.id === salon.client.user.id && JSON.stringify(m.components).includes('ticket_prendre')) ?? null;
}

/**
 * Chaque message ecrit dans un ticket ouvert.
 * La PREMIERE reponse d'un membre du staff est datee (temps de reponse) et,
 * si personne n'avait pris le ticket, ce membre le prend automatiquement :
 * on sait toujours qui s'en occupe, sans avoir a cliquer.
 */
async function surMessage(message, cfg) {
  const ticket = req.ticketParSalon.get(message.channel.id);
  if (!ticket || ticket.statut !== 'ouvert' || ticket.premiere_reponse) return;
  if (message.author.id === ticket.user_id || !estStaff(message.member, cfg)) return;

  const maintenant = Date.now();
  q.premiereReponse.run(maintenant, ticket.channel_id);
  const prendre = !ticket.pris_par;
  if (prendre) q.prendre.run(message.author.id, maintenant, ticket.channel_id);

  const neuf = req.ticketParSalon.get(ticket.channel_id);
  const membre = await message.guild.members.fetch(ticket.user_id).catch(() => null);
  const accueil = membre ? await trouverAccueil(message.channel) : null;
  if (accueil?.flags?.has?.(32768)) {
    const a = construireAccueil(neuf, membre);
    await accueil.edit({ components: [C.texte(`<@${ticket.user_id}>`), a.conteneur], files: a.fichiers, attachments: [] }).catch(() => null);
  }
  if (prendre) {
    const { t } = traducteur(message.guild);
    await message.channel.send(C.info(t('ticket.v2.pris_auto', { membre: `${message.author}` }))).catch(() => null);
  }
}

/**
 * Alerte « ticket sans reponse » : au bout de N minutes sans aucune reponse
 * du staff, on mentionne le role staff une fois (appele toutes les 15 min).
 */
async function alerterSansReponse(client) {
  for (const ticket of q.sansReponse.all(Date.now())) {
    q.alerte.run(Date.now(), ticket.channel_id);
    const guild = client.guilds.cache.get(ticket.guild_id);
    const salon = guild?.channels.cache.get(ticket.channel_id);
    if (!salon) continue;
    const { t, langue } = traducteur(guild);
    const ping = ticket.role_staff ? `<@&${ticket.role_staff}> ` : '';
    await salon.send(C.envoi([C.texte(`${ping}⏰ ${t('ticket.v2.alerte_sans_reponse', { duree: enDuree(Date.now() - ticket.cree_le, langue), membre: `<@${ticket.user_id}>` })}`)])).catch(() => null);
  }
}

async function changerPriorite(interaction, ticket) {
  const { t } = traducteur(interaction);
  const valeur = interaction.values[0];
  if (!PRIORITES[valeur]) return interaction.deferUpdate();
  q.priorite.run(valeur, ticket.channel_id);
  const neuf = req.ticketParSalon.get(ticket.channel_id);
  await rafraichir(interaction, neuf);
  const auteur = await interaction.client.users.fetch(ticket.user_id).catch(() => null);
  const nom = nomSalon(neuf, auteur?.username);
  if (interaction.channel.name !== nom) interaction.channel.setName(nom).catch(() => null);
  await interaction.channel.send(C.info(t('ticket.v2.priorite_annonce', {
    membre: `${interaction.user}`, priorite: `${PRIORITES[valeur].emoji} ${t(`ticket.v2.priorite.${valeur}`)}`,
  }))).catch(() => null);
}

async function ajouter(interaction, ticket) {
  const { t } = traducteur(interaction);
  const id = interaction.values[0];
  if (id === ticket.user_id) return interaction.reply(C.infoPrivee(t('ticket.v2.deja_dedans')));
  await interaction.channel.permissionOverwrites.edit(id, { ViewChannel: true, SendMessages: true, ReadMessageHistory: true, AttachFiles: true });
  await rafraichir(interaction, ticket);
  await interaction.channel.send(C.succes(t('ticket.v2.ajoute', { membre: `<@${id}>`, par: `${interaction.user}` }))).catch(() => null);
}

async function transcription(interaction, ticket) {
  const { t } = traducteur(interaction);
  await interaction.deferReply({ flags: 64 });
  const auteur = await interaction.client.users.fetch(ticket.user_id).catch(() => null);
  const r = await genererTranscription(interaction.channel, ticket, { auteur: auteur?.username ?? ticket.user_id, fermePar: interaction.user.username });
  return interaction.editReply({
    ...C.succes(t('ticket.v2.transcription_prete', { n: r.nombre })),
    files: [new AttachmentBuilder(r.html, { name: `ticket-${pad(ticket.numero)}.html` })],
  });
}

// ------------------------------------------------------------------ FERMETURE
function demanderRaison(interaction, ticket) {
  const { t } = traducteur(interaction);
  return interaction.showModal(new ModalBuilder()
    .setCustomId('ticket_modal_fermeture')
    .setTitle(t('ticket.v2.fermer_titre', { numero: pad(ticket.numero) }).slice(0, 45))
    .addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder()
      .setCustomId('raison')
      .setLabel(t('ticket.v2.fermer_raison').slice(0, 45))
      .setPlaceholder(t('ticket.v2.fermer_aide').slice(0, 100))
      .setStyle(TextInputStyle.Short)
      .setMaxLength(200)
      .setRequired(false))));
}

/**
 * Le coeur de la fermeture, SANS interaction : sert au bouton, a /ticket
 * fermer ET a la fermeture automatique des tickets inactifs.
 */
async function fermerCoeur({ guild, salon, ticket, fermePar, raison = null }) {
  const { t, langue } = traducteur(guild);
  const cfg = config(guild.id);
  const auteur = await guild.client.users.fetch(ticket.user_id).catch(() => null);

  let html = null;
  let nombre = 0;
  try {
    const r = await genererTranscription(salon, ticket, { auteur: auteur?.username ?? ticket.user_id, fermePar: fermePar?.username ?? 'Wumi', raison });
    html = r.html;
    nombre = r.nombre;
  } catch (e) {
    logger.avertissement('Transcription impossible :', e.message);
  }

  req.fermerTicket.run({ channel_id: salon.id, ferme_le: Date.now(), ferme_par: fermePar?.id ?? null, raison: raison ?? null });
  q.messages.run(nombre, salon.id);

  const piece = () => (html ? new AttachmentBuilder(html, { name: `ticket-${pad(ticket.numero)}.html` }) : null);
  const duree = enDuree(Date.now() - ticket.cree_le, langue);

  // --- Archive
  const lignes = [
    `**${t('ticket.v2.archive_ouvert_par')}** · ${auteur ? `${auteur} · ${auteur.username}` : `\`${ticket.user_id}\``}`,
    `**${t('ticket.v2.archive_ferme_par')}** · ${fermePar ? `${fermePar}` : t('ticket.v2.automatique')}`,
    `**${t('ticket.v2.archive_pris')}** · ${ticket.pris_par ? `<@${ticket.pris_par}>` : '—'}`,
    `**${t('ticket.v2.archive_duree')}** · ${duree} · **${t('ticket.v2.archive_messages')}** · ${nombre}`,
    ticket.type ? `**${t('ticket.v2.archive_motif')}** · ${ticket.type}` : null,
    ticket.sujet ? `**${t('ticket.v2.sujet')}** · ${ticket.sujet}` : null,
    `**${t('ticket.v2.archive_raison')}** · ${raison ?? '—'}`,
  ].filter(Boolean).join('\n');
  const archive = C.conteneur([
    C.texte(`## ${E('tickets')} ${t('ticket.v2.archive_titre', { numero: pad(ticket.numero) })}\n${lignes}`),
    C.texte(`-# ${quand(Date.now(), 'f')}`),
  ], conf.couleurs.erreur);

  const salonLogs = cfg.ticket_logs ? guild.channels.cache.get(cfg.ticket_logs) : null;
  if (salonLogs?.isTextBased()) {
    const f = piece();
    await salonLogs.send(C.envoi([archive], { files: f ? [f] : [] })).catch((e) => logger.avertissement('Archivage ticket :', e.message));
  } else {
    const f = piece();
    await envoyerLog(guild, 'moderation', {
      color: conf.couleurs.erreur,
      title: `${t('ticket.v2.archive_titre', { numero: pad(ticket.numero) })}`,
      description: lignes,
      timestamp: new Date().toISOString(),
    }, f ? { files: [f] } : {});
  }

  // --- Copie au membre, avec la note
  if (auteur) {
    const b = cfg.ticket_banniere ? banniere('ferme', langue) : null;
    const notes = new ActionRowBuilder().addComponents([1, 2, 3, 4, 5].map((n) => new ButtonBuilder()
      .setCustomId(`ticket_note:${ticket.id}:${n}`)
      .setStyle(n >= 4 ? ButtonStyle.Success : ButtonStyle.Secondary)
      .setLabel('★'.repeat(n))));
    const mp = C.conteneur([
      b ? C.image(b.url) : null,
      C.texte(`## ${t('ticket.v2.mp_titre', { numero: pad(ticket.numero) })}\n${t('ticket.v2.mp_texte', { serveur: guild.name })}`),
      C.separateur(),
      C.texte([
        `⏱️ **${t('ticket.v2.archive_duree')}** · ${duree}`,
        raison ? `📝 **${t('ticket.v2.archive_raison')}** · ${raison}` : null,
      ].filter(Boolean).join('\n')),
      C.separateur(),
      C.texte(`### ${t('ticket.v2.mp_note_titre')}\n${t('ticket.v2.mp_note_texte')}`),
      notes,
    ], conf.couleurs.principale);
    await auteur.send(C.envoi([mp], { files: [b?.fichier(), piece()].filter(Boolean) })).catch(() => null);
  }

  await salon.send(C.avertissement(t('ticket.v2.supprime_bientot'))).catch(() => null);
  setTimeout(() => salon.delete(`Ticket #${ticket.numero}`).catch(() => null), 6000);
}

/** Fermeture depuis une interaction (bouton, fenetre, /ticket fermer). */
async function fermerTicket(interaction, raison = null) {
  const { t } = traducteur(interaction);
  const ticket = req.ticketParSalon.get(interaction.channel.id);
  if (!ticket || ticket.statut === 'ferme') return interaction.reply(C.erreurPrivee(t('ticket.v2.hors_ticket')));

  const cfg = config(interaction.guild.id);
  if (!estStaff(interaction.member, cfg) && interaction.user.id !== ticket.user_id) {
    return interaction.reply(C.erreurPrivee(t('ticket.v2.fermer_refuse')));
  }
  if (!interaction.deferred && !interaction.replied) await interaction.reply(C.info(t('ticket.v2.fermeture_en_cours')));
  return fermerCoeur({ guild: interaction.guild, salon: interaction.channel, ticket, fermePar: interaction.user, raison });
}

// --------------------------------------------------------- NOTE (EN PRIVE)
async function noter(interaction) {
  const [, id, n] = interaction.customId.split(':');
  const note = Math.min(5, Math.max(1, Number(n)));
  const ticket = q.parId.get(Number(id));
  const { t } = traducteur(ticket?.guild_id ?? null);
  if (!ticket || ticket.user_id !== interaction.user.id) return interaction.reply(C.erreurPrivee(t('erreur.pas_pour_toi')));
  if (!q.noter.run(note, ticket.id).changes) return interaction.reply(C.infoPrivee(t('ticket.v2.note_deja')));

  const neuf = interaction.message.components.map((c) => c.toJSON());
  const conteneur = neuf.find((c) => c.type === 17);
  if (conteneur) {
    conteneur.components = conteneur.components
      .filter((x) => x.type !== 1)
      .map((x) => (x.type === 10 && x.content?.includes(t('ticket.v2.mp_note_titre'))
        ? { ...x, content: `### ${t('ticket.v2.mp_note_titre')}\n${t('ticket.v2.note_merci', { etoiles: '★'.repeat(note) + '☆'.repeat(5 - note) })}` }
        : x));
  }
  await interaction.update({ components: neuf }).catch(() => interaction.reply(C.succesPrive(t('ticket.v2.note_merci', { etoiles: '★'.repeat(note) }))));

  const guild = interaction.client.guilds.cache.get(ticket.guild_id);
  if (guild) {
    await envoyerLog(guild, 'moderation', {
      color: note >= 4 ? conf.couleurs.succes : note >= 3 ? conf.couleurs.avertissement : conf.couleurs.erreur,
      description: t('ticket.v2.log_note', { numero: pad(ticket.numero), membre: `${interaction.user}`, etoiles: '★'.repeat(note) + '☆'.repeat(5 - note) }),
      timestamp: new Date().toISOString(),
    });
  }
  return null;
}

// -------------------------------------------------------------------- ROUTAGE
async function gererInteraction(interaction) {
  const { t } = traducteur(interaction);
  try {
    if (interaction.isButton() && interaction.customId.startsWith('ticket_note:')) return await noter(interaction);
    if (!interaction.guild) return null;

    // ---- Ouverture
    if (interaction.isButton() && interaction.customId === 'ticket_ouvrir') return await demanderOuverture(interaction);
    if (interaction.isStringSelectMenu() && interaction.customId === 'ticket_ouvrir_menu') {
      return await demanderOuverture(interaction, interaction.values[0]);
    }
    if (interaction.isModalSubmit() && interaction.customId.startsWith('ticket_modal_ouverture')) {
      return await ouvrirTicket(interaction, interaction.customId.split(':')[1] || null, {
        sujet: interaction.fields.getTextInputValue('sujet'),
        description: interaction.fields.getTextInputValue('description'),
      });
    }

    // ---- Dans un ticket
    const ticket = req.ticketParSalon.get(interaction.channelId);
    if (!ticket || ticket.statut === 'ferme') return interaction.reply(C.erreurPrivee(t('ticket.v2.hors_ticket')));
    const cfg = config(interaction.guild.id);
    const staff = estStaff(interaction.member, cfg);

    if (interaction.isButton() && interaction.customId === 'ticket_garder') {
      if (!staff && interaction.user.id !== ticket.user_id) return interaction.reply(C.erreurPrivee(t('erreur.pas_pour_toi')));
      q.relance.run(null, ticket.channel_id);
      return interaction.update(C.succes(t('ticket.v2.garde', { membre: `${interaction.user}` })));
    }
    if (interaction.isButton() && interaction.customId === 'ticket_fermer') {
      if (!staff && interaction.user.id !== ticket.user_id) return interaction.reply(C.erreurPrivee(t('ticket.v2.fermer_refuse')));
      return demanderRaison(interaction, ticket);
    }
    if (interaction.isModalSubmit() && interaction.customId === 'ticket_modal_fermeture') {
      return await fermerTicket(interaction, interaction.fields.getTextInputValue('raison')?.trim() || null);
    }

    if (!staff) return interaction.reply(C.erreurPrivee(t('ticket.v2.staff_seulement')));
    if (interaction.isButton() && interaction.customId === 'ticket_prendre') return await prendreEnCharge(interaction, ticket);
    if (interaction.isButton() && interaction.customId === 'ticket_liberer') return await liberer(interaction, ticket);
    if (interaction.isButton() && interaction.customId === 'ticket_transcription') return await transcription(interaction, ticket);
    if (interaction.isStringSelectMenu() && interaction.customId === 'ticket_priorite') return await changerPriorite(interaction, ticket);
    if (interaction.isUserSelectMenu() && interaction.customId === 'ticket_ajouter') return await ajouter(interaction, ticket);
  } catch (e) {
    logger.erreur(`Ticket (${interaction.customId}) :`, e);
    const r = C.erreurPrivee(t('ticket.v2.erreur'));
    if (interaction.replied || interaction.deferred) await interaction.followUp(r).catch(() => null);
    else await interaction.reply(r).catch(() => null);
  }
  return null;
}

module.exports = {
  PRIORITES,
  construirePanneau,
  construireAccueil,
  demanderOuverture,
  ouvrirTicket,
  fermerTicket,
  fermerCoeur,
  estStaff,
  surMessage,
  alerterSansReponse,
  gererInteraction,
  q,
};
