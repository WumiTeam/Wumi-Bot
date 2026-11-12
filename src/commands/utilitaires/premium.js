/**
 * /premium — l'etat du premium sur ce serveur, et comment le prendre.
 *
 * LE BOUTON D'ABONNEMENT EST UN BOUTON A PART.
 * Discord a un style de bouton dedie (`ButtonStyle.Premium`) : il ne porte ni
 * texte ni lien, seulement l'identifiant du SKU. Discord y met lui-meme le
 * nom, le prix et le tunnel de paiement. On ne fabrique donc PAS de page de
 * paiement, on ne demande jamais de numero de carte : tout se passe chez
 * Discord, c'est tout l'interet.
 *
 * Tant que le SKU n'existe pas (application pas encore verifiee, paiements pas
 * configures), le bouton n'apparait pas et la commande dit simplement ce que
 * le premium apportera. Mieux vaut ca qu'un bouton qui mene a une erreur.
 */
const {
  SlashCommandBuilder,
  InteractionContextType,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  MessageFlags,
} = require('discord.js');
const conf = require('../../../config');
const { E } = require('../../utils/emojis');
const C = require('../../utils/composants');
const premium = require('../../utils/premium');
const limites = require('../../utils/limites');
const liens = require('../../utils/liens');
const { traducteur, localisations, t: tr, DEFAUT } = require('../../utils/langues');
const { ts } = require('../../utils/outils');

module.exports = {
  categorie: 'utilitaires',

  data: new SlashCommandBuilder()
    .setName('premium')
    .setDescription(tr('premium.description_commande', DEFAUT))
    .setDescriptionLocalizations(localisations('premium.description_commande'))
    .setContexts(InteractionContextType.Guild),

  async execute(interaction) {
    const { t, nombre } = traducteur(interaction);
    const guildId = interaction.guild.id;
    const etat = premium.details(guildId);

    const elements = [C.texte(`## ${E('etoile')} ${t('premium.titre')}`)];

    if (etat.premium) {
      elements.push(C.texte(
        `${E('succes')} ${t('premium.actif', { serveur: interaction.guild.name })}`
        + (etat.jusqu_a ? `\n${t('premium.jusqu_a')} ${ts(etat.jusqu_a, 'D')} (${ts(etat.jusqu_a, 'R')})` : `\n${t('premium.sans_limite')}`)
        + `\n-# ${t(`premium.source.${etat.source}`)}`
      ));
    } else {
      elements.push(C.texte(t('premium.inactif')));
    }

    elements.push(C.separateur());

    // Le tableau des plafonds : c'est la seule chose qui compte vraiment, et
    // elle est tiree de la table des limites — pas recopiee a la main, donc
    // toujours exacte.
    const lignes = Object.entries(limites.PLAFONDS).map(([nom, p]) =>
      `· **${t(`premium.limite.${nom}`)}** — ${nombre(p.gratuit)} → **${nombre(p.premium)}**`);
    elements.push(C.texte(`${t('premium.ce_que_ca_change')}\n${lignes.join('\n')}`));
    elements.push(C.texte(`-# ${t('premium.jamais_retire')}`));

    const rangee = new ActionRowBuilder();

    // Le bouton d'abonnement de Discord, s'il y a quelque chose a vendre.
    if (premium.sku() && !etat.premium) {
      rangee.addComponents(new ButtonBuilder().setStyle(ButtonStyle.Premium).setSKUId(premium.sku()));
    }
    if (liens.support()) {
      rangee.addComponents(
        new ButtonBuilder().setLabel(t('invite.bouton_support')).setStyle(ButtonStyle.Link).setURL(liens.support())
      );
    }
    if (rangee.components.length) elements.push(rangee);
    else elements.push(C.texte(`-# ${t('premium.bientot')}`));

    return interaction.reply(
      C.envoi([C.conteneur(elements, conf.couleurs.principale)], { flags: MessageFlags.Ephemeral })
    );
  },
};
