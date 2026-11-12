/**
 * SANCTION RAPIDE — clic droit sur un membre ou un message › Applications.
 *
 * Un panneau prive s'ouvre : la fiche courte du membre, un menu « action »
 * (avertir, muet 10 min / 1 h / 24 h, expulser, bannir…), un menu « raison »
 * avec les motifs courants, et un bouton pour appliquer. Depuis un message,
 * le texte du message est rappele et il peut etre supprime en meme temps.
 *
 * Tout passe par sanctions.enregistrer() : meme historique, meme MP, meme
 * journal, memes paliers d'avertissements que /warn, /mute, /ban.
 *
 * L'etat du panneau (action et raison choisies) vit en memoire 15 minutes.
 * customIds : sr_act:<id>, sr_rai:<id>, sr_ok:<id>, sr_perso:<id>,
 *             sr_m:<id>, sr_sup:<id>, sr_non:<id>
 */
const crypto = require('node:crypto');
const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  PermissionFlagsBits,
} = require('discord.js');
const conf = require('../../config');
const C = require('./composants');
const { req } = require('../database/db');
const { peutSanctionner } = require('./outils');
const { enregistrer, avertissementsActifs } = require('./sanctions');
const { traducteur } = require('./langues');
const logger = require('./logger');

const DUREE_MS = 15 * 60_000;
const panneaux = new Map(); // id -> { auteur, cibleId, message, action, raison, perso, supprimer, cree }

setInterval(() => {
  const limite = Date.now() - DUREE_MS;
  for (const [id, p] of panneaux) if (p.cree < limite) panneaux.delete(id);
}, 60_000).unref?.();

const MIN = 60_000;
const ACTIONS = {
  warn: { emoji: '⚠️', perm: PermissionFlagsBits.ModerateMembers },
  mute10: { emoji: '🔇', perm: PermissionFlagsBits.ModerateMembers, duree: 10 * MIN },
  mute60: { emoji: '🔇', perm: PermissionFlagsBits.ModerateMembers, duree: 60 * MIN },
  mute1440: { emoji: '🔇', perm: PermissionFlagsBits.ModerateMembers, duree: 1440 * MIN },
  unmute: { emoji: '🔊', perm: PermissionFlagsBits.ModerateMembers },
  kick: { emoji: '👢', perm: PermissionFlagsBits.KickMembers },
  ban: { emoji: '🔨', perm: PermissionFlagsBits.BanMembers },
  ban_purge: { emoji: '🧹', perm: PermissionFlagsBits.BanMembers },
};
const RAISONS = ['spam', 'insultes', 'contenu', 'pub', 'flood', 'harcelement', 'regles'];

/** Le panneau prive. */
function vue(p, guild, t) {
  const actions = Object.entries(ACTIONS).map(([cle, a]) => ({
    label: t(`sr.action.${cle}`), value: cle, emoji: a.emoji, default: p.action === cle,
  }));
  const raisons = RAISONS.map((cle) => ({ label: t(`sr.raison.${cle}`), value: cle, default: p.raison === cle && !p.perso }));
  const actifs = avertissementsActifs(guild.id, p.cibleId).length;
  const total = req.sanctionsDe.all(guild.id, p.cibleId).length;
  const raisonTexte = p.perso ?? (p.raison ? t(`sr.raison.${p.raison}`) : null);

  const lignes = [
    `## 🛡️ ${t('sr.titre')}`,
    `<@${p.cibleId}> · \`${p.cibleId}\``,
    `-# ${t('sr.casier', { n: total, w: actifs })}`,
  ];
  const elements = [p.avatar ? C.sectionVignette(lignes.join('\n'), p.avatar) : C.texte(lignes.join('\n'))];
  if (p.message) {
    elements.push(C.separateur());
    elements.push(C.texte(`**${t('sr.message')}** · ${p.message.salon}\n> ${(p.message.texte || '📎').slice(0, 300).replace(/\n/g, '\n> ')}`));
  }
  elements.push(C.separateur());
  elements.push(new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(`sr_act:${p.id}`).setPlaceholder(t('sr.choisir_action')).addOptions(actions)));
  elements.push(new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(`sr_rai:${p.id}`).setPlaceholder(t('sr.choisir_raison')).addOptions(raisons)));
  if (raisonTexte) elements.push(C.texte(`📝 ${raisonTexte}`));
  const boutons = [
    new ButtonBuilder().setCustomId(`sr_ok:${p.id}`).setStyle(ButtonStyle.Danger).setLabel(t('sr.appliquer')).setDisabled(!p.action),
    new ButtonBuilder().setCustomId(`sr_perso:${p.id}`).setStyle(ButtonStyle.Secondary).setEmoji('✏️').setLabel(t('sr.raison_perso')),
  ];
  if (p.message) {
    boutons.push(new ButtonBuilder().setCustomId(`sr_sup:${p.id}`).setStyle(p.supprimer ? ButtonStyle.Primary : ButtonStyle.Secondary)
      .setEmoji('🗑️').setLabel(t(p.supprimer ? 'sr.supprimer_oui' : 'sr.supprimer_non')));
  }
  boutons.push(new ButtonBuilder().setCustomId(`sr_non:${p.id}`).setStyle(ButtonStyle.Secondary).setLabel(t('sr.annuler')));
  elements.push(new ActionRowBuilder().addComponents(boutons));
  return C.envoi([C.conteneur(elements, conf.couleurs.avertissement)]);
}

/** Ouvre le panneau depuis un clic droit. */
async function ouvrir(interaction, { cible, message = null }) {
  const { t } = traducteur(interaction);
  if (cible.bot && cible.id === interaction.client.user.id) return interaction.reply(C.erreurPrivee(t('sanction.soi_meme')));
  const p = {
    id: crypto.randomBytes(5).toString('hex'),
    auteur: interaction.user.id,
    cibleId: cible.id,
    avatar: cible.displayAvatarURL({ size: 128 }),
    message: message ? { id: message.id, salonId: message.channelId, salon: `${message.channel}`, texte: message.content, url: message.url } : null,
    action: null,
    raison: null,
    perso: null,
    supprimer: Boolean(message),
    cree: Date.now(),
  };
  panneaux.set(p.id, p);
  const r = vue(p, interaction.guild, t);
  return interaction.reply({ ...r, flags: r.flags | 64, allowedMentions: { parse: [] } });
}

/** Applique la sanction choisie. Renvoie le texte de compte rendu. */
async function appliquer(interaction, p, t) {
  const guild = interaction.guild;
  const a = ACTIONS[p.action];
  if (!interaction.memberPermissions.has(a.perm)) return { erreur: t('sr.pas_permission') };

  const cible = await interaction.client.users.fetch(p.cibleId);
  const membre = await guild.members.fetch(p.cibleId).catch(() => null);
  let raison = p.perso ?? (p.raison ? t(`sr.raison.${p.raison}`) : t('sanction.sans_raison'));
  if (p.message) raison = `${raison} · ${p.message.url}`;

  if (membre) {
    const cle = peutSanctionner(interaction.member, membre, guild.members.me);
    if (cle) return { erreur: t(cle) };
  } else if (!p.action.startsWith('ban')) {
    return { erreur: t('sr.absent') };
  }

  // Le message d'abord : un ban le ferait disparaitre de toute facon.
  let messageSupprime = false;
  if (p.message && p.supprimer) {
    const salon = guild.channels.cache.get(p.message.salonId);
    const m = await salon?.messages?.fetch(p.message.id).catch(() => null);
    if (m) messageSupprime = Boolean(await m.delete().catch(() => null));
  }

  const commun = { guild, cible, moderateur: interaction.user, raison };
  let id;
  let suite = '';
  switch (p.action) {
    case 'warn': {
      id = await enregistrer({ ...commun, type: 'warn' });
      const total = avertissementsActifs(guild.id, cible.id).length;
      suite = t('sr.warn_total', { n: total });
      // Paliers : memes regles que /warn.
      const palier = require('./paliers').lire(guild.id)[total];
      if (palier && membre) {
        const motif = t('warn.escalade_raison', { n: total });
        try {
          if (palier.type === 'mute' && membre.moderatable) {
            await membre.timeout(palier.duree, motif);
            await enregistrer({ guild, cible, moderateur: interaction.client.user, type: 'mute', raison: motif, duree: palier.duree });
            suite += `\n${t('warn.escalade_mute', { duree: traducteur(guild).duree(palier.duree) })}`;
          } else if (palier.type === 'kick' && membre.kickable) {
            await enregistrer({ guild, cible, moderateur: interaction.client.user, type: 'kick', raison: motif });
            await membre.kick(motif);
            suite += `\n${t('warn.escalade_kick')}`;
          } else if (palier.type === 'ban' && membre.bannable) {
            await enregistrer({ guild, cible, moderateur: interaction.client.user, type: 'ban', raison: motif });
            await membre.ban({ reason: motif });
            suite += `\n${t('warn.escalade_ban')}`;
          }
        } catch {
          suite += `\n${t('warn.escalade_impossible')}`;
        }
      }
      break;
    }
    case 'mute10':
    case 'mute60':
    case 'mute1440':
      if (!membre?.moderatable) return { erreur: t('mute.pas_moderable') };
      await membre.timeout(a.duree, `${raison} — ${interaction.user.tag}`.slice(0, 500));
      id = await enregistrer({ ...commun, type: 'mute', duree: a.duree });
      break;
    case 'unmute':
      if (!membre?.isCommunicationDisabled()) return { erreur: t('sr.pas_muet') };
      await membre.timeout(null, raison.slice(0, 500));
      id = await enregistrer({ ...commun, type: 'unmute' });
      break;
    case 'kick':
      if (!membre?.kickable) return { erreur: t('sr.pas_possible') };
      id = await enregistrer({ ...commun, type: 'kick', action: () => membre.kick(raison.slice(0, 500)) });
      break;
    case 'ban':
    case 'ban_purge':
      id = await enregistrer({
        ...commun,
        type: 'ban',
        action: () => guild.members.ban(cible.id, { reason: raison.slice(0, 500), deleteMessageSeconds: p.action === 'ban_purge' ? 86_400 : 0 }),
      });
      break;
    default:
      return { erreur: t('sr.pas_possible') };
  }
  return {
    texte: `${ACTIONS[p.action].emoji} ${t('sr.fait', { action: t(`sr.action.${p.action}`), membre: `<@${cible.id}>` })}`
      + `\n> ${raison}`
      + (suite ? `\n${suite}` : '')
      + (messageSupprime ? `\n🗑️ ${t('sr.message_supprime')}` : '')
      + `\n-# ${t('sanction.numero', { n: id })}`,
  };
}

async function gererInteraction(interaction) {
  const { t } = traducteur(interaction);
  const [action, id] = interaction.customId.split(':');
  const p = panneaux.get(id);
  if (!p) return interaction.reply(C.erreurPrivee(t('sr.expire')));
  if (p.auteur !== interaction.user.id) return interaction.reply(C.erreurPrivee(t('erreur.pas_pour_toi')));
  const maj = () => interaction.update({ ...vue(p, interaction.guild, t), allowedMentions: { parse: [] } });

  try {
    if (action === 'sr_act') { p.action = interaction.values[0]; return maj(); }
    if (action === 'sr_rai') { p.raison = interaction.values[0]; p.perso = null; return maj(); }
    if (action === 'sr_sup') { p.supprimer = !p.supprimer; return maj(); }
    if (action === 'sr_non') {
      panneaux.delete(id);
      return interaction.update(C.envoi([C.texte(`-# ${t('sr.annule')}`)]));
    }
    if (action === 'sr_perso') {
      return interaction.showModal(new ModalBuilder().setCustomId(`sr_m:${id}`).setTitle(t('sr.raison_perso').slice(0, 45)).addComponents(
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('raison').setLabel(t('sr.raison_label').slice(0, 45))
          .setStyle(TextInputStyle.Paragraph).setMaxLength(400).setRequired(true).setValue(p.perso ?? ''))
      ));
    }
    if (action === 'sr_m') {
      p.perso = interaction.fields.getTextInputValue('raison').trim();
      return maj();
    }
    if (action === 'sr_ok') {
      if (!p.action) return maj();
      await interaction.deferUpdate();
      const r = await appliquer(interaction, p, t);
      if (r.erreur) return interaction.followUp(C.erreurPrivee(r.erreur));
      panneaux.delete(id);
      return interaction.editReply({ ...C.envoi([C.conteneur([C.texte(r.texte)], conf.couleurs.succes)]), allowedMentions: { parse: [] } });
    }
  } catch (e) {
    logger.erreur(`Sanction rapide (${interaction.customId}) :`, e);
    const r = C.erreurPrivee(t('sr.erreur', { erreur: e.message }));
    if (interaction.replied || interaction.deferred) await interaction.followUp(r).catch(() => null);
    else await interaction.reply(r).catch(() => null);
  }
  return null;
}

module.exports = { ouvrir, gererInteraction, ACTIONS, RAISONS, _panneaux: panneaux };
