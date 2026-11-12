/**
 * /embed — composer un beau message sans rien coder (Components V2).
 *
 *   creer      ouvre l'editeur (vide, ou depuis un modele) et publie
 *   modifier   reprend un message deja publie par le bot (lien du message)
 *   modeles    liste et supprime les modeles du serveur
 *
 * Le message : banniere en haut, titre et texte (avec une vignette a droite
 * si on veut), jusqu'a 5 sections titrees, une image en bas, un pied de page,
 * jusqu'a 5 boutons lien, et un role a mentionner au-dessus.
 *
 * L'editeur est un APERCU prive, exactement le message final, avec les
 * commandes dessous. Les brouillons sont en base (24 h) : un redemarrage du
 * bot ne fait plus rien perdre. Chaque message publie garde sa recette, pour
 * que /embed modifier le rouvre a l'identique.
 *
 * Un message publie AVANT la 2.13 (ancien embed) se modifie toujours, et
 * reste au format embed : Discord ne permet pas de convertir un message.
 *
 * customIds : emb_<action>:<brouillon>
 */
const crypto = require('node:crypto');
const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  InteractionContextType,
  ChannelType,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  RoleSelectMenuBuilder,
  StringSelectMenuBuilder,
} = require('discord.js');
const conf = require('../../../config');
const C = require('../../utils/composants');
const { db } = require('../../database/db');
const { traducteur, localisations, t: tr, DEFAUT } = require('../../utils/langues');

db.exec(`
CREATE TABLE IF NOT EXISTS embed_brouillons (
  id      TEXT PRIMARY KEY,
  auteur  TEXT NOT NULL,
  donnees TEXT NOT NULL,
  cree_le INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS embed_modeles (
  guild_id TEXT NOT NULL,
  nom      TEXT NOT NULL,
  donnees  TEXT NOT NULL,
  auteur   TEXT,
  cree_le  INTEGER NOT NULL,
  PRIMARY KEY (guild_id, nom)
);
CREATE TABLE IF NOT EXISTS embed_publies (
  message_id TEXT PRIMARY KEY,
  guild_id   TEXT NOT NULL,
  donnees    TEXT NOT NULL
);
`);

const q = {
  lire: db.prepare('SELECT * FROM embed_brouillons WHERE id = ?'),
  ecrire: db.prepare('INSERT OR REPLACE INTO embed_brouillons (id, auteur, donnees, cree_le) VALUES (?, ?, ?, ?)'),
  effacer: db.prepare('DELETE FROM embed_brouillons WHERE id = ?'),
  purger: db.prepare('DELETE FROM embed_brouillons WHERE cree_le < ?'),
  modeles: db.prepare('SELECT nom, auteur, cree_le FROM embed_modeles WHERE guild_id = ? ORDER BY nom'),
  modele: db.prepare('SELECT * FROM embed_modeles WHERE guild_id = ? AND nom = ?'),
  sauverModele: db.prepare('INSERT OR REPLACE INTO embed_modeles (guild_id, nom, donnees, auteur, cree_le) VALUES (?, ?, ?, ?, ?)'),
  supprimerModele: db.prepare('DELETE FROM embed_modeles WHERE guild_id = ? AND nom = ?'),
  compterModeles: db.prepare('SELECT COUNT(*) AS n FROM embed_modeles WHERE guild_id = ?'),
  publie: db.prepare('SELECT donnees FROM embed_publies WHERE message_id = ?'),
  noterPublie: db.prepare('INSERT OR REPLACE INTO embed_publies (message_id, guild_id, donnees) VALUES (?, ?, ?)'),
};

const DUREE_MS = 24 * 3_600_000;
const MAX_BOUTONS = 5;
const MAX_SECTIONS = 5;
const MAX_MODELES = 25;

setInterval(() => {
  try { q.purger.run(Date.now() - DUREE_MS); } catch { /* base fermee */ }
}, 30 * 60_000).unref?.();

// ------------------------------------------------------------------ OUTILS
function couleur(texte) {
  if (!texte) return null;
  const m = String(texte).trim().replace(/^#/, '').match(/^[0-9a-f]{6}$/i);
  return m ? parseInt(m[0], 16) : undefined; // undefined = invalide
}

const urlValide = (u) => /^https:\/\/\S{4,}$/i.test(String(u ?? '').trim());
const hex = (c) => (c !== null && c !== undefined ? `#${c.toString(16).padStart(6, '0')}` : '');

/** Les champs d'un message, et rien d'autre (un modele vient de la base). */
function vierge() {
  return { titre: null, description: null, couleur: null, banniere: null, vignette: null, image: null, pied: null, sections: [], boutons: [], role: null };
}
function contenuDe(b) {
  const { titre, description, couleur: c, banniere, vignette, image, pied, sections, boutons, role } = b;
  return { titre, description, couleur: c, banniere, vignette, image, pied, sections, boutons, role };
}

/** Modeles livres avec Wumi : un bon point de depart, a adapter. */
function modelesIntegres(t) {
  return {
    'wumi:annonce': { ...vierge(), titre: t('emb.m_annonce_titre'), description: t('emb.m_annonce_texte'), couleur: 0x66bcff, pied: t('emb.m_annonce_pied') },
    'wumi:regles': {
      ...vierge(), titre: t('emb.m_regles_titre'), description: t('emb.m_regles_texte'), couleur: 0xdce3ff,
      sections: [1, 2, 3, 4].map((n) => ({ titre: t(`emb.m_regles_s${n}_titre`), texte: t(`emb.m_regles_s${n}_texte`) })),
      pied: t('emb.m_regles_pied'),
    },
    'wumi:evenement': {
      ...vierge(), titre: t('emb.m_event_titre'), description: t('emb.m_event_texte'), couleur: 0xffbe50,
      sections: [{ titre: t('emb.m_event_s1_titre'), texte: t('emb.m_event_s1_texte') }, { titre: t('emb.m_event_s2_titre'), texte: t('emb.m_event_s2_texte') }],
    },
  };
}

// ------------------------------------------------------------------ RENDU
/** Le message final, en Components V2. */
function rendu(b) {
  const tete = [b.titre ? `## ${b.titre}` : null, b.description].filter(Boolean).join('\n');
  const elements = [
    b.banniere ? C.image(b.banniere) : null,
    tete ? (b.vignette ? C.sectionVignette(tete, b.vignette) : C.texte(tete)) : (b.vignette ? C.sectionVignette('​', b.vignette) : null),
  ];
  for (const s of b.sections) {
    elements.push(C.separateur());
    elements.push(C.texte([s.titre ? `### ${s.titre}` : null, s.texte].filter(Boolean).join('\n')));
  }
  if (b.image) elements.push(C.image(b.image));
  if (b.boutons.length) {
    elements.push(new ActionRowBuilder().addComponents(b.boutons.map((x) => {
      const bouton = new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel(x.label).setURL(x.url);
      if (x.emoji) bouton.setEmoji(x.emoji);
      return bouton;
    })));
  }
  if (b.pied) elements.push(C.texte(`-# ${b.pied}`));
  const liste = [];
  if (b.role) liste.push(C.texte(b.role === 'everyone' ? '@everyone' : `<@&${b.role}>`));
  liste.push(C.conteneur(elements, b.couleur ?? conf.couleurs.principale));
  return liste;
}

/** Les mentions autorisees : uniquement le role choisi. */
function mentions(b) {
  if (!b.role) return { parse: [] };
  if (b.role === 'everyone') return { parse: ['everyone'] };
  return { parse: [], roles: [b.role] };
}

/** Ancien format, pour les messages publies avant la 2.13. */
function construireEmbed(b) {
  const e = new EmbedBuilder().setColor(b.couleur ?? conf.couleurs.principale);
  if (b.titre) e.setTitle(b.titre);
  if (b.description) e.setDescription(b.description);
  if (b.image || b.banniere) e.setImage(b.image ?? b.banniere);
  if (b.vignette) e.setThumbnail(b.vignette);
  if (b.pied) e.setFooter({ text: b.pied });
  if (b.sections?.length) e.addFields(b.sections.map((s) => ({ name: s.titre || '​', value: s.texte || '​' })));
  return e;
}
function rangeeBoutons(b) {
  if (!b.boutons.length) return [];
  return [new ActionRowBuilder().addComponents(b.boutons.map((x) => new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel(x.label).setURL(x.url)))];
}

/** L'editeur : l'apercu exact, puis les commandes. */
function editeur(b, t) {
  const salon = `<#${b.cible?.channelId ?? b.channelId}>`;
  const entete = C.texte(`-# ✏️ ${t(b.cible ? 'emb.apercu_modif' : 'emb.apercu', { salon })}${b.cible?.ancien ? ` · ${t('emb.ancien_format')}` : ''}`);
  const commandes = [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`emb_pub:${b.id}`).setStyle(ButtonStyle.Success).setEmoji('📤').setLabel(t(b.cible ? 'emb.bouton_mettre_a_jour' : 'emb.bouton_publier')),
      new ButtonBuilder().setCustomId(`emb_mod:${b.id}`).setStyle(ButtonStyle.Primary).setEmoji('✏️').setLabel(t('emb.bouton_texte')),
      new ButtonBuilder().setCustomId(`emb_img:${b.id}`).setStyle(ButtonStyle.Primary).setEmoji('🖼️').setLabel(t('emb.bouton_images')),
      new ButtonBuilder().setCustomId(`emb_ann:${b.id}`).setStyle(ButtonStyle.Danger).setLabel(t('emb.bouton_annuler'))
    ),
    new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder().setCustomId(`emb_plus:${b.id}`).setPlaceholder(t('emb.menu_plus')).addOptions([
        { label: t('emb.plus_section'), value: 'section', emoji: '➕', description: t('emb.plus_section_aide', { n: b.sections.length, max: MAX_SECTIONS }) },
        { label: t('emb.plus_bouton'), value: 'bouton', emoji: '🔗', description: t('emb.plus_bouton_aide', { n: b.boutons.length, max: MAX_BOUTONS }) },
        { label: t('emb.retirer_section'), value: 'moins_section', emoji: '➖' },
        { label: t('emb.retirer_bouton'), value: 'moins_bouton', emoji: '✂️' },
        { label: t('emb.sans_mention'), value: 'sans_role', emoji: '🔕' },
        { label: t('emb.sauver_modele'), value: 'modele', emoji: '💾', description: t('emb.sauver_modele_aide') },
      ])
    ),
  ];
  if (!b.cible?.ancien) {
    commandes.push(new ActionRowBuilder().addComponents(
      new RoleSelectMenuBuilder().setCustomId(`emb_role:${b.id}`).setPlaceholder(b.role ? t('emb.role_choisi') : t('emb.role_menu')).setMinValues(0).setMaxValues(1)
    ));
  }
  const apercu = b.cible?.ancien
    ? [C.conteneur([C.texte([b.titre ? `**${b.titre}**` : null, b.description].filter(Boolean).join('\n').slice(0, 3900))], b.couleur ?? conf.couleurs.principale)]
    : rendu(b);
  return C.envoi([entete, ...apercu, ...commandes], { allowedMentions: { parse: [] } });
}

/** Une reponse neuve doit etre privee ; une mise a jour garde ses drapeaux. */
const prive = (x) => ({ ...x, flags: x.flags | 64 });

// ------------------------------------------------------------------ FENETRES
function champ(t, id, style, max, valeur, requis = false) {
  const c = new TextInputBuilder().setCustomId(id).setLabel(t(`emb.champ_${id}`).slice(0, 45)).setStyle(style).setMaxLength(max).setRequired(requis);
  if (valeur) c.setValue(String(valeur).slice(0, max));
  const aide = t(`emb.aide_${id}`);
  if (aide && aide !== `emb.aide_${id}`) c.setPlaceholder(aide.slice(0, 100));
  return new ActionRowBuilder().addComponents(c);
}

const fenetreTexte = (b, t) => new ModalBuilder().setCustomId(`emb_m_texte:${b.id}`).setTitle(t('emb.fenetre_titre').slice(0, 45)).addComponents(
  champ(t, 'titre', TextInputStyle.Short, 256, b.titre),
  champ(t, 'description', TextInputStyle.Paragraph, 3500, b.description),
  champ(t, 'couleur', TextInputStyle.Short, 7, hex(b.couleur)),
  champ(t, 'pied', TextInputStyle.Short, 500, b.pied)
);
const fenetreImages = (b, t) => new ModalBuilder().setCustomId(`emb_m_img:${b.id}`).setTitle(t('emb.fenetre_images').slice(0, 45)).addComponents(
  champ(t, 'banniere', TextInputStyle.Short, 500, b.banniere),
  champ(t, 'vignette', TextInputStyle.Short, 500, b.vignette),
  champ(t, 'image', TextInputStyle.Short, 500, b.image)
);
const fenetreSection = (b, t) => new ModalBuilder().setCustomId(`emb_m_section:${b.id}`).setTitle(t('emb.fenetre_section').slice(0, 45)).addComponents(
  champ(t, 'section_titre', TextInputStyle.Short, 200, null),
  champ(t, 'section_texte', TextInputStyle.Paragraph, 1500, null, true)
);
const fenetreBouton = (b, t) => new ModalBuilder().setCustomId(`emb_m_bouton:${b.id}`).setTitle(t('emb.lien_titre').slice(0, 45)).addComponents(
  champ(t, 'lien_label', TextInputStyle.Short, 80, null, true),
  champ(t, 'lien_url', TextInputStyle.Short, 500, null, true),
  champ(t, 'lien_emoji', TextInputStyle.Short, 60, null)
);
const fenetreModele = (b, t) => new ModalBuilder().setCustomId(`emb_m_modele:${b.id}`).setTitle(t('emb.fenetre_modele').slice(0, 45)).addComponents(
  champ(t, 'modele_nom', TextInputStyle.Short, 40, null, true)
);

// ------------------------------------------------------------------ BROUILLONS
function sauver(b) {
  q.ecrire.run(b.id, b.auteur, JSON.stringify(b), b.cree);
}
function brouillon(id, interaction) {
  const ligne = q.lire.get(id);
  if (!ligne || ligne.auteur !== interaction.user.id || ligne.cree_le < Date.now() - DUREE_MS) return null;
  try { return JSON.parse(ligne.donnees); } catch { return null; }
}

/** Lit un modele (du serveur ou livre avec Wumi), nettoye. */
function chargerModele(guildId, nom, t) {
  if (nom.startsWith('wumi:')) return modelesIntegres(t)[nom] ?? null;
  const ligne = q.modele.get(guildId, nom);
  if (!ligne) return null;
  try { return { ...vierge(), ...contenuDe(JSON.parse(ligne.donnees)) }; } catch { return null; }
}

// ------------------------------------------------------------------ COMMANDE
module.exports = {
  categorie: 'utilitaires',
  _interne: { couleur, urlValide, construireEmbed, rendu, vierge, modelesIntegres },

  data: new SlashCommandBuilder()
    .setName('embed')
    .setDescription(tr('emb.description_commande', DEFAUT))
    .setDescriptionLocalizations(localisations('emb.description_commande'))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .setContexts(InteractionContextType.Guild)
    .addSubcommand((s) => s
      .setName('create')
      .setNameLocalizations({ fr: 'creer' })
      .setDescription(tr('emb.sous_creer', DEFAUT))
      .setDescriptionLocalizations(localisations('emb.sous_creer'))
      .addChannelOption((o) => o
        .setName('channel')
        .setNameLocalizations({ fr: 'salon' })
        .setDescription(tr('emb.opt_salon', DEFAUT))
        .setDescriptionLocalizations(localisations('emb.opt_salon'))
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement))
      .addStringOption((o) => o
        .setName('template')
        .setNameLocalizations({ fr: 'modele' })
        .setDescription(tr('emb.opt_modele', DEFAUT))
        .setDescriptionLocalizations(localisations('emb.opt_modele'))
        .setAutocomplete(true)))
    .addSubcommand((s) => s
      .setName('edit')
      .setNameLocalizations({ fr: 'modifier' })
      .setDescription(tr('emb.sous_modifier', DEFAUT))
      .setDescriptionLocalizations(localisations('emb.sous_modifier'))
      .addStringOption((o) => o
        .setName('link')
        .setNameLocalizations({ fr: 'lien' })
        .setDescription(tr('emb.opt_lien', DEFAUT))
        .setDescriptionLocalizations(localisations('emb.opt_lien'))
        .setRequired(true)))
    .addSubcommand((s) => s
      .setName('templates')
      .setNameLocalizations({ fr: 'modeles' })
      .setDescription(tr('emb.sous_modeles', DEFAUT))
      .setDescriptionLocalizations(localisations('emb.sous_modeles'))
      .addStringOption((o) => o
        .setName('delete')
        .setNameLocalizations({ fr: 'supprimer' })
        .setDescription(tr('emb.opt_supprimer_modele', DEFAUT))
        .setDescriptionLocalizations(localisations('emb.opt_supprimer_modele'))
        .setAutocomplete(true))),

  async autocomplete(interaction) {
    const { t } = traducteur(interaction);
    const saisie = String(interaction.options.getFocused() ?? '').toLowerCase();
    const sous = interaction.options.getSubcommand();
    const perso = q.modeles.all(interaction.guild.id).map((m) => ({ name: `💾 ${m.nom}`, value: m.nom }));
    const integres = sous === 'create'
      ? Object.keys(modelesIntegres(t)).map((cle) => ({ name: `✨ ${t(`emb.modele_${cle.slice(5)}`)}`, value: cle }))
      : [];
    return interaction.respond([...integres, ...perso].filter((m) => m.name.toLowerCase().includes(saisie)).slice(0, 25));
  },

  async execute(interaction) {
    const { t } = traducteur(interaction);
    const sous = interaction.options.getSubcommand();

    if (sous === 'templates') {
      const nom = interaction.options.getString('delete');
      if (nom) {
        const ok = q.supprimerModele.run(interaction.guild.id, nom).changes > 0;
        return interaction.reply(ok ? C.succesPrive(t('emb.modele_supprime', { nom })) : C.erreurPrivee(t('emb.modele_introuvable')));
      }
      const liste = q.modeles.all(interaction.guild.id);
      return interaction.reply(C.envoiPrive([C.conteneur([
        C.texte(`## 💾 ${t('emb.modeles_titre')}`),
        C.texte(liste.length
          ? liste.map((m) => `• **${m.nom}**${m.auteur ? ` · <@${m.auteur}>` : ''} · <t:${Math.floor(m.cree_le / 1000)}:R>`).join('\n')
          : t('emb.modeles_vide')),
        C.texte(`-# ${t('emb.modeles_pied', { n: liste.length, max: MAX_MODELES })}`),
      ], conf.couleurs.principale)]));
    }

    const b = {
      id: crypto.randomBytes(6).toString('hex'),
      auteur: interaction.user.id,
      guildId: interaction.guild.id,
      channelId: interaction.options.getChannel('channel')?.id ?? interaction.channel.id,
      ...vierge(),
      cible: null,
      cree: Date.now(),
    };

    if (sous === 'edit') {
      const m = interaction.options.getString('link').match(/channels\/(\d+)\/(\d+)\/(\d+)/);
      if (!m || m[1] !== interaction.guild.id) return interaction.reply(C.erreurPrivee(t('emb.lien_invalide')));
      const salon = interaction.guild.channels.cache.get(m[2]);
      const message = salon?.isTextBased() ? await salon.messages.fetch(m[3]).catch(() => null) : null;
      if (!message) return interaction.reply(C.erreurPrivee(t('emb.introuvable')));
      if (message.author.id !== interaction.client.user.id) return interaction.reply(C.erreurPrivee(t('emb.pas_a_moi')));
      const recette = q.publie.get(message.id);
      if (recette) {
        Object.assign(b, contenuDe({ ...vierge(), ...JSON.parse(recette.donnees) }), { channelId: salon.id, cible: { channelId: salon.id, messageId: message.id } });
      } else if (message.embeds.length) {
        const e = message.embeds[0];
        Object.assign(b, {
          channelId: salon.id,
          titre: e.title ?? null,
          description: e.description ?? null,
          couleur: e.color ?? null,
          image: e.image?.url ?? null,
          vignette: e.thumbnail?.url ?? null,
          pied: e.footer?.text ?? null,
          sections: (e.fields ?? []).slice(0, MAX_SECTIONS).map((f) => ({ titre: f.name === '​' ? null : f.name, texte: f.value })),
          boutons: message.components.flatMap((r) => r.components ?? []).filter((c) => c.url).slice(0, MAX_BOUTONS).map((c) => ({ label: c.label, url: c.url })),
          cible: { channelId: salon.id, messageId: message.id, ancien: true },
        });
      } else {
        return interaction.reply(C.erreurPrivee(t('emb.pas_a_moi')));
      }
      sauver(b);
      return interaction.reply(prive(editeur(b, t)));
    }

    // Creer : depuis un modele, on montre directement l'apercu ; sinon la fenetre.
    const nomModele = interaction.options.getString('template');
    if (nomModele) {
      const modele = chargerModele(interaction.guild.id, nomModele, t);
      if (!modele) return interaction.reply(C.erreurPrivee(t('emb.modele_introuvable')));
      Object.assign(b, modele);
      sauver(b);
      return interaction.reply(prive(editeur(b, t)));
    }
    sauver(b);
    return interaction.showModal(fenetreTexte(b, t));
  },

  async gererInteraction(interaction) {
    const { t } = traducteur(interaction);
    const [action, id] = interaction.customId.split(':');
    const b = brouillon(id, interaction);
    if (!b) return interaction.reply(C.erreurPrivee(t('emb.expire')));
    const v = (c) => interaction.fields.getTextInputValue(c)?.trim() || null;
    // Une fenetre ouverte depuis l'editeur le met a jour ; sinon on le cree.
    const afficher = () => {
      sauver(b);
      return interaction.message ? interaction.update(editeur(b, t)) : interaction.reply(prive(editeur(b, t)));
    };

    if (action === 'emb_mod') return interaction.showModal(fenetreTexte(b, t));
    if (action === 'emb_img') return interaction.showModal(fenetreImages(b, t));

    if (action === 'emb_m_texte') {
      const coul = couleur(v('couleur'));
      if (coul === undefined) return interaction.reply(C.erreurPrivee(t('emb.couleur_invalide')));
      if (!v('titre') && !v('description') && !b.sections.length && !b.banniere && !b.image) return interaction.reply(C.erreurPrivee(t('emb.vide')));
      Object.assign(b, { titre: v('titre'), description: v('description'), couleur: coul, pied: v('pied') });
      return afficher();
    }
    if (action === 'emb_m_img') {
      for (const c of ['banniere', 'vignette', 'image']) {
        if (v(c) && !urlValide(v(c))) return interaction.reply(C.erreurPrivee(t('emb.image_invalide')));
      }
      Object.assign(b, { banniere: v('banniere'), vignette: v('vignette'), image: v('image') });
      return afficher();
    }
    if (action === 'emb_m_section') {
      if (b.sections.length >= MAX_SECTIONS) return interaction.reply(C.erreurPrivee(t('emb.max_sections', { max: MAX_SECTIONS })));
      b.sections.push({ titre: v('section_titre'), texte: v('section_texte') });
      return afficher();
    }
    if (action === 'emb_m_bouton') {
      const url = v('lien_url');
      if (!urlValide(url)) return interaction.reply(C.erreurPrivee(t('emb.url_invalide')));
      if (b.boutons.length >= MAX_BOUTONS) return interaction.reply(C.erreurPrivee(t('emb.max_boutons', { max: MAX_BOUTONS })));
      // Emoji : un emoji Unicode court, ou un emoji du serveur <:nom:id>.
      const emoji = v('lien_emoji');
      const emojiOk = emoji && (/^<a?:\w{2,32}:\d{17,20}>$/.test(emoji) || [...emoji].length <= 4) ? emoji : null;
      b.boutons.push({ label: v('lien_label'), url, emoji: emojiOk });
      return afficher();
    }
    if (action === 'emb_m_modele') {
      const nom = v('modele_nom').replace(/^wumi:/i, '');
      if (!q.modele.get(b.guildId, nom) && q.compterModeles.get(b.guildId).n >= MAX_MODELES) {
        return interaction.reply(C.erreurPrivee(t('emb.modeles_plein', { max: MAX_MODELES })));
      }
      q.sauverModele.run(b.guildId, nom, JSON.stringify(contenuDe(b)), interaction.user.id, Date.now());
      return interaction.reply(C.succesPrive(t('emb.modele_sauve', { nom })));
    }

    if (action === 'emb_role') {
      const role = interaction.values[0] ?? null;
      b.role = role === interaction.guild.id ? 'everyone' : role;
      if (b.role && b.role !== 'everyone') {
        const r = interaction.guild.roles.cache.get(b.role);
        if (r && !r.mentionable && !interaction.memberPermissions.has(PermissionFlagsBits.MentionEveryone)) {
          return interaction.reply(C.erreurPrivee(t('emb.role_pas_mentionnable', { role: r.name })));
        }
      }
      if (b.role === 'everyone' && !interaction.memberPermissions.has(PermissionFlagsBits.MentionEveryone)) {
        return interaction.reply(C.erreurPrivee(t('emb.everyone_refuse')));
      }
      return afficher();
    }

    if (action === 'emb_plus') {
      const choix = interaction.values[0];
      if (choix === 'section') {
        if (b.sections.length >= MAX_SECTIONS) return interaction.reply(C.erreurPrivee(t('emb.max_sections', { max: MAX_SECTIONS })));
        return interaction.showModal(fenetreSection(b, t));
      }
      if (choix === 'bouton') {
        if (b.boutons.length >= MAX_BOUTONS) return interaction.reply(C.erreurPrivee(t('emb.max_boutons', { max: MAX_BOUTONS })));
        return interaction.showModal(fenetreBouton(b, t));
      }
      if (choix === 'modele') return interaction.showModal(fenetreModele(b, t));
      if (choix === 'moins_section') b.sections.pop();
      if (choix === 'moins_bouton') b.boutons.pop();
      if (choix === 'sans_role') b.role = null;
      return afficher();
    }

    if (action === 'emb_ann') {
      q.effacer.run(b.id);
      return interaction.update(C.envoi([C.texte(t('emb.annule'))]));
    }

    // ----------------------------------------------------------- PUBLIER
    if (action === 'emb_pub') {
      if (!b.titre && !b.description && !b.sections.length && !b.banniere && !b.image) return interaction.reply(C.erreurPrivee(t('emb.vide')));
      const salon = interaction.guild.channels.cache.get(b.cible?.channelId ?? b.channelId);
      if (!salon) return interaction.reply(C.erreurPrivee(t('emb.salon_disparu')));
      const moi = salon.permissionsFor(interaction.guild.members.me);
      if (!moi?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks])) {
        return interaction.reply(C.erreurPrivee(t('emb.droits_bot', { salon: `${salon}` })));
      }
      if (!salon.permissionsFor(interaction.member)?.has(PermissionFlagsBits.SendMessages)) {
        return interaction.reply(C.erreurPrivee(t('emb.droits_toi', { salon: `${salon}` })));
      }
      let message;
      try {
        if (b.cible?.ancien) {
          message = await salon.messages.fetch(b.cible.messageId);
          await message.edit({ embeds: [construireEmbed(b)], components: rangeeBoutons(b), allowedMentions: { parse: [] } });
        } else if (b.cible) {
          message = await salon.messages.fetch(b.cible.messageId);
          await message.edit(C.envoi(rendu(b), { allowedMentions: { parse: [] } }));
        } else {
          message = await salon.send(C.envoi(rendu(b), { allowedMentions: mentions(b) }));
        }
      } catch (e) {
        return interaction.reply(C.erreurPrivee(t('emb.impossible', { erreur: e.message })));
      }
      if (!b.cible?.ancien) q.noterPublie.run(message.id, b.guildId, JSON.stringify(contenuDe(b)));
      q.effacer.run(b.id);
      return interaction.update(C.envoi([C.texte(t(b.cible ? 'emb.mis_a_jour' : 'emb.publie', { lien: message.url }))]));
    }
    return null;
  },
};
