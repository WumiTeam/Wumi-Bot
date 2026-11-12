/**
 * /audit : un faux serveur plein de failles, puis le meme une fois corrige.
 */
const { R } = require('./_preparer');
const test = require('node:test');
const assert = require('node:assert/strict');
const { Collection, PermissionsBitField, PermissionFlagsBits: P, ChannelType, MessageFlags } = require('discord.js');

const G = '444444444444444444';

function fauxServeur({ everyonePerms, verification = 0, mfa = 0, filtre = 0 }) {
  const appels = [];
  const everyone = { id: G, permissions: new PermissionsBitField(everyonePerms), setPermissions: async (p) => { everyone.permissions = new PermissionsBitField(p); appels.push('everyone'); } };
  const roleWumi = { id: '5', position: 3 };
  const roleHaut = { id: '6', position: 9 };
  const me = { id: '1', permissions: new PermissionsBitField(PermissionsBitField.All), roles: { highest: roleWumi } };
  const botAdmin = { id: '2', user: { bot: true, username: 'VieuxBot' }, permissions: new PermissionsBitField([P.Administrator]) };
  const membres = new Collection([['1', { ...me, user: { bot: true } }], ['2', botAdmin]]);

  const voir = (oui) => ({ has: (b) => (b === P.ViewChannel ? oui : false) });
  const categorie = { id: '10', type: ChannelType.GuildCategory, permissionsFor: () => voir(false), permissionOverwrites: { cache: new Map() } };
  const fuite = {
    id: '11', type: ChannelType.GuildText, parent: categorie, permissionsLocked: false, isThread: () => false,
    permissionsFor: () => voir(true), permissionOverwrites: { cache: new Map() },
    lockPermissions: async () => { fuite.permissionsLocked = true; fuite.permissionsFor = () => voir(false); appels.push('lock'); },
  };
  const guild = {
    id: G, name: 'Test', ownerId: '9', memberCount: 50,
    mfaLevel: mfa, verificationLevel: verification, explicitContentFilter: filtre, defaultMessageNotifications: 1,
    roles: { everyone, cache: new Collection([[G, everyone], ['5', roleWumi], ['6', roleHaut]]) },
    members: { me, cache: membres, fetch: async () => membres, fetchMe: async () => me },
    channels: { cache: new Collection([['10', categorie], ['11', fuite]]) },
    fetchWebhooks: async () => new Collection(),
    setVerificationLevel: async (n) => { guild.verificationLevel = n; appels.push('verif'); },
    setExplicitContentFilter: async (n) => { guild.explicitContentFilter = n; },
    setDefaultMessageNotifications: async () => {},
  };
  return { guild, appels };
}

test('audit : un serveur troue a une mauvaise note et des correctifs', async () => {
  const audit = R('src/utils/audit');
  const { majConfig } = R('src/database/db');
  majConfig(G, { role_auto: '6' });
  const { guild } = fauxServeur({ everyonePerms: [P.ViewChannel, P.SendMessages, P.Administrator] });
  const r = await audit.analyser(guild);
  const codes = r.problemes.map((p) => p.code);
  for (const c of ['everyone_perms', 'bots_admin', 'mfa', 'verif', 'filtre', 'fuite', 'hierarchie', 'antiraid', 'automod']) {
    assert.ok(codes.includes(c), `probleme ${c} non detecte`);
  }
  assert.equal(r.problemes[0].gravite, 'critique');
  assert.ok(r.score < 30, `note trop haute : ${r.score}`);
  assert.ok(r.problemes.find((p) => p.code === 'everyone_perms').correctif);
  assert.ok(!r.problemes.find((p) => p.code === 'mfa').correctif, 'la 2FA ne se corrige pas par un bot');
});

test('audit : les correctifs reparent sans rien supprimer', async () => {
  const audit = R('src/utils/audit');
  const { guild, appels } = fauxServeur({ everyonePerms: [P.ViewChannel, P.SendMessages, P.ManageRoles, P.MentionEveryone] });
  for (const code of ['everyone_perms', 'verif', 'fuite', 'filtre', 'antiraid', 'automod']) await audit.corriger(guild, code, 'test');
  assert.ok(guild.roles.everyone.permissions.has(P.SendMessages), 'les permissions normales restent');
  assert.ok(!guild.roles.everyone.permissions.has(P.ManageRoles));
  assert.ok(!guild.roles.everyone.permissions.has(P.MentionEveryone));
  assert.deepEqual(appels.sort(), ['everyone', 'lock', 'verif']);
  const r = await audit.analyser(guild);
  const codes = r.problemes.map((p) => p.code);
  for (const c of ['everyone_perms', 'verif', 'fuite', 'filtre', 'antiraid', 'automod']) assert.ok(!codes.includes(c), `${c} toujours la`);
});

test('audit : le rapport tient dans les limites de Discord', async () => {
  const audit = R('src/utils/audit');
  const { traducteur } = R('src/utils/langues');
  for (const langue of ['fr', 'en']) {
    const { t } = traducteur({ locale: langue === 'fr' ? 'fr' : 'en-US', guildLocale: langue });
    const { guild } = fauxServeur({ everyonePerms: [P.Administrator] });
    const r = await audit.analyser(guild);
    const charge = audit.rapport(guild, r, t, { avant: 90 });
    assert.ok(charge.flags & MessageFlags.IsComponentsV2);
    const json = JSON.stringify(charge.components.map((c) => c.toJSON()));
    assert.ok(!/audit\.[a-z_]+/.test(json.replace(/aud_[a-z_:]+/g, '')), `cle non traduite (${langue})`);
    assert.ok(json.length < 20000);
  }
});
