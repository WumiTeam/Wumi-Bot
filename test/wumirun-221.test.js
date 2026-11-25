require('./_preparer');
const test = require('node:test');
const assert = require('node:assert');
const { majConfig, config } = require('../src/database/db');
const A = require('../src/utils/astro');
const D = require('../src/utils/defiHebdo');
const eco = require('../src/utils/economie');

const G = '444444444444444444';
const U = '555555555555555555';
const membre = { id: U };
const client = { guilds: { cache: new Map([[G, { id: G, name: 'Test', members: { fetch: async (id) => (id === U ? membre : null) }, channels: { cache: new Map() } }]]) } };

test('semaine : lundi UTC, niveau qui tourne de 1 a 5', () => {
  const s = D.semaine(Date.UTC(2026, 10, 12, 18));
  assert.strictEqual(s.id, '2026-11-09');
  assert.strictEqual(new Date(s.debut).getUTCDay(), 1);
  assert.ok(s.niveau >= 1 && s.niveau <= 5);
  assert.strictEqual(D.semaine(s.fin).niveau, (s.niveau % 5) + 1);
});

test('defi : seul le niveau de la semaine compte, meilleur temps garde, rafales refusees', async () => {
  const s = D.semaine();
  const autre = (s.niveau % 5) + 1;
  assert.strictEqual((await D.enregistrer(client, U, { niveau: autre, temps: 40_000 }, { guildId: G })).raison, 'autre niveau');
  const r1 = await D.enregistrer(client, '666666666666666666', { niveau: s.niveau, temps: 40_000, etoiles: 2 }, { guildId: G });
  assert.strictEqual(r1.raison, 'hors serveur');
  const r2 = await D.enregistrer(client, U, { niveau: s.niveau, temps: 2000 }, { guildId: G });
  assert.strictEqual(r2.raison, 'temps');
});

test('conversion : pieces retirees, monnaie creditee, jeu ouvert corrige', async () => {
  majConfig(G, { eco_actif: 1, astro_taux: 3 });
  A.q.ecrireJoueur.run({ user_id: U, nom: 'Joueur', avatar: null, save: JSON.stringify({ ...A.defaut(), coins: 100 }), rev: 1, maj_le: Date.now() });
  const avant = eco.solde(G, U);
  const r = A.convertir(G, U, 40);
  assert.ok(r.ok);
  assert.strictEqual(r.gain, 120);
  assert.strictEqual(eco.solde(G, U) - avant, 120);
  assert.strictEqual(JSON.parse(A.q.joueur.get(U).save).coins, 60);
  assert.strictEqual(A.convertir(G, U, 61).raison, 'pas_assez');
  // Le jeu, encore ouvert, croit avoir 100 pieces (+5 ramassees) : on en retire 40.
  await A.sauvegarder(client, U, { ...A.defaut(), coins: 105 }, {});
  assert.strictEqual(JSON.parse(A.q.joueur.get(U).save).coins, 65);
  A.q.remettreADeduire.run(U);
  majConfig(G, { astro_taux: 0 });
  assert.strictEqual(A.convertir(G, U).raison, 'coupee');
  assert.ok(config(G));
});

test('defi : le message se construit, classement compris', () => {
  const s = D.semaine();
  D.q.ecrire.run(s.id, G, U, 41_234, 3, Date.now());
  majConfig(G, { xp_actif: 1 });
  const m = D.vue({ id: G, name: 'Test', preferredLocale: 'fr' }, s, { pour: U });
  const json = JSON.stringify(m);
  assert.match(json, /0:41\.2/);
  assert.match(json, new RegExp(U));
});
