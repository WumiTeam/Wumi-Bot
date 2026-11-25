/**
 * Veille : surveille des comptes et des flux, et annonce les nouveautes.
 *
 * Quatre sources :
 *   twitch    : API officielle (identifiant + cle d'application, voir GUIDE-TWITCH.txt)
 *   instagram : API officielle de Meta (jeton obligatoire, voir GUIDE-INSTAGRAM.txt)
 *   youtube   : flux public de la chaine, aucune cle a demander
 *   rss       : n'importe quel flux RSS ou Atom
 *
 * Le bot interroge les sources toutes les N minutes ; aucune de ces plateformes
 * ne previent le bot toute seule, il faut aller regarder.
 *
 * Twitch a sa propre cadence, bien plus rapide que les autres : un direct
 * annonce dix minutes apres son debut ne sert plus a grand-chose.
 */
const { EmbedBuilder, AttachmentBuilder } = require('discord.js');
const conf = require('../../config');
const { req } = require('../database/db');
const logger = require('./logger');
const { E } = require('./emojis');

const V = conf.veille ?? {};
const JOUR = 86_400_000;
const DELAI_REQUETE = 15_000;

const TYPES = {
  twitch: { nom: 'Twitch', get emoji() { return E('twitch'); }, couleur: 0x9146ff },
  tiktok: { nom: 'TikTok', get emoji() { return E('tiktok'); }, couleur: 0xfe2c55 },
  instagram: { nom: 'Instagram', get emoji() { return E('instagram'); }, couleur: 0xd6249f },
  youtube: { nom: 'YouTube', get emoji() { return E('youtube'); }, couleur: 0xff0000 },
  rss: { nom: 'Flux RSS', get emoji() { return E('rss'); }, couleur: conf.couleurs.principale },
};

// ------------------------------------------------------------------ OUTILS
/** Recupere une adresse en texte, avec un delai maximum. */
async function texte(url, options = {}) {
  const reponse = await fetch(url, {
    ...options,
    signal: AbortSignal.timeout(DELAI_REQUETE),
    headers: { 'User-Agent': 'ZhaakBot/1.0 (veille Discord)', ...(options.headers || {}) },
  });
  const corps = await reponse.text();
  if (!reponse.ok) {
    // Les API renvoient souvent l'explication dans le corps : on la garde.
    throw new Error(`${reponse.status} ${corps.slice(0, 200)}`);
  }
  return corps;
}

/** Remplace les entites XML et HTML les plus courantes. */
function decoder(chaine = '') {
  return chaine
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .trim();
}

/** Contenu de la premiere balise <nom> trouvee dans un fragment. */
function balise(fragment, nom) {
  const m = fragment.match(new RegExp(`<${nom}(?:\\s[^>]*)?>([\\s\\S]*?)</${nom}>`, 'i'));
  return m ? decoder(m[1]) : null;
}

/** Valeur d'un attribut sur la premiere balise <nom ...> trouvee. */
function attribut(fragment, nom, attr) {
  const m = fragment.match(new RegExp(`<${nom}[^>]*\\s${attr}=["']([^"']+)["']`, 'i'));
  return m ? decoder(m[1]) : null;
}

/** Decoupe un document en blocs <item> (RSS) ou <entry> (Atom). */
function blocs(xml) {
  const items = [...xml.matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/gi)].map((m) => m[1]);
  if (items.length) return items;
  return [...xml.matchAll(/<entry(?:\s[^>]*)?>([\s\S]*?)<\/entry>/gi)].map((m) => m[1]);
}

/** Retire les balises HTML d'un resume de flux. */
function sansHtml(chaine = '') {
  return decoder(chaine.replace(/<[^>]+>/g, ' '))
    .replace(/\s{2,}/g, ' ')
    // Le remplacement des balises par une espace laisse " ." ou " ," : on recolle.
    .replace(/\s+([.,;:!?…])/g, '$1')
    .trim();
}

function couper(chaine, max) {
  if (!chaine) return null;
  return chaine.length > max ? `${chaine.slice(0, max - 1)}…` : chaine;
}

// ----------------------------------------------------------------- TWITCH
/**
 * Twitch ne fonctionne pas comme les autres sources : ce n'est pas un flux de
 * publications, c'est un ETAT. Ou la chaine est en direct, ou elle ne l'est
 * pas. On le fait entrer dans le meme moule en produisant, quand elle est en
 * direct, un seul « element » dont l'identifiant est celui du direct : deux
 * directs successifs ont deux identifiants differents, donc la deduplication
 * qui sert aux flux marche telle quelle.
 */
const TWITCH_JETON = 'https://id.twitch.tv/oauth2/token';
const TWITCH_API = 'https://api.twitch.tv/helix';

function clesTwitch() {
  const nettoyer = (v) => String(v ?? '').trim().replace(/^["']|["']$/g, '');
  const id = nettoyer(process.env.TWITCH_CLIENT_ID);
  const secret = nettoyer(process.env.TWITCH_CLIENT_SECRET);
  return id && secret ? { id, secret } : null;
}

/**
 * Jeton d'application Twitch, mis en cache jusqu'a son expiration.
 * Contrairement a Instagram, ce jeton ne represente personne : il identifie
 * l'application, pas un compte. On peut donc le redemander autant qu'on veut,
 * et il n'y a aucun compte a reconnecter quand il expire.
 */
async function jetonTwitch(forcer = false) {
  const cles = clesTwitch();
  if (!cles) {
    throw new Error(
      "identifiants Twitch absents : ajoute TWITCH_CLIENT_ID et TWITCH_CLIENT_SECRET dans le .env (voir GUIDE-TWITCH.txt)"
    );
  }

  if (!forcer) {
    const enBase = req.lireReglage.get('twitch_jeton');
    if (enBase?.valeur) {
      try {
        const { jeton, expire } = JSON.parse(enBase.valeur);
        // Cinq minutes de marge : un jeton qui expire pendant la requete
        // donnerait une erreur 401 pour rien.
        if (jeton && expire > Date.now() + 300_000) return jeton;
      } catch { /* cache illisible : on en redemande un */ }
    }
  }

  const corps = new URLSearchParams({
    client_id: cles.id,
    client_secret: cles.secret,
    grant_type: 'client_credentials',
  });
  const brut = await texte(TWITCH_JETON, {
    method: 'POST',
    body: corps,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });
  const donnees = JSON.parse(brut);
  if (!donnees.access_token) throw new Error('reponse Twitch sans access_token');

  req.ecrireReglage.run(
    'twitch_jeton',
    JSON.stringify({ jeton: donnees.access_token, expire: Date.now() + (donnees.expires_in ?? 3600) * 1000 }),
    Date.now()
  );
  return donnees.access_token;
}

/** Appel authentifie a l'API Twitch, avec UN seul reessai si le jeton est refuse. */
async function apiTwitch(chemin, reessai = true) {
  const cles = clesTwitch();
  const jeton = await jetonTwitch();
  try {
    const brut = await texte(`${TWITCH_API}${chemin}`, {
      headers: { 'Client-Id': cles.id, Authorization: `Bearer ${jeton}` },
    });
    return JSON.parse(brut);
  } catch (e) {
    // 401 : le jeton a ete revoque, ou il a expire plus tot que Twitch ne
    // l'annoncait. On en reprend un et on retente une fois — pas davantage,
    // sinon des identifiants faux feraient boucler le bot indefiniment.
    if (reessai && /\b401\b/.test(e.message)) {
      await jetonTwitch(true);
      return apiTwitch(chemin, false);
    }
    throw e;
  }
}

/** Accepte « pseudo », « @pseudo » ou l'adresse complete de la chaine. */
function pseudoTwitch(source) {
  const nettoye = String(source ?? '').trim().replace(/\/+$/, '');
  const dansUrl = nettoye.match(/twitch\.tv\/([A-Za-z0-9_]{3,25})/i);
  return (dansUrl ? dansUrl[1] : nettoye.replace(/^@/, '')).toLowerCase();
}

async function lireTwitch(source) {
  const pseudo = pseudoTwitch(source);
  if (!/^[a-z0-9_]{3,25}$/.test(pseudo)) {
    throw new Error(`pseudo Twitch invalide : "${source}" — donne le pseudo de la chaine, ou son adresse complete`);
  }

  const flux = await apiTwitch(`/streams?user_login=${encodeURIComponent(pseudo)}`);
  const direct = flux.data?.[0];
  // Hors ligne : aucun element. C'est un etat normal, pas une erreur.
  if (!direct) return [];

  // L'avatar et le nom affiche demandent un second appel, fait seulement quand
  // la chaine est en direct — donc quelques fois par semaine, pas toutes les
  // deux minutes.
  let avatar = null;
  let nom = direct.user_name || pseudo;
  try {
    const compte = await apiTwitch(`/users?login=${encodeURIComponent(pseudo)}`);
    if (compte.data?.[0]) {
      avatar = compte.data[0].profile_image_url || null;
      nom = compte.data[0].display_name || nom;
    }
  } catch { /* l'avatar est un confort, pas une condition */ }

  const vignette = String(direct.thumbnail_url || '')
    .replace('{width}', '1280')
    .replace('{height}', '720');
  const debut = Date.parse(direct.started_at) || Date.now();

  // 2.24 : le texte du direct est ecrit a l'annonce, dans la langue du serveur.
  return [{
    id: direct.id,
    titre: direct.title || null,
    jeu: direct.game_name || null,
    spectateurs: direct.viewer_count ?? 0,
    texte: null,
    lien: `https://www.twitch.tv/${pseudo}`,
    // Twitch sert toujours la vignette a la meme adresse : sans ce parametre,
    // Discord reafficherait l'image mise en cache lors du direct precedent.
    image: vignette ? `${vignette}?t=${debut}` : null,
    date: debut,
    auteur: nom,
    avatar,
    direct: true,
  }];
}

// -------------------------------------------------------------- INSTAGRAM
/**
 * Jeton courant : celui renouvele en base s'il existe, sinon celui du .env.
 * Le jeton du .env ne sert donc que d'amorce.
 */
function jetonInstagram() {
  // On nettoie systematiquement : un espace ou un retour a la ligne colle par
  // megarde dans le .env suffit a rendre le jeton illisible pour Meta.
  const nettoyer = (v) => String(v ?? '').trim().replace(/^["']|["']$/g, '');

  const enBase = req.lireReglage.get('instagram_jeton');
  if (enBase?.valeur) return { jeton: nettoyer(enBase.valeur), depuis: enBase.maj ?? 0, source: 'base' };
  const env = nettoyer(process.env.INSTAGRAM_TOKEN);
  return env ? { jeton: env, depuis: 0, source: 'env' } : null;
}

/**
 * Verifie la forme du jeton avant d'appeler Meta.
 * Renvoie un message d'explication, ou null si tout va bien.
 * Cela evite l'erreur "Cannot parse access token", incomprehensible pour qui
 * ne sait pas qu'elle veut simplement dire "cette chaine n'est pas un jeton".
 */
function verifierFormeJeton(jeton) {
  if (/\s/.test(jeton)) {
    return "le jeton contient un espace ou un retour a la ligne : il doit tenir sur UNE seule ligne dans le .env, sans espace autour du signe =";
  }
  if (jeton.includes('…') || jeton.includes('...')) {
    return "le jeton contient des points de suspension : il a ete copie tronque depuis l'affichage de Meta, il faut le recopier en entier";
  }
  if (jeton.length < 50) {
    return `le jeton ne fait que ${jeton.length} caracteres, c'est beaucoup trop court (un vrai jeton en fait plus de 100). Verifie que tu n'as pas colle l'identifiant ou la cle secrete de l'application a la place`;
  }
  return null;
}

/** Etat lisible du jeton, pour /veille jeton et le panneau. */
function etatJeton() {
  const actuel = jetonInstagram();
  if (!actuel) return { present: false };
  const age = actuel.depuis ? Date.now() - actuel.depuis : null;
  return {
    present: true,
    source: actuel.source,
    renouveleLe: actuel.depuis || null,
    // Un jeton Instagram vit 60 jours a partir de son dernier renouvellement.
    expireLe: actuel.depuis ? actuel.depuis + 60 * JOUR : null,
    joursRestants: actuel.depuis ? Math.floor((actuel.depuis + 60 * JOUR - Date.now()) / JOUR) : null,
    ageJours: age === null ? null : Math.floor(age / JOUR),
  };
}

/**
 * Renouvelle le jeton s'il approche de sa fin de vie.
 * Meta exige que le jeton ait plus de 24 h et moins de 60 jours : on s'y prend
 * bien avant, sinon une panne de quelques jours suffirait a tout casser.
 */
async function renouvelerJeton(forcer = false) {
  const actuel = jetonInstagram();
  if (!actuel) return { ok: false, raison: 'aucun jeton' };

  const age = actuel.depuis ? Date.now() - actuel.depuis : Infinity;
  if (!forcer && age < 40 * JOUR) return { ok: true, inutile: true };

  try {
    const reponse = await texte(
      `https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=${encodeURIComponent(actuel.jeton)}`
    );
    const donnees = JSON.parse(reponse);
    if (!donnees.access_token) throw new Error('reponse sans access_token');
    req.ecrireReglage.run('instagram_jeton', donnees.access_token, Date.now());
    logger.succes('Jeton Instagram renouvele pour 60 jours.');
    return { ok: true, expiresIn: donnees.expires_in };
  } catch (e) {
    logger.avertissement('Renouvellement du jeton Instagram :', e.message);
    return { ok: false, raison: e.message };
  }
}

/**
 * Resume du jeton lu, sans le divulguer : de quoi comprendre d'ou vient
 * l'erreur (jeton tronque, mauvaise valeur collee...) sans exposer le secret.
 */
function indiceJeton(jeton) {
  return `(jeton lu : ${jeton.length} caracteres, commence par "${jeton.slice(0, 4)}" et finit par "${jeton.slice(-4)}")`;
}

/** Derniers posts du compte associe au jeton. */
// ------------------------------------------------ INSTAGRAM PAR PSEUDO (2.26)
/**
 * « Business Discovery » de l'API Graph de Meta : avec UN compte Instagram
 * professionnel (celui de Wumi, relie a une Page Facebook), on lit les posts
 * PUBLICS de n'importe quel autre compte professionnel (Createur ou
 * Entreprise), a partir de son @pseudo. Rien a faire pour les serveurs.
 *
 * .env :
 *   INSTAGRAM_FB_TOKEN  jeton de Page Facebook (n'expire pas), droits
 *                       instagram_basic + pages_read_engagement
 *   INSTAGRAM_FB_ID     (facultatif) id du compte Instagram pro lie a la Page ;
 *                       retrouve tout seul a partir du jeton sinon
 * Voir GUIDE-INSTAGRAM.txt, partie « Suivre n'importe quel compte ».
 */
const GRAPH = 'https://graph.facebook.com/v21.0';
const nettoyer = (v) => String(v ?? '').trim().replace(/^["']|["']$/g, '');
let idDecouverte = null;

function decouverteDisponible() {
  return Boolean(nettoyer(process.env.INSTAGRAM_FB_TOKEN));
}

/** Le @pseudo d'un compte, a partir d'un pseudo ou d'une adresse instagram.com. */
function pseudoInstagram(source) {
  const s = String(source ?? '').trim();
  const url = s.match(/instagram\.com\/([A-Za-z0-9._]{1,30})/i);
  return (url ? url[1] : s.replace(/^@/, '')).toLowerCase();
}

async function graph(chemin) {
  const jeton = nettoyer(process.env.INSTAGRAM_FB_TOKEN);
  const sep = chemin.includes('?') ? '&' : '?';
  const r = await fetch(`${GRAPH}${chemin}${sep}access_token=${encodeURIComponent(jeton)}`, {
    signal: AbortSignal.timeout(DELAI_REQUETE),
  });
  // Meta met le detail d'une erreur dans le corps JSON, quel que soit le statut.
  let d;
  try {
    d = await r.json();
  } catch {
    throw new Error(`Meta : reponse illisible (${r.status})`);
  }
  if (d.error) {
    const err = new Error(d.error.error_user_msg || d.error.message || 'erreur Meta');
    err.code = d.error.code;
    err.sousCode = d.error.error_subcode;
    throw err;
  }
  return d;
}

/** L'id du compte Instagram pro de Wumi (celui qui « regarde »). */
async function compteDecouverte() {
  if (idDecouverte) return idDecouverte;
  const env = nettoyer(process.env.INSTAGRAM_FB_ID);
  if (env) return (idDecouverte = env);
  // Jeton de Page : la Page elle-meme. Jeton utilisateur : ses Pages.
  const moi = await graph('/me?fields=instagram_business_account');
  if (moi.instagram_business_account?.id) return (idDecouverte = moi.instagram_business_account.id);
  const pages = await graph('/me/accounts?fields=instagram_business_account&limit=50');
  const trouve = (pages.data ?? []).find((p) => p.instagram_business_account?.id);
  if (!trouve) throw new Error("aucun compte Instagram professionnel relie a la Page du jeton INSTAGRAM_FB_TOKEN");
  return (idDecouverte = trouve.instagram_business_account.id);
}

async function lireInstagramPseudo(source) {
  const pseudo = pseudoInstagram(source);
  if (!/^[a-z0-9._]{1,30}$/.test(pseudo)) throw new Error(`pseudo Instagram invalide : "${source}"`);
  const id = await compteDecouverte();
  const champs = `business_discovery.username(${pseudo}){username,name,media.limit(6){id,caption,media_type,media_url,permalink,thumbnail_url,timestamp}}`;
  let d;
  try {
    d = await graph(`/${id}?fields=${encodeURIComponent(champs)}`);
  } catch (e) {
    // 110 / 2207013 : compte introuvable, prive, ou pas professionnel.
    if (e.code === 110 || e.sousCode === 2207013 || /cannot be found|not.*business|invalid user/i.test(e.message)) {
      throw new Error(`compte Instagram « ${pseudo} » introuvable ou non professionnel : seuls les comptes Createur ou Entreprise publics peuvent etre suivis`);
    }
    throw new Error(`Instagram : ${e.message}`);
  }
  const bd = d.business_discovery ?? {};
  return (bd.media?.data ?? []).map((m) => ({
    id: m.id,
    titre: m.media_type === 'VIDEO' ? 'Nouvelle vidéo Instagram' : 'Nouveau post Instagram',
    texte: sansHtml(m.caption ?? ''),
    lien: m.permalink,
    // Business Discovery ne donne pas toujours media_url pour les videos.
    image: m.media_type === 'VIDEO' ? (m.thumbnail_url ?? null) : (m.media_url ?? null),
    date: m.timestamp ? Date.parse(m.timestamp) : Date.now(),
    auteur: bd.name || bd.username || pseudo,
  }));
}

async function lireInstagram() {
  const actuel = jetonInstagram();
  if (!actuel) throw new Error("aucun jeton Instagram : ajoute INSTAGRAM_TOKEN dans le .env (voir GUIDE-INSTAGRAM.txt)");

  const probleme = verifierFormeJeton(actuel.jeton);
  if (probleme) throw new Error(`jeton Instagram invalide : ${probleme}`);

  const champs = 'id,caption,media_type,media_url,permalink,thumbnail_url,timestamp';
  let brut;
  try {
    brut = await texte(
      `https://graph.instagram.com/me/media?fields=${champs}&limit=5&access_token=${encodeURIComponent(actuel.jeton)}`
    );
  } catch (e) {
    throw new Error(`${e.message}\n${indiceJeton(actuel.jeton)}`);
  }
  const donnees = JSON.parse(brut);
  if (donnees.error) throw new Error(`${donnees.error.message ?? 'erreur Instagram'}\n${indiceJeton(actuel.jeton)}`);

  return (donnees.data ?? []).map((m) => ({
    id: m.id,
    titre: m.media_type === 'VIDEO' ? 'Nouvelle vidéo Instagram' : 'Nouveau post Instagram',
    texte: sansHtml(m.caption ?? ''),
    lien: m.permalink,
    // Une video n'a pas d'image directe : Instagram fournit une vignette a part.
    image: m.media_type === 'VIDEO' ? (m.thumbnail_url ?? null) : (m.media_url ?? null),
    date: m.timestamp ? Date.parse(m.timestamp) : Date.now(),
  }));
}

// ---------------------------------------------------------------- YOUTUBE
/** Extrait l'identifiant de chaine d'une adresse ou d'un identifiant deja pret. */
async function identifiantYoutube(source) {
  const nettoye = source.trim();
  if (/^UC[\w-]{20,}$/.test(nettoye)) return nettoye;

  const dansUrl = nettoye.match(/channel\/(UC[\w-]{20,})/);
  if (dansUrl) return dansUrl[1];

  // Pour une adresse en @pseudo ou /c/, l'identifiant se lit dans la page.
  const url = nettoye.startsWith('http')
    ? nettoye
    : `https://www.youtube.com/${nettoye.startsWith('@') ? nettoye : `@${nettoye}`}`;
  const page = await texte(url);
  const trouve = page.match(/"channelId":"(UC[\w-]{20,})"/) ?? page.match(/channel\/(UC[\w-]{20,})/);
  if (!trouve) throw new Error("identifiant de chaine introuvable — utilise l'identifiant qui commence par UC");
  return trouve[1];
}

async function lireYoutube(source) {
  const id = await identifiantYoutube(source);
  const xml = await texte(`https://www.youtube.com/feeds/videos.xml?channel_id=${id}`);
  return blocs(xml).map((e) => ({
    id: balise(e, 'yt:videoId') ?? balise(e, 'id'),
    titre: balise(e, 'title'),
    texte: couper(sansHtml(balise(e, 'media:description') ?? ''), 300),
    lien: attribut(e, 'link', 'href'),
    image: attribut(e, 'media:thumbnail', 'url'),
    date: Date.parse(balise(e, 'published') ?? balise(e, 'updated') ?? '') || Date.now(),
    auteur: balise(e, 'name'),
  }));
}

// ----------------------------------------------------------------- TIKTOK
/**
 * TikTok, la source fragile — et il faut le dire franchement.
 *
 * Il n'existe aucune API publique qui previenne des nouvelles videos. L'API
 * officielle sert a publier et a lire ses propres videos apres une connexion
 * du createur ; elle n'offre pas de notification de publication. La seule voie
 * praticable est une PASSERELLE qui transforme le profil en flux RSS.
 *
 * Ces passerelles sont tenues par des benevoles, se font bloquer par TikTok,
 * changent d'adresse et tombent. On ne peut donc pas en coder une en dur et
 * esperer que ca dure : l'adresse est un reglage (config.veille.passerelleTikTok
 * ou TIKTOK_PASSERELLE dans le .env). Quand l'une meurt, on change une ligne
 * et les sources deja enregistrees continuent de fonctionner.
 *
 * Une fois le flux obtenu, c'est du RSS ordinaire : on reutilise le lecteur.
 */
function pseudoTikTok(source) {
  const nettoye = String(source ?? '').trim().replace(/\/+$/, '');
  const dansUrl = nettoye.match(/tiktok\.com\/@([A-Za-z0-9._]{1,30})/i);
  return (dansUrl ? dansUrl[1] : nettoye.replace(/^@/, '')).toLowerCase();
}

function passerelleTikTok(pseudo) {
  const modele = String(process.env.TIKTOK_PASSERELLE || V.passerelleTikTok || '').trim();
  if (!modele) throw new Error("aucune passerelle TikTok configuree (config.veille.passerelleTikTok)");
  if (!modele.includes('{pseudo}')) throw new Error("la passerelle TikTok doit contenir {pseudo}");
  return modele.replace('{pseudo}', encodeURIComponent(pseudo));
}

async function lireTiktok(source) {
  const pseudo = pseudoTikTok(source);
  if (!/^[a-z0-9._]{1,30}$/.test(pseudo)) {
    throw new Error(`pseudo TikTok invalide : "${source}" — donne le pseudo, ou l'adresse complete du profil`);
  }

  const url = passerelleTikTok(pseudo);
  let elements;
  try {
    elements = await lireRss(url);
  } catch (e) {
    // On nomme la passerelle dans l'erreur : c'est presque toujours elle qui
    // est en cause, pas le pseudo, et c'est elle qu'il faudra remplacer.
    throw new Error(`passerelle TikTok injoignable (${url}) : ${e.message}`);
  }

  return elements.map((e) => ({
    ...e,
    titre: e.titre && e.titre !== 'Nouveauté' ? e.titre : 'Nouvelle vidéo TikTok',
    lien: e.lien || `https://www.tiktok.com/@${pseudo}`,
    auteur: `@${pseudo}`,
  }));
}

// -------------------------------------------------------------------- RSS
async function lireRss(source) {
  const xml = await texte(source);
  return blocs(xml).map((e) => {
    const lien = balise(e, 'link') || attribut(e, 'link', 'href');
    return {
      id: balise(e, 'guid') ?? balise(e, 'id') ?? lien,
      titre: balise(e, 'title') ?? 'Nouveauté',
      texte: couper(sansHtml(balise(e, 'description') ?? balise(e, 'summary') ?? balise(e, 'content') ?? ''), 400),
      lien,
      image: attribut(e, 'enclosure', 'url') ?? attribut(e, 'media:content', 'url') ?? attribut(e, 'media:thumbnail', 'url'),
      date: Date.parse(balise(e, 'pubDate') ?? balise(e, 'published') ?? balise(e, 'updated') ?? '') || Date.now(),
    };
  });
}

/** Lit une source, quel que soit son type. Renvoie du plus recent au plus ancien. */
async function lire(type, source) {
  let elements;
  if (type === 'twitch') elements = await lireTwitch(source);
  else if (type === 'tiktok') elements = await lireTiktok(source);
  else if (type === 'instagram') {
    // Une source avec un @pseudo : Business Discovery. Sans pseudo (anciennes
    // sources « compte du jeton ») : le compte lie a INSTAGRAM_TOKEN.
    const pseudo = source && source !== 'compte du jeton' ? source : null;
    elements = pseudo ? await lireInstagramPseudo(pseudo) : await lireInstagram();
  }
  else if (type === 'youtube') elements = await lireYoutube(source);
  else if (type === 'rss') elements = await lireRss(source);
  else throw new Error(`type inconnu : ${type}`);

  return elements.filter((e) => e && e.id && e.lien).sort((a, b) => b.date - a.date);
}

/**
 * Verifie qu'une source est utilisable, AVANT de l'enregistrer.
 *
 * Pour un flux, « utilisable » veut dire « on arrive a en lire au moins une
 * entree ». Pour Twitch, surtout pas : une chaine hors ligne ne renvoie rien,
 * et c'est l'etat dans lequel elle passe la plus grande partie du temps. On
 * verifie donc que la CHAINE existe, pas qu'elle diffuse.
 *
 * @returns {{nom: string|null, enDirect: boolean, elements: object[]}}
 */
async function verifierSource(type, source) {
  if (type === 'twitch') {
    const pseudo = pseudoTwitch(source);
    if (!/^[a-z0-9_]{3,25}$/.test(pseudo)) {
      throw new Error(`pseudo Twitch invalide : "${source}" — donne le pseudo de la chaine, ou son adresse complete`);
    }
    const compte = await apiTwitch(`/users?login=${encodeURIComponent(pseudo)}`);
    const info = compte.data?.[0];
    if (!info) throw new Error(`chaine Twitch introuvable : "${pseudo}"`);
    const elements = await lireTwitch(pseudo);
    return { nom: info.display_name || pseudo, enDirect: elements.length > 0, elements };
  }

  const elements = await lire(type, source);
  if (!elements.length) {
    if (type === 'tiktok') {
      throw new Error(
        'la passerelle TikTok a repondu, mais sans aucune video. Soit le compte est vide ou prive, '
        + 'soit la passerelle ne fonctionne plus — dans ce cas change config.veille.passerelleTikTok'
      );
    }
    throw new Error('source lisible mais vide');
  }
  return { nom: elements[0].auteur ?? null, enDirect: false, elements };
}

// ------------------------------------------------------------- ANNONCES
// Titres par defaut des lecteurs (francais) -> cle traduite a l'annonce.
const TITRES_DEFAUT = {
  'Nouvelle vidéo Instagram': 'veille.u.insta_video',
  'Nouveau post Instagram': 'veille.u.insta_post',
  'Nouvelle vidéo TikTok': 'veille.u.tiktok_video',
  'Nouveauté': 'veille.u.nouveaute',
};

/**
 * 2.40 : la carte image de l'alerte (src/utils/carteAlerte.js). Renvoie
 * { fichier, nom } ou null si le dessin echoue : l'annonce part alors avec
 * l'embed d'avant, sans carte.
 */
async function construireCarte(veille, element) {
  try {
    const { t } = require('./langues').traducteur(veille.guild_id);
    const meta = TYPES[veille.type] ?? TYPES.rss;
    const nom = veille.nom || element.auteur || meta.nom;
    let titre = element.titre;
    if (TITRES_DEFAUT[titre]) titre = t(TITRES_DEFAUT[titre]);
    const pastille = element.direct ? t('veille.u.pastille_direct')
      : (veille.type === 'youtube' || veille.type === 'tiktok' || element.titre === 'Nouvelle vidéo Instagram') ? t('veille.u.pastille_video')
        : veille.type === 'instagram' ? t('veille.u.pastille_post') : t('veille.u.pastille_nouveau');
    let infos = null;
    if (element.spectateurs !== undefined) {
      infos = [element.jeu, t('veille.u.spectateurs', { n: element.spectateurs })].filter(Boolean).join(' · ');
    }
    const png = await require('./carteAlerte').genererCarteAlerte({
      type: veille.type, pastille, nom, plateforme: meta.nom, titre: titre || null, infos,
      image: element.image, avatar: element.avatar, direct: Boolean(element.direct),
    });
    return { fichier: new AttachmentBuilder(png, { name: 'wumi-alerte.png' }), nom: 'wumi-alerte.png' };
  } catch (e) {
    logger.avertissement('Carte d\'alerte impossible :', e.message);
    return null;
  }
}

function construireEmbed(veille, element) {
  const meta = TYPES[veille.type] ?? TYPES.rss;
  const nom = veille.nom || element.auteur || meta.nom;
  const { t } = require('./langues').traducteur(veille.guild_id);
  let titre = element.titre;
  if (TITRES_DEFAUT[titre]) titre = t(TITRES_DEFAUT[titre]);
  if (!titre && element.direct) titre = t('veille.u.en_direct', { nom });
  let texte = element.texte;
  if (element.spectateurs !== undefined) {
    texte = [element.jeu ? `**${element.jeu}**` : null, t('veille.u.spectateurs', { n: element.spectateurs })].filter(Boolean).join(' · ');
  }

  // Pour un direct, la ligne d'auteur porte l'information principale : c'est
  // elle qu'on lit en premier dans une notification.
  const auteur = { name: element.direct ? `${meta.emoji} ${t('veille.u.en_direct_auteur', { nom })}` : `${meta.emoji} ${nom}` };
  if (element.avatar) auteur.iconURL = element.avatar;
  if (element.direct && element.lien) auteur.url = element.lien;

  const embed = new EmbedBuilder()
    .setColor(meta.couleur)
    .setAuthor(auteur)
    .setTitle(couper(titre || meta.nom, 250))
    .setURL(element.lien)
    .setTimestamp(element.date);

  if (texte) embed.setDescription(couper(texte, 600));
  if (element.image) embed.setImage(element.image);
  return embed;
}

/**
 * Verifie une source et annonce ce qui est nouveau.
 * Au tout premier passage on n'annonce rien : on note seulement ou on en est,
 * sinon ajouter un compte deverserait tout son historique dans le salon.
 */
async function verifierUne(client, veille) {
  const guild = client.guilds.cache.get(veille.guild_id);
  if (!guild) return { ignore: 'serveur introuvable' };

  const salon = guild.channels.cache.get(veille.salon_id);
  if (!salon?.isTextBased()) {
    req.erreurVeille.run({ id: veille.id, erreur: 'salon introuvable' });
    return { ignore: 'salon introuvable' };
  }

  let elements;
  try {
    elements = await lire(veille.type, veille.source);
  } catch (e) {
    req.erreurVeille.run({ id: veille.id, erreur: e.message.slice(0, 300) });
    logger.avertissement(`Veille #${veille.id} (${veille.type}) :`, e.message);
    return { erreur: e.message };
  }

  if (!elements.length) {
    // Pour Twitch, « aucun element » veut dire « hors ligne », pas « flux
    // vide ». Si on laissait la source non initialisee, elle resterait en
    // premier passage, et le premier direct serait avale par la garde
    // ci-dessous au lieu d'etre annonce. On la marque donc comme initialisee
    // des maintenant. Les autres types n'ont pas ce probleme : un flux vide y
    // est anormal et passager, et les initialiser a vide ferait deverser tout
    // l'historique au passage suivant.
    if (veille.type === 'twitch' && !veille.dernier && !veille.derniere_date) {
      req.majVeille.run({ id: veille.id, dernier: 'hors-ligne', derniere_date: 0 });
    }
    return { rien: true };
  }

  const premierPassage = !veille.dernier && !veille.derniere_date;
  if (premierPassage) {
    req.majVeille.run({ id: veille.id, dernier: elements[0].id, derniere_date: elements[0].date });
    return { initialise: elements[0].titre };
  }

  const nouveaux = elements
    .filter((e) => e.id !== veille.dernier && e.date > (veille.derniere_date ?? 0))
    .slice(0, V.maxParPassage ?? 3)
    .reverse(); // du plus ancien au plus recent, pour un ordre de lecture normal

  if (!nouveaux.length) {
    req.majVeille.run({ id: veille.id, dernier: elements[0].id, derniere_date: elements[0].date });
    return { rien: true };
  }

  for (const element of nouveaux) {
    const contenu = [veille.role_id ? `<@&${veille.role_id}>` : null, veille.message || null]
      .filter(Boolean)
      .join(' ');
    try {
      const embed = construireEmbed(veille, element);
      // La carte remplace la vignette brute ; le couleur du filet suit Wumi.
      const carte = await construireCarte(veille, element);
      if (carte) embed.setImage(`attachment://${carte.nom}`).setColor(conf.couleurs.principale);
      await salon.send({
        content: contenu || undefined,
        embeds: [embed],
        files: carte ? [carte.fichier] : [],
        allowedMentions: { roles: veille.role_id ? [veille.role_id] : [] },
      });
    } catch (e) {
      req.erreurVeille.run({ id: veille.id, erreur: `envoi impossible : ${e.message}`.slice(0, 300) });
      logger.avertissement(`Veille #${veille.id} : envoi impossible :`, e.message);
      return { erreur: e.message };
    }
  }

  req.majVeille.run({ id: veille.id, dernier: elements[0].id, derniere_date: elements[0].date });
  return { annonces: nouveaux.length };
}

/**
 * Passe en revue les sources actives.
 * @param {object} options { seulement: 'twitch' } ou { sauf: 'twitch' } — les
 *   directs tournent sur leur propre horloge, bien plus rapide.
 */
async function verifierTout(client, options = {}) {
  let sources = req.veillesActives.all();
  // 2.25.4 : TikTok est en pause (la passerelle publique bloque les bots, voir
  // lireTiktok). Les sources TikTok deja creees restent en base, mais on ne les
  // interroge plus : elles repartiront toutes seules si TIKTOK_PASSERELLE pointe
  // un jour vers notre propre RSSHub.
  if (!process.env.TIKTOK_ACTIF) sources = sources.filter((v) => v.type !== 'tiktok');
  if (options.seulement) sources = sources.filter((s) => s.type === options.seulement);
  if (options.sauf) sources = sources.filter((s) => s.type !== options.sauf);
  if (!sources.length) return;

  // Le jeton se renouvelle avant la lecture : inutile de tenter les requetes
  // Instagram avec un jeton qui vient d'expirer.
  if (sources.some((s) => s.type === 'instagram')) await renouvelerJeton().catch(() => null);

  for (const veille of sources) {
    try {
      await verifierUne(client, veille);
    } catch (e) {
      logger.erreur(`Veille #${veille.id} :`, e.message);
    }
    // Un petit ecart entre deux sources evite de cogner les serveurs distants.
    await new Promise((r) => setTimeout(r, 1200));
  }
}

/**
 * Lance les boucles de surveillance : une lente pour les publications, une
 * rapide pour les directs Twitch. Les separer evite de cogner l'API Instagram
 * toutes les deux minutes juste pour savoir si quelqu'un a lance un stream.
 */
function demarrer(client) {
  const minutes = Math.max(5, V.intervalleMinutes ?? 10);
  const minutesTwitch = Math.max(1, V.intervalleTwitchMinutes ?? 2);

  const tourner = () => verifierTout(client, { sauf: 'twitch' }).catch((e) => logger.erreur('Veille :', e.message));
  const tournerTwitch = () => verifierTout(client, { seulement: 'twitch' }).catch((e) => logger.erreur('Veille Twitch :', e.message));

  // Premiers passages decales : le bot finit d'abord son demarrage, et les
  // deux boucles ne partent pas en meme temps.
  setTimeout(tourner, 60_000).unref();
  setTimeout(tournerTwitch, 20_000).unref();

  return [
    setInterval(tourner, minutes * 60_000),
    setInterval(tournerTwitch, minutesTwitch * 60_000),
  ];
}

module.exports = {
  decouverteDisponible,
  pseudoInstagram,
  TYPES,
  verifierFormeJeton,
  lire,
  verifierUne,
  verifierTout,
  demarrer,
  etatJeton,
  renouvelerJeton,
  identifiantYoutube,
  construireEmbed,
  construireCarte,
  clesTwitch,
  jetonTwitch,
  pseudoTwitch,
  verifierSource,
};
