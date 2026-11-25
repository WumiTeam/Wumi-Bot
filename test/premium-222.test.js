require('./_preparer');
const test = require('node:test');
const assert = require('node:assert');
const premium = require('../src/utils/premium');
const themes = require('../src/utils/themesRank');
const fondsPerso = require('../src/utils/fondsPerso');

const G = '777777777777777777';
const U = '888888888888888888';

test('themes premium : fermes sans premium, offerts avec, repli sans casse', () => {
  const exclusifs = themes.liste().filter((t) => t.premium).map((t) => t.cle);
  assert.strictEqual(exclusifs.length, 4);
  for (const cle of exclusifs) assert.strictEqual(themes.possede(G, U, cle), false);
  themes.equiper(G, U, exclusifs[0]);
  assert.strictEqual(themes.themeDe(G, U).cle, themes.CLE_DEFAUT);
  premium.accorder(G, { source: 'offert' });
  premium.oublier?.(G);
  for (const cle of exclusifs) assert.strictEqual(themes.possede(G, U, cle), true);
  assert.ok(themes.possessions(G, U).includes(exclusifs[1]));
  assert.strictEqual(themes.themeDe(G, U).cle, exclusifs[0]);
  premium.retirer(G);
  premium.oublier?.(G);
  assert.strictEqual(themes.themeDe(G, U).cle, themes.CLE_DEFAUT);
});

test('fond de cartes du serveur : seulement en premium', () => {
  assert.strictEqual(fondsPerso.fondServeur(G), null);
  assert.strictEqual(fondsPerso.fondDe(G, U), null);
});

test('/premium : sous-commandes et descriptions valides', () => {
  const json = require('../src/commands/utilitaires/premium').data.toJSON();
  assert.deepStrictEqual(json.options.map((o) => o.name), ['info', 'trial', 'bot', 'card-background']);
  for (const o of json.options) assert.ok(o.description.length <= 100);
});
