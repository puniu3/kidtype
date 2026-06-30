// install.js — URL に ?install が付いている時だけ「ホームに ついか」導線を出す。
// 紙のチラシ(install.html)の QR は https://puniu3.github.io/kidtype/?install を指す。
// チラシ→QR→このバナー→ホーム追加 を 1手順に圧縮するのが目的。
//
//   Chromebook / Android Chrome : beforeinstallprompt を捕まえて preventDefault し、
//                                 ボタン1タップで prompt() → 実質ワンタップ・インストール。
//   iPad / iPhone Safari        : beforeinstallprompt が来ない（プログラム的 install 不可）。
//                                 共有ボタン → ホーム画面に追加 の ミニ手順を出す。
//   既にインストール済み(standalone) / ?install 無し : 何もしない（通常のゲーム開始）。
//
// 依存なし・バニラ。スタイルは衝突しないよう .kt-ins-* 接頭辞で一度だけ注入する。

const QUERY = 'install';

function wantsInstall() {
  try { return new URLSearchParams(location.search).has(QUERY); } catch (_) { return false; }
}
function isStandalone() {
  try {
    return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
      window.navigator.standalone === true; // iOS Safari のホーム画面起動
  } catch (_) { return false; }
}
function isIOS() {
  const ua = navigator.userAgent || '';
  // iPadOS 13+ は Mac を名乗るのでタッチ点数で補正。
  return /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

const CSS = `
.kt-ins{
  position:fixed; left:0; right:0; bottom:0; z-index:9999;
  display:flex; justify-content:center;
  padding:10px 10px calc(10px + env(safe-area-inset-bottom,0px));
  font-family: ui-rounded,"Hiragino Maru Gothic ProN","Hiragino Sans",system-ui,sans-serif;
  pointer-events:none; /* バナー外はゲームのまま操作できる */
  animation:kt-ins-rise .28s cubic-bezier(.2,.9,.3,1) both;
}
@keyframes kt-ins-rise{ from{ transform:translateY(120%); } to{ transform:translateY(0); } }
.kt-ins-card{
  pointer-events:auto;
  display:flex; align-items:center; gap:12px;
  max-width:760px; width:100%;
  background:linear-gradient(#3a332b,#2c2620);
  border:3px solid #1c1814; border-radius:14px;
  box-shadow:0 8px 0 #1c1814, 0 14px 30px rgba(0,0,0,.45);
  padding:12px 14px;
  -webkit-tap-highlight-color:transparent;
}
.kt-ins-emoji{ font-size:34px; flex:0 0 auto; line-height:1; }
.kt-ins-text{ flex:1 1 auto; min-width:0; color:#e8e2d6; }
.kt-ins-title{ font-weight:900; font-size:18px; color:#ffd34d; }
.kt-ins-sub{ font-weight:700; font-size:13px; line-height:1.45; margin-top:2px; }
.kt-ins-sub b{ color:#ffe9a8; }
.kt-ins-go{
  flex:0 0 auto; cursor:pointer; border:3px solid #4f8f30;
  background:linear-gradient(#6fae46,#5a8f3a); color:#fff;
  font-family:inherit; font-weight:900; font-size:17px;
  padding:12px 18px; border-radius:12px;
  box-shadow:0 5px 0 #4f8f30; -webkit-tap-highlight-color:transparent;
  touch-action:manipulation;
}
.kt-ins-go:active{ transform:translateY(3px); box-shadow:0 2px 0 #4f8f30; }
.kt-ins-x{
  flex:0 0 auto; cursor:pointer; width:34px; height:34px; align-self:flex-start;
  border:none; background:transparent; color:#b9b09c;
  font-size:24px; font-weight:900; line-height:1; border-radius:8px;
  -webkit-tap-highlight-color:transparent; touch-action:manipulation;
}
.kt-ins-x:active{ color:#fff; }
@media (max-width:560px){
  .kt-ins-card{ flex-wrap:wrap; }
  .kt-ins-go{ width:100%; }
}
`;

let injected = false;
function injectCSS() {
  if (injected) return; injected = true;
  const s = document.createElement('style');
  s.textContent = CSS;
  document.head.appendChild(s);
}

let bannerEl = null;
function removeBanner() {
  if (bannerEl && bannerEl.parentNode) bannerEl.parentNode.removeChild(bannerEl);
  bannerEl = null;
}

// kind: 'chrome' = ワンタップ install ボタン / 'ios' = 共有→追加 手順 / 'generic' = メニュー案内
function showBanner(kind, onGo) {
  injectCSS();
  removeBanner();
  const wrap = document.createElement('div');
  wrap.className = 'kt-ins';
  wrap.setAttribute('role', 'dialog');
  wrap.setAttribute('aria-label', 'ホームに ついか');

  const card = document.createElement('div');
  card.className = 'kt-ins-card';

  const emoji = document.createElement('div');
  emoji.className = 'kt-ins-emoji'; emoji.textContent = '🏠';

  const text = document.createElement('div');
  text.className = 'kt-ins-text';
  const title = document.createElement('div');
  title.className = 'kt-ins-title'; title.textContent = 'ホームに ついか しよう！';
  const sub = document.createElement('div');
  sub.className = 'kt-ins-sub';
  text.appendChild(title); text.appendChild(sub);

  const close = document.createElement('button');
  close.className = 'kt-ins-x'; close.type = 'button';
  close.setAttribute('aria-label', 'とじる'); close.textContent = '×';
  close.addEventListener('click', removeBanner);

  card.appendChild(emoji);
  card.appendChild(text);

  if (kind === 'chrome') {
    sub.textContent = 'アイコンから すぐ あそべるよ';
    const go = document.createElement('button');
    go.className = 'kt-ins-go'; go.type = 'button';
    go.textContent = '＋ ホームに ついか';
    go.addEventListener('click', () => { onGo && onGo(); });
    card.appendChild(go);
  } else if (kind === 'ios') {
    sub.innerHTML = '① した（または うえ）の <b>きょうゆうボタン ⬆️</b> を おす<br>② <b>「ホーム画面に追加」</b> を えらぶ';
  } else { // generic
    sub.innerHTML = 'ブラウザの <b>メニュー（⋮）</b> から <b>「アプリをインストール」</b> を えらんでね';
  }

  card.appendChild(close);
  wrap.appendChild(card);
  document.body.appendChild(wrap);
  bannerEl = wrap;
}

export function initInstall() {
  if (!wantsInstall()) return;     // 通常起動: 介入しない
  if (isStandalone()) return;      // 既にホーム画面アプリ → 出さない

  let deferred = null;
  let shown = false;

  // Chromebook/Android Chrome: prompt を後で出すために横取りして保持。
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e;
    shown = true;
    showBanner('chrome', async () => {
      try {
        deferred.prompt();
        await deferred.userChoice;
      } catch (_) {}
      deferred = null;
      removeBanner();
    });
  });

  // インストール完了で消す。
  window.addEventListener('appinstalled', removeBanner);

  if (isIOS()) {
    // iOS は beforeinstallprompt が無い → 手動手順をすぐ出す。
    shown = true;
    showBanner('ios');
  } else {
    // Chrome の beforeinstallprompt は少し遅れて来る。来なければ汎用メニュー案内にフォールバック。
    setTimeout(() => { if (!shown && !isStandalone()) showBanner('generic'); }, 1800);
  }
}
