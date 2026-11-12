const { SlashCommandBuilder, PermissionFlagsBits, InteractionContextType } = require('discord.js');
const conf = require('../../../config');
const { req } = require('../../database/db');
const { infosNiveau } = require('../../utils/niveaux');
const { E } = require('../../utils/emojis');
const C = require('../../utils/composants');
const { traducteur, localisations, t: tr, DEFAUT } = require('../../utils/langues');

module.exports = {
  categorie: 'niveau',

  data: new SlashCommandBuilder()
    .setName('tier')
    .setNameLocalizations({ fr: 'palier' })
    .setDescription(tr('palier.description_commande', DEFAUT))
    .setDescriptionLocalizations(localisations('palier.description_commande'))
    .setContexts(InteractionContextType.Guild)

    .addSubcommand((s) => s
      .setName('list')
      .setNameLocalizations({ fr: 'liste' })
      .setDescription(tr('palier.sous_liste', DEFAUT))
      .setDescriptionLocalizations(localisations('palier.sous_liste')))
    .addSubcommand((s) => s
      .setName('add')
      .setNameLocalizations({ fr: 'ajouter' })
      .setDescription(tr('palier.sous_ajouter', DEFAUT))
      .setDescriptionLocalizations(localisations('palier.sous_ajouter'))
      .addIntegerOption((o) => o
        .setName('level')
        .setNameLocalizations({ fr: 'niveau' })
        .setDescription(tr('palier.opt_niveau', DEFAUT))
        .setDescriptionLocalizations(localisations('palier.opt_niveau'))
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(200))
      .addRoleOption((o) => o
        .setName('role')
        .setDescription(tr('palier.opt_role', DEFAUT))
        .setDescriptionLocalizations(localisations('palier.opt_role'))
        .setRequired(true))
      .addChannelOption((o) => o
        .setName('channel')
        .setNameLocalizations({ fr: 'salon' })
        .setDescription(tr('palier.opt_salon', DEFAUT))
        .setDescriptionLocalizations(localisations('palier.opt_salon'))))
    .addSubcommand((s) => s
      .setName('remove')
      .setNameLocalizations({ fr: 'retirer' })
      .setDescription(tr('palier.sous_retirer', DEFAUT))
      .setDescriptionLocalizations(localisations('palier.sous_retirer'))
      .addIntegerOption((o) => o
        .setName('level')
        .setNameLocalizations({ fr: 'niveau' })
        .setDescription(tr('palier.opt_niveau_retirer', DEFAUT))
        .setDescriptionLocalizations(localisations('palier.opt_niveau_retirer'))
        .setRequired(true)
        .setMinValue(1)))
    .addSubcommand((s) => s
      .setName('sync')
      .setNameLocalizations({ fr: 'synchroniser' })
      .setDescription(tr('palier.sous_synchroniser', DEFAUT))
      .setDescriptionLocalizations(localisations('palier.sous_synchroniser'))),

  async execute(interaction) {
    const { t, nombre } = traducteur(interaction);
    const sous = interaction.options.getSubcommand();
    const guildId = interaction.guild.id;

    const admin = interaction.member.permissions.has(PermissionFlagsBits.ManageGuild);
    const refus = () => interaction.reply(C.erreurPrivee(t('palier.perm_config')));

    // ========================================================== AJOUTER
    if (sous === 'add') {
      if (!admin) return refus();

      const niveau = interaction.options.getInteger('level');
      const role = interaction.options.getRole('role');
      const salon = interaction.options.getChannel('channel');

      if (role.managed || role.position >= interaction.guild.members.me.roles.highest.position) {
        return interaction.reply(C.erreurPrivee(t('palier.role_trop_haut', { role: `${role}` })));
      }

      req.ajouterRecompense.run(guildId, niveau, role.id);

      let messageSalon = '';
      if (salon) {
        req.ajouterPalierSalon.run(guildId, niveau, salon.id);
        // On ouvre le salon au role et on le ferme a tout le monde
        try {
          const raisonAudit = t('palier.audit_ajout', { niveau });
          await salon.permissionOverwrites.edit(role.id, { ViewChannel: true }, { reason: raisonAudit });
          await salon.permissionOverwrites.edit(interaction.guild.roles.everyone.id, { ViewChannel: false }, { reason: raisonAudit });
          messageSalon = `\n${t('palier.salon_visible', { salon: salon.id, niveau })}`;
        } catch (e) {
          messageSalon = `\n${E('avertissement')} ${t('palier.salon_erreur', { salon: salon.id, erreur: e.message })}`;
        }
      }

      return interaction.reply(C.succes(
        t('palier.ajoute', { role: role.id, niveau })
        + messageSalon
        + `\n-# ${t('palier.astuce_sync')}`
      ));
    }

    // ========================================================== RETIRER
    if (sous === 'remove') {
      if (!admin) return refus();
      const niveau = interaction.options.getInteger('level');
      const res = req.retirerRecompense.run(guildId, niveau);
      req.retirerPalierSalons.run(guildId, niveau);
      return interaction.reply(
        res.changes
          ? C.succes(`${t('palier.retire', { niveau })}\n-# ${t('palier.retire_note')}`)
          : C.erreurPrivee(t('palier.aucun', { niveau }))
      );
    }

    // ===================================================== SYNCHRONISER
    if (sous === 'sync') {
      if (!admin) return refus();

      const paliers = req.recompenses.all(guildId);
      if (!paliers.length) {
        return interaction.reply(C.infoPrivee(t('palier.aucun_configure')));
      }

      await interaction.deferReply();

      const lignes = req.tousMembresXp.all(guildId);
      let attribues = 0;
      let membresTouches = 0;
      let echecs = 0;

      for (const ligne of lignes) {
        const niveau = infosNiveau(ligne.xp).niveau;
        const dus = paliers.filter((p) => p.niveau <= niveau);
        if (!dus.length) continue;

        const membre = await interaction.guild.members.fetch(ligne.user_id).catch(() => null);
        if (!membre) continue;

        let touche = false;
        for (const p of dus) {
          const role = interaction.guild.roles.cache.get(p.role_id);
          if (!role || !role.editable || membre.roles.cache.has(role.id)) continue;
          try {
            await membre.roles.add(role, t('palier.audit_sync', { niveau }));
            attribues++;
            touche = true;
          } catch {
            echecs++;
          }
        }
        if (touche) membresTouches++;
      }

      return interaction.editReply(C.succes(
        [
          t('palier.sync_termine'),
          t('palier.sync_resume', { attribues: nombre(attribues), membresTouches: nombre(membresTouches), total: nombre(lignes.length) }),
          echecs ? `${E('avertissement')} ${t('palier.sync_echecs', { n: echecs })}` : null,
        ]
          .filter(Boolean)
          .join('\n')
      ));
    }

    // ============================================================ LISTE
    const paliers = req.recompenses.all(guildId);
    if (!paliers.length) {
      return interaction.reply(C.info(t('palier.liste_vide')));
    }

    const ligne = req.getXp.get(guildId, interaction.user.id);
    const monNiveau = infosNiveau(ligne?.xp ?? 0).niveau;

    const description = paliers
      .map((p) => {
        const salons = req.palierSalons.all(guildId, p.niveau).map((s) => `<#${s.channel_id}>`);
        const atteint = monNiveau >= p.niveau;
        return [
          `${atteint ? E('succes') : E('verrou')} ${t('palier.ligne_niveau', { niveau: p.niveau, role: p.role_id })}`,
          salons.length ? `> ${t('palier.ligne_salons', { liste: salons.join(', ') })}` : null,
        ]
          .filter(Boolean)
          .join('\n');
      })
      .join('\n');

    const prochain = paliers.find((p) => p.niveau > monNiveau);

    return interaction.reply(C.envoi([C.conteneur([
      C.texte(`## ${E('classement')} ${t('palier.titre_liste', { serveur: interaction.guild.name })}`),
      C.texte(description),
      C.separateur(),
      C.texte(`### ${t('palier.ou_tu_en_es')}`),
      C.texte(
        prochain
          ? t('palier.progres', { monNiveau: nombre(monNiveau), n: prochain.niveau - monNiveau, role: prochain.role_id })
          : t('palier.tout_debloque', { niveau: nombre(monNiveau), emoji: E('fete') })
      ),
    ])]));
  },
};
