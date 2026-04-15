// app.js

// ==========================================
// 0. 强制注销 Service Worker (破坏 PWA 缓存陷阱)
// ==========================================
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then(function(registrations) {
    for(let registration of registrations) {
      registration.unregister();
      console.log('ServiceWorker 已强制注销');
    }
  });
}
if ('caches' in window) {
  caches.keys().then(keys => {
    keys.forEach(key => caches.delete(key));
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

// 解决中文乱码问题
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

document.getElementById('btnGenerateQR').addEventListener('click', (e) => {
  e.preventDefault(); 
  
  document.getElementById('ssid').blur();
  document.getElementById('password').blur();

  if (typeof qrcode === 'undefined') {
    showToast('组件加载失败，请检查网络或点击底部"修复异常"');
    return;
  }

  const ssid = document.getElementById('ssid').value.trim();
  const password = document.getElementById('password').value.trim();
  
  if (!ssid) {
    showToast('请输入手机热点名称(SSID)');
    return;
  }
  
  const wifiString = `WIFI:T:WPA;S:${ssid};P:${password};;`;
  const container = document.getElementById('qrcode');
  container.innerHTML = ''; // 清空
  
  try {
    // 使用 qrcode-generator 生成纯 Base64 图片，彻底绕过 iOS Canvas 兼容性问题
    const qr = qrcode(0, 'H'); // 0 = 自动计算大小, H = 最高容错率
    qr.addData(utf16to8(wifiString));
    qr.make();
    
    // 生成 img 标签 (模块大小: 6, 边距: 2)
    container.innerHTML = qr.createImgTag(6, 2);
    
    // 调整生成的图片样式以适应容器
    const imgElement = container.querySelector('img');
    if (imgElement) {
      imgElement.style.display = 'block';
      imgElement.style.margin = '0 auto';
      imgElement.style.maxWidth = '100%';
      imgElement.style.height = 'auto';
      imgElement.style.borderRadius = '4px';
    }

    showToast('二维码生成成功，请使用中继器扫描');
  } catch (err) {
    console.error('二维码生成失败:', err);
    showToast('二维码生成失败: ' + err.message);
  }
});

// 紧急修复：清除 PWA 缓存
document.getElementById('btnClearCache').addEventListener('click', () => {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations().then(function(registrations) {
      for(let registration of registrations) {
        registration.unregister();
      }
    });
  }
  if ('caches' in window) {
    caches.keys().then(keys => {
      keys.forEach(key => caches.delete(key));
    });
  }
  showToast('缓存已清除，正在重启应用...');
  setTimeout(() => {
    window.location.href = window.location.href.split('?')[0] + '?t=' + Date.now();
  }, 1500);
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
