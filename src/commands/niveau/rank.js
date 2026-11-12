const { SlashCommandBuilder, AttachmentBuilder, InteractionContextType } = require('discord.js');
const { req, config } = require('../../database/db');
const { infosNiveau, rangDe } = require('../../utils/niveaux');
const { genererCarteRank } = require('../../utils/carteRank');
const C = require('../../utils/composants');
const themes = require('../../utils/themesRank');
const progression = require('../../utils/progression');
const fondsPerso = require('../../utils/fondsPerso');
const { traducteur, localisations, t: tr, DEFAUT } = require('../../utils/langues');

module.exports = {
  categorie: 'niveau',

  data: new SlashCommandBuilder()
    .setName('rank')
    .setDescription(tr('rank.description_commande', DEFAUT))
    .setDescriptionLocalizations(localisations('rank.description_commande'))
    .addUserOption((o) => o
      .setName('member')
      .setNameLocalizations({ fr: 'membre' })
      .setDescription(tr('rank.opt_membre', DEFAUT))
      .setDescriptionLocalizations(localisations('rank.opt_membre')))
    .addBooleanOption((o) => o
      .setName('animated')
      .setNameLocalizations({ fr: 'animee' })
      .setDescription(tr('rank.opt_animee', DEFAUT))
      .setDescriptionLocalizations(localisations('rank.opt_animee')))
    .setContexts(InteractionContextType.Guild),

  async execute(interaction) {
    await interaction.deferReply();

    const { t } = traducteur(interaction);
    const cfg = config(interaction.guild.id);
    if (!cfg.xp_actif) {
      return interaction.editReply(C.avertissement(t('rank.xp_desactive')));
    }

    const cible = interaction.options.getUser('member') ?? interaction.user;
    if (cible.bot) {
      return interaction.editReply(C.erreur(t('rank.bots_pas_xp')));
    }

    const ligne = req.getXp.get(interaction.guild.id, cible.id);
    if (!ligne || ligne.xp <= 0) {
      return interaction.editReply(C.info(
        cible.id === interaction.user.id
          ? t('rank.pas_encore_soi')
          : t('rank.pas_encore_autre', { pseudo: cible.username })
      ));
    }

    const infos = infosNiveau(ligne.xp);
    const rang = rangDe(interaction.guild.id, ligne.xp);
    const total = req.totalMembresXp.get(interaction.guild.id).n;

    const membre = await interaction.guild.members.fetch(cible.id).catch(() => null);
    const couleurRole = membre?.displayHexColor && membre.displayHexColor !== '#000000' ? membre.displayHexColor : null;

    const donnees = {
      pseudo: membre?.displayName ?? cible.username,
      tag: cible.username,
      avatarUrl: cible.displayAvatarURL({ extension: 'png', size: 256 }),
      niveau: infos.niveau,
      rang,
      totalMembres: total,
      xpActuel: infos.xpActuel,
      xpRequis: infos.xpRequis,
      xpTotal: infos.xpTotal,
      messages: ligne.messages,
      accent: couleurRole,
      theme: themes.themeDe(interaction.guild.id, cible.id),
      fondPerso: fondsPerso.fondDe(interaction.guild.id, cible.id),
      prestige: ligne.prestige ?? 0,
      badges: progression.badgesDe(interaction.guild.id, cible.id),
    };

    // La version animee coute environ deux secondes de calcul : on ne la
    // produit que si elle est demandee et autorisee sur le serveur.
    const demandeAnimee = interaction.options.getBoolean('animated');
    const alt = t('rank.alt_carte', { pseudo: cible.username });

    if (demandeAnimee && cfg.carte_animee_actif) {
      const gif = await require('../../utils/carteAnimee').genererCarteAnimee(donnees);
      const nomFichier = `rank-${cible.id}.gif`;
      // PIEGE V2 : une piece jointe ne s'affiche plus toute seule, il faut la
      // referencer explicitement par C.image('attachment://...').
      return interaction.editReply(
        C.envoi([C.conteneur([C.image(`attachment://${nomFichier}`, alt)])], {
          files: [new AttachmentBuilder(gif, { name: nomFichier })],
        })
      );
    }

    const png = await genererCarteRank(donnees);
    const nomFichier = `rank-${cible.id}.png`;
    return interaction.editReply(
      C.envoi([C.conteneur([
        // Si l'animation est demandee mais fermee sur le serveur, on le dit
        // plutot que de renvoyer une image fixe sans explication.
        demandeAnimee ? C.texte(t('rank.animee_desactivee')) : null,
        C.image(`attachment://${nomFichier}`, alt),
      ])], { files: [new AttachmentBuilder(png, { name: nomFichier })] })
    );
  },
};
