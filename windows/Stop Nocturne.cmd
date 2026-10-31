@echo off
setlocal
title Stop Nocturne
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Stop-Nocturne.ps1" %*
echo.
pause
