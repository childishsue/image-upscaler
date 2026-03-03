"""
===============================================================================
  AI Image & Video Upscaler v3.1 - 圖片 & 影片超解析度提升工具
  使用 Real-ESRGAN 深度學習模型
  - 圖片：放大至 2K / 4K，支援批量處理
  - 影片：放大至 720P / 1080P / 2K / 4K (逐幀 AI 處理)
===============================================================================

  技術架構：
  - 後端框架：FastAPI (Python 非同步 Web 框架)
  - AI 模型：Real-ESRGAN (x2plus / x4plus)
  - GPU 加速：PyTorch + CUDA 12.8 (支援 RTX 50 系列 Blackwell 架構)
  - 圖片處理：OpenCV (cv2)
  - 影片處理：FFmpeg (拆幀 / 合成 / 音訊複製)

  API 端點 (圖片)：
  - POST /api/upload                 → 單張圖片上傳 & 處理
  - POST /api/batch-upload           → 批量圖片上傳 & 處理
  - GET  /api/progress/{task_id}     → 查詢處理進度
  - GET  /api/batch-progress/{id}    → 查詢批量處理進度
  - GET  /api/download/{task_id}     → 下載處理結果
  - GET  /api/batch-download/{id}    → 下載批量結果 (ZIP)

  API 端點 (影片)：
  - POST /api/video/upload           → 單部影片上傳 & 處理
  - POST /api/video/batch-upload     → 批量影片上傳 & 處理
  - GET  /api/video/progress/{id}    → 查詢影片處理進度
  - GET  /api/video/batch-progress/{id} → 查詢影片批量進度
  - GET  /api/video/download/{id}    → 下載處理後影片
  - GET  /api/video/batch-download/{id} → 下載影片批量結果 (ZIP)

  API 端點 (系統)：
  - GET  /api/history                → 取得最近完成的任務紀錄
  - DELETE /api/history              → 清除歷史紀錄
  - POST /api/cleanup                → 手動清除所有暫存檔案
  - GET  /api/ping                   → 伺服器存活檢測
===============================================================================
"""

# ===========================
#  標準函式庫匯入
# ===========================
import os
import sys
import uuid          # 產生唯一任務 ID
import time
import zipfile       # 批量下載 ZIP 打包
import asyncio
import warnings
import threading     # process_lock 用於確保模型不被同時呼叫
import subprocess    # 呼叫 FFmpeg 處理影片
from pathlib import Path
from typing import Optional, List

# ===========================
#  修復 basicsr 與新版 torchvision 的相容性問題
#  (basicsr 1.4.2 使用了已在新版 torchvision 中移除的 functional_tensor 模組)
#  解法：建立一個假的模組，將舊的 import 路徑指向新的位置
# ===========================
import importlib
import types

import torch
import torchvision

if not hasattr(torchvision.transforms, 'functional_tensor'):
    try:
        from torchvision.transforms import functional as _F
        _fake_module = types.ModuleType('torchvision.transforms.functional_tensor')
        _fake_module.rgb_to_grayscale = _F.rgb_to_grayscale
        sys.modules['torchvision.transforms.functional_tensor'] = _fake_module
    except Exception:
        pass

# 抑制 CUDA 相容性警告 (某些 PyTorch 版本對較新 GPU 會發出警告但仍可運作)
warnings.filterwarnings("ignore", message=".*NVIDIA.*not compatible.*")
warnings.filterwarnings("ignore", message=".*cuda capability.*")
warnings.filterwarnings("ignore", message=".*Please install PyTorch.*")

# ===========================
#  第三方函式庫匯入
# ===========================
import cv2
import numpy as np
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, BackgroundTasks, Query
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from fastapi.requests import Request
from fastapi.responses import FileResponse, JSONResponse, Response
from basicsr.archs.rrdbnet_arch import RRDBNet   # Real-ESRGAN 使用的 RRDB 網路架構
from realesrgan import RealESRGANer               # Real-ESRGAN 推論封裝

# ===========================
#  FastAPI 應用程式初始化
# ===========================
import json
import shutil
from contextlib import asynccontextmanager


# =====================================================================
#  歷史任務紀錄 (持久化)
#  將完成的任務寫入 history.json，讓使用者重開瀏覽器後仍能下載結果
#  使用者可從網頁 UI 手動清除
# =====================================================================
HISTORY_FILE = Path("history.json")


def load_history() -> list:
    """載入歷史紀錄"""
    if HISTORY_FILE.exists():
        try:
            with open(HISTORY_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return []
    return []


def save_history(history: list):
    """儲存歷史紀錄"""
    try:
        with open(HISTORY_FILE, "w", encoding="utf-8") as f:
            json.dump(history, f, ensure_ascii=False, indent=2)
    except Exception:
        pass


def add_to_history(task_id: str, task_type: str, original_name: str, result: dict):
    """
    將完成的任務加入歷史紀錄
    task_type: 'image' 或 'video'
    """
    history = load_history()
    history.append({
        "task_id": task_id,
        "type": task_type,
        "original_name": original_name,
        "result": result,
        "timestamp": time.time(),
    })
    # 只保留最近 50 筆
    if len(history) > 50:
        history = history[-50:]
    save_history(history)


def cleanup_expired_history():
    """清理 output 檔案已不存在的歷史紀錄"""
    history = load_history()
    valid = []
    for entry in history:
        filename = entry.get("result", {}).get("filename", "")
        if filename and (OUTPUT_DIR / filename).exists():
            valid.append(entry)
    if len(valid) != len(history):
        save_history(valid)
    return valid


# =====================================================================
#  手動清理機制
#  使用者可從網頁 UI 手動清除暫存檔案，伺服器關閉時不會自動刪除
# =====================================================================
def cleanup_temp_directories():
    """清除 uploads/、outputs/、temp_frames/ 及歷史紀錄"""
    cleaned = 0
    for directory in [Path("uploads"), Path("outputs")]:
        if directory.exists():
            for file_path in directory.iterdir():
                if file_path.is_file():
                    try:
                        file_path.unlink()
                        cleaned += 1
                    except Exception:
                        pass
    # 清理影片拆幀暫存目錄
    temp_dir = Path("temp_frames")
    if temp_dir.exists():
        for sub in temp_dir.iterdir():
            if sub.is_dir():
                shutil.rmtree(str(sub), ignore_errors=True)
                cleaned += 1
    # 清除歷史紀錄
    if HISTORY_FILE.exists():
        try:
            HISTORY_FILE.unlink()
            cleaned += 1
        except Exception:
            pass
    return cleaned


@asynccontextmanager
async def lifespan(app):
    """FastAPI 生命週期管理"""
    yield
    print("\n" + "=" * 58)
    print("  伺服器已停止")
    print("=" * 58)


app = FastAPI(title="AI Image & Video Upscaler", version="3.1.0", lifespan=lifespan)

# ===========================
#  安全性：CORS 設定
#  僅允許本機存取，防止外部網站跨域呼叫 API
# ===========================
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request as StarletteRequest
from starlette.responses import Response as StarletteResponse

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:8000", "http://127.0.0.1:8000"],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """
    安全性：為所有回應加入防護 HTTP 標頭
    - X-Content-Type-Options: 防止 MIME Sniffing 攻擊
    - X-Frame-Options: 防止 Clickjacking 點擊劫持攻擊
    - X-XSS-Protection: 啟用瀏覽器內建 XSS 過濾
    - Referrer-Policy: 防止 Referer 標頭洩漏敏感 URL
    """
    async def dispatch(self, request: StarletteRequest, call_next):
        response: StarletteResponse = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        return response


app.add_middleware(SecurityHeadersMiddleware)

# 掛載靜態資源 (CSS, JS) 和 Jinja2 HTML 模板引擎
app.mount("/static", StaticFiles(directory="static"), name="static")
templates = Jinja2Templates(directory="templates")

# ===========================
#  目錄設定
#  - uploads/  : 暫存使用者上傳的原始圖片
#  - outputs/  : 存放 AI 處理後的圖片及 ZIP
#  - weights/  : AI 模型權重檔 (.pth)，首次使用自動從 GitHub 下載
# ===========================
UPLOAD_DIR = Path("uploads")
OUTPUT_DIR = Path("outputs")
WEIGHTS_DIR = Path("weights")
UPLOAD_DIR.mkdir(exist_ok=True)
OUTPUT_DIR.mkdir(exist_ok=True)
WEIGHTS_DIR.mkdir(exist_ok=True)

# ===========================
#  全域設定常數
# ===========================
ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".bmp", ".tiff", ".tif"}  # 支援的圖片格式
# 轉檔專用：HEIC/HEIF、相機 RAW（需 pillow-heif / rawpy 才能轉成 JPG 等）
HEIC_EXTENSIONS = {".heic", ".heif", ".heics"}
RAW_EXTENSIONS = {
    ".dng", ".cr2", ".cr3", ".nef", ".nrw", ".arw", ".orf", ".rw2", ".pef", ".raf",
    ".raw", ".srw", ".3fr", ".erf", ".kdc", ".dcr", ".mrw", ".nef", ".nrwa",
}
CONVERT_ONLY_EXTENSIONS = HEIC_EXTENSIONS | RAW_EXTENSIONS  # 僅在「轉檔」時接受為輸入
MAX_FILE_SIZE = 20 * 1024 * 1024  # 單檔上限 20MB

# ===========================
#  影片相關常數
# ===========================
VIDEO_EXTENSIONS = {".mp4", ".mov", ".avi", ".mkv", ".webm", ".flv", ".wmv"}  # 支援的影片格式
MAX_VIDEO_SIZE = 500 * 1024 * 1024  # 影片單檔上限 500MB
TEMP_DIR = Path("temp_frames")      # 影片拆幀暫存目錄
TEMP_DIR.mkdir(exist_ok=True)

# 影片解析度對照表
VIDEO_RESOLUTIONS = {
    "720p":  (1280, 720),
    "1080p": (1920, 1080),
    "2k":    (2560, 1440),
    "4k":    (3840, 2160),
}

# 圖片解析度對照表（含 800×800、1K、2K、4K）
IMAGE_RESOLUTIONS = {
    "800":   (800, 800),
    "1k":    (1024, 1024),
    "2k":    (2560, 1440),
    "4k":    (3840, 2160),
}

# 圖片轉檔支援的輸出格式（副檔名 → OpenCV 寫入參數）
IMAGE_CONVERT_FORMATS = {".png": "png", ".jpg": "jpeg", ".jpeg": "jpeg", ".webp": "webp"}
# 影片轉檔支援的輸出格式
VIDEO_CONVERT_FORMATS = {".mp4": "mp4", ".webm": "webm", ".mkv": "mkv"}


def check_ffmpeg():
    """檢查系統是否已安裝 FFmpeg"""
    try:
        result = subprocess.run(
            ["ffmpeg", "-version"],
            capture_output=True, text=True, timeout=5
        )
        return result.returncode == 0
    except (FileNotFoundError, subprocess.TimeoutExpired):
        return False


_FFMPEG_OK = check_ffmpeg()

# ===========================
#  安全性：圖片魔術位元組 (Magic Bytes) 驗證
#  用於確認上傳的檔案確實是圖片，而非偽裝的惡意檔案
#  僅檢查副檔名是不夠的，攻擊者可將 .exe 改名為 .jpg
# ===========================
IMAGE_MAGIC_BYTES = {
    b'\xff\xd8\xff': 'jpeg',       # JPEG / JPG
    b'\x89PNG': 'png',             # PNG
    b'RIFF': 'webp',               # WebP (RIFF 開頭，需二次確認)
    b'BM': 'bmp',                  # BMP
    b'II': 'tiff',                 # TIFF (Little-endian)
    b'MM': 'tiff',                 # TIFF (Big-endian)
    b'GIF': 'gif',                 # GIF (以防未來支援)
}

def validate_image_magic_bytes(content: bytes) -> bool:
    """
    驗證檔案的前幾個位元組是否符合已知圖片格式的 Magic Bytes
    這是防止攻擊者上傳偽裝成圖片的惡意檔案的重要安全措施
    """
    if len(content) < 4:
        return False
    for magic, fmt in IMAGE_MAGIC_BYTES.items():
        if content[:len(magic)] == magic:
            # WebP 需要額外確認 (RIFF 開頭的檔案不一定是 WebP)
            if magic == b'RIFF' and len(content) >= 12:
                return content[8:12] == b'WEBP'
            return True
    return False


def sanitize_filename(filename: str) -> str:
    """
    清理檔名中的危險字元，防止路徑遍歷 (Path Traversal) 攻擊
    例如 "../../etc/passwd.jpg" 會被清理為 "etcpasswd.jpg"
    """
    import re
    # 取得檔名（移除路徑）
    name = Path(filename).name
    # 移除所有路徑分隔符和危險字元
    name = re.sub(r'[<>:"/\\|?*\x00-\x1f]', '', name)
    # 移除開頭的點和空格
    name = name.lstrip('. ')
    # 如果清理後為空，給一個預設名稱
    return name if name else "unnamed_image.jpg"

# ===========================
#  全域狀態變數
# ===========================
models_cache = {}       # 模型快取 {scale: RealESRGANer}，避免每次處理都重新載入模型
tasks_progress = {}     # 單張任務進度 {task_id: {status, progress, message, result}}
batch_progress = {}     # 批量任務進度 {batch_id: {status, total, completed, ...}}

# ===========================
#  安全性：任務記錄上限
#  防止長時間運行後記憶體無限增長 (記憶體洩漏)
#  當任務數超過上限時，自動清理最早的已完成任務
# ===========================
MAX_TASKS_IN_MEMORY = 200  # 最多保留 200 筆任務記錄

def cleanup_old_tasks():
    """
    當記憶體中的任務記錄超過上限時，清理已完成 / 已失敗的舊任務
    保留仍在處理中的任務不被清理
    """
    if len(tasks_progress) > MAX_TASKS_IN_MEMORY:
        removable = [
            tid for tid, tp in tasks_progress.items()
            if tp.get("status") in ("completed", "error")
        ]
        # 移除最早的一半
        for tid in removable[:len(removable) // 2]:
            tasks_progress.pop(tid, None)

    if len(batch_progress) > MAX_TASKS_IN_MEMORY // 10:
        removable = [
            bid for bid, bp in batch_progress.items()
            if bp.get("status") in ("completed",)
        ]
        for bid in removable[:len(removable) // 2]:
            batch_progress.pop(bid, None)

# 處理鎖：Real-ESRGAN 模型不支援同時處理多張，用 Lock 確保依序執行
process_lock = threading.Lock()


# =====================================================================
#  GPU 測試函數
#  啟動時實際測試 GPU 能否正常進行矩陣運算
#  (有些 GPU 能被偵測到但 CUDA kernel 不相容，會在實際運算時才報錯)
# =====================================================================
def check_gpu_actually_works():
    """實際測試 GPU 是否能正常運算 (不只是偵測到)"""
    if not torch.cuda.is_available():
        return False
    try:
        x = torch.randn(4, 4).cuda()
        _ = torch.matmul(x, x)
        del x, _
        torch.cuda.empty_cache()
        return True
    except Exception:
        return False


# 啟動時執行一次 GPU 測試，結果快取供後續使用
_GPU_WORKS = check_gpu_actually_works()


# =====================================================================
#  AI 模型管理
# =====================================================================
def get_model(scale: int = 4):
    """
    取得 Real-ESRGAN 模型 (帶快取)

    參數:
        scale: 放大倍數，2 或 4

    模型說明:
        - RealESRGAN_x2plus: 2 倍放大，適合原圖較大時使用
        - RealESRGAN_x4plus: 4 倍放大，適合原圖較小時使用

    模型權重首次使用時會自動從 GitHub Releases 下載至 weights/ 資料夾
    tile=256 表示分塊處理，可降低 GPU 記憶體需求
    """
    if scale in models_cache:
        return models_cache[scale]

    # 根據 GPU 測試結果決定使用 GPU 或 CPU
    use_gpu = _GPU_WORKS
    device = torch.device("cuda" if use_gpu else "cpu")
    half = use_gpu  # GPU 模式使用半精度 (FP16) 加速

    if scale == 2:
        model_name = "RealESRGAN_x2plus"
        model = RRDBNet(num_in_ch=3, num_out_ch=3, num_feat=64, num_block=23, num_grow_ch=32, scale=2)
        netscale = 2
    else:
        model_name = "RealESRGAN_x4plus"
        model = RRDBNet(num_in_ch=3, num_out_ch=3, num_feat=64, num_block=23, num_grow_ch=32, scale=4)
        netscale = 4

    model_path = WEIGHTS_DIR / f"{model_name}.pth"

    # =====================================================================
    #  模型自動下載 (多鏡像 + SHA256 驗證 + 離線友善錯誤提示)
    #
    #  下載策略：
    #    1. 先檢查 weights/ 資料夾是否已有模型檔案 → 有就直接用
    #    2. 沒有的話，依序嘗試多個下載鏡像 (GitHub → HuggingFace)
    #    3. 下載完成後驗證 SHA256 確保檔案完整未被竄改
    #    4. 所有鏡像都失敗時，顯示手動下載教學
    #
    #  離線保護：
    #    只要 weights/ 資料夾中有模型檔案，完全不需要網路連線
    #    建議將 weights/ 資料夾備份保存，以備不時之需
    # =====================================================================
    MODEL_CHECKSUMS = {
        "RealESRGAN_x4plus": "4fa0d38905f75ac06eb49a7951b426670021be3018265fd191d2125df9d682f1",
        "RealESRGAN_x2plus": "49fafd45f8fd7e8571f120ec9e9e3b94cee32b48b5e8c3e4c705ebea5d82e9f6",
    }

    # 多鏡像下載來源 (依序嘗試，任一成功即停止)
    MODEL_MIRRORS = {
        "RealESRGAN_x4plus": [
            # 鏡像 1: GitHub Releases (官方原始來源)
            "https://github.com/xinntao/Real-ESRGAN/releases/download/v0.1.0/RealESRGAN_x4plus.pth",
            # 鏡像 2: HuggingFace (備用)
            "https://huggingface.co/ai-forever/Real-ESRGAN/resolve/main/RealESRGAN_x4plus.pth",
        ],
        "RealESRGAN_x2plus": [
            # 鏡像 1: GitHub Releases (官方原始來源)
            "https://github.com/xinntao/Real-ESRGAN/releases/download/v0.2.1/RealESRGAN_x2plus.pth",
            # 鏡像 2: HuggingFace (備用)
            "https://huggingface.co/ai-forever/Real-ESRGAN/resolve/main/RealESRGAN_x2plus.pth",
        ],
    }

    if not model_path.exists():
        import urllib.request
        import hashlib

        mirrors = MODEL_MIRRORS.get(model_name, [])
        temp_path = WEIGHTS_DIR / f"{model_name}.pth.tmp"
        download_success = False

        # 依序嘗試每個鏡像
        for i, url in enumerate(mirrors, 1):
            source_name = url.split("/")[2]  # 提取域名作為來源名稱
            print(f"[下載] 嘗試鏡像 {i}/{len(mirrors)} ({source_name})...")
            print(f"       URL: {url}")
            try:
                urllib.request.urlretrieve(url, str(temp_path))

                # 驗證 SHA256 完整性
                expected_hash = MODEL_CHECKSUMS.get(model_name)
                if expected_hash:
                    sha256 = hashlib.sha256()
                    with open(temp_path, "rb") as f:
                        for chunk in iter(lambda: f.read(8192), b""):
                            sha256.update(chunk)
                    actual_hash = sha256.hexdigest()
                    if actual_hash != expected_hash:
                        temp_path.unlink(missing_ok=True)
                        print(f"[警告] 鏡像 {i} 下載的檔案 SHA256 不符，跳過")
                        print(f"       預期: {expected_hash[:16]}...")
                        print(f"       實際: {actual_hash[:16]}...")
                        continue

                # 驗證通過，重命名為正式檔名
                temp_path.rename(model_path)
                print(f"[完成] 模型 {model_name} 下載成功！(來源: {source_name}, SHA256 驗證通過)")
                download_success = True
                break

            except Exception as e:
                temp_path.unlink(missing_ok=True)
                print(f"[失敗] 鏡像 {i} 下載失敗: {e}")
                continue

        # 所有鏡像都失敗 → 顯示手動下載教學
        if not download_success:
            manual_msg = f"""
╔═══════════════════════════════════════════════════════════════╗
║                    模型下載失敗                                ║
╠═══════════════════════════════════════════════════════════════╣
║                                                               ║
║  所有下載鏡像均無法連線。                                      ║
║  請手動下載模型檔案並放入 weights/ 資料夾：                     ║
║                                                               ║
║  模型名稱: {model_name}.pth
║  目標路徑: {model_path}
║                                                               ║
║  手動下載連結 (任選一個):                                      ║"""
            for j, url in enumerate(mirrors, 1):
                manual_msg += f"\n║  {j}. {url}"
            manual_msg += f"""
║                                                               ║
║  下載後將 .pth 檔案放入:                                      ║
║  {WEIGHTS_DIR.resolve()}
║                                                               ║
║  放好後重新啟動 start.bat 即可。                               ║
╚═══════════════════════════════════════════════════════════════╝"""
            print(manual_msg)
            raise RuntimeError(
                f"模型 {model_name} 下載失敗，請手動下載並放入 weights/ 資料夾。"
                f"詳細說明請查看伺服器端的 console 輸出。"
            )

    # 建立 Real-ESRGAN 推論器
    upsampler = RealESRGANer(
        scale=netscale,
        model_path=str(model_path),
        model=model,
        tile=256,       # 分塊大小 (降低顯存需求)
        tile_pad=10,    # 分塊邊緣填充 (避免接縫)
        pre_pad=0,
        half=half,      # FP16 半精度 (僅 GPU)
        device=device,
    )
    models_cache[scale] = upsampler
    return upsampler


# =====================================================================
#  工具函數
# =====================================================================
def calculate_target_scale(width: int, height: int, target: str) -> int:
    """
    根據原圖尺寸和目標解析度，決定使用 x2 或 x4 模型

    邏輯：計算原圖到目標尺寸需要的放大倍數
    - 倍數 <= 2 → 使用 x2 模型
    - 倍數 > 2  → 使用 x4 模型

    參數:
        width, height: 原圖寬高 (px)
        target: "800" | "1k" | "2k" | "4k"
    """
    target_w, target_h = IMAGE_RESOLUTIONS.get(target, (2560, 1440))
    scale = max(target_w / width, target_h / height)
    return 2 if scale <= 2 else 4


def make_download_name(original_filename: str, target: str) -> str:
    """
    產生下載用的檔名

    命名格式：原始檔名_解析度標籤_日期_時間.副檔名
    範例：TEST_2K_20260215_2218.bmp

    參數:
        original_filename: 使用者上傳時的原始檔名
        target: "800" | "1k" | "2k" | "4k"
    """
    from datetime import datetime
    stem = Path(original_filename).stem
    ext = Path(original_filename).suffix
    tag = {"1k": "1K", "2k": "2K", "4k": "4K"}.get(target, target)  # 800→"800"
    now = datetime.now().strftime("%Y%m%d_%H%M")
    return f"{stem}_{tag}_{now}{ext}"


# =====================================================================
#  核心處理函數：單張圖片超解析度
# =====================================================================
def process_image(input_path: str, output_path: str, target: str = "2k", task_id: str = "", original_name: str = ""):
    """
    處理單張圖片的超解析度提升

    流程：
    1. 讀取原圖 (OpenCV)
    2. 根據原圖尺寸和目標解析度選擇 x2 或 x4 模型
    3. 透過 Real-ESRGAN 模型執行超解析度 (在 process_lock 內執行)
    4. 若放大後超過目標尺寸，使用 Lanczos 插值縮小至目標
    5. 根據格式儲存（JPEG 品質 95、PNG 壓縮級別 3、WebP 品質 95）
    6. 更新任務進度狀態

    參數:
        input_path:     上傳的原圖路徑
        output_path:    處理後儲存路徑
        target:         目標解析度 "2k" 或 "4k"
        task_id:        此任務的唯一 ID (用於前端輪詢進度)
        original_name:  使用者上傳時的原始檔名 (用於產生下載命名)
    """
    try:
        tasks_progress[task_id] = {"status": "processing", "progress": 10, "message": "正在讀取圖片..."}

        # 第一步：讀取圖片
        img = cv2.imread(input_path, cv2.IMREAD_UNCHANGED)
        if img is None:
            tasks_progress[task_id] = {"status": "error", "progress": 0, "message": "無法讀取圖片文件"}
            return None

        h, w = img.shape[:2]
        tasks_progress[task_id] = {"status": "processing", "progress": 20, "message": f"原始尺寸: {w}x{h}"}

        # 第二步：決定使用哪個模型
        model_scale = calculate_target_scale(w, h, target)
        tasks_progress[task_id] = {"status": "processing", "progress": 30, "message": f"載入 Real-ESRGAN x{model_scale} 模型..."}

        # 第三步：執行 AI 超解析度 (加鎖確保依序處理)
        with process_lock:
            upsampler = get_model(model_scale)
            tasks_progress[task_id] = {"status": "processing", "progress": 50, "message": "AI 正在處理圖片..."}
            output, _ = upsampler.enhance(img, outscale=model_scale)

        tasks_progress[task_id] = {"status": "processing", "progress": 80, "message": "正在調整至目標解析度..."}

        # 第四步：若超過目標尺寸，縮小至精確的目標解析度
        target_w, target_h = IMAGE_RESOLUTIONS.get(target, (2560, 1440))

        out_h, out_w = output.shape[:2]
        if out_w > target_w or out_h > target_h:
            scale_down = min(target_w / out_w, target_h / out_h)
            output = cv2.resize(output, (int(out_w * scale_down), int(out_h * scale_down)), interpolation=cv2.INTER_LANCZOS4)

        tasks_progress[task_id] = {"status": "processing", "progress": 90, "message": "正在儲存結果..."}

        # 第五步：根據格式儲存（保持高品質）
        final_h, final_w = output.shape[:2]
        ext = Path(output_path).suffix.lower()
        if ext in [".jpg", ".jpeg"]:
            cv2.imwrite(output_path, output, [cv2.IMWRITE_JPEG_QUALITY, 95])
        elif ext == ".webp":
            cv2.imwrite(output_path, output, [cv2.IMWRITE_WEBP_QUALITY, 95])
        elif ext == ".png":
            cv2.imwrite(output_path, output, [cv2.IMWRITE_PNG_COMPRESSION, 3])
        else:
            cv2.imwrite(output_path, output)

        # 第六步：更新任務狀態為完成
        file_size = os.path.getsize(output_path)
        download_name = make_download_name(original_name or os.path.basename(input_path), target)
        result_data = {
            "original_size": f"{w}x{h}",           # 原始尺寸
            "output_size": f"{final_w}x{final_h}",  # 輸出尺寸
            "file_size": file_size,                  # 輸出檔案大小 (bytes)
            "filename": os.path.basename(output_path),  # 伺服器端檔名
            "download_name": download_name,          # 使用者下載時看到的檔名
        }
        tasks_progress[task_id] = {
            "status": "completed", "progress": 100, "message": "處理完成！",
            "result": result_data
        }
        # 寫入歷史紀錄
        add_to_history(task_id, "image", original_name or os.path.basename(input_path), result_data)
        return output_path

    except Exception as e:
        # 安全性：不在錯誤訊息中暴露內部路徑或堆疊資訊
        # 僅顯示通用錯誤類型，完整錯誤記錄在伺服器端 console
        error_msg = str(e)
        # 移除可能包含的檔案路徑資訊
        if os.sep in error_msg or '/' in error_msg:
            safe_msg = "處理失敗: 內部錯誤，請查看伺服器日誌"
        else:
            safe_msg = f"處理失敗: {error_msg}"
        print(f"[ERROR] task_id={task_id}: {error_msg}")  # 完整錯誤記錄在伺服器端
        tasks_progress[task_id] = {"status": "error", "progress": 0, "message": safe_msg}
        return None


# =====================================================================
#  核心處理函數：批量處理
# =====================================================================
def process_batch(batch_id: str, file_tasks: list, target: str):
    """
    批量處理多張圖片（依序逐張處理）

    流程：
    1. 遍歷所有待處理的任務
    2. 對每張圖呼叫 process_image()
    3. 即時更新批次總進度
    4. 全部完成後，將成功的圖片打包成 ZIP

    參數:
        batch_id:    此批次的唯一 ID
        file_tasks:  任務清單 [{task_id, input_path, output_path, original_name}, ...]
        target:      目標解析度 "2k" 或 "4k"
    """
    total = len(file_tasks)
    completed = 0
    failed = 0

    for i, task in enumerate(file_tasks):
        task_id = task["task_id"]
        input_path = task["input_path"]
        output_path = task["output_path"]

        # 更新批次總進度
        batch_progress[batch_id]["current_index"] = i
        batch_progress[batch_id]["message"] = f"正在處理第 {i+1}/{total} 張圖片..."
        batch_progress[batch_id]["progress"] = int((i / total) * 100)

        # 處理單張圖片
        original_name = task.get("original_name", "")
        result = process_image(input_path, output_path, target, task_id, original_name)

        if result:
            completed += 1
        else:
            failed += 1

        batch_progress[batch_id]["completed"] = completed
        batch_progress[batch_id]["failed"] = failed

    # 全部處理完畢
    batch_progress[batch_id]["status"] = "completed"
    batch_progress[batch_id]["progress"] = 100
    batch_progress[batch_id]["message"] = f"全部完成！成功 {completed} 張" + (f"，失敗 {failed} 張" if failed else "")

    # 將所有成功的圖片打包成 ZIP（檔名使用自訂命名格式）
    try:
        zip_path = OUTPUT_DIR / f"{batch_id}_all.zip"
        with zipfile.ZipFile(str(zip_path), 'w', zipfile.ZIP_DEFLATED) as zf:
            for task in file_tasks:
                tid = task["task_id"]
                if tid in tasks_progress and tasks_progress[tid]["status"] == "completed":
                    out_file = OUTPUT_DIR / tasks_progress[tid]["result"]["filename"]
                    if out_file.exists():
                        # ZIP 內檔名使用自訂命名格式: 原檔名_2K_日期_時間.副檔名
                        arcname = tasks_progress[tid]["result"].get("download_name", task['original_name'])
                        zf.write(str(out_file), arcname)
        batch_progress[batch_id]["zip_ready"] = True
    except Exception:
        batch_progress[batch_id]["zip_ready"] = False


# =====================================================================
#  檔案清理
# =====================================================================
def cleanup_old_files():
    """
    清理超過 1 小時的暫存檔案
    在每次上傳時會自動觸發，避免磁碟空間持續增長
    """
    current_time = time.time()
    for directory in [UPLOAD_DIR, OUTPUT_DIR]:
        for file_path in directory.iterdir():
            if file_path.is_file():
                if current_time - file_path.stat().st_mtime > 3600:
                    try:
                        file_path.unlink()
                    except Exception:
                        pass
    # 清理超過 1 小時的影片拆幀暫存目錄
    if TEMP_DIR.exists():
        for sub in TEMP_DIR.iterdir():
            if sub.is_dir():
                try:
                    if current_time - sub.stat().st_mtime > 3600:
                        shutil.rmtree(str(sub), ignore_errors=True)
                except Exception:
                    pass


# =====================================================================
#  核心處理函數：影片超解析度
#  流程：FFmpeg 拆幀 → Real-ESRGAN 逐幀放大 → FFmpeg 合成 + 音訊複製
# =====================================================================
def get_video_fps(video_path: str) -> float:
    """用 FFprobe 取得影片的 FPS"""
    try:
        result = subprocess.run(
            ["ffprobe", "-v", "error", "-select_streams", "v:0",
             "-show_entries", "stream=r_frame_rate",
             "-of", "csv=p=0", video_path],
            capture_output=True, text=True, timeout=30
        )
        fps_str = result.stdout.strip()
        if '/' in fps_str:
            num, den = fps_str.split('/')
            return float(num) / float(den)
        return float(fps_str)
    except Exception:
        return 30.0


def get_video_info(video_path: str) -> dict:
    """用 FFprobe 取得影片資訊 (寬高、FPS、時長)"""
    info = {"width": 0, "height": 0, "fps": 30.0, "duration": 0, "has_audio": False}
    try:
        result = subprocess.run(
            ["ffprobe", "-v", "error", "-select_streams", "v:0",
             "-show_entries", "stream=width,height,r_frame_rate,duration",
             "-show_entries", "format=duration",
             "-of", "json", video_path],
            capture_output=True, text=True, timeout=30
        )
        import json
        data = json.loads(result.stdout)
        stream = data.get("streams", [{}])[0]
        info["width"] = int(stream.get("width", 0))
        info["height"] = int(stream.get("height", 0))
        fps_str = stream.get("r_frame_rate", "30/1")
        if '/' in fps_str:
            num, den = fps_str.split('/')
            parsed_fps = float(num) / float(den) if float(den) != 0 else 30.0
        else:
            parsed_fps = float(fps_str)
        info["fps"] = parsed_fps if parsed_fps > 0 else 30.0
        dur = stream.get("duration") or data.get("format", {}).get("duration", "0")
        info["duration"] = float(dur)

        # 檢查是否有音訊軌
        result2 = subprocess.run(
            ["ffprobe", "-v", "error", "-select_streams", "a",
             "-show_entries", "stream=codec_type", "-of", "csv=p=0", video_path],
            capture_output=True, text=True, timeout=10
        )
        info["has_audio"] = len(result2.stdout.strip()) > 0
    except Exception:
        pass
    return info


def process_video(task_id: str, input_path: str, output_path: str, target: str, original_name: str):
    """
    處理影片的超解析度提升

    流程：
    1. 用 FFprobe 取得影片資訊
    2. FFmpeg 拆幀為 PNG
    3. 逐幀用 Real-ESRGAN 放大
    4. FFmpeg 合成影片 + 複製音訊
    """
    frame_dir = TEMP_DIR / task_id
    upscaled_dir = TEMP_DIR / f"{task_id}_up"

    try:
        frame_dir.mkdir(exist_ok=True)
        upscaled_dir.mkdir(exist_ok=True)

        # 第一步：取得影片資訊
        tasks_progress[task_id] = {"status": "processing", "progress": 2, "message": "正在分析影片..."}
        vinfo = get_video_info(input_path)
        orig_w, orig_h = vinfo["width"], vinfo["height"]
        fps = vinfo["fps"]
        if orig_w == 0 or orig_h == 0:
            tasks_progress[task_id] = {"status": "error", "progress": 0, "message": "無法讀取影片資訊"}
            return None

        target_w, target_h = VIDEO_RESOLUTIONS.get(target, (1920, 1080))

        # 第二步：FFmpeg 拆幀 (PNG 無損格式)
        tasks_progress[task_id] = {"status": "processing", "progress": 5, "message": "正在拆解影片幀..."}
        frame_pattern = str(frame_dir / "%06d.png")
        extract_result = subprocess.run(
            ["ffmpeg", "-i", input_path, "-vsync", "cfr", frame_pattern, "-y"],
            capture_output=True, text=True, timeout=600
        )
        if extract_result.returncode != 0:
            print(f"[FFmpeg 拆幀] stderr: {extract_result.stderr[-500:]}")  # 記錄最後 500 字元

        # 計算總幀數
        frames = sorted(frame_dir.glob("*.png"))
        total_frames = len(frames)
        if total_frames == 0:
            tasks_progress[task_id] = {"status": "error", "progress": 0, "message": "影片拆幀失敗，請確認影片格式正確"}
            return None

        tasks_progress[task_id] = {
            "status": "processing", "progress": 8,
            "message": f"共 {total_frames} 幀，原始 {orig_w}x{orig_h} → 目標 {target_w}x{target_h}"
        }

        # 第三步：決定模型倍率
        scale_needed = max(target_w / orig_w, target_h / orig_h)
        model_scale = 2 if scale_needed <= 2 else 4

        # 第四步：逐幀 AI 放大
        for i, frame_path in enumerate(frames):
            frame_progress = 10 + int((i / total_frames) * 80)
            tasks_progress[task_id] = {
                "status": "processing", "progress": frame_progress,
                "message": f"AI 處理中... {i+1}/{total_frames} 幀",
                "current_frame": i + 1, "total_frames": total_frames,
            }

            img = cv2.imread(str(frame_path), cv2.IMREAD_UNCHANGED)
            if img is None:
                continue

            with process_lock:
                upsampler = get_model(model_scale)
                output, _ = upsampler.enhance(img, outscale=model_scale)

            # 縮放到目標解析度 (保持原始長寬比，不超過目標尺寸)
            out_h, out_w = output.shape[:2]
            if out_w > target_w or out_h > target_h:
                scale_down = min(target_w / out_w, target_h / out_h)
                new_w = int(out_w * scale_down)
                new_h = int(out_h * scale_down)
                # 確保寬高為偶數 (H.264 編碼要求)
                new_w = new_w - (new_w % 2)
                new_h = new_h - (new_h % 2)
                output = cv2.resize(output, (new_w, new_h), interpolation=cv2.INTER_LANCZOS4)

            out_frame_path = upscaled_dir / frame_path.name
            cv2.imwrite(str(out_frame_path), output)

        # 第五步：FFmpeg 合成影片
        tasks_progress[task_id] = {"status": "processing", "progress": 92, "message": "正在合成影片..."}
        upscaled_pattern = str(upscaled_dir / "%06d.png")

        ffmpeg_cmd = [
            "ffmpeg",
            "-framerate", str(fps),
            "-i", upscaled_pattern,
        ]
        # 如果有音訊，從原始影片複製
        if vinfo["has_audio"]:
            ffmpeg_cmd += ["-i", input_path, "-map", "0:v", "-map", "1:a", "-c:a", "copy"]

        ffmpeg_cmd += [
            "-r", str(fps),           # 明確設定輸出幀率，與原始一致
            "-c:v", "libx264",
            "-crf", "18",             # 高品質 (數值越低品質越高)
            "-preset", "medium",
            "-pix_fmt", "yuv420p",
            "-movflags", "+faststart",
            output_path, "-y"
        ]
        merge_result = subprocess.run(ffmpeg_cmd, capture_output=True, text=True, timeout=1200)
        if merge_result.returncode != 0:
            print(f"[FFmpeg 合成] stderr: {merge_result.stderr[-500:]}")

        if not Path(output_path).exists():
            tasks_progress[task_id] = {"status": "error", "progress": 0, "message": "影片合成失敗"}
            return None

        # 第六步：用 FFprobe 確認實際輸出尺寸
        out_info = get_video_info(output_path)
        actual_w = out_info["width"] or target_w
        actual_h = out_info["height"] or target_h

        file_size = os.path.getsize(output_path)
        from datetime import datetime
        stem = Path(original_name).stem
        tag = target.upper()
        now = datetime.now().strftime("%Y%m%d_%H%M")
        download_name = f"{stem}_{tag}_{now}.mp4"

        result_data = {
            "original_size": f"{orig_w}x{orig_h}",
            "output_size": f"{actual_w}x{actual_h}",
            "file_size": file_size,
            "total_frames": total_frames,
            "filename": os.path.basename(output_path),
            "download_name": download_name,
        }
        tasks_progress[task_id] = {
            "status": "completed", "progress": 100, "message": "影片處理完成！",
            "result": result_data
        }
        # 寫入歷史紀錄
        add_to_history(task_id, "video", original_name, result_data)
        return output_path

    except Exception as e:
        error_msg = str(e)
        print(f"[ERROR] video task_id={task_id}: {error_msg}")
        if os.sep in error_msg or '/' in error_msg:
            safe_msg = "影片處理失敗: 內部錯誤"
        else:
            safe_msg = f"影片處理失敗: {error_msg}"
        tasks_progress[task_id] = {"status": "error", "progress": 0, "message": safe_msg}
        return None
    finally:
        # 清理拆幀暫存
        import shutil as _shutil
        _shutil.rmtree(str(frame_dir), ignore_errors=True)
        _shutil.rmtree(str(upscaled_dir), ignore_errors=True)


# =====================================================================
#  核心處理函數：影片批量處理
# =====================================================================
def process_video_batch(batch_id: str, video_tasks: list, target: str):
    """
    批量處理多部影片（依序逐部處理）

    流程：
    1. 遍歷所有待處理的影片任務
    2. 檢查是否已被使用者取消 → 跳過
    3. 對每部影片呼叫 process_video()
    4. 即時更新批次總進度
    5. 全部完成後，將成功的影片打包成 ZIP
    """
    total = len(video_tasks)
    completed = 0
    failed = 0
    cancelled = 0
    processed_index = 0  # 實際處理到第幾部（不含已取消的）

    for i, task in enumerate(video_tasks):
        task_id = task["task_id"]
        input_path = task["input_path"]
        output_path = task["output_path"]
        original_name = task["original_name"]

        # 檢查是否已被使用者取消
        tp = tasks_progress.get(task_id, {})
        if tp.get("status") == "cancelled":
            cancelled += 1
            batch_progress[batch_id]["cancelled"] = cancelled
            continue

        processed_index += 1
        active_total = total - cancelled
        batch_progress[batch_id]["current_index"] = i
        batch_progress[batch_id]["message"] = f"正在處理第 {processed_index}/{active_total} 部影片..."
        batch_progress[batch_id]["progress"] = int(((completed + failed) / max(active_total, 1)) * 100)

        result = process_video(task_id, input_path, output_path, target, original_name)

        if result:
            completed += 1
        else:
            failed += 1

        batch_progress[batch_id]["completed"] = completed
        batch_progress[batch_id]["failed"] = failed
        batch_progress[batch_id]["cancelled"] = cancelled

    batch_progress[batch_id]["status"] = "completed"
    batch_progress[batch_id]["progress"] = 100
    parts = []
    if completed: parts.append(f"成功 {completed} 部")
    if failed: parts.append(f"失敗 {failed} 部")
    if cancelled: parts.append(f"已取消 {cancelled} 部")
    batch_progress[batch_id]["message"] = "全部完成！" + "，".join(parts)

    # 將所有成功的影片打包成 ZIP
    try:
        zip_path = OUTPUT_DIR / f"{batch_id}_videos.zip"
        completed_count = 0
        with zipfile.ZipFile(str(zip_path), 'w', zipfile.ZIP_STORED) as zf:
            for task in video_tasks:
                tid = task["task_id"]
                if tid in tasks_progress and tasks_progress[tid]["status"] == "completed":
                    out_file = OUTPUT_DIR / tasks_progress[tid]["result"]["filename"]
                    if out_file.exists():
                        arcname = tasks_progress[tid]["result"].get("download_name", task["original_name"])
                        zf.write(str(out_file), arcname)
                        completed_count += 1
        batch_progress[batch_id]["zip_ready"] = completed_count > 0
    except Exception:
        batch_progress[batch_id]["zip_ready"] = False


# =====================================================================
#  HEIC / RAW 載入（轉成 JPG 等用）
# =====================================================================

def _load_image_for_convert(input_path: str, ext: str):
    """
    依副檔名載入圖片為 OpenCV BGR 陣列。
    支援一般格式（cv2）、HEIC/HEIF（pillow-heif）、相機 RAW（rawpy）。
    若格式不支援或套件未安裝，回傳 None 並可從後續錯誤訊息判斷。
    """
    ext = (ext or "").lower()
    if ext in HEIC_EXTENSIONS:
        try:
            import pillow_heif
            heif = pillow_heif.open_heif(input_path)
            if len(heif) == 0:
                return None
            # 取第一張圖，轉成 numpy RGB（可能 8/16-bit）
            img_pil = heif[0].to_pillow()
            rgb = np.array(img_pil)
            if len(rgb.shape) == 2:
                rgb = np.stack([rgb] * 3, axis=-1)
            if rgb.dtype == np.uint16 or (hasattr(rgb, "max") and rgb.max() > 255):
                rgb = (np.clip(rgb, 0, 65535) >> 8).astype(np.uint8)
            elif rgb.dtype != np.uint8:
                rgb = np.clip(rgb, 0, 255).astype(np.uint8)
            return cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)
        except Exception as e:
            print(f"[HEIC] {e}")
            return None
    if ext in RAW_EXTENSIONS:
        try:
            import rawpy
            with rawpy.imread(input_path) as raw:
                rgb = raw.postprocess()
            return cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)
        except Exception as e:
            print(f"[RAW] {e}")
            return None
    # 一般格式
    img = cv2.imread(input_path, cv2.IMREAD_UNCHANGED)
    return img


# =====================================================================
#  圖片轉檔 / 影片轉檔 / 壓縮
# =====================================================================

def process_convert_image(task_id: str, input_path: str, output_path: str, fmt: str, original_name: str):
    """將圖片轉成指定格式（含 HEIC/RAW 轉 JPG/PNG 等），不改變尺寸。"""
    try:
        input_ext = Path(input_path).suffix.lower()
        tasks_progress[task_id] = {"status": "processing", "progress": 20, "message": "正在讀取圖片..."}
        img = _load_image_for_convert(input_path, input_ext)
        if img is None:
            if input_ext in HEIC_EXTENSIONS:
                tasks_progress[task_id] = {"status": "error", "progress": 0, "message": "無法讀取 HEIC/HEIF，請確認已安裝 pillow-heif"}
            elif input_ext in RAW_EXTENSIONS:
                tasks_progress[task_id] = {"status": "error", "progress": 0, "message": "無法讀取 RAW，請確認已安裝 rawpy"}
            else:
                tasks_progress[task_id] = {"status": "error", "progress": 0, "message": "無法讀取圖片"}
            return None
        h, w = img.shape[:2]
        tasks_progress[task_id] = {"status": "processing", "progress": 60, "message": "正在轉檔..."}
        ext = Path(output_path).suffix.lower()
        if ext in [".jpg", ".jpeg"]:
            cv2.imwrite(output_path, img, [cv2.IMWRITE_JPEG_QUALITY, 90])
        elif ext == ".webp":
            cv2.imwrite(output_path, img, [cv2.IMWRITE_WEBP_QUALITY, 90])
        elif ext == ".png":
            cv2.imwrite(output_path, img, [cv2.IMWRITE_PNG_COMPRESSION, 3])
        elif ext in (".bmp", ".tiff", ".tif"):
            cv2.imwrite(output_path, img)
        else:
            cv2.imwrite(output_path, img)
        file_size = os.path.getsize(output_path)
        stem = Path(original_name).stem
        out_ext = ext.lstrip(".")
        download_name = f"{stem}_converted.{out_ext}"
        result_data = {
            "original_size": f"{w}x{h}",
            "output_size": f"{w}x{h}",
            "file_size": file_size,
            "filename": os.path.basename(output_path),
            "download_name": download_name,
            "original_name": original_name,
        }
        tasks_progress[task_id] = {"status": "completed", "progress": 100, "message": "轉檔完成！", "result": result_data}
        add_to_history(task_id, "image", original_name, result_data)
        return output_path
    except Exception as e:
        safe_msg = "轉檔失敗: 內部錯誤" if (os.sep in str(e) or "/" in str(e)) else f"轉檔失敗: {e}"
        print(f"[ERROR] convert_image task_id={task_id}: {e}")
        tasks_progress[task_id] = {"status": "error", "progress": 0, "message": safe_msg}
        return None


def process_convert_batch(batch_id: str, file_tasks: list, format: str):
    """
    批量圖片轉檔：依序處理，支援執行前取消（status == queued 的會跳過）。
    """
    total = len(file_tasks)
    completed = 0
    failed = 0
    cancelled = 0

    for i, task in enumerate(file_tasks):
        task_id = task["task_id"]
        tp = tasks_progress.get(task_id, {})
        if tp.get("status") == "cancelled":
            cancelled += 1
            batch_progress[batch_id]["cancelled"] = cancelled
            continue

        batch_progress[batch_id]["current_index"] = i
        batch_progress[batch_id]["message"] = f"正在轉檔第 {i+1}/{total} 張..."
        batch_progress[batch_id]["progress"] = int((i / total) * 100)

        original_name = task.get("original_name", "")
        result = process_convert_image(
            task_id, task["input_path"], task["output_path"], format, original_name
        )

        if result:
            completed += 1
        else:
            failed += 1

        batch_progress[batch_id]["completed"] = completed
        batch_progress[batch_id]["failed"] = failed

    batch_progress[batch_id]["status"] = "completed"
    batch_progress[batch_id]["progress"] = 100
    parts = []
    if completed:
        parts.append(f"成功 {completed} 張")
    if failed:
        parts.append(f"失敗 {failed} 張")
    if cancelled:
        parts.append(f"已取消 {cancelled} 張")
    batch_progress[batch_id]["message"] = "全部完成！" + "，".join(parts)

    try:
        zip_path = OUTPUT_DIR / f"{batch_id}_all.zip"
        with zipfile.ZipFile(str(zip_path), 'w', zipfile.ZIP_DEFLATED) as zf:
            for task in file_tasks:
                tid = task["task_id"]
                if tid in tasks_progress and tasks_progress[tid]["status"] == "completed":
                    out_file = OUTPUT_DIR / tasks_progress[tid]["result"]["filename"]
                    if out_file.exists():
                        arcname = tasks_progress[tid]["result"].get("download_name", task["original_name"])
                        zf.write(str(out_file), arcname)
        batch_progress[batch_id]["zip_ready"] = True
    except Exception:
        batch_progress[batch_id]["zip_ready"] = False


def process_convert_video(task_id: str, input_path: str, output_path: str, fmt: str, original_name: str):
    """使用 FFmpeg 將影片轉成指定格式（mp4 / webm / mkv / avi / mov）。"""
    try:
        tasks_progress[task_id] = {"status": "processing", "progress": 10, "message": "正在轉檔..."}
        ext = Path(output_path).suffix.lower()
        if ext == ".webm":
            cmd = [
                "ffmpeg", "-i", input_path,
                "-c:v", "libvpx-vp9", "-crf", "30", "-b:v", "0",
                "-c:a", "libopus", "-b:a", "128k",
                "-y", output_path
            ]
        else:
            # mp4 / mkv / avi / mov：串流複製，不重新編碼
            cmd = ["ffmpeg", "-i", input_path, "-c", "copy", "-y", output_path]
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=3600)
        if result.returncode != 0 or not Path(output_path).exists():
            tasks_progress[task_id] = {"status": "error", "progress": 0, "message": "影片轉檔失敗"}
            return None
        file_size = os.path.getsize(output_path)
        stem = Path(original_name).stem
        out_ext = ext.lstrip(".")
        download_name = f"{stem}_converted.{out_ext}"
        result_data = {
            "filename": os.path.basename(output_path),
            "download_name": download_name,
            "file_size": file_size,
            "original_name": original_name,
        }
        tasks_progress[task_id] = {"status": "completed", "progress": 100, "message": "轉檔完成！", "result": result_data}
        add_to_history(task_id, "video", original_name, result_data)
        return output_path
    except subprocess.TimeoutExpired:
        tasks_progress[task_id] = {"status": "error", "progress": 0, "message": "轉檔逾時"}
        return None
    except Exception as e:
        print(f"[ERROR] convert_video task_id={task_id}: {e}")
        tasks_progress[task_id] = {"status": "error", "progress": 0, "message": "影片轉檔失敗"}
        return None


def process_compress_image(task_id: str, input_path: str, output_path: str, quality: int, max_width: Optional[int], max_height: Optional[int], original_name: str):
    """壓縮圖片：可選縮小尺寸（保持比例）並依格式寫入品質參數。"""
    try:
        tasks_progress[task_id] = {"status": "processing", "progress": 20, "message": "正在讀取圖片..."}
        img = cv2.imread(input_path, cv2.IMREAD_UNCHANGED)
        if img is None:
            tasks_progress[task_id] = {"status": "error", "progress": 0, "message": "無法讀取圖片"}
            return None
        orig_h, orig_w = img.shape[:2]
        h, w = orig_h, orig_w
        if (max_width and max_width > 0) or (max_height and max_height > 0):
            tasks_progress[task_id] = {"status": "processing", "progress": 50, "message": "正在縮小尺寸..."}
            scale = 1.0
            if max_width and w > max_width:
                scale = min(scale, max_width / w)
            if max_height and h > max_height:
                scale = min(scale, max_height / h)
            if scale < 1.0:
                new_w, new_h = int(w * scale), int(h * scale)
                img = cv2.resize(img, (new_w, new_h), interpolation=cv2.INTER_AREA)
                h, w = new_h, new_w
        tasks_progress[task_id] = {"status": "processing", "progress": 70, "message": "正在壓縮..."}
        ext = Path(output_path).suffix.lower()
        q = max(1, min(100, quality))
        if ext in [".jpg", ".jpeg"]:
            cv2.imwrite(output_path, img, [cv2.IMWRITE_JPEG_QUALITY, q])
        elif ext == ".webp":
            cv2.imwrite(output_path, img, [cv2.IMWRITE_WEBP_QUALITY, q])
        elif ext == ".png":
            comp = 9 - int((q / 100) * 8)  # 1~9
            cv2.imwrite(output_path, img, [cv2.IMWRITE_PNG_COMPRESSION, max(1, comp)])
        else:
            cv2.imwrite(output_path, img)
        file_size = os.path.getsize(output_path)
        stem = Path(original_name).stem
        download_name = f"{stem}_compressed{ext}"
        result_data = {
            "original_size": f"{orig_w}x{orig_h}",
            "output_size": f"{w}x{h}",
            "file_size": file_size,
            "filename": os.path.basename(output_path),
            "download_name": download_name,
            "original_name": original_name,
        }
        tasks_progress[task_id] = {"status": "completed", "progress": 100, "message": "壓縮完成！", "result": result_data}
        add_to_history(task_id, "image", original_name, result_data)
        return output_path
    except Exception as e:
        safe_msg = "壓縮失敗: 內部錯誤" if (os.sep in str(e) or "/" in str(e)) else f"壓縮失敗: {e}"
        print(f"[ERROR] compress_image task_id={task_id}: {e}")
        tasks_progress[task_id] = {"status": "error", "progress": 0, "message": safe_msg}
        return None


def process_compress_video(task_id: str, input_path: str, output_path: str, crf: int, original_name: str):
    """使用 FFmpeg 壓縮影片（H.264 + AAC）。"""
    try:
        tasks_progress[task_id] = {"status": "processing", "progress": 20, "message": "正在壓縮影片..."}
        crf_val = max(18, min(28, crf))
        cmd = [
            "ffmpeg", "-i", input_path,
            "-c:v", "libx264", "-crf", str(crf_val), "-preset", "medium",
            "-c:a", "aac", "-b:a", "128k",
            "-movflags", "+faststart", "-y", output_path
        ]
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=3600)
        if result.returncode != 0 or not Path(output_path).exists():
            tasks_progress[task_id] = {"status": "error", "progress": 0, "message": "影片壓縮失敗"}
            return None
        file_size = os.path.getsize(output_path)
        stem = Path(original_name).stem
        download_name = f"{stem}_compressed.mp4"
        result_data = {
            "filename": os.path.basename(output_path),
            "download_name": download_name,
            "file_size": file_size,
            "original_name": original_name,
        }
        tasks_progress[task_id] = {"status": "completed", "progress": 100, "message": "壓縮完成！", "result": result_data}
        add_to_history(task_id, "video", original_name, result_data)
        return output_path
    except subprocess.TimeoutExpired:
        tasks_progress[task_id] = {"status": "error", "progress": 0, "message": "壓縮逾時"}
        return None
    except Exception as e:
        print(f"[ERROR] compress_video task_id={task_id}: {e}")
        tasks_progress[task_id] = {"status": "error", "progress": 0, "message": "影片壓縮失敗"}
        return None


# =====================================================================
#  API 路由
# =====================================================================

@app.get("/")
async def index(request: Request):
    """首頁：渲染 HTML 模板，傳入運算設備和 FFmpeg 狀態"""
    device_info = "GPU (CUDA)" if torch.cuda.is_available() else "CPU"
    return templates.TemplateResponse("index.html", {
        "request": request,
        "device": device_info,
        "ffmpeg_ok": _FFMPEG_OK,
    })


@app.post("/api/upload")
async def upload_image(background_tasks: BackgroundTasks, file: UploadFile = File(...), target: str = Form("2k")):
    """
    單張圖片上傳 API

    1. 驗證檔案格式和大小
    2. 儲存至 uploads/
    3. 在背景任務中啟動 process_image()
    4. 回傳 task_id 給前端輪詢進度
    """
    # 安全性：清理檔名，防止路徑遍歷攻擊
    safe_filename = sanitize_filename(file.filename)
    ext = Path(safe_filename).suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail=f"不支援的檔案格式: {ext}")

    # 安全性：驗證 target 參數
    if target not in IMAGE_RESOLUTIONS:
        raise HTTPException(status_code=400, detail="無效的目標解析度")

    content = await file.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail=f"檔案太大！最大支援 {MAX_FILE_SIZE // (1024*1024)}MB")

    # 安全性：驗證檔案實際內容是否為圖片 (Magic Bytes 檢查)
    if not validate_image_magic_bytes(content):
        raise HTTPException(status_code=400, detail="檔案內容不是有效的圖片格式")

    task_id = str(uuid.uuid4())
    input_path = UPLOAD_DIR / f"{task_id}{ext}"
    with open(input_path, "wb") as f:
        f.write(content)

    output_path = OUTPUT_DIR / f"{task_id}_upscaled{ext}"
    tasks_progress[task_id] = {"status": "queued", "progress": 0, "message": "排隊中..."}

    # 在 FastAPI 背景任務中處理（不阻塞 HTTP 回應）
    background_tasks.add_task(process_image, str(input_path), str(output_path), target, task_id, safe_filename)
    background_tasks.add_task(cleanup_old_files)
    background_tasks.add_task(cleanup_old_tasks)  # 安全性：定期清理記憶體中的舊任務記錄

    return JSONResponse({"task_id": task_id, "message": "圖片已上傳", "original_filename": safe_filename})


@app.post("/api/batch-upload")
async def batch_upload(background_tasks: BackgroundTasks, files: List[UploadFile] = File(...), target: str = Form("2k")):
    """
    批量圖片上傳 API

    1. 接收多個檔案 (最多 20 張)
    2. 逐一驗證並儲存至 uploads/
    3. 在背景任務中啟動 process_batch()
    4. 回傳 batch_id 和所有 task_id 給前端輪詢
    """
    if len(files) > 20:
        raise HTTPException(status_code=400, detail="一次最多上傳 20 張圖片")

    # 安全性：驗證 target 參數
    if target not in IMAGE_RESOLUTIONS:
        raise HTTPException(status_code=400, detail="無效的目標解析度")

    batch_id = str(uuid.uuid4())
    file_tasks = []

    for file in files:
        # 安全性：清理檔名
        safe_filename = sanitize_filename(file.filename)
        ext = Path(safe_filename).suffix.lower()
        if ext not in ALLOWED_EXTENSIONS:
            continue  # 跳過不支援的格式

        content = await file.read()
        if len(content) > MAX_FILE_SIZE:
            continue  # 跳過太大的檔案

        # 安全性：驗證檔案實際內容是否為圖片
        if not validate_image_magic_bytes(content):
            continue  # 跳過非圖片檔案

        task_id = str(uuid.uuid4())
        input_path = UPLOAD_DIR / f"{task_id}{ext}"
        with open(input_path, "wb") as f:
            f.write(content)

        output_path = OUTPUT_DIR / f"{task_id}_upscaled{ext}"
        tasks_progress[task_id] = {"status": "queued", "progress": 0, "message": "排隊中..."}

        file_tasks.append({
            "task_id": task_id,
            "input_path": str(input_path),
            "output_path": str(output_path),
            "original_name": safe_filename,
        })

    if not file_tasks:
        raise HTTPException(status_code=400, detail="沒有可處理的檔案")

    # 初始化批量進度狀態
    batch_progress[batch_id] = {
        "status": "processing",
        "total": len(file_tasks),
        "completed": 0,
        "failed": 0,
        "progress": 0,
        "current_index": 0,
        "message": "準備開始處理...",
        "task_ids": [t["task_id"] for t in file_tasks],
        "original_names": {t["task_id"]: t["original_name"] for t in file_tasks},
        "zip_ready": False,
    }

    background_tasks.add_task(process_batch, batch_id, file_tasks, target)
    background_tasks.add_task(cleanup_old_files)
    background_tasks.add_task(cleanup_old_tasks)  # 安全性：定期清理記憶體中的舊任務記錄

    return JSONResponse({
        "batch_id": batch_id,
        "total": len(file_tasks),
        "task_ids": [t["task_id"] for t in file_tasks],
        "original_names": {t["task_id"]: t["original_name"] for t in file_tasks},
    })


@app.get("/api/progress/{task_id}")
async def get_progress(task_id: str):
    """查詢單張圖片處理進度 (前端每秒輪詢一次)"""
    if task_id not in tasks_progress:
        raise HTTPException(status_code=404, detail="找不到該任務")
    return JSONResponse(tasks_progress[task_id])


@app.get("/api/batch-progress/{batch_id}")
async def get_batch_progress(batch_id: str):
    """
    查詢批量處理進度
    回傳包含：整體進度 + 每張圖片個別狀態
    """
    if batch_id not in batch_progress:
        raise HTTPException(status_code=404, detail="找不到該批次")

    bp = batch_progress[batch_id]
    items = []
    for tid in bp["task_ids"]:
        tp = tasks_progress.get(tid, {"status": "queued", "progress": 0, "message": "排隊中..."})
        items.append({
            "task_id": tid,
            "original_name": bp["original_names"].get(tid, ""),
            "status": tp.get("status", "queued"),
            "progress": tp.get("progress", 0),
            "message": tp.get("message", ""),
            "result": tp.get("result"),
        })

    return JSONResponse({
        "status": bp["status"],
        "total": bp["total"],
        "completed": bp["completed"],
        "failed": bp["failed"],
        "cancelled": bp.get("cancelled", 0),
        "progress": bp["progress"],
        "message": bp["message"],
        "zip_ready": bp.get("zip_ready", False),
        "items": items,
    })


@app.get("/api/download/{task_id}")
async def download_image(task_id: str):
    """下載單張處理後的圖片 (檔名使用自訂命名格式)"""
    if task_id not in tasks_progress:
        raise HTTPException(status_code=404, detail="找不到該任務")
    progress = tasks_progress[task_id]
    if progress["status"] != "completed":
        raise HTTPException(status_code=400, detail="圖片尚未處理完成")
    filename = progress["result"]["filename"]
    file_path = OUTPUT_DIR / filename
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="檔案不存在")
    download_name = progress["result"].get("download_name", f"upscaled_{filename}")
    return FileResponse(path=str(file_path), filename=download_name, media_type="application/octet-stream")


@app.get("/api/batch-download/{batch_id}")
async def batch_download(batch_id: str):
    """下載批量處理結果的 ZIP 檔"""
    if batch_id not in batch_progress:
        raise HTTPException(status_code=404, detail="找不到該批次")
    zip_path = OUTPUT_DIR / f"{batch_id}_all.zip"
    if not zip_path.exists():
        raise HTTPException(status_code=400, detail="ZIP 檔案尚未準備好")
    return FileResponse(path=str(zip_path), filename="upscaled_images.zip", media_type="application/zip")


@app.get("/api/download-zip")
async def download_zip_by_task_ids(task_ids: List[str] = Query(..., description="多個 task_id，已完成的任務會打包成 ZIP")):
    """
    依多個 task_id 打包下載（供轉檔多筆各別送出後一鍵下載）。
    僅包含 status 為 completed 的任務，最多 50 筆。
    """
    if len(task_ids) > 50:
        raise HTTPException(status_code=400, detail="最多 50 個 task_id")
    import io
    buf = io.BytesIO()
    added = 0
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for task_id in task_ids:
            if not task_id or task_id not in tasks_progress:
                continue
            progress = tasks_progress[task_id]
            if progress.get("status") != "completed" or "result" not in progress:
                continue
            filename = progress["result"].get("filename")
            if not filename:
                continue
            file_path = OUTPUT_DIR / filename
            if not file_path.exists():
                continue
            arcname = progress["result"].get("download_name", filename)
            zf.write(str(file_path), arcname)
            added += 1
    if added == 0:
        raise HTTPException(status_code=400, detail="沒有可打包的已完成檔案")
    buf.seek(0)
    return Response(
        content=buf.getvalue(),
        media_type="application/zip",
        headers={"Content-Disposition": "attachment; filename=converted_images.zip"},
    )


@app.get("/api/preview/{task_id}")
async def preview_image(task_id: str):
    """預覽處理後的圖片 (直接回傳圖片供 <img> 標籤使用)"""
    if task_id not in tasks_progress:
        raise HTTPException(status_code=404, detail="找不到該任務")
    progress = tasks_progress[task_id]
    if progress["status"] != "completed":
        raise HTTPException(status_code=400, detail="圖片尚未處理完成")
    filename = progress["result"]["filename"]
    file_path = OUTPUT_DIR / filename
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="檔案不存在")
    ext = Path(filename).suffix.lower()
    mime_map = {".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".bmp": "image/bmp", ".tiff": "image/tiff", ".tif": "image/tiff"}
    return FileResponse(path=str(file_path), media_type=mime_map.get(ext, "application/octet-stream"))


@app.get("/api/preview-original/{task_id}")
async def preview_original(task_id: str):
    """預覽原始圖片 (用於單張結果頁的前後對比)"""
    for file_path in UPLOAD_DIR.iterdir():
        if file_path.stem == task_id:
            ext = file_path.suffix.lower()
            mime_map = {".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".bmp": "image/bmp", ".tiff": "image/tiff", ".tif": "image/tiff"}
            return FileResponse(path=str(file_path), media_type=mime_map.get(ext, "application/octet-stream"))
    raise HTTPException(status_code=404, detail="找不到原始檔案")


@app.get("/api/system-info")
async def system_info():
    """回傳系統資訊：GPU/CPU、支援格式、FFmpeg 狀態等"""
    return JSONResponse({
        "cuda_available": torch.cuda.is_available(),
        "device": "GPU (CUDA)" if torch.cuda.is_available() else "CPU",
        "gpu_name": torch.cuda.get_device_name(0) if torch.cuda.is_available() else None,
        "supported_formats": list(ALLOWED_EXTENSIONS),
        "max_file_size_mb": MAX_FILE_SIZE // (1024 * 1024),
        "ffmpeg_available": _FFMPEG_OK,
        "video_formats": list(VIDEO_EXTENSIONS),
        "max_video_size_mb": MAX_VIDEO_SIZE // (1024 * 1024),
    })


# =====================================================================
#  影片 API 路由
# =====================================================================

@app.post("/api/video/upload")
async def video_upload(background_tasks: BackgroundTasks, file: UploadFile = File(...), target: str = Form("1080p")):
    """
    影片上傳 API
    1. 檢查 FFmpeg 是否可用
    2. 驗證影片格式和大小
    3. 儲存至 uploads/
    4. 在背景任務中啟動 process_video()
    """
    if not _FFMPEG_OK:
        raise HTTPException(status_code=400, detail="FFmpeg 未安裝，無法處理影片。請安裝 FFmpeg 後重啟。")

    safe_filename = sanitize_filename(file.filename)
    ext = Path(safe_filename).suffix.lower()
    if ext not in VIDEO_EXTENSIONS:
        raise HTTPException(status_code=400, detail=f"不支援的影片格式: {ext}")

    if target not in VIDEO_RESOLUTIONS:
        raise HTTPException(status_code=400, detail="無效的目標解析度")

    content = await file.read()
    if len(content) > MAX_VIDEO_SIZE:
        raise HTTPException(status_code=400, detail=f"影片太大！最大支援 {MAX_VIDEO_SIZE // (1024*1024)}MB")

    task_id = str(uuid.uuid4())
    input_path = UPLOAD_DIR / f"{task_id}{ext}"
    with open(input_path, "wb") as f:
        f.write(content)

    output_path = OUTPUT_DIR / f"{task_id}_upscaled.mp4"
    tasks_progress[task_id] = {"status": "queued", "progress": 0, "message": "排隊中..."}

    background_tasks.add_task(process_video, task_id, str(input_path), str(output_path), target, safe_filename)
    background_tasks.add_task(cleanup_old_files)
    background_tasks.add_task(cleanup_old_tasks)

    return JSONResponse({"task_id": task_id, "message": "影片已上傳", "original_filename": safe_filename})


@app.post("/api/video/batch-upload")
async def video_batch_upload(background_tasks: BackgroundTasks, files: List[UploadFile] = File(...), target: str = Form("1080p")):
    """
    批量影片上傳 API
    1. 接收多個影片檔案 (最多 10 部)
    2. 逐一驗證並儲存至 uploads/
    3. 在背景任務中啟動 process_video_batch()
    4. 回傳 batch_id 和所有 task_id 給前端輪詢
    """
    if not _FFMPEG_OK:
        raise HTTPException(status_code=400, detail="FFmpeg 未安裝，無法處理影片。")

    if len(files) > 10:
        raise HTTPException(status_code=400, detail="一次最多上傳 10 部影片")

    if target not in VIDEO_RESOLUTIONS:
        raise HTTPException(status_code=400, detail="無效的目標解析度")

    batch_id = str(uuid.uuid4())
    video_tasks = []

    for file in files:
        safe_filename = sanitize_filename(file.filename)
        ext = Path(safe_filename).suffix.lower()
        if ext not in VIDEO_EXTENSIONS:
            continue

        content = await file.read()
        if len(content) > MAX_VIDEO_SIZE:
            continue

        task_id = str(uuid.uuid4())
        input_path = UPLOAD_DIR / f"{task_id}{ext}"
        with open(input_path, "wb") as f:
            f.write(content)

        output_path = OUTPUT_DIR / f"{task_id}_upscaled.mp4"
        tasks_progress[task_id] = {"status": "queued", "progress": 0, "message": "排隊中..."}

        video_tasks.append({
            "task_id": task_id,
            "input_path": str(input_path),
            "output_path": str(output_path),
            "original_name": safe_filename,
        })

    if not video_tasks:
        raise HTTPException(status_code=400, detail="沒有可處理的影片檔案")

    batch_progress[batch_id] = {
        "status": "processing",
        "total": len(video_tasks),
        "completed": 0,
        "failed": 0,
        "cancelled": 0,
        "progress": 0,
        "current_index": 0,
        "message": "準備開始處理...",
        "task_ids": [t["task_id"] for t in video_tasks],
        "original_names": {t["task_id"]: t["original_name"] for t in video_tasks},
        "zip_ready": False,
    }

    background_tasks.add_task(process_video_batch, batch_id, video_tasks, target)
    background_tasks.add_task(cleanup_old_files)
    background_tasks.add_task(cleanup_old_tasks)

    return JSONResponse({
        "batch_id": batch_id,
        "total": len(video_tasks),
        "task_ids": [t["task_id"] for t in video_tasks],
        "original_names": {t["task_id"]: t["original_name"] for t in video_tasks},
    })


@app.post("/api/video/batch/{batch_id}/cancel/{task_id}")
async def video_batch_cancel_task(batch_id: str, task_id: str):
    """
    取消批次中尚未開始處理的影片任務
    只有 status == 'queued' 的任務可以取消
    """
    if batch_id not in batch_progress:
        raise HTTPException(status_code=404, detail="找不到該批次")
    if task_id not in batch_progress[batch_id]["task_ids"]:
        raise HTTPException(status_code=404, detail="該任務不在此批次中")

    tp = tasks_progress.get(task_id, {})
    if tp.get("status") != "queued":
        raise HTTPException(status_code=400, detail="只能取消排隊中的任務")

    tasks_progress[task_id] = {"status": "cancelled", "progress": 0, "message": "已取消"}

    # 清理已上傳的檔案
    for f in UPLOAD_DIR.iterdir():
        if f.stem == task_id:
            f.unlink(missing_ok=True)
            break

    return JSONResponse({"ok": True, "task_id": task_id, "status": "cancelled"})


@app.get("/api/video/batch-progress/{batch_id}")
async def video_batch_progress(batch_id: str):
    """查詢影片批量處理進度"""
    if batch_id not in batch_progress:
        raise HTTPException(status_code=404, detail="找不到該批次")

    bp = batch_progress[batch_id]
    items = []
    for tid in bp["task_ids"]:
        tp = tasks_progress.get(tid, {"status": "queued", "progress": 0, "message": "排隊中..."})
        item = {
            "task_id": tid,
            "original_name": bp["original_names"].get(tid, ""),
            "status": tp.get("status", "queued"),
            "progress": tp.get("progress", 0),
            "message": tp.get("message", ""),
            "current_frame": tp.get("current_frame"),
            "total_frames": tp.get("total_frames"),
        }
        if tp.get("status") == "completed" and "result" in tp:
            item["result"] = tp["result"]
        items.append(item)

    return JSONResponse({
        "batch_id": batch_id,
        "status": bp["status"],
        "total": bp["total"],
        "completed": bp["completed"],
        "failed": bp["failed"],
        "cancelled": bp.get("cancelled", 0),
        "progress": bp["progress"],
        "message": bp["message"],
        "items": items,
        "zip_ready": bp.get("zip_ready", False),
    })


@app.get("/api/video/batch-download/{batch_id}")
async def video_batch_download(batch_id: str):
    """下載影片批量處理結果的 ZIP 檔"""
    if batch_id not in batch_progress:
        raise HTTPException(status_code=404, detail="找不到該批次")
    zip_path = OUTPUT_DIR / f"{batch_id}_videos.zip"
    if not zip_path.exists():
        raise HTTPException(status_code=404, detail="ZIP 檔案尚未準備好")
    return FileResponse(path=str(zip_path), filename="videos_upscaled.zip", media_type="application/zip")


@app.get("/api/video/download-zip")
async def video_download_zip_by_task_ids(task_ids: List[str] = Query(..., description="多個影片 task_id，已完成的會打包成 ZIP")):
    """依多個影片 task_id 打包下載（供影片轉檔/壓縮多筆各別送出後一鍵下載）。最多 50 筆。"""
    if len(task_ids) > 50:
        raise HTTPException(status_code=400, detail="最多 50 個 task_id")
    import io
    buf = io.BytesIO()
    added = 0
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for task_id in task_ids:
            if not task_id or task_id not in tasks_progress:
                continue
            progress = tasks_progress[task_id]
            if progress.get("status") != "completed" or "result" not in progress:
                continue
            filename = progress["result"].get("filename")
            if not filename:
                continue
            file_path = OUTPUT_DIR / filename
            if not file_path.exists():
                continue
            arcname = progress["result"].get("download_name", filename)
            zf.write(str(file_path), arcname)
            added += 1
    if added == 0:
        raise HTTPException(status_code=400, detail="沒有可打包的已完成影片")
    buf.seek(0)
    return Response(
        content=buf.getvalue(),
        media_type="application/zip",
        headers={"Content-Disposition": "attachment; filename=converted_videos.zip"},
    )


@app.get("/api/video/progress/{task_id}")
async def video_progress(task_id: str):
    """查詢影片處理進度"""
    if task_id not in tasks_progress:
        raise HTTPException(status_code=404, detail="找不到該任務")
    return JSONResponse(tasks_progress[task_id])


@app.get("/api/video/download/{task_id}")
async def video_download(task_id: str):
    """下載處理後的影片"""
    if task_id not in tasks_progress:
        raise HTTPException(status_code=404, detail="找不到該任務")
    progress = tasks_progress[task_id]
    if progress["status"] != "completed":
        raise HTTPException(status_code=400, detail="影片尚未處理完成")
    filename = progress["result"]["filename"]
    file_path = OUTPUT_DIR / filename
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="檔案不存在")
    download_name = progress["result"].get("download_name", filename)
    ext = Path(filename).suffix.lower()
    video_media_types = {".mp4": "video/mp4", ".webm": "video/webm", ".mkv": "video/x-matroska", ".avi": "video/x-msvideo", ".mov": "video/quicktime"}
    media_type = video_media_types.get(ext, "application/octet-stream")
    return FileResponse(path=str(file_path), filename=download_name, media_type=media_type)


# =====================================================================
#  圖片轉檔 / 影片轉檔 / 壓縮 API
# =====================================================================

def _get_image_convert_ext(fmt: str) -> str:
    """將 format 參數轉成副檔名（含點）。"""
    fmt = (fmt or "").strip().lower()
    if fmt in ("jpg", "jpeg"):
        return ".jpg"
    if fmt in ("png", "webp", "bmp", "tiff", "tif"):
        return ".tiff" if fmt == "tif" else f".{fmt}"
    return ".png"


@app.post("/api/convert/image")
async def convert_image(background_tasks: BackgroundTasks, file: UploadFile = File(...), format: str = Form("png")):
    """圖片轉檔：上傳圖片後轉成指定格式（含 HEIC/RAW 轉 JPG/PNG 等）。"""
    safe_filename = sanitize_filename(file.filename)
    ext = Path(safe_filename).suffix.lower()
    allowed_for_convert = ALLOWED_EXTENSIONS | CONVERT_ONLY_EXTENSIONS
    if ext not in allowed_for_convert:
        raise HTTPException(status_code=400, detail=f"不支援的圖片格式: {ext}")
    out_ext = _get_image_convert_ext(format)
    content = await file.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail=f"檔案太大，最大 {MAX_FILE_SIZE // (1024*1024)}MB")
    # HEIC/RAW 不檢查 magic bytes（格式特殊），其餘仍驗證
    if ext not in CONVERT_ONLY_EXTENSIONS and not validate_image_magic_bytes(content):
        raise HTTPException(status_code=400, detail="檔案內容不是有效的圖片格式")
    task_id = str(uuid.uuid4())
    input_path = UPLOAD_DIR / f"{task_id}{ext}"
    with open(input_path, "wb") as f:
        f.write(content)
    output_path = OUTPUT_DIR / f"{task_id}_converted{out_ext}"
    tasks_progress[task_id] = {"status": "queued", "progress": 0, "message": "排隊中..."}
    background_tasks.add_task(process_convert_image, task_id, str(input_path), str(output_path), format, safe_filename)
    background_tasks.add_task(cleanup_old_files)
    background_tasks.add_task(cleanup_old_tasks)
    return JSONResponse({"task_id": task_id, "message": "已加入轉檔佇列", "original_filename": safe_filename})


@app.post("/api/convert/batch-image")
async def convert_batch_image(background_tasks: BackgroundTasks, files: List[UploadFile] = File(...), format: str = Form("png")):
    """批量圖片轉檔：多檔上傳，轉成指定格式。執行前可取消單一項目。"""
    if len(files) > 20:
        raise HTTPException(status_code=400, detail="一次最多 20 張")
    allowed = ALLOWED_EXTENSIONS | CONVERT_ONLY_EXTENSIONS
    out_ext = _get_image_convert_ext(format)
    batch_id = str(uuid.uuid4())
    file_tasks = []

    for file in files:
        safe_filename = sanitize_filename(file.filename)
        ext = Path(safe_filename).suffix.lower()
        if ext not in allowed:
            continue
        content = await file.read()
        if len(content) > MAX_FILE_SIZE:
            continue
        if ext not in CONVERT_ONLY_EXTENSIONS and not validate_image_magic_bytes(content):
            continue

        task_id = str(uuid.uuid4())
        input_path = UPLOAD_DIR / f"{task_id}{ext}"
        with open(input_path, "wb") as f:
            f.write(content)
        output_path = OUTPUT_DIR / f"{task_id}_converted{out_ext}"
        tasks_progress[task_id] = {"status": "queued", "progress": 0, "message": "排隊中..."}
        file_tasks.append({
            "task_id": task_id,
            "input_path": str(input_path),
            "output_path": str(output_path),
            "original_name": safe_filename,
        })

    if not file_tasks:
        raise HTTPException(status_code=400, detail="沒有可處理的檔案")

    batch_progress[batch_id] = {
        "status": "processing",
        "total": len(file_tasks),
        "completed": 0,
        "failed": 0,
        "cancelled": 0,
        "progress": 0,
        "current_index": 0,
        "message": "準備開始轉檔...",
        "task_ids": [t["task_id"] for t in file_tasks],
        "original_names": {t["task_id"]: t["original_name"] for t in file_tasks},
        "zip_ready": False,
    }
    background_tasks.add_task(process_convert_batch, batch_id, file_tasks, format)
    background_tasks.add_task(cleanup_old_files)
    background_tasks.add_task(cleanup_old_tasks)
    return JSONResponse({
        "batch_id": batch_id,
        "total": len(file_tasks),
        "task_ids": [t["task_id"] for t in file_tasks],
        "original_names": {t["task_id"]: t["original_name"] for t in file_tasks},
    })


@app.post("/api/convert/batch/{batch_id}/cancel/{task_id}")
async def convert_batch_cancel_task(batch_id: str, task_id: str):
    """取消批次轉檔中尚未開始的項目（僅限 status 為 queued）。"""
    if batch_id not in batch_progress:
        raise HTTPException(status_code=404, detail="找不到該批次")
    if task_id not in batch_progress[batch_id]["task_ids"]:
        raise HTTPException(status_code=404, detail="該任務不在此批次中")
    tp = tasks_progress.get(task_id, {})
    if tp.get("status") != "queued":
        raise HTTPException(status_code=400, detail="僅能取消尚未開始的項目")
    tasks_progress[task_id] = {"status": "cancelled", "progress": 0, "message": "已取消"}
    return JSONResponse({"ok": True, "message": "已取消"})


@app.post("/api/convert/video")
async def convert_video(background_tasks: BackgroundTasks, file: UploadFile = File(...), format: str = Form("mp4")):
    """影片轉檔：上傳影片後轉成指定格式（mp4 / webm / mkv / avi / mov）。需 FFmpeg。"""
    if not _FFMPEG_OK:
        raise HTTPException(status_code=400, detail="FFmpeg 未安裝，無法轉檔")
    safe_filename = sanitize_filename(file.filename)
    ext = Path(safe_filename).suffix.lower()
    if ext not in VIDEO_EXTENSIONS:
        raise HTTPException(status_code=400, detail=f"不支援的影片格式: {ext}")
    fmt = (format or "mp4").strip().lower()
    if fmt not in ("mp4", "webm", "mkv", "avi", "mov"):
        fmt = "mp4"
    out_ext = f".{fmt}"
    content = await file.read()
    if len(content) > MAX_VIDEO_SIZE:
        raise HTTPException(status_code=400, detail=f"影片太大，最大 {MAX_VIDEO_SIZE // (1024*1024)}MB")
    task_id = str(uuid.uuid4())
    input_path = UPLOAD_DIR / f"{task_id}{ext}"
    with open(input_path, "wb") as f:
        f.write(content)
    output_path = OUTPUT_DIR / f"{task_id}_converted{out_ext}"
    tasks_progress[task_id] = {"status": "queued", "progress": 0, "message": "排隊中..."}
    background_tasks.add_task(process_convert_video, task_id, str(input_path), str(output_path), fmt, safe_filename)
    background_tasks.add_task(cleanup_old_files)
    background_tasks.add_task(cleanup_old_tasks)
    return JSONResponse({"task_id": task_id, "message": "已加入轉檔佇列", "original_filename": safe_filename})


@app.post("/api/compress/image")
async def compress_image(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    quality: int = Form(80),
    max_width: Optional[int] = Form(None),
    max_height: Optional[int] = Form(None),
):
    """圖片壓縮：可選品質 1–100、最大寬/高（保持比例）。"""
    safe_filename = sanitize_filename(file.filename)
    ext = Path(safe_filename).suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail=f"不支援的圖片格式: {ext}")
    content = await file.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail=f"檔案太大，最大 {MAX_FILE_SIZE // (1024*1024)}MB")
    if not validate_image_magic_bytes(content):
        raise HTTPException(status_code=400, detail="檔案內容不是有效的圖片格式")
    task_id = str(uuid.uuid4())
    input_path = UPLOAD_DIR / f"{task_id}{ext}"
    with open(input_path, "wb") as f:
        f.write(content)
    output_path = OUTPUT_DIR / f"{task_id}_compressed{ext}"
    tasks_progress[task_id] = {"status": "queued", "progress": 0, "message": "排隊中..."}
    background_tasks.add_task(
        process_compress_image,
        task_id,
        str(input_path),
        str(output_path),
        quality,
        max_width,
        max_height,
        safe_filename,
    )
    background_tasks.add_task(cleanup_old_files)
    background_tasks.add_task(cleanup_old_tasks)
    return JSONResponse({"task_id": task_id, "message": "已加入壓縮佇列", "original_filename": safe_filename})


@app.post("/api/compress/video")
async def compress_video(background_tasks: BackgroundTasks, file: UploadFile = File(...), crf: int = Form(23)):
    """影片壓縮：H.264 壓縮，crf 18–28（愈小愈高畫質）。需 FFmpeg。"""
    if not _FFMPEG_OK:
        raise HTTPException(status_code=400, detail="FFmpeg 未安裝，無法壓縮影片")
    safe_filename = sanitize_filename(file.filename)
    ext = Path(safe_filename).suffix.lower()
    if ext not in VIDEO_EXTENSIONS:
        raise HTTPException(status_code=400, detail=f"不支援的影片格式: {ext}")
    content = await file.read()
    if len(content) > MAX_VIDEO_SIZE:
        raise HTTPException(status_code=400, detail=f"影片太大，最大 {MAX_VIDEO_SIZE // (1024*1024)}MB")
    task_id = str(uuid.uuid4())
    input_path = UPLOAD_DIR / f"{task_id}{ext}"
    with open(input_path, "wb") as f:
        f.write(content)
    output_path = OUTPUT_DIR / f"{task_id}_compressed.mp4"
    tasks_progress[task_id] = {"status": "queued", "progress": 0, "message": "排隊中..."}
    background_tasks.add_task(process_compress_video, task_id, str(input_path), str(output_path), crf, safe_filename)
    background_tasks.add_task(cleanup_old_files)
    background_tasks.add_task(cleanup_old_tasks)
    return JSONResponse({"task_id": task_id, "message": "已加入壓縮佇列", "original_filename": safe_filename})


# =====================================================================
#  歷史紀錄 API — 讓使用者重開瀏覽器後仍能看到並下載已完成的任務
# =====================================================================
@app.get("/api/history")
async def get_history():
    """取得最近完成的任務紀錄（自動排除已過期/已刪除的檔案）"""
    valid_history = cleanup_expired_history()
    # 最新的排在前面
    return JSONResponse(list(reversed(valid_history)))


@app.delete("/api/history")
async def clear_history():
    """手動清除歷史紀錄"""
    if HISTORY_FILE.exists():
        HISTORY_FILE.unlink()
    return JSONResponse({"status": "ok", "message": "歷史紀錄已清除"})


# =====================================================================
#  手動清理 API — 讓使用者從網頁 UI 清除所有暫存檔案
# =====================================================================
@app.post("/api/cleanup")
async def manual_cleanup():
    """手動清除 uploads/、outputs/、temp_frames/ 及歷史紀錄"""
    cleaned = cleanup_temp_directories()
    return JSONResponse({
        "status": "ok",
        "cleaned": cleaned,
        "message": f"已清除 {cleaned} 個暫存檔案" if cleaned > 0 else "沒有需要清理的檔案"
    })


# =====================================================================
#  伺服器狀態 API — 用於前端檢測伺服器是否仍在運行
# =====================================================================
@app.get("/api/ping")
async def ping():
    """伺服器存活檢測"""
    return JSONResponse({"status": "alive"})


# =====================================================================
#  主程式進入點
# =====================================================================
if __name__ == "__main__":
    import uvicorn
    print("=" * 58)
    print("  AI Image & Video Upscaler v3.1")
    print("  圖片 & 影片超解析度提升工具")
    print("=" * 58)

    # 顯示 GPU/CPU 狀態
    if _GPU_WORKS:
        print(f"  運算裝置 : GPU ({torch.cuda.get_device_name(0)})")
    else:
        print("  運算裝置 : CPU (處理速度較慢)")

    # 顯示 FFmpeg 狀態
    if _FFMPEG_OK:
        print("  FFmpeg   : OK (影片處理可用)")
    else:
        print("  FFmpeg   : 未安裝 (影片功能將無法使用)")
        print("              請安裝 FFmpeg: https://ffmpeg.org/download.html")

    # 檢查模型檔案是否已存在
    model_x2 = WEIGHTS_DIR / "RealESRGAN_x2plus.pth"
    model_x4 = WEIGHTS_DIR / "RealESRGAN_x4plus.pth"
    x2_ok = model_x2.exists()
    x4_ok = model_x4.exists()

    if x2_ok and x4_ok:
        print(f"  AI 模型   : 2K 模型 OK | 4K 模型 OK (離線就緒)")
    else:
        missing = []
        if not x2_ok:
            missing.append("2K (RealESRGAN_x2plus.pth)")
        if not x4_ok:
            missing.append("4K (RealESRGAN_x4plus.pth)")
        print(f"  AI 模型   : 缺少 {', '.join(missing)}")
        print(f"              首次處理時將自動下載 (需要網路連線)")
        print(f"              下載後存放於: {WEIGHTS_DIR.resolve()}")

    print(f"  模型路徑  : {WEIGHTS_DIR.resolve()}")
    print("-" * 58)
    print("  啟動伺服器: http://localhost:8000")
    print("  按 Ctrl+C 停止伺服器")
    print("=" * 58)
    # 安全性：綁定 127.0.0.1 而非 0.0.0.0
    # 0.0.0.0 會讓同一區網內的所有設備都能存取此服務
    # 127.0.0.1 僅允許本機存取，防止未授權的外部連線
    uvicorn.run(app, host="127.0.0.1", port=8000)
