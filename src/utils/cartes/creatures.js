/**
 * Wumi 2.34 · LES CREATURES DES CARTES A COLLECTIONNER.
 *
 * Chaque creature est DECRITE (corps, oreilles, yeux, queue...) et dessinee
 * en SVG a partir de ces pieces : pas d'image a stocker, toutes au meme style
 * que les stickers de Wumi (gros contour violet nuit, couleurs franches).
 * Le SVG est ensuite pose sur la carte par @napi-rs/canvas (dessin.js).
 */
const L = '#2a2547'; // contour

// Les « familles » de l'univers Wumi (internet, jeu video, espace).
const ELEMENTS = {
  pixel: { fond: ['#ffad5c', '#d9482b'], peau: ['#ffc46b', '#f2772a'], accent: '#ffe066' },
  nuage: { fond: ['#a9dcff', '#3d7fd6'], peau: ['#e6f5ff', '#9cc9f2'], accent: '#ffffff' },
  glitch: { fond: ['#7dffb0', '#13795b'], peau: ['#a6f5c4', '#3fbf8a'], accent: '#ff5fd2' },
  neon: { fond: ['#ff7ae0', '#7a2cff'], peau: ['#ffb3ef', '#e25cd0'], accent: '#5ff7ff' },
  nuit: { fond: ['#8a6bd6', '#2a1f5c'], peau: ['#a98ae8', '#6b4fc2'], accent: '#ffd34d' },
  cosmos: { fond: ['#7fa2ff', '#2b2a8f'], peau: ['#c9d6ff', '#8a9cf0'], accent: '#fff6a8' },
  // Edition Auvergne (familles de lieux, pas de creatures)
  volcans: { fond: ['#8fbf5e', '#3f6f3a'], peau: ['#8fbf5e', '#3f6f3a'], accent: '#ffe066' },
  eaux: { fond: ['#6fc3f0', '#1f5a8a'], peau: ['#6fc3f0', '#1f5a8a'], accent: '#ffffff' },
  monuments: { fond: ['#b9a58a', '#5b4a3c'], peau: ['#b9a58a', '#5b4a3c'], accent: '#ffe066' },
  terroir: { fond: ['#ffd36e', '#c27a2a'], peau: ['#ffd36e', '#c27a2a'], accent: '#ffffff' },
  nature: { fond: ['#c6e67a', '#4f8f45'], peau: ['#c6e67a', '#4f8f45'], accent: '#ffffff' },
  aventure: { fond: ['#ff9a6b', '#c2412f'], peau: ['#ff9a6b', '#c2412f'], accent: '#ffffff' },
};

// ------------------------------------------------------------------ PIECES
function corps(forme, p) {
  const f = 'url(#peau)';
  switch (forme) {
    case 'goutte': return `<path d="M200 70 C260 150 310 200 310 260 C310 330 260 360 200 360 C140 360 90 330 90 260 C90 200 140 150 200 70Z" fill="${f}" stroke="${L}" stroke-width="10"/>`;
    case 'poire': return `<path d="M200 95 C255 95 275 150 275 190 C320 225 330 270 320 310 C305 355 255 365 200 365 C145 365 95 355 80 310 C70 270 80 225 125 190 C125 150 145 95 200 95Z" fill="${f}" stroke="${L}" stroke-width="10"/>`;
    case 'fantome': return `<path d="M100 250 C100 150 150 100 200 100 C250 100 300 150 300 250 L300 345 Q283 365 266 345 Q250 325 233 345 Q216 365 200 345 Q183 325 166 345 Q150 365 133 345 Q116 325 100 345Z" fill="${f}" stroke="${L}" stroke-width="10" stroke-linejoin="round"/>`;
    case 'robot': return `<rect x="95" y="120" width="210" height="230" rx="70" fill="${f}" stroke="${L}" stroke-width="10"/>`;
    case 'haut': return `<rect x="120" y="85" width="160" height="275" rx="80" fill="${f}" stroke="${L}" stroke-width="10"/>`;
    default: return `<path d="M80 245 A120 112 0 1 0 320 245 A120 112 0 1 0 80 245Z" fill="${f}" stroke="${L}" stroke-width="10"/>`;
  }
}

// Haut de la tete selon la forme (pour poser oreilles et antennes).
const HAUT = { fantome: 100, rond: 140, goutte: 120, poire: 105, robot: 125, haut: 92 };
const COTE = { fantome: 95, rond: 105, goutte: 90, poire: 80, robot: 100, haut: 75 };

function oreilles(type, forme, p) {
  const h = HAUT[forme] ?? 140, c = COTE[forme] ?? 100;
  const g = 200 - c * 0.55, d = 200 + c * 0.55;
  switch (type) {
    case 'chat': return `<path d="M${g - 40} ${h + 30} L${g - 25} ${h - 55} L${g + 30} ${h + 5}Z" fill="${p.peau[1]}" stroke="${L}" stroke-width="10" stroke-linejoin="round"/>
      <path d="M${d + 40} ${h + 30} L${d + 25} ${h - 55} L${d - 30} ${h + 5}Z" fill="${p.peau[1]}" stroke="${L}" stroke-width="10" stroke-linejoin="round"/>`;
    case 'lapin': return `<ellipse cx="${g}" cy="${h - 50}" rx="22" ry="70" transform="rotate(-12 ${g} ${h})" fill="${p.peau[1]}" stroke="${L}" stroke-width="10"/>
      <ellipse cx="${d}" cy="${h - 50}" rx="22" ry="70" transform="rotate(12 ${d} ${h})" fill="${p.peau[1]}" stroke="${L}" stroke-width="10"/>`;
    case 'cornes': return `<path d="M${g} ${h + 15} Q${g - 30} ${h - 40} ${g - 10} ${h - 70} Q${g + 15} ${h - 30} ${g + 25} ${h + 10}Z" fill="${p.accent}" stroke="${L}" stroke-width="9" stroke-linejoin="round"/>
      <path d="M${d} ${h + 15} Q${d + 30} ${h - 40} ${d + 10} ${h - 70} Q${d - 15} ${h - 30} ${d - 25} ${h + 10}Z" fill="${p.accent}" stroke="${L}" stroke-width="9" stroke-linejoin="round"/>`;
    case 'antenne': return `<path d="M200 ${h + 5} L200 ${h - 55}" stroke="${L}" stroke-width="10" stroke-linecap="round"/>
      <circle cx="200" cy="${h - 62}" r="20" fill="${p.accent}" stroke="${L}" stroke-width="9"/>`;
    case 'feuilles': return `<path d="M200 ${h + 10} C170 ${h - 30} 150 ${h - 60} 165 ${h - 95} C200 ${h - 70} 210 ${h - 30} 200 ${h + 10}Z" fill="#7bd65a" stroke="${L}" stroke-width="9"/>
      <path d="M205 ${h + 10} C230 ${h - 25} 260 ${h - 40} 280 ${h - 30} C265 ${h} 235 ${h + 15} 205 ${h + 10}Z" fill="#5fbf46" stroke="${L}" stroke-width="9"/>`;
    case 'flamme': return `<path d="M160 ${h + 20} C150 ${h - 30} 175 ${h - 50} 185 ${h - 95} C200 ${h - 60} 215 ${h - 70} 222 ${h - 105} C245 ${h - 60} 255 ${h - 20} 240 ${h + 20}Z" fill="${p.accent}" stroke="${L}" stroke-width="9" stroke-linejoin="round"/>
      <path d="M185 ${h + 15} C185 ${h - 15} 198 ${h - 30} 205 ${h - 55} C218 ${h - 25} 222 ${h - 5} 215 ${h + 15}Z" fill="#ff7a2f"/>`;
    case 'nageoires': return `<path d="M${g - 30} ${h + 60} Q${g - 80} ${h + 20} ${g - 70} ${h - 20} Q${g - 30} ${h + 10} ${g + 5} ${h + 30}Z" fill="${p.peau[1]}" stroke="${L}" stroke-width="9" stroke-linejoin="round"/>
      <path d="M${d + 30} ${h + 60} Q${d + 80} ${h + 20} ${d + 70} ${h - 20} Q${d + 30} ${h + 10} ${d - 5} ${h + 30}Z" fill="${p.peau[1]}" stroke="${L}" stroke-width="9" stroke-linejoin="round"/>`;
    case 'pixel': return `<rect x="${g - 45}" y="${h - 40}" width="34" height="34" fill="${p.accent}" stroke="${L}" stroke-width="8"/><rect x="${g - 20}" y="${h - 72}" width="30" height="30" fill="${p.peau[1]}" stroke="${L}" stroke-width="8"/>
      <rect x="${d + 11}" y="${h - 40}" width="34" height="34" fill="${p.accent}" stroke="${L}" stroke-width="8"/><rect x="${d - 10}" y="${h - 72}" width="30" height="30" fill="${p.peau[1]}" stroke="${L}" stroke-width="8"/>`;
    case 'wifi': return `<path d="M200 ${h + 5} L200 ${h - 25}" stroke="${L}" stroke-width="10" stroke-linecap="round"/><circle cx="200" cy="${h - 32}" r="11" fill="${p.accent}" stroke="${L}" stroke-width="7"/>
      <path d="M170 ${h - 55} q30 -28 60 0" stroke="${L}" stroke-width="9" fill="none" stroke-linecap="round"/><path d="M148 ${h - 78} q52 -48 104 0" stroke="${L}" stroke-width="9" fill="none" stroke-linecap="round"/>`;
    case 'antennes': return `<path d="M175 ${h + 10} Q160 ${h - 40} 130 ${h - 70}" stroke="${L}" stroke-width="9" fill="none" stroke-linecap="round"/><circle cx="128" cy="${h - 74}" r="15" fill="${p.accent}" stroke="${L}" stroke-width="8"/>
      <path d="M225 ${h + 10} Q240 ${h - 40} 270 ${h - 70}" stroke="${L}" stroke-width="9" fill="none" stroke-linecap="round"/><circle cx="272" cy="${h - 74}" r="15" fill="${p.accent}" stroke="${L}" stroke-width="8"/>`;
    case 'gemme': return `<path d="M200 ${h - 85} L238 ${h - 45} L200 ${h + 12} L162 ${h - 45}Z" fill="${p.accent}" stroke="${L}" stroke-width="9" stroke-linejoin="round"/><path d="M162 ${h - 45} H238 M200 ${h - 85} L185 ${h - 45} L200 ${h + 12} L215 ${h - 45}Z" stroke="${L}" stroke-width="4" fill="none" stroke-linejoin="round"/>`;
    case 'couronne': return `<path d="M140 ${h + 12} L132 ${h - 52} L168 ${h - 22} L200 ${h - 70} L232 ${h - 22} L268 ${h - 52} L260 ${h + 12}Z" fill="#ffd34d" stroke="${L}" stroke-width="9" stroke-linejoin="round"/>
      <circle cx="200" cy="${h - 18}" r="10" fill="#ff5f6d" stroke="${L}" stroke-width="5"/><circle cx="160" cy="${h - 6}" r="7" fill="#5fc0ff" stroke="${L}" stroke-width="4"/><circle cx="240" cy="${h - 6}" r="7" fill="#5fe08a" stroke="${L}" stroke-width="4"/>`;
    case 'aureole': return `<ellipse cx="200" cy="${h - 38}" rx="70" ry="18" fill="none" stroke="${L}" stroke-width="16"/><ellipse cx="200" cy="${h - 38}" rx="70" ry="18" fill="none" stroke="${p.accent}" stroke-width="8"/>`;
    case 'casque': return `<path d="M${g - 30} ${h + 70} C${g - 40} ${h - 50} ${d + 40} ${h - 50} ${d + 30} ${h + 70}" stroke="${L}" stroke-width="22" fill="none" stroke-linecap="round"/><path d="M${g - 30} ${h + 70} C${g - 40} ${h - 50} ${d + 40} ${h - 50} ${d + 30} ${h + 70}" stroke="${p.accent}" stroke-width="10" fill="none" stroke-linecap="round"/>
      <rect x="${g - 58}" y="${h + 50}" width="40" height="64" rx="16" fill="${p.accent}" stroke="${L}" stroke-width="8"/><rect x="${d + 18}" y="${h + 50}" width="40" height="64" rx="16" fill="${p.accent}" stroke="${L}" stroke-width="8"/>`;
    case 'etoile': return `<path transform="translate(200 ${h - 40})" d="M0 -48 L13 -15 L48 -14 L20 8 L30 43 L0 22 L-30 43 L-20 8 L-48 -14 L-13 -15Z" fill="${p.accent}" stroke="${L}" stroke-width="9" stroke-linejoin="round"/>`;
    default: return '';
  }
}

function yeux(type, y, p, ecart = 48) {
  const g = 200 - ecart, d = 200 + ecart;
  const blanc = (x) => `<ellipse cx="${x}" cy="${y}" rx="24" ry="28" fill="#fff" stroke="${L}" stroke-width="7"/><circle cx="${x + 3}" cy="${y + 4}" r="14" fill="${L}"/><circle cx="${x + 8}" cy="${y - 3}" r="5" fill="#fff"/>`;
  switch (type) {
    case 'grands': return blanc(g) + blanc(d);
    case 'joie': return `<path d="M${g - 20} ${y + 6} q20 -26 40 0" stroke="${L}" stroke-width="10" fill="none" stroke-linecap="round"/><path d="M${d - 20} ${y + 6} q20 -26 40 0" stroke="${L}" stroke-width="10" fill="none" stroke-linecap="round"/>`;
    case 'endormi': return `<path d="M${g - 20} ${y} q20 18 40 0" stroke="${L}" stroke-width="10" fill="none" stroke-linecap="round"/><path d="M${d - 20} ${y} q20 18 40 0" stroke="${L}" stroke-width="10" fill="none" stroke-linecap="round"/>`;
    case 'ecran': return `<rect x="${g - 45}" y="${y - 38}" width="${2 * ecart + 90}" height="76" rx="30" fill="#23214a" stroke="${L}" stroke-width="7"/><circle cx="${g}" cy="${y}" r="14" fill="#5fc0ff"/><circle cx="${d}" cy="${y}" r="14" fill="#5fc0ff"/>`;
    case 'cyclope': return `<ellipse cx="200" cy="${y}" rx="40" ry="44" fill="#fff" stroke="${L}" stroke-width="8"/><circle cx="205" cy="${y + 6}" r="22" fill="${L}"/><circle cx="213" cy="${y - 5}" r="8" fill="#fff"/>`;
    case 'malin': return `<path d="M${g - 22} ${y - 14} l40 10" stroke="${L}" stroke-width="9" stroke-linecap="round"/><path d="M${d + 22} ${y - 14} l-40 10" stroke="${L}" stroke-width="9" stroke-linecap="round"/><circle cx="${g}" cy="${y + 10}" r="13" fill="${L}"/><circle cx="${d}" cy="${y + 10}" r="13" fill="${L}"/><circle cx="${g + 4}" cy="${y + 6}" r="4" fill="#fff"/><circle cx="${d + 4}" cy="${y + 6}" r="4" fill="#fff"/>`;
    default: return `<circle cx="${g}" cy="${y}" r="17" fill="${L}"/><circle cx="${d}" cy="${y}" r="17" fill="${L}"/><circle cx="${g + 6}" cy="${y - 6}" r="6" fill="#fff"/><circle cx="${d + 6}" cy="${y - 6}" r="6" fill="#fff"/>`;
  }
}

function bouche(type, y) {
  switch (type) {
    case 'o': return `<ellipse cx="200" cy="${y + 6}" rx="13" ry="16" fill="${L}"/>`;
    case 'croc': return `<path d="M168 ${y} q32 28 64 0" stroke="${L}" stroke-width="9" fill="#ff7a9a" stroke-linejoin="round"/><path d="M180 ${y + 3} l6 12 l6 -10" fill="#fff" stroke="${L}" stroke-width="4" stroke-linejoin="round"/>`;
    case 'chat': return `<path d="M176 ${y} q12 14 24 0 q12 14 24 0" stroke="${L}" stroke-width="8" fill="none" stroke-linecap="round"/>`;
    case 'rire': return `<path d="M165 ${y - 4} h70 a35 32 0 0 1 -70 0z" fill="${L}"/><path d="M180 ${y + 14} q20 12 40 0" fill="#ff7a9a"/>`;
    default: return `<path d="M175 ${y} q25 22 50 0" stroke="${L}" stroke-width="9" fill="none" stroke-linecap="round"/>`;
  }
}

function queue(type, p) {
  switch (type) {
    case 'flamme': return `<path d="M300 300 C350 290 370 250 360 210 C345 240 330 235 335 200 C305 230 300 260 290 280Z" fill="${p.accent}" stroke="${L}" stroke-width="9" stroke-linejoin="round"/>`;
    case 'feuille': return `<path d="M295 305 C345 300 370 260 365 215 C325 220 300 255 290 290Z" fill="#7bd65a" stroke="${L}" stroke-width="9" stroke-linejoin="round"/><path d="M300 295 L355 228" stroke="${L}" stroke-width="5"/>`;
    case 'eclair': return `<path d="M290 300 L340 270 L320 262 L365 215 L345 255 L362 260 L300 312Z" fill="${p.accent === '#ffffff' ? '#ffe45c' : p.accent}" stroke="${L}" stroke-width="9" stroke-linejoin="round"/>`;
    case 'poisson': return `<path d="M295 300 Q330 290 345 270 L370 300 L345 330 Q330 312 295 315Z" fill="${p.peau[1]}" stroke="${L}" stroke-width="9" stroke-linejoin="round"/>`;
    case 'etoile': return `<path d="M300 300 Q330 280 340 250" stroke="${L}" stroke-width="9" fill="none" stroke-linecap="round"/><path transform="translate(345 240)" d="M0 -26 L7 -8 L26 -8 L11 4 L16 23 L0 12 L-16 23 L-11 4 L-26 -8 L-7 -8Z" fill="${p.accent}" stroke="${L}" stroke-width="7" stroke-linejoin="round"/>`;
    case 'pixel': return `<rect x="296" y="276" width="30" height="30" fill="${p.peau[1]}" stroke="${L}" stroke-width="8"/><rect x="322" y="248" width="30" height="30" fill="${p.accent}" stroke="${L}" stroke-width="8"/>`;
    case 'cable': return `<path d="M300 310 C350 320 360 270 340 250" stroke="${L}" stroke-width="10" fill="none" stroke-linecap="round"/><rect x="325" y="222" width="30" height="30" rx="6" fill="${p.accent}" stroke="${L}" stroke-width="8"/>`;
    case 'touffe': return `<circle cx="318" cy="300" r="28" fill="${p.accent}" stroke="${L}" stroke-width="9"/>`;
    default: return '';
  }
}

const EXTRAS = {
  insecte: `<g stroke="${L}" stroke-width="9" stroke-linecap="round" fill="none"><path d="M92 250 l-40 -22"/><path d="M88 285 l-46 2"/><path d="M95 318 l-40 22"/><path d="M308 250 l40 -22"/><path d="M312 285 l46 2"/><path d="M305 318 l40 22"/></g>`,
  frappe: `<g transform="translate(300 120)"><rect x="-10" y="-38" width="104" height="58" rx="29" fill="#ffffff" stroke="${L}" stroke-width="8"/><path d="M8 18 l-16 22 l26 -14" fill="#ffffff" stroke="${L}" stroke-width="8" stroke-linejoin="round"/><circle cx="18" cy="-9" r="9" fill="${L}"/><circle cx="42" cy="-9" r="9" fill="${L}" opacity="0.7"/><circle cx="66" cy="-9" r="9" fill="${L}" opacity="0.4"/></g>`,
  fantome: '',
};

function pattes(forme, p) {
  if (forme === 'fantome') return '';
  const y = forme === 'goutte' || forme === 'haut' ? 352 : 345;
  return `<ellipse cx="160" cy="${y}" rx="34" ry="20" fill="${p.peau[1]}" stroke="${L}" stroke-width="9"/>
    <ellipse cx="240" cy="${y}" rx="34" ry="20" fill="${p.peau[1]}" stroke="${L}" stroke-width="9"/>`;
}

/** Le SVG (400 x 400, fond transparent) d'une creature. */
function svg(c) {
  const p = { ...ELEMENTS[c.element], ...(c.couleurs ?? {}) };
  const forme = c.corps ?? 'rond';
  const yYeux = { fantome: 205, rond: 225, goutte: 235, poire: 200, robot: 205, haut: 185 }[forme] ?? 220;
  const ventre = c.ventre === false ? '' : `<ellipse cx="200" cy="${yYeux + 95}" rx="${forme === 'haut' ? 52 : 70}" ry="50" fill="${p.accent}" opacity="0.55"/>`;
  const joues = c.joues === false ? '' : `<ellipse cx="${200 - (c.ecart ?? 48) - 26}" cy="${yYeux + 38}" rx="18" ry="11" fill="#ff7a9a" opacity="0.6"/><ellipse cx="${200 + (c.ecart ?? 48) + 26}" cy="${yYeux + 38}" rx="18" ry="11" fill="#ff7a9a" opacity="0.6"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400">
<defs><linearGradient id="peau" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${p.peau[0]}"/><stop offset="1" stop-color="${p.peau[1]}"/></linearGradient></defs>
<ellipse cx="200" cy="372" rx="120" ry="16" fill="#000" opacity="0.18"/>
${queue(c.queue, p)}
${oreilles(c.oreilles, forme, p)}
${pattes(forme, p)}
${corps(forme, p)}
${ventre}
<path d="M${forme === 'robot' ? 125 : 140} ${(HAUT[forme] ?? 140) + 45} q15 -25 45 -30" stroke="#fff" stroke-width="10" fill="none" stroke-linecap="round" opacity="0.45"/>
${joues}
${yeux(c.yeux, yYeux, p, c.ecart ?? 48)}
${bouche(c.bouche, yYeux + 45)}
${EXTRAS[c.extra] ?? ''}
</svg>`;
}

module.exports = { svg, ELEMENTS, CONTOUR: L };
