@echo off
setlocal
title Nocturne installer
echo.
echo   NOCTURNE - Windows app installer
echo   ---------------------------------
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Install-Nocturne.ps1" %*
echo.
pause
