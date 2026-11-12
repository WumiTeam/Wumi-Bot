const { SlashCommandBuilder, AttachmentBuilder, InteractionContextType } = require('discord.js');
const { req, config } = require('../../database/db');
const { infosNiveau, rangDe } = require('../../utils/niveaux');
const { genererCarteProfil } = require('../../utils/carteProfil');
const themes = require('../../utils/themesRank');
const missions = require('../../utils/missions');
const eco = require('../../utils/economie');
const { totalDe } = require('../../utils/invitations');
const C = require('../../utils/composants');
const { traducteur, localisations, t: tr, DEFAUT } = require('../../utils/langues');

const JOUR = 86_400_000;

/**
 * Anciennete lisible : "3 jours", "5 mois", "1 an et 3 mois".
 *
 * Ce texte est dessine SUR LA CARTE (carteProfil.js), un utilitaire hors de ce
 * lot dont tous les autres libelles ("NIVEAU", "RANG"...) sont en francais en
 * dur, sans parametre de langue. Le traduire ici produirait une carte a moitie
 * en anglais : c'est signale dans le rapport, mais la chaine reste correcte
 * cote code (elle passe par `t`), donc prete le jour ou la carte le sera aussi.
 */
function anciennete(depuis, { t, nombre }) {
  if (!depuis) return t('profil.anciennete_inconnue');
  const jours = Math.floor((Date.now() - depuis) / JOUR);
  if (jours < 1) return t('profil.anciennete_aujourdhui');
  if (jours < 31) return t('commun.duree.jour', { n: jours });

  const mois = Math.floor(jours / 30.44);
  if (mois < 12) return t('profil.anciennete_mois', { n: nombre(mois) });

  const ans = Math.floor(mois / 12);
  const reste = mois % 12;
  const texteAns = t('profil.anciennete_ans', { n: nombre(ans) });
  return reste ? t('profil.anciennete_ans_et_mois', { ans: texteAns, mois: t('profil.anciennete_mois', { n: nombre(reste) }) }) : texteAns;
}

module.exports = {
  categorie: 'niveau',

  data: new SlashCommandBuilder()
    .setName('profil')
    .setDescription(tr('profil.description_commande', DEFAUT))
    .setDescriptionLocalizations(localisations('profil.description_commande'))
    .addUserOption((o) => o
      .setName('member')
      .setNameLocalizations({ fr: 'membre' })
      .setDescription(tr('profil.opt_membre', DEFAUT))
      .setDescriptionLocalizations(localisations('profil.opt_membre')))
    .setContexts(InteractionContextType.Guild),

  async execute(interaction) {
    await interaction.deferReply();

    const { t, nombre } = traducteur(interaction);
    const guildId = interaction.guild.id;
    const cible = interaction.options.getUser('member') ?? interaction.user;
    if (cible.bot) {
      return interaction.editReply(C.erreur(t('profil.bots_pas_de_profil')));
    }

    const membre = await interaction.guild.members.fetch(cible.id).catch(() => null);
    const ligne = req.getXp.get(guildId, cible.id);
    const infos = infosNiveau(ligne?.xp ?? 0);
    const solde = eco.solde(guildId, cible.id);

    // Missions du jour : on ne montre le bloc que si le systeme tourne.
    let etatMissions = null;
    if (config(guildId).missions_actif) {
      const jour = missions.etat(guildId, cible.id).find((p) => p.nom === 'jour');
      if (jour?.missions.length) {
        etatMissions = { faites: jour.missions.filter((m) => m.accomplie).length, total: jour.missions.length };
      }
    }

    // Les trois roles les plus hauts, sans @everyone
    const roles = membre?.roles?.cache
      ? [...membre.roles.cache.values()]
          .filter((r) => r.id !== interaction.guild.id)
          .sort((a, b) => b.position - a.position)
          .slice(0, 3)
          .map((r) => r.name)
      : [];

    const png = await genererCarteProfil({
      pseudo: membre?.displayName ?? cible.username,
      tag: cible.username,
      avatarUrl: cible.displayAvatarURL({ extension: 'png', size: 256 }),
      niveau: infos.niveau,
      rang: ligne?.xp ? rangDe(guildId, ligne.xp) : req.totalMembresXp.get(guildId).n + 1,
      totalMembres: req.totalMembresXp.get(guildId).n,
      xpActuel: infos.xpActuel,
      xpRequis: infos.xpRequis,
      xpTotal: infos.xpTotal,
      messages: ligne?.messages ?? 0,
      minutesVocal: Math.floor((ligne?.secondes_vocal ?? 0) / 60),
      solde,
      monnaie: eco.monnaie(guildId).nom,
      rangSolde: eco.rang(guildId, solde),
      invitations: totalDe(guildId, cible.id).total,
      anciennete: anciennete(membre?.joinedTimestamp, { t, nombre }),
      avertissements: req.avertissementsActifs.all(guildId, cible.id).length,
      missions: etatMissions,
      roles,
      accent: membre?.displayHexColor && membre.displayHexColor !== '#000000' ? membre.displayHexColor : null,
      theme: themes.themeDe(guildId, cible.id),
      prestige: ligne?.prestige ?? 0,
      badges: require('../../utils/progression').badgesDe(guildId, cible.id),
    });

    const nomFichier = `profil-${cible.id}.png`;
    return interaction.editReply(
      // PIEGE V2 : une piece jointe ne s'affiche plus toute seule, il faut la
      // referencer explicitement par C.image('attachment://...').
      C.envoi([C.conteneur([C.image(`attachment://${nomFichier}`, t('profil.alt_carte', { pseudo: cible.username }))])], {
        files: [new AttachmentBuilder(png, { name: nomFichier })],
      })
    );
  },
};
