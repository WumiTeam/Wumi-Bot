/**
 * /role — donne ou retire un role a un membre, en respectant la hierarchie.
 *
 * Deux garde-fous qui manquent a Discord lui-meme quand on delegue la gestion
 * des roles a des moderateurs :
 *   - on ne donne jamais un role egal ou superieur au sien ;
 *   - on ne donne jamais un role « dangereux » (Administrateur, Gerer le
 *     serveur, Bannir...) sans etre soi-meme administrateur.
 */
const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  InteractionContextType,
} = require('discord.js');
const C = require('../../utils/composants');
const { envoyerLog } = require('../../utils/logs');
const { parserDuree } = require('../../utils/outils');
const temporaires = require('../../utils/rolesTemporaires');
const conf = require('../../../config');
const { traducteur, localisations, t: tr, DEFAUT } = require('../../utils/langues');

const DANGEREUSES = [
  PermissionFlagsBits.Administrator,
  PermissionFlagsBits.ManageGuild,
  PermissionFlagsBits.ManageRoles,
  PermissionFlagsBits.BanMembers,
  PermissionFlagsBits.KickMembers,
  PermissionFlagsBits.ManageChannels,
  PermissionFlagsBits.ManageWebhooks,
  PermissionFlagsBits.MentionEveryone,
];

const optionMembre = (o) => o
  .setName('member')
  .setNameLocalizations({ fr: 'membre' })
  .setDescription(tr('role.opt_membre', DEFAUT))
  .setDescriptionLocalizations(localisations('role.opt_membre'))
  .setRequired(true);
const optionRole = (o) => o
  .setName('role')
  .setDescription(tr('role.opt_role', DEFAUT))
  .setDescriptionLocalizations(localisations('role.opt_role'))
  .setRequired(true);

module.exports = {
  categorie: 'moderation',

  data: new SlashCommandBuilder()
    .setName('role')
    .setDescription(tr('role.description_commande', DEFAUT))
    .setDescriptionLocalizations(localisations('role.description_commande'))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .setContexts(InteractionContextType.Guild)
    .addSubcommand((s) => s
      .setName('add')
      .setNameLocalizations({ fr: 'ajouter' })
      .setDescription(tr('role.sous_ajouter', DEFAUT))
      .setDescriptionLocalizations(localisations('role.sous_ajouter'))
      .addUserOption(optionMembre)
      .addRoleOption(optionRole)
      .addStringOption((o) => o
        .setName('duration')
        .setNameLocalizations({ fr: 'duree' })
        .setDescription(tr('role.opt_duree', DEFAUT))
        .setDescriptionLocalizations(localisations('role.opt_duree'))))
    .addSubcommand((s) => s
      .setName('remove')
      .setNameLocalizations({ fr: 'retirer' })
      .setDescription(tr('role.sous_retirer', DEFAUT))
      .setDescriptionLocalizations(localisations('role.sous_retirer'))
      .addUserOption(optionMembre)
      .addRoleOption(optionRole)),

  async execute(interaction) {
    const { t } = traducteur(interaction);
    const sous = interaction.options.getSubcommand();
    const role = interaction.options.getRole('role');
    const cible = interaction.options.getUser('member');
    const guild = interaction.guild;

    const membre = await guild.members.fetch(cible.id).catch(() => null);
    if (!membre) return interaction.reply(C.erreurPrivee(t('role.absent')));

    // ----------------------------------------------------------- GARDE-FOUS
    if (role.managed || role.id === guild.id) return interaction.reply(C.erreurPrivee(t('role.gere')));
    if (!role.editable) return interaction.reply(C.erreurPrivee(t('role.trop_haut_bot', { role: `${role}` })));
    const proprio = interaction.user.id === guild.ownerId;
    if (!proprio && role.position >= interaction.member.roles.highest.position) {
      return interaction.reply(C.erreurPrivee(t('role.trop_haut_toi', { role: `${role}` })));
    }
    const admin = interaction.member.permissions.has(PermissionFlagsBits.Administrator);
    if (!admin && sous === 'add' && DANGEREUSES.some((p) => role.permissions.has(p))) {
      return interaction.reply(C.erreurPrivee(t('role.dangereux', { role: `${role}` })));
    }

    // Duree facultative : le role sera retire tout seul a l'echeance.
    const dureeTexte = sous === 'add' ? interaction.options.getString('duration') : null;
    const duree = dureeTexte ? parserDuree(dureeTexte) : null;
    if (dureeTexte && !duree) return interaction.reply(C.erreurPrivee(t('sanction.duree_invalide')));
    if (duree && duree > 366 * 86_400_000) return interaction.reply(C.erreurPrivee(t('role.duree_trop_longue')));

    const aDeja = membre.roles.cache.has(role.id);
    // Deja la, mais on demande une duree : on la pose (ou la prolonge).
    if (sous === 'add' && aDeja && duree) {
      temporaires.poser(guild.id, membre.id, role.id, Date.now() + duree, interaction.user.id);
      return interaction.reply(C.succes(t('role.duree_posee', { membre: `${membre}`, role: `${role}`, fin: `<t:${Math.floor((Date.now() + duree) / 1000)}:R>` }), { allowedMentions: { parse: [] } }));
    }
    if (sous === 'add' && aDeja) return interaction.reply(C.infoPrivee(t('role.deja', { membre: `${membre}`, role: `${role}` })));
    if (sous === 'remove' && !aDeja) return interaction.reply(C.infoPrivee(t('role.pas', { membre: `${membre}`, role: `${role}` })));

    try {
      if (sous === 'add') await membre.roles.add(role, `${interaction.user.tag} : /role`);
      else await membre.roles.remove(role, `${interaction.user.tag} : /role`);
      if (sous === 'add' && duree) temporaires.poser(guild.id, membre.id, role.id, Date.now() + duree, interaction.user.id);
      if (sous === 'remove') temporaires.oublier(guild.id, membre.id, role.id);
    } catch (e) {
      return interaction.reply(C.erreurPrivee(t('role.impossible', { erreur: e.message })));
    }

    await envoyerLog(guild, 'moderation', {
      color: sous === 'add' ? conf.couleurs.succes : conf.couleurs.avertissement,
      description: t(sous === 'add' ? 'role.log_ajoute' : 'role.log_retire', {
        role: `${role}`, membre: `${membre}`, moderateur: `${interaction.user}`,
      }),
      timestamp: new Date().toISOString(),
    });

    const fin = duree ? `\n${t('role.expire', { fin: `<t:${Math.floor((Date.now() + duree) / 1000)}:R>` })}` : '';
    return interaction.reply(C.succes(t(sous === 'add' ? 'role.ajoute' : 'role.retire', { membre: `${membre}`, role: `${role}` }) + fin, {
      allowedMentions: { parse: [] },
    }));
  },
};
