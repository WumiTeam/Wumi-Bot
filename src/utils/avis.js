/**
 * Les AVIS (2.40) : /avis ecrire, puis moderation a la main, puis affichage
 * sur wumi.fr (route publique /api/avis).
 *
 * RIEN N'EST PUBLIE TOUT SEUL. Un avis arrive en « attente » et part dans le
 * salon LOG_AVIS du serveur support (repli : LOG_DEFAUT, puis MP aux
 * fondateurs) avec trois boutons : Publier, Masquer, Supprimer. Seul un
 * fondateur peut cliquer. Ce qui s'affiche sur le site, ce sont donc de vrais
 * avis de vrais utilisateurs, choisis, jamais ecrits par nous.
 *
 * Identifiants de composants : « avis_<action>:<userId> ».
 */
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, Routes, MessageFlags } = require('discord.js');
const conf = require('../../config');
const C = require('./composants');
const { req, db } = require('../database/db');

// 2.41.1 : l'avis publie est aussi poste dans un salon du serveur support
// (AVIS_SALON_ID, par defaut le salon des avis de Wumi). On garde le message
// pour le retirer si l'avis est masque, supprime ou reecrit.
db.exec(`CREATE TABLE IF NOT EXISTS avis_messages (
  user_id TEXT PRIMARY KEY,
  salon   TEXT NOT NULL,
  message TEXT NOT NULL
)`);
const qm = {
  lire: db.prepare('SELECT * FROM avis_messages WHERE user_id = ?'),
  ecrire: db.prepare('INSERT INTO avis_messages (user_id, salon, message) VALUES (?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET salon = excluded.salon, message = excluded.message'),
  effacer: db.prepare('DELETE FROM avis_messages WHERE user_id = ?'),
};
const SALON_PUBLIC = () => {
  if (require('../edition').actif) return process.env.AVIS_SALON_ID || null;
  return process.env.AVIS_SALON_ID || '1561112714804199526';
};
const fondateur = require('./fondateur');
const journal = require('./journalSupport');
const logger = require('./logger');

const etoiles = (n) => '★'.repeat(n) + '☆'.repeat(5 - n);

function avatarDe(user) {
  return user.displayAvatarURL?.({ extension: 'png', size: 128 }) ?? null;
}

/** La carte de moderation (en francais : elle ne sert qu'aux fondateurs). */
function carteModeration(avis, statut = avis.statut) {
  const libelle = { attente: '🕓 En attente', publie: '✅ Publié sur wumi.fr', masque: '🙈 Masqué' }[statut] ?? statut;
  const carte = journal.carte({
    titre: `⭐ Avis de ${avis.nom}`,
    lignes: [`**${etoiles(avis.note)}** · ${avis.langue.toUpperCase()}`, `>>> ${avis.texte}`],
    vignette: avis.avatar ?? null,
    pied: `${libelle} · <@${avis.user_id}>`,
    couleur: statut === 'publie' ? conf.couleurs.succes : statut === 'masque' ? 0x80869c : conf.couleurs.principale,
  });
  const rangee = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`avis_pub:${avis.user_id}`).setStyle(ButtonStyle.Success).setLabel('Publier').setDisabled(statut === 'publie'),
    new ButtonBuilder().setCustomId(`avis_mas:${avis.user_id}`).setStyle(ButtonStyle.Secondary).setLabel('Masquer').setDisabled(statut === 'masque'),
    new ButtonBuilder().setCustomId(`avis_sup:${avis.user_id}`).setStyle(ButtonStyle.Danger).setLabel('Supprimer'),
  );
  return [carte, rangee];
}

/** Le message public d'un avis (en anglais et en francais : le support est mixte). */
function messagePublic(avis) {
  const corps = `### ${etoiles(avis.note)}\n${String(avis.texte).split('\n').map((l) => `> ${l}`).join('\n')}\n`;
  const qui = `**${avis.nom}** · <@${avis.user_id}>`;
  return C.envoi([C.conteneur([
    avis.avatar ? C.sectionVignette(`${corps}\n${qui}`, avis.avatar) : C.texte(`${corps}\n${qui}`),
    C.separateur(),
    C.texte('-# ⭐ `/review write` · `/avis ecrire` — wumi.fr'),
  ], conf.couleurs.principale)], { allowedMentions: { parse: [] } });
}

/** Poste (ou met a jour) l'avis dans le salon public. */
async function afficher(client, avis) {
  const salonId = SALON_PUBLIC();
  if (!salonId) return;
  const avant = qm.lire.get(avis.user_id);
  try {
    if (avant) {
      await client.rest.patch(Routes.channelMessage(avant.salon, avant.message), { body: { components: messagePublic(avis).components.map((c) => c.toJSON?.() ?? c) } });
      return;
    }
  } catch { /* message efface a la main : on reposte */ }
  try {
    const salon = await client.channels.fetch(salonId);
    const m = await salon.send(messagePublic(avis));
    qm.ecrire.run(avis.user_id, salon.id, m.id);
  } catch (e) {
    logger.avertissement('Avis : publication dans le salon impossible :', e.message);
  }
}

/** Retire l'avis du salon public, s'il y est. */
async function retirer(client, userId) {
  const avant = qm.lire.get(userId);
  if (!avant) return;
  qm.effacer.run(userId);
  await client.rest.delete(Routes.channelMessage(avant.salon, avant.message)).catch(() => null);
}

/** Enregistre un avis et le soumet a la moderation. */
async function deposer(client, user, note, texte, langue) {
  const avis = {
    user_id: user.id,
    nom: (user.globalName || user.username || '?').slice(0, 40),
    avatar: avatarDe(user),
    note: Math.max(1, Math.min(5, Math.round(note))),
    texte: String(texte).replace(/\s+/g, ' ').trim().slice(0, 300),
    langue: langue === 'fr' ? 'fr' : 'en',
    date: Date.now(),
  };
  req.ecrireAvis.run(avis);
  invaliderCache();
  // Un avis reecrit repasse en attente : l'ancien quitte le salon public.
  await retirer(client, user.id);
  const message = carteModeration({ ...avis, statut: 'attente' });
  const parti = await journal.envoyer('avis', message);
  if (!parti) {
    // Aucun salon de logs : les fondateurs le recoivent en MP.
    for (const id of fondateur.fondateurs()) {
      try {
        const salon = await client.rest.post(Routes.userChannels(), { body: { recipient_id: id } });
        await client.rest.post(Routes.channelMessages(salon.id), {
          body: { components: message.map((c) => c.toJSON()), flags: MessageFlags.IsComponentsV2, allowed_mentions: { parse: [] } },
        });
      } catch (e) {
        logger.avertissement('Avis : MP au fondateur impossible :', e.message);
      }
    }
  }
  return avis;
}

/** Boutons de moderation (fondateurs seulement). */
async function gererInteraction(interaction) {
  const [action, userId] = interaction.customId.replace(/^avis_/, '').split(':');
  if (!fondateur.estFondateur(interaction.user.id)) {
    return interaction.reply(C.erreurPrivee('Réservé aux fondateurs de Wumi.'));
  }
  const avis = req.lireAvis.get(userId);
  if (!avis) return interaction.update(C.envoi([C.conteneur([C.texte('-# Cet avis a été supprimé.')], 0x80869c)]));
  if (action === 'sup') {
    req.supprimerAvis.run(userId);
    invaliderCache();
    await retirer(interaction.client, userId);
    return interaction.update(C.envoi([C.conteneur([C.texte(`-# 🗑️ Avis de ${avis.nom} supprimé par ${interaction.user.username}.`)], 0x80869c)]));
  }
  const statut = action === 'pub' ? 'publie' : 'masque';
  req.statutAvis.run(statut, userId);
  invaliderCache();
  await interaction.update(C.envoi(carteModeration({ ...avis, statut })));
  if (statut === 'publie') await afficher(interaction.client, { ...avis, statut });
  else await retirer(interaction.client, userId);
  return null;
}

// ------------------------------------------------------------ ROUTE PUBLIQUE
let cache = null;
function invaliderCache() { cache = null; }

/** Le corps de /api/avis : moyenne, nombre, et les avis publies. */
function publics() {
  if (cache && Date.now() - cache.date < 300_000) return cache.corps;
  const { n, moyenne } = req.moyenneAvis.get();
  const corps = JSON.stringify({
    nombre: n,
    moyenne: n ? Math.round(moyenne * 10) / 10 : null,
    avis: req.avisPublies.all().map((a) => ({ nom: a.nom, avatar: a.avatar, note: a.note, texte: a.texte, langue: a.langue, date: a.date })),
  });
  cache = { date: Date.now(), corps };
  return corps;
}

module.exports = { deposer, gererInteraction, publics, etoiles, carteModeration, retirer, afficher };
