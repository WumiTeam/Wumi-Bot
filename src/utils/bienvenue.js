/**
 * Le message de bienvenue (salon + MP), partage entre l'arrivee d'un membre
 * (events/guildMemberAdd.js) et le test de /welcome : ce que l'admin voit en
 * testant est EXACTEMENT ce que recevra le prochain arrivant.
 */
const { EmbedBuilder, AttachmentBuilder } = require('discord.js');
const conf = require('../../config');
const { config } = require('../database/db');
const { remplacerVariables } = require('./outils');
const { genererCarteBienvenue } = require('./carteBienvenue');
const logger = require('./logger');
const { E } = require('./emojis');
const { traducteur } = require('./langues');

/**
 * @param {import('discord.js').GuildMember} membre
 * @param {object} [options]
 * @param {import('discord.js').TextBasedChannel} [options.salon] forcer un salon (test)
 * @param {boolean} [options.mp=true] envoyer aussi le MP de bienvenue
 * @returns {Promise<{ salon: boolean, mp: boolean }>}
 */
/**
 * Les textes de la carte : ceux du design s'il en a, sinon ceux de Wumi.
 * Variables : {pseudo} {serveur} {membres} {numero}
 */
function textesCarte(membre, design) {
  const { t, langue } = traducteur(membre.guild);
  const n = membre.guild.memberCount;
  const numero = langue === 'fr' ? (n === 1 ? '1er' : `${n}e`) : `#${n}`;
  const remplir = (texte) => String(texte)
    .replaceAll('{pseudo}', membre.user.username)
    .replaceAll('{serveur}', membre.guild.name)
    .replaceAll('{membres}', String(n))
    .replaceAll('{numero}', numero);
  return {
    titre: remplir(design?.titre || t('bienvenue.carte_titre_defaut')),
    sous: remplir(design?.sous || t('bienvenue.carte_sous_defaut')),
  };
}

/** La carte d'un membre, avec un design precis ou celui du tirage. */
function carte(membre, design = undefined) {
  const cartes = require('./cartesBienvenue');
  const choisi = design === undefined ? cartes.choisir(membre.guild.id) : design;
  return genererCarteBienvenue({
    pseudo: membre.user.username,
    avatarUrl: membre.user.displayAvatarURL({ extension: 'png', size: 256 }),
    serveur: membre.guild.name,
    numeroMembre: membre.guild.memberCount,
    design: cartes.pourDessin(choisi),
    textes: textesCarte(membre, choisi),
  });
}

async function envoyerBienvenue(membre, { salon: salonForce = null, mp = true, design = undefined } = {}) {
  const cfg = config(membre.guild.id);
  const { t } = traducteur(membre.guild);
  const resultat = { salon: false, mp: false };

  if (mp && cfg.mp_bienvenue) {
    resultat.mp = Boolean(await membre
      .send({
        embeds: [
          new EmbedBuilder()
            .setColor(conf.couleurs.bienvenue)
            .setTitle(t('bienvenue.mp_titre', { serveur: membre.guild.name }))
            .setDescription(remplacerVariables(cfg.mp_bienvenue, { membre, guild: membre.guild })),
        ],
      })
      .catch(() => null));
  }

  const salon = salonForce ?? (cfg.salon_bienvenue ? membre.guild.channels.cache.get(cfg.salon_bienvenue) : null);
  if (!salon?.isTextBased()) return resultat;

  const texte = remplacerVariables(
    cfg.message_bienvenue || `${t('bienvenue.defaut')} ${E('fete')}`,
    { membre, guild: membre.guild }
  );
  const message = { content: texte };

  if (cfg.carte_bienvenue) {
    try {
      const png = await carte(membre, design);
      message.files = [new AttachmentBuilder(png, { name: 'bienvenue.png' })];
    } catch (e) {
      logger.avertissement('Carte de bienvenue non generee :', e.message);
    }
  }

  resultat.salon = Boolean(await salon.send(message).catch((e) => logger.avertissement('Message de bienvenue non envoye :', e.message)));
  return resultat;
}

module.exports = { envoyerBienvenue, carte, textesCarte };
