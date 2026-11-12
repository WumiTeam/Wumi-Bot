/**
 * Genere la page « Commandes » du site (site-wumi/commandes/index.html) a
 * partir du CODE du bot : noms, descriptions FR/EN, sous-commandes. Plus de
 * liste a corriger a la main : on relance ce script apres chaque mise a jour.
 *
 *   node outils/generer-commandes.js
 *
 * Les commandes du fondateur (/admin...) ne sont jamais publiees.
 */
process.env.DATABASE_PATH ??= require('node:path').join(require('node:os').tmpdir(), `wumi-gen-${process.pid}.db`);
process.env.DISCORD_TOKEN ??= 'x';
process.env.CLIENT_ID ??= '1545770920185045084';

const fs = require('node:fs');
const path = require('node:path');

const RACINE = path.join(__dirname, '..');
const DOSSIER = path.join(RACINE, 'src', 'commands');
const SORTIE = path.join(RACINE, 'site-wumi', 'commandes', process.argv.includes('--sans-copie') ? 'coquille.html' : 'index.html');

function lister(dossier) {
  const sortie = [];
  for (const e of fs.readdirSync(dossier, { withFileTypes: true })) {
    const p = path.join(dossier, e.name);
    if (e.isDirectory()) sortie.push(...lister(p));
    else if (e.name.endsWith('.js')) sortie.push(p);
  }
  return sortie;
}

const modules = [];
for (const fichier of lister(DOSSIER)) {
  try {
    modules.push(require(fichier));
  } catch (e) {
    console.error(`! ${path.relative(RACINE, fichier)} : ${e.message}`);
  }
}
const { commandes, categories: CATEGORIES } = require('../src/utils/listeCommandes').construire(modules);

const donnees = JSON.stringify({ categories: CATEGORIES, commandes }).replace(/</g, '\\u003c');

const page = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Wumi · Commands</title>
<meta name="description" content="Every Wumi command, with its description in English and French.">
<meta name="theme-color" content="#62b8ff">
<link rel="icon" type="image/png" sizes="64x64" href="../favicon.png?v=3">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Instrument+Serif:ital@0;1&display=swap" rel="stylesheet">
<style>
:root{--bg:#0c0d1c;--bg-2:#11132a;--card:#161935;--line:rgba(255,255,255,.08);--line-2:rgba(255,255,255,.14);--text:#eef0fc;--muted:#a3a9d1;--dim:#6f76a8;--blue:#62b8ff;--pink:#8fa0ff;--green:#3ddc97;--grad:linear-gradient(120deg,#4aa8ff,#62b8ff 35%,#a9b4f2 75%,#d9ddf7)}
*{box-sizing:border-box;margin:0;padding:0}
html{background:var(--bg)}
body{background:var(--bg);color:var(--text);font:400 16px/1.6 Inter,system-ui,sans-serif;-webkit-font-smoothing:antialiased;overflow-x:hidden}
a{color:inherit;text-decoration:none}
.wrap{max-width:1080px;margin:0 auto;padding:0 16px}
.glow{position:fixed;inset:0;pointer-events:none;z-index:-1;background:radial-gradient(600px 400px at 15% -5%,rgba(98,184,255,.18),transparent 70%),radial-gradient(600px 400px at 90% 5%,rgba(143,160,255,.14),transparent 70%)}
header{position:sticky;top:0;z-index:20;backdrop-filter:blur(14px);background:rgba(12,13,28,.78);border-bottom:1px solid var(--line)}
nav{display:flex;align-items:center;gap:16px;height:64px}
.logo{display:flex;align-items:center;gap:10px;font-weight:700;font-size:20px;letter-spacing:-.02em}
.logo img{width:30px;height:30px}
.logo .dot{color:var(--pink)}
.nav-fin{margin-left:auto;display:flex;gap:8px;align-items:center}
.btn{display:inline-flex;align-items:center;gap:8px;padding:9px 15px;border-radius:10px;font-weight:600;font-size:14px;border:1px solid var(--line-2);background:rgba(255,255,255,.03);color:var(--text);cursor:pointer;font-family:inherit}
.btn.on{background:var(--blue);color:#0c0d1c;border-color:transparent}
.hero{padding:56px 0 26px}
.eyebrow{font-size:12.5px;letter-spacing:.14em;font-weight:600;color:var(--blue);text-transform:uppercase;margin-bottom:12px}
h1{font-size:clamp(34px,6vw,58px);line-height:1.05;letter-spacing:-.03em;font-weight:700}
.serif{font-family:"Instrument Serif",Georgia,serif;font-style:italic;font-weight:400}
.grad{background:var(--grad);-webkit-background-clip:text;background-clip:text;color:transparent}
.lead{color:var(--muted);max-width:620px;margin-top:14px;font-size:17px}
.outils{display:flex;gap:10px;flex-wrap:wrap;margin:28px 0 8px;position:sticky;top:64px;z-index:10;background:var(--bg);padding:12px 0}
.outils input{flex:1 1 260px;min-width:0;background:var(--card);border:1px solid var(--line-2);border-radius:12px;padding:12px 14px;color:var(--text);font:inherit}
.outils input:focus{outline:2px solid rgba(98,184,255,.6)}
.filtres{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:24px}
.filtre{border:1px solid var(--line);background:rgba(255,255,255,.03);color:var(--muted);border-radius:99px;padding:6px 12px;font:inherit;font-size:13.5px;cursor:pointer}
.filtre.on{background:rgba(98,184,255,.16);color:var(--text);border-color:rgba(98,184,255,.4)}
h2{font-size:22px;letter-spacing:-.02em;margin:34px 0 12px;display:flex;gap:10px;align-items:center}
h2 small{color:var(--dim);font-size:14px;font-weight:500}
.grille{display:grid;grid-template-columns:repeat(auto-fill,minmax(310px,1fr));gap:12px}
.cmd{border:1px solid var(--line);border-radius:16px;background:linear-gradient(180deg,var(--card),var(--bg-2));padding:16px 18px}
.cmd .nom{font-family:ui-monospace,SFMono-Regular,monospace;font-size:15.5px;font-weight:600;color:var(--blue);display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.badge{font-family:Inter,sans-serif;font-size:11px;font-weight:600;letter-spacing:.04em;padding:2px 8px;border-radius:99px;background:rgba(255,255,255,.06);color:var(--muted)}
.cmd p{color:var(--muted);font-size:14.5px;margin-top:6px}
.cmd ul{list-style:none;margin-top:10px;border-top:1px solid var(--line);padding-top:8px;display:grid;gap:5px}
.cmd li{font-size:13.5px;color:var(--muted)}
.cmd li code{font-family:ui-monospace,monospace;color:var(--text);font-size:13px;margin-right:6px}
.vide{color:var(--dim);padding:40px 0;text-align:center}
footer{color:var(--dim);font-size:13px;padding:50px 0 40px;text-align:center}
footer a{color:var(--muted)}
@media (max-width:560px){.grille{grid-template-columns:1fr}.btn.ret{display:none}}
</style>
</head>
<body>
<div class="glow"></div>
<header><div class="wrap"><nav>
  <a class="logo" href="../" id="lien-accueil"><img src="../wumi-icone.svg" alt=""><span>wumi<span class="dot">.</span></span></a>
  <div class="nav-fin">
    <a class="btn ret" href="../" id="retour">← Site</a>
    <button class="btn" type="button" data-lang="en">EN</button>
    <button class="btn" type="button" data-lang="fr">FR</button>
  </div>
</nav></div></header>

<main class="wrap">
  <section class="hero">
    <div class="eyebrow" id="t-eyebrow"></div>
    <h1 id="t-titre"></h1>
    <p class="lead" id="t-lead"></p>
  </section>
  <div class="outils"><input type="search" id="recherche" autocomplete="off"></div>
  <div class="filtres" id="filtres"></div>
  <div id="liste"></div>
</main>
<footer class="wrap" id="t-pied"></footer>

<script>
const API = 'https://ton-serveur.tailXXXX.ts.net/api/commandes';
// Copie de secours, generee le ${new Date().toISOString().slice(0, 10)} : utilisee seulement si le bot ne repond pas.
let D = ${process.argv.includes('--sans-copie') ? '{ categories: {}, commandes: [] }' : donnees};
const T = {
  en: { eyebrow: 'Commands', titre: 'Every command, <span class="serif grad">one place.</span>', lead: 'Type / in Discord and pick a Wumi command. This list is generated from the bot itself, so it is always up to date.', recherche: 'Search a command…', tout: 'All', staff: 'Staff', clic: 'Right-click on a message or member', vide: 'No command matches.', charge: 'Loading the commands…', hors: 'Wumi is not answering right now. Try again in a moment.', n: (n) => n + (n > 1 ? ' commands' : ' command'), pied: 'Generated from the bot code · ', retour: '← Site', accueil: '../' },
  fr: { eyebrow: 'Commandes', titre: 'Toutes les commandes, <span class="serif grad">au même endroit.</span>', lead: 'Tape / dans Discord et choisis une commande Wumi. Cette liste est générée à partir du bot lui-même : elle est toujours à jour.', recherche: 'Chercher une commande…', tout: 'Toutes', staff: 'Staff', clic: 'Clic droit sur un message ou un membre', vide: 'Aucune commande ne correspond.', charge: 'Chargement des commandes…', hors: 'Wumi ne répond pas pour le moment. Réessaie dans un instant.', n: (n) => n + (n > 1 ? ' commandes' : ' commande'), pied: 'Générée à partir du code du bot · ', retour: '← Site', accueil: '../fr/' },
};
let langue = 'en';
try { langue = new URLSearchParams(location.search).get('lang') || localStorage.getItem('wumi-lang') || (/^fr/i.test(navigator.language) ? 'fr' : 'en'); } catch (e) { /* stockage indisponible */ }
if (!T[langue]) langue = 'en';
let filtre = '';
let horsLigne = false;

const el = (tag, props = {}, ...enfants) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) { if (k === 'text') n.textContent = v; else if (k === 'class') n.className = v; else n.setAttribute(k, v); }
  for (const e of enfants.flat()) if (e != null) n.append(e);
  return n;
};
const norm = (s) => String(s || '').normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').toLowerCase();

function rendre() {
  const t = T[langue];
  document.documentElement.lang = langue;
  document.title = 'Wumi · ' + t.eyebrow;
  document.getElementById('t-eyebrow').textContent = t.eyebrow;
  document.getElementById('t-titre').innerHTML = t.titre;
  document.getElementById('t-lead').textContent = t.lead;
  document.getElementById('retour').textContent = t.retour;
  document.getElementById('retour').href = t.accueil;
  document.getElementById('lien-accueil').href = t.accueil;
  document.getElementById('recherche').placeholder = t.recherche;
  document.querySelectorAll('[data-lang]').forEach((b) => b.classList.toggle('on', b.dataset.lang === langue));
  const pied = document.getElementById('t-pied');
  pied.replaceChildren(t.pied + t.n(D.commandes.length) + ' · ', el('a', { href: t.accueil, text: 'wumi.fr' }));

  const q = norm(document.getElementById('recherche').value);
  const nom = (c) => c[langue];
  const desc = (c) => (langue === 'fr' ? c.dfr : c.den);
  const visibles = D.commandes.filter((c) => (!filtre || c.cat === filtre) && (!q || norm([c.en, c.fr, c.den, c.dfr, ...c.sous.flatMap((s) => [s.en, s.fr, s.den, s.dfr])].join(' ')).includes(q)));

  const cats = Object.keys(D.categories).filter((k) => D.commandes.some((c) => c.cat === k));
  document.getElementById('filtres').replaceChildren(
    el('button', { class: 'filtre' + (filtre ? '' : ' on'), type: 'button', 'data-cat': '' }, t.tout),
    ...cats.map((k) => el('button', { class: 'filtre' + (filtre === k ? ' on' : ''), type: 'button', 'data-cat': k }, D.categories[k].e + ' ' + D.categories[k][langue]))
  );

  const liste = document.getElementById('liste');
  if (!D.commandes.length) return liste.replaceChildren(el('p', { class: 'vide', text: horsLigne ? t.hors : t.charge }));
  if (!visibles.length) return liste.replaceChildren(el('p', { class: 'vide', text: t.vide }));
  liste.replaceChildren(...cats.filter((k) => visibles.some((c) => c.cat === k)).map((k) => {
    const cs = visibles.filter((c) => c.cat === k).sort((a, b) => nom(a).localeCompare(nom(b)));
    return el('section', {},
      el('h2', {}, D.categories[k].e + ' ' + D.categories[k][langue], el('small', { text: t.n(cs.length) })),
      el('div', { class: 'grille' }, cs.map((c) => el('article', { class: 'cmd' },
        el('div', { class: 'nom' }, (c.clic ? '' : '/') + nom(c), c.staff ? el('span', { class: 'badge', text: t.staff }) : null),
        el('p', { text: c.clic ? t.clic : desc(c) }),
        c.sous.length ? el('ul', {}, c.sous.map((s) => el('li', {}, el('code', { text: s[langue] }), langue === 'fr' ? s.dfr : s.den))) : null
      ))));
  }));
}

document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-lang]');
  if (b) { langue = b.dataset.lang; try { localStorage.setItem('wumi-lang', langue); } catch (er) { /* rien */ } rendre(); }
  const f = e.target.closest('[data-cat]');
  if (f) { filtre = f.dataset.cat; rendre(); }
});
document.getElementById('recherche').addEventListener('input', rendre);
rendre();
// La liste en direct, depuis le bot lui-meme.
fetch(API, { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).then((x) => { if (x && x.commandes && x.commandes.length) D = x; else horsLigne = true; rendre(); }).catch(() => { horsLigne = true; rendre(); });
</script>
</body>
</html>
`;

fs.mkdirSync(path.dirname(SORTIE), { recursive: true });
fs.writeFileSync(SORTIE, page);
console.log(`${commandes.length} commandes ecrites dans ${path.relative(RACINE, SORTIE)}`);
process.exit(0);
