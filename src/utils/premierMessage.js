/**
 * Accueil du tout premier message d'un membre.
 *
 * Le silence du premier message est ce qui fait repartir la plupart des
 * nouveaux : ils ecrivent une phrase, personne ne repond, ils s'en vont. Une
 * reaction du bot et un mot suffisent souvent a declencher la suite.
 *
 * On ne s'appuie pas sur le compteur de messages de la table xp : l'XP peut
 * etre coupee, un salon peut en etre exclu, et le membre passerait alors a
 * cote de son accueil. Une table dediee dit la verite dans tous les cas.
 */
const { req, config } = require('../database/db');
const { remplacerVariables } = require('./outils');
const logger = require('./logger');

// Un membre arrive, ecrit trois messages d'affilee : seul le premier compte,
// et on evite d'en accueillir deux si les messages partent en meme temps.
const enCours = new Set();

/** Le systeme est-il ouvert sur ce serveur ? */
function actif(guildId) {
  try {
    return Boolean(config(guildId).premier_actif);
  } catch {
    return false;
  }
}

/**
 * Traite un message : accueille si c'est le tout premier de son auteur.
 * @returns {Promise<boolean>} vrai si un accueil a ete fait
 */
async function traiter(message) {
  if (!message.guild || message.author.bot || message.system) return false;

  const guildId = message.guild.id;
  const cle = `${guildId}-${message.author.id}`;
  if (enCours.has(cle)) return false;

  // On note TOUJOURS le passage, meme systeme ferme : sinon, en l'activant
  // plus tard, tous les anciens membres seraient accueillis comme des neufs.
  let premier;
  try {
    premier = req.noterPremierMessage.run(guildId, message.author.id, Date.now()).changes > 0;
  } catch (e) {
    logger.debug('Premier message :', e.message);
    return false;
  }
  if (!premier || !actif(guildId)) return false;

  enCours.add(cle);
  try {
    const cfg = config(guildId);

    if (cfg.premier_reaction) {
      // Une reaction refusee (emoji d'un autre serveur, permission manquante)
      // ne doit pas empecher le message d'accueil.
      await message.react(cfg.premier_reaction).catch((e) => {
        logger.debug('Réaction de premier message :', e.message);
      });
    }

    if (cfg.premier_message) {
      const texte = remplacerVariables(cfg.premier_message, { membre: message.member, guild: message.guild });
      await message.reply({ content: texte, allowedMentions: { repliedUser: true } }).catch((e) => {
        logger.avertissement('Accueil du premier message :', e.message);
      });
    }

    logger.action('premier message', message.member?.displayName ?? message.author.username, message.channel?.name);
    return true;
  } finally {
    enCours.delete(cle);
  }
}

/** Marque tous les membres deja connus comme ayant deja parle. */
function amorcer(guild) {
  const maintenant = Date.now();
  let n = 0;
  for (const membre of guild.members.cache.values()) {
    if (membre.user.bot) continue;
    if (req.noterPremierMessage.run(guild.id, membre.id, maintenant).changes > 0) n++;
  }
  return n;
}

module.exports = { traiter, actif, amorcer };
