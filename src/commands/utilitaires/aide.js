/**
 * /aide — la liste des commandes, en Components V2.
 *
 * L'ancienne version envoyait un embed unique avec dix champs : quarante-huit
 * commandes d'affilee, un mur de texte que personne ne lit. Ici on ouvre sur un
 * sommaire, et un menu deroulant ouvre une categorie a la fois, dans le meme
 * message.
 *
 * Le menu porte l'identifiant de celui qui a lance la commande. Le message
 * reste public — on peut donc le montrer a quelqu'un — mais seul son
 * destinataire peut le piloter, sinon deux personnes se voleraient l'affichage.
 */
const { SlashCommandBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, MessageFlags } = require('discord.js');
const conf = require('../../../config');
const C = require('../../utils/composants');
const { E } = require('../../utils/emojis');
const { traducteur, localisations, LANGUES, t: tr, DEFAUT } = require('../../utils/langues');

// `emoji` porte le NOM COURT de l'emoji, pas le caractere : E() rend la
// version personnalisee si elle est installee sur l'application, sinon le
// repli Unicode. Les deux cas marchent, sans condition ailleurs dans le code.
// Le titre et le resume de chaque categorie vivent dans src/langues/, sous
// `aide.cat.<cle>`. Ici, il ne reste que l'emoji et l'ordre d'affichage.
const CATEGORIES = {
  niveau: { emoji: 'niveaux' },
  economie: { emoji: 'economie' },
  tickets: { emoji: 'tickets' },
  suggestions: { emoji: 'suggestions' },
  candidatures: { emoji: 'candidatures' },
  vocal: { emoji: 'vocal' },
  musique: { emoji: 'musique' },
  invitations: { emoji: 'invitations' },
  utilitaires: { emoji: 'utilitaires' },
  moderation: { emoji: 'moderation' },
  config: { emoji: 'config' },
};

/** Range les commandes chargees par categorie, triees par nom. */
function parCategorie(client) {
  const table = new Map();
  for (const commande of client.commandes.values()) {
    // Les commandes du fondateur n'existent que sur le serveur support et ne
    // regardent personne d'autre : elles n'ont rien a faire dans /aide.
    if (commande.fondateur || commande.beta || commande.support) continue;
    const cle = commande.categorie ?? 'utilitaires';
    if (!table.has(cle)) table.set(cle, []);
    table.get(cle).push(commande);
  }
  for (const liste of table.values()) liste.sort((a, b) => a.data.name.localeCompare(b.data.name));
  return table;
}

/**
 * Une commande, en une ligne, DANS LA LANGUE DU SERVEUR.
 *
 * `data.description` est toujours la description par defaut. Une commande deja
 * localisee porte aussi ses traductions : on va les chercher, sinon un serveur
 * anglais lirait une liste en francais alors que Discord, lui, lui montre la
 * bonne version dans le menu « / ».
 */
function ligne(commande, langue, t) {
  const j = typeof commande.data.toJSON === 'function' ? commande.data.toJSON() : commande.data;
  const codeDiscord = LANGUES[langue]?.discord;
  const nom = j.name_localizations?.[codeDiscord] ?? j.name;
  const description = j.description_localizations?.[codeDiscord] ?? j.description;

  // Les commandes de menu contextuel n'ont pas de description : on explique a
  // la place comment on les declenche, sinon la ligne serait vide.
  return description
    ? `\`/${nom}\` — ${description}`
    : `🖱️ **${nom}** — ${t('aide.clic_droit')}`;
}

function menu(client, auteurId, t, choisie = null) {
  const table = parCategorie(client);
  const options = Object.entries(CATEGORIES)
    .filter(([cle]) => table.get(cle)?.length)
    .map(([cle, meta]) => ({
      label: t(`aide.cat.${cle}.titre`),
      value: cle,
      emoji: E(meta.emoji),
      description: t('aide.combien', { n: table.get(cle).length }),
      default: cle === choisie,
    }));

  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`aide_cat_${auteurId}`)
      .setPlaceholder(t('aide.ouvrir'))
      .addOptions(options)
  );
}

/** Le sommaire : une ligne par categorie, avec son compte. */
function vueSommaire(client, auteurId, t) {
  const table = parCategorie(client);
  const lignes = Object.entries(CATEGORIES)
    .filter(([cle]) => table.get(cle)?.length)
    .map(([cle, meta]) => `${E(meta.emoji)} **${t(`aide.cat.${cle}.titre`)}** — ${table.get(cle).length}`)
    .join('\n');

  return C.conteneur([
    C.texte(`## ${client.user?.username ?? 'Blueprint'}\n${t('aide.intro')}`),
    C.separateur(),
    C.texte(lignes),
    C.separateur(),
    C.texte(`-# ${t('aide.pied', { n: client.commandes.size })}`),
    menu(client, auteurId, t),
  ]);
}

/** Une categorie ouverte : ses commandes, et de quoi revenir. */
function vueCategorie(client, auteurId, cle, t, langue) {
  const meta = CATEGORIES[cle];
  const commandes = parCategorie(client).get(cle) ?? [];

  const retour = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`aide_home_${auteurId}`)
      .setLabel(t('aide.toutes'))
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('↩️')
  );

  return C.conteneur([
    C.texte(`## ${E(meta.emoji)} ${t(`aide.cat.${cle}.titre`)}\n${t(`aide.cat.${cle}.resume`)}`),
    C.separateur(),
    C.texte(commandes.map((c) => ligne(c, langue, t)).join('\n') || `_${t('aide.vide')}_`),
    C.separateur(),
    menu(client, auteurId, t, cle),
    retour,
  ]);
}

module.exports = {
  categorie: 'utilitaires',

  data: new SlashCommandBuilder()
    .setName('aide')
    .setNameLocalizations({ 'en-US': 'help' })
    .setDescription(tr('aide.description_commande', DEFAUT))
    .setDescriptionLocalizations(localisations('aide.description_commande')),

  async execute(interaction, client) {
    const { t } = traducteur(interaction);
    return interaction.reply(C.envoi(vueSommaire(client, interaction.user.id, t)));
  },

  /** Menu et bouton. Route depuis interactionCreate via le prefixe « aide_ ». */
  async gererInteraction(interaction, client) {
    const { t, langue } = traducteur(interaction);
    const auteurId = interaction.customId.split('_').pop();
    if (interaction.user.id !== auteurId) {
      return interaction.reply({ content: t('aide.pas_la_tienne'), flags: MessageFlags.Ephemeral });
    }

    if (interaction.customId.startsWith('aide_home_')) {
      return interaction.update(C.envoi(vueSommaire(client, auteurId, t)));
    }
    if (interaction.customId.startsWith('aide_cat_')) {
      const cle = interaction.values?.[0];
      if (!CATEGORIES[cle]) return interaction.update(C.envoi(vueSommaire(client, auteurId, t)));
      return interaction.update(C.envoi(vueCategorie(client, auteurId, cle, t, langue)));
    }
    return null;
  },

  // Exportes pour les tests
  CATEGORIES,
  vueSommaire,
  vueCategorie,
};
