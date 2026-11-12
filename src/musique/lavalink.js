/**
 * Un client Lavalink v4 minimal, sans dependance en plus (ws est deja la,
 * apporte par discord.js).
 *
 * Lavalink est un serveur Java qui decode l'audio et l'envoie a Discord. Le
 * bot ne fait que lui dire quoi jouer :
 *
 *   - un WebSocket (/v4/websocket) pour recevoir les evenements (debut et fin
 *     de piste, position…) ;
 *   - une API REST pour chercher des pistes et piloter les lecteurs.
 *
 * LA VOIX : pour qu'un lecteur parle dans un salon, Lavalink a besoin des
 * identifiants de la connexion vocale Discord. Le bot demande a rejoindre le
 * salon (opcode 4 sur la gateway), Discord repond par deux paquets
 * VOICE_STATE_UPDATE (session) et VOICE_SERVER_UPDATE (jeton, serveur), et on
 * transmet le tout a Lavalink. `brut()` doit recevoir les paquets bruts du
 * client (client.on('raw')).
 *
 * Si Lavalink redemarre, on se reconnecte tout seul ; la session est reprise
 * quand c'est possible (resuming), sinon l'evenement 'pret' le signale avec
 * resumed = false et les lecteurs se relancent.
 */
const { EventEmitter } = require('node:events');
const WebSocket = require('ws');
const logger = require('../utils/logger');

class Lavalink extends EventEmitter {
  /**
   * @param {object} o
   * @param {string} o.url        http://127.0.0.1:2333
   * @param {string} o.motDePasse
   * @param {string} o.userId     l'identifiant du bot
   * @param {(guildId: string, paquet: object) => void} o.envoyerGateway
   */
  constructor({ url, motDePasse, userId, envoyerGateway }) {
    super();
    this.base = url.replace(/\/+$/, '');
    this.motDePasse = motDePasse;
    this.userId = userId;
    this.envoyerGateway = envoyerGateway;
    this.sessionId = null;
    this.pret = false;
    this.ws = null;
    this.essais = 0;
    this.arret = false;
    this.voix = new Map(); // guildId -> { sessionId, token, endpoint, channelId, attente }
  }

  connecter() {
    if (this.arret) return;
    const headers = {
      Authorization: this.motDePasse,
      'User-Id': this.userId,
      'Client-Name': 'Wumi/2.7',
    };
    if (this.sessionId) headers['Session-Id'] = this.sessionId;
    const ws = new WebSocket(`${this.base.replace(/^http/, 'ws')}/v4/websocket`, { headers });
    this.ws = ws;

    ws.on('message', (donnees) => {
      let m;
      try { m = JSON.parse(String(donnees)); } catch { return; }
      if (m.op === 'ready') {
        this.sessionId = m.sessionId;
        this.pret = true;
        this.essais = 0;
        this.rest('PATCH', `/v4/sessions/${this.sessionId}`, { resuming: true, timeout: 60 }).catch(() => null);
        logger.info?.(`Lavalink connecte (${m.resumed ? 'session reprise' : 'nouvelle session'}).`);
        this.emit('pret', Boolean(m.resumed));
      } else if (m.op === 'playerUpdate') {
        this.emit('etat', m.guildId, m.state);
      } else if (m.op === 'event') {
        this.emit('evenement', m);
      } else if (m.op === 'stats') {
        this.stats = m;
      }
    });
    ws.on('close', () => {
      this.pret = false;
      if (this.ws === ws) this.ws = null;
      if (this.arret) return;
      const delai = Math.min(60_000, 3_000 * 2 ** Math.min(this.essais, 5));
      this.essais += 1;
      if (this.essais === 1 || this.essais % 10 === 0) logger.avertissement?.(`Lavalink injoignable, nouvel essai dans ${Math.round(delai / 1000)} s.`);
      setTimeout(() => this.connecter(), delai).unref?.();
    });
    ws.on('error', () => null); // 'close' suit toujours
  }

  fermer() {
    this.arret = true;
    this.ws?.close();
  }

  async rest(methode, chemin, corps) {
    const r = await fetch(this.base + chemin, {
      method: methode,
      headers: { Authorization: this.motDePasse, 'Content-Type': 'application/json' },
      body: corps === undefined ? undefined : JSON.stringify(corps),
      signal: AbortSignal.timeout(15_000),
    });
    if (r.status === 204) return null;
    const json = await r.json().catch(() => null);
    if (!r.ok) {
      const e = new Error(json?.message || `Lavalink ${r.status}`);
      e.statut = r.status;
      throw e;
    }
    return json;
  }

  /** Cherche : une URL, ou « scsearch:mots » etc. */
  charger(identifiant) {
    return this.rest('GET', `/v4/loadtracks?identifier=${encodeURIComponent(identifiant)}`);
  }

  majLecteur(guildId, donnees, { noReplace = false } = {}) {
    if (!this.sessionId) return Promise.reject(new Error('Lavalink non connecte'));
    return this.rest('PATCH', `/v4/sessions/${this.sessionId}/players/${guildId}?noReplace=${noReplace}`, donnees);
  }

  detruireLecteur(guildId) {
    if (!this.sessionId) return Promise.resolve();
    return this.rest('DELETE', `/v4/sessions/${this.sessionId}/players/${guildId}`).catch(() => null);
  }

  /** Rejoint un salon vocal ; se resout quand Lavalink a la connexion. */
  rejoindre(guildId, channelId) {
    const v = this.voix.get(guildId) ?? {};
    v.channelId = channelId;
    this.voix.set(guildId, v);
    const promesse = new Promise((resolve, reject) => {
      const minuteur = setTimeout(() => {
        v.attente = null;
        reject(new Error('delai'));
      }, 12_000);
      v.attente = (err) => {
        clearTimeout(minuteur);
        v.attente = null;
        if (err) reject(err); else resolve();
      };
    });
    this.envoyerGateway(guildId, { op: 4, d: { guild_id: guildId, channel_id: channelId, self_mute: false, self_deaf: true } });
    return promesse;
  }

  quitter(guildId) {
    this.voix.delete(guildId);
    this.envoyerGateway(guildId, { op: 4, d: { guild_id: guildId, channel_id: null, self_mute: false, self_deaf: false } });
    return this.detruireLecteur(guildId);
  }

  /** Les paquets bruts de la gateway Discord. */
  brut(paquet) {
    if (paquet?.t === 'VOICE_STATE_UPDATE') {
      const d = paquet.d;
      if (d?.user_id !== this.userId || !d.guild_id) return;
      if (!d.channel_id) {
        const avait = this.voix.has(d.guild_id);
        this.voix.delete(d.guild_id);
        if (avait) this.emit('deconnecte', d.guild_id);
        return;
      }
      const v = this.voix.get(d.guild_id) ?? {};
      const deplace = v.channelId && v.channelId !== d.channel_id;
      v.sessionId = d.session_id;
      v.channelId = d.channel_id;
      this.voix.set(d.guild_id, v);
      if (deplace) this.emit('deplace', d.guild_id, d.channel_id);
      this.envoyerVoix(d.guild_id);
    } else if (paquet?.t === 'VOICE_SERVER_UPDATE') {
      const d = paquet.d;
      if (!d?.guild_id || !this.voix.has(d.guild_id)) return;
      const v = this.voix.get(d.guild_id);
      v.token = d.token;
      v.endpoint = d.endpoint; // peut etre null le temps que Discord choisisse un serveur
      this.envoyerVoix(d.guild_id);
    }
  }

  envoyerVoix(guildId) {
    const v = this.voix.get(guildId);
    if (!v?.sessionId || !v.token || !v.endpoint) return;
    this.majLecteur(guildId, { voice: { token: v.token, endpoint: v.endpoint, sessionId: v.sessionId, channelId: v.channelId } })
      .then(() => v.attente?.())
      .catch((e) => v.attente?.(e));
  }
}

module.exports = { Lavalink };
