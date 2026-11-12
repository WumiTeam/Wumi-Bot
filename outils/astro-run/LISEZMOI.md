# Astro Run dans Wumi

Le jeu compilé est dans `src/public/astro/` (servi par le serveur public de Wumi sous `/astro/`).
`source-astro-run.tgz` contient le code source (Phaser + TypeScript) avec les retouches Wumi :

- `src/discord/discord.ts` : identifiant de l'application lu sur `/api/config`, code échangé sur `/astro/api/token` ;
- `src/net/setup.ts` et `src/net/api.ts` : API sous `/.proxy/astro`, en-têtes `X-Wumi-Guild` / `X-Wumi-Channel`.

Recompiler (sans Vite) :

```
tar xzf source-astro-run.tgz && npm install
mkdir web && cp -r public/* web/
bun build src/main.ts --outdir web --target browser --minify \
  --define 'import.meta.env.DEV=false' --define 'import.meta.env.VITE_DISCORD_CLIENT_ID=""'
sed 's#/src/main.ts#./main.js#' index.html > web/index.html
# puis remplacer src/public/astro/ par web/
```
