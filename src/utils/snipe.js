/**
 * /snipe — les derniers messages SUPPRIMES ou MODIFIES d'un salon.
 *
 * Gardes en memoire seulement (jamais en base), 10 minutes, 5 par salon :
 * de quoi rattraper une insulte effacee, pas de quoi constituer des archives.
 * Commande reservee au staff (Gerer les messages).
 */
const DUREE = 10 * 60_000;
const MAX = 5;
const salons = new Map(); // channelId -> { supprimes: [], modifies: [] }

function boite(channelId) {
  if (!salons.has(channelId)) salons.set(channelId, { supprimes: [], modifies: [] });
  return salons.get(channelId);
}

function purger(liste) {
  const limite = Date.now() - DUREE;
  while (liste.length && liste[0].le < limite) liste.shift();
}

function noter(type, message, extra = {}) {
  if (!message?.guild || message.author?.bot || message.system) return;
  const texte = type === 'modifies' ? extra.avant : message.content;
  const pieces = [...(message.attachments?.values?.() ?? [])].map((a) => a.url).slice(0, 4);
  if (!texte && !pieces.length) return;
  const b = boite(message.channel.id);
  const liste = b[type];
  liste.push({
    auteur: message.author?.id ?? null,
    texte: String(texte ?? '').slice(0, 1800),
    apres: type === 'modifies' ? String(message.content ?? '').slice(0, 1800) : null,
    pieces,
    lien: type === 'modifies' ? message.url : null,
    le: Date.now(),
  });
  while (liste.length > MAX) liste.shift();
  purger(liste);
}

function lire(channelId, type) {
  const b = salons.get(channelId);
  if (!b) return [];
  purger(b[type]);
  return [...b[type]].reverse();
}

// Menage regulier pour ne pas garder des salons vides en memoire.
setInterval(() => {
  for (const [id, b] of salons) {
    purger(b.supprimes);
    purger(b.modifies);
    if (!b.supprimes.length && !b.modifies.length) salons.delete(id);
  }
}, 5 * 60_000).unref?.();

module.exports = { noter, lire, DUREE };
