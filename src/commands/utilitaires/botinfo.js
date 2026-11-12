/**
 * /botinfo — l'etat du bot.
 *
 * Sur un bot public, c'est une commande de confiance : elle dit sur combien de
 * serveurs il tourne, depuis combien de temps il n'a pas redemarre, et a quelle
 * vitesse il repond. Un bot qui affiche « en ligne depuis 40 jours » rassure
 * infiniment plus qu'une page de promesses.
 *
 * ELLE COMPTE JUSTE, MEME AVEC PLUSIEURS SHARDS.
 * Au-dela de 2500 serveurs, Discord impose de repartir le bot sur plusieurs
 * processus. Chaque processus ne voit alors QUE ses propres serveurs :
 * `client.guilds.cache.size` donnerait un chiffre faux, et personne ne s'en
 * apercevrait — il serait simplement trop petit. On demande donc la somme a
 * tous les shards quand il y en a.
 */
const {
  SlashCommandBuilder,
  InteractionContextType,
  ApplicationIntegrationType,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
} = require('discord.js');
const os = require('node:os');
const conf = require('../../../config');
const { E } = require('../../utils/emojis');
const C = require('../../utils/composants');
const liens = require('../../utils/liens');
const topgg = require('../../utils/topgg');
const { traducteur, localisations, t: tr, DEFAUT } = require('../../utils/langues');
const { version } = require('../../../package.json');

/**
 * Les chiffres du bot, additionnes sur tous les shards.
 * Sans sharding, `client.shard` est nul : on lit simplement le cache local.
 */
async function chiffres(client) {
  if (!client.shard) {
    return {
      serveurs: client.guilds.cache.size,
      membres: client.guilds.cache.reduce((n, g) => n + (g.memberCount ?? 0), 0),
      shards: 1,
      latence: Math.round(client.ws.ping),
    };
  }

  const [serveurs, membres, latences] = await Promise.all([
    client.shard.fetchClientValues('guilds.cache.size'),
    client.shard.broadcastEval((c) => c.guilds.cache.reduce((n, g) => n + (g.memberCount ?? 0), 0)),
    client.shard.fetchClientValues('ws.ping'),
  ]);

  return {
    serveurs: serveurs.reduce((a, b) => a + (b ?? 0), 0),
    membres: membres.reduce((a, b) => a + (b ?? 0), 0),
    shards: client.shard.count,
    latence: Math.round(latences.reduce((a, b) => a + (b ?? 0), 0) / latences.length),
  };
}

module.exports = {
  categorie: 'utilitaires',

  data: new SlashCommandBuilder()
    .setName('botinfo')
    .setDescription(tr('botinfo.description_commande', DEFAUT))
    .setDescriptionLocalizations(localisations('botinfo.description_commande'))
    .setContexts(
      InteractionContextType.Guild,
      InteractionContextType.BotDM,
      InteractionContextType.PrivateChannel
    )
    .setIntegrationTypes(ApplicationIntegrationType.GuildInstall),

  async execute(interaction, client) {
    const { t, nombre, duree } = traducteur(interaction?.guild ?? null);
    await interaction.deferReply();

    const c = await chiffres(client);
    const memoire = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);

    const elements = [
      C.texte(`## ${E('robot')} ${client.user?.username ?? 'Blueprint'}`),
      C.texte(t('botinfo.intro')),
      C.separateur(),
      C.texte([
        `${E('membres')} **${nombre(c.serveurs)}** ${t('botinfo.serveurs')} · **${nombre(c.membres)}** ${t('botinfo.membres')}`,
        `${E('config')} **${client.commandes?.size ?? 0}** ${t('botinfo.commandes')}`,
        `${E('enligne')} ${t('botinfo.en_ligne')} **${duree(client.uptime)}**`,
        `${E('statistiques')} ${t('botinfo.latence')} **${c.latence} ms**`
          + (c.shards > 1 ? ` · **${c.shards}** shards` : ''),
      ].join('\n')),
      C.separateur(),
      C.texte(`-# Wumi by Zhaak v${version} · discord.js ${require('discord.js').version} · Node ${process.version} · ${memoire} Mo · ${os.platform()}`),
    ];

    const boutons = new ActionRowBuilder();
    const invitation = liens.invitation(client);
    if (invitation) {
      boutons.addComponents(
        new ButtonBuilder().setLabel(t('invite.bouton_ajouter')).setStyle(ButtonStyle.Link).setURL(invitation)
      );
    }
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
    if (boutons.components.length) elements.push(boutons);

    return interaction.editReply(C.envoi([C.conteneur(elements, conf.couleurs.principale)]));
  },

  // Exporte pour les tests
  chiffres,
};
