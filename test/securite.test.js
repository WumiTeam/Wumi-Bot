/**
 * Wumi 2.12 : anti-nuke, import de structure, rapport hebdo.
 * Faux serveurs, aucune connexion a Discord.
 */
const { R } = require('./_preparer');
const test = require('node:test');
const assert = require('node:assert/strict');
const { AuditLogEvent, PermissionFlagsBits } = require('discord.js');

const G = '555555555555555555';
const PROPRIO = '444444444444444444';
const PIRATE = '666666666666666666';

function fauxServeur(sanctions) {
  const membre = {
    id: PIRATE,
    user: { bot: false, username: 'pirate' },
    roles: {
      cache: new Map([['1', { id: '1', managed: false, editable: true, name: 'Admin', permissions: { has: () => true } }]]),
      set: async (ids) => sanctions.push(['roles', ids]),
    },
    kick: async () => sanctions.push(['kick']),
  };
  membre.roles.cache.filter = function (f) {
    const m = new Map([...this].filter(([, v]) => f(v)));
    m.filter = membre.roles.cache.filter;
    m.map = (g) => [...m.values()].map(g);
    return m;
  };
  return {
    id: G,
    name: 'Test',
    ownerId: PROPRIO,
    client: { user: { id: '333333333333333333' } },
    members: { fetch: async () => membre, ban: async () => sanctions.push(['ban']) },
    channels: { cache: new Map() },
    fetchOwner: async () => ({ id: PROPRIO, send: async () => sanctions.push(['mp']) }),
  };
}

test('anti-nuke : ne fait rien tant que ce n\'est pas active', async () => {
  const antiNuke = R('src/utils/antiNuke');
  antiNuke._reinitialiser();
  const sanctions = [];
  const guild = fauxServeur(sanctions);
  for (let i = 0; i < 10; i++) await antiNuke.surEntree({ executorId: PIRATE, action: AuditLogEvent.ChannelDelete }, guild);
  assert.equal(sanctions.length, 0);
});

test('anti-nuke : au seuil, retire les roles une seule fois ; le proprio et la confiance sont epargnes', async () => {
  const antiNuke = R('src/utils/antiNuke');
  const { majConfig } = R('src/database/db');
  antiNuke._reinitialiser();
  majConfig(G, { antinuke_actif: 1, antinuke_seuil: 3, antinuke_fenetre: 15, antinuke_sanction: 'roles', antinuke_confiance: '[]' });
  const sanctions = [];
  const guild = fauxServeur(sanctions);

  // Le proprietaire peut tout supprimer.
  for (let i = 0; i < 5; i++) await antiNuke.surEntree({ executorId: PROPRIO, action: AuditLogEvent.RoleDelete }, guild);
  assert.equal(sanctions.length, 0);

  // Deux suppressions : sous le seuil.
  await antiNuke.surEntree({ executorId: PIRATE, action: AuditLogEvent.ChannelDelete }, guild);
  await antiNuke.surEntree({ executorId: PIRATE, action: AuditLogEvent.ChannelDelete }, guild);
  assert.equal(sanctions.length, 0);
  // La troisieme declenche ; les suivantes ne resanctionnent pas.
  await antiNuke.surEntree({ executorId: PIRATE, action: AuditLogEvent.ChannelDelete }, guild);
  await antiNuke.surEntree({ executorId: PIRATE, action: AuditLogEvent.ChannelDelete }, guild);
  assert.deepEqual(sanctions.filter((s) => s[0] === 'roles').length, 1);
  assert.ok(sanctions.some((s) => s[0] === 'mp'), 'le proprietaire est prevenu');

  // De confiance : jamais sanctionne.
  antiNuke._reinitialiser();
  sanctions.length = 0;
  majConfig(G, { antinuke_confiance: JSON.stringify([PIRATE]) });
  for (let i = 0; i < 6; i++) await antiNuke.surEntree({ executorId: PIRATE, action: AuditLogEvent.MemberBanAdd }, guild);
  assert.equal(sanctions.length, 0);
  majConfig(G, { antinuke_actif: 0, antinuke_confiance: '[]' });
});

test('anti-nuke : donner Administrateur a un role pese 2, une autre modif de role rien', () => {
  const { evaluer } = R('src/utils/antiNuke');
  const admin = PermissionFlagsBits.Administrator.toString();
  assert.equal(evaluer({ action: AuditLogEvent.RoleUpdate, changes: [{ key: 'permissions', old: '0', new: admin }] }, 4).poids, 2);
  assert.equal(evaluer({ action: AuditLogEvent.RoleUpdate, changes: [{ key: 'name', old: 'a', new: 'b' }] }, 4), null);
  assert.equal(evaluer({ action: AuditLogEvent.MemberPrune }, 4).poids, 4);
});

test('import de structure : @everyone rebranche, membres retires, fichier invalide refuse', () => {
  const structure = R('src/utils/structure');
  const AUTRE = '777777777777777777';
  const brut = {
    serveur: { nom: 'Autre', everyone: '1024', salonAfk: '999999999999999999' },
    roles: [{ id: '100000000000000001', nom: 'Modo', couleur: '#ff0000', position: 2, permissions: '8', separe: true, mentionnable: false, gere: false }],
    salons: [{
      id: '200000000000000001', nom: 'général', type: 0, parent: null, position: 0,
      permissions: [
        { id: AUTRE, type: 0, allow: '0', deny: '1024' },                 // @everyone de l'autre serveur
        { id: '100000000000000001', type: 0, allow: '1024', deny: '0' },  // role Modo
        { id: '300000000000000001', type: 1, allow: '1024', deny: '0' },  // un membre precis
      ],
    }],
  };
  const r = structure.nettoyerImport(brut, G);
  assert.ok(r.contenu);
  assert.equal(r.membresRetires, 1);
  const ids = r.contenu.salons[0].permissions.map((p) => p.id);
  assert.ok(ids.includes(G) && !ids.includes(AUTRE));
  assert.equal(r.contenu.serveur.salonAfk, null, 'un salon AFK absent de la photo est oublie');
  assert.equal(r.contenu.importe, true);

  assert.ok(structure.nettoyerImport({ roles: 'x' }, G).erreur);
  assert.ok(structure.nettoyerImport({ roles: [{ id: 'abc', nom: 1 }], salons: [] }, G).erreur);
  assert.equal(structure.nettoyerImport({ roles: new Array(251).fill({}), salons: [] }, G).erreur, 'trop_gros');

  const id = structure.enregistrerImport(G, r.contenu, { nom: 'Import test' });
  assert.equal(structure.charger(id, G).contenu.roles[0].nom, 'Modo');
});

test('activite : heures et comparaison de periodes', () => {
  const activite = R('src/utils/activite');
  const { req } = R('src/database/db');
  for (let i = 0; i < 5; i++) activite.noterMessage(G, '1');
  const h = activite.heures(G, activite.jour());
  assert.equal(h.length, 24);
  assert.equal(h[activite.heure()], 5);
  req.noterActivite.run({ guild_id: G, jour: activite.jourMoins(8), messages: 10, arrivees: 0, departs: 0, vocal: 0 });
  assert.equal(activite.totaux(G, 7, 7).messages, 10);
  assert.equal(activite.evolution(15, 10), 50);
  assert.equal(activite.evolution(5, 0), null);
});

test('rapport hebdo : jour de la semaine et lundi de reference', () => {
  const { jourSemaine, lundiCourant } = R('src/utils/rapportStats');
  const mercredi = new Date('2026-11-11T12:00:00Z');
  assert.equal(jourSemaine(mercredi), 3);
  assert.equal(lundiCourant(mercredi), '2026-11-09');
  assert.equal(lundiCourant(new Date('2026-11-09T08:00:00Z')), '2026-11-09');
});
