/**
 * Wumi 2.32 : detection des arnaques classiques de Discord, dans les six
 * langues du bot. Complement de l'anti-phishing (qui ne connait que des
 * domaines deja signales) : ici on reconnait la FORME du message.
 *
 *  - faux Nitro / faux cadeaux Steam avec un lien ;
 *  - « je t'ai signale par erreur, contacte ce staff » ;
 *  - faux airdrops / giveaways crypto ;
 *  - domaines qui imitent Discord ou Steam (dlscord, steamcommunlty...).
 *
 * Chaque indice rapporte des points ; au-dela de SEUIL, c'est une arnaque.
 * Volontairement prudent : il faut presque toujours un LIEN pour declencher,
 * une simple discussion sur le Nitro ne doit jamais etre supprimee.
 */
const SEUIL = 3;

const OFFICIELS = new Set([
  'discord.com', 'discord.gg', 'discordapp.com', 'discordapp.net', 'discord.media', 'discord.new', 'discord.gift',
  'discordstatus.com', 'dis.gd', 'steampowered.com', 'steamcommunity.com', 'store.steampowered.com',
  'help.steampowered.com', 'tenor.com', 'giphy.com', 'youtube.com', 'youtu.be', 'twitch.tv', 'x.com', 'twitter.com',
  'instagram.com', 'tiktok.com', 'reddit.com', 'github.com', 'wumi.fr',
]);

const REGEX_LIENS = /(?:https?:\/\/|www\.)[^\s<>()[\]]+/gi;

function normaliser(texte) {
  return String(texte ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function hote(lien) {
  try {
    return new URL(lien.startsWith('http') ? lien : `https://${lien}`).hostname.replace(/^www\./, '');
  } catch { return null; }
}

function officiel(h) {
  return [...OFFICIELS].some((d) => h === d || h.endsWith(`.${d}`));
}

/** Un domaine qui RESSEMBLE a Discord ou Steam sans en etre un. */
function imitation(h) {
  if (!h || officiel(h)) return false;
  const nu = h.replace(/[0]/g, 'o').replace(/[1l]/g, 'i').replace(/rn/g, 'm').replace(/[^a-z.]/g, '');
  return /d[i]s+c[o]?r+[dcl]|disc?ord|dicsord|discrod/.test(nu)
    || /st[e]?a+m(c|-)?o?m+u?n|steamcom|stearn|stemcom|steancommun/.test(nu)
    || /nitro|free-?gift|gift-?claim/.test(h);
}

const INDICES = [
  // Nitro / cadeaux gratuits
  [3, /(free|gratuit|gratis|kostenlos|gratuito|offert|regalo|geschenkt?)\W+(discord\W+)?nitro|nitro\W+(free|gratuit|gratis|kostenlos|gratuito|offert)/],
  [2, /nitro\W+(gift|cadeau|regalo|geschenk|presente)|(gift|cadeau|regalo|geschenk|presente)\W+nitro/],
  [2, /steam\W+(gift|cadeau|regalo|geschenk|presente|card|carte)|\$\s?50\W+steam|50\s?\$\W+steam/],
  [2, /(claim|recupere|reclama|hol dir|resgate|riscatta|reclame)\W+(it|ton|tu|deinen|seu|il tuo)?\W*(gift|cadeau|regalo|geschenk|presente|reward|recompense|nitro)/],
  // « signale par erreur »
  [3, /(accident(ally|ellement)?|par erreur|por error|versehentlich|sem querer|per errore|by mistake)\W+(\w+\W+){0,4}(report|signal|denunci|gemeldet|segnalat)/],
  [3, /(report|signal|denunci|gemeldet|segnalat)\w*\W+(\w+\W+){0,6}(accident(ally)?|par erreur|por error|versehentlich|sem querer|per errore|by mistake)/],
  [2, /(contact|contacte|contacta|kontaktier|contate|contatta)\w*\W+(\w+\W+){0,3}(staff|admin|moderat|support|trust\W*(and|&)\W*safety)/],
  // crypto
  [2, /(airdrop|giveaway|claim|double)\W+(\w+\W+){0,3}(btc|bitcoin|eth|ethereum|usdt|solana|sol|crypto|nft)/],
  [2, /(elon|musk|mrbeast)\W+(\w+\W+){0,4}(giveaway|airdrop|crypto|btc|nitro)/],
  // pression
  [1, /(only|seulement|solo|nur|apenas|solo)\W+(\d+|first|premiers?|primeros|ersten|primeiros|primi)\W+(\w+\W+){0,2}(users?|personnes|personas|leute|pessoas|persone|people)/],
  [1, /(hurry|vite|depeche|rapido|schnell|corre|presto)\b/],
];

/**
 * Analyse un message. Renvoie { score, raisons } ; arnaque si score >= SEUIL.
 */
function analyser(contenu, { mentionTous = false } = {}) {
  const texte = normaliser(contenu);
  const liens = String(contenu ?? '').match(REGEX_LIENS) ?? [];
  const hotes = liens.map(hote).filter(Boolean);
  let score = 0;
  const raisons = [];

  for (const [points, regex] of INDICES) {
    if (regex.test(texte)) { score += points; raisons.push(regex.source.slice(0, 30)); }
  }
  const faux = hotes.filter(imitation);
  if (faux.length) { score += 3; raisons.push(`imitation:${faux[0]}`); }

  const lienExterne = hotes.some((h) => !officiel(h));
  if (mentionTous && lienExterne) { score += 1; raisons.push('everyone+lien'); }

  // Sans lien externe (ni domaine imite), jamais plus que SEUIL - 1 : on ne
  // supprime pas une simple conversation qui parle de Nitro ou de report.
  // Exception : « signale par erreur » + « contacte le staff » (score >= 5),
  // l'arnaque classique qui n'a justement pas de lien.
  if (!lienExterne && !faux.length && !/(discord\.gg|discord\.com\/invite)\//.test(texte) && score < 5) {
    score = Math.min(score, SEUIL - 1);
  }
  return { score, raisons, arnaque: score >= SEUIL, domaine: faux[0] ?? hotes.find((h) => !officiel(h)) ?? null };
}

module.exports = { analyser, imitation, SEUIL };
