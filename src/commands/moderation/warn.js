/**
 * /warn — avertir un membre, et laisser l'escalade faire le reste.
 *
 * L'ESCALADE EST DANS LE TABLEAU CI-DESSOUS, PAS DANS LE CODE. Un moderateur
 * qui veut durcir ou adoucir son serveur change un nombre ; il n'a pas a relire
 * la commande. Les paliers sont comptes sur les avertissements ACTIFS : vider
 * l'historique d'un membre (`/sanctions clear`) remet donc son compteur a zero,
 * ce qui est le comportement attendu d'une seconde chance.
 */
const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  InteractionContextType,
} = require('discord.js');
const C = require('../../utils/composants');
const { peutSanctionner } = require('../../utils/outils');
const { enregistrer, avertissementsActifs } = require('../../utils/sanctions');
const { E } = require('../../utils/emojis');
const { traducteur, localisations, t: tr, DEFAUT } = require('../../utils/langues');

/**
 * Sanctions automatiques selon le nombre d'avertissements actifs.
 * Modifie librement ce tableau pour adapter l'escalade a ton serveur.
 */
// L'echelle est maintenant PROPRE A CHAQUE SERVEUR (/paliers, tableau de
// bord). Sans reglage, c'est l'echelle par defaut de src/utils/paliers.js :
// 3 → mute 1 h, 5 → mute 24 h, 7 → expulsion, 10 → bannissement.
const paliers = require('../../utils/paliers');

module.exports = {
  categorie: 'moderation',

  data: new SlashCommandBuilder()
    .setName('warn')
    .setNameLocalizations({ fr: 'avertir' })
    .setDescription(tr('warn.description_commande', DEFAUT))
    .setDescriptionLocalizations(localisations('warn.description_commande'))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .setContexts(InteractionContextType.Guild)
    .addUserOption((o) => o
      .setName('member')
      .setNameLocalizations({ fr: 'membre' })
      .setDescription(tr('warn.opt_membre', DEFAUT))
      .setDescriptionLocalizations(localisations('warn.opt_membre'))
      .setRequired(true))
    .addStringOption((o) => o
      .setName('reason')
      .setNameLocalizations({ fr: 'raison' })
      .setDescription(tr('warn.opt_raison', DEFAUT))
      .setDescriptionLocalizations(localisations('warn.opt_raison'))
      .setRequired(true)
      .setMaxLength(400)),

  async execute(interaction) {
    const { t, duree: enDuree } = traducteur(interaction);

    const cible = interaction.options.getUser('member');
    const raison = interaction.options.getString('reason');

    const membre = await interaction.guild.members.fetch(cible.id).catch(() => null);
    if (!membre) {
      return interaction.reply(C.erreurPrivee(t('warn.pas_sur_serveur')));
    }

    // peutSanctionner rend une CLE, pas une phrase : c'est ici qu'on la
    // traduit, parce que c'est ici qu'on connait la langue du serveur.
    const cle = peutSanctionner(interaction.member, membre, interaction.guild.members.me);
    if (cle) return interaction.reply(C.erreurPrivee(t(cle)));

    await interaction.deferReply();

    const id = await enregistrer({
      guild: interaction.guild,
      cible,
      moderateur: interaction.user,
      type: 'warn',
      raison,
    });

    const total = avertissementsActifs(interaction.guild.id, cible.id).length;
    let suite = '';

    // ------------------------------------------------------------ ESCALADE
    const action = paliers.lire(interaction.guild.id)[total];
    if (action) {
      // Le motif ecrit dans l'historique ET dans le journal d'audit Discord :
      // une seule phrase, traduite dans la langue du serveur.
      const motif = t('warn.escalade_raison', { n: total });
      try {
        if (action.type === 'mute' && membre.moderatable) {
          await membre.timeout(action.duree, motif);
          await enregistrer({
            guild: interaction.guild,
            cible,
            moderateur: interaction.client.user,
            type: 'mute',
            raison: motif,
            duree: action.duree,
          });
          suite = `\n${E('moderation')} ${t('warn.escalade_mute', { duree: enDuree(action.duree) })}`;
        } else if (action.type === 'kick' && membre.kickable) {
          await enregistrer({
            guild: interaction.guild,
            cible,
            moderateur: interaction.client.user,
            type: 'kick',
            raison: motif,
          });
          await membre.kick(motif);
          suite = `\n${E('moderation')} ${t('warn.escalade_kick')}`;
        } else if (action.type === 'ban' && membre.bannable) {
          await enregistrer({
            guild: interaction.guild,
            cible,
            moderateur: interaction.client.user,
            type: 'ban',
            raison: motif,
          });
          await membre.ban({ reason: motif });
          suite = `\n${E('moderation')} ${t('warn.escalade_ban')}`;
        }
      } catch {
        suite = `\n${E('avertissement')} ${t('warn.escalade_impossible')}`;
      }
    }

    return interaction.editReply(C.succes(
      t('warn.fait', { membre: cible.tag, n: total })
      + `\n> ${t('sanction.raison', { raison })}`
      + suite
      + `\n-# ${t('sanction.numero', { n: id })}`
    ));
  },
};
