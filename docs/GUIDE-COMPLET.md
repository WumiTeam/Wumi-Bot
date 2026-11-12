# Bot Discord — bienvenue, XP, modération, logs

Bot Discord complet en **discord.js v14** avec base **SQLite intégrée à Node** (aucune dépendance à compiler) : messages de bienvenue en image, système d'XP avec carte de rank générée à la volée, classement, modération, automod, anti-raid et logs détaillés. Tout est en français, commandes slash uniquement.

---

## 1. Installation

### Prérequis
- **Node.js 22.5 minimum**, **24 ou plus recommandé** (`node -v` pour vérifier)
- Une application Discord : https://discord.com/developers/applications

### Étapes

```bash
npm install          # installe les dépendances
cp .env.example .env # crée ton fichier de configuration
# → remplis .env avec ton token et tes identifiants
npm run deploy       # enregistre les commandes slash auprès de Discord
npm start            # démarre le bot
```

### Contenu du `.env`

| Variable | Où la trouver |
|---|---|
| `DISCORD_TOKEN` | Developer Portal → ton application → **Bot** → *Reset Token* |
| `CLIENT_ID` | Developer Portal → **General Information** → *Application ID* |
| `GUILD_ID` | Clic droit sur ton serveur → *Copier l'identifiant* (active le mode développeur dans Discord) |
| `OWNER_IDS` | Ton identifiant Discord (clic droit sur ton profil) |
| `DATABASE_PATH` | Laisse `./data/zhaak.db` sauf besoin particulier |

> Avec `GUILD_ID` rempli, les commandes apparaissent **instantanément** sur ce serveur. Vide, elles sont déployées globalement et mettent jusqu'à 1 h à apparaître partout.

### Intents privilégiés — étape obligatoire

Dans le Developer Portal → **Bot** → *Privileged Gateway Intents*, active :

- ✅ **SERVER MEMBERS INTENT** (arrivées, départs, rôles)
- ✅ **MESSAGE CONTENT INTENT** (XP et automod)

Sans ces deux options, le bot refuse de démarrer.

### Permissions à donner au bot

Génère le lien d'invitation dans **OAuth2 → URL Generator**, coche `bot` + `applications.commands`, puis ces permissions :

`Gérer le serveur` (obligatoire pour le suivi des invitations) · `Gérer les rôles` · `Gérer les salons` · `Expulser des membres` · `Bannir des membres` · `Exclure temporairement des membres` · `Gérer les messages` · `Voir les logs d'audit` · `Envoyer des messages` · `Joindre des fichiers` · `Intégrer des liens` · `Lire l'historique des messages`

⚠️ **Place le rôle du bot au-dessus** des rôles qu'il doit gérer (rôles-récompenses, membres à sanctionner). Discord interdit d'agir sur un rôle plus haut que le sien.

---

## 2. Configuration sur le serveur

Tout se règle en jeu avec `/config`, sans toucher au code.

```
/config voir                                       ← vue d'ensemble de tous les réglages
/config bienvenue salon      #arrivees
/config bienvenue message    Bienvenue {mention} sur {serveur} ! Tu es le {membres}e 🎉
/config bienvenue carte      actif:true            ← image de bienvenue
/config bienvenue role-auto  @Membre
/config bienvenue tester                           ← aperçu avec ton propre profil
/config logs tout            #logs                 ← toutes les catégories dans un salon
/config logs définir         categorie:Moderation  salon:#logs-mod
/config xp annonces          mode:Dans un salon précis  salon:#niveaux
/config xp exclure           salon:#commandes      ← ce salon ne rapporte plus d'XP
```

**Variables des messages** : `{mention}` `{pseudo}` `{tag}` `{serveur}` `{membres}` `{id}`
Pour l'annonce de niveau : `{mention}` `{pseudo}` `{niveau}` `{emoji}`

Les réglages fins (gains d'XP, seuils d'automod, couleurs des cartes) sont dans **`config.js`** à la racine — un redémarrage suffit pour les appliquer.

---

## 3. Les commandes

### 📈 Niveaux

| Commande | Rôle |
|---|---|
| `/rank [membre] [animee]` | Carte de niveau en image : avatar, anneau de progression, rang, barre d'XP — `animee:true` renvoie un GIF |
| `/classement [type] [page]` | Classement du serveur : XP, temps en vocal ou nombre de messages, paginé avec des boutons |
| `/messtats [membre]` | Heures de la journée où le membre écrit et ses salons préférés, en image |
| `/xp ajouter\|retirer\|définir\|niveau\|reset` | Gestion manuelle de l'XP (Gérer le serveur) |
| `/xp reset-serveur` | Remise à zéro complète |
| `/xp recompense ajouter\|retirer\|liste` | Rôles débloqués à un niveau donné |
| `/theme liste\|apercu\|acheter\|equiper` | Thèmes de carte de rank achetables avec la monnaie du serveur |
| `/missions` | Défis du jour et de la semaine, avec le bouton pour encaisser |
| `/profil [membre]` | Fiche complète en image : niveau, monnaie, invitations, missions, ancienneté |
| `/badges [membre]` | Badges débloqués et progression vers les suivants |
| `/prestige [membre]` | Repart à zéro contre une étoile permanente et un bonus d'XP |
| `/carte fond\|retirer\|voir` | Choisit sa propre image de fond de carte |
| `/xp bonus ajouter\|retirer\|liste` | Multiplicateur d'XP attaché à un rôle (Gérer le serveur) |
| `/xp evenement lancer\|arreter\|voir` | Double XP manuel, en plus des week-ends automatiques |

**Fonctionnement de l'XP** : 15 à 25 XP par message, une fois par minute maximum, messages de moins de 3 caractères ignorés. 5 XP par minute en vocal (désactivé si le membre est seul, en sourdine ou dans le salon AFK). Courbe de niveaux identique à MEE6 : `5×niveau² + 50×niveau + 100`.

**Les multiplicateurs se combinent** : bonus de rôle (le meilleur rôle, pas le produit) × événement double XP × potion d'XP × bonus de prestige. `/xp bonus liste` et `/config voir` montrent ce qui s'applique.

### 🔨 Modération

| Commande | Rôle |
|---|---|
| `/warn membre raison` | Avertissement + escalade automatique |
| `/mute membre durée [raison]` | Timeout Discord (max 28 j) |
| `/unmute membre` | Lève le timeout |
| `/kick membre [raison]` | Expulsion |
| `/ban membre [raison] [supprimer] [durée]` | Bannissement définitif ou temporaire |
| `/unban identifiant` | Débannissement (avec autocomplétion des bannis) |
| `/sanctions liste\|retirer\|vider` | Historique complet, suppression par ID |
| `/clear nombre [membre] [filtre]` | Purge de messages, filtrable |
| `/lock salon\|ouvrir\|serveur\|ouvrir-serveur` | Verrouillage d'un salon ou du serveur entier |
| `/slowmode durée [salon]` | Mode lent |

**Formats de durée acceptés** : `30s`, `10m`, `2h`, `1j`, `1sem`, ou combinés (`1h30m`, `2j12h`).

**Escalade automatique des avertissements** (modifiable en haut de `src/commands/moderation/warn.js`) :

| Avertissements actifs | Sanction |
|---|---|
| 3 | mute 1 h |
| 5 | mute 24 h |
| 7 | expulsion |
| 10 | bannissement |

Les bans temporaires sont stockés en base : le débannissement fonctionne **même si le bot redémarre** entre-temps.

### 🎫 Tickets

| Commande | Rôle |
|---|---|
| `/ticket panneau [salon]` | Publie le panneau avec le bouton d'ouverture |
| `/ticket liste` | Tickets ouverts, avec qui les a pris en charge |
| `/ticket fermer [raison]` | Ferme le ticket courant |
| `/ticket ajouter\|retirer membre` | Donne ou retire l'accès au ticket courant |
| `/ticket renommer nom` | Renomme le salon du ticket |
| `/ticket config ...` | Catégorie, rôle staff, salon d'archivage, limite, formulaire, textes, motifs |

**Mise en place**, dans l'ordre :

```
/ticket config categorie   #📁 Tickets        ← catégorie où créer les salons
/ticket config staff       @Modérateur        ← qui voit et gère les tickets
/ticket config logs        #archives-tickets  ← où sont archivées les transcriptions
/ticket panneau            #support           ← publie le panneau
```

**Comment ça marche** : un membre clique sur le bouton, une fenêtre s'ouvre et lui demande le **sujet** de sa demande et un **détail** (obligatoires). À l'envoi, un salon privé `ticket-0001` est créé, visible uniquement par lui, le rôle staff et le bot — et le premier message affiche déjà le sujet et le détail, donc l'équipe a le contexte sans avoir à le réclamer.

`/ticket config formulaire actif:false` revient au comportement direct : le clic crée le salon sans rien demander. Deux boutons y attendent l'équipe : *Prendre en charge* et *Fermer*. À la fermeture, une raison est demandée, puis une **transcription HTML complète** (messages, avatars, images, embeds, horodatage) est envoyée dans le salon d'archivage **et** en message privé au membre. Le salon est supprimé 5 secondes plus tard.

Par défaut chaque membre ne peut avoir qu'un ticket ouvert à la fois — `/ticket config limite` change ce nombre, `0` pour l'illimité.

**Motifs multiples** : avec `/ticket config type-ajouter`, le bouton se transforme en menu déroulant. Exemple :

```
/ticket config type-ajouter nom:Support technique emoji:🛠️ description:Un bug, un souci
/ticket config type-ajouter nom:Signaler un joueur emoji:🚨
/ticket config type-ajouter nom:Candidature staff  emoji:📋
```

Republie le panneau après chaque changement pour qu'il se mette à jour.

### 💡 Suggestions

| Commande | Rôle |
|---|---|
| `/suggestion envoyer idee:...` | Publie une suggestion dans le salon dédié |
| `/suggestion voir numero` | Affiche une suggestion, ses votes et son statut |
| `/suggestion liste [statut] [page]` | Liste par statut : en attente, en cours, acceptées, refusées |
| `/suggestion accepter\|refuser\|encours numero [raison]` | Réponse de l'équipe |
| `/suggestion supprimer numero` | Retire définitivement une suggestion |
| `/suggestion config ...` | Salon, rôle staff, fil automatique, niveau minimum, délai |

**Mise en place** :

```
/suggestion config salon           #suggestions
/suggestion config staff           @Modérateur      ← qui peut répondre
/suggestion config fil             actif:true       ← un fil de discussion sous chaque suggestion
/suggestion config niveau-minimum  niveau:5         ← filtre les comptes neufs (0 = aucun)
/suggestion config delai           minutes:60       ← anti-spam de suggestions
```

**Comment ça marche** : la suggestion est publiée numérotée, avec trois boutons — **Pour**, **Contre** et **Détail des votes**. Les compteurs sont affichés directement sur les boutons et une barre de progression montre le rapport pour/contre. Un membre peut changer d'avis, ou recliquer sur son propre vote pour le retirer.

Quand l'équipe répond, l'embed d'origine est mis à jour (couleur, statut, réponse affichée), le fil de discussion est archivé, l'auteur reçoit un message privé avec la décision et le résultat des votes, et tout est journalisé dans les logs de modération.

Le **niveau minimum** s'appuie sur le système d'XP déjà en place : pratique pour éviter que des comptes tout neufs inondent le salon.

### 📨 Invitations

| Commande | Rôle |
|---|---|
| `/invitations voir [membre]` | Invitations valides, parties, suspectes, bonus, prochaine récompense |
| `/invitations classement [page]` | Les meilleurs recruteurs du serveur |
| `/invitations qui membre` | Qui a invité ce membre, avec quel code et quand |
| `/invitations bonus membre nombre` | Ajoute ou retire des invitations manuellement |
| `/invitations config ...` | Activation, salon des annonces, âge minimum, récompenses |

```
/invitations config activer            actif:true
/invitations config salon              #arrivees
/invitations config age-minimum        jours:7      ← comptes plus jeunes = suspects, ne comptent pas
/invitations config recompense-ajouter palier:10 role:@Recruteur
```

**Comment ça marche** : le bot garde en mémoire le compteur d'utilisations de chaque invitation. À chaque arrivée il compare, en déduit le lien utilisé, et attribue l'invitation. Les invitations à usage unique sont gérées aussi. Si quelqu'un part, l'invitation passe en « parti » et ne compte plus.

⚠️ Le bot a besoin de la permission **Gérer le serveur** pour lire les invitations, et le suivi ne remonte pas dans le passé : il commence à compter à partir de son activation.

### 🪙 Économie et boutique

| Commande | Rôle |
|---|---|
| `/economie solde [membre]` | Porte-monnaie, rang, série quotidienne, derniers achats |
| `/economie daily` | Récompense quotidienne, avec bonus de série jusqu'à +100 % |
| `/economie travailler` | Gain aléatoire, avec un délai entre deux |
| `/payer membre montant` | Transfert entre membres, avec la taxe du serveur |
| `/banque voir\|deposer\|retirer` | Met l'argent à l'abri et le fait produire des intérêts |
| `/braquer membre` | Tente de voler le liquide d'un autre membre |
| `/objet voir\|utiliser\|offrir` | Inventaire et objets achetés en boutique |
| `/economie classement [page]` | Les plus riches du serveur |
| `/economie gerer` | Ajoute, retire ou définit un solde (équipe) |
| `/economie config ...` | Activation, nom et emoji de la monnaie, gains |
| `/boutique voir` | Articles en vente, avec ce que tu peux t'offrir |
| `/boutique acheter numero` | Achète — le rôle est attribué immédiatement |
| `/boutique ajouter\|retirer` | Gestion de la boutique (équipe) |

```
/economie config activer  actif:true
/economie config monnaie  nom:blocks emoji:🟩
/economie config gains    par-message:2 daily:100 travail-min:20 travail-max:80 travail-delai:60
/boutique ajouter         nom:Rang VIP prix:2500 role:@VIP stock:10
```

La monnaie se gagne en même temps que l'XP (même délai d'une minute), donc l'activité sur le serveur alimente naturellement l'économie. La série quotidienne ajoute +10 % par jour consécutif, plafonnée à +100 %, et se remet à zéro après 48 h sans passage.

### 📋 Candidatures

| Commande | Rôle |
|---|---|
| `/candidature panneau [salon]` | Publie le menu des postes ouverts |
| `/candidature voir numero` | Affiche une candidature et ses réponses |
| `/candidature liste [statut]` | En attente, acceptées, refusées |
| `/candidature poste ajouter\|questions\|ouvrir\|retirer\|liste` | Gestion des postes |
| `/candidature config salon\|staff\|voir` | Salon de réception et rôle décisionnaire |

```
/candidature config salon  #candidatures
/candidature config staff  @Responsable
/candidature poste ajouter nom:Modérateur role:@Modérateur emoji:🛡️ niveau-minimum:5
/candidature poste questions poste:Modérateur questions:Ton âge et ton fuseau|*Pourquoi toi ?|*Ton expérience
/candidature panneau       #recrutement
```

**Les questions** se séparent par `|`, et une `*` devant une question la transforme en zone de texte longue. Cinq questions maximum, c'est la limite des formulaires Discord.

**Comment ça marche** : le candidat choisit un poste dans le menu, remplit le formulaire, et sa candidature arrive dans le salon de réception avec deux boutons **Accepter** et **Refuser**. Le staff clique, écrit un message pour le candidat, et tout s'enchaîne : le rôle est attribué si le poste en prévoit un, le candidat reçoit la réponse en message privé, et la fiche est mise à jour.

Un membre ne peut avoir qu'une candidature en cours par poste, et un niveau XP minimum peut être exigé.

### 🔐 Vérification et salons statistiques

| Commande | Rôle |
|---|---|
| `/serveur verification activer role:@Membre [captcha:true]` | Active la vérification |
| `/serveur verification panneau [salon]` | Publie le panneau à bouton |
| `/serveur verification texte` | Personnalise titre, message et bouton |
| `/serveur verification desactiver` · `etat` | Désactive, ou affiche la configuration |
| `/serveur stats creer modele:...` | Crée un salon vocal compteur |
| `/serveur stats lier salon: modele:` | Transforme un salon existant en compteur |
| `/serveur stats retirer` · `liste` · `actualiser` | Gestion des compteurs |

**Vérification** : le membre clique sur un bouton et reçoit le rôle d'accès. Avec `captcha:true`, une petite addition lui est demandée dans une fenêtre — assez pour bloquer les robots simples.

Après l'activation, il reste **une manipulation côté Discord** : retire à `@everyone` la permission *Voir les salons* sur le serveur, donne-la au rôle d'accès, et laisse uniquement le salon de vérification visible par tous.

**Salons statistiques** : `/serveur stats creer modele:👥 {membres} membres` crée un salon vocal verrouillé qui affiche le compteur dans son nom.

Variables : `{membres}` `{humains}` `{bots}` `{enligne}` `{boosts}` `{niveau}` `{salons}` `{roles}`

⚠️ Discord limite les renommages de salon à **2 par tranche de 10 minutes**. La mise à jour tourne donc toutes les 10 minutes — inutile de descendre plus bas dans `config.js`, les appels supplémentaires seraient ignorés. `{enligne}` demande en plus l'intent *Presence* dans le Developer Portal, sinon il affiche 0.

### 💾 Sauvegardes

| Commande | Rôle |
|---|---|
| `/sauvegarde creer [envoyer:true]` | Copie immédiate, avec envoi du fichier en message privé |
| `/sauvegarde liste` | Copies disponibles, taille de la base, date de la dernière |

Une sauvegarde est créée automatiquement toutes les 24 h dans `data/sauvegardes/`, et les 14 dernières sont conservées. La copie se fait avec `VACUUM INTO`, donc le fichier obtenu est propre et compact même si le bot écrit au même moment.

Pour restaurer : arrête le bot, remplace `data/zhaak.db` par la sauvegarde renommée en `zhaak.db`, supprime les fichiers `zhaak.db-wal` et `zhaak.db-shm` s'ils existent, puis relance.

Les réglages sont dans `config.js` → section `sauvegardes`.

Ces copies protègent les **données** (XP, économie, sanctions, réglages). Pour protéger la **structure** du serveur — rôles, salons, permissions — voir la section suivante.

### 👋 Accueil du premier message

```
/config bienvenue premier-message actif:true reaction:👋 texte:Bienvenue {mention} !
```

Le silence après le premier message est ce qui fait repartir la plupart des nouveaux : ils écrivent une phrase, personne ne répond, ils s'en vont. Le bot pose une réaction sur ce tout premier message et peut y répondre — souvent assez pour lancer la conversation.

Les deux sont facultatifs : réaction seule, réponse seule, ou les deux. Variables utilisables dans la réponse : `{mention}` `{pseudo}` `{serveur}` `{membres}`.

**Le passage est noté même quand le système est fermé.** C'est ce qui évite d'accueillir tout le serveur comme des nouveaux le jour où tu l'actives : au moment de l'activation, les membres déjà présents sont marqués comme ayant déjà parlé. Le bot le dit dans sa réponse.

L'accueil arrive **après** l'automod : un message supprimé pour spam ne reçoit pas de bienvenue chaleureuse.

### 🚨 Alerte quand le bot tombe en panne

```
/config logs erreurs salon:#alertes-bot
```

Une erreur qui passe inaperçue dans une fenêtre fermée, c'est un système qui ne marche plus sans que personne ne le sache. Le bot envoie ses propres erreurs dans un salon privé de l'équipe, avec l'extrait de la trace.

Deux précautions, sans lesquelles le remède serait pire que le mal :

* **Les erreurs identiques sont regroupées.** Une boucle qui échoue cent fois donne un message, puis un rappel avec le compteur. Les chiffres sont ignorés dans la comparaison : « timeout après 3000 ms » et « après 5000 ms » sont le même problème.
* **Un envoi toutes les deux minutes au maximum**, et une erreur survenue *pendant* l'envoi d'une alerte n'en déclenche pas une autre.

Passé trente minutes sans revoir la même erreur, elle redevient neuve : un incident qui revient le lendemain est bien signalé à nouveau.

### 🧩 Sauvegarde de la structure du serveur

```
/structure photo [nom]        → photographie rôles, salons et permissions
/structure liste              → les photos enregistrées
/structure comparer [photo]   → ce qui a changé depuis (ne modifie rien)
/structure reparer photo:3    → remet en place ce qui a changé
/structure exporter photo:3   → reçoit la photo en JSON, en message privé
/structure auto actif:true garder:10
```

Les sauvegardes de la base protègent l'XP, l'économie et les sanctions. Elles ne protègent pas le **serveur lui-même** : si quelqu'un supprime un rôle, vide les permissions d'un salon ou renomme la moitié des catégories, la base ne sert à rien. C'est ce trou que comble `/structure`.

**Ce qui est photographié** : tous les rôles (nom, couleur, permissions, position, affichage séparé, mentionnable), tous les salons et catégories (type, parent, sujet, lenteur, NSFW, débit et limite pour le vocal), les permissions de chaque salon rôle par rôle et membre par membre, les permissions de `@everyone`, et les réglages du serveur (nom, niveau de vérification, filtre des médias, salon AFK, salon système).

**Ce qui n'est pas photographié** : les messages, les membres, les emojis et les fils. Ce n'est pas une copie du serveur, c'est le plan pour le remonter.

**La réparation ne supprime jamais rien.** C'est la règle qui décide de tout le reste : supprimer un salon emporterait ses messages pour toujours, et une restauration ratée coûterait plus cher que le problème qu'elle répare. Donc le bot :

* recrée les rôles et les salons qui ont disparu,
* remet les noms, les couleurs et les permissions qui ont changé,
* remet chaque salon dans sa catégorie,
* **laisse en place** tout ce qui a été ajouté depuis la photo, en le signalant.

Un salon recréé est vide : ses anciens messages ne reviennent pas. Le bot le dit franchement à la fin de l'opération.

**Avant de réparer**, tu vois exactement ce qui va se passer, et tu dois confirmer avec un bouton. Le bot prend aussi une photo juste avant, pour pouvoir revenir en arrière si le résultat ne te plaît pas.

`/structure comparer` est la commande à utiliser au quotidien : elle ne touche à rien et répond à « qu'est-ce qui a bougé sur mon serveur depuis hier ». Le panneau web l'affiche aussi, dans l'onglet **Sauvegardes**.

**Portée réglable** : `/structure reparer quoi:roles` ne touche qu'aux rôles, `quoi:permissions` qu'aux permissions des salons, et ainsi de suite. Utile quand une seule chose est cassée.

**Deux limites imposées par Discord**, que le bot t'annonce avant de commencer :

* il ne peut pas toucher aux rôles placés **au-dessus du sien** — monte son rôle dans les paramètres du serveur pour qu'il puisse tout réparer ;
* les rôles qui appartiennent à un bot ou au boost Nitro ne sont pas recréables.

Une photo automatique est prise **chaque jour**, et seulement si la structure a bougé depuis la précédente — inutile de garder dix fois la même. Les dix dernières sont conservées (`/structure auto garder:20` pour en garder plus). Elles vivent dans la base, donc les sauvegardes quotidiennes les emportent avec elles.

### 🔊 Salons vocaux temporaires

| Commande | Rôle |
|---|---|
| `/vocal config creer-hub` | Crée le salon « ➕ Créer un vocal » |
| `/vocal config lier-hub salon:` | Transforme un salon vocal existant en salon d'accueil |
| `/vocal config retirer-hub` · `liste` | Gestion des salons d'accueil et vue des salons actifs |
| `/vocal nom` · `places` | Renomme, limite le nombre de personnes |
| `/vocal verrouiller` · `deverrouiller` · `cacher` · `afficher` | Contrôle de l'accès |
| `/vocal autoriser` · `expulser` · `transferer` | Gestion des membres et de la propriété |
| `/vocal panneau` | Réaffiche le panneau de contrôle |

**Mise en place** — une seule commande :

```
/vocal config creer-hub categorie:Vocaux modele:🔊 Salon de {pseudo} places:0
```

**Comment ça marche** : un membre rejoint le salon d'accueil, le bot lui crée aussitôt son propre salon vocal et l'y déplace. Il en devient propriétaire et reçoit un panneau à cinq boutons dans le salon : **Renommer**, **Places**, **Verrouiller**, **Cacher**, **Revendiquer**. Quand le dernier occupant part, le salon disparaît tout seul.

Si le propriétaire s'en va mais que d'autres restent, la propriété passe automatiquement à la personne présente la plus ancienne. Le bouton **Revendiquer** permet aussi à quelqu'un de reprendre la main si le propriétaire a quitté.

Un membre ne peut avoir qu'un salon à la fois : s'il rejoint à nouveau l'accueil, il est renvoyé vers le sien. Au redémarrage du bot, les salons temporaires restés vides sont supprimés automatiquement.

Variables du modèle de nom : `{pseudo}` et `{numero}`.

⚠️ Le bot a besoin des permissions **Gérer les salons** et **Déplacer des membres**, sans quoi rien ne se crée.

### 💬 FAQ automatique

| Commande | Rôle |
|---|---|
| `/faq chercher question:` | Cherche une réponse (visible de toi seul) |
| `/faq afficher numero:` | Publie une fiche pour tout le salon |
| `/faq liste` | Toutes les fiches, avec leur nombre de consultations |
| `/faq ajouter question: reponse: [mots-cles:]` | Crée une fiche (équipe) |
| `/faq modifier` · `retirer` | Gestion des fiches (équipe) |
| `/faq auto actif: [seuil:]` | Active la réponse automatique (équipe) |
| `/faq tester phrase:` | Montre ce que le bot répondrait et pourquoi (équipe) |

```
/faq ajouter question:Comment rejoindre le serveur ? reponse:IP : play.zhaak.fr mots-cles:ip adresse rejoindre connecter minecraft
/faq auto actif:true seuil:55
```

**Comment ça marche** : quand un message ressemble à une question — il contient un `?` ou commence par « comment », « pourquoi », « où »… — le bot le compare aux fiches. Si la correspondance dépasse le seuil, il répond en citant le message, avec un bouton **« Ce n'était pas ma question »** qui retire la réponse.

Le score combine la part de la question couverte par la fiche et le nombre de mots-clés retrouvés, avec une tolérance sur les conjugaisons (« connecte » retrouve « connecter »). Un seul mot en commun ne suffit jamais à déclencher une réponse.

**Le réglage se fait avec `/faq tester`** : tape une vraie question de tes membres, le bot t'annonce le score obtenu et les mots retenus. Si c'est trop bas, ajoute des mots-clés à la fiche plutôt que de baisser le seuil — c'est plus précis. Un seuil de 55 est un bon départ ; en dessous de 45 le bot devient bavard.

Le bot ne répond jamais deux fois la même fiche dans le même salon à moins de cinq minutes d'intervalle.

### 💜 Boosts

| Commande | Rôle |
|---|---|
| `/boost salon` · `message` · `role` · `recompense` | Configuration du remerciement |
| `/boost liste` | Les boosters actuels, du plus ancien au plus récent |
| `/boost voir` | Affiche la configuration |

```
/boost salon      #annonces
/boost role       @Booster
/boost recompense montant:2500
/boost message    Merci {mention} 💜 On est à {boosts} boosts !
```

Quand quelqu'un boost, le bot le remercie dans le salon choisi, lui donne le rôle et lui verse la monnaie. Quand le boost s'arrête, le rôle est retiré automatiquement. Variables du message : `{mention}` `{pseudo}` `{serveur}` `{boosts}` `{niveau}`.

### 🔐 Paliers de confiance

| Commande | Rôle |
|---|---|
| `/palier liste` | La progression complète et où tu en es |
| `/palier ajouter niveau: role: [salon:]` | Crée un palier (équipe) |
| `/palier retirer niveau:` | Supprime un palier (équipe) |
| `/palier synchroniser` | Attribue les rôles manquants à tous les membres déjà au niveau (équipe) |

```
/palier ajouter niveau:5  role:@Habitué
/palier ajouter niveau:15 role:@Confirmé salon:#discussions-avancees
/palier synchroniser
```

L'intérêt par rapport à `/xp recompense` : si tu indiques un **salon**, le bot règle lui-même les permissions — visible pour le rôle, masqué pour `@everyone`. Les nouveaux arrivants n'ont donc pas accès à tout immédiatement, ce qui limite les comptes jetables.

`/palier synchroniser` rattrape l'existant : les récompenses de niveau ne s'appliquent normalement qu'au moment où on monte de niveau, cette commande donne les rôles à tous ceux qui sont déjà au-dessus du palier.

### 🎨 Thèmes de carte de rank

```
/theme liste                 → tous les thèmes, leur prix et celui que tu portes
/theme apercu theme:Or       → voit ta carte avec ce thème, sans payer
/theme acheter theme:Or      → débloque le thème avec la monnaie du serveur
/theme equiper theme:Nuit    → change le thème affiché sur ta carte
```

Sept thèmes sont fournis : **Nature** (offert), **Océan**, **Braise**, **Lavande**, **Nuit**, **Minuit** (ciel étoilé) et **Or**. Ils changent les couleurs de la carte `/rank` : accent, barre d'XP, anneau, et pour les trois derniers le fond entier passe en sombre avec du texte clair.

Un achat débite le solde du membre, le thème est équipé dans la foulée, et l'aperçu est renvoyé en image. Les prix, les couleurs et la liste elle-même se règlent dans `config.js` → section `themesRank` : tu peux en ajouter, en retirer ou changer un prix sans toucher au code. Si tu supprimes un thème que quelqu'un portait, sa carte revient simplement au thème par défaut.

Seul le thème **Nature** suit la couleur du rôle du membre ; les autres imposent leur propre palette, sinon le thème acheté perdrait ce qui le distingue.

### 🚩 Signalement de messages

```
/config signalements salon salon:#signalements   → salon privé de l'équipe
/config signalements delai secondes:60           → délai entre deux signalements
```

Un membre fait **clic droit sur un message → Applications → Signaler le message**. Une fenêtre lui demande la raison, puis l'équipe reçoit une fiche dans le salon configuré : auteur, signaleur, salon, raison, contenu du message et un lien pour y sauter.

Quatre boutons sous la fiche, réservés aux modérateurs (permission *Modérer les membres*) :

| Bouton | Effet |
|---|---|
| 🗑️ Supprimer le message | Supprime le message signalé |
| ⚠️ Avertir l'auteur | Enregistre un avertissement avec la raison du signalement |
| 🔇 Mute 60 min | Rend l'auteur muet une heure |
| ✅ Ignorer | Clôt le signalement sans rien faire |

Une fois traité, les boutons se désactivent, la fiche indique qui a agi et quoi, et un log part dans la catégorie *Modération*. Le nom du signaleur n'apparaît que dans ce salon d'équipe, jamais dans le salon d'origine.

Garde-fous : impossible de signaler son propre message ou celui d'un bot, un même message ne peut pas être signalé deux fois tant qu'il est en attente, et un membre ne peut signaler qu'une fois toutes les 60 secondes (réglable).

### 📊 Graphiques d'activité

```
/stats            → les 30 derniers jours
/stats jours:7    → une semaine (7 à 90 jours)
```

Le bot compte chaque jour les messages, les arrivées, les départs et les minutes de vocal, puis produit une image de tableau de bord : quatre chiffres clés, la courbe des messages par jour, les arrivées et départs en colonnes, et les cinq salons les plus actifs.

Les valeurs importantes sont aussi écrites dans le texte du message, donc l'information reste lisible même si l'image ne charge pas. Les couleurs ont été vérifiées pour rester distinguables en cas de daltonisme.

**Le comptage démarre au premier lancement du bot** : il n'existe pas d'historique avant. Les deux premiers jours, la courbe sera courte — c'est normal. Les données de plus de 180 jours sont supprimées automatiquement.

### 📡 Annonces automatiques (Instagram, YouTube, RSS)

```
/veille ajouter type:Instagram salon:#annonces role:@Abonnés
/veille ajouter type:YouTube  salon:#annonces source:@TaChaine
/veille ajouter type:Flux RSS salon:#annonces source:https://unsite.fr/rss
/veille liste · /veille tester numero:1 · /veille retirer numero:1 · /veille jeton
```

Le bot surveille les sources et poste une annonce dès qu'il y a du nouveau : image, titre, extrait et lien, avec une mention de rôle si tu veux. Tout se pilote aussi à la souris depuis le panneau, onglet **Annonces auto**.

| Source | Ce qu'il faut |
|---|---|
| **YouTube** | Rien. Le flux public suffit — donne `@pseudo`, l'adresse de la chaîne ou son identifiant `UC…` |
| **Flux RSS** | Rien. L'adresse du flux suffit (blog, site d'actus…) |
| **Instagram** | Un compte **professionnel** et un jeton Meta — voir `GUIDE-INSTAGRAM.txt` |

**Pourquoi Instagram demande une configuration** : Meta a fermé l'ancienne API publique fin 2024. Aujourd'hui il faut un compte Créateur ou Entreprise, une petite application créée sur le site développeur de Meta, et un jeton d'accès. C'est une dizaine de minutes, une seule fois : `GUIDE-INSTAGRAM.txt` détaille chaque clic. Le bot **renouvelle ensuite le jeton tout seul** tous les 40 jours (il vit 60 jours), donc tu n'y touches plus — sauf si le bot reste éteint plus de deux mois d'affilée.

On ne peut surveiller que **son propre** compte Instagram : l'API ne donne accès qu'au compte qui a autorisé l'application.

Deux garde-fous : en ajoutant une source, la publication déjà en ligne **n'est pas annoncée** (sinon tout l'historique tomberait d'un coup), et le bot n'envoie jamais plus de 3 annonces par passage pour une même source, même s'il a raté une journée. La fréquence de vérification et ce plafond se règlent dans `config.js` → section `veille`.

### 🪪 Carte de profil

```
/profil [membre]
```

Une carte plus grande que `/rank`, qui rassemble tout ce que le bot sait d'un membre : niveau, rang, barre d'XP, messages et temps en vocal, solde et rang au classement des richesses, invitations, anciennete sur le serveur, avertissements actifs, ses trois roles les plus hauts et l'avancement de ses missions du jour.

Elle utilise le **theme equipe** par le membre, exactement comme `/rank` : quelqu'un qui a achete *Or* voit son profil en noir et or.

### 🎯 Missions quotidiennes et hebdomadaires

```
/missions                              → tes defis, ta progression, le bouton pour encaisser
/config missions activer actif:true    → active le systeme (equipe)
```

Chaque jour, le bot tire **3 missions** dans une reserve, et chaque semaine **2 missions** plus longues. Tout le serveur a les memes missions le meme jour, et elles changent a minuit (heure de Paris). Exemples : envoyer 30 messages, passer une heure en vocal, parler dans 3 salons differents, recuperer sa recompense quotidienne, faire venir un nouveau membre.

Chaque mission accomplie rapporte de l'**XP** et de la **monnaie du serveur**. Terminer *toutes* les missions d'une periode donne un **bonus** en plus. Rien n'est verse automatiquement : le membre clique sur *Réclamer mes récompenses* dans `/missions`, et le compteur se met a jour sous ses yeux.

Le message de `/missions` est prive (visible seulement par celui qui tape la commande), donc personne ne peut cliquer sur le bouton de quelqu'un d'autre.

**Ce que le bot compte**, sans rien avoir a configurer : les messages, les minutes de vocal, les salons differents ou tu as parle, `/daily`, `/travailler`, les tickets ouverts, les suggestions envoyees, les achats en boutique et les invitations (les faux comptes ne comptent pas).

La reserve de missions, les quantites et les recompenses se reglent dans `config.js` → section `missions`. Tu peux en ajouter, en retirer, changer les prix, ou passer `actif` a `false` pour tout couper. Les progressions de plus de 30 jours sont supprimees automatiquement.

### 📩 Appels de sanction

```
/config appels activer salon:#appels-staff delai:14   → ouvre les appels
/config appels desactiver                             → les ferme
/appel contester numero:42                            → conteste sa sanction
/appel liste                                          → appels en attente (equipe)
```

Quand les appels sont ouverts, le message prive qu'un membre recoit apres un avertissement, un mute, une expulsion ou un bannissement contient un bouton **Contester cette sanction**. Il fonctionne meme si le membre a ete banni ou rendu muet — c'est tout l'interet : il n'a plus besoin d'envoyer un message prive au staff.

Le membre remplit un formulaire, et l'equipe recoit une fiche dans le salon configure : la sanction contestee, le moderateur qui l'a posee, la raison d'origine, ce que dit le membre, et **son historique complet de sanctions** pour trancher en connaissance de cause.

| Bouton | Effet |
|---|---|
| ✅ Accepter l'appel | Ouvre une fenetre pour ecrire un mot au membre, puis **leve la sanction** : deban, mute retire, avertissement annule |
| ❌ Refuser l'appel | Demande une raison (obligatoire), maintient la sanction et l'explique au membre |

Dans les deux cas le membre recoit la reponse en message prive, la fiche se fige avec le nom du moderateur qui a tranche, et un log part dans la categorie *Modération*. Si le membre a ferme ses messages prives, la fiche le signale.

Garde-fous : un seul appel par sanction, on ne conteste que ses propres sanctions, et il existe un delai maximum (14 jours par defaut, reglable, `0` = illimite).

### 🏦 Banque, transferts et braquages

```
/banque voir                 → ton liquide, ton compte, les intérêts du jour
/banque deposer montant:5000 → met l'argent à l'abri (ou "tout", ou "50%")
/banque retirer montant:tout → ramène l'argent en poche
/payer membre:@Hugo montant:1000
/braquer membre:@Hugo
```

L'argent existe à deux endroits : **en poche** et **à la banque**. En poche il sert à acheter et se fait braquer ; à la banque il ne peut pas être volé et rapporte **2 % par jour**, plafonné à 5 000 par versement. Les intérêts tombent une fois par jour, et si le bot est resté éteint une semaine il ne rattrape que 7 jours — pas dix mois d'un coup.

`/payer` prélève une **taxe de 5 %** qui disparaît de la circulation : c'est ce qui empêche la monnaie du serveur de gonfler à l'infini à force de transferts entre comptes.

`/braquer` réussit **35 %** du temps et rapporte 15 % du liquide de la cible. En cas d'échec, le voleur paie 20 % de ce qu'il a. Après un braquage réussi la victime est tranquille pendant 12 h, et le voleur doit attendre 6 h avant de recommencer. On ne braque que quelqu'un qui a au moins 500 en poche — et jamais ce qui est à la banque.

**Les braquages sont fermés par défaut** : ils prennent de l'argent à un membre sans son accord. Ouvre-les seulement si ton serveur aime ça : `/config economie braquage actif:true`.

Tous les chiffres (taux, taxe, chances, délais) se règlent dans `config.js` → section `economie`.

### 🎒 Objets et inventaire

```
/objet voir                        → ton inventaire
/objet utiliser objet:Potion d'XP  → active l'effet
/objet offrir membre:@Lea objet:...
```

Cinq objets sont fournis, achetables dans `/boutique` :

| Objet | Effet |
|---|---|
| 🧪 Potion d'XP | XP doublé pendant 1 h |
| ⚗️ Élixir d'XP | XP triplé pendant 30 min |
| 🎨 Couleur de pseudo | Un rôle de couleur au choix pendant 24 h |
| ⏩ Coupe-file | Annule le délai de `/economie daily` et `/economie travailler` |
| 🔒 Coffre-fort | Impossible à braquer pendant 12 h |

Deux potions actives en même temps **ne se multiplient pas** : c'est la meilleure qui compte. Les effets expirés sont nettoyés toutes les 5 minutes, et le rôle de couleur est retiré puis supprimé quand plus personne ne le porte.

La liste, les prix et les durées se règlent dans `config.js` → section `economie.objets`.

### ⭐ Prestige et badges

```
/prestige          → l'état actuel et le bouton pour repartir à zéro
/badges [membre]   → les badges obtenus et la progression vers les suivants
```

Au **niveau 50**, un membre peut passer un prestige : son XP repart à zéro, il gagne une **étoile permanente** affichée sur sa carte, **10 000** de monnaie, et **+5 % d'XP par étoile** pour toujours. Dix prestiges au maximum. C'est volontairement irréversible — le bot le dit clairement et demande une confirmation.

Les **badges** se débloquent tout seuls : messages écrits, minutes en vocal, niveau atteint, invitations, ancienneté sur le serveur, étoiles de prestige. Treize badges sont fournis. Ils apparaissent sur `/badges` et leur nombre s'affiche sur la carte de rank. Si tu fermes le système, les badges déjà gagnés restent en base et réapparaissent tels quels quand tu le rouvres.

La liste complète se règle dans `config.js` → section `progression.badges`.

### ✨ Bonus d'XP et week-ends double XP

```
/xp bonus ajouter role:@VIP multiplicateur:1.5
/xp bonus liste
/xp evenement lancer heures:48
/xp evenement arreter
```

Un rôle peut donner un multiplicateur d'XP. Si un membre a plusieurs rôles bonus, **c'est le meilleur qui s'applique**, pas le produit : sinon trois petits rôles vaudraient plus qu'un gros.

Les **week-ends sont automatiquement en double XP**, du vendredi 18 h au dimanche 23 h, heure de Paris. `/xp evenement` permet d'en lancer un à la main en plus, pour une durée choisie.

### 🖼️ Fond de carte personnel et carte animée

```
/carte fond image:[ton image]   → recadre et enregistre ton fond
/carte voir                     → ta carte telle qu'elle est
/carte retirer                  → revient au décor du serveur
/rank animee:true               → la même carte en GIF
```

Chaque membre peut mettre sa propre image derrière sa carte de rank. L'image est téléchargée **une seule fois**, recadrée en 1500 × 500 et gardée en local — les liens Discord expirent, on ne dépend donc de rien. PNG, JPEG ou WebP, 8 Mo maximum. Le thème équipé continue de décider des couleurs : seule l'image change.

**Les fonds personnels sont fermés par défaut** : n'importe qui peut envoyer n'importe quelle image. Ouvre-les quand tu es prêt à surveiller : `/config xp fond-perso actif:true`.

La carte animée est un GIF de 1,8 seconde : la barre d'XP se remplit, l'anneau tourne et un reflet balaie la barre. Elle coûte environ une seconde de calcul, d'où l'option plutôt que l'affichage par défaut.

### 📊 Statistiques par membre

```
/messtats [membre]
```

Une image en deux lectures : **quand** le membre écrit (24 barres, une par heure de la journée, heure de Paris, avec sa plage de trois heures favorite) et **où** il écrit (ses cinq salons les plus utilisés). Avec, en haut, ses messages, son temps en vocal, ses heures favorites et son salon préféré.

Le comptage démarre à l'installation de cette version : les messages plus anciens ne sont pas rattrapables, et l'image le précise en bas.

### 🤖 Automod et anti-raid

```
/automod activer
/automod module nom:Anti-liens actif:true
/automod mots ajouter|retirer|liste
/automod exemption ajouter salon:#memes role:@VIP
/automod etat

/antiraid activer age-minimum:7
/antiraid verrouiller | deverrouiller | etat
```

Modules disponibles : anti-spam/flood, anti-répétition, anti-invitations Discord, anti-liens, filtre de mots interdits, anti-mentions massives, anti-majuscules.

Le filtre de mots résiste au **leet speak** et aux accents : `gr0sm0t`, `grôsmot`, `g.r.o.s.m.o.t` sont tous détectés à partir de l'entrée `grosmot`.

Après 3 déclenchements en 10 minutes, le membre est automatiquement muet 10 minutes. Les modérateurs (permission *Gérer les messages*) sont toujours exemptés.

L'anti-raid détecte une vague d'arrivées (8 en 10 s par défaut), passe le serveur en vérification maximale, expulse les arrivants pendant la durée du verrouillage, puis lève tout seul après 10 minutes. Il peut aussi filtrer les comptes de moins de X jours.

### 🧰 Utilitaires

`/aide` · `/ping` · `/userinfo [membre]` · `/serveurinfo` · `/stats [jours]` · `/veille` (annonces automatiques)

---

## 4. Les logs

Cinq catégories, chacune dans le salon de ton choix (ou toutes dans le même avec `/config logs tout`) :

- **Messages** — suppressions (avec l'auteur de la suppression via les logs d'audit), éditions avant/après, purges groupées
- **Membres** — arrivées avec âge du compte, départs avec les rôles qu'avait le membre, changements de pseudo et de rôles, mises en sourdine
- **Modération** — chaque sanction avec son numéro, son auteur, sa raison et sa durée ; déclenchements de l'automod ; verrouillages
- **Serveur** — création et suppression de salons et de rôles
- **Vocal** — connexions, déconnexions avec durée, déplacements, partages d'écran

---

## 5. Structure du projet

```
├── config.js               ← réglages globaux (XP, seuils, couleurs)
├── GUIDE-INSTAGRAM.txt     ← comment obtenir le jeton Instagram, pas à pas
├── .env                    ← secrets (jamais sur GitHub)
├── ecosystem.config.js     ← configuration PM2
├── demarrer.bat            ← lancement Windows avec relance automatique
└── src/
    ├── index.js            ← démarrage, chargement des commandes et événements
    ├── deploy-commands.js  ← enregistrement des commandes slash
    ├── database/db.js      ← schéma SQLite et requêtes préparées
    ├── commands/
    │   ├── niveau/         ← rank, profil, classement, messtats, xp, theme, badges, prestige, carte
    │   ├── tickets/        ← ticket (panneau, config, fermeture)
    │   ├── vocal/          ← vocal (salons temporaires)
    │   ├── suggestions/    ← suggestion (envoi, votes, réponses)
    │   ├── candidatures/   ← candidature (postes, formulaires, décisions)
    │   ├── economie/       ← economie, boutique, missions, banque, payer, braquer, objet
    │   ├── invitations/    ← invitations (suivi, classement, récompenses)
    │   ├── moderation/     ← ban, kick, mute, warn, sanctions, clear, lock, slowmode, signaler, appel
    │   ├── config/         ← config, automod, antiraid, veille, structure
    │   └── utilitaires/    ← aide, ping, userinfo, serveurinfo, stats
    ├── panneau/
    │   ├── serveur.js      ← petit serveur HTTP local (aucune dépendance)
    │   └── page.html       ← la page de réglages, autonome
    ├── events/             ← un fichier par événement Discord
    ├── utils/
    │   ├── carteRank.js    ← génération de la carte de rank
    │   ├── carteAnimee.js  ← la même carte en GIF animé
    │   ├── carteProfil.js  ← carte de profil complète
    │   ├── fondsPerso.js   ← images de fond envoyées par les membres
    │   ├── themesRank.js   ← thèmes achetables de la carte de rank
    │   ├── graphiqueActivite.js ← tableau de bord d'activité en image
    │   ├── graphiqueMembre.js   ← heures et salons d'un membre (/messtats)
    │   ├── statsMembre.js  ← comptage des heures et des salons par membre
    │   ├── activite.js     ← comptage quotidien (messages, arrivées, vocal)
    │   ├── signalements.js ← fiches d'équipe et boutons d'action
    │   ├── veille.js       ← surveillance Instagram / YouTube / RSS
    │   ├── missions.js     ← tirage des défis, progression, récompenses
    │   ├── appels.js       ← contestation de sanction et décision de l'équipe
    │   ├── carteBienvenue.js
    │   ├── niveaux.js      ← calculs de niveaux et récompenses
    │   ├── automod.js      ← détection et sanctions automatiques
    │   ├── antiRaid.js
    │   ├── sanctions.js    ← enregistrement + log + MP
    │   ├── tickets.js      ← ouverture, prise en charge, fermeture
    │   ├── suggestions.js  ← embed, votes, réponses du staff
    │   ├── candidatures.js ← panneau, formulaires, décisions
    │   ├── economie.js     ← monnaie, quotidien, travail
    │   ├── banque.js       ← dépôts, intérêts, transferts taxés, braquages
    │   ├── objets.js       ← catalogue, inventaire, effets à durée limitée
    │   ├── progression.js  ← multiplicateurs, double XP, prestige, badges
    │   ├── invitations.js  ← cache et détection des invitations
    │   ├── verification.js ← panneau, captcha, attribution du rôle
    │   ├── statistiques.js ← salons compteurs
    │   ├── sauvegardes.js  ← copies de la base et rotation
    │   ├── premierMessage.js ← accueil du tout premier message
    │   ├── alertes.js      ← signale les pannes du bot dans un salon
    │   ├── chargeur.js     ← chargement des commandes, aussi à chaud
    │   ├── structure.js    ← photo des rôles, salons et permissions
    │   ├── structureReparer.js ← remise en place, sans jamais rien supprimer
    │   ├── vocauxTemporaires.js ← création, panneau, propriété
    │   ├── faq.js          ← recherche et réponse automatique
    │   ├── boosts.js       ← remerciement et récompenses de boost
    │   ├── transcription.js ← génération de la transcription HTML
    │   ├── logs.js
    │   └── taches.js       ← débans et mutes expirés (toutes les minutes)
    │   └── fondCarte.js    ← chargement et cadrage du décor
    └── assets/
        ├── fonts/          ← Poppins, embarquée pour les images
        └── images/fond.png ← décor des cartes de rank et de bienvenue

Les fonds personnels des membres sont enregistrés dans `data/fonds/`, à côté de la base.
```

**Ajouter une commande** : dépose un fichier dans le bon dossier de `src/commands/` avec `data` (un `SlashCommandBuilder`, ou un `ContextMenuCommandBuilder` pour une entrée en clic droit) et `execute(interaction, client)`, puis relance `npm run deploy`. Le chargement est automatique, rien à déclarer ailleurs.

---

## 6. Faire tourner le bot en continu

Avec `npm start`, le bot s'arrête dès que tu fermes le terminal. Trois options, de la plus simple à la plus robuste.

### Option A — le fichier `demarrer.bat` (le plus simple)

Double-clique sur **`demarrer.bat`** à la racine du projet. Il lance le bot et le **relance automatiquement s'il plante**. Laisse la fenêtre ouverte : la fermer arrête le bot.

Pour qu'il démarre avec Windows : appuie sur **Win + R**, tape `shell:startup`, valide — un dossier s'ouvre. Fais un clic droit sur `demarrer.bat` → *Copier*, puis dans ce dossier clic droit → *Coller le raccourci*. Le bot se lancera à chaque ouverture de session.

Limite : le bot ne tourne que quand ton PC est allumé et ta session ouverte.

### Option B — PM2 (tourne en arrière-plan, sans fenêtre)

```powershell
npm install -g pm2
pm2 start ecosystem.config.js
pm2 save
```

Commandes utiles ensuite :

```powershell
pm2 logs zhaak-bot     # voir les logs en direct
pm2 restart zhaak-bot  # redémarrer
pm2 stop zhaak-bot     # arrêter
pm2 list               # état
```

Pour le démarrage automatique sous Windows :

```powershell
npm install -g pm2-windows-startup
pm2-startup install
pm2 save
```

### Option C — un hébergeur (tourne 24/7 sans ton PC)

C'est la seule solution pour que le bot reste en ligne quand ton PC est éteint. Un petit VPS ou une offre « bot Discord » suffit largement : le bot consomme peu.

Envoie le projet **sans `node_modules`**, puis sur le serveur :

```bash
npm install
npm run deploy
pm2 start ecosystem.config.js && pm2 save && pm2 startup
```

Sur un panel type Pterodactyl : œuf **Node.js**, commande de démarrage `npm start`, et les variables du `.env` dans l'onglet *Startup*.

**Dans tous les cas**, pense à récupérer régulièrement `data/zhaak.db` et le dossier `data/sauvegardes/` : c'est là que vivent l'XP, l'économie et l'historique de modération.

## 7. Le panneau de contrôle

Une page web qui s'ouvre **sur ton ordinateur** pour tout régler à la souris, au lieu de taper des commandes.

### Pour l'activer

Ajoute ces trois lignes à la fin de ton fichier `.env` :

```
PANNEAU_ACTIF=true
PANNEAU_MOTDEPASSE=choisis_un_mot_de_passe
PANNEAU_PORT=3000
```

Relance le bot. Dans la console tu verras :

```
OK   Panneau de controle : http://localhost:3000
```

Ouvre ce lien dans ton navigateur, tape ton mot de passe, et tu y es.

### Ce qu'on peut y faire

| Onglet | Contenu |
|---|---|
| **Résumé** | Membres, messages sur 7 jours, tickets ouverts, signalements et appels en attente, classement, missions du jour |
| **Bienvenue** | Salon, message, image, rôle automatique, message privé, départs |
| **Logs** | Les cinq catégories, chacune avec son salon |
| **XP et niveaux** | Activation, XP vocal, annonces, prestige, badges, fond personnel, carte animée, et les rôles débloqués par niveau |
| **Modération** | Automod module par module, anti-raid, signalements, appels de sanction |
| **Systèmes** | Tickets, suggestions, candidatures, vérification, FAQ, boosts, invitations, missions |
| **Économie** | Monnaie, quotidien, travail, banque, transferts, braquages, objets, et la boutique |
| **Annonces auto** | Les sources surveillées, l'ajout et le retrait, un bouton *Tester*, et l'état du jeton Instagram |
| **Statistiques** | Messages, arrivées/départs et vocal au fil des jours, en graphiques survolables (7, 30 ou 90 jours) |
| **Aperçus** | Les cartes de rank, de profil et de bienvenue **générées en direct**, dans le thème de ton choix, plus le graphique d'activité |
| **Sauvegardes** | Les copies de la base, et les photos de la structure du serveur avec ce qui a changé depuis la dernière |
| **Console** | Ce que le bot écrit dans sa fenêtre, en direct, avec filtre par niveau et par texte, plus le rechargement et le redémarrage |

Les modifications ne partent pas toutes seules : une pastille apparaît en bas dès que tu changes quelque chose, avec **Enregistrer** et **Annuler**.

**L'onglet Console** évite de garder la fenêtre noire du bot ouverte, et sert de journal d'activité. Chaque geste y laisse une ligne :

```
16:08:52  ACTION  arrivée par Melwen — compte créé il y a 412 jour(s)
16:08:52  ACTION  /rank par Lyra dans #general — 186 ms
16:08:52  ACTION  bouton mis_reclamer par Lyra dans #general — 77 ms
16:08:52  ACTION  montée de niveau par Corvus dans #general — niveau 25
16:08:52  ACTION  automod par Nyx dans #general — Invitation Discord — message supprimé
16:08:52  ACTION  sanction warn par Zhaak — sur Nyx — invitation vers un autre serveur
16:08:52  ACTION  départ par Kael — resté 18 jour(s)
```

Sont tracés : les commandes (avec leur sous-commande, `/config xp prestige`), les boutons, menus et formulaires, les clics droits, les arrivées et départs, les montées de niveau, les sanctions et les actions de l'automod. Chaque ligne porte l'auteur, le salon et le temps d'exécution ; une commande qui échoue est marquée `échec` et l'erreur détaillée arrive juste après.

L'autocomplétion, elle, n'est pas tracée : elle part à chaque frappe au clavier et noierait tout le reste.

Le filtre par niveau permet de n'afficher que les actions, ou que les erreurs ; le filtre texte cherche dans les lignes (« instagram », un pseudo, un nom de salon). Le bouton **Copier** copie ce qui est affiché, filtres compris — pratique pour demander de l'aide sans recopier à la main. Le défilement suit les nouvelles lignes et se met en pause dès qu'on remonte lire quelque chose.

Ces lignes vivent en mémoire : un redémarrage repart de zéro, et rien n'est écrit sur le disque. Pour un historique qui dure, ce sont les salons de logs Discord.

Trois réglages dans `config.js` → section `console` : `lignes` (combien garder, 2000 par défaut), `actions` (passer à `false` pour ne voir que les événements importants) et `detail` (le salon et la durée dans chaque ligne).

**L'onglet Statistiques** dessine les graphiques dans la page plutôt que de servir une image : on survole une journée et on lit sa valeur. Trois vues sur la même période (7, 30 ou 90 jours) — messages par jour, arrivées et départs de part et d'autre d'une ligne de partage, et temps passé en vocal — plus quatre chiffres-clés et un tableau jour par jour pour qui préfère les nombres bruts.

Les couleurs des graphiques sont volontairement distinctes du violet de l'interface : le violet dit « ceci se clique », le bleu et le rouge disent « ceci est une donnée ». La paire a été vérifiée pour le daltonisme sur les deux fonds du panneau, et la légende double l'information portée par la couleur.

**L'onglet Console** propose aussi deux boutons de maintenance :

* **Recharger les commandes** relit leur code sans couper le bot — c'est ce qu'il faut après avoir modifié une commande. Les événements, `config.js` et la base ne sont pas relus.
* **Redémarrer le bot** l'arrête pour qu'il reparte à neuf. Le bot ne revient tout seul que s'il est lancé par `demarrer.bat` ou par PM2 ; le panneau détecte lequel et te le dit avant de te laisser cliquer. Sans relanceur détecté, l'avertissement est explicite : le bot s'arrêtera et il faudra le relancer à la main.

**L'apparence** se règle dans un seul bloc de variables en haut de `src/panneau/page.html` : la ligne `--accent:` et les quatre qui suivent, plus le bloc équivalent pour le mode sombre. Aucune couleur n'est écrite en dur ailleurs dans la feuille de style.

### Sécurité

Le panneau est conçu pour rester chez toi :

- il **n'écoute que sur `127.0.0.1`** — même quelqu'un sur ton réseau Wi-Fi ne peut pas l'ouvrir, et une redirection de port sur ta box ne le rendrait pas joignable ;
- il refuse de démarrer si `PANNEAU_MOTDEPASSE` fait moins de 8 caractères ;
- après 5 mauvais mots de passe, il bloque les tentatives pendant 5 minutes ;
- la session dure 12 heures, dans un cookie que le JavaScript de la page ne peut pas lire ;
- seules les colonnes de configuration existantes sont modifiables : tout autre champ envoyé est refusé ;
- rien n'est chargé depuis Internet, la page est entièrement contenue dans le fichier `page.html`.

Laisse `PANNEAU_ACTIF=false` si tu ne t'en sers pas : le serveur ne démarre pas du tout dans ce cas.

---

## 8. Personnaliser les cartes

Les cartes de rank et de bienvenue partagent le décor `src/assets/images/fond.png` (thème clair, mousse et rocher). Tout se règle dans `config.js` → section `carte` :

| Réglage | Effet |
|---|---|
| `imageFond` | Nom du fichier dans `src/assets/images/`. Format conseillé : **1500 × 500**, fond clair, décor dans les coins et centre dégagé |
| `voile` | Voile blanc posé sur l'image, de `0` (photo pleine intensité) à `1` (fond blanc). Par défaut `0.5` |
| `miroirRank` | Retourne le décor sur la carte de rank pour dégager le coin *rang / niveau*. Passe-le à `false` si tu changes d'image |
| `accent` / `accentSecondaire` | Dégradé de la barre d'XP et de l'anneau |
| `texte` / `texteSecondaire` | Couleurs de texte — à assombrir ou éclaircir selon ton fond |

Avec le thème **Nature** (celui par défaut), la carte de rank utilise automatiquement **la couleur du rôle le plus haut du membre** comme accent (assombrie si besoin pour rester lisible sur fond clair) ; la valeur de `config.js` sert de repli. Les autres thèmes imposent leurs propres couleurs — voir la section `themesRank` du même fichier, où tu peux en ajouter ou en modifier :

| Réglage d'un thème | Effet |
|---|---|
| `nom` / `emoji` / `description` | Ce que voient les membres dans `/theme liste` |
| `prix` | Coût en monnaie du serveur (`0` = offert à tout le monde) |
| `accent` / `accent2` | Dégradé de la barre d'XP et de l'anneau |
| `voile` / `voileCouleur` | Opacité et couleur du voile posé sur le décor |
| `sombre` | `true` = texte clair sur fond sombre |
| `degrade` | Deux couleurs qui remplacent le décor (thèmes sans photo) |
| `etoiles` | Sème des étoiles sur un fond en dégradé |

Si l'image de fond est absente ou illisible, les cartes basculent sur un fond uni sans planter — un avertissement s'affiche dans la console.

Pour changer de police, dépose un `.ttf` dans `src/assets/fonts/` et adapte la liste dans `src/utils/polices.js`. Poppins est déjà embarquée, donc les images s'affichent correctement même sur un serveur Linux sans polices installées.

---

## 9. En cas de problème

| Symptôme | Cause la plus fréquente |
|---|---|
| `Cannot find module 'dotenv'` | `npm install` n'a pas été lancé dans le dossier contenant `package.json` |
| `node:sqlite` introuvable au démarrage | Node trop ancien : il faut la version 22.5 minimum, 24 ou plus de préférence |
| Les commandes n'apparaissent pas | `npm run deploy` non lancé, ou `CLIENT_ID` incorrect |
| « Used disallowed intents » au démarrage | Les deux intents privilégiés ne sont pas activés dans le Developer Portal |
| Pas de message de bienvenue | Salon non configuré (`/config voir`) ou permission *Envoyer des messages* manquante |
| Les rôles-récompenses ne s'appliquent pas | Le rôle du bot est trop bas dans la hiérarchie |
| Pas d'XP | Système désactivé, salon exclu, ou *Message Content Intent* absent |
| L'avatar manque sur les cartes | Normal en cas d'échec réseau : un cercle avec l'initiale s'affiche à la place |
