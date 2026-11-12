const conf = require('../../config');
const { req, config } = require('../database/db');
const logger = require('./logger');

const M = conf.missions ?? {};

/** Jour courant AAAA-MM-JJ, en heure de Paris. */
function jour(date = new Date()) {
  return new Intl.DateTimeFormat('fr-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

/**
 * Semaine ISO courante, au format AAAA-Snn.
 * La semaine ISO commence le lundi et la semaine 1 est celle du premier jeudi.
 */
function semaine(date = new Date()) {
  const d = new Date(`${jour(date)}T00:00:00Z`);
  const jourSemaine = (d.getUTCDay() + 6) % 7; // lundi = 0
  d.setUTCDate(d.getUTCDate() - jourSemaine + 3); // jeudi de la semaine
  const annee = d.getUTCFullYear();
  const premierJeudi = new Date(Date.UTC(annee, 0, 4));
  const decalage = (premierJeudi.getUTCDay() + 6) % 7;
  premierJeudi.setUTCDate(premierJeudi.getUTCDate() - decalage + 3);
  const numero = 1 + Math.round((d - premierJeudi) / (7 * 86_400_000));
  return `${annee}-S${String(numero).padStart(2, '0')}`;
}

/** Petit hachage stable : la meme periode donne toujours le meme tirage. */
function graine(texte) {
  let h = 2166136261;
  for (let i = 0; i < texte.length; i++) {
    h ^= texte.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Tire N elements distincts d'une reserve, de facon reproductible. */
function tirer(reserve, combien, cle) {
  const restants = [...reserve];
  const choisis = [];
  let g = graine(cle) || 1;
  while (choisis.length < Math.min(combien, reserve.length)) {
    g = (g * 1103515245 + 12345) % 2147483648;
    choisis.push(restants.splice(g % restants.length, 1)[0]);
  }
  return choisis;
}

/** Les deux periodes actives et leurs missions. */
function periodes(guildId) {
  return [
    { nom: 'jour', titre: 'Missions du jour', id: jour(), liste: tirer(M.reserveJour ?? [], M.parJour ?? 3, `${guildId}-${jour()}`) },
    {
      nom: 'semaine',
      titre: 'Missions de la semaine',
      id: semaine(),
      liste: tirer(M.reserveSemaine ?? [], M.parSemaine ?? 2, `${guildId}-${semaine()}`),
    },
  ];
}

/** Les missions actives d'un type donne, avec leur periode. */
function missionsDuType(guildId, type) {
  const sortie = [];
  for (const p of periodes(guildId)) {
    for (const m of p.liste) if (m.type === type) sortie.push({ mission: m, periode: p });
  }
  return sortie;
}

/**
 * Fait avancer les missions d'un type.
 * `valeurDistincte` sert aux missions "salons" : on ne compte un salon qu'une fois.
 */
function noter(guildId, userId, type, quantite = 1, valeurDistincte = null) {
  if (!M.actif || !guildId || !userId) return;
  try {
    if (!config(guildId).missions_actif) return;
  } catch {
    return;
  }

  for (const { mission, periode } of missionsDuType(guildId, type)) {
    try {
      if (valeurDistincte === null) {
        req.avancerMission.run({ guild_id: guildId, user_id: userId, periode: periode.id, cle: mission.cle, valeur: quantite, detail: null });
        continue;
      }
      // Valeurs distinctes : on garde la liste deja vue dans `detail`.
      const ligne = req.progresMission.get(guildId, userId, periode.id, mission.cle);
      const vues = ligne?.detail ? ligne.detail.split(',') : [];
      if (vues.includes(valeurDistincte)) continue;
      vues.push(valeurDistincte);
      req.fixerMission.run({
        guild_id: guildId,
        user_id: userId,
        periode: periode.id,
        cle: mission.cle,
        valeur: vues.length,
        detail: vues.slice(-50).join(','),
      });
    } catch (e) {
      logger.debug('Mission :', e.message);
    }
  }
}

/** Etat complet des missions d'un membre. */
function etat(guildId, userId) {
  return periodes(guildId).map((p) => {
    const progres = new Map(req.progresPeriode.all(guildId, userId, p.id).map((l) => [l.cle, l]));
    const missions = p.liste.map((m) => {
      const ligne = progres.get(m.cle);
      const valeur = Math.min(ligne?.valeur ?? 0, m.but);
      return { ...m, valeur, accomplie: valeur >= m.but, reclamee: Boolean(ligne?.reclamee) };
    });
    return {
      ...p,
      missions,
      toutesAccomplies: missions.length > 0 && missions.every((m) => m.accomplie),
      bonusPris: Boolean(req.bonusPris.get(guildId, userId, p.id)),
    };
  });
}

/**
 * Encaisse tout ce qui est accompli et pas encore reclame.
 * Renvoie le detail pour que la commande puisse l'afficher.
 */
function reclamer(guildId, userId) {
  const eco = require('./economie');
  const { ajouterXp } = require('./niveaux');

  let xp = 0;
  let monnaie = 0;
  const noms = [];
  const bonus = [];

  for (const p of etat(guildId, userId)) {
    for (const m of p.missions) {
      if (!m.accomplie || m.reclamee) continue;
      req.reclamerMission.run(guildId, userId, p.id, m.cle);
      xp += m.xp ?? 0;
      monnaie += m.monnaie ?? 0;
      noms.push(m.nom);
    }
    if (p.toutesAccomplies && !p.bonusPris) {
      const recompense = p.nom === 'jour' ? M.bonusJournee : M.bonusSemaine;
      if (recompense) {
        req.prendreBonus.run(guildId, userId, p.id);
        xp += recompense.xp ?? 0;
        monnaie += recompense.monnaie ?? 0;
        bonus.push(p.nom);
      }
    }
  }

  if (!noms.length && !bonus.length) return { rien: true };

  let niveau = null;
  if (xp > 0) {
    try {
      const resultat = ajouterXp(guildId, userId, xp);
      if (resultat.niveauApres > resultat.niveauAvant) niveau = resultat.niveauApres;
    } catch (e) {
      logger.avertissement('XP de mission :', e.message);
    }
  }
  if (monnaie > 0) eco.crediter(guildId, userId, monnaie);

  return { rien: false, xp, monnaie, noms, bonus, niveau };
}

/** Supprime les periodes anciennes (30 jours). */
function purger() {
  const vieux = new Date(Date.now() - 30 * 86_400_000);
  const limites = { jour: jour(vieux), semaine: semaine(vieux) };
  try {
    req.purgerMissions.run(limites);
    req.purgerBonus.run(limites);
  } catch (e) {
    logger.debug('Purge missions :', e.message);
  }
}

module.exports = { jour, semaine, periodes, noter, etat, reclamer, purger };
