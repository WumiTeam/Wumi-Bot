/**
 * /config — le panneau de configuration.
 *
 * CETTE COMMANDE N'A PLUS DE SOUS-COMMANDES.
 *
 * Elle en avait une quarantaine, reparties en douze groupes. C'etait tenable
 * sur son propre serveur, ou l'on finit par connaitre les chemins par coeur.
 * Ca ne l'est pas sur un bot public : un administrateur qui decouvre Blueprint
 * ne parcourt pas douze groupes pour trouver ou se regle le salon des logs. Il
 * essaie deux fois, ne trouve pas, et retire le bot.
 *
 * Tout est donc passe dans un panneau : `/config`, un menu, des boutons. La
 * table des reglages et l'affichage vivent dans src/utils/panneauConfig.js —
 * ici, il ne reste que la porte d'entree.
 *
 * Le message est EPHEMERE : on y parle de salons de logs, de roles de staff et
 * de reglages de moderation. Ce n'est pas une conversation publique.
 */
const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  InteractionContextType,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
} = require('discord.js');
const conf = require('../../../config');
const C = require('../../utils/composants');
const { E } = require('../../utils/emojis');
const panneau = require('../../utils/panneauConfig');
const transfert = require('../../utils/configTransfert');
const { traducteur, localisations, t: tr, DEFAUT } = require('../../utils/langues');

module.exports = {
  categorie: 'config',

  data: new SlashCommandBuilder()
    .setName('config')
    .setDescription(tr('config.description_commande', DEFAUT))
    .setDescriptionLocalizations(localisations('config.description_commande'))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setContexts(InteractionContextType.Guild)
    // UNE OPTION, PAS UNE SOUS-COMMANDE. L'import a besoin d'une piece
    // jointe, et un bouton ne sait pas en recevoir. Une option facultative
    // sur la commande de base laisse `/config` tout seul ouvrir le panneau
    // comme avant, sans reintroduire l'arborescence qu'on a supprimee.
    .addAttachmentOption((o) => o
      .setName('file')
      .setNameLocalizations({ fr: 'fichier' })
      .setDescription(tr('configplus.import.opt_fichier', DEFAUT))
      .setDescriptionLocalizations(localisations('configplus.import.opt_fichier'))),

  async execute(interaction) {
    const fichier = interaction.options.getAttachment('file');
    if (!fichier) return interaction.reply(panneau.vueAccueil(interaction));

    const { t } = traducteur(interaction);

    // Un fichier de reglages fait quelques kilo-octets. Au-dela, ce n'en est
    // pas un — et on ne telecharge pas n'importe quoi pour s'en assurer.
    if (fichier.size > 256 * 1024) {
      return interaction.reply(C.erreurPrivee(t('configplus.import.trop_gros')));
    }

    await interaction.deferReply({ flags: 64 });

    let brut;
    try {
      const reponse = await fetch(fichier.url);
      if (!reponse.ok) throw new Error(String(reponse.status));
      brut = await reponse.text();
    } catch {
      return interaction.editReply(C.erreur(t('configplus.import.telechargement')));
    }

    const analyse = transfert.analyser(interaction.guild.id, brut);
    if (analyse.erreur) {
      return interaction.editReply(C.erreur(t(analyse.erreur, analyse.variables ?? {})));
    }
    if (!analyse.changements.length) {
      return interaction.editReply(C.info(t('configplus.import.rien', { ignores: analyse.ignoresSalonRole })));
    }

    // RIEN N'EST ECRIT AVANT LE CLIC. On annonce combien de reglages vont
    // changer et combien sont laisses de cote, puis on attend.
    const jeton = panneau.poserImport(interaction.user.id, analyse);
    return interaction.editReply(C.envoi([
      C.conteneur([
        C.texte(`## ${E('dossier')} ${t('configplus.import.titre')}`),
        C.texte(t('configplus.import.resume', {
          n: analyse.changements.length,
          ignores: analyse.ignoresSalonRole,
        })),
        C.texte(`-# ${t('configplus.import.pourquoi_ignores')}`),
        new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('cfg_accueil').setLabel(t('commun.annuler')).setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId(`cfg_import_ok_${jeton}`).setLabel(t('commun.confirmer')).setStyle(ButtonStyle.Primary)
        ),
      ], conf.couleurs.principale),
    ], { flags: 64 }));
  },

  /** Boutons, menus et fenetres du panneau. Route depuis interactionCreate. */
  gererInteraction: panneau.gererInteraction,
};
