/*
 * Page de l'Activite de verification de Wumi.
 *
 * Elle tourne DANS Discord (une iframe). Pour parler au client Discord, on
 * utilise le meme protocole que le SDK officiel (@discord/embedded-app-sdk),
 * reduit au strict necessaire — ce qui evite d'avoir a compiler/empaqueter le
 * SDK : il suffit de servir ces trois fichiers.
 *
 *   [0, {...}]  HANDSHAKE   on se presente au client Discord
 *   [1, {...}]  FRAME       commandes (AUTHORIZE) et evenements (READY)
 *   [2, {...}]  CLOSE       fermer l'Activite
 *
 * La page n'a AUCUN pouvoir par elle-meme : elle transmet un code OAuth2 au
 * serveur de Wumi, qui verifie l'identite aupres de Discord et decide.
 */
(() => {
  'use strict';

  const OP = { HANDSHAKE: 0, FRAME: 1, CLOSE: 2, HELLO: 3 };
  const ORIGINES = /^https:\/\/([a-z0-9-]+\.)?(discord\.com|discordapp\.com)$/;
  const params = new URLSearchParams(window.location.search);
  const frameId = params.get('frame_id');
  const guildId = params.get('guild_id');

  const $ = (id) => document.getElementById(id);
  const etapes = ['chargement', 'regles', 'defi', 'reussi', 'erreur'];
  let textes = null;
  let session = null;
  let enCours = false;
  let dejaPresente = false;

  function montrer(nom) {
    for (const e of etapes) $(`etape-${e}`).classList.toggle('cachee', e !== nom);
  }

  function erreur(message, peutReessayer = true) {
    if (textes) {
      $('erreur-titre').textContent = textes.erreur_titre;
      $('reessayer').textContent = textes.reessayer;
    }
    $('erreur-texte').textContent = message;
    $('reessayer').style.display = peutReessayer ? '' : 'none';
    montrer('erreur');
  }

  // ------------------------------------------------------------- RPC DISCORD
  const parent = window.parent.opener ?? window.parent;
  const origineParent = document.referrer || '*';
  const attentes = new Map();
  let pret = null;
  const promessePret = new Promise((r) => { pret = r; });

  function poster(op, donnees) {
    parent.postMessage([op, donnees], origineParent);
  }

  window.addEventListener('message', (evt) => {
    if (!ORIGINES.test(evt.origin)) return;
    if (!Array.isArray(evt.data)) return;
    const [op, donnees] = evt.data;
    if (op === OP.FRAME && donnees) {
      if (donnees.cmd === 'DISPATCH') {
        if (donnees.evt === 'READY') pret(donnees.data);
        return;
      }
      const attente = attentes.get(donnees.nonce);
      if (!attente) return;
      attentes.delete(donnees.nonce);
      if (donnees.evt === 'ERROR') attente.rejeter(new Error(donnees.data?.message ?? 'erreur Discord'));
      else attente.resoudre(donnees.data);
    } else if (op === OP.CLOSE) {
      // Discord ferme l'Activite : rien a faire, la page va disparaitre.
    }
  });

  function commande(cmd, args) {
    const nonce = (crypto.randomUUID && crypto.randomUUID()) || String(Math.random()).slice(2);
    return new Promise((resoudre, rejeter) => {
      attentes.set(nonce, { resoudre, rejeter });
      poster(OP.FRAME, { cmd, args, nonce });
      setTimeout(() => {
        if (attentes.delete(nonce)) rejeter(new Error(`${cmd} : pas de réponse de Discord`));
      }, 120000);
    });
  }

  function fermerActivite() {
    poster(OP.CLOSE, { code: 1000, message: 'verification terminee' });
  }

  // ------------------------------------------------------------------- API
  async function api(chemin, corps) {
    const r = await fetch(chemin, {
      method: corps ? 'POST' : 'GET',
      headers: corps ? { 'Content-Type': 'application/json' } : {},
      body: corps ? JSON.stringify(corps) : undefined,
    });
    let json = {};
    try { json = await r.json(); } catch { /* reponse vide */ }
    if (!r.ok) throw Object.assign(new Error(json.message || json.erreur || `HTTP ${r.status}`), { json });
    return json;
  }

  // ---------------------------------------------------------------- ETAPES
  function appliquerTextes() {
    $('titre').textContent = textes.titre;
    $('etiquette').textContent = textes.sous_titre;
    $('regles-titre').textContent = textes.regles_titre;
    $('regles-accepter').textContent = textes.regles_accepter;
    $('continuer').textContent = textes.continuer;
    $('defi-titre').textContent = textes.defi_titre;
    $('reussi-titre').textContent = textes.reussi_titre;
    $('fermer').textContent = textes.fermer;
    const liste = $('regles');
    liste.replaceChildren(...textes.regles.map((r) => {
      const li = document.createElement('li');
      li.textContent = r;
      return li;
    }));
  }

  function afficherMembre(user) {
    const bloc = $('membre');
    bloc.replaceChildren();
    if (user.avatar) {
      const img = document.createElement('img');
      img.src = user.avatar;
      img.alt = '';
      img.referrerPolicy = 'no-referrer';
      img.onerror = () => img.remove();
      bloc.append(img);
    }
    const txt = document.createElement('div');
    const nom = document.createElement('strong');
    nom.textContent = user.nom;
    const serveur = document.createElement('small');
    serveur.textContent = textes.serveur;
    txt.append(nom, serveur);
    bloc.append(txt);
  }

  function afficherDefi(defi) {
    $('defi-texte').replaceChildren();
    const morceaux = textes.defi_texte.split('{emoji}');
    $('defi-texte').append(document.createTextNode(morceaux[0] ?? ''));
    const b = document.createElement('b');
    b.textContent = defi.cible;
    $('defi-texte').append(b, document.createTextNode(morceaux[1] ?? ''));

    const grille = $('grille');
    grille.replaceChildren(...defi.choix.map((emoji) => {
      const bouton = document.createElement('button');
      bouton.type = 'button';
      bouton.textContent = emoji;
      bouton.setAttribute('aria-label', emoji);
      bouton.addEventListener('click', () => choisir(emoji));
      return bouton;
    }));
  }

  async function choisir(emoji) {
    if (enCours) return;
    enCours = true;
    $('defi-message').textContent = '';
    for (const b of $('grille').children) b.disabled = true;
    try {
      const r = await api('/api/verifier', { session, choix: emoji, regles: $('accepter').checked });
      if (r.ok) {
        $('reussi-texte').textContent = r.message;
        montrer('reussi');
        return;
      }
      $('defi-message').textContent = r.message || '…';
      if (r.defi) afficherDefi(r.defi);
      else erreur(r.message, true);
    } catch (e) {
      erreur(e.message);
    } finally {
      enCours = false;
      for (const b of $('grille').children) b.disabled = false;
    }
  }

  // ---------------------------------------------------------------- DEPART
  async function demarrer() {
    montrer('chargement');
    if (!frameId) {
      erreur('Ouvre cette page depuis Discord (Activité « Vérification » du serveur support).', false);
      return;
    }

    const { client_id: clientId } = await api('/api/config');
    // Le choix entre verification et Astro Run est fait par le serveur avant
    // meme d'envoyer cette page (voir src/public/serveur.js).
    if (!dejaPresente) {
      dejaPresente = true;
      poster(OP.HANDSHAKE, { v: 1, encoding: 'json', client_id: clientId, frame_id: frameId, sdk_version: '2.0.0' });
    }

    // READY peut ne jamais arriver sur un client tres ancien : on n'attend pas
    // indefiniment.
    await Promise.race([promessePret, new Promise((r) => setTimeout(r, 4000))]);

    const { code } = await commande('AUTHORIZE', {
      client_id: clientId,
      response_type: 'code',
      state: '',
      prompt: 'none',
      scope: ['identify'],
    });

    let donnees;
    try {
      donnees = await api('/api/token', { code, guild_id: guildId });
    } catch (e) {
      if (e.json?.textes) { textes = e.json.textes; appliquerTextes(); }
      erreur(e.json?.message || e.message, e.json?.erreur !== 'ailleurs');
      return;
    }

    textes = donnees.textes;
    session = donnees.session;
    appliquerTextes();
    afficherMembre(donnees.user);

    if (donnees.deja) {
      $('reussi-titre').textContent = textes.reussi_titre;
      $('reussi-texte').textContent = textes.reussi_texte;
      montrer('reussi');
      return;
    }
    if (donnees.bloque) {
      erreur(donnees.bloque, false);
      return;
    }

    afficherDefi(donnees.defi);
    montrer('regles');
  }

  $('accepter').addEventListener('change', (e) => { $('continuer').disabled = !e.target.checked; });
  $('continuer').addEventListener('click', () => montrer('defi'));
  $('fermer').addEventListener('click', fermerActivite);
  $('reessayer').addEventListener('click', () => {
    demarrer().catch((e) => erreur(e.message));
  });

  demarrer().catch((e) => erreur(e.message));
})();
