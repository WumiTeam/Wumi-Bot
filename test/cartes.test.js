/**
 * Wumi 2.34 : cartes a collectionner (tirage, gains, recyclage, vitrine, dessin).
 */
const { R } = require('./_preparer');
const test = require('node:test');
const assert = require('node:assert');

const k = R('src/utils/cartes');
const { SERIE1, TOTAL } = R('src/utils/cartes/serie1');
const G = '777000000000000001';

test('serie 1 : 72 cartes, numeros 1..72 uniques, 12 par famille', () => {
  assert.strictEqual(TOTAL, 72);
  assert.deepStrictEqual(SERIE1.map((c) => c.numero), Array.from({ length: 72 }, (_, i) => i + 1));
  assert.strictEqual(new Set(SERIE1.map((c) => c.nom)).size, 72);
  for (const f of k.FAMILLES) assert.strictEqual(SERIE1.filter((c) => c.element === f).length, 12, f);
});

test('tirage : 5 cartes, emplacement 4 toujours rare ou mieux, chances de chaque emplacement = 100', () => {
  for (const t of k.EMPLACEMENTS) assert.ok(Math.abs(Object.values(t).reduce((a, b) => a + b, 0) - 100) < 1e-9);
  for (let i = 0; i < 300; i++) {
    const b = k.tirer();
    assert.strictEqual(b.length, 5);
    assert.ok(['rare', 'epique', 'legendaire', 'mythique'].includes(b[3].carte.rarete));
  }
});

test('gains : un booster tous les N messages, stock plafonne', () => {
  const U = 'u1';
  const n = k.reglages(G).messages;
  for (let i = 0; i < n - 1; i++) assert.strictEqual(k.noterMessage(G, U), false);
  assert.strictEqual(k.noterMessage(G, U), true);
  assert.strictEqual(k.resume(G, U).boosters, 1);
  assert.ok(k.quotidien(G, U).ok);
  assert.strictEqual(k.quotidien(G, U).ok, false);
});

test('ouverture : les cartes vont dans la collection, la plus rare en dernier', () => {
  const U = 'u1';
  const o = k.ouvrir(G, U);
  assert.strictEqual(o.cartes.length, 5);
  const ordre = o.cartes.map((x) => k.RARETES.indexOf(x.carte.rarete));
  assert.deepStrictEqual(ordre, [...ordre].sort((a, b) => a - b));
  const total = [...k.collection(G, U).values()].reduce((a, x) => a + x.quantite, 0);
  assert.strictEqual(total, 5);
  assert.ok(k.ouvrir(G, U));
  assert.strictEqual(k.ouvrir(G, U), null);
});

test('recyclage : garde un exemplaire de chaque, la poussiere devient des boosters', () => {
  const U = 'u1';
  const avant = k.collection(G, U).size;
  k.recycler(G, U);
  const apres = k.collection(G, U);
  assert.strictEqual(apres.size, avant);
  for (const x of apres.values()) assert.ok(x.quantite <= 2); // au plus 1 normale + 1 brillante
});

test('vitrine : seulement des cartes possedees, 5 au plus', () => {
  const U = 'u1';
  const a = [...k.collection(G, U).keys()];
  const deck = k.definirDeck(G, U, [...a, 999, 998, 997, 996, 995]);
  assert.ok(deck.length <= 5);
  for (const n of deck) assert.ok(a.includes(n));
});

test('dessin : une carte et une page de classeur se dessinent', async () => {
  const dessin = R('src/utils/cartes/dessin');
  const cv = await dessin.carte(SERIE1[71], { brillante: true });
  assert.strictEqual(cv.width, dessin.W);
  const p = await dessin.page(SERIE1.slice(0, 12).map((c, i) => ({ carte: c, possedee: i % 2 === 0, quantite: 1 })), { titre: 'Pixel', element: 'pixel' });
  assert.ok(p.toBuffer('image/png').length > 10000);
});
