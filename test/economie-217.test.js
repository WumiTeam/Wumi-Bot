/**
 * Wumi 2.17 : vues de l'economie (daily, travail, portefeuille, classement)
 * rendues avec une fausse interaction, et validation de l'emoji de monnaie.
 */
require('./_preparer');
const test = require('node:test');
const assert = require('node:assert/strict');
const { majConfig } = require('../src/database/db');
const eco = require('../src/utils/economie');

const G = '900000000000000217';
const U = '900000000000000001';

function fausseInteraction(extra = {}) {
  const user = { id: U, username: 'zhaak', globalName: 'Zhaak', bot: false, displayAvatarURL: () => null };
  return {
    locale: 'fr', guildLocale: 'fr',
    user,
    guild: {
      id: G, name: 'Wumi Support',
      iconURL: () => null,
      members: { cache: new Map(), fetch: async () => null },
      emojis: { cache: new Map([['1', { name: 'Wumis', toString: () => '<:Wumis:123456789012345678>' }]]) },
    },
    client: { users: { fetch: async () => user } },
    ...extra,
  };
}

test('emoji de monnaie : « :Wumis: » est resolu ou refuse', () => {
  const i = fausseInteraction();
  i.guild.emojis.cache.find = function (f) { for (const v of this.values()) if (f(v)) return v; return undefined; };
  assert.equal(eco.resoudreEmoji(i.guild, ':Wumis:'), '<:Wumis:123456789012345678>');
  assert.equal(eco.resoudreEmoji(i.guild, ':Inconnu:'), null);
  assert.equal(eco.resoudreEmoji(i.guild, '💰'), '💰');
  majConfig(G, { eco_actif: 1, eco_emoji: ':Wumis:', eco_nom: "Wumi's" });
  assert.notEqual(eco.monnaie(G).emoji, ':Wumis:');
});

test('daily, travail, portefeuille et classement se rendent en image', async () => {
  const { vues } = require('../src/commands/economie/economie');
  const { vueSolde } = vues();
  const cmd = require('../src/commands/economie/economie');
  const reponses = [];
  const i = fausseInteraction({
    customId: 'eco_daily',
    reply: async (x) => reponses.push(x),
    deferReply: async () => {},
    editReply: async (x) => reponses.push(x),
  });
  await cmd.gererInteraction(i);
  i.customId = 'eco_travail';
  await cmd.gererInteraction(i);
  i.customId = 'eco_daily';
  await cmd.gererInteraction(i); // deja reclame : message d'attente prive
  const solde = await vueSolde(i, i.user);
  i.customId = 'eco_classement';
  await cmd.gererInteraction(i);
  assert.equal(reponses[0].files?.[0]?.name, 'daily.png');
  assert.equal(reponses[1].files?.[0]?.name, 'travail.png');
  assert.ok(JSON.stringify(reponses[2].components).includes('<t:'));
  assert.equal(solde.files?.[0]?.name, 'portefeuille.png');
  assert.equal(reponses[3].files?.[0]?.name, 'richesse.png');
});
