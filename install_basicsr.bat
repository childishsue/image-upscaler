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
REM realesrgan 需要 basicsr 1.4.x API（如 circular_lowpass_kernel）；優先試 1.4.2，失敗再試 1.3.3
echo   正在安裝 basicsr（先試 1.4.2 以符合 realesrgan，再試 1.3.3 輪子）...
"venv\Scripts\python.exe" -m pip install basicsr==1.4.2 --no-build-isolation
if errorlevel 1 (
    echo   改試 basicsr 1.3.3（預編譯輪子）...
    "venv\Scripts\python.exe" -m pip install basicsr==1.3.3
    if errorlevel 1 (
        echo   改試 basicsr（--no-build-isolation）...
        "venv\Scripts\python.exe" -m pip install basicsr --no-build-isolation
        if errorlevel 1 exit /b 1
    )
)
REM 寫入已安裝版本，供 install_cpu/gpu.bat 做約束檔
"venv\Scripts\python.exe" -c "import basicsr; open('basicsr_version.txt','w').write(basicsr.__version__)"
exit /b 0
