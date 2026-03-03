/**
 * =========================================================================
 *  AI Image & Video Upscaler v3.1 - 前端控制邏輯
 *  支援圖片 (單張 & 批量) 及影片處理
 * =========================================================================
 *
 *  頁面結構 (頁籤切換)：
 *  - tabImage  → 圖片放大頁籤
 *  - tabVideo  → 影片放大頁籤
 *
 *  圖片流程：
 *  1. 拖曳或點擊上傳 → 檔案清單 → 選解析度 → 處理 → 結果
 *
 *  影片流程：
 *  1. 拖曳或點擊上傳 → 顯示影片資訊 → 選解析度 → 處理 → 結果
 *
 *  新增功能 (v3.1)：
 *  - 歷史任務紀錄：重開頁面可查看最近完成的任務並下載
 *  - 伺服器關閉按鈕：從 UI 直接安全關閉伺服器
 *  - 伺服器離線偵測：自動偵測伺服器狀態並提示
 * =========================================================================
 */

document.addEventListener('DOMContentLoaded', () => {

    // =====================================================================
    //  DOM 元素綁定
    // =====================================================================

    // -- 頁籤 --
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');

    // -- 圖片：上傳區域 --
    const uploadArea = document.getElementById('uploadArea');
    const fileInput = document.getElementById('fileInput');
    const fileInputAdd = document.getElementById('fileInputAdd');
    const optionsPanel = document.getElementById('optionsPanel');
    const fileList = document.getElementById('fileList');
    const fileCount = document.getElementById('fileCount');
    const btnAddMore = document.getElementById('btnAddMore');
    const btnClearAll = document.getElementById('btnClearAll');
    const btnUpscale = document.getElementById('btnUpscale');
    const btnUpscaleText = document.getElementById('btnUpscaleText');
    const scaleCards = document.querySelectorAll('.scale-options .scale-card');

    // -- 影片：上傳區域 --
    const videoUploadArea = document.getElementById('videoUploadArea');
    const videoFileInput = document.getElementById('videoFileInput');
    const videoFileInputAdd = document.getElementById('videoFileInputAdd');
    const videoOptionsPanel = document.getElementById('videoOptionsPanel');
    const videoFileList = document.getElementById('videoFileList');
    const videoFileCount = document.getElementById('videoFileCount');
    const btnVideoAddMore = document.getElementById('btnVideoAddMore');
    const btnVideoClearAll = document.getElementById('btnVideoClearAll');
    const btnVideoUpscale = document.getElementById('btnVideoUpscale');
    const btnVideoUpscaleText = document.getElementById('btnVideoUpscaleText');
    const videoScaleCards = document.querySelectorAll('#tabVideo .scale-card');

    // -- 各頁面區塊 --
    const uploadSection = document.getElementById('uploadSection');
    const videoUploadSection = document.getElementById('videoUploadSection');
    const batchProgressSection = document.getElementById('batchProgressSection');
    const resultSection = document.getElementById('resultSection');
    const batchResultSection = document.getElementById('batchResultSection');
    const videoResultSection = document.getElementById('videoResultSection');
    const errorSection = document.getElementById('errorSection');

    // -- 單張結果區 --
    const resultOriginal = document.getElementById('resultOriginal');
    const resultUpscaled = document.getElementById('resultUpscaled');
    const originalSize = document.getElementById('originalSize');
    const outputSize = document.getElementById('outputSize');
    const fileSize = document.getElementById('fileSize');
    const comparisonSlider = document.getElementById('comparisonSlider');
    const sliderHandle = document.getElementById('sliderHandle');

    // -- 批量進度區 --
    const batchProgressTitle = document.getElementById('batchProgressTitle');
    const batchProgressBar = document.getElementById('batchProgressBar');
    const batchProgressMessage = document.getElementById('batchProgressMessage');
    const batchProgressCount = document.getElementById('batchProgressCount');
    const batchItemList = document.getElementById('batchItemList');

    // -- 批量結果區 --
    const batchResultTitle = document.getElementById('batchResultTitle');
    const batchResultList = document.getElementById('batchResultList');

    // -- 影片結果區 --
    const videoResultTitle = document.getElementById('videoResultTitle');
    const videoResultList = document.getElementById('videoResultList');

    // -- 按鈕 --
    const btnDownload = document.getElementById('btnDownload');
    const btnNewUpload = document.getElementById('btnNewUpload');
    const btnBatchDownload = document.getElementById('btnBatchDownload');
    const btnBatchNewUpload = document.getElementById('btnBatchNewUpload');
    const btnVideoBatchDownload = document.getElementById('btnVideoBatchDownload');
    const btnVideoNewUpload = document.getElementById('btnVideoNewUpload');
    const btnRetry = document.getElementById('btnRetry');
    const errorMessage = document.getElementById('errorMessage');

    // =====================================================================
    //  應用程式狀態
    // =====================================================================
    let selectedFiles = [];          // 圖片已選檔案
    let selectedTarget = '2k';       // 圖片目標解析度
    let selectedVideoFiles = [];     // 影片已選檔案 (多檔)
    let selectedVideoTarget = '1080p'; // 影片目標解析度
    let currentTaskId = null;
    let currentBatchId = null;
    let currentVideoBatchId = null;
    let currentBatchMode = null;     // 'image' | 'video' | 'convert_multi'（多筆各別轉檔）
    let pollInterval = null;
    let activeMode = 'image';        // 'image' 或 'video'
    let selectedConvertFiles = [];     // 圖片轉檔 [{ file, format }, ...]
    let selectedConvertVideoFiles = []; // 影片轉檔 [{ file, format }, ...]，最多 10
    let selectedCompressImageFiles = []; // 圖片壓縮 [{ file, quality, maxW?, maxH? }, ...]
    let selectedCompressVideoFiles = []; // 影片壓縮 [{ file, crf }, ...]，最多 10
    let currentConvertTaskIds = [];
    let lastConvertProgress = {};
    let currentConvertZipUrl = null;
    let currentVideoZipUrl = null;         // 影片轉檔/壓縮多筆完成後的一鍵下載 ZIP
    let currentVideoMultiTaskIds = [];    // 影片多筆 { task_id, original_name } 或 { error }
    let lastVideoMultiProgress = {};
    let currentImageMultiTitlePrefix = '轉檔';  // showConvertMultiResult 標題：'轉檔' | '壓縮'
    let currentVideoMultiTitlePrefix = '轉檔'; // showVideoMultiResult 標題：'轉檔' | '壓縮'

    // 常數
    const ALLOWED_EXTS = ['jpg', 'jpeg', 'png', 'webp', 'bmp', 'tiff', 'tif'];
    const VIDEO_EXTS = ['mp4', 'mov', 'avi', 'mkv', 'webm', 'flv', 'wmv'];
    const MAX_SIZE = 20 * 1024 * 1024;
    const MAX_VIDEO_SIZE = 500 * 1024 * 1024;
    const MAX_FILES = 20;
    const MAX_VIDEO_FILES = 10;

    // =====================================================================
    //  工具函數
    // =====================================================================
    function formatFileSize(bytes) {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
    }

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.appendChild(document.createTextNode(text));
        return div.innerHTML;
    }

    const historyEl = document.getElementById('historySection');

    function allSections() {
        return [uploadSection, videoUploadSection, batchProgressSection,
                resultSection, batchResultSection, videoResultSection, errorSection,
                historyEl]
            .filter(Boolean);
    }

    function showSection(section) {
        allSections().forEach(s => s.style.display = 'none');
        // 也隱藏頁籤（進入處理/結果時）
        document.querySelector('.tab-bar').style.display = 'none';
        if (section) section.style.display = 'block';
    }

    function showTabView() {
        // 回到頁籤模式：先清除所有 section 的 inline display，恢復 CSS 控制
        allSections().forEach(s => s.style.display = '');
        document.querySelector('.tab-bar').style.display = 'flex';

        // 隱藏不屬於頁籤內的獨立結果/進度區塊
        if (batchProgressSection) batchProgressSection.style.display = 'none';
        if (resultSection) resultSection.style.display = 'none';
        if (batchResultSection) batchResultSection.style.display = 'none';
        if (videoResultSection) videoResultSection.style.display = 'none';
        if (errorSection) errorSection.style.display = 'none';
        // 歷史區塊先隱藏，由 loadHistory 決定是否顯示
        if (historyEl) historyEl.style.display = 'none';

        // 啟動對應頁籤
        activateTab(activeMode);

        // 回到頁籤模式時重新載入歷史紀錄（可能有新完成的任務）
        if (typeof loadHistory === 'function') loadHistory();
    }

    function getExt(name) {
        return name.split('.').pop().toLowerCase();
    }

    // =====================================================================
    //  頁籤切換（依 data-tab 對應 id="tabXxx" 的區塊，不依賴後方變數）
    // =====================================================================
    function activateTab(tab) {
        if (!tab) return;
        activeMode = tab;
        // 按鈕 active 狀態
        document.querySelectorAll('.tab-btn').forEach(function (b) {
            b.classList.toggle('active', b.getAttribute('data-tab') === tab);
        });
        // 內容區顯示：data-tab 對應的 .tab-content 才顯示
        document.querySelectorAll('.tab-content').forEach(function (tc) {
            tc.classList.toggle('active', tc.getAttribute('data-tab') === tab);
        });
        // 各頁籤按鈕 disabled（用 id 取得，避免變數未定義）
        var btnConvert = document.getElementById('btnConvertImage');
        var btnConvV = document.getElementById('btnConvertVideo');
        var btnCompImg = document.getElementById('btnCompressImage');
        var btnCompVid = document.getElementById('btnCompressVideo');
        if (btnConvert) btnConvert.disabled = selectedConvertFiles.length === 0;
        if (btnConvV) btnConvV.disabled = selectedConvertVideoFiles.length === 0;
        if (btnCompImg) btnCompImg.disabled = selectedCompressImageFiles.length === 0;
        if (btnCompVid) btnCompVid.disabled = selectedCompressVideoFiles.length === 0;
    }

    // 用事件委派：點 .tab-bar 內任一 .tab-btn 都會切換，避免個別綁定順序問題
    var tabBar = document.querySelector('.tab-bar');
    if (tabBar) {
        tabBar.addEventListener('click', function (e) {
            var btn = e.target.closest('.tab-btn');
            if (!btn) return;
            e.preventDefault();
            var tab = btn.getAttribute('data-tab');
            if (tab) activateTab(tab);
        });
    }

    // =====================================================================
    //  圖片：拖曳 & 點擊上傳
    // =====================================================================
    if (uploadArea) {
        uploadArea.addEventListener('click', () => fileInput.click());

        uploadArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            uploadArea.classList.add('drag-over');
        });
        uploadArea.addEventListener('dragleave', (e) => {
            e.preventDefault();
            uploadArea.classList.remove('drag-over');
        });
        uploadArea.addEventListener('drop', (e) => {
            e.preventDefault();
            uploadArea.classList.remove('drag-over');
            if (e.dataTransfer.files.length > 0) addFiles(Array.from(e.dataTransfer.files));
        });
    }

    if (optionsPanel) {
        optionsPanel.addEventListener('dragover', (e) => {
            e.preventDefault();
            optionsPanel.classList.add('drag-over-panel');
        });
        optionsPanel.addEventListener('dragleave', (e) => {
            e.preventDefault();
            if (!optionsPanel.contains(e.relatedTarget)) {
                optionsPanel.classList.remove('drag-over-panel');
            }
        });
        optionsPanel.addEventListener('drop', (e) => {
            e.preventDefault();
            optionsPanel.classList.remove('drag-over-panel');
            if (e.dataTransfer.files.length > 0) addFiles(Array.from(e.dataTransfer.files));
        });
    }

    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            addFiles(Array.from(e.target.files));
            fileInput.value = '';
        }
    });

    fileInputAdd.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            addFiles(Array.from(e.target.files));
            fileInputAdd.value = '';
        }
    });

    // =====================================================================
    //  圖片：檔案管理
    // =====================================================================
    function addFiles(files) {
        let skipped = 0;
        for (const file of files) {
            if (selectedFiles.length >= MAX_FILES) { skipped++; continue; }
            const ext = getExt(file.name);
            if (!ALLOWED_EXTS.includes(ext)) { skipped++; continue; }
            if (file.size > MAX_SIZE) { skipped++; continue; }
            const isDuplicate = selectedFiles.some(f => f.name === file.name && f.size === file.size);
            if (isDuplicate) continue;
            selectedFiles.unshift(file);
        }
        if (skipped > 0) alert(`${skipped} 個檔案被跳過（格式不支援、檔案太大或超過上限）`);
        if (selectedFiles.length > 0) {
            renderFileList();
            optionsPanel.style.display = 'block';
            uploadArea.style.display = 'none';
        }
    }

    function renderFileList() {
        fileCount.textContent = selectedFiles.length;
        btnUpscaleText.textContent = selectedFiles.length === 1
            ? '開始提升解析度'
            : `批量處理 ${selectedFiles.length} 張圖片`;
        fileList.innerHTML = '';
        selectedFiles.forEach((file, index) => {
            const item = document.createElement('div');
            item.className = 'file-list-item';
            const thumb = document.createElement('div');
            thumb.className = 'file-thumb';
            const img = document.createElement('img');
            const reader = new FileReader();
            reader.onload = (e) => { img.src = e.target.result; };
            reader.readAsDataURL(file);
            thumb.appendChild(img);
            const info = document.createElement('div');
            info.className = 'file-item-info';
            info.innerHTML = `
                <span class="file-item-name">${escapeHtml(file.name)}</span>
                <span class="file-item-meta">${formatFileSize(file.size)}</span>
            `;
            const removeBtn = document.createElement('button');
            removeBtn.className = 'btn-remove-item';
            removeBtn.innerHTML = '<span class="material-symbols-outlined">close</span>';
            removeBtn.addEventListener('click', () => {
                selectedFiles.splice(index, 1);
                if (selectedFiles.length === 0) {
                    optionsPanel.style.display = 'none';
                    uploadArea.style.display = 'block';
                } else {
                    renderFileList();
                }
            });
            item.appendChild(thumb);
            item.appendChild(info);
            item.appendChild(removeBtn);
            fileList.appendChild(item);
        });
    }

    if (btnAddMore) btnAddMore.addEventListener('click', () => fileInputAdd.click());
    if (btnClearAll) {
        btnClearAll.addEventListener('click', () => {
            selectedFiles = [];
            fileInput.value = '';
            optionsPanel.style.display = 'none';
            uploadArea.style.display = 'block';
        });
    }

    // =====================================================================
    //  圖片：解析度選擇
    // =====================================================================
    scaleCards.forEach(card => {
        if (card.closest('#tabImage') || card.closest('#uploadSection') || card.closest('#optionsPanel')) {
            card.addEventListener('click', () => {
                const parentCards = card.closest('.scale-cards');
                if (parentCards) parentCards.querySelectorAll('.scale-card').forEach(c => c.classList.remove('active'));
                card.classList.add('active');
                selectedTarget = card.dataset.target;
            });
        }
    });

    // =====================================================================
    //  圖片：開始處理
    // =====================================================================
    if (btnUpscale) {
        btnUpscale.addEventListener('click', async () => {
            if (selectedFiles.length === 0) return;
            btnUpscale.disabled = true;
            if (selectedFiles.length === 1) {
                await startSingleUpload();
            } else {
                await startBatchUpload();
            }
        });
    }

    // =====================================================================
    //  圖片：單張上傳 & 輪詢
    // =====================================================================
    async function startSingleUpload() {
        showSection(batchProgressSection);
        batchProgressTitle.textContent = 'AI 正在處理中...';
        batchProgressBar.style.width = '0%';
        batchProgressMessage.textContent = '上傳中...';
        batchProgressCount.textContent = '';
        batchItemList.innerHTML = '';

        const formData = new FormData();
        formData.append('file', selectedFiles[0]);
        formData.append('target', selectedTarget);

        try {
            const response = await fetch('/api/upload', { method: 'POST', body: formData });
            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.detail || '上傳失敗');
            }
            const data = await response.json();
            currentTaskId = data.task_id;
            currentBatchId = null;
            startSinglePolling();
        } catch (error) {
            showError(error.message);
        }
    }

    function startSinglePolling() {
        if (pollInterval) clearInterval(pollInterval);
        pollInterval = setInterval(async () => {
            try {
                const res = await fetch(`/api/progress/${currentTaskId}`);
                if (!res.ok) return;
                const data = await res.json();
                batchProgressBar.style.width = `${data.progress || 0}%`;
                batchProgressMessage.textContent = data.message || '處理中...';
                batchProgressCount.textContent = `${data.progress || 0}%`;
                if (data.status === 'completed') {
                    clearInterval(pollInterval); pollInterval = null;
                    showSingleResult(data.result);
                } else if (data.status === 'error') {
                    clearInterval(pollInterval); pollInterval = null;
                    showError(data.message);
                }
            } catch (e) { console.error(e); }
        }, 1000);
    }

    function showSingleResult(result) {
        showSection(resultSection);
        resultOriginal.src = `/api/preview-original/${currentTaskId}`;
        resultUpscaled.src = `/api/preview/${currentTaskId}`;
        originalSize.textContent = result.original_size;
        outputSize.textContent = result.output_size;
        fileSize.textContent = formatFileSize(result.file_size);
        initComparisonSlider();
        resultSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    // =====================================================================
    //  圖片：批量上傳 & 輪詢
    // =====================================================================
    async function startBatchUpload() {
        showSection(batchProgressSection);
        batchProgressTitle.textContent = '批量處理中...';
        batchProgressBar.style.width = '0%';
        batchProgressMessage.textContent = '正在上傳所有圖片...';
        batchProgressCount.textContent = `0 / ${selectedFiles.length}`;
        batchItemList.innerHTML = '';

        const formData = new FormData();
        selectedFiles.forEach(f => formData.append('files', f));
        formData.append('target', selectedTarget);

        try {
            const response = await fetch('/api/batch-upload', { method: 'POST', body: formData });
            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.detail || '批量上傳失敗');
            }
            const data = await response.json();
            currentBatchId = data.batch_id;
            currentTaskId = null;
            renderBatchItems(data.task_ids, data.original_names);
            startBatchPolling();
        } catch (error) {
            showError(error.message);
        }
    }

    function renderBatchItems(taskIds, originalNames) {
        batchItemList.innerHTML = '';
        taskIds.forEach(tid => {
            const item = document.createElement('div');
            item.className = 'batch-item';
            item.id = `batch-item-${tid}`;
            item.innerHTML = `
                <div class="batch-item-icon"><span class="material-symbols-outlined">image</span></div>
                <div class="batch-item-content">
                    <span class="batch-item-name">${escapeHtml(originalNames[tid] || '')}</span>
                    <div class="batch-item-bar-wrapper"><div class="batch-item-bar" id="bar-${tid}" style="width: 0%"></div></div>
                    <span class="batch-item-status" id="status-${tid}">排隊中</span>
                </div>
                <div class="batch-item-badge" id="badge-${tid}"><span class="material-symbols-outlined">hourglass_empty</span></div>
            `;
            batchItemList.appendChild(item);
        });
    }

    function startBatchPolling() {
        if (pollInterval) clearInterval(pollInterval);
        pollInterval = setInterval(async () => {
            try {
                const res = await fetch(`/api/batch-progress/${currentBatchId}`);
                if (!res.ok) return;
                const data = await res.json();
                batchProgressBar.style.width = `${data.progress || 0}%`;
                batchProgressMessage.textContent = data.message;
                const doneCount = data.completed + data.failed + (data.cancelled || 0);
                batchProgressCount.textContent = `${doneCount} / ${data.total}`;
                data.items.forEach(item => {
                    const bar = document.getElementById(`bar-${item.task_id}`);
                    const status = document.getElementById(`status-${item.task_id}`);
                    const badge = document.getElementById(`badge-${item.task_id}`);
                    const row = document.getElementById(`batch-item-${item.task_id}`);
                    const actions = document.getElementById(`actions-${item.task_id}`);
                    if (bar) bar.style.width = `${item.progress}%`;
                    if (status) status.textContent = item.message || getStatusText(item.status);
                    if (badge) {
                        if (item.status === 'completed') {
                            badge.innerHTML = '<span class="material-symbols-outlined" style="color:var(--success)">check_circle</span>';
                            if (row) { row.classList.add('done'); row.classList.remove('cancelled'); row.style.opacity = ''; }
                        } else if (item.status === 'error') {
                            badge.innerHTML = '<span class="material-symbols-outlined" style="color:var(--error)">error</span>';
                            if (row) { row.classList.add('error'); row.classList.remove('cancelled'); row.style.opacity = ''; }
                        } else if (item.status === 'processing') {
                            badge.innerHTML = '<span class="material-symbols-outlined spinning" style="color:var(--primary)">autorenew</span>';
                            if (row) { row.classList.add('active'); row.classList.remove('cancelled'); row.style.opacity = ''; }
                        } else if (item.status === 'cancelled') {
                            badge.innerHTML = '<span class="material-symbols-outlined" style="color:#999">block</span>';
                            if (row) { row.classList.add('cancelled'); row.style.opacity = '0.4'; }
                        } else if (item.status === 'queued') {
                            badge.innerHTML = '<span class="material-symbols-outlined">hourglass_empty</span>';
                        }
                    }
                });
                if (data.status === 'completed') {
                    clearInterval(pollInterval); pollInterval = null;
                    showBatchResult(data);
                }
            } catch (e) { console.error(e); }
        }, 1000);
    }

    function getStatusText(status) {
        const map = { queued: '排隊中', processing: '處理中...', completed: '完成', error: '失敗', cancelled: '已取消' };
        return map[status] || status;
    }

    function showBatchResult(data) {
        showSection(batchResultSection);
        const parts = [];
        if (data.completed) parts.push(`成功 ${data.completed} 張`);
        if (data.failed) parts.push(`失敗 ${data.failed} 張`);
        if (data.cancelled) parts.push(`已取消 ${data.cancelled} 張`);
        currentConvertZipUrl = null;
        batchResultTitle.textContent = parts.length ? '處理完成！' + parts.join('，') : '全部完成！';
        batchResultList.innerHTML = '';
        data.items.forEach(item => {
            if (item.status === 'cancelled') return;
            const card = document.createElement('div');
            card.className = `batch-result-card ${item.status === 'completed' ? 'success' : 'failed'}`;
            const itemDisplayName = (item.result && item.result.download_name) ? item.result.download_name : item.original_name;
            if (item.status === 'completed' && item.result) {
                card.innerHTML = `
                    <div class="batch-result-thumb">
                        <img src="/api/preview/${encodeURIComponent(item.task_id)}" alt="${escapeHtml(itemDisplayName)}">
                    </div>
                    <div class="batch-result-info">
                        <span class="batch-result-name">${escapeHtml(itemDisplayName)}</span>
                        <span class="batch-result-meta">${escapeHtml(item.result.original_size)} → ${escapeHtml(item.result.output_size)}</span>
                        <span class="batch-result-size">${formatFileSize(item.result.file_size)}</span>
                    </div>
                    <a class="btn-icon-download" href="/api/download/${encodeURIComponent(item.task_id)}" title="下載">
                        <span class="material-symbols-outlined">download</span>
                    </a>
                `;
            } else {
                card.innerHTML = `
                    <div class="batch-result-thumb error-thumb">
                        <span class="material-symbols-outlined">broken_image</span>
                    </div>
                    <div class="batch-result-info">
                        <span class="batch-result-name">${escapeHtml(item.original_name)}</span>
                        <span class="batch-result-meta error-text">${escapeHtml(item.message || '處理失敗')}</span>
                    </div>
                `;
            }
            batchResultList.appendChild(card);
        });
        btnBatchDownload.style.display = data.zip_ready ? 'inline-flex' : 'none';
        batchResultSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    // =====================================================================
    //  影片：拖曳 & 點擊上傳 (批量)
    // =====================================================================
    if (videoUploadArea) {
        videoUploadArea.addEventListener('click', () => videoFileInput.click());

        videoUploadArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            videoUploadArea.classList.add('drag-over');
        });
        videoUploadArea.addEventListener('dragleave', (e) => {
            e.preventDefault();
            videoUploadArea.classList.remove('drag-over');
        });
        videoUploadArea.addEventListener('drop', (e) => {
            e.preventDefault();
            videoUploadArea.classList.remove('drag-over');
            if (e.dataTransfer.files.length > 0) addVideoFiles(Array.from(e.dataTransfer.files));
        });
    }

    if (videoFileInput) {
        videoFileInput.addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                addVideoFiles(Array.from(e.target.files));
                videoFileInput.value = '';
            }
        });
    }

    if (videoFileInputAdd) {
        videoFileInputAdd.addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                addVideoFiles(Array.from(e.target.files));
                videoFileInputAdd.value = '';
            }
        });
    }

    // 影片選項面板也支援拖曳新增
    if (videoOptionsPanel) {
        videoOptionsPanel.addEventListener('dragover', (e) => {
            e.preventDefault();
            videoOptionsPanel.classList.add('drag-over-panel');
        });
        videoOptionsPanel.addEventListener('dragleave', (e) => {
            e.preventDefault();
            if (!videoOptionsPanel.contains(e.relatedTarget)) {
                videoOptionsPanel.classList.remove('drag-over-panel');
            }
        });
        videoOptionsPanel.addEventListener('drop', (e) => {
            e.preventDefault();
            videoOptionsPanel.classList.remove('drag-over-panel');
            if (e.dataTransfer.files.length > 0) addVideoFiles(Array.from(e.dataTransfer.files));
        });
    }

    // =====================================================================
    //  影片：檔案管理 (批量)
    // =====================================================================
    function addVideoFiles(files) {
        if (isVideoProcessing) {
            alert('影片處理進行中，無法新增檔案。請等待處理完成。');
            return;
        }
        let skipped = 0;
        for (const file of files) {
            if (selectedVideoFiles.length >= MAX_VIDEO_FILES) { skipped++; continue; }
            const ext = getExt(file.name);
            if (!VIDEO_EXTS.includes(ext)) { skipped++; continue; }
            if (file.size > MAX_VIDEO_SIZE) { skipped++; continue; }
            const isDuplicate = selectedVideoFiles.some(f => f.name === file.name && f.size === file.size);
            if (isDuplicate) continue;
            selectedVideoFiles.unshift(file);
        }
        if (skipped > 0) alert(`${skipped} 個檔案被跳過（格式不支援、檔案太大或超過上限）`);
        if (selectedVideoFiles.length > 0) {
            renderVideoFileList();
            if (videoOptionsPanel) videoOptionsPanel.style.display = 'block';
            if (videoUploadArea) videoUploadArea.style.display = 'none';
        }
    }

    function renderVideoFileList() {
        if (videoFileCount) videoFileCount.textContent = selectedVideoFiles.length;
        if (btnVideoUpscaleText) {
            btnVideoUpscaleText.textContent = selectedVideoFiles.length === 1
                ? '開始提升影片解析度'
                : `批量處理 ${selectedVideoFiles.length} 部影片`;
        }
        if (!videoFileList) return;
        videoFileList.innerHTML = '';
        selectedVideoFiles.forEach((file, index) => {
            const item = document.createElement('div');
            item.className = 'file-list-item';
            const thumb = document.createElement('div');
            thumb.className = 'file-thumb video-thumb';
            thumb.innerHTML = '<span class="material-symbols-outlined">movie</span>';
            const info = document.createElement('div');
            info.className = 'file-item-info';
            info.innerHTML = `
                <span class="file-item-name">${escapeHtml(file.name)}</span>
                <span class="file-item-meta">${formatFileSize(file.size)}</span>
            `;
            const removeBtn = document.createElement('button');
            removeBtn.className = 'btn-remove-item';
            removeBtn.innerHTML = '<span class="material-symbols-outlined">close</span>';
            removeBtn.addEventListener('click', () => {
                selectedVideoFiles.splice(index, 1);
                if (selectedVideoFiles.length === 0) {
                    if (videoOptionsPanel) videoOptionsPanel.style.display = 'none';
                    if (videoUploadArea) videoUploadArea.style.display = 'block';
                } else {
                    renderVideoFileList();
                }
            });
            item.appendChild(thumb);
            item.appendChild(info);
            item.appendChild(removeBtn);
            videoFileList.appendChild(item);
        });
    }

    if (btnVideoAddMore) btnVideoAddMore.addEventListener('click', () => videoFileInputAdd.click());
    if (btnVideoClearAll) {
        btnVideoClearAll.addEventListener('click', () => {
            selectedVideoFiles = [];
            if (videoFileInput) videoFileInput.value = '';
            if (videoOptionsPanel) videoOptionsPanel.style.display = 'none';
            if (videoUploadArea) videoUploadArea.style.display = 'block';
        });
    }

    // =====================================================================
    //  影片：解析度選擇
    // =====================================================================
    if (videoScaleCards) {
        videoScaleCards.forEach(card => {
            card.addEventListener('click', () => {
                videoScaleCards.forEach(c => c.classList.remove('active'));
                card.classList.add('active');
                selectedVideoTarget = card.dataset.target;
            });
        });
    }

    // =====================================================================
    //  影片：開始處理 (批量)
    // =====================================================================
    if (btnVideoUpscale) {
        btnVideoUpscale.addEventListener('click', async () => {
            if (selectedVideoFiles.length === 0) return;
            btnVideoUpscale.disabled = true;
            await startVideoBatchUpload();
        });
    }

    let isVideoProcessing = false;  // 處理中鎖定旗標

    async function startVideoBatchUpload() {
        isVideoProcessing = true;
        showSection(batchProgressSection);
        batchProgressTitle.textContent = 'AI 影片批量處理中...';
        batchProgressBar.style.width = '0%';
        batchProgressMessage.textContent = '正在上傳所有影片...';
        batchProgressCount.textContent = `0 / ${selectedVideoFiles.length}`;
        batchItemList.innerHTML = '';

        const formData = new FormData();
        selectedVideoFiles.forEach(f => formData.append('files', f));
        formData.append('target', selectedVideoTarget);

        try {
            const response = await fetch('/api/video/batch-upload', { method: 'POST', body: formData });
            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.detail || '影片上傳失敗');
            }
            const data = await response.json();
            currentVideoBatchId = data.batch_id;
            currentTaskId = null;
            currentBatchId = null;
            renderVideoBatchItems(data.task_ids, data.original_names);
            startVideoBatchPolling();
        } catch (error) {
            showError(error.message);
        }
    }

    function renderVideoBatchItems(taskIds, originalNames) {
        batchItemList.innerHTML = '';
        taskIds.forEach(tid => {
            const item = document.createElement('div');
            item.className = 'batch-item';
            item.id = `batch-item-${tid}`;
            item.innerHTML = `
                <div class="batch-item-icon"><span class="material-symbols-outlined">movie</span></div>
                <div class="batch-item-content">
                    <span class="batch-item-name">${escapeHtml(originalNames[tid] || '')}</span>
                    <div class="batch-item-bar-wrapper"><div class="batch-item-bar" id="bar-${tid}" style="width: 0%"></div></div>
                    <span class="batch-item-status" id="status-${tid}">排隊中</span>
                </div>
                <div class="batch-item-actions" id="actions-${tid}">
                    <button class="btn-batch-cancel" id="cancel-${tid}" title="移除此影片">
                        <span class="material-symbols-outlined">close</span>
                    </button>
                </div>
            `;
            batchItemList.appendChild(item);

            // 綁定取消按鈕
            const cancelBtn = document.getElementById(`cancel-${tid}`);
            if (cancelBtn) {
                cancelBtn.addEventListener('click', () => cancelVideoTask(tid));
            }
        });
    }

    async function cancelVideoTask(taskId) {
        if (!currentVideoBatchId) return;
        try {
            const res = await fetch(`/api/video/batch/${currentVideoBatchId}/cancel/${taskId}`, { method: 'POST' });
            if (res.ok) {
                // 立即更新 UI
                const row = document.getElementById(`batch-item-${taskId}`);
                if (row) {
                    row.classList.add('cancelled');
                    row.style.opacity = '0.4';
                }
                const status = document.getElementById(`status-${taskId}`);
                if (status) status.textContent = '已取消';
                const actions = document.getElementById(`actions-${taskId}`);
                if (actions) actions.innerHTML = '<span class="material-symbols-outlined" style="color:#999">block</span>';
            }
        } catch (e) { console.error(e); }
    }

    function startVideoBatchPolling() {
        if (pollInterval) clearInterval(pollInterval);
        pollInterval = setInterval(async () => {
            try {
                const res = await fetch(`/api/video/batch-progress/${currentVideoBatchId}`);
                if (!res.ok) return;
                const data = await res.json();
                batchProgressBar.style.width = `${data.progress || 0}%`;
                batchProgressMessage.textContent = data.message;
                const doneCount = data.completed + data.failed + (data.cancelled || 0);
                batchProgressCount.textContent = `${doneCount} / ${data.total}`;

                data.items.forEach(item => {
                    const bar = document.getElementById(`bar-${item.task_id}`);
                    const status = document.getElementById(`status-${item.task_id}`);
                    const actions = document.getElementById(`actions-${item.task_id}`);
                    const row = document.getElementById(`batch-item-${item.task_id}`);
                    if (bar) bar.style.width = `${item.progress}%`;

                    // 更新狀態文字
                    if (status) {
                        let statusMsg = item.message || getStatusText(item.status);
                        if (item.status === 'processing' && item.current_frame && item.total_frames) {
                            statusMsg = `${item.current_frame}/${item.total_frames} 幀`;
                        }
                        status.textContent = statusMsg;
                    }

                    // 更新右側操作按鈕
                    if (actions) {
                        if (item.status === 'completed') {
                            actions.innerHTML = `<a class="btn-batch-download" href="/api/video/download/${encodeURIComponent(item.task_id)}" title="下載"><span class="material-symbols-outlined">download</span></a>`;
                            if (row) { row.classList.remove('active'); row.classList.add('done'); }
                        } else if (item.status === 'error') {
                            actions.innerHTML = '<span class="material-symbols-outlined" style="color:var(--error)">error</span>';
                            if (row) { row.classList.remove('active'); row.classList.add('error'); }
                        } else if (item.status === 'processing') {
                            actions.innerHTML = '<span class="material-symbols-outlined spinning" style="color:var(--primary)">autorenew</span>';
                            if (row) row.classList.add('active');
                        } else if (item.status === 'cancelled') {
                            actions.innerHTML = '<span class="material-symbols-outlined" style="color:#999">block</span>';
                            if (row) { row.style.opacity = '0.4'; row.classList.add('cancelled'); }
                        }
                        // queued 狀態保持取消按鈕不變（初始渲染時已設好）
                    }
                });

                if (data.status === 'completed') {
                    clearInterval(pollInterval); pollInterval = null;
                    showVideoBatchResult(data);
                }
            } catch (e) { console.error(e); }
        }, 2000);
    }

    function showVideoBatchResult(data) {
        currentVideoZipUrl = null; // 影片放大批次用 batch-download，不用 task_ids zip
        showSection(videoResultSection);
        const parts = [];
        if (data.completed) parts.push(`成功 ${data.completed} 部`);
        if (data.failed) parts.push(`失敗 ${data.failed} 部`);
        if (data.cancelled) parts.push(`已取消 ${data.cancelled} 部`);
        if (videoResultTitle) {
            videoResultTitle.textContent = '處理完成！' + parts.join('，');
        }
        if (videoResultList) {
            videoResultList.innerHTML = '';
            data.items.forEach(item => {
                if (item.status === 'cancelled') return; // 不顯示已取消的
                const card = document.createElement('div');
                card.className = `batch-result-card ${item.status === 'completed' ? 'success' : 'failed'}`;
                const itemDisplayName = (item.result && item.result.download_name) ? item.result.download_name : item.original_name;
                if (item.status === 'completed' && item.result) {
                    card.innerHTML = `
                        <div class="batch-result-thumb">
                            <span class="material-symbols-outlined" style="font-size:2rem;color:var(--success)">movie</span>
                        </div>
                        <div class="batch-result-info">
                            <span class="batch-result-name">${escapeHtml(itemDisplayName)}</span>
                            <span class="batch-result-meta">${escapeHtml(item.result.original_size)} → ${escapeHtml(item.result.output_size)} | ${item.result.total_frames} 幀</span>
                            <span class="batch-result-size">${formatFileSize(item.result.file_size)}</span>
                        </div>
                        <a class="btn-icon-download" href="/api/video/download/${encodeURIComponent(item.task_id)}" title="下載">
                            <span class="material-symbols-outlined">download</span>
                        </a>
                    `;
                } else {
                    card.innerHTML = `
                        <div class="batch-result-thumb error-thumb">
                            <span class="material-symbols-outlined">error</span>
                        </div>
                        <div class="batch-result-info">
                            <span class="batch-result-name">${escapeHtml(item.original_name)}</span>
                            <span class="batch-result-meta error-text">${escapeHtml(item.message || '處理失敗')}</span>
                        </div>
                    `;
                }
                videoResultList.appendChild(card);
            });
        }
        if (btnVideoBatchDownload) btnVideoBatchDownload.style.display = data.zip_ready ? 'inline-flex' : 'none';
        videoResultSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    function showSingleVideoResult(taskId, result, originalName) {
        showSection(videoResultSection);
        if (videoResultTitle) videoResultTitle.textContent = '處理完成！';
        if (videoResultList) {
            videoResultList.innerHTML = '';
            const displayName = (result && result.download_name) ? result.download_name : originalName;
            const card = document.createElement('div');
            card.className = 'batch-result-card success';
            card.innerHTML = `
                <div class="batch-result-thumb">
                    <span class="material-symbols-outlined" style="font-size:2rem;color:var(--success)">movie</span>
                </div>
                <div class="batch-result-info">
                    <span class="batch-result-name">${escapeHtml(displayName)}</span>
                    <span class="batch-result-meta">${result.output_size || ''} | ${formatFileSize(result.file_size || 0)}</span>
                </div>
                <a class="btn-icon-download" href="/api/video/download/${encodeURIComponent(taskId)}" title="下載">
                    <span class="material-symbols-outlined">download</span>
                </a>
            `;
            videoResultList.appendChild(card);
        }
        if (btnVideoBatchDownload) btnVideoBatchDownload.style.display = 'none';
        videoResultSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    // =====================================================================
    //  轉檔與壓縮
    // =====================================================================
    const convertImageInput = document.getElementById('convertImageInput');
    const convertImageFormat = document.getElementById('convertImageFormat');
    const btnConvertImage = document.getElementById('btnConvertImage');
    const convertVideoInput = document.getElementById('convertVideoInput');
    const convertVideoFormat = document.getElementById('convertVideoFormat');
    const btnConvertVideo = document.getElementById('btnConvertVideo');
    const compressImageInput = document.getElementById('compressImageInput');
    const compressImageQuality = document.getElementById('compressImageQuality');
    const compressImageMaxW = document.getElementById('compressImageMaxW');
    const compressImageMaxH = document.getElementById('compressImageMaxH');
    const btnCompressImage = document.getElementById('btnCompressImage');
    const compressVideoInput = document.getElementById('compressVideoInput');
    const compressVideoCrf = document.getElementById('compressVideoCrf');
    const btnCompressVideo = document.getElementById('btnCompressVideo');

    const convertImageFileListWrap = document.getElementById('convertImageFileListWrap');
    const convertImageFileList = document.getElementById('convertImageFileList');
    const convertImageFileCount = document.getElementById('convertImageFileCount');
    const btnConvertImageText = document.getElementById('btnConvertImageText');

    const CONVERT_FORMAT_OPTIONS = [
        { value: 'png', label: 'PNG' },
        { value: 'jpeg', label: 'JPEG' },
        { value: 'webp', label: 'WebP' },
        { value: 'bmp', label: 'BMP' },
        { value: 'tiff', label: 'TIFF' },
    ];

    function renderConvertFileList() {
        if (!convertImageFileList || !convertImageFileCount) return;
        convertImageFileCount.textContent = selectedConvertFiles.length;
        convertImageFileListWrap.style.display = selectedConvertFiles.length ? 'block' : 'none';
        convertImageFileList.innerHTML = '';
        selectedConvertFiles.forEach((item, index) => {
            const file = item.file || item;
            const format = item.format != null ? item.format : 'png';
            const name = file.name || '';
            const row = document.createElement('div');
            row.className = 'convert-file-list-item';
            const selectHtml = CONVERT_FORMAT_OPTIONS.map(o => `<option value="${o.value}" ${o.value === format ? 'selected' : ''}>${o.label}</option>`).join('');
            row.innerHTML = `
                <span class="convert-file-name" title="${escapeHtml(name)}">${escapeHtml(name)}</span>
                <select class="convert-file-format-select" data-index="${index}">${selectHtml}</select>
                <button type="button" class="btn-remove-convert" title="移除此檔">
                    <span class="material-symbols-outlined">close</span>
                </button>
            `;
            row.querySelector('.convert-file-format-select').addEventListener('change', (e) => {
                selectedConvertFiles[index].format = e.target.value;
            });
            row.querySelector('.btn-remove-convert').addEventListener('click', () => {
                selectedConvertFiles.splice(index, 1);
                renderConvertFileList();
                if (btnConvertImage) btnConvertImage.disabled = selectedConvertFiles.length === 0;
                if (btnConvertImageText) btnConvertImageText.textContent = selectedConvertFiles.length === 1 ? '開始轉檔' : (selectedConvertFiles.length > 1 ? `批量轉檔 ${selectedConvertFiles.length} 張` : '開始轉檔');
            });
            convertImageFileList.appendChild(row);
        });
        if (btnConvertImage) btnConvertImage.disabled = selectedConvertFiles.length === 0;
        if (btnConvertImageText) btnConvertImageText.textContent = selectedConvertFiles.length === 1 ? '開始轉檔' : (selectedConvertFiles.length > 1 ? `批量轉檔 ${selectedConvertFiles.length} 張` : '開始轉檔');
    }

    if (convertImageInput) {
        convertImageInput.addEventListener('change', () => {
            const files = Array.from(convertImageInput.files || []);
            const defaultFmt = convertImageFormat ? convertImageFormat.value : 'png';
            for (const f of files) {
                if (selectedConvertFiles.length >= 20) break;
                selectedConvertFiles.unshift({ file: f, format: defaultFmt });
            }
            convertImageInput.value = '';
            renderConvertFileList();
        });
    }
    if (btnConvertImage) {
        btnConvertImage.addEventListener('click', async () => {
            if (selectedConvertFiles.length === 0) return;
            btnConvertImage.disabled = true;
            showSection(batchProgressSection);
            batchProgressTitle.textContent = selectedConvertFiles.length > 1 ? '圖片批量轉檔中...' : '圖片轉檔中...';
            batchProgressBar.style.width = '0%';
            batchProgressMessage.textContent = '上傳中...';
            batchProgressCount.textContent = '';
            batchItemList.innerHTML = '';

            const first = selectedConvertFiles[0];
            const file = first.file || first;
            const format = first.format != null ? first.format : (convertImageFormat ? convertImageFormat.value : 'png');

            if (selectedConvertFiles.length === 1) {
                const formData = new FormData();
                formData.append('file', file);
                formData.append('format', format);
                try {
                    const res = await fetch('/api/convert/image', { method: 'POST', body: formData });
                    if (!res.ok) { const err = await res.json(); throw new Error(err.detail || '轉檔失敗'); }
                    const data = await res.json();
                    currentTaskId = data.task_id;
                    currentBatchId = null;
                    currentBatchMode = null;
                    currentConvertTaskIds = [];
                    startSinglePolling();
                } catch (e) {
                    showError(e.message);
                }
                if (btnConvertImage) btnConvertImage.disabled = false;
                return;
            }

            // 作法 B：每筆各呼叫單張 API，每張可不同格式
            currentBatchId = null;
            currentTaskId = null;
            currentBatchMode = 'convert_multi';
            currentImageMultiTitlePrefix = '轉檔';
            currentConvertTaskIds = [];
            lastConvertProgress = {};
            try {
                for (let i = 0; i < selectedConvertFiles.length; i++) {
                    const it = selectedConvertFiles[i];
                    const f = it.file || it;
                    const fmt = it.format != null ? it.format : 'png';
                    batchProgressMessage.textContent = `上傳第 ${i + 1}/${selectedConvertFiles.length} 張...`;
                    const formData = new FormData();
                    formData.append('file', f);
                    formData.append('format', fmt);
                    const res = await fetch('/api/convert/image', { method: 'POST', body: formData });
                    if (!res.ok) {
                        const err = await res.json();
                        currentConvertTaskIds.push({ task_id: null, original_name: f.name, error: err.detail || '上傳失敗' });
                        continue;
                    }
                    const data = await res.json();
                    currentConvertTaskIds.push({ task_id: data.task_id, original_name: data.original_filename || f.name });
                }
                if (currentConvertTaskIds.length === 0) {
                    showError('沒有成功加入轉檔的檔案');
                    if (btnConvertImage) btnConvertImage.disabled = false;
                    return;
                }
                const validTasks = currentConvertTaskIds.filter(t => t.task_id);
                if (validTasks.length === 0) {
                    showError(currentConvertTaskIds[0].error || '上傳失敗');
                    if (btnConvertImage) btnConvertImage.disabled = false;
                    return;
                }
                renderConvertMultiTaskList(currentConvertTaskIds);
                startConvertMultiPolling();
            } catch (e) {
                showError(e.message);
            }
            if (btnConvertImage) btnConvertImage.disabled = false;
        });
    }

    function renderConvertMultiTaskList(taskInfos) {
        batchItemList.innerHTML = '';
        taskInfos.forEach((info, idx) => {
            const tid = info.task_id || `err-${idx}`;
            const item = document.createElement('div');
            item.className = 'batch-item';
            item.id = `batch-item-${tid}`;
            if (info.error) {
                item.innerHTML = `
                    <div class="batch-item-icon"><span class="material-symbols-outlined">image</span></div>
                    <div class="batch-item-content">
                        <span class="batch-item-name">${escapeHtml(info.original_name)}</span>
                        <span class="batch-item-status" id="status-${tid}" style="color:var(--error)">${escapeHtml(info.error)}</span>
                    </div>
                    <div class="batch-item-actions" id="actions-${tid}"><span class="material-symbols-outlined" style="color:var(--error)">error</span></div>
                `;
            } else {
                item.innerHTML = `
                    <div class="batch-item-icon"><span class="material-symbols-outlined">image</span></div>
                    <div class="batch-item-content">
                        <span class="batch-item-name">${escapeHtml(info.original_name)}</span>
                        <div class="batch-item-bar-wrapper"><div class="batch-item-bar" id="bar-${tid}" style="width: 0%"></div></div>
                        <span class="batch-item-status" id="status-${tid}">排隊中</span>
                    </div>
                    <div class="batch-item-actions" id="actions-${tid}"><span class="material-symbols-outlined">hourglass_empty</span></div>
                `;
            }
            batchItemList.appendChild(item);
        });
    }

    function startConvertMultiPolling() {
        if (pollInterval) clearInterval(pollInterval);
        pollInterval = setInterval(async () => {
            const taskIds = currentConvertTaskIds.filter(t => t.task_id).map(t => t.task_id);
            if (taskIds.length === 0) {
                clearInterval(pollInterval);
                pollInterval = null;
                showConvertMultiResult();
                return;
            }
            let allDone = true;
            for (const tid of taskIds) {
                try {
                    const res = await fetch(`/api/progress/${tid}`);
                    if (!res.ok) continue;
                    const data = await res.json();
                    lastConvertProgress[tid] = data;
                    const bar = document.getElementById(`bar-${tid}`);
                    const status = document.getElementById(`status-${tid}`);
                    const actions = document.getElementById(`actions-${tid}`);
                    const row = document.getElementById(`batch-item-${tid}`);
                    if (bar) bar.style.width = `${data.progress || 0}%`;
                    if (status) status.textContent = data.message || getStatusText(data.status);
                    if (actions) {
                        if (data.status === 'completed') {
                            actions.innerHTML = `<a class="btn-batch-download" href="/api/download/${encodeURIComponent(tid)}" title="下載"><span class="material-symbols-outlined">download</span></a>`;
                            if (row) row.classList.add('done');
                        } else if (data.status === 'error') {
                            actions.innerHTML = '<span class="material-symbols-outlined" style="color:var(--error)">error</span>';
                            if (row) row.classList.add('error');
                        } else if (data.status === 'processing') {
                            actions.innerHTML = '<span class="material-symbols-outlined spinning" style="color:var(--primary)">autorenew</span>';
                            if (row) row.classList.add('active');
                        }
                    }
                    if (data.status !== 'completed' && data.status !== 'error') allDone = false;
                } catch (e) { allDone = false; }
            }
            const completed = taskIds.filter(tid => lastConvertProgress[tid] && lastConvertProgress[tid].status === 'completed').length;
            const failed = taskIds.filter(tid => lastConvertProgress[tid] && lastConvertProgress[tid].status === 'error').length;
            const total = currentConvertTaskIds.length;
            batchProgressCount.textContent = `${completed + failed} / ${total}`;
            batchProgressBar.style.width = total ? `${((completed + failed) / total) * 100}%` : '0%';
            batchProgressMessage.textContent = `已完成 ${completed} 張，失敗 ${failed} 張`;
            if (allDone && taskIds.every(tid => (lastConvertProgress[tid] || {}).status === 'completed' || (lastConvertProgress[tid] || {}).status === 'error')) {
                clearInterval(pollInterval);
                pollInterval = null;
                showConvertMultiResult();
            }
        }, 1000);
    }

    function showConvertMultiResult() {
        showSection(batchResultSection);
        const completed = currentConvertTaskIds.filter(t => t.task_id && (lastConvertProgress[t.task_id] || {}).status === 'completed');
        const failed = currentConvertTaskIds.filter(t => t.task_id && (lastConvertProgress[t.task_id] || {}).status === 'error');
        const errOnly = currentConvertTaskIds.filter(t => t.error);
        const prefix = currentImageMultiTitlePrefix || '轉檔';
        batchResultTitle.textContent = `${prefix}完成！成功 ${completed.length} 張，失敗 ${failed.length + errOnly.length} 張`;
        batchResultList.innerHTML = '';
        currentConvertTaskIds.forEach(info => {
            if (info.error) {
                const card = document.createElement('div');
                card.className = 'batch-result-card failed';
                card.innerHTML = `
                    <div class="batch-result-thumb error-thumb"><span class="material-symbols-outlined">error</span></div>
                    <div class="batch-result-info">
                        <span class="batch-result-name">${escapeHtml(info.original_name)}</span>
                        <span class="batch-result-meta error-text">${escapeHtml(info.error)}</span>
                    </div>
                `;
                batchResultList.appendChild(card);
                return;
            }
            const data = lastConvertProgress[info.task_id] || {};
            const displayName = (data.result && data.result.download_name) ? data.result.download_name : info.original_name;
            const card = document.createElement('div');
            card.className = `batch-result-card ${data.status === 'completed' ? 'success' : 'failed'}`;
            if (data.status === 'completed' && data.result) {
                card.innerHTML = `
                    <div class="batch-result-thumb">
                        <img src="/api/preview/${encodeURIComponent(info.task_id)}" alt="${escapeHtml(displayName)}">
                    </div>
                    <div class="batch-result-info">
                        <span class="batch-result-name">${escapeHtml(displayName)}</span>
                        <span class="batch-result-meta">${escapeHtml((data.result.output_size || '') + ' | ' + formatFileSize(data.result.file_size || 0))}</span>
                    </div>
                    <a class="btn-icon-download" href="/api/download/${encodeURIComponent(info.task_id)}" title="下載">
                        <span class="material-symbols-outlined">download</span>
                    </a>
                `;
            } else {
                card.innerHTML = `
                    <div class="batch-result-thumb error-thumb"><span class="material-symbols-outlined">error</span></div>
                    <div class="batch-result-info">
                        <span class="batch-result-name">${escapeHtml(info.original_name)}</span>
                        <span class="batch-result-meta error-text">${escapeHtml(data.message || '失敗')}</span>
                    </div>
                `;
            }
            batchResultList.appendChild(card);
        });
        if (completed.length > 0) {
            currentConvertZipUrl = '/api/download-zip?' + completed.map(t => 'task_ids=' + encodeURIComponent(t.task_id)).join('&');
            if (btnBatchDownload) btnBatchDownload.style.display = 'inline-flex';
        } else {
            currentConvertZipUrl = null;
            if (btnBatchDownload) btnBatchDownload.style.display = 'none';
        }
        batchResultSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    const VIDEO_FORMAT_OPTIONS = [
        { value: 'mp4', label: 'MP4' }, { value: 'webm', label: 'WebM' }, { value: 'mkv', label: 'MKV' },
        { value: 'avi', label: 'AVI' }, { value: 'mov', label: 'MOV' },
    ];
    const convertVideoFileListWrap = document.getElementById('convertVideoFileListWrap');
    const convertVideoFileList = document.getElementById('convertVideoFileList');
    const convertVideoFileCount = document.getElementById('convertVideoFileCount');
    const btnConvertVideoText = document.getElementById('btnConvertVideoText');

    function renderConvertVideoFileList() {
        if (!convertVideoFileList || !convertVideoFileCount) return;
        convertVideoFileCount.textContent = selectedConvertVideoFiles.length;
        if (convertVideoFileListWrap) convertVideoFileListWrap.style.display = selectedConvertVideoFiles.length ? 'block' : 'none';
        convertVideoFileList.innerHTML = '';
        selectedConvertVideoFiles.forEach((item, index) => {
            const file = item.file || item;
            const format = item.format != null ? item.format : 'mp4';
            const name = file.name || '';
            const row = document.createElement('div');
            row.className = 'convert-file-list-item';
            const selectHtml = VIDEO_FORMAT_OPTIONS.map(o => `<option value="${o.value}" ${o.value === format ? 'selected' : ''}>${o.label}</option>`).join('');
            row.innerHTML = `
                <span class="convert-file-name" title="${escapeHtml(name)}">${escapeHtml(name)}</span>
                <select class="convert-file-format-select" data-index="${index}">${selectHtml}</select>
                <button type="button" class="btn-remove-convert" title="移除此檔"><span class="material-symbols-outlined">close</span></button>
            `;
            row.querySelector('.convert-file-format-select').addEventListener('change', (e) => { selectedConvertVideoFiles[index].format = e.target.value; });
            row.querySelector('.btn-remove-convert').addEventListener('click', () => {
                selectedConvertVideoFiles.splice(index, 1);
                renderConvertVideoFileList();
                if (btnConvertVideo) btnConvertVideo.disabled = selectedConvertVideoFiles.length === 0;
                if (btnConvertVideoText) btnConvertVideoText.textContent = selectedConvertVideoFiles.length === 1 ? '開始轉檔' : (selectedConvertVideoFiles.length > 1 ? `批量轉檔 ${selectedConvertVideoFiles.length} 部` : '開始轉檔');
            });
            convertVideoFileList.appendChild(row);
        });
        if (btnConvertVideo) btnConvertVideo.disabled = selectedConvertVideoFiles.length === 0;
        if (btnConvertVideoText) btnConvertVideoText.textContent = selectedConvertVideoFiles.length === 1 ? '開始轉檔' : (selectedConvertVideoFiles.length > 1 ? `批量轉檔 ${selectedConvertVideoFiles.length} 部` : '開始轉檔');
    }

    if (convertVideoInput) {
        convertVideoInput.addEventListener('change', () => {
            const files = Array.from(convertVideoInput.files || []);
            const defaultFmt = convertVideoFormat ? convertVideoFormat.value : 'mp4';
            for (const f of files) {
                if (selectedConvertVideoFiles.length >= 10) break;
                selectedConvertVideoFiles.unshift({ file: f, format: defaultFmt });
            }
            convertVideoInput.value = '';
            renderConvertVideoFileList();
        });
    }
    if (btnConvertVideo) {
        btnConvertVideo.addEventListener('click', async () => {
            if (selectedConvertVideoFiles.length === 0) return;
            btnConvertVideo.disabled = true;
            showSection(batchProgressSection);
            batchProgressTitle.textContent = selectedConvertVideoFiles.length > 1 ? '影片批量轉檔中...' : '影片轉檔中...';
            batchProgressBar.style.width = '0%';
            batchProgressMessage.textContent = '上傳中...';
            batchProgressCount.textContent = '';
            batchItemList.innerHTML = '';
            const first = selectedConvertVideoFiles[0];
            const file = first.file || first;
            const format = first.format != null ? first.format : (convertVideoFormat ? convertVideoFormat.value : 'mp4');

            if (selectedConvertVideoFiles.length === 1) {
                const formData = new FormData();
                formData.append('file', file);
                formData.append('format', format);
                try {
                    const res = await fetch('/api/convert/video', { method: 'POST', body: formData });
                    if (!res.ok) { const err = await res.json(); throw new Error(err.detail || '轉檔失敗'); }
                    const data = await res.json();
                    currentTaskId = data.task_id;
                    currentBatchId = null;
                    currentVideoMultiTaskIds = [];
                    startConvertVideoPolling();
                } catch (e) { showError(e.message); }
                if (btnConvertVideo) btnConvertVideo.disabled = false;
                return;
            }

            currentVideoMultiTitlePrefix = '轉檔';
            currentVideoMultiTaskIds = [];
            lastVideoMultiProgress = {};
            try {
                for (let i = 0; i < selectedConvertVideoFiles.length; i++) {
                    const it = selectedConvertVideoFiles[i];
                    const f = it.file || it;
                    const fmt = it.format != null ? it.format : 'mp4';
                    batchProgressMessage.textContent = `上傳第 ${i + 1}/${selectedConvertVideoFiles.length} 部...`;
                    const formData = new FormData();
                    formData.append('file', f);
                    formData.append('format', fmt);
                    const res = await fetch('/api/convert/video', { method: 'POST', body: formData });
                    if (!res.ok) {
                        const err = await res.json();
                        currentVideoMultiTaskIds.push({ task_id: null, original_name: f.name, error: err.detail || '上傳失敗' });
                        continue;
                    }
                    const data = await res.json();
                    currentVideoMultiTaskIds.push({ task_id: data.task_id, original_name: data.original_filename || f.name });
                }
                const valid = currentVideoMultiTaskIds.filter(t => t.task_id);
                if (valid.length === 0) {
                    showError(currentVideoMultiTaskIds[0]?.error || '沒有成功加入轉檔');
                    if (btnConvertVideo) btnConvertVideo.disabled = false;
                    return;
                }
                renderVideoMultiTaskList(currentVideoMultiTaskIds);
                startVideoMultiPolling();
            } catch (e) { showError(e.message); }
            if (btnConvertVideo) btnConvertVideo.disabled = false;
        });
    }

    function renderVideoMultiTaskList(taskInfos) {
        batchItemList.innerHTML = '';
        taskInfos.forEach((info, idx) => {
            const tid = info.task_id || `verr-${idx}`;
            const item = document.createElement('div');
            item.className = 'batch-item';
            item.id = `batch-item-${tid}`;
            if (info.error) {
                item.innerHTML = `
                    <div class="batch-item-icon"><span class="material-symbols-outlined">movie</span></div>
                    <div class="batch-item-content">
                        <span class="batch-item-name">${escapeHtml(info.original_name)}</span>
                        <span class="batch-item-status" id="status-${tid}" style="color:var(--error)">${escapeHtml(info.error)}</span>
                    </div>
                    <div class="batch-item-actions" id="actions-${tid}"><span class="material-symbols-outlined" style="color:var(--error)">error</span></div>
                `;
            } else {
                item.innerHTML = `
                    <div class="batch-item-icon"><span class="material-symbols-outlined">movie</span></div>
                    <div class="batch-item-content">
                        <span class="batch-item-name">${escapeHtml(info.original_name)}</span>
                        <div class="batch-item-bar-wrapper"><div class="batch-item-bar" id="bar-${tid}" style="width: 0%"></div></div>
                        <span class="batch-item-status" id="status-${tid}">排隊中</span>
                    </div>
                    <div class="batch-item-actions" id="actions-${tid}"><span class="material-symbols-outlined">hourglass_empty</span></div>
                `;
            }
            batchItemList.appendChild(item);
        });
    }

    function startVideoMultiPolling() {
        if (pollInterval) clearInterval(pollInterval);
        pollInterval = setInterval(async () => {
            const taskIds = currentVideoMultiTaskIds.filter(t => t.task_id).map(t => t.task_id);
            if (taskIds.length === 0) {
                clearInterval(pollInterval); pollInterval = null;
                showVideoMultiResult();
                return;
            }
            let allDone = true;
            for (const tid of taskIds) {
                try {
                    const res = await fetch(`/api/video/progress/${tid}`);
                    if (!res.ok) continue;
                    const data = await res.json();
                    lastVideoMultiProgress[tid] = data;
                    const bar = document.getElementById(`bar-${tid}`);
                    const status = document.getElementById(`status-${tid}`);
                    const actions = document.getElementById(`actions-${tid}`);
                    const row = document.getElementById(`batch-item-${tid}`);
                    if (bar) bar.style.width = `${data.progress || 0}%`;
                    if (status) status.textContent = data.message || getStatusText(data.status);
                    if (actions) {
                        if (data.status === 'completed') {
                            actions.innerHTML = `<a class="btn-batch-download" href="/api/video/download/${encodeURIComponent(tid)}" title="下載"><span class="material-symbols-outlined">download</span></a>`;
                            if (row) row.classList.add('done');
                        } else if (data.status === 'error') {
                            actions.innerHTML = '<span class="material-symbols-outlined" style="color:var(--error)">error</span>';
                            if (row) row.classList.add('error');
                        } else if (data.status === 'processing') {
                            actions.innerHTML = '<span class="material-symbols-outlined spinning" style="color:var(--primary)">autorenew</span>';
                            if (row) row.classList.add('active');
                        }
                    }
                    if (data.status !== 'completed' && data.status !== 'error') allDone = false;
                } catch (e) { allDone = false; }
            }
            const completed = taskIds.filter(tid => lastVideoMultiProgress[tid] && lastVideoMultiProgress[tid].status === 'completed').length;
            const failed = taskIds.filter(tid => lastVideoMultiProgress[tid] && lastVideoMultiProgress[tid].status === 'error').length;
            const total = currentVideoMultiTaskIds.length;
            batchProgressCount.textContent = `${completed + failed} / ${total}`;
            batchProgressBar.style.width = total ? `${((completed + failed) / total) * 100}%` : '0%';
            batchProgressMessage.textContent = `已完成 ${completed} 部，失敗 ${failed} 部`;
            if (allDone && taskIds.every(tid => (lastVideoMultiProgress[tid] || {}).status === 'completed' || (lastVideoMultiProgress[tid] || {}).status === 'error')) {
                clearInterval(pollInterval); pollInterval = null;
                showVideoMultiResult();
            }
        }, 1500);
    }

    function showVideoMultiResult() {
        showSection(videoResultSection);
        const completed = currentVideoMultiTaskIds.filter(t => t.task_id && (lastVideoMultiProgress[t.task_id] || {}).status === 'completed');
        const failed = currentVideoMultiTaskIds.filter(t => t.task_id && (lastVideoMultiProgress[t.task_id] || {}).status === 'error');
        const errOnly = currentVideoMultiTaskIds.filter(t => t.error);
        const vPrefix = currentVideoMultiTitlePrefix || '轉檔';
        if (videoResultTitle) videoResultTitle.textContent = `${vPrefix}完成！成功 ${completed.length} 部，失敗 ${failed.length + errOnly.length} 部`;
        if (videoResultList) {
            videoResultList.innerHTML = '';
            currentVideoMultiTaskIds.forEach(info => {
                if (info.error) {
                    const card = document.createElement('div');
                    card.className = 'batch-result-card failed';
                    card.innerHTML = `<div class="batch-result-thumb error-thumb"><span class="material-symbols-outlined">error</span></div><div class="batch-result-info"><span class="batch-result-name">${escapeHtml(info.original_name)}</span><span class="batch-result-meta error-text">${escapeHtml(info.error)}</span></div>`;
                    videoResultList.appendChild(card);
                    return;
                }
                const data = lastVideoMultiProgress[info.task_id] || {};
                const displayName = (data.result && data.result.download_name) ? data.result.download_name : info.original_name;
                const card = document.createElement('div');
                card.className = `batch-result-card ${data.status === 'completed' ? 'success' : 'failed'}`;
                if (data.status === 'completed' && data.result) {
                    card.innerHTML = `
                        <div class="batch-result-thumb"><span class="material-symbols-outlined" style="font-size:2rem;color:var(--success)">movie</span></div>
                        <div class="batch-result-info">
                            <span class="batch-result-name">${escapeHtml(displayName)}</span>
                            <span class="batch-result-meta">${formatFileSize(data.result.file_size || 0)}</span>
                        </div>
                        <a class="btn-icon-download" href="/api/video/download/${encodeURIComponent(info.task_id)}" title="下載"><span class="material-symbols-outlined">download</span></a>
                    `;
                } else {
                    card.innerHTML = `<div class="batch-result-thumb error-thumb"><span class="material-symbols-outlined">error</span></div><div class="batch-result-info"><span class="batch-result-name">${escapeHtml(info.original_name)}</span><span class="batch-result-meta error-text">${escapeHtml(data.message || '失敗')}</span></div>`;
                }
                videoResultList.appendChild(card);
            });
        }
        if (completed.length > 0) {
            currentVideoZipUrl = '/api/video/download-zip?' + completed.map(t => 'task_ids=' + encodeURIComponent(t.task_id)).join('&');
            if (btnVideoBatchDownload) { btnVideoBatchDownload.style.display = 'inline-flex'; btnVideoBatchDownload.textContent = ''; btnVideoBatchDownload.innerHTML = '<span class="material-symbols-outlined">folder_zip</span><span>一鍵下載全部 (ZIP)</span>'; }
        } else {
            currentVideoZipUrl = null;
            if (btnVideoBatchDownload) btnVideoBatchDownload.style.display = 'none';
        }
        videoResultSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    function startConvertVideoPolling() {
        if (pollInterval) clearInterval(pollInterval);
        pollInterval = setInterval(async () => {
            try {
                const res = await fetch(`/api/video/progress/${currentTaskId}`);
                if (!res.ok) return;
                const data = await res.json();
                batchProgressBar.style.width = `${data.progress || 0}%`;
                batchProgressMessage.textContent = data.message || '處理中...';
                batchProgressCount.textContent = `${data.progress || 0}%`;
                if (data.status === 'completed') {
                    clearInterval(pollInterval); pollInterval = null;
                    showSingleVideoResult(currentTaskId, data.result || {}, (data.result && data.result.original_name) ? data.result.original_name : '');
                } else if (data.status === 'error') {
                    clearInterval(pollInterval); pollInterval = null;
                    showError(data.message);
                }
            } catch (e) { console.error(e); }
        }, 1000);
    }

    const compressImageFileListWrap = document.getElementById('compressImageFileListWrap');
    const compressImageFileList = document.getElementById('compressImageFileList');
    const compressImageFileCount = document.getElementById('compressImageFileCount');
    const btnCompressImageText = document.getElementById('btnCompressImageText');
    const compressVideoFileListWrap = document.getElementById('compressVideoFileListWrap');
    const compressVideoFileList = document.getElementById('compressVideoFileList');
    const compressVideoFileCount = document.getElementById('compressVideoFileCount');
    const btnCompressVideoText = document.getElementById('btnCompressVideoText');

    function loadImageDimensions(file, done) {
        if (!file || !file.type.startsWith('image/')) { done(null, null); return; }
        var url = URL.createObjectURL(file);
        var img = new Image();
        img.onload = function () {
            var w = img.naturalWidth, h = img.naturalHeight;
            URL.revokeObjectURL(url);
            done(w, h);
        };
        img.onerror = function () { URL.revokeObjectURL(url); done(null, null); };
        img.src = url;
    }

    function renderCompressImageFileList() {
        if (!compressImageFileList || !compressImageFileCount) return;
        compressImageFileCount.textContent = selectedCompressImageFiles.length;
        if (compressImageFileListWrap) compressImageFileListWrap.style.display = selectedCompressImageFiles.length ? 'block' : 'none';
        compressImageFileList.innerHTML = '';
        selectedCompressImageFiles.forEach((item, index) => {
            const file = item.file || item;
            const q = item.quality != null ? item.quality : 80;
            const mw = item.maxW != null && item.maxW !== '' ? item.maxW : '';
            const mh = item.maxH != null && item.maxH !== '' ? item.maxH : '';
            const name = file.name || '';
            const row = document.createElement('div');
            row.className = 'convert-file-list-item compress-image-item';
            row.innerHTML = `
                <span class="convert-file-name" title="${escapeHtml(name)}">${escapeHtml(name)}</span>
                <label>品質</label><input type="number" class="compress-quality-input" data-index="${index}" data-field="quality" min="1" max="100" value="${q}" style="width:3.5rem">
                <label class="optional-label">最大寬</label><input type="number" class="compress-optional" data-index="${index}" data-field="maxW" placeholder="—" min="1" value="${mw}" style="width:4rem">
                <label class="optional-label">最大高</label><input type="number" class="compress-optional" data-index="${index}" data-field="maxH" placeholder="—" min="1" value="${mh}" style="width:4rem">
                <button type="button" class="btn-remove-convert" title="移除此檔"><span class="material-symbols-outlined">close</span></button>
            `;
            (function (it, idx) {
                var qualityIn = row.querySelector('input[data-field="quality"]');
                function restoreQualityDefault() {
                    it.quality = (it.quality != null && it.quality >= 1 && it.quality <= 100) ? it.quality : 80;
                    qualityIn.value = it.quality;
                }
                qualityIn.addEventListener('input', function () {
                    var v = qualityIn.value.trim();
                    var n = parseInt(v, 10);
                    if (v === '' || isNaN(n) || n < 1) { restoreQualityDefault(); return; }
                    if (n > 100) n = 100;
                    it.quality = n;
                });
                qualityIn.addEventListener('blur', function () {
                    var v = qualityIn.value.trim();
                    var n = parseInt(v, 10);
                    if (v === '' || isNaN(n) || n < 1 || n > 100) restoreQualityDefault();
                });
            })(item, index);
            (function (it, idx) {
                var maxWIn = row.querySelector('input[data-field="maxW"]');
                var maxHIn = row.querySelector('input[data-field="maxH"]');
                function restoreDefault() {
                    if (it.width != null && it.height != null) {
                        it.maxW = it.width;
                        it.maxH = it.height;
                        maxWIn.value = it.maxW;
                        maxHIn.value = it.maxH;
                    } else {
                        it.maxW = it.maxW != null && it.maxW >= 1 ? it.maxW : 1;
                        it.maxH = it.maxH != null && it.maxH >= 1 ? it.maxH : 1;
                        maxWIn.value = it.maxW;
                        maxHIn.value = it.maxH;
                    }
                }
                maxWIn.addEventListener('input', function () {
                    var v = maxWIn.value.trim();
                    var n = parseInt(v, 10);
                    if (v === '' || isNaN(n) || n < 1) { restoreDefault(); return; }
                    it.maxW = n;
                    if (it.width && it.height) {
                        it.maxH = Math.round(it.height * n / it.width);
                        maxHIn.value = it.maxH;
                    }
                });
                maxWIn.addEventListener('blur', function () {
                    var v = maxWIn.value.trim();
                    var n = parseInt(v, 10);
                    if (v === '' || isNaN(n) || n < 1) restoreDefault();
                });
                maxHIn.addEventListener('input', function () {
                    var v = maxHIn.value.trim();
                    var n = parseInt(v, 10);
                    if (v === '' || isNaN(n) || n < 1) { restoreDefault(); return; }
                    it.maxH = n;
                    if (it.width && it.height) {
                        it.maxW = Math.round(it.width * n / it.height);
                        maxWIn.value = it.maxW;
                    }
                });
                maxHIn.addEventListener('blur', function () {
                    var v = maxHIn.value.trim();
                    var n = parseInt(v, 10);
                    if (v === '' || isNaN(n) || n < 1) restoreDefault();
                });
            })(item, index);
            row.querySelector('.btn-remove-convert').addEventListener('click', () => {
                selectedCompressImageFiles.splice(index, 1);
                renderCompressImageFileList();
                if (btnCompressImage) btnCompressImage.disabled = selectedCompressImageFiles.length === 0;
                if (btnCompressImageText) btnCompressImageText.textContent = selectedCompressImageFiles.length === 1 ? '開始壓縮' : (selectedCompressImageFiles.length > 1 ? `批量壓縮 ${selectedCompressImageFiles.length} 張` : '開始壓縮');
            });
            compressImageFileList.appendChild(row);
        });
        if (btnCompressImage) btnCompressImage.disabled = selectedCompressImageFiles.length === 0;
        if (btnCompressImageText) btnCompressImageText.textContent = selectedCompressImageFiles.length === 1 ? '開始壓縮' : (selectedCompressImageFiles.length > 1 ? `批量壓縮 ${selectedCompressImageFiles.length} 張` : '開始壓縮');
    }

    if (compressImageInput) {
        compressImageInput.addEventListener('change', () => {
            const files = Array.from(compressImageInput.files || []);
            const defaultQ = compressImageQuality ? parseInt(compressImageQuality.value, 10) : 80;
            for (const f of files) {
                if (selectedCompressImageFiles.length >= 20) break;
                const item = { file: f, quality: defaultQ, maxW: null, maxH: null, width: null, height: null };
                selectedCompressImageFiles.unshift(item);
                loadImageDimensions(f, function (w, h) {
                    item.width = w;
                    item.height = h;
                    if (w != null && h != null) { item.maxW = w; item.maxH = h; }
                    renderCompressImageFileList();
                });
            }
            compressImageInput.value = '';
            renderCompressImageFileList();
        });
    }
    if (btnCompressImage) {
        btnCompressImage.addEventListener('click', async () => {
            if (selectedCompressImageFiles.length === 0) return;
            btnCompressImage.disabled = true;
            showSection(batchProgressSection);
            batchProgressTitle.textContent = selectedCompressImageFiles.length > 1 ? '圖片批量壓縮中...' : '圖片壓縮中...';
            batchProgressBar.style.width = '0%';
            batchProgressMessage.textContent = '上傳中...';
            batchProgressCount.textContent = '';
            batchItemList.innerHTML = '';
            const first = selectedCompressImageFiles[0];
            const file = first.file || first;
            const quality = first.quality != null ? first.quality : (compressImageQuality ? parseInt(compressImageQuality.value, 10) : 80);
            const mw = first.maxW != null && first.maxW !== '' ? first.maxW : null;
            const mh = first.maxH != null && first.maxH !== '' ? first.maxH : null;

            if (selectedCompressImageFiles.length === 1) {
                const formData = new FormData();
                formData.append('file', file);
                formData.append('quality', quality);
                if (mw) formData.append('max_width', mw);
                if (mh) formData.append('max_height', mh);
                try {
                    const res = await fetch('/api/compress/image', { method: 'POST', body: formData });
                    if (!res.ok) { const err = await res.json(); throw new Error(err.detail || '壓縮失敗'); }
                    const data = await res.json();
                    currentImageMultiTitlePrefix = '壓縮';
                    currentConvertTaskIds = [{ task_id: data.task_id, original_name: data.original_filename || file.name }];
                    lastConvertProgress = {};
                    renderConvertMultiTaskList(currentConvertTaskIds);
                    startConvertMultiPolling();
                } catch (e) { showError(e.message); }
                if (btnCompressImage) btnCompressImage.disabled = false;
                return;
            }

            currentImageMultiTitlePrefix = '壓縮';
            currentConvertTaskIds = [];
            lastConvertProgress = {};
            try {
                for (let i = 0; i < selectedCompressImageFiles.length; i++) {
                    const it = selectedCompressImageFiles[i];
                    const f = it.file || it;
                    const q = it.quality != null ? it.quality : 80;
                    const w = it.maxW != null && it.maxW !== '' ? it.maxW : null;
                    const h = it.maxH != null && it.maxH !== '' ? it.maxH : null;
                    batchProgressMessage.textContent = `上傳第 ${i + 1}/${selectedCompressImageFiles.length} 張...`;
                    const formData = new FormData();
                    formData.append('file', f);
                    formData.append('quality', q);
                    if (w) formData.append('max_width', w);
                    if (h) formData.append('max_height', h);
                    const res = await fetch('/api/compress/image', { method: 'POST', body: formData });
                    if (!res.ok) {
                        const err = await res.json();
                        currentConvertTaskIds.push({ task_id: null, original_name: f.name, error: err.detail || '上傳失敗' });
                        continue;
                    }
                    const data = await res.json();
                    currentConvertTaskIds.push({ task_id: data.task_id, original_name: data.original_filename || f.name });
                }
                const valid = currentConvertTaskIds.filter(t => t.task_id);
                if (valid.length === 0) {
                    showError(currentConvertTaskIds[0]?.error || '沒有成功加入壓縮');
                    if (btnCompressImage) btnCompressImage.disabled = false;
                    return;
                }
                renderConvertMultiTaskList(currentConvertTaskIds);
                startConvertMultiPolling();
            } catch (e) { showError(e.message); }
            if (btnCompressImage) btnCompressImage.disabled = false;
        });
    }

    function renderCompressVideoFileList() {
        if (!compressVideoFileList || !compressVideoFileCount) return;
        compressVideoFileCount.textContent = selectedCompressVideoFiles.length;
        if (compressVideoFileListWrap) compressVideoFileListWrap.style.display = selectedCompressVideoFiles.length ? 'block' : 'none';
        compressVideoFileList.innerHTML = '';
        selectedCompressVideoFiles.forEach((item, index) => {
            const file = item.file || item;
            const crf = item.crf != null ? item.crf : 23;
            const name = file.name || '';
            const row = document.createElement('div');
            row.className = 'convert-file-list-item';
            row.innerHTML = `
                <span class="convert-file-name" title="${escapeHtml(name)}">${escapeHtml(name)}</span>
                <label>CRF</label><input type="number" class="compress-quality-input" data-index="${index}" min="18" max="28" value="${crf}" style="width:3.5rem">
                <button type="button" class="btn-remove-convert" title="移除此檔"><span class="material-symbols-outlined">close</span></button>
            `;
            row.querySelector('input').addEventListener('input', (e) => { selectedCompressVideoFiles[index].crf = parseInt(e.target.value, 10) || 23; });
            row.querySelector('.btn-remove-convert').addEventListener('click', () => {
                selectedCompressVideoFiles.splice(index, 1);
                renderCompressVideoFileList();
                if (btnCompressVideo) btnCompressVideo.disabled = selectedCompressVideoFiles.length === 0;
                if (btnCompressVideoText) btnCompressVideoText.textContent = selectedCompressVideoFiles.length === 1 ? '開始壓縮' : (selectedCompressVideoFiles.length > 1 ? `批量壓縮 ${selectedCompressVideoFiles.length} 部` : '開始壓縮');
            });
            compressVideoFileList.appendChild(row);
        });
        if (btnCompressVideo) btnCompressVideo.disabled = selectedCompressVideoFiles.length === 0;
        if (btnCompressVideoText) btnCompressVideoText.textContent = selectedCompressVideoFiles.length === 1 ? '開始壓縮' : (selectedCompressVideoFiles.length > 1 ? `批量壓縮 ${selectedCompressVideoFiles.length} 部` : '開始壓縮');
    }

    if (compressVideoInput) {
        compressVideoInput.addEventListener('change', () => {
            const files = Array.from(compressVideoInput.files || []);
            const defaultCrf = compressVideoCrf ? parseInt(compressVideoCrf.value, 10) : 23;
            for (const f of files) {
                if (selectedCompressVideoFiles.length >= 10) break;
                selectedCompressVideoFiles.unshift({ file: f, crf: defaultCrf });
            }
            compressVideoInput.value = '';
            renderCompressVideoFileList();
        });
    }
    if (btnCompressVideo) {
        btnCompressVideo.addEventListener('click', async () => {
            if (selectedCompressVideoFiles.length === 0) return;
            btnCompressVideo.disabled = true;
            showSection(batchProgressSection);
            batchProgressTitle.textContent = selectedCompressVideoFiles.length > 1 ? '影片批量壓縮中...' : '影片壓縮中...';
            batchProgressBar.style.width = '0%';
            batchProgressMessage.textContent = '上傳中...';
            batchProgressCount.textContent = '';
            batchItemList.innerHTML = '';
            const first = selectedCompressVideoFiles[0];
            const file = first.file || first;
            const crf = first.crf != null ? first.crf : (compressVideoCrf ? parseInt(compressVideoCrf.value, 10) : 23);

            if (selectedCompressVideoFiles.length === 1) {
                const formData = new FormData();
                formData.append('file', file);
                formData.append('crf', crf);
                try {
                    const res = await fetch('/api/compress/video', { method: 'POST', body: formData });
                    if (!res.ok) { const err = await res.json(); throw new Error(err.detail || '壓縮失敗'); }
                    const data = await res.json();
                    currentTaskId = data.task_id;
                    currentBatchId = null;
                    currentVideoMultiTaskIds = [];
                    startConvertVideoPolling();
                } catch (e) { showError(e.message); }
                if (btnCompressVideo) btnCompressVideo.disabled = false;
                return;
            }

            currentVideoMultiTitlePrefix = '壓縮';
            currentVideoMultiTaskIds = [];
            lastVideoMultiProgress = {};
            try {
                for (let i = 0; i < selectedCompressVideoFiles.length; i++) {
                    const it = selectedCompressVideoFiles[i];
                    const f = it.file || it;
                    const c = it.crf != null ? it.crf : 23;
                    batchProgressMessage.textContent = `上傳第 ${i + 1}/${selectedCompressVideoFiles.length} 部...`;
                    const formData = new FormData();
                    formData.append('file', f);
                    formData.append('crf', c);
                    const res = await fetch('/api/compress/video', { method: 'POST', body: formData });
                    if (!res.ok) {
                        const err = await res.json();
                        currentVideoMultiTaskIds.push({ task_id: null, original_name: f.name, error: err.detail || '上傳失敗' });
                        continue;
                    }
                    const data = await res.json();
                    currentVideoMultiTaskIds.push({ task_id: data.task_id, original_name: data.original_filename || f.name });
                }
                const valid = currentVideoMultiTaskIds.filter(t => t.task_id);
                if (valid.length === 0) {
                    showError(currentVideoMultiTaskIds[0]?.error || '沒有成功加入壓縮');
                    if (btnCompressVideo) btnCompressVideo.disabled = false;
                    return;
                }
                renderVideoMultiTaskList(currentVideoMultiTaskIds);
                startVideoMultiPolling();
            } catch (e) { showError(e.message); }
            if (btnCompressVideo) btnCompressVideo.disabled = false;
        });
    }

    // =====================================================================
    //  錯誤處理
    // =====================================================================
    function showError(message) {
        showSection(errorSection);
        errorMessage.textContent = message;
        if (btnUpscale) btnUpscale.disabled = false;
        if (btnVideoUpscale) btnVideoUpscale.disabled = false;
        if (btnConvertImage) btnConvertImage.disabled = selectedConvertFiles.length === 0;
        if (btnConvertVideo) btnConvertVideo.disabled = selectedConvertVideoFiles.length === 0;
        if (btnCompressImage) btnCompressImage.disabled = selectedCompressImageFiles.length === 0;
        if (btnCompressVideo) btnCompressVideo.disabled = selectedCompressVideoFiles.length === 0;
    }

    // =====================================================================
    //  下載按鈕
    // =====================================================================
    if (btnDownload) {
        btnDownload.addEventListener('click', () => {
            if (currentTaskId) window.location.href = `/api/download/${currentTaskId}`;
        });
    }
    if (btnBatchDownload) {
        btnBatchDownload.addEventListener('click', () => {
            if (currentConvertZipUrl) {
                window.location.href = currentConvertZipUrl;
                return;
            }
            if (currentBatchId) window.location.href = `/api/batch-download/${currentBatchId}`;
        });
    }
    if (btnVideoBatchDownload) {
        btnVideoBatchDownload.addEventListener('click', () => {
            if (currentVideoZipUrl) { window.location.href = currentVideoZipUrl; return; }
            if (currentVideoBatchId) window.location.href = `/api/video/batch-download/${currentVideoBatchId}`;
        });
    }

    // =====================================================================
    //  重置 (返回上傳頁面)
    // =====================================================================
    function resetImage() {
        selectedFiles = [];
        currentTaskId = null;
        currentBatchId = null;
        currentBatchMode = null;
        currentConvertZipUrl = null;
        currentVideoZipUrl = null;
        fileInput.value = '';
        if (optionsPanel) optionsPanel.style.display = 'none';
        if (uploadArea) uploadArea.style.display = 'block';
        if (btnUpscale) btnUpscale.disabled = false;
        batchProgressBar.style.width = '0%';
        if (pollInterval) { clearInterval(pollInterval); pollInterval = null; }
        activeMode = 'image';
        showTabView();
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    function resetVideo() {
        isVideoProcessing = false;
        selectedVideoFiles = [];
        currentVideoBatchId = null;
        currentVideoZipUrl = null;
        if (videoFileInput) videoFileInput.value = '';
        if (videoOptionsPanel) videoOptionsPanel.style.display = 'none';
        if (videoUploadArea) videoUploadArea.style.display = 'block';
        if (btnVideoUpscale) btnVideoUpscale.disabled = false;
        batchProgressBar.style.width = '0%';
        if (pollInterval) { clearInterval(pollInterval); pollInterval = null; }
        activeMode = 'video';
        showTabView();
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    function resetAll() {
        if (activeMode === 'video') {
            resetVideo();
        } else {
            resetImage();
        }
    }

    if (btnNewUpload) btnNewUpload.addEventListener('click', resetImage);
    if (btnBatchNewUpload) btnBatchNewUpload.addEventListener('click', resetImage);
    if (btnVideoNewUpload) btnVideoNewUpload.addEventListener('click', resetVideo);
    if (btnRetry) btnRetry.addEventListener('click', resetAll);

    // =====================================================================
    //  前後對比滑桿
    // =====================================================================
    function initComparisonSlider() {
        let isDragging = false;
        function updateSlider(x) {
            const rect = comparisonSlider.getBoundingClientRect();
            let percent = ((x - rect.left) / rect.width) * 100;
            percent = Math.max(0, Math.min(100, percent));
            comparisonSlider.querySelector('.original').style.clipPath = `inset(0 ${100 - percent}% 0 0)`;
            comparisonSlider.querySelector('.upscaled').style.clipPath = `inset(0 0 0 ${percent}%)`;
            sliderHandle.style.left = `${percent}%`;
        }
        comparisonSlider.addEventListener('mousedown', (e) => { isDragging = true; updateSlider(e.clientX); });
        document.addEventListener('mousemove', (e) => { if (isDragging) { e.preventDefault(); updateSlider(e.clientX); } });
        document.addEventListener('mouseup', () => { isDragging = false; });
        comparisonSlider.addEventListener('touchstart', (e) => { isDragging = true; updateSlider(e.touches[0].clientX); });
        document.addEventListener('touchmove', (e) => { if (isDragging) updateSlider(e.touches[0].clientX); });
        document.addEventListener('touchend', () => { isDragging = false; });
        updateSlider(comparisonSlider.getBoundingClientRect().left + comparisonSlider.offsetWidth / 2);
    }

    // =====================================================================
    //  歷史任務紀錄 — 重開頁面時顯示最近完成的任務
    // =====================================================================
    const historyList = document.getElementById('historyList');
    const btnCleanup = document.getElementById('btnCleanup');

    async function loadHistory() {
        try {
            const resp = await fetch('/api/history');
            if (!resp.ok) return;
            const history = await resp.json();
            if (!history || history.length === 0) {
                if (historyEl) historyEl.style.display = 'none';
                return;
            }
            renderHistory(history);
            if (historyEl) historyEl.style.display = 'block';
        } catch (e) {
            // 伺服器可能已離線
        }
    }

    function renderHistory(history) {
        if (!historyList) return;
        historyList.innerHTML = history.map(item => {
            const isImage = item.type === 'image';
            const iconClass = isImage ? 'image-type' : 'video-type';
            const icon = isImage ? 'image' : 'movie';
            const result = item.result || {};
            const displayName = result.download_name || item.original_name || '';
            const originalSize = result.original_size || '-';
            const outputSize = result.output_size || '-';
            const fileSize = result.file_size ? formatFileSize(result.file_size) : '-';
            const downloadUrl = isImage
                ? `/api/download/${item.task_id}`
                : `/api/video/download/${item.task_id}`;
            const timeStr = formatTimeAgo(item.timestamp);
            return `
                <div class="history-item">
                    <div class="history-item-icon ${iconClass}">
                        <span class="material-symbols-outlined">${icon}</span>
                    </div>
                    <div class="history-item-info">
                        <div class="history-item-name" title="${escapeHtml(displayName)}">${escapeHtml(displayName)}</div>
                        <div class="history-item-meta">
                            <span>${originalSize} → ${outputSize}</span>
                            <span>${fileSize}</span>
                            <span>${timeStr}</span>
                        </div>
                    </div>
                    <div class="history-item-actions">
                        <a class="btn-history-download" href="${downloadUrl}" download>
                            <span class="material-symbols-outlined">download</span>
                            下載
                        </a>
                    </div>
                </div>
            `;
        }).join('');
    }

    function formatTimeAgo(timestamp) {
        const now = Date.now() / 1000;
        const diff = Math.floor(now - timestamp);
        if (diff < 60) return '剛剛';
        if (diff < 3600) return `${Math.floor(diff / 60)} 分鐘前`;
        if (diff < 86400) return `${Math.floor(diff / 3600)} 小時前`;
        return `${Math.floor(diff / 86400)} 天前`;
    }

    if (btnCleanup) {
        btnCleanup.addEventListener('click', async () => {
            if (!confirm('確定要清除所有暫存檔案嗎？\n\n將清除：\n• uploads/ 中的上傳檔案\n• outputs/ 中的處理結果\n• 歷史任務紀錄\n\n清除後下載連結將失效。')) return;
            try {
                const resp = await fetch('/api/cleanup', { method: 'POST' });
                const data = await resp.json();
                if (historyEl) historyEl.style.display = 'none';
                alert(data.message || '清除完成');
            } catch (e) {
                alert('清除失敗，請稍後再試');
            }
        });
    }

    // 頁面載入時讀取歷史
    loadHistory();

    // =====================================================================
    //  伺服器存活檢測 — 定期偵測伺服器是否仍在運作
    //  關掉 CMD 視窗後重開 start.bat，瀏覽器會自動偵測並重新載入頁面
    // =====================================================================
    const serverStatusBar = document.getElementById('serverStatusBar');
    const serverStatusText = document.getElementById('serverStatusText');
    let serverAlive = true;
    let pingFailCount = 0;

    async function checkServerAlive() {
        try {
            const resp = await fetch('/api/ping', { signal: AbortSignal.timeout(3000) });
            if (resp.ok) {
                if (!serverAlive) {
                    // 伺服器恢復 — 自動重新載入頁面
                    serverAlive = true;
                    pingFailCount = 0;
                    if (serverStatusBar) {
                        serverStatusBar.style.display = 'flex';
                        serverStatusText.textContent = '偵測到伺服器已重新啟動，正在重新載入頁面...';
                        serverStatusBar.style.background = '#e8f5e9';
                        serverStatusBar.style.color = '#2e7d32';
                        serverStatusBar.style.borderColor = '#c8e6c9';
                    }
                    setTimeout(() => location.reload(), 800);
                }
                return;
            }
        } catch (e) {
            // 連線失敗
        }
        pingFailCount++;
        if (pingFailCount >= 2 && serverAlive) {
            serverAlive = false;
            if (serverStatusBar) {
                serverStatusBar.style.display = 'flex';
                serverStatusText.textContent = '偵測到伺服器已離線，重新執行 start.bat 後頁面將自動恢復。';
            }
        }
    }

    // 每 10 秒檢測一次
    setInterval(checkServerAlive, 10000);
});
