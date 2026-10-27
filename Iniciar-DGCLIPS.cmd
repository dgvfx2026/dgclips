@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Instale Node.js 22 ou 24 para usar este inicializador.
  pause
  exit /b 1
)
node scripts\local-start.mjs %*
if errorlevel 1 (
  echo.
  pause
  exit /b 1
)
