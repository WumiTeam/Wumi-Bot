/**
 * Panneaux du serveur support : « Propose une idée » et « Signale un bug ».
 *
 * Deux messages publies une fois (/admin panneaux suggestion | bug), chacun
 * avec une banniere et un bouton qui ouvre un formulaire :
 *
 *   - IDEE : le formulaire cree une vraie suggestion, dans le systeme de
 *     suggestions du serveur (meme salon, memes votes, meme numerotation que
 *     /suggestion envoyer). On reutilise construireEmbed()/boutons().
 *   - BUG : le rapport part dans le salon prive des rapports (reglage
 *     `bug.rapports`), avec trois boutons de statut pour le staff. Le membre
 *     recoit un MP quand son rapport change de statut.
 *
 * La langue choisie a la publication voyage dans le customId (sp_idee:en),
 * comme pour le panneau de candidatures.
 *
 * customIds : sp_idee:<l>, sp_bug:<l>, sp_m_idee:<l>, sp_m_bug:<l>,
 *             sp_st:<statut>:<auteurId>:<numero>:<l>
 */
const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  MessageFlags,
  PermissionFlagsBits,
} = require('discord.js');
const conf = require('../../config');
const C = require('./composants');
const store = require('./supportStore');
const { banniere } = require('./bannieres');
const { req, config } = require('../database/db');
const { infosNiveau } = require('./niveaux');
const { formaterDuree } = require('./outils');
const { t: tLangue, langueDe, LANGUES } = require('./langues');
const logger = require('./logger');

const langueDeLa = (guild, forcee) => (LANGUES[forcee] ? forcee : langueDe(guild?.id));
const tt = (langue) => (cle, v) => tLangue(`panneaux_support.${cle}`, langue, v);

const STATUTS = {
  confirme: { emoji: '🔍', couleur: conf.couleurs.avertissement, style: ButtonStyle.Primary },
  corrige: { emoji: '✅', couleur: conf.couleurs.succes, style: ButtonStyle.Success },
  rejete: { emoji: '✖️', couleur: 0x80869c, style: ButtonStyle.Secondary },
};

// ------------------------------------------------------------------ PANNEAUX
function panneauIdee(guild, langueForcee) {
  const langue = langueDeLa(guild, langueForcee);
  const t = tt(langue);
  const b = banniere('idee', langue);
  const conteneur = C.conteneur([
    b ? C.image(b.url, t('idee_titre')) : null,
    C.texte(`# 💡 ${t('idee_titre')}\n${t('idee_intro')}`),
    C.separateur(),
    C.texte(`### ${t('idee_comment')}\n${t('idee_etapes')}`),
    C.separateur(),
    C.texte(`### ${t('idee_conseils_titre')}\n${t('idee_conseils')}`),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`sp_idee:${langue}`).setLabel(t('idee_bouton')).setEmoji('💡').setStyle(ButtonStyle.Primary)
    ),
    C.texte(`-# ${t('idee_pied')}`),
  ], conf.couleurs.principale);
  return C.envoi([conteneur], { files: b ? [b.fichier()] : [] });
}

function panneauBug(guild, langueForcee) {
  const langue = langueDeLa(guild, langueForcee);
  const t = tt(langue);
  const b = banniere('bug', langue);
  const conteneur = C.conteneur([
    b ? C.image(b.url, t('bug_titre')) : null,
    C.texte(`# 🐞 ${t('bug_titre')}\n${t('bug_intro')}`),
    C.separateur(),
    C.texte(`### ${t('bug_comment')}\n${t('bug_etapes')}`),
    C.separateur(),
    C.texte(`### ${t('bug_bon_rapport_titre')}\n${t('bug_bon_rapport')}`),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`sp_bug:${langue}`).setLabel(t('bug_bouton')).setEmoji('🐞').setStyle(ButtonStyle.Danger)
    ),
    C.texte(`-# ${t('bug_pied')}`),
  ], conf.couleurs.erreur);
  return C.envoi([conteneur], { files: b ? [b.fichier()] : [] });
}

// ---------------------------------------------------------------- FORMULAIRES
function champ(id, label, style, max, requis = true, placeholder = null) {
  const c = new TextInputBuilder().setCustomId(id).setLabel(label.slice(0, 45)).setStyle(style).setMaxLength(max).setRequired(requis);
  if (placeholder) c.setPlaceholder(placeholder.slice(0, 100));
  return new ActionRowBuilder().addComponents(c);
}

function modalIdee(langue) {
  const t = tt(langue);
  return new ModalBuilder().setCustomId(`sp_m_idee:${langue}`).setTitle(t('idee_modal').slice(0, 45)).addComponents(
    champ('titre', t('idee_q_titre'), TextInputStyle.Short, 80, true, t('idee_ph_titre')),
    champ('idee', t('idee_q_idee'), TextInputStyle.Paragraph, 1200, true, t('idee_ph_idee')),
    champ('pourquoi', t('idee_q_pourquoi'), TextInputStyle.Paragraph, 500, false, t('idee_ph_pourquoi')),
  );
}

function modalBug(langue) {
  const t = tt(langue);
  return new ModalBuilder().setCustomId(`sp_m_bug:${langue}`).setTitle(t('bug_modal').slice(0, 45)).addComponents(
    champ('titre', t('bug_q_titre'), TextInputStyle.Short, 100, true, t('bug_ph_titre')),
    champ('commande', t('bug_q_commande'), TextInputStyle.Short, 100, false, t('bug_ph_commande')),
    champ('etapes', t('bug_q_etapes'), TextInputStyle.Paragraph, 1000, true, t('bug_ph_etapes')),
    champ('attendu', t('bug_q_attendu'), TextInputStyle.Paragraph, 600, true, t('bug_ph_attendu')),
    champ('lien', t('bug_q_lien'), TextInputStyle.Short, 300, false, t('bug_ph_lien')),
  );
}

// ------------------------------------------------------------ PUBLICATIONS
/** Cree une suggestion dans le systeme du serveur, comme /suggestion envoyer. */
async function publierIdee(interaction, langue) {
  const t = tt(langue);
  const ts = (cle, v) => tLangue(`suggestion.${cle}`, langue, v);
  const guildId = interaction.guild.id;
  const cfg = config(guildId);
  if (!cfg.suggestion_salon) return interaction.reply(C.erreurPrivee(ts('envoyer_desactive')));
  const salon = interaction.guild.channels.cache.get(cfg.suggestion_salon);
  if (!salon?.isTextBased()) return interaction.reply(C.erreurPrivee(ts('envoyer_salon_introuvable')));

  if (cfg.suggestion_niveau_min > 0) {
    const niveau = infosNiveau(req.getXp.get(guildId, interaction.user.id)?.xp ?? 0).niveau;
    if (niveau < cfg.suggestion_niveau_min) return interaction.reply(C.avertissementPrivee(ts('envoyer_niveau_requis', { n: cfg.suggestion_niveau_min, niveau })));
  }
  if (cfg.suggestion_cooldown > 0) {
    const derniere = req.derniereSuggestionDe.get(guildId, interaction.user.id)?.derniere;
    const reste = derniere ? derniere + cfg.suggestion_cooldown * 60000 - Date.now() : 0;
    if (reste > 0) return interaction.reply(C.avertissementPrivee(ts('envoyer_delai', { reste: formaterDuree(reste, langue) })));
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const titre = interaction.fields.getTextInputValue('titre').trim();
  const idee = interaction.fields.getTextInputValue('idee').trim();
  const pourquoi = interaction.fields.getTextInputValue('pourquoi')?.trim();
  // Texte ecrit par le membre : une DONNEE, jamais traduite.
  const texte = `**${titre}**\n${idee}${pourquoi ? `\n\n*${t('idee_pourquoi_label')}* ${pourquoi}` : ''}`.slice(0, 2000);

  const suggestions = require('./suggestions');
  const numero = (cfg.suggestion_compteur ?? 0) + 1;
  req.incrementerCompteurSuggestion.run(guildId);
  const info = req.creerSuggestion.run({ guild_id: guildId, numero, user_id: interaction.user.id, texte, date: Date.now() });
  const suggestion = req.suggestionParId.get(Number(info.lastInsertRowid));

  let message;
  try {
    message = await salon.send({ embeds: [suggestions.construireEmbed(suggestion, interaction.user)], components: [suggestions.boutons(suggestion)] });
  } catch (e) {
    req.supprimerSuggestion.run(suggestion.id);
    return interaction.editReply(C.erreur(ts('envoyer_publication_impossible', { erreur: e.message })));
  }
  let fil = null;
  if (cfg.suggestion_fil) fil = await message.startThread({ name: `Suggestion #${numero} · ${titre}`.slice(0, 100), autoArchiveDuration: 1440 }).catch(() => null);
  req.lierSuggestion.run(salon.id, message.id, fil?.id ?? null, suggestion.id);
  require('./missions').noter(guildId, interaction.user.id, 'suggestion', 1);

  return interaction.editReply(C.succes(t('idee_envoyee', { n: numero, lien: message.url })));
}

function boutonsStatut(auteurId, numero, langue, actuel = null) {
  const t = tt(langue);
  return new ActionRowBuilder().addComponents(
    ...Object.entries(STATUTS).map(([cle, s]) => new ButtonBuilder()
      .setCustomId(`sp_st:${cle}:${auteurId}:${numero}:${langue}`)
      .setLabel(t(`statut_${cle}`))
      .setEmoji(s.emoji)
      .setStyle(s.style)
      .setDisabled(actuel === cle))
  );
}

function carteBug({ numero, auteur, titre, commande, etapes, attendu, lien, statut, staffId, langue }) {
  const t = tt(langue);
  const s = statut ? STATUTS[statut] : null;
  const creation = Number((BigInt(auteur.id) >> 22n) + 1420070400000n);
  const lignes = [
    `### ${s ? s.emoji : '🐞'} ${t('carte_titre', { n: numero })} · ${titre}`,
    `${t('carte_auteur')} <@${auteur.id}> · \`${auteur.username}\` · \`${auteur.id}\` · <t:${Math.floor(creation / 1000)}:R>`,
    `${t('carte_statut')} **${statut ? t(`statut_${statut}`) : t('statut_nouveau')}**${staffId ? ` · <@${staffId}>` : ''}`,
  ];
  return C.conteneur([
    C.texte(lignes.join('\n')),
    C.separateur(),
    commande ? C.texte(`**${t('bug_q_commande')}**\n${commande}`) : null,
    C.texte(`**${t('bug_q_etapes')}**\n${etapes}`),
    C.texte(`**${t('bug_q_attendu')}**\n${attendu}`),
    lien ? C.texte(`**${t('bug_q_lien')}**\n${lien}`) : null,
    boutonsStatut(auteur.id, numero, langue, statut),
  ], s ? s.couleur : conf.couleurs.erreur);
}

/** Envoie le rapport dans le salon prive des rapports. */
async function publierBug(interaction, langue) {
  const t = tt(langue);
  const salonId = store.lire('bug.rapports');
  const salon = salonId ? interaction.guild.channels.cache.get(salonId) : null;
  if (!salon?.isTextBased()) return interaction.reply(C.erreurPrivee(t('bug_pas_de_salon')));

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const numero = store.lireNombre('bug.compteur') + 1;
  store.ecrire('bug.compteur', numero);
  const f = (id) => interaction.fields.getTextInputValue(id)?.trim() || null;
  const donnees = {
    numero, auteur: interaction.user, titre: f('titre'), commande: f('commande'), etapes: f('etapes'),
    attendu: f('attendu'), lien: f('lien'), statut: null, staffId: null, langue: langueDe(interaction.guild.id),
  };
  const envoye = await salon.send(C.envoi([carteBug(donnees)])).catch((e) => { logger.erreur('Rapport de bug :', e.message); return null; });
  if (!envoye) return interaction.editReply(C.erreur(t('bug_publication_impossible')));
  // On garde le texte du rapport, pour pouvoir redessiner la carte au changement de statut.
  store.ecrire(`bug.${numero}`, JSON.stringify({ ...donnees, auteur: { id: interaction.user.id, username: interaction.user.username }, langueMembre: langue }));
  return interaction.editReply(C.succes(t('bug_envoye', { n: numero })));
}

async function changerStatut(interaction, statut, auteurId, numero) {
  const tg = tt(langueDe(interaction.guild.id));
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageMessages)) {
    const staff = store.lire('ticket.staff');
    if (!staff || !interaction.member?.roles?.cache?.has(staff)) return interaction.reply(C.erreurPrivee(tg('staff_seulement')));
  }
  const brut = store.lire(`bug.${numero}`);
  if (!brut) return interaction.reply(C.erreurPrivee(tg('bug_introuvable')));
  const d = JSON.parse(brut);
  d.statut = statut;
  d.staffId = interaction.user.id;
  store.ecrire(`bug.${numero}`, JSON.stringify(d));
  await interaction.update({ components: [carteBug(d)] });

  // Le membre est prevenu, dans la langue du panneau qu'il a utilise.
  const tm = tt(d.langueMembre ?? 'fr');
  const membre = await interaction.client.users.fetch(auteurId).catch(() => null);
  await membre?.send(C.envoi([C.conteneur([
    C.texte(`### ${STATUTS[statut].emoji} ${tm(`mp_${statut}_titre`, { n: numero })}\n${tm(`mp_${statut}`, { titre: d.titre })}`),
    C.texte(`-# ${interaction.guild.name}`),
  ], STATUTS[statut].couleur)])).catch(() => null);
  return null;
}

// ---------------------------------------------------------------- ROUTAGE
async function gererInteraction(interaction) {
  const [action, ...reste] = interaction.customId.split(':');
  try {
    if (interaction.isButton()) {
      if (action === 'sp_idee') return await interaction.showModal(modalIdee(langueDeLa(interaction.guild, reste[0])));
      if (action === 'sp_bug') {
        const langue = langueDeLa(interaction.guild, reste[0]);
        if (!store.lire('bug.rapports')) return await interaction.reply(C.erreurPrivee(tt(langue)('bug_pas_de_salon')));
        return await interaction.showModal(modalBug(langue));
      }
      if (action === 'sp_st') return await changerStatut(interaction, reste[0], reste[1], Number(reste[2]));
    }
    if (interaction.isModalSubmit()) {
      if (action === 'sp_m_idee') return await publierIdee(interaction, langueDeLa(interaction.guild, reste[0]));
      if (action === 'sp_m_bug') return await publierBug(interaction, langueDeLa(interaction.guild, reste[0]));
    }
  } catch (e) {
    logger.erreur('Panneaux support :', e);
    const r = C.erreurPrivee(tt(langueDe(interaction.guild?.id))('erreur'));
    if (interaction.replied || interaction.deferred) await interaction.followUp(r).catch(() => null);
    else await interaction.reply(r).catch(() => null);
  }
  return null;
}

module.exports = { panneauIdee, panneauBug, carteBug, gererInteraction };
