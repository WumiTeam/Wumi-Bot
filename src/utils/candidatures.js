const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  EmbedBuilder,
  PermissionFlagsBits,
  MessageFlags,
} = require('discord.js');
const conf = require('../../config');
const { req, config } = require('../database/db');
const { embeds, ts, tronquer } = require('./outils');
const { infosNiveau } = require('./niveaux');
const logger = require('./logger');
const { E } = require('./emojis');
const C = require('./composants');
const { banniere } = require('./bannieres');
const { t: tLangue, langueDe, LANGUES } = require('./langues');

const STATUTS = {
  attente: { cle: 'attente', get emoji() { return E('candidatures'); }, couleur: conf.couleurs.avertissement },
  acceptee: { cle: 'acceptee', get emoji() { return E('succes'); }, couleur: conf.couleurs.succes },
  refusee: { cle: 'refusee', get emoji() { return E('erreur'); }, couleur: conf.couleurs.erreur },
};

/** Langue d'une interaction de candidature : celle du panneau si connue, sinon celle du serveur. */
function langueDeLa(guild, forcee) {
  return LANGUES[forcee] ? forcee : langueDe(guild?.id);
}
const tt = (langue) => (cle, v) => tLangue(`candidature.flux.${cle}`, langue, v);

/** Questions par defaut quand aucune n'a ete definie pour un type. */
const QUESTIONS_DEFAUT = [
  { label: 'Ton âge et ton fuseau horaire', long: false },
  { label: 'Pourquoi veux-tu ce poste ?', long: true },
  { label: 'Quelle expérience as-tu ?', long: true },
];
const QUESTIONS_DEFAUT_EN = [
  { label: 'Your age and time zone', long: false },
  { label: 'Why do you want this position?', long: true },
  { label: 'What experience do you have?', long: true },
];

function lireQuestions(type, langue = 'fr') {
  const defaut = langue === 'fr' ? QUESTIONS_DEFAUT : QUESTIONS_DEFAUT_EN;
  try {
    const q = JSON.parse(type.questions || '[]');
    return Array.isArray(q) && q.length ? q.slice(0, 5) : defaut;
  } catch {
    return defaut;
  }
}

// ------------------------------------------------------------------- PANNEAU
/**
 * Le panneau de recrutement (Components V2) : banniere, postes ouverts,
 * deroule en trois etapes et menu. La langue choisie voyage dans le customId
 * du menu, puis du formulaire, jusqu'au MP de reponse.
 */
function construirePanneau(guild, langueForcee = null) {
  const langue = langueDeLa(guild, langueForcee);
  const t = tt(langue);
  const types = req.typesCandidatures.all(guild.id).filter((x) => x.ouvert);
  const b = banniere('recrutement', langue);

  if (!types.length) {
    const conteneur = C.conteneur([
      b ? C.image(b.url, t('banniere_alt')) : null,
      C.texte(`# ${t('titre')}\n${t('aucun_poste')}`),
      C.texte(`-# ${guild.name}`),
    ], conf.couleurs.principale);
    return C.envoi([conteneur], { files: b ? [b.fichier()] : [] });
  }

  const lignes = types.slice(0, 25).map((x) => {
    const niveau = x.niveau_min > 0 ? ` · ${t('niveau_requis', { n: x.niveau_min })}` : '';
    return `${x.emoji || '•'} **${x.label}**${x.description ? `\n-# ${x.description}${niveau}` : niveau ? `\n-# ${niveau.slice(3)}` : ''}`;
  }).join('\n');

  const menu = new StringSelectMenuBuilder()
    .setCustomId(`cand_choisir:${langue}`)
    .setPlaceholder(t('menu'))
    .addOptions(
      types.slice(0, 25).map((x) => ({
        label: x.label.slice(0, 100),
        value: x.cle,
        description: x.description ? x.description.slice(0, 100) : undefined,
        emoji: x.emoji || undefined,
      }))
    );

  const conteneur = C.conteneur([
    b ? C.image(b.url, t('banniere_alt')) : null,
    C.texte(`# ${t('titre')}\n${t('intro')}`),
    C.separateur(),
    C.texte(`### ${t('postes')}\n${lignes}`),
    C.separateur(),
    C.texte(`### ${t('etapes_titre')}\n${t('etapes')}`),
    C.separateur(),
    C.texte(`### ${t('profil_titre')}\n${t('profil')}`),
    new ActionRowBuilder().addComponents(menu),
    C.texte(`-# ${t('pied', { serveur: guild.name })}`),
  ], conf.couleurs.principale);

  return C.envoi([conteneur], { files: b ? [b.fichier()] : [] });
}

function boutonsDecision(candidature, langue = 'fr') {
  const t = tt(langue);
  const clos = candidature.statut !== 'attente';
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`cand_accepter:${candidature.id}`)
      .setLabel(t('accepter'))
      .setEmoji(E('succes'))
      .setStyle(ButtonStyle.Success)
      .setDisabled(clos),
    new ButtonBuilder()
      .setCustomId(`cand_refuser:${candidature.id}`)
      .setLabel(t('refuser'))
      .setEmoji(E('erreur'))
      .setStyle(ButtonStyle.Danger)
      .setDisabled(clos)
  );
}

/** Embed recapitulatif d'une candidature (cote staff, langue du serveur). */
function construireEmbed(candidature, auteur, langue = 'fr') {
  const t = tt(langue);
  const meta = STATUTS[candidature.statut] ?? STATUTS.attente;
  let reponses = [];
  try {
    reponses = JSON.parse(candidature.reponses || '[]');
  } catch {
    /* ignore */
  }

  const creation = Number((BigInt(candidature.user_id) >> 22n) + 1420070400000n);
  const embed = new EmbedBuilder()
    .setColor(meta.couleur)
    .setAuthor({
      name: auteur ? (auteur.tag ?? auteur.username) : candidature.user_id,
      iconURL: auteur?.displayAvatarURL?.() || null,
    })
    .setTitle(`${meta.emoji} ${t('carte_titre', { n: candidature.numero, poste: candidature.type_label ?? '?' })}`)
    .setDescription(t('carte_desc', {
      membre: `<@${candidature.user_id}>`,
      pseudo: auteur?.username ?? '?',
      id: candidature.user_id,
      compte: ts(creation, 'R'),
      statut: t(`statut.${meta.cle}`),
      langue: (candidature.langue ?? langue).toUpperCase(),
    }))
    .setFooter({ text: `ID ${candidature.user_id}` })
    .setTimestamp(candidature.date);

  for (const r of reponses.slice(0, 5)) {
    embed.addFields({ name: tronquer(r.question, 250), value: tronquer(r.reponse || t('sans_reponse'), 1000) });
  }

  if (candidature.statut !== 'attente' && candidature.staff_id) {
    embed.addFields({
      name: t('decision'),
      value: `${candidature.reponse || t('sans_motif')}\n-# ${t('par', { staff: `<@${candidature.staff_id}>`, quand: ts(candidature.repondu_le ?? Date.now(), 'R') })}`,
    });
  }

  return embed;
}

function estStaff(membre) {
  const cfg = config(membre.guild.id);
  if (membre.permissions.has(PermissionFlagsBits.ManageGuild)) return true;
  if (cfg.cand_role_staff && membre.roles.cache.has(cfg.cand_role_staff)) return true;
  return false;
}

// ----------------------------------------------------------------- FORMULAIRE
const prive = (embed) => ({ embeds: [embed], flags: MessageFlags.Ephemeral });

async function ouvrirFormulaire(interaction, cle, langue) {
  const t = tt(langue);
  const cfg = config(interaction.guild.id);
  const type = req.typeCandidature.get(interaction.guild.id, cle);

  if (!type || !type.ouvert) return interaction.reply(prive(embeds.erreur(t('poste_ferme'))));
  if (!cfg.cand_salon) return interaction.reply(prive(embeds.erreur(t('salon_absent'))));

  const enCours = req.candidatureEnAttenteDe.get(interaction.guild.id, interaction.user.id, cle);
  if (enCours) return interaction.reply(prive(embeds.avertissement(t('deja_en_cours', { n: enCours.numero }))));

  if (type.niveau_min > 0) {
    const ligne = req.getXp.get(interaction.guild.id, interaction.user.id);
    const niveau = infosNiveau(ligne?.xp ?? 0).niveau;
    if (niveau < type.niveau_min) {
      return interaction.reply(prive(embeds.avertissement(t('niveau_insuffisant', { requis: type.niveau_min, niveau }))));
    }
  }

  const questions = lireQuestions(type, langue);
  const modal = new ModalBuilder()
    .setCustomId(`cand_modal:${cle}:${langue}`)
    .setTitle(t('modal_titre', { poste: type.label }).slice(0, 45));

  modal.addComponents(
    ...questions.map((q, i) =>
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId(`q${i}`)
          .setLabel(tronquer(q.label, 45))
          .setStyle(q.long ? TextInputStyle.Paragraph : TextInputStyle.Short)
          .setMaxLength(q.long ? 1000 : 200)
          .setRequired(true)
      )
    )
  );

  return interaction.showModal(modal);
}

/** Enregistre la candidature et la publie dans le salon de validation. */
async function enregistrer(interaction, cle, langue) {
  const t = tt(langue);
  const guild = interaction.guild;
  const cfg = config(guild.id);
  const type = req.typeCandidature.get(guild.id, cle);
  if (!type) return interaction.reply(prive(embeds.erreur(t('poste_introuvable'))));

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const questions = lireQuestions(type, langue);
  const reponses = questions.map((q, i) => ({
    question: q.label,
    reponse: interaction.fields.getTextInputValue(`q${i}`),
  }));

  const numero = (cfg.cand_compteur ?? 0) + 1;
  req.incrementerCompteurCandidature.run(guild.id);
  const info = req.creerCandidature.run({
    guild_id: guild.id,
    numero,
    user_id: interaction.user.id,
    type_cle: cle,
    type_label: type.label,
    reponses: JSON.stringify(reponses),
    date: Date.now(),
    langue,
  });

  const candidature = req.candidatureParId.get(Number(info.lastInsertRowid));
  const salon = guild.channels.cache.get(cfg.cand_salon);
  if (!salon?.isTextBased()) return interaction.editReply({ embeds: [embeds.erreur(t('salon_introuvable'))] });

  const langueStaff = langueDe(guild.id);
  const message = await salon
    .send({
      content: cfg.cand_role_staff ? `<@&${cfg.cand_role_staff}>` : undefined,
      embeds: [construireEmbed(candidature, interaction.user, langueStaff)],
      components: [boutonsDecision(candidature, langueStaff)],
    })
    .catch((e) => {
      logger.erreur('Publication candidature :', e.message);
      return null;
    });

  if (!message) return interaction.editReply({ embeds: [embeds.erreur(t('publication_impossible'))] });

  req.lierCandidature.run(salon.id, message.id, candidature.id);

  return interaction.editReply({ embeds: [embeds.succes(t('envoyee', { n: numero, poste: type.label }))] });
}

// ------------------------------------------------------------------ DECISION
async function demanderMotif(interaction, candidatureId, statut) {
  const t = tt(langueDe(interaction.guild.id));
  const candidature = req.candidatureParId.get(Number(candidatureId));
  if (!candidature) return interaction.reply(prive(embeds.erreur(t('introuvable'))));
  if (candidature.statut !== 'attente') return interaction.reply(prive(embeds.info(t('deja_traitee'))));
  if (!estStaff(interaction.member)) return interaction.reply(prive(embeds.erreur(t('staff_seulement'))));

  const modal = new ModalBuilder()
    .setCustomId(`cand_motif:${candidature.id}:${statut}`)
    .setTitle(`${t(statut === 'acceptee' ? 'accepter' : 'refuser')} #${candidature.numero}`.slice(0, 45));

  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('motif')
        .setLabel(t('motif_label'))
        .setPlaceholder(t(statut === 'acceptee' ? 'motif_ph_accepte' : 'motif_ph_refuse'))
        .setStyle(TextInputStyle.Paragraph)
        .setMaxLength(900)
        .setRequired(false)
    )
  );

  return interaction.showModal(modal);
}

async function decider(interaction, candidatureId, statut, motif) {
  const langueStaff = langueDe(interaction.guild.id);
  const t = tt(langueStaff);
  const candidature = req.candidatureParId.get(Number(candidatureId));
  if (!candidature || candidature.statut !== 'attente') return interaction.reply(prive(embeds.erreur(t('deja_traitee'))));

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  req.repondreCandidature.run({
    id: candidature.id,
    statut,
    staff_id: interaction.user.id,
    reponse: motif || null,
    repondu_le: Date.now(),
  });

  const misAJour = req.candidatureParId.get(candidature.id);
  const auteur = await interaction.client.users.fetch(candidature.user_id).catch(() => null);
  const meta = STATUTS[statut];

  // Attribution du role si accepte
  let roleDonne = null;
  const type = req.typeCandidature.get(interaction.guild.id, candidature.type_cle);
  if (statut === 'acceptee' && type?.role_id) {
    const role = interaction.guild.roles.cache.get(type.role_id);
    const membre = await interaction.guild.members.fetch(candidature.user_id).catch(() => null);
    if (role && membre && role.editable) {
      await membre.roles.add(role, `Application #${candidature.numero} accepted`).catch(() => null);
      roleDonne = role;
    }
  }

  // Mise a jour du message d'origine
  if (misAJour.channel_id && misAJour.message_id) {
    const salon = interaction.guild.channels.cache.get(misAJour.channel_id);
    const message = await salon?.messages.fetch(misAJour.message_id).catch(() => null);
    await message
      ?.edit({ embeds: [construireEmbed(misAJour, auteur, langueStaff)], components: [boutonsDecision(misAJour, langueStaff)] })
      .catch(() => null);
  }

  // Reponse au candidat, dans la langue du panneau qu'il a utilise
  if (auteur) {
    const tc = tt(langueDeLa(interaction.guild, candidature.langue));
    const embed = new EmbedBuilder()
      .setColor(meta.couleur)
      .setTitle(`${meta.emoji} ${tc(`mp_titre_${statut}`, { poste: candidature.type_label ?? '?' })}`)
      .setDescription(motif || tc(`mp_defaut_${statut}`))
      .setFooter({ text: interaction.guild.name, iconURL: interaction.guild.iconURL() ?? undefined })
      .setTimestamp();
    if (roleDonne) embed.addFields({ name: tc('mp_role'), value: roleDonne.name });
    await auteur.send({ embeds: [embed] }).catch(() => null);
  }

  return interaction.editReply({
    embeds: [embeds.succes(t(`fait_${statut}`, { n: candidature.numero, role: roleDonne ? ` ${t('role_donne', { role: `${roleDonne}` })}` : '' }))],
  });
}

// -------------------------------------------------------------------- ROUTAGE
async function gererInteraction(interaction) {
  try {
    if (interaction.isStringSelectMenu() && interaction.customId.startsWith('cand_choisir')) {
      const langue = langueDeLa(interaction.guild, interaction.customId.split(':')[1]);
      await ouvrirFormulaire(interaction, interaction.values[0], langue);
      // Le menu revient a vide pour resservir (la banniere deja jointe reste en place).
      const { components } = construirePanneau(interaction.guild, langue);
      await interaction.message?.edit({ components }).catch(() => null);
      return;
    }

    if (interaction.isButton()) {
      const [action, id] = interaction.customId.split(':');
      if (action === 'cand_accepter') return await demanderMotif(interaction, id, 'acceptee');
      if (action === 'cand_refuser') return await demanderMotif(interaction, id, 'refusee');
    }

    if (interaction.isModalSubmit()) {
      const parties = interaction.customId.split(':');
      if (parties[0] === 'cand_modal') return await enregistrer(interaction, parties[1], langueDeLa(interaction.guild, parties[2]));
      if (parties[0] === 'cand_motif') {
        const motif = interaction.fields.getTextInputValue('motif')?.trim() || null;
        return await decider(interaction, parties[1], parties[2], motif);
      }
    }
  } catch (e) {
    logger.erreur('Interaction candidature :', e);
    const reponse = prive(embeds.erreur(tt(langueDe(interaction.guild?.id))('erreur')));
    if (interaction.replied || interaction.deferred) await interaction.followUp(reponse).catch(() => null);
    else await interaction.reply(reponse).catch(() => null);
  }
}

module.exports = {
  STATUTS,
  QUESTIONS_DEFAUT,
  QUESTIONS_DEFAUT_EN,
  lireQuestions,
  construirePanneau,
  construireEmbed,
  boutonsDecision,
  estStaff,
  gererInteraction,
};
