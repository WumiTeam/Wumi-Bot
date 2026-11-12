const { ContextMenuCommandBuilder, ApplicationCommandType, InteractionContextType } = require('discord.js');
const { ouvrirFenetre } = require('../../utils/signalements');

/**
 * Commande de menu contextuel : clic droit sur un message > Applications >
 * « Report Message » / « Signaler le message ». Ouvre une fenetre qui demande
 * la raison.
 *
 * PAS DE `setDescription` : Discord n'accepte aucune description sur les
 * commandes de menu contextuel, seulement un nom.
 *
 * LE CORPS DU SIGNALEMENT N'EST PAS ICI. Les verifications, la fenetre, la
 * fiche envoyee a l'equipe et ses boutons ("sig_*", routes directement par
 * src/events/interactionCreate.js) vivent dans src/utils/signalements.js.
 *
 * Cet utilitaire est traduit lui aussi : il repond directement aux
 * interactions, donc il appelle `traducteur(interaction)` de son cote plutot
 * que de rendre la main au point d'appel. Les deux facons de faire coexistent
 * dans le projet selon ce dont dispose la fonction : `peutSanctionner`
 * (outils.js) rend une CLE parce qu'elle ne voit pas l'interaction, alors
 * qu'ici `ouvrirFenetre` l'a sous la main et traduit elle-meme.
 *
 * Ce qui n'est JAMAIS traduit : le texte du message signale. Il est garde tel
 * quel pour que l'equipe puisse le lire meme si son auteur l'a supprime
 * depuis — le reformuler, meme fidelement, en ferait une citation et plus une
 * piece.
 */
module.exports = {
  categorie: 'moderation',

  data: new ContextMenuCommandBuilder()
    .setName('Report Message')
    .setNameLocalizations({ fr: 'Signaler le message' })
    .setType(ApplicationCommandType.Message)
    .setContexts(InteractionContextType.Guild),

  async execute(interaction) {
    return ouvrirFenetre(interaction);
  },
};
