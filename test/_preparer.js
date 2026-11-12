/**
 * Prepare un environnement de test : une base SQLite JETABLE dans le dossier
 * temporaire, jamais ta vraie base, et des identifiants factices. A requerir
 * EN PREMIER dans chaque fichier de test.
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'wumi-test-'));
process.env.DATABASE_PATH = path.join(dossier, 'test.db');
process.env.DISCORD_TOKEN ??= 'test';
process.env.CLIENT_ID ??= '333333333333333333';
process.env.SUPPORT_GUILD_ID = '111111111111111111';
process.env.OWNER_IDS = '222222222222222222';
process.env.DEBUG = 'false';
// Pas de vrai salon de logs du support pendant les tests.
for (const k of Object.keys(process.env)) if (k.startsWith('LOG_')) delete process.env[k];

process.on('exit', () => fs.rmSync(dossier, { recursive: true, force: true }));

const racine = path.join(__dirname, '..');
module.exports = { racine, R: (p) => require(path.join(racine, p)) };
