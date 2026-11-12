const conf = require('../../config');
const { req } = require('../database/db');

/** XP necessaire pour passer du niveau n au niveau n+1. */
function xpPourNiveau(n) {
  return conf.xp.xpPourNiveau(n);
}

/** XP total cumule necessaire pour atteindre le niveau n. */
function xpTotalPourNiveau(n) {
  let total = 0;
  for (let i = 0; i < n; i++) total += xpPourNiveau(i);
  return total;
}

/** Deduit le niveau, la progression et le palier suivant a partir de l'XP total. */
function infosNiveau(xpTotal) {
  let niveau = 0;
  let restant = Math.max(0, xpTotal);
  while (restant >= xpPourNiveau(niveau)) {
    restant -= xpPourNiveau(niveau);
    niveau++;
  }
  const requis = xpPourNiveau(niveau);
  return {
    niveau,
    xpActuel: restant,
    xpRequis: requis,
    progression: requis > 0 ? restant / requis : 0,
    xpTotal: Math.max(0, xpTotal),
  };
}

/** Rang d'un membre dans le classement du serveur (1 = premier). */
function rangDe(guildId, xpTotal) {
  return req.rangDe.get(guildId, xpTotal).n + 1;
}

/**
 * Ajoute de l'XP a un membre et renvoie l'ancien et le nouveau niveau.
 * `champs` permet d'incrementer aussi le compteur de messages / secondes vocales.
 */
function ajouterXp(guildId, userId, montant, champs = {}) {
  const avant = req.getXp.get(guildId, userId);
  const xpAvant = avant?.xp ?? 0;
  req.upsertXp.run({
    guild_id: guildId,
    user_id: userId,
    xp: montant,
    messages: champs.messages ?? 0,
    secondes_vocal: champs.secondesVocal ?? 0,
    dernier_gain: champs.dernierGain ?? 0,
  });
  // Le meme gain alimente le compteur GLOBAL, qui vaut pour tout le bot.
  // Il est volontairement « en plus » et jamais « a la place » : l'XP du
  // serveur reste la seule chose qui compte pour le classement du serveur.
  // Un echec ici ne doit rien casser — c'est un compteur d'affichage.
  try {
    require('./xpGlobal').ajouter(userId, montant, {
      messages: champs.messages ?? 0,
      secondesVocal: champs.secondesVocal ?? 0,
    });
  } catch {
    /* le compteur global n'est pas indispensable au gain d'XP */
  }

  const xpApres = xpAvant + montant;
  return {
    xpAvant,
    xpApres,
    niveauAvant: infosNiveau(xpAvant).niveau,
    niveauApres: infosNiveau(xpApres).niveau,
  };
}

/**
 * Applique les roles-recompenses correspondant au niveau atteint.
 * Renvoie la liste des roles ajoutes.
 */
async function appliquerRecompenses(membre, niveau) {
  const recompenses = req.recompensesJusqua.all(membre.guild.id, niveau);
  const ajoutes = [];
  for (const r of recompenses) {
    const role = membre.guild.roles.cache.get(r.role_id);
    if (!role) continue;
    if (membre.roles.cache.has(role.id)) continue;
    if (!role.editable) continue;
    try {
      await membre.roles.add(role, `Recompense de niveau ${r.niveau}`);
      ajoutes.push(role);
    } catch {
      /* role trop haut ou permissions manquantes : on ignore */
    }
  }
  return ajoutes;
}

/** Le membre gagne-t-il de l'XP dans ce salon / avec ces roles ? */
function estExclu(guildId, salonId, membre) {
  const salons = req.exclusions.all(guildId, 'xp_salon').map((e) => e.cible_id);
  if (salonId && salons.includes(salonId)) return true;
  const roles = req.exclusions.all(guildId, 'xp_role').map((e) => e.cible_id);
  if (membre && roles.some((id) => membre.roles.cache.has(id))) return true;
  return false;
}

module.exports = {
  xpPourNiveau,
  xpTotalPourNiveau,
  infosNiveau,
  rangDe,
  ajouterXp,
  appliquerRecompenses,
  estExclu,
};
