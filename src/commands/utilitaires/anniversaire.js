/**
 * /anniversaire — enregistrer sa date, pour que le serveur la souhaite.
 *
 * L'ANNEE EST FACULTATIVE, ET C'EST VOULU.
 * Le jour et le mois suffisent a souhaiter un anniversaire. L'annee donne
 * l'age, ce qui est autrement plus sensible, et le bot ne l'affiche jamais
 * nulle part. Elle n'est proposee que pour ceux qui y tiennent.
 *
 * Chacun gere la sienne : personne ne peut inscrire quelqu'un d'autre, et
 * `/anniversaire retirer` efface la sienne en un clic.
 *
 * LES NOMS DE MOIS SONT DANS LES FRAGMENTS, PAS DANS anniv.MOIS.
 * src/utils/anniversaires.js exporte un MOIS francais fixe et un enClair()
 * qui l'utilise directement : ce module ne m'appartient pas, et je ne peux
 * pas le rendre bilingue sans y toucher. J'ai donc ma propre liste traduite
 * (anniversaire.mois.1..12) et je formate moi-meme la date affichee — anniv.
 * MOIS et anniv.enClair() ne sont plus utilises ici. anniv.valider() reste
 * utilise : lui ne renvoie pas de texte, juste un booleen.
 */
const {
  SlashCommandBuilder,
  InteractionContextType,
} = require('discord.js');
const conf = require('../../../config');
const { config, req } = require('../../database/db');
const C = require('../../utils/composants');
const { E } = require('../../utils/emojis');
const anniv = require('../../utils/anniversaires');
const { traducteur, localisations, t: tr, DEFAUT } = require('../../utils/langues');

/** Le nom du mois traduit, depuis les fragments (pas depuis anniv.MOIS). */
function moisNom(mois, t) {
  return t(`anniversaire.mois.${mois}`);
}

/** Une date lisible dans la langue du serveur : « 14 juillet » / « July 14 ». */
function formaterDate(jour, mois, t) {
  return t('anniversaire.format_date', { jour, mois: moisNom(mois, t) });
}

module.exports = {
  categorie: 'utilitaires',

  data: new SlashCommandBuilder()
    .setName('birthday')
    .setNameLocalizations({ fr: 'anniversaire' })
    .setDescription(tr('anniversaire.description_commande', DEFAUT))
    .setDescriptionLocalizations(localisations('anniversaire.description_commande'))
    .setContexts(InteractionContextType.Guild)
    .addSubcommand((s) =>
      s
        .setName('set')
        .setNameLocalizations({ fr: 'definir' })
        .setDescription(tr('anniversaire.sous_definir', DEFAUT))
        .setDescriptionLocalizations(localisations('anniversaire.sous_definir'))
        .addIntegerOption((o) => {
          o.setName('day')
            .setNameLocalizations({ fr: 'jour' })
            .setDescription(tr('anniversaire.opt_jour', DEFAUT))
            .setDescriptionLocalizations(localisations('anniversaire.opt_jour'))
            .setRequired(true)
            .setMinValue(1)
            .setMaxValue(31);
          return o;
        })
        .addIntegerOption((o) => {
          o.setName('month')
            .setNameLocalizations({ fr: 'mois' })
            .setDescription(tr('anniversaire.opt_mois', DEFAUT))
            .setDescriptionLocalizations(localisations('anniversaire.opt_mois'))
            .setRequired(true);
          // Les 12 choix viennent des fragments : plus de liste en dur ici.
          for (let m = 1; m <= 12; m++) {
            o.addChoices({
              name: tr(`anniversaire.mois.${m}`, DEFAUT),
              name_localizations: localisations(`anniversaire.mois.${m}`),
              value: m,
            });
          }
          return o;
        })
        .addIntegerOption((o) => o
          .setName('year')
          .setNameLocalizations({ fr: 'annee' })
          .setDescription(tr('anniversaire.opt_annee', DEFAUT))
          .setDescriptionLocalizations(localisations('anniversaire.opt_annee'))
          .setMinValue(1900)
          .setMaxValue(2030)))
    .addSubcommand((s) =>
      s
        .setName('view')
        .setNameLocalizations({ fr: 'voir' })
        .setDescription(tr('anniversaire.sous_voir', DEFAUT))
        .setDescriptionLocalizations(localisations('anniversaire.sous_voir'))
        .addUserOption((o) => o
          .setName('member')
          .setNameLocalizations({ fr: 'membre' })
          .setDescription(tr('anniversaire.opt_membre', DEFAUT))
          .setDescriptionLocalizations(localisations('anniversaire.opt_membre'))))
    .addSubcommand((s) => s
      .setName('remove')
      .setNameLocalizations({ fr: 'retirer' })
      .setDescription(tr('anniversaire.sous_retirer', DEFAUT))
      .setDescriptionLocalizations(localisations('anniversaire.sous_retirer')))
    .addSubcommand((s) => s
      .setName('list')
      .setNameLocalizations({ fr: 'liste' })
      .setDescription(tr('anniversaire.sous_liste', DEFAUT))
      .setDescriptionLocalizations(localisations('anniversaire.sous_liste'))),

  async execute(interaction) {
    const { t } = traducteur(interaction);
    const sous = interaction.options.getSubcommand();
    const guildId = interaction.guild.id;

    // ------------------------------------------------------------- SET
    if (sous === 'set') {
      const jour = interaction.options.getInteger('day');
      const mois = interaction.options.getInteger('month');
      const annee = interaction.options.getInteger('year') ?? 0;

      const date = anniv.valider(jour, mois);
      if (!date) {
        return interaction.reply(C.erreurPrivee(
          t('anniversaire.date_invalide', { date: formaterDate(jour, mois, t) })
        ));
      }

      req.poserAnniversaire.run({ guild_id: guildId, user_id: interaction.user.id, jour, mois, annee });

      const cfg = config(guildId);
      return interaction.reply(C.succesPrive(
        t('anniversaire.enregistre', { date: formaterDate(jour, mois, t) })
        + '\n'
        + (cfg.anniv_salon
          ? t('anniversaire.avec_salon', { salon: cfg.anniv_salon })
          : `-# ${t('anniversaire.sans_salon')}`)
        + (annee ? `\n-# ${t('anniversaire.annee_notee')}` : '')
      ));
    }

    // ---------------------------------------------------------- REMOVE
    if (sous === 'remove') {
      const retire = req.retirerAnniversaire.run(guildId, interaction.user.id).changes > 0;
      return interaction.reply(retire
        ? C.succesPrive(t('anniversaire.efface'))
        : C.infoPrivee(t('anniversaire.rien_a_effacer')));
    }

    // ------------------------------------------------------------ VIEW
    if (sous === 'view') {
      const cible = interaction.options.getUser('member') ?? interaction.user;
      const ligne = req.anniversaireDe.get(guildId, cible.id);
      if (!ligne) {
        return interaction.reply(C.infoPrivee(
          cible.id === interaction.user.id
            ? t('anniversaire.pas_de_date_soi')
            : t('anniversaire.pas_de_date_autre', { id: cible.id })
        ));
      }
      // L'annee n'est jamais affichee, meme si elle est enregistree.
      return interaction.reply(C.infoPrivee(
        `${E('fete')} <@${cible.id}> — **${formaterDate(ligne.jour, ligne.mois, t)}**`
      ));
    }

    // ------------------------------------------------------------ LIST
    const date = anniv.aujourdhui();
    const toutes = req.anniversairesDe.all(guildId);
    if (!toutes.length) {
      return interaction.reply(C.infoPrivee(t('anniversaire.liste_vide')));
    }

    // Trie par « dans combien de jours », pour que le prochain soit en tete.
    const distance = (l) => {
      const cette = new Date(Date.UTC(date.annee, l.mois - 1, l.jour));
      const jours = Math.round((cette - Date.UTC(date.annee, date.mois - 1, date.jour)) / 86_400_000);
      return jours >= 0 ? jours : jours + 365;
    };

    const lignes = toutes
      .sort((a, b) => distance(a) - distance(b))
      .slice(0, 20)
      .map((l) => {
        const d = distance(l);
        const quand = d === 0
          ? t('anniversaire.jour_aujourdhui')
          : d === 1
            ? t('anniversaire.jour_demain')
            : t('anniversaire.jour_dans', { n: d });
        return `${d === 0 ? E('fete') : '·'} <@${l.user_id}> — ${formaterDate(l.jour, l.mois, t)} (${quand})`;
      });

    return interaction.reply(C.envoiPrive([
      C.conteneur([
        C.texte(`## ${E('fete')} ${t('anniversaire.liste_titre')}`),
        C.texte(lignes.join('\n')),
        C.separateur(),
        C.texte(`-# ${t('anniversaire.liste_pied', { n: toutes.length })}`),
      ], conf.couleurs.principale),
    ]));
  },
};
