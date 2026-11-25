/**
 * /wumirun — Wumi Run (ex-Astro Run), le jeu de plateforme de Wumi (Activite Discord).
 *
 *   jouer       lance le jeu dans le salon (vocal ou textuel)
 *   classement  meilleurs temps du serveur sur un niveau (image)
 *   profil      progression d'un membre
 *   config      salon des records, recompenses, salon du defi, taux des pieces
 *   defi        le defi de la semaine (Wumi 2.21)
 *   convertir   pieces du jeu -> monnaie du serveur (Wumi 2.21)
 *
 * Voir src/utils/astro.js (donnees, regles) et src/public/astro/ (le jeu).
 */
const { SlashCommandBuilder, InteractionContextType, ChannelType, PermissionFlagsBits, AttachmentBuilder } = require('discord.js');
const C = require('../../utils/composants');
const A = require('../../utils/astro');
const { config, majConfig } = require('../../database/db');
const { genererCarteClassement } = require('../../utils/carteClassement');
const logger = require('../../utils/logger');
const { traducteur, localisations, t: tr, DEFAUT } = require('../../utils/langues');

const d = (o, cle) => o.setDescription(tr(cle, DEFAUT)).setDescriptionLocalizations(localisations(cle));
const COULEUR = 0xffc93c;
const choixNiveaux = Object.keys(A.NIVEAUX).map((n) => ({
  name: `${n} · ${tr(`donnees.niveaux_run.${n}`, 'fr')}`,
  name_localizations: { 'en-US': `${n} · ${tr(`donnees.niveaux_run.${n}`, 'en')}`, 'en-GB': `${n} · ${tr(`donnees.niveaux_run.${n}`, 'en')}` },
  value: Number(n),
}));

module.exports = {
  categorie: 'utilitaires',

  data: d(new SlashCommandBuilder().setName('wumirun'), 'astro.description_commande')
    .setContexts(InteractionContextType.Guild)
    .addSubcommand((s) => d(s.setName('play').setNameLocalizations({ fr: 'jouer' }), 'astro.sous_jouer'))
    .addSubcommand((s) => d(s.setName('leaderboard').setNameLocalizations({ fr: 'classement' }), 'astro.sous_classement')
      .addIntegerOption((o) => d(o.setName('level').setNameLocalizations({ fr: 'niveau' }), 'astro.opt_niveau').addChoices(...choixNiveaux)))
    .addSubcommand((s) => d(s.setName('profile').setNameLocalizations({ fr: 'profil' }), 'astro.sous_profil')
      .addUserOption((o) => d(o.setName('member').setNameLocalizations({ fr: 'membre' }), 'astro.opt_membre')))
    .addSubcommand((s) => d(s.setName('challenge').setNameLocalizations({ fr: 'defi' }), 'astro.sous_defi'))
    .addSubcommand((s) => d(s.setName('convert').setNameLocalizations({ fr: 'convertir' }), 'astro.sous_convertir')
      .addIntegerOption((o) => d(o.setName('amount').setNameLocalizations({ fr: 'montant' }), 'astro.opt_montant').setMinValue(1)))
    .addSubcommand((s) => d(s.setName('config'), 'astro.sous_config')
      .addChannelOption((o) => d(o.setName('channel').setNameLocalizations({ fr: 'salon' }), 'astro.opt_salon').addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement))
      .addBooleanOption((o) => d(o.setName('rewards').setNameLocalizations({ fr: 'recompenses' }), 'astro.opt_recompenses'))
      .addBooleanOption((o) => d(o.setName('disable-channel').setNameLocalizations({ fr: 'sans-salon' }), 'astro.opt_sans_salon'))
      .addChannelOption((o) => d(o.setName('challenge-channel').setNameLocalizations({ fr: 'salon-defi' }), 'astro.opt_salon_defi').addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement))
      .addBooleanOption((o) => d(o.setName('disable-challenge').setNameLocalizations({ fr: 'sans-defi' }), 'astro.opt_sans_defi'))
      .addIntegerOption((o) => d(o.setName('coin-rate').setNameLocalizations({ fr: 'taux-pieces' }), 'astro.opt_taux').setMinValue(0).setMaxValue(1000))),

  async execute(interaction) {
    const { t, nombre } = traducteur(interaction);
    const sous = interaction.options.getSubcommand();
    const guild = interaction.guild;

    if (sous === 'play') return require('../../utils/astroLancer').lancer(interaction);

    // ---------------------------------------------------------- CONFIG
    if (sous === 'config') {
      if (!interaction.memberPermissions.has(PermissionFlagsBits.ManageGuild)) return interaction.reply(C.erreurPrivee(t('astro.config_permission')));
      const salon = interaction.options.getChannel('channel');
      const recompenses = interaction.options.getBoolean('rewards');
      const sansSalon = interaction.options.getBoolean('disable-channel');
      const salonDefi = interaction.options.getChannel('challenge-channel');
      const sansDefi = interaction.options.getBoolean('disable-challenge');
      const taux = interaction.options.getInteger('coin-rate');
      const maj = {};
      if (salon) maj.astro_salon = salon.id;
      if (sansSalon) maj.astro_salon = null;
      if (recompenses !== null) maj.astro_recompenses = recompenses ? 1 : 0;
      if (salonDefi) maj.astro_defi = salonDefi.id;
      if (sansDefi) maj.astro_defi = null;
      if (taux !== null) maj.astro_taux = taux;
      if (Object.keys(maj).length) majConfig(guild.id, maj);
      if (salonDefi) require('../../utils/defiHebdo').tour(interaction.client).catch((e) => logger.avertissement('Defi Wumi Run :', e.message));
      const cfg = config(guild.id);
      return interaction.reply(C.envoiPrive([C.conteneur([
        C.texte(`## 🚀 ${t('astro.config_titre')}`),
        C.texte([
          `📣 **${t('astro.config_salon')}** · ${cfg.astro_salon ? `<#${cfg.astro_salon}>` : t('astro.config_aucun')}`,
          `🎁 **${t('astro.config_recompenses')}** · ${cfg.astro_recompenses ? t('astro.config_recompenses_on') : t('astro.config_recompenses_off')}`,
          `🏁 **${t('astro.config_defi')}** · ${cfg.astro_defi ? `<#${cfg.astro_defi}>` : t('astro.config_aucun')}`,
          `🔁 **${t('astro.config_taux')}** · ${cfg.astro_taux ? t('astro.config_taux_valeur', { piece: require('../../utils/emojis').E('wumicoin'), gain: require('../../utils/economie').somme(guild.id, cfg.astro_taux) }) : t('astro.config_taux_off')}`,
        ].join('\n')),
        C.texte(`-# ${t('astro.config_pied')}`),
      ], COULEUR)]));
    }

    // ------------------------------------------------------------ DEFI
    if (sous === 'challenge') {
      return interaction.reply(require('../../utils/defiHebdo').vue(guild, undefined, { pour: interaction.user.id }));
    }

    // ------------------------------------------------------- CONVERTIR
    if (sous === 'convert') {
      const r = A.convertir(guild.id, interaction.user.id, interaction.options.getInteger('amount'));
      const piece = require('../../utils/emojis').E('wumicoin');
      if (!r.ok) {
        const cle = { economie: 'astro.convertir_economie', coupee: 'astro.convertir_coupee', vide: 'astro.convertir_vide', pas_assez: 'astro.convertir_pas_assez' }[r.raison] ?? 'astro.convertir_vide';
        return interaction.reply(C.erreurPrivee(t(cle, { dispo: nombre(r.dispo ?? 0), piece })));
      }
      return interaction.reply(C.envoiPrive([C.conteneur([
        C.texte(`## ${piece} ${t('astro.convertir_titre')}`),
        C.texte(t('astro.convertir_ok', { montant: nombre(r.montant), piece, gain: require('../../utils/economie').somme(guild.id, r.gain), reste: nombre(r.reste) })),
        C.texte(`-# ${t('astro.convertir_pied')}`),
      ], COULEUR)]));
    }

    // ---------------------------------------------------------- PROFIL
    if (sous === 'profile') {
      const cible = interaction.options.getUser('member') ?? interaction.user;
      const j = A.q.joueur.get(cible.id);
      let save = null;
      try { save = j?.save ? JSON.parse(j.save) : null; } catch { save = null; }
      if (!save) return interaction.reply(C.infoPrivee(t(cible.id === interaction.user.id ? 'astro.profil_vide_moi' : 'astro.profil_vide', { membre: `${cible}` }), { elements: [require('../../utils/astroLancer').bouton(t)] }));
      const lignes = Object.keys(A.NIVEAUX).map((n) => {
        const nom = t(`donnees.niveaux_run.${n}`);
        const temps = save.bestTimes[n];
        if (!temps) return `🔒 **${n} · ${nom}**${Number(n) <= save.unlockedLevel ? ` · ${t('astro.a_faire')}` : ''}`;
        const rec = A.q.record.get(guild.id, cible.id, Number(n));
        const rang = rec ? A.q.rang.get(guild.id, Number(n), rec.temps).n + 1 : null;
        return `✅ **${n} · ${nom}** · ⏱️ ${A.formaterTemps(temps)} · ${A.etoiles(save.bestStars[n] ?? 0)}${rang ? ` · #${rang}` : ''}`;
      });
      const total = Object.values(save.bestStars).reduce((a, b) => a + b, 0);
      return interaction.reply(C.envoi([C.conteneur([
        C.sectionVignette(`## 🚀 ${t('astro.profil_titre', { nom: j.nom })}\n${t('astro.profil_resume', { niveaux: Object.keys(save.bestTimes).length, max: A.MAX_NIVEAU, etoiles: total, piece: require('../../utils/emojis').E('wumicoin'), pieces: nombre(save.coins), persos: save.owned.length })}`, cible.displayAvatarURL({ size: 128 })),
        C.separateur(),
        C.texte(lignes.join('\n')),
        require('../../utils/astroLancer').bouton(t),
      ], COULEUR)], { allowedMentions: { parse: [] } }));
    }

    // ------------------------------------------------------- CLASSEMENT
    const niveau = interaction.options.getInteger('level') ?? 1;
    const total = A.q.compter.get(guild.id, niveau).n;
    if (!total) return interaction.reply(C.info(t('astro.classement_vide', { niveau, nom: t(`donnees.niveaux_run.${niveau}`) }), { elements: [require('../../utils/astroLancer').bouton(t)] }));
    await interaction.deferReply();
    const lignes = A.q.classement.all(guild.id, niveau, 10, 0);
    const meilleur = lignes[0].temps;
    const membres = await guild.members.fetch({ user: lignes.map((l) => l.user_id) }).catch(() => null);
    const moi = A.q.record.get(guild.id, interaction.user.id, niveau);
    const options = {};
    const elements = [];
    try {
      const png = await genererCarteClassement({
        serveur: guild.name,
        icone: guild.iconURL({ extension: 'png', size: 256 }),
        sousTitre: t('astro.classement_sous', { niveau, nom: t(`donnees.niveaux_run.${niveau}`), n: total, joueurs: nombre(total) }),
        pastille: 'Wumi Run',
        lignes: lignes.map((l, i) => {
          const m = membres?.get(l.user_id);
          return {
            rang: i + 1,
            nom: m?.displayName ?? l.nom ?? '?',
            avatar: m?.displayAvatarURL({ extension: 'png', size: 128 }) ?? l.avatar,
            valeur: A.formaterTemps(l.temps),
            part: meilleur / l.temps,
            moi: l.user_id === interaction.user.id,
          };
        }),
        pied: moi ? t('astro.ta_place', { rang: A.q.rang.get(guild.id, niveau, moi.temps).n + 1, temps: A.formaterTemps(moi.temps) }) : t('astro.pas_classe'),
      });
      options.files = [new AttachmentBuilder(png, { name: 'astro.png' })];
      elements.push(C.image('attachment://astro.png'));
    } catch (e) {
      logger.avertissement('Classement Astro Run :', e.message);
      elements.push(C.texte(lignes.map((l, i) => `**#${i + 1}** <@${l.user_id}> · ${A.formaterTemps(l.temps)}`).join('\n')));
    }
    elements.push(require('../../utils/astroLancer').bouton(t));
    return interaction.editReply(C.envoi([C.conteneur(elements, COULEUR)], { ...options, allowedMentions: { parse: [] } }));
  },
};
