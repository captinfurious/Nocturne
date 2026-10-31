@echo off
setlocal
title Nocturne
set "NOCTURNE_SOURCE=%~dp0"

if not exist "%LOCALAPPDATA%\Programs\Nocturne\Nocturne.exe" goto install

powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "try { $i = Get-Content (Join-Path $env:LOCALAPPDATA 'Programs\Nocturne\install.json') -Raw | ConvertFrom-Json; $p = Get-Content (Join-Path $env:NOCTURNE_SOURCE 'package.json') -Raw | ConvertFrom-Json; if ($i.version -ne $p.version) { exit 10 } } catch { exit 10 }"
if errorlevel 10 goto install

start "" "%LOCALAPPDATA%\Programs\Nocturne\Nocturne.exe"
exit /b 0

:install
echo.
echo   NOCTURNE - first-time setup / update
echo   ------------------------------------
echo   This installs Nocturne for your Windows account and opens it.
echo   You do not need to install Node.js separately.
echo.
call "%~dp0windows\Install Nocturne.cmd" %*
exit /b %errorlevel%
