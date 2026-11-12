/**
 * /pseudo — change (ou remet a zero) le pseudo d'un membre sur le serveur.
 *
 * `normaliser` remplace un pseudo illisible ou impossible a mentionner
 * (caracteres speciaux, « zalgo », lettres stylisees) par une version
 * propre — c'est la demande la plus frequente des moderateurs.
 */
const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  InteractionContextType,
} = require('discord.js');
const C = require('../../utils/composants');
const { peutSanctionner } = require('../../utils/outils');
const { traducteur, localisations, t: tr, DEFAUT } = require('../../utils/langues');

/** Un pseudo lisible et mentionnable a partir de n'importe quoi. */
function normaliser(texte) {
  const propre = String(texte ?? '')
    .normalize('NFKD') // lettres stylisees (𝓐, Ａ...) -> lettres normales
    .replace(/[̀-ͯ҉᪰-᫿᷀-᷿⃐-⃿︠-︯]/g, '') // accents empiles
    .replace(/[^\p{L}\p{N} _.\-']/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
  return propre.length >= 2 ? propre.slice(0, 32) : null;
}

module.exports = {
  categorie: 'moderation',
  normaliser,

  data: new SlashCommandBuilder()
    .setName('nickname')
    .setNameLocalizations({ fr: 'pseudo' })
    .setDescription(tr('pseudo.description_commande', DEFAUT))
    .setDescriptionLocalizations(localisations('pseudo.description_commande'))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageNicknames)
    .setContexts(InteractionContextType.Guild)
    .addUserOption((o) => o
      .setName('member')
      .setNameLocalizations({ fr: 'membre' })
      .setDescription(tr('pseudo.opt_membre', DEFAUT))
      .setDescriptionLocalizations(localisations('pseudo.opt_membre'))
      .setRequired(true))
    .addStringOption((o) => o
      .setName('nickname')
      .setNameLocalizations({ fr: 'pseudo' })
      .setDescription(tr('pseudo.opt_pseudo', DEFAUT))
      .setDescriptionLocalizations(localisations('pseudo.opt_pseudo'))
      .setMaxLength(32))
    .addBooleanOption((o) => o
      .setName('clean')
      .setNameLocalizations({ fr: 'normaliser' })
      .setDescription(tr('pseudo.opt_normaliser', DEFAUT))
      .setDescriptionLocalizations(localisations('pseudo.opt_normaliser'))),

  async execute(interaction) {
    const { t } = traducteur(interaction);
    const cible = interaction.options.getUser('member');
    const voulu = interaction.options.getString('nickname');
    const nettoyer = interaction.options.getBoolean('clean') ?? false;

    const membre = await interaction.guild.members.fetch(cible.id).catch(() => null);
    if (!membre) return interaction.reply(C.erreurPrivee(t('pseudo.absent')));

    // Changer son propre pseudo est permis ; les autres suivent la hierarchie.
    if (membre.id !== interaction.user.id) {
      const cle = peutSanctionner(interaction.member, membre, interaction.guild.members.me);
      if (cle) return interaction.reply(C.erreurPrivee(t(cle)));
    } else if (!membre.manageable) {
      return interaction.reply(C.erreurPrivee(t('sanction.pas_gerable')));
    }

    const avant = membre.nickname;
    let nouveau = voulu ?? null;
    if (nettoyer) {
      nouveau = normaliser(voulu ?? membre.displayName) ?? t('pseudo.defaut', { n: membre.id.slice(-4) });
    }

    try {
      await membre.setNickname(nouveau, `${interaction.user.tag} : /pseudo`);
    } catch (e) {
      return interaction.reply(C.erreurPrivee(t('pseudo.impossible', { erreur: e.message })));
    }

    return interaction.reply(C.succes(nouveau
      ? t('pseudo.fait', { membre: `${membre}`, avant: avant ?? membre.user.username, apres: nouveau })
      : t('pseudo.reinitialise', { membre: `${membre}` })));
  },
};
