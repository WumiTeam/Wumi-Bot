/**
 * Les concours.
 *
 * On participe en cliquant sur un bouton : pas de reaction a poser, donc rien
 * a nettoyer, et la participation survit a un membre qui retire sa reaction
 * sans faire expres.
 *
 * CE QUI SURVIT A UN REDEMARRAGE
 * Un concours n'est pas une minuterie en memoire : c'est une ligne en base
 * avec une date de fin. Le bot balaye les concours echus toutes les vingt
 * secondes. Si le bot tombe pendant trois heures, les concours qui devaient
 * se terminer pendant ce temps se terminent au redemarrage — en retard, mais
 * ils se terminent.
 *
 * CHANCES BONUS (Wumi 2.13)
 * Un role bonus (et/ou les boosters du serveur) donne N tickets au lieu d'un.
 * Le poids est fixe au moment ou le membre participe, et affiche dans sa
 * reponse. Le tirage reste SANS REMISE : un membre a plus de chances d'etre
 * tire, jamais deux fois. Methode d'Efraimidis-Spirakis : chaque participant
 * recoit la cle u^(1/poids), on garde les plus grandes. C'est exactement un
 * tirage pondere sans remise, en une passe.
 *
 * L'annonce est en Components V2 avec la banniere « Concours ». Les concours
 * lances avant la 2.13 (anciens embeds) se terminent toujours dans leur format.
 */
const { EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, MessageFlags } = require('discord.js');
const conf = require('../../config');
const C = require('./composants');
const { db, req } = require('../database/db');
const { E } = require('./emojis');
const { banniere } = require('./bannieres');
const { traducteur } = require('./langues');
const logger = require('./logger');

const BALAYAGE_MS = 20_000;
let minuterie = null;

const q = {
  participer: db.prepare('INSERT OR IGNORE INTO giveaway_participants (giveaway_id, user_id, date, poids) VALUES (?, ?, ?, ?)'),
  participants: db.prepare('SELECT user_id, poids FROM giveaway_participants WHERE giveaway_id = ?'),
  tickets: db.prepare('SELECT COALESCE(SUM(poids), 0) AS n FROM giveaway_participants WHERE giveaway_id = ?'),
};

const quand = (ms, style = 'R') => `<t:${Math.floor(ms / 1000)}:${style}>`;

/** Le nombre de tickets d'un membre pour ce concours. */
function poidsDe(ligne, membre) {
  let poids = 1;
  const bonus = Math.max(2, ligne.bonus ?? 2);
  if (ligne.bonus_role && membre?.roles?.cache?.has(ligne.bonus_role)) poids = Math.max(poids, bonus);
  if (ligne.bonus_boosters && membre?.premiumSince) poids = Math.max(poids, bonus);
  return poids;
}

/** Les conditions et bonus, en lignes lisibles. */
function lignesRegles(ligne, t) {
  return [
    ligne.role_requis ? `🔒 ${t('giveaway.v2.cond_role', { role: `<@&${ligne.role_requis}>` })}` : null,
    ligne.niveau_min > 0 ? `📈 ${t('giveaway.v2.cond_niveau', { n: ligne.niveau_min })}` : null,
    ligne.bonus_role ? `🍀 ${t('giveaway.v2.bonus_role', { role: `<@&${ligne.bonus_role}>`, x: ligne.bonus })}` : null,
    ligne.bonus_boosters ? `💎 ${t('giveaway.v2.bonus_boosters', { x: ligne.bonus })}` : null,
  ].filter(Boolean);
}

/**
 * Le message d'un concours (Components V2).
 * @param {object} etat { ferme, statut, gagnants }
 */
function messageConcours(ligne, { ferme = false, statut = 'encours', gagnants = [] } = {}) {
  const { t, langue, nombre } = traducteur(ligne.guild_id);
  const participants = req.compterParticipants.get(ligne.id).n;
  const tickets = q.tickets.get(ligne.id).n;
  const b = banniere('giveaway', langue);
  const regles = lignesRegles(ligne, t);

  let etat;
  if (statut === 'annule') etat = `❌ ${t('giveaway.v2.annule')}`;
  else if (ferme) {
    etat = gagnants.length
      ? `🎉 **${t('giveaway.v2.gagnants', { n: gagnants.length })}** · ${gagnants.map((g) => `<@${g}>`).join(', ')}`
      : `⏳ ${t('giveaway.v2.personne')}`;
  } else {
    etat = t('giveaway.v2.fin', { quand: quand(ligne.fin), date: quand(ligne.fin, 'f') });
  }

  const conteneur = C.conteneur([
    b ? C.image(b.url) : null,
    C.texte(`# ${E('cadeau')} ${ligne.lot}\n${etat}`),
    C.separateur(),
    C.texte([
      `🏆 **${t('giveaway.v2.nb_gagnants')}** · ${nombre(ligne.gagnants)}`,
      `👥 **${t('giveaway.v2.participants')}** · ${nombre(participants)}${tickets > participants ? ` · ${t('giveaway.v2.tickets', { n: nombre(tickets) })}` : ''}`,
      `🎙️ **${t('giveaway.v2.organise')}** · <@${ligne.organise_par}>`,
    ].join('\n')),
    regles.length ? C.texte(regles.join('\n')) : null,
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`gw_join_${ligne.id}`)
        .setLabel(ferme ? t('giveaway.v2.bouton_termine') : t('giveaway.v2.bouton_participer'))
        .setEmoji(E('cadeau'))
        .setStyle(ferme ? ButtonStyle.Secondary : ButtonStyle.Success)
        .setDisabled(ferme)
    ),
    C.texte(`-# ${t('giveaway.v2.pied', { n: ligne.id })}`),
  ], statut === 'annule' ? conf.couleurs.erreur : ferme ? conf.couleurs.succes : conf.couleurs.principale);
  return { composants: [conteneur], fichiers: b ? [b.fichier()] : [] };
}

// --------------------------------------------------- ANCIEN FORMAT (< 2.13)
function embedConcours(ligne) {
  const participants = req.compterParticipants.get(ligne.id).n;
  return new EmbedBuilder()
    .setColor(conf.couleurs.principale)
    .setTitle(`${E('cadeau')} ${ligne.lot}`)
    .setDescription(`**${ligne.gagnants}** · ${quand(ligne.fin)}`)
    .addFields({ name: '👥', value: `**${participants}**`, inline: true })
    .setFooter({ text: `#${ligne.id}` });
}
function boutonConcours(ligne, ferme = false) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`gw_join_${ligne.id}`).setEmoji(E('cadeau'))
      .setLabel(ferme ? '—' : '🎉').setStyle(ferme ? ButtonStyle.Secondary : ButtonStyle.Success).setDisabled(ferme)
  );
}

/** Met a jour le message public, quel que soit son format. */
async function rafraichirMessage(message, ligne, etat = {}) {
  if (message.flags?.has?.(MessageFlags.IsComponentsV2)) {
    const m = messageConcours(ligne, etat);
    return message.edit({ components: m.composants, flags: MessageFlags.IsComponentsV2 });
  }
  const { t } = traducteur(ligne.guild_id);
  const embed = embedConcours(ligne);
  if (etat.ferme) {
    embed.setColor(etat.statut === 'annule' ? conf.couleurs.erreur : conf.couleurs.succes)
      .setDescription(etat.statut === 'annule' ? t('giveaway.v2.annule')
        : etat.gagnants?.length ? etat.gagnants.map((g) => `<@${g}>`).join(', ') : t('giveaway.v2.personne'));
  }
  return message.edit({ embeds: [embed], components: [boutonConcours(ligne, Boolean(etat.ferme))] });
}

/**
 * Le membre a-t-il le droit de participer ?
 * @returns {{ok: boolean, raison?: string}}
 */
function peutParticiper(ligne, membre) {
  const { t } = traducteur(ligne.guild_id);
  if (ligne.role_requis && !membre.roles?.cache?.has(ligne.role_requis)) {
    return { ok: false, raison: t('giveaway.v2.refus_role', { role: `<@&${ligne.role_requis}>` }) };
  }
  if (ligne.niveau_min > 0) {
    const xp = req.getXp.get(ligne.guild_id, membre.id);
    const niveau = require('./niveaux').infosNiveau(xp?.xp ?? 0).niveau;
    if (niveau < ligne.niveau_min) {
      return { ok: false, raison: t('giveaway.v2.refus_niveau', { n: ligne.niveau_min, actuel: niveau }) };
    }
  }
  return { ok: true };
}

/**
 * Tirage pondere sans remise.
 * @param {{user_id: string, poids: number}[]} liste
 * @param {() => number} [hasard] pour les tests
 */
function tirerPondere(liste, combien, hasard = Math.random) {
  return liste
    .map((p) => ({ id: p.user_id, cle: hasard() ** (1 / Math.max(1, p.poids ?? 1)) }))
    .sort((a, b) => b.cle - a.cle)
    .slice(0, Math.min(combien, liste.length))
    .map((p) => p.id);
}

function tirer(giveawayId, combien) {
  return tirerPondere(q.participants.all(giveawayId), combien);
}

/**
 * Termine un concours : tire, annonce, ferme le bouton.
 * @param {string} [statut] 'termine' ou 'annule'
 */
async function terminer(client, ligne, { statut = 'termine', relance = false } = {}) {
  const guild = client.guilds.cache.get(ligne.guild_id);
  const salon = guild?.channels?.cache?.get(ligne.channel_id);
  const { t } = traducteur(ligne.guild_id);

  const gagnants = statut === 'annule' ? [] : tirer(ligne.id, ligne.gagnants);
  req.cloreGiveaway.run(relance ? 'termine' : statut, gagnants.join(',') || null, ligne.id);

  if (!salon) return gagnants;

  if (ligne.message_id) {
    const message = await salon.messages.fetch(ligne.message_id).catch(() => null);
    if (message) await rafraichirMessage(message, ligne, { ferme: true, statut, gagnants }).catch(() => null);
  }

  if (statut === 'annule') return gagnants;

  const annonce = gagnants.length
    ? `🎉 ${t(relance ? 'giveaway.v2.annonce_relance' : 'giveaway.v2.annonce', { gagnants: gagnants.map((g) => `<@${g}>`).join(', '), lot: ligne.lot, n: gagnants.length })}`
    : `⏳ ${t('giveaway.v2.annonce_personne', { lot: ligne.lot })}`;

  await salon
    .send({
      content: annonce,
      reply: ligne.message_id ? { messageReference: ligne.message_id, failIfNotExists: false } : undefined,
      allowedMentions: { users: gagnants },
    })
    .catch(() => null);

  // Chaque gagnant recoit un MP : un lot non reclame est souvent un lot rate.
  for (const id of gagnants) {
    const u = await client.users.fetch(id).catch(() => null);
    await u?.send(C.envoi([C.conteneur([
      C.texte(`## 🎉 ${t('giveaway.v2.mp_titre')}\n${t('giveaway.v2.mp_texte', { lot: ligne.lot, serveur: guild.name })}`),
      ligne.message_id ? new ActionRowBuilder().addComponents(
        new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel(t('giveaway.v2.mp_voir')).setURL(`https://discord.com/channels/${ligne.guild_id}/${ligne.channel_id}/${ligne.message_id}`)
      ) : null,
    ], conf.couleurs.succes)])).catch(() => null);
  }

  return gagnants;
}

/** Balaye les concours echus. Appele toutes les vingt secondes. */
async function verifier(client) {
  let dus;
  try {
    dus = req.giveawaysDus.all(Date.now());
  } catch (e) {
    return logger.avertissement('Concours :', e.message);
  }
  for (const ligne of dus) {
    try {
      const gagnants = await terminer(client, ligne);
      logger.info(`Concours #${ligne.id} termine — ${gagnants.length} gagnant(s).`);
    } catch (e) {
      logger.erreur(`Concours #${ligne.id} :`, e.message);
      req.cloreGiveaway.run('termine', null, ligne.id);
    }
  }
}

function demarrer(client) {
  minuterie = setInterval(() => verifier(client).catch(() => null), BALAYAGE_MS);
  setTimeout(() => verifier(client).catch(() => null), 5_000);
}

function arreter() {
  if (minuterie) clearInterval(minuterie);
  minuterie = null;
}

// Le compteur du message public se met a jour au plus toutes les 3 s par
// concours : un concours populaire ne doit pas spammer l'API.
const majEnAttente = new Map();
function planifierMaj(message, ligne) {
  if (majEnAttente.has(ligne.id)) return;
  majEnAttente.set(ligne.id, setTimeout(() => {
    majEnAttente.delete(ligne.id);
    const neuf = req.giveaway.get(ligne.id);
    if (neuf?.statut === 'encours') rafraichirMessage(message, neuf).catch(() => null);
  }, 3000));
}

/** Le bouton « Participer ». Route via le prefixe « gw_ ». */
async function gererInteraction(interaction) {
  const id = Number(interaction.customId.split('_').pop());
  const ligne = req.giveaway.get(id);
  const { t } = traducteur(interaction);

  if (!ligne || ligne.statut !== 'encours' || ligne.fin <= Date.now()) {
    return interaction.reply(C.avertissementPrivee(t('giveaway.v2.deja_fini')));
  }

  // Un deuxieme clic retire la participation.
  if (req.participe.get(id, interaction.user.id)) {
    req.quitterGiveaway.run(id, interaction.user.id);
    await interaction.reply(C.infoPrivee(t('giveaway.v2.quitte')));
    planifierMaj(interaction.message, ligne);
    return null;
  }

  const droit = peutParticiper(ligne, interaction.member);
  if (!droit.ok) return interaction.reply(C.erreurPrivee(droit.raison));

  const poids = poidsDe(ligne, interaction.member);
  q.participer.run(id, interaction.user.id, Date.now(), poids);
  await interaction.reply(C.succesPrive(
    t('giveaway.v2.inscrit', { lot: ligne.lot })
    + (poids > 1 ? `\n🍀 ${t('giveaway.v2.inscrit_bonus', { x: poids })}` : '')
  ));
  planifierMaj(interaction.message, ligne);
  return null;
}

module.exports = {
  messageConcours,
  embedConcours,
  boutonConcours,
  peutParticiper,
  poidsDe,
  tirer,
  tirerPondere,
  terminer,
  verifier,
  demarrer,
  arreter,
  gererInteraction,
  BALAYAGE_MS,
};
