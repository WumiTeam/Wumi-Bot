/**
 * /userinfo — la fiche d'un membre : une image (banniere, avatar, anciennete,
 * rang d'arrivee, niveau, roles) et les details en texte.
 *
 * Les sanctions ne s'affichent qu'au staff (permission Exclure temporairement) :
 * le casier d'un membre n'a pas a etre public.
 */
const { SlashCommandBuilder, InteractionContextType, AttachmentBuilder, PermissionFlagsBits } = require('discord.js');
const conf = require('../../../config');
const { req } = require('../../database/db');
const { infosNiveau, rangDe } = require('../../utils/niveaux');
const { ts } = require('../../utils/outils');
const C = require('../../utils/composants');
const { E } = require('../../utils/emojis');
const { genererCarteMembre } = require('../../utils/carteInfos');
const logger = require('../../utils/logger');
const { traducteur, localisations, t: tr, DEFAUT } = require('../../utils/langues');

/** Le rang d'arrivee (1 = premier arrive), seulement si le cache est complet. */
function rangArrivee(guild, membre) {
  if (!membre?.joinedTimestamp || guild.members.cache.size < guild.memberCount * 0.95) return null;
  let rang = 1;
  for (const m of guild.members.cache.values()) if (m.joinedTimestamp && m.joinedTimestamp < membre.joinedTimestamp) rang++;
  return rang;
}

module.exports = {
  categorie: 'utilitaires',

  data: new SlashCommandBuilder()
    .setName('userinfo')
    .setDescription(tr('userinfo.description_commande', DEFAUT))
    .setDescriptionLocalizations(localisations('userinfo.description_commande'))
    .setContexts(InteractionContextType.Guild)
    .addUserOption((o) => o
      .setName('member')
      .setNameLocalizations({ fr: 'membre' })
      .setDescription(tr('userinfo.opt_membre', DEFAUT))
      .setDescriptionLocalizations(localisations('userinfo.opt_membre'))),

  async execute(interaction) {
    const { t, nombre, duree } = traducteur(interaction);
    await interaction.deferReply();
    const base = interaction.options.getUser('member') ?? interaction.user;
    const cible = await interaction.client.users.fetch(base.id, { force: true }).catch(() => base);
    const guild = interaction.guild;
    const membre = await guild.members.fetch(cible.id).catch(() => null);

    const ligne = req.getXp.get(guild.id, cible.id);
    const infos = ligne ? infosNiveau(ligne.xp) : null;
    const rang = ligne ? rangDe(guild.id, ligne.xp) : null;
    const arrivee = rangArrivee(guild, membre);
    const roles = membre ? [...membre.roles.cache.values()].filter((r) => r.id !== guild.id).sort((a, b) => b.position - a.position) : [];
    const accent = membre?.displayHexColor && membre.displayHexColor !== '#000000' ? membre.displayHexColor : (cible.hexAccentColor ?? null);
    const nom = membre?.displayName ?? cible.globalName ?? cible.username;

    const elements = [];
    const options = {};
    try {
      const png = await genererCarteMembre({
        nom,
        sous: `@${cible.username}${cible.bot ? ' · BOT' : ''}`,
        ligne3: membre?.premiumSince ? `${t('userinfo.carte_booste', { age: duree(Date.now() - membre.premiumSinceTimestamp) })}` : null,
        avatar: (membre ?? cible).displayAvatarURL({ extension: 'png', size: 256 }),
        banniere: cible.bannerURL({ extension: 'png', size: 1024 }),
        accent,
        tuiles: [
          { intitule: t('userinfo.carte_compte'), valeur: duree(Date.now() - cible.createdTimestamp), complement: new Date(cible.createdTimestamp).toLocaleDateString('fr-FR') },
          { intitule: t('userinfo.carte_arrivee'), valeur: membre?.joinedTimestamp ? duree(Date.now() - membre.joinedTimestamp) : '—', complement: arrivee ? t('userinfo.carte_rang_arrivee', { n: nombre(arrivee) }) : null },
          { intitule: t('userinfo.carte_niveau'), valeur: infos ? `${nombre(infos.niveau)}` : '—', complement: rang ? t('userinfo.carte_rang', { n: nombre(rang) }) : null },
          { intitule: t('userinfo.carte_messages'), valeur: nombre(ligne?.messages ?? 0), complement: ligne?.secondes_vocal > 60 ? t('userinfo.carte_vocal', { duree: duree(ligne.secondes_vocal * 1000) }) : null },
        ],
        roles: roles.slice(0, 8).map((r) => ({ nom: r.name, couleur: r.hexColor })),
        l: { roles: t('userinfo.champ_roles', { n: roles.length }), aucun: t('userinfo.carte_aucun_role') },
      });
      options.files = [new AttachmentBuilder(png, { name: 'membre.png' })];
      elements.push(C.image('attachment://membre.png'));
    } catch (e) {
      logger.avertissement('Fiche membre :', e.message);
      elements.push(C.texte(`## ${nom}`));
    }

    const lignes = [
      `👤 ${cible} · \`${cible.id}\``,
      `📅 **${t('userinfo.champ_compte_cree')}** · ${ts(cible.createdTimestamp, 'D')} · ${ts(cible.createdTimestamp, 'R')}`,
      `📥 **${t('userinfo.champ_a_rejoint')}** · ${membre?.joinedTimestamp ? `${ts(membre.joinedTimestamp, 'D')} · ${ts(membre.joinedTimestamp, 'R')}` : t('userinfo.valeur_pas_sur_serveur')}`,
    ];
    if (infos) lignes.push(`${E('niveaux')} ${t('userinfo.ligne_xp', { actuel: nombre(infos.xpActuel), requis: nombre(infos.xpRequis), total: nombre(infos.xpTotal) })}`);
    if (membre?.isCommunicationDisabled()) lignes.push(`${E('muet')} ${t('userinfo.valeur_muet', { ts: ts(membre.communicationDisabledUntilTimestamp) })}`);
    elements.push(C.texte(lignes.join('\n')));

    // Le casier : seulement pour le staff.
    if (interaction.memberPermissions?.has(PermissionFlagsBits.ModerateMembers)) {
      const sanctions = req.sanctionsDe.all(guild.id, cible.id);
      if (sanctions.length) {
        const warns = sanctions.filter((s) => s.type === 'warn' && s.actif).length;
        elements.push(C.separateur());
        elements.push(C.texte(`**${E('moderation')} ${t('userinfo.champ_sanctions')}** · ${t('userinfo.valeur_sanctions', { total: nombre(sanctions.length), n: warns })}\n-# ${t('userinfo.staff_seulement')}`));
      }
    }

    return interaction.editReply(C.envoi([C.conteneur(elements, membre?.displayColor || conf.couleurs.principale)], options));
  },
};
