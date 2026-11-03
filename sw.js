const CACHE_NAME = 'crypto-lenz-v2'; // تغییر ورژن برای ریست کردن کش‌های قدیمی

const ASSETS = [
  './',
  './index.html',
  './manifest.json'
];

// نصب و کش کردن فایل‌ها
self.addEventListener('install', event => {
  self.skipWaiting(); // مجبور کردن سرویس‌ورکر به فعال‌سازی فوری
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(ASSETS);
    })
  );
});

// حذف کش‌های قدیمی به محض فعال شدن نسخه جدید
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.map(key => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// استراتژی Network-First: اولویت با آپدیت زنده از اینترنت است
self.addEventListener('fetch', event => {
  event.respondWith(
    fetch(event.request)
      .then(networkResponse => {
        // اگر اینترنت وصل بود، نسخه جدید را در کش هم ذخیره کن
        if (networkResponse.status === 200 && event.request.method === 'GET') {
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, responseClone);
          });
        }
        return networkResponse;
      })
      .catch(() => {
        // اگر اینترنت قطع بود، از حافظه کش لود کن
        return caches.match(event.request);
      })
  );
});
