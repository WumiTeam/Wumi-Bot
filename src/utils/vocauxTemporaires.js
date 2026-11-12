const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  UserSelectMenuBuilder,
  ChannelType,
  PermissionFlagsBits,
  MessageFlags,
} = require('discord.js');
const conf = require('../../config');
const { req } = require('../database/db');
const C = require('./composants');
const logger = require('./logger');
const { E } = require('./emojis');
const { traducteur } = require('./langues');

/** Remplace les variables du modele de nom. */
function nommer(modele, membre, numero) {
  return modele
    .replaceAll('{pseudo}', membre.displayName ?? membre.user.username)
    .replaceAll('{numero}', String(numero))
    .slice(0, 100);
}

/** L'etat du salon (verrou, visibilite), lu dans ses permissions. */
function etat(salon) {
  const ow = salon.permissionOverwrites.cache.get(salon.guild.roles.everyone.id);
  return { verrouille: Boolean(ow?.deny.has(PermissionFlagsBits.Connect)), cache: Boolean(ow?.deny.has(PermissionFlagsBits.ViewChannel)) };
}

/**
 * Le panneau de controle (Components V2), poste dans le salon vocal.
 * Boutons pour les reglages, menus pour inviter, expulser, transferer.
 * Renvoie la liste de composants a envoyer.
 */
function panneauV2(salon, proprietaireId) {
  const { t } = traducteur(salon.guild);
  const { verrouille, cache } = etat(salon);
  const proprio = salon.guild.members.cache.get(proprietaireId);
  const presents = [...salon.members.values()].filter((m) => !m.user.bot);
  const liste = presents.length
    ? presents.slice(0, 15).map((m) => (m.id === proprietaireId ? `👑 ${m}` : `${m}`)).join(' · ') + (presents.length > 15 ? ` +${presents.length - 15}` : '')
    : '—';

  const boutons = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('voc_renommer').setLabel(t('vocal.p.renommer')).setEmoji(E('note')).setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('voc_limite').setLabel(t('vocal.p.places')).setEmoji(E('membres')).setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('voc_verrou').setLabel(t(verrouille ? 'vocal.p.deverrouiller' : 'vocal.p.verrouiller'))
      .setEmoji(verrouille ? E('deverrou') : E('verrou')).setStyle(verrouille ? ButtonStyle.Success : ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('voc_visibilite').setLabel(t(cache ? 'vocal.p.afficher' : 'vocal.p.cacher'))
      .setEmoji(cache ? E('oeil') : '🙈').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('voc_revendiquer').setLabel(t('vocal.p.revendiquer')).setEmoji(E('couronne')).setStyle(ButtonStyle.Primary)
  );
  const menu = (id, cle, max = 1) => new ActionRowBuilder().addComponents(
    new UserSelectMenuBuilder().setCustomId(id).setPlaceholder(t(cle)).setMinValues(1).setMaxValues(max)
  );

  const tete = `## ${E('vocal')} ${t('vocal.p.titre')}\n${t('vocal.p.proprio', { membre: `<@${proprietaireId}>` })}`;
  return [C.conteneur([
    proprio ? C.sectionVignette(tete, proprio.displayAvatarURL({ size: 128 })) : C.texte(tete),
    C.separateur(),
    C.texte([
      `${verrouille ? '🔒' : '🔓'} **${t('vocal.p.acces')}** · ${t(verrouille ? 'vocal.p.acces_ferme' : 'vocal.p.acces_ouvert')}`,
      `${cache ? '🙈' : '👁️'} **${t('vocal.p.visibilite')}** · ${t(cache ? 'vocal.p.cache' : 'vocal.p.visible')}`,
      `👥 **${t('vocal.p.places')}** · ${salon.userLimit ? `${presents.length} / ${salon.userLimit}` : t('vocal.p.illimite', { n: presents.length })}`,
      `🎧 ${liste}`,
    ].join('\n')),
    boutons,
    menu('voc_inviter', 'vocal.p.menu_inviter', 5),
    menu('voc_expulser', 'vocal.p.menu_expulser', 5),
    menu('voc_transferer', 'vocal.p.menu_transferer'),
    C.texte(`-# ${t('vocal.p.pied')}`),
  ], conf.couleurs.principale)];
}

// Compatibilite : l'ancien nom (anciens appels)
const panneau = (salon) => panneauV2(salon, req.vocalTemp.get(salon.id)?.proprietaire_id ?? salon.guild.ownerId);

/** Remet le panneau a jour apres une action (convertit un ancien panneau). */
async function rafraichir(interaction, salon) {
  const ligne = req.vocalTemp.get(salon.id);
  const composants = panneauV2(salon, ligne?.proprietaire_id);
  if (interaction.message?.flags?.has?.(MessageFlags.IsComponentsV2)) {
    if (interaction.isModalSubmit() || interaction.deferred || interaction.replied) {
      return interaction.message.edit({ components: composants }).catch(() => null);
    }
    return interaction.update({ components: composants });
  }
  // Ancien panneau (embed) : on le vide et on en poste un neuf.
  if (!interaction.deferred && !interaction.replied && !interaction.isModalSubmit()) await interaction.deferUpdate().catch(() => null);
  await interaction.message?.edit({ embeds: [], components: [] }).catch(() => null);
  return salon.send(C.envoi(composants)).catch(() => null);
}

/** Donne au membre les droits de proprietaire du salon. */
function droitsProprio(salon, id) {
  return salon.permissionOverwrites
    .edit(id, { ViewChannel: true, Connect: true, ManageChannels: true, MoveMembers: true, SendMessages: true })
    .catch(() => null);
}

/** Le membre est-il proprietaire du salon (ou moderateur) ? */
function estProprietaire(membre, salonId) {
  const ligne = req.vocalTemp.get(salonId);
  if (!ligne) return false;
  if (ligne.proprietaire_id === membre.id) return true;
  return membre.permissions.has(PermissionFlagsBits.ManageChannels);
}

// ------------------------------------------------------------------ CREATION
/** Cree un salon temporaire pour le membre qui vient de rejoindre un hub. */
async function creerPour(membre, hub) {
  const guild = membre.guild;
  const moi = guild.members.me;

  if (!moi.permissions.has(PermissionFlagsBits.ManageChannels) || !moi.permissions.has(PermissionFlagsBits.MoveMembers)) {
    logger.avertissement('Vocaux temporaires : permissions « Gérer les salons » ou « Déplacer des membres » manquantes.');
    return null;
  }

  // Un seul salon par membre a la fois
  const existant = req.vocalTempDe.get(guild.id, membre.id);
  if (existant) {
    const salonExistant = guild.channels.cache.get(existant.channel_id);
    if (salonExistant) {
      await membre.voice.setChannel(salonExistant).catch(() => null);
      return salonExistant;
    }
    req.supprimerVocalTemp.run(existant.channel_id);
  }

  const numero = req.vocauxTempGuild.all(guild.id).length + 1;
  const categorie = hub.categorie_id ? guild.channels.cache.get(hub.categorie_id) : null;
  const hubSalon = guild.channels.cache.get(hub.channel_id);

  let salon;
  try {
    salon = await guild.channels.create({
      name: nommer(hub.modele, membre, numero),
      type: ChannelType.GuildVoice,
      parent: categorie?.type === ChannelType.GuildCategory ? categorie.id : hubSalon?.parentId ?? null,
      userLimit: hub.limite_defaut || 0,
      permissionOverwrites: [
        {
          id: membre.id,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.Connect,
            PermissionFlagsBits.ManageChannels,
            PermissionFlagsBits.MoveMembers,
            PermissionFlagsBits.SendMessages,
          ],
        },
        {
          id: moi.id,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.Connect,
            PermissionFlagsBits.ManageChannels,
            PermissionFlagsBits.MoveMembers,
            PermissionFlagsBits.SendMessages,
          ],
        },
      ],
      reason: `Salon vocal temporaire de ${membre.user.tag}`,
    });
  } catch (e) {
    logger.erreur('Création du salon vocal temporaire :', e.message);
    return null;
  }

  req.creerVocalTemp.run({
    channel_id: salon.id,
    guild_id: guild.id,
    hub_id: hub.channel_id,
    proprietaire_id: membre.id,
    cree_le: Date.now(),
  });

  await membre.voice.setChannel(salon).catch(async () => {
    // Le membre a quitte entre-temps : on nettoie plutot que de laisser un salon vide
    req.supprimerVocalTemp.run(salon.id);
    await salon.delete('Le membre a quitté avant le déplacement').catch(() => null);
  });

  // Le panneau de controle est envoye dans le salon vocal lui-meme
  await salon.send(C.envoi([C.texte(`${membre}`), ...panneauV2(salon, membre.id)])).catch(() => null);

  return salon;
}

/** Supprime le salon s'il est vide, et transfere la propriete si besoin. */
async function verifierApresDepart(salon) {
  const ligne = req.vocalTemp.get(salon.id);
  if (!ligne) return;

  const restants = salon.members.filter((m) => !m.user.bot);

  if (restants.size === 0) {
    req.supprimerVocalTemp.run(salon.id);
    await salon.delete('Salon vocal temporaire vide').catch(() => null);
    return;
  }

  // Le proprietaire est parti mais il reste du monde : on passe la main
  if (!restants.has(ligne.proprietaire_id)) {
    const suivant = restants.first();
    req.changerProprietaire.run(suivant.id, salon.id);
    await droitsProprio(salon, suivant.id);
    await salon.send(C.info(traducteur(salon.guild).t('vocal.p.nouveau_proprio', { membre: `${suivant}` }))).catch(() => null);
  }
}

/** Nettoie au demarrage les salons temporaires vides ou disparus. */
async function nettoyerAuDemarrage(client) {
  const lignes = req.tousVocauxTemp.all();
  let supprimes = 0;
  for (const ligne of lignes) {
    const guild = client.guilds.cache.get(ligne.guild_id);
    const salon = guild?.channels.cache.get(ligne.channel_id);
    if (!salon) {
      req.supprimerVocalTemp.run(ligne.channel_id);
      supprimes++;
      continue;
    }
    if (salon.members.filter((m) => !m.user.bot).size === 0) {
      req.supprimerVocalTemp.run(ligne.channel_id);
      await salon.delete('Salon vocal temporaire vide au redémarrage').catch(() => null);
      supprimes++;
    }
  }
  if (supprimes) logger.info(`${supprimes} salon(s) vocal temporaire nettoyé(s) au démarrage.`);
}

// -------------------------------------------------------------------- ROUTAGE
async function gererInteraction(interaction) {
  const { t } = traducteur(interaction);
  try {
    const salon = interaction.channel;
    const ligne = req.vocalTemp.get(salon?.id);
    if (!ligne) return interaction.reply(C.erreurPrivee(t('vocal.p.plus_temporaire')));

    // ---------------------------------------------------- REVENDICATION
    if (interaction.isButton() && interaction.customId === 'voc_revendiquer') {
      if (salon.members.has(ligne.proprietaire_id)) {
        return interaction.reply(C.avertissementPrivee(t('vocal.p.proprio_present', { membre: `<@${ligne.proprietaire_id}>` })));
      }
      if (!salon.members.has(interaction.user.id)) return interaction.reply(C.erreurPrivee(t('vocal.p.dedans_pour_revendiquer')));
      req.changerProprietaire.run(interaction.user.id, salon.id);
      await droitsProprio(salon, interaction.user.id);
      await rafraichir(interaction, salon);
      return interaction.followUp(C.succes(t('vocal.p.nouveau_proprio', { membre: `${interaction.user}` }))).catch(() => null);
    }

    // Les actions suivantes sont reservees au proprietaire
    if (!estProprietaire(interaction.member, salon.id)) {
      return interaction.reply(C.erreurPrivee(t('vocal.p.proprio_seulement', { membre: `<@${ligne.proprietaire_id}>` })));
    }
    const confirmer = (cle, v) => interaction.followUp(C.succesPrive(t(cle, v))).catch(() => null);
    const everyone = salon.guild.roles.everyone.id;

    if (interaction.isButton()) {
      if (interaction.customId === 'voc_renommer') {
        return interaction.showModal(new ModalBuilder().setCustomId('voc_modal_nom').setTitle(t('vocal.p.renommer').slice(0, 45)).addComponents(
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('nom').setLabel(t('vocal.p.nouveau_nom').slice(0, 45))
            .setValue(salon.name.slice(0, 100)).setStyle(TextInputStyle.Short).setMinLength(1).setMaxLength(100).setRequired(true))
        ));
      }
      if (interaction.customId === 'voc_limite') {
        return interaction.showModal(new ModalBuilder().setCustomId('voc_modal_limite').setTitle(t('vocal.p.places').slice(0, 45)).addComponents(
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('limite').setLabel(t('vocal.p.places_aide').slice(0, 45))
            .setValue(String(salon.userLimit ?? 0)).setStyle(TextInputStyle.Short).setMaxLength(2).setRequired(true))
        ));
      }
      if (interaction.customId === 'voc_verrou') {
        const { verrouille } = etat(salon);
        await salon.permissionOverwrites.edit(everyone, { Connect: verrouille ? null : false });
        await rafraichir(interaction, salon);
        return confirmer(verrouille ? 'vocal.deverrouille' : 'vocal.verrouille');
      }
      if (interaction.customId === 'voc_visibilite') {
        const { cache } = etat(salon);
        await salon.permissionOverwrites.edit(everyone, { ViewChannel: cache ? null : false });
        await rafraichir(interaction, salon);
        return confirmer(cache ? 'vocal.affiche' : 'vocal.cache');
      }
    }

    if (interaction.isUserSelectMenu()) {
      const ids = interaction.values.filter((id) => id !== interaction.user.id);
      if (interaction.customId === 'voc_inviter') {
        for (const id of ids) await salon.permissionOverwrites.edit(id, { ViewChannel: true, Connect: true }).catch(() => null);
        await rafraichir(interaction, salon);
        if (ids.length) await salon.send(C.info(t('vocal.p.invites', { membres: ids.map((id) => `<@${id}>`).join(', ') }), { allowedMentions: { users: ids } })).catch(() => null);
        return null;
      }
      if (interaction.customId === 'voc_expulser') {
        const expulses = [];
        for (const id of ids) {
          if (id === ligne.proprietaire_id) continue;
          await salon.permissionOverwrites.edit(id, { Connect: false }).catch(() => null);
          const m = salon.members.get(id);
          if (m) await m.voice.disconnect(t('vocal.raison_expulsion', { membre: interaction.user.tag })).catch(() => null);
          expulses.push(id);
        }
        await rafraichir(interaction, salon);
        return confirmer('vocal.p.expulses', { n: expulses.length });
      }
      if (interaction.customId === 'voc_transferer') {
        const cible = interaction.values[0];
        if (!salon.members.has(cible) || salon.members.get(cible)?.user.bot) {
          await interaction.deferUpdate().catch(() => null);
          return interaction.followUp(C.erreurPrivee(t('vocal.transfert_absent'))).catch(() => null);
        }
        req.changerProprietaire.run(cible, salon.id);
        await droitsProprio(salon, cible);
        await rafraichir(interaction, salon);
        await salon.send(C.info(t('vocal.p.nouveau_proprio', { membre: `<@${cible}>` }))).catch(() => null);
        return null;
      }
    }

    if (interaction.isModalSubmit()) {
      if (interaction.customId === 'voc_modal_nom') {
        const nom = interaction.fields.getTextInputValue('nom').trim();
        await interaction.deferUpdate().catch(() => null);
        await salon.setName(nom, t('vocal.raison_renomme', { membre: interaction.user.tag }));
        await rafraichir(interaction, salon);
        return confirmer('vocal.renomme', { nom });
      }
      if (interaction.customId === 'voc_modal_limite') {
        const limite = Number.parseInt(interaction.fields.getTextInputValue('limite').trim(), 10);
        if (Number.isNaN(limite) || limite < 0 || limite > 99) return interaction.reply(C.erreurPrivee(t('vocal.p.places_invalide')));
        await interaction.deferUpdate().catch(() => null);
        await salon.setUserLimit(limite);
        await rafraichir(interaction, salon);
        return confirmer(limite === 0 ? 'vocal.places_illimitees' : 'vocal.places_limitees', { n: limite });
      }
    }
  } catch (e) {
    logger.erreur('Interaction vocal temporaire :', e);
    const reponse = C.erreurPrivee(t('vocal.p.erreur'));
    if (interaction.replied || interaction.deferred) await interaction.followUp(reponse).catch(() => null);
    else await interaction.reply(reponse).catch(() => null);
  }
  return null;
}

module.exports = {
  nommer,
  panneau,
  panneauV2,
  etat,
  estProprietaire,
  creerPour,
  verifierApresDepart,
  nettoyerAuDemarrage,
  gererInteraction,
};
