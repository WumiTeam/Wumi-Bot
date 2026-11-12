/**
 * La liste PUBLIQUE des commandes, construite a partir des commandes chargees.
 * Servie par /api/commandes (lue par la page wumi.fr/commandes) et utilisee
 * par outils/generer-commandes.js. Les commandes du fondateur n'y sont jamais.
 */
const CATEGORIES = {
  moderation: { e: '🛡️', fr: 'Modération', en: 'Moderation' },
  config: { e: '⚙️', fr: 'Configuration', en: 'Setup' },
  tickets: { e: '🎫', fr: 'Tickets', en: 'Tickets' },
  niveau: { e: '📈', fr: 'Niveaux', en: 'Levels' },
  economie: { e: '💰', fr: 'Économie', en: 'Economy' },
  utilitaires: { e: '🧰', fr: 'Utilitaires & jeux', en: 'Utility & games' },
  suggestions: { e: '💡', fr: 'Suggestions', en: 'Suggestions' },
  candidatures: { e: '📝', fr: 'Candidatures', en: 'Applications' },
  invitations: { e: '✉️', fr: 'Invitations', en: 'Invites' },
  vocal: { e: '🔊', fr: 'Vocal', en: 'Voice' },
  musique: { e: '🎵', fr: 'Musique', en: 'Music' },
  'clic-droit': { e: '🖱️', fr: 'Clic droit', en: 'Right-click' },
};

// La description « par defaut » du bot est en francais : l'anglais est dans
// les localisations en-US / en-GB.
const anglais = (o) => o.description_localizations?.['en-US'] ?? o.description_localizations?.['en-GB'] ?? o.description;
const francais = (o) => o.description_localizations?.fr ?? o.description;

function sous(options = []) {
  const liste = [];
  for (const o of options) {
    if (o.type === 1) {
      liste.push({ en: o.name, fr: o.name_localizations?.fr ?? o.name, den: anglais(o), dfr: francais(o) });
    } else if (o.type === 2) {
      for (const s of o.options ?? []) {
        liste.push({
          en: `${o.name} ${s.name}`,
          fr: `${o.name_localizations?.fr ?? o.name} ${s.name_localizations?.fr ?? s.name}`,
          den: anglais(s),
          dfr: francais(s),
        });
      }
    }
  }
  return liste;
}

/** @param {Iterable<object>} modules les modules de commandes (data, categorie, fondateur) */
function construire(modules) {
  const commandes = [];
  for (const module of modules) {
    if (!module?.data || module.fondateur || module.beta || module.support) continue;
    const j = typeof module.data.toJSON === 'function' ? module.data.toJSON() : module.data;
    const type = j.type ?? 1;
    commandes.push({
      cat: type === 1 ? (CATEGORIES[module.categorie] ? module.categorie : 'utilitaires') : 'clic-droit',
      en: j.name,
      fr: j.name_localizations?.fr ?? j.name,
      den: type === 1 ? anglais(j) : '',
      dfr: type === 1 ? francais(j) : '',
      staff: Boolean(j.default_member_permissions && j.default_member_permissions !== '0'),
      clic: type !== 1,
      sous: type === 1 ? sous(j.options) : [],
    });
  }
  commandes.sort((a, b) => a.en.localeCompare(b.en));
  return { categories: CATEGORIES, commandes };
}

module.exports = { construire, CATEGORIES };
