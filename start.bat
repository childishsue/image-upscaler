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
    echo   [ERROR] Virtual environment not found.
    echo   Please run install_gpu.bat or install_cpu.bat first.
    echo.
    pause
    exit /b 1
)

echo   Checking dependencies...
"%PYTHON%" -c "import fastapi, uvicorn" 2>nul
if errorlevel 1 (
    echo   [ERROR] Dependencies missing or broken.
    echo   Please run install_gpu.bat or install_cpu.bat first.
    echo.
    pause
    exit /b 1
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
if errorlevel 1 (
    echo   ============================================
    echo    [ERROR] Program exited with error.
    echo    Please scroll up to see the error message,
    echo    take a screenshot, then press any key.
    echo   ============================================
) else (
    echo   ============================================
    echo    Server stopped.
    echo    Run start.bat again to restart.
    echo   ============================================
)
echo.
pause
