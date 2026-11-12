/**
 * /admin ticket ... et /admin verification ... et /admin logs
 *
 * La configuration du serveur SUPPORT. Ces sous-commandes vivent dans /admin,
 * donc elles heritent de ses deux verrous : etre dans OWNER_IDS ET etre sur le
 * serveur support. Personne d'autre ne peut toucher a ces reglages, pas meme
 * un administrateur du serveur support.
 */
const { ChannelType, PermissionFlagsBits } = require('discord.js');
const conf = require('../../config');
const C = require('./composants');
const store = require('./supportStore');
const journal = require('./journalSupport');
const { traducteur, localisations, t: tr, DEFAUT } = require('./langues');

const SALONS_TEXTE = [ChannelType.GuildText, ChannelType.GuildAnnouncement];

/** Petit raccourci de description traduite. */
const decrire = (b, cle) => b.setDescription(tr(cle, DEFAUT)).setDescriptionLocalizations(localisations(cle));

// -------------------------------------------------------------- DEFINITIONS
function groupeTicket(g) {
  decrire(g.setName('ticket'), 'admin.grp_ticket');
  return g
    .addSubcommand((s) => decrire(s.setName('panel').setNameLocalizations({ fr: 'panneau' }), 'admin.ticket_panneau')
      .addChannelOption((o) => decrire(o.setName('channel').setNameLocalizations({ fr: 'salon' }), 'admin.opt_salon_panneau')
        .addChannelTypes(...SALONS_TEXTE)))
    .addSubcommand((s) => decrire(s.setName('category').setNameLocalizations({ fr: 'categorie' }), 'admin.ticket_categorie')
      .addChannelOption((o) => decrire(o.setName('category').setNameLocalizations({ fr: 'categorie' }), 'admin.opt_categorie')
        .addChannelTypes(ChannelType.GuildCategory)))
    .addSubcommand((s) => decrire(s.setName('staff'), 'admin.ticket_staff')
      .addRoleOption((o) => decrire(o.setName('role'), 'admin.opt_role_staff')))
    .addSubcommand((s) => decrire(s.setName('limit').setNameLocalizations({ fr: 'limite' }), 'admin.ticket_limite')
      .addIntegerOption((o) => decrire(o.setName('number').setNameLocalizations({ fr: 'nombre' }), 'admin.opt_limite')
        .setRequired(true).setMinValue(1).setMaxValue(5)))
    .addSubcommand((s) => decrire(s.setName('inactivity').setNameLocalizations({ fr: 'inactivite' }), 'admin.ticket_inactivite')
      .addIntegerOption((o) => decrire(o.setName('hours').setNameLocalizations({ fr: 'heures' }), 'ticket.v2.opt_heures')
        .setRequired(true).setMinValue(0).setMaxValue(720)))
    .addSubcommand((s) => decrire(s.setName('view').setNameLocalizations({ fr: 'voir' }), 'admin.ticket_voir'))
    .addSubcommand((s) => decrire(s.setName('list').setNameLocalizations({ fr: 'liste' }), 'admin.ticket_liste'));
}

function groupeVerification(g) {
  decrire(g.setName('verification'), 'admin.grp_verification');
  return g
    .addSubcommand((s) => decrire(s.setName('panel').setNameLocalizations({ fr: 'panneau' }), 'admin.verif_panneau')
      .addChannelOption((o) => decrire(o.setName('channel').setNameLocalizations({ fr: 'salon' }), 'admin.opt_salon_panneau')
        .addChannelTypes(...SALONS_TEXTE)))
    .addSubcommand((s) => decrire(s.setName('role'), 'admin.verif_role')
      .addRoleOption((o) => decrire(o.setName('role'), 'admin.opt_role_verifie').setRequired(true))
      .addRoleOption((o) => decrire(o.setName('unverified').setNameLocalizations({ fr: 'non-verifie' }), 'admin.opt_role_non_verifie')))
    .addSubcommand((s) => decrire(s.setName('min-age').setNameLocalizations({ fr: 'age-minimum' }), 'admin.verif_age')
      .addIntegerOption((o) => decrire(o.setName('days').setNameLocalizations({ fr: 'jours' }), 'admin.opt_age_jours')
        .setRequired(true).setMinValue(0).setMaxValue(365)))
    .addSubcommand((s) => decrire(s.setName('reset').setNameLocalizations({ fr: 'reinitialiser' }), 'admin.verif_reset')
      .addUserOption((o) => decrire(o.setName('member').setNameLocalizations({ fr: 'membre' }), 'admin.opt_membre').setRequired(true)))
    .addSubcommand((s) => decrire(s.setName('view').setNameLocalizations({ fr: 'voir' }), 'admin.verif_voir'));
}

function groupeRoles(g) {
  decrire(g.setName('roles'), 'admin.grp_roles');
  return g
    .addSubcommand((s) => decrire(s.setName('user').setNameLocalizations({ fr: 'utilisateur' }), 'admin.roles_utilisateur')
      .addRoleOption((o) => decrire(o.setName('role'), 'admin.opt_role_utilisateur')))
    .addSubcommand((s) => decrire(s.setName('beta'), 'admin.roles_beta')
      .addRoleOption((o) => decrire(o.setName('role'), 'admin.opt_role_beta')))
    .addSubcommand((s) => decrire(s.setName('beta-panel').setNameLocalizations({ fr: 'panneau-beta' }), 'admin.roles_panneau_beta')
      .addChannelOption((o) => decrire(o.setName('channel').setNameLocalizations({ fr: 'salon' }), 'admin.opt_salon_panneau')))
    .addSubcommand((s) => decrire(s.setName('sync').setNameLocalizations({ fr: 'synchroniser' }), 'admin.roles_sync'));
}

function groupeIncident(g) {
  decrire(g.setName('incident'), 'admin.grp_incident');
  const etats = ['investigation', 'identifie', 'surveillance', 'resolu', 'prevue', 'en_cours', 'terminee'];
  const NOMS = {
    investigation: ['Investigating', 'Investigation'], identifie: ['Identified', 'Cause identifiée'], surveillance: ['Monitoring', 'Surveillance'],
    resolu: ['Resolved', 'Résolu'], prevue: ['Scheduled', 'Prévue'], en_cours: ['In progress', 'En cours'], terminee: ['Completed', 'Terminée'],
  };
  return g
    .addSubcommand((s) => decrire(s.setName('create').setNameLocalizations({ fr: 'creer' }), 'admin.incident_creer')
      .addStringOption((o) => decrire(o.setName('type'), 'admin.opt_incident_type').setRequired(true).addChoices(
        { name: 'Incident', value: 'incident' }, { name: 'Maintenance', value: 'maintenance' },
      ))
      .addStringOption((o) => decrire(o.setName('title').setNameLocalizations({ fr: 'titre' }), 'admin.opt_incident_titre').setRequired(true).setMaxLength(100))
      .addStringOption((o) => decrire(o.setName('message'), 'admin.opt_incident_message').setRequired(true).setMaxLength(1000))
      .addStringOption((o) => decrire(o.setName('impact'), 'admin.opt_incident_impact').addChoices(
        { name: 'Minor', name_localizations: { fr: 'Mineur' }, value: 'mineur' },
        { name: 'Major', name_localizations: { fr: 'Majeur' }, value: 'majeur' },
        { name: 'Critical', name_localizations: { fr: 'Critique' }, value: 'critique' },
      ))
      .addStringOption((o) => decrire(o.setName('date'), 'admin.opt_incident_date').setMaxLength(10))
      .addStringOption((o) => decrire(o.setName('time').setNameLocalizations({ fr: 'heure' }), 'admin.opt_incident_heure').setMaxLength(5))
      .addIntegerOption((o) => decrire(o.setName('duration').setNameLocalizations({ fr: 'duree' }), 'admin.opt_incident_duree').setMinValue(5).setMaxValue(2880)))
    .addSubcommand((s) => decrire(s.setName('update').setNameLocalizations({ fr: 'maj' }), 'admin.incident_maj')
      .addIntegerOption((o) => decrire(o.setName('id'), 'admin.opt_incident_id').setRequired(true).setAutocomplete(true))
      .addStringOption((o) => decrire(o.setName('status').setNameLocalizations({ fr: 'etat' }), 'admin.opt_incident_etat').setRequired(true)
        .addChoices(...etats.map((e) => ({ name: NOMS[e][0], name_localizations: { fr: NOMS[e][1] }, value: e }))))
      .addStringOption((o) => decrire(o.setName('message'), 'admin.opt_incident_message').setRequired(true).setMaxLength(1000)))
    .addSubcommand((s) => decrire(s.setName('list').setNameLocalizations({ fr: 'liste' }), 'admin.incident_liste'))
    .addSubcommand((s) => decrire(s.setName('delete').setNameLocalizations({ fr: 'supprimer' }), 'admin.incident_supprimer')
      .addIntegerOption((o) => decrire(o.setName('id'), 'admin.opt_incident_id').setRequired(true).setAutocomplete(true)));
}

function groupeNoel(g) {
  decrire(g.setName('christmas').setNameLocalizations({ fr: 'noel' }), 'admin.grp_noel');
  return g
    .addSubcommand((s) => decrire(s.setName('start').setNameLocalizations({ fr: 'lancer' }), 'admin.noel_lancer')
      .addIntegerOption((o) => decrire(o.setName('chance'), 'admin.opt_noel_chance').setMinValue(1).setMaxValue(100))
      .addStringOption((o) => decrire(o.setName('end').setNameLocalizations({ fr: 'fin' }), 'admin.opt_noel_fin').setMaxLength(20)))
    .addSubcommand((s) => decrire(s.setName('add-channel').setNameLocalizations({ fr: 'ajouter-salon' }), 'admin.noel_ajouter')
      .addChannelOption((o) => decrire(o.setName('channel').setNameLocalizations({ fr: 'salon' }), 'admin.opt_noel_salon').setRequired(true)
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildCategory, ChannelType.GuildAnnouncement)))
    .addSubcommand((s) => decrire(s.setName('remove-channel').setNameLocalizations({ fr: 'retirer-salon' }), 'admin.noel_retirer')
      .addChannelOption((o) => decrire(o.setName('channel').setNameLocalizations({ fr: 'salon' }), 'admin.opt_noel_salon').setRequired(true)))
    .addSubcommand((s) => decrire(s.setName('board').setNameLocalizations({ fr: 'tableau' }), 'admin.noel_tableau')
      .addChannelOption((o) => decrire(o.setName('channel').setNameLocalizations({ fr: 'salon' }), 'admin.opt_noel_salon').setRequired(true).addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)))
    .addSubcommand((s) => decrire(s.setName('test'), 'admin.noel_test'))
    .addSubcommand((s) => decrire(s.setName('stop').setNameLocalizations({ fr: 'arreter' }), 'admin.noel_arreter'))
    .addSubcommand((s) => decrire(s.setName('reset').setNameLocalizations({ fr: 'remettre-a-zero' }), 'admin.noel_raz')
      .addBooleanOption((o) => decrire(o.setName('confirm').setNameLocalizations({ fr: 'confirmer' }), 'admin.opt_confirmer_raz').setRequired(true)));
}

function groupePanneaux(g) {
  decrire(g.setName('panels').setNameLocalizations({ fr: 'panneaux' }), 'admin.grp_panneaux');
  const langue = (o) => decrire(o.setName('language').setNameLocalizations({ fr: 'langue' }), 'admin.opt_panneau_langue')
    .addChoices({ name: 'English', value: 'en' }, { name: 'Français', value: 'fr' });
  return g
    .addSubcommand((s) => decrire(s.setName('suggestion'), 'admin.panneau_idee')
      .addChannelOption((o) => decrire(o.setName('channel').setNameLocalizations({ fr: 'salon' }), 'admin.opt_salon_panneau').addChannelTypes(...SALONS_TEXTE))
      .addStringOption(langue))
    .addSubcommand((s) => decrire(s.setName('bug'), 'admin.panneau_bug')
      .addChannelOption((o) => decrire(o.setName('reports').setNameLocalizations({ fr: 'rapports' }), 'admin.opt_bug_rapports').setRequired(true).addChannelTypes(...SALONS_TEXTE))
      .addChannelOption((o) => decrire(o.setName('channel').setNameLocalizations({ fr: 'salon' }), 'admin.opt_salon_panneau').addChannelTypes(...SALONS_TEXTE))
      .addStringOption(langue))
    .addSubcommand((s) => decrire(s.setName('modmail'), 'admin.panneau_modmail')
      .addChannelOption((o) => decrire(o.setName('inbox').setNameLocalizations({ fr: 'boite' }), 'admin.opt_modmail_boite').setRequired(true).addChannelTypes(ChannelType.GuildText))
      .addRoleOption((o) => decrire(o.setName('role'), 'admin.opt_modmail_role'))
      .addChannelOption((o) => decrire(o.setName('channel').setNameLocalizations({ fr: 'salon' }), 'admin.opt_salon_panneau').addChannelTypes(...SALONS_TEXTE))
      .addStringOption(langue));
}

/** Autocompletion de l'identifiant d'incident. */
function autocompleteIncident(interaction) {
  const inc = require('./incidents');
  const saisie = String(interaction.options.getFocused() ?? '').toLowerCase();
  const liste = inc.recents(60).filter((i) => `${i.id} ${i.titre}`.toLowerCase().includes(saisie)).slice(0, 25);
  return interaction.respond(liste.map((i) => ({ name: `#${i.id} · ${inc.EMOJI[i.statut]} ${i.titre}`.slice(0, 100), value: i.id })));
}

// ---------------------------------------------------------------- EXECUTION
const quand = (ms, style = 'R') => `<t:${Math.floor(ms / 1000)}:${style}>`;

/** Publie un panneau dans un salon, en verifiant qu'on peut y ecrire. */
async function publier(interaction, construire, t) {
  const salon = interaction.options.getChannel('channel') ?? interaction.channel;
  const moi = interaction.guild.members.me;
  const droits = salon.permissionsFor(moi);
  if (!droits?.has([PermissionFlagsBits.SendMessages, PermissionFlagsBits.AttachFiles, PermissionFlagsBits.ViewChannel])) {
    return interaction.reply(C.erreurPrivee(t('admin.panneau_droits', { salon: `${salon}` })));
  }
  await interaction.deferReply({ flags: 64 });
  await salon.send(construire(interaction.guild));
  return interaction.editReply(C.succes(t('admin.panneau_publie', { salon: `${salon}` })));
}

async function executer(interaction, client, { groupe, sous, tracer }) {
  const { t, duree } = traducteur(interaction);

  // ============================================================ PANNEAUX
  if (groupe === 'panels') {
    const panneaux = require('./panneauxSupport');
    const langue = interaction.options.getString('language');
    if (sous === 'modmail') {
      const boite = interaction.options.getChannel('inbox');
      const role = interaction.options.getRole('role');
      const droits = boite.permissionsFor(interaction.guild.members.me);
      if (!droits?.has([PermissionFlagsBits.CreatePublicThreads, PermissionFlagsBits.SendMessagesInThreads, PermissionFlagsBits.ManageThreads])) {
        return interaction.reply(C.erreurPrivee(t('admin.modmail_droits', { salon: `${boite}` })));
      }
      store.ecrire('modmail.salon', boite.id);
      store.ecrire('modmail.role', role?.id ?? null);
      tracer(interaction, '📨 Modmail configuré', [`**Boîte** · ${boite}`, `**Rôle** · ${role ?? '—'}`]);
      return publier(interaction, (guild) => require('./modmail').panneau(guild, langue), t);
    }
    if (sous === 'bug') {
      const rapports = interaction.options.getChannel('reports');
      store.ecrire('bug.rapports', rapports.id);
      tracer(interaction, '🐞 Panneau « bug » publié', [`**Rapports** · ${rapports}`]);
      return publier(interaction, (guild) => panneaux.panneauBug(guild, langue), t);
    }
    tracer(interaction, '💡 Panneau « idée » publié', []);
    return publier(interaction, (guild) => panneaux.panneauIdee(guild, langue), t);
  }

  // ================================================================ NOEL
  if (groupe === 'christmas') {
    const noel = require('./noel');
    const r = noel.reglages();
    if (sous === 'start') {
      const chance = interaction.options.getInteger('chance');
      const fin = interaction.options.getString('end');
      if (fin) {
        // « 25/12 », « 25/12 23:00 », « 25/12/2026 23h »…
        const [jour, heure] = fin.trim().split(/\s+/);
        const ts = require('./evenements').lireDate(jour, heure || '23:59', 'Europe/Paris');
        if (!ts || ts < Date.now()) return interaction.reply(C.erreurPrivee(t('evenement.date_invalide')));
        store.ecrire('noel.fin', String(ts));
      } else if (!store.lire('noel.fin')) {
        store.ecrire('noel.fin', String(noel.reglages().fin));
      }
      if (chance) store.ecrire('noel.chance', String(chance));
      store.ecrire('noel.actif', '1');
      store.ecrire('noel.fini', null);
      const n = noel.reglages();
      tracer(interaction, '🎄 Événement de Noël lancé', [`**Salons** · ${n.salons.length}`, `**Chance** · ${n.chance} %`]);
      return interaction.reply(C.succesPrive(t(n.salons.length ? 'admin.noel_lance' : 'admin.noel_lance_sans_salon', { chance: n.chance, quand: `<t:${Math.floor(n.fin / 1000)}:F>` })));
    }
    if (sous === 'add-channel' || sous === 'remove-channel') {
      const salon = interaction.options.getChannel('channel');
      const liste = new Set(r.salons);
      if (sous === 'add-channel') liste.add(salon.id); else liste.delete(salon.id);
      store.ecrire('noel.salons', JSON.stringify([...liste]));
      return interaction.reply(C.succesPrive(t(sous === 'add-channel' ? 'admin.noel_salon_ajoute' : 'admin.noel_salon_retire', { salon: `${salon}`, n: liste.size })));
    }
    if (sous === 'board') {
      const salon = interaction.options.getChannel('channel');
      store.ecrire('noel.classement_salon', salon.id);
      store.ecrire('noel.classement_msg', null);
      await noel.tour(client).catch(() => null);
      return interaction.reply(C.succesPrive(t('admin.noel_tableau_ok', { salon: `${salon}` })));
    }
    if (sous === 'test') {
      await interaction.reply(C.succesPrive(t('admin.noel_test_ok')));
      await noel.faireTomber(interaction.channel);
      return null;
    }
    if (sous === 'stop') {
      store.ecrire('noel.actif', null);
      return interaction.reply(C.succesPrive(t('admin.noel_arrete')));
    }
    if (sous === 'reset') {
      if (!interaction.options.getBoolean('confirm')) return interaction.reply(C.infoPrivee(t('admin.noel_raz_annule')));
      noel.vider();
      store.ecrire('noel.fini', null);
      return interaction.reply(C.succesPrive(t('admin.noel_raz_ok')));
    }
  }

  // =========================================================== INCIDENTS
  if (groupe === 'incident') {
    const inc = require('./incidents');
    const statut = require('./statut');
    const publierTout = async (i) => {
      await statut.annoncerIncident(client, i);
      await statut.rafraichir(client);
    };
    if (sous === 'create') {
      const type = interaction.options.getString('type');
      let debut = null;
      let fin = null;
      const date = interaction.options.getString('date');
      const heure = interaction.options.getString('time');
      if (date || heure) {
        const { lireDate } = require('./evenements');
        const jour = date ?? new Date().toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris' }).slice(0, 5);
        debut = lireDate(jour, heure ?? '00:00', 'Europe/Paris');
        if (!debut) return interaction.reply(C.erreurPrivee(t('evenement.date_invalide')));
      }
      const duree = interaction.options.getInteger('duration');
      if (duree) fin = (debut ?? Date.now()) + duree * 60_000;
      await interaction.deferReply({ flags: 64 });
      const i = inc.creer({
        type,
        titre: interaction.options.getString('title'),
        message: interaction.options.getString('message'),
        impact: interaction.options.getString('impact') ?? 'majeur',
        statut: type === 'maintenance' && debut && debut <= Date.now() ? 'en_cours' : undefined,
        debut, fin,
      });
      await publierTout(i);
      tracer(interaction, type === 'maintenance' ? '🛠️ Maintenance annoncée' : '⚠️ Incident ouvert', [`**#${i.id}** · ${i.titre}`]);
      return interaction.editReply(C.succes(t('admin.incident_cree', { id: i.id })));
    }
    if (sous === 'update') {
      const id = interaction.options.getInteger('id');
      const avant = inc.lire(id);
      if (!avant) return interaction.reply(C.erreurPrivee(t('admin.incident_introuvable')));
      const etat = interaction.options.getString('status');
      if (!inc.ETATS[avant.type].includes(etat)) {
        return interaction.reply(C.erreurPrivee(t('admin.incident_etat_invalide', { etats: inc.ETATS[avant.type].map((e) => t(`incident.etat_${e}`)).join(', ') })));
      }
      await interaction.deferReply({ flags: 64 });
      const i = inc.mettreAJour(id, etat, interaction.options.getString('message'));
      await publierTout(i);
      tracer(interaction, '📝 Incident mis à jour', [`**#${i.id}** · ${i.titre} · ${etat}`]);
      return interaction.editReply(C.succes(t('admin.incident_maj_ok', { id: i.id, etat: t(`incident.etat_${etat}`) })));
    }
    if (sous === 'delete') {
      const ok = inc.supprimer(interaction.options.getInteger('id'));
      if (ok) await statut.rafraichir(client);
      return interaction.reply(ok ? C.succesPrive(t('admin.incident_supprime')) : C.erreurPrivee(t('admin.incident_introuvable')));
    }
    if (sous === 'list') {
      const liste = inc.recents(30);
      return interaction.reply(C.envoiPrive([C.conteneur([
        C.texte(`## 📋 ${t('admin.incident_liste')}`),
        C.texte(liste.length ? liste.map((i) => `**#${i.id}** ${inc.EMOJI[i.statut]} ${i.titre} · ${t(`incident.etat_${i.statut}`)} · <t:${Math.floor(i.maj_le / 1000)}:R>`).join('\n') : t('admin.incident_aucun')),
      ], 0x58a6ff)]));
    }
  }

  // ============================================================== ROLES
  if (groupe === 'roles') {
    const rs = require('./rolesSupport');
    const moi = interaction.guild.members.me;
    const verifierRole = (role) => role && (role.managed || role.position >= moi.roles.highest.position);
    if (sous === 'user' || sous === 'beta') {
      const role = interaction.options.getRole('role');
      if (verifierRole(role)) return interaction.reply(C.erreurPrivee(t('admin.roles_trop_haut', { role: `${role}` })));
      store.ecrire(sous === 'user' ? 'role.utilisateur' : 'role.beta', role?.id ?? null);
      tracer(interaction, sous === 'user' ? '👥 Rôle Utilisateur de Wumi' : '🧪 Rôle Bêta-testeur', [`**Rôle** · ${role ?? 'aucun'}`]);
      if (sous === 'user' && role) {
        await interaction.deferReply({ flags: require('discord.js').MessageFlags.Ephemeral });
        const r = await rs.synchroniser(client);
        return interaction.editReply(C.succes(t('admin.roles_utilisateur_ok', { role: `${role}`, n: r.ajoutes })));
      }
      return interaction.reply(C.succesPrive(role ? t('admin.roles_defini', { role: `${role}` }) : t('admin.roles_retire')));
    }
    if (sous === 'beta-panel') {
      if (!store.lire('role.beta')) return interaction.reply(C.erreurPrivee(t('support.roles.beta_pas_configure')));
      return publier(interaction, () => rs.panneauBeta(t), t);
    }
    if (sous === 'sync') {
      if (!store.lire('role.utilisateur')) return interaction.reply(C.erreurPrivee(t('admin.roles_pas_configure')));
      await interaction.deferReply({ flags: require('discord.js').MessageFlags.Ephemeral });
      const r = await rs.synchroniser(client);
      return interaction.editReply(C.succes(t('admin.roles_sync_ok', { ajoutes: r.ajoutes, retires: r.retires })));
    }
  }

  // ============================================================ TICKETS
  if (groupe === 'ticket') {
    const tickets = require('./ticketsSupport');

    if (sous === 'panel') {
      const r = await publier(interaction, tickets.construirePanneau, t);
      tracer(interaction, '🎫 Panneau de tickets publié', [`**Salon** · ${interaction.options.getChannel('channel') ?? interaction.channel}`]);
      return r;
    }
    if (sous === 'category') {
      const cat = interaction.options.getChannel('category');
      store.ecrire('ticket.categorie', cat?.id ?? null);
      tracer(interaction, '🎫 Catégorie des tickets', [`**Catégorie** · ${cat?.name ?? '—'}`]);
      return interaction.reply(C.succesPrive(cat ? t('admin.ticket_categorie_ok', { categorie: cat.name }) : t('admin.ticket_categorie_aucune')));
    }
    if (sous === 'staff') {
      const role = interaction.options.getRole('role');
      store.ecrire('ticket.staff', role?.id ?? null);
      tracer(interaction, '🎫 Rôle staff des tickets', [`**Rôle** · ${role ?? '—'}`]);
      return interaction.reply(C.succesPrive(role ? t('admin.ticket_staff_ok', { role: `${role}` }) : t('admin.ticket_staff_aucun')));
    }
    if (sous === 'limit') {
      const n = interaction.options.getInteger('number');
      store.ecrire('ticket.limite', n);
      return interaction.reply(C.succesPrive(t('admin.ticket_limite_ok', { n })));
    }
    if (sous === 'inactivity') {
      const n = interaction.options.getInteger('hours');
      store.ecrire('ticket.inactif_heures', n);
      return interaction.reply(C.succesPrive(n ? t('ticket.v2.inactivite_ok', { n }) : t('ticket.v2.inactivite_off')));
    }
    if (sous === 'list') {
      const ouverts = store.q.ouverts.all();
      if (!ouverts.length) return interaction.reply(C.infoPrivee(t('admin.ticket_liste_vide')));
      const lignes = ouverts.slice(0, 25).map((tk) => {
        const m = tickets.MOTIFS[tk.motif] ?? tickets.MOTIFS.autre;
        const p = tickets.PRIORITES[tk.priorite]?.emoji ?? '🔵';
        return `${p} ${m.emoji} **#${String(tk.numero).padStart(4, '0')}** <#${tk.channel_id}> · <@${tk.user_id}> · ${quand(tk.cree_le)}${tk.pris_par ? ` · 🙋 <@${tk.pris_par}>` : ''}`;
      });
      return interaction.reply(C.envoiPrive([C.conteneur([
        C.texte(`## 🎫 ${t('admin.ticket_liste_titre', { n: ouverts.length })}`),
        C.texte(lignes.join('\n')),
      ], conf.couleurs.principale)]));
    }
    // view
    const s = tickets.statistiques();
    const staff = store.lire('ticket.staff');
    const cat = store.lire('ticket.categorie');
    return interaction.reply(C.envoiPrive([C.conteneur([
      C.texte(`## 🎫 ${t('admin.ticket_voir_titre')}`),
      C.texte([
        `**${t('admin.ticket_label_categorie')}** · ${cat ? `<#${cat}>` : `\`${t('admin.aucun')}\``}`,
        `**${t('admin.ticket_label_staff')}** · ${staff ? `<@&${staff}>` : `\`${t('admin.aucun')}\``}`,
        `**${t('admin.ticket_label_limite')}** · ${store.lireNombre('ticket.limite') || 1}`,
        `**${t('ticket.v2.inactivite_label')}** · ${store.lireNombre('ticket.inactif_heures') ? t('ticket.v2.inactivite_valeur', { n: store.lireNombre('ticket.inactif_heures') }) : t('admin.inactif')}`,
        `**${t('admin.ticket_label_logs')}** · ${journal.salonId('tickets') ? `<#${journal.salonId('tickets')}>` : `\`LOG_TICKETS ${t('admin.vide')}\``}`,
      ].join('\n')),
      C.separateur(),
      C.texte([
        `### 📊 ${t('admin.stats')}`,
        `**${t('admin.ticket_stat_total')}** · ${s.total} · **${t('admin.ticket_stat_ouverts')}** · ${s.ouverts}`,
        `**${t('admin.ticket_stat_note')}** · ${s.note ? `${s.note}/5 (${s.notes})` : '—'}`,
        `**${t('admin.ticket_stat_prise')}** · ${s.priseMoyenne ? duree(s.priseMoyenne) : '—'}`,
        `**${t('admin.ticket_stat_duree')}** · ${s.dureeMoyenne ? duree(s.dureeMoyenne) : '—'}`,
      ].join('\n')),
    ], conf.couleurs.principale)]));
  }

  // ======================================================= VERIFICATION
  const verif = require('./verificationSupport');

  if (sous === 'panel') {
    if (!store.lire('verif.role')) return interaction.reply(C.erreurPrivee(t('support.verif.role_absent')));
    const r = await publier(interaction, verif.construirePanneau, t);
    tracer(interaction, '🛡️ Panneau de vérification publié', [`**Salon** · ${interaction.options.getChannel('channel') ?? interaction.channel}`]);
    return r;
  }
  if (sous === 'role') {
    const role = interaction.options.getRole('role');
    const non = interaction.options.getRole('unverified');
    if (!role.editable) return interaction.reply(C.erreurPrivee(t('support.verif.role_trop_haut')));
    if (role.managed || role.id === interaction.guild.id) return interaction.reply(C.erreurPrivee(t('admin.verif_role_invalide')));
    store.ecrire('verif.role', role.id);
    store.ecrire('verif.retirer_role', non?.id ?? null);
    tracer(interaction, '🛡️ Rôle de vérification', [`**Rôle donné** · ${role}`, `**Rôle retiré** · ${non ?? '—'}`]);
    return interaction.reply(C.succesPrive(t('admin.verif_role_ok', { role: `${role}` }) + (non ? `\n${t('admin.verif_role_retire', { role: `${non}` })}` : '')));
  }
  if (sous === 'min-age') {
    const jours = interaction.options.getInteger('days');
    store.ecrire('verif.age_min_jours', jours);
    return interaction.reply(C.succesPrive(jours ? t('admin.verif_age_ok', { n: jours }) : t('admin.verif_age_aucun')));
  }
  if (sous === 'reset') {
    const user = interaction.options.getUser('member');
    store.q.oublierVerification.run(user.id);
    const membre = await interaction.guild.members.fetch(user.id).catch(() => null);
    const role = store.lire('verif.role');
    if (membre && role && membre.roles.cache.has(role)) await membre.roles.remove(role, 'Vérification réinitialisée').catch(() => null);
    tracer(interaction, '🛡️ Vérification réinitialisée', [`**Membre** · ${user} (\`${user.id}\`)`], conf.couleurs.avertissement);
    return interaction.reply(C.succesPrive(t('admin.verif_reset_ok', { membre: `${user}` })));
  }

  // view
  const s = verif.statistiques();
  const role = store.lire('verif.role');
  const non = store.lire('verif.retirer_role');
  const port = Number(process.env.SERVEUR_PUBLIC_PORT) || null;
  return interaction.reply(C.envoiPrive([C.conteneur([
    C.texte(`## 🛡️ ${t('admin.verif_voir_titre')}`),
    C.texte([
      `**${t('admin.verif_label_role')}** · ${role ? `<@&${role}>` : `\`${t('admin.aucun')}\``}`,
      `**${t('admin.verif_label_non')}** · ${non ? `<@&${non}>` : `\`${t('admin.aucun')}\``}`,
      `**${t('admin.verif_label_age')}** · ${store.lireNombre('verif.age_min_jours') || 0} j`,
      `**${t('admin.verif_label_activite')}** · ${verif.activiteActive() ? `🟢 ${t('admin.actif')}` : `🔴 ${t('admin.inactif')} (ACTIVITE_ACTIVE / CLIENT_SECRET)`}`,
      `**${t('admin.verif_label_serveur')}** · ${port ? `🟢 port ${port}` : `🔴 SERVEUR_PUBLIC_PORT ${t('admin.vide')}`}`,
      `**${t('admin.verif_label_logs')}** · ${journal.salonId('verification') ? `<#${journal.salonId('verification')}>` : `\`LOG_VERIFICATION ${t('admin.vide')}\``}`,
    ].join('\n')),
    C.separateur(),
    C.texte([
      `### 📊 ${t('admin.stats')}`,
      `**${t('admin.verif_stat_total')}** · ${s.total} (${t('admin.verif_stat_activite', { n: s.activite })})`,
      `**${t('admin.verif_stat_semaine')}** · ${s.semaine}`,
      `**${t('admin.verif_stat_sessions')}** · ${s.sessions}`,
    ].join('\n')),
  ], 0x58a6ff)]));
}

// ------------------------------------------------------------------- LOGS
async function logs(interaction) {
  const { t } = traducteur(interaction);
  const tester = interaction.options.getBoolean('test') ?? false;
  const etat = journal.etat();

  const lignes = etat.map((e) => `${e.salon ? '🟢' : '⚪'} \`${e.variable}\` · ${e.salon ? `<#${e.salon}>${e.direct ? '' : ` _(${t('admin.logs_repli')})_`}` : t('admin.logs_vide')}`);

  if (tester) {
    await interaction.deferReply({ flags: 64 });
    const resultats = [];
    for (const e of etat.filter((x) => x.salon)) {
      const ok = await journal.noter(e.sujet, {
        titre: `🧪 Test · ${e.variable}`,
        couleur: conf.couleurs.info,
        lignes: [t('admin.logs_test_texte', { membre: `${interaction.user}` })],
      });
      resultats.push(`${ok ? '✅' : '❌'} \`${e.variable}\``);
    }
    return interaction.editReply(C.envoi([C.conteneur([
      C.texte(`## 🧾 ${t('admin.logs_titre')}`),
      C.texte(lignes.join('\n')),
      C.separateur(),
      C.texte(`### ${t('admin.logs_test_titre')}\n${resultats.join('\n') || t('admin.logs_rien')}`),
    ], conf.couleurs.principale)]));
  }

  return interaction.reply(C.envoiPrive([C.conteneur([
    C.texte(`## 🧾 ${t('admin.logs_titre')}`),
    C.texte(lignes.join('\n')),
    C.texte(`-# ${t('admin.logs_pied')}`),
  ], conf.couleurs.principale)]));
}

module.exports = { groupePanneaux, groupeNoel, groupeTicket, groupeVerification, groupeRoles, groupeIncident, autocompleteIncident, executer, logs };
