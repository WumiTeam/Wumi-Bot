const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  MessageFlags,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  AttachmentBuilder,
  InteractionContextType,
} = require('discord.js');
const conf = require('../../../config');
const C = require('../../utils/composants');
const { config, majConfig } = require('../../database/db');
const structure = require('../../utils/structure');
const reparer = require('../../utils/structureReparer');
const { ts, tronquer } = require('../../utils/outils');
const { E } = require('../../utils/emojis');
const { traducteur, localisations, t: tr, DEFAUT } = require('../../utils/langues');

const CONFIRMATION_MS = 60_000;

// Les reglages de serveur suivis par une photo portent une cle stable (voir
// src/utils/structure.js#comparer) : on s'en sert pour traduire nous-memes le
// libelle plutot que d'afficher celui, en dur en francais, que l'utilitaire
// renvoie. Voir le rapport final pour le detail de ce contournement.
const LIBELLES_RESERVE = {
  nom: 'structure.reglage_nom',
  everyone: 'structure.reglage_everyone',
  verification: 'structure.reglage_verification',
  notifications: 'structure.reglage_notifications',
  filtreMedias: 'structure.reglage_filtre_medias',
  salonAfk: 'structure.reglage_salon_afk',
  salonSysteme: 'structure.reglage_salon_systeme',
};

/** Coupe une liste de noms pour tenir dans un bloc de texte. */
function liste(t, noms, vide = '—') {
  if (!noms.length) return vide;
  const texte = noms.slice(0, 12).map((n) => `\`${n}\``).join(', ');
  return noms.length > 12 ? `${texte} ${t('structure.et_de_plus', { n: noms.length - 12 })}` : texte;
}

/**
 * Blocs de texte comparant une photo au serveur d'aujourd'hui.
 * Reutilise pour /structure comparer ET pour l'apercu avant /structure reparer.
 */
function blocsComparaison(t, diff) {
  const blocs = [];

  const r = diff.roles;
  if (r.manquants.length || r.renommes.length || r.permissions.length || r.apparences.length) {
    blocs.push(C.texte([
      `**${E('role')} ${t('structure.roles_titre')}**`,
      r.manquants.length ? t('structure.roles_disparus', { n: r.manquants.length, liste: liste(t, r.manquants.map((x) => x.nom)) }) : null,
      r.renommes.length ? t('structure.roles_renommes', { n: r.renommes.length, liste: liste(t, r.renommes.map((x) => `${x.avant} → ${x.apres}`)) }) : null,
      r.permissions.length ? t('structure.roles_permissions', { n: r.permissions.length, liste: liste(t, r.permissions.map((x) => x.nom)) }) : null,
      r.apparences.length ? t('structure.roles_apparences', { n: r.apparences.length, liste: liste(t, r.apparences.map((x) => x.nom)) }) : null,
    ].filter(Boolean).join('\n')));
  }

  const c = diff.salons;
  if (c.manquants.length || c.renommes.length || c.permissions.length || c.deplaces.length || c.reglages.length) {
    blocs.push(C.texte([
      `**${E('message')} ${t('structure.salons_titre')}**`,
      // structure.nomType() renvoie un libelle en dur en francais (utilitaire
      // hors de mon lot) : signale dans le rapport, pas traduisible ici.
      c.manquants.length ? t('structure.salons_disparus', { n: c.manquants.length, liste: liste(t, c.manquants.map((x) => `${x.nom} (${structure.nomType(x.type)})`)) }) : null,
      c.renommes.length ? t('structure.salons_renommes', { n: c.renommes.length, liste: liste(t, c.renommes.map((x) => `${x.avant} → ${x.apres}`)) }) : null,
      c.permissions.length ? t('structure.salons_permissions', { n: c.permissions.length, liste: liste(t, c.permissions.map((x) => x.nom)) }) : null,
      c.deplaces.length ? t('structure.salons_deplaces', { n: c.deplaces.length, liste: liste(t, c.deplaces.map((x) => x.nom)) }) : null,
      c.reglages.length ? t('structure.salons_reglages', { n: c.reglages.length, liste: liste(t, c.reglages.map((x) => x.nom)) }) : null,
    ].filter(Boolean).join('\n')));
  }

  if (diff.serveur.length) {
    blocs.push(C.texte(
      `**${E('config')} ${t('structure.serveur_reglages_titre')}**\n`
      + diff.serveur.map((s) => `• ${t(LIBELLES_RESERVE[s.cle] ?? s.libelle)}`).join('\n')
    ));
  }

  if (diff.ajouts) {
    blocs.push(C.texte(
      `**➕ ${t('structure.ajouts_titre')}**\n`
      + t('structure.ajouts_valeur', { roles: diff.roles.ajoutes.length, salons: diff.salons.ajoutes.length })
    ));
  }

  return blocs;
}

module.exports = {
  categorie: 'config',

  data: new SlashCommandBuilder()
    // « structure » s'ecrit pareil dans les deux langues : pas de localisation de nom.
    .setName('structure')
    .setDescription(tr('structure.description_commande', DEFAUT))
    .setDescriptionLocalizations(localisations('structure.description_commande'))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setContexts(InteractionContextType.Guild)

    .addSubcommand((s) =>
      s
        // « photo » s'ecrit pareil dans les deux langues.
        .setName('photo')
        .setDescription(tr('structure.sous_photo', DEFAUT))
        .setDescriptionLocalizations(localisations('structure.sous_photo'))
        .addStringOption((o) =>
          o
            .setName('name')
            .setNameLocalizations({ fr: 'nom' })
            .setDescription(tr('structure.opt_nom', DEFAUT))
            .setDescriptionLocalizations(localisations('structure.opt_nom'))
            .setMaxLength(60)
        )
    )
    .addSubcommand((s) =>
      s
        .setName('list')
        .setNameLocalizations({ fr: 'liste' })
        .setDescription(tr('structure.sous_liste', DEFAUT))
        .setDescriptionLocalizations(localisations('structure.sous_liste'))
    )
    .addSubcommand((s) =>
      s
        .setName('compare')
        .setNameLocalizations({ fr: 'comparer' })
        .setDescription(tr('structure.sous_comparer', DEFAUT))
        .setDescriptionLocalizations(localisations('structure.sous_comparer'))
        .addIntegerOption((o) =>
          // « photo » s'ecrit pareil dans les deux langues.
          o
            .setName('photo')
            .setDescription(tr('structure.opt_photo_defaut', DEFAUT))
            .setDescriptionLocalizations(localisations('structure.opt_photo_defaut'))
            .setMinValue(1)
        )
    )
    .addSubcommand((s) =>
      s
        .setName('repair')
        .setNameLocalizations({ fr: 'reparer' })
        .setDescription(tr('structure.sous_reparer', DEFAUT))
        .setDescriptionLocalizations(localisations('structure.sous_reparer'))
        .addIntegerOption((o) =>
          o
            .setName('photo')
            .setDescription(tr('structure.opt_photo', DEFAUT))
            .setDescriptionLocalizations(localisations('structure.opt_photo'))
            .setRequired(true)
            .setMinValue(1)
        )
        .addStringOption((o) =>
          o
            .setName('what')
            .setNameLocalizations({ fr: 'quoi' })
            .setDescription(tr('structure.opt_quoi', DEFAUT))
            .setDescriptionLocalizations(localisations('structure.opt_quoi'))
            .addChoices(
              { name: tr('structure.choix_tout', DEFAUT), name_localizations: localisations('structure.choix_tout'), value: 'tout' },
              { name: tr('structure.choix_roles', DEFAUT), name_localizations: localisations('structure.choix_roles'), value: 'roles' },
              { name: tr('structure.choix_salons', DEFAUT), name_localizations: localisations('structure.choix_salons'), value: 'salons' },
              { name: tr('structure.choix_permissions', DEFAUT), name_localizations: localisations('structure.choix_permissions'), value: 'permissions' },
              { name: tr('structure.choix_serveur', DEFAUT), name_localizations: localisations('structure.choix_serveur'), value: 'serveur' }
            )
        )
    )
    .addSubcommand((s) =>
      s
        .setName('export')
        .setNameLocalizations({ fr: 'exporter' })
        .setDescription(tr('structure.sous_exporter', DEFAUT))
        .setDescriptionLocalizations(localisations('structure.sous_exporter'))
        .addIntegerOption((o) =>
          o
            .setName('photo')
            .setDescription(tr('structure.opt_photo', DEFAUT))
            .setDescriptionLocalizations(localisations('structure.opt_photo'))
            .setRequired(true)
            .setMinValue(1)
        )
    )
    .addSubcommand((s) =>
      s
        .setName('import')
        .setNameLocalizations({ fr: 'importer' })
        .setDescription(tr('structure.sous_importer', DEFAUT))
        .setDescriptionLocalizations(localisations('structure.sous_importer'))
        .addAttachmentOption((o) =>
          o
            .setName('file')
            .setNameLocalizations({ fr: 'fichier' })
            .setDescription(tr('structure.opt_fichier', DEFAUT))
            .setDescriptionLocalizations(localisations('structure.opt_fichier'))
            .setRequired(true)
        )
        .addStringOption((o) =>
          o
            .setName('name')
            .setNameLocalizations({ fr: 'nom' })
            .setDescription(tr('structure.opt_nom', DEFAUT))
            .setDescriptionLocalizations(localisations('structure.opt_nom'))
            .setMaxLength(50)
        )
    )
    .addSubcommand((s) =>
      s
        .setName('delete')
        .setNameLocalizations({ fr: 'supprimer' })
        .setDescription(tr('structure.sous_supprimer', DEFAUT))
        .setDescriptionLocalizations(localisations('structure.sous_supprimer'))
        .addIntegerOption((o) =>
          o
            .setName('photo')
            .setDescription(tr('structure.opt_photo', DEFAUT))
            .setDescriptionLocalizations(localisations('structure.opt_photo'))
            .setRequired(true)
            .setMinValue(1)
        )
    )
    .addSubcommand((s) =>
      s
        // « auto » s'ecrit pareil dans les deux langues.
        .setName('auto')
        .setDescription(tr('structure.sous_auto', DEFAUT))
        .setDescriptionLocalizations(localisations('structure.sous_auto'))
        .addBooleanOption((o) =>
          o
            .setName('enabled')
            .setNameLocalizations({ fr: 'actif' })
            .setDescription(tr('structure.opt_actif', DEFAUT))
            .setDescriptionLocalizations(localisations('structure.opt_actif'))
        )
        .addIntegerOption((o) =>
          o
            .setName('keep')
            .setNameLocalizations({ fr: 'garder' })
            .setDescription(tr('structure.opt_garder', DEFAUT))
            .setDescriptionLocalizations(localisations('structure.opt_garder'))
            .setMinValue(1)
            .setMaxValue(50)
        )
    ),

  async execute(interaction) {
    const { t } = traducteur(interaction);
    const sous = interaction.options.getSubcommand();
    const guild = interaction.guild;
    const guildId = guild.id;

    // ============================================================== PHOTO
    if (sous === 'photo') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      try {
        const { id, contenu } = structure.enregistrer(guild, {
          nom: interaction.options.getString('name'),
          auteurId: interaction.user.id,
        });
        return interaction.editReply(C.succes(t('structure.photo_prise', {
          n: id,
          roles: contenu.roles.length,
          salons: contenu.salons.length,
        })));
      } catch (e) {
        return interaction.editReply(C.erreur(t('structure.photo_impossible', { erreur: e.message })));
      }
    }

    // ============================================================== LISTE
    if (sous === 'list') {
      const photos = structure.lister(guildId, 20);
      const cfg = config(guildId);
      return interaction.reply(C.envoiPrive([C.conteneur([
        C.texte(`## ${E('dossier')} ${t('structure.liste_titre')}`),
        C.texte(photos.length
          ? photos
              .map((p) => t('structure.liste_ligne', {
                n: p.id,
                nom: tronquer(p.nom ?? t('structure.liste_sans_nom'), 30),
                roles: p.nb_roles,
                salons: p.nb_salons,
                date: ts(p.cree_le, 'R'),
                auto: p.automatique ? t('structure.liste_auto_suffixe') : '',
              }))
              .join('\n')
          : t('structure.liste_vide')),
        C.separateur(),
        C.texte(
          `**${t('structure.liste_auto_titre')}** — ${cfg.structure_auto ? t('structure.liste_auto_valeur_actif') : t('structure.liste_auto_valeur_inactif')}\n`
          + `**${t('structure.liste_gardees_titre')}** — ${t('structure.liste_gardees', { n: photos.length, max: cfg.structure_max })}`
        ),
        C.texte(`-# ${t('structure.liste_pied')}`),
      ], conf.couleurs.principale)]));
    }

    // =============================================================== AUTO
    if (sous === 'auto') {
      const actif = interaction.options.getBoolean('enabled');
      const garder = interaction.options.getInteger('keep');
      if (actif === null && garder === null) {
        return interaction.reply(C.avertissementPrivee(t('structure.auto_manque_option')));
      }
      majConfig(guildId, {
        ...(actif === null ? {} : { structure_auto: actif ? 1 : 0 }),
        ...(garder === null ? {} : { structure_max: garder }),
      });
      if (garder !== null) structure.purger(guildId);
      const cfg = config(guildId);
      return interaction.reply(C.succes(t('structure.auto_fait', {
        actif: cfg.structure_auto ? t('structure.liste_auto_valeur_actif') : t('structure.liste_auto_valeur_inactif'),
        max: cfg.structure_max,
      })));
    }

    // ============================================================ IMPORTER
    // Un fichier de /structure exporter (de ce serveur ou d'un autre) devient
    // une photo d'ici. Rien n'est applique : on passe ensuite par
    // /structure comparer puis /structure reparer, avec leur confirmation.
    if (sous === 'import') {
      const fichier = interaction.options.getAttachment('file');
      if (!/\.json$/i.test(fichier.name ?? '') || fichier.size > structure.LIMITE_IMPORT) {
        return interaction.reply(C.erreurPrivee(t('structure.import_mauvais_fichier')));
      }
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      let brut;
      try {
        const reponse = await fetch(fichier.url, { signal: AbortSignal.timeout(10_000) });
        if (!reponse.ok) throw new Error(`HTTP ${reponse.status}`);
        const texte = await reponse.text();
        if (texte.length > structure.LIMITE_IMPORT) throw new Error('trop_gros');
        brut = JSON.parse(texte);
      } catch {
        return interaction.editReply(C.erreur(t('structure.import_illisible')));
      }
      const resultat = structure.nettoyerImport(brut, guildId);
      if (resultat.erreur) {
        return interaction.editReply(C.erreur(t(resultat.erreur === 'trop_gros' ? 'structure.import_trop_gros' : 'structure.import_illisible')));
      }
      const id = structure.enregistrerImport(guildId, resultat.contenu, {
        nom: interaction.options.getString('name') || t('structure.import_nom_defaut', { serveur: tronquer(resultat.contenu.serveur.nom ?? '?', 30) }),
        auteurId: interaction.user.id,
      });
      const diff = structure.comparer(resultat.contenu, guild);
      return interaction.editReply(C.succes(
        t('structure.import_fait', { n: id, roles: resultat.contenu.roles.length, salons: resultat.contenu.salons.length })
        + `\n${diff.total ? t('structure.import_differences', { n: diff.total }) : t('structure.import_identique')}`
        + (resultat.membresRetires ? `\n-# ${t('structure.import_membres_retires', { n: resultat.membresRetires })}` : '')
      ));
    }

    // ---- les commandes suivantes travaillent sur une photo precise ----
    const numero = interaction.options.getInteger('photo');
    const ligne = numero
      ? structure.charger(numero, guildId)
      : (() => {
          const derniere = structure.lister(guildId, 1)[0];
          return derniere ? structure.charger(derniere.id, guildId) : null;
        })();

    if (!ligne) {
      return interaction.reply(C.erreurPrivee(
        numero ? t('structure.introuvable_numero', { n: numero }) : t('structure.introuvable_aucune')
      ));
    }

    // ========================================================== SUPPRIMER
    if (sous === 'delete') {
      structure.supprimer(ligne.id, guildId);
      return interaction.reply(C.succesPrive(t('structure.supprimee', { n: ligne.id })));
    }

    // =========================================================== EXPORTER
    if (sous === 'export') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const fichier = Buffer.from(JSON.stringify(ligne.contenu, null, 2), 'utf8');
      const envoiDM = await interaction.user
        .send({
          content: t('structure.export_dm_contenu', { n: ligne.id, serveur: guild.name, date: ts(ligne.cree_le, 'R') }),
          files: [new AttachmentBuilder(fichier, { name: `structure-${guild.id}-${ligne.id}.json` })],
        })
        .catch(() => null);
      return interaction.editReply(envoiDM
        ? C.succes(t('structure.export_envoye'))
        : C.erreur(t('structure.export_impossible')));
    }

    // =========================================================== COMPARER
    if (sous === 'compare') {
      await interaction.deferReply();
      const diff = structure.comparer(ligne.contenu, guild);
      return interaction.editReply(C.envoi([C.conteneur([
        C.texte(`## ${E('loupe')} ${t('structure.comp_titre', { n: ligne.id })}`),
        C.texte(diff.total
          ? t('structure.comp_diff', { n: diff.total, date: ts(ligne.cree_le) })
          : t('structure.comp_identique', { date: ts(ligne.cree_le) })),
        ...blocsComparaison(t, diff),
        C.texte(`-# ${t('structure.comp_pied', { roles: ligne.nb_roles, salons: ligne.nb_salons })}`),
      ], diff.total ? conf.couleurs.avertissement : conf.couleurs.succes)]));
    }

    // ============================================================ REPARER
    await interaction.deferReply();

    // structureReparer.verifier() rend des phrases completes en dur en
    // francais (bloquants/avertissements) : utilitaire hors de mon lot, voir
    // le rapport final. Seule la phrase qui les introduit est traduite ici.
    const controle = reparer.verifier(ligne.contenu, guild);
    if (controle.bloquants.length) {
      return interaction.editReply(C.erreur(t('structure.reparer_bloque', { liste: controle.bloquants.map((b) => `• ${b}`).join('\n') })));
    }

    const diff = structure.comparer(ligne.contenu, guild);
    if (!diff.total) {
      return interaction.editReply(C.info(t('structure.reparer_deja_identique', { n: ligne.id })));
    }

    const choix = interaction.options.getString('what') ?? 'tout';
    const quoi = {
      roles: choix === 'tout' || choix === 'roles',
      salons: choix === 'tout' || choix === 'salons',
      permissions: choix === 'tout' || choix === 'permissions' || choix === 'salons',
      serveur: choix === 'tout' || choix === 'serveur',
    };
    const portee = {
      tout: t('structure.reparer_quoi_tout'),
      roles: t('structure.reparer_quoi_roles'),
      salons: t('structure.reparer_quoi_salons'),
      permissions: t('structure.reparer_quoi_permissions'),
      serveur: t('structure.reparer_quoi_serveur'),
    }[choix];

    const boutons = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('structure_ok').setLabel(t('structure.bouton_reparer')).setEmoji(E('outil')).setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('structure_non').setLabel(t('structure.bouton_annuler')).setStyle(ButtonStyle.Secondary)
    );

    const message = await interaction.editReply(C.envoi([C.conteneur([
      C.texte(`## ${E('outil')} ${t('structure.reparer_titre', { n: ligne.id })}`),
      C.texte(
        t('structure.reparer_intro') + '\n'
        + t('structure.reparer_portee', { quoi: portee })
        + (controle.avertissements.length ? `\n\n${controle.avertissements.map((a) => `${E('avertissement')} ${a}`).join('\n')}` : '')
      ),
      ...blocsComparaison(t, diff),
      boutons,
    ], conf.couleurs.avertissement)]));

    const bouton = await message
      .awaitMessageComponent({
        componentType: ComponentType.Button,
        time: CONFIRMATION_MS,
        filter: (b) => b.user.id === interaction.user.id,
      })
      .catch(() => null);

    if (!bouton || bouton.customId === 'structure_non') {
      return interaction.editReply(C.info(bouton ? t('structure.reparer_annulee') : t('structure.reparer_temps_ecoule')));
    }

    await bouton.update(C.info(t('structure.reparer_en_cours')));

    // Une photo juste avant, pour pouvoir revenir en arriere si la reparation
    // ne donne pas ce qui etait attendu.
    let avant = null;
    try {
      avant = structure.enregistrer(guild, { nom: t('structure.avant_photo_nom', { n: ligne.id }), auteurId: interaction.user.id }).id;
    } catch {
      /* on continue : ne pas bloquer la reparation pour ca */
    }

    let rapport;
    try {
      rapport = await reparer.reparer(ligne.contenu, guild, quoi, async (fait, _total, etape) => {
        if (fait % 15 !== 0) return;
        await interaction
          .editReply(C.info(t('structure.reparer_progression', { fait, etape })))
          .catch(() => null);
      });
    } catch (e) {
      return interaction.editReply(C.erreur(t('structure.reparer_interrompue', { erreur: e.message })));
    }

    const blocsResume = [
      C.texte(`## ${E('outil')} ${t('structure.resume_titre')}`),
      C.texte(rapport.total
        ? t('structure.resume_n', { n: rapport.total, photo: ligne.id })
        : t('structure.resume_rien')),
    ];

    // Les noms lists (roles/salons) sont des DONNEES, jamais traduites. Les
    // entrees de rapport.ignores/erreurs, elles, sont des phrases en dur en
    // francais produites par structureReparer.js (hors de mon lot).
    if (rapport.rolesCrees.length) blocsResume.push(C.texte(`**${E('role')} ${t('structure.resume_roles_crees', { n: rapport.rolesCrees.length })}**\n${liste(t, rapport.rolesCrees)}`));
    if (rapport.rolesModifies.length) blocsResume.push(C.texte(`**${E('role')} ${t('structure.resume_roles_modifies', { n: rapport.rolesModifies.length })}**\n${liste(t, rapport.rolesModifies)}`));
    if (rapport.salonsCrees.length) blocsResume.push(C.texte(`**${E('message')} ${t('structure.resume_salons_crees', { n: rapport.salonsCrees.length })}**\n${liste(t, rapport.salonsCrees)}`));
    if (rapport.salonsModifies.length) blocsResume.push(C.texte(`**${E('message')} ${t('structure.resume_salons_modifies', { n: rapport.salonsModifies.length })}**\n${liste(t, rapport.salonsModifies)}`));
    if (rapport.permissionsRemises.length) blocsResume.push(C.texte(`**${E('securite')} ${t('structure.resume_permissions', { n: rapport.permissionsRemises.length })}**\n${liste(t, rapport.permissionsRemises)}`));
    if (rapport.serveurModifie.length) blocsResume.push(C.texte(`**${E('config')} ${t('structure.resume_serveur')}**\n${liste(t, rapport.serveurModifie)}`));
    if (rapport.ignores.length) blocsResume.push(C.texte(`**⏭️ ${t('structure.resume_ignores', { n: rapport.ignores.length })}**\n${liste(t, rapport.ignores)}`));
    if (rapport.erreurs.length) {
      blocsResume.push(C.texte(`**${E('avertissement')} ${t('structure.resume_erreurs', { n: rapport.erreurs.length })}**\n${tronquer(rapport.erreurs.slice(0, 8).join('\n'), 1000)}`));
    }
    blocsResume.push(C.texte(`-# ${avant ? t('structure.resume_pied_photo', { n: avant }) : t('structure.resume_pied_vide')}`));

    return interaction.editReply(C.envoi([C.conteneur(
      blocsResume,
      rapport.erreurs.length ? conf.couleurs.avertissement : conf.couleurs.succes
    )]));
  },
};
