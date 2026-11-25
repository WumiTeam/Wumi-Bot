/**
 * L'annonce de MONTEE DE NIVEAU (Wumi 2.19), commune aux messages et au vocal.
 *
 * Le texte (mention, message personnalise du serveur, roles debloques) reste
 * au-dessus, pour que le membre soit notifie ; la carte image dessous montre
 * le passage de niveau, la progression vers le suivant, le rang et le bonus.
 * Si la carte echoue, on retombe sur l'ancien encadre.
 */
const { AttachmentBuilder, EmbedBuilder } = require('discord.js');
const conf = require('../../config');
const { infosNiveau, rangDe } = require('./niveaux');
const { genererCarteNiveau } = require('./carteNiveau');
const { traducteur } = require('./langues');
const { E } = require('./emojis');
const logger = require('./logger');

/**
 * @param {object} o
 *   guild, user, member, cfg, salonActuel (salon du message ou du vocal),
 *   niveauAvant, niveau, xpTotal, roles (Role[]), bonus (multiplicateur ou null),
 *   vocal (bool)
 */
async function annoncerNiveau(o) {
  const destination = o.cfg.salon_levelup ?? 'actuel';
  if (destination === 'off') return;
  const { t, nombre } = traducteur(o.guild);

  const mention = `<@${o.user.id}>`;
  const modele = o.vocal
    ? t('niveaux_carte.annonce_vocal')
    : o.cfg.message_levelup || '{mention} passe **niveau {niveau}** ! {emoji}';
  const texte =
    modele
      .replaceAll('{mention}', mention)
      .replaceAll('{pseudo}', o.user.username)
      .replaceAll('{niveau}', String(o.niveau))
      .replaceAll('{emoji}', E('niveaux')) +
    (o.roles.length ? `\n${t('niveaux_carte.roles_debloques', { roles: o.roles.map((r) => `<@&${r.id}>`).join(', ') })}` : '');

  const info = infosNiveau(o.xpTotal);
  let message;
  try {
    const png = await genererCarteNiveau({
      pseudo: o.member?.displayName ?? o.user.displayName ?? o.user.username,
      avatarUrl: (o.member ?? o.user).displayAvatarURL({ extension: 'png', size: 256 }),
      avant: o.niveauAvant,
      niveau: o.niveau,
      xpActuel: info.xpActuel,
      xpRequis: info.xpRequis,
      xpTotal: o.xpTotal,
      bonus: o.bonus,
      rang: (() => { try { return rangDe(o.guild.id, o.xpTotal); } catch { return null; } })(),
      roles: o.roles.map((r) => r.name),
      nombre,
      fond: (() => { try { return require('./fondsPerso').fondDe(o.guild.id, o.user.id); } catch { return null; } })(),
      theme: (() => { try { return require('./themesRank').themeDe(o.guild.id, o.user.id); } catch { return null; } })(),
      textes: {
        titre: t('niveaux_carte.carte_titre'),
        niveau: t('niveaux_carte.carte_niveau'),
        xp: t('niveaux_carte.carte_xp'),
        total: t('niveaux_carte.carte_total'),
        bonus: t('niveaux_carte.carte_bonus'),
        rang: t('niveaux_carte.carte_rang'),
        role: t('niveaux_carte.carte_role'),
      },
    });
    message = { content: texte, files: [new AttachmentBuilder(png, { name: 'niveau.png' })] };
  } catch (e) {
    logger.avertissement('Carte de niveau :', e.message);
    message = {
      embeds: [new EmbedBuilder().setColor(conf.couleurs.succes).setDescription(texte)
        .setThumbnail(o.user.displayAvatarURL({ size: 128 }))
        .setFooter({ text: `${info.xpTotal} XP` })],
    };
  }
  // Seul le membre est notifie : les roles cites ne pingent personne.
  message.allowedMentions = { users: [o.user.id] };

  try {
    if (destination === 'mp') {
      await o.user.send(message).catch(() => null);
    } else {
      const salon = destination === 'actuel' ? o.salonActuel : o.guild.channels.cache.get(destination) ?? o.salonActuel;
      if (salon?.isTextBased?.()) await salon.send(message);
    }
  } catch (e) {
    logger.avertissement('Annonce de niveau non envoyee :', e.message);
  }
}

module.exports = { annoncerNiveau };
