const test = require('node:test');
const assert = require('node:assert');
const jm = require('../src/musique/jeuxMusicaux');

test('quiz : 1000 points tout de suite, 300 a la fin, bonus de serie plafonne', () => {
  assert.equal(jm.pointsQuiz(0), 1000);
  assert.equal(jm.pointsQuiz(20_000), 300);
  assert.equal(jm.pointsQuiz(99_999), 300);
  assert.ok(jm.pointsQuiz(5_000) > jm.pointsQuiz(10_000));
  assert.equal(jm.bonusSerie(1), 0);
  assert.equal(jm.bonusSerie(3), 200);
  assert.equal(jm.bonusSerie(50), 500);
});

test('vibe check : moyenne, points selon l\'ecart, hot take', () => {
  const r = jm.noterVibe(new Map([['a', 8], ['b', 7], ['c', 8], ['d', 1]]));
  assert.equal(r.moyenne, 6);
  assert.equal(r.points.get('b'), 9);
  assert.equal(r.points.get('d'), 5);
  assert.deepEqual(r.hotTake, { id: 'd', note: 1 });
  const solo = jm.noterVibe(new Map([['a', 4]]));
  assert.equal(solo.points.get('a'), 10);
  assert.equal(solo.hotTake, null);
  assert.equal(jm.noterVibe(new Map()).moyenne, null);
});

test('qui l\'a choisie : +1 par bonne reponse, +2 a l\'auteur si personne ne trouve', () => {
  const r = jm.noterQui(new Map([['a', 'x'], ['b', 'c'], ['x', 'a']]), 'x');
  assert.equal(r.trouve, 1);
  assert.equal(r.points.get('a'), 1);
  assert.equal(r.points.has('x'), false);
  const rien = jm.noterQui(new Map([['a', 'b'], ['b', 'a']]), 'x');
  assert.equal(rien.trouve, 0);
  assert.equal(rien.points.get('x'), 2);
});
