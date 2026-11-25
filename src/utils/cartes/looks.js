/**
 * Wumi 3.1 · LE LOOK DE CHAQUE CARTE DE LA SERIE 1 (DA v3).
 * Les numeros, noms, familles, raretes et stats restent ceux de serie1.js :
 * seule l'illustration change. corps : wumi | bloop | robot | fantome |
 * oiseau | etoile | bug. yeux : expression de Wumi (outils/generer-emojis-tete)
 * ou style d'yeux des amis (persos.js).
 */
const L = (corps, yeux, ...acc) => ({ corps, yeux, acc });

module.exports = {
  // PIXEL — les gamers
  1: L('robot', 'joie', 'pixels'),
  2: L('bloop', 'grands', 'pixels'),
  3: L('wumi', 'louche', 'manette'),
  4: L('robot', 'joie', 'joystick'),
  5: L('wumi', 'colere', 'clavier'),
  6: L('oiseau', 'joie', 'drapeau'),
  7: L('bloop', 'etoiles', 'gemme'),
  8: L('wumi', 'clin', 'casquette'),
  9: L('fantome', 'grands', 'pixels'),
  10: L('robot', 'malin', 'coeurs', 'eclair'),
  11: L('wumi', 'cool', 'chrono', 'eclair'),
  12: L('wumi', 'colere', 'cape', 'couronne', 'eclairs'),
  // NUAGE — internet
  13: L('bloop', 'joie', 'fleche'),
  14: L('bloop', 'endormi', 'chargement'),
  15: L('oiseau', 'rond', 'flecheBas'),
  16: L('wumi', 'amour', 'cookie'),
  17: L('bloop', 'endormi', 'zz'),
  18: L('robot', 'joie', 'synchro'),
  19: L('fantome', 'lunettes'),
  20: L('wumi', 'joie', 'wifi'),
  21: L('bloop', 'joie', 'nuage'),
  22: L('robot', 'rond', 'maison'),
  23: L('wumi', 'colere', 'bouclierFeu'),
  24: L('robot', 'malin', 'aura', 'nuage', 'couronne', 'eclairs'),
  // GLITCH — les bugs
  25: L('bug', 'joie'),
  26: L('fantome', 'choc', 'point404'),
  27: L('robot', 'croix', 'fumee'),
  28: L('bloop', 'choc', 'exclam'),
  29: L('bug', 'malin', 'enveloppes'),
  30: L('wumi', 'dodo', 'sablier'),
  31: L('bug', 'colere', 'pointes'),
  32: L('robot', 'joie', 'pansement'),
  33: L('oiseau', 'grands', 'loupe'),
  34: L('wumi', 'clin', 'annuler'),
  35: L('robot', 'triste', 'ecran', 'triste'),
  36: L('bug', 'malin', 'aura', 'couronneGlitch', 'pointes'),
  // NEON — les reseaux
  37: L('etoile', 'joie'),
  38: L('oiseau', 'choc', 'arobase'),
  39: L('wumi', 'mdr', 'film'),
  40: L('bloop', 'amour', 'coeurSticker'),
  41: L('wumi', 'joie', 'micro'),
  42: L('etoile', 'amour', 'bulleCoeur'),
  43: L('bug', 'joie', 'diese'),
  44: L('oiseau', 'colere', 'megaphone'),
  45: L('bloop', 'choc', 'cloche'),
  46: L('robot', 'joie', 'camera'),
  47: L('etoile', 'etoiles', 'flammes'),
  48: L('wumi', 'etoiles', 'aura', 'couronne', 'boost'),
  // NUIT — la moderation
  49: L('fantome', 'endormi', 'scotch'),
  50: L('wumi', 'louche', 'capuche'),
  51: L('bloop', 'endormi', 'bonnet', 'zz'),
  52: L('oiseau', 'choc', 'lune'),
  53: L('wumi', 'reflexion', 'bouclier'),
  54: L('robot', 'colere', 'marteau'),
  55: L('bug', 'colere', 'eclair'),
  56: L('wumi', 'joie', 'coche'),
  57: L('robot', 'joie', 'lunePleine'),
  58: L('fantome', 'malin', 'arobase'),
  59: L('wumi', 'colere', 'bandeau', 'epee'),
  60: L('wumi', 'cool', 'cape', 'couronne', 'bouclier'),
  // COSMOS — l'espace
  61: L('robot', 'joie', 'antennes'),
  62: L('etoile', 'joie', 'traine'),
  63: L('bloop', 'choc', 'flammes'),
  64: L('bloop', 'triste'),
  65: L('etoile', 'joie', 'anneau'),
  66: L('wumi', 'joie', 'casqueSpatial'),
  67: L('robot', 'lunettes', 'fusee'),
  68: L('fantome', 'etoiles', 'spirale'),
  69: L('bloop', 'amour', 'nebuleuse'),
  70: L('etoile', 'malin', 'anneaux'),
  71: L('etoile', 'etoiles', 'rayons', 'etincelles'),
  72: L('wumi', 'joie', 'nebuleuse', 'casqueSpatial', 'etincelles'),
};
