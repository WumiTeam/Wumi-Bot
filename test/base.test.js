/**
 * La base de donnees. Le premier test aurait attrape le bug de /sanctions
 * (« column index out of range ») : deux requetes portant le meme nom dans
 * src/database/db.js, la seconde ecrasait la premiere sans bruit.
 */
const { racine, R } = require('./_preparer');
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('aucune requete declaree deux fois dans db.js', () => {
  const code = fs.readFileSync(path.join(racine, 'src', 'database', 'db.js'), 'utf8');
  const noms = [...code.matchAll(/^ {2}(\w+): db\.prepare/gm)].map((m) => m[1]);
  const doublons = noms.filter((n, i) => noms.indexOf(n) !== i);
  assert.deepEqual(doublons, []);
});

test('sanctionParId accepte (id, serveur) — le bug de /sanctions', () => {
  const { req } = R('src/database/db');
  assert.doesNotThrow(() => req.sanctionParId.get(1, '123456789012345678'));
  assert.doesNotThrow(() => req.sanctionParIdGlobal.get(1));
});

test('une sanction est notee, relue puis retiree', () => {
  const { req } = R('src/database/db');
  const g = '123456789012345678';
  const r = req.ajouterSanction.run({ guild_id: g, user_id: '1', moderateur_id: '2', type: 'warn', raison: 'test', duree: null, date: Date.now() });
  const id = Number(r.lastInsertRowid);
  assert.equal(req.sanctionParId.get(id, g).raison, 'test');
  assert.equal(req.sanctionParId.get(id, '999999999999999999'), undefined, 'une sanction ne doit pas fuiter vers un autre serveur');
  req.supprimerSanction.run(id, g);
  assert.equal(req.sanctionParId.get(id, g), undefined);
});
