/**
 * /serverinfo — la fiche du serveur : une image (banniere, icone, chiffres,
 * boosts, activite des 14 derniers jours) et les details en texte dessous.
 */
const { SlashCommandBuilder, ChannelType, InteractionContextType, AttachmentBuilder } = require('discord.js');
const conf = require('../../../config');
const { req } = require('../../database/db');
const { ts } = require('../../utils/outils');
const C = require('../../utils/composants');
const { E } = require('../../utils/emojis');
const activite = require('../../utils/activite');
const { genererCarteServeur, COUL } = require('../../utils/carteInfos');
const logger = require('../../utils/logger');
const { traducteur, localisations, t: tr, DEFAUT } = require('../../utils/langues');

// Boosts necessaires pour chaque palier Discord.
const PALIERS = [2, 7, 14];

module.exports = {
  categorie: 'utilitaires',

  data: new SlashCommandBuilder()
    .setName('serverinfo')
    .setNameLocalizations({ fr: 'serveurinfo' })
    .setDescription(tr('serveurinfo.description_commande', DEFAUT))
    .setDescriptionLocalizations(localisations('serveurinfo.description_commande'))
    .setContexts(InteractionContextType.Guild),

  async execute(interaction) {
    const { t, nombre, existe, duree } = traducteur(interaction);
    const guild = interaction.guild;
    await interaction.deferReply();
    const salons = guild.channels.cache;
    const totalXp = req.totalMembresXp.get(guild.id).n;
    const cleVerif = `serveurinfo.verification.${guild.verificationLevel}`;
    const verif = existe(cleVerif) ? t(cleVerif) : t('serveurinfo.verification_inconnue');

    const semaine = activite.totaux(guild.id, 7, 0);
    const avant = activite.totaux(guild.id, 7, 7);
    const evo = activite.evolution(semaine.messages, avant.messages);
    const net = semaine.arrivees - semaine.departs;
    const textuels = salons.filter((c) => [ChannelType.GuildText, ChannelType.GuildAnnouncement, ChannelType.GuildForum].includes(c.type)).size;
    const vocaux = salons.filter((c) => [ChannelType.GuildVoice, ChannelType.GuildStageVoice].includes(c.type)).size;
    const boosts = guild.premiumSubscriptionCount ?? 0;
    const prochain = PALIERS[guild.premiumTier] ?? null;
    const precedent = PALIERS[guild.premiumTier - 1] ?? 0;

    const elements = [];
    const options = {};
    try {
      const png = await genererCarteServeur({
        nom: guild.name,
        sous: t('serveurinfo.carte_sous', { date: new Date(guild.createdTimestamp).toLocaleDateString(interaction.locale?.startsWith('fr') ? 'fr-FR' : 'en-GB', { day: 'numeric', month: 'long', year: 'numeric' }), age: duree(Date.now() - guild.createdTimestamp) }),
        ligne3: guild.description ? guild.description.slice(0, 120) : null,
        icone: guild.iconURL({ extension: 'png', size: 256 }),
        banniere: guild.bannerURL({ extension: 'png', size: 1024 }) ?? guild.splashURL({ extension: 'png', size: 1024 }),
        tuiles: [
          { intitule: t('serveurinfo.champ_membres'), valeur: nombre(guild.memberCount), complement: net ? t('serveurinfo.carte_net', { n: `${net > 0 ? '+' : ''}${nombre(net)}` }) : null, couleur: net >= 0 ? COUL.vert : COUL.rouge },
          { intitule: t('serveurinfo.carte_messages'), valeur: nombre(semaine.messages), complement: evo === null ? t('serveurinfo.carte_7j') : `${evo >= 0 ? '+' : ''}${evo} % · ${t('serveurinfo.carte_7j')}`, couleur: evo === null ? null : evo >= 0 ? COUL.vert : COUL.rouge },
          { intitule: t('serveurinfo.champ_salons'), valeur: nombre(textuels + vocaux), complement: t('serveurinfo.carte_salons', { t: textuels, v: vocaux }) },
          { intitule: t('serveurinfo.carte_roles'), valeur: nombre(guild.roles.cache.size - 1), complement: t('serveurinfo.carte_emojis', { n: guild.emojis.cache.size }) },
        ],
        boost: {
          libelle: t('serveurinfo.carte_boost', { niveau: guild.premiumTier }),
          droite: prochain ? t('serveurinfo.carte_boost_prochain', { n: boosts, max: prochain }) : t('serveurinfo.carte_boost_max', { n: boosts }),
          part: prochain ? (boosts - precedent) / (prochain - precedent) : 1,
        },
        activite: activite.serie(guild.id, 14).map((j) => j.messages),
        l: { activite: t('serveurinfo.carte_activite') },
      });
      options.files = [new AttachmentBuilder(png, { name: 'serveur.png' })];
      elements.push(C.image('attachment://serveur.png'));
    } catch (e) {
      logger.avertissement('Fiche serveur :', e.message);
      elements.push(C.texte(`## ${guild.name}`));
    }

    elements.push(C.texte([
      `👑 **${t('serveurinfo.champ_proprietaire')}** · <@${guild.ownerId}>`,
      `📅 **${t('serveurinfo.champ_cree_le')}** · ${ts(guild.createdTimestamp, 'D')} · ${ts(guild.createdTimestamp, 'R')}`,
      `🛡️ **${t('serveurinfo.champ_verification')}** · ${verif}`,
      `${E('niveaux')} **${t('serveurinfo.champ_membres_classes')}** · ${t('serveurinfo.valeur_membres_classes', { n: nombre(totalXp) })}`,
      `🆔 \`${guild.id}\``,
    ].join('\n')));

    return interaction.editReply(C.envoi([C.conteneur(elements, conf.couleurs.principale)], options));
  },
};
