// app.js

// ==========================================
// 1. Service Worker 注册 (PWA 离线支持)
// ==========================================
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then(registration => {
        console.log('ServiceWorker 注册成功, scope:', registration.scope);
      })
      .catch(error => {
        console.error('ServiceWorker 注册失败:', error);
      });
  });
}

// ==========================================
// 2. IndexedDB 封装 (本地数据持久化)
// ==========================================
const DB_NAME = 'MedicalAppDB';
const STORE_NAME = 'syncQueue';

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function saveToSyncQueue(data) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.add(data);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

async function getSyncQueue() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function clearSyncItem(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

// ==========================================
// 3. UI 交互与核心业务逻辑
// ==========================================

// 简易 Toast 提示
function showToast(message) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.style.display = 'block';
  setTimeout(() => {
    toast.style.display = 'none';
  }, 3000);
}

// --- 模块 1：生成配网二维码 ---
document.getElementById('btnGenerateQR').addEventListener('click', () => {
  const ssid = document.getElementById('ssid').value.trim();
  const password = document.getElementById('password').value.trim();
  
  if (!ssid) {
    showToast('请输入手机热点名称(SSID)');
    return;
  }
  
  // 标准 WiFi 二维码格式: WIFI:T:WPA;S:网名;P:密码;;
  const wifiString = `WIFI:T:WPA;S:${ssid};P:${password};;`;
  
  const qrcodeContainer = document.getElementById('qrcode');
  qrcodeContainer.innerHTML = ''; // 清空旧二维码
  
  // 使用 qrcode.js 生成二维码
  new QRCode(qrcodeContainer, {
    text: wifiString,
    width: 200,
    height: 200,
    colorDark : "#000000",
    colorLight : "#ffffff",
    correctLevel : QRCode.CorrectLevel.H
  });
  
  showToast('二维码生成成功，请使用中继器扫描');
});

// --- 模块 2：模拟设备日志拉取与核心计费算法 ---
let currentValidCount = 0;
let currentValidSnList = [];

document.getElementById('btnFetchData').addEventListener('click', () => {
  showToast('正在从中继器拉取数据...');
  
  // 模拟局域网 Fetch 请求延迟
  setTimeout(() => {
    const mockData = generateMockData();
    processDeviceData(mockData);
  }, 800);
});

// 模拟生成中继器日志数据
function generateMockData() {
  const now = Date.now();
  const tenMins = 10 * 60 * 1000;
  
  return [
    // SN_001: 持续时间超过 10 分钟 (有效耗材)
    { sn: 'SN_001', timestamp: now - tenMins - 5000, value: 36.5 },
    { sn: 'SN_001', timestamp: now - 5000, value: 36.6 },
    { sn: 'SN_001', timestamp: now, value: 36.6 },
    
    // SN_002: 持续时间不足 10 分钟 (无效耗材)
    { sn: 'SN_002', timestamp: now - 5 * 60 * 1000, value: 36.2 },
    { sn: 'SN_002', timestamp: now, value: 36.3 },
    
    // SN_003: 持续时间正好 10 分钟 (有效耗材)
    { sn: 'SN_003', timestamp: now - tenMins, value: 37.0 },
    { sn: 'SN_003', timestamp: now, value: 37.1 },
    
    // SN_004: 只有一条数据 (无效耗材)
    { sn: 'SN_004', timestamp: now, value: 36.5 }
  ];
}

// 核心计费算法
function processDeviceData(data) {
  // 1. 按 SN 号进行数据分组
  const groupedData = {};
  data.forEach(item => {
    if (!groupedData[item.sn]) {
      groupedData[item.sn] = [];
    }
    groupedData[item.sn].push(item.timestamp);
  });
  
  const validSnList = [];
  
  // 2. 筛选时间差 >= 10分钟的 SN 号
  for (const sn in groupedData) {
    const timestamps = groupedData[sn];
    if (timestamps.length >= 2) {
      const minTime = Math.min(...timestamps);
      const maxTime = Math.max(...timestamps);
      // 判断最后一条减去第一条是否 >= 10分钟 (600000毫秒)
      if (maxTime - minTime >= 10 * 60 * 1000) { 
        validSnList.push(sn);
      }
    }
  }
  
  currentValidCount = validSnList.length;
  currentValidSnList = validSnList;
  
  // 3. 更新 UI 展示结算结果
  document.getElementById('validCount').textContent = currentValidCount;
  const ul = document.getElementById('validSnList');
  ul.innerHTML = '';
  
  if (validSnList.length === 0) {
    const li = document.createElement('li');
    li.textContent = '暂无有效耗材';
    li.style.color = '#8E8E93';
    ul.appendChild(li);
  } else {
    validSnList.forEach(sn => {
      const li = document.createElement('li');
      li.textContent = sn;
      ul.appendChild(li);
    });
  }
  
  document.getElementById('resultArea').style.display = 'block';
  showToast('数据拉取并统计完成');
}

// --- 模块 3：离线存储与云端同步 ---
document.getElementById('btnReport').addEventListener('click', async () => {
  const hospitalName = document.getElementById('hospitalName').value.trim();
  const roomNumber = document.getElementById('roomNumber').value.trim();
  
  if (!hospitalName || !roomNumber) {
    showToast('请先填写医院名称和手术间号');
    return;
  }
  
  if (currentValidCount === 0) {
    showToast('当前无有效耗材可上报');
    return;
  }
  
  const reportData = {
    hospitalName,
    roomNumber,
    validCount: currentValidCount,
    validSnList: currentValidSnList,
    timestamp: Date.now()
  };
  
  if (navigator.onLine) {
    // 设备在线，直接执行模拟上传
    showToast('正在上报云端...');
    await mockUpload(reportData);
    showToast('上报云端成功！');
    resetResult();
  } else {
    // 设备离线，拦截请求并保存至 IndexedDB
    await saveToSyncQueue(reportData);
    showToast('当前无网络，已暂存本地，网络恢复后将自动上报');
    resetResult();
    
    // 尝试注册 Service Worker 的后台同步 (如果浏览器支持)
    if ('serviceWorker' in navigator && 'SyncManager' in window) {
      navigator.serviceWorker.ready.then(registration => {
        registration.sync.register('sync-reports').catch(err => {
          console.error('后台同步注册失败:', err);
        });
      });
    }
  }
});

function resetResult() {
  currentValidCount = 0;
  currentValidSnList = [];
  document.getElementById('resultArea').style.display = 'none';
}

// 模拟云端上传 API
async function mockUpload(data) {
  return new Promise(resolve => {
    setTimeout(() => {
      console.log('【云端接口】模拟上传成功:', data);
      resolve();
    }, 800);
  });
}

// 监听网络状态恢复 ('online' 事件)
// 当手术室恢复信号时，自动读取 IndexedDB 并上传
window.addEventListener('online', async () => {
  console.log('网络已恢复，检查是否有暂存数据需要上报...');
  
  try {
    const queue = await getSyncQueue();
    if (queue.length > 0) {
      showToast('网络已恢复，正在同步离线数据...');
      for (const item of queue) {
        await mockUpload(item);
        // 上传成功后清空对应本地记录
        await clearSyncItem(item.id);
        console.log(`暂存数据 (ID: ${item.id}) 上报成功并清除`);
      }
      showToast(`成功同步 ${queue.length} 条离线数据！`);
    }
  } catch (error) {
    console.error('同步离线数据失败:', error);
  }
});
