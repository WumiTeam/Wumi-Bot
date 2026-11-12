# Wumi 2.0 — ce qui change

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
