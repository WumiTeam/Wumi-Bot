/**
 * Wumi 2.32 · Clic droit sur un message › Applications › « Traduire ».
 * Le message est traduit dans la langue Discord de la personne qui clique
 * (ou celle du serveur), par un modele d'IA qui tourne sur le serveur du bot :
 * rien n'est envoye a un service externe. Reponse visible d'elle seule.
 */
const {
  ContextMenuCommandBuilder, ApplicationCommandType, InteractionContextType, MessageFlags,
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
} = require('discord.js');
const C = require('../../utils/composants');
const { t: tr, LANGUES, depuisDiscord, langueDe } = require('../../utils/langues');
const { E } = require('../../utils/emojis');
const ia = require('../../utils/ia');

const ATTENTE_MS = 5000;
const derniers = new Map(); // membre -> horodatage

/** Le texte lisible d'un message : son contenu, sinon ses embeds. */
function texteDe(message) {
  const morceaux = [message.content];
  for (const e of message.embeds ?? []) morceaux.push(e.title, e.description, ...(e.fields ?? []).map((f) => `${f.name}\n${f.value}`));
  return morceaux.filter(Boolean).join('\n').trim();
}

module.exports = {
  categorie: 'utilitaires',

  data: new ContextMenuCommandBuilder()
    .setName('Translate')
    .setNameLocalizations({
      fr: 'Traduire',
      'es-ES': 'Traducir',
      'es-419': 'Traducir',
      de: 'Übersetzen',
      'pt-BR': 'Traduzir',
      it: 'Traduci',
    })
    .setType(ApplicationCommandType.Message)
    .setContexts(InteractionContextType.Guild),

  async execute(interaction) {
    // La langue de la personne qui clique, sinon celle du serveur.
    const cible = depuisDiscord(interaction.locale) ?? langueDe(interaction.guildId) ?? 'en';
    const t = (cle, v) => tr(cle, cible, v);
    const texte = texteDe(interaction.targetMessage);

    if (!texte) return interaction.reply(C.erreurPrivee(t('traduction.vide')));
    if (!(await ia.pret())) return interaction.reply(C.erreurPrivee(t('traduction.indisponible')));

    const maintenant = Date.now();
    if (maintenant - (derniers.get(interaction.user.id) ?? 0) < ATTENTE_MS) {
      return interaction.reply(C.erreurPrivee(t('traduction.trop_vite')));
    }
    derniers.set(interaction.user.id, maintenant);

    const source = ia.detecterLangue(texte);
    if (!source) return interaction.reply(C.erreurPrivee(t('traduction.langue_inconnue')));
    const nom = (l) => `${LANGUES[l]?.drapeau ?? ''} ${LANGUES[l]?.nom ?? l}`.trim();
    if (source === cible) return interaction.reply(C.infoPrivee(t('traduction.deja', { langue: nom(cible) })));

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const traduit = await ia.traduire(texte, source, cible);
    if (!traduit) return interaction.editReply(C.erreur(t('traduction.echec')));

    const cite = traduit.slice(0, 3500).split('\n').map((l) => `> ${l}`).join('\n');
    const lien = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel(t('traduction.voir_message')).setURL(interaction.targetMessage.url)
    );
    return interaction.editReply(C.envoi([C.conteneur([
      C.texte(`### ${E('langue')} ${t('traduction.titre')}\n-# ${nom(source)} › ${nom(cible)} · ${interaction.targetMessage.author}`),
      C.texte(cite),
      C.separateur(),
      C.texte(`-# ${t('traduction.pied')}`),
      lien,
    ])]));
  },
};
