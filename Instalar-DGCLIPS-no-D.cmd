@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 22 ou 24 precisa estar instalado.
  pause
  exit /b 1
)
node scripts\install-local-windows.mjs
echo.
pause
