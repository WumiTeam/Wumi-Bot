/**
 * /puissance4 — Puissance 4 en boutons, contre un membre ou contre Wumi.
 *
 * Meme fonctionnement que le morpion : l'adversaire doit ACCEPTER, les
 * parties vivent en memoire (5 minutes sans coup = expiree).
 * Wumi joue avec une recherche minimax a profondeur limitee : il gagne s'il
 * peut, bloque s'il doit, et evite de donner la victoire au coup suivant.
 * Identifiants de composants : p4_<action>:<partie>[:<colonne>]
 */
const crypto = require('node:crypto');
const {
  SlashCommandBuilder,
  InteractionContextType,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');
const conf = require('../../../config');
const C = require('../../utils/composants');
const { traducteur, localisations, t: tr, DEFAUT } = require('../../utils/langues');

const LIG = 6;
const COL = 7;
const PIONS = ['🔴', '🟡'];
const VIDE = '⚫';
const INACTIVITE_MS = 5 * 60_000;
const parties = new Map();

// ------------------------------------------------------------------ REGLES
const vide = () => Array.from({ length: LIG }, () => Array(COL).fill(null));
const copie = (g) => g.map((l) => [...l]);

/** La ligne ou tomberait un pion dans cette colonne, ou -1 si elle est pleine. */
function chute(grille, c) {
  for (let l = LIG - 1; l >= 0; l--) if (grille[l][c] === null) return l;
  return -1;
}

function jouables(grille) {
  return [3, 2, 4, 1, 5, 0, 6].filter((c) => chute(grille, c) !== -1);
}

/** { joueur, cases } si quatre pions sont alignes, { joueur: null } si nul, sinon null. */
function gagnant(grille) {
  const dirs = [[0, 1], [1, 0], [1, 1], [1, -1]];
  for (let l = 0; l < LIG; l++) {
    for (let c = 0; c < COL; c++) {
      const v = grille[l][c];
      if (v === null) continue;
      for (const [dl, dc] of dirs) {
        const cases = [[l, c]];
        for (let k = 1; k < 4; k++) {
          const nl = l + dl * k;
          const nc = c + dc * k;
          if (nl < 0 || nl >= LIG || nc < 0 || nc >= COL || grille[nl][nc] !== v) break;
          cases.push([nl, nc]);
        }
        if (cases.length === 4) return { joueur: v, cases };
      }
    }
  }
  return jouables(grille).length ? null : { joueur: null, cases: [] };
}

/** Note heuristique d'une position pour `moi` : fenetres de 4 cases. */
function evaluer(grille, moi) {
  let score = 0;
  for (let l = 0; l < LIG; l++) if (grille[l][3] === moi) score += 3;
  const fenetre = (cases) => {
    const a = cases.filter((x) => x === moi).length;
    const b = cases.filter((x) => x === 1 - moi).length;
    const v = cases.filter((x) => x === null).length;
    if (a === 3 && v === 1) score += 5;
    else if (a === 2 && v === 2) score += 2;
    if (b === 3 && v === 1) score -= 4;
  };
  for (let l = 0; l < LIG; l++) {
    for (let c = 0; c < COL; c++) {
      if (c + 3 < COL) fenetre([0, 1, 2, 3].map((k) => grille[l][c + k]));
      if (l + 3 < LIG) fenetre([0, 1, 2, 3].map((k) => grille[l + k][c]));
      if (l + 3 < LIG && c + 3 < COL) fenetre([0, 1, 2, 3].map((k) => grille[l + k][c + k]));
      if (l + 3 < LIG && c - 3 >= 0) fenetre([0, 1, 2, 3].map((k) => grille[l + k][c - k]));
    }
  }
  return score;
}

function minimax(grille, profondeur, alpha, beta, tour, moi) {
  const fin = gagnant(grille);
  if (fin) return { score: fin.joueur === null ? 0 : fin.joueur === moi ? 100000 + profondeur : -100000 - profondeur };
  if (profondeur === 0) return { score: evaluer(grille, moi) };
  let meilleur = { score: tour === moi ? -Infinity : Infinity, colonne: null };
  for (const c of jouables(grille)) {
    const g = copie(grille);
    g[chute(g, c)][c] = tour;
    const { score } = minimax(g, profondeur - 1, alpha, beta, 1 - tour, moi);
    if (tour === moi ? score > meilleur.score : score < meilleur.score) meilleur = { score, colonne: c };
    if (tour === moi) alpha = Math.max(alpha, score);
    else beta = Math.min(beta, score);
    if (alpha >= beta) break;
  }
  return meilleur;
}

const PROFONDEUR = { facile: 1, normal: 3, difficile: 5 };
function coupDuBot(grille, moi, niveau = 'normal') {
  const options = jouables(grille);
  if (niveau === 'facile' && crypto.randomInt(3) === 0) return options[crypto.randomInt(options.length)];
  return minimax(grille, PROFONDEUR[niveau] ?? 3, -Infinity, Infinity, moi, moi).colonne ?? options[0];
}

// --------------------------------------------------------------- AFFICHAGE
const chiffres = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣'];

function vue(partie, t, fin = null) {
  const nom = (i) => (partie.joueurs[i] === 'bot' ? `Wumi (${t(`ttt.niveau.${partie.niveau}`)})` : `<@${partie.joueurs[i]}>`);
  const gagnantes = new Set((fin?.cases ?? []).map(([l, c]) => `${l}:${c}`));
  const plateau = partie.grille
    .map((ligne, l) => ligne.map((v, c) => (gagnantes.has(`${l}:${c}`) ? '✨' : v === null ? VIDE : PIONS[v])).join(''))
    .join('\n');

  let etat;
  if (fin?.joueur === null) etat = `🤝 ${t('ttt.egalite')}`;
  else if (fin) etat = `🏆 ${t('ttt.victoire', { joueur: nom(fin.joueur) })}`;
  else if (partie.abandon) etat = `🏳️ ${t('ttt.abandon', { joueur: `<@${partie.abandon}>` })}`;
  else etat = `${PIONS[partie.tour]} ${t('ttt.a_toi', { joueur: nom(partie.tour) })}`;

  const termine = Boolean(fin || partie.abandon);
  const bouton = (c) => new ButtonBuilder()
    .setCustomId(`p4_jouer:${partie.id}:${c}`)
    .setStyle(ButtonStyle.Secondary)
    .setEmoji(chiffres[c])
    .setDisabled(termine || chute(partie.grille, c) === -1);

  const elements = [
    C.texte(`## 🎮 ${t('p4.titre')}\n${PIONS[0]} ${nom(0)}  **vs**  ${PIONS[1]} ${nom(1)}`),
    C.texte(`${plateau}\n${chiffres.join('')}`),
    C.texte(etat),
  ];
  if (!termine) {
    elements.push(
      new ActionRowBuilder().addComponents([0, 1, 2, 3].map(bouton)),
      new ActionRowBuilder().addComponents(
        ...[4, 5, 6].map(bouton),
        new ButtonBuilder().setCustomId(`p4_abandon:${partie.id}`).setStyle(ButtonStyle.Danger).setEmoji('🏳️').setLabel(t('ttt.bouton_abandon'))
      )
    );
  }
  return C.envoi([C.conteneur(elements, conf.couleurs.principale)], {
    allowedMentions: { users: termine ? [] : [partie.joueurs[partie.tour]].filter((x) => x !== 'bot') },
  });
}

function invitation(partie, t) {
  return C.envoi([C.conteneur([
    C.texte(`## 🎮 ${t('p4.titre')}\n${t('p4.defi', { joueur: `<@${partie.joueurs[0]}>`, adversaire: `<@${partie.joueurs[1]}>` })}`),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`p4_accepter:${partie.id}`).setStyle(ButtonStyle.Success).setLabel(t('ttt.accepter')),
      new ButtonBuilder().setCustomId(`p4_refuser:${partie.id}`).setStyle(ButtonStyle.Secondary).setLabel(t('ttt.refuser'))
    ),
    C.texte(`-# ${t('ttt.defi_pied')}`),
  ], conf.couleurs.principale)], { allowedMentions: { users: [partie.joueurs[1]] } });
}

setInterval(() => {
  const limite = Date.now() - INACTIVITE_MS;
  for (const [id, p] of parties) if (p.dernier < limite) parties.delete(id);
}, 60_000).unref?.();

/** Pose un pion ; renvoie la fin de partie eventuelle. */
function poser(partie, c) {
  partie.grille[chute(partie.grille, c)][c] = partie.tour;
  const fin = gagnant(partie.grille);
  if (!fin) partie.tour = 1 - partie.tour;
  return fin;
}

module.exports = {
  categorie: 'utilitaires',
  _interne: { gagnant, coupDuBot, chute, vide },

  data: new SlashCommandBuilder()
    .setName('connect4')
    .setNameLocalizations({ fr: 'puissance4' })
    .setDescription(tr('p4.description_commande', DEFAUT))
    .setDescriptionLocalizations(localisations('p4.description_commande'))
    .setContexts(InteractionContextType.Guild)
    .addUserOption((o) => o
      .setName('opponent')
      .setNameLocalizations({ fr: 'adversaire' })
      .setDescription(tr('ttt.opt_adversaire', DEFAUT))
      .setDescriptionLocalizations(localisations('ttt.opt_adversaire')))
    .addStringOption((o) => o
      .setName('level')
      .setNameLocalizations({ fr: 'niveau' })
      .setDescription(tr('ttt.opt_niveau', DEFAUT))
      .setDescriptionLocalizations(localisations('ttt.opt_niveau'))
      .addChoices(
        { name: 'Easy', name_localizations: { fr: 'Facile' }, value: 'facile' },
        { name: 'Normal', name_localizations: { fr: 'Normal' }, value: 'normal' },
        { name: 'Hard', name_localizations: { fr: 'Difficile' }, value: 'difficile' }
      )),

  async execute(interaction) {
    const { t } = traducteur(interaction);
    const adversaire = interaction.options.getUser('opponent');
    if (adversaire && adversaire.id === interaction.user.id) return interaction.reply(C.erreurPrivee(t('ttt.contre_soi')));
    if (adversaire?.bot && adversaire.id !== interaction.client.user.id) return interaction.reply(C.erreurPrivee(t('ttt.contre_bot')));

    const contreWumi = !adversaire || adversaire.id === interaction.client.user.id;
    const partie = {
      id: crypto.randomBytes(5).toString('hex'),
      joueurs: [interaction.user.id, contreWumi ? 'bot' : adversaire.id],
      grille: vide(),
      tour: 0,
      niveau: interaction.options.getString('level') ?? 'normal',
      acceptee: contreWumi,
      dernier: Date.now(),
    };
    parties.set(partie.id, partie);
    return interaction.reply(partie.acceptee ? vue(partie, t) : invitation(partie, t));
  },

  async gererInteraction(interaction) {
    const { t } = traducteur(interaction);
    const [action, id, colTexte] = interaction.customId.split(':');
    const partie = parties.get(id);
    if (!partie) {
      return interaction.update(C.info(t('ttt.introuvable'))).catch(() => interaction.reply(C.infoPrivee(t('ttt.introuvable'))));
    }
    partie.dernier = Date.now();

    if (action === 'p4_accepter' || action === 'p4_refuser') {
      if (interaction.user.id !== partie.joueurs[1]) return interaction.reply(C.erreurPrivee(t('ttt.pas_ton_defi')));
      if (action === 'p4_refuser') {
        parties.delete(id);
        return interaction.update(C.info(t('ttt.refuse', { joueur: `<@${partie.joueurs[1]}>` })));
      }
      partie.acceptee = true;
      return interaction.update(vue(partie, t));
    }

    const joueur = partie.joueurs.indexOf(interaction.user.id);
    if (joueur === -1) return interaction.reply(C.erreurPrivee(t('ttt.pas_ta_partie')));

    if (action === 'p4_abandon') {
      partie.abandon = interaction.user.id;
      parties.delete(id);
      return interaction.update(vue(partie, t));
    }

    if (!partie.acceptee) return interaction.reply(C.erreurPrivee(t('ttt.pas_acceptee')));
    if (partie.tour !== joueur) return interaction.reply(C.infoPrivee(t('ttt.pas_ton_tour')));
    const c = Number(colTexte);
    if (!(c >= 0 && c < COL) || chute(partie.grille, c) === -1) return interaction.deferUpdate();

    let fin = poser(partie, c);
    if (!fin && partie.joueurs[partie.tour] === 'bot') fin = poser(partie, coupDuBot(partie.grille, partie.tour, partie.niveau));
    if (fin) parties.delete(id);
    return interaction.update(vue(partie, t, fin));
  },
};
