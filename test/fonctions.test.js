/**
 * Le comportement des systemes, sans Discord : un faux serveur suffit.
 */
const { R } = require('./_preparer');
const test = require('node:test');
const assert = require('node:assert/strict');

const G = '123456789012345678';

test('sanctions : le MP part AVANT le ban, et un ban rate ne laisse rien', async () => {
  const { enregistrer } = R('src/utils/sanctions');
  const { db } = R('src/database/db');
  const ordre = [];
  const guild = { id: G, name: 'Test', channels: { cache: new Map() } };
  const cible = { id: '987698769876987698', username: 'cible', tag: 'cible', displayAvatarURL: () => null, toString: () => '<@c>', send: async () => { ordre.push('mp'); return {}; } };
  const modo = { id: '111122223333444455', username: 'modo', tag: 'modo', toString: () => '<@m>' };

  await enregistrer({ guild, cible, moderateur: modo, type: 'ban', raison: 'x', action: async () => ordre.push('ban') });
  assert.deepEqual(ordre, ['mp', 'ban']);

  const avant = db.prepare('SELECT COUNT(*) n FROM sanctions WHERE guild_id = ?').get(G).n;
  await assert.rejects(enregistrer({ guild, cible, moderateur: modo, type: 'kick', raison: 'x', action: async () => { throw new Error('refus'); } }));
  assert.equal(db.prepare('SELECT COUNT(*) n FROM sanctions WHERE guild_id = ?').get(G).n, avant);
});

test('paliers : defaut, modification, valeurs invalides ignorees', () => {
  const p = R('src/utils/paliers');
  R('src/database/db').config(G);
  assert.equal(p.lire(G)[3].type, 'mute');
  p.definir(G, 2, 'kick');
  p.definir(G, 3, 'aucune');
  assert.equal(p.lire(G)[2].type, 'kick');
  assert.equal(p.lire(G)[3], undefined);
  assert.deepEqual(p.nettoyer({ x: { type: 'ban' }, 4: { type: 'nuke' }, 5: { type: 'mute', duree: 5 } }), {});
  p.reinitialiser(G);
});

test('morpion : victoire, egalite, et le niveau difficile ne perd jamais', () => {
  const { gagnant, coupDuBot } = R('src/commands/utilitaires/tictactoe')._interne;
  assert.equal(gagnant([0, 0, 0, null, 1, 1, null, null, null]).joueur, 0);
  assert.equal(gagnant([0, 1, 0, 0, 1, 1, 1, 0, 0]).joueur, null);
  // Le bot (1) doit bloquer la ligne du haut.
  assert.equal(coupDuBot([0, 0, null, null, 1, null, null, null, null], 1, 'difficile'), 2);
  // 30 parties contre un joueur au hasard : jamais de defaite.
  for (let n = 0; n < 30; n++) {
    const plateau = Array(9).fill(null);
    let tour = 0;
    let fin = null;
    while (!fin) {
      const libres = plateau.map((x, i) => (x === null ? i : null)).filter((x) => x !== null);
      const i = tour === 0 ? libres[Math.floor(Math.random() * libres.length)] : coupDuBot(plateau, 1, 'difficile');
      plateau[i] = tour;
      fin = gagnant(plateau);
      tour = 1 - tour;
    }
    assert.notEqual(fin.joueur, 0, 'le niveau difficile a perdu');
  }
});

test('embed : couleur et liens verifies', () => {
  const { couleur, urlValide } = R('src/commands/utilitaires/embed')._interne;
  assert.equal(couleur('#58a6ff'), 0x58a6ff);
  assert.equal(couleur(''), null);
  assert.equal(couleur('bleu'), undefined);
  assert.ok(urlValide('https://wumi.fr/x.png'));
  assert.ok(!urlValide('javascript:alert(1)'));
});

test('roles-reactions : emojis acceptes et refuses', () => {
  const { emojiValide } = R('src/utils/rolesReactions');
  assert.equal(emojiValide('🎮'), '🎮');
  assert.deepEqual(emojiValide('<:wumi:123456789012345678>'), { id: '123456789012345678', name: 'wumi', animated: false });
  assert.equal(emojiValide('abc'), null);
});

test('logs : un embed devient un message V2 lisible', () => {
  const { versV2 } = R('src/utils/logs');
  const C = R('src/utils/composants');
  const [conteneur] = versV2({
    title: 'Membre banni',
    description: 'Raison : spam',
    color: 0xff0000,
    fields: [{ name: 'Membre', value: '<@1>', inline: true }, { name: 'Modo', value: '<@2>', inline: true }, { name: 'Detail', value: 'x\ny' }],
    footer: { text: 'ID 1' },
    timestamp: new Date().toISOString(),
  });
  const json = JSON.stringify(conteneur.toJSON());
  assert.ok(json.includes('Membre banni') && json.includes('**Membre** · <@1>') && json.includes('ID 1'));
  assert.ok(C.compter(conteneur) <= 40);
});

test('dashboard : les valeurs sont validees selon le type du reglage', () => {
  const { valider } = R('src/public/dashboard');
  const { ChannelType } = require('discord.js');
  const guild = {
    id: G,
    channels: { cache: new Map([['555555555555555555', { type: ChannelType.GuildText }], ['666666666666666666', { type: ChannelType.GuildCategory }]]) },
    roles: { cache: new Map([['777777777777777777', { id: '777777777777777777', managed: false }]]) },
  };
  assert.deepEqual(valider({ type: 'nombre', min: 0, max: 10 }, 99, guild), { ok: true, valeur: 10 });
  assert.equal(valider({ type: 'salon' }, '666666666666666666', guild).ok, false);
  assert.equal(valider({ type: 'salon' }, '555555555555555555', guild).ok, true);
  assert.equal(valider({ type: 'choix', valeurs: ['fr', 'en'] }, 'xx', guild).ok, false);
  assert.equal(valider({ type: 'role' }, G, guild).ok, false, '@everyone refuse');
});

test('dashboard : statistiques, sanctions et controle des roles', async () => {
  const { db } = R('src/database/db');
  const plus = R('src/public/dashboardPlus');
  const activite = R('src/utils/activite');
  const G = '444444444444444444';
  activite.noter(G, { messages: 5, arrivees: 2, departs: 1 });
  db.prepare('INSERT INTO sanctions (guild_id, user_id, moderateur_id, type, raison, date) VALUES (?, ?, ?, ?, ?, ?)')
    .run(G, '555555555555555555', '666666666666666666', 'warn', 'test', Date.now());

  const vide = new Map();
  const roles = new Map();
  const guild = {
    id: G,
    ownerId: '1',
    client: { user: { id: '9' }, users: { cache: vide, fetch: async () => ({ username: 'quelqu1' }) } },
    channels: { cache: vide },
    members: { cache: vide, fetch: async () => vide },
    roles: { cache: roles },
  };

  const st = await plus.statistiques(guild, 7);
  assert.equal(st.serie.length, 7);
  assert.equal(st.totaux.messages, 5);
  assert.equal(st.totaux.arrivees, 2);
  assert.equal(st.semaines.length, 12);
  assert.equal(st.semaines.reduce((n, w) => n + w.warn, 0), 1);

  const sa = await plus.listeSanctions(guild, { type: 'warn' });
  assert.equal(sa.total, 1);
  assert.equal(sa.lignes[0].membre.nom, 'quelqu1');
  assert.equal((await plus.listeSanctions(guild, { type: 'ban' })).total, 0);
  // Un filtre farfelu est ignore, pas injecte dans la requete.
  assert.equal((await plus.listeSanctions(guild, { type: "warn' OR 1=1 --" })).total, 1);

  const { PermissionsBitField } = require('discord.js');
  const membre = { id: '2', roles: { highest: { position: 5 } } };
  const role = (o) => ({ id: '7', managed: false, editable: true, position: 3, permissions: new PermissionsBitField(0n), ...o });
  roles.set('7', role());
  assert.equal(await plus.problemeRole(guild, membre, '7'), null);
  roles.set('7', role({ position: 6 }));
  assert.equal(await plus.problemeRole(guild, membre, '7'), 'role_trop_haut_toi');
  roles.set('7', role({ permissions: new PermissionsBitField(PermissionsBitField.Flags.BanMembers) }));
  assert.equal(await plus.problemeRole(guild, membre, '7'), 'role_dangereux');
  roles.set('7', role({ editable: false }));
  assert.equal(await plus.problemeRole(guild, membre, '7'), 'role_trop_haut_bot');
  assert.equal(await plus.problemeRole(guild, membre, '999'), 'role_invalide');
});

test('puissance 4 : alignements detectes et Wumi bloque une victoire evidente', () => {
  const { _interne: p4 } = R('src/commands/utilitaires/puissance4');
  const g = p4.vide();
  for (const c of [0, 1, 2, 3]) g[5][c] = 0;
  assert.equal(p4.gagnant(g).joueur, 0);
  const v = p4.vide();
  for (let l = 2; l < 6; l++) v[l][4] = 1;
  assert.equal(p4.gagnant(v).joueur, 1);
  // Le joueur 0 a trois pions en bas : Wumi (1) doit poser dans la colonne 3.
  const b = p4.vide();
  for (const c of [0, 1, 2]) b[5][c] = 0;
  b[5][6] = 1; b[4][6] = 1;
  assert.equal(p4.coupDuBot(b, 1, 'normal'), 3);
  // Et il gagne quand il le peut.
  const w = p4.vide();
  for (let l = 3; l < 6; l++) w[l][5] = 1;
  w[5][0] = 0; w[5][1] = 0;
  assert.equal(p4.coupDuBot(w, 1, 'normal'), 5);
});

test('pendu, compteur et quiz : les petites regles', async () => {
  const { _interne: pendu } = R('src/commands/utilitaires/pendu');
  assert.equal(pendu.normaliser(' éléphant '), 'ELEPHANT');
  const mots = R('src/utils/donnees/mots');
  assert.ok(mots.fr.length > 100 && mots.en.length > 100);
  assert.ok([...mots.fr, ...mots.en].every((m) => /^[A-Z]+$/.test(m)));

  const compteur = R('src/utils/compteur');
  assert.equal(compteur.lireNombre('42'), 42);
  assert.equal(compteur.lireNombre('42 !'), 42);
  assert.equal(compteur.lireNombre('1 000'), null);
  assert.equal(compteur.lireNombre('salut 3'), null);

  const G = '777777777777777777';
  const reactions = [];
  const msg = (auteur, texte) => ({
    content: texte,
    author: { id: auteur },
    guild: { id: G },
    channel: { send: async () => null },
    react: async (e) => reactions.push(e),
    reply: async () => null,
  });
  await compteur.traiter(msg('a', '1'));
  await compteur.traiter(msg('b', '2'));
  await compteur.traiter(msg('b', '3')); // deux fois de suite : casse
  assert.deepEqual(reactions, ['✅', '🏆', '❌']);
  const e = compteur.etat(G);
  assert.equal(e.actuel, 0);
  assert.equal(e.record, 2);
  assert.equal(e.echecs, 1);

  const { _interne: quiz } = R('src/commands/utilitaires/quiz');
  for (const langue of ['fr', 'en']) {
    const qs = quiz.tirer(10, langue);
    assert.equal(qs.length, 10);
    assert.equal(new Set(qs.map((x) => x.question)).size, 10);
    for (const x of qs) {
      const source = quiz.banque.find((b) => b[langue].q === x.question)[langue];
      assert.equal(x.reponses[x.bonne], source.r[source.b]);
    }
  }
});

test('quiz drapeaux : bonne reponse, meme continent, codes valides', () => {
  const { _interne: quiz } = R('src/commands/utilitaires/quiz');
  const { pays, image } = R('src/utils/donnees/pays');
  assert.ok(pays.length >= 100);
  assert.equal(new Set(pays.map((p) => p.code)).size, pays.length);
  assert.ok(pays.every((p) => /^[a-z]{2}$/.test(p.code) && p.fr && p.en && ['eu', 'am', 'as', 'af', 'oc'].includes(p.continent)));
  for (const langue of ['fr', 'en']) {
    const qs = quiz.tirer(10, langue, 'drapeaux');
    assert.equal(qs.length, 10);
    for (const x of qs) {
      assert.equal(new Set(x.reponses).size, 4);
      const code = x.image.match(/\/(\w\w)\.png$/)[1];
      const vrai = pays.find((p) => p.code === code);
      assert.equal(x.reponses[x.bonne], vrai[langue]);
      assert.equal(x.image, image(code));
    }
  }
  const mix = quiz.tirer(6, 'fr', 'melange');
  assert.equal(mix.length, 6);
  assert.equal(mix.filter((x) => x.drapeau).length, 3);
});

test('starboard : emoji reconnu et message republie lisible', () => {
  const sb = R('src/utils/starboard');
  assert.ok(sb.memeEmoji({ emoji: { id: null, name: '⭐' } }, '⭐'));
  assert.ok(!sb.memeEmoji({ emoji: { id: null, name: '🔥' } }, '⭐'));
  assert.ok(sb.memeEmoji({ emoji: { id: '123456789012345678', name: 'etoile' } }, '<:etoile:123456789012345678>'));
  const message = {
    content: 'Le meilleur message du monde',
    channel: { id: '1' },
    url: 'https://discord.com/channels/1/1/1',
    createdTimestamp: Date.now(),
    author: { username: 'hugo', displayAvatarURL: () => 'https://cdn.discordapp.com/embed/avatars/0.png' },
    attachments: new Map([['a', { url: 'https://cdn.discordapp.com/x.png', contentType: 'image/png' }]]),
    embeds: [],
  };
  const charge = sb.construire(message, 5, '⭐', (k) => k);
  const json = JSON.stringify(charge.components.map((c) => c.toJSON()));
  assert.match(json, /⭐ 5/);
  assert.match(json, /Le meilleur message du monde/);
  assert.match(json, /x\.png/);
});
