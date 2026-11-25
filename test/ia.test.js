/**
 * Wumi 2.32 : arnaques, detection de langue, plan de traduction, et le bot
 * qui reste debout quand la bibliotheque d'IA n'est pas installee.
 */
const { R } = require('./_preparer');
const test = require('node:test');
const assert = require('node:assert');

const arnaques = R('src/utils/arnaques');
const ia = R('src/utils/ia');

test('arnaques : les classiques sont reconnues, dans plusieurs langues', () => {
  const oui = [
    'Free Discord Nitro for 3 months! claim here https://dlscord-gift.com/xyz',
    'Nitro gratuit offert ici https://discord-nitro.ru/claim',
    'salut, je t ai signalé par erreur, contacte le staff Hugo pour régler ça',
    'Hey I accidentally reported your account, please contact the trust and safety admin',
    'Te denuncié por error, contacta al staff de Discord',
    'Ich habe dich versehentlich gemeldet, kontaktiere bitte den Support-Admin',
    'Elon Musk crypto giveaway double your BTC https://elon-x2.io',
  ];
  for (const m of oui) assert.ok(arnaques.analyser(m).arnaque, m);
  assert.ok(arnaques.analyser('free $50 steam gift https://steamcommunlty.com/gift/1', { mentionTous: true }).arnaque);
});

test('arnaques : les conversations normales passent', () => {
  const non = [
    'quelqu un a le nitro ? je veux acheter le nitro gratuit lol',
    'regarde ma vidéo https://youtube.com/watch?v=abc',
    'j ai report un bug sur le serveur par erreur dans le mauvais salon',
    'voici le lien du serveur https://discord.gg/abc',
    'le cadeau steam de noël était cool',
  ];
  for (const m of non) assert.ok(!arnaques.analyser(m).arnaque, m);
});

test('arnaques : les domaines qui imitent Discord ou Steam', () => {
  assert.ok(arnaques.imitation('dlscord.gift'));
  assert.ok(arnaques.imitation('discorcl-nitro.com'));
  assert.ok(arnaques.imitation('steamcommunlty.com'));
  assert.ok(!arnaques.imitation('discord.com'));
  assert.ok(!arnaques.imitation('cdn.discordapp.com'));
  assert.ok(!arnaques.imitation('steamcommunity.com'));
  assert.ok(!arnaques.imitation('google.com'));
});

test('langue : les six langues du bot sont reconnues', () => {
  const cas = {
    fr: "Salut tout le monde, je suis content de vous voir ce soir, c'est super",
    en: 'Hello everyone, I am very happy to see you tonight, this is great',
    es: 'Hola a todos, estoy muy contento de veros esta noche, es genial',
    de: 'Hallo zusammen, ich bin sehr froh, euch heute Abend zu sehen, das ist toll',
    pt: 'Olá pessoal, eu estou muito feliz em ver voces hoje, isso é demais e não tem problema',
    it: 'Ciao a tutti, sono molto contento di vedervi stasera, anche questo è bello',
  };
  for (const [l, phrase] of Object.entries(cas)) assert.strictEqual(ia.detecterLangue(phrase), l, phrase);
  assert.strictEqual(ia.detecterLangue('😂😂 :) 123'), null);
});

test('traduction : modele direct, ou passage par l\'anglais', () => {
  assert.deepStrictEqual(ia.etapes('fr', 'fr'), []);
  assert.deepStrictEqual(ia.etapes('fr', 'en').map((e) => e.modele), ['Xenova/opus-mt-fr-en']);
  assert.deepStrictEqual(ia.etapes('es', 'fr').map((e) => e.modele), ['Xenova/opus-mt-es-fr']);
  assert.deepStrictEqual(ia.etapes('it', 'fr').map((e) => e.modele), ['Xenova/opus-mt-it-en', 'Xenova/opus-mt-en-fr']);
  assert.deepStrictEqual(ia.etapes('pt', 'fr').map((e) => e.modele), ['Xenova/opus-mt-mul-en', 'Xenova/opus-mt-en-fr']);
  const versPt = ia.etapes('fr', 'pt');
  assert.deepStrictEqual(versPt.map((e) => e.modele), ['Xenova/opus-mt-fr-en', 'Xenova/opus-mt-en-mul']);
  assert.strictEqual(versPt[1].prefixe, '>>por<<');
});

test('traduction : les longs textes sont decoupes en phrases, lignes conservees', () => {
  const m = ia.morceaux('Phrase une. Phrase deux !\n\nAutre ligne', 12);
  assert.ok(m.length >= 3);
  assert.ok(m.some((x) => x.vide));
});

test('toxicite : lecture du score quels que soient les noms des etiquettes', () => {
  assert.strictEqual(ia.scoreToxique([{ label: 'toxic', score: 0.93 }, { label: 'neutral', score: 0.07 }]), 0.93);
  assert.strictEqual(ia.scoreToxique([{ label: 'LABEL_0', score: 0.8 }, { label: 'LABEL_1', score: 0.2 }]), 0.2);
  assert.ok(Math.abs(ia.scoreToxique([{ label: 'neutral', score: 0.75 }]) - 0.25) < 1e-9);
});

test('sans la bibliotheque d\'IA, tout repond « indisponible » sans planter', async () => {
  // @huggingface/transformers n'est pas installe dans l'environnement de test.
  let installee = true;
  try { require.resolve('@huggingface/transformers'); } catch { installee = false; }
  if (installee) return;
  assert.strictEqual(await ia.pret(), false);
  assert.strictEqual(ia.disponible(), false);
  assert.strictEqual(await ia.toxicite('bonjour'), null);
  assert.strictEqual(await ia.nsfw('https://exemple.fr/a.png'), null);
  assert.strictEqual(await ia.traduire('bonjour', 'fr', 'en'), null);
});

test('automod : les images jointes sont envoyees en petite taille', () => {
  const automod = R('src/utils/automod');
  const pj = new Map([
    ['1', { contentType: 'image/png', size: 1000, proxyURL: 'https://media.discordapp.net/a.png' }],
    ['2', { contentType: 'video/mp4', size: 1000, proxyURL: 'https://media.discordapp.net/b.mp4' }],
    ['3', { contentType: 'image/gif', size: 1000, proxyURL: 'https://media.discordapp.net/c.gif?ex=1' }],
  ]);
  const urls = automod.imagesDe({ attachments: pj });
  assert.strictEqual(urls.length, 2);
  assert.match(urls[0], /a\.png\?format=png&width=448/);
  assert.match(urls[1], /c\.gif\?ex=1&format=png/);
});
