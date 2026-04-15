const CACHE_NAME = 'medical-terminal-v2';
const ASSETS = [
    '/',
    '/index.html',
    '/app.js',
    '/manifest.json',
    'https://cdn.jsdelivr.net/npm/qrcodejs@1.0.0/qrcode.min.js'
];

// 安装阶段：缓存核心静态资源
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
    );
    self.skipWaiting();
});

// 激活阶段：清理旧缓存
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(keys => Promise.all(
            keys.map(key => {
                if (key !== CACHE_NAME) return caches.delete(key);
            })
        ))
    );
    self.clients.claim();
});

// 拦截请求：离线优先策略 (Cache First, fallback to Network)
// 确保在无信号的手术室环境下能够秒开页面
self.addEventListener('fetch', event => {
    // 仅处理 GET 请求
    if (event.request.method !== 'GET') return;

    event.respondWith(
        caches.match(event.request).then(cachedResponse => {
            // 如果命中缓存，直接返回；否则发起网络请求
            return cachedResponse || fetch(event.request).then(response => {
                // 将新请求到的资源也加入缓存
                return caches.open(CACHE_NAME).then(cache => {
                    cache.put(event.request, response.clone());
                    return response;
                });
            });
        }).catch(() => {
            // 极端离线情况下的容错处理
            console.log('网络不可用且无缓存:', event.request.url);
        })
    );
});
