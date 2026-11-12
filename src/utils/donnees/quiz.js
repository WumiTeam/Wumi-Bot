/**
 * Questions du quiz, en francais et en anglais. `b` = index de la bonne
 * reponse dans `r` (les reponses sont melangees a l'affichage).
 * Que des faits stables et verifiables : pas de « record actuel », pas de
 * chiffre qui change d'une annee a l'autre.
 */
const Q = [
  ['geo', { q: 'Quelle est la capitale de l’Australie ?', r: ['Canberra', 'Sydney', 'Melbourne', 'Perth'] }, { q: 'What is the capital of Australia?', r: ['Canberra', 'Sydney', 'Melbourne', 'Perth'] }],
  ['geo', { q: 'Quel est le plus long fleuve de France ?', r: ['La Loire', 'La Seine', 'Le Rhône', 'La Garonne'] }, { q: 'What is the longest river in France?', r: ['The Loire', 'The Seine', 'The Rhône', 'The Garonne'] }],
  ['geo', { q: 'Quel océan borde la côte ouest des États-Unis ?', r: ['Pacifique', 'Atlantique', 'Indien', 'Arctique'] }, { q: 'Which ocean borders the west coast of the United States?', r: ['Pacific', 'Atlantic', 'Indian', 'Arctic'] }],
  ['geo', { q: 'Quel est le plus grand pays du monde par sa superficie ?', r: ['La Russie', 'Le Canada', 'La Chine', 'Les États-Unis'] }, { q: 'Which is the largest country in the world by area?', r: ['Russia', 'Canada', 'China', 'United States'] }],
  ['geo', { q: 'Dans quel pays se trouve Machu Picchu ?', r: ['Pérou', 'Mexique', 'Chili', 'Bolivie'] }, { q: 'In which country is Machu Picchu?', r: ['Peru', 'Mexico', 'Chile', 'Bolivia'] }],
  ['geo', { q: 'Quelle est la capitale du Canada ?', r: ['Ottawa', 'Toronto', 'Montréal', 'Vancouver'] }, { q: 'What is the capital of Canada?', r: ['Ottawa', 'Toronto', 'Montreal', 'Vancouver'] }],
  ['geo', { q: 'Quel est le plus haut sommet du monde ?', r: ['L’Everest', 'Le K2', 'Le Mont Blanc', 'Le Kilimandjaro'] }, { q: 'What is the highest mountain in the world?', r: ['Mount Everest', 'K2', 'Mont Blanc', 'Kilimanjaro'] }],
  ['geo', { q: 'Sur quel continent se trouve l’Égypte ?', r: ['Afrique', 'Asie', 'Europe', 'Océanie'] }, { q: 'On which continent is Egypt?', r: ['Africa', 'Asia', 'Europe', 'Oceania'] }],
  ['geo', { q: 'Quelle est la capitale du Japon ?', r: ['Tokyo', 'Kyoto', 'Osaka', 'Séoul'] }, { q: 'What is the capital of Japan?', r: ['Tokyo', 'Kyoto', 'Osaka', 'Seoul'] }],
  ['geo', { q: 'Quel pays a la forme d’une botte ?', r: ['L’Italie', 'La Grèce', 'L’Espagne', 'Le Portugal'] }, { q: 'Which country is shaped like a boot?', r: ['Italy', 'Greece', 'Spain', 'Portugal'] }],
  ['geo', { q: 'Quel est le plus grand désert chaud du monde ?', r: ['Le Sahara', 'Le Gobi', 'Le Kalahari', 'L’Atacama'] }, { q: 'What is the largest hot desert in the world?', r: ['The Sahara', 'The Gobi', 'The Kalahari', 'The Atacama'] }],
  ['geo', { q: 'Quelle est la capitale de l’Espagne ?', r: ['Madrid', 'Barcelone', 'Séville', 'Lisbonne'] }, { q: 'What is the capital of Spain?', r: ['Madrid', 'Barcelona', 'Seville', 'Lisbon'] }],

  ['sci', { q: 'Quel est le symbole chimique de l’or ?', r: ['Au', 'Ag', 'Or', 'Go'] }, { q: 'What is the chemical symbol for gold?', r: ['Au', 'Ag', 'Gd', 'Go'] }],
  ['sci', { q: 'Quelle planète est la plus proche du Soleil ?', r: ['Mercure', 'Vénus', 'Mars', 'Terre'] }, { q: 'Which planet is closest to the Sun?', r: ['Mercury', 'Venus', 'Mars', 'Earth'] }],
  ['sci', { q: 'Quelle est la plus grande planète du système solaire ?', r: ['Jupiter', 'Saturne', 'Neptune', 'Uranus'] }, { q: 'What is the largest planet in the solar system?', r: ['Jupiter', 'Saturn', 'Neptune', 'Uranus'] }],
  ['sci', { q: 'À quelle température l’eau bout-elle au niveau de la mer ?', r: ['100 °C', '90 °C', '80 °C', '120 °C'] }, { q: 'At what temperature does water boil at sea level?', r: ['100 °C', '90 °C', '80 °C', '120 °C'] }],
  ['sci', { q: 'Combien de pattes a une araignée ?', r: ['8', '6', '10', '12'] }, { q: 'How many legs does a spider have?', r: ['8', '6', '10', '12'] }],
  ['sci', { q: 'Quel gaz les plantes absorbent-elles pour la photosynthèse ?', r: ['Le dioxyde de carbone', 'L’oxygène', 'L’azote', 'L’hélium'] }, { q: 'Which gas do plants absorb for photosynthesis?', r: ['Carbon dioxide', 'Oxygen', 'Nitrogen', 'Helium'] }],
  ['sci', { q: 'Quel est l’organe qui pompe le sang dans le corps ?', r: ['Le cœur', 'Le foie', 'Les poumons', 'Les reins'] }, { q: 'Which organ pumps blood around the body?', r: ['The heart', 'The liver', 'The lungs', 'The kidneys'] }],
  ['sci', { q: 'Quelle est la formule chimique de l’eau ?', r: ['H₂O', 'CO₂', 'O₂', 'NaCl'] }, { q: 'What is the chemical formula of water?', r: ['H₂O', 'CO₂', 'O₂', 'NaCl'] }],
  ['sci', { q: 'Combien d’os compte le squelette d’un adulte ?', r: ['206', '186', '226', '306'] }, { q: 'How many bones are in the adult human skeleton?', r: ['206', '186', '226', '306'] }],
  ['sci', { q: 'Quelle planète est surnommée la planète rouge ?', r: ['Mars', 'Jupiter', 'Vénus', 'Saturne'] }, { q: 'Which planet is known as the Red Planet?', r: ['Mars', 'Jupiter', 'Venus', 'Saturn'] }],
  ['sci', { q: 'Quel est le plus grand mammifère du monde ?', r: ['La baleine bleue', 'L’éléphant d’Afrique', 'La girafe', 'Le cachalot'] }, { q: 'What is the largest mammal in the world?', r: ['The blue whale', 'The African elephant', 'The giraffe', 'The sperm whale'] }],
  ['sci', { q: 'Combien de temps la lumière du Soleil met-elle environ pour atteindre la Terre ?', r: ['8 minutes', '8 secondes', '1 heure', '1 jour'] }, { q: 'Roughly how long does sunlight take to reach Earth?', r: ['8 minutes', '8 seconds', '1 hour', '1 day'] }],
  ['sci', { q: 'Quel métal est liquide à température ambiante ?', r: ['Le mercure', 'Le plomb', 'L’étain', 'Le zinc'] }, { q: 'Which metal is liquid at room temperature?', r: ['Mercury', 'Lead', 'Tin', 'Zinc'] }],

  ['hist', { q: 'En quelle année a eu lieu la prise de la Bastille ?', r: ['1789', '1792', '1776', '1815'] }, { q: 'In which year was the Bastille stormed?', r: ['1789', '1792', '1776', '1815'] }],
  ['hist', { q: 'Qui a été le premier homme à marcher sur la Lune ?', r: ['Neil Armstrong', 'Buzz Aldrin', 'Youri Gagarine', 'John Glenn'] }, { q: 'Who was the first person to walk on the Moon?', r: ['Neil Armstrong', 'Buzz Aldrin', 'Yuri Gagarin', 'John Glenn'] }],
  ['hist', { q: 'En quelle année l’homme a-t-il marché sur la Lune pour la première fois ?', r: ['1969', '1965', '1972', '1959'] }, { q: 'In which year did humans first walk on the Moon?', r: ['1969', '1965', '1972', '1959'] }],
  ['hist', { q: 'Quelle civilisation a construit les pyramides de Gizeh ?', r: ['Les Égyptiens', 'Les Romains', 'Les Grecs', 'Les Mayas'] }, { q: 'Which civilization built the pyramids of Giza?', r: ['The Egyptians', 'The Romans', 'The Greeks', 'The Maya'] }],
  ['hist', { q: 'En quelle année a pris fin la Seconde Guerre mondiale ?', r: ['1945', '1944', '1918', '1950'] }, { q: 'In which year did World War II end?', r: ['1945', '1944', '1918', '1950'] }],
  ['hist', { q: 'Qui a peint la Joconde ?', r: ['Léonard de Vinci', 'Michel-Ange', 'Raphaël', 'Botticelli'] }, { q: 'Who painted the Mona Lisa?', r: ['Leonardo da Vinci', 'Michelangelo', 'Raphael', 'Botticelli'] }],
  ['hist', { q: 'En quelle année le mur de Berlin est-il tombé ?', r: ['1989', '1991', '1985', '1961'] }, { q: 'In which year did the Berlin Wall fall?', r: ['1989', '1991', '1985', '1961'] }],
  ['hist', { q: 'Quel navigateur est arrivé en Amérique en 1492 ?', r: ['Christophe Colomb', 'Vasco de Gama', 'Magellan', 'Jacques Cartier'] }, { q: 'Which explorer reached the Americas in 1492?', r: ['Christopher Columbus', 'Vasco da Gama', 'Magellan', 'Jacques Cartier'] }],
  ['hist', { q: 'Dans quelle ville se trouve le Colisée ?', r: ['Rome', 'Athènes', 'Naples', 'Istanbul'] }, { q: 'In which city is the Colosseum?', r: ['Rome', 'Athens', 'Naples', 'Istanbul'] }],
  ['hist', { q: 'Quel empereur français a été exilé à Sainte-Hélène ?', r: ['Napoléon Ier', 'Napoléon III', 'Charlemagne', 'Louis XIV'] }, { q: 'Which French emperor was exiled to Saint Helena?', r: ['Napoleon I', 'Napoleon III', 'Charlemagne', 'Louis XIV'] }],

  ['culture', { q: 'Combien de cordes a une guitare classique ?', r: ['6', '4', '7', '12'] }, { q: 'How many strings does a standard guitar have?', r: ['6', '4', '7', '12'] }],
  ['culture', { q: 'Quel auteur a écrit « Les Misérables » ?', r: ['Victor Hugo', 'Émile Zola', 'Gustave Flaubert', 'Alexandre Dumas'] }, { q: 'Who wrote « Les Misérables »?', r: ['Victor Hugo', 'Émile Zola', 'Gustave Flaubert', 'Alexandre Dumas'] }],
  ['culture', { q: 'Qui a écrit « Roméo et Juliette » ?', r: ['William Shakespeare', 'Molière', 'Charles Dickens', 'Jane Austen'] }, { q: 'Who wrote « Romeo and Juliet »?', r: ['William Shakespeare', 'Molière', 'Charles Dickens', 'Jane Austen'] }],
  ['culture', { q: 'Combien de touches compte un piano standard ?', r: ['88', '76', '61', '100'] }, { q: 'How many keys does a standard piano have?', r: ['88', '76', '61', '100'] }],
  ['culture', { q: 'Quel compositeur est devenu sourd mais a continué à composer ?', r: ['Beethoven', 'Mozart', 'Bach', 'Chopin'] }, { q: 'Which composer went deaf but kept composing?', r: ['Beethoven', 'Mozart', 'Bach', 'Chopin'] }],
  ['culture', { q: 'Dans quel pays sont nés les Jeux olympiques antiques ?', r: ['La Grèce', 'L’Italie', 'L’Égypte', 'La Turquie'] }, { q: 'In which country did the ancient Olympic Games begin?', r: ['Greece', 'Italy', 'Egypt', 'Turkey'] }],
  ['culture', { q: 'Combien de joueurs une équipe de football a-t-elle sur le terrain ?', r: ['11', '10', '9', '12'] }, { q: 'How many players does a soccer team have on the field?', r: ['11', '10', '9', '12'] }],
  ['culture', { q: 'Combien de cases compte un échiquier ?', r: ['64', '81', '49', '100'] }, { q: 'How many squares are on a chessboard?', r: ['64', '81', '49', '100'] }],
  ['culture', { q: 'De quelle couleur est la toute première ceinture au judo ?', r: ['Blanche', 'Jaune', 'Noire', 'Verte'] }, { q: 'What color is the very first belt in judo?', r: ['White', 'Yellow', 'Black', 'Green'] }],
  ['culture', { q: 'Combien de cartes compte un jeu classique sans jokers ?', r: ['52', '54', '32', '48'] }, { q: 'How many cards are in a standard deck without jokers?', r: ['52', '54', '32', '48'] }],
  ['culture', { q: 'Quelle est la langue la plus parlée au Brésil ?', r: ['Le portugais', 'L’espagnol', 'Le français', 'L’anglais'] }, { q: 'What is the main language spoken in Brazil?', r: ['Portuguese', 'Spanish', 'French', 'English'] }],

  ['tech', { q: 'Que signifie « www » dans une adresse web ?', r: ['World Wide Web', 'Wide Web World', 'Web World Wide', 'World Web Window'] }, { q: 'What does « www » stand for in a web address?', r: ['World Wide Web', 'Wide Web World', 'Web World Wide', 'World Web Window'] }],
  ['tech', { q: 'Combien de bits compte un octet ?', r: ['8', '4', '16', '10'] }, { q: 'How many bits are in a byte?', r: ['8', '4', '16', '10'] }],
  ['tech', { q: 'Que veut dire « CPU » ?', r: ['Central Processing Unit', 'Computer Power Unit', 'Central Program Utility', 'Core Processing User'] }, { q: 'What does « CPU » stand for?', r: ['Central Processing Unit', 'Computer Power Unit', 'Central Program Utility', 'Core Processing User'] }],
  ['tech', { q: 'Quel langage sert à mettre en forme les pages web ?', r: ['CSS', 'SQL', 'Python', 'C++'] }, { q: 'Which language is used to style web pages?', r: ['CSS', 'SQL', 'Python', 'C++'] }],
  ['tech', { q: 'Quel est le système binaire ?', r: ['Une base 2', 'Une base 10', 'Une base 8', 'Une base 16'] }, { q: 'What is the binary system?', r: ['Base 2', 'Base 10', 'Base 8', 'Base 16'] }],
  ['tech', { q: 'Combien vaut 1 kilooctet dans le système décimal ?', r: ['1 000 octets', '100 octets', '10 000 octets', '1 octet'] }, { q: 'How much is 1 kilobyte in the decimal system?', r: ['1,000 bytes', '100 bytes', '10,000 bytes', '1 byte'] }],

  ['nature', { q: 'Quel animal est le plus rapide sur terre ?', r: ['Le guépard', 'Le lion', 'L’antilope', 'Le cheval'] }, { q: 'What is the fastest land animal?', r: ['The cheetah', 'The lion', 'The antelope', 'The horse'] }],
  ['nature', { q: 'Combien de cœurs a une pieuvre ?', r: ['3', '1', '2', '8'] }, { q: 'How many hearts does an octopus have?', r: ['3', '1', '2', '8'] }],
  ['nature', { q: 'Quel oiseau ne peut pas voler ?', r: ['L’autruche', 'Le pigeon', 'L’aigle', 'La mouette'] }, { q: 'Which bird cannot fly?', r: ['The ostrich', 'The pigeon', 'The eagle', 'The seagull'] }],
  ['nature', { q: 'De quoi se nourrit principalement le panda géant ?', r: ['De bambou', 'De poisson', 'De fruits', 'D’insectes'] }, { q: 'What does the giant panda mainly eat?', r: ['Bamboo', 'Fish', 'Fruit', 'Insects'] }],
  ['nature', { q: 'Comment appelle-t-on un bébé grenouille ?', r: ['Un têtard', 'Un ourson', 'Un poussin', 'Un faon'] }, { q: 'What is a baby frog called?', r: ['A tadpole', 'A cub', 'A chick', 'A fawn'] }],
  ['nature', { q: 'Quel est le seul mammifère capable de voler vraiment ?', r: ['La chauve-souris', 'L’écureuil volant', 'Le colugo', 'Le pingouin'] }, { q: 'What is the only mammal capable of true flight?', r: ['The bat', 'The flying squirrel', 'The colugo', 'The penguin'] }],
  ['nature', { q: 'Combien de saisons compte une année en Europe ?', r: ['4', '2', '3', '6'] }, { q: 'How many seasons are there in a year in Europe?', r: ['4', '2', '3', '6'] }],

  ['maths', { q: 'Combien font 7 × 8 ?', r: ['56', '54', '64', '48'] }, { q: 'What is 7 × 8?', r: ['56', '54', '64', '48'] }],
  ['maths', { q: 'Combien de côtés a un hexagone ?', r: ['6', '5', '7', '8'] }, { q: 'How many sides does a hexagon have?', r: ['6', '5', '7', '8'] }],
  ['maths', { q: 'Quelle est la racine carrée de 144 ?', r: ['12', '14', '11', '16'] }, { q: 'What is the square root of 144?', r: ['12', '14', '11', '16'] }],
  ['maths', { q: 'Combien de degrés compte un angle droit ?', r: ['90°', '180°', '45°', '60°'] }, { q: 'How many degrees are in a right angle?', r: ['90°', '180°', '45°', '60°'] }],
  ['maths', { q: 'Quel est le plus petit nombre premier ?', r: ['2', '1', '3', '0'] }, { q: 'What is the smallest prime number?', r: ['2', '1', '3', '0'] }],
  ['maths', { q: 'Combien de minutes y a-t-il dans une journée ?', r: ['1 440', '1 200', '2 400', '3 600'] }, { q: 'How many minutes are there in a day?', r: ['1,440', '1,200', '2,400', '3,600'] }],
];

// La bonne reponse est toujours la premiere dans la source : plus simple a
// relire et a verifier. L'affichage melange.
module.exports = Q.map(([cat, fr, en]) => ({ cat, fr: { ...fr, b: 0 }, en: { ...en, b: 0 } }));
