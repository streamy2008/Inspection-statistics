// ==========================================
// 0. PWA Service Worker 注册
// ==========================================
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js').catch(err => console.error('SW 注册失败:', err));
    });
}

// ==========================================
// 1. IndexedDB 离线存储封装
// ==========================================
const DB_NAME = 'MedicalTerminalDB';
const STORE_NAME = 'syncQueue';

// 打开或创建 IndexedDB 数据库
function openDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, 1);
        request.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

// 将上报数据存入离线队列
async function saveToQueue(data) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).add(data);
        tx.oncomplete = () => { updateQueueCount(); resolve(); };
        tx.onerror = () => reject(tx.error);
    });
}

// 获取所有待同步的离线数据
async function getQueue() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const req = tx.objectStore(STORE_NAME).getAll();
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

// 删除已同步的数据
async function clearItem(id) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).delete(id);
        tx.oncomplete = () => { updateQueueCount(); resolve(); };
        tx.onerror = () => reject(tx.error);
    });
}

// 更新界面上的队列数量显示
async function updateQueueCount() {
    try {
        const queue = await getQueue();
        document.getElementById('queueCount').innerText = queue.length;
    } catch (e) {}
}

// ==========================================
// 2. UI 交互与工具函数
// ==========================================
function showToast(msg) {
    const toast = document.getElementById('toast');
    toast.innerText = msg;
    toast.style.display = 'block';
    setTimeout(() => toast.style.display = 'none', 3000);
}

// 解决 qrcode.js 中文乱码问题
function utf16to8(str) {
    let out = "";
    for (let i = 0; i < str.length; i++) {
        let c = str.charCodeAt(i);
        if ((c >= 0x0001) && (c <= 0x007F)) {
            out += str.charAt(i);
        } else if (c > 0x07FF) {
            out += String.fromCharCode(0xE0 | ((c >> 12) & 0x0F));
            out += String.fromCharCode(0x80 | ((c >>  6) & 0x3F));
            out += String.fromCharCode(0x80 | ((c >>  0) & 0x3F));
        } else {
            out += String.fromCharCode(0xC0 | ((c >>  6) & 0x1F));
            out += String.fromCharCode(0x80 | ((c >>  0) & 0x3F));
        }
    }
    return out;
}

// --- 模块 1：离线配网 ---
document.getElementById('btnGenerateQR').addEventListener('click', () => {
    // 收起软键盘
    document.getElementById('ssid').blur();
    document.getElementById('password').blur();

    const ssid = document.getElementById('ssid').value.trim();
    const password = document.getElementById('password').value.trim();
    
    if (!ssid) return showToast('请输入手机热点名称(SSID)');
    
    const wifiString = `WIFI:T:WPA;S:${ssid};P:${password};;`;
    const container = document.getElementById('qrcode');
    container.innerHTML = ''; 
    
    if (typeof QRCode === 'undefined') return showToast('二维码库加载失败');

    try {
        // 纯本地离线生成二维码
        new QRCode(container, {
            text: utf16to8(wifiString),
            width: 200,
            height: 200,
            colorDark : "#000000",
            colorLight : "#ffffff",
            correctLevel : QRCode.CorrectLevel.H
        });
        
        // 居中优化
        setTimeout(() => {
            const children = container.children;
            for (let i = 0; i < children.length; i++) {
                children[i].style.margin = '0 auto';
                children[i].style.display = 'block';
            }
        }, 50);

        showToast('配网二维码已生成');
    } catch (err) {
        showToast('生成失败: ' + err.message);
    }
});

// --- 模块 2：计费算法与商业预测 ---
let currentValidSNs = []; // 暂存当前有效的 SN 列表

// 模拟拉取设备日志
function mockFetchDeviceLogs() {
    const now = Date.now();
    const oneDay = 24 * 60 * 60 * 1000;
    const oneMin = 60 * 1000;
    return [
        // SN1: 有效 (时间差 15 分钟，最近 30 天内)
        { sn: 'SN-1001', timestamp: now - 5 * oneDay },
        { sn: 'SN-1001', timestamp: now - 5 * oneDay + 15 * oneMin },
        // SN2: 无效 (时间差仅 5 分钟，不满足 >= 10分钟)
        { sn: 'SN-1002', timestamp: now - 2 * oneDay },
        { sn: 'SN-1002', timestamp: now - 2 * oneDay + 5 * oneMin },
        // SN3: 无效 (最后一条时间在 40 天前，不满足最近 30 天内)
        { sn: 'SN-1003', timestamp: now - 40 * oneDay },
        { sn: 'SN-1003', timestamp: now - 40 * oneDay + 20 * oneMin },
        // SN4: 有效 (时间差 2 小时，今天)
        { sn: 'SN-1004', timestamp: now - 2 * 60 * oneMin },
        { sn: 'SN-1004', timestamp: now },
    ];
}

document.getElementById('btnFetchData').addEventListener('click', () => {
    const logs = mockFetchDeviceLogs();
    
    // 算法核心：按 SN 分组并统计最小/最大时间
    const snMap = {};
    logs.forEach(log => {
        if (!snMap[log.sn]) {
            snMap[log.sn] = { minTime: log.timestamp, maxTime: log.timestamp };
        } else {
            snMap[log.sn].minTime = Math.min(snMap[log.sn].minTime, log.timestamp);
            snMap[log.sn].maxTime = Math.max(snMap[log.sn].maxTime, log.timestamp);
        }
    });

    const now = Date.now();
    const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
    const tenMinsMs = 10 * 60 * 1000;
    
    currentValidSNs = [];
    
    // 筛选规则：最后一条减第一条 >= 10分钟 且 最后一条在最近30天内
    for (const sn in snMap) {
        const data = snMap[sn];
        const timeDiff = data.maxTime - data.minTime;
        const isRecent = (now - data.maxTime) <= thirtyDaysMs;
        
        if (timeDiff >= tenMinsMs && isRecent) {
            currentValidSNs.push(sn);
        }
    }

    // 获取输入参数
    const totalOrs = parseInt(document.getElementById('totalOrs').value) || 0;
    const effectiveOrs = parseInt(document.getElementById('effectiveOrs').value) || 0;
    
    // 计算结果
    const N = currentValidSNs.length; // 当前房间有效 SN 数量
    const E = effectiveOrs;           // 有效使用间数
    const estimatedTotal = N * E;     // 该医院 30 天总预估用量

    // 更新 UI 展示
    document.getElementById('resultArea').style.display = 'block';
    document.getElementById('valN').innerText = N;
    document.getElementById('valTotal').innerText = estimatedTotal;

    // 渗透率分析计算
    let penetration = 0;
    if (totalOrs > 0) {
        penetration = Math.min(100, Math.round((effectiveOrs / totalOrs) * 100));
    }
    document.getElementById('penetrationBar').style.width = penetration + '%';
    document.getElementById('penetrationText').innerText = penetration + '%';

    // 渲染 SN 列表明细
    const listDiv = document.getElementById('snList');
    listDiv.innerHTML = currentValidSNs.length > 0 
        ? currentValidSNs.map(sn => `<div class="sn-item">✅ ${sn}</div>`).join('')
        : '<div class="sn-item" style="color:var(--text-secondary)">暂无符合标准的 SN</div>';
        
    showToast('数据拉取与计算完成');
});

// --- 模块 3：离线暂存与同步 ---
function updateNetworkStatus() {
    const statusEl = document.getElementById('networkStatus');
    if (navigator.onLine) {
        statusEl.innerText = '🟢 在线 (可同步)';
        statusEl.style.color = '#34C759';
        syncData(); // 连网时自动触发同步
    } else {
        statusEl.innerText = '🔴 离线 (数据将暂存)';
        statusEl.style.color = '#FF3B30';
    }
}

// 监听网络状态变化
window.addEventListener('online', updateNetworkStatus);
window.addEventListener('offline', updateNetworkStatus);
updateNetworkStatus();
updateQueueCount();

document.getElementById('btnReport').addEventListener('click', async () => {
    const hospitalName = document.getElementById('hospitalName').value.trim();
    const totalOrs = document.getElementById('totalOrs').value;
    const effectiveOrs = document.getElementById('effectiveOrs').value;
    const roomNumber = document.getElementById('roomNumber').value.trim();
    const estimatedTotal = document.getElementById('valTotal').innerText;

    if (!hospitalName) return showToast('请填写医院名称');

    // 组装上报数据包
    const payload = {
        id: Date.now().toString(), // 本地唯一ID
        hospitalName,
        totalOrs,
        effectiveOrs,
        roomNumber,
        estimatedTotal,
        validSNs: currentValidSNs,
        timestamp: new Date().toISOString()
    };

    if (navigator.onLine) {
        // 模拟在线上报
        showToast('正在存储数据...');
        setTimeout(() => showToast('✅ 存储成功！'), 1000);
    } else {
        // 无网时存入 IndexedDB 离线暂存
        await saveToQueue(payload);
        showToast('已离线暂存，连网后将自动同步');
    }
});

// 自动同步队列中的数据
async function syncData() {
    const queue = await getQueue();
    if (queue.length === 0) return;
    
    console.log(`开始同步 ${queue.length} 条离线数据...`);
    for (const item of queue) {
        // 模拟 API 请求耗时
        await new Promise(res => setTimeout(res, 500)); 
        console.log('同步成功:', item);
        // 同步成功后从本地队列删除
        await clearItem(item.id);
    }
    showToast('离线数据已自动同步完成');
}
