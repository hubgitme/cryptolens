// نسخه‌ی کش را با هر انتشار عوض کنید تا کش‌های قدیمی پاک شوند
const CACHE_NAME = 'crypto-lenz-v3';

const ASSETS = [
  './',
  './index.html',
  './style.css',
  './manifest.json',
  './js/core.js',
  './js/indicators.js',
  './js/chart.js',
  './js/drawings.js',
  './js/scripts.js',
  './js/panel.js',
  './js/main.js'
];

// نصب و کش کردن فایل‌ها
self.addEventListener('install', event => {
  self.skipWaiting(); // فعال‌سازی فوری
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS)));
});

// حذف کش‌های قدیمی به محض فعال شدن نسخه جدید
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.map(key => (key !== CACHE_NAME ? caches.delete(key) : null))))
      .then(() => self.clients.claim())
  );
});

// Network-First: اولویت با نسخه‌ی زنده؛ اگر اینترنت قطع بود از کش
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    fetch(event.request)
      .then(res => {
        if (res.status === 200) {
          const copy = res.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
        }
        return res;
      })
      .catch(() => caches.match(event.request, { ignoreSearch: true }).then(hit => hit || Response.error()))
  );
});
