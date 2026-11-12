/**
 * /docs (/doc en francais) — renvoie vers la liste des commandes du site
 * (https://wumi.fr/commandes/), generee a partir du bot lui-meme.
 *
 * Avec l'option `commande`, le lien ouvre la page deja filtree sur cette
 * commande (?q=), et la carte en donne la description.
 */
const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const conf = require('../../../config');
const C = require('../../utils/composants');
const { traducteur, localisations, t: tr, DEFAUT } = require('../../utils/langues');

const SITE = 'https://wumi.fr';
const SUPPORT = 'https://discord.gg/VaGrXgnAHS';

/** Les commandes publiques (ni fondateur, ni beta, ni reservees au support). */
function publiques(client) {
  return [...(client.commandes?.values() ?? [])].filter((c) => c?.data && !c.fondateur && !c.beta && !c.support);
}

/** Code de langue Discord pour les localisations. */
const lc = (l) => (l === 'en' ? 'en-US' : l);

function lien(langue, q) {
  const p = new URLSearchParams({ lang: langue });
  if (q) p.set('q', q);
  return `${SITE}/commandes/?${p}`;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('docs')
    .setNameLocalizations({ fr: 'doc' })
    .setDescription(tr('docs.description', DEFAUT))
    .setDescriptionLocalizations(localisations('docs.description'))
    .addStringOption((o) => o
      .setName('command')
      .setNameLocalizations({ fr: 'commande' })
      .setDescription(tr('docs.opt_commande', DEFAUT))
      .setDescriptionLocalizations(localisations('docs.opt_commande'))
      .setAutocomplete(true)),

  categorie: 'utilitaires',

  async autocomplete(interaction) {
    const client = interaction.client;
    const saisie = String(interaction.options.getFocused() ?? '').toLowerCase();
    const { langue } = traducteur(interaction);
    const liste = publiques(client)
      .map((c) => {
        const j = c.data.toJSON();
        const nom = j.name_localizations?.[lc(langue)] ?? j.name;
        return { nom, valeur: j.name, desc: j.description_localizations?.[lc(langue)] ?? j.description };
      })
      .filter((c) => c.nom.includes(saisie) || c.valeur.includes(saisie))
      .sort((a, b) => a.nom.localeCompare(b.nom))
      .slice(0, 25);
    return interaction.respond(liste.map((c) => ({ name: `/${c.nom} — ${c.desc}`.slice(0, 100), value: c.valeur })));
  },

  async execute(interaction, client) {
    const { t, langue, nombre } = traducteur(interaction);
    const toutes = publiques(client);
    const categories = new Set(toutes.map((c) => c.categorie ?? 'utilitaires'));
    const demandee = interaction.options.getString('command');

    const blocs = [
      C.texte(`# 📖 ${t('docs.titre')}\n${t('docs.intro')}`),
      C.separateur(),
      C.texte(t('docs.stats', { n: nombre(toutes.length), c: nombre(categories.size) })),
    ];

    let q = null;
    if (demandee) {
      const cmd = toutes.find((c) => c.data.name === demandee);
      if (cmd) {
        const j = cmd.data.toJSON();
        const nom = j.name_localizations?.[lc(langue)] ?? j.name;
        const desc = j.description_localizations?.[lc(langue)] ?? j.description;
        const sous = (j.options ?? []).filter((o) => o.type === 1 || o.type === 2).length;
        q = j.name;
        blocs.push(C.separateur());
        blocs.push(C.texte(`### \`/${nom}\`\n${desc}${sous ? `\n-# ${t('docs.sous', { n: sous })}` : ''}`));
      } else {
        blocs.push(C.texte(`-# ${t('docs.introuvable', { nom: demandee })}`));
      }
    }

    blocs.push(new ActionRowBuilder().addComponents(
      new ButtonBuilder().setLabel(q ? t('docs.bouton_commande') : t('docs.bouton_toutes')).setEmoji('📖').setStyle(ButtonStyle.Link).setURL(lien(langue, q)),
      new ButtonBuilder().setLabel(t('docs.bouton_site')).setEmoji('🌐').setStyle(ButtonStyle.Link).setURL(langue === 'fr' ? `${SITE}/fr/` : `${SITE}/`),
      new ButtonBuilder().setLabel(t('docs.bouton_support')).setEmoji('💬').setStyle(ButtonStyle.Link).setURL(SUPPORT),
    ));
    blocs.push(C.texte(`-# ${t('docs.pied')}`));

    return interaction.reply(C.envoi([C.conteneur(blocs, conf.couleurs.principale)]));
  },
};
