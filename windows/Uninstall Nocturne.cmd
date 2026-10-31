@echo off
setlocal
title Nocturne uninstaller
echo.
echo   NOCTURNE - Windows uninstaller
echo   -------------------------------
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Uninstall-Nocturne.ps1" %*
echo.
pause
