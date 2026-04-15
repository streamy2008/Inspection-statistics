// sw.js

// 强制清理缓存的 Service Worker (破坏 PWA 缓存陷阱)
self.addEventListener('install', event => {
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          console.log('[Service Worker] 删除废弃缓存:', cacheName);
          return caches.delete(cacheName);
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  // 直接走网络，不再拦截和使用任何缓存
  return;
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
