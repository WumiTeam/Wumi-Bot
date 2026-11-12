/**
 * Verifie que chaque radio de /radio se charge dans Lavalink.
 * Usage, depuis le dossier du bot :  node outils/verifier-radios.js
 */
require('dotenv').config({ quiet: true });
const RADIOS = require('../src/musique/radios');

(async () => {
  const base = (process.env.LAVALINK_URL || 'http://127.0.0.1:2333').replace(/\/+$/, '');
  for (const r of RADIOS) {
    const rep = await fetch(`${base}/v4/loadtracks?identifier=${encodeURIComponent(r.url)}`, {
      headers: { Authorization: process.env.LAVALINK_PASSWORD }, signal: AbortSignal.timeout(20_000),
    }).then((x) => x.json()).catch((e) => ({ loadType: 'erreur', data: { message: e.message } }));
    const ok = rep.loadType === 'track';
    console.log(`${ok ? 'OK  ' : 'ECHEC'} ${r.id.padEnd(10)} ${ok ? (rep.data.info.isStream ? 'direct' : 'pas en direct !') : (rep.data?.message ?? rep.loadType)}`);
  }
})();
