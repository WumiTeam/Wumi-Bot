/**
 * Wumi 2.34 · SERIE 1 DES CARTES : 72 creatures, 12 par famille.
 *
 * Repartition des raretes (sur 72) : 24 communes, 18 peu communes, 14 rares,
 * 9 epiques, 5 legendaires, 2 mythiques. Les noms sont des noms propres :
 * identiques dans toutes les langues.
 *
 * Champs de dessin (voir creatures.js) : corps, oreilles, yeux, bouche,
 * queue, extra, ventre, joues, couleurs (variante de peau/accent).
 *
 * NE JAMAIS RENUMEROTER une fois en ligne : le numero est ce qui est
 * enregistre dans les collections des membres.
 */
const c = (numero, nom, element, rarete, puissance, eclat, dessin) => ({ numero, nom, element, rarete, puissance, eclat, ...dessin });

// Variantes de couleur, pour que deux creatures d'une meme famille ne se confondent pas.
const V = {
  rouge: { peau: ['#ff8a7a', '#e0453a'] },
  jaune: { peau: ['#ffe27a', '#f5b82e'] },
  creme: { peau: ['#fff1d6', '#f2c98f'] },
  menthe: { peau: ['#c6fff0', '#5fd6b5'] },
  gris: { peau: ['#e4e6f2', '#9da3c2'] },
  lilas: { peau: ['#e8d6ff', '#a98ae8'] },
  noir: { peau: ['#6a6488', '#35304f'], accent: '#5fffb0' },
  cyan: { peau: ['#bff7ff', '#4fc3e8'] },
  orange: { peau: ['#ffd0a0', '#ff8a3d'] },
  rose: { peau: ['#ffd6ea', '#ff7ab8'] },
  bleu: { peau: ['#c9e0ff', '#5b8cf0'] },
  or: { peau: ['#fff3b0', '#f2b53a'], accent: '#ff5fd2' },
};

const SERIE1 = [
  // ------------------------------------------------------------ PIXEL (1-12)
  c(1, 'Pixou', 'pixel', 'commune', 28, 24, { corps: 'robot', oreilles: 'pixel', yeux: 'rond', bouche: 'sourire', queue: 'pixel' }),
  c(2, 'Bitounet', 'pixel', 'commune', 22, 31, { corps: 'rond', oreilles: 'antenne', yeux: 'grands', bouche: 'o', queue: 'pixel', couleurs: V.jaune }),
  c(3, 'Manettin', 'pixel', 'commune', 33, 20, { corps: 'robot', oreilles: 'cornes', yeux: 'malin', bouche: 'croc', queue: 'cable', couleurs: V.rouge }),
  c(4, 'Joystou', 'pixel', 'commune', 25, 27, { corps: 'poire', oreilles: 'antenne', yeux: 'joie', bouche: 'chat', queue: 'touffe', couleurs: V.creme }),
  c(5, 'Tapetou', 'pixel', 'peu_commune', 36, 49, { corps: 'robot', oreilles: 'aucune', yeux: 'rond', bouche: 'o', extra: 'frappe' }),
  c(6, 'Checkpointe', 'pixel', 'peu_commune', 44, 41, { corps: 'goutte', oreilles: 'etoile', yeux: 'joie', bouche: 'sourire', queue: 'touffe', couleurs: V.jaune }),
  c(7, 'Lootix', 'pixel', 'peu_commune', 46, 39, { corps: 'rond', oreilles: 'gemme', yeux: 'malin', bouche: 'rire', queue: 'pixel', couleurs: V.rouge }),
  c(8, 'Arcadine', 'pixel', 'rare', 55, 63, { corps: 'goutte', oreilles: 'lapin', yeux: 'joie', bouche: 'rire', queue: 'pixel' }),
  c(9, 'Spritou', 'pixel', 'rare', 59, 56, { corps: 'fantome', oreilles: 'pixel', yeux: 'grands', bouche: 'sourire', ventre: false, couleurs: V.creme }),
  c(10, 'Respawnix', 'pixel', 'epique', 78, 69, { corps: 'haut', oreilles: 'pixel', yeux: 'malin', bouche: 'croc', queue: 'eclair' }),
  c(11, 'Speedrunix', 'pixel', 'epique', 82, 71, { corps: 'goutte', oreilles: 'flamme', yeux: 'malin', bouche: 'rire', queue: 'eclair', couleurs: V.rouge }),
  c(12, 'Boss Final', 'pixel', 'legendaire', 94, 84, { corps: 'robot', oreilles: 'couronne', yeux: 'malin', bouche: 'croc', queue: 'flamme' }),

  // ------------------------------------------------------------ NUAGE (13-24)
  c(13, 'Uploadi', 'nuage', 'commune', 21, 30, { corps: 'rond', oreilles: 'antenne', yeux: 'joie', bouche: 'sourire', queue: 'touffe' }),
  c(14, 'Buffi', 'nuage', 'commune', 18, 34, { corps: 'rond', oreilles: 'aucune', yeux: 'endormi', bouche: 'o', queue: 'touffe', couleurs: V.gris }),
  c(15, 'Downlou', 'nuage', 'commune', 30, 25, { corps: 'goutte', oreilles: 'nageoires', yeux: 'rond', bouche: 'chat', queue: 'poisson', couleurs: V.cyan }),
  c(16, 'Cookinou', 'nuage', 'commune', 24, 29, { corps: 'rond', oreilles: 'chat', yeux: 'grands', bouche: 'chat', queue: 'touffe', couleurs: V.creme }),
  c(17, 'Slowmo', 'nuage', 'peu_commune', 38, 46, { corps: 'poire', oreilles: 'antennes', yeux: 'endormi', bouche: 'sourire', queue: 'aucune', couleurs: V.menthe }),
  c(18, 'Synchro', 'nuage', 'peu_commune', 45, 43, { corps: 'rond', oreilles: 'wifi', yeux: 'ecran', bouche: 'sourire', queue: 'cable', couleurs: V.gris }),
  c(19, 'Proxou', 'nuage', 'peu_commune', 42, 40, { corps: 'robot', oreilles: 'cornes', yeux: 'rond', bouche: 'sourire', queue: 'cable', couleurs: V.bleu }),
  c(20, 'Wifou', 'nuage', 'rare', 52, 60, { corps: 'rond', oreilles: 'wifi', yeux: 'grands', bouche: 'sourire', queue: 'touffe' }),
  c(21, 'Cloudy', 'nuage', 'rare', 58, 66, { corps: 'fantome', oreilles: 'aucune', yeux: 'joie', bouche: 'rire', ventre: false }),
  c(22, 'Hébergou', 'nuage', 'rare', 62, 55, { corps: 'haut', oreilles: 'antenne', yeux: 'ecran', bouche: 'sourire', queue: 'cable', couleurs: V.bleu }),
  c(23, 'Firewalou', 'nuage', 'epique', 81, 72, { corps: 'robot', oreilles: 'flamme', yeux: 'ecran', bouche: 'croc', queue: 'flamme' }),
  c(24, 'Cumulonimbot', 'nuage', 'legendaire', 91, 90, { corps: 'fantome', oreilles: 'couronne', yeux: 'ecran', bouche: 'rire', ventre: false, couleurs: V.gris }),

  // ------------------------------------------------------------ GLITCH (25-36)
  c(25, 'Bugsy', 'glitch', 'commune', 31, 22, { corps: 'rond', oreilles: 'antennes', yeux: 'malin', bouche: 'croc', extra: 'insecte' }),
  c(26, 'Introuvix', 'glitch', 'commune', 24, 29, { corps: 'fantome', oreilles: 'aucune', yeux: 'cyclope', bouche: 'o', ventre: false, couleurs: V.menthe }),
  c(27, 'Crashou', 'glitch', 'commune', 35, 18, { corps: 'robot', oreilles: 'antenne', yeux: 'endormi', bouche: 'chat', queue: 'cable', couleurs: V.gris }),
  c(28, 'Popupi', 'glitch', 'commune', 27, 30, { corps: 'robot', oreilles: 'pixel', yeux: 'grands', bouche: 'o', queue: 'pixel', couleurs: V.rose }),
  c(29, 'Spamster', 'glitch', 'peu_commune', 47, 35, { corps: 'poire', oreilles: 'chat', yeux: 'malin', bouche: 'rire', queue: 'eclair' }),
  c(30, 'Lagounet', 'glitch', 'peu_commune', 39, 47, { corps: 'poire', oreilles: 'antenne', yeux: 'endormi', bouche: 'chat', queue: 'cable', couleurs: V.menthe }),
  c(31, 'Virussou', 'glitch', 'peu_commune', 49, 31, { corps: 'rond', oreilles: 'cornes', yeux: 'cyclope', bouche: 'croc', extra: 'insecte', couleurs: V.noir }),
  c(32, 'Patchou', 'glitch', 'rare', 54, 61, { corps: 'robot', oreilles: 'feuilles', yeux: 'grands', bouche: 'sourire', queue: 'pixel' }),
  c(33, 'Débuggo', 'glitch', 'rare', 60, 58, { corps: 'haut', oreilles: 'antennes', yeux: 'rond', bouche: 'sourire', extra: 'insecte', couleurs: V.cyan }),
  c(34, 'Ctrl-Z', 'glitch', 'epique', 72, 80, { corps: 'haut', oreilles: 'antennes', yeux: 'ecran', bouche: 'sourire', queue: 'cable' }),
  c(35, 'Bluescreen', 'glitch', 'epique', 77, 74, { corps: 'robot', oreilles: 'antenne', yeux: 'endormi', bouche: 'o', queue: 'cable', couleurs: V.bleu }),
  c(36, 'Le Grand Bug', 'glitch', 'legendaire', 92, 86, { corps: 'rond', oreilles: 'antennes', yeux: 'cyclope', bouche: 'croc', extra: 'insecte', queue: 'eclair', couleurs: V.noir }),

  // ------------------------------------------------------------ NEON (37-48)
  c(37, 'Emojo', 'neon', 'commune', 20, 36, { corps: 'rond', oreilles: 'aucune', yeux: 'joie', bouche: 'rire', queue: 'etoile', couleurs: V.jaune }),
  c(38, 'Pingo', 'neon', 'commune', 29, 27, { corps: 'goutte', oreilles: 'antenne', yeux: 'grands', bouche: 'o', queue: 'eclair' }),
  c(39, 'Gifou', 'neon', 'commune', 26, 32, { corps: 'robot', oreilles: 'chat', yeux: 'joie', bouche: 'rire', queue: 'pixel', couleurs: V.cyan }),
  c(40, 'Stickeur', 'neon', 'commune', 23, 35, { corps: 'rond', oreilles: 'lapin', yeux: 'rond', bouche: 'sourire', queue: 'etoile', couleurs: V.lilas }),
  c(41, 'Streamy', 'neon', 'peu_commune', 41, 48, { corps: 'robot', oreilles: 'casque', yeux: 'joie', bouche: 'sourire', queue: 'cable' }),
  c(42, 'Réacto', 'neon', 'peu_commune', 37, 50, { corps: 'rond', oreilles: 'chat', yeux: 'grands', bouche: 'rire', queue: 'etoile', couleurs: V.orange }),
  c(43, 'Hashtagou', 'neon', 'peu_commune', 43, 45, { corps: 'poire', oreilles: 'pixel', yeux: 'malin', bouche: 'sourire', queue: 'eclair', couleurs: V.lilas }),
  c(44, 'Everyonne', 'neon', 'rare', 63, 52, { corps: 'poire', oreilles: 'lapin', yeux: 'malin', bouche: 'rire', queue: 'eclair' }),
  c(45, 'Notifa', 'neon', 'rare', 57, 64, { corps: 'goutte', oreilles: 'lapin', yeux: 'malin', bouche: 'rire', queue: 'eclair', couleurs: V.rouge }),
  c(46, 'Clipou', 'neon', 'rare', 61, 59, { corps: 'robot', oreilles: 'casque', yeux: 'ecran', bouche: 'rire', queue: 'etoile', couleurs: V.cyan }),
  c(47, 'Viralou', 'neon', 'epique', 76, 79, { corps: 'haut', oreilles: 'etoile', yeux: 'joie', bouche: 'rire', queue: 'eclair' }),
  c(48, 'Boostar', 'neon', 'legendaire', 90, 95, { corps: 'rond', oreilles: 'gemme', yeux: 'joie', bouche: 'rire', queue: 'etoile' }),

  // ------------------------------------------------------------ NUIT (49-60)
  c(49, 'Mutix', 'nuit', 'commune', 26, 23, { corps: 'rond', oreilles: 'chat', yeux: 'endormi', bouche: 'chat', queue: 'touffe' }),
  c(50, 'Lurkeur', 'nuit', 'commune', 23, 32, { corps: 'fantome', oreilles: 'aucune', yeux: 'rond', bouche: 'o', ventre: false, couleurs: V.gris }),
  c(51, 'AFKou', 'nuit', 'commune', 19, 28, { corps: 'poire', oreilles: 'aucune', yeux: 'endormi', bouche: 'o', queue: 'touffe', couleurs: V.bleu }),
  c(52, 'Insomnix', 'nuit', 'commune', 30, 26, { corps: 'goutte', oreilles: 'lapin', yeux: 'grands', bouche: 'o', queue: 'etoile', couleurs: V.lilas }),
  c(53, 'Modérato', 'nuit', 'peu_commune', 48, 37, { corps: 'robot', oreilles: 'cornes', yeux: 'rond', bouche: 'sourire', queue: 'aucune' }),
  c(54, 'Bannix', 'nuit', 'peu_commune', 50, 33, { corps: 'haut', oreilles: 'cornes', yeux: 'malin', bouche: 'croc', queue: 'eclair', couleurs: V.noir }),
  c(55, 'Kickou', 'nuit', 'peu_commune', 46, 38, { corps: 'rond', oreilles: 'chat', yeux: 'malin', bouche: 'croc', queue: 'eclair', couleurs: V.rouge }),
  c(56, 'Captchat', 'nuit', 'rare', 60, 58, { corps: 'rond', oreilles: 'chat', yeux: 'cyclope', bouche: 'sourire', queue: 'touffe' }),
  c(57, 'Lunabot', 'nuit', 'rare', 56, 65, { corps: 'robot', oreilles: 'antenne', yeux: 'ecran', bouche: 'sourire', queue: 'etoile', couleurs: V.creme }),
  c(58, 'Ghostping', 'nuit', 'epique', 74, 81, { corps: 'fantome', oreilles: 'aucune', yeux: 'malin', bouche: 'rire', ventre: false }),
  c(59, 'Raidix', 'nuit', 'epique', 83, 68, { corps: 'haut', oreilles: 'cornes', yeux: 'cyclope', bouche: 'croc', queue: 'flamme', couleurs: V.noir }),
  c(60, 'Le Gardien du Serveur', 'nuit', 'legendaire', 96, 88, { corps: 'haut', oreilles: 'aureole', yeux: 'ecran', bouche: 'sourire', queue: 'etoile' }),

  // ------------------------------------------------------------ COSMOS (61-72)
  c(61, 'Satellou', 'cosmos', 'commune', 27, 33, { corps: 'rond', oreilles: 'antenne', yeux: 'grands', bouche: 'o', queue: 'etoile' }),
  c(62, 'Comètine', 'cosmos', 'commune', 32, 26, { corps: 'goutte', oreilles: 'etoile', yeux: 'joie', bouche: 'sourire', queue: 'etoile', couleurs: V.jaune }),
  c(63, 'Météorou', 'cosmos', 'commune', 34, 21, { corps: 'rond', oreilles: 'cornes', yeux: 'malin', bouche: 'croc', queue: 'flamme', couleurs: V.orange }),
  c(64, 'Plutounet', 'cosmos', 'commune', 20, 35, { corps: 'rond', oreilles: 'aucune', yeux: 'endormi', bouche: 'chat', queue: 'touffe', couleurs: V.rose }),
  c(65, 'Orbitou', 'cosmos', 'peu_commune', 43, 44, { corps: 'rond', oreilles: 'aureole', yeux: 'rond', bouche: 'chat', queue: 'touffe', couleurs: V.lilas }),
  c(66, 'Astronette', 'cosmos', 'peu_commune', 40, 51, { corps: 'robot', oreilles: 'casque', yeux: 'ecran', bouche: 'sourire', queue: 'etoile' }),
  c(67, 'Fuzéo', 'cosmos', 'peu_commune', 47, 42, { corps: 'haut', oreilles: 'etoile', yeux: 'grands', bouche: 'rire', queue: 'flamme', couleurs: V.gris }),
  c(68, 'Galaxou', 'cosmos', 'rare', 61, 57, { corps: 'poire', oreilles: 'cornes', yeux: 'grands', bouche: 'rire', queue: 'etoile', couleurs: V.rose }),
  c(69, 'Nébulix', 'cosmos', 'rare', 56, 67, { corps: 'fantome', oreilles: 'etoile', yeux: 'cyclope', bouche: 'sourire', ventre: false }),
  c(70, 'Orbitrix', 'cosmos', 'epique', 79, 77, { corps: 'haut', oreilles: 'gemme', yeux: 'grands', bouche: 'sourire', queue: 'etoile' }),
  c(71, 'Supernova', 'cosmos', 'mythique', 98, 99, { corps: 'rond', oreilles: 'couronne', yeux: 'joie', bouche: 'rire', queue: 'etoile', couleurs: V.or }),
  c(72, 'Wumi Astral', 'cosmos', 'mythique', 99, 99, { corps: 'robot', oreilles: 'antenne', yeux: 'ecran', bouche: 'rire', queue: 'etoile' }),
];

const FAMILLES = ['pixel', 'nuage', 'glitch', 'neon', 'nuit', 'cosmos'];
const RARETES = ['commune', 'peu_commune', 'rare', 'epique', 'legendaire', 'mythique'];
const PAR_NUMERO = new Map(SERIE1.map((x) => [x.numero, x]));

module.exports = { SERIE1, FAMILLES, RARETES, PAR_NUMERO, TOTAL: SERIE1.length };
