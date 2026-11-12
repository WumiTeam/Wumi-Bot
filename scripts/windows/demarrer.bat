@echo off
REM ============================================================
REM  Demarre le bot Zhaak et le relance automatiquement s'il plante.
REM  Double-clique sur ce fichier, ou place un raccourci vers lui
REM  dans le dossier Demarrage de Windows (voir le README).
REM ============================================================
title Bot Zhaak
cd /d "%~dp0"

REM Dit au bot qu'il sera relance automatiquement : le bouton "Redemarrer"
REM du panneau de controle s'appuie dessus pour savoir s'il peut proposer.
set ZHAAK_SUPERVISEUR=demarrer.bat

:boucle
echo.
echo [%date% %time%] Demarrage du bot...
node src/index.js
echo.
echo [%date% %time%] Le bot s'est arrete (code %errorlevel%). Relance dans 10 secondes...
echo Ferme cette fenetre pour arreter definitivement.
timeout /t 10 /nobreak >nul
goto boucle
