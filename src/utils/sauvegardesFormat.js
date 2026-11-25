/**
 * Format des sauvegardes envoyees hors du serveur (Wumi 2.21) : la base
 * compressee (gzip) puis chiffree en AES-256-GCM avec CHIFFREMENT_CLE.
 *   « WUMIBK1 » | iv[12] | tag[16] | chiffre
 * Module sans dependance a la base, pour que l'outil de restauration puisse
 * l'utiliser bot arrete.
 */
const crypto = require('node:crypto');
const zlib = require('node:zlib');

const ENTETE = Buffer.from('WUMIBK1');

function cleChiffrement() {
  const k = Buffer.from(String(process.env.CHIFFREMENT_CLE ?? '').trim(), 'base64');
  if (k.length !== 32) throw new Error('CHIFFREMENT_CLE absente ou invalide');
  return k;
}

/** Empreinte courte de la cle, pour la reconnaitre sans la montrer. */
function empreinteCle() {
  try {
    return crypto.createHash('sha256').update(cleChiffrement()).digest('hex').slice(0, 8);
  } catch {
    return null;
  }
}

/** Compresse puis chiffre un fichier de base. */
function emballer(brut, cle = cleChiffrement()) {
  const gz = zlib.gzipSync(brut, { level: 9 });
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', cle, iv);
  const chiffre = Buffer.concat([c.update(gz), c.final()]);
  return Buffer.concat([ENTETE, iv, c.getAuthTag(), chiffre]);
}

/** L'inverse d'emballer(). */
function deballer(paquet, cle = cleChiffrement()) {
  if (!paquet.subarray(0, ENTETE.length).equals(ENTETE)) throw new Error("Ce fichier n'est pas une sauvegarde chiffree de Wumi");
  const o = ENTETE.length;
  const d = crypto.createDecipheriv('aes-256-gcm', cle, paquet.subarray(o, o + 12));
  d.setAuthTag(paquet.subarray(o + 12, o + 28));
  return zlib.gunzipSync(Buffer.concat([d.update(paquet.subarray(o + 28)), d.final()]));
}

module.exports = { emballer, deballer, empreinteCle, ENTETE };
