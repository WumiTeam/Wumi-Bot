/**
 * /ban — bannir un membre, definitivement ou pour un temps donne.
 *
 * LE DEBANNISSEMENT AUTOMATIQUE N'EST PAS ICI. Un `setTimeout` de sept jours
 * ne survit pas a un redemarrage du bot, et un ban temporaire qui ne se leve
 * jamais est pire qu'un ban definitif assume. La date de fin est ecrite en
 * base, et la tache periodique (src/utils/taches.js) la relit — elle marche
 * donc meme si le bot a passe la nuit eteint.
 */
const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  InteractionContextType,
} = require('discord.js');
const C = require('../../utils/composants');
const { peutSanctionner, parserDuree } = require('../../utils/outils');
const { enregistrer } = require('../../utils/sanctions');
const { traducteur, localisations, t: tr, DEFAUT } = require('../../utils/langues');

module.exports = {
  categorie: 'moderation',

  data: new SlashCommandBuilder()
    .setName('ban')
    .setNameLocalizations({ fr: 'bannir' })
    .setDescription(tr('ban.description_commande', DEFAUT))
    .setDescriptionLocalizations(localisations('ban.description_commande'))
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .setContexts(InteractionContextType.Guild)
    // Les noms d'options sont traduits eux aussi : un anglophone tape
    // « member », un francophone « membre », et Discord montre a chacun le
    // sien. Une commande a moitie traduite se remarque tout de suite.
    .addUserOption((o) => o
      .setName('member')
      .setNameLocalizations({ fr: 'membre' })
      .setDescription(tr('ban.opt_membre', DEFAUT))
      .setDescriptionLocalizations(localisations('ban.opt_membre'))
      .setRequired(true))
    .addStringOption((o) => o
      .setName('reason')
      .setNameLocalizations({ fr: 'raison' })
      .setDescription(tr('ban.opt_raison', DEFAUT))
      .setDescriptionLocalizations(localisations('ban.opt_raison'))
      .setMaxLength(400))
    .addStringOption((o) => o
      .setName('purge')
      .setNameLocalizations({ fr: 'supprimer' })
      .setDescription(tr('ban.opt_supprimer', DEFAUT))
      .setDescriptionLocalizations(localisations('ban.opt_supprimer'))
      .addChoices(
        { name: 'None', name_localizations: { fr: 'Aucun' }, value: '0' },
        { name: 'Last 24 hours', name_localizations: { fr: 'Dernières 24 h' }, value: '1' },
        { name: 'Last 7 days', name_localizations: { fr: '7 derniers jours' }, value: '7' }
      ))
    .addStringOption((o) => o
      .setName('duration')
      .setNameLocalizations({ fr: 'duree' })
      .setDescription(tr('ban.opt_duree', DEFAUT))
      .setDescriptionLocalizations(localisations('ban.opt_duree'))),

  async execute(interaction) {
    const { t, duree: enDuree } = traducteur(interaction);

    const cible = interaction.options.getUser('member');
    const raison = interaction.options.getString('reason') ?? t('sanction.sans_raison');
    const jours = parseInt(interaction.options.getString('purge') ?? '0', 10);
    const dureeTexte = interaction.options.getString('duration');
    const duree = dureeTexte ? parserDuree(dureeTexte) : null;

    if (dureeTexte && !duree) {
      return interaction.reply(C.erreurPrivee(t('sanction.duree_invalide')));
    }

    const membre = await interaction.guild.members.fetch(cible.id).catch(() => null);
    if (membre) {
      // peutSanctionner rend une CLE, pas une phrase : c'est ici qu'on la
      // traduit, parce que c'est ici qu'on connait la langue du serveur.
      const cle = peutSanctionner(interaction.member, membre, interaction.guild.members.me);
      if (cle) return interaction.reply(C.erreurPrivee(t(cle)));
    }

    const dejaBanni = await interaction.guild.bans.fetch(cible.id).catch(() => null);
    if (dejaBanni) return interaction.reply(C.erreurPrivee(t('ban.deja_banni')));

    await interaction.deferReply();

    // Le MP part AVANT le ban (apres, Discord refuse : plus de serveur en
    // commun). Si le ban echoue, la sanction est retiree de l'historique.
    let id;
    try {
      id = await enregistrer({
        guild: interaction.guild,
        cible,
        moderateur: interaction.user,
        type: 'ban',
        raison,
        duree,
        prevenirEnMp: Boolean(membre),
        action: () => interaction.guild.members.ban(cible.id, {
          reason: `${raison} — ${interaction.user.tag}`,
          deleteMessageSeconds: jours * 86400,
        }),
      });
    } catch (e) {
      return interaction.editReply(C.erreur(t('ban.impossible', { erreur: e.message })));
    }

    return interaction.editReply(C.succes(
      (duree
        ? t('ban.fait_temporaire', { membre: cible.tag, duree: enDuree(duree) })
        : t('ban.fait', { membre: cible.tag }))
      + `\n> ${t('sanction.raison', { raison })}`
      + `\n-# ${t('sanction.numero', { n: id })}`
    ));
  },
};
