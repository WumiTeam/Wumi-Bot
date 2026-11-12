/**
 * Les radios de /radio : des flux publics en direct, lus par Lavalink.
 * Verifiees depuis le serveur avec outils/verifier-radios.js.
 */
module.exports = [
  // Lofi Girl (direct YouTube) ne se lit pas : YouTube refuse ses directs aux
  // lecteurs comme Lavalink. On passe par un vrai flux radio lofi.
  { id: 'lofi', nom: 'Lofi Chillhop', genre: 'Lofi · chill', emoji: '🌙', url: 'https://streams.ilovemusic.de/iloveradio17.mp3' },
  { id: 'chill', nom: 'Groove Salad', genre: 'Chill · ambient', emoji: '🥗', url: 'https://ice1.somafm.com/groovesalad-128-mp3' },
  { id: 'beats', nom: 'Fluid', genre: 'Hip-hop instrumental', emoji: '💧', url: 'https://ice1.somafm.com/fluid-128-mp3' },
  { id: 'fip', nom: 'FIP', genre: 'Éclectique', emoji: '📻', url: 'https://icecast.radiofrance.fr/fip-midfi.mp3' },
  { id: 'electro', nom: 'FIP Electro', genre: 'Électro', emoji: '⚡', url: 'https://icecast.radiofrance.fr/fipelectro-midfi.mp3' },
  { id: 'jazz', nom: 'FIP Jazz', genre: 'Jazz', emoji: '🎷', url: 'https://icecast.radiofrance.fr/fipjazz-midfi.mp3' },
  { id: 'rock', nom: 'FIP Rock', genre: 'Rock', emoji: '🎸', url: 'https://icecast.radiofrance.fr/fiprock-midfi.mp3' },
  { id: 'groove', nom: 'FIP Groove', genre: 'Funk · soul', emoji: '🕺', url: 'https://icecast.radiofrance.fr/fipgroove-midfi.mp3' },
  { id: 'rap', nom: 'Mouv\'', genre: 'Rap', emoji: '🎤', url: 'https://icecast.radiofrance.fr/mouv-midfi.mp3' },
  { id: 'hits', nom: 'NRJ', genre: 'Hits', emoji: '🔥', url: 'https://scdn.nrjaudio.fm/adwz2/fr/30001/mp3_128.mp3' },
  { id: 'skyrock', nom: 'Skyrock', genre: 'Rap · RnB', emoji: '🚀', url: 'http://icecast.skyrock.net/s/natio_mp3_128k' },
  { id: 'classique', nom: 'France Musique', genre: 'Classique', emoji: '🎻', url: 'https://icecast.radiofrance.fr/francemusique-midfi.mp3' },
  { id: 'info', nom: 'France Inter', genre: 'Info · culture', emoji: '🗞️', url: 'https://icecast.radiofrance.fr/franceinter-midfi.mp3' },
];
