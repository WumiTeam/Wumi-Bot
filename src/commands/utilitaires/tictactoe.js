/**
 * /tictactoe — un morpion avec des boutons, contre un membre ou contre Wumi.
 *
 * Contre un membre : il doit d'abord ACCEPTER (on ne force personne a jouer).
 * Contre Wumi : le bot joue tout de suite, avec trois niveaux :
 *   facile   joue au hasard
 *   normal   gagne s'il peut, bloque s'il doit, sinon hasard
 *   difficile minimax : il ne perd jamais
 *
 * Les parties vivent en memoire (5 minutes d'inactivite max) : rien en base,
 * un redemarrage du bot les annule, c'est sans consequence.
 * Identifiants de composants : ttt_<action>:<partie>[:<case>]
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

const parties = new Map();
const INACTIVITE_MS = 5 * 60_000;
const LIGNES = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];
const SYMBOLES = ['❌', '⭕'];

// ------------------------------------------------------------------ REGLES
function gagnant(plateau) {
  for (const [a, b, c] of LIGNES) {
    if (plateau[a] !== null && plateau[a] === plateau[b] && plateau[a] === plateau[c]) return { joueur: plateau[a], ligne: [a, b, c] };
  }
  return plateau.every((x) => x !== null) ? { joueur: null, ligne: [] } : null;
}

function libres(plateau) {
  return plateau.map((x, i) => (x === null ? i : null)).filter((i) => i !== null);
}

function minimax(plateau, joueur, moi) {
  const fin = gagnant(plateau);
  if (fin) return { score: fin.joueur === null ? 0 : fin.joueur === moi ? 10 : -10 };
  let meilleur = { score: joueur === moi ? -Infinity : Infinity, coup: null };
  for (const i of libres(plateau)) {
    plateau[i] = joueur;
    const { score } = minimax(plateau, 1 - joueur, moi);
    plateau[i] = null;
    const ajuste = score - Math.sign(score) * 0.01; // gagner vite, perdre tard
    if (joueur === moi ? ajuste > meilleur.score : ajuste < meilleur.score) meilleur = { score: ajuste, coup: i };
  }
  return meilleur;
}

function coupDuBot(plateau, moi, niveau) {
  const cases = libres(plateau);
  const hasard = () => cases[crypto.randomInt(cases.length)];
  if (niveau === 'facile') return hasard();
  if (niveau === 'difficile') return minimax([...plateau], moi, moi).coup ?? hasard();
  // normal : gagner, sinon bloquer, sinon le centre, sinon hasard
  for (const cible of [moi, 1 - moi]) {
    for (const i of cases) {
      const essai = [...plateau];
      essai[i] = cible;
      if (gagnant(essai)?.joueur === cible) return i;
    }
  }
  return cases.includes(4) ? 4 : hasard();
}

// --------------------------------------------------------------- AFFICHAGE
function vue(partie, t, fin = null) {
  const [j1, j2] = partie.joueurs;
  const nom = (i) => (partie.joueurs[i] === 'bot' ? `Wumi (${t(`ttt.niveau.${partie.niveau}`)})` : `<@${partie.joueurs[i]}>`);
  let etat;
  if (fin?.joueur === null) etat = `🤝 ${t('ttt.egalite')}`;
  else if (fin) etat = `🏆 ${t('ttt.victoire', { joueur: nom(fin.joueur) })}`;
  else if (partie.abandon) etat = `🏳️ ${t('ttt.abandon', { joueur: `<@${partie.abandon}>` })}`;
  else if (partie.expiree) etat = `⌛ ${t('ttt.expiree')}`;
  else etat = `${SYMBOLES[partie.tour]} ${t('ttt.a_toi', { joueur: nom(partie.tour) })}`;

  const termine = Boolean(fin || partie.abandon || partie.expiree);
  const rangees = [0, 1, 2].map((r) => new ActionRowBuilder().addComponents([0, 1, 2].map((c) => {
    const i = r * 3 + c;
    const v = partie.plateau[i];
    const b = new ButtonBuilder()
      .setCustomId(`ttt_jouer:${partie.id}:${i}`)
      .setStyle(fin?.ligne.includes(i) ? ButtonStyle.Success : v === null ? ButtonStyle.Secondary : v === 0 ? ButtonStyle.Danger : ButtonStyle.Primary)
      .setDisabled(termine || v !== null);
    if (v === null) b.setLabel('​');
    else b.setEmoji(SYMBOLES[v]);
    return b;
  })));

  const elements = [
    C.texte(`## 🎮 ${t('ttt.titre')}\n${SYMBOLES[0]} ${j1 === 'bot' ? 'Wumi' : `<@${j1}>`}  **vs**  ${SYMBOLES[1]} ${j2 === 'bot' ? `Wumi (${t(`ttt.niveau.${partie.niveau}`)})` : `<@${j2}>`}`),
    C.texte(etat),
    ...rangees,
  ];
  if (!termine) {
    elements.push(new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`ttt_abandon:${partie.id}`).setStyle(ButtonStyle.Secondary).setEmoji('🏳️').setLabel(t('ttt.bouton_abandon'))
    ));
  }
  return C.envoi([C.conteneur(elements, conf.couleurs.principale)], { allowedMentions: { users: termine ? [] : [partie.joueurs[partie.tour]].filter((x) => x !== 'bot') } });
}

function invitation(partie, t) {
  return C.envoi([C.conteneur([
    C.texte(`## 🎮 ${t('ttt.titre')}\n${t('ttt.defi', { joueur: `<@${partie.joueurs[0]}>`, adversaire: `<@${partie.joueurs[1]}>` })}`),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`ttt_accepter:${partie.id}`).setStyle(ButtonStyle.Success).setLabel(t('ttt.accepter')),
      new ButtonBuilder().setCustomId(`ttt_refuser:${partie.id}`).setStyle(ButtonStyle.Secondary).setLabel(t('ttt.refuser'))
    ),
    C.texte(`-# ${t('ttt.defi_pied')}`),
  ], conf.couleurs.principale)], { allowedMentions: { users: [partie.joueurs[1]] } });
}

// ----------------------------------------------------------------- PARTIES
function nettoyer() {
  const limite = Date.now() - INACTIVITE_MS;
  for (const [id, p] of parties) if (p.dernier < limite) parties.delete(id);
}
setInterval(nettoyer, 60_000).unref?.();

/** Si c'est au bot de jouer, il joue. */
function faireJouerBot(partie) {
  if (partie.joueurs[partie.tour] !== 'bot') return null;
  const i = coupDuBot(partie.plateau, partie.tour, partie.niveau);
  partie.plateau[i] = partie.tour;
  const fin = gagnant(partie.plateau);
  if (!fin) partie.tour = 1 - partie.tour;
  return fin;
}

module.exports = {
  categorie: 'utilitaires',
  _interne: { gagnant, coupDuBot, minimax },

  data: new SlashCommandBuilder()
    .setName('tictactoe')
    .setNameLocalizations({ fr: 'morpion' })
    .setDescription(tr('ttt.description_commande', DEFAUT))
    .setDescriptionLocalizations(localisations('ttt.description_commande'))
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
        { name: 'Hard (unbeatable)', name_localizations: { fr: 'Difficile (imbattable)' }, value: 'difficile' }
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
      plateau: Array(9).fill(null),
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
    const [action, id, caseTexte] = interaction.customId.split(':');
    const partie = parties.get(id);
    if (!partie) {
      return interaction.update(C.info(t('ttt.introuvable'))).catch(() => interaction.reply(C.infoPrivee(t('ttt.introuvable'))));
    }
    partie.dernier = Date.now();
    const joueur = partie.joueurs.indexOf(interaction.user.id);

    if (action === 'ttt_accepter' || action === 'ttt_refuser') {
      if (interaction.user.id !== partie.joueurs[1]) return interaction.reply(C.erreurPrivee(t('ttt.pas_ton_defi')));
      if (action === 'ttt_refuser') {
        parties.delete(id);
        return interaction.update(C.info(t('ttt.refuse', { joueur: `<@${partie.joueurs[1]}>` })));
      }
      partie.acceptee = true;
      return interaction.update(vue(partie, t));
    }

    if (joueur === -1) return interaction.reply(C.erreurPrivee(t('ttt.pas_ta_partie')));

    if (action === 'ttt_abandon') {
      partie.abandon = interaction.user.id;
      parties.delete(id);
      return interaction.update(vue(partie, t));
    }

    // ttt_jouer
    if (!partie.acceptee) return interaction.reply(C.erreurPrivee(t('ttt.pas_acceptee')));
    if (partie.tour !== joueur) return interaction.reply(C.infoPrivee(t('ttt.pas_ton_tour')));
    const i = Number(caseTexte);
    if (!(i >= 0 && i < 9) || partie.plateau[i] !== null) return interaction.deferUpdate();

    partie.plateau[i] = joueur;
    let fin = gagnant(partie.plateau);
    if (!fin) {
      partie.tour = 1 - partie.tour;
      fin = faireJouerBot(partie);
    }
    if (fin) parties.delete(id);
    return interaction.update(vue(partie, t, fin));
  },
};
