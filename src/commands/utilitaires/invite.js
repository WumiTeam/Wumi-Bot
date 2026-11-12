/**
 * /invite — le lien pour ajouter le bot ailleurs.
 *
 * C'est la commande qui fait grandir un bot public : quelqu'un le croise sur
 * un serveur, tape /invite, et l'ajoute au sien. Sans elle, il faut retrouver
 * le bot sur top.gg ou demander a un admin — autant dire que personne ne le
 * fait.
 *
 * ELLE MARCHE AUSSI EN MESSAGE PRIVE. C'est meme la que beaucoup la taperont :
 * on voit le bot quelque part, on lui ecrit en prive pour recuperer le lien.
 * `interaction.guild` est donc nul la-bas, et rien dans cette commande ne doit
 * le supposer present.
 *
 * ON NE DEMANDE PAS « ADMINISTRATEUR ». Le lien demande exactement les
 * permissions dont le bot se sert (voir src/utils/liens.js). Un serveur
 * inconnu a toutes les raisons de refuser un bot qui reclame les pleins
 * pouvoirs, et ca ne servirait a rien.
 */
const {
  SlashCommandBuilder,
  InteractionContextType,
  ApplicationIntegrationType,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  MessageFlags,
} = require('discord.js');
const conf = require('../../../config');
const { embeds } = require('../../utils/outils');
const { E } = require('../../utils/emojis');
const C = require('../../utils/composants');
const liens = require('../../utils/liens');
const topgg = require('../../utils/topgg');
const { traducteur, localisations, t: tr, DEFAUT } = require('../../utils/langues');

/**
 * La vue complete. Exportee : le message d'accueil et /aide peuvent la
 * reutiliser sans redessiner les memes boutons.
 */
function vueInvitation(interaction, client) {
  // En message prive il n'y a pas de serveur, donc pas de langue de serveur :
  // on retombe sur la langue par defaut du bot.
  const { t } = traducteur(interaction?.guild ?? null);

  const invitation = liens.invitation(client);
  if (!invitation) {
    return {
      embeds: [embeds.erreur(t('invite.sans_id'))],
      flags: MessageFlags.Ephemeral,
    };
  }

  const nom = client?.user?.username ?? 'Blueprint';
  const serveurs = client?.guilds?.cache?.size ?? 0;

  const elements = [
    C.texte(`## ${E('porte')} ${t('invite.titre', { bot: nom })}`),
    C.texte(t('invite.intro', { bot: nom })),
    C.separateur(),
    C.texte(t('invite.permissions', { n: liens.PERMISSIONS.length })),
  ];

  if (serveurs > 0) elements.push(C.texte(`-# ${t('invite.compteur', { n: serveurs })}`));

  const boutons = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setLabel(t('invite.bouton_ajouter'))
      .setStyle(ButtonStyle.Link)
      .setURL(invitation)
  );

  // Les trois suivants n'apparaissent que s'ils existent vraiment : un bouton
  // qui mene a une page vide est pire que pas de bouton du tout.
  const page = topgg.actif() ? topgg.lienPage(client) : null;
  if (page) {
    boutons.addComponents(
      new ButtonBuilder().setLabel(t('invite.bouton_topgg')).setStyle(ButtonStyle.Link).setURL(page)
    );
  }
  if (liens.support()) {
    boutons.addComponents(
      new ButtonBuilder().setLabel(t('invite.bouton_support')).setStyle(ButtonStyle.Link).setURL(liens.support())
    );
  }
  if (liens.site()) {
    boutons.addComponents(
      new ButtonBuilder().setLabel(t('invite.bouton_site')).setStyle(ButtonStyle.Link).setURL(liens.site())
    );
  }

  elements.push(boutons);

  return C.envoi([C.conteneur(elements, conf.couleurs.principale)]);
}

module.exports = {
  categorie: 'utilitaires',

  data: new SlashCommandBuilder()
    .setName('invite')
    // Un francophone tape « /inviter », un anglophone « /invite » : Discord
    // affiche a chacun le nom dans SA langue, sans que le bot ait a choisir.
    .setNameLocalizations({ fr: 'inviter' })
    .setDescription(tr('invite.description_commande', DEFAUT))
    .setDescriptionLocalizations(localisations('invite.description_commande'))
    // Utilisable partout : sur un serveur, en message prive au bot, et dans un
    // groupe. C'est une commande faite pour etre partagee.
    .setContexts(
      InteractionContextType.Guild,
      InteractionContextType.BotDM,
      InteractionContextType.PrivateChannel
    )
    .setIntegrationTypes(ApplicationIntegrationType.GuildInstall),

  async execute(interaction, client) {
    // Publique : c'est tout l'interet, que les autres voient le lien passer.
    return interaction.reply(vueInvitation(interaction, client));
  },

  // Exporte pour les tests et pour le message d'accueil
  vueInvitation,
};
