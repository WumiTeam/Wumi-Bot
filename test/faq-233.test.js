/**
 * Wumi 2.33 : la FAQ comprend le sens des questions (IA) et repond a
 * l'ouverture des tickets. Ici, sans la bibliotheque d'IA : on verifie que
 * tout retombe proprement sur les mots-cles, et le comportement des boutons.
 */
const { R } = require('./_preparer');
const test = require('node:test');
const assert = require('node:assert');

const { req, config, majConfig } = R('src/database/db');
const faq = R('src/utils/faq');
const ticketFaq = R('src/utils/ticketFaq');
const G = '444444444444444444';

function fiche(question, reponse, mots) {
  req.ajouterFaq.run({ guild_id: G, question, reponse, mots_cles: mots, auteur_id: null, date: Date.now() });
}
fiche('How do I change the language of the bot?', 'Use /config › Server.', 'language langue translate');
fiche('How do I play music?', 'Join a voice channel and use /play.', 'music musique play song');

test('faq : une question se reconnait dans les six langues', () => {
  for (const q of ['how do I add wumi', 'Comment je fais', 'wie kann ich', 'perché non va', 'où est le dash', 'Como configuro', 'cómo hago']) {
    assert.ok(faq.QUESTION.test(q), q);
  }
  for (const q of ['salut tout le monde', 'hello', 'gg wp', 'commentaire sympa']) assert.ok(!faq.QUESTION.test(q), q);
});

test('faq : le score de sens va de 0 a 100', () => {
  assert.strictEqual(faq.scoreSens(0.1), 0);
  assert.strictEqual(faq.scoreSens(0.52), 100);
  assert.strictEqual(faq.scoreSens(0.99), 100);
  assert.strictEqual(faq.scoreSens(0.43), 55);
  assert.ok(faq.scoreSens(0.39) < 40);
});

test('faq : sans IA, la recherche intelligente retombe sur les mots-cles', async () => {
  const r = await faq.chercherIntelligent(G, 'how can I change the bot language ?');
  assert.strictEqual(r.fiche.question, 'How do I change the language of the bot?');
  assert.ok(r.score >= 55, String(r.score));
  assert.strictEqual(r.score, Math.max(r.mots, r.sens ?? 0));
});

test('ticket : la FAQ propose une fiche quand elle correspond', async () => {
  const m = await ticketFaq.proposition({ id: G }, 'I want to change the language of the bot please', 'p');
  assert.ok(m, 'une proposition');
  const json = JSON.stringify(m.components.map((c) => (c.toJSON ? c.toJSON() : c)));
  assert.match(json, /tfaq_ok:p:\d+/);
  assert.match(json, /tfaq_non:p/);
  assert.match(json, /Use \/config/);
});

test('ticket : rien quand la demande ne correspond a aucune fiche, ou quand c\'est desactive', async () => {
  assert.strictEqual(await ticketFaq.proposition({ id: G }, 'my account got hacked yesterday evening', 'p'), null);
  assert.strictEqual(await ticketFaq.proposition({ id: G }, 'hi', 'p'), null);
  majConfig(G, { ticket_faq: 0 });
  assert.strictEqual(config(G).ticket_faq, 0);
  assert.strictEqual(await ticketFaq.proposition({ id: G }, 'I want to change the language of the bot please', 'p'), null);
  majConfig(G, { ticket_faq: 1 });
});
