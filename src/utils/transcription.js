const { ts } = require('./outils');

/** Echappe le HTML pour eviter toute injection depuis le contenu des messages. */
function echapper(texte = '') {
  return String(texte)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/** Rend le markdown Discord de base en HTML (apres echappement). */
function formater(texte = '') {
  return echapper(texte)
    .replace(/```([\s\S]*?)```/g, (_, code) => `<pre>${code.trim()}</pre>`)
    .replace(/`([^`\n]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*\n]+)\*/g, '<em>$1</em>')
    .replace(/__([^_]+)__/g, '<u>$1</u>')
    .replace(/~~([^~]+)~~/g, '<s>$1</s>')
    .replace(/^&gt; (.*)$/gm, '<blockquote>$1</blockquote>')
    .replace(/&lt;@!?(\d+)&gt;/g, '<span class="mention">@$1</span>')
    .replace(/&lt;#(\d+)&gt;/g, '<span class="mention">#$1</span>')
    .replace(/&lt;@&amp;(\d+)&gt;/g, '<span class="mention">@role</span>')
    .replace(/\n/g, '<br>');
}

const dateFr = (ms) =>
  new Date(ms).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Europe/Paris' });

/**
 * Construit une transcription HTML autonome d'un salon de ticket.
 * @param {object} salon        salon Discord
 * @param {object} ticket       ligne de la table tickets
 * @param {object} infos        { auteur, fermePar, raison }
 * @returns {Promise<{html: Buffer, nombre: number}>}
 */
async function genererTranscription(salon, ticket, infos = {}) {
  // Recupere l'historique par paquets de 100, du plus ancien au plus recent
  const messages = [];
  let avant;
  while (messages.length < 1000) {
    const lot = await salon.messages.fetch({ limit: 100, ...(avant ? { before: avant } : {}) }).catch(() => null);
    if (!lot || lot.size === 0) break;
    messages.push(...lot.values());
    avant = lot.last().id;
    if (lot.size < 100) break;
  }
  messages.reverse();

  const lignes = messages
    .map((m) => {
      const pieces = m.attachments.size
        ? `<div class="pj">${[...m.attachments.values()]
            .map((a) =>
              /\.(png|jpe?g|gif|webp)$/i.test(a.name ?? '')
                ? `<img src="${echapper(a.url)}" alt="${echapper(a.name)}">`
                : `<a href="${echapper(a.url)}">📎 ${echapper(a.name)}</a>`
            )
            .join('')}</div>`
        : '';

      const embeds = m.embeds
        .map(
          (e) => `<div class="embed">${e.title ? `<div class="et">${echapper(e.title)}</div>` : ''}${
            e.description ? `<div class="ed">${formater(e.description)}</div>` : ''
          }${(e.fields ?? [])
            .map((f) => `<div class="ef"><b>${echapper(f.name)}</b><br>${formater(f.value)}</div>`)
            .join('')}</div>`
        )
        .join('');

      const contenu = m.content ? `<div class="txt">${formater(m.content)}</div>` : '';

      return `<div class="msg">
  <img class="av" src="${echapper(m.author.displayAvatarURL({ extension: 'png', size: 64 }))}" alt="">
  <div class="corps">
    <div class="tete"><span class="nom">${echapper(m.member?.displayName ?? m.author.username)}</span>${
      m.author.bot ? '<span class="bot">BOT</span>' : ''
    }<span class="date">${dateFr(m.createdTimestamp)}</span></div>
    ${contenu}${embeds}${pieces}
  </div>
</div>`;
    })
    .join('\n');

  const html = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Ticket #${ticket.numero} — ${echapper(salon.guild.name)}</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body { margin: 0; background: #1a1d21; color: #e6e8e3;
         font-family: system-ui, "Segoe UI", Roboto, sans-serif; font-size: 15px; line-height: 1.5; }
  .page { max-width: 900px; margin: 0 auto; padding: 24px 16px 60px; }
  header { background: #232821; border: 1px solid #3b4436; border-radius: 14px; padding: 20px 24px; margin-bottom: 24px; }
  header h1 { margin: 0 0 4px; font-size: 22px; }
  header .sous { color: #9aa694; font-size: 14px; }
  .meta { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 10px 24px; margin-top: 16px; }
  .meta div { font-size: 14px; }
  .meta span { display: block; color: #8d9887; font-size: 12px; text-transform: uppercase; letter-spacing: .04em; }
  .demande { margin-top: 16px; padding-top: 16px; border-top: 1px solid #3b4436; }
  .demande span { display: block; color: #8d9887; font-size: 12px; text-transform: uppercase; letter-spacing: .04em; }
  .ds { font-size: 16px; font-weight: 600; margin-bottom: 12px; }
  .dd { font-size: 14px; color: #cdd5c7; white-space: pre-wrap; }
  .msg { display: flex; gap: 12px; padding: 10px 12px; border-radius: 10px; }
  .msg:hover { background: #20242a; }
  .av { width: 40px; height: 40px; border-radius: 50%; flex: 0 0 40px; background: #2f343a; }
  .corps { min-width: 0; flex: 1; }
  .tete { display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; }
  .nom { font-weight: 600; color: #a9c98a; }
  .bot { background: #5c8a3a; color: #fff; font-size: 10px; padding: 1px 5px; border-radius: 4px; font-weight: 700; }
  .date { color: #7d8878; font-size: 12px; }
  .txt { white-space: pre-wrap; word-wrap: break-word; }
  code { background: #14161a; padding: 1px 5px; border-radius: 4px; font-size: 13px; }
  pre { background: #14161a; padding: 12px; border-radius: 8px; overflow-x: auto; font-size: 13px; }
  blockquote { border-left: 3px solid #4d5a46; margin: 4px 0; padding-left: 10px; color: #b9c2b2; }
  .mention { background: rgba(92,138,58,.25); color: #b6d894; border-radius: 4px; padding: 0 3px; }
  .embed { border-left: 4px solid #5c8a3a; background: #21252b; border-radius: 6px;
           padding: 10px 14px; margin-top: 6px; max-width: 520px; }
  .et { font-weight: 600; margin-bottom: 4px; }
  .ef { margin-top: 8px; font-size: 14px; }
  .pj img { max-width: 380px; border-radius: 8px; margin-top: 6px; display: block; }
  .pj a { color: #a9c98a; }
  footer { margin-top: 32px; text-align: center; color: #7d8878; font-size: 13px; }
</style>
</head>
<body>
<div class="page">
  <header>
    <h1>Ticket #${ticket.numero}${ticket.type ? ` — ${echapper(ticket.type)}` : ''}</h1>
    <div class="sous">${echapper(salon.guild.name)} · #${echapper(salon.name)}</div>
    <div class="meta">
      <div><span>Ouvert par</span>${echapper(infos.auteur ?? ticket.user_id)}</div>
      <div><span>Ouvert le</span>${dateFr(ticket.cree_le)}</div>
      <div><span>Fermé par</span>${echapper(infos.fermePar ?? '—')}</div>
      <div><span>Fermé le</span>${dateFr(Date.now())}</div>
      <div><span>Messages</span>${messages.length}</div>
      <div><span>Raison de fermeture</span>${echapper(infos.raison ?? 'Aucune')}</div>
    </div>
    ${
      ticket.sujet || ticket.description
        ? `<div class="demande">${ticket.sujet ? `<div class="ds"><span>Sujet</span>${echapper(ticket.sujet)}</div>` : ''}${
            ticket.description ? `<div class="dd"><span>Détail de la demande</span>${formater(ticket.description)}</div>` : ''
          }</div>`
        : ''
    }
  </header>
  ${lignes || '<p style="text-align:center;color:#7d8878">Aucun message dans ce ticket.</p>'}
  <footer>Transcription générée automatiquement · ${dateFr(Date.now())}</footer>
</div>
</body>
</html>`;

  return { html: Buffer.from(html, 'utf8'), nombre: messages.length };
}

module.exports = { genererTranscription, echapper, ts };
