/**
 * /wrapped — le recap perso en image (ce mois-ci, ou depuis le debut).
 * Voir src/utils/wrapped.js.
 */
const { SlashCommandBuilder, InteractionContextType, AttachmentBuilder, MessageFlags } = require('discord.js');
const C = require('../../utils/composants');
const wrapped = require('../../utils/wrapped');
const { traducteur, localisations, t: tr, DEFAUT } = require('../../utils/langues');

const d = (o, cle) => o.setDescription(tr(cle, DEFAUT)).setDescriptionLocalizations(localisations(cle));

module.exports = {
  categorie: 'niveaux',

  data: d(new SlashCommandBuilder().setName('wrapped'), 'wrapped.description_commande')
    .setContexts(InteractionContextType.Guild)
    .addStringOption((o) => d(o.setName('period').setNameLocalizations({ fr: 'periode' }), 'wrapped.opt_periode').addChoices(
      { name: 'This month', name_localizations: { fr: 'Ce mois-ci' }, value: 'mois' },
      { name: 'Since the beginning', name_localizations: { fr: 'Depuis le début' }, value: 'total' },
    ))
    .addUserOption((o) => d(o.setName('member').setNameLocalizations({ fr: 'membre' }), 'wrapped.opt_membre')),

  async execute(interaction) {
    const { t, langue } = traducteur(interaction);
    const cible = interaction.options.getUser('member') ?? interaction.user;
    if (cible.bot) return interaction.reply(C.erreurPrivee(t('wrapped.bot')));
    let periode = interaction.options.getString('period') ?? 'mois';

    await interaction.deferReply();
    let donnees = wrapped.donnees(interaction.guildId, cible.id, periode);
    let bascule = false;
    if (!donnees && periode === 'mois') {
      donnees = wrapped.donnees(interaction.guildId, cible.id, 'total');
      periode = 'total';
      bascule = Boolean(donnees);
    }
    if (!donnees) return interaction.editReply(C.erreur(t('wrapped.vide', { membre: `<@${cible.id}>` }), { allowedMentions: { parse: [] } }));

    const membre = await interaction.guild.members.fetch(cible.id).catch(() => null);
    const nomsSalons = new Map(donnees.salons.map((s) => [s.channel_id, interaction.guild.channels.cache.get(s.channel_id)?.name ?? '?']));
    const png = await wrapped.image(donnees, {
      t,
      langue,
      pseudo: membre?.displayName ?? cible.globalName ?? cible.username,
      avatarUrl: (membre ?? cible).displayAvatarURL({ extension: 'png', size: 256 }),
      serveur: interaction.guild.name,
      nomsSalons,
    });
    const fichier = new AttachmentBuilder(png, { name: 'wumi-wrapped.png' });
    const texte = cible.id === interaction.user.id ? t('wrapped.message_soi') : t('wrapped.message_autre', { membre: `<@${cible.id}>` });
    return interaction.editReply({
      components: [C.conteneur([
        C.texte(`### 🎁 ${texte}${bascule ? `\n-# ${t('wrapped.bascule')}` : ''}`),
        C.image('attachment://wumi-wrapped.png'),
      ], 0x62b8ff)],
      files: [fichier],
      flags: MessageFlags.IsComponentsV2,
      allowedMentions: { parse: [] },
    });
  },
};
