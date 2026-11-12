/**
 * /pet — ton compagnon virtuel. Voir src/utils/pets.js.
 */
const { SlashCommandBuilder, InteractionContextType, MessageFlags } = require('discord.js');
const C = require('../../utils/composants');
const pets = require('../../utils/pets');
const { traducteur, localisations, t: tr, DEFAUT } = require('../../utils/langues');

const d = (o, cle) => o.setDescription(tr(cle, DEFAUT)).setDescriptionLocalizations(localisations(cle));
const NOMS = {
  chat: ['Cat', 'Chat'], chien: ['Dog', 'Chien'], renard: ['Fox', 'Renard'], lapin: ['Bunny', 'Lapin'],
  panda: ['Panda', 'Panda'], pingouin: ['Penguin', 'Pingouin'], dragon: ['Dragon', 'Dragon'], licorne: ['Unicorn', 'Licorne'],
};

module.exports = {
  categorie: 'utilitaires',

  data: d(new SlashCommandBuilder().setName('pet'), 'pet.description_commande')
    .setContexts(InteractionContextType.Guild)
    .addSubcommand((s) => d(s.setName('view').setNameLocalizations({ fr: 'voir' }), 'pet.sous_voir')
      .addUserOption((o) => d(o.setName('member').setNameLocalizations({ fr: 'membre' }), 'pet.opt_membre')))
    .addSubcommand((s) => d(s.setName('adopt').setNameLocalizations({ fr: 'adopter' }), 'pet.sous_adopter')
      .addStringOption((o) => d(o.setName('species').setNameLocalizations({ fr: 'espece' }), 'pet.opt_espece').setRequired(true)
        .addChoices(...Object.entries(pets.ESPECES).map(([k, e]) => ({ name: `${e} ${NOMS[k][0]}`, name_localizations: { fr: `${e} ${NOMS[k][1]}` }, value: k }))))
      .addStringOption((o) => d(o.setName('name').setNameLocalizations({ fr: 'nom' }), 'pet.opt_nom').setRequired(true).setMaxLength(24)))
    .addSubcommand((s) => d(s.setName('rename').setNameLocalizations({ fr: 'renommer' }), 'pet.sous_renommer')
      .addStringOption((o) => d(o.setName('name').setNameLocalizations({ fr: 'nom' }), 'pet.opt_nom').setRequired(true).setMaxLength(24)))
    .addSubcommand((s) => d(s.setName('top'), 'pet.sous_top'))
    .addSubcommand((s) => d(s.setName('release').setNameLocalizations({ fr: 'relacher' }), 'pet.sous_relacher')
      .addBooleanOption((o) => d(o.setName('confirm').setNameLocalizations({ fr: 'confirmer' }), 'pet.opt_confirmer').setRequired(true))),

  async execute(interaction) {
    const { t } = traducteur(interaction);
    const g = interaction.guildId;
    const sous = interaction.options.getSubcommand();
    const nettoyer = (s) => String(s ?? '').replace(/[`*_~|<>@#]/g, '').trim().slice(0, 24);

    if (sous === 'adopt') {
      if (pets.lire(g, interaction.user.id)) return interaction.reply(C.erreurPrivee(t('pet.deja')));
      const nom = nettoyer(interaction.options.getString('name'));
      if (!nom) return interaction.reply(C.erreurPrivee(t('pet.nom_invalide')));
      const p = pets.adopter(g, interaction.user.id, interaction.options.getString('species'), nom);
      const charge = pets.panneau(p, t);
      charge.components.unshift(C.conteneur([C.texte(`🎉 ${t('pet.adopte', { nom })}`)], 0xe46bd8));
      return interaction.reply(charge);
    }

    if (sous === 'rename') {
      const nom = nettoyer(interaction.options.getString('name'));
      if (!nom) return interaction.reply(C.erreurPrivee(t('pet.nom_invalide')));
      return interaction.reply(pets.renommer(g, interaction.user.id, nom) ? C.succesPrive(t('pet.renomme', { nom })) : C.erreurPrivee(t('pet.aucun')));
    }

    if (sous === 'release') {
      if (!interaction.options.getBoolean('confirm')) return interaction.reply(C.infoPrivee(t('pet.relacher_annule')));
      return interaction.reply(pets.liberer(g, interaction.user.id) ? C.succesPrive(t('pet.relache')) : C.erreurPrivee(t('pet.aucun')));
    }

    if (sous === 'top') {
      const liste = pets.top(g);
      return interaction.reply({
        components: [C.conteneur([
          C.texte(`## 🏆 ${t('pet.top_titre')}`),
          C.texte(liste.length
            ? liste.map((p, i) => `${['🥇', '🥈', '🥉'][i] ?? `\`${i + 1}.\``} ${pets.stade(p.xp).cle === 'oeuf' ? '🥚' : pets.ESPECES[p.espece]} **${p.nom}** · <@${p.user_id}> · ${t(`pet.stade_${pets.stade(p.xp).cle}`)} · ${p.xp} xp`).join('\n')
            : t('pet.top_vide')),
        ], 0xe46bd8)],
        flags: MessageFlags.IsComponentsV2,
        allowedMentions: { parse: [] },
      });
    }

    // view
    const cible = interaction.options.getUser('member') ?? interaction.user;
    const p = pets.lire(g, cible.id);
    if (!p) {
      return interaction.reply(C.erreurPrivee(cible.id === interaction.user.id ? t('pet.aucun') : t('pet.aucun_autre', { membre: `<@${cible.id}>` })));
    }
    const soi = cible.id === interaction.user.id;
    return interaction.reply(pets.panneau(p, t, { proprio: soi, maitre: soi ? null : cible.id }));
  },
};
