/**
 * /snipe — les derniers messages supprimes ou modifies du salon (10 min,
 * staff uniquement). Voir src/utils/snipe.js.
 */
const { SlashCommandBuilder, InteractionContextType, PermissionFlagsBits, MessageFlags } = require('discord.js');
const C = require('../../utils/composants');
const snipe = require('../../utils/snipe');
const capacites = require('../../utils/capacites');
const { traducteur, localisations, t: tr, DEFAUT } = require('../../utils/langues');

const d = (o, cle) => o.setDescription(tr(cle, DEFAUT)).setDescriptionLocalizations(localisations(cle));

module.exports = {
  categorie: 'moderation',

  data: d(new SlashCommandBuilder().setName('snipe'), 'snipe.description_commande')
    .setContexts(InteractionContextType.Guild)
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addStringOption((o) => d(o.setName('type'), 'snipe.opt_type').addChoices(
      { name: 'Deleted', name_localizations: { fr: 'Supprimés' }, value: 'supprimes' },
      { name: 'Edited', name_localizations: { fr: 'Modifiés' }, value: 'modifies' },
    ))
    .addChannelOption((o) => d(o.setName('channel').setNameLocalizations({ fr: 'salon' }), 'snipe.opt_salon')),

  async execute(interaction) {
    const { t } = traducteur(interaction);
    if (!capacites.contenuMessages()) return interaction.reply(C.erreurPrivee(t('snipe.intent')));
    const type = interaction.options.getString('type') ?? 'supprimes';
    const salon = interaction.options.getChannel('channel') ?? interaction.channel;
    if (!salon.permissionsFor(interaction.member)?.has(PermissionFlagsBits.ViewChannel)) {
      return interaction.reply(C.erreurPrivee(t('snipe.pas_acces')));
    }
    const liste = snipe.lire(salon.id, type);
    if (!liste.length) return interaction.reply(C.infoPrivee(t(`snipe.vide_${type}`, { salon: `${salon}` })));

    const blocs = [C.texte(`## 🔎 ${t(`snipe.titre_${type}`)} · ${salon}`)];
    for (const m of liste) {
      const quand = `<t:${Math.floor(m.le / 1000)}:R>`;
      const corps = type === 'modifies'
        ? `**${t('snipe.avant')}** ${m.texte || '—'}\n**${t('snipe.apres')}** ${m.apres || '—'}${m.lien ? `\n[${t('snipe.voir')}](${m.lien})` : ''}`
        : `${m.texte || '—'}${m.pieces.length ? `\n${m.pieces.map((u, i) => `[${t('snipe.piece')} ${i + 1}](${u})`).join(' · ')}` : ''}`;
      blocs.push(C.separateur(), C.texte(`<@${m.auteur}> · ${quand}\n${corps}`.slice(0, 3800)));
    }
    blocs.push(C.texte(`-# ${t('snipe.pied')}`));
    return interaction.reply({ components: [C.conteneur(blocs, 0xf5b301)], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral, allowedMentions: { parse: [] } });
  },
};
