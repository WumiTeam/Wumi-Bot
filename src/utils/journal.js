/**
 * Les fiches du JOURNAL du serveur (arrivees, departs, messages, roles,
 * salons, bans, vocal), traduites dans la langue du serveur (Wumi 2.14).
 *
 * Avant, chaque evenement ecrivait son embed a la main, en francais en dur :
 * un serveur anglais recevait « Membre mis a jour — Roles ajoutes ». Ici, une
 * seule forme de fiche, et tous les textes passent par les fichiers de langue.
 *
 * L'envoi passe toujours par logs.envoyerLog (salon de la categorie, mise en
 * Components V2, repli en embed si Discord refuse).
 */
const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { envoyerLog } = require('./logs');
const { traducteur } = require('./langues');

/**
 * Qui a fait l'action ? Le journal d'audit, si Wumi peut le lire.
 * @param {(e: object) => boolean} [filtre] critere en plus de la cible
 */
async function executeur(guild, type, cibleId, filtre = () => true) {
  try {
    const logs = await guild.fetchAuditLogs({ type, limit: 5 });
    const entree = logs.entries.find((e) => (!cibleId || e.target?.id === cibleId) && Date.now() - e.createdTimestamp < 10_000 && filtre(e));
    return entree ? { user: entree.executor, raison: entree.reason ?? null } : null;
  } catch {
    return null; // permission « Voir les logs du serveur » manquante
  }
}

/** Raccourci : le traducteur du serveur. */
const tj = (guild) => traducteur(guild);

/**
 * Envoie une fiche.
 * @param {object} f
 * @param {string} f.titre      deja traduit, emoji compris
 * @param {number} f.couleur
 * @param {string} [f.vignette] avatar ou icone
 * @param {string} [f.texte]    ligne(s) sous le titre
 * @param {{nom: string, valeur: string, court?: boolean}[]} [f.champs]
 * @param {{label: string, url: string}[]} [f.liens] boutons lien sous la fiche
 * @param {string} [f.pied]
 */
function fiche(guild, categorie, f) {
  const embed = {
    color: f.couleur,
    title: f.titre,
    description: f.texte ?? undefined,
    thumbnail: f.vignette ? { url: f.vignette } : undefined,
    fields: (f.champs ?? []).filter((c) => c && c.valeur).map((c) => ({ name: c.nom, value: String(c.valeur).slice(0, 1024), inline: Boolean(c.court) })),
    footer: f.pied ? { text: f.pied } : undefined,
    timestamp: new Date().toISOString(),
  };
  const liens = (f.liens ?? []).filter((l) => l?.url);
  const components = liens.length
    ? [new ActionRowBuilder().addComponents(liens.slice(0, 5).map((l) => new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel(l.label).setURL(l.url)))]
    : [];
  return envoyerLog(guild, categorie, embed, components.length ? { components } : {});
}

/** Le bouton « Profil » d'un membre. */
function lienProfil(guild, userId) {
  return { label: tj(guild).t('journal.profil'), url: `https://discord.com/users/${userId}` };
}

module.exports = { executeur, fiche, lienProfil, tj };
