/**
 * /unban — lever un bannissement.
 *
 * L'OPTION EST UNE CHAINE, PAS UN UTILISATEUR : Discord ne propose pas les
 * membres absents du serveur dans un choix d'utilisateur, et un banni est par
 * definition absent. L'autocompletion relit donc la liste des bannis du
 * serveur et affiche « pseudo (identifiant) » — le moderateur n'a jamais a
 * copier un identifiant a la main.
 */
const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  InteractionContextType,
} = require('discord.js');
const { db } = require('../../database/db');
const C = require('../../utils/composants');
const { enregistrer } = require('../../utils/sanctions');
const { traducteur, localisations, t: tr, DEFAUT } = require('../../utils/langues');

module.exports = {
  categorie: 'moderation',

  data: new SlashCommandBuilder()
    .setName('unban')
    .setNameLocalizations({ fr: 'debannir' })
    .setDescription(tr('unban.description_commande', DEFAUT))
    .setDescriptionLocalizations(localisations('unban.description_commande'))
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .setContexts(InteractionContextType.Guild)
    .addStringOption((o) => o
      .setName('user')
      .setNameLocalizations({ fr: 'utilisateur' })
      .setDescription(tr('unban.opt_utilisateur', DEFAUT))
      .setDescriptionLocalizations(localisations('unban.opt_utilisateur'))
      .setRequired(true)
      .setAutocomplete(true))
    .addStringOption((o) => o
      .setName('reason')
      .setNameLocalizations({ fr: 'raison' })
      .setDescription(tr('unban.opt_raison', DEFAUT))
      .setDescriptionLocalizations(localisations('unban.opt_raison'))
      .setMaxLength(400)),

  async autocomplete(interaction) {
    const saisie = interaction.options.getFocused().toLowerCase();
    const bans = await interaction.guild.bans.fetch().catch(() => null);
    if (!bans) return interaction.respond([]);

    // Le libelle est un pseudo et un identifiant : des donnees, jamais traduites.
    const resultats = [...bans.values()]
      .filter((b) => b.user.tag.toLowerCase().includes(saisie) || b.user.id.includes(saisie))
      .slice(0, 25)
      .map((b) => ({ name: `${b.user.tag} (${b.user.id})`.slice(0, 100), value: b.user.id }));

    return interaction.respond(resultats);
  },

  async execute(interaction) {
    const { t } = traducteur(interaction);

    const id = interaction.options.getString('user').replace(/\D/g, '');
    const raison = interaction.options.getString('reason') ?? t('sanction.sans_raison');

    if (!id) {
      return interaction.reply(C.erreurPrivee(t('unban.id_invalide')));
    }

    const ban = await interaction.guild.bans.fetch(id).catch(() => null);
    if (!ban) {
      return interaction.reply(C.erreurPrivee(t('unban.pas_banni')));
    }

    await interaction.deferReply();
    await interaction.guild.bans.remove(id, t('unban.audit', { raison, moderateur: interaction.user.tag }));

    db.prepare("UPDATE sanctions SET actif = 0 WHERE guild_id = ? AND user_id = ? AND type = 'ban'").run(interaction.guild.id, id);

    await enregistrer({
      guild: interaction.guild,
      cible: ban.user,
      moderateur: interaction.user,
      type: 'unban',
      raison,
      prevenirEnMp: false,
    });

    return interaction.editReply(C.succes(
      t('unban.fait', { membre: ban.user.tag })
      + `\n> ${t('sanction.raison', { raison })}`
    ));
  },
};
