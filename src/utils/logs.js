const { PermissionsBitField, FileBuilder, MessageFlags } = require('discord.js');
const { config } = require('../database/db');
const logger = require('./logger');
const C = require('./composants');

const colonnes = {
  messages: 'log_messages',
  membres: 'log_membres',
  moderation: 'log_moderation',
  serveur: 'log_serveur',
  vocal: 'log_vocal',
};

/**
 * Convertit un embed (EmbedBuilder ou objet brut) en message Components V2.
 *
 * POURQUOI ICI ET PAS DANS CHAQUE FICHIER : plus de quarante endroits du bot
 * envoient des logs avec un embed. Les reecrire un par un, c'etait quarante
 * occasions de casser quelque chose. En convertissant a la sortie, tous les
 * logs passent en V2 d'un coup, avec la meme allure que le reste du bot.
 *
 * Les champs « inline » consecutifs sont regroupes sur une ligne, comme les
 * colonnes d'un embed ; les autres gardent leur titre au-dessus du texte.
 */
function versV2(embed, fichiers = [], contenu = null) {
  const e = typeof embed?.toJSON === 'function' ? embed.toJSON() : (embed ?? {});
  const blocs = [];

  const entete = [];
  if (e.author?.name) entete.push(e.title ? `-# ${e.author.name}` : `### ${e.author.name}`);
  if (e.title) entete.push(`### ${e.url ? `[${e.title}](${e.url})` : e.title}`);
  if (e.description) entete.push(e.description);
  const haut = entete.join('\n').slice(0, C.MAX_TEXTE);
  const vignette = e.thumbnail?.url ?? null;
  if (haut) blocs.push(vignette ? C.sectionVignette(haut, vignette) : C.texte(haut));

  // Champs : on regroupe les inline consecutifs.
  const lignes = [];
  let groupe = [];
  const viderGroupe = () => {
    if (groupe.length) lignes.push(groupe.map((f) => `**${f.name}** · ${f.value}`).join(' '));
    groupe = [];
  };
  for (const f of e.fields ?? []) {
    const court = String(f.value ?? '').length <= 60 && !String(f.value ?? '').includes('\n');
    if (f.inline && court) {
      groupe.push(f);
      if (groupe.length === 3) viderGroupe();
    } else {
      viderGroupe();
      lignes.push(`**${f.name}**\n${f.value}`);
    }
  }
  viderGroupe();
  if (lignes.length) {
    if (blocs.length) blocs.push(C.separateur());
    blocs.push(C.texte(lignes.join('\n').slice(0, C.MAX_TEXTE)));
  }

  if (e.image?.url) blocs.push(C.image(e.image.url));

  // En V2, une piece jointe ne s'affiche que si un composant la designe.
  for (const f of fichiers) {
    const nom = f?.name ?? f?.attachment?.name;
    if (nom) blocs.push(new FileBuilder().setURL(`attachment://${nom}`));
  }

  const pied = [];
  if (e.footer?.text && e.footer.text.trim()) pied.push(e.footer.text.trim());
  if (e.timestamp) pied.push(`<t:${Math.floor(new Date(e.timestamp).getTime() / 1000)}:f>`);
  if (pied.length) blocs.push(C.texte(`-# ${pied.join(' · ')}`.slice(0, 1000)));

  if (!blocs.length) blocs.push(C.texte('​'));
  const elements = [C.conteneur(blocs, e.color ?? undefined)];
  if (contenu) elements.unshift(C.texte(String(contenu).slice(0, 2000)));
  return elements;
}

/**
 * Envoie un log dans le salon correspondant a la categorie.
 * Ne fait rien si aucun salon n'est configure.
 *
 * `embed` reste un embed (ou un objet d'embed) pour tous les appelants : la
 * conversion en Components V2 se fait ici. Si Discord refuse le message V2
 * (cas tordu), on renvoie l'embed classique : un log ne doit jamais se perdre.
 */
async function envoyerLog(guild, categorie, embed, options = {}) {
  if (!guild) return;
  const colonne = colonnes[categorie];
  if (!colonne) return;

  let salonId;
  try {
    salonId = config(guild.id)[colonne];
  } catch (e) {
    logger.erreur('Lecture config logs :', e.message);
    return;
  }
  if (!salonId) return;

  const salon = guild.channels.cache.get(salonId) ?? (await guild.channels.fetch(salonId).catch(() => null));
  if (!salon || !salon.isTextBased()) return;

  const moi = guild.members.me;
  if (moi && !salon.permissionsFor(moi)?.has(PermissionsBitField.Flags.SendMessages)) return;

  const { content, files, components, ...reste } = options;
  try {
    await salon.send({
      ...reste,
      components: [...versV2(embed, files ?? [], content), ...(components ?? [])],
      files: files ?? [],
      flags: MessageFlags.IsComponentsV2,
      allowedMentions: reste.allowedMentions ?? { parse: [] },
    });
  } catch (e) {
    logger.debug(`Log V2 refuse (${categorie}), repli en embed :`, e.message);
    try {
      await salon.send({ embeds: [embed], ...options });
    } catch (e2) {
      logger.avertissement(`Log ${categorie} non envoye dans ${guild.name} :`, e2.message);
    }
  }
}

module.exports = { envoyerLog, versV2 };
