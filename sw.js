// sw.js — オフライン用のアプリシェルキャッシュ。
// 注意: Service Worker はセキュアコンテキスト(HTTPS / localhost)でのみ登録される。
// LAN の http://192.168.x.x:8000 では登録されない（main.js が graceful にスキップ）。
// 本番(HTTPS デプロイ)で初めてオフライン化が有効になる。

const CACHE = 'kidtype-v1';
const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/style.css',
  './src/main.js',
  './src/engine/kana.js',
  './src/engine/romaji.js',
  './src/engine/matcher.js',
  './src/engine/progress.js',
  './src/engine/content.js',
  './src/render/scene.js',
  './src/render/keyboard.js',
  './src/audio/sfx.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// cache-first（学習アプリなので素早く・オフライン優先）
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then((hit) => hit || fetch(e.request).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
      return res;
    }).catch(() => caches.match('./index.html')))
  );
});
