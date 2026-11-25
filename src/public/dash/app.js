/*
 * Tableau de bord de Wumi — interface.
 *
 * Aucune bibliotheque : du JavaScript simple, servi tel quel. Toute donnee
 * venant du serveur (noms de serveurs, de salons, de roles, textes de
 * reglages) passe par textContent, jamais par innerHTML : un nom de salon
 * pieger ne peut rien executer ici.
 */
(() => {
  'use strict';

  const EN = !/^fr/i.test(navigator.language || 'fr');
  const T = EN ? {
    dashboard: 'dashboard', deconnexion: 'Log out', titre_accueil: 'Wumi dashboard',
    intro_accueil: 'Log in with Discord to set up Wumi on your servers — no commands needed.',
    connexion: 'Log in with Discord', mes_serveurs: 'Your servers', mes_serveurs_sous: 'Servers where you have « Manage Server ».',
    configurer: 'Configure', inviter: 'Add Wumi', present: 'Wumi is here', absent: 'Wumi is not here yet',
    aucun_serveur: "You don't manage any server yet.", retour: '← Servers', membres: 'members',
    sanctions30: 'sanctions (30 d)', tickets: 'open tickets', raid: 'Raid mode', raid_on: 'ACTIVE', raid_off: 'off',
    paliers: 'Warning steps', journal: 'Change log', enregistre: 'Saved ✓', erreur: 'Error', aucun: '— None —',
    enregistrer: 'Save', ajouter_palier: '+ Add a step', paliers_sous: 'What happens automatically when a member reaches N active warnings.',
    avertissements: 'warnings', action_mute: 'Mute', action_kick: 'Kick', action_ban: 'Ban', duree: 'Duration (e.g. 1h, 2d)',
    retirer: 'Remove', defaut: 'Reset to default', journal_sous: 'The latest settings changes (commands and dashboard).',
    quand: 'When', reglage: 'Setting', avant: 'Before', apres: 'After', par: 'By', source: 'From', rien: 'Nothing yet.',
    salon_muet: "(I can't write here)", gerable_non: "(above my role)",
    err_etat: 'Login expired, please try again.', err_discord: "Discord didn't accept the login. Try again.", err_bloque: 'This account is blocked from Wumi.',
    err_acces: "You can no longer manage this server.", err_reseau: 'Network error.',
    erreurs: { nombre_invalide: 'Invalid number', valeur_inconnue: 'Unknown value', trop_long: 'Too long', salon_invalide: 'Invalid channel (or I cannot write there)', categorie_invalide: 'Invalid category', role_invalide: 'Invalid role', role_gere: 'This role is managed by an integration', role_trop_haut_bot: 'This role is above my role', role_trop_haut_toi: 'This role is above your highest role', role_dangereux: 'This role has moderation/admin permissions', emoji_invalide: 'Invalid emoji', trop_menus: 'Too many panels (25 max)', trop_roles: 'Too many roles (25 max)', titre_requis: 'A title is required', aucun_role: 'Add at least one role', deja: 'Already in the panel', pas_dedans: 'Not in the panel', introuvable: 'Not found', envoi_impossible: 'Discord refused the message', droits_bot: 'I need Embed Links in this channel', droits_toi: "You can't write in this channel", couleur_invalide: 'Invalid color (e.g. #ff9d1b)', image_invalide: 'The image must be an https link', url_invalide: 'Button links must start with https://', vide: 'Add a title or a text', droits_moderation: 'You need « Moderate Members »' },
    s_stats: 'Statistics', s_rr: 'Reaction roles', s_embed: 'Embed builder', s_sanctions: 'Sanctions',
    st_sous: "Your server's activity. Data is kept for 180 days.", st_jours: (n) => `${n} days`,
    st_messages: 'Messages', st_arrivees: 'Joins', st_departs: 'Leaves', st_solde: 'Net growth', st_vocal: 'Voice (hours)',
    st_vs: (p) => `${p > 0 ? '+' : ''}${p}% vs previous period`, st_msg_jour: 'Messages per day', st_mouvements: 'Joins and leaves',
    st_salons: 'Most active channels', st_membres: 'Most active members (all time)', st_sanctions: 'Sanctions per week (12 weeks)',
    st_tableau: 'Show as a table', st_date: 'Date', st_rien: 'No data yet: Wumi starts counting as soon as it is on the server.',
    st_semaine: (d) => `Week of ${d}`, t_warn: 'Warnings', t_automod: 'Automod', un: { warn: 'Warning', mute: 'Mute', kick: 'Kick', ban: 'Ban', automod: 'Automod', unban: 'Unban', unmute: 'Unmute', softban: 'Softban' }, t_mute: 'Mutes', t_kick: 'Kicks', t_ban: 'Bans', msgs: 'messages',
    rr_sous: 'Panels where members pick their own roles by clicking.', rr_nouveau: 'New panel', rr_titre: 'Title', rr_desc: 'Description (optional)',
    rr_salon: 'Channel', rr_mode: 'Style', rr_boutons: 'Buttons', rr_menu: 'Dropdown menu', rr_unique: 'Only one role at a time',
    rr_roles: 'Roles', rr_role: 'Role', rr_emoji: 'Emoji (optional)', rr_label: 'Button text (optional)', rr_ajouter_role: '+ Add a role',
    rr_publier: 'Publish the panel', rr_aucun: 'No panel yet.', rr_voir: 'Open in Discord', rr_supprimer: 'Delete',
    rr_confirmer: 'Delete this panel and its message?', rr_ajout: 'Add', rr_perdu: 'The panel message was not found (deleted?).',
    emb_sous: 'Write an embed, check the preview, publish it in a channel.', emb_titre: 'Title', emb_desc: 'Text (Discord markdown works)',
    emb_couleur: 'Color', emb_image: 'Image (https link)', emb_pied: 'Footer', emb_boutons: 'Link buttons (max 5)', emb_bouton_label: 'Text',
    emb_bouton_url: 'https://…', emb_ajouter_bouton: '+ Add a button', emb_publier: 'Publish', emb_apercu: 'Preview', emb_publie: 'Published ✓', emb_ouvrir: 'Open',
    sa_sous: 'Every sanction given on the server, newest first.', sa_tous: 'All types', sa_membre: 'Member ID (optional)', sa_filtrer: 'Filter',
    sa_type: 'Type', sa_membre_col: 'Member', sa_par: 'By', sa_raison: 'Reason', sa_retirer: 'Remove', sa_confirmer: 'Remove this sanction from the history?',
    sa_aucune: 'No sanction.', sa_page: (p, n) => `Page ${p} / ${n}`, sa_inactif: 'expired',
    pr_titre: 'Premium', pr_sous: 'Wumi Premium on this server: free trial, card background and default card theme.',
    pr_actif: 'This server has Wumi Premium.', pr_inactif: "This server doesn't have Premium yet.", pr_jusqu: (d) => `Until ${d}`, pr_sans_fin: 'No end date',
    pr_source: { discord: 'Discord subscription', offert: 'Granted by the Wumi team', essai: 'Free trial' },
    pr_essai: 'Start the 7-day free trial', pr_essai_sous: 'Once per server, no card needed. It simply stops after 7 days.', pr_essai_ok: 'Trial started ✓',
    pr_abonner: 'Subscribe on Discord', pr_requis: 'Available with Premium (or during the free trial).',
    pr_fond: 'Card background', pr_fond_sous: 'Used on the rank, profile and level-up cards of every member without their own background. PNG, JPEG, WebP or GIF, 8 MB max.',
    pr_choisir: 'Choose an image', pr_retirer_fond: 'Remove the background', pr_apercu: 'Preview (your rank and level-up cards)',
    pr_profil: 'Wumi in your image', pr_profil_sous: 'Give Wumi its own name, avatar, banner and bio on this server only. Everywhere else, Wumi stays Wumi.',
    pr_nom: 'Name on this server', pr_bio: 'Bio (190 characters max)', pr_avatar: 'Avatar', pr_banniere: 'Banner', pr_changer: 'Change', pr_enregistrer: 'Save', pr_reinit: 'Back to the original Wumi',
    pr_theme: 'Default card theme', pr_theme_sous: 'For members who never picked a theme in /theme. They can still choose their own.', pr_theme_aucun: 'Wumi (default)',
    pr_erreurs: { profil_echec: "Discord refused the change (image too big or animated?).", premium_requis: 'This needs Premium.', essai_utilise: 'This server has already used its free trial.', deja_premium: 'This server already has Premium.', image_format: 'Unsupported image format.', image_taille: 'Image too large (8 MB max).', image_illisible: "Couldn't read this image." },

  } : {
    dashboard: 'tableau de bord', deconnexion: 'Déconnexion', titre_accueil: 'Tableau de bord Wumi',
    intro_accueil: 'Connecte-toi avec Discord pour régler Wumi sur tes serveurs, sans taper une seule commande.',
    connexion: 'Se connecter avec Discord', mes_serveurs: 'Tes serveurs', mes_serveurs_sous: 'Les serveurs où tu as « Gérer le serveur ».',
    configurer: 'Configurer', inviter: 'Ajouter Wumi', present: 'Wumi est là', absent: "Wumi n'y est pas encore",
    aucun_serveur: "Tu ne gères encore aucun serveur.", retour: '← Serveurs', membres: 'membres',
    sanctions30: 'sanctions (30 j)', tickets: 'tickets ouverts', raid: 'Mode raid', raid_on: 'ACTIF', raid_off: 'inactif',
    paliers: "Paliers d'avertissements", journal: 'Historique', enregistre: 'Enregistré ✓', erreur: 'Erreur', aucun: '— Aucun —',
    enregistrer: 'Enregistrer', ajouter_palier: '+ Ajouter un palier', paliers_sous: "Ce qui se passe automatiquement quand un membre atteint N avertissements actifs.",
    avertissements: 'avertissements', action_mute: 'Mute', action_kick: 'Expulsion', action_ban: 'Bannissement', duree: 'Durée (ex. 1h, 2j)',
    retirer: 'Retirer', defaut: 'Revenir au défaut', journal_sous: 'Les derniers changements de réglages (commandes et tableau de bord).',
    quand: 'Quand', reglage: 'Réglage', avant: 'Avant', apres: 'Après', par: 'Par', source: 'Depuis', rien: 'Rien pour le moment.',
    salon_muet: "(je ne peux pas écrire ici)", gerable_non: '(au-dessus de mon rôle)',
    err_etat: 'Connexion expirée, réessaie.', err_discord: "Discord n'a pas accepté la connexion. Réessaie.", err_bloque: 'Ce compte est bloqué sur Wumi.',
    err_acces: 'Tu ne peux plus gérer ce serveur.', err_reseau: 'Erreur réseau.',
    erreurs: { nombre_invalide: 'Nombre invalide', valeur_inconnue: 'Valeur inconnue', trop_long: 'Trop long', salon_invalide: "Salon invalide (ou je ne peux pas y écrire)", categorie_invalide: 'Catégorie invalide', role_invalide: 'Rôle invalide', role_gere: 'Ce rôle est géré par une intégration', role_trop_haut_bot: 'Ce rôle est au-dessus de mon rôle', role_trop_haut_toi: 'Ce rôle est au-dessus de ton rôle le plus haut', role_dangereux: 'Ce rôle a des permissions de modération ou d\'admin', emoji_invalide: 'Emoji invalide', trop_menus: 'Trop de panneaux (25 max)', trop_roles: 'Trop de rôles (25 max)', titre_requis: 'Il faut un titre', aucun_role: 'Ajoute au moins un rôle', deja: 'Déjà dans le panneau', pas_dedans: "Pas dans le panneau", introuvable: 'Introuvable', envoi_impossible: 'Discord a refusé le message', droits_bot: "Il me faut « Intégrer des liens » dans ce salon", droits_toi: 'Tu ne peux pas écrire dans ce salon', couleur_invalide: 'Couleur invalide (ex. #ff9d1b)', image_invalide: "L'image doit être un lien https", url_invalide: 'Les liens des boutons doivent commencer par https://', vide: 'Ajoute un titre ou un texte', droits_moderation: 'Il te faut « Modérer les membres »' },
    s_stats: 'Statistiques', s_rr: 'Rôles-réactions', s_embed: "Créateur d'embeds", s_sanctions: 'Sanctions',
    st_sous: "L'activité de ton serveur. Les données sont gardées 180 jours.", st_jours: (n) => `${n} jours`,
    st_messages: 'Messages', st_arrivees: 'Arrivées', st_departs: 'Départs', st_solde: 'Croissance nette', st_vocal: 'Vocal (heures)',
    st_vs: (p) => `${p > 0 ? '+' : ''}${p} % vs période précédente`, st_msg_jour: 'Messages par jour', st_mouvements: 'Arrivées et départs',
    st_salons: 'Salons les plus actifs', st_membres: 'Membres les plus actifs (depuis toujours)', st_sanctions: 'Sanctions par semaine (12 semaines)',
    st_tableau: 'Voir en tableau', st_date: 'Date', st_rien: "Pas encore de données : Wumi commence à compter dès qu'il est sur le serveur.",
    st_semaine: (d) => `Semaine du ${d}`, t_warn: 'Avertissements', t_automod: 'Automod', un: { warn: 'Avertissement', mute: 'Mute', kick: 'Expulsion', ban: 'Bannissement', automod: 'Automod', unban: 'Débannissement', unmute: 'Démute', softban: 'Softban' }, t_mute: 'Mutes', t_kick: 'Expulsions', t_ban: 'Bannissements', msgs: 'messages',
    rr_sous: 'Des panneaux où les membres choisissent leurs rôles en cliquant.', rr_nouveau: 'Nouveau panneau', rr_titre: 'Titre', rr_desc: 'Description (facultatif)',
    rr_salon: 'Salon', rr_mode: 'Style', rr_boutons: 'Boutons', rr_menu: 'Menu déroulant', rr_unique: 'Un seul rôle à la fois',
    rr_roles: 'Rôles', rr_role: 'Rôle', rr_emoji: 'Emoji (facultatif)', rr_label: 'Texte du bouton (facultatif)', rr_ajouter_role: '+ Ajouter un rôle',
    rr_publier: 'Publier le panneau', rr_aucun: 'Aucun panneau pour le moment.', rr_voir: 'Voir sur Discord', rr_supprimer: 'Supprimer',
    rr_confirmer: 'Supprimer ce panneau et son message ?', rr_ajout: 'Ajouter', rr_perdu: 'Le message du panneau est introuvable (supprimé ?).',
    emb_sous: "Écris un embed, vérifie l'aperçu, publie-le dans un salon.", emb_titre: 'Titre', emb_desc: 'Texte (le markdown Discord marche)',
    emb_couleur: 'Couleur', emb_image: 'Image (lien https)', emb_pied: 'Pied de page', emb_boutons: 'Boutons liens (5 max)', emb_bouton_label: 'Texte',
    emb_bouton_url: 'https://…', emb_ajouter_bouton: '+ Ajouter un bouton', emb_publier: 'Publier', emb_apercu: 'Aperçu', emb_publie: 'Publié ✓', emb_ouvrir: 'Ouvrir',
    sa_sous: 'Toutes les sanctions données sur le serveur, les plus récentes en premier.', sa_tous: 'Tous les types', sa_membre: 'ID du membre (facultatif)', sa_filtrer: 'Filtrer',
    sa_type: 'Type', sa_membre_col: 'Membre', sa_par: 'Par', sa_raison: 'Raison', sa_retirer: 'Retirer', sa_confirmer: "Retirer cette sanction de l'historique ?",
    sa_aucune: 'Aucune sanction.', sa_page: (p, n) => `Page ${p} / ${n}`, sa_inactif: 'expirée',
    pr_titre: 'Premium', pr_sous: "Wumi Premium sur ce serveur : essai gratuit, fond des cartes et thème par défaut.",
    pr_actif: 'Ce serveur a Wumi Premium.', pr_inactif: "Ce serveur n'a pas encore le Premium.", pr_jusqu: (d) => `Jusqu'au ${d}`, pr_sans_fin: 'Sans date de fin',
    pr_source: { discord: 'Abonnement Discord', offert: "Offert par l'équipe Wumi", essai: 'Essai gratuit' },
    pr_essai: "Lancer l'essai gratuit de 7 jours", pr_essai_sous: "Une fois par serveur, sans carte bancaire. Il s'arrête tout seul au bout de 7 jours.", pr_essai_ok: 'Essai lancé ✓',
    pr_abonner: "S'abonner sur Discord", pr_requis: "Disponible avec le Premium (ou pendant l'essai gratuit).",
    pr_fond: 'Fond des cartes', pr_fond_sous: "Utilisé sur les cartes de rang, de profil et de niveau de tous les membres sans fond personnel. PNG, JPEG, WebP ou GIF, 8 Mo max.",
    pr_choisir: 'Choisir une image', pr_retirer_fond: 'Retirer le fond', pr_apercu: 'Aperçu (tes cartes de rang et de niveau)',
    pr_profil: 'Wumi à ton image', pr_profil_sous: "Donne à Wumi un nom, un avatar, une bannière et une bio rien qu'à ce serveur. Partout ailleurs, Wumi reste Wumi.",
    pr_nom: 'Nom sur ce serveur', pr_bio: 'Bio (190 caractères max)', pr_avatar: 'Avatar', pr_banniere: 'Bannière', pr_changer: 'Changer', pr_enregistrer: 'Enregistrer', pr_reinit: "Revenir au Wumi d'origine",
    pr_theme: 'Thème de carte par défaut', pr_theme_sous: "Pour les membres qui n'ont jamais choisi de thème dans /theme. Ils peuvent toujours choisir le leur.", pr_theme_aucun: 'Wumi (par défaut)',
    pr_erreurs: { profil_echec: 'Discord a refusé le changement (image trop lourde ou animée ?).', premium_requis: 'Il faut le Premium.', essai_utilise: 'Ce serveur a déjà utilisé son essai gratuit.', deja_premium: 'Ce serveur a déjà le Premium.', image_format: "Format d'image non pris en charge.", image_taille: 'Image trop lourde (8 Mo max).', image_illisible: 'Image illisible.' },

  };
  document.documentElement.lang = EN ? 'en' : 'fr';
  document.getElementById('t-dashboard').textContent = T.dashboard;
  document.getElementById('t-deconnexion').textContent = T.deconnexion;

  const G = EN
    ? { general: 'Overview', modules: 'Modules', outils: 'Tools', changer: 'Switch server', chercher: 'Search a server…', membres_n: 'members',
        p1: 'Every setting, without typing a command', p2: 'Live statistics for your server', p3: 'Reaction roles, embeds and sanctions' }
    : { general: "Vue d'ensemble", modules: 'Modules', outils: 'Outils', changer: 'Changer de serveur', chercher: 'Chercher un serveur…', membres_n: 'membres',
        p1: 'Tous les réglages, sans taper une commande', p2: 'Les statistiques de ton serveur en direct', p3: 'Rôles-réactions, embeds et sanctions' };

  // Icones du menu (traits simples, 24x24). Une cle inconnue prend « point ».
  const ICONES = {
    stats: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
    arrivees: 'M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M15 12H3',
    departs: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9',
    niveaux: 'M12 2l3 7h7l-5.5 4.5 2 7.5L12 16.5 5.5 21l2-7.5L2 9h7z',
    economie: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zM15 9a3 3 0 0 0-3-1.5c-1.7 0-3 .9-3 2.2 0 3 6 1.6 6 4.6 0 1.3-1.3 2.2-3 2.2A3.3 3.3 0 0 1 9 15M12 6v1.5M12 16.5V18',
    missions: 'M9 11l3 3 8-8M20 12v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11',
    moderation: 'M14 13l-8.5 8.5a2.1 2.1 0 0 1-3-3L11 10M16 16l6-6M8 8l6-6M9 7l8 8M21 11l-8-8',
    securite: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z',
    logs: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M8 13h8M8 17h8',
    tickets: 'M3 9a3 3 0 0 0 0 6v3a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-3a3 3 0 0 0 0-6V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2zM13 4v16',
    communaute: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M23 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8',
    evenements: 'M3 4h18v18H3zM16 2v4M8 2v4M3 10h18',
    votes: 'M7 10v12M15 5.9L14 10h5.8a2 2 0 0 1 2 2.3l-1.4 8A2 2 0 0 1 18.4 22H7V10l4-8a3 3 0 0 1 4 3.9z',
    serveur: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2V21a2 2 0 1 1-4 0v-.1A1.7 1.7 0 0 0 7 19.4a1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.7 1.7 0 0 0 3 14H3a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 4.6 7a1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.7 1.7 0 0 0 10 3V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 2.9 1.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1A1.7 1.7 0 0 0 21 10h.1a2 2 0 1 1 0 4z',
    support: 'M12 8V4H8M4 8h16v12H4zM2 14h2M20 14h2M15 13v2M9 13v2',
    premium: 'M6 3h12l4 6-10 13L2 9z',
    roles: 'M20.6 13.4l-7.2 7.2a2 2 0 0 1-2.8 0L2 12V2h10l8.6 8.6a2 2 0 0 1 0 2.8zM7 7h.01',
    embed: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z',
    sanctions: 'M12 9v4M12 17h.01M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z',
    paliers: 'M3 17l6-6 4 4 8-8M14 7h7v7',
    musique: 'M9 18V5l12-2v13M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0zM21 16a3 3 0 1 1-6 0 3 3 0 0 1 6 0z',
    journal: 'M12 8v4l3 3M3 12a9 9 0 1 0 9-9 9.7 9.7 0 0 0-6.7 2.7L3 8M3 3v5h5',
    point: 'M12 12m-3 0a3 3 0 1 0 6 0 3 3 0 1 0-6 0',
  };
  function icone(cle) {
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    const p = document.createElementNS(ns, 'path');
    p.setAttribute('d', ICONES[cle] ?? ICONES.point);
    svg.append(p);
    return svg;
  }

  const app = document.getElementById('app');
  let moi = null;

  // ---------------------------------------------------------------- OUTILS
  function el(tag, props = {}, ...enfants) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (v === null || v === undefined || v === false) continue;
      if (k === 'class') n.className = v;
      else if (k === 'text') n.textContent = v;
      else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v === true ? '' : v);
    }
    for (const e of enfants.flat()) if (e !== null && e !== undefined && e !== false) n.append(e instanceof Node ? e : document.createTextNode(String(e)));
    return n;
  }

  let minuteurToast = null;
  function toast(texte, ok = true) {
    const t = document.getElementById('toast');
    t.textContent = texte;
    t.className = `toast ${ok ? 'ok' : 'ko'}`;
    t.hidden = false;
    clearTimeout(minuteurToast);
    minuteurToast = setTimeout(() => { t.hidden = true; }, 2600);
  }

  async function api(chemin, corps) {
    const r = await fetch(chemin, {
      method: corps ? 'POST' : 'GET',
      credentials: 'same-origin',
      headers: corps ? { 'Content-Type': 'application/json', 'X-Wumi-CSRF': moi?.csrf ?? '' } : {},
      body: corps ? JSON.stringify(corps) : undefined,
    });
    let json = {};
    try { json = await r.json(); } catch { /* vide */ }
    if (!r.ok) throw Object.assign(new Error(json.erreur || `HTTP ${r.status}`), { status: r.status, code: json.erreur });
    return json;
  }

  function iconeServeur(s) {
    return el('div', { class: 'icone' }, s.icone ? el('img', { src: s.icone, alt: '', referrerpolicy: 'no-referrer' }) : s.nom.split(/\s+/).map((m) => m[0]).join('').slice(0, 3));
  }

  function naviguer(chemin) {
    history.pushState({}, '', chemin);
    route();
  }
  window.addEventListener('popstate', route);

  // -------------------------------------------------------------- ECRANS
  function ecranConnexion() {
    const erreur = new URLSearchParams(location.search).get('erreur');
    const messages = { etat: T.err_etat, discord: T.err_discord, bloque: T.err_bloque };
    app.replaceChildren(el('section', { class: 'accueil' },
      el('img', { class: 'logo', src: '/wumi-icone.svg', alt: '' }),
      el('h1', { text: T.titre_accueil }),
      el('p', { text: T.intro_accueil }),
      el('ul', { class: 'points' }, el('li', { text: G.p1 }), el('li', { text: G.p2 }), el('li', { text: G.p3 })),
      erreur ? el('p', { class: 'erreur', text: messages[erreur] ?? T.err_discord }) : null,
      el('a', { class: 'bouton', href: /^\/(serveur|musique)\/\d+$/.test(location.pathname) ? `/connexion?retour=${encodeURIComponent(location.pathname)}` : '/connexion', text: T.connexion })
    ));
  }

  function ecranServeurs() {
    const cartes = moi.serveurs.map((s) => (s.present
      ? el('a', { class: 'serveur', href: `/serveur/${s.id}`, onclick: (e) => { e.preventDefault(); naviguer(`/serveur/${s.id}`); } },
        el('div', { class: 'banniere' }), iconeServeur(s), el('strong', { text: s.nom }), el('span', { class: 'etiquette', text: T.present }), el('span', { class: 'bouton petit', text: T.configurer }))
      : el('a', { class: 'serveur absent', href: s.invitation, target: '_blank', rel: 'noopener' },
        el('div', { class: 'banniere' }), iconeServeur(s), el('strong', { text: s.nom }), el('span', { class: 'etiquette', text: T.absent }), el('span', { class: 'bouton petit secondaire', text: T.inviter }))));
    app.classList.remove('large');
    const grille = el('div', { class: 'grille' }, cartes);
    const recherche = el('input', { type: 'text', class: 'recherche', placeholder: G.chercher, 'aria-label': G.chercher,
      oninput: () => {
        const q = recherche.value.trim().toLowerCase();
        cartes.forEach((c, i) => { c.hidden = q && !moi.serveurs[i].nom.toLowerCase().includes(q); });
      } });
    app.replaceChildren(
      el('div', { class: 'tete-liste' },
        el('div', {}, el('h1', { text: T.mes_serveurs }), el('p', { class: 'sous', text: T.mes_serveurs_sous })),
        cartes.length > 6 ? recherche : null),
      cartes.length ? grille : el('p', { class: 'vide', text: T.aucun_serveur })
    );
  }

  // ------------------------------------------------------ PAGE D'UN SERVEUR
  async function ecranServeur(id) {
    app.replaceChildren(el('div', { class: 'roue' }));
    let d;
    try {
      d = await api(`/api/serveur/${id}`);
    } catch (e) {
      app.replaceChildren(el('section', { class: 'accueil' }, el('p', { class: 'erreur', text: e.status === 403 ? T.err_acces : T.err_reseau }),
        el('a', { class: 'bouton secondaire', href: '/', onclick: (ev) => { ev.preventDefault(); naviguer('/'); }, text: T.retour })));
      return;
    }

    const contenu = el('section', { class: 'panneau' });
    const boutons = [];
    const ouvrir = (cle, rendre) => {
      for (const b of boutons) {
        b.classList.toggle('actif', b.dataset.cle === cle);
        // Sur mobile, le menu defile a l'horizontale : on amene l'onglet choisi a l'ecran.
        if (b.dataset.cle === cle) b.scrollIntoView({ block: 'nearest', inline: 'center' });
      }
      contenu.replaceChildren(...rendre());
      history.replaceState({}, '', `/serveur/${id}#${cle}`);
    };

    const bouton = (cle, nom, rendre) => {
      const b = el('button', { type: 'button', class: 'menu-item', 'data-cle': cle, onclick: () => ouvrir(cle, rendre) },
        icone(cle), el('span', { text: nom }), cle === 'premium' ? el('span', { class: 'pr', text: 'PRO' }) : null);
      boutons.push(b);
      return b;
    };
    const bStats = bouton('stats', T.s_stats, () => vueStats(d));
    const bCats = d.categories.map((c) => bouton(c.cle, c.nom, () => vueCategorie(d, c)));
    const bOutils = [
      bouton('premium', T.pr_titre, () => vuePremium(d)),
      bouton('roles', T.s_rr, () => vueRoles(d)),
      bouton('embed', T.s_embed, () => vueEmbed(d)),
      bouton('sanctions', T.s_sanctions, () => vueSanctions(d)),
      bouton('paliers', T.paliers, () => vuePaliers(d)),
      bouton('journal', T.journal, () => vueJournal(d)),
      ];
    // 2.41 : le lecteur web (une page a part, ouverte a tous les membres)
    bOutils.push(el('a', { class: 'menu-item', href: `/musique/${d.serveur.id}`, onclick: (e) => { e.preventDefault(); naviguer(`/musique/${d.serveur.id}`); } },
      icone('musique'), el('span', { text: EN ? 'Web player' : 'Lecteur web' })));

    const presents = moi.serveurs.filter((s) => s.present);
    const choix = el('select', { 'aria-label': G.changer, title: G.changer, onchange: () => naviguer(`/serveur/${choix.value}`) },
      presents.map((s) => el('option', { value: s.id, selected: s.id === d.serveur.id, text: s.nom })));
    const fmt = new Intl.NumberFormat(EN ? 'en-US' : 'fr-FR');
    app.classList.add('large');
    app.replaceChildren(el('div', { class: 'appli' },
      el('aside', { class: 'cote' },
        el('div', { class: 'choix-serveur' }, iconeServeur(d.serveur), choix),
        el('nav', { class: 'groupe' }, el('span', { text: G.general }), bStats),
        el('nav', { class: 'groupe' }, el('span', { text: G.modules }), bCats),
        el('nav', { class: 'groupe' }, el('span', { text: G.outils }), bOutils)),
      el('div', { class: 'principal' },
      el('div', { class: 'entete' },
        iconeServeur(d.serveur),
        el('div', {}, el('h1', { text: d.serveur.nom }), el('p', { text: `${fmt.format(d.serveur.membres ?? 0)} ${G.membres_n}` })),
        el('a', { class: 'bouton secondaire petit retour', href: '/', onclick: (e) => { e.preventDefault(); naviguer('/'); }, text: T.retour })),
      el('div', { class: 'stats' },
        el('div', { class: 'stat' }, el('b', { text: fmt.format(d.serveur.membres ?? 0) }), el('small', { text: T.membres })),
        el('div', { class: 'stat' }, el('b', { text: d.stats.sanctions30 }), el('small', { text: T.sanctions30 })),
        el('div', { class: 'stat' }, el('b', { text: d.stats.ticketsOuverts }), el('small', { text: T.tickets })),
        el('div', { class: `stat${d.stats.raid ? ' alerte' : ''}` }, el('b', { text: d.stats.raid ? T.raid_on : T.raid_off }), el('small', { text: T.raid }))),
      contenu)));

    const voulu = location.hash.slice(1);
    const cible = boutons.find((b) => b.dataset.cle === voulu) ?? boutons[0];
    cible?.click();
  }

  async function enregistrer(d, cle, valeur, controle) {
    if (controle) controle.disabled = true;
    try {
      const r = await api(`/api/serveur/${d.serveur.id}/reglage`, { cle, valeur });
      for (const c of d.categories) for (const reg of c.reglages) if (reg.cle === cle) reg.valeur = r.valeur;
      toast(T.enregistre);
      return r.valeur;
    } catch (e) {
      toast(`${T.erreur} : ${T.erreurs[e.code] ?? e.message}`, false);
      throw e;
    } finally {
      if (controle) controle.disabled = false;
    }
  }

  function optionsSalons(d, type, valeur, speciaux) {
    const opts = [el('option', { value: '', text: T.aucun })];
    for (const s of speciaux ?? []) opts.push(el('option', { value: s.v, text: `★ ${s.nom}`, selected: valeur === s.v }));
    if (type === 'categorie') {
      for (const c of d.salons.filter((x) => x.type === 'categorie')) opts.push(el('option', { value: c.id, text: c.nom, selected: valeur === c.id }));
      return opts;
    }
    const categories = new Map(d.salons.filter((x) => x.type === 'categorie').map((c) => [c.id, c.nom]));
    const groupes = new Map();
    for (const s of d.salons.filter((x) => x.type === 'texte')) {
      const g = s.parent ?? '';
      if (!groupes.has(g)) groupes.set(g, []);
      groupes.get(g).push(s);
    }
    for (const [parent, salons] of groupes) {
      const conteneur = parent ? el('optgroup', { label: categories.get(parent) ?? '—' }) : null;
      for (const s of salons) {
        const o = el('option', { value: s.id, text: `# ${s.nom}${s.ecrire ? '' : ` ${T.salon_muet}`}`, selected: valeur === s.id });
        (conteneur ?? { append: (x) => opts.push(x) }).append(o);
      }
      if (conteneur) opts.push(conteneur);
    }
    return opts;
  }

  function controle(d, r) {
    switch (r.type) {
      case 'bool': {
        const input = el('input', { type: 'checkbox', checked: Boolean(r.valeur), 'aria-label': r.nom });
        input.addEventListener('change', () => enregistrer(d, r.cle, input.checked, input).catch(() => { input.checked = !input.checked; }));
        return el('label', { class: 'interrupteur' }, input, el('span'));
      }
      case 'salon':
      case 'categorie': {
        const s = el('select', { 'aria-label': r.nom }, optionsSalons(d, r.type, r.valeur, r.speciaux));
        s.addEventListener('change', () => enregistrer(d, r.cle, s.value || null, s).catch(() => { s.value = r.valeur ?? ''; }));
        return s;
      }
      case 'role': {
        const s = el('select', { 'aria-label': r.nom }, el('option', { value: '', text: T.aucun }),
          d.roles.map((role) => el('option', { value: role.id, text: `@${role.nom}${role.gerable ? '' : ` ${T.gerable_non}`}`, selected: r.valeur === role.id })));
        s.addEventListener('change', () => enregistrer(d, r.cle, s.value || null, s).catch(() => { s.value = r.valeur ?? ''; }));
        return s;
      }
      case 'choix': {
        const s = el('select', { 'aria-label': r.nom }, r.valeurs.map((v) => el('option', { value: v.v, text: v.nom, selected: r.valeur === v.v })));
        s.addEventListener('change', () => enregistrer(d, r.cle, s.value, s).catch(() => { s.value = r.valeur ?? ''; }));
        return s;
      }
      case 'nombre': {
        const i = el('input', { type: 'number', value: r.valeur ?? '', min: r.min ?? undefined, max: r.max ?? undefined, 'aria-label': r.nom });
        i.addEventListener('change', async () => {
          try { i.value = await enregistrer(d, r.cle, i.value === '' ? null : Number(i.value), i); } catch { i.value = r.valeur ?? ''; }
        });
        return i;
      }
      default: {
        const zone = r.long
          ? el('textarea', { maxlength: r.max ?? undefined, 'aria-label': r.nom })
          : el('input', { type: 'text', maxlength: r.max ?? undefined, 'aria-label': r.nom });
        zone.value = r.valeur ?? '';
        const b = el('button', { type: 'button', class: 'bouton petit', text: T.enregistrer });
        b.addEventListener('click', () => enregistrer(d, r.cle, zone.value, b).catch(() => null));
        return el('div', { class: 'champ-texte' }, zone, b);
      }
    }
  }

  function vueCategorie(d, c) {
    return [
      el('h2', { text: c.nom }),
      el('p', { class: 'sous', text: c.aide }),
      ...c.reglages.map((r) => el('div', { class: `reglage${r.type === 'texte' && r.long ? ' long' : ''}` },
        el('div', {}, el('label', { text: r.nom }), r.aide ? el('div', { class: 'aide', text: r.aide }) : null),
        controle(d, r))),
    ];
  }

  // -------------------------------------------------------------- PALIERS
  function versDuree(ms) {
    if (!ms) return '';
    const j = ms / 86_400_000; if (Number.isInteger(j)) return `${j}d`;
    const h = ms / 3_600_000; if (Number.isInteger(h)) return `${h}h`;
    return `${Math.round(ms / 60_000)}m`;
  }
  function depuisDuree(texte) {
    const m = String(texte).trim().toLowerCase().match(/^(\d+)\s*(m|min|h|d|j)$/);
    if (!m) return null;
    const n = Number(m[1]);
    return n * ({ m: 60_000, min: 60_000, h: 3_600_000, d: 86_400_000, j: 86_400_000 }[m[2]]);
  }

  function vuePaliers(d) {
    const liste = el('div');
    const ligne = (n = '', p = { type: 'mute', duree: 3_600_000 }) => {
      const nombre = el('input', { type: 'number', min: 1, max: 50, value: n, 'aria-label': T.avertissements });
      const action = el('select', {}, ['mute', 'kick', 'ban'].map((v) => el('option', { value: v, text: T[`action_${v}`], selected: p.type === v })));
      const duree = el('input', { type: 'text', value: versDuree(p.duree), placeholder: T.duree, 'aria-label': T.duree });
      const majDuree = () => { duree.disabled = action.value !== 'mute'; };
      action.addEventListener('change', majDuree);
      majDuree();
      const div = el('div', { class: 'palier' }, nombre, action, duree, el('button', { type: 'button', class: 'bouton petit danger', text: T.retirer, onclick: () => div.remove() }));
      return div;
    };
    for (const [n, p] of Object.entries(d.paliers).sort(([a], [b]) => a - b)) liste.append(ligne(n, p));

    const sauver = async (paliers) => {
      try {
        const r = await api(`/api/serveur/${d.serveur.id}/paliers`, { paliers });
        d.paliers = r.paliers;
        toast(T.enregistre);
        bPaliersRendre();
      } catch (e) {
        toast(`${T.erreur} : ${e.message}`, false);
      }
    };
    const bPaliersRendre = () => document.querySelector('.menu [data-cle="paliers"]')?.click();

    return [
      el('h2', { text: T.paliers }),
      el('p', { class: 'sous', text: T.paliers_sous }),
      liste,
      el('div', { class: 'actions' },
        el('button', { type: 'button', class: 'bouton secondaire petit', text: T.ajouter_palier, onclick: () => liste.append(ligne()) }),
        el('button', { type: 'button', class: 'bouton petit', text: T.enregistrer, onclick: () => {
          const paliers = {};
          for (const div of liste.children) {
            const [nombre, action, duree] = div.querySelectorAll('input, select');
            const n = Number(nombre.value);
            if (!n) continue;
            paliers[n] = action.value === 'mute' ? { type: 'mute', duree: depuisDuree(duree.value) ?? 3_600_000 } : { type: action.value };
          }
          sauver(paliers);
        } }),
        el('button', { type: 'button', class: 'bouton secondaire petit', text: T.defaut, onclick: () => sauver({ 3: { type: 'mute', duree: 3_600_000 }, 5: { type: 'mute', duree: 86_400_000 }, 7: { type: 'kick' }, 10: { type: 'ban' } }) })
      ),
    ];
  }


  // -------------------------------------------------------------- PREMIUM
  function vuePremium(d) {
    const id = d.serveur.id;
    const corps = el('div', {}, el('div', { class: 'roue' }));
    const DF = new Intl.DateTimeFormat(EN ? 'en-US' : 'fr-FR', { dateStyle: 'long' });
    const erreurTexte = (e) => T.pr_erreurs[e.code] ?? T.erreurs[e.code] ?? T.erreur;

    const rendre = (p) => {
      const blocs = [];
      // Etat
      blocs.push(el('section', { class: `pr-etat${p.premium ? ' actif' : ''}` },
        el('b', { text: p.premium ? T.pr_actif : T.pr_inactif }),
        p.premium ? el('small', { text: `${T.pr_source[p.source] ?? p.source} · ${p.jusqu_a ? T.pr_jusqu(DF.format(p.jusqu_a)) : T.pr_sans_fin}` }) : null,
        el('div', { class: 'pr-actions' },
          p.essai === 'ok' ? el('button', { class: 'bouton', type: 'button', text: `🎁 ${T.pr_essai}`, onclick: async (ev) => {
            ev.target.disabled = true;
            try { await api(`/api/serveur/${id}/premium`, { action: 'essai' }); toast(T.pr_essai_ok); charger(); }
            catch (e) { toast(erreurTexte(e), false); ev.target.disabled = false; }
          } }) : null,
          (!p.premium || p.source === 'essai') && p.abonnement ? el('a', { class: 'bouton secondaire', href: p.abonnement, target: '_blank', rel: 'noopener', text: T.pr_abonner }) : null),
        p.essai === 'ok' ? el('p', { class: 'aide', text: T.pr_essai_sous }) : null));

      // Fond des cartes
      const apercu = el('img', { class: 'pr-apercu', alt: T.pr_apercu, src: `/api/serveur/${id}/apercu?t=${Date.now()}` });
      const fichier = el('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp,image/gif', hidden: true, onchange: () => {
        const f = fichier.files[0];
        if (!f) return;
        if (f.size > 8 * 1024 * 1024) { toast(T.pr_erreurs.image_taille, false); return; }
        const lecteur = new FileReader();
        lecteur.onload = async () => {
          try { await api(`/api/serveur/${id}/premium`, { action: 'fond', image: lecteur.result }); toast(T.enregistre); charger(); }
          catch (e) { toast(erreurTexte(e), false); }
        };
        lecteur.readAsDataURL(f);
      } });
      blocs.push(el('section', { class: `pr-bloc${p.premium ? '' : ' verrou'}` },
        el('h3', { text: T.pr_fond }), el('p', { class: 'sous', text: T.pr_fond_sous }),
        p.premium ? null : el('p', { class: 'aide', text: `🔒 ${T.pr_requis}` }),
        el('div', { class: 'pr-actions' },
          el('button', { class: 'bouton', type: 'button', disabled: !p.premium, text: T.pr_choisir, onclick: () => fichier.click() }),
          p.fond ? el('button', { class: 'bouton danger', type: 'button', disabled: !p.premium, text: T.pr_retirer_fond, onclick: async () => {
            try { await api(`/api/serveur/${id}/premium`, { action: 'retirer_fond' }); toast(T.enregistre); charger(); }
            catch (e) { toast(erreurTexte(e), false); }
          } }) : null,
          fichier),
        el('p', { class: 'etiquette', text: T.pr_apercu }), apercu));

      // 3.0.2 : Wumi a ton image (nom, avatar, banniere, bio sur ce serveur)
      {
        const pf = p.profil ?? {};
        const choix = { avatar: undefined, banniere: undefined };
        const nom = el('input', { type: 'text', maxlength: 32, value: pf.nom ?? '', placeholder: 'Wumi', disabled: !p.premium });
        const bio = el('textarea', { maxlength: 190, rows: 3, disabled: !p.premium, placeholder: '…' });
        bio.value = pf.bio ?? '';
        const imgAvatar = el('img', { class: 'pr-profil-avatar', alt: '', src: pf.avatar ?? '/wumi-icone.svg' });
        const banniere = el('div', { class: 'pr-profil-banniere', style: pf.banniere ? `background-image:url(${pf.banniere})` : '' });
        const lireImage = (cle, cible) => {
          const f = el('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp,image/gif', hidden: true, onchange: () => {
            const fi = f.files[0];
            if (!fi) return;
            if (fi.size > 8 * 1024 * 1024) { toast(T.pr_erreurs.image_taille, false); return; }
            const lec = new FileReader();
            lec.onload = () => {
              choix[cle] = lec.result;
              if (cle === 'avatar') cible.src = lec.result; else cible.style.backgroundImage = `url(${lec.result})`;
            };
            lec.readAsDataURL(fi);
          } });
          return f;
        };
        const fAvatar = lireImage('avatar', imgAvatar);
        const fBanniere = lireImage('banniere', banniere);
        blocs.push(el('section', { class: `pr-bloc${p.premium ? '' : ' verrou'}` },
          el('h3', { text: T.pr_profil }), el('p', { class: 'sous', text: T.pr_profil_sous }),
          p.premium ? null : el('p', { class: 'aide', text: `🔒 ${T.pr_requis}` }),
          el('div', { class: 'pr-profil' },
            banniere, imgAvatar,
            el('div', { class: 'pr-actions' },
              el('button', { class: 'bouton secondaire', type: 'button', disabled: !p.premium, text: `${T.pr_avatar} · ${T.pr_changer}`, onclick: () => fAvatar.click() }),
              el('button', { class: 'bouton secondaire', type: 'button', disabled: !p.premium, text: `${T.pr_banniere} · ${T.pr_changer}`, onclick: () => fBanniere.click() }),
              fAvatar, fBanniere)),
          el('label', { class: 'etiquette', text: T.pr_nom }), nom,
          el('label', { class: 'etiquette', text: T.pr_bio }), bio,
          el('div', { class: 'pr-actions' },
            el('button', { class: 'bouton', type: 'button', disabled: !p.premium, text: T.pr_enregistrer, onclick: async (ev) => {
              ev.target.disabled = true;
              const corps = { action: 'profil', nom: nom.value, bio: bio.value };
              if (choix.avatar) corps.avatar = choix.avatar;
              if (choix.banniere) corps.banniere = choix.banniere;
              try { await api(`/api/serveur/${id}/premium`, corps); toast(T.enregistre); charger(); }
              catch (e) { toast(erreurTexte(e), false); ev.target.disabled = false; }
            } }),
            pf.perso ? el('button', { class: 'bouton danger', type: 'button', disabled: !p.premium, text: T.pr_reinit, onclick: async () => {
              try { await api(`/api/serveur/${id}/premium`, { action: 'profil_reinit' }); toast(T.enregistre); charger(); }
              catch (e) { toast(erreurTexte(e), false); }
            } }) : null)));
      }

      // Theme par defaut
      const grille = el('div', { class: 'pr-themes' }, p.themes.map((th) => {
        const choisi = (p.themeDefaut ?? p.cleDefaut) === th.cle;
        const fond = th.degrade ? `linear-gradient(135deg, ${th.degrade[0]}, ${th.degrade[1]})` : (th.sombre ? '#1a1d24' : '#f1f3ee');
        return el('button', { type: 'button', class: `pr-theme${choisi ? ' choisi' : ''}`, disabled: !p.premium,
          style: `background:${fond};--accent:${th.accent}${th.degrade || th.sombre ? '' : ';color:#1d2416;text-shadow:none'}`, title: th.description ?? '',
          onclick: async () => {
            try { await api(`/api/serveur/${id}/premium`, { action: 'theme', cle: th.cle }); toast(T.enregistre); charger(); }
            catch (e) { toast(erreurTexte(e), false); }
          } },
        el('span', { class: 'pr-pastille' }), el('b', { text: `${th.emoji ?? ''} ${th.nom}`.trim() }), th.premium ? el('small', { text: '✦ Premium' }) : null);
      }));
      blocs.push(el('section', { class: `pr-bloc${p.premium ? '' : ' verrou'}` },
        el('h3', { text: T.pr_theme }), el('p', { class: 'sous', text: T.pr_theme_sous }),
        p.premium ? null : el('p', { class: 'aide', text: `🔒 ${T.pr_requis}` }), grille));
      corps.replaceChildren(...blocs);
    };

    const charger = () => api(`/api/serveur/${id}/premium`).then(rendre)
      .catch(() => corps.replaceChildren(el('p', { class: 'erreur', text: T.err_reseau })));
    charger();
    return [el('h2', { text: `✦ ${T.pr_titre}` }), el('p', { class: 'sous', text: T.pr_sous }), corps];
  }

  // -------------------------------------------------------------- JOURNAL
  function vueJournal(d) {
    const corps = el('div', {}, el('div', { class: 'roue' }));
    api(`/api/serveur/${d.serveur.id}/journal`).then(({ lignes }) => {
      if (!lignes.length) return corps.replaceChildren(el('p', { class: 'vide', text: T.rien }));
      const df = new Intl.DateTimeFormat(EN ? 'en-US' : 'fr-FR', { dateStyle: 'short', timeStyle: 'short' });
      corps.replaceChildren(el('div', { style: 'overflow-x:auto' }, el('table', {},
        el('thead', {}, el('tr', {}, [T.quand, T.reglage, T.avant, T.apres, T.par, T.source].map((h) => el('th', { text: h })))),
        el('tbody', {}, lignes.map((l) => el('tr', {},
          el('td', { text: df.format(l.date) }),
          el('td', { text: l.nom }),
          el('td', {}, el('code', { text: (l.avant ?? '—').slice(0, 60) })),
          el('td', {}, el('code', { text: (l.apres ?? '—').slice(0, 60) })),
          el('td', { text: l.par ?? '—' }),
          el('td', { text: l.source })))))));
      return null;
    }).catch(() => corps.replaceChildren(el('p', { class: 'erreur', text: T.err_reseau })));
    return [el('h2', { text: T.journal }), el('p', { class: 'sous', text: T.journal_sous }), corps];
  }

  // ------------------------------------------------------------ GRAPHIQUES
  // SVG fait main, sans bibliotheque. Couleurs : palette categorielle validee
  // (daltonisme) sur la surface sombre du site. Le texte reste dans les
  // couleurs du texte, jamais celle des series.
  const SERIE = { 1: '#ff9d1b', 2: '#e0574a', 3: '#199e70', 4: '#6a8fd8' };
  const NF = new Intl.NumberFormat(EN ? 'en-US' : 'fr-FR');
  const DFJ = new Intl.DateTimeFormat(EN ? 'en-US' : 'fr-FR', { day: 'numeric', month: 'short' });
  const jourTexte = (iso) => DFJ.format(new Date(`${iso}T12:00:00`));

  function s(tag, attrs = {}) {
    const n = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
    return n;
  }

  function borne(v) {
    if (v <= 5) return 5;
    const m = 10 ** Math.floor(Math.log10(v));
    for (const p of [1, 2, 2.5, 5, 10]) if (p * m >= v) return p * m;
    return 10 * m;
  }

  /**
   * Barres empilees, avec des series negatives possibles (sous la ligne de
   * base). points : [{ etiquette, titre, valeurs: { cle: n } }]
   * series : [{ cle, nom, couleur, signe: 1 | -1 }]
   */
  function barres(points, series, { hauteur = 210 } = {}) {
    const W = 680, H = hauteur, G = 44, B = 26, HAUT = 10;
    const pos = series.filter((x) => x.signe !== -1);
    const neg = series.filter((x) => x.signe === -1);
    const maxP = borne(Math.max(1, ...points.map((p) => pos.reduce((t, x) => t + (p.valeurs[x.cle] || 0), 0))));
    const maxN = neg.length ? borne(Math.max(1, ...points.map((p) => neg.reduce((t, x) => t + (p.valeurs[x.cle] || 0), 0)))) : 0;
    const zoneH = H - B - HAUT;
    const base = HAUT + zoneH * (maxP / (maxP + maxN));
    const unite = zoneH / (maxP + maxN);
    const pas = (W - G) / points.length;
    const larg = Math.max(2, Math.min(28, pas - Math.max(2, pas * 0.25)));

    const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, class: 'graph', role: 'img' });
    // grille discrete + axes
    const lignes = [[maxP, base - maxP * unite], [0, base]];
    if (maxN) lignes.push([-maxN, base + maxN * unite]);
    else lignes.push([maxP / 2, base - (maxP / 2) * unite]);
    for (const [v, y] of lignes) {
      svg.append(s('line', { x1: G, x2: W, y1: y, y2: y, class: v === 0 ? 'axe' : 'grille' }));
      const t = s('text', { x: G - 8, y: y + 4, 'text-anchor': 'end', class: 'etiq' });
      t.textContent = NF.format(Math.abs(v));
      svg.append(t);
    }
    const tous = points.length;
    const chaque = Math.max(1, Math.ceil(tous / 7));
    points.forEach((p, i) => {
      const x = G + i * pas + (pas - larg) / 2;
      const groupe = s('g', { class: 'colonne' });
      groupe.append(s('rect', { x: G + i * pas, y: HAUT, width: pas, height: zoneH, class: 'survol' }));
      for (const [liste, sens] of [[pos, -1], [neg, 1]]) {
        let cumul = 0;
        const visibles = liste.filter((ser) => (p.valeurs[ser.cle] || 0) > 0);
        visibles.forEach((ser, k) => {
          const v = p.valeurs[ser.cle];
          const h = v * unite;
          const y = sens === -1 ? base - cumul - h : base + cumul;
          const dernier = k === visibles.length - 1;
          // Ecart de 2px entre segments empiles ; seul le bout de la barre est arrondi.
          const hReel = Math.max(1, h - (dernier ? 0 : 2));
          const yReel = sens === -1 ? y + (dernier ? 0 : 2) : y;
          if (dernier && hReel > 4) {
            groupe.append(s('rect', { x, y: yReel, width: larg, height: hReel, rx: Math.min(4, larg / 2), fill: ser.couleur }));
            groupe.append(s('rect', { x, y: sens === -1 ? yReel + hReel / 2 : yReel, width: larg, height: hReel / 2, fill: ser.couleur }));
          } else {
            groupe.append(s('rect', { x, y: yReel, width: larg, height: hReel, fill: ser.couleur }));
          }
          cumul += h;
        });
      }
      groupe.addEventListener('mouseenter', (e) => infobulle(e, p, series));
      groupe.addEventListener('mousemove', (e) => infobulle(e, p, series));
      groupe.addEventListener('mouseleave', cacherInfobulle);
      svg.append(groupe);
      if (i % chaque === 0 || i === tous - 1) {
        const t = s('text', { x: G + i * pas + pas / 2, y: H - 6, 'text-anchor': 'middle', class: 'etiq' });
        t.textContent = p.etiquette;
        svg.append(t);
      }
    });
    const legende = series.length > 1
      ? el('div', { class: 'legende' }, series.map((x) => el('span', {}, el('i', { style: `background:${x.couleur}` }), x.nom)))
      : null;
    return el('div', { class: 'graph-boite' }, legende, svg);
  }

  const bulle = el('div', { class: 'infobulle', hidden: true });
  document.body.append(bulle);
  function infobulle(e, p, series) {
    bulle.replaceChildren(el('b', { text: p.titre ?? p.etiquette }),
      ...series.map((x) => el('div', {}, el('i', { style: `background:${x.couleur}` }), `${x.nom} · `, el('strong', { text: NF.format(p.valeurs[x.cle] || 0) }))));
    bulle.hidden = false;
    const l = bulle.offsetWidth;
    bulle.style.left = `${Math.min(window.innerWidth - l - 8, e.clientX + 14)}px`;
    bulle.style.top = `${e.clientY + 14}px`;
  }
  function cacherInfobulle() { bulle.hidden = true; }

  function tableau(entetes, lignes) {
    return el('details', { class: 'tableau' }, el('summary', { text: T.st_tableau }),
      el('div', { style: 'overflow-x:auto' }, el('table', {},
        el('thead', {}, el('tr', {}, entetes.map((h) => el('th', { text: h })))),
        el('tbody', {}, lignes.map((l) => el('tr', {}, l.map((c) => el('td', { text: c }))))))));
  }

  function carte(titre, ...contenu) {
    return el('section', { class: 'carte-stat' }, el('h3', { text: titre }), ...contenu);
  }

  // -------------------------------------------------------------- STATS
  function vueStats(d, jours = 30) {
    const corps = el('div', {}, el('div', { class: 'roue' }));
    const choix = el('div', { class: 'segments' }, [7, 30, 90].map((n) => el('button', {
      type: 'button', class: n === jours ? 'actif' : '', text: T.st_jours(n),
      onclick: () => contenuPanneau().replaceChildren(...vueStats(d, n)),
    })));
    api(`/api/serveur/${d.serveur.id}/stats?jours=${jours}`).then((st) => {
      const t = st.totaux;
      const vide = !t.messages && !t.arrivees && !t.departs;
      const evo = t.messagesAvant ? Math.round(((t.messages - t.messagesAvant) / t.messagesAvant) * 100) : null;
      const solde = t.arrivees - t.departs;
      const tuiles = el('div', { class: 'stats' },
        el('div', { class: 'stat' }, el('b', { text: NF.format(t.messages) }), el('small', { text: T.st_messages }), evo === null ? null : el('em', { class: evo >= 0 ? 'hausse' : 'baisse', text: T.st_vs(evo) })),
        el('div', { class: 'stat' }, el('b', { text: NF.format(t.arrivees) }), el('small', { text: T.st_arrivees })),
        el('div', { class: 'stat' }, el('b', { text: NF.format(t.departs) }), el('small', { text: T.st_departs })),
        el('div', { class: 'stat' }, el('b', { text: `${solde > 0 ? '+' : ''}${NF.format(solde)}` }), el('small', { text: T.st_solde })),
        el('div', { class: 'stat' }, el('b', { text: NF.format(Math.round(t.vocalMinutes / 60)) }), el('small', { text: T.st_vocal })));

      const pts = st.serie.map((j) => ({ etiquette: jourTexte(j.jour), titre: jourTexte(j.jour), valeurs: j }));
      const blocs = [tuiles];
      if (vide) blocs.push(el('p', { class: 'vide', text: T.st_rien }));
      blocs.push(carte(T.st_msg_jour,
        barres(pts, [{ cle: 'messages', nom: T.st_messages, couleur: SERIE[1] }]),
        tableau([T.st_date, T.st_messages, T.st_arrivees, T.st_departs], st.serie.map((j) => [jourTexte(j.jour), NF.format(j.messages), NF.format(j.arrivees), NF.format(j.departs)]))));
      blocs.push(carte(T.st_mouvements,
        barres(pts, [{ cle: 'arrivees', nom: T.st_arrivees, couleur: SERIE[1] }, { cle: 'departs', nom: T.st_departs, couleur: SERIE[2], signe: -1 }], { hauteur: 230 })));

      const maxSalon = Math.max(1, ...st.salons.map((x) => x.total));
      const maxMembre = Math.max(1, ...st.membres.map((x) => x.messages));
      blocs.push(el('div', { class: 'deux' },
        carte(T.st_salons, st.salons.length ? el('ol', { class: 'classement' }, st.salons.map((x) => el('li', {},
          el('span', { class: 'nom', text: `# ${x.nom ?? x.id}` }),
          el('span', { class: 'jauge' }, el('i', { style: `width:${(x.total / maxSalon) * 100}%;background:${SERIE[1]}` })),
          el('span', { class: 'val', text: NF.format(x.total) })))) : el('p', { class: 'vide', text: T.rien })),
        carte(T.st_membres, st.membres.length ? el('ol', { class: 'classement' }, st.membres.map((x) => el('li', {},
          el('span', { class: 'nom' }, x.avatar ? el('img', { src: x.avatar, alt: '', referrerpolicy: 'no-referrer' }) : null, x.nom ?? x.id),
          el('span', { class: 'jauge' }, el('i', { style: `width:${(x.messages / maxMembre) * 100}%;background:${SERIE[1]}` })),
          el('span', { class: 'val', text: NF.format(x.messages) })))) : el('p', { class: 'vide', text: T.rien }))));

      const types = [['warn', 1], ['mute', 2], ['kick', 3], ['ban', 4]];
      blocs.push(carte(T.st_sanctions, barres(
        st.semaines.map((w) => ({ etiquette: DFJ.format(new Date(w.debut)), titre: T.st_semaine(DFJ.format(new Date(w.debut))), valeurs: w })),
        types.map(([k, c]) => ({ cle: k, nom: T[`t_${k}`], couleur: SERIE[c] }))
      )));
      corps.replaceChildren(...blocs);
      return null;
    }).catch(() => corps.replaceChildren(el('p', { class: 'erreur', text: T.err_reseau })));
    return [el('div', { class: 'titre-ligne' }, el('div', {}, el('h2', { text: T.s_stats }), el('p', { class: 'sous', text: T.st_sous })), choix), corps];
  }

  const contenuPanneau = () => document.querySelector('.panneau');

  function erreurApi(e) {
    toast(`${T.erreur} : ${T.erreurs[e.code] ?? e.message}`, false);
  }

  function selectSalon(d, valeur) {
    return el('select', {}, optionsSalons(d, 'salon', valeur ?? '', null));
  }
  function selectRole(d, valeur) {
    return el('select', {}, el('option', { value: '', text: T.aucun }),
      d.roles.map((role) => el('option', { value: role.id, text: `@${role.nom}${role.gerable ? '' : ` ${T.gerable_non}`}`, selected: valeur === role.id })));
  }
  function champ(label, controle) {
    return el('label', { class: 'champ' }, el('span', { text: label }), controle);
  }

  // ------------------------------------------------------ ROLES-REACTIONS
  function vueRoles(d) {
    const liste = el('div', {}, el('div', { class: 'roue' }));
    const rendreListe = (panneaux) => {
      if (!panneaux.length) return liste.replaceChildren(el('p', { class: 'vide', text: T.rr_aucun }));
      return liste.replaceChildren(...panneaux.map((p) => {
        const salon = d.salons.find((x) => x.id === p.salon);
        const role = selectRole(d);
        const emoji = el('input', { type: 'text', placeholder: T.rr_emoji, maxlength: 64 });
        return el('div', { class: 'rr' },
          el('div', { class: 'rr-tete' },
            el('div', {}, el('strong', { text: `#${p.id} · ${p.titre}` }), el('small', { text: ` · # ${salon?.nom ?? '?'} · ${p.mode === 'menu' ? T.rr_menu : T.rr_boutons}${p.unique ? ` · ${T.rr_unique}` : ''}` })),
            el('div', { class: 'actions serre' },
              p.lien ? el('a', { class: 'bouton petit secondaire', href: p.lien, target: '_blank', rel: 'noopener', text: T.rr_voir }) : null,
              el('button', { type: 'button', class: 'bouton petit danger', text: T.rr_supprimer, onclick: async () => {
                if (!confirmer(T.rr_confirmer)) return;
                try { rendreListe((await api(`/api/serveur/${d.serveur.id}/roles`, { action: 'supprimer', id: p.id })).panneaux); toast(T.enregistre); } catch (e) { erreurApi(e); }
              } }))),
          el('div', { class: 'puces' }, p.roles.map((r) => el('span', { class: 'puce' },
            `${r.emoji && !r.emoji.startsWith('<') ? `${r.emoji} ` : ''}@${r.nom ?? r.role_id}`,
            el('button', { type: 'button', title: T.retirer, 'aria-label': T.retirer, text: '×', onclick: async () => {
              try { const x = await api(`/api/serveur/${d.serveur.id}/roles`, { action: 'retirer', id: p.id, role_id: r.role_id }); rendreListe(x.panneaux); toast(x.messagePerdu ? T.rr_perdu : T.enregistre, !x.messagePerdu); } catch (e) { erreurApi(e); }
            } })))),
          el('div', { class: 'rr-ajout' }, role, emoji, el('button', { type: 'button', class: 'bouton petit', text: T.rr_ajout, onclick: async () => {
            if (!role.value) return;
            try { const x = await api(`/api/serveur/${d.serveur.id}/roles`, { action: 'ajouter', id: p.id, role_id: role.value, emoji: emoji.value }); rendreListe(x.panneaux); toast(x.messagePerdu ? T.rr_perdu : T.enregistre, !x.messagePerdu); } catch (e) { erreurApi(e); }
          } })));
      }));
    };
    api(`/api/serveur/${d.serveur.id}/roles`).then((r) => rendreListe(r.panneaux)).catch(() => liste.replaceChildren(el('p', { class: 'erreur', text: T.err_reseau })));

    // Formulaire de creation
    const titre = el('input', { type: 'text', maxlength: 100 });
    const desc = el('textarea', { maxlength: 1000 });
    const salon = selectSalon(d);
    const mode = el('select', {}, el('option', { value: 'boutons', text: T.rr_boutons }), el('option', { value: 'menu', text: T.rr_menu }));
    const unique = el('input', { type: 'checkbox' });
    const lignes = el('div');
    const ligneRole = () => {
      const div = el('div', { class: 'rr-ligne' }, selectRole(d), el('input', { type: 'text', placeholder: T.rr_emoji, maxlength: 64 }),
        el('input', { type: 'text', placeholder: T.rr_label, maxlength: 80 }),
        el('button', { type: 'button', class: 'bouton petit danger', text: '×', 'aria-label': T.retirer, onclick: () => div.remove() }));
      return div;
    };
    lignes.append(ligneRole());
    const publier = el('button', { type: 'button', class: 'bouton', text: T.rr_publier, onclick: async () => {
      const roles = [...lignes.children].map((div) => {
        const [r, e, l] = div.querySelectorAll('select, input');
        return { role_id: r.value, emoji: e.value, label: l.value };
      }).filter((x) => x.role_id);
      publier.disabled = true;
      try {
        const r = await api(`/api/serveur/${d.serveur.id}/roles`, { action: 'creer', titre: titre.value, description: desc.value, salon: salon.value, mode: mode.value, unique: unique.checked, roles });
        rendreListe(r.panneaux);
        titre.value = ''; desc.value = ''; lignes.replaceChildren(ligneRole());
        toast(T.enregistre);
      } catch (e) { erreurApi(e); } finally { publier.disabled = false; }
    } });

    return [
      el('h2', { text: T.s_rr }), el('p', { class: 'sous', text: T.rr_sous }),
      liste,
      el('section', { class: 'formulaire' },
        el('h3', { text: T.rr_nouveau }),
        el('div', { class: 'grille-champs' }, champ(T.rr_titre, titre), champ(T.rr_salon, salon), champ(T.rr_mode, mode),
          el('label', { class: 'champ case' }, unique, el('span', { text: T.rr_unique }))),
        champ(T.rr_desc, desc),
        el('h4', { text: T.rr_roles }), lignes,
        el('div', { class: 'actions' }, el('button', { type: 'button', class: 'bouton petit secondaire', text: T.rr_ajouter_role, onclick: () => lignes.append(ligneRole()) }), publier)),
    ];
  }

  function confirmer(texte) {
    // eslint-disable-next-line no-alert
    return window.confirm(texte);
  }

  // ------------------------------------------------------------ EMBEDS
  function vueEmbed(d) {
    const titre = el('input', { type: 'text', maxlength: 256 });
    const desc = el('textarea', { maxlength: 4000, style: 'min-height:150px' });
    const couleur = el('input', { type: 'color', value: '#ff9d1b' });
    const image = el('input', { type: 'text', placeholder: 'https://…', maxlength: 500 });
    const pied = el('input', { type: 'text', maxlength: 2048 });
    const salon = selectSalon(d);
    const boutonsListe = el('div');
    const ligneBouton = () => {
      const div = el('div', { class: 'rr-ligne' }, el('input', { type: 'text', placeholder: T.emb_bouton_label, maxlength: 80 }), el('input', { type: 'text', placeholder: T.emb_bouton_url, maxlength: 512 }),
        el('button', { type: 'button', class: 'bouton petit danger', text: '×', 'aria-label': T.retirer, onclick: () => { div.remove(); maj(); } }));
      div.addEventListener('input', maj);
      return div;
    };

    // Apercu facon Discord : texte brut (pas de markdown interprete), c'est
    // volontaire, pour ne jamais injecter de HTML.
    const ap = {
      barre: el('div', { class: 'emb-barre' }), titre: el('div', { class: 'emb-titre' }), desc: el('div', { class: 'emb-desc' }),
      image: el('img', { class: 'emb-image', alt: '', referrerpolicy: 'no-referrer' }), pied: el('div', { class: 'emb-pied' }), boutons: el('div', { class: 'emb-boutons' }),
    };
    const apercu = el('div', { class: 'emb-apercu' }, ap.barre, el('div', { class: 'emb-corps' }, ap.titre, ap.desc, ap.image, ap.pied));
    function maj() {
      ap.barre.style.background = couleur.value;
      ap.titre.textContent = titre.value; ap.titre.hidden = !titre.value;
      ap.desc.textContent = desc.value; ap.desc.hidden = !desc.value;
      const url = image.value.trim();
      ap.image.hidden = !/^https:\/\//i.test(url);
      if (!ap.image.hidden && ap.image.getAttribute('src') !== url) ap.image.src = url;
      ap.pied.textContent = pied.value; ap.pied.hidden = !pied.value;
      ap.boutons.replaceChildren(...[...boutonsListe.children].map((div) => div.querySelector('input').value).filter(Boolean).map((l) => el('span', { text: `${l} ↗` })));
    }
    for (const c of [titre, desc, couleur, image, pied]) c.addEventListener('input', maj);
    maj();

    const publier = el('button', { type: 'button', class: 'bouton', text: T.emb_publier, onclick: async () => {
      const boutons = [...boutonsListe.children].map((div) => { const [l, u] = div.querySelectorAll('input'); return { label: l.value, url: u.value }; }).filter((x) => x.label || x.url);
      publier.disabled = true;
      try {
        const r = await api(`/api/serveur/${d.serveur.id}/embed`, { salon: salon.value, titre: titre.value, description: desc.value, couleur: couleur.value, image: image.value, pied: pied.value, boutons });
        toast(T.emb_publie);
        resultat.replaceChildren(el('a', { class: 'bouton petit secondaire', href: r.lien, target: '_blank', rel: 'noopener', text: `${T.emb_ouvrir} ↗` }));
      } catch (e) { erreurApi(e); } finally { publier.disabled = false; }
    } });
    const resultat = el('span');

    return [
      el('h2', { text: T.s_embed }), el('p', { class: 'sous', text: T.emb_sous }),
      el('div', { class: 'deux' },
        el('div', { class: 'formulaire nu' },
          champ(T.emb_titre, titre), champ(T.emb_desc, desc),
          el('div', { class: 'grille-champs' }, champ(T.emb_couleur, couleur), champ(T.emb_image, image)),
          champ(T.emb_pied, pied),
          el('h4', { text: T.emb_boutons }), boutonsListe,
          el('div', { class: 'actions' }, el('button', { type: 'button', class: 'bouton petit secondaire', text: T.emb_ajouter_bouton, onclick: () => { if (boutonsListe.children.length < 5) boutonsListe.append(ligneBouton()); } }))),
        el('div', {}, el('h4', { text: T.emb_apercu }), apercu, ap.boutons,
          el('div', { class: 'formulaire nu' }, champ(T.rr_salon, salon), el('div', { class: 'actions' }, publier, resultat)))),
    ];
  }

  // --------------------------------------------------------- SANCTIONS
  function vueSanctions(d, filtre = { page: 1, type: '', membre: '' }) {
    const corps = el('div', {}, el('div', { class: 'roue' }));
    const type = el('select', {}, el('option', { value: '', text: T.sa_tous }),
      ['warn', 'mute', 'kick', 'ban', 'automod'].map((k) => el('option', { value: k, text: T[`t_${k}`] ?? 'Automod', selected: filtre.type === k })));
    const membre = el('input', { type: 'text', placeholder: T.sa_membre, value: filtre.membre, inputmode: 'numeric' });
    const recharger = (f) => contenuPanneau().replaceChildren(...vueSanctions(d, f));
    const filtrer = el('button', { type: 'button', class: 'bouton petit', text: T.sa_filtrer, onclick: () => recharger({ page: 1, type: type.value, membre: membre.value.trim() }) });
    const df = new Intl.DateTimeFormat(EN ? 'en-US' : 'fr-FR', { dateStyle: 'short', timeStyle: 'short' });

    const q = new URLSearchParams({ page: filtre.page, type: filtre.type, membre: filtre.membre });
    api(`/api/serveur/${d.serveur.id}/sanctions?${q}`).then((r) => {
      if (!r.lignes.length) return corps.replaceChildren(el('p', { class: 'vide', text: T.sa_aucune }));
      corps.replaceChildren(
        el('div', { style: 'overflow-x:auto' }, el('table', {},
          el('thead', {}, el('tr', {}, ['#', T.quand, T.sa_type, T.sa_membre_col, T.sa_par, T.sa_raison, ''].map((h) => el('th', { text: h })))),
          el('tbody', {}, r.lignes.map((l) => el('tr', { class: l.actif ? '' : 'pale' },
            el('td', { text: l.id }),
            el('td', { text: df.format(l.date) }),
            el('td', {}, el('span', { class: `type type-${l.type}`, text: T.un[l.type] ?? l.type }), l.actif ? null : el('small', { text: ` (${T.sa_inactif})` })),
            el('td', { text: l.membre.nom ?? l.membre.id, title: l.membre.id }),
            el('td', { text: l.moderateur.nom ?? l.moderateur.id }),
            el('td', { text: l.raison ?? '—' }),
            el('td', {}, el('button', { type: 'button', class: 'bouton petit danger', text: T.sa_retirer, onclick: async () => {
              if (!confirmer(T.sa_confirmer)) return;
              try { await api(`/api/serveur/${d.serveur.id}/sanction`, { id: l.id }); toast(T.enregistre); recharger(filtre); } catch (e) { erreurApi(e); }
            } }))))))),
        el('div', { class: 'actions pagination' },
          el('button', { type: 'button', class: 'bouton petit secondaire', text: '←', disabled: r.page <= 1, onclick: () => recharger({ ...filtre, page: r.page - 1 }) }),
          el('span', { text: T.sa_page(r.page, r.pages) }),
          el('button', { type: 'button', class: 'bouton petit secondaire', text: '→', disabled: r.page >= r.pages, onclick: () => recharger({ ...filtre, page: r.page + 1 }) })));
      return null;
    }).catch(() => corps.replaceChildren(el('p', { class: 'erreur', text: T.err_reseau })));

    return [el('h2', { text: T.s_sanctions }), el('p', { class: 'sous', text: T.sa_sous }),
      el('div', { class: 'filtres' }, type, membre, filtrer), corps];
  }

    // ------------------------------------------------------- LECTEUR WEB (2.41)
  const M = EN
    ? { titre: 'Web player', rien: 'Nothing is playing.', rien_aide: 'Join a voice channel on this server, then search for a song below.',
        chercher: 'Search a song or paste a link (YouTube, Spotify, Deezer, SoundCloud)…', ajouter: 'Add', ensuite: 'Play next',
        file: 'Up next', file_vide: 'The queue is empty.', par: 'added by', auditeurs: (n) => `${n} listener${n > 1 ? 's' : ''}`,
        rejoins: (s) => `Join ${s} to control the music.`, direct: 'LIVE', boucle: { off: 'Loop off', file: 'Loop queue', piste: 'Loop track' },
        jeu: 'A music game is running: the player is locked until it ends.', retour: '← Back',
        e: { rejoins_vocal: 'Join a voice channel first.', droits_vocal: "Wumi can't join your voice channel.", introuvable: 'Nothing found.',
          connexion_echec: "Couldn't join the voice channel.", meme_salon: 'You must be in the same voice channel as Wumi.', reserve_dj: 'Reserved for the DJ role.',
          pas_de_precedent: 'No previous track.', indisponible: 'Music is unavailable right now.', rien: 'Nothing is playing.', jeu: 'A music game is running.', acces: "You're not on this server." },
        vote: (v) => `Vote to skip: ${v.votes}/${v.besoin}`, ajoute: 'Added!' }
    : { titre: 'Lecteur web', rien: 'Rien ne joue.', rien_aide: 'Rejoins un salon vocal de ce serveur, puis cherche un titre ci-dessous.',
        chercher: 'Cherche un titre ou colle un lien (YouTube, Spotify, Deezer, SoundCloud)…', ajouter: 'Ajouter', ensuite: 'Ensuite',
        file: 'À suivre', file_vide: 'La file est vide.', par: 'ajouté par', auditeurs: (n) => `${n} auditeur${n > 1 ? 's' : ''}`,
        rejoins: (s) => `Rejoins ${s} pour piloter la musique.`, direct: 'DIRECT', boucle: { off: 'Boucle coupée', file: 'Boucle de la file', piste: 'Boucle du titre' },
        jeu: 'Un jeu musical est en cours : le lecteur est bloqué jusqu’à la fin.', retour: '← Retour',
        e: { rejoins_vocal: "Rejoins d'abord un salon vocal.", droits_vocal: 'Wumi ne peut pas rejoindre ton salon vocal.', introuvable: 'Rien trouvé.',
          connexion_echec: 'Impossible de rejoindre le salon vocal.', meme_salon: 'Tu dois être dans le même salon vocal que Wumi.', reserve_dj: 'Réservé au rôle DJ.',
          pas_de_precedent: 'Pas de titre précédent.', indisponible: 'La musique est indisponible pour le moment.', rien: 'Rien ne joue.', jeu: 'Un jeu musical est en cours.', acces: "Tu n'es pas sur ce serveur." },
        vote: (v) => `Vote pour passer : ${v.votes}/${v.besoin}`, ajoute: 'Ajouté !' };

  const ICO = {
    prec: 'M19 20L9 12l10-8v16zM5 19V5', suiv: 'M5 4l10 8-10 8V4zM19 5v14', lecture: 'M7 4l13 8-13 8z', pause: 'M7 4h4v16H7zM13 4h4v16h-4z',
    boucle: 'M17 1l4 4-4 4M3 11V9a4 4 0 0 1 4-4h14M7 23l-4-4 4-4M21 13v2a4 4 0 0 1-4 4H3', melanger: 'M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6M4 4l5 5',
    volume: 'M11 5L6 9H2v6h4l5 4V5zM19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07', croix: 'M18 6L6 18M6 6l12 12', note: 'M9 18V5l12-2v13M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0zM21 16a3 3 0 1 1-6 0 3 3 0 0 1 6 0z',
  };
  function ico(nom, plein = false) {
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('class', plein ? 'plein' : '');
    const p = document.createElementNS(ns, 'path');
    p.setAttribute('d', ICO[nom]);
    svg.append(p);
    return svg;
  }
  const mmss = (ms) => {
    if (ms == null) return '–:––';
    const t = Math.floor(ms / 1000);
    const h = Math.floor(t / 3600);
    const m = Math.floor((t % 3600) / 60);
    const sec = String(t % 60).padStart(2, '0');
    return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
  };

  let arretLecteur = null;
  async function ecranMusique(id) {
    app.classList.remove('large');
    let etat = null;
    let recu = 0;
    let occupe = false;

    const zone = el('div', { class: 'lecteur-web' });
    const message = el('p', { class: 'lw-message', hidden: true });
    const saisie = el('input', { type: 'text', class: 'lw-recherche', placeholder: M.chercher, 'aria-label': M.chercher, maxlength: '300' });
    const resultats = el('div', { class: 'lw-resultats' });
    const formulaire = el('form', { class: 'lw-form', onsubmit: (e) => { e.preventDefault(); chercher(); } },
      el('span', { class: 'lw-loupe' }, ico('note')), saisie, el('button', { type: 'submit', class: 'bouton', text: M.ajouter }));
    app.replaceChildren(
      el('a', { class: 'bouton secondaire petit', href: '/', onclick: (e) => { e.preventDefault(); naviguer('/'); }, text: M.retour }),
      zone);

    function dire(texte, ok = false) { toast(texte, ok); }

    async function agir(corps) {
      if (occupe) return;
      occupe = true;
      try {
        const r = await api(`/api/musique/${id}/action`, corps);
        if (r.vote && !r.vote.passe) dire(M.vote(r.vote), true);
        if (corps.action === 'ajouter') dire(M.ajoute, true);
        etat = r.etat; recu = Date.now(); dessiner();
      } catch (e) {
        dire(M.e[e.code] ?? T.err_reseau);
        charger();
      } finally { occupe = false; }
    }

    let minuteurRecherche = null;
    async function chercher() {
      const q = saisie.value.trim();
      if (!q) return;
      // Un lien : on l'ajoute directement.
      if (/^https?:\/\//i.test(q)) { saisie.value = ''; resultats.replaceChildren(); return agir({ action: 'ajouter', requete: q }); }
      resultats.replaceChildren(el('p', { class: 'sous', text: '…' }));
      try {
        const r = await api(`/api/musique/${id}/recherche?q=${encodeURIComponent(q)}`);
        resultats.replaceChildren(...(r.resultats.length ? r.resultats.map((p) => el('div', { class: 'lw-ligne' },
          p.image ? el('img', { src: p.image, alt: '', loading: 'lazy', referrerpolicy: 'no-referrer' }) : el('div', { class: 'lw-vide' }, ico('note')),
          el('div', { class: 'lw-texte' }, el('b', { text: p.titre }), el('small', { text: `${p.auteur}${p.duree ? ` · ${mmss(p.duree)}` : ''}` })),
          el('button', { type: 'button', class: 'bouton petit secondaire', text: M.ensuite, onclick: () => agir({ action: 'ajouter', requete: p.requete, suivant: true }) }),
          el('button', { type: 'button', class: 'bouton petit', text: M.ajouter, onclick: () => agir({ action: 'ajouter', requete: p.requete }) })))
          : [el('p', { class: 'sous', text: M.e.introuvable })]));
      } catch (e) {
        resultats.replaceChildren(el('p', { class: 'erreur', text: M.e[e.code] ?? T.err_reseau }));
      }
    }
    saisie.addEventListener('input', () => {
      clearTimeout(minuteurRecherche);
      if (saisie.value.trim().length >= 3 && !/^https?:/i.test(saisie.value)) minuteurRecherche = setTimeout(chercher, 450);
    });

    // Morceaux qui bougent souvent : gardes pour la mise a jour fine.
    let barre = null; let temps = null; let rempli = null;

    function dessiner() {
      if (!etat) return;
      const L = etat.lecteur;
      const p = L?.actuelle;
      const enTete = el('div', { class: 'lw-entete' }, iconeServeur(etat.serveur),
        el('div', {}, el('h1', { text: M.titre }), el('p', { class: 'sous', text: [etat.serveur.nom, L?.salon ? `🔊 ${L.salon.nom}` : null, L ? M.auditeurs(L.auditeurs) : null].filter(Boolean).join(' · ') })));

      const blocs = [enTete];
      if (L && !L.dansSalon && !etat.moi.admin) blocs.push(el('p', { class: 'lw-alerte', text: M.rejoins(L.salon ? `🔊 ${L.salon.nom}` : '') }));
      if (L?.modeJeu) blocs.push(el('p', { class: 'lw-alerte', text: M.jeu }));

      // Carte « en cours »
      if (p) {
        barre = el('div', { class: 'lw-barre', role: 'slider', 'aria-label': 'position', tabindex: '0' });
        rempli = el('div', { class: 'lw-rempli' });
        barre.append(rempli);
        if (!p.direct) {
          barre.addEventListener('click', (e) => {
            const r = barre.getBoundingClientRect();
            agir({ action: 'position', valeur: Math.round(((e.clientX - r.left) / r.width) * p.duree) });
          });
        }
        temps = el('div', { class: 'lw-temps' }, el('span'), el('span', { text: p.direct ? M.direct : mmss(p.duree) }));
        const volume = el('input', { type: 'range', min: '1', max: '150', value: String(L.volume), class: 'lw-volume', 'aria-label': 'volume',
          onchange: () => agir({ action: 'volume', valeur: Number(volume.value) }) });
        const boucleEtat = L.boucle;
        blocs.push(el('section', { class: 'lw-carte' },
          el('div', { class: 'lw-pochette' }, p.image ? el('img', { src: p.image, alt: '', referrerpolicy: 'no-referrer' }) : ico('note')),
          el('div', { class: 'lw-infos' },
            p.direct ? el('span', { class: 'lw-direct', text: `● ${M.direct}` }) : null,
            el('h2', {}, p.lien ? el('a', { href: p.lien, target: '_blank', rel: 'noopener', text: p.titre }) : p.titre),
            el('p', { class: 'sous', text: [p.auteur, p.demandeurNom ? `${M.par} ${p.demandeurNom}` : null].filter(Boolean).join(' · ') }),
            p.direct ? null : barre, p.direct ? null : temps,
            el('div', { class: 'lw-commandes' },
              el('button', { type: 'button', class: `lw-btn${boucleEtat !== 'off' ? ' actif' : ''}`, title: M.boucle[boucleEtat], 'aria-label': M.boucle[boucleEtat], onclick: () => agir({ action: 'boucle' }) }, ico('boucle'), boucleEtat === 'piste' ? el('i', { text: '1' }) : null),
              el('button', { type: 'button', class: 'lw-btn', title: '⏮', 'aria-label': 'previous', disabled: !L.historique, onclick: () => agir({ action: 'precedent' }) }, ico('prec', true)),
              el('button', { type: 'button', class: 'lw-btn lw-principal', 'aria-label': L.pause ? 'play' : 'pause', onclick: () => agir({ action: 'pause' }) }, ico(L.pause ? 'lecture' : 'pause', true)),
              el('button', { type: 'button', class: 'lw-btn', title: '⏭', 'aria-label': 'next', onclick: () => agir({ action: 'passer' }) }, ico('suiv', true)),
              el('button', { type: 'button', class: 'lw-btn', title: '🔀', 'aria-label': 'shuffle', disabled: L.fileTotal < 2, onclick: () => agir({ action: 'melanger' }) }, ico('melanger')),
              el('label', { class: 'lw-vol' }, ico('volume'), volume, el('span', { text: `${L.volume}%` }))))));
      } else {
        barre = null; temps = null; rempli = null;
        blocs.push(el('section', { class: 'lw-carte lw-repos' }, el('div', { class: 'lw-pochette' }, el('img', { src: '/wumi-icone.svg', alt: '' })),
          el('div', { class: 'lw-infos' }, el('h2', { text: M.rien }), el('p', { class: 'sous', text: etat.moi.salon ? '' : M.rien_aide }))));
      }

      blocs.push(el('section', { class: 'panneau lw-ajout' }, formulaire, resultats));

      // La file
      if (L) {
        blocs.push(el('section', { class: 'panneau' },
          el('h2', { text: `${M.file}${L.fileTotal ? ` · ${L.fileTotal}` : ''}` }),
          L.file.length ? el('ol', { class: 'lw-file' }, L.file.map((f, i) => el('li', { class: 'lw-ligne' },
            el('span', { class: 'lw-num', text: String(i + 1) }),
            f.image ? el('img', { src: f.image, alt: '', loading: 'lazy', referrerpolicy: 'no-referrer' }) : el('div', { class: 'lw-vide' }, ico('note')),
            el('div', { class: 'lw-texte' }, el('b', { text: f.titre }), el('small', { text: [f.auteur, f.demandeurNom ? `${M.par} ${f.demandeurNom}` : null].filter(Boolean).join(' · ') })),
            el('span', { class: 'lw-duree', text: f.direct ? M.direct : mmss(f.duree) }),
            el('button', { type: 'button', class: 'lw-btn petit', 'aria-label': 'play', title: '▶', onclick: () => agir({ action: 'jouer', index: i }) }, ico('lecture', true)),
            el('button', { type: 'button', class: 'lw-btn petit', 'aria-label': 'remove', title: '✕', onclick: () => agir({ action: 'retirer', index: i }) }, ico('croix')))))
            : el('p', { class: 'vide', text: M.file_vide })));
      }
      const focus = document.activeElement === saisie;
      zone.replaceChildren(...blocs);
      if (focus) saisie.focus();
      tic();
    }

    function tic() {
      const p = etat?.lecteur?.actuelle;
      if (!p || p.direct || !rempli) return;
      const pos = Math.min(p.duree, etat.lecteur.position + (etat.lecteur.pause ? 0 : Date.now() - recu));
      rempli.style.width = `${Math.min(100, (pos / p.duree) * 100)}%`;
      temps.firstChild.textContent = mmss(pos);
    }

    async function charger() {
      try {
        etat = await api(`/api/musique/${id}`);
        recu = Date.now();
        // On ne redessine pas sous les doigts de quelqu'un qui tape.
        if (document.activeElement !== saisie || !resultats.childElementCount) dessiner();
      } catch (e) {
        zone.replaceChildren(el('p', { class: 'vide erreur', text: M.e[e.code] ?? T.err_reseau }));
      }
    }

    await charger();
    const tPoll = setInterval(() => { if (!document.hidden && !occupe) charger(); }, 4000);
    const tTic = setInterval(tic, 500);
    arretLecteur = () => { clearInterval(tPoll); clearInterval(tTic); arretLecteur = null; };
    return message;
  }

  // -------------------------------------------------------------- ROUTAGE
  async function route() {
    if (arretLecteur) arretLecteur();
    if (!moi) {
      try {
        moi = await api('/api/moi');
      } catch (e) {
        if (e.status === 401) return ecranConnexion();
        app.replaceChildren(el('p', { class: 'vide erreur', text: T.err_reseau }));
        return null;
      }
      const p = document.getElementById('profil');
      p.hidden = false;
      document.getElementById('profil-nom').textContent = moi.utilisateur.nom;
      const img = document.getElementById('profil-avatar');
      if (moi.utilisateur.avatar) img.src = moi.utilisateur.avatar; else img.remove();
    }
    const mu = location.pathname.match(/^\/musique\/(\d+)$/);
    if (mu) return ecranMusique(mu[1]);
    const m = location.pathname.match(/^\/serveur\/(\d+)$/);
    if (m) return ecranServeur(m[1]);
    return ecranServeurs();
  }

  route();
})();
