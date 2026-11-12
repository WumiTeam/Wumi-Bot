/**
 * Panneau de controle local.
 *
 * Petit serveur HTTP sans dependance, volontairement limite a 127.0.0.1 :
 * la page n'est joignable que depuis la machine qui fait tourner le bot,
 * jamais depuis Internet, meme si le port etait ouvert sur la box.
 */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { ChannelType } = require('discord.js');

const conf = require('../../config');
const { db, req, config, majConfig } = require('../database/db');
const logger = require('../utils/logger');
const themes = require('../utils/themesRank');
const eco = require('../utils/economie');
const activite = require('../utils/activite');
const missions = require('../utils/missions');
const { infosNiveau } = require('../utils/niveaux');
const fondateur = require('../utils/fondateur');

const SESSION_MS = 12 * 3_600_000;
const MAX_ESSAIS = 5;
const FENETRE_ESSAIS = 5 * 60_000;
const TAILLE_MAX_CORPS = 256 * 1024;

const sessions = new Map(); // jeton -> expiration
let essaisRates = [];
let serveur = null;

// Colonnes modifiables : tout sauf la cle primaire et les compteurs internes.
const INTERDITES = new Set([
  'guild_id',
  'ticket_compteur',
  'suggestion_compteur',
  'cand_compteur',
  'antiraid_verrouille',
  // Horodatage pose par /xp evenement : se regle par la commande, pas a la main.
  'double_xp_jusqu_a',
]);
let colonnesConfig = null;

function typesColonnes() {
  if (colonnesConfig) return colonnesConfig;
  colonnesConfig = new Map();
  for (const c of db.prepare('PRAGMA table_info(config)').all()) {
    if (!INTERDITES.has(c.name)) colonnesConfig.set(c.name, c.type);
  }
  return colonnesConfig;
}

// ----------------------------------------------------------------- OUTILS
function json(reponse, code, corps) {
  const texte = JSON.stringify(corps);
  reponse.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  reponse.end(texte);
}

function lireCorps(requete) {
  return new Promise((resoudre, rejeter) => {
    let taille = 0;
    const morceaux = [];
    requete.on('data', (m) => {
      taille += m.length;
      if (taille > TAILLE_MAX_CORPS) {
        rejeter(new Error('Corps trop volumineux'));
        requete.destroy();
        return;
      }
      morceaux.push(m);
    });
    requete.on('end', () => {
      if (!morceaux.length) return resoudre({});
      try {
        resoudre(JSON.parse(Buffer.concat(morceaux).toString('utf8')));
      } catch {
        rejeter(new Error('JSON invalide'));
      }
    });
    requete.on('error', rejeter);
  });
}

/** Comparaison a duree constante : ne renseigne pas sur la longueur du mot de passe. */
function memeSecret(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function jetonDeLaRequete(requete) {
  const brut = requete.headers.cookie;
  if (!brut) return null;
  for (const morceau of brut.split(';')) {
    const [nom, ...reste] = morceau.trim().split('=');
    if (nom === 'panneau') return reste.join('=');
  }
  return null;
}

function sessionValide(requete) {
  const jeton = jetonDeLaRequete(requete);
  if (!jeton) return false;
  const expiration = sessions.get(jeton);
  if (!expiration) return false;
  if (expiration < Date.now()) {
    sessions.delete(jeton);
    return false;
  }
  return true;
}

/** Le nombre d'echecs recents interdit-il un nouvel essai ? */
function tropDEssais() {
  const limite = Date.now() - FENETRE_ESSAIS;
  essaisRates = essaisRates.filter((d) => d > limite);
  return essaisRates.length >= MAX_ESSAIS;
}

// -------------------------------------------------------------- DONNEES
function listeSalons(guild) {
  return [...guild.channels.cache.values()]
    .filter((c) => c.type === ChannelType.GuildText || c.type === ChannelType.GuildAnnouncement)
    .sort((a, b) => a.rawPosition - b.rawPosition)
    .map((c) => ({ id: c.id, nom: c.name }));
}

function listeCategories(guild) {
  return [...guild.channels.cache.values()]
    .filter((c) => c.type === ChannelType.GuildCategory)
    .sort((a, b) => a.rawPosition - b.rawPosition)
    .map((c) => ({ id: c.id, nom: c.name }));
}

function listeRoles(guild) {
  const moi = guild.members.me?.roles.highest.position ?? Infinity;
  return [...guild.roles.cache.values()]
    .filter((r) => r.id !== guild.id && !r.managed)
    .sort((a, b) => b.position - a.position)
    .map((r) => ({ id: r.id, nom: r.name, couleur: r.hexColor, attribuable: r.position < moi }));
}

function resumeServeur(guild) {
  const guildId = guild.id;
  const serie = activite.serie(guildId, 7);
  return {
    membres: guild.memberCount,
    membresXp: req.totalMembresXp.get(guildId).n,
    tickets: req.statsTickets.get(guildId),
    signalements: req.compterSignalements.get(guildId, 'attente').n,
    appels: req.compterAppels.get(guildId, 'attente').n,
    messages7j: serie.reduce((s, j) => s + j.messages, 0),
    arrivees7j: serie.reduce((s, j) => s + j.arrivees, 0),
    departs7j: serie.reduce((s, j) => s + j.departs, 0),
  };
}

function classement(guildId, guild, limite = 10) {
  return req.classement.all(guildId, limite, 0).map((l, i) => {
    const infos = infosNiveau(l.xp);
    const membre = guild.members.cache.get(l.user_id);
    return {
      position: i + 1,
      id: l.user_id,
      nom: membre?.displayName ?? membre?.user.username ?? l.user_id,
      niveau: infos.niveau,
      xp: l.xp,
      messages: l.messages,
      solde: eco.solde(guildId, l.user_id),
    };
  });
}

/** Les 10 dernieres sauvegardes, sans exposer les chemins du disque. */
function listeSauvegardes(sauvegardes) {
  return sauvegardes.lister().slice(0, 10).map(({ nom, taille, date }) => ({ nom, taille, date }));
}

// --------------------------------------------------------------- ROUTES
async function routerApi(requete, reponse, client, url) {
  const chemin = url.pathname;
  const methode = requete.method;

  // --------------------------------------------------------- CONNEXION
  if (chemin === '/api/connexion' && methode === 'POST') {
    if (tropDEssais()) {
      return json(reponse, 429, { erreur: 'Trop de tentatives. Reessaie dans quelques minutes.' });
    }
    const corps = await lireCorps(requete).catch(() => ({}));
    if (!corps.motdepasse || !memeSecret(corps.motdepasse, process.env.PANNEAU_MOTDEPASSE)) {
      essaisRates.push(Date.now());
      logger.avertissement('Panneau : mot de passe refuse.');
      return json(reponse, 401, { erreur: 'Mot de passe incorrect.' });
    }
    essaisRates = [];
    const jeton = crypto.randomBytes(32).toString('hex');
    sessions.set(jeton, Date.now() + SESSION_MS);
    reponse.setHeader('Set-Cookie', `panneau=${jeton}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_MS / 1000}`);
    return json(reponse, 200, { ok: true });
  }

  // Tout le reste demande une session ouverte.
  if (!sessionValide(requete)) return json(reponse, 401, { erreur: 'Session expiree.' });

  if (chemin === '/api/deconnexion' && methode === 'POST') {
    sessions.delete(jetonDeLaRequete(requete));
    reponse.setHeader('Set-Cookie', 'panneau=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');
    return json(reponse, 200, { ok: true });
  }

  // ------------------------------------------------------------- ETAT
  if (chemin === '/api/etat' && methode === 'GET') {
    return json(reponse, 200, {
      bot: {
        nom: client.user?.username ?? 'bot',
        avatar: client.user?.displayAvatarURL({ extension: 'png', size: 128 }) ?? null,
        ping: Math.max(0, Math.round(client.ws.ping)),
        demarreLe: Date.now() - Math.round(process.uptime() * 1000),
        commandes: client.commandes.size,
      },
      support: fondateur.serveurSupport(),
      serveurs: [...client.guilds.cache.values()]
        .map((g) => ({
          id: g.id,
          nom: g.name,
          icone: g.iconURL({ extension: 'png', size: 64 }),
          membres: g.memberCount,
          // La page s'en sert pour afficher le bandeau « lecture seule ».
          // Ce n'est qu'un affichage : le vrai verrou est cote serveur.
          modifiable: fondateur.estSupport(g.id),
          support: fondateur.estSupport(g.id),
        }))
        .sort((a, b) => Number(b.support) - Number(a.support) || (b.membres ?? 0) - (a.membres ?? 0)),
    });
  }

  // ------------------------------------------------------- LISTE NOIRE
  // Bloquer est une decision de fondateur, pas un reglage de serveur : ces
  // routes vivent a la racine de l'API, pas sous /api/serveur/<id>.
  if (chemin === '/api/liste-noire' && methode === 'GET') {
    return json(reponse, 200, { liste: fondateur.listeNoire() });
  }

  if (chemin === '/api/liste-noire' && methode === 'POST') {
    const corps = await lireCorps(requete);
    const id = String(corps?.id ?? '').trim();
    const genre = corps?.genre === 'membre' ? 'membre' : 'serveur';
    if (!/^\d{17,20}$/.test(id)) {
      return json(reponse, 400, { erreur: "Ce n'est pas un identifiant Discord." });
    }
    if (genre === 'serveur' && fondateur.estSupport(id)) {
      return json(reponse, 400, { erreur: 'Bloquer le serveur support ferait quitter le bot de chez toi.' });
    }
    if (genre === 'membre' && fondateur.estFondateur(id)) {
      return json(reponse, 400, { erreur: 'On ne bloque pas un fondateur du bot.' });
    }

    fondateur.bloquer(id, genre, { raison: corps?.raison ? String(corps.raison).slice(0, 300) : null, par: 'panneau' });

    let quitte = null;
    if (genre === 'serveur') {
      const g = client.guilds.cache.get(id);
      if (g) {
        quitte = g.name;
        await g.leave().catch(() => null);
      }
    }
    logger.avertissement(`Liste noire : ${genre} ${id} bloque depuis le panneau.`);
    return json(reponse, 200, { ok: true, quitte, liste: fondateur.listeNoire() });
  }

  if (chemin === '/api/liste-noire/retirer' && methode === 'POST') {
    const corps = await lireCorps(requete);
    const retire = fondateur.debloquer(String(corps?.id ?? ''));
    return json(reponse, 200, { ok: retire, liste: fondateur.listeNoire() });
  }

  // --------------------------------------------------- QUITTER UN SERVEUR
  if (chemin === '/api/quitter' && methode === 'POST') {
    const corps = await lireCorps(requete);
    const g = client.guilds.cache.get(String(corps?.id ?? ''));
    if (!g) return json(reponse, 404, { erreur: 'Serveur introuvable.' });
    if (fondateur.estSupport(g.id)) {
      return json(reponse, 400, { erreur: 'Le bot ne peut pas quitter son propre serveur support.' });
    }
    const nom = g.name;
    await g.leave();
    logger.info(`Sortie du serveur ${nom} (${g.id}) demandee depuis le panneau.`);
    return json(reponse, 200, { ok: true, nom });
  }

  const correspondance = chemin.match(/^\/api\/serveur\/(\d+)(\/[a-z.]+)?$/);
  if (correspondance) {
    const guild = client.guilds.cache.get(correspondance[1]);
    if (!guild) return json(reponse, 404, { erreur: 'Serveur introuvable.' });
    const guildId = guild.id;
    const sousChemin = correspondance[2] ?? '';

    // ------------------------------------------- LECTURE SEULE AILLEURS
    // Blueprint est un bot public. Le panneau est la console de son auteur,
    // pas un editeur de reglages pour les serveurs des autres : chacun
    // configure le sien avec /demarrer et /config, et personne — pas meme
    // l'auteur — ne vient changer ses reglages dans son dos.
    //
    // Seul le serveur support reste modifiable : c'est celui de l'auteur.
    // Tout le reste se consulte, pour pouvoir depanner quand on demande de
    // l'aide, et ne se modifie pas.
    //
    // Le verrou est ICI, cote serveur. Griser des champs dans la page ne
    // protege rien : il suffit d'appeler l'API a la main.
    if (methode !== 'GET' && !fondateur.estSupport(guildId)) {
      return json(reponse, 403, {
        erreur: 'Lecture seule : ce serveur se configure avec les commandes du bot, par ses administrateurs.',
      });
    }

    // -------------------------------------------------- LECTURE COMPLETE
    if (sousChemin === '' && methode === 'GET') {
      return json(reponse, 200, {
        config: config(guildId),
        salons: listeSalons(guild),
        categories: listeCategories(guild),
        roles: listeRoles(guild),
        resume: resumeServeur(guild),
        recompenses: req.recompenses.all(guildId),
        boutique: req.articles.all(guildId),
        classement: classement(guildId, guild),
        veille: req.veillesDe.all(guildId),
        jetonInstagram: require('../utils/veille').etatJeton(),
        themes: themes.liste().map((t) => ({ cle: t.cle, nom: t.nom, emoji: t.emoji, prix: t.prix, description: t.description })),
        missions: conf.missions?.actif
          ? missions.periodes(guildId).map((p) => ({ titre: p.titre, liste: p.liste.map((m) => ({ nom: m.nom, description: m.description, but: m.but, xp: m.xp, monnaie: m.monnaie })) }))
          : [],
      });
    }

    // ---------------------------------------------------- ECRITURE CONFIG
    if (sousChemin === '/config' && methode === 'POST') {
      const corps = await lireCorps(requete);
      const types = typesColonnes();
      const valeurs = {};
      const refusees = [];

      for (const [cle, brut] of Object.entries(corps)) {
        const type = types.get(cle);
        if (!type) {
          refusees.push(cle);
          continue;
        }
        if (type === 'INTEGER') {
          if (brut === null || brut === '') {
            refusees.push(cle);
            continue;
          }
          const n = Number(brut);
          if (!Number.isFinite(n)) {
            refusees.push(cle);
            continue;
          }
          valeurs[cle] = Math.trunc(n);
        } else {
          valeurs[cle] = brut === null || brut === '' ? null : String(brut).slice(0, 2000);
        }
      }

      if (!Object.keys(valeurs).length) return json(reponse, 400, { erreur: 'Aucun reglage valide.', refusees });
      majConfig(guildId, valeurs);
      logger.info(`Panneau : ${Object.keys(valeurs).join(', ')} modifie(s) sur ${guild.name}.`);
      return json(reponse, 200, { ok: true, config: config(guildId), refusees });
    }

    // -------------------------------------------------------- RECOMPENSES
    if (sousChemin === '/recompense' && methode === 'POST') {
      const { niveau, roleId, supprimer } = await lireCorps(requete);
      const n = Math.trunc(Number(niveau));
      if (!Number.isFinite(n) || n < 1 || n > 1000) return json(reponse, 400, { erreur: 'Niveau invalide.' });
      if (supprimer) req.retirerRecompense.run(guildId, n);
      else {
        if (!guild.roles.cache.has(String(roleId))) return json(reponse, 400, { erreur: 'Role introuvable.' });
        req.ajouterRecompense.run(guildId, n, String(roleId));
      }
      return json(reponse, 200, { ok: true, recompenses: req.recompenses.all(guildId) });
    }

    // ----------------------------------------------------------- EVOLUTION
    // La serie est deja completee jour par jour cote activite.js : les jours
    // sans activite valent zero plutot que d'etre absents, sinon le graphique
    // sauterait les trous et mentirait sur la forme de la courbe.
    if (sousChemin === '/evolution' && methode === 'GET') {
      const demande = Math.trunc(Number(url.searchParams.get('jours')) || 30);
      const jours = [7, 30, 90].includes(demande) ? demande : 30;
      const serie = activite.serie(guildId, jours);
      const salons = activite.topSalons(guildId, jours, 5).map((s) => ({
        nom: guild.channels.cache.get(s.channel_id)?.name ?? null,
        messages: s.total,
      }));
      return json(reponse, 200, { jours, serie, salons: salons.filter((s) => s.nom) });
    }

    // ----------------------------------------------------------- STRUCTURE
    // Le panneau sait photographier, comparer et effacer. La REPARATION reste
    // sur Discord : elle modifie le serveur, elle doit passer par quelqu'un
    // qui a la permission Administrateur et laisser une trace.
    if (sousChemin === '/structure' && methode === 'GET') {
      const structure = require('../utils/structure');
      const photos = structure.lister(guildId, 20);
      let diff = null;
      if (photos.length) {
        const derniere = structure.charger(photos[0].id, guildId);
        if (derniere) {
          const d = structure.comparer(derniere.contenu, guild);
          diff = {
            id: photos[0].id,
            total: d.total,
            ajouts: d.ajouts,
            roles: {
              manquants: d.roles.manquants.map((r) => r.nom),
              renommes: d.roles.renommes.map((r) => `${r.avant} → ${r.apres}`),
              permissions: d.roles.permissions.map((r) => r.nom),
            },
            salons: {
              manquants: d.salons.manquants.map((c) => c.nom),
              renommes: d.salons.renommes.map((c) => `${c.avant} → ${c.apres}`),
              permissions: d.salons.permissions.map((c) => c.nom),
              deplaces: d.salons.deplaces.map((c) => c.nom),
            },
            serveur: d.serveur.map((s) => s.libelle),
          };
        }
      }
      return json(reponse, 200, { photos, diff });
    }

    if (sousChemin === '/structure' && methode === 'POST') {
      const structure = require('../utils/structure');
      const corps = await lireCorps(requete);
      try {
        if (corps.supprimer) {
          structure.supprimer(Math.trunc(Number(corps.supprimer)), guildId);
        } else {
          const { id } = structure.enregistrer(guild, { nom: 'Panneau' });
          logger.info(`Panneau : photo de structure #${id} sur ${guild.name}.`);
        }
      } catch (e) {
        logger.erreur('Panneau : photo de structure :', e.message);
        return json(reponse, 500, { erreur: e.message });
      }
      return json(reponse, 200, { ok: true, photos: structure.lister(guildId, 20) });
    }

    // ------------------------------------------------------------ BOUTIQUE
    if (sousChemin === '/boutique' && methode === 'POST') {
      const corps = await lireCorps(requete);
      if (corps.supprimer) {
        req.retirerArticle.run(Math.trunc(Number(corps.supprimer)), guildId);
        return json(reponse, 200, { ok: true, boutique: req.articles.all(guildId) });
      }
      const prix = Math.trunc(Number(corps.prix));
      if (!corps.nom || !Number.isFinite(prix) || prix < 1) return json(reponse, 400, { erreur: 'Nom ou prix invalide.' });
      if (corps.roleId && !guild.roles.cache.has(String(corps.roleId))) return json(reponse, 400, { erreur: 'Role introuvable.' });
      req.ajouterArticle.run({
        guild_id: guildId,
        nom: String(corps.nom).slice(0, 80),
        description: corps.description ? String(corps.description).slice(0, 200) : null,
        prix,
        role_id: corps.roleId ? String(corps.roleId) : null,
        stock: corps.stock ? Math.trunc(Number(corps.stock)) : -1,
      });
      return json(reponse, 200, { ok: true, boutique: req.articles.all(guildId) });
    }

    // ------------------------------------------------------------- VEILLE
    if (sousChemin === '/veille' && methode === 'POST') {
      const corps = await lireCorps(requete);
      const veille = require('../utils/veille');

      if (corps.supprimer) {
        req.retirerVeille.run(Math.trunc(Number(corps.supprimer)), guildId);
        return json(reponse, 200, { ok: true, veille: req.veillesDe.all(guildId) });
      }
      if (corps.tester) {
        const source = req.veilleParId.get(Math.trunc(Number(corps.tester)));
        if (!source || source.guild_id !== guildId) return json(reponse, 404, { erreur: 'Source introuvable.' });
        req.majVeille.run({ id: source.id, dernier: null, derniere_date: 1 });
        const resultat = await veille.verifierUne(client, { ...source, dernier: null, derniere_date: 1 });
        return json(reponse, 200, { ok: !resultat.erreur, resultat, veille: req.veillesDe.all(guildId) });
      }
      if (corps.renouveler) {
        const resultat = await veille.renouvelerJeton(true);
        return json(reponse, resultat.ok ? 200 : 400, { ...resultat, jetonInstagram: veille.etatJeton() });
      }

      const type = String(corps.type ?? '');
      if (!Object.hasOwn(veille.TYPES, type)) return json(reponse, 400, { erreur: 'Type inconnu.' });
      const salon = guild.channels.cache.get(String(corps.salonId));
      if (!salon?.isTextBased()) return json(reponse, 400, { erreur: 'Salon introuvable.' });
      const source = String(corps.source ?? '').trim();
      if (type !== 'instagram' && !source) return json(reponse, 400, { erreur: 'Indique la chaine ou l\'adresse du flux.' });

      // verifierSource sait qu'une chaine Twitch hors ligne est valide : c'est
      // meme son etat habituel. Un simple « lire » la rejetterait comme vide.
      let verif;
      try {
        verif = await veille.verifierSource(type, source);
      } catch (e) {
        return json(reponse, 400, { erreur: `Source illisible : ${e.message}`.slice(0, 400) });
      }
      const elements = verif.elements;

      const info = req.ajouterVeille.run({
        guild_id: guildId,
        type,
        source: source || 'compte du jeton',
        nom: corps.nom ? String(corps.nom).slice(0, 60) : (verif.nom ?? veille.TYPES[type].nom),
        salon_id: salon.id,
        role_id: corps.roleId ? String(corps.roleId) : null,
        message: corps.message ? String(corps.message).slice(0, 200) : null,
        cree_le: Date.now(),
      });
      // On part de l'etat actuel, sans l'annoncer. Une chaine Twitch hors ligne
      // n'a rien a fournir : on la marque quand meme comme initialisee, sinon
      // son premier direct serait pris pour un premier passage et avale.
      req.majVeille.run({
        id: Number(info.lastInsertRowid),
        dernier: elements[0]?.id ?? 'hors-ligne',
        derniere_date: elements[0]?.date ?? 0,
      });
      logger.info(`Panneau : source de veille ${type} ajoutee sur ${guild.name}.`);
      return json(reponse, 200, {
        ok: true,
        dernier: elements[0]?.titre ?? (type === 'twitch' ? 'chaîne hors ligne pour le moment' : null),
        veille: req.veillesDe.all(guildId),
      });
    }

    // ------------------------------------------------------------ IMAGES
    if (sousChemin === '/apercu.png' && methode === 'GET') {
      const type = url.searchParams.get('type') ?? 'rank';
      const theme = themes.parCle(url.searchParams.get('theme') ?? themes.CLE_DEFAUT);
      const avatar = client.user?.displayAvatarURL({ extension: 'png', size: 256 }) ?? '';
      const commun = {
        pseudo: 'Exemple',
        tag: 'exemple',
        avatarUrl: avatar,
        niveau: 24,
        rang: 3,
        totalMembres: guild.memberCount,
        xpActuel: 1840,
        xpRequis: 2380,
        xpTotal: 48_250,
        messages: 3120,
        theme,
      };

      let png;
      if (type === 'bienvenue') {
        png = await require('../utils/carteBienvenue').genererCarteBienvenue({
          pseudo: 'Exemple',
          avatarUrl: avatar,
          serveur: guild.name,
          numeroMembre: guild.memberCount,
        });
      } else if (type === 'profil') {
        png = await require('../utils/carteProfil').genererCarteProfil({
          ...commun,
          minutesVocal: 1240,
          solde: 7400,
          monnaie: eco.monnaie(guildId).nom,
          rangSolde: 5,
          invitations: 12,
          anciennete: '1 an et 3 mois',
          avertissements: 0,
          missions: { faites: 2, total: 3 },
          roles: ['Membre', 'Actif'],
        });
      } else {
        png = await require('../utils/carteRank').genererCarteRank(commun);
      }

      reponse.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'no-store' });
      return reponse.end(png);
    }

    if (sousChemin === '/stats.png' && methode === 'GET') {
      const jours = Math.min(90, Math.max(7, Number(url.searchParams.get('jours')) || 30));
      const serie = activite.serie(guildId, jours);
      const salons = activite.topSalons(guildId, jours, 5).map((s) => ({
        nom: guild.channels.cache.get(s.channel_id) ? `#${guild.channels.cache.get(s.channel_id).name}` : '#salon-supprime',
        total: s.total,
      }));
      const png = await require('../utils/graphiqueActivite').genererGraphique({ serveur: guild.name, serie, salons });
      reponse.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'no-store' });
      return reponse.end(png);
    }
  }

  // ------------------------------------------------------------ OUTILS
  if (chemin === '/api/sauvegarde' && methode === 'POST') {
    const sauvegardes = require('../utils/sauvegardes');
    try {
      const faite = sauvegardes.creer('panneau');
      logger.info(`Panneau : sauvegarde manuelle ${faite.nom}.`);
      return json(reponse, 200, { ok: true, nom: faite.nom, taille: faite.taille, liste: listeSauvegardes(sauvegardes) });
    } catch (e) {
      logger.erreur('Panneau : sauvegarde impossible :', e.message);
      return json(reponse, 500, { erreur: e.message });
    }
  }

  if (chemin === '/api/sauvegardes' && methode === 'GET') {
    const sauvegardes = require('../utils/sauvegardes');
    return json(reponse, 200, { liste: listeSauvegardes(sauvegardes), taille: sauvegardes.tailleBase() });
  }

  // ----------------------------------------------------------- CONSOLE
  // Le panneau interroge avec le dernier identifiant qu'il a recu : on ne
  // renvoie que la suite, jamais tout le tampon a chaque fois.
  if (chemin === '/api/console' && methode === 'GET') {
    const depuis = Math.max(0, Math.trunc(Number(url.searchParams.get('depuis')) || 0));
    // Chaque renseignement est facultatif : si un fichier de la mise a jour
    // n'est pas arrive au bon endroit, la console doit quand meme afficher
    // les lignes plutot que de renvoyer une erreur et rester vide.
    const paquet = typeof logger.lignes === 'function' ? logger.lignes(depuis, 400) : null;
    if (!paquet) {
      return json(reponse, 200, {
        lignes: [],
        curseur: 0,
        total: 0,
        probleme:
          "src/utils/logger.js n'a pas ete mis a jour : recopie ce fichier depuis l'archive, puis relance le bot.",
      });
    }
    return json(reponse, 200, {
      ...paquet,
      debug: process.env.DEBUG === 'true',
      actions: typeof logger.actionsActives === 'function' ? logger.actionsActives() : null,
      capacite: logger.TAILLE_TAMPON ?? null,
      demarre: Math.round(process.uptime()),
      memoire: Math.round(process.memoryUsage().rss / 1048576),
    });
  }

  if (chemin === '/api/console' && methode === 'POST') {
    logger.vider();
    logger.info('Console vidée depuis le panneau.');
    return json(reponse, 200, { ok: true, ...logger.lignes(0, 400) });
  }

  // -------------------------------------------------- RECHARGER / REDEMARRER
  if (chemin === '/api/maintenance' && methode === 'GET') {
    const { superviseur } = require('../utils/chargeur');
    return json(reponse, 200, {
      superviseur: superviseur(),
      commandes: client.commandes?.size ?? 0,
      demarre: Math.round(process.uptime()),
      version: process.version,
    });
  }

  if (chemin === '/api/recharger' && methode === 'POST') {
    const { chargerCommandes } = require('../utils/chargeur');
    try {
      const avant = client.commandes.size;
      const r = chargerCommandes(client, true);
      logger.info(`Panneau : ${r.chargees} commandes rechargées à chaud (${avant} avant).`);
      return json(reponse, 200, { ok: true, ...r });
    } catch (e) {
      logger.erreur('Rechargement des commandes :', e.message);
      return json(reponse, 500, { erreur: e.message });
    }
  }

  if (chemin === '/api/redemarrer' && methode === 'POST') {
    const { superviseur } = require('../utils/chargeur');
    const qui = superviseur();
    logger.avertissement(
      `Panneau : redémarrage demandé.${qui ? ` ${qui} relancera le bot.` : " Aucun superviseur détecté : le bot va s'arrêter."}`
    );
    // On repond AVANT de s'arreter : sinon le navigateur affiche une erreur
    // reseau au lieu du message qu'on vient d'ecrire.
    json(reponse, 200, { ok: true, superviseur: qui });
    setTimeout(() => process.exit(0), 400);
    return;
  }

  return json(reponse, 404, { erreur: 'Route inconnue.' });
}

// ------------------------------------------------------------ DEMARRAGE
function demarrer(client) {
  if (String(process.env.PANNEAU_ACTIF).toLowerCase() !== 'true') return null;

  const motdepasse = process.env.PANNEAU_MOTDEPASSE ?? '';
  if (motdepasse.length < 8) {
    logger.avertissement(
      'Panneau non demarre : PANNEAU_MOTDEPASSE doit faire au moins 8 caracteres dans le fichier .env.'
    );
    return null;
  }

  const port = Number(process.env.PANNEAU_PORT) || 3000;
  const cheminPage = path.join(__dirname, 'page.html');
  let page;
  try {
    page = fs.readFileSync(cheminPage);
  } catch {
    logger.erreur(`Panneau : page.html introuvable (${cheminPage}).`);
    return null;
  }

  serveur = http.createServer(async (requete, reponse) => {
    try {
      const url = new URL(requete.url, 'http://127.0.0.1');

      if (url.pathname.startsWith('/api/')) return await routerApi(requete, reponse, client, url);

      if (url.pathname === '/' && requete.method === 'GET') {
        reponse.writeHead(200, {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-store',
          'X-Content-Type-Options': 'nosniff',
          // La page n'a besoin de rien d'exterieur : on l'interdit explicitement.
          'Content-Security-Policy': "default-src 'self'; img-src 'self' data: https://cdn.discordapp.com; style-src 'unsafe-inline'; script-src 'unsafe-inline'",
        });
        return reponse.end(page);
      }

      reponse.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      reponse.end('Introuvable');
    } catch (e) {
      logger.erreur('Panneau :', e.message);
      if (!reponse.headersSent) json(reponse, 500, { erreur: 'Erreur interne.' });
      else reponse.end();
    }
  });

  serveur.on('error', (e) => {
    if (e.code === 'EADDRINUSE') {
      logger.erreur(`Panneau : le port ${port} est deja utilise. Change PANNEAU_PORT dans le .env.`);
    } else {
      logger.erreur('Panneau :', e.message);
    }
  });

  // 127.0.0.1 uniquement : inaccessible depuis le reseau local et depuis Internet.
  serveur.listen(port, '127.0.0.1', () => {
    logger.succes(`Panneau de controle : http://localhost:${port}`);
  });

  // Menage des sessions expirees
  setInterval(() => {
    const maintenant = Date.now();
    for (const [jeton, expiration] of sessions) if (expiration < maintenant) sessions.delete(jeton);
  }, 3_600_000).unref();

  return serveur;
}

function arreter() {
  serveur?.close();
  serveur = null;
  sessions.clear();
}

module.exports = { demarrer, arreter };
