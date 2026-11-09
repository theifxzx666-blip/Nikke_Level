@echo off
chcp 65001 >nul
title NIKKE calculator - Pinkuro relay (LEGACY)
rem 2026-11-09: 阿卡导入已改官方接口 getUserInfo 直连（服务端带 CORS 头），
rem 本脚本依赖的 pinkuro_server.py 已废弃，仅在旧版本/离线调试时需要。
cd /d "%~dp0"

set PORT=8785
set URL=http://127.0.0.1:%PORT%/combat_power_beta/

netstat -ano | findstr ":%PORT% " | findstr "LISTENING" >nul
if not errorlevel 1 goto ALREADY

echo.
echo   Starting local Pinkuro relay on port %PORT% ...
echo   The calculator page will open by itself in a moment.
echo   Keep this window OPEN. Press Ctrl+C to stop.
echo.

set PY=python
where py >nul 2>nul && set PY=py -3
%PY% pinkuro_server.py --open --port %PORT%
goto END

:ALREADY
echo.
echo   Relay is already running - opening the calculator page.
echo.
start "" "%URL%"
goto END

:END
echo.
if not "%1"=="quiet" pause
