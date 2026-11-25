/**
 * EDITION MODMAIL (2.40) : un petit bot a part, rien que pour le modmail du
 * serveur support. Meme code que Wumi, mais :
 *   - aucune commande slash ;
 *   - seuls les evenements du modmail sont branches (MP, fils du staff,
 *     boutons) : pas d'XP, pas de bienvenue, pas d'automod en double ;
 *   - le salon des conversations vient de MODMAIL_SALON_ID (et le role a
 *     mentionner de MODMAIL_ROLE_ID), faute de /admin dans cette edition.
 * Wumi, de son cote, renvoie vers ce bot quand MODMAIL_BOT_ID est rempli
 * dans son .env (voir src/utils/modmail.js).
 */
module.exports = {
  cle: 'modmail',
  marque: process.env.EDITION_MARQUE || 'Wumi Modmail',
  langue: null,
  categories: [],
  sans: [],
  premium: false,
  modmailSeul: true,
  evenements: ['interactionCreate.js', 'messageCreate.js'],
};
