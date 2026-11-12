# Politique de confidentialité — Blueprint

*Dernière mise à jour : 14 septembre 2026*

Blueprint est un bot Discord. Ce document dit exactement ce qu'il enregistre,
pourquoi, combien de temps, et comment faire effacer ces données.

Il est écrit pour être lu, pas pour se couvrir. Si quelque chose n'y est pas
clair, écris à l'adresse en bas de page.

---

## En une phrase

Blueprint enregistre des identifiants Discord et des compteurs (XP, monnaie,
messages envoyés) pour faire fonctionner les niveaux, l'économie et la
modération — et il efface **tout** ce qui concerne un serveur dès qu'on l'en
retire.

---

## 1. Ce qui est enregistré

### Toujours, dès qu'un membre participe

| Donnée | Pourquoi |
|---|---|
| Ton identifiant Discord (un nombre) | Pour te reconnaître d'une fois sur l'autre |
| L'identifiant du serveur | Pour que ton XP d'un serveur ne se mélange pas à celui d'un autre |
| Ton XP, ton niveau, ton nombre de messages, ton temps en vocal | C'est le système de niveaux |
| L'heure de ton dernier gain d'XP | Pour ne pas compter dix messages d'affilée |

**Ton pseudo n'est pas enregistré.** Le bot le redemande à Discord au moment
d'afficher une carte ou un classement, et ne le garde pas.

### Si le serveur a activé la fonction

| Fonction | Ce qui est enregistré |
|---|---|
| Économie | Ton solde, ton compte en banque, tes achats, ton inventaire |
| Modération | Tes sanctions : type, raison écrite par le modérateur, durée, date, et qui l'a prononcée |
| Tickets | Le numéro, le sujet et la description que tu as écrits en ouvrant le ticket |
| Suggestions | Le texte de ta suggestion et tes votes |
| Candidatures | Les réponses que tu as écrites dans le formulaire |
| Signalements | Le texte du message signalé, pour que le staff puisse le lire même s'il est supprimé |
| Statistiques | Les heures auxquelles tu écris et les salons où tu écris, sous forme de compteurs |
| Invitations | Qui t'a invité sur le serveur |
| Concours | Ta participation à un concours : l'identifiant du concours, le tien, et la date du clic |

### Quatre cas à part

**Ta date d'anniversaire.** Elle n'est enregistrée que si **tu** la donnes
toi-même, avec `/anniversaire definir` — personne ne peut inscrire quelqu'un
d'autre, et `/anniversaire retirer` l'efface en un clic.

Le **jour et le mois** suffisent à souhaiter un anniversaire : ce sont les deux
seules informations demandées. L'**année est facultative**, et si tu la donnes,
le bot ne l'affiche nulle part et ne s'en sert jamais pour calculer un âge.
`/anniversaire voir` et `/anniversaire liste` montrent « 14 juillet », rien de
plus.

Une date d'anniversaire est enregistrée **par serveur** : la donner ici ne la
donne pas ailleurs.

**Les votes top.gg.** Si tu votes pour le bot et réclames ta récompense, le bot
enregistre ton identifiant Discord, la date et le nombre de tes votes. C'est
enregistré **une fois pour le bot**, pas par serveur — sinon une même personne
réclamerait sur dix serveurs. Rien d'autre n'est gardé, et le bot ne transmet
rien à top.gg : il lui demande seulement « cette personne a-t-elle voté ? ».

**L'XP global.** En plus de l'XP de chaque serveur, le bot tient un compteur
qui monte partout : c'est celui de `/global`. Sont enregistrés ton identifiant
Discord, ce total d'XP, ton nombre de messages et ton temps en vocal cumulés.

**Les serveurs où cet XP a été gagné ne sont pas enregistrés.** Ni leur nom, ni
leur identifiant. Un classement mondial qui révélerait sur quels serveurs
chacun se trouve serait un annuaire de présence : le bot ne garde que le total.

Ce compteur ne dépend d'aucun serveur, donc `/confidentialite effacer` — qui
efface tes données **sur un serveur** — n'y touche pas. C'est
`/global effacer` qui le remet à zéro, et toi seul peux le faire : aucun
administrateur n'a la main dessus.

**La blocklist communautaire.** C'est une liste partagée entre les serveurs du
bot. Si un administrateur te propose dessus et que le staff du serveur support
approuve, sont enregistrés et **publiés** : ton identifiant Discord, ton pseudo
au moment de la fiche, et la raison écrite par la personne qui t'a proposé.

Sont enregistrés **sans être publiés** : qui t'a proposé, depuis quel serveur,
et qui a approuvé.

Rien n'est publié automatiquement : un humain lit chaque proposition et décide.
Une fiche peut être retirée — le message public est alors effacé aussi. Si tu
penses être sur la liste à tort, écris à l'adresse en bas de page ou passe par
le serveur support.

### Ce qui n'est jamais enregistré

- Le contenu des messages ordinaires. Le bot les lit au passage pour compter
  l'XP et faire tourner l'automod, puis les oublie immédiatement. Ils ne sont
  écrits nulle part.
- Les messages privés.
- Les conversations vocales. Seule la **durée** passée en vocal est comptée.
- Ton adresse e-mail, ton adresse IP, ton vrai nom, ton pays.
- Rien n'est vendu, loué, ni transmis à qui que ce soit.

---

## 2. Combien de temps

| Situation | Ce qui se passe |
|---|---|
| **Le bot est retiré d'un serveur** | **Toutes** les données de ce serveur sont effacées immédiatement et définitivement. Aucune copie n'est gardée. |
| Tu quittes un serveur où le bot reste | Ton XP et ton solde restent, pour que tu les retrouves si tu reviens. Tu peux demander leur effacement (voir plus bas). |
| Statistiques d'activité | Effacées automatiquement au bout de quelques mois. |
| Photographies de la structure du serveur | Les dix dernières seulement, et uniquement si le serveur a activé la fonction (elle est désactivée par défaut). |

---

## 3. Où c'est stocké

Dans un fichier de base de données, sur la machine qui fait tourner le bot.
Cette machine est celle de l'auteur du bot, pas un service tiers. Personne
d'autre n'y a accès.

Le bot appelle des services extérieurs **uniquement** pour les annonces
automatiques qu'un serveur a configurées lui-même : Twitch, YouTube,
Instagram, TikTok, ou une adresse de flux RSS. Ces appels demandent
« y a-t-il du nouveau ? » et n'envoient aucune donnée de membre.

---

## 4. Faire effacer tes données

Trois façons, au choix :

1. **Toi, pour toi** — `/global effacer` remet à zéro ton compteur d'XP global,
   celui qui ne dépend d'aucun serveur.

   La commande `/confidentialite effacer` efface ce que le
   bot sait de toi sur le serveur où tu la lances : XP, niveau, monnaie,
   objets, statistiques, tickets, suggestions, candidatures, date
   d'anniversaire et participations aux concours.

   **Trois exceptions : les sanctions, les signalements et les fiches de la
   blocklist.** Les fiches concernent une liste partagée entre serveurs : leur
   retrait passe par le staff du serveur support, pas par la personne visée.

   **Les sanctions et les signalements.** Ils ne décrivent
   pas ta personne, ils décrivent le travail de modération du serveur — qui a
   averti qui, et pourquoi. Si chacun pouvait les effacer d'une commande,
   l'historique du staff ne vaudrait plus rien. Un modérateur du serveur peut
   les retirer.
2. **Un administrateur, pour tout le serveur** — retirer le bot du serveur
   suffit : tout part avec lui.
3. **Par écrit** — à l'adresse ci-dessous. Réponse sous 30 jours.

Pour voir ce qui est enregistré avant de décider : `/confidentialite voir`.

---

## 5. Les mineurs

Discord interdit son service aux moins de 13 ans, ou à l'âge minimum légal du
pays quand il est plus élevé. Blueprint ne demande l'âge de personne et n'a
aucun moyen de le vérifier. La seule commande qui touche à une date de
naissance, `/anniversaire`, se contente d'un jour et d'un mois : elle ne permet
pas de déduire un âge. Si tu penses qu'un enfant a des données enregistrées,
écris-nous : elles seront effacées.

---

## 6. Changements

Ce document peut évoluer. La date en haut indique la dernière modification.
Un changement important sera annoncé sur le serveur de support.

---

## 7. Contact

**À REMPLIR avant de publier ce document :**

- E-mail de contact : `<ton adresse>`
- Serveur de support : `<ton invitation Discord>`

Discord exige une adresse de contact valide pour vérifier une application.
