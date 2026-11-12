const { Events } = require('discord.js');
const journal = require('../utils/journal');
const conf = require('../../config');
const { config } = require('../database/db');
const { tronquer } = require('../utils/outils');
const automod = require('../utils/automod');
const { E } = require('../utils/emojis');
const capacites = require('../utils/capacites');

module.exports = {
  name: Events.MessageUpdate,
  async execute(avant, apres, client) {
    if (!apres.guild || apres.author?.bot) return;
    // Sans le contenu des messages, les deux textes sont vides : on ne peut
    // ni comparer, ni montrer quoi que ce soit d'utile. Et comme Discord
    // envoie aussi cet evenement quand un simple apercu de lien se charge,
    // journaliser quand meme remplirait le salon de logs vides.
    if (!capacites.contenuMessages()) {
      capacites.signalerUneFois('messageUpdate', 'Journal des messages modifies');
      return;
    }
    if (avant.content === apres.content) return; // embed charge, pas une edition
    require('../utils/snipe').noter('modifies', apres, { avant: avant.content });

    // Un message edite repasse par l'automod
    try {
      const cfg = config(apres.guild.id);
      if (await automod.traiter(apres, cfg, client)) return;
    } catch {
      /* ignore */
    }

    const { t } = journal.tj(apres.guild);
    await journal.fiche(apres.guild, 'messages', {
      titre: `${E('note')} ${t('journal.msg_modifie')}`,
      couleur: conf.couleurs.avertissement,
      vignette: apres.author?.displayAvatarURL({ size: 128 }),
      champs: [
        { nom: t('journal.auteur'), valeur: apres.author ? `${apres.author} \`${apres.author.id}\`` : t('journal.inconnu'), court: true },
        { nom: t('journal.salon'), valeur: `${apres.channel}`, court: true },
        { nom: t('journal.avant'), valeur: tronquer(avant.content || t('journal.non_cache')) },
        { nom: t('journal.apres'), valeur: tronquer(apres.content || t('journal.vide')) },
      ],
      liens: [{ label: t('journal.voir_message'), url: apres.url }],
    });
  },
};
