require('./_preparer');
const test = require('node:test');
const assert = require('node:assert');
const crypto = require('node:crypto');
const { emballer, deballer, empreinteCle } = require('../src/utils/sauvegardesFormat');

test('sauvegarde chiffree : aller-retour et mauvaise cle', () => {
  const base = Buffer.from('SQLite format 3\0' + 'x'.repeat(5000));
  const paquet = emballer(base);
  assert.ok(paquet.subarray(0, 7).equals(Buffer.from('WUMIBK1')));
  assert.ok(!paquet.includes(Buffer.from('SQLite')));
  assert.deepStrictEqual(deballer(paquet), base);
  assert.throws(() => deballer(paquet, crypto.randomBytes(32)));
  assert.match(empreinteCle(), /^[0-9a-f]{8}$/);
});
