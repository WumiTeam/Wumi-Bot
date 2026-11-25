/**
 * LES JEUX MUSICAUX (Wumi 2.37) : trois jeux pour le vocal, a cote du blind test.
 *
 *  - QUIZ MUSICAL : un extrait, 4 titres en boutons. Tout le monde repond
 *    (une seule fois), et plus on trouve vite, plus on marque (1000 -> 300).
 *    Une serie de bonnes reponses ajoute un bonus. Solo possible.
 *  - QUI L'A CHOISIE ? : chacun propose 1 a 3 titres en secret (fenetre).
 *    Chaque titre passe 30 s, et chacun devine qui l'a mis (menu). Bonne
 *    reponse : +1. Personne n'a trouve ? Le malin qui l'a choisi gagne +2.
 *  - VIBE CHECK : chacun note le titre de 1 a 10 en secret. Plus ta note est
 *    proche de la moyenne, plus tu marques (10 - ecart). L'avis le plus loin
 *    de tout le monde decroche le titre de « hot take » de la manche.
 *
 * Une seule partie (blind test compris) par serveur. Le lecteur passe en
 * « mode jeu » pendant la partie, comme pour le blind test : pas de panneau,
 * commandes de musique bloquees. Tout est en memoire : une partie ne survit
 * pas a un redemarrage, ce qui est voulu (elle dure quelques minutes).
 */
const {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, ModalBuilder,
  TextInputBuilder, TextInputStyle, MessageFlags, escapeMarkdown,
} = require('discord.js');
const C = require('../utils/composants');
const logger = require('../utils/logger');
const TITRES = require('./blindtest-titres');

const COULEURS = { quiz: 0xf28a3c, qui: 0x2fb6a5, vibe: 0x67c25a };
const DUREE = { quiz: 20_000, qui: 30_000, vibe: 25_000 };
const INSCRIPTION = 90_000;
const MIN_JOUEURS_QUI = 3;
const MAX_PAR_JOUEUR = 3;
const parties = new Map();

const pause = (ms) => new Promise((r) => setTimeout(r, ms));

function melanger(liste) {
  const a = liste.slice();
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function morceaux(theme) {
  if (!theme || theme === 'melange') return Object.values(TITRES).flat();
  return TITRES[theme] ?? Object.values(TITRES).flat();
}

/* ------------------------------------------------------------- les scores */

/** Points du quiz : 1000 tout de suite, 300 a la derniere seconde. */
function pointsQuiz(ms, duree = DUREE.quiz) {
  const r = Math.min(1, Math.max(0, ms / duree));
  return Math.round(1000 - 700 * r);
}

/** Bonus de serie au quiz : +100 par bonne reponse d'affilee au-dela de 1, 500 au plus. */
function bonusSerie(serie) {
  return Math.min(500, Math.max(0, serie - 1) * 100);
}

/** Vibe check : la moyenne (1 decimale), les points de chacun, la hot take. */
function noterVibe(notes) {
  const liste = [...notes.entries()];
  if (!liste.length) return { moyenne: null, points: new Map(), hotTake: null };
  const moyenne = Math.round((liste.reduce((s, [, n]) => s + n, 0) / liste.length) * 10) / 10;
  const points = new Map(liste.map(([id, n]) => [id, Math.max(0, Math.round(10 - Math.abs(n - moyenne)))]));
  let hotTake = null;
  if (liste.length >= 3) {
    const [id, n] = liste.reduce((a, b) => (Math.abs(b[1] - moyenne) > Math.abs(a[1] - moyenne) ? b : a));
    if (Math.abs(n - moyenne) >= 3) hotTake = { id, note: n };
  }
  return { moyenne, points, hotTake };
}

/** Qui l'a choisie : qui marque quoi pour un titre. */
function noterQui(votes, auteur) {
  const points = new Map();
  let trouve = 0;
  for (const [id, choix] of votes) {
    if (id === auteur) continue;
    if (choix === auteur) { points.set(id, 1); trouve += 1; }
  }
  if (!trouve) points.set(auteur, 2);
  return { points, trouve };
}

/* ---------------------------------------------------------------- partie */

function enCours(guildId) {
  return parties.get(guildId) ?? null;
}

function arreter(guildId) {
  const p = parties.get(guildId);
  if (!p) return false;
  p.arret = true;
  p.collecteur?.stop('arret');
  return true;
}

function ajouter(partie, id, pts) {
  if (pts) partie.scores.set(id, (partie.scores.get(id) ?? 0) + pts);
}

function classement(partie, n = 10) {
  const medailles = ['🥇', '🥈', '🥉'];
  return [...partie.scores.entries()].sort((a, b) => b[1] - a[1]).slice(0, n)
    .map(([id, pts], i) => `${medailles[i] ?? `\`${i + 1}.\``} <@${id}> · **${pts}**`).join('\n');
}

async function dire(partie, blocs, extra = {}) {
  return partie.salon.send({
    components: [C.conteneur(blocs, COULEURS[partie.jeu])],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [] },
    ...extra,
  }).catch(() => null);
}

async function modifier(msg, partie, blocs) {
  return msg?.edit({ components: [C.conteneur(blocs, COULEURS[partie.jeu])] }).catch(() => null);
}

/** Cherche un morceau connu ([artiste, titre]) : une piste jouable ou null. */
async function trouver(artiste, titre) {
  const { musique } = require('./lecteur');
  const res = await musique.chercher(`${artiste} ${titre} audio`).catch(() => []);
  return res.find((p) => !p.info.isStream && p.info.length > 60_000 && p.info.length < 15 * 60_000) ?? null;
}

/** Une proposition libre (titre, lien YouTube, Spotify, Deezer…) : une piste ou null. */
async function resoudreProposition(texte) {
  const { musique } = require('./lecteur');
  const r = await musique.resoudre(texte).catch(() => null);
  let piste = r?.pistes?.[0] ?? null;
  if (piste?.recherche) piste = (await musique.chercher(piste.recherche).catch(() => []))[0] ?? null;
  if (!piste?.encoded || piste.info?.isStream) return null;
  return piste;
}

async function jouerExtrait(partie, piste) {
  const debut = piste.info.length > 90_000 ? Math.min(45_000, Math.floor(piste.info.length * 0.3)) : 0;
  await partie.lecteur.jouer({ encoded: piste.encoded, info: piste.info }, debut);
}

/** Combien de personnes (pas de bots) ecoutent dans le vocal de la partie. */
function auditeurs(partie) {
  const salon = partie.guild.channels.cache.get(partie.lecteur.salonVocal);
  return salon?.members?.filter((m) => !m.user.bot).size ?? 0;
}

async function couper(partie) {
  await partie.lecteur.noeud?.majLecteur(partie.guild.id, { track: { encoded: null } }).catch(() => null);
  partie.lecteur.actuelle = null;
}

/**
 * Lance une partie. Le lecteur doit deja etre connecte au vocal.
 * @param {object} o { jeu: 'quiz'|'qui'|'vibe', guild, salon, lecteur, theme, manches, auteur, t, nouveauLecteur }
 */
function lancer(o) {
  const partie = { ...o, scores: new Map(), manche: 0, arret: false, collecteur: null };
  parties.set(o.guild.id, partie);
  o.lecteur.modeJeu = true;
  o.lecteur.annulerInactif?.();
  const deroule = { quiz: quiz, qui, vibe }[o.jeu];
  deroule(partie).catch((e) => logger.erreur('Jeux musicaux :', e.message)).finally(() => terminer(partie));
  return partie;
}

async function terminer(partie) {
  parties.delete(partie.guild.id);
  const { t } = partie;
  partie.lecteur.modeJeu = false;
  partie.lecteur.actuelle = null;
  if (!partie.lecteur.detruit) {
    if (partie.nouveauLecteur) await partie.lecteur.detruire('stop');
    else partie.lecteur.armerInactif?.();
  }
  if (partie.annulee) return;
  const gagnant = [...partie.scores.entries()].sort((a, b) => b[1] - a[1])[0];
  await dire(partie, [
    C.texte(`## 🏆 ${t('jeuxmusicaux.fin', { jeu: t(`jeuxmusicaux.nom_${partie.jeu}`) })}`),
    C.texte(gagnant ? t('jeuxmusicaux.gagnant', { membre: `<@${gagnant[0]}>`, pts: gagnant[1] }) : t('jeuxmusicaux.aucun_point')),
    ...(partie.scores.size ? [C.separateur(), C.texte(classement(partie))] : []),
    C.texte(`-# ${t('jeuxmusicaux.rejouer')}`),
  ]);
}

/* ------------------------------------------------------------ QUIZ MUSICAL */

async function quiz(partie) {
  const { t } = partie;
  const file = melanger(morceaux(partie.theme));
  const series = new Map();
  await dire(partie, [C.texte(`## 🎯 ${t('jeuxmusicaux.nom_quiz')}`), C.texte(t('jeuxmusicaux.regles_quiz', { n: partie.manches }))]);
  await pause(4_000);

  while (partie.manche < partie.manches && !partie.arret && !partie.lecteur.detruit) {
    const morceau = file.shift();
    if (!morceau) break;
    const [artiste, titre] = morceau;
    const piste = await trouver(artiste, titre);
    if (!piste) continue;
    partie.manche += 1;

    const autres = melanger(morceaux(partie.theme).filter((m) => m[1] !== titre)).slice(0, 3);
    const choix = melanger([morceau, ...autres]);
    const lettres = ['A', 'B', 'C', 'D'];
    const rangee = new ActionRowBuilder().addComponents(choix.map((m, i) => new ButtonBuilder()
      .setCustomId(`jm_q_${partie.manche}_${i}`)
      .setLabel(`${lettres[i]} · ${m[1]}`.slice(0, 80))
      .setStyle(ButtonStyle.Secondary)));

    try { await jouerExtrait(partie, piste); } catch { continue; }
    const entete = `## 🎵 ${t('jeuxmusicaux.manche', { n: partie.manche, total: partie.manches })}`;
    const msg = await dire(partie, [C.texte(`${entete}\n${t('jeuxmusicaux.quiz_question')}`), rangee]);
    if (!msg) break;

    const depart = Date.now();
    const reponses = new Map(); // id -> { bon, ms }
    await new Promise((resolve) => {
      const col = msg.createMessageComponentCollector({ time: DUREE.quiz });
      partie.collecteur = col;
      col.on('collect', async (i) => {
        if (reponses.has(i.user.id)) return i.reply(C.erreurPrivee(t('jeuxmusicaux.deja_repondu'))).catch(() => null);
        const bon = choix[Number(i.customId.split('_')[3])] === morceau;
        reponses.set(i.user.id, { bon, ms: Date.now() - depart });
        await i.reply(C.succesPrive(t('jeuxmusicaux.reponse_notee'))).catch(() => null);
        if (reponses.size >= Math.max(1, auditeurs(partie))) col.stop('tous');
      });
      col.on('end', resolve);
    });
    await couper(partie);
    if (partie.arret || partie.lecteur.detruit) break;

    const lignes = [];
    for (const [id, r] of [...reponses.entries()].sort((a, b) => a[1].ms - b[1].ms)) {
      if (!r.bon) { series.set(id, 0); continue; }
      const serie = (series.get(id) ?? 0) + 1;
      series.set(id, serie);
      const pts = pointsQuiz(r.ms) + bonusSerie(serie);
      ajouter(partie, id, pts);
      lignes.push(`<@${id}> · +${pts}${serie >= 2 ? ` · 🔥 ${serie}` : ''} · ${(r.ms / 1000).toFixed(1)} s`);
    }
    const bonne = lettres[choix.indexOf(morceau)];
    const resume = [
      `### ✅ ${t('jeuxmusicaux.cetait', { lettre: bonne, titre: escapeMarkdown(titre), artiste: escapeMarkdown(artiste) })}`,
      lignes.length ? lignes.slice(0, 8).join('\n') : t('jeuxmusicaux.personne'),
    ].join('\n');
    await modifier(msg, partie, [
      piste.info.artworkUrl ? C.sectionVignette(resume, piste.info.artworkUrl) : C.texte(resume),
      ...(partie.scores.size ? [C.separateur(), C.texte(classement(partie, 3))] : []),
    ]);
    await pause(5_000);
  }
}

/* -------------------------------------------------------- QUI L'A CHOISIE ? */

async function qui(partie) {
  const { t } = partie;
  const propositions = new Map(); // id -> [texte]
  const bouton = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('jm_w_proposer').setLabel(t('jeuxmusicaux.qui_bouton')).setStyle(ButtonStyle.Primary).setEmoji('🎶'),
    new ButtonBuilder().setCustomId('jm_w_go').setLabel(t('jeuxmusicaux.qui_demarrer')).setStyle(ButtonStyle.Success),
  );
  const fin = Math.floor((Date.now() + INSCRIPTION) / 1000);
  const tableau = () => [
    C.texte(`## 🕵️ ${t('jeuxmusicaux.nom_qui')}`),
    C.texte(t('jeuxmusicaux.regles_qui', { max: MAX_PAR_JOUEUR, min: MIN_JOUEURS_QUI })),
    C.texte(`${t('jeuxmusicaux.qui_inscrits', { n: propositions.size })}${propositions.size ? `\n${[...propositions.keys()].map((id) => `<@${id}>`).join(' · ')}` : ''}\n-# ${t('jeuxmusicaux.qui_fin', { quand: `<t:${fin}:R>` })}`),
  ];
  const msg = await dire(partie, [...tableau(), bouton]);
  if (!msg) return;

  // Inscriptions : la fenetre recoit jusqu'a 3 titres.
  await new Promise((resolve) => {
    const col = msg.createMessageComponentCollector({ time: INSCRIPTION });
    partie.collecteur = col;
    col.on('collect', async (i) => {
      if (i.customId === 'jm_w_go') {
        if (i.user.id !== partie.auteur) return i.reply(C.erreurPrivee(t('jeuxmusicaux.qui_seul_lanceur'))).catch(() => null);
        if (propositions.size < MIN_JOUEURS_QUI) return i.reply(C.erreurPrivee(t('jeuxmusicaux.qui_pas_assez', { min: MIN_JOUEURS_QUI }))).catch(() => null);
        await i.deferUpdate().catch(() => null);
        return col.stop('go');
      }
      if (!propositions.has(i.user.id) && propositions.size >= 25) return i.reply(C.erreurPrivee(t('jeuxmusicaux.qui_complet'))).catch(() => null);
      const id = `jm_w_modal_${i.id}`;
      const modal = new ModalBuilder().setCustomId(id).setTitle(t('jeuxmusicaux.qui_modal_titre').slice(0, 45));
      for (let n = 1; n <= MAX_PAR_JOUEUR; n += 1) {
        modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder()
          .setCustomId(`t${n}`).setLabel(t('jeuxmusicaux.qui_modal_champ', { n }).slice(0, 45))
          .setPlaceholder(t('jeuxmusicaux.qui_modal_exemple').slice(0, 100))
          .setStyle(TextInputStyle.Short).setMaxLength(200).setRequired(n === 1)
          .setValue((propositions.get(i.user.id) ?? [])[n - 1] ?? '')));
      }
      await i.showModal(modal).catch(() => null);
      const envoi = await i.awaitModalSubmit({ time: 120_000, filter: (m) => m.customId === id && m.user.id === i.user.id }).catch(() => null);
      if (!envoi) return null;
      const titres = [1, 2, 3].map((n) => envoi.fields.getTextInputValue(`t${n}`)?.trim()).filter(Boolean).slice(0, MAX_PAR_JOUEUR);
      propositions.set(i.user.id, titres);
      await envoi.reply(C.succesPrive(t('jeuxmusicaux.qui_merci', { n: titres.length }))).catch(() => null);
      return modifier(msg, partie, [...tableau(), bouton]);
    });
    col.on('end', resolve);
  });
  if (partie.arret) return;

  if (propositions.size < MIN_JOUEURS_QUI) {
    partie.annulee = true;
    await modifier(msg, partie, [C.texte(`## 🕵️ ${t('jeuxmusicaux.nom_qui')}`), C.texte(t('jeuxmusicaux.qui_annulee', { min: MIN_JOUEURS_QUI }))]);
    return;
  }
  await modifier(msg, partie, [...tableau().slice(0, 2), C.texte(t('jeuxmusicaux.qui_cest_parti', { n: propositions.size }))]);

  const joueurs = [...propositions.keys()];
  const file = melanger([...propositions.entries()].flatMap(([id, l]) => l.map((texte) => ({ id, texte }))));
  partie.manches = file.length;
  const noms = new Map();
  for (const id of joueurs) {
    const m = await partie.guild.members.fetch(id).catch(() => null);
    noms.set(id, (m?.displayName ?? id).slice(0, 80));
  }

  for (const { id: auteur, texte } of file) {
    if (partie.arret || partie.lecteur.detruit) break;
    const piste = await resoudreProposition(texte);
    if (!piste) { partie.manches -= 1; continue; }
    partie.manche += 1;
    try { await jouerExtrait(partie, piste); } catch { partie.manches -= 1; continue; }

    const menu = new ActionRowBuilder().addComponents(new StringSelectMenuBuilder()
      .setCustomId(`jm_w_vote_${partie.manche}`).setPlaceholder(t('jeuxmusicaux.qui_menu'))
      .addOptions(joueurs.slice(0, 25).map((id) => ({ label: noms.get(id), value: id }))));
    const titreAffiche = `**${escapeMarkdown(piste.info.title ?? texte)}**${piste.info.author ? ` · ${escapeMarkdown(piste.info.author)}` : ''}`;
    const q = `## 🎶 ${t('jeuxmusicaux.manche', { n: partie.manche, total: partie.manches })}\n${titreAffiche}\n${t('jeuxmusicaux.qui_question')}`;
    const tour = await dire(partie, [piste.info.artworkUrl ? C.sectionVignette(q, piste.info.artworkUrl) : C.texte(q), menu]);
    if (!tour) break;

    const votes = new Map();
    await new Promise((resolve) => {
      const col = tour.createMessageComponentCollector({ time: DUREE.qui });
      partie.collecteur = col;
      col.on('collect', async (i) => {
        if (!propositions.has(i.user.id)) return i.reply(C.erreurPrivee(t('jeuxmusicaux.qui_pas_joueur'))).catch(() => null);
        if (i.user.id === auteur) return i.reply(C.succesPrive(t('jeuxmusicaux.qui_ton_titre'))).catch(() => null);
        votes.set(i.user.id, i.values[0]);
        await i.reply(C.succesPrive(t('jeuxmusicaux.vote_note'))).catch(() => null);
        if (votes.size >= joueurs.length - 1) col.stop('tous');
      });
      col.on('end', resolve);
    });
    await couper(partie);
    if (partie.arret || partie.lecteur.detruit) break;

    const { points, trouve } = noterQui(votes, auteur);
    for (const [id, pts] of points) ajouter(partie, id, pts);
    const gagnants = [...points.entries()].filter(([id]) => id !== auteur).map(([id]) => `<@${id}>`);
    const resume = [
      `### 🕵️ ${t('jeuxmusicaux.qui_revele', { membre: `<@${auteur}>` })}`,
      trouve ? t('jeuxmusicaux.qui_trouve', { membres: gagnants.join(', ') }) : t('jeuxmusicaux.qui_personne', { membre: `<@${auteur}>` }),
    ].join('\n');
    await modifier(tour, partie, [C.texte(resume), C.separateur(), C.texte(classement(partie, 3))]);
    await pause(4_000);
  }
}

/* -------------------------------------------------------------- VIBE CHECK */

async function vibe(partie) {
  const { t } = partie;
  const file = melanger(morceaux(partie.theme));
  await dire(partie, [C.texte(`## 🌡️ ${t('jeuxmusicaux.nom_vibe')}`), C.texte(t('jeuxmusicaux.regles_vibe', { n: partie.manches }))]);
  await pause(4_000);

  while (partie.manche < partie.manches && !partie.arret && !partie.lecteur.detruit) {
    const morceau = file.shift();
    if (!morceau) break;
    const [artiste, titre] = morceau;
    const piste = await trouver(artiste, titre);
    if (!piste) continue;
    partie.manche += 1;
    try { await jouerExtrait(partie, piste); } catch { continue; }

    const menu = new ActionRowBuilder().addComponents(new StringSelectMenuBuilder()
      .setCustomId(`jm_v_${partie.manche}`).setPlaceholder(t('jeuxmusicaux.vibe_menu'))
      .addOptions(Array.from({ length: 10 }, (_, k) => ({ label: `${k + 1}/10${k >= 8 ? ' 🔥' : k <= 2 ? ' 🧊' : ''}`, value: String(k + 1) }))));
    const q = `## 🎵 ${t('jeuxmusicaux.manche', { n: partie.manche, total: partie.manches })}\n**${escapeMarkdown(titre)}** · ${escapeMarkdown(artiste)}\n${t('jeuxmusicaux.vibe_question')}`;
    const msg = await dire(partie, [piste.info.artworkUrl ? C.sectionVignette(q, piste.info.artworkUrl) : C.texte(q), menu]);
    if (!msg) break;

    const notes = new Map();
    await new Promise((resolve) => {
      const col = msg.createMessageComponentCollector({ time: DUREE.vibe });
      partie.collecteur = col;
      col.on('collect', async (i) => {
        notes.set(i.user.id, Number(i.values[0]));
        await i.reply(C.succesPrive(t('jeuxmusicaux.vibe_notee', { note: i.values[0] }))).catch(() => null);
        if (notes.size >= Math.max(1, auditeurs(partie))) col.stop('tous');
      });
      col.on('end', resolve);
    });
    await couper(partie);
    if (partie.arret || partie.lecteur.detruit) break;

    const { moyenne, points, hotTake } = noterVibe(notes);
    for (const [id, pts] of points) ajouter(partie, id, pts);
    const detail = [...notes.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)
      .map(([id, n]) => `<@${id}> · ${n}/10 · +${points.get(id)}`).join('\n');
    const resume = [
      `### 🌡️ ${moyenne === null ? t('jeuxmusicaux.vibe_personne') : t('jeuxmusicaux.vibe_moyenne', { moyenne: String(moyenne).replace('.', t('jeuxmusicaux.virgule')) })}`,
      detail,
      hotTake ? `🌶️ ${t('jeuxmusicaux.vibe_hot_take', { membre: `<@${hotTake.id}>`, note: hotTake.note })}` : null,
    ].filter(Boolean).join('\n');
    await modifier(msg, partie, [C.texte(resume), ...(partie.scores.size ? [C.separateur(), C.texte(classement(partie, 3))] : [])]);
    await pause(5_000);
  }
}

module.exports = { lancer, arreter, enCours, pointsQuiz, bonusSerie, noterVibe, noterQui, JEUX: ['quiz', 'qui', 'vibe'] };
