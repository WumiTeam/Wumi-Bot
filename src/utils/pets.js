/**
 * /pet — un COMPAGNON VIRTUEL par membre et par serveur.
 *
 *  - il gagne de l'experience quand son maitre est actif (messages, vocal)
 *    et quand on s'en occupe ; il passe 5 stades, de l'oeuf au legendaire ;
 *  - sa faim et sa bonne humeur baissent avec le temps (calcul a la lecture,
 *    pas de minuterie) ; affame ou triste, il boude et grandit moitie moins vite ;
 *  - nourrir coute des pieces si l'economie du serveur est active, sinon
 *    c'est gratuit avec un delai. Jouer et faire un calin sont gratuits.
 *
 * Personne ne meurt ici : un compagnon delaisse boude, c'est tout.
 */
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const C = require('./composants');
const { db, config } = require('../database/db');

db.exec(`
CREATE TABLE IF NOT EXISTS pets (
  guild_id     TEXT NOT NULL,
  user_id      TEXT NOT NULL,
  nom          TEXT NOT NULL,
  espece       TEXT NOT NULL,
  xp           INTEGER NOT NULL DEFAULT 0,
  faim         REAL NOT NULL DEFAULT 80,   -- 100 = repu, 0 = affame
  humeur       REAL NOT NULL DEFAULT 80,   -- 100 = aux anges, 0 = triste
  maj_le       INTEGER NOT NULL,
  ne_le        INTEGER NOT NULL,
  dernier_xp   INTEGER NOT NULL DEFAULT 0,
  dernier_repas INTEGER NOT NULL DEFAULT 0,
  dernier_jeu  INTEGER NOT NULL DEFAULT 0,
  dernier_calin INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (guild_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_pets_xp ON pets (guild_id, xp DESC);
`);

const q = {
  lire: db.prepare('SELECT * FROM pets WHERE guild_id = ? AND user_id = ?'),
  creer: db.prepare('INSERT INTO pets (guild_id, user_id, nom, espece, maj_le, ne_le) VALUES (?, ?, ?, ?, ?, ?)'),
  ecrire: db.prepare(`UPDATE pets SET xp = @xp, faim = @faim, humeur = @humeur, maj_le = @maj_le, dernier_xp = @dernier_xp,
    dernier_repas = @dernier_repas, dernier_jeu = @dernier_jeu, dernier_calin = @dernier_calin, nom = @nom
    WHERE guild_id = @guild_id AND user_id = @user_id`),
  top: db.prepare('SELECT user_id, nom, espece, xp FROM pets WHERE guild_id = ? ORDER BY xp DESC LIMIT 10'),
  rang: db.prepare('SELECT COUNT(*) AS n FROM pets WHERE guild_id = ? AND xp > ?'),
  liberer: db.prepare('DELETE FROM pets WHERE guild_id = ? AND user_id = ?'),
};

const ESPECES = {
  chat: '🐱', chien: '🐶', renard: '🦊', lapin: '🐰', panda: '🐼', pingouin: '🐧', dragon: '🐲', licorne: '🦄',
};
// [xp minimum, cle]
const STADES = [[0, 'oeuf'], [60, 'bebe'], [400, 'jeune'], [1500, 'adulte'], [5000, 'legendaire']];
const HEURE = 3_600_000;
const PERTE_FAIM = 3; // par heure
const PERTE_HUMEUR = 2; // par heure (double si affame)
const PRIX_REPAS = 20;
const DELAI = { repas: 2 * HEURE, jeu: HEURE, calin: 10 * 60_000 };

function stade(xp) {
  let i = 0;
  for (let k = 0; k < STADES.length; k += 1) if (xp >= STADES[k][0]) i = k;
  const suivant = STADES[i + 1]?.[0] ?? null;
  return { index: i, cle: STADES[i][1], suivant, debut: STADES[i][0] };
}

/** L'etat a l'instant, faim et humeur recalculees depuis la derniere fois. */
function vivre(p, maintenant = Date.now()) {
  if (!p) return null;
  const h = Math.max(0, (maintenant - p.maj_le) / HEURE);
  const faim = Math.max(0, p.faim - PERTE_FAIM * h);
  const affame = faim < 20 ? 2 : 1;
  const humeur = Math.max(0, p.humeur - PERTE_HUMEUR * affame * h);
  return { ...p, faim, humeur, maj_le: maintenant };
}

function sauver(p) {
  q.ecrire.run({
    guild_id: p.guild_id, user_id: p.user_id, nom: p.nom, xp: p.xp, maj_le: p.maj_le, dernier_xp: p.dernier_xp,
    dernier_repas: p.dernier_repas, dernier_jeu: p.dernier_jeu, dernier_calin: p.dernier_calin,
    faim: Math.min(100, Math.max(0, p.faim)),
    humeur: Math.min(100, Math.max(0, p.humeur)),
  });
}

function lire(guildId, userId) {
  return vivre(q.lire.get(guildId, userId));
}

function boude(p) {
  return p.faim < 15 || p.humeur < 15;
}

function adopter(guildId, userId, espece, nom) {
  if (q.lire.get(guildId, userId)) return null;
  if (!ESPECES[espece]) return null;
  const maintenant = Date.now();
  q.creer.run(guildId, userId, String(nom).slice(0, 24), espece, maintenant, maintenant);
  return lire(guildId, userId);
}

/** Le maitre est actif : +1 xp toutes les 30 s au plus (moitie s'il boude). */
function activite(guildId, userId, points = 1) {
  const brut = q.lire.get(guildId, userId);
  if (!brut) return;
  const p = vivre(brut);
  const maintenant = Date.now();
  if (points === 1 && maintenant - p.dernier_xp < 30_000) return;
  const gain = boude(p) ? Math.ceil(points / 2) : points;
  sauver({ ...p, xp: p.xp + gain, dernier_xp: maintenant });
}

/**
 * Une action sur le compagnon. Renvoie { ok, cle, vars, pet }.
 * action : 'repas' | 'jeu' | 'calin'
 */
function agir(guildId, userId, action) {
  const p = lire(guildId, userId);
  if (!p) return { ok: false, cle: 'pet.aucun' };
  const maintenant = Date.now();
  const champ = { repas: 'dernier_repas', jeu: 'dernier_jeu', calin: 'dernier_calin' }[action];
  const eco = Boolean(config(guildId).eco_actif);

  if (action === 'repas') {
    if (p.faim >= 95) return { ok: false, cle: 'pet.pas_faim', vars: { nom: p.nom } };
    if (!eco && maintenant - p.dernier_repas < DELAI.repas) {
      return { ok: false, cle: 'pet.attendre', vars: { quand: `<t:${Math.floor((p.dernier_repas + DELAI.repas) / 1000)}:R>` } };
    }
    if (eco) {
      const economie = require('./economie');
      if (economie.solde(guildId, userId) < PRIX_REPAS) return { ok: false, cle: 'pet.pas_assez', vars: { prix: economie.somme(guildId, PRIX_REPAS) } };
      economie.crediter(guildId, userId, -PRIX_REPAS, false);
    }
    const n = { ...p, faim: p.faim + 40, humeur: p.humeur + 5, xp: p.xp + 8, [champ]: maintenant };
    sauver(n);
    return { ok: true, cle: eco ? 'pet.repas_paye' : 'pet.repas', vars: { nom: p.nom, prix: eco ? require('./economie').somme(guildId, PRIX_REPAS) : '' }, pet: lire(guildId, userId) };
  }

  if (maintenant - p[champ] < DELAI[action]) {
    return { ok: false, cle: 'pet.attendre', vars: { quand: `<t:${Math.floor((p[champ] + DELAI[action]) / 1000)}:R>` } };
  }
  const n = action === 'jeu'
    ? { ...p, humeur: p.humeur + 25, faim: p.faim - 5, xp: p.xp + 15, [champ]: maintenant }
    : { ...p, humeur: p.humeur + 8, xp: p.xp + 3, [champ]: maintenant };
  sauver(n);
  return { ok: true, cle: `pet.${action}`, vars: { nom: p.nom }, pet: lire(guildId, userId) };
}

function renommer(guildId, userId, nom) {
  const p = lire(guildId, userId);
  if (!p) return false;
  sauver({ ...p, nom: String(nom).slice(0, 24) });
  return true;
}

const liberer = (guildId, userId) => q.liberer.run(guildId, userId).changes > 0;
const top = (guildId) => q.top.all(guildId);

/* -------------------------------------------------------------- affichage */

function jauge(v) {
  const n = Math.round(Math.min(100, Math.max(0, v)) / 10);
  return '▰'.repeat(n) + '▱'.repeat(10 - n);
}

function visage(p) {
  if (stade(p.xp).cle === 'oeuf') return '🥚';
  return ESPECES[p.espece] ?? '🐾';
}

function humeurTexte(p, t) {
  if (p.faim < 15) return t('pet.etat_affame');
  if (p.humeur < 15) return t('pet.etat_boude');
  if (p.humeur > 75 && p.faim > 60) return t('pet.etat_heureux');
  if (p.faim < 40) return t('pet.etat_faim');
  return t('pet.etat_bien');
}

/** Le panneau du compagnon. `proprio` = les boutons sont pour lui. */
function panneau(p, t, { proprio = true, maitre = null } = {}) {
  const s = stade(p.xp);
  const progression = s.suivant ? Math.round(((p.xp - s.debut) / (s.suivant - s.debut)) * 100) : 100;
  const deco = s.cle === 'legendaire' ? ' ✨👑' : s.cle === 'adulte' ? ' ✨' : '';
  const blocs = [
    C.texte(`# ${visage(p)}${deco}\n## ${p.nom}\n-# ${t(`pet.espece_${p.espece}`)} · ${t(`pet.stade_${s.cle}`)}${maitre ? ` · ${t('pet.de', { membre: `<@${maitre}>` })}` : ''}`),
    C.texte(`**${humeurTexte(p, t)}**`),
    C.texte([
      `🍖 ${t('pet.faim')} \`${jauge(p.faim)}\` ${Math.round(p.faim)} %`,
      `💖 ${t('pet.humeur')} \`${jauge(p.humeur)}\` ${Math.round(p.humeur)} %`,
      `⭐ ${t('pet.xp')} \`${jauge(progression)}\` ${p.xp}${s.suivant ? ` / ${s.suivant}` : ''}`,
    ].join('\n')),
    C.texte(`-# ${t('pet.ne', { quand: `<t:${Math.floor(p.ne_le / 1000)}:D>` })}${boude(p) ? ` · ${t('pet.boude_aide')}` : ''}`),
  ];
  if (proprio) {
    blocs.push(new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('pet_repas').setEmoji('🍖').setLabel(t('pet.btn_repas')).setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('pet_jeu').setEmoji('🎾').setLabel(t('pet.btn_jeu')).setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('pet_calin').setEmoji('🤗').setLabel(t('pet.btn_calin')).setStyle(ButtonStyle.Secondary),
    ));
  }
  const couleur = boude(p) ? 0x80869c : s.cle === 'legendaire' ? 0xf5b301 : 0xe46bd8;
  return { components: [C.conteneur(blocs, couleur)], flags: MessageFlags.IsComponentsV2, allowedMentions: { parse: [] } };
}

/** Les boutons du panneau (prefixe pet_). Seul le maitre peut s'en servir. */
async function gererInteraction(interaction) {
  const { t } = require('./langues').traducteur(interaction);
  const action = interaction.customId.slice(4);
  // Le panneau d'un autre : on ne touche pas a son compagnon.
  const maitre = interaction.message?.interactionMetadata?.user?.id ?? interaction.message?.interaction?.user?.id;
  if (maitre && maitre !== interaction.user.id) return interaction.reply(C.erreurPrivee(t('pet.pas_le_tien')));
  const r = agir(interaction.guildId, interaction.user.id, action);
  if (!r.ok) return interaction.reply(C.erreurPrivee(t(r.cle, r.vars)));
  await interaction.update({ components: panneau(r.pet, t).components });
  return interaction.followUp(C.succesPrive(t(r.cle, r.vars))).catch(() => null);
}

module.exports = { ESPECES, STADES, stade, vivre, lire, adopter, activite, agir, renommer, liberer, top, panneau, gererInteraction, boude, PRIX_REPAS, rang: (g, xp) => q.rang.get(g, xp).n + 1 };
