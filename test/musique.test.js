/**
 * La musique, contre un FAUX Lavalink (HTTP + WebSocket sur un port local) :
 * connexion vocale, file, boucle, fin de piste, droits DJ, playlists.
 */
const { R } = require('./_preparer');
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { EventEmitter } = require('node:events');
const { WebSocketServer } = require('ws');
const { Collection, PermissionsBitField, PermissionFlagsBits: P } = require('discord.js');

const G = '555555555555555555';
const BOT = '1000';
const piste = (n, ms = 180_000) => ({ encoded: `enc${n}`, info: { title: `Titre ${n}`, author: 'Artiste', length: ms, uri: `https://soundcloud.com/a/${n}`, isStream: false, isSeekable: true } });

function fauxLavalink() {
  const journal = [];
  let socket = null;
  const serveur = http.createServer((req, res) => {
    let corps = '';
    req.on('data', (c) => { corps += c; });
    req.on('end', () => {
      if (req.headers.authorization !== 'secret') { res.writeHead(401).end('{}'); return; }
      journal.push({ methode: req.method, url: req.url, corps: corps ? JSON.parse(corps) : null });
      if (req.url.startsWith('/v4/loadtracks')) {
        const id = decodeURIComponent(req.url.split('identifier=')[1]);
        const json = /^[a-z]+search:/.test(id) ? { loadType: 'search', data: [piste(1), piste(2)] }
          : id.includes('/sets/') ? { loadType: 'playlist', data: { info: { name: 'Mon set' }, tracks: [piste(3), piste(4), piste(5)] } }
            : { loadType: 'empty', data: {} };
        res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(json));
        return;
      }
      if (req.method === 'DELETE') { res.writeHead(204).end(); return; }
      res.writeHead(200, { 'Content-Type': 'application/json' }).end('{}');
    });
  });
  const wss = new WebSocketServer({ server: serveur });
  wss.on('connection', (ws, req) => {
    journal.push({ ws: req.headers });
    socket = ws;
    ws.send(JSON.stringify({ op: 'ready', resumed: false, sessionId: 'S1' }));
  });
  return {
    journal,
    evenement: (m) => socket.send(JSON.stringify({ op: 'event', guildId: G, ...m })),
    demarrer: () => new Promise((r) => serveur.listen(0, '127.0.0.1', () => r(serveur.address().port))),
    fermer: () => { wss.close(); serveur.close(); },
  };
}

function fauxClient() {
  const client = new EventEmitter();
  client.user = { id: BOT };
  const envoyes = [];
  const membres = new Collection();
  const vocal = { id: 'v1', members: membres, userLimit: 0, permissionsFor: () => new PermissionsBitField(PermissionsBitField.All) };
  const texte = {
    id: 't1',
    send: async (m) => { envoyes.push(m); return { id: `m${envoyes.length}` }; },
    messages: { edit: async () => ({}), delete: async () => ({}) },
  };
  const guild = {
    id: G,
    channels: { cache: new Collection([['v1', vocal], ['t1', texte]]) },
    // Discord repond a l'opcode 4 par les deux paquets vocaux.
    shard: { send: (p) => {
      if (p.op !== 4) return;
      setImmediate(() => {
        if (!p.d.channel_id) { client.emit('raw', { t: 'VOICE_STATE_UPDATE', d: { user_id: BOT, guild_id: G, channel_id: null } }); return; }
        client.emit('raw', { t: 'VOICE_STATE_UPDATE', d: { user_id: BOT, guild_id: G, channel_id: p.d.channel_id, session_id: 'voix' } });
        client.emit('raw', { t: 'VOICE_SERVER_UPDATE', d: { guild_id: G, token: 'jeton', endpoint: 'eu.discord.media' } });
      });
    } },
  };
  client.guilds = { cache: new Collection([[G, guild]]) };
  const membre = (id, roles = []) => ({ id, user: { bot: false }, guild, voice: { channelId: 'v1' }, roles: { cache: new Collection(roles.map((r) => [r, {}])) }, permissions: new PermissionsBitField([]) });
  return { client, guild, membres, envoyes, membre };
}

const attendre = (ms = 60) => new Promise((r) => setTimeout(r, ms));

test('musique : connexion, file, boucle, fin de piste, droits, playlists', async (t) => {
  const faux = fauxLavalink();
  const port = await faux.demarrer();
  t.after(() => { faux.fermer(); R('src/musique/lecteur').musique.noeud?.fermer(); });
  process.env.LAVALINK_URL = `http://127.0.0.1:${port}`;
  process.env.LAVALINK_PASSWORD = 'secret';

  const { musique, droits, voter, pl, lireDuree, duree } = R('src/musique/lecteur');
  const { majConfig } = R('src/database/db');
  const { client, guild, membres, envoyes, membre } = fauxClient();
  musique.init(client);
  for (let i = 0; i < 50 && !musique.disponible(); i += 1) await attendre(20);
  assert.ok(musique.disponible(), 'Lavalink pret');
  assert.equal(faux.journal[0].ws['user-id'], BOT);

  // Recherche et playlist.
  const r = await musique.resoudre('daft punk');
  assert.equal(r.pistes.length, 1);
  const set = await musique.resoudre('https://soundcloud.com/x/sets/y');
  assert.equal(set.pistes.length, 3);
  assert.equal(set.playlist, 'Mon set');

  // Connexion vocale : Lavalink recoit les identifiants Discord.
  const l = await musique.creer(guild, 'v1', 't1');
  const voix = faux.journal.find((j) => j.corps?.voice);
  assert.deepEqual(voix.corps.voice, { token: 'jeton', endpoint: 'eu.discord.media', sessionId: 'voix', channelId: 'v1' });

  l.ajouter([piste(1), piste(2), piste(3)], 'u1');
  await l.demarrerSiBesoin();
  assert.equal(l.actuelle.encoded, 'enc1');
  assert.equal(faux.journal.at(-1).corps.track.encoded, 'enc1');

  faux.evenement({ type: 'TrackStartEvent', track: piste(1) });
  await attendre();
  assert.equal(envoyes.length, 1, 'le panneau est poste');

  // Fin de piste -> la suivante.
  faux.evenement({ type: 'TrackEndEvent', reason: 'finished', track: piste(1) });
  await attendre();
  assert.equal(l.actuelle.encoded, 'enc2');
  // Une piste remplacee ne declenche rien.
  faux.evenement({ type: 'TrackEndEvent', reason: 'replaced', track: piste(1) });
  await attendre();
  assert.equal(l.actuelle.encoded, 'enc2');

  // Boucle piste : la meme recommence ; passer l'ignore.
  l.boucle = 'piste';
  faux.evenement({ type: 'TrackEndEvent', reason: 'finished', track: piste(2) });
  await attendre();
  assert.equal(l.actuelle.encoded, 'enc2');
  await l.suivant({ passer: true });
  assert.equal(l.actuelle.encoded, 'enc3');
  l.boucle = 'off';
  assert.ok(await l.precedent());
  assert.equal(l.actuelle.encoded, 'enc2');
  l.file.unshift(l.actuelle);

  // Piste Spotify : cherchee au moment de la jouer.
  l.ajouter([{ encoded: null, recherche: 'Daft Punk One More Time', info: { title: 'One More Time', author: 'Daft Punk', length: 0, uri: 'https://open.spotify.com/track/x' } }], 'u1', { suivant: true });
  await l.suivant({ passer: true });
  assert.equal(l.actuelle.encoded, 'enc1', 'la piste Spotify a ete trouvee');
  assert.ok(faux.journal.some((j) => j.url?.includes('ytsearch')), 'recherche YouTube d\'abord');

  // Volume borne, filtre envoye.
  await l.regler({ volume: 400, filtre: 'nightcore' });
  assert.equal(l.volume, 150);
  assert.deepEqual(faux.journal.at(-1).corps.filters, { timescale: { speed: 1.2, pitch: 1.2, rate: 1 } });

  // Droits : role DJ, vote pour passer.
  const a = membre('u1');
  const b = membre('u2');
  const c = membre('u3', ['dj']);
  membres.set('u1', a).set('u2', b).set('u3', c);
  assert.equal(droits(a, l, 'stop').ok, true, 'sans role DJ, tout le monde controle');
  majConfig(G, { musique_dj: 'dj' });
  assert.equal(droits(b, l, 'stop').ok, false);
  assert.equal(droits(c, l, 'stop').ok, true);
  assert.equal(droits(b, l, 'passer').vote, true);
  assert.equal(droits({ ...b, voice: { channelId: 'autre' } }, l, 'pause').ok, false, 'meme salon exige');
  const avant = l.actuelle.encoded;
  const v1 = await voter(l, 'u2');
  assert.equal(v1.passe, false);
  assert.equal(v1.besoin, 2);
  const v2 = await voter(l, 'u1');
  assert.equal(v2.passe, true);
  assert.notEqual(l.actuelle.encoded, avant);

  // Playlists.
  pl.ecrire(G, 'Soirée', [l.actuelle, ...l.file], 'u1');
  assert.equal(pl.lire(G, 'soirée').length, 1 + l.file.length);
  assert.equal(pl.liste(G)[0].nom, 'Soirée');
  assert.equal(pl.supprimer(G, 'SOIRÉE'), 1);

  // Utilitaires.
  assert.equal(lireDuree('1:30'), 90_000);
  assert.equal(lireDuree('1:02:03'), 3_723_000);
  assert.equal(lireDuree('abc'), null);
  assert.equal(duree(3_723_000), '1:02:03');

  // Le panneau reste dans les limites de Discord.
  const json = JSON.stringify(l.construirePanneau().components.map((x) => x.toJSON()));
  assert.ok(!/musique\.[a-z_]/.test(json), 'cle non traduite');

  // Arret : on quitte le vocal et Lavalink detruit le lecteur.
  await l.detruire('stop');
  await attendre();
  assert.equal(musique.obtenir(G), null);
  assert.ok(faux.journal.some((j) => j.methode === 'DELETE'));
});
