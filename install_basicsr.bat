@echo off
chcp 65001 >nul
cd /d "%~dp0"
REM 僅安裝 basicsr，供 install_cpu.bat / install_gpu.bat 呼叫
REM 使用前必須已有 venv\Scripts\python.exe

if not exist "venv\Scripts\python.exe" (
    echo   [ERROR] install_basicsr.bat 需要先有虛擬環境，請先執行 install_cpu.bat 或 install_gpu.bat。
    exit /b 1
)

"venv\Scripts\python.exe" -m pip install --upgrade pip setuptools wheel -q
echo   正在安裝 basicsr（先試預編譯版 1.3.3，再試編譯安裝）...
"venv\Scripts\python.exe" -m pip install basicsr==1.3.3
if errorlevel 1 (
    echo   改試 basicsr（--no-build-isolation）...
    "venv\Scripts\python.exe" -m pip install basicsr --no-build-isolation
    if errorlevel 1 exit /b 1
)
exit /b 0
