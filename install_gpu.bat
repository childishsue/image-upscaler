@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo.
echo   =========================================
echo     安裝 GPU 版本 (NVIDIA CUDA)
echo   =========================================
echo.

:: 尋找 Python
set PYTHON=
for %%P in (
    "%LOCALAPPDATA%\Programs\Python\Python311\python.exe"
    "%LOCALAPPDATA%\Programs\Python\Python312\python.exe"
    "%LOCALAPPDATA%\Programs\Python\Python310\python.exe"
) do (
    if exist %%P (
        set "PYTHON=%%~P"
        goto :found
    )
)
where python >nul 2>&1
if not errorlevel 1 ( set PYTHON=python& goto :found )
echo   [錯誤] 找不到 Python，請先安裝 Python 3.10+
pause & exit /b 1

:found
echo   [OK] Python: %PYTHON%

if not exist "venv" (
    echo   [1/3] 建立虛擬環境...
    "%PYTHON%" -m venv venv
)

echo   [2/3] 安裝 PyTorch GPU 版本 (CUDA 12.8)...
"venv\Scripts\python.exe" -m pip install --upgrade pip -q
"venv\Scripts\python.exe" -m pip install torch torchvision --index-url https://download.pytorch.org/whl/cu128

echo   [3/3] 安裝其他依賴...
"venv\Scripts\python.exe" -m pip install -r requirements.txt

echo.
echo   =========================================
echo     安裝完成！請執行 start.bat 啟動服務
echo   =========================================
pause
