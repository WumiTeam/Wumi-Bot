require('./_preparer');
const test = require('node:test');
const assert = require('node:assert');
const { majConfig } = require('../src/database/db');
const langues = require('../src/utils/langues');

const G = '242424242424242424';
const U = '424242424242424242';

test('essai premium : une fois par serveur, puis plus jamais', () => {
  const premium = require('../src/utils/premium');
  const essai = require('../src/utils/essaiPremium');
  assert.strictEqual(essai.disponibilite(G), 'ok');
  const fin = essai.lancer(G, U, 'fr', 1_000);
  assert.strictEqual(fin, 1_000 + essai.DUREE);
  assert.strictEqual(premium.details(G).source, 'essai');
  assert.strictEqual(essai.lancer(G, U, 'fr'), null);
  premium.retirer(G);
  premium.oublier?.(G);
  // Meme apres la fin, l'essai ne revient pas.
  assert.strictEqual(essai.disponibilite(G), 'deja');
});

test('donnees traduites : themes, objets, badges en anglais', () => {
  const themes = require('../src/utils/themesRank');
  const objets = require('../src/utils/objets');
  const progression = require('../src/utils/progression');
  assert.strictEqual(themes.parCle('braise', 'en').nom, 'Ember');
  assert.strictEqual(themes.parCle('braise', 'fr').nom, 'Braise');
  assert.strictEqual(objets.parCle('potion_xp', 'en').nom, 'XP Potion');
  assert.ok(progression.listeBadges('en').some((b) => b.nom === 'Chatty'));
  // Aucun texte casse (ancien double encodage de config.js).
  for (const th of themes.liste()) assert.ok(!/Ã|ðŸ/.test(`${th.nom}${th.emoji ?? ''}`), th.cle);
});

test('commandes : en-GB recopie, descriptions de base en anglais, francais garde', () => {
  const { preparer } = require('../src/utils/commandesI18n');
  const [c] = preparer([{
    name: 'profil',
    name_localizations: { 'en-US': 'profile' },
    description: 'Ta carte',
    description_localizations: { 'en-US': 'Your card' },
    options: [{ type: 3, name: 'style', description: 'Le style', description_localizations: { 'en-US': 'The style' },
      choices: [{ name: 'Sombre', name_localizations: { 'en-US': 'Dark' }, value: 'sombre' }] }],
  }]);
  assert.strictEqual(c.name, 'profil');
  assert.strictEqual(c.name_localizations['en-GB'], 'profile');
  // 2.35 : un emoji devant la description de la commande
  assert.strictEqual(c.description, '🪪 Your card');
  assert.strictEqual(c.description_localizations.fr, '🪪 Ta carte');
  assert.strictEqual(c.options[0].choices[0].name, 'Dark');
  assert.strictEqual(c.options[0].choices[0].name_localizations.fr, 'Sombre');
  assert.strictEqual(c.options[0].choices[0].value, 'sombre');
});

test('message d\'arrivee : V2, bouton de configuration, langue auto', () => {
  const accueil = require('../src/utils/accueil');
  const guild = { id: G, name: 'Test', preferredLocale: 'fr', members: { me: null } };
  const G2 = '242424242424242425';
  majConfig(G2, { langue: 'en' });
  accueil.langueAuto({ ...guild, id: G2 });
  assert.strictEqual(langues.langueDe(G2), 'fr');
  const msg = accueil.messageBienvenue(guild, { user: null, commandes: new Map() });
  const json = JSON.stringify(msg.components.map((c) => c.toJSON()));
  assert.ok(json.includes('dem_go_0'));
});

test('appels, automod, profil : rien de francais sur un serveur anglais', () => {
  const G3 = '242424242424242426';
  majConfig(G3, { langue: 'en' });
  const appels = require('../src/utils/appels');
  const refus = appels.verifierRecevabilite({ id: 1, guild_id: G3, user_id: 'x', type: 'warn', date: Date.now() }, 'y');
  assert.strictEqual(refus, langues.t('appel.refus.pas_la_tienne', 'en'));
  const automod = require('../src/utils/automod');
  const r = automod.analyser({ guild: { id: G3 }, content: 'discord.gg/abcdef', member: null, author: { id: 'z' }, channel: { id: 'c' } },
    { automod_invitations: 1, automod_actif: 1 }, null);
  if (r) assert.ok(!/Invitation|interdites/.test(`${r.motif} ${r.detail}`), JSON.stringify(r));
});
