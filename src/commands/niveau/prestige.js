const {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  InteractionContextType,
} = require('discord.js');
const conf = require('../../../config');
const { req } = require('../../database/db');
const progression = require('../../utils/progression');
const { infosNiveau } = require('../../utils/niveaux');
const eco = require('../../utils/economie');
const { E } = require('../../utils/emojis');
const C = require('../../utils/composants');
const { traducteur, localisations, t: tr, DEFAUT } = require('../../utils/langues');

const P = conf.progression.prestige;

/** Bouton de confirmation : le prestige remet l'XP a zero, on ne le fait pas par megarde. */
function confirmation(userId, t) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`pres_ok_${userId}`)
      .setLabel(t('prestige.confirmer'))
      .setEmoji(E('etoile'))
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`pres_non_${userId}`).setLabel(t('commun.annuler')).setStyle(ButtonStyle.Secondary)
  );
}

/** Gere les deux boutons de confirmation. Route via le prefixe « pres_ », inchange. */
async function gererInteraction(interaction) {
  if (!interaction.isButton()) return;
  const { t, nombre } = traducteur(interaction);
  const [, action, proprietaire] = interaction.customId.split('_');

  if (interaction.user.id !== proprietaire) {
    return interaction.reply(C.erreurPrivee(t('erreur.pas_pour_toi')));
  }
  if (action === 'non') {
    return interaction.update(C.envoi([C.conteneur([C.texte(`${E('info')} ${t('prestige.annule')}`)])]));
  }

  const guildId = interaction.guild.id;
  const r = progression.passerPrestige(guildId, interaction.user.id);
  // r.raison vient de progression.js, un utilitaire hors de ce lot qui rend
  // encore du francais en dur (contrairement a peutSanctionner, deja corrige) :
  // on l'affiche tel quel, faute de pouvoir le traduire sans y toucher.
  if (!r.ok) return interaction.update(C.envoi([C.conteneur([C.texte(`${E('erreur')} ${r.raison}`)])]));

  progression.verifierBadges(guildId, interaction.user.id, interaction.member);

  return interaction.update(
    C.envoi([
      C.conteneur([
        C.texte(`## ${E('etoile')} ${t('prestige.succes_titre', { etoiles: nombre(r.etoiles) })}`),
        C.sectionVignette(
          t('prestige.succes_ligne', {
            id: interaction.user.id,
            etoiles: E('etoile').repeat(Math.min(r.etoiles, 10)),
          })
            + `\n\n${t('prestige.succes_bonus', { bonus: nombre(r.bonus) })}`
            + (r.monnaie ? `\n${t('prestige.succes_recompense', { somme: eco.somme(guildId, r.monnaie) })}` : '')
            + `\n\n${t('prestige.succes_pied')}`,
          interaction.user.displayAvatarURL({ size: 256 })
        ),
      ], conf.couleurs.succes),
    ])
  );
}

module.exports = {
  categorie: 'niveau',

  data: new SlashCommandBuilder()
    .setName('prestige')
    .setDescription(tr('prestige.description_commande', DEFAUT))
    .setDescriptionLocalizations(localisations('prestige.description_commande'))
    .setContexts(InteractionContextType.Guild)
    .addUserOption((o) => o
      .setName('member')
      .setNameLocalizations({ fr: 'membre' })
      .setDescription(tr('prestige.opt_membre', DEFAUT))
      .setDescriptionLocalizations(localisations('prestige.opt_membre'))),

  gererInteraction,

  async execute(interaction) {
    const { t, nombre } = traducteur(interaction);
    const guildId = interaction.guild.id;
    const autre = interaction.options.getUser('member');

    // ------------------------------------------------ CONSULTER QUELQU'UN
    if (autre && autre.id !== interaction.user.id) {
      const ligne = req.getXp.get(guildId, autre.id);
      const etoiles = ligne?.prestige ?? 0;
      return interaction.reply(C.info(
        etoiles
          // {n} choisit le singulier / pluriel ; {etoiles} est la valeur affichee (formatee).
          ? t('prestige.consultation', {
              n: etoiles,
              pseudo: autre.username,
              etoiles: nombre(etoiles),
              badges: E('etoile').repeat(Math.min(etoiles, 10)),
              bonus: nombre(Math.round(etoiles * P.bonusXpParEtoile * 100)),
            })
          : t('prestige.consultation_vide', { pseudo: autre.username })
      ));
    }

    const ligne = req.getXp.get(guildId, interaction.user.id);
    const niveau = infosNiveau(ligne?.xp ?? 0).niveau;
    const etoiles = ligne?.prestige ?? 0;
    const verif = progression.peutPrestige(guildId, interaction.user.id);

    const elements = [
      C.texte(`## ${E('etoile')} ${t('prestige.titre')}`),
      C.texte(t('prestige.intro', { niveauRequis: nombre(P.niveauRequis) })),
      C.separateur(),
      C.texte(
        `**${t('prestige.champ_niveau')}**\n${nombre(niveau)} / ${nombre(P.niveauRequis)}\n\n`
        + `**${t('prestige.champ_etoiles')}**\n${etoiles ? E('etoile').repeat(Math.min(etoiles, 10)) : t('prestige.aucune_etoile')}\n\n`
        + `**${t('prestige.champ_bonus')}**\n${t('prestige.bonus_xp', { n: nombre(Math.round(etoiles * P.bonusXpParEtoile * 100)) })}`
      ),
      C.texte(
        `**${t('prestige.champ_prochain')}**\n`
        + `${E('etoile')} ${t('prestige.prochain_etoile')}\n`
        + `${E('niveaux')} ${t('prestige.prochain_xp', { n: nombre(Math.round(P.bonusXpParEtoile * 100)) })}\n`
        + `${E('classement')} ${t('prestige.prochain_monnaie', { n: nombre(P.monnaieOfferte) })}`
      ),
    ];

    if (!verif.ok) {
      // verif.raison : meme limite que plus haut, cle non disponible en amont.
      elements.push(C.texte(`-# ${verif.raison}`));
      return interaction.reply(C.envoi([C.conteneur(elements)]));
    }

    elements.push(C.texte(`-# ${t('prestige.pied_definitif')}`));
    // Le bouton de confirmation est un element du conteneur comme un autre :
    // conteneur() route une ActionRow vers addActionRowComponents toute seule.
    elements.push(confirmation(interaction.user.id, t));
    return interaction.reply(C.envoi([C.conteneur(elements)]));
  },
};
