/** Wumi 2.18 : chiffrement au repos des textes sensibles. */
require('./_preparer');
const test = require('node:test');
const assert = require('node:assert/strict');
const { db, req } = require('../src/database/db');
const ch = require('../src/database/chiffrement');

const brut = (sql, ...a) => db.preparerBrut(sql).get(...a);

test('chiffrer / dechiffrer', () => {
  const c = ch.chiffrer('Salut à toi 👋');
  assert.ok(c.startsWith('enc:v1:'));
  assert.notEqual(c, ch.chiffrer('Salut à toi 👋')); // IV aleatoire
  assert.equal(ch.dechiffrer(c), 'Salut à toi 👋');
  assert.equal(ch.dechiffrer('ancien texte'), 'ancien texte');
  assert.equal(ch.chiffrer(null), null);
});

test('analyse des requetes', () => {
  const a = ch.analyser('INSERT INTO mod_notes (guild_id, user_id, auteur_id, texte, date) VALUES (?, ?, ?, ?, ?)');
  assert.deepEqual([...a.positions], [3]);
  const b = ch.analyser('UPDATE sanctions SET raison = ? WHERE id = ? AND guild_id = ?');
  assert.deepEqual([...b.positions], [0]);
  const c = ch.analyser('INSERT INTO signalements (guild_id, contenu, raison) VALUES (@guild_id, @contenu, @raison)');
  assert.deepEqual([...c.nommes].sort(), ['contenu', 'raison']);
  assert.equal(ch.analyser('UPDATE xp SET xp = ? WHERE user_id = ?'), null);
  assert.equal(ch.analyser("UPDATE sanctions SET actif = 0 WHERE guild_id = ? AND type = 'warn'"), null);
});

test('ecriture chiffree, lecture en clair (requetes nommees et positionnelles)', () => {
  const r = req.ajouterSanction.run({ guild_id: '1', user_id: '2', moderateur_id: '3', type: 'warn', raison: 'Spam dans #general', duree: null, date: Date.now() });
  const id = Number(r.lastInsertRowid);
  assert.ok(brut('SELECT raison FROM sanctions WHERE id = ?', id).raison.startsWith('enc:v1:'));
  assert.equal(req.sanctionsDe.all('1', '2')[0].raison, 'Spam dans #general');
  db.prepare('UPDATE sanctions SET raison = ? WHERE id = ? AND guild_id = ?').run('Nouvelle raison', id, '1');
  assert.ok(brut('SELECT raison FROM sanctions WHERE id = ?', id).raison.startsWith('enc:v1:'));
  assert.equal(db.prepare('SELECT raison FROM sanctions WHERE id = ?').get(id).raison, 'Nouvelle raison');
});

test('migration des anciens textes en clair', () => {
  db.preparerBrut("INSERT INTO suggestions (guild_id, numero, user_id, texte, date) VALUES ('9', 1, '8', 'Ancienne idée', 0)").run();
  const n = ch.migrer(db);
  assert.ok(n >= 1);
  assert.ok(brut("SELECT texte FROM suggestions WHERE guild_id = '9'").texte.startsWith('enc:v1:'));
  assert.equal(db.prepare("SELECT texte FROM suggestions WHERE guild_id = '9'").get().texte, 'Ancienne idée');
  assert.equal(ch.migrer(db), 0);
});
