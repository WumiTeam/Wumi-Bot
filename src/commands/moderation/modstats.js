/**
 * /modstats — le travail de l'equipe de moderation, en chiffres.
 *
 * Sans membre : le classement des moderateurs sur la periode, et la
 * repartition par type. Avec un membre : sa fiche de moderateur.
 * Les sanctions automatiques (automod, escalade) sont comptees a part, sous
 * le nom du bot : elles ne doivent pas gonfler le score de quelqu'un.
 */
const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  InteractionContextType,
} = require('discord.js');
const conf = require('../../../config');
const { db } = require('../../database/db');
const C = require('../../utils/composants');
const { libelles } = require('../../utils/sanctions');
const { E } = require('../../utils/emojis');
const { traducteur, localisations, t: tr, DEFAUT } = require('../../utils/langues');

const PERIODES = { '7': 7, '30': 30, '90': 90, tout: null };

const q = {
  classement: db.prepare(`
    SELECT moderateur_id AS id, COUNT(*) AS n FROM sanctions
    WHERE guild_id = ? AND date >= ? GROUP BY moderateur_id ORDER BY n DESC LIMIT 10
  `),
  parType: db.prepare('SELECT type, COUNT(*) AS n FROM sanctions WHERE guild_id = ? AND date >= ? GROUP BY type ORDER BY n DESC'),
  parTypeDe: db.prepare('SELECT type, COUNT(*) AS n FROM sanctions WHERE guild_id = ? AND moderateur_id = ? AND date >= ? GROUP BY type ORDER BY n DESC'),
  total: db.prepare('SELECT COUNT(*) AS n FROM sanctions WHERE guild_id = ? AND date >= ?'),
  dernieres: db.prepare('SELECT * FROM sanctions WHERE guild_id = ? AND moderateur_id = ? ORDER BY date DESC LIMIT 5'),
};

module.exports = {
  categorie: 'moderation',

  data: new SlashCommandBuilder()
    .setName('modstats')
    .setDescription(tr('modstats.description_commande', DEFAUT))
    .setDescriptionLocalizations(localisations('modstats.description_commande'))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .setContexts(InteractionContextType.Guild)
    .addUserOption((o) => o
      .setName('moderator')
      .setNameLocalizations({ fr: 'moderateur' })
      .setDescription(tr('modstats.opt_moderateur', DEFAUT))
      .setDescriptionLocalizations(localisations('modstats.opt_moderateur')))
    .addStringOption((o) => o
      .setName('period')
      .setNameLocalizations({ fr: 'periode' })
      .setDescription(tr('modstats.opt_periode', DEFAUT))
      .setDescriptionLocalizations(localisations('modstats.opt_periode'))
      .addChoices(
        { name: '7 days', name_localizations: { fr: '7 jours' }, value: '7' },
        { name: '30 days', name_localizations: { fr: '30 jours' }, value: '30' },
        { name: '90 days', name_localizations: { fr: '90 jours' }, value: '90' },
        { name: 'All time', name_localizations: { fr: 'Depuis le début' }, value: 'tout' }
      )),

  async execute(interaction) {
    const { t, existe } = traducteur(interaction);
    const guildId = interaction.guild.id;
    const choix = interaction.options.getString('period') ?? '30';
    const jours = PERIODES[choix] ?? 30;
    const depuis = jours ? Date.now() - jours * 86_400_000 : 0;
    const libellePeriode = jours ? t('modstats.periode_jours', { n: jours }) : t('modstats.periode_tout');
    const nom = (type) => (existe(`sanctions.type.${type}`) ? t(`sanctions.type.${type}`) : (libelles[type]?.nom ?? type));
    const ligneType = (r) => `${libelles[r.type]?.emoji ?? E('epingle')} ${nom(r.type)} · **${r.n}**`;

    const moderateur = interaction.options.getUser('moderator');

    // --------------------------------------------------- UN MODERATEUR
    if (moderateur) {
      const types = q.parTypeDe.all(guildId, moderateur.id, depuis);
      const total = types.reduce((n, r) => n + r.n, 0);
      const dernieres = q.dernieres.all(guildId, moderateur.id);
      return interaction.reply(C.envoi([C.conteneur([
        C.sectionVignette(
          `## 📊 ${t('modstats.titre_membre', { membre: moderateur.username })}\n${libellePeriode} · ${t('modstats.total', { n: total })}`,
          moderateur.displayAvatarURL()
        ),
        C.separateur(),
        C.texte(types.length ? types.map(ligneType).join('\n') : t('modstats.rien')),
        dernieres.length ? C.separateur() : null,
        dernieres.length ? C.texte(`### ${t('modstats.dernieres')}\n${dernieres.map((s) => `\`#${s.id}\` ${libelles[s.type]?.emoji ?? ''} ${nom(s.type)} · <@${s.user_id}> · <t:${Math.floor(s.date / 1000)}:R>`).join('\n')}`) : null,
      ], conf.couleurs.info)], { allowedMentions: { parse: [] } }));
    }

    // --------------------------------------------------- TOUTE L'EQUIPE
    const total = q.total.get(guildId, depuis).n;
    const classement = q.classement.all(guildId, depuis);
    const types = q.parType.all(guildId, depuis);
    const medailles = ['🥇', '🥈', '🥉'];
    const botId = interaction.client.user.id;

    return interaction.reply(C.envoi([C.conteneur([
      C.texte(`## 📊 ${t('modstats.titre')}\n${libellePeriode} · ${t('modstats.total', { n: total })}`),
      C.separateur(),
      C.texte(`### ${t('modstats.classement')}\n${classement.length
        ? classement.map((r, i) => `${medailles[i] ?? `\`${i + 1}.\``} <@${r.id}>${r.id === botId ? ` _(${t('modstats.automatique')})_` : ''} · **${r.n}**`).join('\n')
        : t('modstats.rien')}`),
      C.separateur(),
      C.texte(`### ${t('modstats.par_type')}\n${types.length ? types.map(ligneType).join('\n') : t('modstats.rien')}`),
    ], conf.couleurs.info)], { allowedMentions: { parse: [] } }));
  },
};
