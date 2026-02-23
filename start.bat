@echo off
chcp 65001 >nul
echo.
echo   ============================================
echo    AI Image ^& Video Upscaler v3.1
echo   ============================================
echo.

cd /d "%~dp0"

for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":8000.*LISTENING" 2^>nul') do (
    echo   [!] Port 8000 is in use, releasing...
    taskkill /F /PID %%a >nul 2>&1
    timeout /t 2 /nobreak >nul
    echo   [OK] Port 8000 released
)

set "PYTHON="

if exist "venv\Scripts\python.exe" (
    set "PYTHON=venv\Scripts\python.exe"
)

if defined PYTHON (
    echo   [OK] Python: %PYTHON%
    echo   [OK] Virtual environment ready
) else (
    where python >nul 2>&1
    if not errorlevel 1 (
        set "PYTHON=python"
    )
)

if not defined PYTHON (
    echo   [ERROR] Python not found!
    echo   Download from https://www.python.org/downloads/
    pause
    exit /b 1
)

if not exist "venv\Scripts\python.exe" (
    echo   [1/2] Creating virtual environment...
    "%PYTHON%" -m venv venv
    if errorlevel 1 (
        echo   [ERROR] Failed to create venv
        pause
        exit /b 1
    )
    set "PYTHON=venv\Scripts\python.exe"
    echo   [1/2] Done
    echo   [2/2] Installing dependencies...
    "venv\Scripts\python.exe" -m pip install --upgrade pip -q
    "venv\Scripts\python.exe" -m pip install torch torchvision --index-url https://download.pytorch.org/whl/cu128 -q
    "venv\Scripts\python.exe" -m pip install -r requirements.txt -q
    echo   [2/2] Done
)

echo.
echo   ============================================
echo    Open browser: http://localhost:8000
echo.
echo    Stop server:
echo      1. Press Ctrl+C here
echo      2. Close this window
echo.
echo    NOTE: Closing browser does NOT stop server
echo   ============================================
echo.

"%PYTHON%" app.py

echo.
echo   ============================================
echo    Server stopped.
echo    Run start.bat again to restart.
echo   ============================================
echo.
pause
