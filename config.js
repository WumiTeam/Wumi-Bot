/**
 * Configuration globale du bot.
 * Tout ce qui est modifiable ici s'applique a tous les serveurs.
 * Les reglages propres a un serveur (salons, activations) se font en jeu avec /config.
 */
module.exports = {
  // ---------------------------------------------------------------- APPARENCE
  // Palette nature, accordee au decor des cartes.
  couleurs: {
    principale: 0xDCE3FF, // violet
    succes: 0x66BCFF,
    erreur: 0xFF2860,
    avertissement: 0xFFA919,
    info: 0x66BCFF,
    log: 0x1ED760,
    bienvenue: 0xDCE3FF,
    aurevoir: 0xFF2860,
  },

  // Les emojis ne sont plus ici : Blueprint a les siens, dessines dans
  // src/assets/emojis/ et televerses tout seul au demarrage. Le code les
  // demande par leur nom court, avec E('succes'), E('piece')â€¦ et la liste
  // complete (avec le repli Unicode de chacun) est dans src/utils/emojis.js.

  // ------------------------------------------------------------------ TOP.GG
  // L'annuaire de bots. Le jeton se met dans le .env (TOPGG_TOKEN) ; sans lui,
  // /voter dit simplement que le bot n'y est pas encore inscrit.
  topgg: {
    // A quelle frequence publier le nombre de serveurs. top.gg tolere 60
    // appels par minute sur ces routes : toutes les 30 minutes est large.
    intervalleMinutes: 30,
  },

  // ------------------------------------------------------- LIMITES PAR SERVEUR
  // Blueprint est un bot PUBLIC : il tourne pour des serveurs qu'on ne connait
  // pas. Sans plafond, un seul serveur peut lui faire faire n'importe quoi â€”
  // surtout la veille, ou CHAQUE source est une requete reseau toutes les
  // quelques minutes. Dix sources sur cinq cents serveurs, c'est deja cinq
  // mille requetes par tour.
  limites: {
    veilleParServeur: 10,
    articlesBoutique: 50,
    faqParServeur: 100,
    paliersXp: 50,
  },

  // ------------------------------------------------------------------- SYSTEME XP
  xp: {
    // Gain aleatoire entre min et max par message
    parMessageMin: 15,
    parMessageMax: 25,
    // Delai (secondes) avant qu'un nouveau message rapporte de l'XP
    cooldownSecondes: 60,
    // Longueur minimale d'un message pour compter
    longueurMiniMessage: 3,
    // XP gagne par minute passee en vocal (0 = desactive)
    xpVocalParMinute: 5,
    // Les membres seuls dans un salon vocal, en sourdine ou en AFK ne gagnent rien
    ignorerVocalSolo: true,
    ignorerVocalMute: true,
    // Multiplicateur global (2 = double XP, pratique pour un week-end evenement)
    multiplicateur: 1,
    // Formule : XP necessaire pour passer du niveau n au niveau n+1
    // (identique a la courbe MEE6, tres progressive)
    xpPourNiveau: (n) => 5 * n * n + 50 * n + 100,
  },

  // --------------------------------------------------------------- CARTES IMAGE
  carte: {
    largeur: 1000,
    hauteur: 300,

    // Image de fond commune aux cartes de rank et de bienvenue.
    // Remplace src/assets/images/fond.png pour changer le decor
    // (format conseille : 1500 x 500 ; clair pour les themes clairs,
    //  sombre pour les themes sombres comme Blueprint).
    imageFond: 'fond.png',
    // Voile blanc pose sur l'image pour garder le texte lisible (0 = aucun, 1 = fond blanc)
    voile: 0.5,
    // Retourne le decor horizontalement sur la carte de rank :
    // le relief passe en bas a droite et degage le coin ou s'affichent rang et niveau.
    miroirRank: true,

    fond: '#f7f8f5', // couleur de repli si l'image de fond est absente
    fondSecondaire: '#ffffff',
    accent: '#66BCFF', // violet : barre d'XP, anneau
    accentSecondaire: '#289ffa',
    texte: '#1b2419',
    texteSecondaire: '#5f6b59',
    police: 'Poppins',
  },

  // ------------------------------------------------- THEMES DE CARTE DE RANK
  // Les membres achetent ces themes avec la monnaie du serveur (/theme).
  // Chaque theme change les couleurs de la carte /rank.
  //   prix    : 0 = offert a tout le monde
  //   voile   : opacite du voile pose sur le decor (0 = decor brut, 1 = uni)
  //   sombre  : true = texte clair sur fond sombre
  //   degrade : remplace le decor par un degrade de deux couleurs
  // Le premier theme de la liste est celui utilise par defaut.
  themesRank: {
    Wumi: {
      nom: 'Wumi',
      emoji: 'ðŸ“',
      prix: 0,
      description: 'Le plan technique du serveur. Offert a tout le monde.',
      accent: '#289ffa',
      accent2: '#66BCFF',
      // Theme sombre : le voile est fonce, pas blanc, sinon la grille du plan
      // vire au gris sale. Il reste leger (0.42) pour que la grille se voie
      // encore sous le texte.
      sombre: true,
      voile: 0.42,
      voileCouleur: '26, 16, 54',
    },
    // CES TROIS THEMES ONT ETE RATTRAPES.
    //
    // Ils datent de l'epoque ou le decor des cartes etait une photo CLAIRE
    // (rocher, mousse, branche). Un voile blanc a 0.55 l'eclaircissait
    // joliment. Depuis, le decor est le plan technique violet SOMBRE de
    // Blueprint : le meme voile blanc ne l'eclaircit plus, il le delave. On
    // obtenait un gris sale, ni clair ni sombre, avec du texte noir dessus.
    //
    // Chacun teinte donc son voile de SA couleur, comme le font deja
    // Blueprint et Nuit. Ocean et Braise assument le fond sombre ; Lavande
    // reste le theme clair du lot, mais pour de bon â€” un voile assez dense
    // pour que le fond soit vraiment clair, et du texte sombre dessus.
    ocean: {
      nom: 'Ocean',
      emoji: 'ðŸŒŠ',
      prix: 1500,
      description: 'Le meme decor, passe au bleu profond.',
      accent: '#3d8ed4',
      accent2: '#7ec6f0',
      sombre: true,
      voile: 0.58,
      voileCouleur: '7, 30, 58',
    },
    braise: {
      nom: 'Braise',
      emoji: 'ðŸ”¥',
      prix: 1500,
      description: 'Orange chaud, comme un feu de camp.',
      accent: '#e07a2c',
      accent2: '#f5b563',
      sombre: true,
      voile: 0.55,
      voileCouleur: '44, 17, 6',
    },
    lavande: {
      nom: 'Lavande',
      emoji: 'ðŸ’œ',
      prix: 2500,
      description: 'Violet doux sur fond clair.',
      accent: '#6b4fb0',
      accent2: '#a586e0',
      voile: 0.86,
      voileCouleur: '246, 241, 255',
    },
    nuit: {
      nom: 'Nuit',
      emoji: 'ðŸŒ™',
      prix: 4000,
      description: 'Le decor plonge dans le noir, texte clair.',
      accent: '#4f9de0',
      accent2: '#86d3ec',
      sombre: true,
      voile: 0.82,
      voileCouleur: '9, 13, 11',
    },
    minuit: {
      nom: 'Minuit',
      emoji: 'âœ¨',
      prix: 6000,
      description: 'Sans decor : un ciel etoile.',
      accent: '#8b6ee8',
      accent2: '#c9a5f5',
      sombre: true,
      voile: 0,
      degrade: ['#151a30', '#2b2348'],
      etoiles: true,
    },
    or: {
      nom: 'Or',
      emoji: 'ðŸ‘‘',
      prix: 12000,
      description: 'Noir et or. Le theme le plus cher du serveur.',
      accent: '#c99a2e',
      accent2: '#f2d76b',
      sombre: true,
      voile: 0,
      degrade: ['#111110', '#262016'],
    },
  },

  // --------------------------------------------------------------- MISSIONS
  // Defis renouveles chaque jour et chaque semaine (/missions).
  // Le bot tire au sort les missions du jour dans la reserve ci-dessous :
  // tout le serveur a les memes, et elles changent a minuit (heure de Paris).
  //   type : ce que le bot compte (voir la liste sous le tableau)
  //   but  : quantite a atteindre
  //   xp / monnaie : recompense une fois la mission accomplie
  missions: {
    actif: true,
    // Nombre de missions tirees par periode
    parJour: 3,
    parSemaine: 2,
    // Bonus verse quand TOUTES les missions du jour sont accomplies
    bonusJournee: { xp: 150, monnaie: 200 },
    bonusSemaine: { xp: 600, monnaie: 800 },

    // Types disponibles : messages, vocal (minutes), salons (salons differents),
    // daily, travail, ticket, suggestion, invitation, achat
    reserveJour: [
      { cle: 'j_messages_30', type: 'messages', but: 30, nom: 'Bavard', description: 'Envoie 30 messages', xp: 80, monnaie: 100 },
      { cle: 'j_messages_75', type: 'messages', but: 75, nom: 'Pilier du chat', description: 'Envoie 75 messages', xp: 150, monnaie: 200 },
      { cle: 'j_vocal_20', type: 'vocal', but: 20, nom: 'Voix du serveur', description: 'Passe 20 minutes en vocal', xp: 100, monnaie: 120 },
      { cle: 'j_vocal_60', type: 'vocal', but: 60, nom: 'Squatteur de vocal', description: 'Passe 1 heure en vocal', xp: 200, monnaie: 250 },
      { cle: 'j_salons_3', type: 'salons', but: 3, nom: 'Touche-a-tout', description: 'Parle dans 3 salons differents', xp: 90, monnaie: 110 },
      { cle: 'j_daily', type: 'daily', but: 1, nom: 'Routine', description: 'Recupere ta recompense quotidienne', xp: 40, monnaie: 50 },
      { cle: 'j_travail', type: 'travail', but: 2, nom: 'A la tache', description: 'Utilise /travailler 2 fois', xp: 60, monnaie: 80 },
      { cle: 'j_suggestion', type: 'suggestion', but: 1, nom: 'Force de proposition', description: 'Envoie une suggestion', xp: 70, monnaie: 90 },
      { cle: 'j_achat', type: 'achat', but: 1, nom: 'Client du jour', description: 'Achete quelque chose a la boutique', xp: 50, monnaie: 60 },
    ],
    reserveSemaine: [
      { cle: 's_messages_400', type: 'messages', but: 400, nom: 'Machine a ecrire', description: 'Envoie 400 messages cette semaine', xp: 600, monnaie: 800 },
      { cle: 's_vocal_300', type: 'vocal', but: 300, nom: 'Habitue du vocal', description: 'Passe 5 heures en vocal cette semaine', xp: 700, monnaie: 900 },
      { cle: 's_salons_6', type: 'salons', but: 6, nom: 'Explorateur', description: 'Parle dans 6 salons differents', xp: 400, monnaie: 500 },
      { cle: 's_invitation', type: 'invitation', but: 1, nom: 'Recruteur', description: 'Fais venir un nouveau membre', xp: 800, monnaie: 1000 },
      { cle: 's_ticket', type: 'ticket', but: 1, nom: 'Besoin d\'aide', description: 'Ouvre un ticket de support', xp: 300, monnaie: 400 },
      { cle: 's_daily_5', type: 'daily', but: 5, nom: 'Assidu', description: 'Recupere ta recompense quotidienne 5 jours', xp: 500, monnaie: 700 },
    ],
  },

  // ------------------------------------------------------------------- AUTOMOD
  automod: {
    // Anti-spam : X messages en Y secondes
    spamMessages: 5,
    spamFenetreSecondes: 5,
    // Anti-repetition : nombre de messages identiques consecutifs toleres
    repetitionMax: 3,
    // Mentions max dans un seul message
    mentionsMax: 5,
    // Pourcentage de majuscules tolere (sur les messages de plus de 10 caracteres)
    majusculesPourcentMax: 70,
    // Sanction automatique apres X declenchements dans la fenetre ci-dessous
    seuilAvertissements: 3,
    fenetreAvertissementsMinutes: 10,
    // Duree du mute automatique (minutes) une fois le seuil atteint
    dureeMuteAutoMinutes: 10,
    // Mots interdits par defaut (ajoutables en jeu avec /motsinterdits)
    motsInterditsParDefaut: [],
  },

  // ------------------------------------------------------------------ ANTI-RAID
  antiRaid: {
    // X arrivees en Y secondes declenchent le mode raid
    joinsSeuil: 8,
    joinsFenetreSecondes: 10,
    // Duree du verrouillage automatique (minutes)
    dureeLockdownMinutes: 10,
    // Action sur les comptes qui arrivent pendant un raid : 'kick', 'ban' ou 'aucune'
    actionPendantRaid: 'kick',
  },

  // ------------------------------------------------------------ ANTI-PHISHING
  // Compare les liens postes a la liste publique de domaines de phishing
  // tenue par la communaute Discord Anti-Scam (phish.sinking.yachts).
  antiphishing: {
    // Liste complete (au premier chargement) et ajouts recents (les fois
    // suivantes) : inutile de retelecharger des dizaines de milliers de
    // domaines toutes les heures quand seule la difference nous interesse.
    sourceTout: 'https://phish.sinking.yachts/v2/all',
    sourceRecents: 'https://phish.sinking.yachts/v2/recent/', // + nombre de secondes
    // Frequence de rafraichissement. La liste communautaire ne change pas
    // assez vite pour justifier plus souvent qu'une fois par heure.
    intervalleMinutes: 60,
    // Fichier ou la liste est recopiee, a cote de la base de donnees : au
    // demarrage, le bot est protege des la premiere seconde, avant meme
    // d'avoir pu joindre le reseau.
    fichierCache: 'antiphishing-cache.json',
  },

  // ---------------------------------------------------------------- CONSOLE
  console: {
    // Nombre de lignes gardees en memoire pour l'onglet Console du panneau.
    // Elles ne sont jamais ecrites sur le disque et disparaissent au
    // redemarrage : monter ce chiffre coute de la memoire, rien d'autre
    // (compter environ 300 octets par ligne).
    lignes: 2000,
    // Ecrire une ligne a chaque action : commande lancee, bouton clique,
    // menu utilise, arrivee, depart, montee de niveau, sanction, automod.
    // C'est ce qui fait de la console un vrai journal d'activite. Passe a
    // false si tu preferes ne voir que les evenements importants.
    actions: true,
    // Detail des actions dans la ligne : le salon et la duree d'execution.
    detail: true,
  },

  // ------------------------------------------------------------ SAUVEGARDES
  sauvegardes: {
    actif: true,
    // Dossier ou sont ecrites les copies (cree automatiquement)
    dossier: './data/sauvegardes',
    // Une sauvegarde toutes les X heures (verifie au demarrage puis chaque heure)
    intervalleHeures: 24,
    // Nombre de copies conservees ; les plus anciennes sont supprimees
    aConserver: 14,
  },

  // ------------------------------------------------------- ECONOMIE AVANCEE
  economie: {
    // Banque : interets verses une fois par jour sur ce qui est depose
    banque: {
      tauxJournalier: 0.02, // 2 % par jour
      plafondInterets: 5000, // interets maximum verses en une fois
      depotMinimum: 100,
    },
    // Transferts entre membres
    paiement: {
      taxePourcent: 5, // preleve sur chaque envoi, part au neant (retire de la circulation)
      minimum: 10,
      maximum: 100_000,
    },
    // Braquage : tenter de voler un autre membre
    braquage: {
      chanceReussite: 0.35, // 35 % de reussite
      partVolee: 0.15, // 15 % du solde en poche de la cible (jamais la banque)
      amendePourcent: 20, // perdu par le voleur en cas d'echec
      delaiHeures: 6,
      soldeMinimumCible: 500, // on ne braque pas quelqu'un de fauche
      protectionHeures: 12, // une cible fraichement braquee est tranquille
    },
    // Objets vendus en boutique. `effet` decrit ce que fait l'objet :
    //   xp_multi     : multiplie l'XP gagne pendant `duree` minutes
    //   couleur      : role de couleur temporaire
    //   coupe_file   : le prochain ticket du membre passe en priorite
    //   protection   : protege du braquage pendant `duree` minutes
    objets: {
      potion_xp: {
        nom: 'Potion d\'expÃ©rience',
        emoji: 'ðŸ§ª',
        description: 'Double ton XP pendant 1 heure.',
        prix: 800,
        effet: 'xp_multi',
        valeur: 2,
        duree: 60,
      },
      elixir_xp: {
        nom: 'Ã‰lixir d\'expÃ©rience',
        emoji: 'âš—ï¸',
        description: 'Triple ton XP pendant 30 minutes.',
        prix: 1800,
        effet: 'xp_multi',
        valeur: 3,
        duree: 30,
      },
      couleur: {
        nom: 'Couleur de pseudo',
        emoji: 'ðŸŽ¨',
        description: 'Choisis la couleur de ton pseudo pendant 7 jours.',
        prix: 2500,
        effet: 'couleur',
        duree: 10_080,
      },
      coupe_file: {
        nom: 'Coupe-file',
        emoji: 'â©',
        description: 'Ton prochain ticket est signale comme prioritaire.',
        prix: 1200,
        effet: 'coupe_file',
        duree: 4320,
      },
      coffre_fort: {
        nom: 'Coffre-fort',
        emoji: 'ðŸ”’',
        description: 'Te protege des braquages pendant 24 heures.',
        prix: 1500,
        effet: 'protection',
        duree: 1440,
      },
    },
  },

  // ------------------------------------------------------------- PROGRESSION
  progression: {
    // Prestige : repartir de zero au niveau maximum, contre une etoile permanente
    prestige: {
      niveauRequis: 50,
      bonusXpParEtoile: 0.05, // +5 % d'XP definitif par etoile
      monnaieOfferte: 10_000,
      maximum: 10,
    },
    // Week-ends double XP : automatique du vendredi 18 h au dimanche 23 h (Paris)
    doubleXp: {
      weekEndAutomatique: true,
      multiplicateur: 2,
      debutVendrediHeure: 18,
      finDimancheHeure: 23,
    },
    // Badges attribues automatiquement. `type` : messages, vocal (minutes),
    // niveau, invitations, missions, anciennete (jours), prestige
    badges: {
      bavard_1: { nom: 'Bavard', emoji: 'ðŸ’¬', type: 'messages', seuil: 100, description: '100 messages envoyes' },
      bavard_2: { nom: 'Pilier du chat', emoji: 'ðŸ—£ï¸', type: 'messages', seuil: 1000, description: '1 000 messages envoyes' },
      bavard_3: { nom: 'Machine Ã  Ã©crire', emoji: 'âŒ¨ï¸', type: 'messages', seuil: 10_000, description: '10 000 messages envoyes' },
      voix_1: { nom: 'Voix familiÃ¨re', emoji: 'ðŸŽ™ï¸', type: 'vocal', seuil: 600, description: '10 heures en vocal' },
      voix_2: { nom: 'HabituÃ© du vocal', emoji: 'ðŸ”Š', type: 'vocal', seuil: 6000, description: '100 heures en vocal' },
      niveau_1: { nom: 'ConfirmÃ©', emoji: 'ðŸ“ˆ', type: 'niveau', seuil: 10, description: 'Niveau 10 atteint' },
      niveau_2: { nom: 'VÃ©tÃ©ran', emoji: 'ðŸ…', type: 'niveau', seuil: 30, description: 'Niveau 30 atteint' },
      niveau_3: { nom: 'LÃ©gende', emoji: 'ðŸ‘‘', type: 'niveau', seuil: 50, description: 'Niveau 50 atteint' },
      recruteur_1: { nom: 'Recruteur', emoji: 'ðŸ“¨', type: 'invitations', seuil: 5, description: '5 membres invites' },
      recruteur_2: { nom: 'Ambassadeur', emoji: 'ðŸŒ', type: 'invitations', seuil: 25, description: '25 membres invites' },
      fidele_1: { nom: 'FidÃ¨le', emoji: 'ðŸŒ¿', type: 'anciennete', seuil: 180, description: '6 mois sur le serveur' },
      fidele_2: { nom: 'Pionnier', emoji: 'ðŸ—¿', type: 'anciennete', seuil: 365, description: '1 an sur le serveur' },
      etoile: { nom: 'Ã‰toilÃ©', emoji: 'â­', type: 'prestige', seuil: 1, description: 'Premier prestige atteint' },
    },
  },

  // ------------------------------------------------------------------ VEILLE
  // Annonces automatiques des nouveaux posts (Instagram, YouTube, flux RSS).
  veille: {
    // Frequence des verifications, en minutes (5 minimum).
    // Instagram tolere environ 200 appels par heure : 10 minutes est confortable.
    intervalleMinutes: 10,
    // Nombre maximum d'annonces envoyees d'un coup pour une meme source :
    // evite d'inonder le salon si le compte a publie dix fois pendant une panne.
    maxParPassage: 3,
    // Twitch a sa propre cadence, bien plus rapide. Un post Instagram annonce
    // dix minutes plus tard ne derange personne ; un direct annonce dix minutes
    // apres son debut fait rater le debut du stream a tout le monde.
    // L'API Twitch tolere 800 appels par minute : 2 minutes est tres large.
    intervalleTwitchMinutes: 2,

    // TikTok ne propose AUCUNE API publique qui previenne des nouvelles
    // videos. La seule voie est une passerelle qui transforme le profil en
    // flux RSS. Ces passerelles sont tenues par des benevoles et tombent
    // regulierement : celle-ci est donc un reglage, pas une constante.
    // Le jour ou elle ne repond plus, on remplace cette ligne (ou on met
    // TIKTOK_PASSERELLE dans le .env) et tout repart, sans retoucher les
    // sources deja enregistrees.
    // {pseudo} est remplace par le pseudo, sans le @.
    passerelleTikTok: 'https://rsshub.app/tiktok/user/@{pseudo}',
  },

  // ---------------------------------------------------- SALONS STATISTIQUES
  statistiques: {
    // Discord limite a 2 renommages par salon toutes les 10 minutes :
    // ne descends pas sous 10, sinon les mises a jour seront ignorees.
    intervalleMinutes: 10,
  },

  // ------------------------------------------------------------------ DIVERS
  // Nombre d'entrees par page dans /classement
  classementParPage: 10,
  // Duree de vie des boutons de pagination (secondes)
  dureePagination: 120,
};
