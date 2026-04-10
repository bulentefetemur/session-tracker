const CACHE_NAME = 'session-tracker-v6-rescue';
const ASSETS = [
    './',
    './index.html',
    './styles.css',
    './app.js',
    './manifest.json',
    './icon-192.png',
    './icon-512.png'
];

// 1. Kurulum (Install) Aşaması: Dosyaları Önbelleğe Al
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => cache.addAll(ASSETS))
            .then(() => self.skipWaiting())
    );
});

// 2. Aktivasyon (Activate) Aşaması: Eski Önbellekleri Temizle
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME) {
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
    self.clients.claim();
});

// 3. Yakalama (Fetch) Aşaması: Network-First Stratejisi (Her Zaman En Güncel Sürüm)
self.addEventListener('fetch', (event) => {
    event.respondWith(
        fetch(event.request)
            .then((networkResponse) => {
                // İnternet varsa en güncel dosyayı çek, önbelleği güncelle ve göster
                return caches.open(CACHE_NAME).then((cache) => {
                    cache.put(event.request, networkResponse.clone());
                    return networkResponse;
                });
            }).catch(() => {
                // İnternet yoksa (Çevrimdışı) cihazdaki eski önbellekten getir
                return caches.match(event.request);
            })
    );
});

// 4. Bildirim Tıklama (Notification Click) Olayı
self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
            // Açık bir sekme varsa ona odaklan
            for (let i = 0; i < windowClients.length; i++) {
                const client = windowClients[i];
                if (client.url.includes('index.html') && 'focus' in client) {
                    return client.focus();
                }
            }
            // Açık sekme yoksa yeni pencere aç
            if (clients.openWindow) {
                return clients.openWindow('./index.html');
            }
        })
    );
});

// 5. Push API (Arka Plan Tetikleyicisi - Backend Entegrasyonuna Hazır)
self.addEventListener('push', (event) => {
    const data = event.data ? event.data.json() : { title: "Süre Doldu!", body: "Oturumunuz tamamlandı." };
    
    event.waitUntil(
        self.registration.showNotification(data.title, {
            body: data.body,
            icon: './icon-192.png',
            badge: './icon-192.png',
            vibrate: [200, 100, 200, 100, 400]
        })
    );
});