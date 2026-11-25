/**
 * L'arrivee du bot sur un serveur qui n'est pas le tien.
 *
 * Blueprint est un bot public : la plupart des gens qui l'ajouteront ne
 * connaissent ni son auteur ni ses commandes. Les premieres secondes decident
 * s'il reste ou s'il est retire — d'ou ce message d'accueil, et la commande
 * `/demarrer` qu'il met en avant.
 *
 * Deux precautions qui comptent sur un serveur inconnu :
 *   - on ecrit dans le PREMIER salon ou le bot a vraiment le droit d'ecrire,
 *     verifie permission par permission, pas dans le premier salon venu ;
 *   - si aucun salon ne convient, on ecrit au proprietaire en prive plutot que
 *     de rester muet.
 */
const { EmbedBuilder, ChannelType, PermissionsBitField } = require('discord.js');
const conf = require('../../config');
const { E } = require('./emojis');
const { traducteur } = require('./langues');

const NECESSAIRES = [
  PermissionsBitField.Flags.ViewChannel,
  PermissionsBitField.Flags.SendMessages,
  PermissionsBitField.Flags.EmbedLinks,
];

/**
 * Le premier salon ou le bot peut reellement ecrire un embed.
 * Le salon systeme d'abord (c'est la que Discord met ses propres messages),
 * puis les salons texte dans l'ordre du serveur.
 */
function salonEcrivable(guild) {
  const moi = guild.members.me;
  if (!moi) return null;

  const convient = (salon) =>
    salon
    && (salon.type === ChannelType.GuildText || salon.type === ChannelType.GuildAnnouncement)
    && salon.permissionsFor(moi)?.has(NECESSAIRES);

  if (convient(guild.systemChannel)) return guild.systemChannel;

  return (
    [...guild.channels.cache.values()]
      .filter(convient)
      .sort((a, b) => a.rawPosition - b.rawPosition)[0] ?? null
  );
}

/**
 * Les permissions qui manquent au bot pour fonctionner normalement.
 * Renvoie les noms tels que Discord les ecrit dans la langue du serveur : un
 * admin anglophone doit pouvoir chercher « Manage Roles » dans ses reglages,
 * pas « Gérer les rôles ».
 */
function permissionsManquantes(guild, t = null) {
  const moi = guild.members.me;
  if (!moi) return [];
  const dire = t ?? traducteur(guild).t;
  const attendues = [
    'ManageRoles', 'ManageChannels', 'KickMembers',
    'BanMembers', 'ManageMessages', 'ModerateMembers', 'ViewAuditLog',
  ];
  return attendues
    .filter((nom) => !moi.permissions.has(PermissionsBitField.Flags[nom]))
    .map((nom) => dire(`permissions.${nom}`));
}

/**
 * Le message d'arrivee (2.24, Components V2) : ce que fait Wumi, un bouton
 * qui lance /demarrer, l'essai Premium gratuit, et les liens utiles.
 * `enServeur` : false pour la version envoyee en prive au proprietaire,
 * ou le bouton de configuration ne marcherait pas (il faut un serveur).
 */
function messageBienvenue(guild, client, { enServeur = true } = {}) {
  const C = require('./composants');
  const { ButtonBuilder, ButtonStyle, ActionRowBuilder } = require('discord.js');
  const { t, langue } = traducteur(guild);
  const manque = permissionsManquantes(guild, t);
  const liens = require('./liens');
  const avatar = client.user?.displayAvatarURL({ size: 256 }) ?? null;

  const blocs = [];
  const tete = `## ${E('salut')} ${t('accueil.titre')}\n${t('accueil.presentation', { bot: client.user?.username ?? 'Wumi' })}`;
  blocs.push(avatar ? C.sectionVignette(tete, avatar) : C.texte(tete));
  blocs.push(C.separateur());
  blocs.push(C.texte(`### ${E('config')} ${t('accueil.demarrer_titre')}\n${t(enServeur ? 'accueil.demarrer_valeur' : 'accueil.prive_suite')}`));
  blocs.push(C.texte(`### ${E('info')} ${t('accueil.savoir_titre')}\n${t('accueil.savoir_valeur')}`));
  blocs.push(C.texte(`### ${E('langue')} ${t('accueil.langue_titre')}\n${t('accueil.langue_valeur')}`));
  if (manque.length) {
    blocs.push(C.texte(`### ${E('avertissement')} ${t('accueil.permissions_titre')}\n${t('accueil.permissions_valeur', { liste: manque.join('**, **') })}`));
  }

  let essaiOk = false;
  try { essaiOk = require('./essaiPremium').disponibilite(guild.id) === 'ok'; } catch { /* sans premium */ }
  if (essaiOk) blocs.push(C.texte(t('accueil.premium_ligne')));

  const rangee = new ActionRowBuilder();
  if (enServeur) {
    rangee.addComponents(new ButtonBuilder().setCustomId('dem_go_0').setLabel(t('accueil.bouton_configurer')).setEmoji('🧭').setStyle(ButtonStyle.Primary));
    if (essaiOk) rangee.addComponents(require('./essaiPremium').bouton(langue));
  }
  rangee.addComponents(new ButtonBuilder().setLabel(t('accueil.bouton_dashboard')).setStyle(ButtonStyle.Link).setURL('https://wumi.fr/dashboard'));
  if (liens.support()) rangee.addComponents(new ButtonBuilder().setLabel(t('invite.bouton_support')).setStyle(ButtonStyle.Link).setURL(liens.support()));
  blocs.push(rangee);
  blocs.push(C.texte(`-# ${t('accueil.pied', { n: client.commandes?.size ?? 0 })}`));

  return C.envoi([C.conteneur(blocs, conf.couleurs.principale)]);
}

/** Ancienne version (embed), gardee pour ce qui l'importerait encore. */
function embedBienvenue(guild, client) {
  const { t } = traducteur(guild);
  return new EmbedBuilder()
    .setColor(conf.couleurs.principale)
    .setTitle(`${E('salut')} ${t('accueil.titre')}`)
    .setDescription(t('accueil.presentation', { bot: client.user?.username ?? 'Wumi' }));
}

/**
 * 2.24 : un serveur dont la langue Discord est le francais recoit Wumi en
 * francais d'office. Seulement a l'arrivee, et seulement si personne n'a
 * encore choisi de langue (valeur par defaut).
 */
function langueAuto(guild) {
  try {
    const { config, majConfig } = require('../database/db');
    // 2.31 : toutes les langues du bot, pas seulement le francais.
    const langue = require('./langues').depuisDiscord(guild.preferredLocale);
    if (!langue || langue === 'en') return;
    if ((config(guild.id).langue ?? 'en') !== 'en') return;
    majConfig(guild.id, { langue });
  } catch {
    /* la langue reste celle par defaut */
  }
}

async function souhaiterBienvenue(guild, client) {
  langueAuto(guild);
  const salon = salonEcrivable(guild);
  if (salon) {
    const envoye = await salon.send(messageBienvenue(guild, client)).catch(() => null);
    if (envoye) return { ou: 'salon', salon };
  }

  const proprio = await guild.fetchOwner().catch(() => null);
  if (proprio) {
    const { t } = traducteur(guild);
    const msg = messageBienvenue(guild, client, { enServeur: false });
    // En Components V2, pas de `content` : la phrase d'introduction devient un bloc.
    msg.components.unshift(require('./composants').texte(t('accueil.prive', { serveur: guild.name })));
    const envoye = await proprio.send(msg).catch(() => null);
    if (envoye) return { ou: 'prive', proprio };
  }

  return null;
}

module.exports = { souhaiterBienvenue, messageBienvenue, embedBienvenue, salonEcrivable, permissionsManquantes, langueAuto };
