/**
 * Wumi 2.34 · /cards (/cartes) : les cartes a collectionner.
 *
 * ouvrir · classeur · voir · deck · vitrine · acheter · quotidien · recycler
 * · info · classement. Toute la logique est dans src/utils/cartes/ ; ici, on
 * affiche. Les boutons (crt_*) passent par gererInteraction().
 *
 * Pas de commande pour donner ou echanger une carte : c'est voulu.
 */
const {
  SlashCommandBuilder, InteractionContextType, AttachmentBuilder,
  ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags,
} = require('discord.js');
const crypto = require('node:crypto');
const C = require('../../utils/composants');
const { E } = require('../../utils/emojis');
const { traducteur, localisations, t: tr, DEFAUT } = require('../../utils/langues');
const cartes = require('../../utils/cartes');
const dessin = require('../../utils/cartes/dessin');
const logger = require('../../utils/logger');

const d = (o, cle) => o.setDescription(tr(cle, DEFAUT)).setDescriptionLocalizations(localisations(cle));
const n = (o, en, fr) => o.setName(en).setNameLocalizations({ fr });
const COULEUR = 0x7b5cff;
const RARETE_COULEUR = { commune: 0x8d93ad, peu_commune: 0x2f9e5b, rare: 0x2a6fd6, epique: 0x7b3fd6, legendaire: 0xff9d2e, mythique: 0xff5fd2 };
const RARETE_EMOJI = { commune: '⚪', peu_commune: '🟢', rare: '🔵', epique: '🟣', legendaire: '🟠', mythique: '🌈' };

/** Libelles traduits pour dessiner une carte dans la langue du serveur. */
function optsCarte(t) {
  return (c) => ({
    nomElement: t(`cartes.famille.${c.element}`),
    nomRarete: t(`cartes.rarete.${c.rarete}`),
    nomSerie: t('cartes.serie', { n: 1 }),
    total: cartes.TOTAL,
    marque: cartes.EDITION ? require('../../edition').profil.marque : undefined,
    libelles: cartes.EDITION?.libelles ?? [t('cartes.stat_puissance').toUpperCase(), t('cartes.stat_eclat').toUpperCase()],
  });
}

const png = (canvas, nom) => new AttachmentBuilder(canvas.toBuffer('image/png'), { name: nom });

// ------------------------------------------------------------ OUVERTURES
// Le tirage est deja enregistre : ces sessions ne servent qu'a l'animation.
const sessions = new Map(); // id -> { guildId, userId, cartes, i, fin }
function nettoyer() {
  const maintenant = Date.now();
  for (const [id, s] of sessions) if (s.fin < maintenant) sessions.delete(id);
}

function ligneCarte(t, x) {
  return `${RARETE_EMOJI[x.carte.rarete]} **${x.carte.nom}** · ${t(`cartes.rarete.${x.carte.rarete}`)}${x.brillante ? ` · ✨ ${t('cartes.brillante')}` : ''}${x.nouvelle ? ` · 🆕 ${t('cartes.nouvelle')}` : ''}`;
}

async function ecranRevelation(t, s) {
  const x = s.cartes[s.i];
  const derniere = s.i === s.cartes.length - 1;
  const image = await dessin.carte(x.carte, { ...optsCarte(t)(x.carte), brillante: x.brillante });
  const bouton = new ButtonBuilder()
    .setCustomId(`crt_rev:${s.id}`)
    .setStyle(derniere ? ButtonStyle.Success : ButtonStyle.Primary)
    .setLabel(derniere ? t('cartes.voir_tout') : t('cartes.suivante', { i: s.i + 2, n: s.cartes.length }));
  return C.envoi([C.conteneur([
    C.texte(`### ${t('cartes.carte_x', { i: s.i + 1, n: s.cartes.length })}\n${ligneCarte(t, x)}`),
    C.image('attachment://carte.png'),
    new ActionRowBuilder().addComponents(bouton),
  ], RARETE_COULEUR[x.carte.rarete])], { files: [png(image, 'carte.png')] });
}

async function ecranRecap(t, s, membre) {
  const image = await dessin.rangee(s.cartes, { optsCarte: optsCarte(t), echelle: 0.4 });
  const r = cartes.resume(s.guildId, s.userId);
  return C.envoi([C.conteneur([
    C.texte(`## 🎴 ${t('cartes.recap_titre', { membre: `${membre}` })}\n${s.cartes.map((x) => ligneCarte(t, x)).join('\n')}`),
    C.image('attachment://booster.png'),
    C.texte(`-# ${t('cartes.recap_pied', { n: r.differentes, total: r.total, boosters: r.boosters })}`),
  ], COULEUR)], { files: [png(image, 'booster.png')] });
}

async function ouvrir(interaction, t) {
  const res = cartes.ouvrir(interaction.guildId, interaction.user.id);
  if (!res) {
    const r = cartes.resume(interaction.guildId, interaction.user.id);
    return interaction.reply(C.infoPrivee(t('cartes.aucun_booster', { reste: r.messages - r.compteur })));
  }
  await interaction.deferReply();
  nettoyer();
  const id = crypto.randomBytes(5).toString('hex');
  const s = { id, guildId: interaction.guildId, userId: interaction.user.id, cartes: res.cartes, i: -1, fin: Date.now() + 15 * 60_000 };
  sessions.set(id, s);
  const image = await dessin.booster(cartes.EDITION ? { ...cartes.EDITION.booster, haut: require('../../edition').profil.marque.toUpperCase() } : { titre: t('cartes.booster_titre').toUpperCase(), sous: t('cartes.booster_sous', { n: 1 }) });
  return interaction.editReply(C.envoi([C.conteneur([
    C.texte(`## 🎴 ${t('cartes.ouverture_titre', { membre: `${interaction.user}` })}\n-# ${t('cartes.ouverture_restants', { n: res.restants })}`),
    C.image('attachment://paquet.png'),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`crt_rev:${id}`).setStyle(ButtonStyle.Primary).setEmoji('✨').setLabel(t('cartes.dechirer'))
    ),
  ], COULEUR)], { files: [png(image, 'paquet.png')] }));
}

// ------------------------------------------------------------ CLASSEUR
async function pageClasseur(t, guildId, membre, f) {
  const famille = cartes.FAMILLES[f];
  const col = cartes.collection(guildId, membre.id);
  const liste = cartes.SERIE1.filter((c) => c.element === famille);
  const emplacements = liste.map((c) => ({ carte: c, possedee: col.has(c.numero), brillante: col.get(c.numero)?.brillante, quantite: col.get(c.numero)?.quantite ?? 0 }));
  const trouvees = emplacements.filter((e) => e.possedee).length;
  const image = await dessin.page(emplacements, {
    element: famille,
    titre: t(`cartes.famille.${famille}`),
    compteur: `${trouvees}/${liste.length}`,
    optsCarte: optsCarte(t),
  });
  const r = cartes.resume(guildId, membre.id);
  const nav = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`crt_cls:${membre.id}:${(f + 5) % 6}`).setStyle(ButtonStyle.Secondary).setEmoji('◀️'),
    new ButtonBuilder().setCustomId('crt_x').setStyle(ButtonStyle.Secondary).setLabel(`${f + 1}/6`).setDisabled(true),
    new ButtonBuilder().setCustomId(`crt_cls:${membre.id}:${(f + 1) % 6}`).setStyle(ButtonStyle.Secondary).setEmoji('▶️')
  );
  return C.envoi([C.conteneur([
    C.texte(`## 📒 ${t('cartes.classeur_titre', { membre: membre.displayName ?? membre.username })}\n${t('cartes.classeur_resume', { n: r.differentes, total: r.total, pourcent: r.pourcent, brillantes: r.brillantes })}`),
    C.image('attachment://classeur.png'),
    nav,
  ], COULEUR)], { files: [png(image, 'classeur.png')] });
}

// ------------------------------------------------------------ COMMANDE
module.exports = {
  categorie: 'economie',

  data: d(n(new SlashCommandBuilder(), 'cards', 'cartes'), 'cartes.description_commande')
    .setContexts(InteractionContextType.Guild)
    .addSubcommand((s) => d(n(s, 'open', 'ouvrir'), 'cartes.sous_ouvrir'))
    .addSubcommand((s) => d(n(s, 'binder', 'classeur'), 'cartes.sous_classeur')
      .addUserOption((o) => d(n(o, 'member', 'membre'), 'cartes.opt_membre'))
      .addStringOption((o) => d(n(o, 'family', 'famille'), 'cartes.opt_famille')
        .addChoices(...cartes.FAMILLES.map((f) => ({ name: tr(`cartes.famille.${f}`, DEFAUT), name_localizations: localisations(`cartes.famille.${f}`), value: f })))))
    .addSubcommand((s) => d(n(s, 'view', 'voir'), 'cartes.sous_voir')
      .addStringOption((o) => d(n(o, 'card', 'carte'), 'cartes.opt_carte').setRequired(true).setAutocomplete(true)))
    .addSubcommand((s) => d(n(s, 'deck', 'deck'), 'cartes.sous_deck')
      .addUserOption((o) => d(n(o, 'member', 'membre'), 'cartes.opt_membre')))
    .addSubcommand((s) => {
      d(n(s, 'showcase', 'vitrine'), 'cartes.sous_vitrine');
      for (let i = 1; i <= 5; i++) {
        s.addStringOption((o) => d(n(o, `card${i}`, `carte${i}`), 'cartes.opt_carte').setRequired(i === 1).setAutocomplete(true));
      }
      return s;
    })
    .addSubcommand((s) => d(n(s, 'buy', 'acheter'), 'cartes.sous_acheter')
      .addIntegerOption((o) => d(n(o, 'amount', 'nombre'), 'cartes.opt_nombre').setMinValue(1).setMaxValue(cartes.ACHAT_MAX)))
    .addSubcommand((s) => d(n(s, 'daily', 'quotidien'), 'cartes.sous_quotidien'))
    .addSubcommand((s) => d(n(s, 'recycle', 'recycler'), 'cartes.sous_recycler'))
    .addSubcommand((s) => d(n(s, 'info', 'info'), 'cartes.sous_info')
      .addUserOption((o) => d(n(o, 'member', 'membre'), 'cartes.opt_membre')))
    .addSubcommand((s) => d(n(s, 'leaderboard', 'classement'), 'cartes.sous_classement')),

  async autocomplete(interaction) {
    const saisi = String(interaction.options.getFocused() ?? '').toLowerCase();
    const col = cartes.collection(interaction.guildId, interaction.user.id);
    const { t } = traducteur(interaction);
    const choix = cartes.SERIE1
      .filter((c) => col.has(c.numero) && (!saisi || c.nom.toLowerCase().includes(saisi) || String(c.numero) === saisi))
      .slice(0, 25)
      .map((c) => ({ name: `#${String(c.numero).padStart(2, '0')} ${c.nom} · ${t(`cartes.rarete.${c.rarete}`)}${col.get(c.numero).quantite > 1 ? ` (x${col.get(c.numero).quantite})` : ''}`.slice(0, 100), value: String(c.numero) }));
    return interaction.respond(choix);
  },

  async execute(interaction) {
    const { t, nombre } = traducteur(interaction);
    const sous = interaction.options.getSubcommand();
    const reg = cartes.reglages(interaction.guildId);
    if (!reg.actif) return interaction.reply(C.infoPrivee(t('cartes.desactive')));
    const moi = interaction.user.id;
    const g = interaction.guildId;

    if (sous === 'open') return ouvrir(interaction, t);

    if (sous === 'binder') {
      const membre = interaction.options.getMember('member') ?? interaction.member;
      const f = Math.max(0, cartes.FAMILLES.indexOf(interaction.options.getString('family') ?? cartes.FAMILLES[0]));
      await interaction.deferReply();
      return interaction.editReply(await pageClasseur(t, g, membre, f));
    }

    if (sous === 'view') {
      const c = cartes.PAR_NUMERO.get(Number(interaction.options.getString('card')));
      const col = cartes.collection(g, moi);
      if (!c || !col.has(c.numero)) return interaction.reply(C.erreurPrivee(t('cartes.pas_a_toi')));
      await interaction.deferReply();
      const e = col.get(c.numero);
      const image = await dessin.carte(c, { ...optsCarte(t)(c), brillante: e.brillante });
      return interaction.editReply(C.envoi([C.conteneur([
        C.texte(`### ${RARETE_EMOJI[c.rarete]} ${c.nom}\n-# ${t('cartes.voir_pied', { n: e.quantite, date: `<t:${Math.floor(e.premiere / 1000)}:D>` })}`),
        C.image('attachment://carte.png'),
      ], RARETE_COULEUR[c.rarete])], { files: [png(image, 'carte.png')] }));
    }

    if (sous === 'deck') {
      const membre = interaction.options.getMember('member') ?? interaction.member;
      const r = cartes.resume(g, membre.id);
      if (!r.deck.length) {
        return interaction.reply(C.infoPrivee(membre.id === moi ? t('cartes.deck_vide_moi') : t('cartes.deck_vide', { membre: membre.displayName })));
      }
      await interaction.deferReply();
      const col = cartes.collection(g, membre.id);
      const liste = r.deck.map((num) => ({ carte: cartes.PAR_NUMERO.get(num), brillante: col.get(num)?.brillante })).filter((x) => x.carte);
      const image = await dessin.rangee(liste, { optsCarte: optsCarte(t), echelle: 0.42 });
      return interaction.editReply(C.envoi([C.conteneur([
        C.texte(`## 🃏 ${t('cartes.deck_titre', { membre: membre.displayName })}\n-# ${t('cartes.classeur_resume', { n: r.differentes, total: r.total, pourcent: r.pourcent, brillantes: r.brillantes })}`),
        C.image('attachment://deck.png'),
      ], COULEUR)], { files: [png(image, 'deck.png')] }));
    }

    if (sous === 'showcase') {
      const nums = [1, 2, 3, 4, 5].map((i) => Number(interaction.options.getString(`card${i}`))).filter(Boolean);
      const deck = cartes.definirDeck(g, moi, nums);
      if (!deck.length) return interaction.reply(C.erreurPrivee(t('cartes.pas_a_toi')));
      return interaction.reply(C.succesPrive(t('cartes.vitrine_ok', { cartes: deck.map((x) => cartes.PAR_NUMERO.get(x).nom).join(', ') })));
    }

    if (sous === 'buy') {
      if (!reg.economie) return interaction.reply(C.infoPrivee(t('cartes.economie_off')));
      const res = cartes.acheter(g, moi, interaction.options.getInteger('amount') ?? 1);
      const eco = require('../../utils/economie');
      if (!res.ok && res.raison === 'plein') return interaction.reply(C.avertissementPrivee(t('cartes.stock_plein', { max: cartes.BOOSTERS_MAX })));
      if (!res.ok) return interaction.reply(C.erreurPrivee(t('cartes.pas_assez', { cout: eco.somme(g, res.cout), solde: eco.somme(g, eco.solde(g, moi)) })));
      return interaction.reply(C.succes(t('cartes.achat_ok', { n: res.n, cout: eco.somme(g, res.cout), boosters: res.boosters })));
    }

    if (sous === 'daily') {
      if (!reg.quotidien) return interaction.reply(C.infoPrivee(t('cartes.quotidien_off')));
      const res = cartes.quotidien(g, moi);
      if (res.plein) return interaction.reply(C.avertissementPrivee(t('cartes.stock_plein', { max: cartes.BOOSTERS_MAX })));
      if (!res.ok) return interaction.reply(C.infoPrivee(t('cartes.quotidien_attente', { quand: `<t:${Math.floor(res.prochain / 1000)}:R>` })));
      return interaction.reply(C.succes(t('cartes.quotidien_ok', { boosters: res.boosters })));
    }

    if (sous === 'recycle') {
      const est = cartes.estimerRecyclage(g, moi);
      if (!est.cartes) return interaction.reply(C.infoPrivee(t('cartes.recycler_rien')));
      return interaction.reply(C.envoiPrive([C.conteneur([
        C.texte(`### ♻️ ${t('cartes.recycler_titre')}\n${t('cartes.recycler_detail', { n: est.cartes, poussiere: nombre(est.poussiere), par: cartes.POUSSIERE_BOOSTER })}`),
        new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`crt_rec:${moi}`).setStyle(ButtonStyle.Success).setLabel(t('cartes.recycler_bouton'))
        ),
      ], COULEUR)]));
    }

    if (sous === 'info') {
      const membre = interaction.options.getMember('member') ?? interaction.member;
      const r = cartes.resume(g, membre.id);
      const eco = require('../../utils/economie');
      const lignes = [
        t('cartes.info_collection', { n: r.differentes, total: r.total, pourcent: r.pourcent, brillantes: r.brillantes }),
        t('cartes.info_boosters', { n: r.boosters, max: cartes.BOOSTERS_MAX }),
        t('cartes.info_prochain', { n: r.compteur, total: r.messages }),
        reg.quotidien ? t('cartes.info_quotidien', { quand: r.quotidien <= Date.now() ? t('cartes.maintenant') : `<t:${Math.floor(r.quotidien / 1000)}:R>` }) : null,
        reg.economie && reg.prix > 0 ? t('cartes.info_prix', { prix: eco.somme(g, reg.prix) }) : null,
        t('cartes.info_poussiere', { n: r.poussiere, par: cartes.POUSSIERE_BOOSTER }),
        t('cartes.info_ouverts', { n: r.ouverts }),
      ].filter(Boolean);
      return interaction.reply(C.envoi([C.conteneur([
        C.texte(`## 🎴 ${t('cartes.info_titre', { membre: membre.displayName })}\n${lignes.map((l) => `› ${l}`).join('\n')}`),
      ], COULEUR)], membre.id === moi ? { flags: MessageFlags.Ephemeral } : {}));
    }

    // leaderboard
    const top = cartes.classement(g, 10);
    if (!top.length) return interaction.reply(C.infoPrivee(t('cartes.classement_vide')));
    const medailles = ['🥇', '🥈', '🥉'];
    return interaction.reply(C.envoi([C.conteneur([
      C.texte(`## 🏆 ${t('cartes.classement_titre')}\n${top.map((l, i) => `${medailles[i] ?? `**${i + 1}.**`} <@${l.user_id}> · ${t('cartes.classement_ligne', { n: l.differentes, total: cartes.TOTAL, brillantes: l.brillantes })}`).join('\n')}`),
    ], COULEUR)], { allowedMentions: { parse: [] } }));
  },

  async gererInteraction(interaction) {
    const { t } = traducteur(interaction);
    const [action, a, b] = interaction.customId.split(':');
    try {
      if (action === 'crt_rev') {
        const s = sessions.get(a);
        if (!s) return interaction.reply(C.infoPrivee(t('cartes.session_finie')));
        if (s.userId !== interaction.user.id) return interaction.reply(C.erreurPrivee(t('cartes.pas_ton_booster')));
        await interaction.deferUpdate();
        s.i++;
        if (s.i >= s.cartes.length) {
          sessions.delete(s.id);
          return interaction.editReply({ ...(await ecranRecap(t, s, interaction.user)), attachments: [] });
        }
        return interaction.editReply({ ...(await ecranRevelation(t, s)), attachments: [] });
      }
      if (action === 'crt_cls') {
        const membre = await interaction.guild.members.fetch(a).catch(() => null);
        if (!membre) return interaction.reply(C.erreurPrivee(t('cartes.membre_absent')));
        await interaction.deferUpdate();
        return interaction.editReply({ ...(await pageClasseur(t, interaction.guildId, membre, Number(b) || 0)), attachments: [] });
      }
      if (action === 'crt_rec') {
        if (a !== interaction.user.id) return interaction.reply(C.erreurPrivee(t('cartes.pas_ton_booster')));
        const res = cartes.recycler(interaction.guildId, interaction.user.id);
        return interaction.update(C.envoi([C.conteneur([
          C.texte(`### ♻️ ${t('cartes.recycler_fait', { n: res.cartes, poussiere: res.poussiere, boosters: res.boosters, reste: res.reste ?? 0, par: cartes.POUSSIERE_BOOSTER })}`),
        ], COULEUR)]));
      }
    } catch (e) {
      logger.erreur(`Cartes (${interaction.customId}) :`, e);
      const r = C.erreurPrivee(t('cartes.erreur'));
      if (interaction.deferred || interaction.replied) return interaction.followUp(r).catch(() => null);
      return interaction.reply(r).catch(() => null);
    }
    return null;
  },
};
