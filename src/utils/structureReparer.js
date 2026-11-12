/**
 * Reparation du serveur a partir d'une photo de structure.
 *
 * Principe : on ne supprime JAMAIS rien. Un salon efface emporte ses messages
 * avec lui, et une restauration ratee couterait plus cher que le probleme
 * qu'elle repare. On recree ce qui manque, on remet en place ce qui a change,
 * et ce qui a ete ajoute depuis la photo est simplement signale.
 *
 * Chaque operation est isolee : une erreur sur un salon n'arrete pas le reste,
 * elle est notee dans le rapport.
 */
const { ChannelType, PermissionFlagsBits, PermissionsBitField } = require('discord.js');
const logger = require('./logger');

const RAISON = 'Réparation depuis une photo de structure';

// Discord n'aime pas les rafales : une petite pause toutes les quelques
// operations evite de se faire limiter au milieu d'une reparation.
const PAUSE_TOUS_LES = 5;
const PAUSE_MS = 900;

const attendre = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Ce qui empeche de reparer, ou ce qui sera laisse de cote.
 * A montrer AVANT de demander confirmation : personne n'aime decouvrir apres
 * coup que la moitie du travail n'a pas pu etre faite.
 */
function verifier(photo, guild) {
  const bloquants = [];
  const avertissements = [];

  const moi = guild.members.me;
  if (!moi) return { bloquants: ['Je ne me trouve pas sur ce serveur.'], avertissements };

  if (!moi.permissions.has(PermissionFlagsBits.ManageRoles)) bloquants.push('il me manque la permission **Gérer les rôles**');
  if (!moi.permissions.has(PermissionFlagsBits.ManageChannels)) bloquants.push('il me manque la permission **Gérer les salons**');
  if (!moi.permissions.has(PermissionFlagsBits.ManageGuild)) {
    avertissements.push("il me manque **Gérer le serveur** : je ne pourrai pas remettre le nom, le niveau de vérification ni le salon AFK");
  }

  // Un role place au-dessus du mien est hors de ma portee : Discord refuse.
  const plafond = moi.roles.highest.position;
  const horsPortee = [...guild.roles.cache.values()].filter(
    (r) => r.id !== guild.id && !r.managed && r.position >= plafond
  );
  if (horsPortee.length) {
    avertissements.push(
      `${horsPortee.length} rôle(s) sont au-dessus du mien et je ne peux pas y toucher : ` +
        `${horsPortee.slice(0, 5).map((r) => r.name).join(', ')}${horsPortee.length > 5 ? '…' : ''}. ` +
        'Monte mon rôle au-dessus dans les paramètres du serveur pour que je puisse les réparer.'
    );
  }

  const geres = (photo.roles ?? []).filter((r) => r.gere).length;
  if (geres) avertissements.push(`${geres} rôle(s) appartiennent à des bots ou au boost : Discord interdit de les recréer.`);

  return { bloquants, avertissements, plafond, horsPortee: new Set(horsPortee.map((r) => r.id)) };
}

/**
 * Repare le serveur.
 *
 * @param {object} photo    contenu d'une photo de structure
 * @param {import('discord.js').Guild} guild
 * @param {object} quoi     { roles, salons, permissions, serveur } : booleens
 * @param {Function} [avancement] appelee avec (fait, total, etape)
 */
async function reparer(photo, guild, quoi, avancement = null) {
  const moi = guild.members.me;
  const plafond = moi.roles.highest.position;
  const rapport = {
    rolesCrees: [], rolesModifies: [], salonsCrees: [], salonsModifies: [],
    permissionsRemises: [], serveurModifie: [], ignores: [], erreurs: [],
  };

  // ancienne id -> objet actuel. Sert a retrouver les cibles des permissions
  // quand un role ou un salon a ete recree avec un identifiant tout neuf.
  const correspondance = new Map();
  correspondance.set(guild.id, guild.id); // @everyone garde l'id du serveur

  let fait = 0;
  const etapes = [];
  const noter = async (etape) => {
    fait++;
    if (avancement && fait % 3 === 0) await avancement(fait, etapes.length || fait, etape);
    if (fait % PAUSE_TOUS_LES === 0) await attendre(PAUSE_MS);
  };
  const echec = (quoiFait, e) => {
    rapport.erreurs.push(`${quoiFait} : ${e.message}`);
    logger.debug('Réparation :', quoiFait, e.message);
  };

  // ================================================================ ROLES
  const rolesParNom = new Map();
  for (const r of guild.roles.cache.values()) if (r.id !== guild.id) rolesParNom.set(r.name.toLowerCase(), r);

  for (const r of photo.roles ?? []) {
    const existant = guild.roles.cache.get(r.id) ?? rolesParNom.get(r.nom.toLowerCase());
    if (existant) correspondance.set(r.id, existant.id);
  }

  if (quoi.roles) {
    // On recree du bas vers le haut : Discord place les nouveaux roles tout en
    // bas, donc creer dans cet ordre donne d'emblee un empilement coherent.
    const aCreer = (photo.roles ?? [])
      .filter((r) => !r.gere && !correspondance.has(r.id))
      .sort((a, b) => a.position - b.position);

    for (const r of aCreer) {
      try {
        const nouveau = await guild.roles.create({
          name: r.nom,
          color: r.couleur === '#000000' ? null : r.couleur,
          hoist: r.separe,
          mentionable: r.mentionnable,
          permissions: new PermissionsBitField(BigInt(r.permissions)),
          reason: RAISON,
        });
        correspondance.set(r.id, nouveau.id);
        rapport.rolesCrees.push(r.nom);
      } catch (e) {
        echec(`création du rôle ${r.nom}`, e);
      }
      await noter(`rôle ${r.nom}`);
    }

    // Remise en etat des roles qui existent encore
    for (const r of photo.roles ?? []) {
      if (r.gere) continue;
      const id = correspondance.get(r.id);
      const actuel = id ? guild.roles.cache.get(id) : null;
      if (!actuel || rapport.rolesCrees.includes(r.nom)) continue;

      if (actuel.position >= plafond) {
        rapport.ignores.push(`rôle ${actuel.name} (au-dessus du mien)`);
        continue;
      }
      const changements = {};
      if (actuel.name !== r.nom) changements.name = r.nom;
      if (actuel.hexColor !== r.couleur) changements.color = r.couleur === '#000000' ? null : r.couleur;
      if (actuel.hoist !== r.separe) changements.hoist = r.separe;
      if (actuel.mentionable !== r.mentionnable) changements.mentionable = r.mentionnable;
      if (actuel.permissions.bitfield.toString() !== r.permissions) {
        changements.permissions = new PermissionsBitField(BigInt(r.permissions));
      }
      if (!Object.keys(changements).length) continue;

      try {
        await actuel.edit({ ...changements, reason: RAISON });
        rapport.rolesModifies.push(r.nom);
      } catch (e) {
        echec(`rôle ${r.nom}`, e);
      }
      await noter(`rôle ${r.nom}`);
    }
  }

  // =============================================================== SALONS
  const salonsParNom = new Map();
  for (const c of guild.channels.cache.values()) salonsParNom.set(`${c.type}:${c.name.toLowerCase()}`, c);
  for (const c of photo.salons ?? []) {
    const existant = guild.channels.cache.get(c.id) ?? salonsParNom.get(`${c.type}:${c.nom.toLowerCase()}`);
    if (existant) correspondance.set(c.id, existant.id);
  }

  /** Traduit les permissions de la photo vers les identifiants d'aujourd'hui. */
  const traduire = (liste) =>
    (liste ?? [])
      .map((p) => {
        const cible = correspondance.get(p.id) ?? p.id;
        // Une cible inconnue est ignoree : ecrire une permission pour un role
        // disparu ferait echouer toute la mise a jour du salon.
        const existe = p.type === 0 ? guild.roles.cache.has(cible) : true;
        if (!existe) return null;
        return { id: cible, type: p.type, allow: BigInt(p.allow), deny: BigInt(p.deny) };
      })
      .filter(Boolean);

  if (quoi.salons) {
    // Les categories d'abord : sans elles, les salons n'ont pas de parent.
    const manquants = (photo.salons ?? []).filter((c) => !correspondance.has(c.id));
    const ordre = [
      ...manquants.filter((c) => c.type === ChannelType.GuildCategory),
      ...manquants.filter((c) => c.type !== ChannelType.GuildCategory),
    ];

    for (const c of ordre) {
      try {
        const parent = c.parent ? correspondance.get(c.parent) : null;
        const nouveau = await guild.channels.create({
          name: c.nom,
          type: c.type,
          parent: parent && guild.channels.cache.get(parent)?.type === ChannelType.GuildCategory ? parent : null,
          topic: c.sujet ?? undefined,
          nsfw: c.nsfw ?? undefined,
          rateLimitPerUser: c.lenteur || undefined,
          bitrate: c.bitrate || undefined,
          userLimit: c.limite || undefined,
          permissionOverwrites: quoi.permissions ? traduire(c.permissions) : undefined,
          reason: RAISON,
        });
        correspondance.set(c.id, nouveau.id);
        rapport.salonsCrees.push(c.nom);
      } catch (e) {
        echec(`création du salon ${c.nom}`, e);
      }
      await noter(`salon ${c.nom}`);
    }

    // Remise en etat des salons qui existent encore
    for (const c of photo.salons ?? []) {
      if (rapport.salonsCrees.includes(c.nom)) continue;
      const id = correspondance.get(c.id);
      const actuel = id ? guild.channels.cache.get(id) : null;
      if (!actuel) continue;

      const changements = {};
      if (actuel.name !== c.nom) changements.name = c.nom;
      if ((actuel.topic ?? null) !== (c.sujet ?? null) && 'topic' in actuel) changements.topic = c.sujet;
      if ((actuel.nsfw ?? false) !== (c.nsfw ?? false) && 'nsfw' in actuel) changements.nsfw = c.nsfw;
      if ((actuel.rateLimitPerUser ?? 0) !== (c.lenteur ?? 0) && 'rateLimitPerUser' in actuel) {
        changements.rateLimitPerUser = c.lenteur ?? 0;
      }
      const parentVoulu = c.parent ? (correspondance.get(c.parent) ?? null) : null;
      if ((actuel.parentId ?? null) !== parentVoulu) changements.parent = parentVoulu;

      if (!Object.keys(changements).length) continue;
      try {
        await actuel.edit({ ...changements, reason: RAISON });
        rapport.salonsModifies.push(c.nom);
      } catch (e) {
        echec(`salon ${c.nom}`, e);
      }
      await noter(`salon ${c.nom}`);
    }
  }

  // ========================================================== PERMISSIONS
  if (quoi.permissions) {
    for (const c of photo.salons ?? []) {
      if (rapport.salonsCrees.includes(c.nom)) continue; // deja posees a la creation
      const id = correspondance.get(c.id);
      const actuel = id ? guild.channels.cache.get(id) : null;
      if (!actuel) continue;

      const voulues = traduire(c.permissions);
      const actuelles = [...actuel.permissionOverwrites.cache.values()];
      const identiques =
        voulues.length === actuelles.length &&
        voulues.every((v) => {
          const a = actuel.permissionOverwrites.cache.get(v.id);
          return a && a.allow.bitfield === v.allow && a.deny.bitfield === v.deny;
        });
      if (identiques) continue;

      try {
        await actuel.permissionOverwrites.set(voulues, RAISON);
        rapport.permissionsRemises.push(c.nom);
      } catch (e) {
        echec(`permissions de ${c.nom}`, e);
      }
      await noter(`permissions de ${c.nom}`);
    }
  }

  // ============================================================== SERVEUR
  if (quoi.serveur && photo.serveur) {
    const s = photo.serveur;
    const essayer = async (libelle, action) => {
      try {
        await action();
        rapport.serveurModifie.push(libelle);
      } catch (e) {
        echec(libelle, e);
      }
      await noter(libelle);
    };

    // Une photo importee d'un autre serveur peut ne pas avoir tous les champs :
    // on ne touche qu'a ce qu'elle dit vraiment.
    const defini = (v) => v !== null && v !== undefined;
    if (defini(s.everyone) && guild.roles.everyone && guild.roles.everyone.permissions.bitfield.toString() !== s.everyone) {
      await essayer('permissions de @everyone', () =>
        guild.roles.everyone.setPermissions(new PermissionsBitField(BigInt(s.everyone)), RAISON)
      );
    }
    if (defini(s.nom) && guild.name !== s.nom) await essayer('nom du serveur', () => guild.setName(s.nom, RAISON));
    if (defini(s.verification) && guild.verificationLevel !== s.verification) {
      await essayer('niveau de vérification', () => guild.setVerificationLevel(s.verification, RAISON));
    }
    if (defini(s.filtreMedias) && guild.explicitContentFilter !== s.filtreMedias) {
      await essayer('filtre des médias', () => guild.setExplicitContentFilter(s.filtreMedias, RAISON));
    }
    // Les salons AFK et systeme sont compares APRES traduction des
    // identifiants (une photo importee porte ceux de l'autre serveur).
    const afk = s.salonAfk ? (correspondance.get(s.salonAfk) ?? null) : null;
    if ((guild.afkChannelId ?? null) !== afk && (afk || !photo.importe)) {
      await essayer('salon AFK', () => guild.setAFKChannel(afk, RAISON));
    }
    const systeme = s.salonSysteme ? (correspondance.get(s.salonSysteme) ?? null) : null;
    if ((guild.systemChannelId ?? null) !== systeme && (systeme || !photo.importe)) {
      await essayer('salon système', () => guild.setSystemChannel(systeme, RAISON));
    }
  }

  rapport.total =
    rapport.rolesCrees.length + rapport.rolesModifies.length + rapport.salonsCrees.length +
    rapport.salonsModifies.length + rapport.permissionsRemises.length + rapport.serveurModifie.length;

  return rapport;
}

module.exports = { verifier, reparer, RAISON };
