// sw.js — オフライン用のアプリシェルキャッシュ。
// 注意: Service Worker はセキュアコンテキスト(HTTPS / localhost)でのみ登録される。
// LAN の http://192.168.x.x:8000 では登録されない（main.js が graceful にスキップ）。
// 本番(HTTPS デプロイ)で初めてオフライン化が有効になる。

// CACHE 名と SHELL は開発用の既定値。デプロイでは build.mjs が実ファイル一覧＋内容ハッシュで
// 両方を自動生成・上書きする（ここを手で網羅し続ける必要はないが、localhost の SW 検証が
// 中途半端にならないよう実態に合わせておく）。
const CACHE = 'kidtype-8ddebca1f7';
const SHELL = ["./","./assets/fonts/MPLUSRounded1c-ExtraBold.kana.woff2","./assets/fonts/OFL.txt","./assets/icons/icon-180.png","./assets/icons/icon-192.png","./assets/icons/icon-512-maskable.png","./assets/icons/icon-512.png","./assets/icons/icon.svg","./css/style.css","./index.html","./install.html","./manifest.webmanifest","./src/audio/bgm.js","./src/audio/sfx.js","./src/engine/content.js","./src/engine/kana.js","./src/engine/matcher.js","./src/engine/milestones.js","./src/engine/romaji.js","./src/engine/round.js","./src/engine/score.js","./src/engine/tilelayout.js","./src/font.js","./src/install.js","./src/main.js","./src/render/housebar.js","./src/render/keyboard.js","./src/render/scene.js","./src/render/target.js"];

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
