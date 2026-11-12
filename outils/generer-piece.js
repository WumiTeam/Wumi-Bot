/**
 * Regenere l'emoji de la piece Wumi Run (src/assets/emojis/bp_wumicoin.png)
 * a partir du dessin vectoriel de src/utils/pieceWumi.js.
 *   node outils/generer-piece.js
 */
const fs = require('node:fs');
const path = require('node:path');
const { createCanvas } = require('@napi-rs/canvas');
const { dessinerPiece } = require('../src/utils/pieceWumi');

const c = createCanvas(128, 128);
dessinerPiece(c.getContext('2d'), 2, 2, 124);
const sortie = path.join(__dirname, '..', 'src', 'assets', 'emojis', 'bp_wumicoin.png');
fs.writeFileSync(sortie, c.toBuffer('image/png'));
console.log('ok :', sortie);
