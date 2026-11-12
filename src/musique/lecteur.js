/**
 * La musique de Wumi : un lecteur par serveur, pilote par Lavalink.
 *
 *   - file d'attente, boucle (piste / file), aleatoire, precedent ;
 *   - volume, filtres (bass boost, nightcore…), avance rapide ;
 *   - panneau interactif dans le salon : il se reposte a chaque piste pour
 *     rester en bas, et sa barre de progression avance toute seule ;
 *   - role DJ facultatif, vote pour passer une piste quand on n'est pas DJ ;
 *   - depart automatique apres 3 min sans musique ou 2 min seul, sauf en 24/7.
 *
 * SOURCES : YouTube (plugin youtube-source de Lavalink, recherche par defaut),
 * SoundCloud en secours, Bandcamp, Twitch, Vimeo, radios et liens directs.
 * Les liens Spotify (titre, album, playlist) et Deezer donnent les titres,
 * cherches ensuite sur YouTube.
 */
const {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, MessageFlags,
  PermissionFlagsBits, escapeMarkdown,
} = require('discord.js');
const C = require('../utils/composants');
const { db, config, majConfig } = require('../database/db');
const logger = require('../utils/logger');
const { Lavalink } = require('./lavalink');

db.exec(`
CREATE TABLE IF NOT EXISTS musique_playlists (
  guild_id  TEXT NOT NULL,
  nom       TEXT NOT NULL,
  pistes    TEXT NOT NULL,
  auteur    TEXT NOT NULL,
  cree_le   INTEGER NOT NULL,
  PRIMARY KEY (guild_id, nom)
);
`);

const COULEUR = 0x8b7cf6;
const FILE_MAX = 500;
const INACTIF_MS = 3 * 60_000;
const SEUL_MS = 2 * 60_000;

const FILTRES = {
  off: {},
  bassboost: { equalizer: [{ band: 0, gain: 0.3 }, { band: 1, gain: 0.25 }, { band: 2, gain: 0.15 }, { band: 3, gain: 0.08 }] },
  nightcore: { timescale: { speed: 1.2, pitch: 1.2, rate: 1 } },
  vaporwave: { timescale: { speed: 0.85, pitch: 0.8, rate: 1 } },
  slowed: { timescale: { speed: 0.8, pitch: 0.92, rate: 1 } },
  '8d': { rotation: { rotationHz: 0.2 } },
  karaoke: { karaoke: { level: 1, monoLevel: 1, filterBand: 220, filterWidth: 100 } },
};
const NOMS_FILTRES = { off: '—', bassboost: 'Bass boost', nightcore: 'Nightcore', vaporwave: 'Vaporwave', slowed: 'Slowed', '8d': '8D', karaoke: 'Karaoké' };

/* ------------------------------------------------------------------ outils */

function duree(ms) {
  if (!Number.isFinite(ms) || ms < 0) return '0:00';
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${r}` : `${m}:${r}`;
}

/** « 1:30 », « 1:02:03 » ou « 90 » -> millisecondes (null si illisible). */
function lireDuree(texte) {
  const parties = String(texte ?? '').trim().split(':');
  if (!parties.length || parties.length > 3 || parties.some((p) => !/^\d{1,3}$/.test(p))) return null;
  return parties.reduce((total, p) => total * 60 + Number(p), 0) * 1000;
}

function barre(position, total, longueur = 14) {
  if (!total) return '▬'.repeat(longueur);
  const i = Math.min(longueur - 1, Math.floor((position / total) * longueur));
  return '▬'.repeat(i) + '🔘' + '▬'.repeat(longueur - 1 - i);
}

function titre(piste, lien = true) {
  const nom = escapeMarkdown(piste.info.title || '?').slice(0, 120);
  return lien && piste.info.uri ? `[${nom.replace(/[[\]]/g, '')}](${piste.info.uri})` : nom;
}

function tr(guild) {
  return require('../utils/langues').traducteur(guild).t;
}

/* --------------------------------------------------------------- le noeud */

const musique = {
  noeud: null,
  client: null,
  lecteurs: new Map(),

  /** Lavalink est-il configure (LAVALINK_PASSWORD) ? */
  configure() {
    return Boolean(process.env.LAVALINK_PASSWORD);
  },
  disponible() {
    return Boolean(this.noeud?.pret);
  },

  init(client) {
    if (!this.configure() || this.noeud) return;
    this.client = client;
    this.noeud = new Lavalink({
      url: process.env.LAVALINK_URL || 'http://127.0.0.1:2333',
      motDePasse: process.env.LAVALINK_PASSWORD,
      userId: client.user.id,
      envoyerGateway: (guildId, paquet) => client.guilds.cache.get(guildId)?.shard.send(paquet),
    });
    client.on('raw', (p) => this.noeud.brut(p));
    this.noeud.on('evenement', (m) => this.lecteurs.get(m.guildId)?.surEvenement(m).catch((e) => logger.debug('Musique :', e.message)));
    this.noeud.on('etat', (guildId, etat) => this.lecteurs.get(guildId)?.surEtat(etat));
    this.noeud.on('deconnecte', (guildId) => this.lecteurs.get(guildId)?.detruire('deconnecte', { dejaParti: true }));
    this.noeud.on('deplace', (guildId, salon) => {
      const l = this.lecteurs.get(guildId);
      if (l) l.salonVocal = salon;
    });
    this.noeud.on('pret', (reprise) => {
      if (reprise) return;
      for (const l of this.lecteurs.values()) l.relancer().catch(() => null);
    });
    client.on('voiceStateUpdate', (avant, apres) => {
      const l = this.lecteurs.get(apres.guild.id);
      if (l && (avant.channelId === l.salonVocal || apres.channelId === l.salonVocal)) l.verifierSeul();
    });
    // La barre de progression avance toute seule.
    setInterval(() => {
      for (const l of this.lecteurs.values()) if (l.actuelle && !l.pause) l.majPanneau().catch(() => null);
    }, 20_000).unref?.();
    // Au premier contact avec Lavalink : on rallume les radios permanentes.
    this.noeud.once('pret', () => setTimeout(() => require('./radioPermanente').toutLancer().catch(() => null), 3_000));
    this.noeud.connecter();
  },

  obtenir(guildId) {
    return this.lecteurs.get(guildId) ?? null;
  },

  async creer(guild, salonVocal, salonTexte) {
    const l = new Lecteur(guild.id, salonVocal, salonTexte);
    this.lecteurs.set(guild.id, l);
    try {
      await this.noeud.rejoindre(guild.id, salonVocal);
      await this.noeud.majLecteur(guild.id, { volume: l.volume, filters: FILTRES.off });
    } catch (e) {
      this.lecteurs.delete(guild.id);
      this.noeud.quitter(guild.id).catch(() => null);
      throw e;
    }
    return l;
  },

  /** Le prefixe de recherche : YouTube par defaut, SoundCloud en secours. */
  sources() {
    const principale = process.env.MUSIQUE_RECHERCHE || 'ytsearch';
    return [...new Set([principale, 'ytsearch', 'scsearch'])];
  },

  /** Cherche des mots : la premiere source qui repond gagne. */
  async chercher(mots) {
    for (const prefixe of this.sources()) {
      const r = await this.noeud.charger(`${prefixe}:${mots}`).catch(() => null);
      if (r?.loadType === 'search' && r.data?.length) return r.data;
    }
    return [];
  },

  /** Une recherche ou un lien -> { pistes, playlist, note } */
  async resoudre(requete) {
    const q = String(requete ?? '').trim();
    let url = null;
    try { url = /^https?:\/\//i.test(q) ? new URL(q) : null; } catch { url = null; }

    if (!url) {
      const res = await this.chercher(q);
      return { pistes: res.slice(0, 1) };
    }

    const hote = url.hostname.replace(/^www\.|^m\./, '');
    // Spotify : on lit les titres (page d'integration publique), et chaque
    // titre est cherche sur YouTube au moment de le jouer.
    if (hote === 'open.spotify.com' || hote === 'spotify.link') {
      const sp = await spotify(q);
      if (!sp?.pistes.length) return { pistes: [], note: 'spotify' };
      if (sp.pistes.length === 1 && !sp.liste) {
        const res = await this.chercher(sp.pistes[0].recherche);
        return { pistes: res.slice(0, 1), note: 'spotify' };
      }
      return { pistes: sp.pistes, playlist: sp.nom, note: 'spotify' };
    }
    if (hote.endsWith('deezer.com')) {
      const id = url.pathname.match(/\/track\/(\d+)/)?.[1];
      if (!id) return { pistes: [], note: 'deezer_liste' };
      const d = await fetch(`https://api.deezer.com/track/${id}`, { signal: AbortSignal.timeout(8000) }).then((r) => r.json()).catch(() => null);
      if (!d?.title) return { pistes: [], note: 'deezer' };
      const res = await this.chercher(`${d.artist?.name ?? ''} ${d.title}`.trim());
      return { pistes: res.slice(0, 1), note: 'deezer' };
    }

    const r = await this.noeud.charger(q);
    switch (r?.loadType) {
      case 'track': return { pistes: [r.data] };
      case 'playlist': {
        const pistes = r.data.tracks ?? [];
        // Un lien « video dans une playlist » : seulement la video choisie.
        const choisie = r.data.info?.selectedTrack;
        if (choisie >= 0 && url.searchParams.has('v') && pistes[choisie]) return { pistes: [pistes[choisie]] };
        return { pistes, playlist: r.data.info?.name ?? null };
      }
      case 'search': return { pistes: r.data?.length ? [r.data[0]] : [] };
      case 'error': return { pistes: [], erreur: r.data?.message ?? 'erreur' };
      default: return { pistes: [] };
    }
  },

  /** Les 10 premiers resultats, pour l'autocompletion de /play. */
  async suggestions(requete) {
    const q = String(requete ?? '').trim();
    if (q.length < 2 || /^https?:\/\//i.test(q) || !this.disponible()) return [];
    const res = await Promise.race([
      this.noeud.charger(`${this.sources()[0]}:${q}`).catch(() => null),
      new Promise((ok) => setTimeout(() => ok(null), 2_300)),
    ]);
    if (res?.loadType !== 'search') return [];
    return res.data.slice(0, 10).map((p) => {
      const nom = `${p.info.title} — ${p.info.author}`.slice(0, 90) + ` (${p.info.isStream ? 'live' : duree(p.info.length)})`;
      const valeur = (p.info.uri?.length ?? 999) <= 100 ? p.info.uri : `${p.info.title} ${p.info.author}`.slice(0, 100);
      return { name: nom.slice(0, 100), value: valeur };
    });
  },
};

/**
 * Lit un lien Spotify (titre, album ou playlist) SANS cle d'API, grace a la
 * page d'integration publique (open.spotify.com/embed/...). Renvoie
 * { nom, liste, pistes: [{ encoded: null, recherche, info }] } ou null.
 * Les pistes sont cherchees sur YouTube au moment d'etre jouees.
 */
async function spotify(lien) {
  let url;
  try {
    url = new URL(lien);
    if (url.hostname === 'spotify.link') {
      const r = await fetch(lien, { redirect: 'follow', signal: AbortSignal.timeout(8000) });
      url = new URL(r.url);
    }
  } catch { return null; }
  const m = url.pathname.match(/\/(track|album|playlist)\/([A-Za-z0-9]{10,40})/);
  if (!m) return null;
  const [, type, id] = m;
  const html = await fetch(`https://open.spotify.com/embed/${type}/${id}`, {
    headers: { 'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36' },
    signal: AbortSignal.timeout(10_000),
  }).then((r) => (r.ok ? r.text() : null)).catch(() => null);
  const donnees = html && extraireSpotify(html);
  if (!donnees) {
    // Secours pour un titre : l'oEmbed donne au moins le nom.
    if (type !== 'track') return null;
    const nom = await oembed(`https://open.spotify.com/oembed?url=${encodeURIComponent(url.href)}`);
    return nom ? { nom: null, liste: false, pistes: [pisteSpotify({ title: nom }, url.href)] } : null;
  }
  return { nom: donnees.nom, liste: type !== 'track', pistes: donnees.pistes.slice(0, FILE_MAX).map((p) => pisteSpotify(p, url.href)) };
}

/** Le JSON de la page d'integration Spotify -> { nom, pistes: [{ title, subtitle, duration, image }] } */
function extraireSpotify(html) {
  const brut = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/)?.[1];
  if (!brut) return null;
  let json;
  try { json = JSON.parse(brut); } catch { return null; }
  const entite = trouver(json, (o) => o && typeof o === 'object' && (Array.isArray(o.trackList) || (o.type === 'track' && (o.name || o.title))));
  if (!entite) return null;
  const image = entite.visualIdentity?.image?.[0]?.url ?? entite.coverArt?.sources?.[0]?.url ?? null;
  if (Array.isArray(entite.trackList)) {
    const pistes = entite.trackList.filter((p) => p?.title).map((p) => ({ title: p.title, subtitle: p.subtitle, duration: p.duration, image }));
    return { nom: entite.name ?? entite.title ?? null, pistes };
  }
  const artistes = (entite.artists ?? []).map((a) => a.name).filter(Boolean).join(', ');
  return { nom: null, pistes: [{ title: entite.name ?? entite.title, subtitle: artistes, duration: entite.duration, image }] };
}

/** Parcourt un objet en profondeur et renvoie le premier noeud qui convient. */
function trouver(objet, test, profondeur = 0) {
  if (!objet || typeof objet !== 'object' || profondeur > 14) return null;
  if (test(objet)) return objet;
  for (const v of Object.values(objet)) {
    const r = trouver(v, test, profondeur + 1);
    if (r) return r;
  }
  return null;
}

function pisteSpotify(p, lien) {
  const artiste = String(p.subtitle ?? '').replace(/\u00a0/g, ' ').trim();
  return {
    encoded: null,
    recherche: `${artiste} ${p.title}`.trim(),
    info: {
      title: p.title, author: artiste || 'Spotify', length: Number(p.duration) || 0,
      uri: lien, artworkUrl: p.image ?? null, isStream: false, isSeekable: true, sourceName: 'spotify',
    },
  };
}

async function oembed(url) {
  const j = await fetch(url, { signal: AbortSignal.timeout(8000) }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  return j?.title ? String(j.title).slice(0, 150) : null;
}

/* ------------------------------------------------------------- le lecteur */

class Lecteur {
  constructor(guildId, salonVocal, salonTexte) {
    this.guildId = guildId;
    this.salonVocal = salonVocal;
    this.salonTexte = salonTexte;
    this.file = [];
    this.historique = [];
    this.actuelle = null;
    this.boucle = 'off'; // off | piste | file
    this.volume = Math.min(150, Math.max(1, config(guildId).musique_volume ?? 80));
    this.pause = false;
    this.filtre = 'off';
    this.votes = new Set();
    this.position = 0;
    this.majLe = Date.now();
    this.messageId = null;
    this.minuteurInactif = null;
    this.minuteurSeul = null;
    this.detruit = false;
    // Pendant un blind test : pas de panneau (il donnerait la reponse) et pas
    // d'enchainement automatique, c'est le jeu qui pilote.
    this.modeJeu = false;
    // Radio permanente (/radio permanente:oui) : relancee quand la file est vide.
    this.radioPermanente = false;
  }

  get guild() {
    return musique.client?.guilds.cache.get(this.guildId) ?? null;
  }

  get noeud() {
    return musique.noeud;
  }

  positionActuelle() {
    if (!this.actuelle) return 0;
    if (this.pause) return this.position;
    return Math.min(this.actuelle.info.length || Infinity, this.position + (Date.now() - this.majLe));
  }

  /** Les membres (hors bots) dans le salon vocal du lecteur. */
  auditeurs() {
    const salon = this.guild?.channels.cache.get(this.salonVocal);
    return salon?.members?.filter((m) => !m.user.bot) ?? new Map();
  }

  ajouter(pistes, demandeur, { suivant = false } = {}) {
    const place = Math.max(0, FILE_MAX - this.file.length);
    const ajout = pistes.slice(0, place).map((p) => ({ encoded: p.encoded, info: p.info, recherche: p.recherche, demandeur }));
    if (suivant) this.file.unshift(...ajout); else this.file.push(...ajout);
    return { ajoutees: ajout.length, refusees: pistes.length - ajout.length };
  }

  async demarrerSiBesoin() {
    if (!this.actuelle) await this.suivant();
  }

  async jouer(piste, position = 0) {
    this.annulerInactif();
    // Piste Spotify : on cherche le meme titre sur YouTube au dernier moment.
    if (!piste.encoded && piste.recherche) {
      const trouvee = (await musique.chercher(piste.recherche))[0];
      if (!trouvee) {
        await this.direSalon(`⚠️ ${tr(this.guild)('musique.illisible', { titre: titre(piste, false) })}`);
        this.actuelle = null;
        return this.suivant({ passer: true });
      }
      piste.encoded = trouvee.encoded;
      piste.info = { ...trouvee.info, artworkUrl: trouvee.info.artworkUrl ?? piste.info.artworkUrl };
    }
    this.actuelle = piste;
    this.votes.clear();
    this.position = position;
    this.majLe = Date.now();
    this.pause = false;
    await this.noeud.majLecteur(this.guildId, { track: { encoded: piste.encoded }, paused: false, position });
  }

  /** Passe a la suite. `passer` = demande explicite (ignore la boucle piste). */
  async suivant({ passer = false } = {}) {
    const fin = this.actuelle;
    if (fin) {
      this.historique.unshift(fin);
      this.historique.length = Math.min(this.historique.length, 20);
      if (!passer && this.boucle === 'piste') return this.jouer(fin);
      if (this.boucle === 'file') this.file.push(fin);
    }
    const prochaine = this.file.shift();
    if (!prochaine) {
      this.actuelle = null;
      await this.noeud.majLecteur(this.guildId, { track: { encoded: null } }).catch(() => null);
      await this.majPanneau().catch(() => null);
      // Radio permanente : la file est vide (ou le flux a coupe), on la relance.
      if (this.radioPermanente && !this.modeJeu) {
        setTimeout(() => require('./radioPermanente').relancer(this.guildId).catch(() => null), 5_000).unref?.();
        return null;
      }
      this.armerInactif();
      return null;
    }
    await this.jouer(prochaine);
    return prochaine;
  }

  async precedent() {
    const avant = this.historique.shift();
    if (!avant) return false;
    if (this.actuelle) this.file.unshift(this.actuelle);
    await this.jouer(avant);
    return true;
  }

  async mettreEnPause(oui) {
    this.position = this.positionActuelle();
    this.majLe = Date.now();
    this.pause = oui;
    await this.noeud.majLecteur(this.guildId, { paused: oui });
    await this.majPanneau().catch(() => null);
  }

  async regler({ volume, filtre, position }) {
    const maj = {};
    if (volume != null) {
      this.volume = Math.min(150, Math.max(1, Math.round(volume)));
      maj.volume = this.volume;
      majConfig(this.guildId, { musique_volume: this.volume });
    }
    if (filtre != null && FILTRES[filtre]) {
      this.filtre = filtre;
      maj.filters = FILTRES[filtre];
    }
    if (position != null && this.actuelle) {
      maj.position = Math.max(0, Math.min(position, (this.actuelle.info.length || 0) - 1000));
      this.position = maj.position;
      this.majLe = Date.now();
    }
    await this.noeud.majLecteur(this.guildId, maj);
    await this.majPanneau().catch(() => null);
  }

  melanger() {
    for (let i = this.file.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.file[i], this.file[j]] = [this.file[j], this.file[i]];
    }
  }

  /** Lavalink a redemarre sans reprendre la session : on recree tout. */
  async relancer() {
    const v = this.noeud.voix.get(this.guildId);
    if (!v) return this.detruire('erreur', { dejaParti: true });
    this.noeud.envoyerVoix(this.guildId);
    await this.noeud.majLecteur(this.guildId, { volume: this.volume, filters: FILTRES[this.filtre] });
    if (this.actuelle) await this.jouer(this.actuelle, this.positionActuelle());
  }

  surEtat(etat) {
    if (typeof etat?.position === 'number') {
      this.position = etat.position;
      this.majLe = Date.now();
    }
  }

  async surEvenement(m) {
    if (this.detruit) return;
    switch (m.type) {
      case 'TrackStartEvent':
        if (this.modeJeu) break;
        this.position = 0;
        this.majLe = Date.now();
        await this.envoyerPanneau();
        break;
      case 'TrackEndEvent':
        if (this.modeJeu) break;
        if (m.reason === 'finished' || m.reason === 'loadFailed') await this.suivant();
        break;
      case 'TrackExceptionEvent':
        if (this.modeJeu) break;
        await this.direSalon(`⚠️ ${tr(this.guild)('musique.illisible', { titre: titre({ info: m.track?.info ?? {} }, false) })}`);
        break;
      case 'TrackStuckEvent':
        if (this.modeJeu) break;
        await this.suivant({ passer: true });
        break;
      case 'WebSocketClosedEvent':
        if (m.code === 4006 || m.code === 4009) this.noeud.rejoindre(this.guildId, this.salonVocal).catch(() => null);
        break;
      default:
        break;
    }
  }

  armerInactif() {
    if (this.modeJeu) return;
    this.annulerInactif();
    if (config(this.guildId).musique_247) return;
    this.minuteurInactif = setTimeout(() => this.detruire('inactif'), INACTIF_MS);
    this.minuteurInactif.unref?.();
  }

  annulerInactif() {
    clearTimeout(this.minuteurInactif);
    this.minuteurInactif = null;
  }

  verifierSeul() {
    if (config(this.guildId).musique_247) return;
    if (this.auditeurs().size === 0) {
      if (!this.minuteurSeul) {
        this.minuteurSeul = setTimeout(() => this.detruire('seul'), SEUL_MS);
        this.minuteurSeul.unref?.();
      }
    } else if (this.minuteurSeul) {
      clearTimeout(this.minuteurSeul);
      this.minuteurSeul = null;
    }
  }

  async detruire(raison = 'stop', { dejaParti = false } = {}) {
    if (this.detruit) return;
    this.detruit = true;
    this.annulerInactif();
    clearTimeout(this.minuteurSeul);
    musique.lecteurs.delete(this.guildId);
    // Radio permanente debranchee par un moderateur : on revient dans 1 min.
    if (this.radioPermanente && raison === 'deconnecte') {
      setTimeout(() => require('./radioPermanente').lancer(this.guildId).catch(() => null), 60_000).unref?.();
    }
    if (dejaParti) await this.noeud.detruireLecteur(this.guildId);
    else await this.noeud.quitter(this.guildId).catch(() => null);
    this.actuelle = null;
    this.file = [];
    // Le panneau devient un simple message de fin, sans boutons.
    const salon = this.guild?.channels.cache.get(this.salonTexte);
    if (salon && this.messageId) {
      const t = tr(this.guild);
      await salon.messages.edit(this.messageId, {
        components: [C.conteneur([C.texte(`-# 👋 ${t(`musique.fin_${raison}`)}`)], COULEUR)],
      }).catch(() => null);
    }
  }

  async direSalon(texte) {
    const salon = this.guild?.channels.cache.get(this.salonTexte);
    if (!salon) return;
    await salon.send({ components: [C.conteneur([C.texte(texte)], COULEUR)], flags: MessageFlags.IsComponentsV2, allowedMentions: { parse: [] } }).catch(() => null);
  }

  /* ----------------------------------------------------------- panneau */

  construirePanneau() {
    const t = tr(this.guild);
    const blocs = [];
    const p = this.actuelle;
    if (p) {
      const info = p.info;
      const entete = `### 🎵 ${titre(p)}\n${escapeMarkdown(info.author || '?')} · ${info.isStream ? `🔴 ${t('musique.direct')}` : duree(info.length)}${p.demandeur ? ` · ${t('musique.par', { membre: `<@${p.demandeur}>` })}` : ''}`;
      blocs.push(info.artworkUrl ? C.sectionVignette(entete, info.artworkUrl) : C.texte(entete));
      if (!info.isStream) blocs.push(C.texte(`${barre(this.positionActuelle(), info.length)} \`${duree(this.positionActuelle())} / ${duree(info.length)}\``));
    } else {
      blocs.push(C.texte(`### 🎵 ${t('musique.file_finie')}\n${t('musique.file_finie_aide')}`));
    }
    const boucle = { off: t('musique.boucle_off'), piste: t('musique.boucle_piste'), file: t('musique.boucle_file') }[this.boucle];
    const prochaine = this.file[0] ? ` · ${t('musique.ensuite', { titre: titre(this.file[0], false).slice(0, 60) })}` : '';
    blocs.push(C.texte(`-# ${this.pause ? `⏸️ ${t('musique.en_pause')} · ` : ''}🔊 ${this.volume}% · 🔁 ${boucle} · 🎚️ ${NOMS_FILTRES[this.filtre]} · 📜 ${t('musique.en_attente', { n: this.file.length })}${prochaine}`));

    const b = (id, emoji, style = ButtonStyle.Secondary, desactive = false) => new ButtonBuilder().setCustomId(`mus_${id}`).setEmoji(emoji).setStyle(style).setDisabled(desactive);
    blocs.push(new ActionRowBuilder().addComponents(
      b('prec', '⏮️', ButtonStyle.Secondary, !this.historique.length),
      b('pause', this.pause ? '▶️' : '⏸️', ButtonStyle.Primary, !p),
      b('passer', '⏭️', ButtonStyle.Secondary, !p),
      b('stop', '⏹️', ButtonStyle.Danger),
    ));
    blocs.push(new ActionRowBuilder().addComponents(
      b('boucle', this.boucle === 'piste' ? '🔂' : '🔁', this.boucle === 'off' ? ButtonStyle.Secondary : ButtonStyle.Success),
      b('melanger', '🔀', ButtonStyle.Secondary, this.file.length < 2),
      b('volmoins', '🔉'),
      b('volplus', '🔊'),
      b('file', '📜'),
    ));
    blocs.push(new ActionRowBuilder().addComponents(new StringSelectMenuBuilder()
      .setCustomId('mus_filtre')
      .setPlaceholder(`🎚️ ${t('musique.filtre_choisir')}`)
      .addOptions(Object.keys(FILTRES).map((k) => ({ label: k === 'off' ? t('musique.filtre_aucun') : NOMS_FILTRES[k], value: k, default: k === this.filtre })))));
    return { components: [C.conteneur(blocs, COULEUR)], flags: MessageFlags.IsComponentsV2, allowedMentions: { parse: [] } };
  }

  /** Nouvelle piste : le panneau est reposte pour rester en bas du salon. */
  async envoyerPanneau() {
    if (this.modeJeu) return;
    const salon = this.guild?.channels.cache.get(this.salonTexte);
    if (!salon) return;
    const ancien = this.messageId;
    const envoye = await salon.send(this.construirePanneau()).catch(() => null);
    if (envoye) this.messageId = envoye.id;
    if (ancien && envoye) salon.messages.delete(ancien).catch(() => null);
  }

  async majPanneau() {
    if (this.modeJeu) return;
    const salon = this.guild?.channels.cache.get(this.salonTexte);
    if (!salon || !this.messageId) return;
    const { components } = this.construirePanneau();
    await salon.messages.edit(this.messageId, { components });
  }

  /** La file, en pages de 10 (reponse privee). */
  pageFile(page = 0) {
    const t = tr(this.guild);
    const pages = Math.max(1, Math.ceil(this.file.length / 10));
    const n = Math.min(Math.max(0, page), pages - 1);
    const total = this.file.reduce((s, p) => s + (p.info.isStream ? 0 : p.info.length || 0), 0);
    const lignes = this.file.slice(n * 10, n * 10 + 10).map((p, i) => `\`${n * 10 + i + 1}.\` ${titre(p)} · ${p.info.isStream ? '🔴' : duree(p.info.length)}`);
    const blocs = [
      C.texte(`## 📜 ${t('musique.file_titre')}`),
      C.texte(this.actuelle ? `**${t('musique.maintenant')}** · ${titre(this.actuelle)}` : t('musique.rien')),
      C.separateur(),
      C.texte(lignes.join('\n') || t('musique.file_vide')),
      C.texte(`-# ${t('musique.file_pied', { n: this.file.length, duree: duree(total), page: n + 1, pages })}`),
    ];
    if (pages > 1) {
      blocs.push(new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`mus_page:${n - 1}`).setEmoji('◀️').setStyle(ButtonStyle.Secondary).setDisabled(n === 0),
        new ButtonBuilder().setCustomId(`mus_page:${n + 1}`).setEmoji('▶️').setStyle(ButtonStyle.Secondary).setDisabled(n >= pages - 1),
      ));
    }
    return { components: [C.conteneur(blocs, COULEUR)], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral, allowedMentions: { parse: [] } };
  }
}

/* ------------------------------------------------------------- les droits */

/**
 * Qui peut faire quoi.
 *   - il faut etre dans le meme salon vocal (sauf Gerer le serveur) ;
 *   - si un role DJ est defini : DJ, Gerer le serveur, ou seul avec le bot.
 *     Sans etre DJ, « passer » devient un vote (la moitie des auditeurs), et
 *     on peut toujours passer SA propre piste.
 * Renvoie { ok: true } | { ok: false, cle } | { vote: true }.
 */
function droits(member, lecteur, action) {
  const admin = member.permissions.has(PermissionFlagsBits.ManageGuild);
  if (!admin && member.voice?.channelId !== lecteur.salonVocal) return { ok: false, cle: 'musique.meme_salon' };
  const dj = config(member.guild.id).musique_dj;
  if (!dj || admin || member.roles.cache.has(dj)) return { ok: true };
  if (lecteur.auditeurs().size <= 1) return { ok: true };
  if (action === 'passer') {
    if (lecteur.actuelle?.demandeur === member.id) return { ok: true };
    return { vote: true };
  }
  if (['pause', 'file', 'ajouter'].includes(action)) return { ok: true };
  return { ok: false, cle: 'musique.reserve_dj' };
}

/** Un vote pour passer. Renvoie { passe, votes, besoin }. */
async function voter(lecteur, membreId) {
  lecteur.votes.add(membreId);
  const besoin = Math.ceil(lecteur.auditeurs().size / 2);
  if (lecteur.votes.size >= besoin) {
    await lecteur.suivant({ passer: true });
    return { passe: true, votes: lecteur.votes.size, besoin };
  }
  return { passe: false, votes: lecteur.votes.size, besoin };
}

/* ---------------------------------------------------------- les playlists */

const pl = {
  liste: (g) => db.prepare('SELECT nom, pistes, auteur, cree_le FROM musique_playlists WHERE guild_id = ? ORDER BY nom').all(g)
    .map((r) => ({ ...r, n: JSON.parse(r.pistes).length })),
  /** Le vrai nom enregistre, sans tenir compte des majuscules ni des accents en capitale. */
  trouver: (g, nom) => {
    const voulu = String(nom ?? '').trim().toLocaleLowerCase('fr');
    return db.prepare('SELECT nom FROM musique_playlists WHERE guild_id = ?').all(g).find((r) => r.nom.toLocaleLowerCase('fr') === voulu)?.nom ?? null;
  },
  lire: (g, nom) => {
    const vrai = pl.trouver(g, nom);
    const r = vrai && db.prepare('SELECT pistes FROM musique_playlists WHERE guild_id = ? AND nom = ?').get(g, vrai);
    return r ? JSON.parse(r.pistes) : null;
  },
  compter: (g) => db.prepare('SELECT COUNT(*) AS n FROM musique_playlists WHERE guild_id = ?').get(g).n,
  ecrire: (g, nom, pistes, auteur) => db.prepare(`
    INSERT INTO musique_playlists (guild_id, nom, pistes, auteur, cree_le) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(guild_id, nom) DO UPDATE SET pistes = excluded.pistes, auteur = excluded.auteur, cree_le = excluded.cree_le
  `).run(g, pl.trouver(g, nom) ?? String(nom).trim(), JSON.stringify(pistes.slice(0, 200).map((p) => ({ encoded: p.encoded, info: p.info, recherche: p.recherche }))), auteur, Date.now()),
  supprimer: (g, nom) => {
    const vrai = pl.trouver(g, nom);
    return vrai ? db.prepare('DELETE FROM musique_playlists WHERE guild_id = ? AND nom = ?').run(g, vrai).changes : 0;
  },
};

module.exports = { extraireSpotify, musique, Lecteur, droits, voter, pl, duree, lireDuree, barre, FILTRES, NOMS_FILTRES, titre };
