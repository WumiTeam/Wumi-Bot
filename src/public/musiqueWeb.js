/**
 * LE LECTEUR WEB (2.41) : piloter la musique de Wumi depuis le navigateur,
 * sur le tableau de bord (dash.wumi.fr/musique/<id du serveur>).
 *
 * Routes (session du tableau de bord obligatoire, jeton anti-CSRF pour POST) :
 *   GET  /api/musique/<g>              etat du lecteur (piste, file, volume...)
 *   GET  /api/musique/<g>/recherche?q= 8 resultats, pour ajouter
 *   POST /api/musique/<g>/action       { action, ... }
 *
 * QUI PEUT QUOI : exactement les memes regles que dans Discord (droits() de
 * src/musique/lecteur.js) — etre dans le salon vocal du lecteur (sauf Gerer
 * le serveur), role DJ s'il y en a un. Pas besoin de gerer le serveur pour
 * ecouter et ajouter : n'importe quel membre present peut s'en servir.
 * Pour LANCER la musique, il faut etre dans un salon vocal du serveur.
 */
const { PermissionFlagsBits } = require('discord.js');
const { musique, droits, voter, titre } = require('../musique/lecteur');
const logger = require('../utils/logger');

const FILE_VUE = 50;

/** Le membre (pas besoin de gerer le serveur) ou null. */
async function membreDe(client, userId, guildId) {
  if (!/^\d{17,20}$/.test(String(guildId))) return null;
  const guild = client.guilds.cache.get(guildId);
  if (!guild) return null;
  return guild.members.fetch(userId).catch(() => null);
}

function piste(p) {
  if (!p) return null;
  return {
    titre: p.info?.title ?? '?',
    auteur: p.info?.author ?? '',
    duree: p.info?.isStream ? null : (p.info?.length ?? null),
    direct: Boolean(p.info?.isStream),
    image: p.info?.artworkUrl ?? null,
    lien: p.info?.uri ?? null,
    demandeur: p.demandeur ?? null,
  };
}

function etat(guild, membre) {
  const l = musique.obtenir(guild.id);
  const vocal = membre.voice?.channel ?? null;
  const base = {
    serveur: { id: guild.id, nom: guild.name, icone: guild.iconURL({ size: 128 }) },
    configure: musique.configure(),
    disponible: musique.disponible(),
    moi: { salon: vocal ? { id: vocal.id, nom: vocal.name } : null, admin: membre.permissions.has(PermissionFlagsBits.ManageGuild) },
  };
  if (!l) return { ...base, lecteur: null };
  const salon = guild.channels.cache.get(l.salonVocal);
  const noms = new Map();
  const nom = (id) => {
    if (!id) return null;
    if (!noms.has(id)) noms.set(id, guild.members.cache.get(id)?.displayName ?? null);
    return noms.get(id);
  };
  const avecNom = (p) => (p ? { ...p, demandeurNom: nom(p.demandeur) } : null);
  return {
    ...base,
    lecteur: {
      salon: salon ? { id: salon.id, nom: salon.name } : null,
      auditeurs: l.auditeurs().size,
      actuelle: avecNom(piste(l.actuelle)),
      position: l.positionActuelle(),
      pause: l.pause,
      volume: l.volume,
      boucle: l.boucle,
      filtre: l.filtre,
      modeJeu: l.modeJeu,
      file: l.file.slice(0, FILE_VUE).map((p) => avecNom(piste(p))),
      fileTotal: l.file.length,
      historique: l.historique.length,
      votes: l.votes.size,
      dansSalon: membre.voice?.channelId === l.salonVocal,
    },
  };
}

/** Lance la musique depuis le web : le salon vocal du membre. */
async function lancer(guild, membre, requete) {
  const salon = membre.voice?.channel;
  if (!salon) return { erreur: 'rejoins_vocal' };
  const perms = salon.permissionsFor(guild.members.me);
  if (!perms?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak])) return { erreur: 'droits_vocal' };
  const resultat = await musique.resoudre(requete).catch(() => null);
  if (!resultat?.pistes?.length) return { erreur: 'introuvable' };
  // Pas de salon texte : depuis le web, le panneau n'est pas poste.
  const l = await musique.creer(guild, salon.id, null).catch(() => null);
  if (!l) return { erreur: 'connexion_echec' };
  l.ajouter(resultat.pistes, membre.id);
  await l.demarrerSiBesoin();
  return { ok: true };
}

async function agir(guild, membre, corps) {
  const action = String(corps?.action ?? '');
  let l = musique.obtenir(guild.id);
  if (!musique.configure() || !musique.disponible()) return { erreur: 'indisponible' };

  if (action === 'ajouter' && !l) return lancer(guild, membre, String(corps.requete ?? '').slice(0, 300));
  if (!l) return { erreur: 'rien' };
  if (l.modeJeu) return { erreur: 'jeu' };

  const cle = { passer: 'passer', pause: 'pause', ajouter: 'ajouter', retirer: 'file', deplacer: 'file' }[action] ?? action;
  const r = droits(membre, l, cle);
  if (r.ok === false) return { erreur: r.cle === 'musique.meme_salon' ? 'meme_salon' : 'reserve_dj' };

  switch (action) {
    case 'pause':
      await l.mettreEnPause(!l.pause);
      return { ok: true };
    case 'passer':
      if (r.vote) {
        const v = await voter(l, membre.id);
        return { ok: true, vote: v };
      }
      await l.suivant({ passer: true });
      return { ok: true };
    case 'precedent':
      return (await l.precedent()) ? { ok: true } : { erreur: 'pas_de_precedent' };
    case 'boucle':
      l.boucle = { off: 'file', file: 'piste', piste: 'off' }[l.boucle] ?? 'off';
      await l.majPanneau().catch(() => null);
      return { ok: true };
    case 'melanger':
      l.melanger();
      await l.majPanneau().catch(() => null);
      return { ok: true };
    case 'volume':
      await l.regler({ volume: Number(corps.valeur) || l.volume });
      return { ok: true };
    case 'position':
      await l.regler({ position: Math.max(0, Number(corps.valeur) || 0) });
      return { ok: true };
    case 'retirer': {
      const i = Number(corps.index);
      if (!Number.isInteger(i) || i < 0 || i >= l.file.length) return { erreur: 'index' };
      const [p] = l.file.slice(i, i + 1);
      // Sans etre DJ : on ne retire que ses propres ajouts.
      const dj = require('../database/db').config(guild.id).musique_dj;
      const puissant = !dj || membre.permissions.has(PermissionFlagsBits.ManageGuild) || membre.roles.cache.has(dj);
      if (!puissant && p.demandeur !== membre.id) return { erreur: 'reserve_dj' };
      l.file.splice(i, 1);
      await l.majPanneau().catch(() => null);
      return { ok: true };
    }
    case 'jouer': {
      // Saute directement a une piste de la file.
      const i = Number(corps.index);
      if (!Number.isInteger(i) || i < 0 || i >= l.file.length) return { erreur: 'index' };
      const [p] = l.file.splice(i, 1);
      l.file.unshift(p);
      await l.suivant({ passer: true });
      return { ok: true };
    }
    case 'ajouter': {
      const res = await musique.resoudre(String(corps.requete ?? '').slice(0, 300)).catch(() => null);
      if (!res?.pistes?.length) return { erreur: 'introuvable' };
      const { ajoutees } = l.ajouter(res.pistes, membre.id, { suivant: Boolean(corps.suivant) });
      await l.demarrerSiBesoin();
      await l.majPanneau().catch(() => null);
      return { ok: true, ajoutees };
    }
    default:
      return { erreur: 'action' };
  }
}

/** @returns {Promise<boolean>} vrai si la requete a ete traitee */
async function route(req, res, url, s, client, { envoyer, lireCorps }) {
  const m = url.pathname.match(/^\/api\/musique\/(\d{17,20})(\/[a-z]+)?$/);
  if (!m) return false;
  const membre = await membreDe(client, s.user_id, m[1]);
  if (!membre) {
    envoyer(res, 403, { erreur: 'acces' });
    return true;
  }
  const guild = membre.guild;
  const sous = m[2] ?? '';
  try {
    if (req.method === 'GET' && sous === '') {
      envoyer(res, 200, etat(guild, membre));
      return true;
    }
    if (req.method === 'GET' && sous === '/recherche') {
      const q = String(url.searchParams.get('q') ?? '').trim().slice(0, 200);
      if (q.length < 2 || !musique.disponible()) {
        envoyer(res, 200, { resultats: [] });
        return true;
      }
      const r = await musique.chercher(q);
      envoyer(res, 200, {
        resultats: r.slice(0, 8).map((p) => ({ ...piste(p), requete: p.info?.uri ?? `${p.info?.title} ${p.info?.author}` })),
      });
      return true;
    }
    if (req.method === 'POST' && sous === '/action') {
      const r = await agir(guild, membre, await lireCorps(req));
      envoyer(res, r.erreur ? 400 : 200, { ...r, etat: etat(guild, membre) });
      return true;
    }
  } catch (e) {
    logger.avertissement('Lecteur web :', e.message);
    envoyer(res, 500, { erreur: 'interne' });
    return true;
  }
  envoyer(res, 404, { erreur: 'introuvable' });
  return true;
}

module.exports = { route, etat, agir, titre };
