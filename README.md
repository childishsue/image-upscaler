# AI Image & Video Upscaler v3.2 - 圖片 & 影片超解析度與轉檔壓縮工具

使用 **Real-ESRGAN** 深度學習模型 + **FFmpeg** 影片處理引擎：
- **圖片放大**：提升至 **800×800 / 1K (1024×1024) / 2K / 4K**，支援批量處理（最多 20 張）
- **影片放大**：提升至 **720P / 1080P / 2K / 4K**，逐幀 AI 處理 + 自動複製音訊，批量最多 10 部
- **圖片轉檔**：轉成 PNG、JPEG、WebP、BMP、TIFF，支援 **HEIC/RAW** 輸入，多選時每張可選不同格式，一鍵 ZIP 下載
- **影片轉檔**：轉成 MP4、WebM、MKV、AVI、MOV，多選時每部可選不同格式，一鍵 ZIP 下載
- **圖片壓縮**：可設品質與最大寬/高（預設為原圖尺寸，改一邊自動等比另一邊），批量最多 20 張
- **影片壓縮**：可設 CRF (18–28)，批量最多 10 部，一鍵 ZIP 下載
- **歷史任務**：重開瀏覽器仍可看到最近完成的任務並下載，列表顯示**輸出檔名**（正確副檔名），最新完成排在最上
- **手動清理**：暫存檔案不會在關閉伺服器時自動刪除，需從網頁「清除所有暫存檔案」按鈕手動清除

**安裝完成後可完全離線使用**（影片轉檔/壓縮需安裝 FFmpeg）。

---

## 一、軟體功能

| 功能 | 說明 |
|------|------|
| AI 超解析度 | 基於 Real-ESRGAN 模型，智能放大圖片/影片並自動補充細節紋理 |
| 圖片多解析度輸出 | 可選擇 800×800、1K (1024×1024)、2K、4K，非正方形圖會等比縮放不變形 |
| 影片多解析度輸出 | 可選擇 720P / 1080P / 2K / 4K 四種目標解析度 |
| 圖片轉檔 | 轉成 PNG、JPEG、WebP、BMP、TIFF；支援 HEIC/HEIF、相機 RAW 輸入；多選時每張可選不同格式，一鍵 ZIP 下載 |
| 影片轉檔 | 轉成 MP4、WebM、MKV、AVI、MOV；多選時每部可選不同格式，一鍵 ZIP 下載 |
| 圖片壓縮 | 可設品質 (1–100) 與最大寬/高（預設為原圖尺寸，改一邊自動等比另一邊），批量最多 20 張 |
| 影片壓縮 | 可設 CRF (18–28)，批量最多 10 部，一鍵 ZIP 下載 |
| 六頁籤介面 | 圖片放大、影片放大、圖片轉檔、影片轉檔、圖片壓縮、影片壓縮，各功能獨立頁籤 |
| 批量處理 | 圖片放大最多 20 張、影片放大最多 10 部；轉檔/壓縮同為多選，完成後可一鍵 ZIP |
| GPU 加速 | 支援 NVIDIA CUDA GPU 加速（含 RTX 50 系列 Blackwell 架構） |
| 智能模型選擇 | 根據原圖/影片尺寸自動選擇 x2 或 x4 模型 |
| 即時進度 | 圖片/影片即時顯示處理進度（影片顯示幀進度） |
| 前後對比 | 單張圖片放大結果提供滑桿式對比（支援滑鼠和觸控） |
| 拖曳上傳 | 全程支援拖曳新增（初始上傳區域和選項面板都支援） |
| 自訂檔名 | 放大：`原始檔名_解析度_日期_時間`；轉檔：`原始檔名_converted.副檔名`；壓縮：`原始檔名_compressed.副檔名` |
| 影片音訊保留 | 影片處理時自動偵測並複製原始音訊軌 |
| 歷史任務紀錄 | 重開瀏覽器後仍可看到最近完成的任務並下載（最多 50 筆），**顯示輸出檔名**（正確副檔名），最新在上 |
| 手動清理暫存 | 關閉伺服器不會刪除檔案；網頁提供「清除所有暫存檔案」按鈕手動清除 |
| 本地處理 | 所有運算在本地完成，不會上傳至任何第三方伺服器 |
| 自動回退 | GPU 不可用時自動回退至 CPU 模式 |

---

## 二、使用方式

### 環境需求
- **Python 3.11 或 3.12**（建議，可減少安裝與執行錯誤；3.10 或 3.14 等可能需額外排查）
- **建議 8GB+ RAM**
- **NVIDIA GPU + CUDA**（可選，大幅加速。支援 RTX 50 系列）
- **FFmpeg**（影片功能需要，圖片功能不需要）
  - 安裝方式：`winget install Gyan.FFmpeg` 或從 [ffmpeg.org](https://ffmpeg.org/download.html) 下載

### 安裝步驟

```bash
# 1. 進入專案目錄
cd image-upscaler

# 2. 雙擊安裝腳本 (二擇一)
install_gpu.bat    # 有 NVIDIA GPU 時使用 (推薦)
install_cpu.bat    # 只有 CPU 時使用
```

### 啟動服務

```bash
# 雙擊啟動
start.bat
```

啟動後打開瀏覽器訪問：**http://localhost:8000**

**重要**：
- **CMD 視窗必須保持開啟**，關閉視窗 = 關閉伺服器，網頁會無法連線（ERR_CONNECTION_REFUSED）
- 關閉瀏覽器不會停止伺服器，重新打開 http://localhost:8000 即可繼續使用
- 暫存檔案（uploads/、outputs/）**不會**在關閉伺服器時自動刪除；若要釋放空間，請在網頁「最近完成的任務」區塊點擊「清除所有暫存檔案」

### 操作步驟

**圖片放大：**
1. 切換到「圖片放大」頁籤
2. **上傳圖片** — 拖曳圖片到虛線框，或點擊選擇檔案（支援多選）；新選的檔案會排在最上面
3. **繼續新增** — 已選檔案後，可繼續拖曳到面板新增，或點「繼續新增」按鈕
4. **選擇解析度** — 800×800、1K (1024×1024)、2K、4K（非正方形圖會等比縮放不變形）
5. **開始處理** — 點擊按鈕，觀察即時進度
6. **下載結果** — 單張有前後對比預覽；批量可個別下載或一鍵 ZIP

**影片放大：**
1. 切換到「影片放大」頁籤
2. **上傳影片** — 拖曳影片到虛線框，或點擊選擇（支援多選，批量最多 10 部）
3. **選擇解析度** — 720P / 1080P / 2K / 4K
4. **開始處理** — AI 逐幀處理，即時顯示幀進度；可取消尚未開始的佇列項目
5. **下載結果** — 完成後可個別下載或一鍵下載全部 ZIP

**圖片轉檔：**
1. 切換到「圖片轉檔」頁籤
2. **選擇檔案** — 可多選（最多 20 張），支援一般圖檔與 HEIC、相機 RAW
3. **每張選輸出格式** — PNG、JPEG、WebP、BMP、TIFF，執行前可點 × 移除
4. **開始轉檔** — 多筆完成後可個別下載或「一鍵下載全部 (ZIP)」

**影片轉檔：**
1. 切換到「影片轉檔」頁籤（需安裝 FFmpeg）
2. **選擇檔案** — 可多選（最多 10 部）
3. **每部選輸出格式** — MP4、WebM、MKV、AVI、MOV，執行前可點 × 移除
4. **開始轉檔** — 多筆完成後可個別下載或一鍵 ZIP

**圖片壓縮：**
1. 切換到「圖片壓縮」頁籤
2. **選擇檔案** — 可多選（最多 20 張）
3. **每張設品質與最大寬/高** — 最大寬高預設為原圖尺寸，改任一邊會自動算出等比另一邊；品質 1–100
4. **開始壓縮** — 多筆完成後可個別下載或一鍵 ZIP

**影片壓縮：**
1. 切換到「影片壓縮」頁籤（需安裝 FFmpeg）
2. **選擇檔案** — 可多選（最多 10 部）
3. **每部設 CRF** — 18（高畫質）～28（較小檔案）
4. **開始壓縮** — 多筆完成後可個別下載或一鍵 ZIP

> **注意**：影片放大需逐幀 AI 運算，時間較長。關閉 **CMD 視窗**才會停止伺服器；關閉瀏覽器不影響伺服器運行。

### 下載檔名格式

| 功能 | 格式範例 |
|------|----------|
| 圖片/影片放大 | `原始檔名_解析度_日期_時間.副檔名`（如 `風景照_2K_20260215_2218.jpg`） |
| 轉檔 | `原始檔名_converted.副檔名`（如 `photo_converted.png`） |
| 壓縮 | `原始檔名_compressed.副檔名`（如 `photo_compressed.jpg`） |

完成列表與歷史任務會顯示**輸出檔名**（含正確副檔名），方便辨識下載內容。

---

## 三、離線使用與模型備份

### 離線能力

本軟體在**首次安裝完成並處理過至少一張圖片後**，即可完全離線使用，不再需要任何網路連線。

| 項目 | 需要網路？ | 說明 |
|------|-----------|------|
| 首次安裝 (`install_*.bat`) | 需要 | 從 PyPI 下載 Python 套件 |
| 首次處理 2K 圖片 | 需要 | 自動下載 `RealESRGAN_x2plus.pth` (約 64MB) |
| 首次處理 4K 圖片 | 需要 | 自動下載 `RealESRGAN_x4plus.pth` (約 64MB) |
| 後續所有使用 | **不需要** | 完全離線運作 |
| 網頁介面 | **不需要** | 字型和圖示已內建本地 |

### 模型備份（重要）

AI 模型權重檔存放在 `weights/` 資料夾中。**強烈建議備份此資料夾**，原因：

1. 模型來源（GitHub Releases）可能在未來某天不可用
2. 備份後可在新電腦上直接使用，無需重新下載
3. 兩個模型檔案總共約 128MB

```
image-upscaler/
└── weights/                          ← 請備份這整個資料夾
    ├── RealESRGAN_x2plus.pth         ← 2K 放大模型 (~64MB)
    └── RealESRGAN_x4plus.pth         ← 4K 放大模型 (~64MB)
```

### 手動放置模型（當自動下載失敗時）

如果所有自動下載鏡像都失敗（例如在完全離線環境），可手動取得模型檔案：

**下載連結（任選一個來源）：**

| 模型 | GitHub (官方) | HuggingFace (備用) |
|------|--------------|-------------------|
| x2plus | [下載](https://github.com/xinntao/Real-ESRGAN/releases/download/v0.2.1/RealESRGAN_x2plus.pth) | [下載](https://huggingface.co/ai-forever/Real-ESRGAN/resolve/main/RealESRGAN_x2plus.pth) |
| x4plus | [下載](https://github.com/xinntao/Real-ESRGAN/releases/download/v0.1.0/RealESRGAN_x4plus.pth) | [下載](https://huggingface.co/ai-forever/Real-ESRGAN/resolve/main/RealESRGAN_x4plus.pth) |

**步驟：**
1. 從上方連結下載 `.pth` 檔案
2. 將檔案放入專案的 `weights/` 資料夾
3. 確認檔名為 `RealESRGAN_x2plus.pth` 和 `RealESRGAN_x4plus.pth`
4. 重新執行 `start.bat`

### 如何打包給其他電腦使用

若要將整個軟體（含模型）搬移到另一台電腦：

```
需要複製的檔案：
├── app.py
├── requirements.txt
├── start.bat
├── install_gpu.bat
├── install_cpu.bat
├── install_basicsr.bat ← basicsr 獨立安裝腳本（由 install_*.bat 自動呼叫）
├── README.md
├── templates/          ← 整個資料夾
├── static/             ← 整個資料夾
└── weights/            ← 整個資料夾（含 .pth 模型檔案）

不需要複製：
├── venv/               ← 新電腦要重新安裝 (執行 install_*.bat)
├── uploads/            ← 暫存檔案，自動生成
├── outputs/            ← 暫存檔案，自動生成
└── temp_frames/        ← 影片拆幀暫存，自動生成
```

在新電腦上只需執行 `install_gpu.bat`（或 `install_cpu.bat`），然後 `start.bat` 即可使用。
如果已帶上 `weights/` 資料夾，則**完全不需要網路**即可處理圖片。

---

## 四、檔案結構與說明

```
image-upscaler/
│
├── app.py                     # [核心] Python 後端主程式
│                              #   - FastAPI Web 伺服器
│                              #   - Real-ESRGAN 模型載入與推論
│                              #   - 圖片單張/批量處理、影片處理 (FFmpeg 拆幀 → AI → 合成)
│                              #   - 轉檔 (圖片/影片)、壓縮 (圖片/影片)、download-zip 依 task_ids 打包
│                              #   - 所有 API 端點定義 (圖片、影片、轉檔、壓縮、歷史、清理)
│                              #   - 檔案清理、命名格式等工具函數
│
├── requirements.txt           # Python 依賴套件清單
│                              #   - fastapi, uvicorn (Web 框架)
│                              #   - torch, torchvision (PyTorch 深度學習)
│                              #   - realesrgan, basicsr, gfpgan (AI 模型)
│                              #   - opencv-python (圖片處理)
│
├── start.bat                  # Windows 一鍵啟動腳本
│                              #   - 啟動前自動檢查 port 8000，若被佔用則釋放
│                              #   - 自動搜尋 Python 路徑（無 goto 標籤，避免 CMD UTF-8 問題）
│                              #   - 首次啟動自動建立 venv + 安裝依賴
│                              #   - 關閉 CMD 視窗即停止伺服器（不自動清理暫存）
│
├── install_gpu.bat            # GPU 版安裝腳本 (PyTorch + CUDA 12.8)
├── install_cpu.bat            # CPU 版安裝腳本
├── install_basicsr.bat        # basicsr 獨立安裝（由 install_*.bat 自動呼叫，減少安裝失敗）
│
├── README.md                  # 本說明文件
│
├── templates/
│   └── index.html             # [前端] HTML 頁面模板 (Jinja2)
│                              #   - 導航列 (顯示 GPU/CPU 狀態)
│                              #   - 六頁籤：圖片放大、影片放大、圖片轉檔、影片轉檔、圖片壓縮、影片壓縮
│                              #   - 圖片/影片上傳 (拖曳/點擊/多選)；解析度 800/1K/2K/4K、720P～4K
│                              #   - 轉檔/壓縮：多選、每筆自訂格式或品質/尺寸，一鍵 ZIP 下載
│                              #   - 處理進度 (共用)、結果頁面 (完成列表顯示輸出檔名，最新在上)
│                              #   - 最近完成的任務（顯示輸出檔名）+ 「清除所有暫存檔案」
│                              #   - 伺服器離線偵測與自動重新載入、FFmpeg 未安裝提示
│
├── static/
│   ├── css/
│   │   ├── fonts.css          # [前端] 本地字型定義 (離線可用)
│   │   │                      #   - Material Symbols 圖示 (本地 woff2)
│   │   │                      #   - Noto Sans TC 本機偵測 (local())
│   │   │                      #   - 不依賴任何外部 CDN
│   │   │
│   │   └── style.css          # [前端] CSS 樣式
│   │                          #   - CSS 變數定義 (顏色、陰影、圓角)
│   │                          #   - 多層退路字型鏈 (離線友善)
│   │                          #   - 導航列、Hero 區域
│   │                          #   - 上傳區域 (拖曳效果)
│   │                          #   - 檔案清單樣式 (縮圖、滾動)
│   │                          #   - 拖曳覆蓋提示 (紫色半透明)
│   │                          #   - 解析度選擇卡片
│   │                          #   - 進度條 (shimmer 動畫)
│   │                          #   - 前後對比滑桿
│   │                          #   - 批量進度/結果列表
│   │                          #   - 響應式設計 (768px, 480px 斷點)
│   │
│   ├── fonts/
│   │   └── MaterialSymbolsOutlined.woff2  # 圖示字型 (本地內建，約 306KB)
│   │                                      #   離線時確保所有圖示正常顯示
│   │
│   └── js/
│       └── main.js            # [前端] JavaScript 控制邏輯
│                              #   - 六頁籤切換 (圖片/影片/轉檔/壓縮各獨立)
│                              #   - 圖片/影片：拖曳上傳、多檔管理（新選的排最上）、輪詢、結果（顯示輸出檔名、最新在上）
│                              #   - 轉檔/壓縮：多選、每筆自訂格式或品質/尺寸、輪詢、一鍵 ZIP
│                              #   - 圖片壓縮：最大寬高預設原圖尺寸、改一邊自動等比另一邊、品質/尺寸不可為空
│                              #   - 歷史任務載入與渲染（顯示輸出檔名）、手動清理按鈕
│                              #   - 前後對比滑桿 (滑鼠/觸控)、伺服器存活偵測
│
├── uploads/                   # [暫存] 使用者上傳的原始圖片/影片
│                              #   檔名: {task_id}.{ext}
│                              #   僅能透過網頁「清除所有暫存檔案」手動清除
│
├── outputs/                   # [暫存] 處理後的圖片/影片 + ZIP
│                              #   放大: {task_id}_upscaled.{ext}；轉檔/壓縮: {task_id}_*.*
│                              #   ZIP: {batch_id}_all.zip、converted_*.zip 等
│                              #   僅能透過網頁「清除所有暫存檔案」手動清除
│
├── temp_frames/               # [暫存] 影片拆幀暫存（手動清理時一併清除）
│
├── history.json               # [暫存] 最近完成任務紀錄（手動清理時一併清除）
│
├── weights/                   # AI 模型權重 (首次使用自動下載)
│                              #   - RealESRGAN_x2plus.pth (~64MB)
│                              #   - RealESRGAN_x4plus.pth (~64MB)
│
└── venv/                      # Python 虛擬環境 (安裝後自動產生)
```

---

## 五、API 端點一覽

**圖片 API：**

| 方法 | 路徑 | 說明 |
|------|------|------|
| GET | `/` | 首頁 |
| POST | `/api/upload` | 單張上傳 (FormData: file + target) |
| POST | `/api/batch-upload` | 批量上傳 (FormData: files[] + target) |
| GET | `/api/progress/{task_id}` | 查詢單張處理進度 |
| GET | `/api/batch-progress/{batch_id}` | 查詢批量處理進度 |
| GET | `/api/download/{task_id}` | 下載單張結果 |
| GET | `/api/batch-download/{batch_id}` | 下載批量結果 ZIP |
| GET | `/api/preview/{task_id}` | 預覽處理後圖片 |
| GET | `/api/preview-original/{task_id}` | 預覽原始圖片 |
| GET | `/api/download-zip` | 依 task_ids 打包多筆圖片結果 (轉檔/壓縮完成後一鍵 ZIP) |
| GET | `/api/system-info` | 系統資訊 (GPU/CPU、FFmpeg、支援格式等) |

**轉檔與壓縮 API：**

| 方法 | 路徑 | 說明 |
|------|------|------|
| POST | `/api/convert/image` | 圖片轉檔 (file + format：png/jpeg/webp/bmp/tiff，支援 HEIC/RAW 輸入) |
| POST | `/api/convert/video` | 影片轉檔 (file + format：mp4/webm/mkv/avi/mov) |
| POST | `/api/compress/image` | 圖片壓縮 (file + quality + 可選 max_width/max_height) |
| POST | `/api/compress/video` | 影片壓縮 (file + crf) |

**影片 API：**

| 方法 | 路徑 | 說明 |
|------|------|------|
| POST | `/api/video/upload` | 單部影片上傳 |
| POST | `/api/video/batch-upload` | 批量影片上傳 (FormData: files + target) |
| GET | `/api/video/progress/{task_id}` | 查詢影片處理進度 |
| GET | `/api/video/batch-progress/{batch_id}` | 查詢影片批量進度 |
| GET | `/api/video/download/{task_id}` | 下載處理後影片 |
| GET | `/api/video/batch-download/{batch_id}` | 下載影片批量 ZIP |
| GET | `/api/video/download-zip` | 依 task_ids 打包多筆影片結果 (轉檔/壓縮完成後一鍵 ZIP) |
| POST | `/api/video/batch/{batch_id}/cancel/{task_id}` | 取消佇列中尚未開始的影片任務 |

**系統 API：**

| 方法 | 路徑 | 說明 |
|------|------|------|
| GET | `/api/history` | 取得最近完成的任務紀錄 |
| DELETE | `/api/history` | 清除歷史紀錄 |
| POST | `/api/cleanup` | 手動清除所有暫存檔案（uploads、outputs、temp_frames、history.json） |
| GET | `/api/ping` | 伺服器存活檢測 |

---

## 六、效能參考

**圖片處理：**

| 設備 | 單張 (1080p→4K) | 單張 (720p→2K) |
|------|-----------------|----------------|
| RTX 5060 | ~3-5 秒 | ~2-3 秒 |
| RTX 4090 | ~2 秒 | ~1 秒 |
| RTX 3060 | ~5 秒 | ~3 秒 |
| CPU (i7) | ~60 秒 | ~30 秒 |

> 批量處理時間 = 單張時間 × 張數（依序處理）

**影片處理（預估）：**

| 設備 | 30 秒影片 (720p→1080P, ~900 幀) | 10 秒影片 (480p→4K, ~300 幀) |
|------|-------------------------------|-------------------------------|
| RTX 5060 | ~30-60 分鐘 | ~15-25 分鐘 |
| RTX 4090 | ~15-30 分鐘 | ~5-10 分鐘 |
| CPU | 數小時（不建議） | ~1-2 小時 |

> 影片處理時間 = 每幀處理時間 × 總幀數。建議先用短片（5-10 秒）測試。

---

## 七、常見問題

| 問題 | 解決方案 |
|------|---------|
| 無法連上網站 / ERR_CONNECTION_REFUSED | 表示伺服器未運行。請雙擊 `start.bat` 啟動，並**保持 CMD 視窗開啟**；關閉視窗即關閉伺服器 |
| 關閉瀏覽器後再開就連不上？ | 關閉瀏覽器不會停止伺服器。若連不上，代表 CMD 視窗被關掉了，請重新執行 `start.bat`；頁面會自動偵測伺服器恢復並重新載入 |
| 暫存檔案會自動刪除嗎？ | 不會。關閉伺服器不會刪除 uploads/、outputs/。若要釋放空間，請在網頁「最近完成的任務」區塊點「清除所有暫存檔案」 |
| 處理速度很慢 | 使用 NVIDIA GPU 搭配 CUDA 加速。CPU 模式處理一張約 30-120 秒 |
| CUDA error: no kernel image | PyTorch 版本不支援您的 GPU，執行 `install_gpu.bat` 重新安裝 cu128 版本 |
| 記憶體不足 | 程式已使用 tile 模式分塊處理，確保至少 8GB RAM |
| 模型下載失敗 | 手動下載模型放置於 `weights/` 資料夾（見下方連結） |
| FFmpeg 未安裝 | 影片功能需要 FFmpeg。Windows 可執行 `winget install Gyan.FFmpeg`，安裝後重新執行 `start.bat` |
| 安裝時出現 basicsr / KeyError: '__version__' / 「Getting requirements to build wheel ... error」 | 多為 pip 從原始碼建置 basicsr 1.4.2 失敗。本專案安裝腳本已改為先裝 basicsr 預編譯版並鎖定版本，請使用**最新版**的 install_cpu.bat / install_gpu.bat 與 requirements.txt；若仍失敗，再執行一次 install_cpu.bat 或 install_gpu.bat。 |
| 安裝失敗：未偵測到 Python | 電腦尚未安裝 Python。請先安裝 **Python 3.11 或 3.12**：https://www.python.org/downloads/ ，安裝時務必勾選「Add Python to PATH」，再執行 install_cpu.bat 或 install_gpu.bat。 |
| 安裝成功但 start.bat 出現 ImportError（如 `circular_lowpass_kernel`、`cannot import name ... from basicsr`） | 多為 Python 版本過新或過舊導致 basicsr 與 realesrgan 不相容。請改用 **Python 3.11 或 3.12**，刪除專案目錄下的 `venv` 資料夾後，重新執行 install_cpu.bat 或 install_gpu.bat。 |

模型手動下載連結：
- [RealESRGAN_x4plus.pth](https://github.com/xinntao/Real-ESRGAN/releases/download/v0.1.0/RealESRGAN_x4plus.pth)
- [RealESRGAN_x2plus.pth](https://github.com/xinntao/Real-ESRGAN/releases/download/v0.2.1/RealESRGAN_x2plus.pth)

---

## 八、開發中遭遇的問題及解法

### 問題 1：系統找不到 Python

**狀況**：執行 `start.bat` 後伺服器完全無法啟動，終端機顯示找不到 Python。

**原因**：Windows 系統 PATH 中的 `python.exe` 指向 Microsoft Store 的虛擬入口（位於 `C:\Users\...\WindowsApps\python.exe`），這只是一個商店導向的捷徑，並非真正安裝的 Python。

**解法**：
1. 使用 `winget install Python.Python.3.11` 安裝真正的 Python 3.11
2. 改寫 `start.bat`，不依賴系統 PATH，改為主動搜尋常見的 Python 安裝路徑（`%LOCALAPPDATA%\Programs\Python\Python311\` 等），優先使用 venv 內的 Python
3. 加入 `cd /d "%~dp0"` 確保從任何位置雙擊腳本都能正確切換到專案目錄

**相關檔案**：`start.bat`、`install_gpu.bat`、`install_cpu.bat`

---

### 問題 2：basicsr 與新版 torchvision 不相容

**狀況**：啟動 `app.py` 時報錯：
```
ModuleNotFoundError: No module named 'torchvision.transforms.functional_tensor'
```

**原因**：`basicsr 1.4.2`（Real-ESRGAN 的依賴）在內部使用了 `from torchvision.transforms.functional_tensor import rgb_to_grayscale`，但此模組在新版 torchvision (0.20+) 中已被移除，功能合併進了 `torchvision.transforms.functional`。

**解法**：在 `app.py` 最上方、匯入 basicsr 之前，建立一個假的 `functional_tensor` 模組作為相容性橋接：

```python
import types, sys
from torchvision.transforms import functional as _F
_fake_module = types.ModuleType('torchvision.transforms.functional_tensor')
_fake_module.rgb_to_grayscale = _F.rgb_to_grayscale
sys.modules['torchvision.transforms.functional_tensor'] = _fake_module
```

這讓 basicsr 的舊 import 路徑可以正常運作，而無需降版或修改第三方套件原始碼。

**相關檔案**：`app.py` 第 26-31 行

---

### 問題 2.1：basicsr 安裝失敗（KeyError: __version__）— 採用約束檔

**狀況**：執行 `install_cpu.bat` 或 `install_gpu.bat` 時，在「安裝其餘套件」階段失敗，錯誤為 `KeyError: '__version__'` 或「Getting requirements to build wheel ... error」。

**原因**：realesrgan 依賴 `basicsr>=1.4.2`，pip 會嘗試安裝 1.4.2；在許多 Windows 環境下 1.4.2 沒有預編譯輪子，pip 改從原始碼建置，basicsr 的 setup 在取得版本時會觸發上述錯誤。basicsr 1.3.3 則常有輪子可裝，且執行時與本專案相容。

**除錯方向（已採用）**：使用 **約束檔**，不讓 pip 升級 basicsr：
- 先以 `install_basicsr.bat` 安裝 basicsr 1.3.3（輪子或 --no-build-isolation）。
- 安裝其餘套件時加上 `-c constraints_basicsr.txt`（內容：`basicsr==1.3.3`），避免 pip 為滿足 realesrgan 而拉 1.4.2 並觸發從原始碼建置。

**後續除錯請維持此方向**：若安裝仍失敗，請檢查約束檔是否有被產生與傳入；勿改為 `--no-deps` 除非一併處理 realesrgan 的其他依賴。

**相關檔案**：`install_cpu.bat`、`install_gpu.bat`、`install_basicsr.bat`

---

### 問題 3：RTX 5060 (Blackwell) CUDA 不相容

**狀況**：伺服器啟動成功，但上傳圖片進行 AI 處理時報錯：
```
CUDA error: no kernel image is available for execution on the device
```

**原因**：RTX 5060 使用 NVIDIA 最新的 **Blackwell 架構**（CUDA compute capability **sm_120**）。最初安裝的 PyTorch 2.5.1+cu121 僅支援到 sm_90（Ada Lovelace），後來升級到 2.10.0+cu126 仍然不支援 sm_120。PyTorch 能偵測到 GPU 且基本的 tensor 操作可以運行，但 Real-ESRGAN 使用的複雜 CUDA kernel 需要對應架構的編譯版本。

**解法**：
1. 根據 PyTorch 的警告訊息提示，安裝 **CUDA 12.8** 版本：
   ```
   pip install torch torchvision --index-url https://download.pytorch.org/whl/cu128
   ```
   最終使用 `torch 2.10.0+cu128` 成功支援 sm_120

2. 在 `app.py` 中加入 **GPU 實際測試機制**（`check_gpu_actually_works()`）：啟動時不只檢查 `torch.cuda.is_available()`（這只判斷驅動有沒有安裝），而是實際執行一次矩陣運算。如果 GPU 雖然被偵測到但實際運算失敗，程式會自動回退到 CPU 模式，避免處理時才報錯

**版本演進**：
| 版本 | 結果 |
|------|------|
| torch 2.5.1+cu121 | 偵測到 GPU，但警告 sm_120 不支援 |
| torch 2.10.0+cu126 | 同上，AI 處理時 CUDA kernel 報錯 |
| torch 2.10.0+cu128 | 完全正常，無任何警告 |

**相關檔案**：`app.py` 第 81-95 行、`install_gpu.bat`、`start.bat`

---

### 問題 4：拖曳新增圖片在已選檔案後失效

**狀況**：第一次拖曳圖片上傳正常，但選好檔案後上傳區域被隱藏，無法再用拖曳方式新增圖片，只能透過「繼續新增」按鈕。

**原因**：初始的拖曳事件只綁定在 `uploadArea`（虛線上傳框），當使用者選好檔案後 `uploadArea` 會被 `display: none` 隱藏，取而代之的是 `optionsPanel`（檔案清單面板），但 `optionsPanel` 沒有綁定任何拖曳事件。

**解法**：
1. 在 JavaScript 中對 `optionsPanel` 也綁定 `dragover`、`dragleave`、`drop` 事件，呼叫同樣的 `addFiles()` 函數
2. `dragleave` 使用 `optionsPanel.contains(e.relatedTarget)` 判斷是否真的離開面板（避免進入子元素時閃爍）
3. 在 CSS 中加入 `.drag-over-panel::before` 偽元素，顯示紫色半透明覆蓋層和「放開以新增圖片」提示文字

**相關檔案**：`main.js` 第 105-125 行、`style.css`（`.options-panel.drag-over-panel` 區塊）

---

### 問題 5：資安強化 — XSS、路徑遍歷、記憶體洩漏等多項修復

**狀況**：安全性審查發現多項潛在漏洞。

**修復清單**：

| # | 風險 | 問題 | 修復方式 |
|---|------|------|----------|
| 1 | 高 | XSS (跨站腳本) — 前端 `innerHTML` 直接插入使用者檔名 | 新增 `escapeHtml()` 函數，所有使用者輸入的文字先消毒再插入 |
| 2 | 高 | 伺服器綁定 `0.0.0.0` — 同區網所有設備可存取 | 改為綁定 `127.0.0.1` 僅允許本機存取 |
| 3 | 中 | 僅驗證副檔名，未驗證檔案實際內容 | 新增 Magic Bytes 驗證，確認上傳檔案確實是圖片 |
| 4 | 中 | 記憶體洩漏 — 任務記錄無上限增長 | 新增 `cleanup_old_tasks()` 函數，自動清理超過上限的舊記錄 |
| 5 | 中 | 錯誤訊息暴露內部路徑 | 過濾錯誤訊息，隱藏檔案路徑等敏感資訊 |
| 6 | 中 | 檔名未消毒 — 可能的路徑遍歷攻擊 | 新增 `sanitize_filename()` 清除危險字元 |
| 7 | 低 | 模型下載未驗證完整性 | 新增 SHA256 雜湊驗證，確保下載的模型未被竄改 |
| 8 | 低 | 缺少安全性 HTTP 標頭 | 新增 `SecurityHeadersMiddleware` 加入 X-Frame-Options、X-Content-Type-Options 等標頭 |
| 9 | 低 | 缺少 CORS 保護 | 新增 CORS 中間件，僅允許本機來源的請求 |
| 10 | 低 | `target` 參數未驗證 | 新增白名單驗證，只接受 "2k" 或 "4k" |

**相關檔案**：`app.py`（多處）、`main.js`（`escapeHtml` 函數及所有 `innerHTML` 使用處）、`index.html`（安全性 meta 標籤）

---

### 問題 6：start.bat 執行後無法啟動伺服器（ERR_CONNECTION_REFUSED）

**狀況**：雙擊 `start.bat` 後，終端機顯示找到 Python、虛擬環境就緒，但隨即出現 `... was unexpected at this time.` 或 `The system cannot find the batch label specified - found_python`，伺服器從未啟動，瀏覽器連線被拒絕。

**原因**：Windows CMD 在 `chcp 65001`（UTF-8）模式下解析批次檔時，若檔案內含 `goto :label` 標籤，會因編碼/行尾問題導致標籤無法被正確找到，腳本在跳轉處中斷，後續啟動 Python 的指令未執行。

**解法**：改寫 `start.bat`，**完全移除 `goto` 標籤**，改用 `if defined PYTHON`、`if not exist` 等條件分支控制流程，不依賴任何 `:label`。同時保留啟動前檢查 port 8000 是否被佔用，若被佔用則自動 `taskkill` 釋放，避免殘留程序導致無法重啟。

**相關檔案**：`start.bat`

---

### 問題 7：暫存檔案改為僅手動清理

**狀況**：使用者希望關閉伺服器（關閉 CMD 視窗）時不要自動刪除 uploads/、outputs/，以便重開伺服器後仍可從歷史任務下載；改由進入頁面後手動選擇清理時機。

**解法**：
1. 移除 atexit、lifespan shutdown、start.bat 結束後的自動清理邏輯
2. 新增 `POST /api/cleanup` 端點，手動執行 `cleanup_temp_directories()`（清除 uploads、outputs、temp_frames、history.json）
3. 在網頁「最近完成的任務」區塊加入「清除所有暫存檔案」按鈕，點擊後呼叫上述 API 並隱藏歷史區塊

**相關檔案**：`app.py`（lifespan、cleanup API）、`start.bat`（移除結尾清理）、`templates/index.html`、`static/js/main.js`、`static/css/style.css`
