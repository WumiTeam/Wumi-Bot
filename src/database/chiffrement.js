/**
 * Chiffrement au repos des textes sensibles (Wumi 2.18).
 *
 * La politique developpeurs de Discord exige que les donnees stockees soient
 * chiffrees au repos. Ce module chiffre, dans la base SQLite, tout ce qu'un
 * membre ou un moderateur a ECRIT : contenu des messages signales, textes des
 * suggestions, appels, candidatures, tickets, raisons des sanctions, notes du
 * staff. Les identifiants et les compteurs (XP, solde...) restent en clair :
 * ils servent aux tris et aux classements.
 *
 * Algorithme : AES-256-GCM (authentifie), un IV aleatoire par valeur.
 * Format stocke : « enc:v1: » + base64( iv[12] | tag[16] | chiffre ).
 *
 * Tout est TRANSPARENT pour le reste du code :
 *   - en ecriture, les requetes INSERT/UPDATE sur une colonne ciblee sont
 *     reperees a la preparation et leurs parametres chiffres a l'execution ;
 *   - en lecture, toute valeur qui commence par « enc:v1: » est dechiffree.
 * Une valeur ancienne, encore en clair, est lue telle quelle ; la migration du
 * demarrage la chiffre une fois pour toutes.
 *
 * LA CLE : CHIFFREMENT_CLE dans le .env (32 octets en base64). Si elle manque,
 * elle est generee et ajoutee au .env au premier demarrage. Sans elle, les
 * textes chiffres sont ILLISIBLES : elle doit etre sauvegardee avec la base.
 */
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const PREFIXE = 'enc:v1:';

/** Table -> colonnes chiffrees. */
const CIBLES = {
  signalements: ['contenu', 'raison'],
  suggestions: ['texte', 'reponse'],
  appels: ['texte', 'reponse'],
  candidatures: ['reponses', 'reponse'],
  support_tickets: ['motif', 'reponses', 'raison'],
  tickets: ['sujet', 'description', 'raison_fermeture'],
  sanctions: ['raison'],
  mod_notes: ['texte'],
};

let cle = null;

/** Lit la cle, ou la cree et l'enregistre dans le .env. */
function charger() {
  if (cle) return cle;
  let brut = String(process.env.CHIFFREMENT_CLE ?? '').trim();
  if (!brut) {
    brut = crypto.randomBytes(32).toString('base64');
    // 2.35 : une edition ecrit dans SON fichier (WUMI_ENV), jamais dans celui de Wumi.
    const fichier = path.join(__dirname, '..', '..', process.env.WUMI_ENV || '.env');
    if (fs.existsSync(fichier)) {
      const contenu = fs.readFileSync(fichier, 'utf8');
      fs.appendFileSync(fichier, `${contenu.endsWith('\n') ? '' : '\n'}\n# Cle de chiffrement de la base (Wumi 2.18). A SAUVEGARDER : sans elle, les textes chiffres sont perdus.\nCHIFFREMENT_CLE=${brut}\n`);
      console.warn('[chiffrement] Nouvelle cle generee et ajoutee au .env (CHIFFREMENT_CLE). Sauvegarde-la avec la base.');
    } else {
      console.warn('[chiffrement] Pas de .env : cle temporaire en memoire (tests).');
    }
    process.env.CHIFFREMENT_CLE = brut;
  }
  const k = Buffer.from(brut, 'base64');
  if (k.length !== 32) throw new Error('CHIFFREMENT_CLE doit faire 32 octets encodes en base64');
  cle = k;
  return cle;
}

function chiffrer(valeur) {
  if (valeur === null || valeur === undefined) return valeur;
  const texte = String(valeur);
  if (texte.startsWith(PREFIXE)) return texte;
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', charger(), iv);
  const chiffre = Buffer.concat([c.update(texte, 'utf8'), c.final()]);
  return PREFIXE + Buffer.concat([iv, c.getAuthTag(), chiffre]).toString('base64');
}

function dechiffrer(valeur) {
  if (typeof valeur !== 'string' || !valeur.startsWith(PREFIXE)) return valeur;
  try {
    const b = Buffer.from(valeur.slice(PREFIXE.length), 'base64');
    const d = crypto.createDecipheriv('aes-256-gcm', charger(), b.subarray(0, 12));
    d.setAuthTag(b.subarray(12, 28));
    return Buffer.concat([d.update(b.subarray(28)), d.final()]).toString('utf8');
  } catch {
    return '[illisible : cle de chiffrement differente]';
  }
}

function dechiffrerLigne(ligne) {
  if (!ligne || typeof ligne !== 'object') return ligne;
  for (const k of Object.keys(ligne)) {
    const v = ligne[k];
    if (typeof v === 'string' && v.startsWith(PREFIXE)) ligne[k] = dechiffrer(v);
  }
  return ligne;
}

/** Position de chaque « ? » dans le SQL, hors chaines entre apostrophes. */
function positionsInterrogation(sql) {
  const pos = [];
  let dansChaine = false;
  for (let i = 0; i < sql.length; i++) {
    if (sql[i] === "'") dansChaine = !dansChaine;
    else if (sql[i] === '?' && !dansChaine) pos.push(i);
  }
  return pos;
}

/**
 * Pour une requete d'ecriture sur une table ciblee : quels parametres
 * chiffrer ? Renvoie { nommes: Set, positions: Set } ou null.
 */
function analyser(sql) {
  const s = sql.replace(/\s+/g, ' ').trim();
  let m = /^INSERT(?: OR \w+)? INTO (\w+) ?\(([^)]*)\) ?VALUES ?\((.*)\)/i.exec(s);
  const nommes = new Set();
  const positions = new Set();
  const marques = positionsInterrogation(s);
  const indexDe = (offset) => marques.indexOf(offset);
  if (m && CIBLES[m[1]]) {
    const colonnes = m[2].split(',').map((x) => x.trim());
    const valeursDebut = s.indexOf('(', s.toUpperCase().indexOf('VALUES')) + 1;
    let decalage = valeursDebut;
    const valeurs = m[3].split(',').map((x) => {
      const brut = x;
      const debut = s.indexOf(brut.trim(), decalage);
      decalage = debut + brut.trim().length;
      return { texte: brut.trim(), debut };
    });
    colonnes.forEach((col, i) => {
      if (!CIBLES[m[1]].includes(col) || !valeurs[i]) return;
      const v = valeurs[i].texte;
      if (/^[@:$]\w+$/.test(v)) nommes.add(v.slice(1));
      else if (v === '?') positions.add(indexDe(valeurs[i].debut));
    });
  } else if ((m = /^UPDATE (\w+) SET (.*?)( WHERE .*)?$/i.exec(s)) && CIBLES[m[1]]) {
    const debutSet = s.indexOf(m[2]);
    let decalage = debutSet;
    for (const morceau of m[2].split(',')) {
      const t = morceau.trim();
      const debut = s.indexOf(t, decalage);
      decalage = debut + t.length;
      const a = /^(\w+) ?= ?(.+)$/.exec(t);
      if (!a || !CIBLES[m[1]].includes(a[1])) continue;
      const v = a[2].trim();
      if (/^[@:$]\w+$/.test(v)) nommes.add(v.slice(1));
      else if (v === '?') positions.add(indexDe(debut + t.lastIndexOf('?')));
    }
  } else return null;
  return nommes.size || positions.size ? { nommes, positions } : null;
}

function preparerArgs(regle, args) {
  if (!regle) return args;
  if (args.length && args[0] && typeof args[0] === 'object' && !Array.isArray(args[0]) && !Buffer.isBuffer(args[0])) {
    const copie = { ...args[0] };
    for (const k of regle.nommes) if (k in copie) copie[k] = chiffrer(copie[k]);
    return [copie, ...args.slice(1)];
  }
  return args.map((v, i) => (regle.positions.has(i) ? chiffrer(v) : v));
}

/**
 * Branche le chiffrement sur une base node:sqlite : remplace db.prepare par une
 * version qui chiffre les ecritures ciblees et dechiffre toutes les lectures.
 */
function brancher(db) {
  charger();
  const preparer = db.prepare.bind(db);
  db.prepare = (sql) => {
    const st = preparer(sql);
    const regle = analyser(sql);
    return new Proxy(st, {
      get(cible, prop) {
        const v = cible[prop];
        if (prop === 'run') return (...a) => v.apply(cible, preparerArgs(regle, a));
        if (prop === 'get') return (...a) => dechiffrerLigne(v.apply(cible, preparerArgs(regle, a)));
        if (prop === 'all') return (...a) => v.apply(cible, preparerArgs(regle, a)).map(dechiffrerLigne);
        if (prop === 'iterate') {
          return function* iterer(...a) { for (const l of v.apply(cible, preparerArgs(regle, a))) yield dechiffrerLigne(l); };
        }
        return typeof v === 'function' ? v.bind(cible) : v;
      },
    });
  };
  db.preparerBrut = preparer;
  return db;
}

/** Chiffre une fois pour toutes les textes encore en clair. Renvoie le nombre de valeurs chiffrees. */
function migrer(db) {
  const preparer = db.preparerBrut ?? db.prepare.bind(db);
  const tables = new Set(preparer("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((t) => t.name));
  let n = 0;
  for (const [table, colonnes] of Object.entries(CIBLES)) {
    if (!tables.has(table)) continue;
    const existantes = new Set(preparer(`PRAGMA table_info(${table})`).all().map((c) => c.name));
    for (const col of colonnes) {
      if (!existantes.has(col)) continue;
      const lignes = preparer(`SELECT rowid AS r, ${col} AS v FROM ${table} WHERE ${col} IS NOT NULL AND ${col} NOT LIKE '${PREFIXE}%'`).all();
      if (!lignes.length) continue;
      const maj = preparer(`UPDATE ${table} SET ${col} = ? WHERE rowid = ?`);
      db.exec('BEGIN');
      try {
        for (const l of lignes) { maj.run(chiffrer(l.v), l.r); n++; }
        db.exec('COMMIT');
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      }
    }
  }
  return n;
}

module.exports = { chiffrer, dechiffrer, dechiffrerLigne, analyser, brancher, migrer, CIBLES, PREFIXE };
