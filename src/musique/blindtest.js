/**
 * Le BLIND TEST : Wumi joue un extrait dans le vocal, le premier qui ecrit le
 * bon titre dans le salon gagne 2 points (et le premier qui trouve l'artiste,
 * 1 point). Classement a la fin.
 *
 *  - un indice (premieres lettres) arrive au milieu de la manche ;
 *  - les fautes de frappe legeres sont acceptees, les accents et la
 *    ponctuation ne comptent pas ;
 *  - sans l'intent « contenu des messages », on bascule sur 4 boutons ;
 *  - le lecteur passe en « mode jeu » : pas de panneau (il donnerait la
 *    reponse) et les commandes de musique sont bloquees pendant la partie.
 */
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags, escapeMarkdown } = require('discord.js');
const C = require('../utils/composants');
const capacites = require('../utils/capacites');
const logger = require('../utils/logger');
const TITRES = require('./blindtest-titres');

const COULEUR = 0xe46bd8;
const DUREE_MANCHE = 25_000;
const INDICE_APRES = 12_000;
const parties = new Map();

/* ------------------------------------------------------------- les reponses */

function normaliser(texte) {
  return String(texte ?? '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\(.*?\)|\[.*?\]/g, ' ')
    .replace(/\b(feat|ft)\b.*$/, ' ')
    .replace(/&/g, ' et ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function distance(a, b) {
  const l = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    let prec = l[0];
    l[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const tmp = l[j];
      l[j] = Math.min(l[j] + 1, l[j - 1] + 1, prec + (a[i - 1] === b[j - 1] ? 0 : 1));
      prec = tmp;
    }
  }
  return l[b.length];
}

/** La proposition correspond-elle a la reponse ? */
function correspond(proposition, reponse) {
  const p = normaliser(proposition);
  const r = normaliser(reponse);
  if (!p || !r) return false;
  if (p === r) return true;
  const court = r.replace(/ /g, '');
  if (court.length >= 4 && p.replace(/ /g, '').includes(court)) return true;
  if (r.length < 5) return false;
  return 1 - distance(p, r) / Math.max(p.length, r.length) >= 0.8;
}

/** « Alors on danse » -> « A____ o_ d____ » */
function indice(titre) {
  return String(titre).split(' ').map((mot) => {
    const lettres = [...mot];
    return lettres.map((c, i) => (i === 0 || !/\p{L}|\p{N}/u.test(c) ? c : '_')).join('');
  }).join('  ');
}

function melanger(liste) {
  const a = liste.slice();
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function morceaux(theme) {
  if (theme === 'melange') return Object.values(TITRES).flat();
  return TITRES[theme] ?? Object.values(TITRES).flat();
}

/* ---------------------------------------------------------------- la partie */

function enCours(guildId) {
  return parties.get(guildId) ?? null;
}

const pause = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Lance une partie. Le lecteur doit deja etre connecte au vocal.
 * @param {object} o { guild, salon, lecteur, theme, manches, auteur, t, nouveauLecteur }
 */
function lancer(o) {
  const partie = {
    ...o,
    scores: new Map(),
    file: melanger(morceaux(o.theme)),
    manche: 0,
    arret: false,
    collecteur: null,
  };
  parties.set(o.guild.id, partie);
  o.lecteur.modeJeu = true;
  o.lecteur.annulerInactif();
  boucle(partie).catch((e) => logger.erreur('Blind test :', e.message)).finally(() => terminer(partie));
  return partie;
}

function arreter(guildId) {
  const p = parties.get(guildId);
  if (!p) return false;
  p.arret = true;
  p.collecteur?.stop('arret');
  return true;
}

async function dire(partie, blocs, extra = {}) {
  return partie.salon.send({ components: [C.conteneur(blocs, COULEUR)], flags: MessageFlags.IsComponentsV2, allowedMentions: { parse: [] }, ...extra }).catch(() => null);
}

function classement(partie, n = 10) {
  const medailles = ['🥇', '🥈', '🥉'];
  return [...partie.scores.entries()].sort((a, b) => b[1] - a[1]).slice(0, n)
    .map(([id, pts], i) => `${medailles[i] ?? `\`${i + 1}.\``} <@${id}> · **${pts}** pt${pts > 1 ? 's' : ''}`).join('\n');
}

function ajouter(partie, id, pts) {
  partie.scores.set(id, (partie.scores.get(id) ?? 0) + pts);
}

/** Cherche le morceau sur YouTube. Renvoie la piste ou null. */
async function trouver(artiste, titre) {
  const { musique } = require('./lecteur');
  const res = await musique.chercher(`${artiste} ${titre} audio`).catch(() => []);
  return res.find((p) => !p.info.isStream && p.info.length > 60_000 && p.info.length < 15 * 60_000) ?? null;
}

async function boucle(partie) {
  const { t } = partie;
  await dire(partie, [
    C.texte(`## 🎧 ${t('blindtest.titre')}`),
    C.texte(t('blindtest.regles', { n: partie.manches, theme: t(`blindtest.theme_${partie.theme}`) })),
    C.texte(`-# ${capacites.contenuMessages() ? t('blindtest.regles_ecrire') : t('blindtest.regles_boutons')}`),
  ]);
  await pause(5_000);

  while (partie.manche < partie.manches && !partie.arret && !partie.lecteur.detruit) {
    const morceau = partie.file.shift();
    if (!morceau) break;
    const [artiste, titre] = morceau;
    const piste = await trouver(artiste, titre);
    if (!piste) continue;
    partie.manche += 1;

    const debut = Math.min(45_000, Math.floor(piste.info.length * 0.3));
    try {
      await partie.lecteur.jouer({ encoded: piste.encoded, info: piste.info }, debut);
    } catch {
      continue;
    }
    const resultat = await manche(partie, { artiste, titre });
    await partie.lecteur.noeud.majLecteur(partie.guild.id, { track: { encoded: null } }).catch(() => null);
    partie.lecteur.actuelle = null;
    if (partie.arret || partie.lecteur.detruit) break;

    const lignes = [
      `### ${resultat.titre ? '✅' : '⏱️'} ${t('blindtest.cetait', { titre: escapeMarkdown(titre), artiste: escapeMarkdown(artiste) })}`,
      resultat.titre ? t('blindtest.trouve_titre', { membre: `<@${resultat.titre}>` }) : t('blindtest.personne'),
      resultat.artiste ? t('blindtest.trouve_artiste', { membre: `<@${resultat.artiste}>` }) : null,
    ].filter(Boolean).join('\n');
    const blocs = [piste.info.artworkUrl ? C.sectionVignette(lignes, piste.info.artworkUrl) : C.texte(lignes)];
    if (partie.scores.size) blocs.push(C.separateur(), C.texte(`-# ${t('blindtest.manche', { n: partie.manche, total: partie.manches })}\n${classement(partie, 3)}`));
    await dire(partie, blocs);
    await pause(5_000);
  }
}

/** Une manche : renvoie { titre: id|null, artiste: id|null }. */
async function manche(partie, { artiste, titre }) {
  const { t } = partie;
  const res = { titre: null, artiste: null };
  const entete = `## 🎵 ${t('blindtest.manche', { n: partie.manche, total: partie.manches })}`;

  if (capacites.contenuMessages()) {
    await dire(partie, [C.texte(`${entete}\n${t('blindtest.ecoutez')}`)]);
    const minuteurIndice = setTimeout(() => {
      dire(partie, [C.texte(`💡 ${t('blindtest.indice')} \`${indice(titre)}\``)]);
    }, INDICE_APRES);
    await new Promise((resolve) => {
      const col = partie.salon.createMessageCollector({ filter: (m) => !m.author.bot, time: DUREE_MANCHE });
      partie.collecteur = col;
      col.on('collect', (m) => {
        if (!res.titre && correspond(m.content, titre)) {
          res.titre = m.author.id;
          ajouter(partie, m.author.id, 2);
          m.react('✅').catch(() => null);
          col.stop('trouve');
        } else if (!res.artiste && correspond(m.content, artiste)) {
          res.artiste = m.author.id;
          ajouter(partie, m.author.id, 1);
          m.react('🎤').catch(() => null);
        }
      });
      col.on('end', resolve);
    });
    clearTimeout(minuteurIndice);
    return res;
  }

  // Sans le contenu des messages : 4 choix en boutons.
  const autres = melanger(morceaux(partie.theme).filter((m) => m[1] !== titre)).slice(0, 3).map((m) => m[1]);
  const choix = melanger([titre, ...autres]);
  const rangee = new ActionRowBuilder().addComponents(choix.map((c, i) => new ButtonBuilder()
    .setCustomId(`bt_${partie.manche}_${i}`).setLabel(c.slice(0, 80)).setStyle(ButtonStyle.Secondary)));
  const msg = await dire(partie, [C.texte(`${entete}\n${t('blindtest.ecoutez_boutons')}`), rangee]);
  if (!msg) return res;
  const elimines = new Set();
  await new Promise((resolve) => {
    const col = msg.createMessageComponentCollector({ time: DUREE_MANCHE });
    partie.collecteur = col;
    col.on('collect', async (i) => {
      if (elimines.has(i.user.id)) return i.reply(C.erreurPrivee(t('blindtest.deja_repondu'))).catch(() => null);
      const bon = choix[Number(i.customId.split('_')[2])] === titre;
      if (!bon) {
        elimines.add(i.user.id);
        return i.reply(C.erreurPrivee(t('blindtest.rate'))).catch(() => null);
      }
      res.titre = i.user.id;
      ajouter(partie, i.user.id, 2);
      await i.deferUpdate().catch(() => null);
      col.stop('trouve');
    });
    col.on('end', resolve);
  });
  await msg.edit({ components: [C.conteneur([C.texte(`${entete}\n${t('blindtest.manche_finie')}`)], COULEUR)] }).catch(() => null);
  return res;
}

async function terminer(partie) {
  parties.delete(partie.guild.id);
  const { t } = partie;
  partie.lecteur.modeJeu = false;
  partie.lecteur.actuelle = null;
  if (!partie.lecteur.detruit) {
    if (partie.nouveauLecteur) await partie.lecteur.detruire('stop');
    else partie.lecteur.armerInactif();
  }
  const gagnant = [...partie.scores.entries()].sort((a, b) => b[1] - a[1])[0];
  await dire(partie, [
    C.texte(`## 🏆 ${t('blindtest.fin')}`),
    C.texte(gagnant ? t('blindtest.gagnant', { membre: `<@${gagnant[0]}>`, pts: gagnant[1] }) : t('blindtest.aucun_point')),
    ...(partie.scores.size ? [C.separateur(), C.texte(classement(partie))] : []),
    C.texte(`-# ${t('blindtest.rejouer')}`),
  ]);
}

module.exports = { lancer, arreter, enCours, correspond, normaliser, indice, THEMES: ['hits_fr', 'monde', 'annees80', 'annees2000', 'rap_fr', 'melange'] };
