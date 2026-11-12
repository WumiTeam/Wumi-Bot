const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  InteractionContextType,
  AttachmentBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
} = require('discord.js');
const { genererCarteSolde, genererCarteGain } = require('../../utils/carteEconomie');
const { genererCarteClassement } = require('../../utils/carteClassement');
const { abreger } = require('../../utils/outils');
const logger = require('../../utils/logger');
const conf = require('../../../config');
const { req, config, majConfig } = require('../../database/db');
const eco = require('../../utils/economie');
const { E } = require('../../utils/emojis');
const C = require('../../utils/composants');
const { traducteur, localisations, t: tr, DEFAUT } = require('../../utils/langues');

// Une FONCTION, pas un tableau : les emojis du bot ne sont connus qu'apres
// la connexion a Discord, et un tableau construit au chargement du module
// figerait les replis Unicode pour toute la duree du processus.
const MEDAILLES = () => [E('premier'), E('deuxieme'), E('troisieme')];

module.exports = {
  categorie: 'economie',
  vues: () => ({ vueSolde, actions }),

  data: new SlashCommandBuilder()
    .setName('economy')
    .setNameLocalizations({ fr: 'economie' })
    .setDescription(tr('economie.description_commande', DEFAUT))
    .setDescriptionLocalizations(localisations('economie.description_commande'))
    .setContexts(InteractionContextType.Guild)

    .addSubcommand((s) => s
      .setName('balance')
      .setNameLocalizations({ fr: 'solde' })
      .setDescription(tr('economie.sous_solde', DEFAUT))
      .setDescriptionLocalizations(localisations('economie.sous_solde'))
      .addUserOption((o) => o
        .setName('member')
        .setNameLocalizations({ fr: 'membre' })
        .setDescription(tr('economie.opt_membre', DEFAUT))
        .setDescriptionLocalizations(localisations('economie.opt_membre'))))
    .addSubcommand((s) => s
      .setName('daily')
      .setDescription(tr('economie.sous_daily', DEFAUT))
      .setDescriptionLocalizations(localisations('economie.sous_daily')))
    .addSubcommand((s) => s
      .setName('work')
      .setNameLocalizations({ fr: 'travailler' })
      .setDescription(tr('economie.sous_travailler', DEFAUT))
      .setDescriptionLocalizations(localisations('economie.sous_travailler')))
    // Les transferts sont passes dans la commande /pay : elle applique la
    // taxe du serveur. Garder les deux chemins revenait a offrir un transfert
    // gratuit a cote d'un transfert taxe — personne n'aurait pris le second.
    .addSubcommand((s) => s
      .setName('leaderboard')
      .setNameLocalizations({ fr: 'classement' })
      .setDescription(tr('economie.sous_classement', DEFAUT))
      .setDescriptionLocalizations(localisations('economie.sous_classement'))
      .addIntegerOption((o) => o
        .setName('page')
        .setDescription(tr('economie.opt_page', DEFAUT))
        .setDescriptionLocalizations(localisations('economie.opt_page'))
        .setMinValue(1)))
    .addSubcommand((s) => s
      .setName('manage')
      .setNameLocalizations({ fr: 'gerer' })
      .setDescription(tr('economie.sous_gerer', DEFAUT))
      .setDescriptionLocalizations(localisations('economie.sous_gerer'))
      .addStringOption((o) => o
        .setName('action')
        .setDescription(tr('economie.opt_action', DEFAUT))
        .setDescriptionLocalizations(localisations('economie.opt_action'))
        .setRequired(true)
        .addChoices(
          { name: tr('economie.choix_ajouter', DEFAUT), name_localizations: localisations('economie.choix_ajouter'), value: 'ajouter' },
          { name: tr('economie.choix_retirer', DEFAUT), name_localizations: localisations('economie.choix_retirer'), value: 'retirer' },
          { name: tr('economie.choix_definir', DEFAUT), name_localizations: localisations('economie.choix_definir'), value: 'definir' }
        ))
      .addUserOption((o) => o
        .setName('member')
        .setNameLocalizations({ fr: 'membre' })
        .setDescription(tr('economie.opt_membre_gerer', DEFAUT))
        .setDescriptionLocalizations(localisations('economie.opt_membre_gerer'))
        .setRequired(true))
      .addIntegerOption((o) => o
        .setName('amount')
        .setNameLocalizations({ fr: 'montant' })
        .setDescription(tr('economie.opt_montant', DEFAUT))
        .setDescriptionLocalizations(localisations('economie.opt_montant'))
        .setRequired(true)
        .setMinValue(0)))

    .addSubcommandGroup((g) => g
      .setName('config')
      .setDescription(tr('economie.groupe_config', DEFAUT))
      .setDescriptionLocalizations(localisations('economie.groupe_config'))
      .addSubcommand((s) => s
        .setName('enable')
        .setNameLocalizations({ fr: 'activer' })
        .setDescription(tr('economie.sous_activer', DEFAUT))
        .setDescriptionLocalizations(localisations('economie.sous_activer'))
        .addBooleanOption((o) => o
          .setName('enabled')
          .setNameLocalizations({ fr: 'actif' })
          .setDescription(tr('economie.opt_actif', DEFAUT))
          .setDescriptionLocalizations(localisations('economie.opt_actif'))
          .setRequired(true)))
      .addSubcommand((s) => s
        .setName('currency')
        .setNameLocalizations({ fr: 'monnaie' })
        .setDescription(tr('economie.sous_monnaie', DEFAUT))
        .setDescriptionLocalizations(localisations('economie.sous_monnaie'))
        .addStringOption((o) => o
          .setName('name')
          .setNameLocalizations({ fr: 'nom' })
          .setDescription(tr('economie.opt_nom', DEFAUT))
          .setDescriptionLocalizations(localisations('economie.opt_nom'))
          .setMaxLength(30))
        .addStringOption((o) => o
          .setName('emoji')
          .setDescription(tr('economie.opt_emoji', DEFAUT))
          .setDescriptionLocalizations(localisations('economie.opt_emoji'))
          .setMaxLength(64))
        .addBooleanOption((o) => o
          .setName('default-emoji')
          .setNameLocalizations({ fr: 'emoji-defaut' })
          .setDescription(tr('economie.opt_emoji_reset', DEFAUT))
          .setDescriptionLocalizations(localisations('economie.opt_emoji_reset'))))
      .addSubcommand((s) => s
        .setName('earnings')
        .setNameLocalizations({ fr: 'gains' })
        .setDescription(tr('economie.sous_gains', DEFAUT))
        .setDescriptionLocalizations(localisations('economie.sous_gains'))
        .addIntegerOption((o) => o
          .setName('per-message')
          .setNameLocalizations({ fr: 'par-message' })
          .setDescription(tr('economie.opt_par_message', DEFAUT))
          .setDescriptionLocalizations(localisations('economie.opt_par_message'))
          .setMinValue(0).setMaxValue(100))
        .addIntegerOption((o) => o
          .setName('daily')
          .setDescription(tr('economie.opt_daily', DEFAUT))
          .setDescriptionLocalizations(localisations('economie.opt_daily'))
          .setMinValue(0).setMaxValue(100000))
        .addIntegerOption((o) => o
          .setName('work-min')
          .setNameLocalizations({ fr: 'travail-min' })
          .setDescription(tr('economie.opt_travail_min', DEFAUT))
          .setDescriptionLocalizations(localisations('economie.opt_travail_min'))
          .setMinValue(0).setMaxValue(100000))
        .addIntegerOption((o) => o
          .setName('work-max')
          .setNameLocalizations({ fr: 'travail-max' })
          .setDescription(tr('economie.opt_travail_max', DEFAUT))
          .setDescriptionLocalizations(localisations('economie.opt_travail_max'))
          .setMinValue(0).setMaxValue(100000))
        .addIntegerOption((o) => o
          .setName('work-delay')
          .setNameLocalizations({ fr: 'travail-delai' })
          .setDescription(tr('economie.opt_travail_delai', DEFAUT))
          .setDescriptionLocalizations(localisations('economie.opt_travail_delai'))
          .setMinValue(1).setMaxValue(1440)))
      .addSubcommand((s) => s
        .setName('reset')
        .setDescription(tr('economie.sous_reset', DEFAUT))
        .setDescriptionLocalizations(localisations('economie.sous_reset')))
      .addSubcommand((s) => s
        .setName('view')
        .setNameLocalizations({ fr: 'voir' })
        .setDescription(tr('economie.sous_config_voir', DEFAUT))
        .setDescriptionLocalizations(localisations('economie.sous_config_voir')))),

  async execute(interaction) {
    const { t, nombre, duree } = traducteur(interaction);
    const groupe = interaction.options.getSubcommandGroup(false);
    const sous = interaction.options.getSubcommand();
    const guildId = interaction.guild.id;
    const cfg = config(guildId);
    const m = eco.monnaie(guildId);

    // ==================================================== CONFIGURATION
    if (groupe === 'config') {
      if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
        return interaction.reply(C.erreurPrivee(t('economie.perm_config')));
      }

      switch (sous) {
        case 'enable': {
          const actif = interaction.options.getBoolean('enabled');
          majConfig(guildId, { eco_actif: actif ? 1 : 0 });
          return interaction.reply(C.succes(t(actif ? 'economie.eco_activee' : 'economie.eco_desactivee')));
        }
        case 'currency': {
          const valeurs = {};
          const nom = interaction.options.getString('name');
          const emoji = interaction.options.getString('emoji');
          if (nom !== null) valeurs.eco_nom = nom;
          if (emoji !== null) {
            // « :Wumis: » tape a la main n'est pas un emoji pour Discord :
            // on le cherche parmi ceux du serveur, sinon on refuse.
            const resolu = eco.resoudreEmoji(interaction.guild, emoji);
            if (!resolu) return interaction.reply(C.erreurPrivee(t('economie.monnaie_emoji_invalide', { emoji })));
            valeurs.eco_emoji = resolu;
          }
          if (interaction.options.getBoolean('default-emoji')) valeurs.eco_emoji = null;
          if (!Object.keys(valeurs).length) {
            return interaction.reply(C.erreurPrivee(t('economie.monnaie_vide')));
          }
          majConfig(guildId, valeurs);
          const maj = eco.monnaie(guildId);
          return interaction.reply(C.succes(t('economie.monnaie_fait', { emoji: maj.emoji, nom: maj.nom })));
        }
        case 'earnings': {
          const valeurs = {};
          const map = {
            'per-message': 'eco_gain_message',
            daily: 'eco_daily',
            'work-min': 'eco_travail_min',
            'work-max': 'eco_travail_max',
            'work-delay': 'eco_travail_delai',
          };
          for (const [option, colonne] of Object.entries(map)) {
            const v = interaction.options.getInteger(option);
            if (v !== null) valeurs[colonne] = v;
          }
          if (!Object.keys(valeurs).length) {
            return interaction.reply(C.erreurPrivee(t('economie.gains_vide')));
          }
          majConfig(guildId, valeurs);
          const c = config(guildId);
          return interaction.reply(C.succes(
            `${t('economie.gains_titre')}\n`
            + `> ${t('economie.gains_message', { n: nombre(c.eco_gain_message) })}\n`
            + `> ${t('economie.gains_quotidien', { n: nombre(c.eco_daily) })}\n`
            + `> ${t('economie.gains_travail', { min: nombre(c.eco_travail_min), max: nombre(c.eco_travail_max), delai: nombre(c.eco_travail_delai) })}`
          ));
        }
        case 'reset': {
          const res = req.resetEcoGuild.run(guildId);
          return interaction.reply(C.succes(t('economie.reset_fait', { n: nombre(res.changes) })));
        }
        default: {
          const defaut = !eco.emojiValide(cfg.eco_emoji);
          return interaction.reply(C.envoi([
            C.conteneur([
              C.texte(`## ${m.emoji} ${t('economie.config_titre')}`),
              C.texte(`${t('economie.config_etat')} · ${cfg.eco_actif ? `${E('succes')} ${t('economie.etat_actif')}` : `${E('erreur')} ${t('economie.etat_inactif')}`}`),
              C.separateur(),
              C.texte(
                `### ${t('economie.config_section_monnaie')}\n`
                + `${m.emoji} **${m.nom}**${defaut ? `\n-# ${t('economie.monnaie_defaut')}` : ''}`
              ),
              C.texte(
                `### ${t('economie.config_section_gains')}\n`
                + `${E('message')} ${t('economie.config_gain_message')} · ${m.emoji} **${nombre(cfg.eco_gain_message)}**\n`
                + `${E('cadeau')} ${t('economie.config_quotidien')} · ${m.emoji} **${nombre(cfg.eco_daily)}**\n`
                + `${E('outil')} ${t('economie.config_travail')} · ${m.emoji} **${t('economie.config_travail_plage', { min: nombre(cfg.eco_travail_min), max: nombre(cfg.eco_travail_max) })}** · ${E('sablier')} ${t('economie.minutes', { n: nombre(cfg.eco_travail_delai) })}`
              ),
              C.texte(
                `### ${t('economie.config_section_stats')}\n`
                + `${E('panier')} ${t('economie.config_articles')} · **${nombre(req.articles.all(guildId).length)}**\n`
                + `${E('membres')} ${t('economie.config_riches')} · **${nombre(req.totalRiches.get(guildId).n)}**`
              ),
              C.separateur(),
              C.texte(`-# ${t('economie.config_pied')}`),
            ], OR),
          ]));
        }
      }
    }

    // -------------------------------------------------- ECONOMIE ACTIVE ?
    if (!cfg.eco_actif && sous !== 'manage') {
      return interaction.reply(C.avertissementPrivee(t('economie.desactivee_ici')));
    }

    // ============================================================ MANAGE
    if (sous === 'manage') {
      if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
        return interaction.reply(C.erreurPrivee(t('economie.gerer_reserve')));
      }
      const cible = interaction.options.getUser('member');
      const montant = interaction.options.getInteger('amount');
      const action = interaction.options.getString('action');
      const avant = eco.solde(guildId, cible.id);

      let apres;
      if (action === 'definir') {
        req.definirSolde.run(guildId, cible.id, montant);
        apres = montant;
      } else {
        apres = eco.crediter(guildId, cible.id, action === 'ajouter' ? montant : -Math.min(montant, avant), action === 'ajouter');
      }

      return interaction.reply(C.succes(
        t('economie.gerer_fait', { membre: cible.id, avant: eco.somme(guildId, avant), apres: eco.somme(guildId, apres) })
      ));
    }

    if (sous === 'daily') return interaction.reply(await vueDaily(interaction));
    if (sous === 'work') return interaction.reply(await vueTravail(interaction));
    if (sous === 'leaderboard') {
      await interaction.deferReply();
      return interaction.editReply(await vueClassement(interaction, Math.max(0, (interaction.options.getInteger('page') ?? 1) - 1)));
    }
    await interaction.deferReply();
    return interaction.editReply(await vueSolde(interaction, interaction.options.getUser('member') ?? interaction.user));
  },

  /** Boutons eco_* : chacun agit pour la personne qui clique. */
  async gererInteraction(interaction) {
    const { t } = traducteur(interaction);
    if (!interaction.guild) return;
    if (!config(interaction.guild.id).eco_actif) return interaction.reply(C.avertissementPrivee(t('economie.desactivee_ici')));
    const id = interaction.customId;
    if (id === 'eco_daily') return interaction.reply(await vueDaily(interaction));
    if (id === 'eco_travail') return interaction.reply(await vueTravail(interaction));
    if (id === 'eco_solde') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      return interaction.editReply(await vueSolde(interaction, interaction.user, true));
    }
    if (id === 'eco_classement') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      return interaction.editReply(await vueClassement(interaction, 0, true));
    }
    if (id.startsWith('eco_page:')) {
      // Pages du classement : on remplace le message en place.
      await interaction.deferUpdate();
      const prive = interaction.message.flags.has(MessageFlags.Ephemeral);
      const vue = await vueClassement(interaction, Math.max(0, Number(id.split(':')[1]) || 0), prive);
      return interaction.editReply({ ...vue, flags: MessageFlags.IsComponentsV2, attachments: [] });
    }
  },
};

// ======================================================================
//                                VUES
// ======================================================================

const OR = 0xf8bd2c;

/** Rangee de boutons d'actions rapides (sans celui de la vue courante). */
function actions(t, sauf) {
  const b = [
    ['eco_daily', 'btn_daily', E('cadeau')],
    ['eco_travail', 'btn_travail', E('outil')],
    ['eco_solde', 'btn_solde', E('economie')],
    ['eco_classement', 'btn_classement', E('classement')],
  ].filter(([id]) => id !== sauf);
  return new ActionRowBuilder().addComponents(b.map(([id, cle, emoji]) => {
    const bouton = new ButtonBuilder().setCustomId(id).setLabel(t(`economie.${cle}`)).setStyle(ButtonStyle.Secondary);
    const e = emojiBouton(emoji);
    if (e) bouton.setEmoji(e);
    return bouton;
  }));
}

/** Un emoji (Unicode ou <:nom:id>) au format attendu par un bouton. */
function emojiBouton(texte) {
  const m = /^<(a?):(\w+):(\d+)>$/.exec(texte ?? '');
  if (m) return { id: m[3], name: m[2], animated: !!m[1] };
  return texte || null;
}

/** Horodatage relatif Discord (« dans 3 heures »), traduit par le client. */
const dans = (ms) => `<t:${Math.floor((Date.now() + ms) / 1000)}:R>`;

function nomDe(interaction, user) {
  const membre = interaction.guild.members.cache.get(user.id);
  return membre?.displayName ?? user.globalName ?? user.username;
}

function avatarDe(interaction, user) {
  const membre = interaction.guild.members.cache.get(user.id);
  return (membre ?? user).displayAvatarURL({ extension: 'png', size: 256 });
}

/** /economy daily (ou bouton). */
async function vueDaily(interaction) {
  const { t, nombre } = traducteur(interaction);
  const guildId = interaction.guild.id;
  const m = eco.monnaie(guildId);
  const res = eco.reclamerDaily(guildId, interaction.user.id);
  if (!res.ok) {
    return C.envoiPrive([C.conteneur([
      C.texte(`${E('sablier')} ${t('economie.attente_daily', { quand: dans(res.resteMs) })}`),
      actions(t, 'eco_daily'),
    ], conf.couleurs.avertissement)]);
  }
  const solde = eco.solde(guildId, interaction.user.id);
  const elements = [];
  const options = {};
  try {
    const png = await genererCarteGain({
      nom: nomDe(interaction, interaction.user),
      avatar: avatarDe(interaction, interaction.user),
      titre: t('economie.daily_titre'),
      montant: `+${nombre(res.gain)}`,
      monnaie: m.nom,
      badge: res.bonus ? `+${res.bonus} %` : null,
      sousTitre: res.bonus ? t('economie.gain_base', { base: nombre(res.base) }) : t('economie.gain_premier'),
      serie: res.serie,
      serieTexte: t('economie.gain_serie', { n: res.serie }),
      solde: t('economie.gain_solde', { montant: nombre(solde), nom: m.nom }),
    });
    options.files = [new AttachmentBuilder(png, { name: 'daily.png' })];
    elements.push(C.image('attachment://daily.png'));
  } catch (e) {
    logger.avertissement('Carte daily :', e.message);
    elements.push(C.texte(
      `## ${m.emoji} ${t('economie.daily_titre')}\n${t('economie.daily_gain', { somme: eco.somme(guildId, res.gain) })}\n`
      + (res.bonus ? `${E('feu')} ${t('economie.daily_serie', { n: nombre(res.serie), bonus: nombre(res.bonus) })}` : t('economie.daily_sans_serie'))
      + `\n${t('economie.daily_solde', { somme: eco.somme(guildId, solde) })}`
    ));
  }
  elements.push(C.texte(`-# ${E('sablier')} ${t('economie.prochain_daily', { quand: dans(24 * 3600_000) })}`));
  elements.push(actions(t, 'eco_daily'));
  return C.envoi([C.conteneur(elements, OR)], options);
}

/** /economy work (ou bouton). */
async function vueTravail(interaction) {
  const { t, nombre } = traducteur(interaction);
  const guildId = interaction.guild.id;
  const m = eco.monnaie(guildId);
  const res = eco.travailler(guildId, interaction.user.id);
  if (!res.ok) {
    return C.envoiPrive([C.conteneur([
      C.texte(`${E('sablier')} ${t('economie.attente_travail', { quand: dans(res.resteMs) })}`),
      actions(t, 'eco_travail'),
    ], conf.couleurs.avertissement)]);
  }
  // Sept activites possibles (economie.travail_activite.1 a .7)
  const activite = t(`economie.travail_activite.${Math.floor(Math.random() * 7) + 1}`);
  const solde = eco.solde(guildId, interaction.user.id);
  const delai = config(guildId).eco_travail_delai * 60_000;
  const elements = [];
  const options = {};
  try {
    const png = await genererCarteGain({
      nom: nomDe(interaction, interaction.user),
      avatar: avatarDe(interaction, interaction.user),
      titre: t('economie.travail_titre'),
      montant: `+${nombre(res.gain)}`,
      monnaie: m.nom,
      sousTitre: activite,
      solde: t('economie.gain_solde', { montant: nombre(solde), nom: m.nom }),
    });
    options.files = [new AttachmentBuilder(png, { name: 'travail.png' })];
    elements.push(C.image('attachment://travail.png'));
  } catch (e) {
    logger.avertissement('Carte travail :', e.message);
    elements.push(C.texte(`${t('economie.travail_fait', { activite, somme: eco.somme(guildId, res.gain) })}\n${t('economie.travail_solde', { somme: eco.somme(guildId, solde) })}`));
  }
  elements.push(C.texte(`-# ${E('sablier')} ${t('economie.prochain_travail', { quand: dans(delai) })}`));
  elements.push(actions(t, 'eco_travail'));
  return C.envoi([C.conteneur(elements, OR)], options);
}

/** /economy balance (ou bouton, en prive). */
async function vueSolde(interaction, cible, prive = false) {
  const { t, nombre, duree } = traducteur(interaction);
  const guildId = interaction.guild.id;
  const m = eco.monnaie(guildId);
  await interaction.guild.members.fetch(cible.id).catch(() => null);
  const ligne = req.getEco.get(guildId, cible.id);
  const poche = ligne?.solde ?? 0;
  const banque = ligne?.banque ?? 0;
  const total = poche + banque;
  const etat = eco.etatDaily(guildId, cible.id);
  const serie = etat.serie;
  const achats = req.achatsDe.all(guildId, cible.id);
  const elements = [];
  const options = { allowedMentions: { parse: [] } };
  try {
    const png = await genererCarteSolde({
      nom: nomDe(interaction, cible),
      avatar: avatarDe(interaction, cible),
      total: nombre(total),
      monnaie: m.nom,
      rang: poche > 0 ? `#${nombre(eco.rang(guildId, poche))}` : t('economie.carte_non_classe'),
      libelleTotal: t('economie.carte_fortune'),
      tuiles: [
        { titre: t('economie.carte_poche'), valeur: nombre(poche) },
        { titre: t('economie.carte_banque'), valeur: nombre(banque) },
        { titre: t('economie.carte_gagne'), valeur: nombre(ligne?.total_gagne ?? 0) },
      ],
      serie,
      serieTexte: serie ? t('economie.carte_serie', { n: serie, bonus: Math.min(serie, 10) * 10 }) : t('economie.carte_serie_vide'),
      daily: etat.disponible ? t('economie.carte_daily_pret') : t('economie.carte_daily_dans', { duree: duree(etat.resteMs) }),
      dailyPret: etat.disponible,
    });
    options.files = [new AttachmentBuilder(png, { name: 'portefeuille.png' })];
    elements.push(C.image('attachment://portefeuille.png'));
  } catch (e) {
    logger.avertissement('Carte portefeuille :', e.message);
    elements.push(C.texte(`## ${t('economie.solde_titre', { membre: nomDe(interaction, cible) })}\n${m.emoji} **${nombre(poche)}** ${m.nom}`));
    elements.push(C.texte(
      `${t('economie.solde_rang')} : ${poche > 0 ? `#${nombre(eco.rang(guildId, poche))}` : t('economie.solde_non_classe')}\n`
      + `${t('economie.solde_total_gagne')} : ${nombre(ligne?.total_gagne ?? 0)}\n`
      + `${t('economie.solde_serie')} : ${t('economie.solde_serie_valeur', { n: serie })}`
    ));
  }
  if (achats.length) {
    elements.push(C.separateur());
    elements.push(C.texte(`**${t('economie.solde_achats_titre')}**\n${achats.slice(0, 5).map((a) => `${E('colis')} ${a.nom} · ${m.emoji} ${nombre(a.prix)}`).join('\n')}`));
  }
  if (cible.id === interaction.user.id) elements.push(actions(t, 'eco_solde'));
  return (prive ? C.envoiPrive : C.envoi)([C.conteneur(elements, OR)], options);
}

/** /economy leaderboard (ou bouton). */
async function vueClassement(interaction, page, prive = false) {
  const { t, nombre } = traducteur(interaction);
  const guildId = interaction.guild.id;
  const m = eco.monnaie(guildId);
  const envoyer = prive ? C.envoiPrive : C.envoi;
  const total = req.totalRiches.get(guildId).n;
  const totalPages = Math.max(1, Math.ceil(total / 10));
  page = Math.min(page, totalPages - 1);
  const lignes = total ? req.classementEco.all(guildId, 10, page * 10) : [];
  if (!lignes.length) return envoyer([C.conteneur([C.texte(`${m.emoji} ${t('economie.classement_vide')}`), actions(t, 'eco_classement')], OR)]);
  const pied = `-# ${t('commun.page', { n: nombre(page + 1), total: nombre(totalPages) })} · ${t('economie.membres', { n: total })}`;
  const guild = interaction.guild;
  const navigation = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`eco_page:${page - 1}`).setLabel('◀').setStyle(ButtonStyle.Secondary).setDisabled(page === 0),
    new ButtonBuilder().setCustomId(`eco_page:${page + 1}`).setLabel('▶').setStyle(ButtonStyle.Secondary).setDisabled(page >= totalPages - 1),
  );

  // La meme carte image que /classement, avec la piece de Wumi Run.
  try {
    const membres = await guild.members.fetch({ user: lignes.map((l) => l.user_id) }).catch(() => null);
    const max = Math.max(1, lignes[0].solde);
    const lignesImage = await Promise.all(lignes.map(async (l, i) => {
      const mb = membres?.get(l.user_id);
      const u = mb?.user ?? await interaction.client.users.fetch(l.user_id).catch(() => null);
      return {
        rang: page * 10 + i + 1,
        nom: mb?.displayName ?? u?.globalName ?? u?.username ?? `#${l.user_id.slice(-4)}`,
        avatar: (mb ?? u)?.displayAvatarURL({ extension: 'png', size: 128 }) ?? null,
        valeur: abreger(l.solde),
        part: l.solde / max,
        moi: l.user_id === interaction.user.id,
      };
    }));
    const monSolde = eco.solde(guildId, interaction.user.id);
    const png = await genererCarteClassement({
      serveur: guild.name,
      icone: guild.iconURL({ extension: 'png', size: 256 }),
      sousTitre: t('economie.image_sous_titre', { page: nombre(page + 1), total: nombre(totalPages), n: total, membres: nombre(total) }),
      pastille: t('economie.image_pastille'),
      piece: true,
      lignes: lignesImage,
      pied: monSolde > 0
        ? t('economie.image_ta_place', { rang: nombre(eco.rang(guildId, monSolde)), valeur: `${nombre(monSolde)} ${m.nom}` })
        : t('economie.image_pas_classe'),
    });
    return envoyer([
      C.conteneur([
        C.texte(`## ${m.emoji} ${t('economie.classement_titre', { serveur: guild.name })}`),
        C.image('attachment://richesse.png'),
        C.texte(pied),
        ...(totalPages > 1 ? [navigation] : []),
        actions(t, 'eco_classement'),
      ], OR),
    ], { files: [new AttachmentBuilder(png, { name: 'richesse.png' })], allowedMentions: { parse: [] } });
  } catch (e) {
    logger.avertissement('Classement economie (image) :', e.message);
  }

  const corps = lignes
    .map((l, i) => {
      const position = page * 10 + i + 1;
      const prefixe = MEDAILLES()[position - 1] ?? `\`#${String(position).padStart(2, ' ')}\``;
      return `${prefixe} <@${l.user_id}> · ${m.emoji} **${nombre(l.solde)}** ${m.nom}`;
    })
    .join('\n');
  return envoyer([
    C.conteneur([
      C.texte(`## ${m.emoji} ${t('economie.classement_titre', { serveur: guild.name })}`),
      C.texte(corps),
      C.texte(pied),
      ...(totalPages > 1 ? [navigation] : []),
    ], OR),
  ], { allowedMentions: { parse: [] } });
}
