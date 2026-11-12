/**
 * /noel — l'evenement de Noel du serveur support : classement et stats.
 * Deployee seulement sur le serveur support (support: true).
 */
const { SlashCommandBuilder, InteractionContextType, MessageFlags } = require('discord.js');
const C = require('../../utils/composants');
const noel = require('../../utils/noel');
const fondateur = require('../../utils/fondateur');
const { traducteur, localisations, t: tr, DEFAUT } = require('../../utils/langues');

const d = (o, cle) => o.setDescription(tr(cle, DEFAUT)).setDescriptionLocalizations(localisations(cle));

module.exports = {
  categorie: 'utilitaires',
  support: true,

  data: d(new SlashCommandBuilder().setName('christmas').setNameLocalizations({ fr: 'noel' }), 'noel.description_commande')
    .setContexts(InteractionContextType.Guild)
    .addSubcommand((s) => d(s.setName('leaderboard').setNameLocalizations({ fr: 'classement' }), 'noel.sous_classement'))
    .addSubcommand((s) => d(s.setName('me').setNameLocalizations({ fr: 'moi' }), 'noel.sous_moi')
      .addUserOption((o) => d(o.setName('member').setNameLocalizations({ fr: 'membre' }), 'noel.opt_membre')))
    .addSubcommand((s) => d(s.setName('rules').setNameLocalizations({ fr: 'regles' }), 'noel.sous_regles')),

  async execute(interaction) {
    const { t } = traducteur(interaction);
    if (!fondateur.estSupport(interaction.guildId)) return interaction.reply(C.erreurPrivee(t('noel.support_seulement')));
    const sous = interaction.options.getSubcommand();
    const r = noel.reglages();

    if (sous === 'leaderboard') {
      const charge = noel.classement(t, { userId: interaction.user.id, final: r.fini });
      return interaction.reply(charge);
    }
    if (sous === 'rules') {
      return interaction.reply({
        components: [C.conteneur([
          C.texte(`## 🎄 ${t('noel.regles_titre')}`),
          C.texte(t('noel.regles_texte', { salons: r.salons.map((id) => `<#${id}>`).join(' ') || '—' })),
          C.texte(`-# ${noel.enCours(r) ? t('noel.fin_le', { quand: `<t:${Math.floor(r.fin / 1000)}:F>` }) : t('noel.pas_en_cours')}`),
        ], 0xd7263d)],
        flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
      });
    }
    const cible = interaction.options.getUser('member') ?? interaction.user;
    const s = noel.stats(cible.id);
    if (!s) return interaction.reply(C.infoPrivee(t('noel.rien', { membre: `<@${cible.id}>` })));
    return interaction.reply({
      components: [C.conteneur([
        C.texte(`## 🎄 ${t('noel.stats_titre', { membre: cible.username })}`),
        C.texte(`**${s.points}** ${t('noel.pts')} · ${t('noel.rang', { n: s.rang })}\n☃️ ${s.neiges} · 🎁 ${s.cadeaux} · 🧦 ${s.chaussettes}`),
      ], 0xd7263d)],
      flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    });
  },
};
