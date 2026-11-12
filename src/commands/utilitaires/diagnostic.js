/**
 * /diagnostic — la mise en forme de ce que src/utils/diagnostic.js a trouve.
 *
 * TOUTE LA LOGIQUE EST DANS L'UTILITAIRE, PAS ICI. Ce fichier ne decide de
 * rien : il recoit deux listes de constats et les habille. C'est ce qui
 * permet au test de verifier les six familles de problemes sans fabriquer
 * une fausse interaction Discord.
 *
 * LE PARTI PRIS D'AFFICHAGE, QUI COMPTE AUTANT QUE LA DETECTION :
 *
 * Un diagnostic qui noie deux vrais problemes dans trente lignes de vert ne
 * sert a rien. Donc :
 *   - ce qui EMPECHE une fonction de marcher passe en premier, en rouge ;
 *   - ce qui merite attention suit, en orange ;
 *   - et quand tout va bien, ca tient en UNE phrase.
 *
 * Chaque constat dit QUOI FAIRE, pas seulement ce qui ne va pas. « Le salon
 * de bienvenue a ete supprime — choisis-en un autre dans /config » vaut mieux
 * que « salon_bienvenue invalide », qui oblige l'administrateur a deviner.
 *
 * LA LIMITE DES 40 COMPOSANTS est la vraie contrainte de forme : un serveur
 * bien casse peut accumuler vingt constats. On regroupe donc chaque famille
 * dans UN bloc de texte, jamais un composant par ligne.
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
const diagnostic = require('../../utils/diagnostic');
const liens = require('../../utils/liens');
const { traducteur, localisations, existe, t: tr, DEFAUT } = require('../../utils/langues');

/** Le nom lisible d'un reglage, tel que le panneau /config l'affiche. */
function nomReglage(cle, t) {
  const k = `config.r.${cle}.nom`;
  return existe(k) ? t(k) : `\`${cle}\``;
}

/**
 * Un constat, rendu en une ou plusieurs lignes de texte.
 * Rend `null` quand il n'y a rien a dire — l'appelant filtre.
 */
function rendre(constat, t, nombre) {
  switch (constat.categorie) {
    case 'permissions': {
      // Les noms de permissions sont deja traduits dans l'espace `permissions`.
      const liste = constat.permissions
        .map((p) => `**${existe(`permissions.${p}`) ? t(`permissions.${p}`) : p}**`)
        .join(', ');
      return t('diagnostic.permissions_texte', { liste });
    }

    case 'role_bas': {
      const lignes = constat.roles.map((r) => {
        const source = t(`diagnostic.role_source_${r.source}`, { detail: r.detail });
        const raison = t(`diagnostic.role_raison_${r.raison}`);
        return `· <@&${r.roleId}> — ${source} · ${raison}`;
      });
      return `${t('diagnostic.role_texte')}\n${lignes.join('\n')}`;
    }

    case 'salon_supprime':
      return `${t('diagnostic.salons_supprimes_texte')}\n`
        + constat.reglages.map((r) => `· ${nomReglage(r.cle, t)}`).join('\n');

    case 'salon_illisible':
      return `${t('diagnostic.salons_illisibles_texte')}\n`
        + constat.reglages.map((r) => `· ${nomReglage(r.cle, t)} — <#${r.salonId}>`).join('\n');

    case 'fonction_incomplete':
      return `· ${t(`diagnostic.incomplet_${constat.paire.id}`)}`;

    case 'intent': {
      const liste = constat.manquants
        .map((m) => `**${t(`admin.intent_${m === 'contenuMessages' ? 'contenu_messages' : 'membres'}`)}**`)
        .join(', ');
      return t('diagnostic.intents_texte', { liste });
    }

    default:
      return null;
  }
}

/**
 * Les constats d'un niveau, regroupes en blocs de texte.
 *
 * Les « fonctions a moitie reglees » arrivent une par une mais se lisent bien
 * ensemble : on les rassemble sous un seul intitule au lieu de repeter la
 * meme phrase d'introduction a chaque fois.
 */
function blocs(constats, t, nombre) {
  const incompletes = constats.filter((c) => c.categorie === 'fonction_incomplete');
  const autres = constats.filter((c) => c.categorie !== 'fonction_incomplete');

  const sortie = autres.map((c) => rendre(c, t, nombre)).filter(Boolean);
  if (incompletes.length) {
    sortie.push(
      `${t('diagnostic.incomplet_titre')}\n`
      + incompletes.map((c) => rendre(c, t, nombre)).join('\n')
    );
  }
  return sortie;
}

/**
 * La vue complete. Exportee pour que le test puisse la lire sans Discord.
 * @param {object} guild
 * @param {object} traducteurDuServeur le resultat de traducteur(interaction)
 */
function vue(guild, { t, nombre }) {
  const r = diagnostic.diagnostiquer(guild);
  const elements = [
    C.texte(`## ${E('chantier')} ${t('diagnostic.titre', { serveur: guild.name })}`),
    C.texte(`-# ${t('diagnostic.intro')}`),
  ];

  if (r.sain) {
    elements.push(C.separateur());
    elements.push(C.texte(`### ${E('succes')} ${t('diagnostic.sain_titre')}`));
    elements.push(C.texte(t('diagnostic.sain_texte')));
    return C.envoiPrive([C.conteneur(elements, conf.couleurs.succes)]);
  }

  const rouges = blocs(r.bloquant, t, nombre);
  const oranges = blocs(r.attention, t, nombre);

  if (rouges.length) {
    elements.push(C.separateur());
    elements.push(C.texte(`### ${E('erreur')} ${t('diagnostic.bloquant_titre')}`));
    for (const b of rouges) elements.push(C.texte(b));
  }

  if (oranges.length) {
    elements.push(C.separateur());
    elements.push(C.texte(`### ${E('avertissement')} ${t('diagnostic.attention_titre')}`));
    for (const b of oranges) elements.push(C.texte(b));
  }

  // On ne dit « le reste va bien » que s'il reste vraiment quelque chose a
  // rassurer : apres une seule remarque mineure, oui ; apres quinze
  // problemes bloquants, ce serait de la politesse deplacee.
  if (!rouges.length && oranges.length) {
    elements.push(C.separateur());
    elements.push(C.texte(`-# ${t('diagnostic.reste_texte')}`));
  }

  // Le bouton de reinvitation ne sert que dans UN cas : des permissions
  // manquantes. Ailleurs il n'aiderait pas, et un bouton qui ne resout pas le
  // probleme affiche juste au-dessus de lui est pire qu'inutile.
  const invitation = liens.invitation(null);
  if (invitation && r.bloquant.some((c) => c.categorie === 'permissions')) {
    elements.push(new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setLabel(t('invite.bouton_ajouter'))
        .setStyle(ButtonStyle.Link)
        .setURL(invitation)
    ));
  }

  return C.envoiPrive([
    C.conteneur(elements, rouges.length ? conf.couleurs.erreur : conf.couleurs.avertissement),
  ]);
}

module.exports = {
  categorie: 'utilitaires',

  data: new SlashCommandBuilder()
    .setName('diagnostic')
    // Meme mot dans les deux langues : pas de localisation de nom, sinon on
    // ferait traduire « diagnostic » par « diagnostic ».
    .setDescription(tr('diagnostic.description_commande', DEFAUT))
    .setDescriptionLocalizations(localisations('diagnostic.description_commande'))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setContexts(InteractionContextType.Guild),

  async execute(interaction) {
    const trad = traducteur(interaction);
    return interaction.reply(vue(interaction.guild, trad));
  },

  // Exportee pour le test
  vue,
};
