@echo off
cd /d "%~dp0"

:: Erst mit -File probieren, bei Fehler mit -Command
powershell.exe -ExecutionPolicy Bypass -NoProfile -File "%~dp0start.ps1"
if %ERRORLEVEL% NEQ 0 (
    powershell.exe -ExecutionPolicy Bypass -NoProfile -Command "& { Set-Location '%~dp0'; . '%~dp0start.ps1' }"
)