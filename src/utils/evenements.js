/**
 * Les EVENEMENTS : une soiree, un tournoi, une partie… avec inscriptions.
 *
 *  - bouton Participer / Se desinscrire, places limitees ou non ;
 *  - liste d'attente : quand quelqu'un se desiste, le premier en attente
 *    prend sa place et recoit un MP ;
 *  - 15 min avant, rappel en MP a chaque inscrit et mention dans le salon ;
 *  - a l'heure, l'evenement passe « commence » et les boutons se figent ;
 *  - repetition (chaque jour, semaine, 2 semaines, mois) : l'occurrence
 *    suivante est publiee quand celle-ci commence ;
 *  - l'evenement apparait aussi dans les evenements Discord du serveur.
 *
 * L'heure saisie est lue dans le fuseau choisi (Europe/Paris par defaut), puis
 * affichee avec les horodatages Discord : chacun la voit dans SON fuseau.
 */
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags, PermissionFlagsBits, escapeMarkdown } = require('discord.js');
const C = require('./composants');
const { db } = require('../database/db');
const logger = require('./logger');

db.exec(`
CREATE TABLE IF NOT EXISTS evenements (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id    TEXT NOT NULL,
  channel_id  TEXT NOT NULL,
  message_id  TEXT,
  createur    TEXT NOT NULL,
  titre       TEXT NOT NULL,
  description TEXT,
  debut       INTEGER NOT NULL,
  places      INTEGER NOT NULL DEFAULT 0,
  role_id     TEXT,
  inscrits    TEXT NOT NULL DEFAULT '[]',
  attente     TEXT NOT NULL DEFAULT '[]',
  rappel      INTEGER NOT NULL DEFAULT 0,
  statut      TEXT NOT NULL DEFAULT 'ouvert'
);
CREATE INDEX IF NOT EXISTS idx_evenements_statut ON evenements (statut, debut);
`);

// Wumi 2.14 : repetition, duree, fuseau (pour garder la meme heure locale
// d'une occurrence a l'autre) et l'evenement Discord natif associe.
{
  const existantes = db.prepare('PRAGMA table_info(evenements)').all().map((c) => c.name);
  for (const [nom, def] of Object.entries({
    repetition: 'TEXT',
    duree: 'INTEGER NOT NULL DEFAULT 120',
    fuseau: "TEXT NOT NULL DEFAULT 'Europe/Paris'",
    discord_id: 'TEXT',
  })) if (!existantes.includes(nom)) db.exec(`ALTER TABLE evenements ADD COLUMN ${nom} ${def}`);
}

const q = {
  creer: db.prepare(`INSERT INTO evenements (guild_id, channel_id, createur, titre, description, debut, places, role_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`),
  lire: db.prepare('SELECT * FROM evenements WHERE id = ?'),
  message: db.prepare('UPDATE evenements SET message_id = ? WHERE id = ?'),
  listes: db.prepare('UPDATE evenements SET inscrits = ?, attente = ? WHERE id = ?'),
  statut: db.prepare('UPDATE evenements SET statut = ? WHERE id = ?'),
  rappel: db.prepare('UPDATE evenements SET rappel = 1 WHERE id = ?'),
  aVenir: db.prepare("SELECT * FROM evenements WHERE guild_id = ? AND statut = 'ouvert' ORDER BY debut LIMIT 15"),
  aSurveiller: db.prepare("SELECT * FROM evenements WHERE statut = 'ouvert' AND debut <= ?"),
  supprimer: db.prepare('DELETE FROM evenements WHERE id = ?'),
  options: db.prepare('UPDATE evenements SET repetition = ?, duree = ?, fuseau = ?, discord_id = ? WHERE id = ?'),
  discord: db.prepare('UPDATE evenements SET discord_id = ? WHERE id = ?'),
  aTerminer: db.prepare("SELECT * FROM evenements WHERE statut = 'commence' AND debut + duree * 60000 <= ?"),
};

const REPETITIONS = { quotidien: { jours: 1 }, hebdo: { jours: 7 }, bimensuel: { jours: 14 }, mensuel: { mois: 1 } };

const COULEUR = 0x3ddc97;
const RAPPEL_MS = 15 * 60_000;
const MAX_INSCRITS = 500;

/* ------------------------------------------------------------------ dates */

function decalage(ts, fuseau) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: fuseau, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  }).formatToParts(ts).map((x) => [x.type, x.value]));
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute) - Math.floor(ts / 60_000) * 60_000;
}

function fuseauValide(fuseau) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: fuseau });
    return true;
  } catch {
    return false;
  }
}

/**
 * « 25/12 » + « 21h30 » dans un fuseau -> timestamp (ms), ou null.
 * Formats acceptes : 25/12, 25/12/2026, 25-12-2026, 2026-12-25 ; 21:30, 21h30, 21h.
 */
function lireDate(date, heure, fuseau = 'Europe/Paris', maintenant = Date.now()) {
  if (!fuseauValide(fuseau)) return null;
  const d = String(date ?? '').trim();
  let j; let m; let a;
  let r = d.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (r) [, a, m, j] = r.map(Number);
  else {
    r = d.match(/^(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?$/);
    if (!r) return null;
    [j, m] = [Number(r[1]), Number(r[2])];
    a = r[3] ? Number(r[3].length === 2 ? `20${r[3]}` : r[3]) : null;
  }
  const h = String(heure ?? '').trim().toLowerCase().match(/^(\d{1,2})\s*(?:[:h]\s*(\d{2})?)?$/);
  if (!h) return null;
  const [hh, mm] = [Number(h[1]), Number(h[2] ?? 0)];
  if (m < 1 || m > 12 || j < 1 || j > 31 || hh > 23 || mm > 59) return null;

  const calculer = (annee) => {
    const brut = Date.UTC(annee, m - 1, j, hh, mm);
    const v = new Date(brut);
    if (v.getUTCDate() !== j || v.getUTCMonth() !== m - 1) return null; // 31/02…
    let ts = brut - decalage(brut, fuseau);
    const d2 = decalage(ts, fuseau);
    if (brut - d2 !== ts) ts = brut - d2;
    return ts;
  };
  if (a) return calculer(a);
  // Sans annee : la prochaine occurrence.
  const anneeCourante = new Date(maintenant).getUTCFullYear();
  const cetteAnnee = calculer(anneeCourante);
  return cetteAnnee && cetteAnnee > maintenant ? cetteAnnee : calculer(anneeCourante + 1);
}

/**
 * La prochaine occurrence, a la MEME heure locale (le passage a l'heure
 * d'ete ne decale pas un evenement « tous les mardis a 21 h »).
 */
function suivante(debut, repetition, fuseau = 'Europe/Paris') {
  const r = REPETITIONS[repetition];
  if (!r) return null;
  const local = new Date(debut + decalage(debut, fuseau)); // heure murale, lue en UTC
  if (r.jours) local.setUTCDate(local.getUTCDate() + r.jours);
  if (r.mois) {
    const jour = local.getUTCDate();
    local.setUTCDate(1);
    local.setUTCMonth(local.getUTCMonth() + r.mois);
    const dernier = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth() + 1, 0)).getUTCDate();
    local.setUTCDate(Math.min(jour, dernier)); // un 31 devient le dernier jour du mois
  }
  const brut = local.getTime();
  let ts = brut - decalage(brut, fuseau);
  const d2 = decalage(ts, fuseau);
  if (brut - d2 !== ts) ts = brut - d2;
  return ts;
}

/* ------------------------------------------------- evenement Discord natif */

/**
 * Cree l'evenement dans l'onglet « Evenements » du serveur (en haut de la
 * liste des salons), avec le lien vers le message d'inscription.
 */
async function creerNatif(guild, e, t) {
  if (!guild.members.me?.permissions.has(PermissionFlagsBits.ManageEvents)) return null;
  try {
    const { GuildScheduledEventEntityType, GuildScheduledEventPrivacyLevel } = require('discord.js');
    const lien = `https://discord.com/channels/${e.guild_id}/${e.channel_id}/${e.message_id}`;
    const natif = await guild.scheduledEvents.create({
      name: e.titre.slice(0, 100),
      description: `${(e.description ?? '').slice(0, 800)}\n\n${t('evenement.natif_inscription', { lien })}`.trim().slice(0, 1000),
      scheduledStartTime: new Date(e.debut),
      scheduledEndTime: new Date(e.debut + (e.duree ?? 120) * 60_000),
      privacyLevel: GuildScheduledEventPrivacyLevel.GuildOnly,
      entityType: GuildScheduledEventEntityType.External,
      entityMetadata: { location: `#${guild.channels.cache.get(e.channel_id)?.name ?? 'discord'}`.slice(0, 100) },
    });
    q.discord.run(natif.id, e.id);
    return natif.id;
  } catch (err) {
    logger.debug('Evenement natif :', err.message);
    return null;
  }
}

async function natif(client, e, action) {
  if (!e.discord_id) return;
  const guild = client.guilds.cache.get(e.guild_id);
  const ev = await guild?.scheduledEvents.fetch(e.discord_id).catch(() => null);
  if (!ev) return;
  const { GuildScheduledEventStatus } = require('discord.js');
  if (action === 'supprimer') await ev.delete().catch(() => null);
  if (action === 'demarrer' && ev.status === GuildScheduledEventStatus.Scheduled) await ev.setStatus(GuildScheduledEventStatus.Active).catch(() => null);
  if (action === 'terminer' && ev.status === GuildScheduledEventStatus.Active) await ev.setStatus(GuildScheduledEventStatus.Completed).catch(() => null);
}

/* ---------------------------------------------------------------- message */

const liste = (ids, max = 40) => {
  if (!ids.length) return '—';
  const texte = ids.slice(0, max).map((id) => `<@${id}>`).join(' ');
  return ids.length > max ? `${texte} +${ids.length - max}` : texte;
};

function construire(e, t) {
  const inscrits = JSON.parse(e.inscrits);
  const attente = JSON.parse(e.attente);
  const ouvert = e.statut === 'ouvert';
  const etat = { ouvert: '', commence: `🟢 ${t('evenement.commence')}`, annule: `🚫 ${t('evenement.annule')}` }[e.statut] ?? '';
  const complet = e.places > 0 && inscrits.length >= e.places;
  const blocs = [
    C.texte(`## 📅 ${escapeMarkdown(e.titre)}${etat ? `\n${etat}` : ''}`),
  ];
  if (e.description) blocs.push(C.texte(e.description.slice(0, 1500)));
  blocs.push(C.texte([
    `**🕒 ${t('evenement.quand')}** · <t:${Math.floor(e.debut / 1000)}:F> (<t:${Math.floor(e.debut / 1000)}:R>)`,
    `**👥 ${t('evenement.participants')}** · ${inscrits.length}${e.places ? `/${e.places}` : ''}${complet ? ` · ${t('evenement.complet')}` : ''}`,
    liste(inscrits),
    attente.length ? `**⏳ ${t('evenement.attente')}** · ${attente.length}\n${liste(attente, 20)}` : null,
  ].filter(Boolean).join('\n')));
  blocs.push(C.texte(`-# ${t('evenement.organise', { membre: `<@${e.createur}>` })} · #${e.id}${e.repetition ? ` · 🔁 ${t(`evenement.rep.${e.repetition}`)}` : ''}`));
  blocs.push(new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`evt_in:${e.id}`).setEmoji('✅').setLabel(complet ? t('evenement.btn_attente') : t('evenement.btn_participer')).setStyle(ButtonStyle.Success).setDisabled(!ouvert),
    new ButtonBuilder().setCustomId(`evt_out:${e.id}`).setEmoji('❌').setLabel(t('evenement.btn_quitter')).setStyle(ButtonStyle.Secondary).setDisabled(!ouvert),
    new ButtonBuilder().setCustomId(`evt_annuler:${e.id}`).setEmoji('🗑️').setStyle(ButtonStyle.Danger).setDisabled(!ouvert),
  ));
  return { components: [C.conteneur(blocs, e.statut === 'annule' ? 0x80869c : COULEUR)], flags: MessageFlags.IsComponentsV2, allowedMentions: { parse: [] } };
}

function traduction(guild) {
  return require('./langues').traducteur(guild).t;
}

async function majMessage(client, e) {
  const salon = client.guilds.cache.get(e.guild_id)?.channels.cache.get(e.channel_id);
  if (!salon || !e.message_id) return;
  const { components } = construire(e, traduction(salon.guild));
  await salon.messages.edit(e.message_id, { components }).catch(() => null);
}

/* ---------------------------------------------------------------- actions */

async function creer(guild, salon, donnees, t) {
  const r = q.creer.run(guild.id, salon.id, donnees.createur, donnees.titre, donnees.description ?? null, donnees.debut, donnees.places ?? 0, donnees.role ?? null);
  const e = q.lire.get(Number(r.lastInsertRowid));
  if (e.role_id) {
    await salon.send({ content: `📅 ${t('evenement.annonce_role', { titre: escapeMarkdown(e.titre) })} <@&${e.role_id}>`, allowedMentions: { roles: [e.role_id] } }).catch(() => null);
  }
  let msg;
  try {
    msg = await salon.send(construire(e, t));
  } catch (err) {
    q.supprimer.run(e.id);
    throw err;
  }
  q.message.run(msg.id, e.id);
  q.options.run(donnees.repetition ?? null, donnees.duree ?? 120, donnees.fuseau ?? 'Europe/Paris', null, e.id);
  const complet = q.lire.get(e.id);
  if (complet.repetition) await majMessage(guild.client, complet);
  if (donnees.natif !== false) await creerNatif(guild, complet, t);
  return q.lire.get(e.id);
}

/** Inscrit ou desinscrit. Renvoie la cle du message a afficher. */
function inscrire(e, userId) {
  const inscrits = JSON.parse(e.inscrits);
  const attente = JSON.parse(e.attente);
  if (inscrits.includes(userId)) return { cle: 'evenement.deja_inscrit' };
  if (attente.includes(userId)) return { cle: 'evenement.deja_attente' };
  if (inscrits.length + attente.length >= MAX_INSCRITS) return { cle: 'evenement.plein' };
  if (e.places && inscrits.length >= e.places) {
    attente.push(userId);
    q.listes.run(JSON.stringify(inscrits), JSON.stringify(attente), e.id);
    return { cle: 'evenement.en_attente', vars: { n: attente.length } };
  }
  inscrits.push(userId);
  q.listes.run(JSON.stringify(inscrits), JSON.stringify(attente), e.id);
  return { cle: 'evenement.inscrit' };
}

function desinscrire(e, userId) {
  let inscrits = JSON.parse(e.inscrits);
  let attente = JSON.parse(e.attente);
  let promu = null;
  if (inscrits.includes(userId)) {
    inscrits = inscrits.filter((x) => x !== userId);
    if (attente.length && (!e.places || inscrits.length < e.places)) {
      promu = attente.shift();
      inscrits.push(promu);
    }
  } else if (attente.includes(userId)) {
    attente = attente.filter((x) => x !== userId);
  } else {
    return { cle: 'evenement.pas_inscrit' };
  }
  q.listes.run(JSON.stringify(inscrits), JSON.stringify(attente), e.id);
  return { cle: 'evenement.desinscrit', promu };
}

async function prevenirPromu(client, e, userId) {
  const t = traduction(client.guilds.cache.get(e.guild_id));
  const user = await client.users.fetch(userId).catch(() => null);
  const lien = `https://discord.com/channels/${e.guild_id}/${e.channel_id}/${e.message_id}`;
  await user?.send({ components: [C.conteneur([C.texte(`🎉 ${t('evenement.promu', { titre: escapeMarkdown(e.titre), quand: `<t:${Math.floor(e.debut / 1000)}:R>`, lien })}`)], COULEUR)], flags: MessageFlags.IsComponentsV2 }).catch(() => null);
}

/** Les boutons (prefixe evt_). */
async function gererInteraction(interaction) {
  const t = require('./langues').traducteur(interaction).t;
  const [action, id] = interaction.customId.slice(4).split(':');
  const e = q.lire.get(Number(id));
  if (!e || e.guild_id !== interaction.guildId) return interaction.reply(C.erreurPrivee(t('evenement.introuvable')));
  if (e.statut !== 'ouvert') return interaction.reply(C.erreurPrivee(t('evenement.ferme')));

  if (action === 'annuler') {
    const peut = e.createur === interaction.user.id || interaction.memberPermissions?.has(PermissionFlagsBits.ManageEvents);
    if (!peut) return interaction.reply(C.erreurPrivee(t('evenement.annuler_reserve')));
    q.statut.run('annule', e.id);
    await natif(interaction.client, e, 'supprimer');
    await interaction.update({ components: construire({ ...e, statut: 'annule' }, t).components });
    const inscrits = JSON.parse(e.inscrits);
    if (inscrits.length) {
      await interaction.channel.send({ content: `${t('evenement.annule_annonce', { titre: escapeMarkdown(e.titre) })} ${inscrits.slice(0, 50).map((x) => `<@${x}>`).join(' ')}`, allowedMentions: { users: inscrits.slice(0, 50) } }).catch(() => null);
    }
    return null;
  }

  const r = action === 'in' ? inscrire(e, interaction.user.id) : desinscrire(e, interaction.user.id);
  const maj = q.lire.get(e.id);
  await interaction.update({ components: construire(maj, t).components });
  await interaction.followUp(C.infoPrivee(t(r.cle, r.vars ?? {}))).catch(() => null);
  if (r.promu) await prevenirPromu(interaction.client, maj, r.promu);
  return null;
}

/** Toutes les minutes : rappels a J-15 min et passage a « commence ». */
async function tour(client) {
  const maintenant = Date.now();
  for (const e of q.aSurveiller.all(maintenant + RAPPEL_MS)) {
    const guild = client.guilds.cache.get(e.guild_id);
    if (!guild) continue;
    const t = traduction(guild);
    const salon = guild.channels.cache.get(e.channel_id);
    const inscrits = JSON.parse(e.inscrits);
    const lien = `https://discord.com/channels/${e.guild_id}/${e.channel_id}/${e.message_id}`;

    if (!e.rappel && e.debut > maintenant - 5 * 60_000) {
      q.rappel.run(e.id);
      const quand = `<t:${Math.floor(e.debut / 1000)}:R>`;
      for (const id of inscrits.slice(0, 100)) {
        const user = await client.users.fetch(id).catch(() => null);
        await user?.send({ components: [C.conteneur([C.texte(`⏰ ${t('evenement.rappel_mp', { titre: escapeMarkdown(e.titre), serveur: escapeMarkdown(guild.name), quand, lien })}`)], COULEUR)], flags: MessageFlags.IsComponentsV2 }).catch(() => null);
      }
      if (salon && (inscrits.length || e.role_id)) {
        const mentions = [...(e.role_id ? [`<@&${e.role_id}>`] : []), ...inscrits.slice(0, 50).map((x) => `<@${x}>`)].join(' ');
        await salon.send({
          content: `⏰ ${t('evenement.rappel_salon', { titre: escapeMarkdown(e.titre), quand })}\n${mentions}`,
          allowedMentions: { users: inscrits.slice(0, 50), roles: e.role_id ? [e.role_id] : [] },
        }).catch(() => null);
      }
    }
    if (e.debut <= maintenant) {
      q.statut.run('commence', e.id);
      await majMessage(client, { ...e, statut: 'commence' });
      await natif(client, e, 'demarrer');
      // Evenement recurrent : la prochaine occurrence, avec les memes reglages.
      if (e.repetition && salon) {
        const prochain = suivante(e.debut, e.repetition, e.fuseau);
        if (prochain) {
          await creer(guild, salon, {
            createur: e.createur, titre: e.titre, description: e.description, debut: prochain, places: e.places,
            role: null, repetition: e.repetition, duree: e.duree, fuseau: e.fuseau, natif: Boolean(e.discord_id),
          }, t).catch((err) => logger.avertissement('Evenement recurrent :', err.message));
        }
      }
    }
  }
  // Fin prevue passee : l'evenement Discord natif est marque termine.
  for (const e of q.aTerminer.all(maintenant)) {
    q.statut.run('termine', e.id);
    await natif(client, e, 'terminer');
  }
}

function aVenir(guildId) {
  return q.aVenir.all(guildId);
}

module.exports = { creer, construire, inscrire, desinscrire, gererInteraction, tour, aVenir, lireDate, fuseauValide, suivante, REPETITIONS, q };
