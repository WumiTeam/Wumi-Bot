/**
 * La blocklist communautaire : les membres signales d'un serveur a l'autre.
 *
 * LE CHEMIN
 *   1. Un administrateur, sur n'importe quel serveur, propose un membre avec
 *      `/blocklist proposer`.
 *   2. La proposition arrive dans un salon d'examen du serveur support, avec
 *      deux boutons.
 *   3. Le staff du support approuve ou refuse. Lui seul.
 *   4. Si c'est approuve, la fiche est publiee dans un salon public : pseudo,
 *      identifiant, raison.
 *   5. Les serveurs qui l'ont demande recoivent une alerte quand cette
 *      personne les rejoint. Le bot ne sanctionne jamais tout seul.
 *
 * POURQUOI L'ETAPE 3 EXISTE
 * Publier l'identifiant de quelqu'un avec une accusation, c'est une accusation
 * publique. N'importe qui pourrait s'en servir pour regler un compte. Rien
 * n'est publie sans qu'un humain du support l'ait lu et valide, le nom du
 * proposant est enregistre, celui de l'approbateur aussi, et une fiche se
 * retire.
 *
 * POURQUOI LE BOT NE BANNIT PAS
 * Une seule proposition approuvee a tort ferait bannir quelqu'un sur des
 * dizaines de serveurs d'un coup, sans recours. Le bot PREVIENT le staff ; le
 * staff decide. C'est plus lent, et c'est le but.
 */
const {
  EmbedBuilder,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  PermissionFlagsBits,
  MessageFlags,
} = require('discord.js');
const conf = require('../../config');
const { config, req } = require('../database/db');
const { embeds, tronquer, ts } = require('./outils');
const { E } = require('./emojis');
const fondateur = require('./fondateur');
const logger = require('./logger');

// Un proposant ne peut pas deposer plus de cinq fiches par heure : sans ca,
// une seule personne remplirait le salon d'examen.
const MAX_PAR_HEURE = 5;

/** Le salon d'examen du support, ou null. */
function salonExamen(client) {
  const support = fondateur.serveurSupport();
  if (!support) return null;
  const guild = client.guilds.cache.get(support);
  if (!guild) return null;
  const id = config(support).bl_salon_examen;
  return id ? guild.channels.cache.get(id) ?? null : null;
}

/** Le salon public du support, ou null. */
function salonPublic(client) {
  const support = fondateur.serveurSupport();
  if (!support) return null;
  const guild = client.guilds.cache.get(support);
  if (!guild) return null;
  const id = config(support).bl_salon_public;
  return id ? guild.channels.cache.get(id) ?? null : null;
}

/** Cette personne est-elle sur la liste ? Renvoie la fiche la plus recente. */
function fiche(cibleId) {
  return req.blocklistDe.all(String(cibleId))[0] ?? null;
}

/** L'embed d'examen, celui que voit le staff du support. */
function embedExamen(ligne, client) {
  const embed = new EmbedBuilder()
    .setColor(conf.couleurs.avertissement)
    .setTitle(`${E('drapeau')} Proposition #${ligne.id}`)
    .addFields(
      { name: 'Membre visé', value: `${ligne.cible_pseudo ?? 'inconnu'}\n\`${ligne.cible_id}\``, inline: true },
      { name: 'Proposé par', value: `<@${ligne.propose_par}>\n\`${ligne.propose_par}\``, inline: true },
      {
        name: 'Depuis le serveur',
        value: client.guilds.cache.get(ligne.propose_guild)?.name ?? `\`${ligne.propose_guild ?? '?'}\``,
        inline: true,
      },
      { name: 'Raison', value: tronquer(ligne.raison, 1000) }
    )
    .setFooter({ text: "Rien n'est publié tant que personne n'a approuvé." })
    .setTimestamp(ligne.date);

  if (ligne.preuve) embed.addFields({ name: 'Preuve', value: tronquer(ligne.preuve, 300) });

  // Un habitue des propositions, ca se remarque : on le dit.
  const dejaPropose = req.proposeesRecemment.get(String(ligne.propose_par), 0).n;
  if (dejaPropose > 1) {
    embed.addFields({ name: 'À savoir', value: `Cette personne a déjà proposé **${dejaPropose}** fiche(s).` });
  }

  return embed;
}

/** Les deux boutons d'examen. */
function boutonsExamen(id) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`bl_ok_${id}`)
      .setLabel('Approuver et publier')
      .setStyle(ButtonStyle.Danger)
      .setEmoji(E('succes')),
    new ButtonBuilder()
      .setCustomId(`bl_non_${id}`)
      .setLabel('Refuser')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji(E('erreur'))
  );
}

/** L'embed publie, celui que tout le monde peut lire. */
function embedPublic(ligne) {
  return new EmbedBuilder()
    .setColor(conf.couleurs.erreur)
    .setTitle(`${E('avertissement')} Membre signalé`)
    .addFields(
      { name: 'Pseudo', value: ligne.cible_pseudo ?? 'inconnu', inline: true },
      { name: 'Identifiant', value: `\`${ligne.cible_id}\``, inline: true },
      { name: 'Raison', value: tronquer(ligne.raison, 1000) }
    )
    .setFooter({ text: `Fiche #${ligne.id} · vérifiée par le staff · /blocklist verifier pour consulter` })
    .setTimestamp();
}

/**
 * Depose une proposition et l'envoie a l'examen.
 * @returns {Promise<{ok: boolean, raison?: string, id?: number}>}
 */
async function proposer(interaction, client, { cible, cibleId, raison, preuve }) {
  const support = fondateur.serveurSupport();
  if (!support) return { ok: false, raison: "Le serveur support du bot n'est pas configuré : la blocklist est indisponible." };

  const salon = salonExamen(client);
  if (!salon) return { ok: false, raison: "Le salon d'examen n'est pas configuré sur le serveur support." };

  // Deja en attente ? Inutile d'empiler.
  if (req.blocklistEnAttente.get(String(cibleId))) {
    return { ok: false, raison: 'Cette personne a déjà une proposition en attente d\'examen.' };
  }
  const dejaLa = fiche(cibleId);
  if (dejaLa) return { ok: false, raison: `Cette personne est déjà sur la liste (fiche #${dejaLa.id}).` };

  // Les gens qu'on ne peut pas proposer.
  if (cibleId === interaction.user.id) return { ok: false, raison: 'On ne se propose pas soi-même.' };
  if (fondateur.estFondateur(cibleId)) return { ok: false, raison: 'Cette personne ne peut pas être proposée.' };
  if (cible?.bot) return { ok: false, raison: 'Les bots ne vont pas sur la blocklist.' };

  const recentes = req.proposeesRecemment.get(String(interaction.user.id), Date.now() - 3_600_000).n;
  if (recentes >= MAX_PAR_HEURE) {
    return { ok: false, raison: `Tu as déjà proposé ${recentes} fiches cette heure-ci. Reviens plus tard.` };
  }

  const info = req.proposerBlocklist.run({
    cible_id: String(cibleId),
    cible_pseudo: cible?.tag ?? cible?.username ?? null,
    raison: tronquer(raison, 1000),
    preuve: preuve ? tronquer(preuve, 300) : null,
    propose_par: interaction.user.id,
    propose_guild: interaction.guild.id,
    date: Date.now(),
  });
  const id = Number(info.lastInsertRowid);
  const ligne = req.blocklistParId.get(id);

  try {
    const envoye = await salon.send({ embeds: [embedExamen(ligne, client)], components: [boutonsExamen(id)] });
    req.majMessageBlocklist.run(envoye.id, id);
  } catch (e) {
    logger.erreur('Blocklist : envoi a l\'examen impossible :', e.message);
    return { ok: false, raison: "La proposition n'a pas pu être transmise au staff. Réessaie plus tard." };
  }

  logger.action('Proposition blocklist', interaction.user.username, interaction.guild?.name, `cible ${cibleId}`);
  return { ok: true, id };
}

/** Les boutons d'examen. Route depuis interactionCreate via « bl_ ». */
async function gererInteraction(interaction, client) {
  const [, action, brut] = interaction.customId.split('_');
  const id = Number(brut);
  const ligne = req.blocklistParId.get(id);
  if (!ligne) {
    return interaction.reply({ embeds: [embeds.erreur('Cette fiche n\'existe plus.')], flags: MessageFlags.Ephemeral });
  }

  // Le verrou : seul le staff du serveur support tranche. Le bouton vit dans
  // un salon du support, mais un salon peut etre ouvert par erreur — on
  // verifie la permission, on ne la suppose pas.
  if (!fondateur.estSupport(interaction.guild?.id)
    || !interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
    return interaction.reply({
      embeds: [embeds.erreur('Seul le staff du serveur support peut approuver ou refuser une fiche.')],
      flags: MessageFlags.Ephemeral,
    });
  }

  if (ligne.statut !== 'attente') {
    return interaction.reply({
      embeds: [embeds.avertissement(`Cette fiche a déjà été traitée (**${ligne.statut}**).`)],
      flags: MessageFlags.Ephemeral,
    });
  }

  // ------------------------------------------------------------- REFUS
  if (action === 'non') {
    req.traiterBlocklist.run({
      id, statut: 'refuse', motif: null, par: interaction.user.id, date: Date.now(), public_id: null,
    });
    const embed = EmbedBuilder.from(embedExamen(ligne, client))
      .setColor(conf.couleurs.info)
      .setTitle(`${E('erreur')} Proposition #${id} — refusée`)
      .setFooter({ text: `Refusée par ${interaction.user.tag ?? interaction.user.username}` });
    return interaction.update({ embeds: [embed], components: [] });
  }

  // --------------------------------------------------------- APPROBATION
  const salon = salonPublic(client);
  if (!salon) {
    return interaction.reply({
      embeds: [embeds.erreur("Le salon public n'est pas configuré : `/config blocklist salon-public:#…`")],
      flags: MessageFlags.Ephemeral,
    });
  }

  let publie = null;
  try {
    publie = await salon.send({ embeds: [embedPublic(ligne)] });
  } catch (e) {
    return interaction.reply({
      embeds: [embeds.erreur(`Publication impossible : ${e.message}`)],
      flags: MessageFlags.Ephemeral,
    });
  }

  req.traiterBlocklist.run({
    id, statut: 'approuve', motif: null, par: interaction.user.id, date: Date.now(), public_id: publie.id,
  });

  const embed = EmbedBuilder.from(embedExamen(ligne, client))
    .setColor(conf.couleurs.erreur)
    .setTitle(`${E('succes')} Proposition #${id} — approuvée et publiée`)
    .setFooter({ text: `Approuvée par ${interaction.user.tag ?? interaction.user.username}` });

  logger.action('Blocklist approuvee', interaction.user.username, interaction.guild?.name, `fiche #${id}`);
  return interaction.update({ embeds: [embed], components: [] });
}

/**
 * Prevenir un serveur qu'un membre de la liste vient d'arriver.
 * Le bot ne sanctionne pas : il pose l'information devant le staff.
 */
async function alerterArrivee(membre) {
  let cfg;
  try {
    cfg = config(membre.guild.id);
  } catch {
    return false;
  }
  if (!cfg.bl_alerte) return false;

  const f = fiche(membre.id);
  if (!f) return false;

  const embed = new EmbedBuilder()
    .setColor(conf.couleurs.erreur)
    .setAuthor({
      name: `${E('avertissement')} Membre signalé sur la blocklist`,
      iconURL: membre.user.displayAvatarURL() || undefined,
    })
    .setDescription(`<@${membre.id}> (\`${membre.id}\`) vient de rejoindre le serveur.`)
    .addFields(
      { name: 'Raison de la fiche', value: tronquer(f.raison, 500) },
      { name: 'Fiche', value: `#${f.id} · publiée ${ts(f.traite_le ?? f.date, 'R')}`, inline: true }
    )
    .setFooter({ text: "Le bot n'a rien fait : c'est à vous de décider." })
    .setTimestamp();

  try {
    await require('./logs').envoyerLog(membre.guild, 'moderation', embed);
    return true;
  } catch (e) {
    logger.debug('Alerte blocklist :', e.message);
    return false;
  }
}

module.exports = {
  proposer,
  gererInteraction,
  alerterArrivee,
  fiche,
  embedPublic,
  embedExamen,
  salonExamen,
  salonPublic,
  MAX_PAR_HEURE,
};
