/**
 * Les liens du bot : l'invitation, le serveur support, top.gg, le site.
 *
 * Tout passe par ici pour une raison simple : un lien d'invitation se
 * fabrique a partir de l'identifiant de l'application et d'un nombre de
 * permissions. Recopier ce nombre a la main dans trois commandes, c'est se
 * garantir qu'un jour les trois ne diront plus la meme chose.
 *
 * LES PERMISSIONS DEMANDEES
 * On demande ce dont le bot se sert vraiment, et rien de plus. Pas
 * d'Administrateur : un serveur inconnu a toutes les raisons de refuser un bot
 * qui reclame les pleins pouvoirs, et Blueprint n'en a pas besoin.
 */
const { PermissionsBitField } = require('discord.js');

const F = PermissionsBitField.Flags;

/** Ce que le bot utilise, fonction par fonction. */
const PERMISSIONS = [
  // Lire et ecrire : le minimum vital.
  'ViewChannel', 'SendMessages', 'EmbedLinks', 'AttachFiles', 'ReadMessageHistory',
  'AddReactions', 'UseExternalEmojis',
  // Fils : suggestions, tickets.
  'SendMessagesInThreads', 'CreatePublicThreads', 'ManageThreads',
  // Roles de niveau, boutique, salons de stats et vocaux temporaires.
  'ManageRoles', 'ManageChannels', 'ManageNicknames',
  // Moderation.
  'ManageMessages', 'KickMembers', 'BanMembers', 'ModerateMembers', 'ViewAuditLog',
  // Vocal : XP en vocal, salons temporaires, musique.
  'Connect', 'Speak', 'MoveMembers', 'MuteMembers', 'DeafenMembers',
];

/** Le nombre que Discord attend dans l'URL. */
function bits() {
  let total = 0n;
  for (const nom of PERMISSIONS) if (F[nom]) total |= F[nom];
  return total.toString();
}

/** L'identifiant de l'application : celui du bot connecte, sinon le .env. */
function identifiant(client) {
  return client?.user?.id ?? (String(process.env.CLIENT_ID ?? '').trim() || null);
}

/**
 * Le lien d'invitation.
 * `scope=bot applications.commands` : sans le second, le bot rejoint le
 * serveur mais aucune de ses commandes n'y apparait — c'est l'erreur la plus
 * courante quand on fabrique ce lien a la main.
 */
function invitation(client, { permissions = true } = {}) {
  const id = identifiant(client);
  if (!id) return null;
  // %20 et non « + » pour l'espace entre les deux scopes : les deux sont
  // acceptes, mais c'est la forme que Discord ecrit dans sa documentation, et
  // un lien qu'on peut recopier tel quel dans un navigateur vaut mieux qu'un
  // lien « qui devrait marcher ».
  const morceaux = [
    `client_id=${encodeURIComponent(id)}`,
    'scope=bot%20applications.commands',
  ];
  if (permissions) morceaux.push(`permissions=${bits()}`);
  return `https://discord.com/oauth2/authorize?${morceaux.join('&')}`;
}

/** Le serveur support, si une invitation est renseignee dans le .env. */
function support() {
  const brut = String(process.env.SUPPORT_INVITE ?? '').trim();
  if (!brut) return null;
  // On accepte « discord.gg/abc », « https://discord.gg/abc » ou juste « abc ».
  if (/^https?:\/\//i.test(brut)) return brut;
  if (/^discord\.gg\//i.test(brut)) return `https://${brut}`;
  return `https://discord.gg/${brut.replace(/^\/+/, '')}`;
}

/** Le site du bot, s'il y en a un. */
function site() {
  const brut = String(process.env.SITE_URL ?? '').trim();
  if (!brut) return null;
  return /^https?:\/\//i.test(brut) ? brut : `https://${brut}`;
}

module.exports = { invitation, support, site, bits, identifiant, PERMISSIONS };
