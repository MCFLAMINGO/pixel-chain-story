@echo off
REM Pixel crowned mirror — double-click on Windows. One Earth only (f1d193… / 20553).
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-mirror.ps1"
if errorlevel 1 pause
