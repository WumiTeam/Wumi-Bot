/**
 * WUMI WRAPPED : le recap perso d'un membre, en une image a partager.
 *
 *  - « ce mois-ci » : compteurs mensuels tenus ici (messages, salons, vocal) ;
 *  - « depuis le debut » : les totaux deja connus de Wumi (table xp, salons
 *    et heures preferes) — disponible tout de suite, meme sans historique.
 *
 * Image 1080 x 1350 (format portrait, s'affiche en grand dans Discord).
 */
const { createCanvas, loadImage } = require('@napi-rs/canvas');
const { db } = require('../database/db');
const { rectArrondi, cercleImage, tronquerTexte } = require('./canvasOutils');
const { chargerPolices } = require('./polices');

db.exec(`
CREATE TABLE IF NOT EXISTS wrapped_mois (
  guild_id  TEXT NOT NULL,
  user_id   TEXT NOT NULL,
  mois      TEXT NOT NULL,             -- AAAA-MM (heure de Paris)
  messages  INTEGER NOT NULL DEFAULT 0,
  vocal     INTEGER NOT NULL DEFAULT 0, -- minutes
  PRIMARY KEY (guild_id, user_id, mois)
);
CREATE INDEX IF NOT EXISTS idx_wrapped_mois ON wrapped_mois (guild_id, mois, messages DESC);
CREATE TABLE IF NOT EXISTS wrapped_salons (
  guild_id   TEXT NOT NULL,
  user_id    TEXT NOT NULL,
  mois       TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  messages   INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (guild_id, user_id, mois, channel_id)
);
`);

const q = {
  message: db.prepare(`INSERT INTO wrapped_mois (guild_id, user_id, mois, messages) VALUES (?, ?, ?, 1)
    ON CONFLICT(guild_id, user_id, mois) DO UPDATE SET messages = messages + 1`),
  salon: db.prepare(`INSERT INTO wrapped_salons (guild_id, user_id, mois, channel_id, messages) VALUES (?, ?, ?, ?, 1)
    ON CONFLICT(guild_id, user_id, mois, channel_id) DO UPDATE SET messages = messages + 1`),
  vocal: db.prepare(`INSERT INTO wrapped_mois (guild_id, user_id, mois, vocal) VALUES (?, ?, ?, ?)
    ON CONFLICT(guild_id, user_id, mois) DO UPDATE SET vocal = vocal + excluded.vocal`),
  mois: db.prepare('SELECT messages, vocal FROM wrapped_mois WHERE guild_id = ? AND user_id = ? AND mois = ?'),
  rangMois: db.prepare('SELECT COUNT(*) AS n FROM wrapped_mois WHERE guild_id = ? AND mois = ? AND messages > ?'),
  actifsMois: db.prepare('SELECT COUNT(*) AS n FROM wrapped_mois WHERE guild_id = ? AND mois = ? AND messages > 0'),
  salonsMois: db.prepare('SELECT channel_id, messages FROM wrapped_salons WHERE guild_id = ? AND user_id = ? AND mois = ? ORDER BY messages DESC LIMIT 3'),
  xp: db.prepare('SELECT xp, messages, secondes_vocal FROM xp WHERE guild_id = ? AND user_id = ?'),
  actifsTotal: db.prepare('SELECT COUNT(*) AS n FROM xp WHERE guild_id = ? AND messages > 0'),
  rangMessages: db.prepare('SELECT COUNT(*) AS n FROM xp WHERE guild_id = ? AND messages > ?'),
  badges: db.prepare('SELECT COUNT(*) AS n FROM badges WHERE guild_id = ? AND user_id = ?'),
  eco: db.prepare('SELECT total_gagne FROM economie WHERE guild_id = ? AND user_id = ?'),
  purger: db.prepare('DELETE FROM wrapped_salons WHERE mois < ?'),
};

const FORMAT_MOIS = new Intl.DateTimeFormat('fr-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit' });
function moisParis(date = new Date()) {
  return FORMAT_MOIS.format(date).slice(0, 7);
}

/* ------------------------------------------------------------ compteurs */

function noterMessage(guildId, userId, channelId) {
  const m = moisParis();
  q.message.run(guildId, userId, m);
  q.salon.run(guildId, userId, m, channelId);
}

function noterVocal(guildId, userId, minutes) {
  if (minutes > 0) q.vocal.run(guildId, userId, moisParis(), minutes);
}

/** On garde 13 mois de salons par membre, pas plus. */
function purger() {
  const d = new Date();
  d.setMonth(d.getMonth() - 13);
  q.purger.run(moisParis(d));
}

/* --------------------------------------------------------------- donnees */

/** Le surnom selon l'heure ou l'on parle le plus. */
function personnalite(heure) {
  if (heure == null) return 'mystere';
  if (heure < 5) return 'hibou';
  if (heure < 9) return 'leve_tot';
  if (heure < 12) return 'matinal';
  if (heure < 14) return 'midi';
  if (heure < 18) return 'aprem';
  if (heure < 22) return 'soiree';
  return 'hibou';
}

/**
 * Les chiffres du recap. `periode` = 'mois' | 'total'.
 * Renvoie null si le membre n'a encore rien fait.
 */
function donnees(guildId, userId, periode = 'mois') {
  const stats = require('./statsMembre');
  const { infosNiveau, rangDe } = require('./niveaux');
  const xp = q.xp.get(guildId, userId);
  const heures = stats.heures(guildId, userId);
  const pic = stats.heurePic(heures)?.heure ?? null;
  const niveau = xp ? infosNiveau(xp.xp).niveau : 0;
  const rangXp = xp ? rangDe(guildId, xp.xp) : null;
  const base = {
    periode,
    niveau,
    rangXp,
    badges: q.badges.get(guildId, userId)?.n ?? 0,
    pieces: q.eco.get(guildId, userId)?.total_gagne ?? 0,
    heurePic: pic,
    personnalite: personnalite(pic),
  };

  if (periode === 'mois') {
    const mois = moisParis();
    const m = q.mois.get(guildId, userId, mois);
    if (!m || (!m.messages && !m.vocal)) return null;
    const actifs = q.actifsMois.get(guildId, mois).n;
    const rang = m.messages ? q.rangMois.get(guildId, mois, m.messages).n + 1 : null;
    return {
      ...base,
      mois,
      messages: m.messages,
      vocalMin: m.vocal,
      salons: q.salonsMois.all(guildId, userId, mois),
      rangMessages: rang,
      actifs,
      top: rang && actifs ? Math.max(1, Math.ceil((rang / actifs) * 100)) : null,
    };
  }

  if (!xp || (!xp.messages && !xp.secondes_vocal)) return null;
  const actifs = q.actifsTotal.get(guildId).n;
  const rang = xp.messages ? q.rangMessages.get(guildId, xp.messages).n + 1 : null;
  return {
    ...base,
    messages: xp.messages,
    vocalMin: Math.round(xp.secondes_vocal / 60),
    salons: stats.salons(guildId, userId, 3).map((s) => ({ channel_id: s.channel_id, messages: s.messages })),
    rangMessages: rang,
    actifs,
    top: rang && actifs ? Math.max(1, Math.ceil((rang / actifs) * 100)) : null,
  };
}

/* ----------------------------------------------------------------- image */

const L = 1080;
const H = 1350;
const P = 'Poppins';
const BLEU = '#62b8ff';

function nombre(n, langue) {
  return new Intl.NumberFormat(langue === 'en' ? 'en-US' : 'fr-FR').format(n ?? 0);
}

function dureeVocal(min, t) {
  if (min < 60) return t('wrapped.minutes', { n: min });
  const h = Math.floor(min / 60);
  return t('wrapped.heures', { n: h });
}

/**
 * @param {object} d   donnees()
 * @param {object} o   { t, langue, pseudo, avatarUrl, serveur, nomsSalons: Map(id -> nom) }
 */
async function image(d, o) {
  chargerPolices();
  const { langue } = o;
  // Pas de police emoji dans le canevas : on les retire des textes dessines.
  const t = (cle, v) => o.t(cle, v).replace(/[\p{Extended_Pictographic}\uFE0F\u200D]/gu, '').replace(/\s{2,}/g, ' ').trim();
  const c = createCanvas(L, H);
  const ctx = c.getContext('2d');

  // Fond : nuit bleutee + halos.
  ctx.fillStyle = '#0a0b18';
  ctx.fillRect(0, 0, L, H);
  const halo = (x, y, r, couleur) => {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, couleur);
    g.addColorStop(1, 'rgba(10,11,24,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, L, H);
  };
  halo(120, 60, 620, 'rgba(74,140,220,0.45)');
  halo(1000, 760, 640, 'rgba(139,124,246,0.32)');
  halo(300, 1350, 520, 'rgba(228,107,216,0.22)');
  ctx.strokeStyle = 'rgba(255,255,255,0.035)';
  ctx.lineWidth = 1;
  for (let x = 0; x <= L; x += 54) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
  for (let y = 0; y <= H; y += 54) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(L, y); ctx.stroke(); }

  // En-tete.
  ctx.fillStyle = 'rgba(255,255,255,0.07)';
  rectArrondi(ctx, 70, 64, 430, 52, 26);
  ctx.fill();
  ctx.fillStyle = '#cfe6ff';
  ctx.font = `22px "${P} Medium", sans-serif`;
  const periode = d.periode === 'mois'
    ? new Intl.DateTimeFormat(langue === 'en' ? 'en-US' : 'fr-FR', { month: 'long', year: 'numeric', timeZone: 'Europe/Paris' }).format(new Date())
    : t('wrapped.depuis_debut');
  ctx.fillText(`WUMI WRAPPED · ${periode.toUpperCase()}`, 96, 99);

  // Avatar + nom.
  try {
    const avatar = await loadImage(o.avatarUrl);
    ctx.save();
    ctx.shadowColor = 'rgba(98,184,255,0.6)';
    ctx.shadowBlur = 40;
    cercleImage(ctx, avatar, 70, 160, 170);
    ctx.restore();
  } catch { /* avatar indisponible : on continue sans */ }
  ctx.fillStyle = '#eef0fc';
  ctx.font = `68px "${P} Bold", sans-serif`;
  ctx.fillText(tronquerTexte(ctx, o.pseudo, 760), 270, 238);
  ctx.fillStyle = '#aeb4d6';
  ctx.font = `28px "${P}", sans-serif`;
  ctx.fillText(tronquerTexte(ctx, o.serveur, 760), 272, 284);

  // Le titre accrocheur.
  ctx.fillStyle = BLEU;
  ctx.font = `30px "${P} Medium", sans-serif`;
  const accroche = d.top && d.actifs >= 5 && d.top <= 50 ? t('wrapped.top', { n: d.top }) : t('wrapped.merci');
  ctx.fillText(accroche, 70, 400);

  // Quatre tuiles.
  const tuiles = [
    [t('wrapped.t_messages'), nombre(d.messages, langue), d.rangMessages ? `#${d.rangMessages}` : ''],
    [t('wrapped.t_vocal'), dureeVocal(d.vocalMin, t), ''],
    [t('wrapped.t_niveau'), String(d.niveau), d.rangXp ? `#${d.rangXp}` : ''],
    [t('wrapped.t_badges'), String(d.badges), ''],
  ];
  tuiles.forEach(([titre, valeur, petit], i) => {
    const x = 70 + (i % 2) * 480;
    const y = 440 + Math.floor(i / 2) * 230;
    const g = ctx.createLinearGradient(x, y, x + 460, y + 210);
    g.addColorStop(0, 'rgba(255,255,255,0.09)');
    g.addColorStop(1, 'rgba(255,255,255,0.03)');
    ctx.fillStyle = g;
    rectArrondi(ctx, x, y, 460, 210, 28);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.1)';
    ctx.stroke();
    ctx.fillStyle = '#aeb4d6';
    ctx.font = `24px "${P} Medium", sans-serif`;
    ctx.fillText(titre.toUpperCase(), x + 34, y + 54);
    ctx.fillStyle = '#ffffff';
    ctx.font = `78px "${P} Bold", sans-serif`;
    ctx.fillText(tronquerTexte(ctx, valeur, 300), x + 32, y + 152);
    if (petit) {
      ctx.fillStyle = BLEU;
      ctx.font = `30px "${P} Bold", sans-serif`;
      const lp = ctx.measureText(petit).width;
      ctx.fillText(petit, x + 460 - 34 - lp, y + 152);
    }
  });

  // Salons preferes.
  const y0 = 930;
  ctx.fillStyle = '#eef0fc';
  ctx.font = `30px "${P} Bold", sans-serif`;
  ctx.fillText(t('wrapped.salons'), 70, y0);
  const max = Math.max(1, ...d.salons.map((s) => s.messages));
  d.salons.slice(0, 3).forEach((s, i) => {
    const y = y0 + 30 + i * 62;
    const nom = `#${o.nomsSalons.get(s.channel_id) ?? '?'}`;
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    rectArrondi(ctx, 70, y, 940, 48, 14);
    ctx.fill();
    const g = ctx.createLinearGradient(70, 0, 1010, 0);
    g.addColorStop(0, 'rgba(74,168,255,0.55)');
    g.addColorStop(1, 'rgba(169,180,242,0.35)');
    ctx.fillStyle = g;
    rectArrondi(ctx, 70, y, Math.max(60, 940 * (s.messages / max)), 48, 14);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = `24px "${P} Medium", sans-serif`;
    ctx.fillText(tronquerTexte(ctx, nom, 700), 92, y + 32);
    ctx.font = `24px "${P} Bold", sans-serif`;
    const n = nombre(s.messages, langue);
    ctx.fillText(n, 990 - ctx.measureText(n).width, y + 32);
  });
  if (!d.salons.length) {
    ctx.fillStyle = '#8d93b8';
    ctx.font = `24px "${P}", sans-serif`;
    ctx.fillText(t('wrapped.pas_de_salon'), 70, y0 + 60);
  }

  // Personnalite.
  const yp = 1170;
  ctx.fillStyle = 'rgba(98,184,255,0.12)';
  rectArrondi(ctx, 70, yp, 940, 100, 26);
  ctx.fill();
  ctx.strokeStyle = 'rgba(98,184,255,0.35)';
  ctx.stroke();
  ctx.fillStyle = '#ffffff';
  ctx.font = `34px "${P} Bold", sans-serif`;
  ctx.fillText(t(`wrapped.perso_${d.personnalite}`), 104, yp + 46);
  ctx.fillStyle = '#aeb4d6';
  ctx.font = `22px "${P}", sans-serif`;
  ctx.fillText(d.heurePic != null ? t('wrapped.heure_pic', { h: d.heurePic }) : t('wrapped.heure_inconnue'), 106, yp + 80);

  // Pied.
  ctx.fillStyle = '#8d93b8';
  ctx.font = `22px "${P} Medium", sans-serif`;
  ctx.fillText('wumi.fr', 70, 1318);
  const sig = '/wrapped';
  ctx.fillText(sig, 1010 - ctx.measureText(sig).width, 1318);

  return c.encode('png');
}

module.exports = { noterMessage, noterVocal, purger, donnees, image, moisParis, personnalite };
