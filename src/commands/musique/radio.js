/**
 * /radio — une radio en direct en un clic (lofi, FIP, rap, electro…).
 * Elle passe tout de suite, devant la file ; parfaite avec /music 24-7.
 */
const { SlashCommandBuilder, InteractionContextType, PermissionFlagsBits } = require('discord.js');
const C = require('../../utils/composants');
const RADIOS = require('../../musique/radios');
const { musique } = require('../../musique/lecteur');
const { traducteur, localisations, t: tr, DEFAUT } = require('../../utils/langues');

const d = (o, cle) => o.setDescription(tr(cle, DEFAUT)).setDescriptionLocalizations(localisations(cle));

module.exports = {
  categorie: 'musique',

  data: d(new SlashCommandBuilder().setName('radio'), 'radio.description_commande')
    .setContexts(InteractionContextType.Guild)
    .addStringOption((o) => d(o.setName('station'), 'radio.opt_station').setRequired(true)
      .addChoices(...RADIOS.map((r) => ({ name: `${r.emoji} ${r.nom} — ${r.genre}`.slice(0, 100), value: r.id }))))
    .addBooleanOption((o) => d(o.setName('permanent').setNameLocalizations({ fr: 'permanente' }), 'radio.opt_permanente')),

  async execute(interaction) {
    const { t } = traducteur(interaction);
    const radio = RADIOS.find((r) => r.id === interaction.options.getString('station'));
    if (!radio) return interaction.reply(C.erreurPrivee(t('radio.inconnue')));
    if (!musique.configure()) return interaction.reply(C.erreurPrivee(t('musique.non_configure')));
    const permanente = interaction.options.getBoolean('permanent');
    const rp = require('../../musique/radioPermanente');
    if (permanente != null && !interaction.memberPermissions.has(PermissionFlagsBits.ManageGuild)) {
      return interaction.reply(C.erreurPrivee(t('radio.permanente_reserve')));
    }
    if (permanente === false) {
      rp.desactiver(interaction.guildId);
      return interaction.reply(C.succesPrive(t('radio.permanente_off')));
    }
    const vocal = interaction.member.voice?.channel;
    if (permanente && vocal) rp.activer(interaction.guildId, vocal.id, radio.id);
    const r = await require('./musique').lancerLecture(interaction, t, { requete: radio.url, immediat: true, radio });
    const l = musique.obtenir(interaction.guildId);
    if (permanente && vocal && l) {
      l.radioPermanente = true;
      await interaction.followUp(C.succesPrive(t('radio.permanente_on', { nom: radio.nom, salon: `${vocal}` }))).catch(() => null);
    }
    return r;
  },
};
