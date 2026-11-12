/**
 * Wumi 2.13 : giveaways ponderes, /embed V2, tickets (stats), modmail,
 * cartes de bienvenue. Sans Discord.
 */
const { R } = require('./_preparer');
const test = require('node:test');
const assert = require('node:assert/strict');

const G = '888888888888888888';

test('giveaway : tirage pondere sans remise, et le bonus pese vraiment', () => {
  const { tirerPondere } = R('src/utils/giveaways');
  const liste = [{ user_id: 'a', poids: 1 }, { user_id: 'b', poids: 1 }, { user_id: 'c', poids: 3 }];
  // Sans remise : jamais deux fois le meme, jamais plus que de participants.
  for (let i = 0; i < 200; i++) {
    const g = tirerPondere(liste, 5);
    assert.equal(g.length, 3);
    assert.equal(new Set(g).size, 3);
  }
  // Le participant a 3 tickets gagne nettement plus souvent en premier.
  const premiers = { a: 0, b: 0, c: 0 };
  for (let i = 0; i < 6000; i++) premiers[tirerPondere(liste, 1)[0]]++;
  assert.ok(premiers.c > premiers.a * 2, JSON.stringify(premiers));
});

test('giveaway : poids selon le role bonus et les boosters', () => {
  const { poidsDe } = R('src/utils/giveaways');
  const membre = (roles, booste) => ({ roles: { cache: new Map(roles.map((r) => [r, {}])) }, premiumSince: booste ? new Date() : null });
  const ligne = { bonus_role: 'R1', bonus: 3, bonus_boosters: 1 };
  assert.equal(poidsDe(ligne, membre([], false)), 1);
  assert.equal(poidsDe(ligne, membre(['R1'], false)), 3);
  assert.equal(poidsDe(ligne, membre([], true)), 3);
  assert.equal(poidsDe({ bonus_role: null, bonus: 2, bonus_boosters: 0 }, membre(['R1'], true)), 1);
});

test('/embed : le rendu V2 tient dans les limites, modeles livres valides', () => {
  const { rendu, vierge, modelesIntegres } = R('src/commands/utilitaires/embed')._interne;
  const C = R('src/utils/composants');
  const { t } = R('src/utils/langues');
  const plein = {
    ...vierge(), titre: 'T', description: 'D', banniere: 'https://a.b/c.png', vignette: 'https://a.b/d.png', image: 'https://a.b/e.png', pied: 'P', role: '123456789012345678',
    sections: Array.from({ length: 5 }, (_, i) => ({ titre: `S${i}`, texte: 'x' })),
    boutons: Array.from({ length: 5 }, (_, i) => ({ label: `B${i}`, url: 'https://wumi.fr' })),
  };
  const total = rendu(plein).reduce((n, c) => n + C.compter(c), 0);
  assert.ok(total <= 30, `trop de composants (${total})`);
  for (const langue of ['fr', 'en']) {
    for (const [cle, m] of Object.entries(modelesIntegres((k, v) => t(k, langue, v)))) {
      assert.ok(m.titre && !m.titre.startsWith('emb.'), `${cle} ${langue}`);
      assert.doesNotThrow(() => C.envoi(rendu(m)));
    }
  }
});

test('tickets : premiere reponse, stats globales et par membre du staff', () => {
  const { db, req } = R('src/database/db');
  const { q } = R('src/utils/tickets');
  const maintenant = Date.now();
  for (const [n, pris, rep, note] of [[1, 'S1', 60_000, 5], [2, 'S1', 120_000, 4], [3, 'S2', null, null]]) {
    req.creerTicket.run({ guild_id: G, numero: n, channel_id: `c${n}`, user_id: `u${n}`, type: null, sujet: null, description: null, cree_le: maintenant - 3_600_000 });
    if (pris) q.prendre.run(pris, maintenant, `c${n}`);
    if (rep) q.premiereReponse.run(maintenant - 3_600_000 + rep, `c${n}`);
    if (note) db.prepare('UPDATE tickets SET note = ? WHERE channel_id = ?').run(note, `c${n}`);
  }
  // La premiere reponse ne s'ecrase pas.
  q.premiereReponse.run(maintenant, 'c1');
  const g = q.statsGlobal.get(G, maintenant - 86_400_000);
  assert.equal(g.total, 3);
  assert.equal(Math.round(g.reponse), 90_000);
  assert.equal(g.note, 4.5);
  const staff = q.statsStaff.all(G, maintenant - 86_400_000);
  assert.equal(staff[0].pris_par, 'S1');
  assert.equal(staff[0].n, 2);
});

test('modmail : une seule conversation ouverte par membre, retrouvee par son fil', () => {
  const { q } = R('src/utils/modmail');
  q.creer.run('U1', 'F1', 'fr', Date.now());
  assert.equal(q.ouverteDe.get('U1').thread_id, 'F1');
  assert.equal(q.parFil.get('F1').user_id, 'U1');
  q.fermer.run(Date.now(), 'S', q.ouverteDe.get('U1').id);
  assert.equal(q.ouverteDe.get('U1'), undefined);
  assert.equal(q.precedentes.get('U1').n, 1);
});

test('cartes de bienvenue : couleurs, tirage et mode fixe', () => {
  const cartes = R('src/utils/cartesBienvenue');
  const { majConfig } = R('src/database/db');
  assert.equal(cartes.couleur('#FFBE50'), '#ffbe50');
  assert.equal(cartes.couleur('rouge'), undefined);
  assert.equal(cartes.couleur(''), null);
  assert.equal(cartes.choisir(G), null);
  cartes.q.creer.run(G, 'A', 'gauche', '#ffffff', null, null, Date.now());
  cartes.q.creer.run(G, 'B', 'minimal', null, null, null, Date.now());
  const vus = new Set(Array.from({ length: 60 }, () => cartes.choisir(G).nom));
  assert.deepEqual([...vus].sort(), ['A', 'B']);
  majConfig(G, { bienvenue_carte_fixe: cartes.q.parNom.get(G, 'B').id });
  assert.equal(cartes.choisir(G).nom, 'B');
  assert.equal(cartes.pourDessin(cartes.choisir(G)).style, 'minimal');
});
