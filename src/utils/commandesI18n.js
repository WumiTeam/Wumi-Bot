/**
 * LES COMMANDES DANS LA LANGUE DE CHACUN (Wumi 2.24).
 *
 * Discord montre a chaque utilisateur le nom et la description d'une commande
 * dans SA langue, s'il y a une traduction pour elle ; sinon, le texte de base.
 *
 * Deux trous, avant la 2.24 :
 *   - les traductions anglaises n'etaient posees que pour `en-US`. Un client
 *     regle en anglais britannique (`en-GB`, tres courant en Europe) voyait
 *     tout en francais ;
 *   - le texte de base des descriptions etait le francais : un client en
 *     allemand, espagnol, portugais... voyait lui aussi du francais.
 *
 * Ce module passe sur le JSON des commandes juste avant l'envoi a Discord :
 *   - toute traduction `en-US` est recopiee en `en-GB` ;
 *   - les DESCRIPTIONS et les NOMS DE CHOIX prennent l'anglais comme base,
 *     et gardent le francais en traduction `fr`. Rien dans le code ne lit ces
 *     textes : les changer est sans risque.
 *   - les NOMS de commandes et d'options ne changent pas de base : le code les
 *     lit (`interaction.options.getUser('membre')`). Ils recoivent seulement
 *     le `en-GB`.
 */

function anglais(loc) {
  return loc?.['en-US'] ?? loc?.['en-GB'] ?? null;
}

/** Recopie en-US vers en-GB (et inversement) sans ecraser l'existant. */
function completer(loc) {
  if (!loc) return loc;
  const en = anglais(loc);
  if (!en) return loc;
  return { ...loc, 'en-US': loc['en-US'] ?? en, 'en-GB': loc['en-GB'] ?? en };
}

/** Met l'anglais en base d'un texte traduit, le francais en traduction. */
function baseAnglaise(objet, champ) {
  const cleLoc = `${champ}_localizations`;
  const loc = objet[cleLoc];
  const en = anglais(loc);
  if (!en || !objet[champ]) {
    if (loc) objet[cleLoc] = completer(loc);
    return;
  }
  const fr = loc.fr ?? objet[champ];
  objet[cleLoc] = completer({ ...loc, fr });
  objet[champ] = en;
}

// 2.31 : les noms de choix (menus des options) dans les autres langues.
// La table est indexee par le nom anglais : es, de, pt, it.
const CHOIX = require('./choixI18n.json');
const LOCALES_CHOIX = [['es-ES', 0], ['es-419', 0], ['de', 1], ['pt-BR', 2], ['it', 3]];
function traduireChoix(choix) {
  const tr = CHOIX[choix.name];
  if (!tr) return;
  const loc = { ...(choix.name_localizations ?? {}) };
  for (const [locale, i] of LOCALES_CHOIX) if (!loc[locale] && tr[i]) loc[locale] = tr[i].slice(0, 100);
  choix.name_localizations = loc;
}

function visiter(objet) {
  if (!objet || typeof objet !== 'object') return objet;
  if ('description' in objet) baseAnglaise(objet, 'description');
  if (objet.name_localizations) objet.name_localizations = completer(objet.name_localizations);
  for (const choix of objet.choices ?? []) {
    baseAnglaise(choix, 'name');
    traduireChoix(choix);
  }
  for (const option of objet.options ?? []) visiter(option);
  return objet;
}

/** Prepare une liste de commandes (JSON) : la modifie et la renvoie. */
// 2.35 : un emoji devant la description de chaque commande, pour qu'on les
// reconnaisse d'un coup d'oeil dans la liste « / » de Discord (Unicode
// seulement : Discord n'y affiche pas les emojis d'application).
const EMOJIS = {
  application: '📝', antinuke: '🛡️', antiraid: '🚨', audit: '🔍', automod: '🤖', autorole: '🎭', boost: '💎', counting: '🔢',
  config: '⚙️', setup: '🚀', reactionrole: '🎨', server: '📊', starboard: '⭐', structure: '🏗️', watch: '🔔', welcome: '👋',
  bank: '🏦', shop: '🛒', rob: '🦹', cards: '🎴', economy: '💰', missions: '🎯', item: '🎒', pay: '💸', invitations: '📨',
  wumirun: '🎮', appeal: '⚖️', ban: '🔨', clear: '🧹', voicemod: '🎙️', historique: '📂', kick: '👢', lock: '🔒', massban: '⛔',
  modstats: '📈', mute: '🔇', note: '🗒️', nickname: '✏️', raid: '🚧', role: '🏷️', sanctions: '📋', slowmode: '🐢', snipe: '🎯',
  softban: '🧽', unban: '🕊️', unmute: '🔊', blindtest: '🎧', musicgame: '🎮', review: '⭐', music: '🎶', play: '▶️', radio: '📻', badges: '🏅', card: '🖼️',
  leaderboard: '🏆', global: '🌍', messtats: '📊', tier: '🪜', prestige: '👑', profil: '🪪', rank: '📈', theme: '🎨', xp: '✨',
  wrapped: '🎁', suggestion: '💡', ticket: '🎫', aide: '❓', birthday: '🎂', botinfo: '🤖', privacy: '🔐', diagnostic: '🩺',
  docs: '📚', embed: '🧩', event: '📅', faq: '💬', giveaway: '🎉', invite: '➕', lfg: '🎮', christmas: '🎄', hangman: '🪢',
  pet: '🐾', ping: '🏓', premium: '💎', connect4: '🔴', quiz: '🧠', serverinfo: 'ℹ️', stats: '📊', tictactoe: '❌',
  userinfo: '👤', vote: '🗳️', voice: '🔉',
};
function decorer(c) {
  const e = EMOJIS[c.name];
  if (!e || (c.type ?? 1) !== 1) return;
  const avec = (d) => (d && !d.startsWith(e) ? `${e} ${d}`.slice(0, 100) : d);
  c.description = avec(c.description);
  if (c.description_localizations) {
    for (const [l, d] of Object.entries(c.description_localizations)) c.description_localizations[l] = avec(d);
  }
}

function preparer(commandes) {
  for (const c of commandes) { visiter(c); decorer(c); }
  return commandes;
}

module.exports = { preparer, visiter, completer };
