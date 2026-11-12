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
    erreurs: { nombre_invalide: 'Invalid number', valeur_inconnue: 'Unknown value', trop_long: 'Too long', salon_invalide: 'Invalid channel (or I cannot write there)', categorie_invalide: 'Invalid category', role_invalide: 'Invalid role', role_gere: 'This role is managed by an integration', role_trop_haut_bot: 'This role is above my role', role_trop_haut_toi: 'This role is above your highest role', role_dangereux: 'This role has moderation/admin permissions', emoji_invalide: 'Invalid emoji', trop_menus: 'Too many panels (25 max)', trop_roles: 'Too many roles (25 max)', titre_requis: 'A title is required', aucun_role: 'Add at least one role', deja: 'Already in the panel', pas_dedans: 'Not in the panel', introuvable: 'Not found', envoi_impossible: 'Discord refused the message', droits_bot: 'I need Embed Links in this channel', droits_toi: "You can't write in this channel", couleur_invalide: 'Invalid color (e.g. #58a6ff)', image_invalide: 'The image must be an https link', url_invalide: 'Button links must start with https://', vide: 'Add a title or a text', droits_moderation: 'You need « Moderate Members »' },
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
    erreurs: { nombre_invalide: 'Nombre invalide', valeur_inconnue: 'Valeur inconnue', trop_long: 'Trop long', salon_invalide: "Salon invalide (ou je ne peux pas y écrire)", categorie_invalide: 'Catégorie invalide', role_invalide: 'Rôle invalide', role_gere: 'Ce rôle est géré par une intégration', role_trop_haut_bot: 'Ce rôle est au-dessus de mon rôle', role_trop_haut_toi: 'Ce rôle est au-dessus de ton rôle le plus haut', role_dangereux: 'Ce rôle a des permissions de modération ou d\'admin', emoji_invalide: 'Emoji invalide', trop_menus: 'Trop de panneaux (25 max)', trop_roles: 'Trop de rôles (25 max)', titre_requis: 'Il faut un titre', aucun_role: 'Ajoute au moins un rôle', deja: 'Déjà dans le panneau', pas_dedans: "Pas dans le panneau", introuvable: 'Introuvable', envoi_impossible: 'Discord a refusé le message', droits_bot: "Il me faut « Intégrer des liens » dans ce salon", droits_toi: 'Tu ne peux pas écrire dans ce salon', couleur_invalide: 'Couleur invalide (ex. #58a6ff)', image_invalide: "L'image doit être un lien https", url_invalide: 'Les liens des boutons doivent commencer par https://', vide: 'Ajoute un titre ou un texte', droits_moderation: 'Il te faut « Modérer les membres »' },
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

  };
  document.documentElement.lang = EN ? 'en' : 'fr';
  document.getElementById('t-dashboard').textContent = T.dashboard;
  document.getElementById('t-deconnexion').textContent = T.deconnexion;

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
      el('div', { class: 'logo' }, svgLogo(42)),
      el('h1', { text: T.titre_accueil }),
      el('p', { text: T.intro_accueil }),
      erreur ? el('p', { class: 'erreur', text: messages[erreur] ?? T.err_discord }) : null,
      el('a', { class: 'bouton', href: '/connexion', text: T.connexion })
    ));
  }

  function svgLogo(l) {
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 120 80');
    svg.setAttribute('width', l);
    svg.setAttribute('height', Math.round(l * 0.66));
    const p = document.createElementNS(ns, 'polyline');
    p.setAttribute('points', '14,14 26,56 44,32 62,56 74,14');
    Object.entries({ fill: 'none', stroke: '#fff', 'stroke-width': 18, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }).forEach(([k, v]) => p.setAttribute(k, v));
    const c = document.createElementNS(ns, 'circle');
    Object.entries({ cx: 100, cy: 58, r: 10, fill: '#fff' }).forEach(([k, v]) => c.setAttribute(k, v));
    svg.append(p, c);
    return svg;
  }

  function ecranServeurs() {
    const cartes = moi.serveurs.map((s) => (s.present
      ? el('a', { class: 'serveur', href: `/serveur/${s.id}`, onclick: (e) => { e.preventDefault(); naviguer(`/serveur/${s.id}`); } },
        iconeServeur(s), el('strong', { text: s.nom }), el('span', { class: 'etiquette', text: T.present }), el('span', { class: 'bouton petit', text: T.configurer }))
      : el('a', { class: 'serveur absent', href: s.invitation, target: '_blank', rel: 'noopener' },
        iconeServeur(s), el('strong', { text: s.nom }), el('span', { class: 'etiquette', text: T.absent }), el('span', { class: 'bouton petit secondaire', text: T.inviter }))));
    app.replaceChildren(
      el('h1', { text: T.mes_serveurs }),
      el('p', { class: 'sous', text: T.mes_serveurs_sous }),
      cartes.length ? el('div', { class: 'grille' }, cartes) : el('p', { class: 'vide', text: T.aucun_serveur })
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
      const b = el('button', { type: 'button', 'data-cle': cle, text: nom, onclick: () => ouvrir(cle, rendre) });
      boutons.push(b);
      return b;
    };
    const bStats = bouton('stats', T.s_stats, () => vueStats(d));
    const bCats = d.categories.map((c) => bouton(c.cle, c.nom, () => vueCategorie(d, c)));
    const bOutils = [
      bouton('roles', T.s_rr, () => vueRoles(d)),
      bouton('embed', T.s_embed, () => vueEmbed(d)),
      bouton('sanctions', T.s_sanctions, () => vueSanctions(d)),
      bouton('paliers', T.paliers, () => vuePaliers(d)),
      bouton('journal', T.journal, () => vueJournal(d)),
    ];

    app.replaceChildren(
      el('div', { class: 'entete' },
        iconeServeur(d.serveur),
        el('div', {}, el('h1', { text: d.serveur.nom })),
        el('a', { class: 'bouton secondaire petit retour', href: '/', onclick: (e) => { e.preventDefault(); naviguer('/'); }, text: T.retour })),
      el('div', { class: 'stats' },
        el('div', { class: 'stat' }, el('b', { text: new Intl.NumberFormat(EN ? 'en-US' : 'fr-FR').format(d.serveur.membres ?? 0) }), el('small', { text: T.membres })),
        el('div', { class: 'stat' }, el('b', { text: d.stats.sanctions30 }), el('small', { text: T.sanctions30 })),
        el('div', { class: 'stat' }, el('b', { text: d.stats.ticketsOuverts }), el('small', { text: T.tickets })),
        el('div', { class: `stat${d.stats.raid ? ' alerte' : ''}` }, el('b', { text: d.stats.raid ? T.raid_on : T.raid_off }), el('small', { text: T.raid }))),
      el('div', { class: 'disposition' },
        el('nav', { class: 'menu' }, bStats, el('hr'), bCats, el('hr'), bOutils),
        contenu)
    );

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
  const SERIE = { 1: '#3987e5', 2: '#d95926', 3: '#199e70', 4: '#c98500' };
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
    const couleur = el('input', { type: 'color', value: '#58a6ff' });
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

  // -------------------------------------------------------------- ROUTAGE
  async function route() {
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
    const m = location.pathname.match(/^\/serveur\/(\d+)$/);
    if (m) return ecranServeur(m[1]);
    return ecranServeurs();
  }

  route();
})();
