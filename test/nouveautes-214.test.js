/**
 * Wumi 2.14 : classement en image, evenements recurrents, sanction rapide,
 * textes du journal traduits.
 */
const { R } = require('./_preparer');
const test = require('node:test');
const assert = require('node:assert/strict');

test('classement : l image se dessine, meme avec moins de 10 lignes et sans avatar', async () => {
  const { genererCarteClassement, initiales } = R('src/utils/carteClassement');
  const png = await genererCarteClassement({
    serveur: 'Test', sousTitre: 'Page 1/1', pastille: 'Classement',
    lignes: [{ rang: 1, nom: 'Alice', valeur: '1,2k XP', part: 1, moi: true }, { rang: 2, nom: 'Bob', valeur: '800 XP', part: 0.6 }],
    pied: 'Ta place : #1',
  });
  assert.ok(png.length > 10_000);
  assert.equal(png.subarray(1, 4).toString(), 'PNG');
  assert.equal(initiales('Spider Lounge'), 'SL');
  assert.equal(initiales('🎮'), '?');
});

test('evenements : la repetition garde la meme heure locale, meme au changement d heure', () => {
  const ev = R('src/utils/evenements');
  const heureParis = (ts) => new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit' }).format(ts);
  const avant = ev.lireDate('24/03/2026', '21:00', 'Europe/Paris');
  const apres = ev.suivante(avant, 'hebdo', 'Europe/Paris'); // passe l'heure d'ete (29/03)
  assert.equal(heureParis(apres), '21:00');
  assert.equal(Math.round((apres - avant) / 3_600_000), 167);
  const fin = ev.lireDate('31/01/2026', '20:00', 'Europe/Paris');
  assert.equal(new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', day: '2-digit', month: '2-digit' }).format(ev.suivante(fin, 'mensuel')), '28/02');
  assert.equal(ev.suivante(avant, 'jamais'), null);
});

test('sanction rapide : chaque action et chaque raison a son texte, dans les deux langues', () => {
  const { ACTIONS, RAISONS } = R('src/utils/sanctionRapide');
  const { t } = R('src/utils/langues');
  for (const langue of ['fr', 'en']) {
    for (const a of Object.keys(ACTIONS)) assert.notEqual(t(`sr.action.${a}`, langue), `sr.action.${a}`);
    for (const r of RAISONS) assert.notEqual(t(`sr.raison.${r}`, langue), `sr.raison.${r}`);
  }
});

test('journal : les fiches ne contiennent plus de francais en dur pour un serveur anglais', () => {
  const { t } = R('src/utils/langues');
  for (const cle of ['msg_supprime', 'msg_modifie', 'maj_titre', 'ban_titre', 'salon_cree', 'role_supprime', 'vocal_rejoint', 'antiraid_titre', 'boost_fin']) {
    const fr = t(`journal.${cle}`, 'fr');
    const en = t(`journal.${cle}`, 'en');
    assert.notEqual(en, `journal.${cle}`);
    assert.notEqual(fr, en, cle);
  }
});
