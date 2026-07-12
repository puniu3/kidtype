// sfx.js — Web Audio 効果音（合成）。
//  - AudioContext は最初のユーザー操作で遅延生成（iOS の autoplay 対策）。
//  - master → DynamicsCompressor(リミッタ) → destination で多重時のクリップを防ぐ。
//  - ミュートは gain=0 ではなく ctx.suspend()（鳴り終わりの尾を残さない）。localStorage 永続。
//  - iOS のサイレントスイッチ対策に、最初の操作で無音バッファを再生してアンロック。

let ctx = null;
let master = null;
let muted = false;
let resumeWired = false;
try { muted = localStorage.getItem('kidtype:muted') === '1'; } catch (_) {}

// バックグラウンド復帰時の自動レジューム。
//  - iOS PWA はアプリ切替/ホームで OS が AudioContext を suspend し、復帰しても suspended のまま放置する → 音が止まる。
//  - そこで前面に戻ったら（ミュートでなければ）resume して音を復活させる。
//  - ミュート中は絶対に resume しない（ミュートは suspend で実現しているため、ユーザーの選択を尊重）。
function resumeAudio() {
  if (ctx && ctx.state === 'suspended' && !muted) ctx.resume();
}
// リスナは一度だけ登録（冪等）。visibilitychange / pageshow / focus は iOS で発火が不揃いなので 3 つとも拾う。
function wireResume() {
  if (resumeWired || typeof window === 'undefined') return;
  resumeWired = true;
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') resumeAudio();
    });
  }
  window.addEventListener('pageshow', resumeAudio);
  window.addEventListener('focus', resumeAudio);
}

function ensure() {
  if (ctx) return ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  ctx = new AC();
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -6; comp.ratio.value = 20; comp.knee.value = 0;
  comp.attack.value = 0.003; comp.release.value = 0.1;
  master = ctx.createGain();
  master.gain.value = 0.9;
  master.connect(comp); comp.connect(ctx.destination);
  wireResume(); // 復帰時の自動レジュームを一度だけ仕込む
  return ctx;
}

function now() { return ctx.currentTime; }

// 単音
function tone({ type = 'square', freq = 440, dur = 0.12, gain = 0.3, attack = 0.005, slideTo = null, when = 0 }) {
  if (!ctx || muted) return;
  const t = now() + when;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(master);
  o.start(t); o.stop(t + dur + 0.02);
}

// フィルタ付きノイズ（ブロック破壊のザクッ）
function noise({ dur = 0.18, gain = 0.35, filt = 1800, when = 0 }) {
  if (!ctx || muted) return;
  const t = now() + when;
  const n = Math.floor(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
  const src = ctx.createBufferSource(); src.buffer = buf;
  const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = filt;
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f); f.connect(g); g.connect(master);
  src.start(t); src.stop(t + dur);
}

const sfx = {
  // 最初の操作で呼ぶ。ctx 生成＋無音再生でアンロック。
  unlock() {
    ensure();
    if (ctx.state === 'suspended' && !muted) ctx.resume();
    // 無音バッファ（iOS unlock）
    const b = ctx.createBuffer(1, 1, ctx.sampleRate);
    const s = ctx.createBufferSource(); s.buffer = b; s.connect(ctx.destination); s.start(0);
  },
  // 正しいキー：ピックアックスの「ティン」。連続で少しずつ音程上昇。
  mine(streak = 0) {
    ensure();
    const base = 520 + Math.min(12, streak) * 18;
    tone({ type: 'square', freq: base, dur: 0.07, gain: 0.18, slideTo: base * 1.25 });
    tone({ type: 'triangle', freq: base * 2, dur: 0.05, gain: 0.08 });
  },
  // ブロック破壊（完答）：ザクッ＋上がる2音のごほうび。
  break_() {
    ensure();
    noise({ dur: 0.16, gain: 0.3, filt: 1500 });
    tone({ type: 'square', freq: 660, dur: 0.1, gain: 0.22, when: 0.02 });
    tone({ type: 'square', freq: 990, dur: 0.14, gain: 0.22, when: 0.09 });
  },
  // 間違い：やさしい低めの「ぼっ」。きつくしない。
  wrong() {
    ensure();
    tone({ type: 'sine', freq: 220, dur: 0.14, gain: 0.16, slideTo: 165 });
  },
  // 項目クリア/レベルアップ：やわらかい上昇アルペジオ。
  levelup() {
    ensure();
    [523, 659, 784, 1047].forEach((f, i) => tone({ type: 'triangle', freq: f, dur: 0.16, gain: 0.18, when: i * 0.08 }));
  },
  // 段階解禁：大きめのファンファーレ。
  stageup() {
    ensure();
    [392, 523, 659, 784, 1047, 1319].forEach((f, i) => tone({ type: 'square', freq: f, dur: 0.18, gain: 0.16, when: i * 0.09 }));
    noise({ dur: 0.3, gain: 0.15, filt: 3000, when: 0.1 });
  },
  // 結果画面の★リビール用チャイム。i(0..2) が増えるほど音程が上がる短く明るいベル。
  // levelup の triangle アルペジオと音色がかぶらないよう、sine 基音＋高倍音のきらめきにする。
  star(i = 0) {
    ensure();
    const notes = [880, 1108.7, 1318.5];          // A5 → C#6 → E6
    const f = notes[Math.min(i, notes.length - 1)];
    tone({ type: 'sine', freq: f, dur: 0.22, gain: 0.20, attack: 0.004 });
    tone({ type: 'triangle', freq: f * 2, dur: 0.14, gain: 0.06, when: 0.004 }); // 倍音のきらめき
  },
  click() { ensure(); tone({ type: 'square', freq: 440, dur: 0.06, gain: 0.16, slideTo: 620 }); },

  get muted() { return muted; },
  setMuted(b) {
    muted = !!b;
    try { localStorage.setItem('kidtype:muted', muted ? '1' : '0'); } catch (_) {}
    if (ctx) { if (muted) ctx.suspend(); else ctx.resume(); }
    return muted;
  },
  toggleMute() { return this.setMuted(!muted); },
};

export default sfx;
