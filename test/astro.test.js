/**
 * Astro Run dans Wumi : validation des sauvegardes, sessions, API servie par
 * le serveur public, records et classement par serveur.
 */
const { R } = require('./_preparer');
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

const G = '777000000000000001';
const U = '777000000000000002';

test('astro : la validation refuse ce qui est impossible', () => {
  const A = R('src/utils/astro');
  assert.equal(A.valider({ coins: 5, unlockedLevel: 3, bestTimes: { 1: 9000, 2: 12000 } }).ok, true);
  assert.equal(A.valider({ unlockedLevel: 4, bestTimes: { 1: 9000 } }).ok, false); // debloque sans progression
  assert.equal(A.valider({ bestTimes: { 1: 1200 } }).ok, false); // temps impossible
  assert.equal(A.valider({ bestTimes: { 9: 9000 } }).ok, false); // niveau inconnu
  assert.equal(A.valider({ coins: 2_000_000 }).ok, false);
  assert.deepEqual(A.nettoyer({ owned: ['pirate', 'pink'], selected: 'pirate' }).owned, ['beige', 'pink']);
});

test('astro : une session ne se falsifie pas et expire', () => {
  const A = R('src/utils/astro');
  const { jeton } = A.creerSession(U, 1000);
  assert.equal(A.lireSession(jeton, 2000).uid, U);
  assert.equal(A.lireSession(jeton, 1000 + 13 * 3_600_000), null);
  const [corps, sig] = jeton.split('.');
  const faux = Buffer.from(JSON.stringify({ uid: '1', exp: 9e15 })).toString('base64url');
  assert.equal(A.lireSession(`${faux}.${sig}`), null);
  assert.equal(A.lireSession(`${corps}.AAAA`), null);
});

test('astro : API du serveur public, sauvegarde, record du serveur et classement', async () => {
  const A = R('src/utils/astro');
  const { majConfig } = R('src/database/db');
  majConfig(G, { astro_recompenses: 0 });
  const membre = { id: U, displayAvatarURL: () => null, toString: () => `<@${U}>` };
  const guild = { id: G, name: 'Test', channels: { cache: new Map() }, members: { fetch: async () => membre } };
  const client = { user: { username: 'Wumi' }, guilds: { cache: new Map([[G, guild]]) } };
  const routes = R('src/public/serveur.js')._routes(client);
  const srv = http.createServer(routes);
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  const { jeton } = A.creerSession(U);
  const h = { Authorization: `Bearer ${jeton}`, 'Content-Type': 'application/json', 'X-Wumi-Guild': G };
  try {
    // Le jeu est servi
    const page = await fetch(`${base}/astro/`);
    assert.equal(page.status, 200);
    assert.match(await page.text(), /main\.js/);
    assert.equal((await fetch(`${base}/astro/../config.js`)).status, 404);
    // Sans session : refuse
    assert.equal((await fetch(`${base}/astro/api/save`)).status, 401);
    // Sauvegarde vide, puis une victoire
    assert.deepEqual(await (await fetch(`${base}/astro/api/save`, { headers: h })).json(), { save: null });
    const put = await fetch(`${base}/astro/api/save`, { method: 'PUT', headers: h, body: JSON.stringify({ unlockedLevel: 2, bestTimes: { 1: 15000 }, bestStars: { 1: 2 } }) });
    assert.equal(put.status, 200);
    assert.equal(A.q.record.get(G, U, 1).temps, 15000);
    // Un temps moins bon ne remplace pas le record ; un meilleur, si
    await fetch(`${base}/astro/api/save`, { method: 'PUT', headers: h, body: JSON.stringify({ unlockedLevel: 2, bestTimes: { 1: 12000 }, bestStars: { 1: 3 } }) });
    assert.equal(A.q.record.get(G, U, 1).temps, 12000);
    // Triche refusee
    const triche = await fetch(`${base}/astro/api/save`, { method: 'PUT', headers: h, body: JSON.stringify({ bestTimes: { 1: 500 } }) });
    assert.equal(triche.status, 422);
    // Classement du serveur
    const lb = await (await fetch(`${base}/astro/api/leaderboard/1`, { headers: h })).json();
    assert.equal(lb.top[0].timeMs, 12000);
    // La verification renvoie l'identifiant du support pour aiguiller le hub
    const cfg = await (await fetch(`${base}/api/config`)).json();
    assert.ok('support_id' in cfg);
    // Hors du support, la racine de l'Activite sert directement le jeu
    const racine = await (await fetch(`${base}/?guild_id=111&channel_id=222&frame_id=x`)).text();
    assert.match(racine, /main\.js/);
    assert.equal((await fetch(`${base}/assets/KENNEY_LICENSE.txt`)).status, 200);
  } finally {
    srv.close();
  }
});

test('astro : formatage des temps', () => {
  const A = R('src/utils/astro');
  assert.equal(A.formaterTemps(42_100), '0:42.1');
  assert.equal(A.formaterTemps(65_000), '1:05.0');
  assert.equal(A.etoiles(2), '★★☆');
});
