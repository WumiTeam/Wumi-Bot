/**
 * Photographies de la structure du serveur.
 *
 * On enregistre ce qui se reconstruit : roles, salons, categories, permissions
 * et quelques reglages du serveur. On n'enregistre PAS les messages ni les
 * membres — ce n'est pas une copie du serveur, c'est un plan pour le remonter.
 *
 * La restauration ne supprime jamais rien : supprimer un salon detruirait ses
 * messages pour toujours, et une fausse manoeuvre couterait plus cher que le
 * probleme qu'on repare. Elle recree ce qui manque et remet en place ce qui a
 * change ; ce qui a ete ajoute depuis la photo est signale, jamais efface.
 */
const { ChannelType, PermissionsBitField } = require('discord.js');
const { req, config } = require('../database/db');
const logger = require('./logger');

const VERSION = 1;

// Types de salons qu'on sait recreer. Les fils vivent et meurent avec leurs
// messages : les remonter n'aurait pas de sens.
const TYPES = new Set([
  ChannelType.GuildText,
  ChannelType.GuildVoice,
  ChannelType.GuildCategory,
  ChannelType.GuildAnnouncement,
  ChannelType.GuildStageVoice,
  ChannelType.GuildForum,
  ChannelType.GuildMedia,
]);

const NOM_TYPE = {
  [ChannelType.GuildText]: 'textuel',
  [ChannelType.GuildVoice]: 'vocal',
  [ChannelType.GuildCategory]: 'catégorie',
  [ChannelType.GuildAnnouncement]: 'annonces',
  [ChannelType.GuildStageVoice]: 'conférence',
  [ChannelType.GuildForum]: 'forum',
  [ChannelType.GuildMedia]: 'galerie',
};

const nomType = (t) => NOM_TYPE[t] ?? `type ${t}`;

/**
 * Un champ de permissions en chaine de caracteres.
 * Les valeurs Discord depassent 2^53 : on les garde en texte, jamais en
 * nombre, sinon les permissions hautes seraient arrondies et perdues.
 */
function champ(permissions) {
  try {
    return (permissions?.bitfield ?? permissions ?? 0n).toString();
  } catch {
    return '0';
  }
}

// ------------------------------------------------------------------ CAPTURE

/** Permissions d'un salon, triees pour que deux photos se comparent bien. */
function permissions(salon) {
  return [...salon.permissionOverwrites.cache.values()]
    .map((p) => ({
      id: p.id,
      type: p.type, // 0 = role, 1 = membre
      allow: champ(p.allow),
      deny: champ(p.deny),
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

/**
 * Photographie le serveur.
 * @param {import('discord.js').Guild} guild
 */
function capturer(guild) {
  const roles = [...guild.roles.cache.values()]
    .filter((r) => r.id !== guild.id) // @everyone est traite a part
    .sort((a, b) => b.position - a.position)
    .map((r) => ({
      id: r.id,
      nom: r.name,
      couleur: r.hexColor,
      position: r.position,
      permissions: champ(r.permissions),
      separe: r.hoist,
      mentionnable: r.mentionable,
      // Un role "gere" appartient a un bot ou au boost : Discord refuse qu'on
      // le recree ou le modifie. On le note pour la comparaison, sans plus.
      gere: r.managed,
    }));

  const salons = [...guild.channels.cache.values()]
    .filter((c) => TYPES.has(c.type))
    .sort((a, b) => a.rawPosition - b.rawPosition)
    .map((c) => ({
      id: c.id,
      nom: c.name,
      type: c.type,
      parent: c.parentId ?? null,
      position: c.rawPosition,
      sujet: c.topic ?? null,
      nsfw: c.nsfw ?? false,
      lenteur: c.rateLimitPerUser ?? 0,
      bitrate: c.bitrate ?? null,
      limite: c.userLimit ?? null,
      permissions: permissions(c),
    }));

  return {
    version: VERSION,
    date: Date.now(),
    serveur: {
      nom: guild.name,
      // @everyone porte les permissions de base de tout le serveur : c'est la
      // ligne la plus souvent cassee, et la plus penible a retrouver.
      everyone: champ(guild.roles.everyone?.permissions),
      verification: guild.verificationLevel,
      notifications: guild.defaultMessageNotifications,
      filtreMedias: guild.explicitContentFilter,
      salonAfk: guild.afkChannelId ?? null,
      delaiAfk: guild.afkTimeout ?? null,
      salonSysteme: guild.systemChannelId ?? null,
      salonRegles: guild.rulesChannelId ?? null,
    },
    roles,
    salons,
  };
}

/** Photographie et enregistre. */
function enregistrer(guild, { nom = null, auteurId = null, automatique = false } = {}) {
  const contenu = capturer(guild);
  const info = req.ajouterStructure.run({
    guild_id: guild.id,
    nom: nom || (automatique ? 'Automatique' : 'Manuelle'),
    contenu: JSON.stringify(contenu),
    version: VERSION,
    auteur_id: auteurId,
    automatique: automatique ? 1 : 0,
    nb_roles: contenu.roles.length,
    nb_salons: contenu.salons.length,
    cree_le: contenu.date,
  });
  purger(guild.id);
  return { id: Number(info.lastInsertRowid), contenu };
}

/** Ne garde que les N photos les plus recentes. */
function purger(guildId) {
  let max = 10;
  try {
    max = Math.max(1, config(guildId).structure_max || 10);
  } catch {
    /* config illisible : on garde la valeur par defaut */
  }
  req.purgerStructures.run(guildId, guildId, max);
}

/** Liste des photos, sans leur contenu. */
function lister(guildId, limite = 25) {
  return req.structures.all(guildId, limite);
}

/** Une photo, contenu decode. Renvoie null si elle est illisible. */
function charger(id, guildId) {
  const ligne = req.structure.get(Number(id), guildId);
  if (!ligne) return null;
  try {
    return { ...ligne, contenu: JSON.parse(ligne.contenu) };
  } catch (e) {
    logger.avertissement('Photo de structure illisible :', e.message);
    return null;
  }
}

function supprimer(id, guildId) {
  return req.supprimerStructure.run(Number(id), guildId).changes > 0;
}

// -------------------------------------------------------------- COMPARAISON

/**
 * Liste des permissions qui different entre deux jeux d'overwrites.
 * On compare par cible (role ou membre), pas par position dans la liste.
 */
function permissionsDifferentes(avant, apres) {
  const carte = new Map(apres.map((p) => [p.id, p]));
  const differences = [];
  for (const p of avant) {
    const a = carte.get(p.id);
    if (!a) differences.push({ id: p.id, quoi: 'disparue' });
    else if (a.allow !== p.allow || a.deny !== p.deny) differences.push({ id: p.id, quoi: 'modifiee' });
    carte.delete(p.id);
  }
  for (const id of carte.keys()) differences.push({ id, quoi: 'ajoutee' });
  return differences;
}

/**
 * Compare une photo au serveur d'aujourd'hui.
 * Ne modifie rien : c'est la lecture qu'on consulte avant de reparer.
 */
function comparer(photo, guild) {
  const actuel = capturer(guild);

  const rolesActuels = new Map(actuel.roles.map((r) => [r.id, r]));
  const parNomActuel = new Map(actuel.roles.map((r) => [r.nom.toLowerCase(), r]));
  const vus = new Set();

  const roles = { manquants: [], renommes: [], permissions: [], apparences: [], ajoutes: [] };
  for (const r of photo.roles) {
    // Un role retrouve par son identifiant est le meme role ; sinon on tente
    // le nom, car un role recree a un identifiant tout neuf.
    const a = rolesActuels.get(r.id) ?? parNomActuel.get(r.nom.toLowerCase());
    if (!a) {
      if (!r.gere) roles.manquants.push(r);
      continue;
    }
    vus.add(a.id);
    if (a.nom !== r.nom) roles.renommes.push({ avant: r.nom, apres: a.nom, id: a.id });
    if (a.permissions !== r.permissions) roles.permissions.push({ nom: a.nom, id: a.id });
    if (a.couleur !== r.couleur || a.separe !== r.separe || a.mentionnable !== r.mentionnable) {
      roles.apparences.push({ nom: a.nom, id: a.id });
    }
  }
  roles.ajoutes = actuel.roles.filter((r) => !vus.has(r.id) && !r.gere);

  const salonsActuels = new Map(actuel.salons.map((c) => [c.id, c]));
  const salonsParNom = new Map(actuel.salons.map((c) => [`${c.type}:${c.nom.toLowerCase()}`, c]));
  const vusSalons = new Set();

  const salons = { manquants: [], renommes: [], permissions: [], deplaces: [], reglages: [], ajoutes: [] };
  for (const c of photo.salons) {
    const a = salonsActuels.get(c.id) ?? salonsParNom.get(`${c.type}:${c.nom.toLowerCase()}`);
    if (!a) {
      salons.manquants.push(c);
      continue;
    }
    vusSalons.add(a.id);
    if (a.nom !== c.nom) salons.renommes.push({ avant: c.nom, apres: a.nom, id: a.id, type: c.type });
    if (permissionsDifferentes(c.permissions, a.permissions).length) salons.permissions.push({ nom: a.nom, id: a.id });
    if ((a.parent ?? null) !== (c.parent ?? null)) salons.deplaces.push({ nom: a.nom, id: a.id });
    if (a.sujet !== c.sujet || a.nsfw !== c.nsfw || a.lenteur !== c.lenteur) salons.reglages.push({ nom: a.nom, id: a.id });
  }
  salons.ajoutes = actuel.salons.filter((c) => !vusSalons.has(c.id));

  const serveur = [];
  for (const [cle, libelle] of [
    ['nom', 'nom du serveur'],
    ['everyone', 'permissions de @everyone'],
    ['verification', 'niveau de vérification'],
    ['notifications', 'notifications par défaut'],
    ['filtreMedias', 'filtre des médias'],
    ['salonAfk', 'salon AFK'],
    ['salonSysteme', 'salon système'],
  ]) {
    const voulu = photo.serveur?.[cle] ?? null;
    // Une photo importee porte les salons de l'autre serveur, et peut laisser
    // des champs vides : on ne compare que ce qui a un sens ici.
    if (photo.importe && (voulu === null || cle === 'salonAfk' || cle === 'salonSysteme')) continue;
    if (voulu !== (actuel.serveur[cle] ?? null)) {
      serveur.push({ cle, libelle, avant: photo.serveur?.[cle] ?? null, apres: actuel.serveur[cle] ?? null });
    }
  }

  const total =
    roles.manquants.length + roles.renommes.length + roles.permissions.length + roles.apparences.length +
    salons.manquants.length + salons.renommes.length + salons.permissions.length + salons.deplaces.length +
    salons.reglages.length + serveur.length;

  return { roles, salons, serveur, total, ajouts: roles.ajoutes.length + salons.ajoutes.length };
}


// ------------------------------------------------------------------- IMPORT

const LIMITE_IMPORT = 2 * 1024 * 1024;
const estId = (v) => typeof v === 'string' && /^\d{5,25}$/.test(v);
const estChamp = (v) => typeof v === 'string' && /^\d{1,25}$/.test(v);
const texteCourt = (v, max = 100) => (typeof v === 'string' ? v.slice(0, max) : null);

/**
 * Valide et nettoie une photo exportee (fichier JSON de /structure exporter),
 * eventuellement venue d'un AUTRE serveur.
 *
 * Le fichier vient d'un utilisateur : on ne garde que les champs connus, avec
 * leur type, et on refuse tout ce qui n'a pas la forme d'une photo.
 *
 * Venant d'un autre serveur, deux choses n'ont pas de sens ici :
 *   - les permissions de @everyone de l'autre serveur portent SON identifiant :
 *     on les rebranche sur @everyone d'ici (un overwrite de role dont l'id
 *     n'est aucun role de la photo, c'est forcement @everyone) ;
 *   - les permissions donnees a des MEMBRES precis : ces membres n'existent
 *     pas ici, on les retire.
 * Les roles et salons sont retrouves par leur nom au moment de reparer.
 *
 * @returns {{ contenu: object } | { erreur: string }}
 */
function nettoyerImport(brut, guildId) {
  if (!brut || typeof brut !== 'object' || !Array.isArray(brut.roles) || !Array.isArray(brut.salons)) {
    return { erreur: 'format' };
  }
  if (brut.roles.length > 250 || brut.salons.length > 500) return { erreur: 'trop_gros' };

  const roles = [];
  for (const r of brut.roles) {
    if (!r || !estId(r.id) || typeof r.nom !== 'string' || !estChamp(String(r.permissions ?? ''))) return { erreur: 'format' };
    roles.push({
      id: r.id,
      nom: r.nom.slice(0, 100),
      couleur: /^#[0-9a-f]{6}$/i.test(r.couleur ?? '') ? r.couleur : '#000000',
      position: Number.isInteger(r.position) ? r.position : 0,
      permissions: String(r.permissions),
      separe: Boolean(r.separe),
      mentionnable: Boolean(r.mentionnable),
      gere: Boolean(r.gere),
    });
  }
  const idsRoles = new Set(roles.map((r) => r.id));
  const idsSalons = new Set(brut.salons.map((c) => c?.id));
  const estMembre = (p) => p.type === 1;

  let membresRetires = 0;
  const salons = [];
  for (const c of brut.salons) {
    if (!c || !estId(c.id) || typeof c.nom !== 'string' || !TYPES.has(c.type)) return { erreur: 'format' };
    const perms = [];
    for (const p of Array.isArray(c.permissions) ? c.permissions : []) {
      if (!p || !estId(p.id) || !estChamp(String(p.allow ?? '')) || !estChamp(String(p.deny ?? ''))) return { erreur: 'format' };
      if (estMembre(p)) {
        membresRetires += 1;
        continue;
      }
      perms.push({ id: idsRoles.has(p.id) ? p.id : guildId, type: 0, allow: String(p.allow), deny: String(p.deny) });
    }
    salons.push({
      id: c.id,
      nom: c.nom.slice(0, 100),
      type: c.type,
      parent: estId(c.parent) && idsSalons.has(c.parent) ? c.parent : null,
      position: Number.isInteger(c.position) ? c.position : 0,
      sujet: texteCourt(c.sujet, 1024),
      nsfw: Boolean(c.nsfw),
      lenteur: Number.isInteger(c.lenteur) ? Math.min(Math.max(c.lenteur, 0), 21600) : 0,
      bitrate: Number.isInteger(c.bitrate) ? c.bitrate : null,
      limite: Number.isInteger(c.limite) ? c.limite : null,
      permissions: perms.sort((a, b) => a.id.localeCompare(b.id)),
    });
  }

  const s = brut.serveur && typeof brut.serveur === 'object' ? brut.serveur : {};
  const entier = (v) => (Number.isInteger(v) ? v : null);
  const serveur = {
    nom: texteCourt(s.nom, 100),
    everyone: estChamp(String(s.everyone ?? '')) ? String(s.everyone) : null,
    verification: entier(s.verification),
    notifications: entier(s.notifications),
    filtreMedias: entier(s.filtreMedias),
    salonAfk: estId(s.salonAfk) && idsSalons.has(s.salonAfk) ? s.salonAfk : null,
    delaiAfk: entier(s.delaiAfk),
    salonSysteme: estId(s.salonSysteme) && idsSalons.has(s.salonSysteme) ? s.salonSysteme : null,
    salonRegles: estId(s.salonRegles) && idsSalons.has(s.salonRegles) ? s.salonRegles : null,
  };

  return { contenu: { version: VERSION, date: Date.now(), importe: true, serveur, roles, salons }, membresRetires };
}

/** Enregistre une photo importee (deja passee par nettoyerImport). */
function enregistrerImport(guildId, contenu, { nom = null, auteurId = null } = {}) {
  const info = req.ajouterStructure.run({
    guild_id: guildId,
    nom: nom || 'Import',
    contenu: JSON.stringify(contenu),
    version: VERSION,
    auteur_id: auteurId,
    automatique: 0,
    nb_roles: contenu.roles.length,
    nb_salons: contenu.salons.length,
    cree_le: contenu.date,
  });
  purger(guildId);
  return Number(info.lastInsertRowid);
}

module.exports = {
  nettoyerImport,
  enregistrerImport,
  LIMITE_IMPORT,
  VERSION,
  TYPES,
  nomType,
  capturer,
  enregistrer,
  purger,
  lister,
  charger,
  supprimer,
  comparer,
  permissionsDifferentes,
  PermissionsBitField,
};
