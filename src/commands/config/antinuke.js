/**
 * /antinuke — protection contre la casse « de l'interieur » (voir src/utils/antiNuke.js).
 *
 * RESERVE AU PROPRIETAIRE DU SERVEUR : un admin pirate ne doit pas pouvoir
 * couper la protection ni s'ajouter a la liste de confiance.
 */
const { SlashCommandBuilder, PermissionFlagsBits, InteractionContextType, ChannelType } = require('discord.js');
const conf = require('../../../config');
const C = require('../../utils/composants');
const { config, majConfig } = require('../../database/db');
const antiNuke = require('../../utils/antiNuke');
const { traducteur, localisations, t: tr, DEFAUT } = require('../../utils/langues');

const d = (b, cle) => b.setDescription(tr(cle, DEFAUT)).setDescriptionLocalizations(localisations(cle));

module.exports = {
  categorie: 'config',

  data: new SlashCommandBuilder()
    .setName('antinuke')
    .setDescription(tr('antinuke.description_commande', DEFAUT))
    .setDescriptionLocalizations(localisations('antinuke.description_commande'))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setContexts(InteractionContextType.Guild)
    .addSubcommand((s) => d(s.setName('enable').setNameLocalizations({ fr: 'activer' }), 'antinuke.sous_activer')
      .addChannelOption((o) => d(o.setName('alerts').setNameLocalizations({ fr: 'alertes' }), 'antinuke.opt_salon').addChannelTypes(ChannelType.GuildText))
      .addStringOption((o) => d(o.setName('sanction'), 'antinuke.opt_sanction').addChoices(
        { name: 'Retirer ses rôles / Remove roles', value: 'roles' },
        { name: 'Expulser / Kick', value: 'kick' },
        { name: 'Bannir / Ban', value: 'ban' },
      ))
      .addIntegerOption((o) => d(o.setName('threshold').setNameLocalizations({ fr: 'seuil' }), 'antinuke.opt_seuil').setMinValue(2).setMaxValue(20))
      .addIntegerOption((o) => d(o.setName('window').setNameLocalizations({ fr: 'fenetre' }), 'antinuke.opt_fenetre').setMinValue(5).setMaxValue(120)))
    .addSubcommand((s) => d(s.setName('disable').setNameLocalizations({ fr: 'desactiver' }), 'antinuke.sous_desactiver'))
    .addSubcommand((s) => d(s.setName('trust').setNameLocalizations({ fr: 'confiance' }), 'antinuke.sous_confiance')
      .addUserOption((o) => d(o.setName('member').setNameLocalizations({ fr: 'membre' }), 'antinuke.opt_membre').setRequired(true)))
    .addSubcommand((s) => d(s.setName('untrust').setNameLocalizations({ fr: 'retirer-confiance' }), 'antinuke.sous_retirer')
      .addUserOption((o) => d(o.setName('member').setNameLocalizations({ fr: 'membre' }), 'antinuke.opt_membre').setRequired(true)))
    .addSubcommand((s) => d(s.setName('status').setNameLocalizations({ fr: 'etat' }), 'antinuke.sous_etat')),

  async execute(interaction) {
    const { t } = traducteur(interaction);
    const guild = interaction.guild;
    if (interaction.user.id !== guild.ownerId) return interaction.reply(C.erreurPrivee(t('antinuke.proprio_seulement')));

    const sous = interaction.options.getSubcommand();
    const cfg = config(guild.id);

    if (sous === 'enable') {
      const maj = { antinuke_actif: 1 };
      const salon = interaction.options.getChannel('alerts');
      if (salon) maj.antinuke_salon = salon.id;
      const sanction = interaction.options.getString('sanction');
      if (sanction) maj.antinuke_sanction = sanction;
      const seuil = interaction.options.getInteger('threshold');
      if (seuil) maj.antinuke_seuil = seuil;
      const fenetre = interaction.options.getInteger('window');
      if (fenetre) maj.antinuke_fenetre = fenetre;
      majConfig(guild.id, maj);

      // Une photo de la structure maintenant, si la derniere a plus d'un jour :
      // c'est elle qui permettra de tout remettre en place apres une attaque.
      const structure = require('../../utils/structure');
      const derniere = structure.lister(guild.id, 1)[0];
      let photo = null;
      if (!derniere || Date.now() - derniere.cree_le > 86_400_000) {
        try { photo = structure.enregistrer(guild, { nom: 'Anti-nuke', auteurId: interaction.user.id }); } catch { /* pas bloquant */ }
      }
      const extra = photo ? `\n${t('antinuke.photo_prise', { n: photo.id ?? photo })}` : '';
      return interaction.reply(C.envoiPrive([vue(guild, t, `${t('antinuke.active')}${extra}`)]));
    }

    if (sous === 'disable') {
      majConfig(guild.id, { antinuke_actif: 0 });
      return interaction.reply(C.succesPrive(t('antinuke.desactive')));
    }

    if (sous === 'trust' || sous === 'untrust') {
      const membre = interaction.options.getUser('member');
      const liste = new Set(antiNuke.confiance(cfg));
      if (sous === 'trust') liste.add(membre.id);
      else liste.delete(membre.id);
      majConfig(guild.id, { antinuke_confiance: JSON.stringify([...liste].slice(0, 25)) });
      return interaction.reply(C.succesPrive(t(sous === 'trust' ? 'antinuke.confiance_ajoute' : 'antinuke.confiance_retire', { membre: `${membre}` })));
    }

    return interaction.reply(C.envoiPrive([vue(guild, t)]));
  },
};

/** La carte d'etat : reglages + verifications. */
function vue(guild, t, entete = null) {
  const cfg = config(guild.id);
  const diag = antiNuke.diagnostic(guild);
  const ok = (b) => (b ? '✅' : '❌');
  const confiance = antiNuke.confiance(cfg);
  const photo = require('../../utils/structure').lister(guild.id, 1)[0];
  return C.conteneur([
    C.texte(`## 🛡️ ${t('antinuke.titre_etat')}\n${entete ?? (cfg.antinuke_actif ? t('antinuke.etat_actif') : t('antinuke.etat_inactif'))}`),
    C.separateur(),
    C.texte([
      `**${t('antinuke.reglages')}**`,
      t('antinuke.ligne_seuil', { n: cfg.antinuke_seuil, s: cfg.antinuke_fenetre }),
      t('antinuke.ligne_sanction', { sanction: t(`antinuke.sanction.${cfg.antinuke_sanction}`) }),
      t('antinuke.ligne_salon', { salon: cfg.antinuke_salon ? `<#${cfg.antinuke_salon}>` : t('antinuke.mp_seulement') }),
      t('antinuke.ligne_confiance', { liste: confiance.length ? confiance.map((id) => `<@${id}>`).join(', ') : t('antinuke.personne') }),
    ].join('\n')),
    C.texte([
      `**${t('antinuke.verifications')}**`,
      `${ok(diag.journal)} ${t('antinuke.v_journal')}`,
      `${ok(diag.roles && diag.expulser)} ${t('antinuke.v_droits')}`,
      `${ok(diag.enHaut)} ${t('antinuke.v_en_haut')}`,
      `${ok(photo)} ${photo ? t('antinuke.v_photo', { date: `<t:${Math.floor(photo.cree_le / 1000)}:R>` }) : t('antinuke.v_sans_photo')}`,
    ].join('\n')),
    C.texte(`-# ${t('antinuke.pied')}`),
  ], cfg.antinuke_actif ? conf.couleurs.succes : conf.couleurs.principale);
}
