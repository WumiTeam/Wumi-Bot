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
 * L'embed de presentation poste a l'arrivee.
 *
 * Il part dans la langue par defaut du bot — le serveur n'a encore rien
 * configure, et ne peut pas avoir choisi sa langue. D'ou le petit encart
 * « Langue » : c'est la seule chose que le bot sait ne pas savoir.
 */
function embedBienvenue(guild, client) {
  const { t } = traducteur(guild);
  const manque = permissionsManquantes(guild, t);

  const embed = new EmbedBuilder()
    .setColor(conf.couleurs.principale)
    .setTitle(`${E('salut')} ${t('accueil.titre')}`)
    .setDescription(t('accueil.presentation', { bot: client.user?.username ?? 'Blueprint' }))
    .addFields(
      { name: `${E('config')} ${t('accueil.demarrer_titre')}`, value: t('accueil.demarrer_valeur') },
      { name: `${E('info')} ${t('accueil.savoir_titre')}`, value: t('accueil.savoir_valeur') },
      { name: `${E('langue')} ${t('accueil.langue_titre')}`, value: t('accueil.langue_valeur') }
    )
    .setFooter({ text: t('accueil.pied', { n: client.commandes?.size ?? 0 }) });

  if (manque.length) {
    embed.addFields({
      name: `${E('avertissement')} ${t('accueil.permissions_titre')}`,
      value: t('accueil.permissions_valeur', { liste: manque.join('**, **') }),
    });
  }

  return embed;
}

/**
 * Poste le message d'accueil. Renvoie ou il a ete envoye, ou null.
 * N'echoue jamais bruyamment : un serveur qui refuse le message n'est pas une
 * raison de casser l'arrivee du bot.
 */
async function souhaiterBienvenue(guild, client) {
  const embed = embedBienvenue(guild, client);

  const salon = salonEcrivable(guild);
  if (salon) {
    const envoye = await salon.send({ embeds: [embed] }).catch(() => null);
    if (envoye) return { ou: 'salon', salon };
  }

  // Aucun salon : le proprietaire en prive, faute de mieux.
  const proprio = await guild.fetchOwner().catch(() => null);
  if (proprio) {
    const envoye = await proprio
      .send({
        embeds: [embed],
        content: traducteur(guild).t('accueil.prive', { serveur: guild.name }),
      })
      .catch(() => null);
    if (envoye) return { ou: 'prive', proprio };
  }

  return null;
}

module.exports = { souhaiterBienvenue, embedBienvenue, salonEcrivable, permissionsManquantes };
