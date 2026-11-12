/**
 * /pendu — le pendu, seul ou a plusieurs.
 *
 * Les lettres se choisissent dans deux menus (A-M et N-Z) qui ne proposent
 * que les lettres pas encore jouees ; un bouton ouvre une fenetre pour tenter
 * le mot entier. Le mot vient de la langue du serveur.
 * 7 erreurs et c'est perdu. Partie en memoire, 10 minutes sans coup = expiree.
 * Identifiants : pdu_<action>:<partie>
 */
const crypto = require('node:crypto');
const {
  SlashCommandBuilder,
  InteractionContextType,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require('discord.js');
const conf = require('../../../config');
const C = require('../../utils/composants');
const mots = require('../../utils/donnees/mots');
const { traducteur, localisations, t: tr, DEFAUT } = require('../../utils/langues');

const MAX_ERREURS = 7;
const INACTIVITE_MS = 10 * 60_000;
const parties = new Map();

const DESSINS = [
  '  ┌───┐\n  │\n  │\n  │\n  │\n══╧══',
  '  ┌───┐\n  │   O\n  │\n  │\n  │\n══╧══',
  '  ┌───┐\n  │   O\n  │   |\n  │\n  │\n══╧══',
  '  ┌───┐\n  │   O\n  │  /|\n  │\n  │\n══╧══',
  '  ┌───┐\n  │   O\n  │  /|\\\n  │\n  │\n══╧══',
  '  ┌───┐\n  │   O\n  │  /|\\\n  │  /\n  │\n══╧══',
  '  ┌───┐\n  │   O\n  │  /|\\\n  │  / \\\n  │\n══╧══',
  '  ┌───┐\n  │   X\n  │  /|\\\n  │  / \\\n  │ R.I.P\n══╧══',
];

const normaliser = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z]/g, '');

function masque(partie) {
  return [...partie.mot].map((l) => (partie.trouvees.has(l) ? l : '＿')).join(' ');
}

const gagne = (p) => [...p.mot].every((l) => p.trouvees.has(l));

function vue(partie, t, etat = null) {
  const fini = etat === 'gagne' || etat === 'perdu' || etat === 'abandon' || etat === 'trouve';
  const lignes = [
    `## 🪢 ${t('pendu.titre')}`,
    `\`\`\`\n${DESSINS[Math.min(partie.erreurs, MAX_ERREURS)]}\n\`\`\``,
    `# ${fini ? [...partie.mot].join(' ') : masque(partie)}`,
  ];
  const ratees = [...partie.ratees];
  const infos = [
    t('pendu.erreurs', { n: partie.erreurs, max: MAX_ERREURS }),
    ratees.length ? `${t('pendu.ratees')} ~~${ratees.join(' ')}~~` : null,
    partie.solo ? t('pendu.mode_solo', { joueur: `<@${partie.auteur}>` }) : t('pendu.mode_tous'),
  ].filter(Boolean);

  let fin = null;
  if (etat === 'gagne' || etat === 'trouve') {
    fin = `🎉 ${t('pendu.gagne', { mot: partie.mot, joueur: `<@${partie.dernier}>` })}`;
  } else if (etat === 'perdu') fin = `💀 ${t('pendu.perdu', { mot: partie.mot })}`;
  else if (etat === 'abandon') fin = `🏳️ ${t('pendu.abandon', { mot: partie.mot })}`;
  else if (etat?.message) fin = etat.message;

  const elements = [C.texte(lignes.join('\n')), C.texte(infos.join(' · '))];
  if (fin) elements.push(C.texte(fin));

  if (!fini) {
    const restantes = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').filter((l) => !partie.trouvees.has(l) && !partie.ratees.has(l));
    const moitie = (debut, finL, n) => {
      const ls = restantes.filter((l) => l >= debut && l <= finL);
      if (!ls.length) return null;
      return new ActionRowBuilder().addComponents(new StringSelectMenuBuilder()
        .setCustomId(`pdu_l${n}:${partie.id}`)
        .setPlaceholder(t('pendu.choisir', { de: debut, a: finL }))
        .addOptions(ls.map((l) => ({ label: l, value: l }))));
    };
    for (const r of [moitie('A', 'M', 1), moitie('N', 'Z', 2)]) if (r) elements.push(r);
    elements.push(new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`pdu_mot:${partie.id}`).setStyle(ButtonStyle.Primary).setEmoji('💡').setLabel(t('pendu.bouton_mot')),
      new ButtonBuilder().setCustomId(`pdu_stop:${partie.id}`).setStyle(ButtonStyle.Secondary).setEmoji('🏳️').setLabel(t('ttt.bouton_abandon'))
    ));
  }
  const couleur = etat === 'perdu' ? conf.couleurs.erreur : etat === 'gagne' || etat === 'trouve' ? conf.couleurs.succes : conf.couleurs.principale;
  return C.envoi([C.conteneur(elements, couleur)], { allowedMentions: { parse: [] } });
}

setInterval(() => {
  const limite = Date.now() - INACTIVITE_MS;
  for (const [id, p] of parties) if (p.date < limite) parties.delete(id);
}, 60_000).unref?.();

module.exports = {
  categorie: 'utilitaires',
  _interne: { normaliser, masque, gagne },

  data: new SlashCommandBuilder()
    .setName('hangman')
    .setNameLocalizations({ fr: 'pendu' })
    .setDescription(tr('pendu.description_commande', DEFAUT))
    .setDescriptionLocalizations(localisations('pendu.description_commande'))
    .setContexts(InteractionContextType.Guild)
    .addStringOption((o) => o
      .setName('mode')
      .setDescription(tr('pendu.opt_mode', DEFAUT))
      .setDescriptionLocalizations(localisations('pendu.opt_mode'))
      .addChoices(
        { name: 'Everyone can play', name_localizations: { fr: 'Tout le monde joue' }, value: 'tous' },
        { name: 'Just me', name_localizations: { fr: 'Moi seul' }, value: 'solo' }
      )),

  async execute(interaction) {
    const { t, langue } = traducteur(interaction);
    const liste = langue === 'fr' ? mots.fr : mots.en;
    const partie = {
      id: crypto.randomBytes(5).toString('hex'),
      mot: liste[crypto.randomInt(liste.length)],
      trouvees: new Set(),
      ratees: new Set(),
      erreurs: 0,
      auteur: interaction.user.id,
      solo: interaction.options.getString('mode') === 'solo',
      date: Date.now(),
      dernier: interaction.user.id,
    };
    parties.set(partie.id, partie);
    return interaction.reply(vue(partie, t));
  },

  async gererInteraction(interaction) {
    const { t } = traducteur(interaction);
    const [action, id] = interaction.customId.split(':');
    const partie = parties.get(id);
    if (!partie) {
      if (interaction.isModalSubmit()) return interaction.reply(C.infoPrivee(t('pendu.introuvable')));
      return interaction.update(C.info(t('pendu.introuvable'))).catch(() => interaction.reply(C.infoPrivee(t('pendu.introuvable'))));
    }
    if (partie.solo && interaction.user.id !== partie.auteur) return interaction.reply(C.erreurPrivee(t('pendu.pas_ta_partie')));
    partie.date = Date.now();

    if (action === 'pdu_stop') {
      if (interaction.user.id !== partie.auteur) return interaction.reply(C.erreurPrivee(t('pendu.seul_auteur')));
      parties.delete(id);
      return interaction.update(vue(partie, t, 'abandon'));
    }

    if (action === 'pdu_mot') {
      return interaction.showModal(new ModalBuilder()
        .setCustomId(`pdu_modal:${id}`)
        .setTitle(t('pendu.fenetre_titre'))
        .addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder()
          .setCustomId('mot').setLabel(t('pendu.fenetre_label')).setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(20))));
    }

    partie.dernier = interaction.user.id;

    if (action === 'pdu_modal') {
      const essai = normaliser(interaction.fields.getTextInputValue('mot'));
      if (essai === partie.mot) {
        parties.delete(id);
        for (const l of partie.mot) partie.trouvees.add(l);
        return interaction.update(vue(partie, t, 'trouve'));
      }
      partie.erreurs++;
      if (partie.erreurs >= MAX_ERREURS) {
        parties.delete(id);
        return interaction.update(vue(partie, t, 'perdu'));
      }
      return interaction.update(vue(partie, t, { message: `❌ ${t('pendu.mauvais_mot', { joueur: `<@${interaction.user.id}>`, mot: essai || '?' })}` }));
    }

    // Une lettre choisie dans un des deux menus.
    const lettre = normaliser(interaction.values?.[0]).slice(0, 1);
    if (!lettre || partie.trouvees.has(lettre) || partie.ratees.has(lettre)) return interaction.update(vue(partie, t));
    let message;
    if (partie.mot.includes(lettre)) {
      partie.trouvees.add(lettre);
      if (gagne(partie)) {
        parties.delete(id);
        return interaction.update(vue(partie, t, 'gagne'));
      }
      message = `✅ ${t('pendu.bonne', { joueur: `<@${interaction.user.id}>`, lettre, n: [...partie.mot].filter((l) => l === lettre).length })}`;
    } else {
      partie.ratees.add(lettre);
      partie.erreurs++;
      if (partie.erreurs >= MAX_ERREURS) {
        parties.delete(id);
        return interaction.update(vue(partie, t, 'perdu'));
      }
      message = `❌ ${t('pendu.mauvaise', { joueur: `<@${interaction.user.id}>`, lettre })}`;
    }
    return interaction.update(vue(partie, t, { message }));
  },
};
