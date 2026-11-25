/**
 * Le recu d'une sanction (warn, mute, kick, ban), affiche au moderateur
 * (Wumi 2.21). Avant : une ligne de succes verte, identique pour tout. Ici :
 * couleur et pictogramme selon la gravite, avatar du membre, moderateur,
 * raison, duree et numero de dossier, sans mentionner personne.
 */
const C = require('./composants');
const { E } = require('./emojis');

const STYLES = {
  warn: { couleur: 0xf5a524, emoji: 'avertissement' },
  mute: { couleur: 0xf97316, emoji: 'muet' },
  kick: { couleur: 0xef5f3c, emoji: 'porte' },
  ban: { couleur: 0xe5484d, emoji: 'moderation' },
};

/**
 * @param {object} o  t, type, titre (deja traduit), cible (User), moderateur (User),
 *                    raison, duree (texte ou null), id, suite (texte facultatif)
 */
function recuSanction(o) {
  const s = STYLES[o.type] ?? STYLES.warn;
  const lignes = [
    `### ${E(s.emoji)} ${o.titre}`,
    `**${o.t('sanction.log_membre')}** · ${o.cible} \`${o.cible.tag}\``,
    `**${o.t('sanction.log_moderateur')}** · ${o.moderateur}`,
    `**${o.t('sanction.log_raison')}** · ${o.raison}`,
  ];
  if (o.duree) lignes.push(`**${o.t('sanction.log_duree')}** · ${o.duree}`);
  const blocs = [C.sectionVignette(lignes.join('\n'), o.cible.displayAvatarURL({ size: 128 }))];
  if (o.suite) blocs.push(C.texte(o.suite.trim()));
  blocs.push(C.separateur(), C.texte(`-# ${o.t('sanction.numero', { n: o.id })} · <t:${Math.floor(Date.now() / 1000)}:f>`));
  return C.envoi([C.conteneur(blocs, s.couleur)], { allowedMentions: { parse: [] } });
}

module.exports = { recuSanction, STYLES };
