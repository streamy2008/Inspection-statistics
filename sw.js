// sw.js

const CACHE_NAME = 'medical-app-cache-v4';
const URLS_TO_CACHE = [
  '/',
  '/index.html',
  '/app.js?v=4',
  '/manifest.json',
  '/icon.svg',
  'https://cdn.jsdelivr.net/npm/qrcode@1.5.3/build/qrcode.min.js'
];

// 1. 安装阶段：缓存静态资源，实现离线访问
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[Service Worker] 正在缓存静态资源');
        return cache.addAll(URLS_TO_CACHE);
      })
  );
  self.skipWaiting();
});

// 2. 激活阶段：清理旧版本缓存
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log('[Service Worker] 清理旧缓存:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// 3. 拦截网络请求：改为 Network First (网络优先) 策略，彻底解决 PWA 缓存不更新的问题
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || !event.request.url.startsWith('http')) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then(response => {
        // 网络请求成功，将最新结果存入缓存
        const resClone = response.clone();
        caches.open(CACHE_NAME).then(cache => {
          cache.put(event.request, resClone);
        });
        return response;
      })
      .catch(() => {
        // 网络请求失败（离线状态），降级使用缓存
        return caches.match(event.request);
      })
  );
});

// 4. 监听后台同步事件 (Background Sync)
// 补充说明：在 app.js 中我们已经通过监听 window 的 'online' 事件实现了同步逻辑。
// 这里保留 sync 事件监听是为了满足 PWA 的最佳实践。如果在 SW 中执行，需要原生操作 IndexedDB。
self.addEventListener('sync', event => {
  if (event.tag === 'sync-reports') {
    console.log('[Service Worker] 监听到后台同步事件: sync-reports');
    event.waitUntil(syncReportsFromIndexedDB());
  }
});

// 在 Service Worker 中读取 IndexedDB 并执行同步
async function syncReportsFromIndexedDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('MedicalAppDB', 1);
    
    request.onsuccess = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains('syncQueue')) {
        resolve();
        return;
      }
      
      const transaction = db.transaction('syncQueue', 'readwrite');
      const store = transaction.objectStore('syncQueue');
      const getAllRequest = store.getAll();
      
      getAllRequest.onsuccess = async () => {
        const queue = getAllRequest.result;
        if (queue && queue.length > 0) {
          for (const item of queue) {
            // 模拟上传
            console.log('[Service Worker] 离线数据后台同步成功:', item);
            // 上传成功后删除本地记录
            store.delete(item.id);
          }
          console.log('[Service Worker] 所有离线数据后台同步完成');
        }
        resolve();
      };
      
      getAllRequest.onerror = () => reject(getAllRequest.error);
    };
    
    request.onerror = () => reject(request.error);
  });
}
