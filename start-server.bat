@echo off
title T7 BILL PRO - Local Wi-Fi Waiter Server

echo ========================================================
echo        T7 BILL PRO - LOCAL WI-FI WAITER SERVER
echo ========================================================
echo.

:: Check if Node.js is installed
node -v >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not installed!
    echo Please download and install Node.js from https://nodejs.org/
    echo After installing, restart this script.
    echo.
    pause
    exit /b
)

echo [OK] Node.js is installed.
echo Starting the local server...
echo.

:: Open default browser to localhost
start http://localhost:3000

:: Start the Node.js server
node server.js

:: If the server crashes or closes, pause so the user can see the error
echo.
echo [ERROR] The server stopped unexpectedly. Check the error message above.
pause
