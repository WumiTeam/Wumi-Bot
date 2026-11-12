const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  MessageFlags,
  AttachmentBuilder,
} = require('discord.js');
const conf = require('../../../config');
const { ts } = require('../../utils/outils');
const C = require('../../utils/composants');
const sauvegardes = require('../../utils/sauvegardes');
const { E } = require('../../utils/emojis');
const { traducteur, localisations, t: tr, DEFAUT } = require('../../utils/langues');

const LIMITE_ENVOI = 8 * 1024 * 1024; // marge sous la limite de piece jointe Discord

module.exports = {
  categorie: 'utilitaires',
  // SECURITE : une sauvegarde contient la base ENTIERE (tous les serveurs).
  // Commande de fondateur : deployee seulement sur le serveur support, et
  // re-verifiee a l'execution (un admin de serveur ne doit jamais l'obtenir).
  fondateur: true,

  data: new SlashCommandBuilder()
    .setName('backup')
    .setNameLocalizations({ fr: 'sauvegarde' })
    .setDescription(tr('sauvegarde.description_commande', DEFAUT))
    .setDescriptionLocalizations(localisations('sauvegarde.description_commande'))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand((s) => s
      .setName('create')
      .setNameLocalizations({ fr: 'creer' })
      .setDescription(tr('sauvegarde.sous_creer', DEFAUT))
      .setDescriptionLocalizations(localisations('sauvegarde.sous_creer'))
      .addBooleanOption((o) => o
        .setName('send')
        .setNameLocalizations({ fr: 'envoyer' })
        .setDescription(tr('sauvegarde.opt_envoyer', DEFAUT))
        .setDescriptionLocalizations(localisations('sauvegarde.opt_envoyer'))))
    .addSubcommand((s) => s
      .setName('list')
      .setNameLocalizations({ fr: 'liste' })
      .setDescription(tr('sauvegarde.sous_liste', DEFAUT))
      .setDescriptionLocalizations(localisations('sauvegarde.sous_liste'))),

  async execute(interaction) {
    const { t, nombre, duree: enDuree } = traducteur(interaction);
    if (!require('../../utils/fondateur').estFondateur(interaction.user.id)) {
      return interaction.reply(C.erreurPrivee(t('sauvegarde.reserve')));
    }
    const sous = interaction.options.getSubcommand();

    // ============================================================ LISTE
    if (sous === 'list') {
      const fichiers = sauvegardes.lister();
      const derniere = sauvegardes.derniere();
      const ko = t('sauvegarde.unite_ko');

      return interaction.reply(C.envoiPrive([
        C.conteneur([
          C.texte(`## ${E('disquette')} ${t('sauvegarde.titre')}`),
          C.texte(
            fichiers.length
              ? fichiers
                  .slice(0, 15)
                  .map((f) => `\`${f.nom}\` · ${nombre(Math.round(f.taille / 1024))} ${ko} · ${ts(f.date, 'R')}`)
                  .join('\n')
              : t('sauvegarde.aucune')
          ),
          C.separateur(),
          C.texte(
            `**${t('sauvegarde.champ_base_actuelle')}**\n${nombre(Math.round(sauvegardes.tailleBase() / 1024))} ${ko}\n\n`
            + `**${t('sauvegarde.champ_copies_conservees')}**\n${nombre(fichiers.length)} / ${nombre(conf.sauvegardes.aConserver)}\n\n`
            + `**${t('sauvegarde.champ_automatique')}**\n${conf.sauvegardes.actif ? t('sauvegarde.valeur_toutes_les_h', { n: nombre(conf.sauvegardes.intervalleHeures) }) : t('sauvegarde.valeur_desactivee')}\n\n`
            + `**${t('sauvegarde.champ_derniere')}**\n${derniere ? t('sauvegarde.valeur_derniere_format', { ts: ts(derniere), duree: enDuree(Date.now() - derniere) }) : t('sauvegarde.valeur_jamais')}`
          ),
          C.separateur(),
          C.texte(`-# ${t('sauvegarde.pied_dossier', { dossier: conf.sauvegardes.dossier })}`),
        ], conf.couleurs.principale),
      ]));
    }

    // ============================================================ CREER
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    let res;
    try {
      res = sauvegardes.creer('manuel');
    } catch (e) {
      return interaction.editReply(C.erreur(t('sauvegarde.erreur_creation', { erreur: e.message })));
    }

    const envoyer = interaction.options.getBoolean('send');
    let messagePrive = '';

    if (envoyer) {
      if (res.taille > LIMITE_ENVOI) {
        messagePrive = `\n${t('sauvegarde.trop_lourd', { mo: (res.taille / 1024 / 1024).toFixed(1) })}`;
      } else {
        const envoi = await interaction.user
          .send(C.envoi([
            C.conteneur([
              C.texte(`## ${E('disquette')} ${t('sauvegarde.dm_titre')}`),
              C.texte(t('sauvegarde.dm_description', { serveur: interaction.guild?.name ?? '—', nom: res.nom })),
            ], conf.couleurs.principale),
          ], { files: [new AttachmentBuilder(res.chemin, { name: res.nom })] }))
          .catch(() => null);
        messagePrive = `\n${envoi ? t('sauvegarde.dm_envoye') : t('sauvegarde.dm_echec')}`;
      }
    }

    return interaction.editReply(C.succes(
      t('sauvegarde.cree', { nom: res.nom, taille: `${nombre(Math.round(res.taille / 1024))} ${t('sauvegarde.unite_ko')}` })
      + messagePrive
      + `\n-# ${t('sauvegarde.copies_pied', { n: sauvegardes.lister().length, dossier: conf.sauvegardes.dossier })}`
    ));
  },
};
