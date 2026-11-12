/**
 * Chaque texte appele dans le code existe en francais ET en anglais.
 * Sans ce test, une cle oubliee s'affiche telle quelle (« ticket.v2.titre »)
 * chez les utilisateurs.
 */
const { racine } = require('./_preparer');
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function plat(objet, prefixe = '', sortie = {}) {
  for (const [k, v] of Object.entries(objet)) {
    if (v && typeof v === 'object') plat(v, `${prefixe}${k}.`, sortie);
    else sortie[`${prefixe}${k}`] = v;
  }
  return sortie;
}
const langues = Object.fromEntries(['fr', 'en'].map((l) => [l, plat(JSON.parse(fs.readFileSync(path.join(racine, 'src', 'langues', `${l}.json`), 'utf8')))]));

function fichiers(dossier) {
  return fs.readdirSync(dossier, { withFileTypes: true }).flatMap((e) => {
    const c = path.join(dossier, e.name);
    if (e.isDirectory()) return e.name === 'node_modules' ? [] : fichiers(c);
    return c.endsWith('.js') ? [c] : [];
  });
}

test('toutes les cles appelees existent en fr et en en', () => {
  const manquantes = [];
  for (const f of fichiers(path.join(racine, 'src'))) {
    const code = fs.readFileSync(f, 'utf8');
    for (const [, cle] of code.matchAll(/\b(?:t|tr)\(\s*['`]([a-z_][\w]*(?:\.[\w]+)+)['`]/g)) {
      for (const l of ['fr', 'en']) if (!(cle in langues[l])) manquantes.push(`${l} : ${cle} (${path.relative(racine, f)})`);
    }
  }
  assert.deepEqual(manquantes, []);
});

test('les phrases au pluriel ont bien deux formes', () => {
  for (const l of ['fr', 'en']) {
    for (const [cle, v] of Object.entries(langues[l])) {
      if (typeof v === 'string' && v.includes('||')) assert.equal(v.split('||').length, 2, `${l} ${cle}`);
    }
  }
});
