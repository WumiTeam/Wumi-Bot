/**
 * Les commandes se chargent, n'ont pas de doublon, et leur definition passe
 * les regles de Discord (noms, longueurs, nombre d'options). Une commande
 * qui casse ici casserait `npm run deploy`.
 */
const { racine, R } = require('./_preparer');
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const NOM = /^[-_\p{L}\p{N}]{1,32}$/u;

function fichiersCommandes(dossier) {
  return fs.readdirSync(dossier, { withFileTypes: true }).flatMap((e) => {
    const c = path.join(dossier, e.name);
    return e.isDirectory() ? fichiersCommandes(c) : c.endsWith('.js') ? [c] : [];
  });
}

const fichiers = fichiersCommandes(path.join(racine, 'src', 'commands'));
const commandes = fichiers.map((f) => ({ fichier: path.relative(racine, f), module: require(f) }));

test('chaque fichier de commande exporte data et execute', () => {
  for (const { fichier, module } of commandes) {
    assert.ok(module.data, `${fichier} : pas de data`);
    assert.equal(typeof module.execute, 'function', `${fichier} : pas de execute`);
  }
});

test('aucun nom de commande en double (une commande en ecraserait une autre)', () => {
  const vus = new Map();
  for (const { fichier, module } of commandes) {
    const j = module.data.toJSON();
    const cle = `${j.type ?? 1}:${j.name}`;
    assert.ok(!vus.has(cle), `${cle} defini dans ${vus.get(cle)} ET ${fichier}`);
    vus.set(cle, fichier);
    const fr = j.name_localizations?.fr;
    if (fr) {
      const cleFr = `${j.type ?? 1}:fr:${fr}`;
      assert.ok(!vus.has(cleFr), `nom francais ${fr} en double (${fichier})`);
      vus.set(cleFr, fichier);
    }
  }
});

test('les definitions respectent les limites de Discord', () => {
  let total = 0;
  const verifier = (options, chemin) => {
    assert.ok((options ?? []).length <= 25, `${chemin} : plus de 25 options`);
    for (const o of options ?? []) {
      assert.match(o.name, NOM, `${chemin} : nom d'option invalide « ${o.name} »`);
      for (const [l, v] of Object.entries(o.name_localizations ?? {})) assert.match(v, NOM, `${chemin} ${o.name} (${l})`);
      assert.ok(o.description && o.description.length <= 100, `${chemin} ${o.name} : description absente ou trop longue`);
      assert.ok(!/^[a-z_]+\.[a-z_.]+$/.test(o.description), `${chemin} ${o.name} : description non traduite (${o.description})`);
      for (const ch of o.choices ?? []) assert.ok(ch.name.length <= 100, `${chemin} ${o.name} : choix trop long`);
      verifier(o.options, `${chemin} ${o.name}`);
    }
  };
  for (const { fichier, module } of commandes) {
    const j = module.data.toJSON();
    if ((j.type ?? 1) === 1) {
      total++;
      assert.match(j.name, NOM, `${fichier} : nom invalide`);
      assert.ok(j.description && j.description.length <= 100, `${fichier} : description absente ou trop longue`);
      verifier(j.options, j.name);
    }
  }
  assert.ok(total <= 100, `${total} commandes slash : Discord en accepte 100`);
});

test('le chargeur du bot charge tout sans erreur', () => {
  const { Collection } = require(path.join(racine, 'node_modules', 'discord.js'));
  const client = { commandes: new Collection() };
  const r = R('src/utils/chargeur').chargerCommandes(client);
  assert.deepEqual(r.erreurs, []);
  assert.equal(client.commandes.size, commandes.length);
});

test('les commandes qui exposent toute la base sont reservees au fondateur', () => {
  const sauvegarde = R('src/commands/utilitaires/sauvegarde');
  assert.equal(sauvegarde.fondateur, true, '/sauvegarde doit etre une commande de fondateur');
});
