@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo.
echo Deploiement des commandes...
echo.
node src/deploy-commands.js --tout
echo.
echo ---------------------------------------------
echo Termine. Fais Ctrl+R dans Discord.
echo.
pause
