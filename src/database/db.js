const fs = require('node:fs');
const path = require('node:path');
const { E } = require('../utils/emojis');

// SQLite integre a Node (module `node:sqlite`) : aucune dependance native a
// compiler, donc pas besoin de Python ni de Visual Studio pour installer le bot.
// Necessite Node 22.5 ou plus recent — Node 24+ recommande (module stabilise).
let DatabaseSync;
try {
  ({ DatabaseSync } = require('node:sqlite'));
} catch {
  console.error(
    "\nErreur : ta version de Node ne fournit pas le module SQLite integre.\n" +
      `Version detectee : ${process.version} — il en faut au minimum 22.5, idealement 24 ou plus.\n` +
      'Installe Node 24 LTS depuis https://nodejs.org puis relance le bot.\n'
  );
  process.exit(1);
}

const cheminDb = path.resolve(process.env.DATABASE_PATH || './data/zhaak.db');
fs.mkdirSync(path.dirname(cheminDb), { recursive: true });

const db = new DatabaseSync(cheminDb);
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');

// ---------------------------------------------------------------------- SCHEMA
db.exec(`
CREATE TABLE IF NOT EXISTS config (
  guild_id              TEXT PRIMARY KEY,

  -- Bienvenue / au revoir
  salon_bienvenue       TEXT,
  message_bienvenue     TEXT,
  carte_bienvenue       INTEGER NOT NULL DEFAULT 1,
  salon_aurevoir        TEXT,
  message_aurevoir      TEXT,
  role_auto             TEXT,
  mp_bienvenue          TEXT,

  -- Logs
  log_messages          TEXT,
  log_membres           TEXT,
  log_moderation        TEXT,
  log_serveur           TEXT,
  log_vocal             TEXT,

  -- XP
  xp_actif              INTEGER NOT NULL DEFAULT 1,
  xp_vocal_actif        INTEGER NOT NULL DEFAULT 1,
  salon_levelup         TEXT,                       -- id de salon, 'actuel', 'mp' ou 'off'
  message_levelup       TEXT,

  -- Automod
  automod_actif         INTEGER NOT NULL DEFAULT 0,
  automod_spam          INTEGER NOT NULL DEFAULT 1,
  automod_invitations   INTEGER NOT NULL DEFAULT 1,
  automod_liens         INTEGER NOT NULL DEFAULT 0,
  automod_mots          INTEGER NOT NULL DEFAULT 1,
  automod_mentions      INTEGER NOT NULL DEFAULT 1,
  automod_majuscules    INTEGER NOT NULL DEFAULT 0,

  -- Anti-raid
  antiraid_actif        INTEGER NOT NULL DEFAULT 0,
  antiraid_age_min      INTEGER NOT NULL DEFAULT 0, -- age minimum du compte en jours (0 = off)
  antiraid_verrouille   INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS xp (
  guild_id      TEXT NOT NULL,
  user_id       TEXT NOT NULL,
  xp            INTEGER NOT NULL DEFAULT 0,
  messages      INTEGER NOT NULL DEFAULT 0,
  secondes_vocal INTEGER NOT NULL DEFAULT 0,
  dernier_gain  INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (guild_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_xp_classement ON xp (guild_id, xp DESC);

CREATE TABLE IF NOT EXISTS recompenses (
  guild_id  TEXT NOT NULL,
  niveau    INTEGER NOT NULL,
  role_id   TEXT NOT NULL,
  PRIMARY KEY (guild_id, niveau)
);

CREATE TABLE IF NOT EXISTS sanctions (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id      TEXT NOT NULL,
  user_id       TEXT NOT NULL,
  moderateur_id TEXT NOT NULL,
  type          TEXT NOT NULL,   -- warn, mute, kick, ban, unban, unmute, automod
  raison        TEXT,
  duree         INTEGER,         -- en millisecondes (mute/ban temporaire)
  date          INTEGER NOT NULL,
  actif         INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_sanctions_membre ON sanctions (guild_id, user_id);

CREATE TABLE IF NOT EXISTS mots_interdits (
  guild_id TEXT NOT NULL,
  mot      TEXT NOT NULL,
  PRIMARY KEY (guild_id, mot)
);

CREATE TABLE IF NOT EXISTS exclusions (
  guild_id TEXT NOT NULL,
  type     TEXT NOT NULL,  -- 'xp_salon', 'xp_role', 'automod_salon', 'automod_role'
  cible_id TEXT NOT NULL,
  PRIMARY KEY (guild_id, type, cible_id)
);

CREATE TABLE IF NOT EXISTS tickets (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id         TEXT NOT NULL,
  numero           INTEGER NOT NULL,
  channel_id       TEXT NOT NULL,
  user_id          TEXT NOT NULL,
  type             TEXT,
  statut           TEXT NOT NULL DEFAULT 'ouvert',  -- 'ouvert' ou 'ferme'
  pris_par         TEXT,
  cree_le          INTEGER NOT NULL,
  ferme_le         INTEGER,
  ferme_par        TEXT,
  raison_fermeture TEXT
);
CREATE INDEX IF NOT EXISTS idx_tickets_salon ON tickets (channel_id);
CREATE INDEX IF NOT EXISTS idx_tickets_membre ON tickets (guild_id, user_id, statut);

CREATE TABLE IF NOT EXISTS suggestions (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id   TEXT NOT NULL,
  numero     INTEGER NOT NULL,
  user_id    TEXT NOT NULL,
  texte      TEXT NOT NULL,
  channel_id TEXT,
  message_id TEXT,
  thread_id  TEXT,
  statut     TEXT NOT NULL DEFAULT 'attente',  -- attente, acceptee, refusee, encours
  staff_id   TEXT,
  reponse    TEXT,
  date       INTEGER NOT NULL,
  repondu_le INTEGER
);
CREATE INDEX IF NOT EXISTS idx_suggestions_guild ON suggestions (guild_id, numero);
CREATE INDEX IF NOT EXISTS idx_suggestions_message ON suggestions (message_id);

CREATE TABLE IF NOT EXISTS suggestions_votes (
  suggestion_id INTEGER NOT NULL,
  user_id       TEXT NOT NULL,
  valeur        INTEGER NOT NULL,  -- 1 = pour, -1 = contre
  PRIMARY KEY (suggestion_id, user_id)
);

CREATE TABLE IF NOT EXISTS activite (
  guild_id TEXT NOT NULL,
  jour     TEXT NOT NULL,             -- AAAA-MM-JJ (heure de Paris)
  messages INTEGER NOT NULL DEFAULT 0,
  arrivees INTEGER NOT NULL DEFAULT 0,
  departs  INTEGER NOT NULL DEFAULT 0,
  vocal    INTEGER NOT NULL DEFAULT 0, -- minutes cumulees
  PRIMARY KEY (guild_id, jour)
);

CREATE TABLE IF NOT EXISTS activite_salons (
  guild_id   TEXT NOT NULL,
  jour       TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  messages   INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (guild_id, jour, channel_id)
);

-- Messages par heure (heure de Paris) : les heures de pointe de /stats.
CREATE TABLE IF NOT EXISTS activite_heures (
  guild_id TEXT NOT NULL,
  jour     TEXT NOT NULL,
  heure    INTEGER NOT NULL,          -- 0 a 23
  messages INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (guild_id, jour, heure)
);

-- Objets possedes par les membres (boutique d'objets consommables)
CREATE TABLE IF NOT EXISTS inventaire (
  guild_id TEXT NOT NULL,
  user_id  TEXT NOT NULL,
  objet    TEXT NOT NULL,
  quantite INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (guild_id, user_id, objet)
);

-- Effets temporaires actifs (double XP, couleur de pseudo...)
CREATE TABLE IF NOT EXISTS effets (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  user_id  TEXT NOT NULL,
  type     TEXT NOT NULL,
  valeur   TEXT,
  expire_le INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_effets_membre ON effets (guild_id, user_id, type);

-- Badges debloques
CREATE TABLE IF NOT EXISTS badges (
  guild_id  TEXT NOT NULL,
  user_id   TEXT NOT NULL,
  cle       TEXT NOT NULL,
  obtenu_le INTEGER NOT NULL,
  PRIMARY KEY (guild_id, user_id, cle)
);

-- Multiplicateurs d'XP attaches a un role
CREATE TABLE IF NOT EXISTS xp_multiplicateurs (
  guild_id       TEXT NOT NULL,
  role_id        TEXT NOT NULL,
  multiplicateur REAL NOT NULL DEFAULT 1,
  PRIMARY KEY (guild_id, role_id)
);

-- Fond de carte choisi par le membre
CREATE TABLE IF NOT EXISTS cartes_perso (
  guild_id TEXT NOT NULL,
  user_id  TEXT NOT NULL,
  url      TEXT NOT NULL,
  ajoute_le INTEGER NOT NULL,
  PRIMARY KEY (guild_id, user_id)
);

-- Activite par membre : heures actives et salons preferes (cumule, pas date)
CREATE TABLE IF NOT EXISTS membre_heures (
  guild_id TEXT NOT NULL,
  user_id  TEXT NOT NULL,
  heure    INTEGER NOT NULL,
  messages INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (guild_id, user_id, heure)
);
CREATE TABLE IF NOT EXISTS membre_salons (
  guild_id   TEXT NOT NULL,
  user_id    TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  messages   INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (guild_id, user_id, channel_id)
);

-- Qui a deja parle au moins une fois. Une table a part plutot que le
-- compteur de messages de la table xp : l'XP peut etre desactivee, un salon
-- peut en etre exclu, et on veut quand meme accueillir le premier message.
CREATE TABLE IF NOT EXISTS premiers_messages (
  guild_id TEXT NOT NULL,
  user_id  TEXT NOT NULL,
  date     INTEGER NOT NULL,
  PRIMARY KEY (guild_id, user_id)
);

-- Photographies de la structure du serveur (roles, salons, permissions).
-- Le contenu est un JSON complet : une photo se suffit a elle-meme, meme si
-- le format evolue, d'ou la colonne version.
CREATE TABLE IF NOT EXISTS structures (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id   TEXT NOT NULL,
  nom        TEXT,
  contenu    TEXT NOT NULL,
  version    INTEGER NOT NULL DEFAULT 1,
  auteur_id  TEXT,
  automatique INTEGER NOT NULL DEFAULT 0,
  nb_roles   INTEGER NOT NULL DEFAULT 0,
  nb_salons  INTEGER NOT NULL DEFAULT 0,
  cree_le    INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_structures_guild ON structures (guild_id, cree_le DESC);

CREATE TABLE IF NOT EXISTS veille (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id      TEXT NOT NULL,
  type          TEXT NOT NULL,        -- instagram, youtube, rss
  source        TEXT NOT NULL,        -- compte, identifiant de chaine, adresse du flux
  nom           TEXT,                 -- nom affiche dans l'annonce
  salon_id      TEXT NOT NULL,
  role_id       TEXT,                 -- role mentionne (facultatif)
  message       TEXT,                 -- texte personnalise au-dessus de l'annonce
  dernier       TEXT,                 -- identifiant du dernier element annonce
  derniere_date INTEGER,              -- date du dernier element annonce
  erreurs       INTEGER NOT NULL DEFAULT 0,
  derniere_erreur TEXT,
  actif         INTEGER NOT NULL DEFAULT 1,
  cree_le       INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_veille_guild ON veille (guild_id, actif);

-- Petits reglages internes du bot (jeton Instagram et sa date de renouvellement).
CREATE TABLE IF NOT EXISTS reglages (
  cle    TEXT PRIMARY KEY,
  valeur TEXT,
  maj    INTEGER
);

-- Les votes top.gg. GLOBALE : un vote vaut pour LE BOT, pas pour un serveur.
-- Sans ca, quelqu'un present sur dix serveurs reclamerait dix recompenses
-- pour un seul vote.
CREATE TABLE IF NOT EXISTS votes (
  user_id        TEXT PRIMARY KEY,
  dernier_vote   INTEGER NOT NULL,   -- quand la recompense a ete reclamee
  dernier_guild  TEXT,               -- ou elle a ete reclamee
  total          INTEGER NOT NULL DEFAULT 0
);

-- La blocklist communautaire : les membres signales par les serveurs et
-- approuves par le staff du support. GLOBALE aussi — c'est tout son interet,
-- elle sert a tous les serveurs a la fois.
CREATE TABLE IF NOT EXISTS blocklist (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  cible_id      TEXT NOT NULL,       -- l'identifiant Discord du membre vise
  cible_pseudo  TEXT,
  raison        TEXT NOT NULL,
  preuve        TEXT,                -- un lien fourni par le proposant
  propose_par   TEXT NOT NULL,
  propose_guild TEXT,
  statut        TEXT NOT NULL DEFAULT 'attente',  -- attente | approuve | refuse | retire
  motif_refus   TEXT,
  traite_par    TEXT,
  traite_le     INTEGER,
  message_id    TEXT,                -- le message d'examen, pour le retrouver
  public_id     TEXT,                -- le message publie, pour le retirer
  date          INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_blocklist_cible ON blocklist (cible_id, statut);
CREATE INDEX IF NOT EXISTS idx_blocklist_statut ON blocklist (statut, date DESC);

-- Les concours. Un par ligne, avec ses participants a part : un concours a
-- mille participants ne doit pas devenir une ligne de mille identifiants.
CREATE TABLE IF NOT EXISTS giveaways (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id     TEXT NOT NULL,
  channel_id   TEXT NOT NULL,
  message_id   TEXT,
  lot          TEXT NOT NULL,
  gagnants     INTEGER NOT NULL DEFAULT 1,
  fin          INTEGER NOT NULL,
  organise_par TEXT NOT NULL,
  role_requis  TEXT,
  niveau_min   INTEGER NOT NULL DEFAULT 0,
  statut       TEXT NOT NULL DEFAULT 'encours',   -- encours | termine | annule
  tires        TEXT,                              -- les gagnants, separes par des virgules
  cree_le      INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_giveaways_due ON giveaways (statut, fin);
CREATE INDEX IF NOT EXISTS idx_giveaways_guild ON giveaways (guild_id, statut);

CREATE TABLE IF NOT EXISTS giveaway_participants (
  giveaway_id INTEGER NOT NULL,
  user_id     TEXT NOT NULL,
  date        INTEGER NOT NULL,
  PRIMARY KEY (giveaway_id, user_id)
);

-- Les anniversaires. On garde le JOUR et le MOIS ; l'annee est facultative et
-- vaut 0 quand elle n'est pas donnee. C'est volontaire : souhaiter un
-- anniversaire ne demande pas de connaitre l'age de quelqu'un.
CREATE TABLE IF NOT EXISTS xp_global (
  user_id        TEXT PRIMARY KEY,
  xp             INTEGER NOT NULL DEFAULT 0,
  messages       INTEGER NOT NULL DEFAULT 0,
  secondes_vocal INTEGER NOT NULL DEFAULT 0,
  serveurs       INTEGER NOT NULL DEFAULT 0,   -- combien de serveurs y ont contribue
  depuis         INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_xp_global ON xp_global (xp DESC);

CREATE TABLE IF NOT EXISTS premium (
  guild_id  TEXT PRIMARY KEY,
  source    TEXT NOT NULL DEFAULT 'offert',   -- 'discord' (abonnement) ou 'offert'
  jusqu_a   INTEGER,                          -- NULL = sans limite
  sku_id    TEXT,
  par       TEXT,                             -- qui l'a offert
  date      INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS anniversaires (
  guild_id TEXT NOT NULL,
  user_id  TEXT NOT NULL,
  jour     INTEGER NOT NULL,
  mois     INTEGER NOT NULL,
  annee    INTEGER NOT NULL DEFAULT 0,
  dernier  TEXT,                                  -- derniere annee souhaitee
  PRIMARY KEY (guild_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_anniv_date ON anniversaires (mois, jour);

-- Liste noire du bot. GLOBALE, comme reglages : elle ne porte pas de guild_id
-- et ne doit jamais partir avec un serveur — sinon un serveur bloque n'aurait
-- qu'a retirer le bot pour effacer son propre blocage et revenir.
CREATE TABLE IF NOT EXISTS liste_noire (
  id      TEXT PRIMARY KEY,          -- identifiant du serveur ou du membre
  genre   TEXT NOT NULL,             -- 'serveur' ou 'membre'
  raison  TEXT,
  par     TEXT,                      -- le fondateur qui a bloque
  date    INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS missions (
  guild_id TEXT NOT NULL,
  user_id  TEXT NOT NULL,
  periode  TEXT NOT NULL,           -- '2026-09-05' (jour) ou '2026-S36' (semaine)
  cle      TEXT NOT NULL,
  valeur   INTEGER NOT NULL DEFAULT 0,
  detail   TEXT,                    -- valeurs distinctes deja comptees (missions "salons")
  reclamee INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (guild_id, user_id, periode, cle)
);

CREATE TABLE IF NOT EXISTS missions_bonus (
  guild_id TEXT NOT NULL,
  user_id  TEXT NOT NULL,
  periode  TEXT NOT NULL,
  PRIMARY KEY (guild_id, user_id, periode)
);

CREATE TABLE IF NOT EXISTS appels (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id        TEXT NOT NULL,
  sanction_id     INTEGER NOT NULL,
  user_id         TEXT NOT NULL,
  texte           TEXT,
  statut          TEXT NOT NULL DEFAULT 'attente',  -- attente, accepte, refuse
  date            INTEGER NOT NULL,
  traite_par      TEXT,
  reponse         TEXT,
  date_traitement INTEGER
);
CREATE INDEX IF NOT EXISTS idx_appels_sanction ON appels (sanction_id);
CREATE INDEX IF NOT EXISTS idx_appels_guild ON appels (guild_id, statut);

CREATE TABLE IF NOT EXISTS rank_themes (
  guild_id TEXT NOT NULL,
  user_id  TEXT NOT NULL,
  cle      TEXT NOT NULL,
  PRIMARY KEY (guild_id, user_id, cle)
);

CREATE TABLE IF NOT EXISTS rank_choix (
  guild_id TEXT NOT NULL,
  user_id  TEXT NOT NULL,
  cle      TEXT NOT NULL,
  PRIMARY KEY (guild_id, user_id)
);

CREATE TABLE IF NOT EXISTS signalements (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id     TEXT NOT NULL,
  message_id   TEXT NOT NULL,
  channel_id   TEXT NOT NULL,
  auteur_id    TEXT NOT NULL,
  signaleur_id TEXT NOT NULL,
  contenu      TEXT,
  raison       TEXT,
  statut       TEXT NOT NULL DEFAULT 'attente',  -- attente, traite, ignore
  traite_par   TEXT,
  action       TEXT,
  date         INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_signalements_message ON signalements (message_id);
CREATE INDEX IF NOT EXISTS idx_signalements_guild ON signalements (guild_id, statut);

CREATE TABLE IF NOT EXISTS faq (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id    TEXT NOT NULL,
  question    TEXT NOT NULL,
  reponse     TEXT NOT NULL,
  mots_cles   TEXT NOT NULL DEFAULT '',
  utilisations INTEGER NOT NULL DEFAULT 0,
  auteur_id   TEXT,
  date        INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_faq_guild ON faq (guild_id);

CREATE TABLE IF NOT EXISTS paliers_salons (
  guild_id   TEXT NOT NULL,
  niveau     INTEGER NOT NULL,
  channel_id TEXT NOT NULL,
  PRIMARY KEY (guild_id, niveau, channel_id)
);

CREATE TABLE IF NOT EXISTS vocaux_hubs (
  guild_id       TEXT NOT NULL,
  channel_id     TEXT NOT NULL,   -- le salon "creer un vocal"
  categorie_id   TEXT,            -- ou creer les salons temporaires
  modele         TEXT NOT NULL DEFAULT '🔊 Salon de {pseudo}',
  limite_defaut  INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (guild_id, channel_id)
);

CREATE TABLE IF NOT EXISTS vocaux_temporaires (
  channel_id      TEXT PRIMARY KEY,
  guild_id        TEXT NOT NULL,
  hub_id          TEXT,
  proprietaire_id TEXT NOT NULL,
  cree_le         INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_vocaux_guild ON vocaux_temporaires (guild_id);

CREATE TABLE IF NOT EXISTS stats_salons (
  guild_id   TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  modele     TEXT NOT NULL,
  PRIMARY KEY (guild_id, channel_id)
);

CREATE TABLE IF NOT EXISTS invitations (
  guild_id TEXT NOT NULL,
  user_id  TEXT NOT NULL,
  bonus    INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (guild_id, user_id)
);

CREATE TABLE IF NOT EXISTS invitations_arrivees (
  guild_id    TEXT NOT NULL,
  user_id     TEXT NOT NULL,   -- le membre qui arrive
  inviteur_id TEXT,            -- null si l'invitation n'a pas pu etre identifiee
  code        TEXT,
  faux        INTEGER NOT NULL DEFAULT 0,  -- compte trop recent
  parti       INTEGER NOT NULL DEFAULT 0,  -- a quitte le serveur depuis
  date        INTEGER NOT NULL,
  PRIMARY KEY (guild_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_arrivees_inviteur ON invitations_arrivees (guild_id, inviteur_id);

CREATE TABLE IF NOT EXISTS invitations_recompenses (
  guild_id TEXT NOT NULL,
  palier   INTEGER NOT NULL,
  role_id  TEXT NOT NULL,
  PRIMARY KEY (guild_id, palier)
);

CREATE TABLE IF NOT EXISTS economie (
  guild_id        TEXT NOT NULL,
  user_id         TEXT NOT NULL,
  solde           INTEGER NOT NULL DEFAULT 0,
  total_gagne     INTEGER NOT NULL DEFAULT 0,
  dernier_daily   INTEGER NOT NULL DEFAULT 0,
  serie_daily     INTEGER NOT NULL DEFAULT 0,
  dernier_travail INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (guild_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_economie_classement ON economie (guild_id, solde DESC);

CREATE TABLE IF NOT EXISTS boutique (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id    TEXT NOT NULL,
  nom         TEXT NOT NULL,
  description TEXT,
  prix        INTEGER NOT NULL,
  role_id     TEXT,
  stock       INTEGER NOT NULL DEFAULT -1,  -- -1 = illimite
  actif       INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS achats (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id   TEXT NOT NULL,
  user_id    TEXT NOT NULL,
  article_id INTEGER NOT NULL,
  nom        TEXT,
  prix       INTEGER NOT NULL,
  date       INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS candidatures_types (
  guild_id    TEXT NOT NULL,
  cle         TEXT NOT NULL,
  label       TEXT NOT NULL,
  emoji       TEXT,
  description TEXT,
  role_id     TEXT,                          -- role donne si la candidature est acceptee
  questions   TEXT NOT NULL DEFAULT '[]',    -- JSON : [{ label, placeholder, long }]
  niveau_min  INTEGER NOT NULL DEFAULT 0,
  ouvert      INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (guild_id, cle)
);

CREATE TABLE IF NOT EXISTS candidatures (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id   TEXT NOT NULL,
  numero     INTEGER NOT NULL,
  user_id    TEXT NOT NULL,
  type_cle   TEXT,
  type_label TEXT,
  reponses   TEXT NOT NULL DEFAULT '[]',
  statut     TEXT NOT NULL DEFAULT 'attente', -- attente, acceptee, refusee
  staff_id   TEXT,
  reponse    TEXT,
  channel_id TEXT,
  message_id TEXT,
  date       INTEGER NOT NULL,
  repondu_le INTEGER
);
CREATE INDEX IF NOT EXISTS idx_candidatures_guild ON candidatures (guild_id, numero);
CREATE INDEX IF NOT EXISTS idx_candidatures_membre ON candidatures (guild_id, user_id, statut);

CREATE TABLE IF NOT EXISTS tickets_types (
  guild_id    TEXT NOT NULL,
  cle         TEXT NOT NULL,
  label       TEXT NOT NULL,
  emoji       TEXT,
  description TEXT,
  PRIMARY KEY (guild_id, cle)
);

-- Le journal d'audit du panneau /config : qui a change quel reglage, quand,
-- et depuis quelle valeur vers quelle valeur. La colonne source distingue une
-- ecriture normale du panneau d'une ecriture venue d'un import
-- (/config-import) — les deux passent par le meme point d'entree (voir
-- enregistrer() dans panneauConfig.js) mais on veut pouvoir le dire dans
-- l'historique.
CREATE TABLE IF NOT EXISTS config_audit (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  cle      TEXT NOT NULL,
  avant    TEXT,
  apres    TEXT,
  par      TEXT NOT NULL,
  source   TEXT NOT NULL DEFAULT 'panneau',   -- 'panneau' ou 'import'
  date     INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_config_audit_guild ON config_audit (guild_id, date DESC);
`);

// ------------------------------------------------------------------ MIGRATIONS
/**
 * Ajoute les colonnes manquantes a une table existante.
 * Permet de faire evoluer le bot sans perdre la base deja en place.
 */
function assurerColonnes(table, colonnes) {
  const existantes = db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
  const ajoutees = [];
  for (const [nom, definition] of Object.entries(colonnes)) {
    if (existantes.includes(nom)) continue;
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${nom} ${definition}`);
    ajoutees.push(nom);
  }
  return ajoutees;
}

// Wumi 2.13 : chances bonus des concours (role bonus, boosters), et le
// nombre de tickets de chaque participant.
assurerColonnes('giveaways', {
  bonus_role: 'TEXT',
  bonus: 'INTEGER NOT NULL DEFAULT 2',
  bonus_boosters: 'INTEGER NOT NULL DEFAULT 0',
});
assurerColonnes('giveaway_participants', {
  poids: 'INTEGER NOT NULL DEFAULT 1',
});

assurerColonnes('tickets', {
  sujet: 'TEXT',
  description: 'TEXT',
  // Wumi 2.0 : priorite, prise en charge datee, note de satisfaction,
  // relance d'inactivite.
  priorite: "TEXT NOT NULL DEFAULT 'normale'",
  pris_le: 'INTEGER',
  note: 'INTEGER',
  relance_le: 'INTEGER',
  // Wumi 2.13 : premiere reponse du staff (temps de reponse) et alerte
  // « ticket sans reponse » deja envoyee.
  premiere_reponse: 'INTEGER',
  alerte_le: 'INTEGER',
  messages: 'INTEGER',
});

// Wumi 2.11.4 : l'XP est plafonnee a 1 milliard. Au-dela de 2^53, node:sqlite
// refuse de lire la ligne (RangeError) et casse /classement et chaque message
// du membre. On repare les lignes deja trop grosses (comparaison faite en SQL,
// sans jamais lire la valeur cote JS).
for (const table of ['xp', 'xp_global']) {
  try {
    db.exec(`UPDATE ${table} SET xp = 1000000000 WHERE xp > 1000000000`);
    db.exec(`UPDATE ${table} SET messages = 1000000000 WHERE messages > 1000000000`);
    db.exec(`UPDATE ${table} SET secondes_vocal = 1000000000 WHERE secondes_vocal > 1000000000`);
  } catch { /* table absente sur une base neuve */ }
}

// Wumi 2.12 : la langue du panneau utilise, pour repondre au candidat dans sa langue.
assurerColonnes('candidatures', { langue: 'TEXT' });

// Colonnes ajoutees aux tables existantes (aucune donnee n'est perdue).
assurerColonnes('economie', {
  banque: 'INTEGER NOT NULL DEFAULT 0',
  dernier_interet: 'INTEGER NOT NULL DEFAULT 0',
  dernier_braquage: 'INTEGER NOT NULL DEFAULT 0',
});

assurerColonnes('xp', {
  prestige: 'INTEGER NOT NULL DEFAULT 0',
});

const colonnesConfig = assurerColonnes('config', {
  // La langue du bot sur ce serveur.
  // Par defaut l'anglais : Blueprint est public, et la majorite des serveurs
  // qui l'ajouteront ne parlent pas francais. Un admin bascule en une commande.
  langue: "TEXT NOT NULL DEFAULT 'en'",

  // Economie etendue
  banque_actif: 'INTEGER NOT NULL DEFAULT 1',
  paye_actif: 'INTEGER NOT NULL DEFAULT 1',
  braquage_actif: 'INTEGER NOT NULL DEFAULT 0',
  objets_actif: 'INTEGER NOT NULL DEFAULT 1',

  // Progression
  prestige_actif: 'INTEGER NOT NULL DEFAULT 1',
  badges_actif: 'INTEGER NOT NULL DEFAULT 1',
  fond_perso_actif: 'INTEGER NOT NULL DEFAULT 0',
  carte_animee_actif: 'INTEGER NOT NULL DEFAULT 1',
  double_xp_jusqu_a: 'INTEGER NOT NULL DEFAULT 0',

  // Votes top.gg : ce que gagne un membre qui vote pour le bot.
  vote_actif: 'INTEGER NOT NULL DEFAULT 1',
  vote_recompense: "TEXT NOT NULL DEFAULT 'xp'",   // 'xp' ou 'rien'
  vote_multi: 'REAL NOT NULL DEFAULT 2',           // XP multiplie par...
  vote_heures: 'INTEGER NOT NULL DEFAULT 12',      // ...pendant combien de temps
  vote_salon: 'TEXT',                              // ou annoncer le merci

  // Anniversaires : ou souhaiter, et quel role donner pour la journee.
  anniv_salon: 'TEXT',
  anniv_role: 'TEXT',
  anniv_message: 'TEXT',

  // Blocklist communautaire.
  // bl_alerte : prevenir le staff quand un membre de la liste arrive ici.
  // Les deux salons ne servent que sur le serveur support.
  bl_alerte: 'INTEGER NOT NULL DEFAULT 0',
  bl_salon_examen: 'TEXT',
  bl_salon_public: 'TEXT',

  // Photographies de la structure du serveur.
  // Desactive par defaut depuis le passage en bot public : une photo
  // quotidienne de tous les salons et roles, c'est utile sur son propre
  // serveur, mais sur des centaines de serveurs qui ne l'ont pas demande,
  // c'est une base qui gonfle pour rien. `/serveur structure auto:true`
  // l'active pour ceux qui en veulent.
  structure_auto: 'INTEGER NOT NULL DEFAULT 0',
  // Wumi 2.12 : anti-nuke (suppressions/bannissements en masse par un admin ou un bot)
  antinuke_actif: 'INTEGER NOT NULL DEFAULT 0',
  antinuke_seuil: 'INTEGER NOT NULL DEFAULT 4',
  antinuke_fenetre: 'INTEGER NOT NULL DEFAULT 15',
  antinuke_sanction: "TEXT NOT NULL DEFAULT 'roles'",
  antinuke_confiance: "TEXT NOT NULL DEFAULT '[]'",
  antinuke_salon: 'TEXT',
  // Wumi 2.12 : rapport d'activite hebdomadaire
  stats_rapport_salon: 'TEXT',
  stats_rapport_dernier: 'TEXT',
  structure_max: 'INTEGER NOT NULL DEFAULT 10',

  // Accueil du tout premier message d'un membre
  premier_actif: 'INTEGER NOT NULL DEFAULT 0',
  premier_reaction: "TEXT NOT NULL DEFAULT '👋'",
  premier_message: 'TEXT',

  // Salon ou le bot signale ses propres erreurs
  alerte_salon: 'TEXT',

  // Le journal du bot : arrivees et departs de serveurs.
  // Ces deux colonnes ne servent QUE sur le serveur support — ailleurs, elles
  // restent vides et ne sont jamais lues.
  bot_salon: 'TEXT',

  // Missions
  missions_actif: 'INTEGER NOT NULL DEFAULT 1',
  missions_salon: 'TEXT',

  // Appels de sanction
  appel_actif: 'INTEGER NOT NULL DEFAULT 0',
  appel_salon: 'TEXT',
  appel_delai_jours: 'INTEGER NOT NULL DEFAULT 14',

  // Signalements
  signalement_salon: 'TEXT',
  signalement_delai: 'INTEGER NOT NULL DEFAULT 60',

  // Boost
  boost_salon: 'TEXT',
  boost_message: 'TEXT',
  boost_role: 'TEXT',
  boost_monnaie: 'INTEGER NOT NULL DEFAULT 0',

  // FAQ
  faq_actif: 'INTEGER NOT NULL DEFAULT 0',
  faq_seuil: 'INTEGER NOT NULL DEFAULT 55',

  // Verification a l'entree
  verif_actif: 'INTEGER NOT NULL DEFAULT 0',
  verif_role: 'TEXT',
  verif_captcha: 'INTEGER NOT NULL DEFAULT 0',
  verif_titre: 'TEXT',
  verif_message: 'TEXT',
  verif_bouton: 'TEXT',

  // Invitations
  invitations_actif: 'INTEGER NOT NULL DEFAULT 0',
  invitations_salon: 'TEXT',
  invitations_age_min: 'INTEGER NOT NULL DEFAULT 7',

  // Economie
  eco_actif: 'INTEGER NOT NULL DEFAULT 0',
  eco_nom: 'TEXT',
  eco_emoji: 'TEXT',
  eco_gain_message: 'INTEGER NOT NULL DEFAULT 2',
  eco_daily: 'INTEGER NOT NULL DEFAULT 100',
  eco_travail_min: 'INTEGER NOT NULL DEFAULT 20',
  eco_travail_max: 'INTEGER NOT NULL DEFAULT 80',
  eco_travail_delai: 'INTEGER NOT NULL DEFAULT 60',

  // Candidatures
  cand_salon: 'TEXT',
  cand_role_staff: 'TEXT',
  cand_compteur: 'INTEGER NOT NULL DEFAULT 0',

  suggestion_salon: 'TEXT',
  suggestion_role_staff: 'TEXT',
  suggestion_compteur: 'INTEGER NOT NULL DEFAULT 0',
  suggestion_fil: 'INTEGER NOT NULL DEFAULT 1',
  suggestion_niveau_min: 'INTEGER NOT NULL DEFAULT 0',
  suggestion_cooldown: 'INTEGER NOT NULL DEFAULT 0',
  ticket_formulaire: 'INTEGER NOT NULL DEFAULT 1',
  ticket_categorie: 'TEXT',
  ticket_role_staff: 'TEXT',
  ticket_logs: 'TEXT',
  ticket_compteur: 'INTEGER NOT NULL DEFAULT 0',
  // Wumi 2.0
  ticket_banniere: 'INTEGER NOT NULL DEFAULT 1',       // banniere sur le panneau et les tickets
  ticket_inactif_heures: 'INTEGER NOT NULL DEFAULT 0', // 0 = jamais de fermeture automatique
  ticket_alerte_minutes: 'INTEGER NOT NULL DEFAULT 0', // 0 = pas d'alerte « sans reponse »
  bienvenue_carte_fixe: 'INTEGER',                    // design impose (sinon tirage au hasard)
  astro_salon: 'TEXT',                                // Astro Run : salon des records
  astro_recompenses: 'INTEGER NOT NULL DEFAULT 1',    // Astro Run : XP et monnaie a la premiere victoire
  paliers_avert: 'TEXT',                               // JSON des paliers d'avertissements (null = defaut)
  raid_kick_arrivees: 'INTEGER NOT NULL DEFAULT 1',    // en mode raid : expulser les nouveaux venus
  ticket_max: 'INTEGER NOT NULL DEFAULT 1',
  ticket_titre: 'TEXT',
  ticket_message: 'TEXT',
  ticket_bouton: 'TEXT',

  // Anti-phishing : compare les liens postes a la liste publique de domaines
  // signales (voir src/utils/antiPhishing.js). ETEINT par defaut — on
  // n'allume jamais une protection chez quelqu'un sans qu'il l'ait demandee.
  antiphishing_actif: 'INTEGER NOT NULL DEFAULT 0',
  antiphishing_action: "TEXT NOT NULL DEFAULT 'supprimer'", // supprimer | avertir | exclure | bannir
  antiphishing_liste_blanche: 'TEXT',                       // domaines separes par des virgules

  // Le statut public du bot, affiche dans un salon du serveur support.
  // `statut_message` garde l'identifiant du message a MODIFIER : sans lui, le
  // bot reposterait son etat toutes les cinq minutes et noierait le salon.
  statut_salon: 'TEXT',
  statut_message: 'TEXT',

  // Wumi 2.3 : le salon compteur (voir src/utils/compteur.js).
  compteur_salon: 'TEXT',

  // Wumi 2.4 : le starboard (voir src/utils/starboard.js).
  starboard_salon: 'TEXT',
  starboard_seuil: 'INTEGER NOT NULL DEFAULT 3',
  starboard_emoji: "TEXT NOT NULL DEFAULT '⭐'",

  // Wumi 2.6 : l'audit de securite hebdomadaire (voir src/utils/audit.js).
  audit_salon: 'TEXT',
  audit_score: 'INTEGER',
  audit_date: 'INTEGER',

  // Wumi 2.7 : la musique (voir src/musique/lecteur.js).
  musique_volume: 'INTEGER NOT NULL DEFAULT 80',
  musique_dj: 'TEXT',
  musique_247: 'INTEGER NOT NULL DEFAULT 0',

  // Wumi 2.9 : la radio permanente (voir src/musique/radioPermanente.js).
  radio_salon: 'TEXT',
  radio_station: 'TEXT',
});

// LES SERVEURS DEJA LA RESTENT EN FRANCAIS.
// La colonne arrive avec 'en' pour defaut, ce qui vaut aussi pour les lignes
// existantes : sans cette ligne, un serveur configure en francais depuis des
// mois se reveillerait en anglais apres une simple mise a jour. Le rattrapage
// ne tourne qu'une fois, au moment exact ou la colonne est creee.
if (colonnesConfig.includes('langue')) {
  const r = db.prepare("UPDATE config SET langue = 'fr'").run();
  if (r.changes) {
    // Le journal n'est pas encore charge a ce stade du demarrage : on ecrit
    // simplement, plutot que d'ajouter une dependance circulaire.
    console.log(`Langue : ${r.changes} serveur(s) deja configure(s) restent en francais.`);
  }
}

// ------------------------------------------------------------------ MENAGE
// Une premiere version calculait l'heure avec Number("14 h"), ce qui donnait
// NaN, donc NULL en base : la cle primaire ne jouait plus et chaque message
// creait une ligne. On efface ces lignes fantomes une fois pour toutes.
try {
  db.exec('DELETE FROM membre_heures WHERE heure IS NULL OR heure < 0 OR heure > 23');
} catch {
  /* table absente sur une base plus ancienne : rien a nettoyer */
}

// ------------------------------------------------------------------ REQUETES
const req = {
  getConfig: db.prepare('SELECT * FROM config WHERE guild_id = ?'),
  insertConfig: db.prepare('INSERT OR IGNORE INTO config (guild_id) VALUES (?)'),

  getXp: db.prepare('SELECT * FROM xp WHERE guild_id = ? AND user_id = ?'),
  upsertXp: db.prepare(`
    INSERT INTO xp (guild_id, user_id, xp, messages, secondes_vocal, dernier_gain)
    VALUES (@guild_id, @user_id, @xp, @messages, @secondes_vocal, @dernier_gain)
    ON CONFLICT(guild_id, user_id) DO UPDATE SET
      xp = MIN(xp.xp + @xp, 1000000000),
      messages = xp.messages + @messages,
      secondes_vocal = xp.secondes_vocal + @secondes_vocal,
      dernier_gain = CASE WHEN @dernier_gain > 0 THEN @dernier_gain ELSE xp.dernier_gain END
  `),
  setXp: db.prepare(`
    INSERT INTO xp (guild_id, user_id, xp) VALUES (?, ?, ?)
    ON CONFLICT(guild_id, user_id) DO UPDATE SET xp = MIN(excluded.xp, 1000000000)
  `),
  supprimerXp: db.prepare('DELETE FROM xp WHERE guild_id = ? AND user_id = ?'),
  resetXpGuild: db.prepare('DELETE FROM xp WHERE guild_id = ?'),
  rangDe: db.prepare('SELECT COUNT(*) AS n FROM xp WHERE guild_id = ? AND xp > ?'),
  totalMembresXp: db.prepare('SELECT COUNT(*) AS n FROM xp WHERE guild_id = ? AND xp > 0'),
  classement: db.prepare(
    'SELECT user_id, xp, messages, secondes_vocal, prestige FROM xp WHERE guild_id = ? AND xp > 0 ORDER BY xp DESC LIMIT ? OFFSET ?'
  ),

  ajouterRecompense: db.prepare('INSERT OR REPLACE INTO recompenses (guild_id, niveau, role_id) VALUES (?, ?, ?)'),
  retirerRecompense: db.prepare('DELETE FROM recompenses WHERE guild_id = ? AND niveau = ?'),
  recompenses: db.prepare('SELECT niveau, role_id FROM recompenses WHERE guild_id = ? ORDER BY niveau ASC'),
  recompensesJusqua: db.prepare('SELECT niveau, role_id FROM recompenses WHERE guild_id = ? AND niveau <= ? ORDER BY niveau ASC'),

  ajouterSanction: db.prepare(`
    INSERT INTO sanctions (guild_id, user_id, moderateur_id, type, raison, duree, date)
    VALUES (@guild_id, @user_id, @moderateur_id, @type, @raison, @duree, @date)
  `),
  sanctionsDe: db.prepare('SELECT * FROM sanctions WHERE guild_id = ? AND user_id = ? ORDER BY date DESC'),
  avertissementsActifs: db.prepare("SELECT * FROM sanctions WHERE guild_id = ? AND user_id = ? AND type = 'warn' AND actif = 1 ORDER BY date DESC"),
  sanctionParId: db.prepare('SELECT * FROM sanctions WHERE id = ? AND guild_id = ?'),
  desactiverSanction: db.prepare('UPDATE sanctions SET actif = 0 WHERE id = ? AND guild_id = ?'),
  supprimerSanction: db.prepare('DELETE FROM sanctions WHERE id = ? AND guild_id = ?'),
  viderAvertissements: db.prepare("UPDATE sanctions SET actif = 0 WHERE guild_id = ? AND user_id = ? AND type = 'warn'"),

  ajouterMot: db.prepare('INSERT OR IGNORE INTO mots_interdits (guild_id, mot) VALUES (?, ?)'),
  retirerMot: db.prepare('DELETE FROM mots_interdits WHERE guild_id = ? AND mot = ?'),
  mots: db.prepare('SELECT mot FROM mots_interdits WHERE guild_id = ?'),

  ajouterExclusion: db.prepare('INSERT OR IGNORE INTO exclusions (guild_id, type, cible_id) VALUES (?, ?, ?)'),
  retirerExclusion: db.prepare('DELETE FROM exclusions WHERE guild_id = ? AND type = ? AND cible_id = ?'),
  exclusions: db.prepare('SELECT cible_id FROM exclusions WHERE guild_id = ? AND type = ?'),

  // ------------------------------------------------------------- TICKETS
  creerTicket: db.prepare(`
    INSERT INTO tickets (guild_id, numero, channel_id, user_id, type, sujet, description, cree_le)
    VALUES (@guild_id, @numero, @channel_id, @user_id, @type, @sujet, @description, @cree_le)
  `),
  ticketParSalon: db.prepare('SELECT * FROM tickets WHERE channel_id = ?'),
  ticketsOuvertsDe: db.prepare("SELECT * FROM tickets WHERE guild_id = ? AND user_id = ? AND statut = 'ouvert'"),
  ticketsOuverts: db.prepare("SELECT * FROM tickets WHERE guild_id = ? AND statut = 'ouvert' ORDER BY cree_le ASC"),
  prendreTicket: db.prepare('UPDATE tickets SET pris_par = ? WHERE channel_id = ?'),
  fermerTicket: db.prepare(`
    UPDATE tickets SET statut = 'ferme', ferme_le = @ferme_le, ferme_par = @ferme_par, raison_fermeture = @raison
    WHERE channel_id = @channel_id
  `),
  incrementerCompteurTicket: db.prepare('UPDATE config SET ticket_compteur = ticket_compteur + 1 WHERE guild_id = ?'),
  statsTickets: db.prepare(`
    SELECT COUNT(*) AS total,
           SUM(CASE WHEN statut = 'ouvert' THEN 1 ELSE 0 END) AS ouverts
    FROM tickets WHERE guild_id = ?
  `),

  // ------------------------------------------------------------ ACTIVITE
  noterActivite: db.prepare(`
    INSERT INTO activite (guild_id, jour, messages, arrivees, departs, vocal)
    VALUES (@guild_id, @jour, @messages, @arrivees, @departs, @vocal)
    ON CONFLICT(guild_id, jour) DO UPDATE SET
      messages = activite.messages + @messages,
      arrivees = activite.arrivees + @arrivees,
      departs  = activite.departs  + @departs,
      vocal    = activite.vocal    + @vocal
  `),
  noterActiviteSalon: db.prepare(`
    INSERT INTO activite_salons (guild_id, jour, channel_id, messages) VALUES (?, ?, ?, 1)
    ON CONFLICT(guild_id, jour, channel_id) DO UPDATE SET messages = activite_salons.messages + 1
  `),
  activiteRecente: db.prepare('SELECT * FROM activite WHERE guild_id = ? AND jour >= ? ORDER BY jour ASC'),
  topSalons: db.prepare(`
    SELECT channel_id, SUM(messages) AS total FROM activite_salons
    WHERE guild_id = ? AND jour >= ? GROUP BY channel_id ORDER BY total DESC LIMIT ?
  `),
  purgerActivite: db.prepare('DELETE FROM activite WHERE jour < ?'),
  purgerActiviteSalons: db.prepare('DELETE FROM activite_salons WHERE jour < ?'),
  noterActiviteHeure: db.prepare(`
    INSERT INTO activite_heures (guild_id, jour, heure, messages) VALUES (?, ?, ?, 1)
    ON CONFLICT(guild_id, jour, heure) DO UPDATE SET messages = activite_heures.messages + 1
  `),
  activiteHeures: db.prepare(`
    SELECT heure, SUM(messages) AS total FROM activite_heures
    WHERE guild_id = ? AND jour >= ? AND jour <= ? GROUP BY heure
  `),
  purgerActiviteHeures: db.prepare('DELETE FROM activite_heures WHERE jour < ?'),
  serveursRapportStats: db.prepare("SELECT guild_id, stats_rapport_salon, stats_rapport_dernier FROM config WHERE stats_rapport_salon IS NOT NULL AND stats_rapport_salon != ''"),

  // ------------------------------------------------------ THEMES DE RANK
  posseder: db.prepare('INSERT OR IGNORE INTO rank_themes (guild_id, user_id, cle) VALUES (?, ?, ?)'),
  possessions: db.prepare('SELECT cle FROM rank_themes WHERE guild_id = ? AND user_id = ?'),
  possede: db.prepare('SELECT 1 AS ok FROM rank_themes WHERE guild_id = ? AND user_id = ? AND cle = ?'),
  choisirTheme: db.prepare(`
    INSERT INTO rank_choix (guild_id, user_id, cle) VALUES (?, ?, ?)
    ON CONFLICT(guild_id, user_id) DO UPDATE SET cle = excluded.cle
  `),
  themeChoisi: db.prepare('SELECT cle FROM rank_choix WHERE guild_id = ? AND user_id = ?'),

  // ------------------------------------------------------- SIGNALEMENTS
  creerSignalement: db.prepare(`
    INSERT INTO signalements (guild_id, message_id, channel_id, auteur_id, signaleur_id, contenu, raison, date)
    VALUES (@guild_id, @message_id, @channel_id, @auteur_id, @signaleur_id, @contenu, @raison, @date)
  `),
  signalementParId: db.prepare('SELECT * FROM signalements WHERE id = ?'),
  signalementEnAttente: db.prepare("SELECT * FROM signalements WHERE message_id = ? AND statut = 'attente'"),
  dernierSignalementDe: db.prepare('SELECT MAX(date) AS derniere FROM signalements WHERE guild_id = ? AND signaleur_id = ?'),
  traiterSignalement: db.prepare(`
    UPDATE signalements SET statut = @statut, traite_par = @traite_par, action = @action WHERE id = @id
  `),
  compterSignalements: db.prepare('SELECT COUNT(*) AS n FROM signalements WHERE guild_id = ? AND statut = ?'),

  // ----------------------------------------------------------------- FAQ
  ajouterFaq: db.prepare(`
    INSERT INTO faq (guild_id, question, reponse, mots_cles, auteur_id, date)
    VALUES (@guild_id, @question, @reponse, @mots_cles, @auteur_id, @date)
  `),
  majFaq: db.prepare('UPDATE faq SET question = @question, reponse = @reponse, mots_cles = @mots_cles WHERE id = @id'),
  retirerFaq: db.prepare('DELETE FROM faq WHERE id = ? AND guild_id = ?'),
  faq: db.prepare('SELECT * FROM faq WHERE id = ? AND guild_id = ?'),
  toutesFaq: db.prepare('SELECT * FROM faq WHERE guild_id = ? ORDER BY utilisations DESC, id ASC'),
  incrementerFaq: db.prepare('UPDATE faq SET utilisations = utilisations + 1 WHERE id = ?'),

  // -------------------------------------------------------- PALIERS XP
  ajouterPalierSalon: db.prepare('INSERT OR IGNORE INTO paliers_salons (guild_id, niveau, channel_id) VALUES (?, ?, ?)'),
  retirerPalierSalons: db.prepare('DELETE FROM paliers_salons WHERE guild_id = ? AND niveau = ?'),
  palierSalons: db.prepare('SELECT channel_id FROM paliers_salons WHERE guild_id = ? AND niveau = ?'),
  tousPaliersSalons: db.prepare('SELECT * FROM paliers_salons WHERE guild_id = ?'),
  tousMembresXp: db.prepare('SELECT user_id, xp FROM xp WHERE guild_id = ? AND xp > 0'),

  // ------------------------------------------------ VOCAUX TEMPORAIRES
  ajouterHub: db.prepare(`
    INSERT OR REPLACE INTO vocaux_hubs (guild_id, channel_id, categorie_id, modele, limite_defaut)
    VALUES (@guild_id, @channel_id, @categorie_id, @modele, @limite_defaut)
  `),
  retirerHub: db.prepare('DELETE FROM vocaux_hubs WHERE guild_id = ? AND channel_id = ?'),
  hubs: db.prepare('SELECT * FROM vocaux_hubs WHERE guild_id = ?'),
  hub: db.prepare('SELECT * FROM vocaux_hubs WHERE channel_id = ?'),

  creerVocalTemp: db.prepare(`
    INSERT INTO vocaux_temporaires (channel_id, guild_id, hub_id, proprietaire_id, cree_le)
    VALUES (@channel_id, @guild_id, @hub_id, @proprietaire_id, @cree_le)
  `),
  vocalTemp: db.prepare('SELECT * FROM vocaux_temporaires WHERE channel_id = ?'),
  vocauxTempGuild: db.prepare('SELECT * FROM vocaux_temporaires WHERE guild_id = ?'),
  tousVocauxTemp: db.prepare('SELECT * FROM vocaux_temporaires'),
  vocalTempDe: db.prepare('SELECT * FROM vocaux_temporaires WHERE guild_id = ? AND proprietaire_id = ?'),
  changerProprietaire: db.prepare('UPDATE vocaux_temporaires SET proprietaire_id = ? WHERE channel_id = ?'),
  supprimerVocalTemp: db.prepare('DELETE FROM vocaux_temporaires WHERE channel_id = ?'),

  // -------------------------------------------------- SALONS STATISTIQUES
  ajouterStatSalon: db.prepare('INSERT OR REPLACE INTO stats_salons (guild_id, channel_id, modele) VALUES (?, ?, ?)'),
  retirerStatSalon: db.prepare('DELETE FROM stats_salons WHERE guild_id = ? AND channel_id = ?'),
  statsSalons: db.prepare('SELECT * FROM stats_salons WHERE guild_id = ?'),
  tousStatsSalons: db.prepare('SELECT * FROM stats_salons'),

  // --------------------------------------------------------- INVITATIONS
  enregistrerArrivee: db.prepare(`
    INSERT INTO invitations_arrivees (guild_id, user_id, inviteur_id, code, faux, date)
    VALUES (@guild_id, @user_id, @inviteur_id, @code, @faux, @date)
    ON CONFLICT(guild_id, user_id) DO UPDATE SET
      inviteur_id = excluded.inviteur_id, code = excluded.code,
      faux = excluded.faux, parti = 0, date = excluded.date
  `),
  marquerParti: db.prepare('UPDATE invitations_arrivees SET parti = 1 WHERE guild_id = ? AND user_id = ?'),
  arriveeDe: db.prepare('SELECT * FROM invitations_arrivees WHERE guild_id = ? AND user_id = ?'),
  statsInvitations: db.prepare(`
    SELECT
      COALESCE(SUM(CASE WHEN parti = 0 AND faux = 0 THEN 1 ELSE 0 END), 0) AS valides,
      COALESCE(SUM(CASE WHEN parti = 1 THEN 1 ELSE 0 END), 0) AS partis,
      COALESCE(SUM(CASE WHEN faux = 1 AND parti = 0 THEN 1 ELSE 0 END), 0) AS faux
    FROM invitations_arrivees WHERE guild_id = ? AND inviteur_id = ?
  `),
  invitesDe: db.prepare(
    'SELECT user_id, faux, parti, date FROM invitations_arrivees WHERE guild_id = ? AND inviteur_id = ? ORDER BY date DESC LIMIT ?'
  ),
  classementInvitations: db.prepare(`
    SELECT inviteur_id,
      SUM(CASE WHEN parti = 0 AND faux = 0 THEN 1 ELSE 0 END) AS valides,
      SUM(CASE WHEN parti = 1 THEN 1 ELSE 0 END) AS partis,
      SUM(CASE WHEN faux = 1 AND parti = 0 THEN 1 ELSE 0 END) AS faux
    FROM invitations_arrivees
    WHERE guild_id = ? AND inviteur_id IS NOT NULL
    GROUP BY inviteur_id
    HAVING valides > 0
    ORDER BY valides DESC
    LIMIT ? OFFSET ?
  `),
  totalInviteurs: db.prepare(`
    SELECT COUNT(*) AS n FROM (
      SELECT inviteur_id FROM invitations_arrivees
      WHERE guild_id = ? AND inviteur_id IS NOT NULL AND parti = 0 AND faux = 0
      GROUP BY inviteur_id
    )
  `),
  bonusInvitations: db.prepare('SELECT bonus FROM invitations WHERE guild_id = ? AND user_id = ?'),
  definirBonus: db.prepare(`
    INSERT INTO invitations (guild_id, user_id, bonus) VALUES (?, ?, ?)
    ON CONFLICT(guild_id, user_id) DO UPDATE SET bonus = excluded.bonus
  `),
  ajouterRecompenseInvit: db.prepare('INSERT OR REPLACE INTO invitations_recompenses (guild_id, palier, role_id) VALUES (?, ?, ?)'),
  retirerRecompenseInvit: db.prepare('DELETE FROM invitations_recompenses WHERE guild_id = ? AND palier = ?'),
  recompensesInvit: db.prepare('SELECT palier, role_id FROM invitations_recompenses WHERE guild_id = ? ORDER BY palier ASC'),
  recompensesInvitJusqua: db.prepare(
    'SELECT palier, role_id FROM invitations_recompenses WHERE guild_id = ? AND palier <= ? ORDER BY palier ASC'
  ),

  // ------------------------------------------------------------ ECONOMIE
  getEco: db.prepare('SELECT * FROM economie WHERE guild_id = ? AND user_id = ?'),
  crediter: db.prepare(`
    INSERT INTO economie (guild_id, user_id, solde, total_gagne) VALUES (@guild_id, @user_id, @montant, @gagne)
    ON CONFLICT(guild_id, user_id) DO UPDATE SET
      solde = economie.solde + @montant,
      total_gagne = economie.total_gagne + @gagne
  `),
  definirSolde: db.prepare(`
    INSERT INTO economie (guild_id, user_id, solde) VALUES (?, ?, ?)
    ON CONFLICT(guild_id, user_id) DO UPDATE SET solde = excluded.solde
  `),
  majDaily: db.prepare(`
    INSERT INTO economie (guild_id, user_id, dernier_daily, serie_daily) VALUES (@guild_id, @user_id, @date, @serie)
    ON CONFLICT(guild_id, user_id) DO UPDATE SET dernier_daily = @date, serie_daily = @serie
  `),
  majTravail: db.prepare(`
    INSERT INTO economie (guild_id, user_id, dernier_travail) VALUES (?, ?, ?)
    ON CONFLICT(guild_id, user_id) DO UPDATE SET dernier_travail = excluded.dernier_travail
  `),
  resetEcoGuild: db.prepare('DELETE FROM economie WHERE guild_id = ?'),
  classementEco: db.prepare('SELECT user_id, solde FROM economie WHERE guild_id = ? AND solde > 0 ORDER BY solde DESC LIMIT ? OFFSET ?'),
  totalRiches: db.prepare('SELECT COUNT(*) AS n FROM economie WHERE guild_id = ? AND solde > 0'),
  rangEco: db.prepare('SELECT COUNT(*) AS n FROM economie WHERE guild_id = ? AND solde > ?'),

  ajouterArticle: db.prepare(`
    INSERT INTO boutique (guild_id, nom, description, prix, role_id, stock)
    VALUES (@guild_id, @nom, @description, @prix, @role_id, @stock)
  `),
  retirerArticle: db.prepare('DELETE FROM boutique WHERE id = ? AND guild_id = ?'),
  articles: db.prepare('SELECT * FROM boutique WHERE guild_id = ? AND actif = 1 ORDER BY prix ASC'),
  article: db.prepare('SELECT * FROM boutique WHERE id = ? AND guild_id = ?'),
  decrementerStock: db.prepare('UPDATE boutique SET stock = stock - 1 WHERE id = ? AND stock > 0'),
  enregistrerAchat: db.prepare(`
    INSERT INTO achats (guild_id, user_id, article_id, nom, prix, date)
    VALUES (@guild_id, @user_id, @article_id, @nom, @prix, @date)
  `),
  achatsDe: db.prepare('SELECT * FROM achats WHERE guild_id = ? AND user_id = ? ORDER BY date DESC LIMIT 15'),

  // -------------------------------------------------------- CANDIDATURES
  ajouterTypeCandidature: db.prepare(`
    INSERT OR REPLACE INTO candidatures_types (guild_id, cle, label, emoji, description, role_id, questions, niveau_min, ouvert)
    VALUES (@guild_id, @cle, @label, @emoji, @description, @role_id, @questions, @niveau_min, @ouvert)
  `),
  retirerTypeCandidature: db.prepare('DELETE FROM candidatures_types WHERE guild_id = ? AND cle = ?'),
  typesCandidatures: db.prepare('SELECT * FROM candidatures_types WHERE guild_id = ? ORDER BY label ASC'),
  typeCandidature: db.prepare('SELECT * FROM candidatures_types WHERE guild_id = ? AND cle = ?'),
  ouvrirFermerType: db.prepare('UPDATE candidatures_types SET ouvert = ? WHERE guild_id = ? AND cle = ?'),

  creerCandidature: db.prepare(`
    INSERT INTO candidatures (guild_id, numero, user_id, type_cle, type_label, reponses, date, langue)
    VALUES (@guild_id, @numero, @user_id, @type_cle, @type_label, @reponses, @date, @langue)
  `),
  lierCandidature: db.prepare('UPDATE candidatures SET channel_id = ?, message_id = ? WHERE id = ?'),
  candidatureParId: db.prepare('SELECT * FROM candidatures WHERE id = ?'),
  candidatureParNumero: db.prepare('SELECT * FROM candidatures WHERE guild_id = ? AND numero = ?'),
  candidatureEnAttenteDe: db.prepare(
    "SELECT * FROM candidatures WHERE guild_id = ? AND user_id = ? AND type_cle = ? AND statut = 'attente'"
  ),
  repondreCandidature: db.prepare(`
    UPDATE candidatures SET statut = @statut, staff_id = @staff_id, reponse = @reponse, repondu_le = @repondu_le WHERE id = @id
  `),
  incrementerCompteurCandidature: db.prepare('UPDATE config SET cand_compteur = cand_compteur + 1 WHERE guild_id = ?'),
  listeCandidatures: db.prepare('SELECT * FROM candidatures WHERE guild_id = ? AND statut = ? ORDER BY numero DESC LIMIT ? OFFSET ?'),
  compterCandidatures: db.prepare('SELECT COUNT(*) AS n FROM candidatures WHERE guild_id = ? AND statut = ?'),

  // --------------------------------------------------------- SUGGESTIONS
  creerSuggestion: db.prepare(`
    INSERT INTO suggestions (guild_id, numero, user_id, texte, date)
    VALUES (@guild_id, @numero, @user_id, @texte, @date)
  `),
  lierSuggestion: db.prepare('UPDATE suggestions SET channel_id = ?, message_id = ?, thread_id = ? WHERE id = ?'),
  suggestionParId: db.prepare('SELECT * FROM suggestions WHERE id = ?'),
  suggestionParNumero: db.prepare('SELECT * FROM suggestions WHERE guild_id = ? AND numero = ?'),
  suggestionParMessage: db.prepare('SELECT * FROM suggestions WHERE message_id = ?'),
  derniereSuggestionDe: db.prepare('SELECT MAX(date) AS derniere FROM suggestions WHERE guild_id = ? AND user_id = ?'),
  repondreSuggestion: db.prepare(`
    UPDATE suggestions SET statut = @statut, staff_id = @staff_id, reponse = @reponse, repondu_le = @repondu_le
    WHERE id = @id
  `),
  supprimerSuggestion: db.prepare('DELETE FROM suggestions WHERE id = ?'),
  incrementerCompteurSuggestion: db.prepare('UPDATE config SET suggestion_compteur = suggestion_compteur + 1 WHERE guild_id = ?'),
  listeSuggestions: db.prepare(
    'SELECT * FROM suggestions WHERE guild_id = ? AND statut = ? ORDER BY numero DESC LIMIT ? OFFSET ?'
  ),
  compterSuggestions: db.prepare('SELECT COUNT(*) AS n FROM suggestions WHERE guild_id = ? AND statut = ?'),

  voterSuggestion: db.prepare(`
    INSERT INTO suggestions_votes (suggestion_id, user_id, valeur) VALUES (?, ?, ?)
    ON CONFLICT(suggestion_id, user_id) DO UPDATE SET valeur = excluded.valeur
  `),
  retirerVote: db.prepare('DELETE FROM suggestions_votes WHERE suggestion_id = ? AND user_id = ?'),
  voteDe: db.prepare('SELECT valeur FROM suggestions_votes WHERE suggestion_id = ? AND user_id = ?'),
  comptesVotes: db.prepare(`
    SELECT
      COALESCE(SUM(CASE WHEN valeur = 1 THEN 1 ELSE 0 END), 0) AS pour,
      COALESCE(SUM(CASE WHEN valeur = -1 THEN 1 ELSE 0 END), 0) AS contre
    FROM suggestions_votes WHERE suggestion_id = ?
  `),
  votantsSuggestion: db.prepare('SELECT user_id, valeur FROM suggestions_votes WHERE suggestion_id = ? ORDER BY valeur DESC'),
  supprimerVotes: db.prepare('DELETE FROM suggestions_votes WHERE suggestion_id = ?'),

  ajouterTypeTicket: db.prepare(
    'INSERT OR REPLACE INTO tickets_types (guild_id, cle, label, emoji, description) VALUES (?, ?, ?, ?, ?)'
  ),
  retirerTypeTicket: db.prepare('DELETE FROM tickets_types WHERE guild_id = ? AND cle = ?'),
  // ------------------------------------------------------------- BANQUE
  majBanque: db.prepare('UPDATE economie SET solde = solde + @solde, banque = banque + @banque WHERE guild_id = @guild_id AND user_id = @user_id'),
  majInteret: db.prepare('UPDATE economie SET banque = banque + ?, dernier_interet = ? WHERE guild_id = ? AND user_id = ?'),
  majBraquage: db.prepare('UPDATE economie SET dernier_braquage = ? WHERE guild_id = ? AND user_id = ?'),
  comptesAvecBanque: db.prepare('SELECT * FROM economie WHERE banque > 0'),
  rangBanque: db.prepare('SELECT COUNT(*) AS n FROM economie WHERE guild_id = ? AND (solde + banque) > ?'),
  classementFortune: db.prepare('SELECT user_id, solde, banque FROM economie WHERE guild_id = ? ORDER BY (solde + banque) DESC LIMIT ?'),

  // --------------------------------------------------------- INVENTAIRE
  ajouterObjet: db.prepare(`
    INSERT INTO inventaire (guild_id, user_id, objet, quantite) VALUES (?, ?, ?, ?)
    ON CONFLICT(guild_id, user_id, objet) DO UPDATE SET quantite = inventaire.quantite + excluded.quantite
  `),
  retirerObjet: db.prepare('UPDATE inventaire SET quantite = quantite - 1 WHERE guild_id = ? AND user_id = ? AND objet = ? AND quantite > 0'),
  objetDe: db.prepare('SELECT quantite FROM inventaire WHERE guild_id = ? AND user_id = ? AND objet = ?'),
  inventaireDe: db.prepare('SELECT objet, quantite FROM inventaire WHERE guild_id = ? AND user_id = ? AND quantite > 0 ORDER BY objet'),
  nettoyerInventaire: db.prepare('DELETE FROM inventaire WHERE quantite <= 0'),

  // -------------------------------------------------------------- EFFETS
  poserEffet: db.prepare('INSERT INTO effets (guild_id, user_id, type, valeur, expire_le) VALUES (?, ?, ?, ?, ?)'),
  effetsDe: db.prepare('SELECT * FROM effets WHERE guild_id = ? AND user_id = ? AND expire_le > ?'),
  effetsExpires: db.prepare('SELECT * FROM effets WHERE expire_le <= ?'),
  retirerEffet: db.prepare('DELETE FROM effets WHERE id = ?'),

  // -------------------------------------------------------------- BADGES
  donnerBadge: db.prepare('INSERT OR IGNORE INTO badges (guild_id, user_id, cle, obtenu_le) VALUES (?, ?, ?, ?)'),
  badgesDe: db.prepare('SELECT cle, obtenu_le FROM badges WHERE guild_id = ? AND user_id = ? ORDER BY obtenu_le ASC'),
  aLeBadge: db.prepare('SELECT 1 AS ok FROM badges WHERE guild_id = ? AND user_id = ? AND cle = ?'),

  // ----------------------------------------------------- MULTIPLICATEURS
  definirMultiplicateur: db.prepare(`
    INSERT INTO xp_multiplicateurs (guild_id, role_id, multiplicateur) VALUES (?, ?, ?)
    ON CONFLICT(guild_id, role_id) DO UPDATE SET multiplicateur = excluded.multiplicateur
  `),
  retirerMultiplicateur: db.prepare('DELETE FROM xp_multiplicateurs WHERE guild_id = ? AND role_id = ?'),
  multiplicateurs: db.prepare('SELECT role_id, multiplicateur FROM xp_multiplicateurs WHERE guild_id = ?'),

  // ------------------------------------------------------- CARTES PERSO
  definirFondPerso: db.prepare(`
    INSERT INTO cartes_perso (guild_id, user_id, url, ajoute_le) VALUES (?, ?, ?, ?)
    ON CONFLICT(guild_id, user_id) DO UPDATE SET url = excluded.url, ajoute_le = excluded.ajoute_le
  `),
  fondPersoDe: db.prepare('SELECT url FROM cartes_perso WHERE guild_id = ? AND user_id = ?'),
  retirerFondPerso: db.prepare('DELETE FROM cartes_perso WHERE guild_id = ? AND user_id = ?'),

  // ------------------------------------------------ ACTIVITE PAR MEMBRE
  noterHeure: db.prepare(`
    INSERT INTO membre_heures (guild_id, user_id, heure, messages) VALUES (?, ?, ?, 1)
    ON CONFLICT(guild_id, user_id, heure) DO UPDATE SET messages = membre_heures.messages + 1
  `),
  noterSalonMembre: db.prepare(`
    INSERT INTO membre_salons (guild_id, user_id, channel_id, messages) VALUES (?, ?, ?, 1)
    ON CONFLICT(guild_id, user_id, channel_id) DO UPDATE SET messages = membre_salons.messages + 1
  `),
  heuresDe: db.prepare('SELECT heure, messages FROM membre_heures WHERE guild_id = ? AND user_id = ? ORDER BY heure'),
  salonsDe: db.prepare('SELECT channel_id, messages FROM membre_salons WHERE guild_id = ? AND user_id = ? ORDER BY messages DESC LIMIT ?'),

  // ------------------------------------------------------ PRESTIGE / XP
  majPrestige: db.prepare('UPDATE xp SET prestige = prestige + 1, xp = 0 WHERE guild_id = ? AND user_id = ?'),
  classementVocal: db.prepare(
    'SELECT user_id, xp, messages, secondes_vocal, prestige FROM xp WHERE guild_id = ? AND secondes_vocal > 0 ORDER BY secondes_vocal DESC LIMIT ? OFFSET ?'
  ),
  totalVocal: db.prepare('SELECT COUNT(*) AS n FROM xp WHERE guild_id = ? AND secondes_vocal > 0'),
  rangVocal: db.prepare('SELECT COUNT(*) AS n FROM xp WHERE guild_id = ? AND secondes_vocal > ?'),
  classementMessages: db.prepare(
    'SELECT user_id, xp, messages, secondes_vocal, prestige FROM xp WHERE guild_id = ? AND messages > 0 ORDER BY messages DESC LIMIT ? OFFSET ?'
  ),
  totalMessagesClasses: db.prepare('SELECT COUNT(*) AS n FROM xp WHERE guild_id = ? AND messages > 0'),

  // ------------------------------------------------------ PREMIER MESSAGE
  // INSERT OR IGNORE : si la ligne existait deja, changes vaut 0 et on sait
  // que ce n'etait pas le premier message. Une seule requete, pas de course.
  noterPremierMessage: db.prepare('INSERT OR IGNORE INTO premiers_messages (guild_id, user_id, date) VALUES (?, ?, ?)'),
  premierMessageDe: db.prepare('SELECT date FROM premiers_messages WHERE guild_id = ? AND user_id = ?'),
  compterPremiersMessages: db.prepare('SELECT COUNT(*) AS n FROM premiers_messages WHERE guild_id = ?'),

  // ------------------------------------------------------------ HISTORIQUE
  // Tout ce que le bot sait d'un membre, table par table. Chaque requete est
  // bornee : sur un membre ancien, la fiche resterait lisible de toute facon,
  // mais autant ne pas charger trois ans de tickets pour en afficher cinq.
  ticketsDe: db.prepare('SELECT * FROM tickets WHERE guild_id = ? AND user_id = ? ORDER BY cree_le DESC LIMIT ?'),
  compterTicketsDe: db.prepare("SELECT statut, COUNT(*) AS n FROM tickets WHERE guild_id = ? AND user_id = ? GROUP BY statut"),
  suggestionsDe: db.prepare('SELECT * FROM suggestions WHERE guild_id = ? AND user_id = ? ORDER BY date DESC LIMIT ?'),
  compterSuggestionsDe: db.prepare('SELECT statut, COUNT(*) AS n FROM suggestions WHERE guild_id = ? AND user_id = ? GROUP BY statut'),
  candidaturesDe: db.prepare('SELECT * FROM candidatures WHERE guild_id = ? AND user_id = ? ORDER BY date DESC LIMIT ?'),
  appelsDe: db.prepare('SELECT * FROM appels WHERE guild_id = ? AND user_id = ? ORDER BY date DESC LIMIT ?'),
  // Un membre apparait dans les signalements de deux facons : celui qui
  // signale, et celui dont le message est signale. Les deux comptent.
  signalementsEmis: db.prepare('SELECT COUNT(*) AS n FROM signalements WHERE guild_id = ? AND signaleur_id = ?'),
  signalementsRecus: db.prepare('SELECT * FROM signalements WHERE guild_id = ? AND auteur_id = ? ORDER BY date DESC LIMIT ?'),
  compterSignalementsRecus: db.prepare('SELECT COUNT(*) AS n FROM signalements WHERE guild_id = ? AND auteur_id = ?'),
  sanctionsRecentesDe: db.prepare('SELECT * FROM sanctions WHERE guild_id = ? AND user_id = ? ORDER BY date DESC LIMIT ?'),
  compterSanctionsDe: db.prepare('SELECT type, COUNT(*) AS n FROM sanctions WHERE guild_id = ? AND user_id = ? GROUP BY type'),
  // Le membre vu comme moderateur : utile pour la fiche d'un membre de l'equipe.
  sanctionsPrononcees: db.prepare('SELECT COUNT(*) AS n FROM sanctions WHERE guild_id = ? AND moderateur_id = ?'),
  premiereActivite: db.prepare('SELECT MIN(date) AS d FROM sanctions WHERE guild_id = ? AND user_id = ?'),
  invitesPar: db.prepare('SELECT COUNT(*) AS n FROM invitations_arrivees WHERE guild_id = ? AND inviteur_id = ?'),

  // ------------------------------------------------------------ STRUCTURE
  ajouterStructure: db.prepare(`
    INSERT INTO structures (guild_id, nom, contenu, version, auteur_id, automatique, nb_roles, nb_salons, cree_le)
    VALUES (@guild_id, @nom, @contenu, @version, @auteur_id, @automatique, @nb_roles, @nb_salons, @cree_le)
  `),
  // Le contenu JSON n'est pas lu dans la liste : sur dix photos d'un gros
  // serveur ca ferait plus d'un mega-octet charge pour rien.
  structures: db.prepare(`
    SELECT id, nom, version, auteur_id, automatique, nb_roles, nb_salons, cree_le
    FROM structures WHERE guild_id = ? ORDER BY cree_le DESC LIMIT ?
  `),
  structure: db.prepare('SELECT * FROM structures WHERE id = ? AND guild_id = ?'),
  derniereStructure: db.prepare('SELECT * FROM structures WHERE guild_id = ? ORDER BY cree_le DESC LIMIT 1'),
  compterStructures: db.prepare('SELECT COUNT(*) AS n FROM structures WHERE guild_id = ?'),
  supprimerStructure: db.prepare('DELETE FROM structures WHERE id = ? AND guild_id = ?'),
  // Rotation : on garde les N plus recentes, on efface le reste.
  purgerStructures: db.prepare(`
    DELETE FROM structures WHERE guild_id = ? AND id NOT IN (
      SELECT id FROM structures WHERE guild_id = ? ORDER BY cree_le DESC LIMIT ?
    )
  `),

  // --------------------------------------------------------------- VEILLE
  ajouterVeille: db.prepare(`
    INSERT INTO veille (guild_id, type, source, nom, salon_id, role_id, message, cree_le)
    VALUES (@guild_id, @type, @source, @nom, @salon_id, @role_id, @message, @cree_le)
  `),
  veilleParId: db.prepare('SELECT * FROM veille WHERE id = ?'),
  veillesDe: db.prepare('SELECT * FROM veille WHERE guild_id = ? ORDER BY id ASC'),
  veillesActives: db.prepare('SELECT * FROM veille WHERE actif = 1 ORDER BY id ASC'),
  retirerVeille: db.prepare('DELETE FROM veille WHERE id = ? AND guild_id = ?'),
  majVeille: db.prepare('UPDATE veille SET dernier = @dernier, derniere_date = @derniere_date, erreurs = 0, derniere_erreur = NULL WHERE id = @id'),
  erreurVeille: db.prepare('UPDATE veille SET erreurs = erreurs + 1, derniere_erreur = @erreur WHERE id = @id'),
  activerVeille: db.prepare('UPDATE veille SET actif = ? WHERE id = ?'),

  // Reglages internes (jeton Instagram)
  lireReglage: db.prepare('SELECT valeur, maj FROM reglages WHERE cle = ?'),
  ecrireReglage: db.prepare(`
    INSERT INTO reglages (cle, valeur, maj) VALUES (?, ?, ?)
    ON CONFLICT(cle) DO UPDATE SET valeur = excluded.valeur, maj = excluded.maj
  `),

  // ------------------------------------------------------------- MISSIONS
  progresMission: db.prepare('SELECT * FROM missions WHERE guild_id = ? AND user_id = ? AND periode = ? AND cle = ?'),
  progresPeriode: db.prepare('SELECT * FROM missions WHERE guild_id = ? AND user_id = ? AND periode = ?'),
  avancerMission: db.prepare(`
    INSERT INTO missions (guild_id, user_id, periode, cle, valeur, detail)
    VALUES (@guild_id, @user_id, @periode, @cle, @valeur, @detail)
    ON CONFLICT(guild_id, user_id, periode, cle) DO UPDATE SET
      valeur = missions.valeur + @valeur,
      detail = COALESCE(@detail, missions.detail)
  `),
  fixerMission: db.prepare(`
    INSERT INTO missions (guild_id, user_id, periode, cle, valeur, detail)
    VALUES (@guild_id, @user_id, @periode, @cle, @valeur, @detail)
    ON CONFLICT(guild_id, user_id, periode, cle) DO UPDATE SET
      valeur = @valeur, detail = @detail
  `),
  reclamerMission: db.prepare('UPDATE missions SET reclamee = 1 WHERE guild_id = ? AND user_id = ? AND periode = ? AND cle = ?'),
  bonusPris: db.prepare('SELECT 1 AS ok FROM missions_bonus WHERE guild_id = ? AND user_id = ? AND periode = ?'),
  prendreBonus: db.prepare('INSERT OR IGNORE INTO missions_bonus (guild_id, user_id, periode) VALUES (?, ?, ?)'),
  // Les periodes "jour" (2026-09-05) et "semaine" (2026-S36) ne se comparent pas
  // entre elles : on purge chaque format avec sa propre limite.
  purgerMissions: db.prepare(`
    DELETE FROM missions
    WHERE (periode LIKE '____-__-__' AND periode < @jour) OR (periode LIKE '____-S__' AND periode < @semaine)
  `),
  purgerBonus: db.prepare(`
    DELETE FROM missions_bonus
    WHERE (periode LIKE '____-__-__' AND periode < @jour) OR (periode LIKE '____-S__' AND periode < @semaine)
  `),

  // -------------------------------------------------- APPELS DE SANCTION
  creerAppel: db.prepare(`
    INSERT INTO appels (guild_id, sanction_id, user_id, texte, date)
    VALUES (@guild_id, @sanction_id, @user_id, @texte, @date)
  `),
  appelParId: db.prepare('SELECT * FROM appels WHERE id = ?'),
  appelDeSanction: db.prepare('SELECT * FROM appels WHERE sanction_id = ? ORDER BY date DESC'),
  appelsEnAttente: db.prepare("SELECT * FROM appels WHERE guild_id = ? AND statut = 'attente' ORDER BY date ASC"),
  compterAppels: db.prepare('SELECT COUNT(*) AS n FROM appels WHERE guild_id = ? AND statut = ?'),
  traiterAppel: db.prepare(`
    UPDATE appels SET statut = @statut, traite_par = @traite_par, reponse = @reponse, date_traitement = @date_traitement
    WHERE id = @id
  `),
  // Variantes SANS serveur, reservees aux appels (le membre fait appel depuis
  // ses MP, ou l'ID du serveur n'existe pas). Elles portaient autrefois le
  // MEME nom que les versions par serveur plus haut : la seconde cle ecrasait
  // la premiere, et /sanctions retirer passait 2 parametres a une requete qui
  // n'en attend qu'un — d'ou « column index out of range ».
  sanctionParIdGlobal: db.prepare('SELECT * FROM sanctions WHERE id = ?'),
  desactiverSanctionGlobal: db.prepare('UPDATE sanctions SET actif = 0 WHERE id = ?'),

  typesTickets: db.prepare('SELECT * FROM tickets_types WHERE guild_id = ? ORDER BY label ASC'),

  // ------------------------------------------------------------ CONCOURS
  creerGiveaway: db.prepare(`
    INSERT INTO giveaways (guild_id, channel_id, lot, gagnants, fin, organise_par, role_requis, niveau_min, cree_le)
    VALUES (@guild_id, @channel_id, @lot, @gagnants, @fin, @organise_par, @role_requis, @niveau_min, @cree_le)
  `),
  giveaway: db.prepare('SELECT * FROM giveaways WHERE id = ?'),
  giveawayDe: db.prepare('SELECT * FROM giveaways WHERE id = ? AND guild_id = ?'),
  giveawaysDe: db.prepare('SELECT * FROM giveaways WHERE guild_id = ? AND statut = ? ORDER BY fin ASC'),
  giveawaysDus: db.prepare("SELECT * FROM giveaways WHERE statut = 'encours' AND fin <= ?"),
  majMessageGiveaway: db.prepare('UPDATE giveaways SET message_id = ? WHERE id = ?'),
  cloreGiveaway: db.prepare('UPDATE giveaways SET statut = ?, tires = ? WHERE id = ?'),
  // -------------------------------------------------------------- XP GLOBAL
  // Un seul compteur par personne, pour tout le bot. Il ne remplace pas l'XP
  // du serveur : il s'ajoute a cote.
  xpGlobalDe: db.prepare('SELECT * FROM xp_global WHERE user_id = ?'),
  ajouterXpGlobal: db.prepare(`
    INSERT INTO xp_global (user_id, xp, messages, secondes_vocal, serveurs, depuis)
    VALUES (@user_id, @xp, @messages, @secondes_vocal, 1, @depuis)
    ON CONFLICT(user_id) DO UPDATE SET
      xp = MIN(xp_global.xp + @xp, 1000000000),
      messages = xp_global.messages + @messages,
      secondes_vocal = xp_global.secondes_vocal + @secondes_vocal
  `),
  majServeursGlobal: db.prepare('UPDATE xp_global SET serveurs = ? WHERE user_id = ?'),
  rangGlobal: db.prepare('SELECT COUNT(*) AS n FROM xp_global WHERE xp > ?'),
  classementGlobal: db.prepare('SELECT * FROM xp_global ORDER BY xp DESC LIMIT ?'),
  totalGlobal: db.prepare('SELECT COUNT(*) AS n FROM xp_global WHERE xp > 0'),
  effacerXpGlobal: db.prepare('DELETE FROM xp_global WHERE user_id = ?'),

  // ----------------------------------------------------------------- PREMIUM
  premiumDe: db.prepare('SELECT * FROM premium WHERE guild_id = ?'),
  premiums: db.prepare('SELECT * FROM premium WHERE jusqu_a IS NULL OR jusqu_a > ? ORDER BY date DESC'),
  poserPremium: db.prepare(`
    INSERT INTO premium (guild_id, source, jusqu_a, sku_id, par, date)
    VALUES (@guild_id, @source, @jusqu_a, @sku_id, @par, @date)
    ON CONFLICT(guild_id) DO UPDATE SET
      source = @source, jusqu_a = @jusqu_a, sku_id = @sku_id, par = @par, date = @date
  `),
  retirerPremium: db.prepare('DELETE FROM premium WHERE guild_id = ?'),

  participer: db.prepare('INSERT OR IGNORE INTO giveaway_participants (giveaway_id, user_id, date) VALUES (?, ?, ?)'),
  quitterGiveaway: db.prepare('DELETE FROM giveaway_participants WHERE giveaway_id = ? AND user_id = ?'),
  participants: db.prepare('SELECT user_id FROM giveaway_participants WHERE giveaway_id = ?'),
  compterParticipants: db.prepare('SELECT COUNT(*) AS n FROM giveaway_participants WHERE giveaway_id = ?'),
  participe: db.prepare('SELECT 1 FROM giveaway_participants WHERE giveaway_id = ? AND user_id = ?'),

  // ------------------------------------------------------- ANNIVERSAIRES
  poserAnniversaire: db.prepare(`
    INSERT INTO anniversaires (guild_id, user_id, jour, mois, annee)
    VALUES (@guild_id, @user_id, @jour, @mois, @annee)
    ON CONFLICT(guild_id, user_id) DO UPDATE SET jour = @jour, mois = @mois, annee = @annee
  `),
  anniversaireDe: db.prepare('SELECT * FROM anniversaires WHERE guild_id = ? AND user_id = ?'),
  retirerAnniversaire: db.prepare('DELETE FROM anniversaires WHERE guild_id = ? AND user_id = ?'),
  anniversairesDuJour: db.prepare('SELECT * FROM anniversaires WHERE mois = ? AND jour = ?'),
  anniversairesDe: db.prepare('SELECT * FROM anniversaires WHERE guild_id = ? ORDER BY mois, jour'),
  marquerSouhaite: db.prepare('UPDATE anniversaires SET dernier = ? WHERE guild_id = ? AND user_id = ?'),

  // ---------------------------------------------------------------- VOTES
  lireVote: db.prepare('SELECT * FROM votes WHERE user_id = ?'),
  noterVote: db.prepare(`
    INSERT INTO votes (user_id, dernier_vote, dernier_guild, total)
    VALUES (@user_id, @date, @guild_id, 1)
    ON CONFLICT(user_id) DO UPDATE SET
      dernier_vote = @date, dernier_guild = @guild_id, total = total + 1
  `),
  rangVote: db.prepare('SELECT COUNT(*) + 1 AS rang FROM votes WHERE total > ?'),
  totalVotes: db.prepare('SELECT COUNT(*) AS membres, COALESCE(SUM(total), 0) AS total FROM votes'),

  // ----------------------------------------------------------- BLOCKLIST
  proposerBlocklist: db.prepare(`
    INSERT INTO blocklist (cible_id, cible_pseudo, raison, preuve, propose_par, propose_guild, date)
    VALUES (@cible_id, @cible_pseudo, @raison, @preuve, @propose_par, @propose_guild, @date)
  `),
  blocklistParId: db.prepare('SELECT * FROM blocklist WHERE id = ?'),
  blocklistDe: db.prepare("SELECT * FROM blocklist WHERE cible_id = ? AND statut = 'approuve' ORDER BY date DESC"),
  blocklistEnAttente: db.prepare("SELECT * FROM blocklist WHERE cible_id = ? AND statut = 'attente'"),
  blocklistApprouvees: db.prepare("SELECT * FROM blocklist WHERE statut = 'approuve' ORDER BY date DESC LIMIT ? OFFSET ?"),
  compterBlocklist: db.prepare("SELECT COUNT(*) AS n FROM blocklist WHERE statut = ?"),
  majMessageBlocklist: db.prepare('UPDATE blocklist SET message_id = ? WHERE id = ?'),
  traiterBlocklist: db.prepare(`
    UPDATE blocklist SET statut = @statut, motif_refus = @motif, traite_par = @par,
      traite_le = @date, public_id = @public_id
    WHERE id = @id
  `),
  proposeesRecemment: db.prepare('SELECT COUNT(*) AS n FROM blocklist WHERE propose_par = ? AND date > ?'),

  // ---------------------------------------------------------- LISTE NOIRE
  bloquer: db.prepare('INSERT OR REPLACE INTO liste_noire (id, genre, raison, par, date) VALUES (@id, @genre, @raison, @par, @date)'),
  debloquer: db.prepare('DELETE FROM liste_noire WHERE id = ?'),
  estBloque: db.prepare('SELECT * FROM liste_noire WHERE id = ?'),
  listeNoire: db.prepare('SELECT * FROM liste_noire ORDER BY date DESC'),
  typeTicket: db.prepare('SELECT * FROM tickets_types WHERE guild_id = ? AND cle = ?'),

  // ------------------------------------------------------- AUDIT DU CONFIG
  ajouterAuditConfig: db.prepare(`
    INSERT INTO config_audit (guild_id, cle, avant, apres, par, source, date)
    VALUES (@guild_id, @cle, @avant, @apres, @par, @source, @date)
  `),
  auditConfig: db.prepare('SELECT * FROM config_audit WHERE guild_id = ? ORDER BY date DESC LIMIT ? OFFSET ?'),
  compterAuditConfig: db.prepare('SELECT COUNT(*) AS n FROM config_audit WHERE guild_id = ?'),
  purgerAuditConfig: db.prepare('DELETE FROM config_audit WHERE date < ?'),
};

// ------------------------------------------------------------------- HELPERS
/** Recupere (et cree au besoin) la config d'un serveur. */
function config(guildId) {
  let ligne = req.getConfig.get(guildId);
  if (!ligne) {
    req.insertConfig.run(guildId);
    ligne = req.getConfig.get(guildId);
  }
  return ligne;
}

/** Met a jour une ou plusieurs colonnes de la config d'un serveur. */
function majConfig(guildId, valeurs) {
  config(guildId); // garantit l'existence de la ligne
  const colonnes = Object.keys(valeurs);
  if (colonnes.length === 0) return;
  const set = colonnes.map((c) => `${c} = @${c}`).join(', ');
  db.prepare(`UPDATE config SET ${set} WHERE guild_id = @guild_id`).run({ ...valeurs, guild_id: guildId });
}

/**
 * Efface toutes les donnees d'un serveur.
 *
 * Appele quand le bot est retire d'un serveur : ses membres n'ont pas a
 * rester dans une base qui ne les concerne plus.
 *
 * Les tables ne sont pas ecrites en dur : on demande a SQLite lesquelles ont
 * une colonne `guild_id`. Une table ajoutee plus tard sera donc effacee elle
 * aussi, sans que personne ait a y penser — c'est exactement le genre d'oubli
 * qui laisse trainer des donnees pendant des annees.
 *
 * Deux exceptions, traitees a part :
 *   - `suggestions_votes` n'a pas de guild_id, seulement le numero de la
 *     suggestion : on passe par elle ;
 *   - `reglages` est GLOBAL (jeton Twitch, dates de renouvellement) et ne
 *     doit jamais partir avec un serveur.
 *
 * @returns {{table: string, lignes: number}[]} ce qui a ete efface
 */
function supprimerServeur(guildId) {
  // `reglages` (jeton Twitch, dates de renouvellement) et `liste_noire` sont
  // globales : elles ne concernent pas un serveur en particulier.
  // Aucune de ces tables ne concerne un serveur en particulier : les
  // reglages du bot, sa liste noire, les votes (qui valent pour le bot) et
  // la blocklist communautaire (qui sert a tous les serveurs).
  const GLOBALES = new Set(['reglages', 'liste_noire', 'votes', 'blocklist', 'premium', 'xp_global']);
  const tables = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
    .all()
    .map((t) => t.name)
    .filter((t) => !GLOBALES.has(t))
    .filter((t) => db.prepare(`PRAGMA table_info(${t})`).all().some((c) => c.name === 'guild_id'));

  // node:sqlite n'a pas de db.transaction() : on ouvre la transaction a la
  // main, comme ailleurs dans le projet. Tout ou rien — un effacement a moitie
  // fait laisserait un serveur dans un etat incoherent.
  const efface = [];
  db.exec('BEGIN');
  try {
    // D'abord les votes : ils pendent aux suggestions, qui vont disparaitre.
    const votes = db
      .prepare('DELETE FROM suggestions_votes WHERE suggestion_id IN (SELECT id FROM suggestions WHERE guild_id = ?)')
      .run(guildId);
    if (votes.changes) efface.push({ table: 'suggestions_votes', lignes: Number(votes.changes) });

    // Meme cas : les participations pendent aux concours, pas au serveur.
    // Sans cette ligne, elles survivraient au depart du bot avec, dedans,
    // l'identifiant de chaque participant.
    const parts = db
      .prepare('DELETE FROM giveaway_participants WHERE giveaway_id IN (SELECT id FROM giveaways WHERE guild_id = ?)')
      .run(guildId);
    if (parts.changes) efface.push({ table: 'giveaway_participants', lignes: Number(parts.changes) });

    for (const table of tables) {
      const r = db.prepare(`DELETE FROM ${table} WHERE guild_id = ?`).run(guildId);
      if (r.changes) efface.push({ table, lignes: Number(r.changes) });
    }
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
  return efface;
}

/**
 * Efface ce que le bot sait d'un membre sur UN serveur.
 *
 * Sert a la commande /confidentialite effacer. Comme pour un serveur, les
 * tables sont trouvees en interrogeant SQLite : une table ajoutee plus tard
 * sera prise en compte sans que personne ait a y penser.
 *
 * DEUX TABLES SONT VOLONTAIREMENT EPARGNEES : `sanctions` et `signalements`.
 * Elles ne decrivent pas le membre, elles decrivent le travail de moderation
 * du serveur — qui a averti qui, et pourquoi. Si un membre pouvait les effacer
 * lui-meme, il suffirait d'une commande pour repartir a zero apres chaque
 * avertissement, et l'historique du staff ne vaudrait plus rien. Un
 * administrateur peut les retirer avec les commandes de moderation.
 *
 * @returns {{table: string, lignes: number}[]}
 */
function supprimerMembre(guildId, userId) {
  const EPARGNEES = new Set(['sanctions', 'signalements', 'mod_notes']);

  const tables = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
    .all()
    .map((t) => t.name)
    .filter((t) => !EPARGNEES.has(t))
    .filter((t) => {
      const colonnes = db.prepare(`PRAGMA table_info(${t})`).all().map((c) => c.name);
      return colonnes.includes('guild_id') && colonnes.includes('user_id');
    });

  const efface = [];
  db.exec('BEGIN');
  try {
    const votes = db
      .prepare('DELETE FROM suggestions_votes WHERE user_id = ? AND suggestion_id IN (SELECT id FROM suggestions WHERE guild_id = ?)')
      .run(userId, guildId);
    if (votes.changes) efface.push({ table: 'suggestions_votes', lignes: Number(votes.changes) });

    // Les participations aux concours n'ont pas de guild_id : elles pendent au
    // concours. On les retire a la main, sinon `effacer` en laisserait.
    const parts = db
      .prepare('DELETE FROM giveaway_participants WHERE user_id = ? AND giveaway_id IN (SELECT id FROM giveaways WHERE guild_id = ?)')
      .run(userId, guildId);
    if (parts.changes) efface.push({ table: 'giveaway_participants', lignes: Number(parts.changes) });

    for (const table of tables) {
      const r = db.prepare(`DELETE FROM ${table} WHERE guild_id = ? AND user_id = ?`).run(guildId, userId);
      if (r.changes) efface.push({ table, lignes: Number(r.changes) });
    }
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
  return efface;
}

/**
 * Ce que le bot sait d'un membre sur un serveur, table par table.
 * Lecture seule : sert a /confidentialite voir, pour que personne n'ait a
 * croire sur parole ce que la politique de confidentialite raconte.
 */
function donneesMembre(guildId, userId) {
  const tables = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
    .all()
    .map((t) => t.name)
    .filter((t) => {
      const colonnes = db.prepare(`PRAGMA table_info(${t})`).all().map((c) => c.name);
      return colonnes.includes('guild_id') && colonnes.includes('user_id');
    });

  const out = [];
  for (const table of tables) {
    const n = db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE guild_id = ? AND user_id = ?`).get(guildId, userId).n;
    if (n) out.push({ table, lignes: n });
  }

  // Les deux tables qui pendent a une autre plutot qu'au serveur : elles n'ont
  // pas de guild_id, donc la recherche automatique ci-dessus les rate.
  for (const [table, sql] of [
    ['suggestions_votes', 'SELECT COUNT(*) AS n FROM suggestions_votes WHERE user_id = ? AND suggestion_id IN (SELECT id FROM suggestions WHERE guild_id = ?)'],
    ['giveaway_participants', 'SELECT COUNT(*) AS n FROM giveaway_participants WHERE user_id = ? AND giveaway_id IN (SELECT id FROM giveaways WHERE guild_id = ?)'],
  ]) {
    const n = db.prepare(sql).get(userId, guildId).n;
    if (n) out.push({ table, lignes: n });
  }
  return out;
}

module.exports = { db, req, config, majConfig, cheminDb, supprimerServeur, supprimerMembre, donneesMembre };
