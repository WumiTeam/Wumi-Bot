/**
 * Verification du SERVEUR SUPPORT via une Activite Discord.
 *
 * LE PARCOURS
 *   1. Le membre clique « Se vérifier » sur le panneau (ou lance l'Activite
 *      depuis le lanceur d'applications de Discord).
 *   2. Le bot repond par LAUNCH_ACTIVITY : Discord ouvre la page de
 *      verification (src/public/activite/) DANS Discord, en plein ecran.
 *   3. La page demande l'autorisation « identify » (une seule fois), le
 *      serveur public echange le code contre l'identite REELLE du membre —
 *      impossible de se faire passer pour quelqu'un d'autre.
 *   4. Le membre lit et accepte le reglement, reussit un petit defi, et le
 *      bot lui donne le role. Le tout est trace dans LOG_VERIFICATION.
 *
 * UNIQUEMENT SUR LE SERVEUR SUPPORT : le bouton, l'Activite et le serveur
 * public refusent tout autre serveur.
 *
 * SI L'ACTIVITE N'EST PAS DISPONIBLE (pas encore configuree, appareil trop
 * ancien), un bouton de secours propose un code a recopier dans une fenetre.
 */
const crypto = require('node:crypto');
const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  PermissionFlagsBits,
} = require('discord.js');
const conf = require('../../config');
const C = require('./composants');
const store = require('./supportStore');
const fondateur = require('./fondateur');
const journal = require('./journalSupport');
const logger = require('./logger');
const { banniere } = require('./bannieres');
const { traducteur } = require('./langues');

const tr = (source) => traducteur(source ?? fondateur.serveurSupport());

/** L'Activite est-elle branchee ? (sinon : bouton de secours) */
function activiteActive() {
  return String(process.env.ACTIVITE_ACTIVE ?? '').trim().toLowerCase() === 'true'
    && Boolean(String(process.env.CLIENT_SECRET ?? '').trim());
}

// ------------------------------------------------------------------ PANNEAU
function construirePanneau(guild) {
  const { t, langue } = tr(guild);
  const b = banniere('verification', langue);
  const role = store.lire('verif.role');

  const boutons = [
    new ButtonBuilder().setCustomId('svf_lancer').setStyle(ButtonStyle.Success).setEmoji('✅').setLabel(t('support.verif.bouton')),
  ];
  if (!activiteActive()) {
    boutons[0].setCustomId('svf_secours');
  } else {
    boutons.push(new ButtonBuilder().setCustomId('svf_secours').setStyle(ButtonStyle.Secondary).setEmoji('🛟').setLabel(t('support.verif.bouton_secours')));
  }

  const etapes = [1, 2, 3].map((n) => `**${n}.** ${t(`support.verif.etape${n}`)}`).join('\n');

  const conteneur = C.conteneur([
    b ? C.image(b.url, t('support.verif.alt')) : null,
    C.texte(`# ${t('support.verif.titre')}\n${t('support.verif.intro', { serveur: guild.name })}`),
    C.separateur(),
    C.texte(`### ${t('support.verif.comment')}\n${etapes}`),
    C.separateur(),
    C.texte(role ? t('support.verif.role_donne', { role: `<@&${role}>` }) : `⚠️ ${t('support.verif.role_absent')}`),
    new ActionRowBuilder().addComponents(...boutons),
    C.texte(`-# ${t(activiteActive() ? 'support.verif.pied_activite' : 'support.verif.pied_secours')}`),
  ], 0x58a6ff);

  return C.envoi([conteneur], { files: b ? [b.fichier()] : [] });
}

// ------------------------------------------------------------- CONTROLES
/**
 * Ce qui empeche ce membre de se verifier, en cle de traduction, ou null.
 * Sert au bouton ET au serveur public : une seule regle, un seul endroit.
 */
function obstacle(guild, membre) {
  if (!guild || !fondateur.estSupport(guild.id)) return { cle: 'support.reserve_support' };
  const roleId = store.lire('verif.role');
  const role = roleId ? guild.roles.cache.get(roleId) : null;
  if (!role) return { cle: 'support.verif.role_absent' };
  if (!guild.members.me.permissions.has(PermissionFlagsBits.ManageRoles) || !role.editable) {
    return { cle: 'support.verif.role_trop_haut' };
  }
  if (!membre) return { cle: 'support.verif.pas_membre' };
  if (membre.roles.cache.has(role.id)) return { cle: 'support.verif.deja', deja: true };
  if (fondateur.bloque(membre.id)) return { cle: 'erreur.bloque' };

  const ageMin = store.lireNombre('verif.age_min_jours');
  if (ageMin > 0) {
    const age = (Date.now() - membre.user.createdTimestamp) / 86_400_000;
    if (age < ageMin) return { cle: 'support.verif.compte_recent', variables: { jours: ageMin } };
  }
  return null;
}

/** Donne le role, retire celui des non-verifies, et trace. */
async function valider(guild, membre, methode, details = {}) {
  const role = guild.roles.cache.get(store.lire('verif.role'));
  await membre.roles.add(role, `Vérification réussie (${methode})`);

  const aRetirer = store.lire('verif.retirer_role');
  if (aRetirer && membre.roles.cache.has(aRetirer)) {
    await membre.roles.remove(aRetirer, 'Vérifié').catch(() => null);
  }

  store.q.verifier.run(membre.id, Date.now(), methode);
  logger.action('verification support', membre.user.username, null, methode);

  const ageJours = Math.floor((Date.now() - membre.user.createdTimestamp) / 86_400_000);
  journal.noter('verification', {
    titre: `✅ Membre vérifié · ${membre.user.username}`,
    couleur: conf.couleurs.succes,
    vignette: membre.user.displayAvatarURL(),
    lignes: [
      `**Membre** · ${membre} (\`${membre.id}\`)`,
      `**Méthode** · ${methode === 'activite' ? '🎮 Activité Discord' : '🛟 Code de secours'}`,
      `**Compte créé** · <t:${Math.floor(membre.user.createdTimestamp / 1000)}:R>${ageJours < 7 ? ' ⚠️ _compte très récent_' : ''}`,
      `**Arrivé sur le serveur** · ${membre.joinedTimestamp ? `<t:${Math.floor(membre.joinedTimestamp / 1000)}:R>` : '?'}`,
      details.duree ? `**Temps mis** · ${(details.duree / 1000).toFixed(1)} s` : null,
      details.essais > 1 ? `**Essais** · ${details.essais}` : null,
    ],
  });
  return role;
}

/** Trace un refus (compte trop recent, liste noire...) — utile pour reperer un raid. */
function refus(membre, cle, methode) {
  if (!membre || cle === 'support.verif.deja') return;
  journal.noter('verification', {
    titre: `⛔ Vérification refusée · ${membre.user?.username ?? membre.id}`,
    couleur: conf.couleurs.avertissement,
    vignette: membre.user?.displayAvatarURL?.() ?? null,
    lignes: [
      `**Membre** · <@${membre.id}> (\`${membre.id}\`)`,
      `**Motif** · \`${cle}\``,
      `**Méthode** · ${methode}`,
    ],
  });
}

// ------------------------------------------------------- LANCER L'ACTIVITE
/** Bouton du panneau OU commande d'entree de l'Activite. */
async function lancer(interaction) {
  const { t } = tr(interaction.guild);
  const souci = obstacle(interaction.guild, interaction.member);
  if (souci) {
    if (!souci.deja) refus(interaction.member, souci.cle, 'bouton');
    return interaction.reply(C[souci.deja ? 'infoPrivee' : 'erreurPrivee'](t(souci.cle, souci.variables)));
  }
  if (!activiteActive()) return demanderCode(interaction);

  try {
    await interaction.launchActivity();
  } catch (e) {
    // 50234 : l'application n'a pas les Activites activees. Le reste : appareil
    // trop ancien, salon ou l'Activite ne peut pas s'ouvrir...
    logger.avertissement('Lancement de l\'Activité de vérification :', e.message);
    if (interaction.replied || interaction.deferred) return null;
    return interaction.reply(C.avertissementPrivee(t('support.verif.lancement_impossible'), {
      elements: [new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('svf_secours').setStyle(ButtonStyle.Secondary).setEmoji('🛟').setLabel(t('support.verif.bouton_secours'))
      )],
    }));
  }
  return null;
}

// ------------------------------------------------------------------ SECOURS
const codes = new Map(); // userId -> { code, expire, essais }
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sans 0/O ni 1/I

function demanderCode(interaction) {
  const { t } = tr(interaction.guild);
  const code = Array.from({ length: 5 }, () => ALPHABET[crypto.randomInt(ALPHABET.length)]).join('');
  const avant = codes.get(interaction.user.id);
  codes.set(interaction.user.id, { code, expire: Date.now() + 5 * 60_000, essais: (avant?.essais ?? 0), debut: Date.now() });

  const modal = new ModalBuilder()
    .setCustomId('svf_code')
    .setTitle(t('support.verif.secours_titre').slice(0, 45))
    .addComponents(new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('code')
        // Le code est dans le LIBELLE : une fenetre Discord ne peut rien
        // afficher d'autre au-dessus du champ.
        .setLabel(t('support.verif.secours_label', { code: code.split('').join(' ') }).slice(0, 45))
        .setPlaceholder(t('support.verif.secours_aide'))
        .setStyle(TextInputStyle.Short)
        .setMinLength(5)
        .setMaxLength(9)
        .setRequired(true)
    ));
  return interaction.showModal(modal);
}

async function verifierCode(interaction) {
  const { t } = tr(interaction.guild);
  const attendu = codes.get(interaction.user.id);
  const saisi = interaction.fields.getTextInputValue('code').replace(/\s+/g, '').toUpperCase();

  if (!attendu || attendu.expire < Date.now()) {
    codes.delete(interaction.user.id);
    return interaction.reply(C.avertissementPrivee(t('support.verif.secours_expire')));
  }
  attendu.essais++;
  if (saisi !== attendu.code) {
    if (attendu.essais >= 5) {
      codes.delete(interaction.user.id);
      refus(interaction.member, 'support.verif.trop_essais', 'secours');
    }
    return interaction.reply(C.erreurPrivee(t('support.verif.secours_faux')));
  }
  codes.delete(interaction.user.id);

  const souci = obstacle(interaction.guild, interaction.member);
  if (souci) return interaction.reply(C.erreurPrivee(t(souci.cle, souci.variables)));
  const role = await valider(interaction.guild, interaction.member, 'secours', {
    essais: attendu.essais,
    duree: Date.now() - attendu.debut,
  });
  return interaction.reply(C.succesPrive(t('support.verif.reussi', { role: `${role}` })));
}

// ------------------------------------------------ SESSIONS DE L'ACTIVITE
/**
 * Une session = un membre authentifie par Discord, qui a recu un defi.
 * Tout reste en memoire et expire en 10 minutes : rien a nettoyer en base.
 */
const sessions = new Map(); // jeton -> { userId, defi, cree, essais }
const EMOJIS = ['🦊', '🐼', '🐙', '🦄', '🐸', '🐧', '🦋', '🐢', '🐝', '🦉', '🐬', '🦁'];
const SESSION_MS = 10 * 60_000;
const DELAI_MIN_MS = 1500; // un humain ne lit pas le reglement en 0,2 s

function nouveauDefi() {
  const melange = [...EMOJIS];
  for (let i = melange.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [melange[i], melange[j]] = [melange[j], melange[i]];
  }
  const choix = melange.slice(0, 6);
  const cible = choix[crypto.randomInt(choix.length)];
  return { choix, cible, donneLe: Date.now() };
}

function creerSession(userId) {
  // Un membre = une session : relancer l'Activite remplace l'ancienne.
  for (const [jeton, s] of sessions) if (s.userId === userId) sessions.delete(jeton);
  const jeton = crypto.randomBytes(24).toString('base64url');
  const session = { userId, defi: nouveauDefi(), cree: Date.now(), essais: 0 };
  sessions.set(jeton, session);
  return { jeton, session };
}

function lireSession(jeton) {
  const s = sessions.get(String(jeton ?? ''));
  if (!s) return null;
  if (Date.now() - s.cree > SESSION_MS) {
    sessions.delete(jeton);
    return null;
  }
  return s;
}

const menage = setInterval(() => {
  const limite = Date.now() - SESSION_MS;
  for (const [j, s] of sessions) if (s.cree < limite) sessions.delete(j);
  for (const [u, c] of codes) if (c.expire < Date.now()) codes.delete(u);
}, 60_000);
menage.unref?.();

/** Les textes que la page de l'Activite affiche, dans la langue du support. */
function textesActivite(guild) {
  const { t } = tr(guild);
  const cles = [
    'titre', 'sous_titre', 'regles_titre', 'regles_accepter', 'defi_titre', 'defi_texte',
    'continuer', 'valider', 'reussi_titre', 'reussi_texte', 'fermer', 'erreur_titre', 'reessayer', 'chargement',
  ];
  const sortie = {};
  for (const c of cles) sortie[c] = t(`support.verif.activite.${c}`);
  sortie.regles = [1, 2, 3, 4, 5].map((n) => t(`support.verif.activite.regle${n}`));
  sortie.serveur = guild?.name ?? 'Wumi';
  return sortie;
}

/**
 * Le membre repond au defi depuis l'Activite.
 * @returns {Promise<{ ok: boolean, cle?: string, message?: string, nouveauDefi?: object }>}
 */
async function repondre(client, jeton, { choix, regles }) {
  const support = fondateur.serveurSupport();
  const guild = support ? client.guilds.cache.get(support) : null;
  const { t } = tr(guild);
  const session = lireSession(jeton);
  if (!session) return { ok: false, message: t('support.verif.session_expiree') };
  if (!regles) return { ok: false, message: t('support.verif.regles_requises') };

  const membre = guild ? await guild.members.fetch(session.userId).catch(() => null) : null;
  const souci = obstacle(guild, membre);
  if (souci) {
    if (!souci.deja) refus(membre, souci.cle, 'activité');
    return { ok: souci.deja === true, deja: souci.deja === true, message: t(souci.cle, souci.variables) };
  }

  session.essais++;
  const trop = Date.now() - session.defi.donneLe < DELAI_MIN_MS;
  if (trop || choix !== session.defi.cible) {
    if (session.essais >= 5) {
      sessions.delete(jeton);
      refus(membre, 'support.verif.trop_essais', 'activité');
      return { ok: false, message: t('support.verif.trop_essais') };
    }
    session.defi = nouveauDefi();
    return { ok: false, message: t('support.verif.defi_rate'), defi: { choix: session.defi.choix, cible: session.defi.cible } };
  }

  sessions.delete(jeton);
  const role = await valider(guild, membre, 'activite', { essais: session.essais, duree: Date.now() - session.cree });
  return { ok: true, message: t('support.verif.reussi_activite', { role: role.name }) };
}

// -------------------------------------------------------------------- ROUTAGE
async function gererInteraction(interaction) {
  const { t } = tr(interaction.guild);
  try {
    if (!interaction.guild || !fondateur.estSupport(interaction.guild.id)) {
      return interaction.reply(C.erreurPrivee(t('support.reserve_support')));
    }
    if (interaction.isButton() && interaction.customId === 'svf_lancer') return await lancer(interaction);
    if (interaction.isButton() && interaction.customId === 'svf_secours') {
      const souci = obstacle(interaction.guild, interaction.member);
      if (souci) return interaction.reply(C[souci.deja ? 'infoPrivee' : 'erreurPrivee'](t(souci.cle, souci.variables)));
      return demanderCode(interaction);
    }
    if (interaction.isModalSubmit() && interaction.customId === 'svf_code') return await verifierCode(interaction);
  } catch (e) {
    logger.erreur(`Vérification support (${interaction.customId}) :`, e);
    const r = C.erreurPrivee(t('support.verif.erreur'));
    if (interaction.replied || interaction.deferred) await interaction.followUp(r).catch(() => null);
    else await interaction.reply(r).catch(() => null);
  }
  return null;
}

/** La commande d'entree de l'Activite (lanceur d'applications de Discord). */
async function gererEntree(interaction) {
  const { t } = tr(interaction.guild);
  // Hors du serveur support, l'Activite Wumi ouvre le jeu Astro Run.
  if (!interaction.guild || !fondateur.estSupport(interaction.guild.id)) {
    return require('./astroLancer').lancer(interaction);
  }
  return lancer(interaction);
}

function statistiques() {
  const s = store.q.statsVerif.get(Date.now() - 7 * 86_400_000) ?? {};
  return { total: s.total ?? 0, activite: s.activite ?? 0, semaine: s.semaine ?? 0, sessions: sessions.size };
}

module.exports = {
  activiteActive,
  construirePanneau,
  obstacle,
  valider,
  lancer,
  creerSession,
  lireSession,
  textesActivite,
  repondre,
  gererInteraction,
  gererEntree,
  statistiques,
};
