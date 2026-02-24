@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo.
echo   =========================================
echo     Install GPU version (NVIDIA CUDA)
echo   =========================================
echo.
echo   建議使用 Python 3.11 或 3.12，可減少安裝與執行錯誤。
echo   若使用 3.10 或較新版本（如 3.14）可能需額外排查。
echo.

set "PYTHON="
if exist "venv\Scripts\python.exe" (
    set "PYTHON=venv\Scripts\python.exe"
)
if not defined PYTHON (
    for %%P in (
        "%LOCALAPPDATA%\Programs\Python\Python311\python.exe"
        "%LOCALAPPDATA%\Programs\Python\Python312\python.exe"
        "%LOCALAPPDATA%\Programs\Python\Python310\python.exe"
    ) do (
        if exist %%P set "PYTHON=%%~P"
    )
)
if not defined PYTHON (
    where python >nul 2>&1
    if not errorlevel 1 set "PYTHON=python"
)

if not defined PYTHON (
    echo   [ERROR] 安裝失敗：未偵測到 Python。
    echo.
    echo   原因：您的電腦尚未安裝 Python，或未加入系統 PATH。
    echo   請先安裝 Python 3.10 以上後再執行本安裝程式：
    echo     https://www.python.org/downloads/
    echo   安裝時務必勾選「Add Python to PATH」。
    echo.
    pause
    exit /b 1
)

echo   [OK] Python: %PYTHON%

if not exist "venv" (
    echo   [1/3] Creating virtual environment...
    "%PYTHON%" -m venv venv
    if errorlevel 1 (
        echo   [ERROR] 建立虛擬環境失敗。
        echo.
        echo   可能原因：未安裝 Python 或安裝不完整。
        echo   請先安裝 Python 3.10+：https://www.python.org/downloads/
        echo   安裝時勾選「Add Python to PATH」，不要用市集版。
        echo   安裝完成後關閉此視窗，再執行一次 install_gpu.bat。
        echo.
        pause
        exit /b 1
    )
)

echo   [2/3] Installing PyTorch GPU (CUDA 12.8)...
"venv\Scripts\python.exe" -m pip install --upgrade pip -q
"venv\Scripts\python.exe" -m pip install torch torchvision --index-url https://download.pytorch.org/whl/cu128
if errorlevel 1 (
    echo   [ERROR] PyTorch 安裝失敗，請檢查網路連線。
    pause
    exit /b 1
)

echo   [3/3] 安裝其他套件（basicsr 由獨立腳本安裝）...
call "%~dp0install_basicsr.bat"
if errorlevel 1 (
    echo   [ERROR] basicsr 安裝失敗。
    echo.
    echo   請檢查網路後，再執行一次 install_gpu.bat。
    echo.
    pause
    exit /b 1
)

REM 只檢查「行首為 basicsr」的套件行，不把註解裡含 basicsr 的當成舊版
findstr /B /C:"basicsr" requirements.txt >nul 2>&1
if not errorlevel 1 (
    echo   [ERROR] requirements.txt 為舊版且內含 basicsr 套件，會導致後續安裝失敗。
    echo   請向提供軟體的人索取最新的 requirements.txt 覆蓋此資料夾的檔案。
    echo.
    pause
    exit /b 1
)

REM realesrgan / gfpgan 從原始碼建置會失敗；改為只裝輪子 --no-deps。先裝 gfpgan 再裝 facexlib，避免 pip 報「realesrgan 需要 gfpgan 未安裝」
echo   安裝 realesrgan 0.2.9（輪子）...
"venv\Scripts\python.exe" -m pip install realesrgan==0.2.9 --no-deps
if errorlevel 1 (
    echo   [ERROR] realesrgan 安裝失敗。請檢查網路後再執行一次 install_gpu.bat。
    pause
    exit /b 1
)
echo   安裝 gfpgan 1.3.8（輪子）...
"venv\Scripts\python.exe" -m pip install gfpgan==1.3.8 --no-deps
if errorlevel 1 (
    echo   [ERROR] gfpgan 安裝失敗。請檢查網路後再執行一次 install_gpu.bat。
    pause
    exit /b 1
)
echo   安裝 facexlib（gfpgan 執行時需要）...
"venv\Scripts\python.exe" -m pip install facexlib
if errorlevel 1 (
    echo   [WARN] facexlib 安裝失敗，將繼續；若啟動失敗請再執行 install_gpu.bat。
)
REM 其餘套件：清單排除 torch、realesrgan、gfpgan，並約束 basicsr 為 install_basicsr 裝的版本
findstr /V /C:"torch" requirements.txt > requirements_gpu_temp.txt 2>nul
findstr /V /B /C:"realesrgan" requirements_gpu_temp.txt > requirements_gpu_rest.txt 2>nul
move /y requirements_gpu_rest.txt requirements_gpu_temp.txt >nul 2>&1
findstr /V /B /C:"gfpgan" requirements_gpu_temp.txt > requirements_gpu_rest.txt 2>nul
move /y requirements_gpu_rest.txt requirements_gpu_temp.txt >nul 2>&1
set /p BSRVER=<basicsr_version.txt 2>nul
if not defined BSRVER set BSRVER=1.3.3
echo basicsr==%BSRVER% > constraints_basicsr.txt 2>nul
"venv\Scripts\python.exe" -m pip install -r requirements_gpu_temp.txt -c constraints_basicsr.txt
if errorlevel 1 (
    del requirements_gpu_temp.txt 2>nul
    del constraints_basicsr.txt 2>nul
    echo   [ERROR] 其餘套件安裝失敗。
    echo.
    echo   請檢查網路後，再執行一次 install_gpu.bat。
    echo.
    pause
    exit /b 1
)
del requirements_gpu_temp.txt 2>nul
del constraints_basicsr.txt 2>nul
del basicsr_version.txt 2>nul

echo.
echo   =========================================
echo     安裝完成。請雙擊 start.bat 啟動程式。
echo   =========================================
echo.
pause
