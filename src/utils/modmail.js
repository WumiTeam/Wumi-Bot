/**
 * MODMAIL du serveur support : parler a l'equipe en message prive.
 *
 * Un membre ecrit a Wumi en MP (ou clique « Contacter l'equipe » sur le
 * panneau du support). Apres confirmation, une conversation s'ouvre : un FIL
 * dans le salon prive du staff (reglage modmail.salon), avec la fiche du
 * membre. Ensuite :
 *   - chaque MP du membre est recopie dans le fil (✅ sous son message) ;
 *   - chaque message du staff dans le fil part en MP au membre, signe du nom
 *     de la personne qui repond (✅ ou ❌ si son MP est ferme) ;
 *   - un message qui commence par « // » reste une NOTE INTERNE (🔒) ;
 *   - le bouton « Fermer » previent le membre et archive le fil.
 *
 * Pourquoi pas un ticket ? Le membre n'a pas a etre sur le serveur support,
 * ni a trouver le bon salon : il ecrit au bot, comme a une personne.
 *
 * customIds : mm_go, mm_non, mm_ouvrir:<l>, mm_m_ouvrir:<l>, mm_fermer:<id>
 */
const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ChannelType,
} = require('discord.js');
const conf = require('../../config');
const C = require('./composants');
const store = require('./supportStore');
const fondateur = require('./fondateur');
const { db } = require('../database/db');
const { t: tLangue, LANGUES } = require('./langues');
const logger = require('./logger');

db.exec(`
CREATE TABLE IF NOT EXISTS modmail (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id   TEXT NOT NULL,
  thread_id TEXT NOT NULL,
  langue    TEXT NOT NULL DEFAULT 'fr',
  statut    TEXT NOT NULL DEFAULT 'ouvert',
  cree_le   INTEGER NOT NULL,
  ferme_le  INTEGER,
  ferme_par TEXT
);
CREATE INDEX IF NOT EXISTS idx_modmail_user ON modmail (user_id, statut);
CREATE INDEX IF NOT EXISTS idx_modmail_fil ON modmail (thread_id);
`);
// 2.41.1 : la prise en charge (« claim ») d'une conversation par le staff.
try { db.exec('ALTER TABLE modmail ADD COLUMN pris_par TEXT'); } catch { /* deja la */ }

const q = {
  ouverteDe: db.prepare("SELECT * FROM modmail WHERE user_id = ? AND statut = 'ouvert'"),
  parFil: db.prepare("SELECT * FROM modmail WHERE thread_id = ? AND statut = 'ouvert'"),
  creer: db.prepare('INSERT INTO modmail (user_id, thread_id, langue, cree_le) VALUES (?, ?, ?, ?)'),
  fermer: db.prepare("UPDATE modmail SET statut = 'ferme', ferme_le = ?, ferme_par = ? WHERE id = ?"),
  precedentes: db.prepare('SELECT COUNT(*) AS n FROM modmail WHERE user_id = ?'),
  prendre: db.prepare('UPDATE modmail SET pris_par = ? WHERE id = ?'),
};

const ATTENTE_MS = 10 * 60_000;
const DELAI_OUVERTURE_MS = 5 * 60_000;
const NOTE = '//';

// userId -> { contenu, fichiers, expire } : le premier MP, en attente de confirmation
const enAttente = new Map();
// userId -> derniere ouverture (anti-spam)
const ouvertures = new Map();

const tt = (langue) => (cle, v) => tLangue(`modmail.${cle}`, LANGUES[langue] ? langue : 'fr', v);
const langueDeLocale = (locale) => (String(locale ?? '').startsWith('fr') ? 'fr' : 'en');

function reglages() {
  // 2.40 : l'edition Modmail n'a pas /admin, son salon vient du .env.
  return {
    salon: store.lire('modmail.salon') || process.env.MODMAIL_SALON_ID || null,
    role: store.lire('modmail.role') || process.env.MODMAIL_ROLE_ID || null,
  };
}

/**
 * 2.40 : le modmail a son propre bot. Quand MODMAIL_BOT_ID est rempli dans
 * le .env de Wumi, Wumi ne prend plus de conversations : il renvoie vers ce
 * bot (une fois par heure et par personne, pour ne pas spammer).
 */
const BOT_MODMAIL = String(process.env.MODMAIL_BOT_ID ?? '').trim();
const redirige = () => /^\d{17,20}$/.test(BOT_MODMAIL) && !require('../edition').profil?.modmailSeul;
const derniersRenvois = new Map();
function messageRenvoi(prive = false) {
  const fr = tt('fr');
  const en = tt('en');
  const v = { bot: `<@${BOT_MODMAIL}>` };
  return (prive ? C.envoiPrive : C.envoi)([C.conteneur([
    C.texte(`## 📨 ${fr('renvoi_titre')}\n${fr('renvoi_texte', v)}\n\n-# 🇬🇧 ${en('renvoi_texte', v)}`),
  ], conf.couleurs.principale)]);
}

/** Le salon prive du staff ou s'ouvrent les fils, ou null. */
function boite(client) {
  // 2.30 : le salon peut etre sur un autre serveur que le support (le
  // serveur staff) : on le cherche partout ou le bot est.
  const id = reglages().salon;
  const salon = id ? client.channels.cache.get(id) : null;
  return salon && (salon.type === ChannelType.GuildText || salon.type === ChannelType.GuildAnnouncement) ? salon : null;
}

/** Pieces jointes d'un message : on les renvoie en fichiers (8 max). */
const fichiersDe = (message) => [...message.attachments.values()].slice(0, 8).map((a) => ({ attachment: a.url, name: a.name }));

/** Envoie avec les fichiers, et retombe sur des liens si l'envoi echoue. */
async function envoyerAvecFichiers(cible, charge, fichiers) {
  try {
    return await cible.send({ ...charge, files: fichiers });
  } catch (e) {
    if (!fichiers.length) throw e;
    const liens = fichiers.map((f) => f.attachment).join('\n');
    const composants = [...charge.components, C.texte(liens)];
    return cible.send({ ...charge, components: composants });
  }
}

// ---------------------------------------------------------------- PANNEAU
function panneau(guild, langueForcee) {
  const langue = LANGUES[langueForcee] ? langueForcee : 'en';
  const t = tt(langue);
  const ban = require('./bannieres').banniere('modmail', langue);
  return C.envoi([C.conteneur([
    ban ? C.image(ban.url) : null,
    C.texte(`# 📨 ${t('panneau_titre')}\n${t('panneau_intro', { bot: `<@${guild.client.user.id}>` })}`),
    C.separateur(),
    C.texte(`### ${t('panneau_comment')}\n${t('panneau_etapes')}`),
    C.separateur(),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`mm_ouvrir:${langue}`).setStyle(ButtonStyle.Primary).setEmoji('📨').setLabel(t('bouton_contacter'))
    ),
    C.texte(`-# ${t('panneau_pied')}`),
  ], conf.couleurs.principale)], { files: ban ? [ban.fichier()] : [] });
}

// ---------------------------------------------------------------- OUVERTURE
/**
 * Ouvre la conversation : le fil dans la boite du staff, la fiche du membre,
 * puis le premier message. Renvoie le fil, ou une cle d'erreur.
 */
async function ouvrir(client, user, langue, premier) {
  const salon = boite(client);
  if (!salon) return { erreur: 'indisponible' };
  if (q.ouverteDe.get(user.id)) return { erreur: 'deja' };
  if (fondateur.bloque(user.id)) return { erreur: 'bloque' };
  const derniere = ouvertures.get(user.id) ?? 0;
  if (Date.now() - derniere < DELAI_OUVERTURE_MS) return { erreur: 'trop_vite' };
  ouvertures.set(user.id, Date.now());

  const t = tt('fr'); // la fiche est pour le staff, qui lit en francais
  // La fiche decrit le membre sur le serveur SUPPORT (la boite peut etre
  // sur le serveur staff, ou il n'est pas).
  const support = client.guilds.cache.get(fondateur.serveurSupport() ?? '') ?? salon.guild;
  const membre = await support.members.fetch(user.id).catch(() => null);
  const avant = q.precedentes.get(user.id).n;
  const serveurs = client.guilds.cache.filter((g) => g.ownerId === user.id).size;

  let fil;
  try {
    fil = await salon.threads.create({
      name: `📨 ${user.username}`.slice(0, 90),
      autoArchiveDuration: 10080,
      reason: `Modmail ${user.username} (${user.id})`,
    });
  } catch (e) {
    logger.avertissement('Modmail (fil) :', e.message);
    return { erreur: 'indisponible' };
  }
  q.creer.run(user.id, fil.id, langue, Date.now());

  const { role } = reglages();
  const fiche = C.conteneur([
    C.sectionVignette(
      `## 📨 ${t('fiche_titre', { nom: user.username })}\n<@${user.id}> · \`${user.id}\``,
      user.displayAvatarURL({ size: 256 })
    ),
    C.separateur(),
    C.texte([
      `🗓️ **${t('fiche_compte')}** · <t:${Math.floor(user.createdTimestamp / 1000)}:R>`,
      `🏠 **${t('fiche_support')}** · ${membre ? t('fiche_oui', { date: `<t:${Math.floor(membre.joinedTimestamp / 1000)}:R>` }) : t('fiche_non')}`,
      // L'edition Modmail n'est que sur le support : ce compte ne voudrait rien dire.
      require('../edition').profil?.modmailSeul ? null : `👑 **${t('fiche_serveurs')}** · ${serveurs}`,
      `🗂️ **${t('fiche_precedentes')}** · ${avant}`,
      `🌐 **${t('fiche_langue')}** · ${LANGUES[langue]?.nom ?? langue}`,
    ].filter(Boolean).join('\n')),
    C.separateur(),
    C.texte(`-# ${t('fiche_aide')}`),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`mm_prendre:${user.id}`).setStyle(ButtonStyle.Primary).setEmoji('✋').setLabel(t('bouton_prendre')),
      new ButtonBuilder().setCustomId(`mm_fermer:${user.id}`).setStyle(ButtonStyle.Danger).setEmoji('🔒').setLabel(t('bouton_fermer'))
    ),
  ], conf.couleurs.principale);
  await fil.send(C.envoi([role ? C.texte(`<@&${role}>`) : null, fiche].filter(Boolean))).catch((e) => logger.avertissement('Modmail (fiche) :', e.message));

  if (premier) await relayerVersStaff(fil, user, premier.contenu, premier.fichiers);
  return { fil };
}

// ------------------------------------------------------------------ RELAIS
async function relayerVersStaff(fil, user, contenu, fichiers = []) {
  const corps = C.conteneur([
    C.texte(`**${user.username}**\n${contenu?.trim() ? contenu.slice(0, 3800) : '-# 📎'}`),
  ], conf.couleurs.info ?? conf.couleurs.principale);
  return envoyerAvecFichiers(fil, C.envoi([corps]), fichiers);
}

/** Un MP recu par Wumi. Renvoie true s'il a ete traite. */
async function surMP(message) {
  if (message.author.bot || message.system) return false;
  if (redirige()) {
    if (Date.now() - (derniersRenvois.get(message.author.id) ?? 0) < 3_600_000) return true;
    derniersRenvois.set(message.author.id, Date.now());
    await message.reply(messageRenvoi()).catch(() => null);
    return true;
  }
  const client = message.client;
  if (!reglages().salon) return false;

  const ouverte = q.ouverteDe.get(message.author.id);
  if (ouverte) {
    const fil = await client.channels.fetch(ouverte.thread_id).catch(() => null);
    if (!fil) {
      q.fermer.run(Date.now(), null, ouverte.id);
    } else {
      if (fil.archived) await fil.setArchived(false).catch(() => null);
      try {
        await relayerVersStaff(fil, message.author, message.content, fichiersDe(message));
        await message.react('✅').catch(() => null);
      } catch (e) {
        logger.avertissement('Modmail (relais membre) :', e.message);
        await message.react('❌').catch(() => null);
      }
      return true;
    }
  }

  // Pas de conversation : on demande d'abord. Les deux langues, car un MP
  // ne dit pas dans quelle langue le membre parle.
  enAttente.set(message.author.id, { contenu: message.content, fichiers: fichiersDe(message), expire: Date.now() + ATTENTE_MS });
  const fr = tt('fr');
  const en = tt('en');
  await message.reply(C.envoi([C.conteneur([
    C.texte(`## 📨 ${fr('confirmer_titre')}\n${fr('confirmer_texte')}\n\n-# 🇬🇧 ${en('confirmer_texte')}`),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('mm_go').setStyle(ButtonStyle.Primary).setEmoji('📨').setLabel(`${fr('bouton_envoyer')} · ${en('bouton_envoyer')}`),
      new ButtonBuilder().setCustomId('mm_non').setStyle(ButtonStyle.Secondary).setLabel(`${fr('bouton_annuler')} · ${en('bouton_annuler')}`)
    ),
  ], conf.couleurs.principale)])).catch(() => null);
  return true;
}

/** Un message du staff dans un fil de modmail. */
async function surMessageStaff(message) {
  if (!message.channel.isThread?.() || message.author.bot || message.system) return;
  const conversation = q.parFil.get(message.channel.id);
  if (!conversation) return;
  if (message.content.startsWith(NOTE)) {
    await message.react('🔒').catch(() => null);
    return;
  }
  const user = await message.client.users.fetch(conversation.user_id).catch(() => null);
  const t = tt(conversation.langue);
  const nom = message.member?.displayName ?? message.author.username;
  const corps = C.conteneur([
    C.texte(`**💬 ${t('reponse_de', { nom })}**\n${message.content?.trim() ? message.content.slice(0, 3800) : '-# 📎'}`),
    C.texte(`-# ${t('reponse_pied')}`),
  ], conf.couleurs.principale);
  try {
    if (!user) throw new Error('membre introuvable');
    await envoyerAvecFichiers(user, C.envoi([corps]), fichiersDe(message));
    await message.react('✅').catch(() => null);
  } catch {
    await message.react('❌').catch(() => null);
    await message.reply(C.avertissement(tt('fr')('mp_ferme'))).catch(() => null);
  }
}

// ---------------------------------------------------------------- FERMETURE
async function fermer(interaction, userId) {
  const conversation = q.ouverteDe.get(userId);
  const t = tt('fr');
  if (!conversation || conversation.thread_id !== interaction.channelId) {
    return interaction.reply(C.infoPrivee(t('deja_fermee')));
  }
  q.fermer.run(Date.now(), interaction.user.id, conversation.id);
  await interaction.reply(C.succes(t('fermee_staff', { membre: `${interaction.user}` })));

  const user = await interaction.client.users.fetch(userId).catch(() => null);
  const tm = tt(conversation.langue);
  await user?.send(C.envoi([C.conteneur([
    C.texte(`## 🔒 ${tm('fermee_titre')}\n${tm('fermee_texte')}`),
  ], conf.couleurs.principale)])).catch(() => null);

  const fil = interaction.channel;
  await fil.setLocked(true).catch(() => null);
  await fil.setArchived(true).catch(() => null);
  return null;
}

// ------------------------------------------------------- PRISE EN CHARGE
/**
 * « Prendre en charge » : un membre du staff s'occupe de la conversation.
 * Le bouton devient « Pris en charge : <nom> » (un nouveau clic de la meme
 * personne, ou d'un fondateur, la libere), le fil est renomme et le membre
 * est prevenu en MP.
 */
async function prendre(interaction, userId, liberer) {
  const conversation = q.ouverteDe.get(userId);
  const t = tt('fr');
  if (!conversation || conversation.thread_id !== interaction.channelId) {
    return interaction.reply(C.infoPrivee(t('deja_fermee')));
  }
  const actuel = conversation.pris_par;
  if (liberer) {
    if (actuel !== interaction.user.id && !fondateur.estFondateur(interaction.user.id)) {
      return interaction.reply(C.infoPrivee(t('pris_deja', { membre: `<@${actuel}>` })));
    }
    q.prendre.run(null, conversation.id);
  } else {
    if (actuel && actuel !== interaction.user.id) return interaction.reply(C.infoPrivee(t('pris_deja', { membre: `<@${actuel}>` })));
    q.prendre.run(interaction.user.id, conversation.id);
  }
  const nom = interaction.member?.displayName ?? interaction.user.username;
  // Le bouton de la fiche change d'etat (on retouche le JSON du message).
  const composants = JSON.parse(JSON.stringify(interaction.message.components.map((c) => c.toJSON())));
  const changer = (c) => {
    if (c.type === 2 && String(c.custom_id ?? '').match(/^mm_(prendre|liberer):/)) {
      c.custom_id = `${liberer ? 'mm_prendre' : 'mm_liberer'}:${userId}`;
      c.style = liberer ? ButtonStyle.Primary : ButtonStyle.Success;
      c.label = (liberer ? t('bouton_prendre') : t('bouton_pris', { nom })).slice(0, 80);
      c.emoji = { name: '✋' };
    }
    for (const enfant of c.components ?? []) changer(enfant);
    if (c.accessory) changer(c.accessory);
  };
  composants.forEach(changer);
  await interaction.update({ components: composants });
  const fil = interaction.channel;
  const membre = await interaction.client.users.fetch(userId).catch(() => null);
  const base = `📨 ${membre?.username ?? userId}`;
  await fil.setName((liberer ? base : `✋ ${nom} · ${membre?.username ?? userId}`).slice(0, 90)).catch(() => null);
  await fil.send(C.envoi([C.conteneur([C.texte(liberer ? t('libere', { membre: `${interaction.user}` }) : t('pris_staff', { membre: `${interaction.user}` }))], conf.couleurs.principale)], { allowedMentions: { parse: [] } })).catch(() => null);
  if (!liberer && membre) {
    const tm = tt(conversation.langue);
    await membre.send(C.envoi([C.conteneur([C.texte(`✋ ${tm('pris_membre', { nom })}`)], conf.couleurs.principale)])).catch(() => null);
  }
  return null;
}

// ------------------------------------------------------------- INTERACTIONS
async function gererInteraction(interaction) {
  const [action, arg] = interaction.customId.split(':');
  // Ancien panneau poste par Wumi : on renvoie vers le bot du modmail.
  if (redirige() && (action === 'mm_ouvrir' || action === 'mm_go')) {
    return interaction.reply(messageRenvoi(true));
  }
  try {
    if (action === 'mm_prendre' || action === 'mm_liberer') return prendre(interaction, arg, action === 'mm_liberer');
    if (action === 'mm_non') {
      enAttente.delete(interaction.user.id);
      return interaction.update(C.envoi([C.conteneur([C.texte(`-# ${tt(langueDeLocale(interaction.locale))('annule')}`)], conf.couleurs.principale)]));
    }

    if (action === 'mm_go') {
      const langue = langueDeLocale(interaction.locale);
      const t = tt(langue);
      const premier = enAttente.get(interaction.user.id);
      enAttente.delete(interaction.user.id);
      if (!premier || premier.expire < Date.now()) {
        return interaction.update(C.envoi([C.conteneur([C.texte(t('expire'))], conf.couleurs.avertissement)]));
      }
      await interaction.deferUpdate();
      const r = await ouvrir(interaction.client, interaction.user, langue, premier);
      return interaction.editReply(C.envoi([C.conteneur([
        C.texte(r.erreur ? `⚠️ ${t(`erreur_${r.erreur}`)}` : `## ✅ ${t('ouverte_titre')}\n${t('ouverte_texte')}`),
      ], r.erreur ? conf.couleurs.avertissement : conf.couleurs.succes)]));
    }

    if (action === 'mm_ouvrir') {
      const t = tt(arg);
      const modal = new ModalBuilder().setCustomId(`mm_m_ouvrir:${arg}`).setTitle(t('modal_titre').slice(0, 45)).addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('message').setLabel(t('modal_message').slice(0, 45)).setStyle(TextInputStyle.Paragraph)
            .setRequired(true).setMinLength(5).setMaxLength(2000).setPlaceholder(t('modal_aide').slice(0, 100))
        )
      );
      if (q.ouverteDe.get(interaction.user.id)) return interaction.reply(C.infoPrivee(t('erreur_deja')));
      return interaction.showModal(modal);
    }

    if (action === 'mm_m_ouvrir') {
      const t = tt(arg);
      await interaction.deferReply({ flags: 64 });
      const texte = interaction.fields.getTextInputValue('message');
      // Le membre doit pouvoir recevoir les reponses : on verifie ses MP d'abord.
      const essai = await interaction.user.send(C.envoi([C.conteneur([
        C.texte(`## 📨 ${t('ouverte_titre')}\n${t('ouverte_texte')}\n\n> ${texte.slice(0, 500).replace(/\n/g, '\n> ')}`),
      ], conf.couleurs.succes)])).catch(() => null);
      if (!essai) return interaction.editReply(C.erreur(t('erreur_mp')));
      const r = await ouvrir(interaction.client, interaction.user, arg, { contenu: texte, fichiers: [] });
      if (r.erreur) {
        await essai.delete().catch(() => null);
        return interaction.editReply(C.avertissement(t(`erreur_${r.erreur}`)));
      }
      return interaction.editReply(C.succes(t('ouverte_mp')));
    }

    if (action === 'mm_fermer') return fermer(interaction, arg);
  } catch (e) {
    logger.erreur(`Modmail (${interaction.customId}) :`, e);
    const r = C.erreurPrivee(tt('fr')('erreur_indisponible'));
    if (interaction.replied || interaction.deferred) await interaction.followUp(r).catch(() => null);
    else await interaction.reply(r).catch(() => null);
  }
  return null;
}

module.exports = { panneau, ouvrir, surMP, surMessageStaff, fermer, gererInteraction, reglages, q, _enAttente: enAttente, _ouvertures: ouvertures };
