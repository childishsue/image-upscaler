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
    let pollInterval = null;
    let activeMode = 'image';        // 'image' 或 'video'

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
    //  頁籤切換
    // =====================================================================
    function activateTab(tab) {
        activeMode = tab;
        tabBtns.forEach(b => {
            b.classList.toggle('active', b.dataset.tab === tab);
        });
        tabContents.forEach(tc => tc.classList.remove('active'));

        if (tab === 'image') {
            document.getElementById('tabImage').classList.add('active');
            // 還原圖片上傳區域的可見性（修正 showTabView 隱藏後切頁籤的問題）
            if (uploadSection) uploadSection.style.display = '';
        } else {
            document.getElementById('tabVideo').classList.add('active');
            // 還原影片上傳區域的可見性
            if (videoUploadSection) videoUploadSection.style.display = '';
        }
    }

    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => activateTab(btn.dataset.tab));
    });

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
            selectedFiles.push(file);
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
                batchProgressCount.textContent = `${data.completed + data.failed} / ${data.total}`;
                data.items.forEach(item => {
                    const bar = document.getElementById(`bar-${item.task_id}`);
                    const status = document.getElementById(`status-${item.task_id}`);
                    const badge = document.getElementById(`badge-${item.task_id}`);
                    const row = document.getElementById(`batch-item-${item.task_id}`);
                    if (bar) bar.style.width = `${item.progress}%`;
                    if (status) status.textContent = item.message || getStatusText(item.status);
                    if (badge) {
                        if (item.status === 'completed') {
                            badge.innerHTML = '<span class="material-symbols-outlined" style="color:var(--success)">check_circle</span>';
                            if (row) row.classList.add('done');
                        } else if (item.status === 'error') {
                            badge.innerHTML = '<span class="material-symbols-outlined" style="color:var(--error)">error</span>';
                            if (row) row.classList.add('error');
                        } else if (item.status === 'processing') {
                            badge.innerHTML = '<span class="material-symbols-outlined spinning" style="color:var(--primary)">autorenew</span>';
                            if (row) row.classList.add('active');
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
        const map = { queued: '排隊中', processing: '處理中...', completed: '完成', error: '失敗' };
        return map[status] || status;
    }

    function showBatchResult(data) {
        showSection(batchResultSection);
        batchResultTitle.textContent = data.failed > 0
            ? `處理完成！成功 ${data.completed} 張，失敗 ${data.failed} 張`
            : `全部完成！共 ${data.completed} 張圖片`;
        batchResultList.innerHTML = '';
        data.items.forEach(item => {
            const card = document.createElement('div');
            card.className = `batch-result-card ${item.status === 'completed' ? 'success' : 'failed'}`;
            if (item.status === 'completed' && item.result) {
                card.innerHTML = `
                    <div class="batch-result-thumb">
                        <img src="/api/preview/${encodeURIComponent(item.task_id)}" alt="${escapeHtml(item.original_name)}">
                    </div>
                    <div class="batch-result-info">
                        <span class="batch-result-name">${escapeHtml(item.original_name)}</span>
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
            selectedVideoFiles.push(file);
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
                if (item.status === 'completed' && item.result) {
                    card.innerHTML = `
                        <div class="batch-result-thumb">
                            <span class="material-symbols-outlined" style="font-size:2rem;color:var(--success)">movie</span>
                        </div>
                        <div class="batch-result-info">
                            <span class="batch-result-name">${escapeHtml(item.original_name)}</span>
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

    // =====================================================================
    //  錯誤處理
    // =====================================================================
    function showError(message) {
        showSection(errorSection);
        errorMessage.textContent = message;
        if (btnUpscale) btnUpscale.disabled = false;
        if (btnVideoUpscale) btnVideoUpscale.disabled = false;
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
            if (currentBatchId) window.location.href = `/api/batch-download/${currentBatchId}`;
        });
    }
    if (btnVideoBatchDownload) {
        btnVideoBatchDownload.addEventListener('click', () => {
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
                        <div class="history-item-name" title="${escapeHtml(item.original_name)}">${escapeHtml(item.original_name)}</div>
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
