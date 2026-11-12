/**
 * /music — tout le reste de la musique (file, volume, filtres, playlists…),
 * et les boutons du panneau (prefixe mus_). /play est a cote.
 * La logique du lecteur est dans src/musique/lecteur.js.
 */
const {
  SlashCommandBuilder, InteractionContextType, PermissionFlagsBits, MessageFlags,
} = require('discord.js');
const C = require('../../utils/composants');
const { config, majConfig } = require('../../database/db');
const { musique, droits, voter, pl, duree, lireDuree, FILTRES, NOMS_FILTRES, titre } = require('../../musique/lecteur');
const { traducteur, localisations, t: tr, DEFAUT } = require('../../utils/langues');

const d = (o, cle) => o.setDescription(tr(cle, DEFAUT)).setDescriptionLocalizations(localisations(cle));

/** Verifications communes : Lavalink pret, lecteur present, droits. */
function controle(interaction, t, action, { lecteurRequis = true } = {}) {
  if (!musique.configure()) return { erreur: t('musique.non_configure') };
  if (!musique.disponible()) return { erreur: t('musique.indisponible') };
  const lecteur = musique.obtenir(interaction.guildId);
  if (lecteurRequis && !lecteur) return { erreur: t('musique.rien') };
  if (lecteur?.modeJeu) return { erreur: t('blindtest.en_cours') };
  if (lecteur) {
    const r = droits(interaction.member, lecteur, action);
    if (r.ok === false) return { erreur: t(r.cle, { role: `<@&${config(interaction.guildId).musique_dj}>` }) };
    return { lecteur, vote: Boolean(r.vote) };
  }
  return { lecteur: null };
}

/**
 * Joue (ou ajoute) une recherche ou un lien. Partage par /play et
 * /music playlist charger.
 */
async function lancerLecture(interaction, t, { requete = null, pistes = null, suivant = false, immediat = false, radio = null }) {
  if (!musique.configure()) return interaction.reply(C.erreurPrivee(t('musique.non_configure')));
  if (!musique.disponible()) return interaction.reply(C.erreurPrivee(t('musique.indisponible')));
  const salon = interaction.member.voice?.channel;
  if (!salon) return interaction.reply(C.erreurPrivee(t('musique.rejoins_vocal')));
  const me = interaction.guild.members.me;
  const perms = salon.permissionsFor(me);
  if (!perms?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak])) {
    return interaction.reply(C.erreurPrivee(t('musique.droits_vocal', { salon: `${salon}` })));
  }
  let lecteur = musique.obtenir(interaction.guildId);
  if (lecteur && lecteur.salonVocal !== salon.id) {
    return interaction.reply(C.erreurPrivee(t('musique.deja_ailleurs', { salon: `<#${lecteur.salonVocal}>` })));
  }
  if (lecteur?.modeJeu) return interaction.reply(C.erreurPrivee(t('blindtest.en_cours')));
  if (lecteur) {
    const r = droits(interaction.member, lecteur, immediat ? 'passer' : 'ajouter');
    if (r.vote) return interaction.reply(C.erreurPrivee(t('radio.reserve')));
    if (r.ok === false) return interaction.reply(C.erreurPrivee(t(r.cle)));
  }

  await interaction.deferReply();
  let resultat = { pistes: pistes ?? [] };
  if (requete) {
    try {
      resultat = await musique.resoudre(requete);
    } catch {
      return interaction.editReply(C.erreur(t('musique.recherche_echec')));
    }
  }
  if (!resultat.pistes.length) {
    const cle = { spotify_liste: 'musique.spotify_liste', deezer_liste: 'musique.deezer_liste' }[resultat.note] ?? 'musique.introuvable';
    return interaction.editReply(C.erreur(t(cle)));
  }

  if (!lecteur) {
    if (salon.userLimit && salon.members.size >= salon.userLimit && !perms.has(PermissionFlagsBits.MoveMembers)) {
      return interaction.editReply(C.erreur(t('musique.salon_plein')));
    }
    try {
      lecteur = await musique.creer(interaction.guild, salon.id, interaction.channelId);
    } catch {
      return interaction.editReply(C.erreur(t('musique.connexion_echec')));
    }
  } else {
    lecteur.salonTexte = interaction.channelId;
  }

  if (radio) {
    for (const p of resultat.pistes) p.info = { ...p.info, title: radio.nom, author: radio.genre, artworkUrl: radio.image ?? p.info.artworkUrl ?? null, isStream: true };
  }
  const { ajoutees, refusees } = lecteur.ajouter(resultat.pistes, interaction.user.id, { suivant: suivant || immediat });
  const etaitVide = !lecteur.actuelle;
  if (immediat && !etaitVide) {
    await lecteur.suivant({ passer: true });
    return interaction.editReply({ components: [C.conteneur([C.texte(`📻 ${t('radio.lancee', { nom: radio?.nom ?? '' })}`)], 0x8b7cf6)], flags: MessageFlags.IsComponentsV2, allowedMentions: { parse: [] } });
  }
  const lignes = [];
  if (resultat.playlist || resultat.pistes.length > 1) {
    lignes.push(t('musique.ajout_liste', { n: ajoutees, nom: resultat.playlist ?? '—' }));
  } else {
    const p = resultat.pistes[0];
    lignes.push(etaitVide
      ? t('musique.lecture', { titre: titre(p), duree: p.info.isStream ? '🔴' : duree(p.info.length) })
      : t('musique.ajout', { titre: titre(p), position: suivant ? 1 : lecteur.file.length }));
  }
  if (radio) lignes.splice(0, lignes.length, `📻 ${t('radio.lancee', { nom: radio.nom })}`);
  if (refusees) lignes.push(t('musique.file_pleine', { n: refusees }));
  if (['youtube', 'spotify', 'deezer'].includes(resultat.note)) lignes.push(`-# ${t('musique.source_note')}`);
  await lecteur.demarrerSiBesoin();
  if (!etaitVide) lecteur.majPanneau().catch(() => null);
  return interaction.editReply({ components: [C.conteneur([C.texte(`🎵 ${lignes.join('\n')}`)], 0x8b7cf6)], flags: MessageFlags.IsComponentsV2, allowedMentions: { parse: [] } });
}

module.exports = {
  categorie: 'musique',
  lancerLecture,

  data: d(new SlashCommandBuilder().setName('music').setNameLocalizations({ fr: 'musique' }), 'musique.description_commande')
    .setContexts(InteractionContextType.Guild)
    .addSubcommand((s) => d(s.setName('queue').setNameLocalizations({ fr: 'file' }), 'musique.sous_file')
      .addIntegerOption((o) => d(o.setName('page'), 'musique.opt_page').setMinValue(1)))
    .addSubcommand((s) => d(s.setName('nowplaying').setNameLocalizations({ fr: 'en-cours' }), 'musique.sous_encours'))
    .addSubcommand((s) => d(s.setName('skip').setNameLocalizations({ fr: 'passer' }), 'musique.sous_passer'))
    .addSubcommand((s) => d(s.setName('previous').setNameLocalizations({ fr: 'precedent' }), 'musique.sous_precedent'))
    .addSubcommand((s) => d(s.setName('pause'), 'musique.sous_pause'))
    .addSubcommand((s) => d(s.setName('resume').setNameLocalizations({ fr: 'reprendre' }), 'musique.sous_reprendre'))
    .addSubcommand((s) => d(s.setName('stop'), 'musique.sous_stop'))
    .addSubcommand((s) => d(s.setName('volume'), 'musique.sous_volume')
      .addIntegerOption((o) => d(o.setName('percent').setNameLocalizations({ fr: 'pourcentage' }), 'musique.opt_volume').setRequired(true).setMinValue(1).setMaxValue(150)))
    .addSubcommand((s) => d(s.setName('loop').setNameLocalizations({ fr: 'boucle' }), 'musique.sous_boucle')
      .addStringOption((o) => d(o.setName('mode'), 'musique.opt_boucle').setRequired(true).addChoices(
        { name: 'off', name_localizations: { fr: 'désactivée' }, value: 'off' },
        { name: 'track', name_localizations: { fr: 'piste' }, value: 'piste' },
        { name: 'queue', name_localizations: { fr: 'file' }, value: 'file' },
      )))
    .addSubcommand((s) => d(s.setName('shuffle').setNameLocalizations({ fr: 'melanger' }), 'musique.sous_melanger'))
    .addSubcommand((s) => d(s.setName('remove').setNameLocalizations({ fr: 'retirer' }), 'musique.sous_retirer')
      .addIntegerOption((o) => d(o.setName('position'), 'musique.opt_position').setRequired(true).setMinValue(1)))
    .addSubcommand((s) => d(s.setName('move').setNameLocalizations({ fr: 'deplacer' }), 'musique.sous_deplacer')
      .addIntegerOption((o) => d(o.setName('from').setNameLocalizations({ fr: 'de' }), 'musique.opt_de').setRequired(true).setMinValue(1))
      .addIntegerOption((o) => d(o.setName('to').setNameLocalizations({ fr: 'vers' }), 'musique.opt_vers').setRequired(true).setMinValue(1)))
    .addSubcommand((s) => d(s.setName('clear').setNameLocalizations({ fr: 'vider' }), 'musique.sous_vider'))
    .addSubcommand((s) => d(s.setName('seek').setNameLocalizations({ fr: 'aller' }), 'musique.sous_aller')
      .addStringOption((o) => d(o.setName('time').setNameLocalizations({ fr: 'temps' }), 'musique.opt_temps').setRequired(true).setMaxLength(10)))
    .addSubcommand((s) => d(s.setName('filter').setNameLocalizations({ fr: 'filtre' }), 'musique.sous_filtre')
      .addStringOption((o) => d(o.setName('name').setNameLocalizations({ fr: 'nom' }), 'musique.opt_filtre').setRequired(true)
        .addChoices(...Object.keys(FILTRES).map((k) => ({ name: k === 'off' ? 'none' : NOMS_FILTRES[k], name_localizations: k === 'off' ? { fr: 'aucun' } : undefined, value: k })))))
    .addSubcommand((s) => d(s.setName('dj'), 'musique.sous_dj')
      .addRoleOption((o) => d(o.setName('role').setNameLocalizations({ fr: 'role' }), 'musique.opt_dj')))
    .addSubcommand((s) => d(s.setName('24-7'), 'musique.sous_247')
      .addBooleanOption((o) => d(o.setName('enabled').setNameLocalizations({ fr: 'actif' }), 'musique.opt_247').setRequired(true)))
    .addSubcommandGroup((g) => d(g.setName('playlist'), 'musique.groupe_playlist')
      .addSubcommand((s) => d(s.setName('save').setNameLocalizations({ fr: 'sauver' }), 'musique.sous_pl_sauver')
        .addStringOption((o) => d(o.setName('name').setNameLocalizations({ fr: 'nom' }), 'musique.opt_pl_nom').setRequired(true).setMaxLength(40)))
      .addSubcommand((s) => d(s.setName('load').setNameLocalizations({ fr: 'charger' }), 'musique.sous_pl_charger')
        .addStringOption((o) => d(o.setName('name').setNameLocalizations({ fr: 'nom' }), 'musique.opt_pl_nom').setRequired(true).setMaxLength(40).setAutocomplete(true)))
      .addSubcommand((s) => d(s.setName('list').setNameLocalizations({ fr: 'liste' }), 'musique.sous_pl_liste'))
      .addSubcommand((s) => d(s.setName('delete').setNameLocalizations({ fr: 'supprimer' }), 'musique.sous_pl_supprimer')
        .addStringOption((o) => d(o.setName('name').setNameLocalizations({ fr: 'nom' }), 'musique.opt_pl_nom').setRequired(true).setMaxLength(40).setAutocomplete(true)))),

  async autocomplete(interaction) {
    const saisie = interaction.options.getFocused().toLowerCase();
    const choix = pl.liste(interaction.guildId).filter((p) => p.nom.toLowerCase().includes(saisie)).slice(0, 25)
      .map((p) => ({ name: `${p.nom} (${p.n})`.slice(0, 100), value: p.nom }));
    return interaction.respond(choix);
  },

  async execute(interaction) {
    const { t } = traducteur(interaction);
    const groupe = interaction.options.getSubcommandGroup(false);
    const sous = interaction.options.getSubcommand();
    const gid = interaction.guildId;
    const admin = interaction.memberPermissions.has(PermissionFlagsBits.ManageGuild);

    // Reglages du serveur.
    if (sous === 'dj' || sous === '24-7') {
      if (!admin) return interaction.reply(C.erreurPrivee(t('musique.reserve_admin')));
      if (sous === 'dj') {
        const role = interaction.options.getRole('role');
        majConfig(gid, { musique_dj: role?.id ?? null });
        return interaction.reply(C.succesPrive(role ? t('musique.dj_defini', { role: `${role}` }) : t('musique.dj_retire')));
      }
      const actif = interaction.options.getBoolean('enabled');
      majConfig(gid, { musique_247: actif ? 1 : 0 });
      if (!actif) require('../../musique/radioPermanente').desactiver(gid);
      const l = musique.obtenir(gid);
      if (l && actif) { l.annulerInactif(); clearTimeout(l.minuteurSeul); l.minuteurSeul = null; }
      if (l && !actif) { if (!l.actuelle) l.armerInactif(); l.verifierSeul(); }
      return interaction.reply(C.succesPrive(t(actif ? 'musique.247_on' : 'musique.247_off')));
    }

    // Playlists.
    if (groupe === 'playlist') {
      const nom = interaction.options.getString('name')?.trim();
      if (sous === 'list') {
        const liste = pl.liste(gid);
        return interaction.reply(C.envoiPrive([C.conteneur([
          C.texte(`## 💾 ${t('musique.pl_titre')}`),
          C.texte(liste.length ? liste.map((p) => `**${p.nom}** · ${t('musique.pl_pistes', { n: p.n })} · <@${p.auteur}>`).join('\n') : t('musique.pl_vide')),
        ], 0x8b7cf6)], { allowedMentions: { parse: [] } }));
      }
      if (sous === 'delete') {
        if (!admin && !interaction.member.roles.cache.has(config(gid).musique_dj ?? '')) return interaction.reply(C.erreurPrivee(t('musique.reserve_dj_simple')));
        return interaction.reply(pl.supprimer(gid, nom) ? C.succesPrive(t('musique.pl_supprimee', { nom })) : C.erreurPrivee(t('musique.pl_introuvable', { nom })));
      }
      if (sous === 'save') {
        const l = musique.obtenir(gid);
        const pistes = l ? [l.actuelle, ...l.file].filter(Boolean) : [];
        if (!pistes.length) return interaction.reply(C.erreurPrivee(t('musique.rien')));
        if (!pl.lire(gid, nom) && pl.compter(gid) >= 25) return interaction.reply(C.erreurPrivee(t('musique.pl_max')));
        pl.ecrire(gid, nom, pistes, interaction.user.id);
        return interaction.reply(C.succesPrive(t('musique.pl_sauvee', { nom, n: Math.min(200, pistes.length) })));
      }
      // load
      const pistes = pl.lire(gid, nom);
      if (!pistes) return interaction.reply(C.erreurPrivee(t('musique.pl_introuvable', { nom })));
      return lancerLecture(interaction, t, { pistes });
    }

    // Commandes du lecteur.
    const action = { skip: 'passer', pause: 'pause', resume: 'pause', queue: 'file', nowplaying: 'file' }[sous] ?? sous;
    const c = controle(interaction, t, action);
    if (c.erreur) return interaction.reply(C.erreurPrivee(c.erreur));
    const l = c.lecteur;

    switch (sous) {
      case 'queue':
        return interaction.reply(l.pageFile((interaction.options.getInteger('page') ?? 1) - 1));
      case 'nowplaying': {
        const { components } = l.construirePanneau();
        return interaction.reply({ components, flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral, allowedMentions: { parse: [] } });
      }
      case 'skip': {
        if (!l.actuelle) return interaction.reply(C.erreurPrivee(t('musique.rien')));
        if (c.vote) {
          const v = await voter(l, interaction.user.id);
          return interaction.reply(C.info(v.passe ? t('musique.vote_passe') : t('musique.vote', { votes: v.votes, besoin: v.besoin })));
        }
        const avant = l.actuelle;
        await l.suivant({ passer: true });
        return interaction.reply(C.succes(t('musique.passe', { titre: titre(avant, false) }), { allowedMentions: { parse: [] } }));
      }
      case 'previous':
        return interaction.reply(await l.precedent() ? C.succes(t('musique.precedent')) : C.erreurPrivee(t('musique.pas_de_precedent')));
      case 'pause':
      case 'resume':
        if (!l.actuelle) return interaction.reply(C.erreurPrivee(t('musique.rien')));
        await l.mettreEnPause(sous === 'pause');
        return interaction.reply(C.succes(t(sous === 'pause' ? 'musique.pause_ok' : 'musique.reprise_ok')));
      case 'stop':
        await l.detruire('stop');
        return interaction.reply(C.succes(t('musique.stop_ok')));
      case 'volume': {
        const v = interaction.options.getInteger('percent');
        await l.regler({ volume: v });
        return interaction.reply(C.succes(t('musique.volume_ok', { v })));
      }
      case 'loop': {
        l.boucle = interaction.options.getString('mode');
        await l.majPanneau().catch(() => null);
        return interaction.reply(C.succes(t(`musique.boucle_ok_${l.boucle}`)));
      }
      case 'shuffle':
        if (l.file.length < 2) return interaction.reply(C.erreurPrivee(t('musique.trop_court')));
        l.melanger();
        await l.majPanneau().catch(() => null);
        return interaction.reply(C.succes(t('musique.melange_ok', { n: l.file.length })));
      case 'remove': {
        const i = interaction.options.getInteger('position') - 1;
        if (!l.file[i]) return interaction.reply(C.erreurPrivee(t('musique.position_invalide', { n: l.file.length })));
        const [p] = l.file.splice(i, 1);
        await l.majPanneau().catch(() => null);
        return interaction.reply(C.succes(t('musique.retire_ok', { titre: titre(p, false) }), { allowedMentions: { parse: [] } }));
      }
      case 'move': {
        const de = interaction.options.getInteger('from') - 1;
        const vers = Math.min(interaction.options.getInteger('to') - 1, l.file.length - 1);
        if (!l.file[de]) return interaction.reply(C.erreurPrivee(t('musique.position_invalide', { n: l.file.length })));
        const [p] = l.file.splice(de, 1);
        l.file.splice(vers, 0, p);
        await l.majPanneau().catch(() => null);
        return interaction.reply(C.succes(t('musique.deplace_ok', { titre: titre(p, false), position: vers + 1 }), { allowedMentions: { parse: [] } }));
      }
      case 'clear': {
        const n = l.file.length;
        l.file = [];
        await l.majPanneau().catch(() => null);
        return interaction.reply(C.succes(t('musique.vide_ok', { n })));
      }
      case 'seek': {
        if (!l.actuelle || l.actuelle.info.isStream || !l.actuelle.info.isSeekable) return interaction.reply(C.erreurPrivee(t('musique.seek_impossible')));
        const ms = lireDuree(interaction.options.getString('time'));
        if (ms == null) return interaction.reply(C.erreurPrivee(t('musique.temps_invalide')));
        await l.regler({ position: ms });
        return interaction.reply(C.succes(t('musique.seek_ok', { temps: duree(Math.min(ms, l.actuelle.info.length)) })));
      }
      case 'filter': {
        const f = interaction.options.getString('name');
        await l.regler({ filtre: f });
        return interaction.reply(C.succes(f === 'off' ? t('musique.filtre_off') : t('musique.filtre_ok', { nom: NOMS_FILTRES[f] })));
      }
      default:
        return interaction.reply(C.erreurPrivee(t('musique.rien')));
    }
  },

  /** Les boutons et le menu du panneau. */
  async gererInteraction(interaction) {
    const { t } = traducteur(interaction);
    const id = interaction.customId.slice(4);
    const nom = id.split(':')[0];
    const action = { prec: 'precedent', pause: 'pause', passer: 'passer', file: 'file', page: 'file' }[nom] ?? nom;
    const c = controle(interaction, t, action);
    if (c.erreur) return interaction.reply(C.erreurPrivee(c.erreur));
    const l = c.lecteur;

    switch (nom) {
      case 'file':
        return interaction.reply(l.pageFile(0));
      case 'page':
        return interaction.update(l.pageFile(Number(id.split(':')[1]) || 0));
      case 'pause':
        await interaction.deferUpdate();
        return l.mettreEnPause(!l.pause);
      case 'passer': {
        if (c.vote) {
          const v = await voter(l, interaction.user.id);
          if (v.passe) return interaction.deferUpdate();
          return interaction.reply(C.infoPrivee(t('musique.vote', { votes: v.votes, besoin: v.besoin })));
        }
        await interaction.deferUpdate();
        return l.suivant({ passer: true });
      }
      case 'prec':
        await interaction.deferUpdate();
        return l.precedent();
      case 'stop':
        await interaction.deferUpdate();
        return l.detruire('stop');
      case 'boucle':
        await interaction.deferUpdate();
        l.boucle = { off: 'file', file: 'piste', piste: 'off' }[l.boucle];
        return l.majPanneau();
      case 'melanger':
        await interaction.deferUpdate();
        l.melanger();
        return l.majPanneau();
      case 'volmoins':
      case 'volplus':
        await interaction.deferUpdate();
        return l.regler({ volume: l.volume + (nom === 'volplus' ? 10 : -10) });
      case 'filtre':
        await interaction.deferUpdate();
        return l.regler({ filtre: interaction.values?.[0] ?? 'off' });
      default:
        return interaction.deferUpdate();
    }
  },
};
