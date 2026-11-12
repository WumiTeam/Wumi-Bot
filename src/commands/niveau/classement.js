const {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  InteractionContextType,
  AttachmentBuilder,
} = require('discord.js');
const { db } = require('../../database/db');
const { abreger } = require('../../utils/outils');
const { genererCarteClassement } = require('../../utils/carteClassement');
const logger = require('../../utils/logger');
const conf = require('../../../config');
const { req } = require('../../database/db');
const { infosNiveau, rangDe } = require('../../utils/niveaux');
const C = require('../../utils/composants');
const { E } = require('../../utils/emojis');
const { traducteur, localisations, t: tr, DEFAUT } = require('../../utils/langues');

// Une FONCTION, pas un tableau : les emojis du bot ne sont connus qu'apres
// la connexion a Discord, et un tableau construit au chargement du module
// figerait les replis Unicode pour toute la duree du processus.
const MEDAILLES = () => [E('premier'), E('deuxieme'), E('troisieme')];

/**
 * Les trois classements partagent l'affichage : seuls changent la requete,
 * les cles de titre/texte-vide et la ligne mise en avant sous chaque pseudo.
 */
const CLASSEMENTS = {
  xp: {
    titreCle: 'classement.titre_xp',
    videCle: 'classement.vide_xp',
    lignes: (guildId, limite, decalage) => req.classement.all(guildId, limite, decalage),
    total: (guildId) => req.totalMembresXp.get(guildId).n,
    valeur: (l) => `${abreger(l.xp)} XP`,
    mesure: (l) => l.xp,
    rang: (guildId, l) => rangDe(guildId, l.xp),
    detail: (l, { t, nombre, duree }) => t('classement.detail_xp', {
      niveau: infosNiveau(l.xp).niveau,
      xp: nombre(l.xp),
      messages: nombre(l.messages),
      extra: l.secondes_vocal > 60 ? t('classement.extra_vocal', { duree: duree(l.secondes_vocal * 1000) }) : '',
    }),
  },
  vocal: {
    titreCle: 'classement.titre_vocal',
    videCle: 'classement.vide_vocal',
    lignes: (guildId, limite, decalage) => req.classementVocal.all(guildId, limite, decalage),
    total: (guildId) => req.totalVocal.get(guildId).n,
    valeur: (l) => `${Math.floor(l.secondes_vocal / 3600)} h ${String(Math.floor((l.secondes_vocal % 3600) / 60)).padStart(2, '0')}`,
    mesure: (l) => l.secondes_vocal,
    rang: (guildId, l) => req.rangVocal.get(guildId, l.secondes_vocal).n + 1,
    detail: (l, { t, nombre, duree }) => t('classement.detail_vocal', {
      duree: duree(l.secondes_vocal * 1000),
      niveau: infosNiveau(l.xp).niveau,
      messages: nombre(l.messages),
    }),
  },
  messages: {
    titreCle: 'classement.titre_messages',
    videCle: 'classement.vide_messages',
    lignes: (guildId, limite, decalage) => req.classementMessages.all(guildId, limite, decalage),
    total: (guildId) => req.totalMessagesClasses.get(guildId).n,
    valeur: (l) => `${abreger(l.messages)} msg`,
    mesure: (l) => l.messages,
    rang: (guildId, l) => db.prepare('SELECT COUNT(*) AS n FROM xp WHERE guild_id = ? AND messages > ?').get(guildId, l.messages).n + 1,
    detail: (l, { t, nombre, duree }) => t('classement.detail_messages', {
      messages: nombre(l.messages),
      niveau: infosNiveau(l.xp).niveau,
      extra: l.secondes_vocal > 60 ? t('classement.extra_vocal', { duree: duree(l.secondes_vocal * 1000) }) : '',
    }),
  },
};

/**
 * Les composants d'une page. Toute la liste tient dans UN SEUL bloc de texte
 * plutot qu'un composant par ligne : avec la limite de 40 composants par
 * message, dix lignes chacune sur son propre composant grignoteraient la
 * marge pour rien (voir la mise en garde de la spec sur ce fichier).
 */
function construireElements(interaction, type, lignes, page, totalPages, totalMembres, langue) {
  const { t, nombre } = langue;
  const modele = CLASSEMENTS[type];
  const debut = page * conf.classementParPage;

  const description =
    lignes
      .map((l, i) => {
        const position = debut + i + 1;
        const prefixe = MEDAILLES()[position - 1] ?? `\`#${String(position).padStart(2, ' ')}\``;
        // Les etoiles de prestige suivent le membre dans tous les classements.
        const etoiles = l.prestige > 0 ? ` ${E('etoile').repeat(Math.min(l.prestige, 5))}${l.prestige > 5 ? `×${l.prestige}` : ''}` : '';
        return `${prefixe} <@${l.user_id}>${etoiles}\n> ${modele.detail(l, langue)}`;
      })
      .join('\n') || `*${t(modele.videCle)}*`;

  return [
    C.texte(`## ${E('classement')} ${t(modele.titreCle, { serveur: interaction.guild.name })}`),
    C.texte(description),
    // {n} n'apparait pas dans le texte : il ne sert qu'au choix singulier/pluriel,
    // { membres } porte le nombre formate (separateurs de milliers) qui, lui, s'affiche.
    C.texte(`-# ${t('classement.pied', { page: nombre(page + 1), total: nombre(totalPages), n: totalMembres, membres: nombre(totalMembres) })}`),
  ];
}

/**
 * L'image d'une page (Wumi 2.14) : deux colonnes de cinq, barres de
 * progression, ligne de l'auteur mise en avant, sa place en pied.
 */
async function imagePage(interaction, type, lignes, page, totalPages, totalMembres, langue) {
  const { t, nombre } = langue;
  const modele = CLASSEMENTS[type];
  const guild = interaction.guild;
  const debut = page * conf.classementParPage;
  const membres = await guild.members.fetch({ user: lignes.map((l) => l.user_id) }).catch(() => null);
  const max = Math.max(1, ...lignes.map((l) => modele.mesure(l)));
  const lignesImage = await Promise.all(lignes.map(async (l, i) => {
    const m = membres?.get(l.user_id);
    const u = m?.user ?? await interaction.client.users.fetch(l.user_id).catch(() => null);
    return {
      rang: debut + i + 1,
      nom: m?.displayName ?? u?.globalName ?? u?.username ?? `#${l.user_id.slice(-4)}`,
      avatar: (m ?? u)?.displayAvatarURL({ extension: 'png', size: 128 }) ?? null,
      valeur: modele.valeur(l),
      part: modele.mesure(l) / max,
      moi: l.user_id === interaction.user.id,
    };
  }));
  const moi = req.getXp.get(guild.id, interaction.user.id);
  const pied = moi && modele.mesure(moi) > 0
    ? t('classement.ta_place', { rang: nombre(modele.rang(guild.id, moi)), valeur: modele.valeur(moi), niveau: infosNiveau(moi.xp).niveau })
    : t('classement.pas_classe');
  const png = await genererCarteClassement({
    serveur: guild.name,
    icone: guild.iconURL({ extension: 'png', size: 256 }),
    sousTitre: t('classement.sous_titre', { page: nombre(page + 1), total: nombre(totalPages), n: totalMembres, membres: nombre(totalMembres) }),
    pastille: t(`classement.pastille_${type}`),
    lignes: lignesImage,
    pied,
  });
  return new AttachmentBuilder(png, { name: 'classement.png' });
}

function boutons(page, totalPages, langue, desactives = false) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('classement_precedent')
      .setLabel(langue.t('commun.precedent'))
      .setEmoji('◀️')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(desactives || page === 0),
    new ButtonBuilder()
      .setCustomId('classement_suivant')
      .setLabel(langue.t('commun.suivant'))
      .setEmoji('▶️')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(desactives || page >= totalPages - 1)
  );
}

module.exports = {
  categorie: 'niveau',

  data: new SlashCommandBuilder()
    .setName('leaderboard')
    .setNameLocalizations({ fr: 'classement' })
    .setDescription(tr('classement.description_commande', DEFAUT))
    .setDescriptionLocalizations(localisations('classement.description_commande'))
    .addStringOption((o) =>
      o
        .setName('type')
        .setDescription(tr('classement.opt_type', DEFAUT))
        .setDescriptionLocalizations(localisations('classement.opt_type'))
        .addChoices(
          { name: 'XP (default)', name_localizations: { fr: 'XP (par défaut)' }, value: 'xp' },
          { name: 'Voice time', name_localizations: { fr: 'Temps en vocal' }, value: 'vocal' },
          { name: 'Message count', name_localizations: { fr: 'Nombre de messages' }, value: 'messages' }
        )
    )
    .addIntegerOption((o) => o
      .setName('page')
      .setDescription(tr('classement.opt_page', DEFAUT))
      .setDescriptionLocalizations(localisations('classement.opt_page'))
      .setMinValue(1))
    .setContexts(InteractionContextType.Guild),

  async execute(interaction) {
    const langue = traducteur(interaction);
    const { t } = langue;
    await interaction.deferReply();

    const type = interaction.options.getString('type') ?? 'xp';
    const modele = CLASSEMENTS[type];
    const guildId = interaction.guild.id;

    const totalMembres = modele.total(guildId);
    if (totalMembres === 0) {
      return interaction.editReply(C.info(t(modele.videCle)));
    }

    const totalPages = Math.max(1, Math.ceil(totalMembres / conf.classementParPage));
    let page = Math.min(Math.max((interaction.options.getInteger('page') ?? 1) - 1, 0), totalPages - 1);

    const charger = (p) => modele.lignes(guildId, conf.classementParPage, p * conf.classementParPage);

    // L'image d'abord ; le texte reste en secours si le dessin echoue.
    const cache = new Map();
    const construireReponse = async (p, desactives = false) => {
      const lignes = charger(p);
      let fichier = cache.get(p);
      if (fichier === undefined) {
        fichier = await imagePage(interaction, type, lignes, p, totalPages, totalMembres, langue)
          .catch((e) => { logger.avertissement('Image du classement :', e.message); return null; });
        cache.set(p, fichier);
      }
      const pagination = totalPages > 1 ? [boutons(p, totalPages, langue, desactives)] : [];
      if (fichier) {
        return C.envoi([C.conteneur([C.image('attachment://classement.png'), ...pagination])], { files: [fichier], attachments: [] });
      }
      return C.envoi([C.conteneur([...construireElements(interaction, type, lignes, p, totalPages, totalMembres, langue), ...pagination])], { attachments: [] });
    };

    const message = await interaction.editReply(await construireReponse(page));

    if (totalPages <= 1) return;

    const collecteur = message.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: conf.dureePagination * 1000,
    });

    collecteur.on('collect', async (bouton) => {
      if (bouton.user.id !== interaction.user.id) {
        return bouton.reply(C.erreurPrivee(t('erreur.pas_pour_toi')));
      }
      page = bouton.customId === 'classement_suivant' ? Math.min(page + 1, totalPages - 1) : Math.max(page - 1, 0);
      await bouton.deferUpdate();
      await interaction.editReply(await construireReponse(page));
    });

    collecteur.on('end', () => {
      // Fin de la pagination : on grise les boutons sans renvoyer l'image.
      message.edit({ components: message.components.map((c) => {
        const j = c.toJSON();
        const desactiver = (x) => (x.type === 1 ? { ...x, components: x.components.map((b) => ({ ...b, disabled: true })) } : x);
        return j.type === 17 ? { ...j, components: j.components.map(desactiver) } : desactiver(j);
      }) }).catch(() => null);
    });
  },
};
