# Wumi — ce qui change

## 3.0.2

- **Stickers recadrés** : plus rien n'est coupé (bulles, confettis, larmes, « zz ») — chaque sticker est recadré avec une marge. `outils/stickers-serveur.js --remplacer` repose les stickers Wumi déjà posés par le bot.
- **Premium · Wumi à ton image sur le tableau de bord** : nom, avatar, bannière et bio du bot propres au serveur, réglables dans l'onglet Premium (comme `/premium bot`), avec un bouton pour revenir au Wumi d'origine.

## 3.0.1

- **Stickers de serveur** : 15 stickers de la mascotte (`outils/generer-stickers.js`, 320 × 320, contour blanc façon autocollant, bulles « Hello! », « Merci ! », « GG »…). `outils/stickers-serveur.js` les pose sans rien effacer.

## 3.0.0 · Wumi v3

La v3 regroupe tout ce qui est sorti de la 2.36 à la 2.41, plus :
- **Page de statut** : la version du bot est affichée (`versionBot` dans `/api/statut`), avec un lien vers les nouveautés.
- **Affiche v3** : `node outils/affiche-da.js --v3` (fr / en).

Ce qu'apporte la v3, en bref :
- **Nouvelle identité** : la mascotte orange, une DA chaude partout (bot, cartes, bannières, site, dashboard), nouvel avatar, emojis Kubai et « tête de Wumi », nouvelle pièce.
- **Nouveau site** : accueil, Fonctionnalités, Docs, Premium, Statut (légende, version), Nouveautés, pages légales complètes, mode sombre par défaut, bandeau des serveurs (sur accord), avis.
- **Nouveau tableau de bord** : menu latéral, icônes, choix du serveur, recherche.
- **Musique** : lecteur web, jeux musicaux (quiz, qui l'a choisie, vibe check).
- **Alertes stylées** : une carte image pour chaque live et vidéo.
- **Avis** : `/avis`, relus avant publication sur le site et dans le salon des avis.
- **Support** : bot Modmail à part avec prise en charge, `/admin` sur le serveur staff.

## 2.41.2

- **Modmail : prise en charge.** La fiche d'une conversation a un bouton « ✋ Prendre en charge » : le bouton devient « Pris en charge : <nom> », le fil est renommé `✋ <nom> · <membre>`, le membre est prévenu en MP. Un nouveau clic (de la même personne ou d'un fondateur) libère la conversation.
- Visuels du bot Modmail : `outils/generer-visuels-modmail.js` (avatar, bannière de profil, bannière de salon).

## 2.41.1

- **Avis** : cliquer « Publier » poste aussi l'avis dans le salon des avis du serveur support (`AVIS_SALON_ID`, par défaut 1561112714804199526) ; « Masquer », « Supprimer » ou un avis réécrit le retirent.

## 2.41.0 · Le lecteur web

- **Lecteur de musique web** sur le tableau de bord : `dash.wumi.fr/musique/<id du serveur>`. Pochette, barre de progression (cliquer pour avancer), pause, précédent, suivant, boucle, mélange, volume, recherche avec « Ajouter » / « Ensuite », la file avec « jouer maintenant » et « retirer ». Mise à jour toutes les 4 secondes.
- Ouvert à **tous les membres** du serveur (pas besoin de gérer le serveur), avec exactement les mêmes règles que dans Discord : être dans le salon vocal, rôle DJ s'il y en a un, vote pour passer. Sans lecteur en cours, chercher un titre lance la musique dans ton salon vocal.
- Bouton **🌐 Lecteur web** sur le panneau musique de Discord, et entrée « Lecteur web » dans le menu du tableau de bord. Après la connexion Discord, on revient sur la page demandée.
- Code : `src/public/musiqueWeb.js` (routes `/api/musique/...`).

## 2.40.1 · Emojis tête de Wumi, bot Modmail

- **Emojis « tête de Wumi »** (`outils/generer-emojis-tete.js`) : 17 expressions de la mascotte (joie, amour, triste, colère, choc, cool, mdr, ok, non…), sur tuile orange comme le logo. `outils/emojis-tete.js` les pose sur le serveur support sans jamais rien effacer.
- **Nouvelle pièce** `ku_wumicoin` : la monnaie (économie) n'utilise plus l'ancien emoji.
- **`publier-pages.js --tout`** : remet à jour toutes les pages du support déjà publiées (nouveaux emojis), sans reposter.
- **Édition Modmail** (`WUMI_EDITION=modmail`, `.env.modmail`, `ecosystem.modmail.config.js`) : un bot à part, rien que pour le modmail — aucune commande, seuls les MP, les fils du staff et les boutons. Salon via `MODMAIL_SALON_ID`. Panneau : `outils/panneau-modmail.js`. Côté Wumi, `MODMAIL_BOT_ID` renvoie les MP et l'ancien panneau vers ce bot.
- **Dashboard** : thème sombre par défaut.

## 2.40.0 · Alertes stylées et avis

- **Alertes Twitch / YouTube / TikTok / Instagram / RSS** : chaque annonce porte maintenant une **carte image** aux couleurs de Wumi (`src/utils/carteAlerte.js`) — la vignette en grand avec une pastille « EN DIRECT » / « NOUVELLE VIDÉO », l'avatar de la chaîne, son nom, le titre, le jeu et les spectateurs. Si la carte échoue, l'annonce part comme avant.
- **`/review` (`/avis`)** : `ecrire` (note 1 à 5 + texte), `voir`, `supprimer`. Un avis par personne. Chaque avis arrive en attente dans `LOG_AVIS` (repli `LOG_DEFAUT`, puis MP aux fondateurs) avec les boutons Publier / Masquer / Supprimer, réservés aux fondateurs.
- **`/api/avis`** : les avis publiés (moyenne, nombre, liste), affichés sur la page d'accueil de wumi.fr. Rien n'apparaît sans avoir été publié à la main.

## 2.39.4 · Le logo tel quel

- Plus jamais de mascotte orange : dans les grandes bannières, l'affiche, l'image de partage du site et la bannière du serveur, la mascotte est montrée comme dans le logo (tuile orange, mascotte brun noir `#221B10`, yeux blancs). Nouvelle fonction `logo()` dans `src/utils/mascotte.js`.
- Toutes les bannières du support et des pages sont regénérées.

## 2.39.3

- Le bleu pâle `#dce3ff` (ancienne couleur principale) disparaît : modèle « règlement » de `/embed` en orange, motif « autre » des tickets en orange clair, et `rafraichir-bannieres.js` le remplace aussi sur les messages déjà publiés.

## 2.39.2

- Les derniers filets bleus passent à l'orange : panneau de vérification, rôles du support, pages FAQ, réponses de `/admin`, maintenance des incidents (ambre).
- `outils/rafraichir-bannieres.js` recolore aussi, sur place, le filet des messages déjà publiés (anciens bleus → orange).

## 2.39.1

- `outils/rafraichir-bannieres.js` lit aussi les images des messages Components V2 (Discord ne les liste pas dans les pièces jointes) ; sans identifiant, il vise le serveur support.

## 2.39.0 · Nouveau tableau de bord, dernières images à l'orange

- **Tableau de bord** : menu latéral rangé en *Vue d'ensemble*, *Modules* et *Outils*, avec une icône par module ; choix du serveur en haut du menu ; recherche dans la liste des serveurs ; nouvel écran de connexion avec la mascotte ; tout aux couleurs orange (sombre et clair).
- **Dernières images** : le décor des cartes (`fond.png`, utilisé par les thèmes Océan, Braise…) passe au brun chaud ; couleur d'accent des cartes, embed « annonce » de `/embed`, Wrapped et motif « question » des tickets en orange.
- **`outils/rafraichir-bannieres.js <id_serveur> [--essai]`** : remplace sur place les bannières des messages déjà publiés (tickets, vérification, idées, bugs, pages support…), sans reposter : liens, boutons et menus restent.

## 2.38.0 · Nouvelle identité : la mascotte orange

- **Couleurs** : l'orange du logo (#FF9D1B) et son brun noir (#221B10) remplacent le bleu et le violet partout : couleur principale des messages, thème de carte /rank par défaut (« Wumi », dégradé brun et orange), cartes de niveau, classement, économie, infos, bienvenue et /wrapped.
- **La mascotte** (`src/utils/mascotte.js`, tracés du logo pour le canvas) remplace le « W. » dans le filigrane des cartes et sur toutes les bannières.
- **Bannières régénérées** : serveur support (bienvenue, règlement, informations, FAQ), tickets (panneau, ticket, formulaire, fermé), vérification, idées, bugs, giveaways, modmail, recrutement, vote ; bannière du profil du bot (`outils/generer-banniere-profil.js`).
- Nouvel emoji `ku_wumi` (la mascotte).

## 2.37.1 · Correctif des éditions

- **Déployeur** : une édition héritait de l'environnement de Wumi (le deployeur avait chargé le `.env` principal) : port public, base et identifiants de Wumi passaient avant les siens, d'où la page de statut servie par le mauvais bot. L'édition est maintenant lancée avec un environnement nettoyé (`envEdition`) et redémarrée de zéro (`pm2 delete` + `pm2 start ecosystem.<nom>.config.js` + `pm2 save`).

## 2.37.0 · Les jeux musicaux

- **`/musicgame` (`/jeu-musical`)** : trois jeux pour le vocal, à côté du blind test (une seule partie à la fois par serveur).
  - **Quiz musical** (`quiz`) : un extrait, 4 titres en boutons, une réponse par personne. Plus on répond vite, plus on marque (1000 → 300 points), et une série de bonnes réponses ajoute jusqu'à +500. La manche s'arrête dès que tout le vocal a répondu.
  - **Qui l'a choisie ?** (`who-picked` / `qui-l-a-choisie`) : inscriptions 90 s, chacun propose 1 à 3 titres en secret (nom ou lien YouTube, Spotify, Deezer…). Chaque titre passe 30 s, on devine qui l'a mis dans un menu. Bonne réponse +1 ; si personne ne trouve, l'auteur gagne +2. 3 joueurs minimum, 25 au plus.
  - **Vibe check** (`vibe-check`) : chacun note le titre de 1 à 10 en secret ; points = 10 − écart à la moyenne du vocal. « Hot take » pour l'avis le plus éloigné (3 joueurs et plus). Marche en solo.
- Mêmes thèmes que le blind test, lecteur en « mode jeu » pendant la partie, arrêt par le lanceur, le rôle DJ ou un admin.

## 2.36.2

- Emoji `langue` redessiné (l'icône Kubai d'origine contenait un caractère sans police sur le serveur) : nouveau nom `ku_langue_v2`, l'ancien reste sur l'application. Mécanisme `VERSIONS` dans `src/utils/emojis.js` pour les prochains dessins corrigés.

## 2.36.1 · Banderole des serveurs sur wumi.fr

- **`/config` › Communauté › « Afficher sur wumi.fr »** (désactivé par défaut) : le serveur apparaît dans la banderole défilante du site, avec son nom, son icône et son nombre de membres. Rien n'est montré sans cet accord.
- Nouvelle API publique **`/api/vitrine`** (serveurs volontaires d'au moins 20 membres, 40 au plus, dix minutes de cache).

## 2.36.0 · Emojis Kubai

- **Nouveau jeu d'emojis** dessiné à partir des icônes [Kubai](https://icons.kubai.design) (style « layered », licence MIT) : `outils/generer-emojis-kubai.js` les télécharge une fois (cache `outils/kubai-icons/`), les recolore selon leur sens (vert réussite, rouge erreur, or économie…) et produit `src/assets/emojis/ku_*.png`.
- Au démarrage, le bot téléverse les `ku_` et les préfère ; s'il en manque un, il reprend l'ancien `wi_`, puis `wu_`, puis l'emoji Unicode.

## 2.35.0 · Éditions, packs de statistiques, commandes plus lisibles

- **Éditions** (`src/edition.js`, `src/editions/`) : le même code peut tourner comme un AUTRE bot, avec son token, sa base, sa langue fixe, ses modules et son propre deck. `WUMI_EDITION=auvergne` + `WUMI_ENV=.env.auvergne` (voir `ecosystem.auvergne.config.js` et `outils/edition-auvergne.env.exemple`). Le nom « Wumi » est remplacé par celui de l'édition dans tous les messages ; tous les plafonds Premium sont ouverts.
- Le déployeur suit les éditions : `DEPLOY_EDITIONS="Nom:.env.nom"` dans le .env → commandes redéployées et redémarrage après chaque mise à jour. La clé de chiffrement d'une édition va dans SON fichier d'environnement.
- **`/server stats pack`** : un pack de salons statistiques stylés dans leur catégorie (élégant « 🧭 Membres : 9555 », minimal, points), plus jusqu'à 2 salons fixes (invitation, site).
- **Un emoji devant la description de chaque commande** dans la liste « / » de Discord.

## 2.34.0 · Les cartes à collectionner

- **`/cards` (`/cartes`)** : 72 créatures de l'univers Wumi (Série 1), 6 familles (Pixel, Nuage, Glitch, Néon, Nuit, Cosmos), 6 raretés (commune → mythique) et une version **brillante** (1 chance sur 40). Les cartes sont dessinées par le bot (`src/utils/cartes/`) : aucune image stockée.
- **Boosters** de 5 cartes : un tous les 100 messages comptés (même anti-spam que l'XP, 🎴 en réaction), un gratuit par jour (`/cards daily`), ou achetés avec la monnaie du serveur (`/cards buy`, 500 par défaut). Stock max 20.
- **Ouverture animée** : le paquet, puis les cartes une par une (de la moins rare à la plus rare), puis le récapitulatif. Les cartes sont enregistrées dès l'ouverture.
- **Classeur** (`/cards binder`) famille par famille avec les cases vides en silhouette, **vitrine** de 5 cartes (`/cards showcase`, `/cards deck`), `/cards view`, `/cards info`, `/cards leaderboard`.
- **Pas de don ni d'échange**, voulu. Les doubles se recyclent en poussière (`/cards recycle`, 100 = un booster).
- Chaque serveur a sa propre collection. Réglages dans `/config` › Économie : activer, messages par booster, prix, booster quotidien.

## 2.33.1

- FAQ : étalonnage sur le serveur avec de vraies questions. MiniLM séparait mal les bonnes fiches des mauvaises (une question hors sujet pouvait dépasser une bonne) ; passage à mpnet, nettement meilleur. Chaque fiche est comparée par sa question ET par le début de sa réponse, sans les mots-clés en vrac (qui brouillaient le sens). Seuils : 0,43 de similarité = 55.

## 2.33.0 · La FAQ comprend les questions

- **FAQ intelligente** : en plus des mots-clés, un modèle d'IA (Xenova/paraphrase-multilingual-mpnet-base-v2, sur le serveur de Wumi) compare le SENS de la question à celui des fiches. « le bot répond plus » trouve « Wumi ne marche pas », et une question en anglais trouve une fiche en français. Le score final est le meilleur des deux (mots-clés ou sens). Sert aux réponses automatiques, à `/faq chercher` et `/faq tester` (qui montre les deux scores).
- Une question sans « ? » est reconnue dans les 6 langues (how, wie, cómo, perché…), plus seulement en français.
- **Tickets : la FAQ répond à l'ouverture.** Si le sujet ou la description du ticket correspond à une fiche, elle est postée dans le ticket avec deux boutons : « C'est réglé » (ferme le ticket, raison « Résolu par la FAQ ») et « J'attends l'équipe ». Tickets de tous les serveurs ET du serveur support. Réglage `ticket_faq` dans `/config` (activé par défaut).
- Le modèle de sens est préchargé au démarrage s'il sert, et rendu après 30 min sans question (~300 Mo en mémoire).
- `outils/faq-support.js` : fiches du support mises à jour (6 langues, permissions, modération).

## 2.32.2

- Serveur support : une FAQ en anglais et en français (`faq` et `faq-fr`), 10 sujets qui s'ouvrent en privé (démarrer, panne, permissions, langue, modération, niveaux, annonces, musique, Premium, données), avec sa bannière.
- Page d'informations : « 6 langues », automod IA, renvoi vers la FAQ.

## 2.32.1

- Vérification du support : le code de secours répond tout de suite, puis donne le rôle. Avant, quand beaucoup de monde arrivait en même temps, donner le rôle prenait plus de 3 secondes et Discord renvoyait « Unknown interaction » (le membre était pourtant vérifié).

## 2.32.0 · L'IA de Wumi (en local)

- **Automod · IA messages toxiques** (`/automod module ia`) : un modèle multilingue repère les insultes, la haine et le harcèlement, même mal orthographiés ou déguisés. Seuil de certitude 90 %, réglable dans `config.js` (`automod.iaSeuil`).
- **Automod · IA images NSFW** (`/automod module images`) : les images choquantes sont supprimées hors des salons marqués NSFW. L'image n'est jamais recopiée dans le journal.
- **Automod · Arnaques** (`/automod module arnaques`, actif par défaut avec l'automod) : faux Nitro, faux cadeaux Steam, « je t'ai signalé par erreur », faux airdrops crypto, domaines qui imitent Discord ou Steam. Six langues. Il faut presque toujours un lien pour déclencher : une conversation sur le Nitro n'est jamais supprimée.
- **Traduire un message** : clic droit sur un message › Applications › Traduire. Traduit dans la langue Discord de la personne qui clique, visible d'elle seule.
- Tout tourne **sur le serveur du bot** (@huggingface/transformers, modèles ONNX) : aucun message n'est envoyé à un service externe. Une seule analyse à la fois, pour ne jamais saturer le processeur.
- Bibliothèque **optionnelle** : sans `npm install`, le bot tourne comme avant et les modules IA affichent « IA indisponible ». `IA_DESACTIVEE=1` coupe tout. Modèles téléchargés une fois dans `data/modeles`.

## 2.31.0 — Quatre nouvelles langues

- Wumi parle aussi **espagnol, allemand, portugais (Brésil) et italien**. Chaque serveur choisit sa langue (`/setup`, `/config` → Serveur) ; un serveur qui arrive avec une de ces langues sur Discord la reçoit d'office.
- **Tout le bot est traduit** : messages, commandes, options, boutons, menus, cartes, logs, tickets, modmail, panneaux du support, console du fondateur (4 654 textes par langue). Un texte manquant s'afficherait en anglais, jamais vide.
- Les descriptions des commandes **et les noms des choix** (menus des options) suivent la langue Discord de chaque membre (es-ES, es-419, de, pt-BR, it).
- Quiz : les 65 questions et les noms des pays (drapeaux) dans les quatre langues. Pendu : une liste de mots par langue. Candidatures : questions par défaut traduites. Graphiques d'activité dans la langue du serveur.
- `outils/faq-support.js` : FAQ du serveur support (13 fiches).

## 2.30.3

- Commandes du fondateur (`/admin`, `/sauvegarde`) sur le serveur staff (`STAFF_GUILD_ID`) ; les commandes propres au support (`/noel`) y restent.
- Wumi Staff : rôle visible « Bots » donné à Wumi.

## 2.30.2

- Le `.env` fait foi au démarrage : une valeur changée dans le `.env` (salon de logs…) remplace celle que pm2 gardait de l'ancien lancement. Corrige « Wumi est en ligne » encore posté sur le serveur support.

## 2.30.1

- Les rapports de déploiement vont dans `🚀・deployments` sur Wumi Staff (`LOG_DEPLOIEMENTS`) ; le MP au fondateur ne sert plus que de secours.

## 2.30.0 — Serveur Wumi Staff

- `outils/serveur-staff.js` monte le serveur staff : rôles (Founder, Bot Developer, Web Developer, Moderator), catégories, salons, permissions, salons de logs du bot (écrits dans le `.env`) et boîte du modmail. Personne ne peut inviter.
- Modmail : la boîte peut être sur un autre serveur que le support ; la fiche du membre reste celle du serveur support.

## 2.29.0

- Blocklist communautaire retirée : plus de `/blocklist`, plus d'alerte à l'arrivée d'un membre signalé. Les fiches restent en base, intactes. `/signaler` (signaler un message aux modérateurs du serveur) ne change pas.

## 2.28.0 — Carte de boost

- Un boost s'annonce maintenant comme une montée de niveau : le remerciement au-dessus, une carte image dessous (avatar dans un anneau rose, nombre de boosts du serveur, barre vers le palier suivant, rôle débloqué).
- `/boost test` : aperçu privé de l'annonce, sans attendre un vrai boost.

## 2.27.1

- Message Informations : boutons Website, Add Wumi (lien d'invitation calculé, `{{lien_invitation}}`) et Status.

## 2.27.0 — Pages du serveur support

- Serveur support : message « Informations » fait sur discord.builders (`src/assets/pages-support/informations.json`). Le 1er conteneur est posté dans le salon ; chaque bouton `page_…` ouvre, en privé, le conteneur suivant (ex. `page_rules` → le règlement).
- `node outils/publier-pages.js <salon>` publie le message, puis le met à jour sans le reposter.
- Nouvel emoji `wi_wumi` (le « W. ») ; `{{wumi}}` dans un texte de page devient cet emoji.
- Bannières dans la DA officielle (`outils/banniere-da.js`) : Bienvenue, Informations, Règlement, en FR et EN.

## 2.26.1

- Embeds : les emojis Wumi ne s'affichent plus en code brut (`<:wi_instagram:…>`) dans la ligne d'auteur ou le pied d'un embed (annonces /veille, journaux de modération, boosts, invitations…). Discord ne les affiche pas à ces endroits : l'emoji devient l'icône de la ligne.

## 2.26.0 — Instagram par @pseudo

- `/veille` Instagram suit maintenant **n'importe quel compte public Créateur ou Entreprise par son @pseudo** (API Business Discovery de Meta), au lieu du seul compte du jeton. Rien à configurer pour les serveurs.
- Sans pseudo, l'ancien mode (compte de `INSTAGRAM_TOKEN`) est réservé au serveur support : un autre serveur ne peut plus annoncer ce compte-là par erreur.
- `outils/instagram-decouverte.js` : transforme un jeton court en jeton de Page qui n'expire pas, et vérifie la configuration, sans jamais afficher de jeton. Voir le haut de `GUIDE-INSTAGRAM.txt`.

## 2.25.4

- `/veille` : TikTok mis en pause. La passerelle publique rsshub.app refuse désormais les bots (403). Le choix « TikTok » disparaît de `/veille ajouter`, les sources TikTok existantes ne sont plus interrogées (plus d'erreurs en boucle). Pour le réactiver un jour : héberger RSSHub, mettre `TIKTOK_PASSERELLE` vers lui et `TIKTOK_ACTIF=1` dans le `.env`.

## 2.25.3

- La carte de montée de niveau suit maintenant le thème de carte (celui du membre, sinon celui du serveur) : accent, anneau, barre et teinte du fond. Le thème Wumi garde les couleurs par palier.
- Dashboard, onglet Premium : l'aperçu montre la carte de rang ET la carte de niveau avec le thème et le fond du serveur, et change dès qu'on choisit un thème.

## 2.25.2

- Dashboard : la liste des serveurs se complète en direct avec ceux où Wumi est présent et où tu peux gérer le serveur (avant, elle restait figée à la connexion pendant 7 jours).
- Dashboard : le lien « Ajouter Wumi » demande les permissions utiles au lieu d'« Administrateur ».

## 2.25.0 — nouveaux emojis

- **Nouveaux emojis de Wumi**, dessinés à partir des @icons (licence MIT, `outils/at-icons/`) dans le style des tuiles de Wumi : couleur selon le sens (vert réussite, rouge erreur, or économie…). Ils remplacent ceux de la 2.20 dans tous les messages du bot (préfixe `wi_`, les `wu_` restent en repli).
- **Catalogue complet** : les 705 icônes, une couleur par catégorie, sont téléversées sur l'application (préfixe `at_`), en fond au démarrage, et utilisables dans le code avec `I('dragon')`.
- **Emojis du serveur support** remplacés par une sélection des icônes (`node outils/emojis-serveur.js`, sauvegarde des anciens dans `data/`).
- Générateur : `node outils/generer-emojis-at.js --planche`.

## 2.24.1

- Correction : une variable restée vide dans l'environnement de pm2 (ex. `TWITCH_CLIENT_ID`) empêchait le bot de lire celle du `.env`. Les valeurs vides sont maintenant complétées depuis le `.env` au démarrage.

## 2.24.0 — essai Premium, Wumi en anglais pour de vrai, onglet Premium du tableau de bord

- **Essai Premium gratuit de 7 jours** : `/premium essai` ou le bouton du message d'arrivée et de `/premium info`. Une fois par serveur, pour toujours. MP la veille de la fin et à la fin (avec le bouton d'abonnement) ; à la fin, l'avatar, la bannière et la bio du bot sur ce serveur reviennent à ceux de Wumi (aussi quand un abonnement Discord s'arrête).
- **Nouveau message d'arrivée** (Components V2) : bouton « Configurer Wumi » qui ouvre `/demarrer`, bouton d'essai Premium, dashboard et support. Un serveur dont la langue Discord est le français reçoit Wumi en français d'office.
- **Tableau de bord, onglet Premium** : état de l'abonnement, lancer l'essai, envoyer ou retirer le fond des cartes du serveur avec aperçu, et **thème de carte par défaut du serveur** (nouveau, premium) pour les membres qui n'en ont pas choisi.
- **Traduction anglaise complète** : les cartes (rang, profil, rang animé), les graphiques de `/stats` et `/messtats`, les suggestions, les appels, l'automod (message public), l'historique, la FAQ automatique, la veille (Twitch, Instagram, TikTok), les transcriptions de tickets, la réparation de structure, les fonds perso, le prestige, les badges, les objets et les thèmes étaient encore en français en dur sur les serveurs anglais.
- **Commandes en anglais britannique** : les traductions `en-US` sont recopiées en `en-GB`, et les descriptions ont l'anglais pour base (les clients ni français ni anglais voyaient du français).
- Noms des thèmes, objets et badges corrigés : config.js contenait du texte doublement encodé (`ðŸ”¥ Braise`) visible dans les choix de commande.
- `/profil` s'appelle `/profile` en anglais ; textes qui citaient de mauvais noms de commande corrigés (`/aide`, `/demarrer`, `/xp exclure`, `/daily`).
- Correction : le bouton « Fermer » d'un ticket cliqué trop tard (bot occupé, double clic) remontait en alerte « Unknown interaction ». Ces clics expirés sont désormais ignorés proprement partout.

## 2.23.0 — rappel de vote, série, /setup complet

- **Rappel de vote** : bouton « Me rappeler » dans `/vote` ; un MP quand on peut revoter (un seul par vote, bouton pour arrêter, coupé tout seul si les MP sont fermés).
- **Série de votes** : revoter dans les 36 h prolonge la série ; chaque vote de série ajoute 1 h au bonus d'XP (jusqu'à +12 h).
- **`/setup` complet** : 9 étapes (langue, bienvenue, rôle automatique, logs, AutoMod, anti-raid, niveaux, salon des montées de niveau, économie), barre de progression, et liens vers le tableau de bord, Premium et le support à la fin.
- Nouvelle bannière du bot (`outils/banniere-bot.js`).

## 2.22.0 — Wumi Premium

- **`/premium info`** refait : exclusivités, plafonds relevés, bouton d'abonnement Discord (si le SKU existe) et lien du support. Rien de gratuit ne devient payant.
- **4 thèmes de carte exclusifs** (Aurore, Néon, Sakura, Émeraude), offerts à tous les membres d'un serveur premium dans `/theme`. Sans premium, ils restent visibles mais fermés ; un membre qui en portait un revient au thème par défaut si le premium s'arrête.
- **`/premium fond-cartes`** : un fond pour les cartes de rang, de profil et de montée de niveau de tout le serveur (les fonds perso des membres restent prioritaires).
- **`/premium bot`** : nom, avatar, bannière et bio de Wumi propres au serveur.

## 2.21.0 — défi de la semaine, pièces, sauvegardes, déploiement automatique

- **Défi de la semaine Wumi Run** : un niveau par semaine (le même partout), chaque partie terminée compte, pas seulement les records. Classement en direct dans le salon choisi (`/wumirun config salon-defi`), podium annoncé et récompensé chaque lundi (500/300/150 de monnaie + 300/200/100 XP, 25 pour chaque participant). `/wumirun defi` pour voir sa place.
- **Pièces Wumi Run → monnaie du serveur** : `/wumirun convertir [montant]`, au taux choisi par le serveur (`/wumirun config taux-pieces`, 1 par défaut, 0 pour couper). Les pièces converties sont retirées du jeu, même s'il est ouvert.
- **Reçus de sanction** (warn, mute, kick, ban) : couleur selon la gravité, avatar, modérateur, raison, durée, numéro de dossier.
- **Sauvegardes** : la copie hors serveur part chaque jour (au lieu de chaque semaine), compressée et chiffrée avec la clé de la base ; son empreinte est affichée pour vérifier la clé rangée. Restauration : `node outils/restaurer-sauvegarde.js fichier.wumibak`.
- **Déployeur automatique** (`outils/deployeur.js`, processus pm2 « Wumi-Deploy ») : un paquet `.tgz` déposé dans `deploiements/` est vérifié, appliqué, les commandes redéployées si besoin, le bot redémarré et surveillé ; en cas d'échec, l'ancienne version revient toute seule. Compte rendu en MP.

## 2.20.0 — nouveaux emojis

- **72 emojis redessinés** : tuiles en dégradé, pictogrammes blancs pleins, une couleur par famille (vert réussite, rouge erreur et modération, or économie, violet progression, bleu info, cyan vocal, rose fun, ardoise outils). Médailles or/argent/bronze, et un emoji pour la musique.
- Ils sont générés par `outils/generer-emojis.js` et installés sous le préfixe `wu_` : les anciens `bp_` restent sur l'application pour que les vieux messages les affichent encore.
- Pictogrammes : Font Awesome Free (CC BY 4.0, https://fontawesome.com/license/free).

## 2.19.0 — la montée de niveau en image

- **Carte de montée de niveau** : avatar dans un anneau lumineux, passage de niveau en grand (« 9 → 10 »), barre vers le niveau suivant, pastilles (rôle débloqué, XP totale, rang sur le serveur, bonus). Couleur selon le palier : bleu (1-9), bronze (10-24), argent (25-49), or (50-74), rubis (75-99), diamant (100+).
- Le message personnalisé (`message_levelup`) reste au-dessus de la carte et notifie le membre ; les rôles cités ne pingent personne.
- La montée de niveau en vocal a désormais la même carte. Repli sur l'ancien encadré si l'image échoue.
- Statut du bot en rotation : nombre de serveurs, contact du staff par MP (modmail), Wumi Run.

## 2.18.0 — chiffrement au repos

**À faire :** rien. Au premier démarrage, une clé `CHIFFREMENT_CLE` est générée et ajoutée au `.env`, puis les textes existants sont chiffrés. **Sauvegarde cette clé avec la base** : sans elle, les textes chiffrés (et les sauvegardes) sont illisibles.

- Les textes écrits par les membres et le staff sont chiffrés dans la base (AES-256-GCM, IV aléatoire, authentifié) : contenu et raison des signalements, suggestions et réponses, appels, candidatures, tickets (sujet, description, raison de fermeture), tickets du support, raisons des sanctions, notes du staff. Requis par la politique développeurs de Discord.
- Transparent pour le code : les écritures sur ces colonnes sont chiffrées automatiquement, toute valeur chiffrée est déchiffrée à la lecture. Les anciennes valeurs sont migrées au démarrage.
- Politique de confidentialité : chiffrement indiqué, et précision sur le modmail (MP relayés sur Discord, pas écrits dans la base).

## 2.17.0 — la pièce de Wumi Run devient la monnaie de Wumi

- L'économie utilise désormais la **pièce d'or de Wumi Run** : nouvel emoji `bp_wumicoin`, repris partout où s'affichait l'emoji de l'économie et des pièces (soldes, daily, travail, boutique, banque, missions, /aide). Un emoji de monnaie personnalisé (`eco_emoji`) reste prioritaire.
- `/economy classement` passe en **image**, comme `/classement` : pièce dans la pastille et devant chaque montant, barres dorées, ta place en bas. Repli en texte si l'image échoue.
- Carte de profil : la pièce devant le solde.
- `/wumirun profil` : la pièce devant le nombre de pièces.
- **Commandes d'économie refaites** :
  - `/economy daily` et `/economy travailler` : carte image du gain (gros montant, bonus, crans de série sur 10 jours, nouveau solde), heure de la prochaine fois en horodatage Discord ;
  - `/economy solde` : carte portefeuille (fortune totale, poche, banque, total gagné, rang, série, état de la récompense) ;
  - boutons d'actions rapides sous chaque réponse (Récompense, Travailler, Portefeuille, Classement), et pages du classement par boutons ;
  - `/bank voir` reprend la carte portefeuille avec les intérêts ; `/pay` affiche un reçu avec l'avatar du destinataire ;
  - `/economy config voir` réorganisé en sections.
- Emoji de monnaie : « :Nom: » tapé à la main est retrouvé parmi les emojis du serveur (sinon refusé) ; un emoji invalide déjà enregistré retombe sur la pièce de Wumi Run ; nouvelle option `emoji-defaut`.

## 2.16.0 — le jeu s'appelle désormais Wumi Run

- Astro Run devient **Wumi Run** : titre du jeu, textes et commande `/wumirun` (remplace `/astro`). Progression, classements et réglages conservés.

## 2.15.0 — Astro Run, le jeu de Wumi dans Discord

**À faire :** `node src/deploy-commands.js --tout`, puis `pm2 restart Blueprint`. L'Activité doit être active (`ACTIVITE_ACTIVE=true`, URL Mapping `/` vers le serveur public, voir GUIDE-ACTIVITE.txt).

- **Astro Run** (jeu de plateforme, 5 niveaux, pièces, boutique de personnages, commandes tactiles) devient l'Activité de Wumi. L'Activité est un « hub » : vérification sur le serveur support, Astro Run partout ailleurs (et sur le support via `/astro jouer`, dans le salon où la commande est tapée). Correctifs 2.15.1 à 2.15.4 : vérification du réglage « Activities » avant le lancement, chemins réseau du jeu, page choisie dès l'ouverture (fin du mode « hors ligne »).
- La progression est enregistrée dans la base de Wumi, liée au compte Discord vérifié (session signée). Anti-triche : temps impossibles, niveaux débloqués sans progression ou pièces irréalistes refusés.
- `/astro jouer` lance le jeu dans le salon. `/astro classement niveau:` : meilleurs temps **du serveur**, en image. `/astro profil` : niveaux, temps, étoiles, rang. `/astro config` : salon des records, récompenses.
- Première victoire sur un niveau dans un serveur : **XP et monnaie du serveur** (désactivable). Records du serveur et premières victoires annoncés dans le salon choisi.

## 2.14.0 — journal traduit, vocaux temporaires, sanction au clic droit, événements récurrents, classement en image

**À faire :** `node src/deploy-commands.js --tout`, puis `pm2 restart Blueprint`. Pour les événements Discord natifs, Wumi doit avoir « Gérer les événements ».

- **Journal du serveur** : arrivées, départs (et expulsions), messages supprimés ou modifiés, suppressions groupées, rôles et salons créés ou supprimés, mises à jour de membres, bans, vocal, anti-raid, boosts, invitations : tout est traduit dans la langue du serveur (fini le français en dur sur les serveurs anglais). Les fiches indiquent maintenant **qui** a fait l'action (journal d'audit), avec l'avatar, un bouton « Profil » ou « Voir le message », l'alerte « compte récent » et la durée passée sur le serveur.
- **Vocaux temporaires** : nouveau panneau de contrôle (état du salon, présents, places), boutons renommer / places / verrouiller / cacher / revendiquer, et menus pour **inviter** (même salon verrouillé), **expulser** et **donner le salon**. Les anciens panneaux se convertissent au premier clic.
- **Sanction au clic droit** : clic droit sur un membre › Applications › **Sanctionner**, ou sur un message › **Sanctionner l'auteur**. Un panneau privé : casier du membre, action (avertir, muet 10 min / 1 h / 24 h, retirer le muet, expulser, bannir, bannir + effacer 24 h), raison prête ou personnalisée, suppression du message en un clic. Mêmes historique, MP, journal et paliers que les commandes.
- **/event** : répétition (chaque jour, semaine, 2 semaines, mois — même heure locale, changement d'heure compris), durée, et ajout automatique aux **événements Discord** du serveur (démarré à l'heure, terminé à la fin, supprimé si annulé). La liste d'attente existait déjà.
- **/classement en image** : deux colonnes de cinq avec avatars, rangs or / argent / bronze, barres de progression, ta ligne mise en avant et ta place en bas, pour l'XP, le vocal et les messages. Pagination conservée.

## 2.13.0 — tickets, modmail, /embed refait, concours, fiches et cartes de bienvenue

**À faire :** `node src/deploy-commands.js --tout`, puis `pm2 restart Blueprint`. Sur le support : `/admin panneaux modmail boite:#modmail role:@Staff salon:#contact` (option `langue`). Dans le Developer Portal, rien à changer : l'intent « messages privés » n'est pas privilégié.

- **Tickets** : la première réponse d'un membre du staff est datée, et il prend le ticket automatiquement s'il était libre. Nouveau bouton « Libérer ». `/ticket config alerte minutes:` mentionne le staff quand un ticket reste sans réponse. `/ticket stats [jours]` : tickets ouverts et fermés, temps de première réponse, note moyenne, classement de l'équipe.
- **Modmail (serveur support)** : un MP à Wumi (ou le bouton « Contacter l'équipe ») ouvre une conversation dans un fil du salon staff, avec la fiche du membre. Les réponses du staff partent en MP, signées. `//` au début d'un message = note interne. Bouton « Fermer ».
- **/embed refait en Components V2** : bannière, vignette, titre et texte, jusqu'à 5 sections, image, pied de page, 5 boutons lien avec emoji, mention d'un rôle. Aperçu exact, brouillons gardés 24 h même après un redémarrage. Modèles : Annonce, Règlement, Événement livrés avec Wumi, et les tiens (`💾 Enregistrer comme modèle`, `/embed modeles`). `/embed modifier` rouvre un message à l'identique.
- **/giveaway** : nouvelle annonce avec bannière, compteur de participants en direct, **chances bonus** (`role-bonus`, `boosters`, `bonus:` x2 à x10, tirage pondéré sans remise), MP aux gagnants, textes traduits.
- **/serverinfo et /userinfo** : fiches en image (bannière, chiffres, boosts et palier suivant, activité sur 14 jours ; ancienneté, rang d'arrivée, niveau, rôles). Le casier de `/userinfo` n'est plus visible que par le staff.
- **Cartes de bienvenue personnalisées** : `/bienvenue cartes ajouter` (fond envoyé, style centré / avatar à gauche / minimal, couleur, titre, sous-titre avec variables), jusqu'à 5 designs tirés au hasard ou un fixe (`/bienvenue cartes mode`), aperçu immédiat. Textes des cartes traduits (bienvenue et au revoir).

## 2.12.0 — anti-nuke, import de structure, /stats et rapport du lundi

**À faire :** `node src/deploy-commands.js --tout`, puis `pm2 restart Blueprint`. Le propriétaire de chaque serveur active la protection avec `/antinuke activer`.

- `/antinuke` (propriétaire du serveur uniquement) : surveille le journal d'audit. Si un admin ou un bot supprime des salons ou des rôles, bannit ou expulse en rafale (4 actions en 15 s par défaut, réglable), Wumi retire tous ses rôles (ou l'expulse, ou le bannit). Les bots sont toujours expulsés. Rapport dans le salon d'alerte et en MP au propriétaire, avec la commande pour tout remettre en place.
- `/antinuke confiance` / `retirer-confiance` : membres et bots jamais sanctionnés. `/antinuke etat` : réglages et vérifications (journal d'audit, droits, rôle de Wumi tout en haut, photo de structure). L'activation prend une photo de structure si la dernière a plus d'un jour.
- `/structure importer` : importe le fichier de `/structure exporter`, y compris d'un autre serveur, pour cloner sa configuration (rôles, salons, permissions). Rien n'est appliqué avant `/structure reparer` et sa confirmation. Les permissions de @everyone sont rebranchées sur ce serveur, celles données à des membres précis sont ignorées.
- `/stats` devient `/stats serveur` : comparaison avec la période précédente (📈/📉), heures de pointe (texte et nouveau graphique en bas de l'image).
- `/stats rapport salon:#staff` : chaque lundi à 9 h, le bilan de la semaine (messages, membres, vocal, évolution, jour et heure de pointe, salons actifs, points d'attention) avec le graphique. Sans option : aperçu immédiat.

## 2.11.4 — /docs, panneaux idée et bug, correctif XP

**À faire :** `node src/deploy-commands.js --tout`, puis `pm2 restart Blueprint`. Ensuite, sur le serveur support :
`/admin panneaux suggestion salon:#suggestions` et `/admin panneaux bug rapports:#rapports-staff salon:#reports-bug` (option `langue` pour l'anglais).

- `/docs` (`/doc`) : carte vers la documentation du site (wumi.fr/commandes), avec l'option `commande` (autocomplétion) qui ouvre la page déjà filtrée.
- Serveur support, panneau « Propose une idée » : bannière + bouton → formulaire (titre, idée, pourquoi) → vraie suggestion dans le salon des suggestions (votes, fil, numéro).
- Serveur support, panneau « Signale un bug » : bannière + bouton → formulaire (problème, commande, étapes, attendu, capture) → carte privée dans le salon des rapports, boutons Confirmé / Corrigé / Pas un bug, MP au membre à chaque changement.
- Corrigé : `RangeError: Value is too large to be represented as a JavaScript number` sur `/classement` et à chaque message. Un membre avait plus de 2^53 XP ; l'XP est maintenant plafonnée à 1 milliard (réparation automatique au démarrage) et `/xp` refuse les montants au-delà de 100 millions.

## 2.11.3 — /voter refait

**À faire :** `pm2 restart Blueprint`.

- `/voter` (`/vote`) : bannière « Vote pour Wumi », raisons de voter, statut perso (prêt à voter, ou prochain vote avec jauge des 12 h), total de votes et rang parmi les votants, compteur de la communauté.
- Après « J'ai voté » : écran de remerciement avec la bannière, le nombre de votes et l'heure du prochain vote.

## 2.11.2 — Noël : tout le monde ramasse

**À faire :** `pm2 restart Blueprint`.

- Quand la neige tombe, tout le monde peut cliquer « Ramasser » pendant 30 s, une fois par chute. Chacun tire son propre objet (☃️ +1, 🧦 −1, 🎁 +3), le premier gagne +1 de bonus.
- Le message liste en direct qui a trouvé quoi, et garde le récapitulatif quand la neige fond. Chaque joueur reçoit son résultat et son total en message privé éphémère.
- Fin de la pause de 15 s entre deux ramassages (devenue inutile). Règles de `/noel regles` mises à jour.

## 2.11.1 — panneau de recrutement en anglais, avec bannière

**À faire :** `node src/deploy-commands.js --tout`, puis `pm2 restart Blueprint`. Republier le panneau : `/candidature panneau salon:# langue:English`.

- Panneau de candidatures refait en Components V2 : bannière « On recrute / We're hiring », postes ouverts, déroulé en 3 étapes, profil recherché.
- Option `langue` sur le panneau (Français ou English, celle du serveur par défaut). Le formulaire, la confirmation et le MP de réponse suivent la langue du panneau ; la carte du staff reste dans la langue du serveur et indique la langue du candidat.
- Questions par défaut traduites en anglais.

## 2.11 — /snipe et l'événement de Noël

**À faire :** `node src/deploy-commands.js --tout`, puis `pm2 restart Blueprint`. Sur le support : `/admin noel ajouter-salon` (salons ou catégories), `/admin noel tableau`, puis `/admin noel lancer`.

- `/snipe [type] [salon]` (Gérer les messages) : les 5 derniers messages supprimés ou modifiés du salon, gardés 10 min en mémoire, jamais en base.
- Événement de Noël (serveur support uniquement) : dans les salons choisis, un objet tombe parfois sous un message (8 % par défaut, 1 par minute et par salon au plus). Le premier qui clique « Ramasser » découvre : ☃️ +1 (72 %), 🧦 −1 (20 %), 🎁 +3 (8 %). Fond après 30 s. Points jamais négatifs, 15 s entre deux ramassages. `/noel classement|moi|regles`, classement tenu à jour toutes les 5 min, fin automatique le 31/12 à 23:59 avec podium.

## 2.10.1 — XP vocal fiable

- Le temps en vocal est crédité toutes les 5 min (avant : seulement à la sortie du vocal), et les membres déjà en vocal au démarrage du bot sont repris. Avant, un redémarrage du bot perdait la session en cours et ne la relançait jamais.
- Micro coupé : on compte quand même. Seul le casque coupé (sourdine totale) ne compte pas.

## 2.10 — Wrapped, compagnons, recherche de joueurs

**À faire :** `node src/deploy-commands.js --tout`, puis `pm2 restart Blueprint`.

- `/wrapped [période] [membre]` : récap perso en image 1080×1350 (messages, vocal, niveau, badges, salons préférés, « personnalité » selon l'heure, top X %). « Ce mois-ci » se remplit à partir de maintenant ; « depuis le début » marche tout de suite.
- `/pet adopter|voir|renommer|top|relacher` : compagnon virtuel (8 espèces, 5 stades de l'œuf au légendaire). Il grandit avec l'activité de son maître ; faim et humeur baissent avec le temps ; nourrir coûte 20 pièces si l'économie est active ; jouer et câlin gratuits avec délai.
- `/lfg jeu joueurs [détails] [expire]` : annonce avec places et bouton Rejoindre ; groupe complet = vocal privé créé et membres mentionnés ; vocal supprimé après 5 min vide ; annonce expirée au bout de 2 h par défaut.

## 2.9 — serveur support, radio permanente, incidents

**À faire :** `node src/deploy-commands.js --tout`, puis `pm2 restart Blueprint`. Ensuite sur le support : `/admin roles user`, `/admin roles beta`, `/admin roles beta-panel`.

- Tickets support : motif « Problème de musique », menu de réponses rapides pour l'équipe, bouton 🩺 Diagnostic (permissions, rôle, salons, musique sur le serveur du demandeur).
- Rôle « Utilisateur de Wumi » automatique (propriétaires et personnes qui ont ajouté le bot, lu dans le journal d'audit), resynchronisé toutes les 6 h.
- Rôle « Bêta-testeur » avec panneau à bouton ; les commandes marquées `beta: true` ne sont déployées que sur le support et réservées à ce rôle.
- `/radio … permanente:oui` : radio 24 h/24 relancée au démarrage, après une coupure du flux, après une file de musique, et 1 min après une déconnexion.
- `/admin incident creer|maj|liste|supprimer` : incidents (investigation → identifié → surveillance → résolu) et maintenances (prévue → en cours → terminée), affichés dans #bot-status (couleur + bandeau), annoncés par un message à chaque étape, et sur wumi.fr/statut.

## 2.8 — blind test, radios, événements

**À faire :** `node src/deploy-commands.js --tout`, puis `pm2 restart Blueprint`. Vérifier les radios : `node outils/verifier-radios.js`.

- `/blindtest lancer` : extraits de 25 s dans le vocal, titre = 2 pts, artiste = 1 pt, indice à mi-manche, classement final. 6 thèmes (hits FR, internationaux, années 80, années 2000, rap FR, mélange). Réponses tolérantes aux fautes ; boutons à 4 choix si l'intent « contenu des messages » manque.
- `/radio` : 13 radios en direct (Lofi Girl, Groove Salad, FIP et ses webradios, Mouv', NRJ, Skyrock, France Musique, France Inter…), lancées tout de suite devant la file.
- `/evenement creer` : inscriptions par bouton, places limitées, liste d'attente avec promotion automatique (MP), rappel en MP et dans le salon 15 min avant, annulation par l'organisateur. `/evenement liste`.

## 2.7 — la musique

**À faire :** `bash outils/installer-lavalink.sh` (une seule fois), puis `node src/deploy-commands.js --tout` et `pm2 restart Blueprint`.

- `/play` (`/jouer`) avec autocomplétion : recherche YouTube (SoundCloud en secours), liens YouTube (vidéos et playlists), SoundCloud, Bandcamp, Twitch, Vimeo, radios. Liens Spotify (titres, albums, playlists) et Deezer : les titres sont retrouvés sur YouTube.
- Panneau interactif : précédent, pause, suivant, stop, boucle, mélange, volume, file, menu des filtres, barre de progression qui avance.
- `/music` (`/musique`) : file, en-cours, passer, précédent, pause, reprendre, stop, volume, boucle, mélanger, retirer, déplacer, vider, aller, filtre (bass boost, nightcore, vaporwave, slowed, 8D, karaoké), dj, 24-7, playlists du serveur.
- Rôle DJ facultatif, vote pour passer une piste, départ automatique après 3 min sans musique ou 2 min seul (sauf 24/7).
- Lavalink tourne à côté du bot (pm2 « lavalink »), sur 127.0.0.1 uniquement.

## 2.6 — /audit, le bilan de sécurité

**À faire :** `node src/deploy-commands.js --tout`, puis `pm2 restart Blueprint`.

- `/audit lancer` : 15 vérifications (permissions de @everyone, bots administrateurs, 2FA, niveau de vérification, salons privés qui fuient, @everyone mentionnable, rôles distribués au-dessus de Wumi, webhooks, logs, antiraid, automod…), note sur 100 et bouton « Corriger » quand c'est sans risque.
- `/audit hebdo` : le bilan posté chaque semaine dans un salon staff, avec alerte si la note baisse.
- Les corrections ne suppriment jamais de rôle, de salon ni de webhook.

## 2.5 — sauvegardes hors serveur, thème clair du dashboard

**À faire :** `node src/deploy-commands.js --tout`, puis `pm2 restart Blueprint`.

- Sauvegarde automatique chaque nuit (14 gardées) + copie compressée envoyée chaque semaine en MP aux fondateurs (ou dans `SAUVEGARDE_SALON`).
- `/sauvegarde` réservée au fondateur (avant, un admin de serveur pouvait récupérer toute la base).
- Thème clair sur le dashboard (bouton 🌙/☀️, retenu dans le navigateur).

## 2.4 — starboard, page Commandes

**À faire :** `node src/deploy-commands.js --tout`, puis `pm2 restart Blueprint`.

- **`/starboard`** : les messages qui reçoivent assez de ⭐ (sans compter l'auteur ni les bots) sont republiés dans un salon, avec le compteur mis à jour en direct. Seuil et emoji réglables, aussi depuis le dashboard.
- **wumi.fr/commandes** : toutes les commandes, en FR et EN, avec recherche et filtres. La liste vient du bot lui-même (`/api/commandes`) : elle est toujours à jour. `node outils/generer-commandes.js` en refait une copie statique si besoin.

---

## 2.3 — dashboard complet, statistiques, 4 jeux

**À faire :** `node src/deploy-commands.js --tout` (4 nouvelles commandes), puis `pm2 restart Blueprint`.

- **Dashboard › Statistiques** : messages par jour, arrivées et départs, croissance nette, heures de vocal, évolution par rapport à la période précédente, salons et membres les plus actifs, sanctions par semaine. Périodes de 7, 30 ou 90 jours, infobulles au survol, vue en tableau.
- **Dashboard › Rôles-réactions** : créer un panneau (titre, salon, boutons ou menu, un seul rôle à la fois), ajouter ou retirer des rôles, supprimer. Mêmes contrôles de sécurité que la commande.
- **Dashboard › Créateur d'embeds** : aperçu en direct, couleur, image, pied de page, jusqu'à 5 boutons liens, publication dans le salon choisi.
- **Dashboard › Sanctions** : tout l'historique du serveur, filtres par type et par membre, retrait d'une sanction (il faut « Modérer les membres »).
- **`/puissance4`** (`/connect4`) : contre un membre ou contre Wumi (3 niveaux).
- **`/pendu`** (`/hangman`) : seul ou à plusieurs, lettres dans deux menus, bouton pour deviner le mot, mots dans la langue du serveur.
- **`/compteur`** (`/counting`) : un salon où l'on compte ensemble ; une erreur ou deux nombres de suite par la même personne remettent à zéro, avec record du serveur.
- **`/quiz`** : 65 questions de culture générale en FR et EN, jusqu'à 10 par partie, 20 secondes par question, point bonus au plus rapide, `/quiz classement`.

---

## 2.2 — rôles-réactions, bienvenue, embeds, morpion, logs V2, tests

**À faire :** `npm run deploy` (5 nouvelles commandes), redémarrer. Pour le web : `GUIDE-TAILSCALE.txt` (remplace Caddy et la box).

- **`/roles-reactions`** (`/reactionrole`) : panneaux de rôles en libre-service, en boutons ou en menu, jusqu'à 25 rôles, mode « un seul à la fois » (couleurs…). Les rôles dangereux, gérés ou trop hauts sont refusés.
- **`/autorole`** : le rôle donné à chaque arrivée.
- **`/bienvenue`** (`/welcome`) : salon, message avec variables, carte illustrée, MP d'accueil, au revoir, et `test` pour voir le vrai rendu.
- **`/embed`** : créer ou modifier un embed sans coder (fenêtre, aperçu privé, boutons liens), publié dans le salon choisi.
- **`/morpion`** (`/tictactoe`) : contre un membre (qui doit accepter) ou contre Wumi, trois niveaux dont un imbattable.
- **Logs des serveurs en Components V2** : même allure que le reste du bot, retour automatique à l'ancien format si Discord refuse.
- **Tests automatiques** : `npm test` vérifie les commandes, les traductions, la base (le bug des `/sanctions` serait détecté) et les fonctions sensibles.
- **Web sans box** : `DASHBOARD_PORT` permet de servir le tableau de bord sur un port à part, pour Tailscale Funnel.
- Site wumi.fr : la liste des commandes correspond enfin aux vraies commandes, liens Statut et Dashboard, page wumi.fr/dashboard.
- **`/admin salon-statut`** : un message de statut sur le serveur support, modifié toutes les 5 minutes (état, serveurs, membres, latence, disponibilité 24 h / 7 j / 30 j, barre des 14 derniers jours, boutons page de statut et dashboard). Il passe en orange « Redémarrage en cours » quand pm2 arrête le bot.

---

## 2.1 — le web, la modération avancée, tout traduit

**À faire :** `npm run deploy`, redémarrer, puis suivre `GUIDE-WEB.txt` (DNS `dash` + `verif`, Caddy, `DASHBOARD_URL`, redirect OAuth2).

- **Tableau de bord** sur `dash.wumi.fr` : connexion Discord, liste des serveurs gérés, tous les réglages de `/config` en cliquant, paliers d'avertissements, historique des changements. Permissions revérifiées à chaque action, jetons anti-CSRF, aucune donnée Discord conservée.
- **Page de statut** `site-wumi/statut/` pour GitHub Pages : en ligne / hors ligne, serveurs, latence, disponibilité jour par jour sur 90 jours, coupures récentes. Le bot garde l'historique et le sert sur `/api/statut`.
- **Tickets de tous les serveurs** refaits : Components V2, bannière (désactivable), priorité, ajout d'un membre, transcription à la demande, note de satisfaction en MP, **tout traduit**. Les panneaux déjà publiés continuent de marcher.
- **Fermeture automatique des tickets inactifs** : relance avec bouton « Garder ouvert », puis fermeture. `/ticket config inactivite` et `/admin ticket inactivite`.
- **Vérification des serveurs** et **`/voter`** en V2 et traduits (ils étaient en français partout).
- **`/paliers`** : chaque serveur règle son échelle d'avertissements (avant, elle était la même pour tous).
- **`/raid`** : activer (vérification max, slowmode, nouveaux venus expulsés), désactiver (tout est restauré exactement), nettoyer (expulser/bannir les arrivées des N dernières minutes), statut. État en base, fin automatique.
- **Rôles temporaires** : `/role ajouter … duree:7d`, retirés tout seuls même après un redémarrage.

---


## À faire après la mise à jour

1. Remplis les nouveaux salons de logs dans le `.env` (section *SALONS DE LOGS DU BOT*).
2. `npm run deploy` pour envoyer les nouvelles commandes à Discord.
3. Redémarre le bot, puis lance `/admin logs test:Vrai` : un message de test part dans chaque salon configuré.
4. Tickets du support : `/admin ticket staff`, `/admin ticket categorie`, puis `/admin ticket panneau`.
5. Vérification : voir `GUIDE-ACTIVITE.txt`.

## Corrigé

- **`/sanctions retirer` plantait** (`column index out of range`). `req.sanctionParId` était déclaré deux fois dans `src/database/db.js` : la seconde version (1 paramètre, utilisée par les appels) écrasait la première (2 paramètres). Les variantes sans serveur s'appellent maintenant `sanctionParIdGlobal` / `desactiverSanctionGlobal`.
- **Les MP de ban/kick n'arrivaient jamais** : ils partaient *après* l'expulsion, quand Discord refuse déjà d'écrire au membre. Ils partent maintenant avant ; si la sanction échoue, elle est retirée de l'historique. Le log indique si le MP est passé.

## Journal du bot (serveur support)

Un salon par sujet, réglé dans le `.env` : `LOG_ERREURS`, `LOG_SERVEURS`, `LOG_VOTES`, `LOG_DEMARRAGE`, `LOG_COMMANDES`, `LOG_TICKETS`, `LOG_VERIFICATION`, `LOG_ADMIN`, `LOG_PREMIUM`, et `LOG_DEFAUT` en repli. Tout est en Components V2.

- Erreurs : regroupées par signature, avec l'origine (`src/…:ligne`), le compteur de répétitions, la trace complète en pièce jointe si elle est longue, et un ping facultatif (`LOG_ERREURS_MENTION`) sur les erreurs nouvelles uniquement.
- Votes : webhook top.gg en direct (`TOPGG_WEBHOOK_AUTH`, route `/topgg`) + récompenses réclamées avec `/voter`.
- Envoi par l'API Discord : fonctionne depuis n'importe quel shard.
- `/admin logs` affiche l'état de chaque salon.

## Tickets du serveur support (`/admin ticket …`)

Réservés au serveur support et configurables par toi seul : panneau avec bannière et menu de motifs, **un formulaire différent par motif** (question, bug, premium, partenariat, contestation de blocage, autre), fiche du demandeur pour l'équipe (ancienneté, serveurs où il a Wumi, premium, liste noire), prise en charge, priorité (renomme le salon), ajout d'un membre, transcription à la demande. À la fermeture : transcription dans `LOG_TICKETS`, copie en MP avec **note de satisfaction** de 1 à 5. `/admin ticket voir` donne la note moyenne et les temps de prise en charge.

Le `/ticket` public des autres serveurs ne change pas.

## Vérification par Activité Discord (`/admin verification …`)

Voir `GUIDE-ACTIVITE.txt`. Règlement + mini-défi dans une Activité, identité confirmée par Discord, âge minimum de compte, rôle « non vérifié » retiré automatiquement, refus tracés. Code de secours tant que l'Activité n'est pas branchée.

## Modération

| Commande | Quoi |
|---|---|
| `/softban` | Expulse et efface les messages récents ; le membre peut revenir |
| `/massban` | Bannit jusqu'à 200 IDs d'un coup (raid), avec confirmation et comptes protégés |
| `/pseudo` | Change, nettoie (`normaliser`) ou réinitialise un pseudo |
| `/role ajouter/retirer` | Respecte la hiérarchie, refuse les rôles sensibles aux non-admins |
| `/note` | Notes privées du staff sur un membre (non effaçables par le membre) |
| `/vocal-mod` | Déconnecter un membre, déplacer ou vider tout un salon vocal |
| `/modstats` | Classement de l'équipe et répartition par type, sur 7/30/90 jours |
| Clic droit > *Fiche modération* | Ancienneté, sanctions, notes, mute, rôles et niveau de vigilance |
| `/sanctions` | Pagination, filtre par type, `voir` (détail d'un cas), `raison` (corriger) |

## Bannières

`src/assets/bannieres/` : panneau, ticket, formulaire, ticket fermé, vérification, en FR et EN. Pour changer un texte : modifie `outils/generer-bannieres.js` puis `npm run bannieres`.
