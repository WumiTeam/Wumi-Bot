/**
 * Genere les bannieres du serveur support (panneau de tickets, ticket ouvert,
 * formulaire, ticket ferme, verification), en francais et en anglais.
 *
 *     node outils/generer-bannieres.js
 *
 * Les PNG atterrissent dans src/assets/bannieres/ : le bot les joint tels
 * quels, il ne les redessine pas a chaque message. Relance ce script si tu
 * changes un texte ci-dessous.
 *
 * Meme style que la banniere « Need help? » : fond nuit, grille discrete,
 * halo bleu derriere le grand « W. », titre tres gras, sous-titre en
 * italique serif bleu, petit logo « wumi. » en bas a droite.
 */
const fs = require('node:fs');
const path = require('node:path');
const { createCanvas, GlobalFonts } = require('@napi-rs/canvas');

const POLICES = path.join(__dirname, 'polices-bannieres');
GlobalFonts.registerFromPath(path.join(POLICES, 'InterDisplay-Black.otf'), 'WumiTitre');
GlobalFonts.registerFromPath(path.join(POLICES, 'Inter-Bold.otf'), 'WumiGras');
GlobalFonts.registerFromPath(path.join(POLICES, 'Lora-Italic-Variable.ttf'), 'WumiItalique');

const SORTIE = path.join(__dirname, '..', 'src', 'assets', 'bannieres');
const L = 2000;
const H = 667;

const COULEURS = {
  fond: '#0b0e1c',
  titre: '#eef0fb',
  bleu: '#58a6ff',
  etiquette: '#62acff',
  etincelle: '#a9b8ec',
  logo: '#9a9db3',
};

// ------------------------------------------------------------------ TEXTES
const BANNIERES = {
  panneau: {
    icone: 'bulle',
    fr: { tag: 'SUPPORT', titre: 'Besoin d’aide ?', sous: 'on est là pour toi.' },
    en: { tag: 'SUPPORT', titre: 'Need help?', sous: 'we’re here for you.' },
  },
  ticket: {
    icone: 'ticket',
    fr: { tag: 'TICKET', titre: 'Ticket ouvert', sous: 'l’équipe arrive vite.' },
    en: { tag: 'TICKET', titre: 'Ticket opened', sous: 'the team is on its way.' },
  },
  formulaire: {
    icone: 'formulaire',
    fr: { tag: 'FORMULAIRE', titre: 'Ta demande', sous: 'tout est noté ici.' },
    en: { tag: 'FORM', titre: 'Your request', sous: 'everything’s right here.' },
  },
  ferme: {
    icone: 'coche',
    fr: { tag: 'ARCHIVE', titre: 'Ticket fermé', sous: 'merci de nous avoir écrit.' },
    en: { tag: 'ARCHIVE', titre: 'Ticket closed', sous: 'thanks for reaching out.' },
  },
  idee: {
    icone: 'ampoule',
    fr: { tag: 'SUGGESTIONS', titre: 'Une idée ?', sous: 'aide-nous à construire Wumi.' },
    en: { tag: 'SUGGESTIONS', titre: 'Got an idea?', sous: 'help us build Wumi.' },
  },
  bug: {
    icone: 'insecte',
    fr: { tag: 'SIGNALER UN BUG', titre: 'Un bug ?', sous: 'dis-nous tout, on corrige.' },
    en: { tag: 'BUG REPORT', titre: 'Found a bug?', sous: 'tell us, we will fix it.' },
  },
  vote: {
    icone: 'etoile',
    fr: { tag: 'TOP.GG', titre: 'Vote pour Wumi.', sous: 'dix secondes, un vrai coup de pouce.' },
    en: { tag: 'TOP.GG', titre: 'Vote for Wumi.', sous: 'ten seconds, a real boost.' },
  },
  recrutement: {
    icone: 'equipe',
    fr: { tag: 'RECRUTEMENT', titre: 'On recrute.', sous: 'rejoins l’équipe Wumi.' },
    en: { tag: 'NOW HIRING', titre: 'We’re hiring.', sous: 'join the Wumi team.' },
  },
  giveaway: {
    icone: 'cadeau',
    fr: { tag: 'CONCOURS', titre: 'À gagner !', sous: 'un clic pour tenter ta chance.' },
    en: { tag: 'GIVEAWAY', titre: 'Up for grabs!', sous: 'one click to try your luck.' },
  },
  modmail: {
    icone: 'enveloppe',
    fr: { tag: 'MODMAIL', titre: 'Écris-nous.', sous: 'l’équipe te répond en MP.' },
    en: { tag: 'MODMAIL', titre: 'Message us.', sous: 'the team replies in your DMs.' },
  },
  verification: {
    icone: 'bouclier',
    fr: { tag: 'VÉRIFICATION', titre: 'Bienvenue !', sous: 'vérifie-toi pour entrer.' },
    en: { tag: 'VERIFICATION', titre: 'Welcome!', sous: 'verify to get in.' },
  },
};

// ------------------------------------------------------------------ DECOR
function fond(ctx) {
  ctx.fillStyle = COULEURS.fond;
  ctx.fillRect(0, 0, L, H);

  // Halo bleu derriere le logo
  let g = ctx.createRadialGradient(300, 380, 20, 300, 380, 720);
  g.addColorStop(0, 'rgba(58, 120, 182, 0.95)');
  g.addColorStop(0.35, 'rgba(42, 86, 140, 0.55)');
  g.addColorStop(1, 'rgba(11, 14, 28, 0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, L, H);

  // Lueur violette en bas a droite
  g = ctx.createRadialGradient(1950, 700, 10, 1950, 700, 760);
  g.addColorStop(0, 'rgba(88, 86, 140, 0.55)');
  g.addColorStop(1, 'rgba(11, 14, 28, 0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, L, H);

  // Grille
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.035)';
  ctx.lineWidth = 1;
  for (let x = 0; x <= L; x += 73) {
    ctx.beginPath(); ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, H); ctx.stroke();
  }
  for (let y = 0; y <= H; y += 73) {
    ctx.beginPath(); ctx.moveTo(0, y + 0.5); ctx.lineTo(L, y + 0.5); ctx.stroke();
  }

  // Leger vignettage pour que le texte respire
  g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, 'rgba(0,0,0,0.12)');
  g.addColorStop(0.5, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(0,0,0,0.18)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, L, H);
}

function etincelle(ctx, x, y, r) {
  ctx.fillStyle = COULEURS.etincelle;
  ctx.beginPath();
  ctx.moveTo(x, y - r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.quadraticCurveTo(x, y, x, y + r);
  ctx.quadraticCurveTo(x, y, x - r, y);
  ctx.quadraticCurveTo(x, y, x, y - r);
  ctx.fill();
}

/** Le grand « W. » du logo. */
function logo(ctx) {
  ctx.save();
  ctx.shadowColor = 'rgba(160, 205, 255, 0.35)';
  ctx.shadowBlur = 40;
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 84;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(190, 283);
  ctx.lineTo(232, 418);
  ctx.lineTo(292, 372);
  ctx.lineTo(352, 418);
  ctx.lineTo(392, 283);
  ctx.stroke();
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(495, 428, 35, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// ------------------------------------------------------------------ ICONES
// Dessinees au trait : pas de police emoji necessaire.
function icone(ctx, type, x, y) {
  const s = 34; // taille de reference
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 4;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  if (type === 'bulle') {
    ctx.beginPath();
    ctx.ellipse(s / 2, s / 2 - 2, s / 2, s / 2 - 5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(6, s - 9); ctx.lineTo(2, s + 3); ctx.lineTo(14, s - 5);
    ctx.fill();
    ctx.fillStyle = COULEURS.fond;
    for (const dx of [9, 17, 25]) {
      ctx.beginPath(); ctx.arc(dx, s / 2 - 2, 3, 0, Math.PI * 2); ctx.fill();
    }
  } else if (type === 'ticket') {
    ctx.beginPath();
    ctx.moveTo(0, 6); ctx.lineTo(s, 6); ctx.lineTo(s, 13);
    ctx.arc(s, 17, 4, -Math.PI / 2, Math.PI / 2, true);
    ctx.lineTo(s, 28); ctx.lineTo(0, 28); ctx.lineTo(0, 21);
    ctx.arc(0, 17, 4, Math.PI / 2, -Math.PI / 2, true);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = COULEURS.fond;
    ctx.lineWidth = 2.5;
    ctx.setLineDash([3, 3]);
    ctx.beginPath(); ctx.moveTo(23, 9); ctx.lineTo(23, 26); ctx.stroke();
  } else if (type === 'formulaire') {
    ctx.beginPath();
    ctx.roundRect(3, 3, s - 6, s, 5);
    ctx.fill();
    ctx.fillStyle = COULEURS.fond;
    ctx.fillRect(11, 0, s - 22, 7);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.roundRect(12, -2, s - 24, 8, 3); ctx.fill();
    ctx.strokeStyle = COULEURS.fond;
    ctx.lineWidth = 3;
    for (const dy of [14, 21, 28]) {
      ctx.beginPath(); ctx.moveTo(9, dy); ctx.lineTo(s - 9, dy); ctx.stroke();
    }
  } else if (type === 'coche') {
    ctx.beginPath(); ctx.arc(s / 2, s / 2, s / 2, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = COULEURS.fond;
    ctx.lineWidth = 4.5;
    ctx.beginPath(); ctx.moveTo(9, 18); ctx.lineTo(15, 24); ctx.lineTo(26, 11); ctx.stroke();
  } else if (type === 'ampoule') {
    ctx.beginPath(); ctx.arc(s / 2, 14, 13, Math.PI * 0.8, Math.PI * 2.2); ctx.lineTo(s / 2 + 6, 28); ctx.lineTo(s / 2 - 6, 28); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.roundRect(s / 2 - 6, 30, 12, 4, 2); ctx.fill();
    ctx.beginPath(); ctx.roundRect(s / 2 - 4, 35, 8, 3, 1.5); ctx.fill();
  } else if (type === 'insecte') {
    ctx.beginPath(); ctx.ellipse(s / 2, 21, 9, 12, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(s / 2, 8, 6, 0, Math.PI * 2); ctx.fill();
    ctx.lineWidth = 3;
    for (const dy of [15, 21, 27]) {
      ctx.beginPath(); ctx.moveTo(s / 2 - 9, dy); ctx.lineTo(s / 2 - 16, dy - 3); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(s / 2 + 9, dy); ctx.lineTo(s / 2 + 16, dy - 3); ctx.stroke();
    }
    ctx.beginPath(); ctx.moveTo(s / 2 - 3, 3); ctx.lineTo(s / 2 - 7, -3); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(s / 2 + 3, 3); ctx.lineTo(s / 2 + 7, -3); ctx.stroke();
    ctx.strokeStyle = COULEURS.fond; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(s / 2, 12); ctx.lineTo(s / 2, 32); ctx.stroke();
  } else if (type === 'cadeau') {
    ctx.beginPath(); ctx.roundRect(2, 13, s - 4, 21, 3); ctx.fill();
    ctx.beginPath(); ctx.roundRect(0, 7, s, 8, 2); ctx.fill();
    ctx.lineWidth = 3.5;
    ctx.beginPath(); ctx.moveTo(s / 2, 7); ctx.bezierCurveTo(s / 2 - 4, -2, s / 2 - 14, 0, s / 2 - 9, 6); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(s / 2, 7); ctx.bezierCurveTo(s / 2 + 4, -2, s / 2 + 14, 0, s / 2 + 9, 6); ctx.stroke();
    ctx.fillStyle = COULEURS.fond;
    ctx.fillRect(s / 2 - 2.5, 7, 5, 27);
  } else if (type === 'enveloppe') {
    ctx.beginPath(); ctx.roundRect(0, 5, s, 25, 4); ctx.fill();
    ctx.strokeStyle = COULEURS.fond;
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(3, 9); ctx.lineTo(s / 2, 21); ctx.lineTo(s - 3, 9); ctx.stroke();
  } else if (type === 'etoile') {
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const r = i % 2 ? 7.5 : 18;
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      const px = s / 2 + Math.cos(a) * r;
      const py = s / 2 + 1 + Math.sin(a) * r;
      if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
  } else if (type === 'equipe') {
    // deux silhouettes, celle de derriere un peu plus petite
    ctx.globalAlpha = 0.6;
    ctx.beginPath(); ctx.arc(25, 9, 6, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(25, 30, 11, Math.PI, 0); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.beginPath(); ctx.arc(12, 10, 8, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(12, 35, 14, Math.PI, 0); ctx.fill();
  } else if (type === 'bouclier') {
    ctx.beginPath();
    ctx.moveTo(s / 2, 0);
    ctx.lineTo(s, 6);
    ctx.quadraticCurveTo(s, 26, s / 2, s + 2);
    ctx.quadraticCurveTo(0, 26, 0, 6);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = COULEURS.fond;
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(10, 17); ctx.lineTo(15, 22); ctx.lineTo(24, 12); ctx.stroke();
  }
  ctx.restore();
}

/** Texte espace lettre par lettre (l'etiquette « S U P P O R T »). */
function texteEspace(ctx, texte, x, y, espace) {
  let cx = x;
  for (const lettre of texte) {
    ctx.fillText(lettre, cx, y);
    cx += ctx.measureText(lettre).width + espace;
  }
}

/** Reduit la police jusqu'a ce que le texte tienne dans la largeur. */
function ajuster(ctx, texte, famille, taille, largeurMax) {
  let t = taille;
  do {
    ctx.font = `${t}px ${famille}`;
    if (ctx.measureText(texte).width <= largeurMax) break;
    t -= 4;
  } while (t > 40);
  return t;
}

function petitLogo(ctx) {
  const x = 1758;
  const y = 578;
  ctx.fillStyle = COULEURS.logo;
  ctx.beginPath(); ctx.roundRect(x, y, 38, 38, 9); ctx.fill();
  ctx.fillStyle = COULEURS.fond;
  ctx.font = '22px WumiTitre';
  ctx.fillText('w.', x + 6, y + 27);
  ctx.fillStyle = COULEURS.logo;
  ctx.font = '44px WumiGras';
  ctx.fillText('wumi', x + 52, y + 33);
  const largeur = ctx.measureText('wumi').width;
  ctx.fillStyle = COULEURS.bleu;
  ctx.fillText('.', x + 52 + largeur + 2, y + 33);
}

function dessiner(def, langue) {
  const txt = def[langue];
  const canvas = createCanvas(L, H);
  const ctx = canvas.getContext('2d');

  fond(ctx);
  etincelle(ctx, 563, 135, 13);
  etincelle(ctx, 110, 550, 9);
  etincelle(ctx, 1640, 120, 7);
  logo(ctx);

  // Etiquette
  icone(ctx, def.icone, 702, 172);
  ctx.fillStyle = COULEURS.etiquette;
  ctx.font = '34px WumiGras';
  texteEspace(ctx, txt.tag, 770, 203, 7);

  // Titre
  ctx.fillStyle = COULEURS.titre;
  ajuster(ctx, txt.titre, 'WumiTitre', 152, 1180);
  ctx.fillText(txt.titre, 698, 362);

  // Sous-titre
  ctx.fillStyle = COULEURS.bleu;
  ajuster(ctx, txt.sous, 'WumiItalique', 104, 1180);
  ctx.fillText(txt.sous, 700, 470);

  petitLogo(ctx);
  return canvas.encode('png');
}

(async () => {
  fs.mkdirSync(SORTIE, { recursive: true });
  for (const [nom, def] of Object.entries(BANNIERES)) {
    for (const langue of ['fr', 'en']) {
      const png = await dessiner(def, langue);
      const fichier = path.join(SORTIE, `${nom}.${langue}.png`);
      fs.writeFileSync(fichier, png);
      console.log(`${path.relative(process.cwd(), fichier)} (${Math.round(png.length / 1024)} Ko)`);
    }
  }
})();
