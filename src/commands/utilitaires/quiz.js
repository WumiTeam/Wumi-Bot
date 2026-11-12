/**
 * /quiz — culture generale en boutons, a plusieurs, avec classement du serveur.
 *
 * /quiz jouer [questions] [theme]  une serie de 1 a 10 questions dans le salon
 *   (culture generale, drapeaux ou melange).
 *   Tout le monde peut repondre, une seule fois par question, pendant
 *   20 secondes. Bonne reponse = 1 point ; le plus rapide gagne 1 point bonus.
 *   A la fin de chaque question : la bonne reponse et qui l'a trouvee.
 * /quiz classement          les meilleurs joueurs du serveur.
 *
 * Une seule partie a la fois par salon. Les scores sont en base ; la partie
 * en cours, elle, vit en memoire (un redemarrage l'interrompt, sans plus).
 * Identifiants : quiz_r:<partie>:<reponse>
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
const { db } = require('../../database/db');
const banque = require('../../utils/donnees/quiz');
const { traducteur, localisations, t: tr, DEFAUT } = require('../../utils/langues');

db.exec(`
CREATE TABLE IF NOT EXISTS quiz_scores (
  guild_id  TEXT NOT NULL,
  user_id   TEXT NOT NULL,
  points    INTEGER NOT NULL DEFAULT 0,
  bonnes    INTEGER NOT NULL DEFAULT 0,
  reponses  INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (guild_id, user_id)
);
`);
const q = {
  noter: db.prepare(`
    INSERT INTO quiz_scores (guild_id, user_id, points, bonnes, reponses) VALUES (?, ?, ?, ?, 1)
    ON CONFLICT(guild_id, user_id) DO UPDATE SET points = points + excluded.points, bonnes = bonnes + excluded.bonnes, reponses = reponses + 1
  `),
  top: db.prepare('SELECT * FROM quiz_scores WHERE guild_id = ? ORDER BY points DESC, bonnes DESC LIMIT 10'),
  rang: db.prepare('SELECT COUNT(*) + 1 AS rang FROM quiz_scores WHERE guild_id = ? AND points > (SELECT COALESCE(MAX(points), -1) FROM quiz_scores WHERE guild_id = ? AND user_id = ?)'),
  moi: db.prepare('SELECT * FROM quiz_scores WHERE guild_id = ? AND user_id = ?'),
};

const DUREE_MS = 20_000;
const PAUSE_MS = 4_000;
const LETTRES = ['🇦', '🇧', '🇨', '🇩'];
const parties = new Map(); // id -> partie
const parSalon = new Map(); // channelId -> id

function melanger(liste) {
  const a = [...liste];
  for (let i = a.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Une question de culture generale, reponses melangees. */
function questionCulture(x, langue) {
  const v = langue === 'fr' ? x.fr : x.en;
  const ordre = melanger([0, 1, 2, 3]);
  return { question: v.q, reponses: ordre.map((i) => v.r[i]), bonne: ordre.indexOf(v.b), cat: x.cat };
}

/** Une question de drapeau : 3 mauvaises reponses du meme continent. */
function questionDrapeau(p, langue) {
  const { pays, image } = require('../../utils/donnees/pays');
  const nom = (x) => (langue === 'fr' ? x.fr : x.en);
  let autres = melanger(pays.filter((x) => x.continent === p.continent && x.code !== p.code)).slice(0, 3);
  if (autres.length < 3) autres = [...autres, ...melanger(pays.filter((x) => x.code !== p.code && !autres.includes(x))).slice(0, 3 - autres.length)];
  const reponses = melanger([p, ...autres]);
  return { drapeau: true, image: image(p.code), reponses: reponses.map(nom), bonne: reponses.indexOf(p), cat: 'drapeaux' };
}

/** Tire N questions differentes du theme choisi (culture, drapeaux, melange). */
function tirer(n, langue, theme = 'culture') {
  const { pays } = require('../../utils/donnees/pays');
  const culture = () => melanger(banque).slice(0, n).map((x) => questionCulture(x, langue));
  const drapeaux = () => melanger(pays).slice(0, n).map((x) => questionDrapeau(x, langue));
  if (theme === 'drapeaux') return drapeaux();
  if (theme === 'melange') {
    const a = culture();
    const b = drapeaux();
    return melanger([...a.slice(0, Math.ceil(n / 2)), ...b.slice(0, Math.floor(n / 2))]);
  }
  return culture();
}

function vueQuestion(partie, t, revelee = false) {
  const qu = partie.questions[partie.index];
  const fin = Math.floor((partie.debutQuestion + DUREE_MS) / 1000);
  const lignes = qu.reponses.map((r, i) => {
    if (!revelee) return `${LETTRES[i]} ${r}`;
    return i === qu.bonne ? `✅ **${r}**` : `▫️ ~~${r}~~`;
  });
  const elements = [
    C.texte(`## ${qu.drapeau ? '🏳️' : '🧠'} ${t('quiz.titre')} · ${partie.index + 1}/${partie.questions.length}\n### ${qu.drapeau ? t('quiz.q_drapeau') : qu.question}`),
    qu.image ? C.image(qu.image) : null,
    C.texte(lignes.join('\n')),
  ].filter(Boolean);
  if (!revelee) {
    elements.push(new ActionRowBuilder().addComponents(qu.reponses.map((r, i) => new ButtonBuilder()
      .setCustomId(`quiz_r:${partie.id}:${i}`).setStyle(ButtonStyle.Secondary).setEmoji(LETTRES[i]))));
    elements.push(C.texte(`-# ⏱️ ${t('quiz.fin_dans', { quand: `<t:${fin}:R>` })} · ${t('quiz.nb_reponses', { n: partie.reponses.size })}`));
  } else {
    const bons = [...partie.reponses.entries()].filter(([, r]) => r.choix === qu.bonne).sort((a, b) => a[1].quand - b[1].quand);
    elements.push(C.texte(bons.length
      ? `🎯 ${t('quiz.trouve_par', { liste: bons.map(([id], i) => `<@${id}>${i === 0 ? ' ⚡' : ''}`).join(', ') })}`
      : `😶 ${t('quiz.personne')}`));
  }
  return C.envoi([C.conteneur(elements, revelee ? conf.couleurs.succes : conf.couleurs.principale)], { allowedMentions: { parse: [] } });
}

function vueFin(partie, t) {
  const tri = [...partie.scores.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
  const medailles = ['🥇', '🥈', '🥉'];
  return C.envoi([C.conteneur([
    C.texte(`## 🏁 ${t('quiz.termine')}`),
    C.texte(tri.length
      ? tri.map(([id, pts], i) => `${medailles[i] ?? `**${i + 1}.**`} <@${id}> · ${t('quiz.points', { n: pts })}`).join('\n')
      : t('quiz.aucun_point')),
    C.texte(`-# ${t('quiz.pied_fin')}`),
  ], conf.couleurs.principale)], { allowedMentions: { parse: [] } });
}

const attendre = (ms) => new Promise((r) => { setTimeout(r, ms).unref?.(); });

/** Deroule la partie : question, attente, revelation, question suivante. */
async function derouler(partie, message, t) {
  try {
    for (partie.index = 0; partie.index < partie.questions.length; partie.index++) {
      partie.reponses = new Map();
      partie.debutQuestion = Date.now();
      if (partie.index > 0) await message.edit(vueQuestion(partie, t));
      await attendre(DUREE_MS);
      if (partie.arretee) return;

      // Points : 1 par bonne reponse, +1 pour la plus rapide.
      const qu = partie.questions[partie.index];
      const tri = [...partie.reponses.entries()].sort((a, b) => a[1].quand - b[1].quand);
      let premier = true;
      for (const [userId, r] of tri) {
        const bon = r.choix === qu.bonne;
        const pts = bon ? (premier ? 2 : 1) : 0;
        if (bon) premier = false;
        if (pts) partie.scores.set(userId, (partie.scores.get(userId) ?? 0) + pts);
        try {
          q.noter.run(partie.guildId, userId, pts, bon ? 1 : 0);
        } catch {
          /* le score est un confort */
        }
      }
      await message.edit(vueQuestion(partie, t, true));
      await attendre(PAUSE_MS);
    }
    await message.edit(vueFin(partie, t));
  } catch {
    /* message supprime ou salon inaccessible : on arrete proprement */
  } finally {
    parties.delete(partie.id);
    if (parSalon.get(partie.channelId) === partie.id) parSalon.delete(partie.channelId);
  }
}

module.exports = {
  categorie: 'utilitaires',
  _interne: { tirer, banque },

  data: new SlashCommandBuilder()
    .setName('quiz')
    .setDescription(tr('quiz.description_commande', DEFAUT))
    .setDescriptionLocalizations(localisations('quiz.description_commande'))
    .setContexts(InteractionContextType.Guild)
    .addSubcommand((s) => s
      .setName('play')
      .setNameLocalizations({ fr: 'jouer' })
      .setDescription(tr('quiz.sous_jouer', DEFAUT))
      .setDescriptionLocalizations(localisations('quiz.sous_jouer'))
      .addIntegerOption((o) => o
        .setName('questions')
        .setDescription(tr('quiz.opt_questions', DEFAUT))
        .setDescriptionLocalizations(localisations('quiz.opt_questions'))
        .setMinValue(1)
        .setMaxValue(10))
      .addStringOption((o) => o
        .setName('theme')
        .setNameLocalizations({ fr: 'theme' })
        .setDescription(tr('quiz.opt_theme', DEFAUT))
        .setDescriptionLocalizations(localisations('quiz.opt_theme'))
        .addChoices(
          { name: 'General knowledge', name_localizations: { fr: 'Culture générale' }, value: 'culture' },
          { name: 'Flags', name_localizations: { fr: 'Drapeaux' }, value: 'drapeaux' },
          { name: 'Mix', name_localizations: { fr: 'Mélange' }, value: 'melange' }
        )))
    .addSubcommand((s) => s
      .setName('leaderboard')
      .setNameLocalizations({ fr: 'classement' })
      .setDescription(tr('quiz.sous_classement', DEFAUT))
      .setDescriptionLocalizations(localisations('quiz.sous_classement'))),

  async execute(interaction) {
    const { t, langue } = traducteur(interaction);
    const guildId = interaction.guild.id;

    if (interaction.options.getSubcommand() === 'leaderboard') {
      const top = q.top.all(guildId);
      const moi = q.moi.get(guildId, interaction.user.id);
      const medailles = ['🥇', '🥈', '🥉'];
      return interaction.reply(C.envoi([C.conteneur([
        C.texte(`## 🏆 ${t('quiz.classement_titre')}`),
        C.texte(top.length
          ? top.map((l, i) => `${medailles[i] ?? `**${i + 1}.**`} <@${l.user_id}> · ${t('quiz.points', { n: l.points })} · ${t('quiz.bonnes', { n: l.bonnes, total: l.reponses })}`).join('\n')
          : t('quiz.classement_vide')),
        moi ? C.texte(`-# ${t('quiz.ton_rang', { rang: q.rang.get(guildId, guildId, interaction.user.id).rang, n: moi.points })}`) : null,
      ].filter(Boolean), conf.couleurs.principale)], { allowedMentions: { parse: [] } }));
    }

    if (parSalon.has(interaction.channelId)) return interaction.reply(C.erreurPrivee(t('quiz.deja')));
    const partie = {
      id: crypto.randomBytes(5).toString('hex'),
      guildId,
      channelId: interaction.channelId,
      questions: tirer(interaction.options.getInteger('questions') ?? 5, langue, interaction.options.getString('theme') ?? 'culture'),
      index: 0,
      reponses: new Map(),
      scores: new Map(),
      debutQuestion: Date.now(),
    };
    parties.set(partie.id, partie);
    parSalon.set(partie.channelId, partie.id);
    await interaction.reply(vueQuestion(partie, t));
    const message = await interaction.fetchReply();
    derouler(partie, message, t);
    return null;
  },

  async gererInteraction(interaction) {
    const { t } = traducteur(interaction);
    const [, id, choixTexte] = interaction.customId.split(':');
    const partie = parties.get(id);
    if (!partie || Date.now() > partie.debutQuestion + DUREE_MS) return interaction.reply(C.infoPrivee(t('quiz.trop_tard')));
    if (partie.reponses.has(interaction.user.id)) return interaction.reply(C.infoPrivee(t('quiz.deja_repondu')));
    const choix = Number(choixTexte);
    if (!(choix >= 0 && choix < 4)) return interaction.deferUpdate();
    partie.reponses.set(interaction.user.id, { choix, quand: Date.now() });
    // Le compteur de reponses dans le message, sans reveler qui a repondu quoi.
    await interaction.update(vueQuestion(partie, t)).catch(() => null);
    return interaction.followUp(C.infoPrivee(t('quiz.enregistree', { reponse: `${LETTRES[choix]} ${partie.questions[partie.index].reponses[choix]}` }))).catch(() => null);
  },
};
