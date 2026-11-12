#!/usr/bin/env bash
# Installe (ou met a jour) Lavalink pour la musique de Wumi, SANS sudo :
#   - un Java 21 portable dans ~/lavalink/java ;
#   - le dernier Lavalink.jar ;
#   - application.yml (ecoute seulement sur 127.0.0.1) avec le plugin YouTube
#     officiel (youtube-source) a sa derniere version, et l'OAuth YouTube :
#     au premier lancement, « pm2 logs lavalink » affiche un code a entrer sur
#     google.com/device (compte Google SECONDAIRE). Le jeton obtenu va dans le
#     .env (YOUTUBE_REFRESH_TOKEN=...) puis on relance ce script ;
#   - LAVALINK_URL et LAVALINK_PASSWORD ajoutes au .env s'ils n'y sont pas ;
#   - Lavalink lance par pm2 sous le nom « lavalink ».
#
# Usage, depuis le dossier du bot :  bash outils/installer-lavalink.sh
# Relancer le script met Lavalink a jour sans changer le mot de passe.
set -euo pipefail

DIR="$HOME/lavalink"
BOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV="$BOT/.env"
mkdir -p "$DIR"
cd "$DIR"

case "$(uname -m)" in
  x86_64) ARCH=x64 ;;
  aarch64|arm64) ARCH=aarch64 ;;
  *) echo "Architecture non prise en charge : $(uname -m)"; exit 1 ;;
esac

if [ ! -x "$DIR/java/bin/java" ]; then
  echo "== Telechargement de Java 21 ($ARCH)…"
  curl -fsSL --retry 3 -o java.tar.gz "https://api.adoptium.net/v3/binary/latest/21/ga/linux/$ARCH/jre/hotspot/normal/eclipse"
  rm -rf java && mkdir java
  tar -xzf java.tar.gz -C java --strip-components=1
  rm -f java.tar.gz
fi
"$DIR/java/bin/java" -version 2>&1 | head -1

echo "== Telechargement de Lavalink…"
curl -fsSL --retry 3 -o Lavalink.jar.new "https://github.com/lavalink-devs/Lavalink/releases/latest/download/Lavalink.jar"
mv Lavalink.jar.new Lavalink.jar

echo "== Version du plugin YouTube…"
# La derniere version publiee (1.18.2) a un client TV casse (« The page needs
# to be reloaded ») : on prend la derniere version de developpement, qui a le
# correctif. YOUTUBE_PLUGIN=... dans le .env force une version precise.
YT="$(grep -E '^YOUTUBE_PLUGIN=.+' "$ENV" 2>/dev/null | head -1 | cut -d= -f2- || true)"
if [ -z "$YT" ]; then
  YT="$(curl -fsSL --retry 3 https://maven.lavalink.dev/snapshots/dev/lavalink/youtube/youtube-plugin/maven-metadata.xml | grep -oE '<version>[^<]+' | tail -1 | sed 's/<version>//' || true)"
fi
if [ -z "$YT" ]; then echo "Impossible de trouver la version du plugin YouTube."; exit 1; fi
if [[ "$YT" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then SNAP=false; else SNAP=true; fi
echo "   youtube-plugin $YT"
CIPHER="$(grep -E '^YOUTUBE_CIPHER_URL=.+' "$ENV" 2>/dev/null | head -1 | cut -d= -f2- || true)"
CIPHER="${CIPHER:-https://cipher.kikkia.dev/}"

touch "$ENV"
# Jeton OAuth YouTube (compte Google secondaire), s'il a deja ete obtenu.
YTOK="$(grep -E '^YOUTUBE_REFRESH_TOKEN=.+' "$ENV" | head -1 | cut -d= -f2- || true)"
if [ -n "$YTOK" ]; then OAUTH_TOKEN="      refreshToken: \"$YTOK\""; else OAUTH_TOKEN=""; fi
MDP="$(grep -E '^LAVALINK_PASSWORD=.+' "$ENV" | head -1 | cut -d= -f2- || true)"
if [ -z "$MDP" ]; then
  MDP="$(head -c 48 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c 32)"
  sed -i '/^LAVALINK_PASSWORD=/d;/^LAVALINK_URL=/d' "$ENV"
  printf '\n# Musique (Lavalink, installe par outils/installer-lavalink.sh)\nLAVALINK_URL=http://127.0.0.1:2333\nLAVALINK_PASSWORD=%s\n' "$MDP" >> "$ENV"
  echo "== Mot de passe Lavalink ajoute au .env"
fi

cat > application.yml <<EOF
server:
  port: 2333
  address: 127.0.0.1
plugins:
  youtube:
    enabled: true
    allowSearch: true
    allowDirectVideoIds: true
    allowDirectPlaylistIds: true
    # YouTube demande souvent une connexion : le client TV + OAuth (compte
    # Google secondaire) lit la musique ; MUSIC sert a la recherche.
    oauth:
      enabled: true
$OAUTH_TOKEN
    # Le dechiffrage des signatures YouTube change souvent : un service
    # distant s'en charge (YOUTUBE_CIPHER_URL dans le .env pour en changer).
    remoteCipher:
      url: "$CIPHER"
      password: ""
    clients:
      - MUSIC
      - TV
      - ANDROID_VR
      - WEB
      - WEBEMBEDDED
lavalink:
  plugins:
    - dependency: "dev.lavalink.youtube:youtube-plugin:$YT"
      snapshot: $SNAP
  server:
    password: "$MDP"
    sources:
      youtube: false
      bandcamp: true
      soundcloud: true
      twitch: true
      vimeo: true
      nico: false
      http: true
      local: false
    filters:
      volume: true
      equalizer: true
      karaoke: true
      timescale: true
      tremolo: true
      vibrato: true
      distortion: true
      rotation: true
      channelMix: true
      lowPass: true
    bufferDurationMs: 400
    frameBufferDurationMs: 5000
    opusEncodingQuality: 10
    resamplingQuality: LOW
    trackStuckThresholdMs: 10000
    useSeekGhosting: true
    playerUpdateInterval: 5
    youtubeSearchEnabled: false
    soundcloudSearchEnabled: true
    gc-warnings: true
metrics:
  prometheus:
    enabled: false
logging:
  file:
    path: ./logs/
  level:
    root: INFO
    lavalink: INFO
EOF

echo "== Demarrage avec pm2…"
pm2 delete lavalink >/dev/null 2>&1 || true
pm2 start "$DIR/java/bin/java" --name lavalink --cwd "$DIR" --interpreter none -- -Xmx512M -jar Lavalink.jar >/dev/null
pm2 save >/dev/null

for i in $(seq 1 60); do
  if V="$(curl -fs -H "Authorization: $MDP" http://127.0.0.1:2333/version)"; then
    echo "== Lavalink $V pret."
    exit 0
  fi
  sleep 3
done
echo "Lavalink ne repond pas encore : regarde « pm2 logs lavalink »."
exit 1
