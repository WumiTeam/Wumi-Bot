/**
 * /welcome — le message de bienvenue (et d'au revoir), en une commande.
 *
 * Les reglages existaient deja dans /config ; ici on les regroupe la ou un
 * admin les cherche, avec un TEST qui envoie le vrai message comme si
 * l'admin venait d'arriver.
 *
 * Variables utilisables dans les messages :
 *   {mention} {pseudo} {tag} {id} {serveur} {membres}
 */
const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  InteractionContextType,
  ChannelType,
} = require('discord.js');
const conf = require('../../../config');
const C = require('../../utils/composants');
const { config, majConfig } = require('../../database/db');
const { envoyerBienvenue, carte } = require('../../utils/bienvenue');
const cartes = require('../../utils/cartesBienvenue');
const { AttachmentBuilder, MessageFlags } = require('discord.js');
const { traducteur, localisations, t: tr, DEFAUT } = require('../../utils/langues');

const d = (b, cle) => b.setDescription(tr(cle, DEFAUT)).setDescriptionLocalizations(localisations(cle));

/** Les options communes a « ajouter » et « modifier » un design. */
function optionsDesign(s, creation) {
  return s
    .addStringOption((o) => d(o.setName('name').setNameLocalizations({ fr: 'nom' }), 'bienvenue.d_opt_nom').setRequired(true).setMaxLength(30).setAutocomplete(!creation))
    .addAttachmentOption((o) => d(o.setName('background').setNameLocalizations({ fr: 'fond' }), 'bienvenue.d_opt_fond'))
    .addStringOption((o) => d(o.setName('style'), 'bienvenue.d_opt_style').addChoices(
      { name: 'Centré · Centered', value: 'centre' },
      { name: 'Avatar à gauche · Left', value: 'gauche' },
      { name: 'Minimal · Big name', value: 'minimal' },
    ))
    .addStringOption((o) => d(o.setName('color').setNameLocalizations({ fr: 'couleur' }), 'bienvenue.d_opt_couleur').setMaxLength(7))
    .addStringOption((o) => d(o.setName('title').setNameLocalizations({ fr: 'titre' }), 'bienvenue.d_opt_titre').setMaxLength(40))
    .addStringOption((o) => d(o.setName('subtitle').setNameLocalizations({ fr: 'sous-titre' }), 'bienvenue.d_opt_sous').setMaxLength(120));
}
const SALONS = [ChannelType.GuildText, ChannelType.GuildAnnouncement];

module.exports = {
  categorie: 'config',

  data: new SlashCommandBuilder()
    .setName('welcome')
    .setNameLocalizations({ fr: 'bienvenue' })
    .setDescription(tr('bienvenue.description_commande', DEFAUT))
    .setDescriptionLocalizations(localisations('bienvenue.description_commande'))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setContexts(InteractionContextType.Guild)
    .addSubcommand((s) => d(s.setName('channel').setNameLocalizations({ fr: 'salon' }), 'bienvenue.sous_salon')
      .addChannelOption((o) => d(o.setName('channel').setNameLocalizations({ fr: 'salon' }), 'bienvenue.opt_salon').setRequired(true).addChannelTypes(...SALONS))
      .addStringOption((o) => d(o.setName('message'), 'bienvenue.opt_message').setMaxLength(1500)))
    .addSubcommand((s) => d(s.setName('message'), 'bienvenue.sous_message')
      .addStringOption((o) => d(o.setName('text').setNameLocalizations({ fr: 'texte' }), 'bienvenue.opt_message').setRequired(true).setMaxLength(1500)))
    .addSubcommand((s) => d(s.setName('card').setNameLocalizations({ fr: 'carte' }), 'bienvenue.sous_carte')
      .addBooleanOption((o) => d(o.setName('enabled').setNameLocalizations({ fr: 'actif' }), 'bienvenue.opt_actif').setRequired(true)))
    .addSubcommand((s) => d(s.setName('dm').setNameLocalizations({ fr: 'mp' }), 'bienvenue.sous_mp')
      .addStringOption((o) => d(o.setName('text').setNameLocalizations({ fr: 'texte' }), 'bienvenue.opt_mp').setMaxLength(1500)))
    .addSubcommand((s) => d(s.setName('goodbye').setNameLocalizations({ fr: 'aurevoir' }), 'bienvenue.sous_aurevoir')
      .addChannelOption((o) => d(o.setName('channel').setNameLocalizations({ fr: 'salon' }), 'bienvenue.opt_salon_aurevoir').addChannelTypes(...SALONS))
      .addStringOption((o) => d(o.setName('message'), 'bienvenue.opt_message_aurevoir').setMaxLength(1500)))
    .addSubcommand((s) => d(s.setName('test'), 'bienvenue.sous_test'))
    .addSubcommand((s) => d(s.setName('view').setNameLocalizations({ fr: 'voir' }), 'bienvenue.sous_voir'))
    .addSubcommand((s) => d(s.setName('disable').setNameLocalizations({ fr: 'desactiver' }), 'bienvenue.sous_desactiver'))
    // Wumi 2.13 : plusieurs designs de carte, chacun personnalise.
    .addSubcommandGroup((g) => d(g.setName('designs').setNameLocalizations({ fr: 'cartes' }), 'bienvenue.grp_designs')
      .addSubcommand((s) => optionsDesign(d(s.setName('add').setNameLocalizations({ fr: 'ajouter' }), 'bienvenue.d_ajouter'), true))
      .addSubcommand((s) => optionsDesign(d(s.setName('edit').setNameLocalizations({ fr: 'modifier' }), 'bienvenue.d_modifier'), false)
        .addBooleanOption((o) => d(o.setName('remove-background').setNameLocalizations({ fr: 'retirer-fond' }), 'bienvenue.d_opt_retirer_fond'))
        .addBooleanOption((o) => d(o.setName('enabled').setNameLocalizations({ fr: 'actif' }), 'bienvenue.d_opt_actif')))
      .addSubcommand((s) => d(s.setName('remove').setNameLocalizations({ fr: 'supprimer' }), 'bienvenue.d_supprimer')
        .addStringOption((o) => d(o.setName('name').setNameLocalizations({ fr: 'nom' }), 'bienvenue.d_opt_nom').setRequired(true).setAutocomplete(true)))
      .addSubcommand((s) => d(s.setName('preview').setNameLocalizations({ fr: 'apercu' }), 'bienvenue.d_apercu')
        .addStringOption((o) => d(o.setName('name').setNameLocalizations({ fr: 'nom' }), 'bienvenue.d_opt_nom').setRequired(true).setAutocomplete(true)))
      .addSubcommand((s) => d(s.setName('list').setNameLocalizations({ fr: 'liste' }), 'bienvenue.d_liste'))
      .addSubcommand((s) => d(s.setName('mode'), 'bienvenue.d_mode')
        .addStringOption((o) => d(o.setName('name').setNameLocalizations({ fr: 'nom' }), 'bienvenue.d_opt_mode').setAutocomplete(true)))),

  async autocomplete(interaction) {
    const saisie = String(interaction.options.getFocused() ?? '').toLowerCase();
    const liste = cartes.q.liste.all(interaction.guild.id).filter((c) => c.nom.toLowerCase().includes(saisie)).slice(0, 25);
    return interaction.respond(liste.map((c) => ({ name: `${c.actif ? '🟢' : '⚪'} ${c.nom}`, value: c.nom })));
  },

  async execute(interaction) {
    const { t } = traducteur(interaction);
    const guild = interaction.guild;
    const sous = interaction.options.getSubcommand();
    if (interaction.options.getSubcommandGroup(false) === 'designs') return designs(interaction, sous, t);
    const variables = `-# ${t('bienvenue.variables')}`;

    const peutEcrire = (salon) => salon.permissionsFor(guild.members.me)?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.AttachFiles]);

    switch (sous) {
      case 'channel': {
        const salon = interaction.options.getChannel('channel');
        if (!peutEcrire(salon)) return interaction.reply(C.erreurPrivee(t('bienvenue.salon_interdit', { salon: `${salon}` })));
        const message = interaction.options.getString('message');
        majConfig(guild.id, { salon_bienvenue: salon.id, ...(message ? { message_bienvenue: message } : {}) });
        return interaction.reply(C.succes(`${t('bienvenue.salon_ok', { salon: `${salon}` })}\n${t('bienvenue.astuce_test')}`));
      }
      case 'message': {
        const texte = interaction.options.getString('text');
        const reset = ['reset', 'defaut', 'défaut', 'default'].includes(texte.trim().toLowerCase());
        majConfig(guild.id, { message_bienvenue: reset ? null : texte });
        return interaction.reply(C.succes(`${t(reset ? 'bienvenue.message_reset' : 'bienvenue.message_ok')}\n${variables}`));
      }
      case 'card': {
        const actif = interaction.options.getBoolean('enabled');
        majConfig(guild.id, { carte_bienvenue: actif ? 1 : 0 });
        return interaction.reply(C.succes(t(actif ? 'bienvenue.carte_on' : 'bienvenue.carte_off')));
      }
      case 'dm': {
        const texte = interaction.options.getString('text');
        majConfig(guild.id, { mp_bienvenue: texte || null });
        return interaction.reply(C.succes(`${t(texte ? 'bienvenue.mp_ok' : 'bienvenue.mp_off')}${texte ? `\n${variables}` : ''}`));
      }
      case 'goodbye': {
        const salon = interaction.options.getChannel('channel');
        const message = interaction.options.getString('message');
        if (salon && !peutEcrire(salon)) return interaction.reply(C.erreurPrivee(t('bienvenue.salon_interdit', { salon: `${salon}` })));
        majConfig(guild.id, { salon_aurevoir: salon?.id ?? null, ...(message ? { message_aurevoir: message } : {}) });
        return interaction.reply(C.succes(salon ? t('bienvenue.aurevoir_ok', { salon: `${salon}` }) : t('bienvenue.aurevoir_off')));
      }
      case 'disable': {
        majConfig(guild.id, { salon_bienvenue: null, mp_bienvenue: null });
        return interaction.reply(C.succes(t('bienvenue.desactive')));
      }
      case 'test': {
        const cfg = config(guild.id);
        if (!cfg.salon_bienvenue && !cfg.mp_bienvenue) return interaction.reply(C.avertissementPrivee(t('bienvenue.rien_a_tester')));
        await interaction.deferReply({ flags: 64 });
        const r = await envoyerBienvenue(interaction.member);
        return interaction.editReply(C.info([
          r.salon ? `✅ ${t('bienvenue.test_salon', { salon: `<#${cfg.salon_bienvenue}>` })}` : (cfg.salon_bienvenue ? `❌ ${t('bienvenue.test_salon_ko')}` : null),
          cfg.mp_bienvenue ? (r.mp ? `✅ ${t('bienvenue.test_mp')}` : `❌ ${t('bienvenue.test_mp_ko')}`) : null,
        ].filter(Boolean).join('\n')));
      }
      default: {
        const cfg = config(guild.id);
        const oui = (v) => (v ? '✅' : '❌');
        return interaction.reply(C.envoiPrive([C.conteneur([
          C.texte(`## 👋 ${t('bienvenue.voir_titre')}`),
          C.texte([
            `**${t('bienvenue.label_salon')}** · ${cfg.salon_bienvenue ? `<#${cfg.salon_bienvenue}>` : '—'}`,
            `**${t('bienvenue.label_carte')}** · ${oui(cfg.carte_bienvenue)}`,
            `**${t('bienvenue.label_message')}**\n> ${(cfg.message_bienvenue || t('bienvenue.defaut')).slice(0, 500)}`,
            `**${t('bienvenue.label_mp')}** · ${cfg.mp_bienvenue ? `\n> ${cfg.mp_bienvenue.slice(0, 300)}` : '—'}`,
            `**${t('bienvenue.label_role_auto')}** · ${cfg.role_auto ? `<@&${cfg.role_auto}>` : '—'}`,
            `**${t('bienvenue.label_aurevoir')}** · ${cfg.salon_aurevoir ? `<#${cfg.salon_aurevoir}>` : '—'}`,
          ].join('\n')),
          C.texte(variables),
        ], conf.couleurs.bienvenue ?? conf.couleurs.principale)], { allowedMentions: { parse: [] } }));
      }
    }
  },
};

/** Envoie l'apercu d'un design, carte generee avec l'admin comme arrivant. */
async function apercu(interaction, design, t, entete) {
  const png = await carte(interaction.member, design);
  return interaction.editReply(C.envoi([C.conteneur([
    C.texte(entete),
    C.image('attachment://apercu.png'),
    C.texte(`-# ${t('bienvenue.d_variables')}`),
  ], conf.couleurs.bienvenue ?? conf.couleurs.principale)], { files: [new AttachmentBuilder(png, { name: 'apercu.png' })] }));
}

/** /welcome designs … */
async function designs(interaction, sous, t) {
  const guild = interaction.guild;
  const nom = interaction.options.getString('name');

  if (sous === 'list') {
    const liste = cartes.q.liste.all(guild.id);
    const cfg = config(guild.id);
    const fixe = liste.find((c) => c.id === cfg.bienvenue_carte_fixe);
    return interaction.reply(C.envoiPrive([C.conteneur([
      C.texte(`## 🎨 ${t('bienvenue.d_liste_titre')}`),
      C.texte(liste.length
        ? liste.map((c) => `${c.actif ? '🟢' : '⚪'} **${c.nom}** · ${t(`bienvenue.d_style_${c.style}`)}${c.fond ? ' · 🖼️' : ''}${c.couleur ? ` · \`${c.couleur}\`` : ''}`).join('\n')
        : t('bienvenue.d_liste_vide')),
      C.texte(`**${t('bienvenue.d_mode_label')}** · ${fixe ? t('bienvenue.d_mode_fixe', { nom: fixe.nom }) : t('bienvenue.d_mode_hasard')}`),
      C.texte(`-# ${t('bienvenue.d_liste_pied', { n: liste.length, max: cartes.MAX })}`),
    ], conf.couleurs.principale)]));
  }

  if (sous === 'mode') {
    if (!nom) {
      majConfig(guild.id, { bienvenue_carte_fixe: null });
      return interaction.reply(C.succesPrive(t('bienvenue.d_mode_hasard_ok')));
    }
    const c = cartes.q.parNom.get(guild.id, nom);
    if (!c) return interaction.reply(C.erreurPrivee(t('bienvenue.d_introuvable')));
    majConfig(guild.id, { bienvenue_carte_fixe: c.id });
    return interaction.reply(C.succesPrive(t('bienvenue.d_mode_fixe_ok', { nom: c.nom })));
  }

  if (sous === 'remove') {
    const c = cartes.q.parNom.get(guild.id, nom);
    if (!c) return interaction.reply(C.erreurPrivee(t('bienvenue.d_introuvable')));
    cartes.q.supprimer.run(c.id);
    cartes.effacerFond(c.fond);
    if (config(guild.id).bienvenue_carte_fixe === c.id) majConfig(guild.id, { bienvenue_carte_fixe: null });
    return interaction.reply(C.succesPrive(t('bienvenue.d_supprime', { nom: c.nom })));
  }

  if (sous === 'preview') {
    const c = cartes.q.parNom.get(guild.id, nom);
    if (!c) return interaction.reply(C.erreurPrivee(t('bienvenue.d_introuvable')));
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    return apercu(interaction, c, t, `### 🎨 ${c.nom}`);
  }

  // ---- ajouter / modifier
  const coul = cartes.couleur(interaction.options.getString('color'));
  if (coul === undefined) return interaction.reply(C.erreurPrivee(t('bienvenue.d_couleur_invalide')));
  let c = cartes.q.parNom.get(guild.id, nom);
  if (sous === 'add') {
    if (c) return interaction.reply(C.erreurPrivee(t('bienvenue.d_existe', { nom })));
    if (cartes.q.compter.get(guild.id).n >= cartes.MAX) return interaction.reply(C.erreurPrivee(t('bienvenue.d_max', { max: cartes.MAX })));
  } else if (!c) {
    return interaction.reply(C.erreurPrivee(t('bienvenue.d_introuvable')));
  }
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  if (sous === 'add') {
    const info = cartes.q.creer.run(guild.id, nom, 'centre', null, null, null, Date.now());
    c = cartes.q.parNom.get(guild.id, nom) ?? { id: Number(info.lastInsertRowid) };
  }
  const opt = (k) => interaction.options.getString(k);
  const neuf = {
    style: opt('style') ?? c.style ?? 'centre',
    couleur: coul ?? c.couleur ?? null,
    titre: opt('title') ?? c.titre ?? null,
    sous: opt('subtitle') ?? c.sous ?? null,
    actif: interaction.options.getBoolean('enabled') ?? (c.actif ?? 1),
    fond: c.fond ?? null,
  };
  const piece = interaction.options.getAttachment('background');
  if (piece) {
    const r = await cartes.enregistrerFond(guild.id, c.id, piece);
    if (!r.ok) {
      if (sous === 'add') cartes.q.supprimer.run(c.id);
      return interaction.editReply(C.erreur(t(`bienvenue.d_fond_${r.raison}`)));
    }
    cartes.effacerFond(neuf.fond);
    neuf.fond = r.fichier;
  } else if (interaction.options.getBoolean('remove-background')) {
    cartes.effacerFond(neuf.fond);
    neuf.fond = null;
  }
  cartes.q.maj.run(neuf.style, neuf.couleur, neuf.titre, neuf.sous, neuf.actif ? 1 : 0, neuf.fond, c.id);
  if (!config(guild.id).carte_bienvenue) majConfig(guild.id, { carte_bienvenue: 1 });
  return apercu(interaction, cartes.q.parNom.get(guild.id, nom), t, `### ✅ ${t(sous === 'add' ? 'bienvenue.d_ajoute' : 'bienvenue.d_modifie', { nom })}`);
}

