/**
 * /pet (stades, faim, actions) et /lfg (places, expiration).
 */
const { R } = require('./_preparer');
const test = require('node:test');
const assert = require('node:assert/strict');

const G = '777777777777777777';

test('pet : adoption, faim qui baisse, actions et stades', () => {
  const pets = R('src/utils/pets');
  const p = pets.adopter(G, 'u1', 'renard', 'Mochi');
  assert.equal(p.nom, 'Mochi');
  assert.equal(pets.adopter(G, 'u1', 'chat', 'X'), null, 'un seul compagnon');
  assert.equal(pets.stade(0).cle, 'oeuf');
  assert.equal(pets.stade(5000).cle, 'legendaire');
  const plusTard = pets.vivre({ ...p, faim: 80, humeur: 80 }, p.maj_le + 10 * 3_600_000);
  assert.equal(Math.round(plusTard.faim), 50);
  assert.equal(Math.round(plusTard.humeur), 60);
  const affame = pets.vivre({ ...p, faim: 10, humeur: 80 }, p.maj_le + 3_600_000);
  assert.equal(Math.round(affame.humeur), 76, 'affame : humeur baisse 2x plus vite');
  const j = pets.agir(G, 'u1', 'jeu');
  assert.ok(j.ok);
  assert.equal(pets.agir(G, 'u1', 'jeu').ok, false, 'delai entre deux jeux');
  pets.activite(G, 'u1', 30);
  assert.ok(pets.lire(G, 'u1').xp >= 45);
  const { traducteur } = R('src/utils/langues');
  for (const loc of ['fr', 'en-US']) {
    const { t } = traducteur({ locale: loc, guildLocale: loc });
    const json = JSON.stringify(pets.panneau(pets.lire(G, 'u1'), t).components.map((x) => x.toJSON()));
    assert.ok(!/pet\.[a-z_]/.test(json), `cle non traduite (${loc})`);
  }
  assert.ok(pets.liberer(G, 'u1'));
});

test('lfg : affichage, places, expiration', async () => {
  const lfg = R('src/utils/lfg');
  const r = lfg.q.creer.run(G, 'c', 'hote', 'Valorant', 'Classé', 3, JSON.stringify(['hote']), Date.now(), Date.now() - 1000);
  const e = lfg.q.lire.get(Number(r.lastInsertRowid));
  const { traducteur } = R('src/utils/langues');
  const { t } = traducteur({ locale: 'fr', guildLocale: 'fr' });
  const json = JSON.stringify(lfg.construire(e, t).components.map((x) => x.toJSON()));
  assert.ok(json.includes('lfg_in:'));
  assert.ok(!/lfg\.[a-z_]/.test(json.replace(/lfg_[a-z]+:\d+/g, '')));
  await lfg.tour({ guilds: { cache: new Map() } });
  assert.equal(lfg.q.lire.get(e.id).statut, 'expire');
});

test('noel : tirage, points jamais negatifs, classement', () => {
  const noel = R('src/utils/noel');
  const compte = { neige: 0, chaussette: 0, cadeau: 0 };
  for (let i = 0; i < 5000; i += 1) compte[noel.tirer()] += 1;
  assert.ok(compte.neige > compte.chaussette && compte.chaussette > compte.cadeau && compte.cadeau > 100);
  const ajout = (u, points, type) => noel.q.ajouter.run({ user_id: u, points, neiges: type === 'n' ? 1 : 0, chaussettes: type === 'c' ? 1 : 0, cadeaux: type === 'g' ? 1 : 0, maj_le: Date.now() });
  ajout('a', -1, 'c');
  assert.equal(noel.stats('a').points, 0, 'jamais en dessous de 0');
  ajout('a', 3, 'g');
  ajout('b', 1, 'n');
  assert.equal(noel.stats('a').rang, 1);
  assert.equal(noel.stats('b').rang, 2);
  const { traducteur } = R('src/utils/langues');
  for (const loc of ['fr', 'en-US']) {
    const { t } = traducteur({ locale: loc, guildLocale: loc });
    const json = JSON.stringify(noel.classement(t, { userId: 'b' }).components.map((x) => x.toJSON()));
    assert.ok(!/noel\.[a-z_]/.test(json), `cle non traduite (${loc})`);
  }
  noel.vider();
});

test('snipe : garde les messages supprimes, pas les bots', () => {
  const snipe = R('src/utils/snipe');
  const msg = (contenu, bot = false) => ({ guild: {}, channel: { id: 's1' }, author: { id: 'u', bot }, content: contenu, attachments: new Map(), url: 'https://x' });
  snipe.noter('supprimes', msg('insulte'));
  snipe.noter('supprimes', msg('bot', true));
  snipe.noter('modifies', msg('après'), { avant: 'avant' });
  assert.equal(snipe.lire('s1', 'supprimes').length, 1);
  assert.equal(snipe.lire('s1', 'modifies')[0].texte, 'avant');
});
