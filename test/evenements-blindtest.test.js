/**
 * Blind test (reponses) et evenements (dates, inscriptions, liste d'attente).
 */
const { R } = require('./_preparer');
const test = require('node:test');
const assert = require('node:assert/strict');

test('blind test : reponses tolerantes, indices', () => {
  const { correspond, indice } = R('src/musique/blindtest');
  assert.ok(correspond('alors on danse', 'Alors on danse'));
  assert.ok(correspond('Alors on dance', 'Alors on danse'), 'petite faute');
  assert.ok(correspond('papaoutai !!', 'Papaoutai'));
  assert.ok(correspond('cest sante de stromae', 'Santé'), 'titre dans la phrase');
  assert.ok(correspond('dont stop me now', "Don't Stop Me Now"));
  assert.ok(correspond('sweet dreams', 'Sweet Dreams (Are Made of This)'));
  assert.ok(!correspond('danse', 'Alors on danse'));
  assert.ok(!correspond('die', 'Dieu'));
  assert.ok(!correspond('', 'Toxic'));
  assert.equal(indice('Alors on danse'), 'A____  o_  d____');
  assert.equal(indice("L'aventurier"), "L'__________");
  const titres = R('src/musique/blindtest-titres');
  for (const [theme, liste] of Object.entries(titres)) {
    assert.ok(liste.length >= 20, theme);
    assert.equal(new Set(liste.map((m) => m.join('|'))).size, liste.length, `doublon dans ${theme}`);
  }
});

test('evenements : lecture des dates dans un fuseau', () => {
  const { lireDate } = R('src/utils/evenements');
  const now = Date.UTC(2026, 10, 8, 12, 0); // 8 nov 2026
  assert.equal(lireDate('25/12', '21:00', 'Europe/Paris', now), Date.UTC(2026, 11, 25, 20, 0), 'hiver UTC+1');
  assert.equal(lireDate('14/07/2027', '22h', 'Europe/Paris', now), Date.UTC(2027, 6, 14, 20, 0), 'ete UTC+2');
  assert.equal(lireDate('2027-01-02', '9h30', 'America/New_York', now), Date.UTC(2027, 0, 2, 14, 30));
  assert.equal(lireDate('01/03', '10:00', 'Europe/Paris', now), Date.UTC(2027, 2, 1, 9, 0), 'sans annee : la prochaine');
  assert.equal(lireDate('31/02/2027', '10:00', 'Europe/Paris', now), null);
  assert.equal(lireDate('demain', '10:00', 'Europe/Paris', now), null);
  assert.equal(lireDate('25/12', '25:00', 'Europe/Paris', now), null);
  assert.equal(lireDate('25/12', '21:00', 'Pas/Un_Fuseau', now), null);
});

test('evenements : places, liste d attente et promotion', () => {
  const ev = R('src/utils/evenements');
  const r = ev.q.creer.run('666666666666666666', '1', 'org', 'Soirée', null, Date.now() + 3_600_000, 2, null);
  const id = Number(r.lastInsertRowid);
  const lire = () => ev.q.lire.get(id);
  assert.equal(ev.inscrire(lire(), 'a').cle, 'evenement.inscrit');
  assert.equal(ev.inscrire(lire(), 'a').cle, 'evenement.deja_inscrit');
  assert.equal(ev.inscrire(lire(), 'b').cle, 'evenement.inscrit');
  const c = ev.inscrire(lire(), 'c');
  assert.equal(c.cle, 'evenement.en_attente');
  assert.equal(c.vars.n, 1);
  ev.inscrire(lire(), 'd');
  const sortie = ev.desinscrire(lire(), 'a');
  assert.equal(sortie.promu, 'c', 'le premier en attente prend la place');
  assert.deepEqual(JSON.parse(lire().inscrits), ['b', 'c']);
  assert.deepEqual(JSON.parse(lire().attente), ['d']);
  assert.equal(ev.desinscrire(lire(), 'zz').cle, 'evenement.pas_inscrit');
  const { traducteur } = R('src/utils/langues');
  for (const loc of ['fr', 'en-US']) {
    const { t } = traducteur({ locale: loc, guildLocale: loc });
    const json = JSON.stringify(ev.construire(lire(), t).components.map((x) => x.toJSON()));
    assert.ok(!/evenement\.[a-z_]/.test(json), `cle non traduite (${loc})`);
  }
});

test('incidents : etats, historique, bandeau', () => {
  const inc = R('src/utils/incidents');
  const i = inc.creer({ type: 'incident', titre: 'Musique coupée', message: 'On regarde', impact: 'critique' });
  assert.equal(i.statut, 'investigation');
  assert.equal(inc.bandeau().niveau, 'critique');
  assert.equal(inc.mettreAJour(i.id, 'en_cours', 'x'), null, 'etat de maintenance refuse pour un incident');
  inc.mettreAJour(i.id, 'identifie', 'Lavalink planté');
  const fin = inc.mettreAJour(i.id, 'resolu', 'Relancé');
  assert.equal(fin.majs.length, 3);
  assert.ok(fin.fin);
  assert.equal(inc.bandeau(), null);
  const m = inc.creer({ type: 'maintenance', titre: 'Mise à jour', message: 'Redémarrage', debut: Date.now() + 3_600_000 });
  assert.equal(m.statut, 'prevue');
  assert.equal(inc.bandeau().niveau, 'prevue');
  const api = inc.pourApi();
  assert.equal(api.actifs.length, 1);
  assert.equal(api.recents.length, 2);
  const { traducteur } = R('src/utils/langues');
  const { t } = traducteur({ locale: 'fr', guildLocale: 'fr' });
  const json = JSON.stringify(inc.annonce(fin, t).components.map((x) => x.toJSON()));
  assert.ok(!/incident\.[a-z_]/.test(json));
  assert.ok(inc.supprimer(m.id));
});
