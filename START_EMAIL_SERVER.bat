@echo off
chcp 65001 >nul
title Bentoks Investments - Email API Server
color 1F

echo.
echo ╔══════════════════════════════════════════════════════════════╗
echo ║       BENTOKS INVESTMENTS - EMAIL API SERVER                 ║
echo ╚══════════════════════════════════════════════════════════════╝
echo.

cd /d "%~dp0server"

echo [1/2] Checking dependencies...
if not exist "node_modules" (
    echo Installing dependencies first, please wait...
    call npm install
)

echo.
echo [2/2] Starting server...
echo.
echo Server will be running at:  http://localhost:3000
echo Website at:                 http://localhost:3000/index.html
echo.
echo Press Ctrl+C to stop the server
echo.

call node server.js

pause
