/**
 * Le site vitrine de Blueprint.
 *
 * Trois pages, aucune dependance, aucun outil de construction : trois fichiers
 * HTML qu'on depose sur GitHub Pages, Netlify ou le VPS et qui marchent.
 *
 * POURQUOI IL FAUT CE SITE
 * Discord exige un lien PUBLIC vers les conditions d'utilisation et la
 * politique de confidentialite pour verifier une application — et la
 * verification est elle-meme exigee pour ouvrir les abonnements. Les deux
 * textes existent depuis longtemps dans le projet, en markdown : il leur
 * manquait une adresse.
 *
 * Les deux pages legales sont GENEREES depuis les .md du projet, jamais
 * recopiees : deux versions d'une politique de confidentialite qui divergent,
 * c'est exactement ce qu'il ne faut pas.
 */
require('dotenv').config();
const fs = require('node:fs');
const path = require('node:path');

// Le projet, quel que soit l'endroit d'ou on lance le script.
const R = path.join(__dirname, '..') + path.sep;
const SORTIE = path.join(R, 'site');
fs.mkdirSync(SORTIE, { recursive: true });

const liens = require(path.join(R, 'src', 'utils', 'liens'));
const PERMISSIONS = liens.bits();

// Les vraies adresses, lues dans le .env. Ce qui manque reste en clair dans la
// page, en majuscules : un texte qui saute aux yeux vaut mieux qu'un lien mort
// qu'on ne remarque pas.
const INVITATION = liens.invitation(null) ?? 'https://discord.com/oauth2/authorize?client_id=METS_TON_CLIENT_ID';
const SUPPORT = liens.support() ?? '#METS_SUPPORT_INVITE_DANS_TON_ENV';
const COURRIEL = (process.env.CONTACT_EMAIL ?? '').trim();

/**
 * LE BLOC CONTACT DES DEUX PAGES LEGALES.
 *
 * Les deux .md finissent par un encart « A REMPLIR » : c'est un gabarit, et il
 * doit le rester — le projet ne contient l'adresse de personne. Mais une page
 * publiee qui affiche encore « <ton adresse> » est exactement ce qui fait
 * refuser une verification : Discord reclame une adresse de contact VALIDE.
 *
 * Le gabarit est donc remplace ICI, a la generation, par ce qui est dans le
 * .env. Ce qui manque reste ecrit en majuscules dans la page : un trou qu'on
 * voit vaut mieux qu'un trou qu'on ne voit pas.
 */
const GABARIT_CONTACT = /\*\*(?:À|A) REMPLIR[^\n]*\*\*\s*\n+- E-mail de contact :[^\n]*\n- Serveur de support :[^\n]*/;

function remplirContact(markdown) {
  if (!GABARIT_CONTACT.test(markdown)) return markdown;
  const courriel = COURRIEL
    ? `- E-mail de contact : [${COURRIEL}](mailto:${COURRIEL})`
    : '- E-mail de contact : `METS CONTACT_EMAIL DANS TON .ENV`';
  const support = SUPPORT.startsWith('#')
    ? '- Serveur de support : `METS SUPPORT_INVITE DANS TON .ENV`'
    : `- Serveur de support : [${SUPPORT}](${SUPPORT})`;
  return markdown.replace(GABARIT_CONTACT, `${courriel}\n${support}`);
}

// ------------------------------------------------------------- MARKDOWN
/** Un convertisseur minimal, suffisant pour ces deux documents. */
function enHtml(markdown) {
  const lignes = markdown.split('\n');
  const sortie = [];
  let dansListe = false;
  let dansTable = false;

  const enligne = (t) => t
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (m, texte, href) =>
      `<a href="${href.replace('CONFIDENTIALITE.md', 'confidentialite.html').replace('CONDITIONS.md', 'conditions.html')}">${texte}</a>`);

  const fermer = () => {
    if (dansListe) { sortie.push('</ul>'); dansListe = false; }
    if (dansTable) { sortie.push('</tbody></table>'); dansTable = false; }
  };

  for (const brute of lignes) {
    const ligne = brute.trimEnd();

    if (!ligne.trim()) { fermer(); continue; }
    if (/^---+$/.test(ligne.trim())) { fermer(); sortie.push('<hr>'); continue; }

    const titre = ligne.match(/^(#{1,4})\s+(.*)$/);
    if (titre) {
      fermer();
      const n = titre[1].length;
      sortie.push(`<h${n}>${enligne(titre[2])}</h${n}>`);
      continue;
    }

    // Tableaux : | a | b |
    if (ligne.trim().startsWith('|')) {
      const cellules = ligne.split('|').slice(1, -1).map((c) => c.trim());
      if (cellules.every((c) => /^:?-{2,}:?$/.test(c))) continue; // ligne de separation
      if (!dansTable) {
        fermer();
        sortie.push('<table><thead><tr>' + cellules.map((c) => `<th>${enligne(c)}</th>`).join('') + '</tr></thead><tbody>');
        dansTable = true;
        continue;
      }
      sortie.push('<tr>' + cellules.map((c) => `<td>${enligne(c)}</td>`).join('') + '</tr>');
      continue;
    }
    if (dansTable) { sortie.push('</tbody></table>'); dansTable = false; }

    const puce = ligne.match(/^\s*[-*]\s+(.*)$/);
    if (puce) {
      if (!dansListe) { sortie.push('<ul>'); dansListe = true; }
      sortie.push(`<li>${enligne(puce[1])}</li>`);
      continue;
    }
    if (dansListe) { sortie.push('</ul>'); dansListe = false; }

    sortie.push(`<p>${enligne(ligne)}</p>`);
  }
  fermer();
  return sortie.join('\n');
}

// ----------------------------------------------------------------- STYLE
const STYLE = `
:root{
  --fond:#16121f; --fond2:#1d1830; --carte:#221c36; --bord:#332a52;
  --violet:#6244b8; --violet-clair:#a48ce8; --texte:#ece9f5; --doux:#a9a2c4;
}
*{box-sizing:border-box}
body{margin:0;background:var(--fond);color:var(--texte);
  font:16px/1.65 "Inter",system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
.grille{position:fixed;inset:0;z-index:0;pointer-events:none;opacity:.5;
  background-image:linear-gradient(rgba(164,140,232,.06) 1px,transparent 1px),
                   linear-gradient(90deg,rgba(164,140,232,.06) 1px,transparent 1px);
  background-size:44px 44px}
.page{position:relative;z-index:1;max-width:860px;margin:0 auto;padding:0 24px 80px}
header{padding:72px 0 40px;text-align:center}
.cube{width:88px;height:88px;margin:0 auto 22px;display:block}
h1{font-size:clamp(2.1rem,6vw,3.2rem);margin:0 0 10px;letter-spacing:-.02em}
.sous{color:var(--doux);font-size:1.13rem;max-width:600px;margin:0 auto}
.boutons{display:flex;gap:12px;justify-content:center;flex-wrap:wrap;margin:34px 0 0}
.b{display:inline-block;padding:13px 26px;border-radius:11px;text-decoration:none;
  font-weight:600;border:1px solid transparent;transition:transform .12s ease,filter .12s ease}
.b:hover{transform:translateY(-2px)}
.b1{background:var(--violet);color:#fff}
.b1:hover{filter:brightness(1.14)}
.b2{background:transparent;color:var(--texte);border-color:var(--bord)}
.b2:hover{border-color:var(--violet-clair)}
.cartes{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:16px;margin:56px 0}
.carte{background:var(--carte);border:1px solid var(--bord);border-radius:15px;padding:22px}
.carte h3{margin:0 0 8px;font-size:1.05rem}
.carte p{margin:0;color:var(--doux);font-size:.94rem}
.bandeau{background:var(--fond2);border:1px solid var(--bord);border-radius:15px;
  padding:26px;margin:44px 0;text-align:center}
.bandeau strong{color:var(--violet-clair)}
footer{border-top:1px solid var(--bord);margin-top:64px;padding-top:26px;
  color:var(--doux);font-size:.9rem;display:flex;gap:18px;justify-content:center;flex-wrap:wrap}
footer a{color:var(--doux)}
a{color:var(--violet-clair)}
h2{margin:42px 0 12px;font-size:1.45rem;border-bottom:1px solid var(--bord);padding-bottom:8px}
h3{margin:26px 0 8px;font-size:1.1rem}
hr{border:0;border-top:1px solid var(--bord);margin:32px 0}
code{background:#0f0c17;border:1px solid var(--bord);border-radius:5px;
  padding:2px 6px;font-size:.88em;font-family:ui-monospace,Menlo,Consolas,monospace}
table{width:100%;border-collapse:collapse;margin:16px 0;font-size:.95rem}
th,td{text-align:left;padding:10px 12px;border-bottom:1px solid var(--bord);vertical-align:top}
th{color:var(--violet-clair);font-weight:600}
.retour{display:inline-block;margin:34px 0 0;color:var(--doux);text-decoration:none}
.cmd{border-left:2px solid var(--bord);padding:2px 0 2px 16px;margin:18px 0}
.cmd:hover{border-left-color:var(--violet-clair)}
.cmd-nom{font-size:1.02rem;margin:0 0 4px}
.cmd-nom code{background:#0f0c17;color:var(--violet-clair);font-weight:600;font-size:.98em}
.alias{color:var(--doux);font-size:.9rem;font-weight:400}
.alias code{color:var(--doux);font-weight:400}
.cmd p{margin:0;color:var(--doux);font-size:.95rem}
.sous-cmd{margin:8px 0 0;padding-left:18px;list-style:none}
.sous-cmd li{color:var(--doux);font-size:.9rem;margin:3px 0;position:relative}
.sous-cmd li::before{content:'';position:absolute;left:-12px;top:.7em;width:6px;height:1px;background:var(--bord)}
.cartes .carte h3{font-size:1.7rem;color:var(--texte);margin:0 0 2px}
.chiffres{grid-template-columns:repeat(auto-fit,minmax(160px,1fr));margin:28px 0 0}
@media (max-width:560px){.cmd{padding-left:12px}}

@media (max-width:560px){header{padding:48px 0 28px}.page{padding:0 18px 60px}}
`;

/** Le cube en fil de fer, en SVG : le logo du bot, sans fichier a heberger. */
const CUBE = `<svg class="cube" viewBox="0 0 100 100" fill="none" stroke="#a48ce8" stroke-width="3"
  stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <path d="M50 8 L88 30 L88 70 L50 92 L12 70 L12 30 Z"/>
  <path d="M50 8 L50 48 M50 48 L88 30 M50 48 L12 30"/>
  <path d="M50 48 L50 92" stroke-dasharray="5 6" opacity=".55"/>
</svg>`;

function page({ titre, description, corps, retour = false }) {
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${titre}</title>
<meta name="description" content="${description}">
<meta property="og:title" content="${titre}">
<meta property="og:description" content="${description}">
<meta name="theme-color" content="#6244b8">
<style>${STYLE}</style>
</head>
<body>
<div class="grille"></div>
<div class="page">
${corps}
${retour ? '<a class="retour" href="./">← Retour à l\'accueil</a>' : ''}
<footer>
  <a href="./">Accueil</a>
  <a href="./commandes.html">Commandes</a>
  <a href="./statut.html">Statut</a>
  <a href="./conditions.html">Conditions d'utilisation</a>
  <a href="./confidentialite.html">Confidentialité</a>
</footer>
</div>
</body>
</html>
`;
}

// ------------------------------------------------------------- ACCUEIL
const FONCTIONS = [
  ['Niveaux', 'XP à l\'écrit et en vocal, cartes de rang en image, thèmes à débloquer, prestige, badges et classement du serveur.'],
  ['Économie', 'Une monnaie, une boutique qui donne des rôles, une banque, des objets, des missions quotidiennes et hebdomadaires.'],
  ['Modération', 'Avertissements, exclusions, automod, anti-raid, historique des sanctions et contestations.'],
  ['Tickets', 'Un support privé, avec formulaire et transcription à la fermeture.'],
  ['Communauté', 'Suggestions avec votes, candidatures, anniversaires, concours, FAQ automatique.'],
  ['Annonces', 'Twitch, YouTube, Instagram, TikTok et RSS : le bot surveille et poste dès qu\'il y a du neuf.'],
];

const accueil = page({
  titre: 'Blueprint — bot Discord',
  description: 'Niveaux, économie, modération, tickets, suggestions et annonces automatiques. Réglable serveur par serveur, en français et en anglais.',
  corps: `
<header>
  ${CUBE}
  <h1>Blueprint</h1>
  <p class="sous">Niveaux, économie, modération, tickets, suggestions et annonces automatiques.
     Tout se règle serveur par serveur — et rien n'est allumé sans que tu le demandes.</p>
  <div class="boutons">
    <a class="b b1" href="${INVITATION}">Ajouter à mon serveur</a>
    <a class="b b2" href="${SUPPORT}">Serveur de support</a>
  </div>
</header>

<div class="cartes">
${FONCTIONS.map(([t, d]) => `  <div class="carte"><h3>${t}</h3><p>${d}</p></div>`).join('\n')}
</div>

<div class="bandeau">
  <p><strong>Deux minutes pour l'installer.</strong> <code>/demarrer</code> fait le tour des réglages
  essentiels en quelques menus. <code>/config</code> ouvre le panneau complet, catégorie par catégorie.</p>
</div>

<h2>Ce qui compte, et qu'on ne dit jamais</h2>
<ul>
  <li><strong>Pas de permission « Administrateur ».</strong> Le lien d'invitation demande
      exactement ce dont le bot se sert, et rien d'autre.</li>
  <li><strong>Tes données restent à toi.</strong> Retire le bot, et tout ce qui concerne ton
      serveur est effacé immédiatement. Aucune copie gardée.</li>
  <li><strong>Français et anglais.</strong> Une langue par serveur, choisie dans le panneau.</li>
  <li><strong>Rien n'est réservé au premium.</strong> Le premium relève des plafonds ;
      il ne déverrouille aucune fonction.</li>
</ul>
`,
});

// ----------------------------------------------------- PAGES LEGALES
const conditions = page({
  titre: "Conditions d'utilisation — Blueprint",
  description: "Les conditions d'utilisation du bot Discord Blueprint.",
  corps: enHtml(remplirContact(fs.readFileSync(path.join(R, 'CONDITIONS.md'), 'utf8'))),
  retour: true,
});

const confidentialite = page({
  titre: 'Politique de confidentialité — Blueprint',
  description: 'Ce que le bot Discord Blueprint enregistre, pourquoi, et comment le faire effacer.',
  corps: enHtml(remplirContact(fs.readFileSync(path.join(R, 'CONFIDENTIALITE.md'), 'utf8'))),
  retour: true,
});

// ------------------------------------------------- LA PAGE DES COMMANDES
/**
 * ELLE EST LUE DANS LE CODE, JAMAIS RECOPIEE.
 *
 * Une liste de commandes ecrite a la main est fausse le jour ou on en ajoute
 * une — et personne ne s'en apercoit, parce qu'une page de documentation ne
 * plante pas. Ici, on CHARGE les commandes du projet et on lit leur nom, leurs
 * sous-commandes et leur description traduite. La page ne peut pas mentir.
 *
 * Les noms sont affiches dans les DEUX langues quand ils different, parce que
 * c'est exactement ce qui surprend : un francophone tape `/bannir`, la
 * documentation anglaise dit `/ban`, et ce sont bien la meme commande.
 */
function chargerCommandes() {
  const L = require(path.join(R, 'src', 'utils', 'langues'));
  const racine = path.join(R, 'src', 'commands');
  const sortie = [];

  const parcourir = (d) => {
    for (const f of fs.readdirSync(d)) {
      const p = path.join(d, f);
      if (fs.statSync(p).isDirectory()) { parcourir(p); continue; }
      if (!f.endsWith('.js')) continue;
      let mod;
      try { mod = require(p); } catch { continue; }
      if (!mod?.data) continue;
      // Les commandes du fondateur ne sont deployees que sur le serveur
      // support : les documenter publiquement n'aurait aucun sens.
      if (mod.fondateur || mod.categorie === 'fondateur') continue;
      let j;
      try { j = mod.data.toJSON(); } catch { continue; }

      const nomFr = j.name_localizations?.fr ?? null;
      const sous = [];
      const creuser = (o, prefixe = '') => {
        for (const x of o.options ?? []) {
          if (x.type === 2) { creuser(x, `${prefixe}${x.name} `); continue; }
          if (x.type !== 1) continue;
          sous.push({
            nom: `${prefixe}${x.name}`,
            description: x.description_localizations?.fr ?? x.description,
          });
        }
      };
      creuser(j);

      sortie.push({
        categorie: mod.categorie ?? 'utilitaires',
        nom: j.name,
        nomFr: nomFr && nomFr !== j.name ? nomFr : null,
        // La description francaise si elle existe, sinon celle par defaut.
        description: j.description_localizations?.fr ?? j.description ?? '',
        contexte: j.type === 2 || j.type === 3 ? 'clic droit' : null,
        sous,
      });
    }
  };
  parcourir(racine);

  // L'ordre des categories est celui de /aide : le meme classement partout.
  const ORDRE = ['niveau', 'economie', 'moderation', 'tickets', 'suggestions',
    'candidatures', 'invitations', 'vocal', 'config', 'utilitaires'];
  const titres = {
    niveau: 'Niveaux', economie: 'Économie', moderation: 'Modération',
    tickets: 'Tickets', suggestions: 'Suggestions', candidatures: 'Candidatures',
    invitations: 'Invitations', vocal: 'Salons vocaux', config: 'Configuration',
    utilitaires: 'Utilitaires',
  };

  const groupes = [];
  for (const cle of ORDRE) {
    const liste = sortie.filter((c) => c.categorie === cle).sort((a, b) => a.nom.localeCompare(b.nom));
    if (liste.length) groupes.push({ titre: titres[cle] ?? cle, liste });
  }
  // Une categorie apparue depuis ne doit pas disparaitre de la page en silence.
  const connues = new Set(ORDRE);
  for (const c of sortie) {
    if (connues.has(c.categorie)) continue;
    connues.add(c.categorie);
    groupes.push({ titre: c.categorie, liste: sortie.filter((x) => x.categorie === c.categorie) });
  }
  return { groupes, total: sortie.length };
}

const { groupes, total: totalCommandes } = chargerCommandes();

const echapper = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const commandes = page({
  titre: 'Commandes — Blueprint',
  description: `Les ${totalCommandes} commandes de Blueprint, par catégorie.`,
  retour: true,
  corps: `
<h1 style="font-size:2rem;margin:48px 0 8px">Les commandes</h1>
<p class="sous" style="margin:0 0 8px">${totalCommandes} commandes, rangées comme dans <code>/aide</code>.
   Cette page est générée depuis le code du bot : elle ne peut pas être périmée.</p>
<p class="sous" style="margin:0 0 32px;font-size:.95rem">Blueprint parle français et anglais.
   Quand les deux noms diffèrent, les deux sont indiqués — c'est la même commande.</p>
${groupes.map((g) => `
<h2>${echapper(g.titre)} <span style="color:var(--doux);font-weight:400;font-size:1rem">· ${g.liste.length}</span></h2>
${g.liste.map((c) => `  <div class="cmd">
    <div class="cmd-nom"><code>/${echapper(c.nom)}</code>${c.nomFr ? ` <span class="alias">ou <code>/${echapper(c.nomFr)}</code></span>` : ''}${c.contexte ? ` <span class="alias">· ${c.contexte}</span>` : ''}</div>
    <p>${echapper(c.description)}</p>
${c.sous.length ? `    <ul class="sous-cmd">${c.sous.map((s) => `<li><code>${echapper(s.nom)}</code> — ${echapper(s.description)}</li>`).join('')}</ul>` : ''}
  </div>`).join('\n')}
`).join('\n')}
`,
});

// ---------------------------------------------------- LA PAGE DE STATUT
/**
 * Elle lit `statut.json`, que le bot ecrit lui-meme (src/utils/statut.js).
 *
 * LE POINT DELICAT : ce fichier peut etre VIEUX. Sur GitHub Pages il date de
 * la derniere publication du site, pas de la derniere minute. La page affiche
 * donc toujours l'AGE du releve, et cesse d'annoncer « en ligne » des qu'il
 * depasse un quart d'heure. Une page de statut qui affiche un vert perime est
 * pire que pas de page du tout : elle fait perdre du temps a tout le monde.
 */
const statut = page({
  titre: 'Statut — Blueprint',
  description: 'L\'état de Blueprint : en ligne, serveurs, latence.',
  retour: true,
  corps: `
<h1 style="font-size:2rem;margin:48px 0 8px">Statut</h1>
<p class="sous" style="margin:0 0 32px">Relevé par le bot lui-même, toutes les cinq minutes.</p>

<div id="etat" class="bandeau" style="text-align:left">
  <p style="margin:0;color:var(--doux)">Lecture du relevé…</p>
</div>

<div class="cartes chiffres" id="chiffres" hidden>
  <div class="carte"><h3 id="n-serveurs">—</h3><p>serveurs</p></div>
  <div class="carte"><h3 id="n-membres">—</h3><p>membres</p></div>
  <div class="carte"><h3 id="n-latence">—</h3><p>latence</p></div>
  <div class="carte"><h3 id="n-debout">—</h3><p>en route depuis</p></div>
</div>

<p class="sous" id="note" style="font-size:.92rem"></p>

<script>
const $ = (id) => document.getElementById(id);
const nb = (n) => (n === null || n === undefined) ? '—' : n.toLocaleString('fr-FR');

function duree(ms) {
  const s = Math.floor(ms / 1000);
  const j = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
  if (j) return j + ' j ' + h + ' h';
  if (h) return h + ' h ' + m + ' min';
  return m + ' min';
}

function poser(couleur, titre, detail) {
  $('etat').innerHTML =
    '<p style="margin:0;font-size:1.15rem"><strong style="color:' + couleur + '">' + titre + '</strong></p>' +
    (detail ? '<p style="margin:8px 0 0;color:var(--doux)">' + detail + '</p>' : '');
}

fetch('./statut.json?t=' + Date.now())
  .then((r) => { if (!r.ok) throw new Error('absent'); return r.json(); })
  .then((d) => {
    const age = Date.now() - d.date;
    // Au-dela d'un quart d'heure, on ne PEUT plus affirmer que le bot tourne :
    // on dit ce qu'on sait, c'est-a-dire la date du dernier releve.
    const frais = age < 15 * 60 * 1000;

    if (d.enLigne && frais) poser('#6ee7a8', '● En ligne', 'Relevé il y a ' + duree(age) + '.');
    else if (d.enLigne) poser('#e8c46a', '● Dernier relevé il y a ' + duree(age),
      'Le site est publié moins souvent que le bot ne se relève. Ce n\\'est pas une panne, c\\'est une photo un peu ancienne.');
    else poser('#f08a8a', '● Hors ligne', 'Dernier relevé il y a ' + duree(age) + '.');

    $('n-serveurs').textContent = nb(d.serveurs);
    $('n-membres').textContent = nb(d.membres);
    $('n-latence').textContent = d.latenceMs === null ? '—' : d.latenceMs + ' ms';
    $('n-debout').textContent = duree(Date.now() - d.demarreLe);
    $('chiffres').hidden = false;
    $('note').textContent = d.shards ? 'Réparti sur ' + d.shards + ' shards.' : '';
  })
  .catch(() => {
    poser('var(--doux)', 'Relevé indisponible',
      'Le fichier statut.json n\\'a pas encore été publié. Il apparaît au premier démarrage du bot, puis à chaque mise en ligne du site.');
  });
</script>
`,
});

fs.writeFileSync(path.join(SORTIE, 'index.html'), accueil);
fs.writeFileSync(path.join(SORTIE, 'commandes.html'), commandes);
fs.writeFileSync(path.join(SORTIE, 'statut.html'), statut);
fs.writeFileSync(path.join(SORTIE, 'conditions.html'), conditions);
fs.writeFileSync(path.join(SORTIE, 'confidentialite.html'), confidentialite);

console.log('site/ ecrit :');
for (const f of fs.readdirSync(SORTIE)) {
  console.log(`  ${f} — ${(fs.statSync(path.join(SORTIE, f)).size / 1024).toFixed(1)} Ko`);
}
if (INVITATION.includes('METS_TON_CLIENT_ID')) console.log('\n  ! CLIENT_ID manquant dans le .env : le bouton d\'invitation ne marchera pas.');
if (SUPPORT.startsWith('#')) console.log('  ! SUPPORT_INVITE manquant dans le .env : le bouton du serveur support ne mene nulle part.');
if (!COURRIEL) console.log('  ! CONTACT_EMAIL manquant dans le .env : les deux pages legales n\'ont pas d\'adresse de contact,\n    et Discord en exige une pour verifier l\'application.');
console.log('\nDepose le contenu de site/ sur GitHub Pages, Netlify, ou ton VPS.');
