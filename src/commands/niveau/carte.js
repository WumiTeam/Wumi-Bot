const { SlashCommandBuilder, AttachmentBuilder, InteractionContextType, MessageFlags } = require('discord.js');
const { req, config } = require('../../database/db');
const fondsPerso = require('../../utils/fondsPerso');
const themes = require('../../utils/themesRank');
const progression = require('../../utils/progression');
const { genererCarteRank } = require('../../utils/carteRank');
const { oublierFondPerso } = require('../../utils/fondCarte');
const { infosNiveau, rangDe } = require('../../utils/niveaux');
const C = require('../../utils/composants');
const { traducteur, localisations, t: tr, DEFAUT } = require('../../utils/langues');

module.exports = {
  categorie: 'niveau',

  data: new SlashCommandBuilder()
    .setName('card')
    .setNameLocalizations({ fr: 'carte' })
    .setDescription(tr('carte.description_commande', DEFAUT))
    .setDescriptionLocalizations(localisations('carte.description_commande'))
    .setContexts(InteractionContextType.Guild)

    .addSubcommand((s) => s
      .setName('background')
      .setNameLocalizations({ fr: 'fond' })
      .setDescription(tr('carte.sous_fond', DEFAUT))
      .setDescriptionLocalizations(localisations('carte.sous_fond'))
      .addAttachmentOption((o) => o
        .setName('image')
        .setDescription(tr('carte.opt_image', DEFAUT))
        .setDescriptionLocalizations(localisations('carte.opt_image'))
        .setRequired(true)))
    .addSubcommand((s) => s
      .setName('remove')
      .setNameLocalizations({ fr: 'retirer' })
      .setDescription(tr('carte.sous_retirer', DEFAUT))
      .setDescriptionLocalizations(localisations('carte.sous_retirer')))
    .addSubcommand((s) => s
      .setName('view')
      .setNameLocalizations({ fr: 'voir' })
      .setDescription(tr('carte.sous_voir', DEFAUT))
      .setDescriptionLocalizations(localisations('carte.sous_voir'))),

  async execute(interaction) {
    const { t } = traducteur(interaction);
    const guildId = interaction.guild.id;
    const userId = interaction.user.id;
    const sous = interaction.options.getSubcommand();

    if (!fondsPerso.actif(guildId) && sous !== 'view') {
      return interaction.reply(
        C.avertissementPrivee(t('carte.desactivee', { categorie: t('config.cat.niveaux') }))
      );
    }

    /** Rend la carte du membre avec ses reglages actuels. */
    const rendre = async () => {
      const ligne = req.getXp.get(guildId, userId);
      const infos = infosNiveau(ligne?.xp ?? 0);
      const membre = interaction.member;
      return genererCarteRank({
        pseudo: membre?.displayName ?? interaction.user.username,
        tag: interaction.user.username,
        avatarUrl: interaction.user.displayAvatarURL({ extension: 'png', size: 256 }),
        niveau: infos.niveau,
        rang: ligne?.xp ? rangDe(guildId, ligne.xp) : req.totalMembresXp.get(guildId).n + 1,
        totalMembres: req.totalMembresXp.get(guildId).n,
        xpActuel: infos.xpActuel,
        xpRequis: infos.xpRequis,
        xpTotal: infos.xpTotal,
        messages: ligne?.messages ?? 0,
        accent: membre?.displayHexColor && membre.displayHexColor !== '#000000' ? membre.displayHexColor : null,
        theme: themes.themeDe(guildId, userId),
        fondPerso: fondsPerso.fondDe(guildId, userId),
        prestige: ligne?.prestige ?? 0,
        badges: progression.badgesDe(guildId, userId),
      });
    };

    // ---------------------------------------------------------------- VOIR
    if (sous === 'view') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const png = await rendre();
      // La reponse reste ephemere : le drapeau a ete pose au deferReply, et
      // Discord le garde meme si editReply ne le repasse pas (meme
      // convention que /clear, deja validee).
      return interaction.editReply(C.envoi([
        C.conteneur([
          C.texte(fondsPerso.fondDe(guildId, userId) ? t('carte.voir_perso') : t('carte.voir_serveur')),
          C.image('attachment://carte.png'),
        ]),
      ], { files: [new AttachmentBuilder(png, { name: 'carte.png' })] }));
    }

    // ------------------------------------------------------------- RETIRER
    if (sous === 'remove') {
      if (!req.fondPersoDe.get(guildId, userId)) {
        return interaction.reply(C.infoPrivee(t('carte.aucun_fond')));
      }
      oublierFondPerso(require('node:path').join(fondsPerso.dossier(), `${guildId}-${userId}.png`));
      fondsPerso.retirer(guildId, userId);
      return interaction.reply(C.succes(t('carte.retire')));
    }

    // ---------------------------------------------------------------- FOND
    await interaction.deferReply();
    const piece = interaction.options.getAttachment('image');
    const r = await fondsPerso.enregistrer(guildId, userId, piece);
    // ATTENTION : r.raison vient de src/utils/fondsPerso.js, un utilitaire
    // partage hors de ce lot, et elle est ecrite en dur en francais (taille,
    // format, echec de telechargement...). Impossible de la traduire au
    // point d'appel sans reimplementer sa logique de validation : elle
    // ressort telle quelle, meme sur un serveur anglophone. Signale dans le
    // rapport.
    if (!r.ok) return interaction.editReply(C.erreur(r.raison));

    // Le cache garde l'ancienne image : on l'oublie avant de redessiner.
    oublierFondPerso(require('node:path').join(fondsPerso.dossier(), `${guildId}-${userId}.png`));
    const png = await rendre();

    return interaction.editReply(C.succes(t('carte.enregistre'), {
      elements: [C.image('attachment://carte.png')],
      files: [new AttachmentBuilder(png, { name: 'carte.png' })],
    }));
  },
};
