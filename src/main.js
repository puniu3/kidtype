// main.js — ゲーム全体の進行。
// フロー: タイトル(ステージ自由選択) → ラウンド(有限の課題) → 結果(タイム/正解率/スコア/★)。
// ラベル類(ローマ字ヒント・説明文)は出さない。光るキーだけが頼り＝キーボードが教材。

import { matcherFor } from './engine/matcher.js';
import { toChunks } from './engine/romaji.js';
import { POOLS, wordById, sentenceById, longSentenceById, lvOfId } from './engine/content.js';
import { scoreRound } from './engine/score.js';
import { pickRoundIds } from './engine/round.js';
import { Scene } from './render/scene.js';
import { Keyboard } from './render/keyboard.js';
import { HouseBar } from './render/housebar.js';
import { drawTarget } from './render/target.js';
import { hardCapTotal } from './engine/milestones.js';
import sfx from './audio/sfx.js';
import bgm from './audio/bgm.js'; // BGM ループ。sfx.unlock() 相乗りで自動開始（import だけで結線される）
import { initInstall } from './install.js';
import { FONT, loadGameFont } from './font.js';
const STAGE_NAME = { 1: 'キー', 2: 'ローマじ', 3: 'たんご', 4: 'ぶんしょう', 5: 'ながいぶん' };
const STAGE_ICON = { 1: '🟨', 2: '🟩', 3: '🟦', 4: '🟪', 5: '🟥' };
// 集中力が続く程度の1ラウンド課題数（調整しやすいよう一箇所に）
// 長文(5)は 1 問が長いので少なめ。lv tier 数(4)以上にして毎ラウンド各 tier から出す。
const ROUND_COUNT = { 1: 16, 2: 14, 3: 8, 4: 5, 5: 4 };

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const scene = new Scene();
const keyboard = new Keyboard();
const houseBar = new HouseBar();   // 家のプログレスバー（タイトル・結果画面に描く）

let DPR = 1, W = 0, H = 0;
let layout = { hud: 60, world: { x: 0, y: 60, w: 0, h: 0 }, kb: { x: 0, y: 0, w: 0, h: 0 }, mute: { x: 0, y: 0, w: 0, h: 0 } };
let screen = 'title';            // 'title' | 'play' | 'result'
let round = null;                // 現ラウンド
let current = null;              // 現在の課題
let result = null;               // 結果画面データ
let nextAt = 0;
let streak = 0;
let nowT = 0;
let lastPressed = null, lastWrong = null;
let buttons = [];                // 当たり判定用（毎フレーム再構築）
let pressedBtn = null;           // タップ押下中のボタン（沈み表示用）{ id, t }
let pendingAction = null;        // 押下フィードバックを見せてから実行するアクション { fn, at }

// ---------- ベストスコア ----------
// タイトル画面は毎フレーム全ステージのベストを参照するので、localStorage は初回だけ読んで
// 以後メモリキャッシュを返す（書き込みはキャッシュと両方更新）。
const bestCache = new Map();
function loadBest(stage) {
  if (bestCache.has(stage)) return bestCache.get(stage);
  let b;
  try { b = JSON.parse(localStorage.getItem('kidtype:best:' + stage)) || { score: 0, stars: 0 }; }
  catch (_) { b = { score: 0, stars: 0 }; }
  bestCache.set(stage, b);
  return b;
}
function saveBest(stage, score, stars) {
  const b = loadBest(stage);
  const nb = { score: Math.max(b.score, score), stars: Math.max(b.stars, stars) };
  bestCache.set(stage, nb);
  try { localStorage.setItem('kidtype:best:' + stage, JSON.stringify(nb)); } catch (_) {}
  return score > b.score;
}

// ---------- 累計スコア（長期プログレス：背景の家を育てる）----------
// 全プレイを通した「ためたスコア」。ラウンドごとに加算して保存し、
// タイトル画面で表示＋背景の家(村)の進化に使う。
let totalCache = null;           // 毎フレーム参照されるのでメモリキャッシュ（loadBest と同じ理由）
function loadTotal() {
  if (totalCache != null) return totalCache;
  try { totalCache = Math.max(0, parseInt(localStorage.getItem('kidtype:total'), 10) || 0); }
  catch (_) { totalCache = 0; }
  return totalCache;
}
// 今回のラウンドで確定した累計スコアを保存する（引数はそのまま書き込む確定値）。
// 1ラウンドあたりの加算上限（家プログレスのハードキャップ）は呼び出し側で hardCapTotal が算出する。
function saveTotal(n) {
  const v = Math.max(0, Number.isFinite(n) ? Math.floor(n) : 0);
  totalCache = v;
  try { localStorage.setItem('kidtype:total', String(v)); } catch (_) {}
  return v;
}

// ---------- レイアウト ----------
function resize() {
  DPR = Math.min(2, window.devicePixelRatio || 1);
  // iPad の PWA スタンドアロンでは window.innerHeight が実際の可視ビューポートより
  // 短いことがある。そのまま canvas を innerHeight にすると下端に隙間ができ、
  // 画面背景（土色）が dim オーバーレイの外にのぞく＝「余白がカバーされない」。
  // 取得できる高さの最大値を採り、canvas を必ず可視領域いっぱいに広げる
  // （オーバーは body overflow:hidden でクリップされるだけで無害。アンダーが致命的）。
  const vv = window.visualViewport;
  W = Math.max(window.innerWidth, document.documentElement.clientWidth, vv ? Math.round(vv.width) : 0);
  H = Math.max(window.innerHeight, document.documentElement.clientHeight, vv ? Math.round(vv.height) : 0);
  canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR);
  canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);

  const hud = Math.max(52, Math.min(84, H * 0.1));
  const rest = H - hud;
  const kbH = Math.max(170, rest * 0.46);
  const worldH = rest - kbH;
  layout = {
    hud,
    world: { x: 0, y: hud, w: W, h: worldH },
    kb: { x: W * 0.04, y: hud + worldH, w: W * 0.92, h: kbH },
    mute: { x: W - 60, y: (hud - 40) / 2, w: 44, h: 40 },
  };
  // 第3引数 = 実画面の下端（scene ローカル座標）。scene は world.y へ translate して描かれるので
  // 画面下端は scene 内では H - world.y。土をここまで伸ばし、地面の下の空色のぞきを無くす。
  scene.resize(layout.world.w, layout.world.h, H - layout.world.y);
  keyboard.setArea(layout.kb.x, layout.kb.y, layout.kb.w, layout.kb.h);
}
window.addEventListener('resize', resize);
// スタンドアロン/iOS で可視ビューポートが変わる契機を網羅（resize だけでは取りこぼす）。
window.addEventListener('orientationchange', resize);
window.addEventListener('pageshow', resize);
if (window.visualViewport) {
  window.visualViewport.addEventListener('resize', resize);
  window.visualViewport.addEventListener('scroll', resize);
}

// ---------- ラウンド構築 ----------
// プール「全体」から毎ラウンド出題する（拡充コーパスの新語も実プレイに出るように）。
// 抽選ロジックは純粋関数 pickRoundIds（src/engine/round.js）に切り出してテスト可能に。
// lv 付きステージ（3/4/5）は易しめ寄りの難易度ミックスで選ぶ（lvOfId を渡す）。
function buildRound(stage) {
  const pool = POOLS[stage];
  const count = ROUND_COUNT[stage];
  const lvOf = (stage === 3 || stage === 4 || stage === 5) ? lvOfId : null;
  return pickRoundIds(stage, { pool, lvOf, count, rng: Math.random });
}

function buildItem(stage, id) {
  let target, emoji = null, kind;
  if (stage === 1) { target = id; kind = 'key'; }
  else if (stage === 2) { target = id; kind = 'kana'; }
  else if (stage === 3) { const w = wordById(id); target = w.kana; emoji = w.e; kind = 'word'; }
  else if (stage === 4) { const s = sentenceById(id); target = s.text; kind = 'sentence'; }
  else { const s = longSentenceById(id); target = s.text; kind = 'sentence'; }
  const chunks = toChunks(target);
  return { stage, id, kind, emoji, chunks, matcher: matcherFor(target), done: false };
}

function startRound(stage) {
  sfx.unlock();
  round = { stage, queue: buildRound(stage), index: 0, keysOk: 0, keysErr: 0, startMs: performance.now() };
  streak = 0; lastPressed = lastWrong = null;
  screen = 'play';
  nextRoundItem();
}

function nextRoundItem() { current = buildItem(round.stage, round.queue[round.index]); }

function finishRound() {
  const timeMs = performance.now() - round.startMs;
  // 得点・★・正確率は純粋関数 score.js に委譲（正確 かつ 速いほど高得点・ミスは寄与しない）。
  const { score, stars, accuracy } = scoreRound({ keysOk: round.keysOk, keysErr: round.keysErr, timeMs });
  const isNewBest = saveBest(round.stage, score, stars);
  // 累計スコアに加算 → 家の tier が上がったか判定（tier 変換は Scene 経由で milestones を参照）。
  const beforeTotal = loadTotal();
  // 家プログレスは1ラウンドで最大1段だけ進める（次の次のしきい値の直前で頭打ち）。溢れた分は捨てる
  // ＝貯めない・後で戻さない。キャップは純関数 hardCapTotal に委譲し、確定値を kidtype:total に保存。
  const afterTotal = saveTotal(hardCapTotal(beforeTotal, score));
  const houseLeveledUp = scene.houseTierForTotal(afterTotal) > scene.houseTierForTotal(beforeTotal);
  // 家 tier を即更新 → 結果画面の背景に新しい家が反映される（ステージ選択へ戻るのを待たない）。
  scene.setTotal(afterTotal);
  // 家プログレスバーへ「今回の得点が注ぎ込まれる」演出を開始（バーは before から after へ伸びる）。
  houseBar.startPour(beforeTotal, afterTotal);
  result = { stage: round.stage, timeMs, accuracy, score, stars, isNewBest, best: loadBest(round.stage), houseLeveledUp };
  screen = 'result';
  if (stars >= 3 || houseLeveledUp) sfx.stageup(); else sfx.levelup();
  scene.celebrate();
}

// ---------- 入力 ----------
function handleType(ch) {
  if (!current || current.done) return;
  const r = current.matcher.press(ch);
  if (r.ok) {
    round.keysOk++; streak++;
    sfx.mine(streak); scene.hit();
    lastPressed = { ch, t: nowT }; lastWrong = null;
    if (r.done) completeItem();
  } else {
    round.keysErr++; streak = 0;
    sfx.wrong(); scene.miss();
    lastWrong = { ch, t: nowT };
  }
}

function completeItem() {
  current.done = true;
  sfx.break_(); scene.complete();
  round.index++;
  nextAt = nowT + 0.5;
}

function onKeyDown(e) {
  // 長押しオートリピートは無視（子どもはキーを押しっぱなしにする。2打目以降が誤打の嵐になる）。
  if (e.repeat) return;
  // 開発者用裏口（隠しコマンド）: Ctrl+Shift+R で累計進捗(育つ家)をリセット。画面表示なし。
  if (e.ctrlKey && e.shiftKey && (e.key === 'R' || e.key === 'r')) {
    e.preventDefault();
    try { localStorage.removeItem('kidtype:total'); } catch (_) {}
    totalCache = 0;
    scene.setTotal(0); // タイトル背景の家を即さらちへ
    return;
  }
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const k = e.key;
  if (['Tab', 'Backspace', ' '].includes(k)) e.preventDefault();

  if (screen === 'title') {
    if (k >= '1' && k <= '5') startRound(Number(k));
    return;
  }
  if (screen === 'result') {
    if (k === 'Enter' || k === ' ') startRound(result.stage);          // もういちど
    else if (k === 'Escape' || k === 'Backspace') screen = 'title';    // えらぶ
    return;
  }
  // play
  if (k === 'Escape') { screen = 'title'; return; }
  let ch = null;
  if (k.length === 1) { const lc = k.toLowerCase(); if (/[a-z0-9-]/.test(lc)) ch = lc; } // スペースは打鍵キーにしない（語間スペース廃止）
  if (ch == null) return;
  handleType(ch);
}
window.addEventListener('keydown', onKeyDown);

function canvasPoint(e) { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
function hit(b, p) { return p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h; }
function onPointer(e) {
  if (pendingAction) return;                       // 押下フィードバック中の二度押しは無視
  const p = canvasPoint(e);
  for (const b of buttons) {
    if (!hit(b, p)) continue;
    // 沈み + クリック音を一瞬見せてから実行（即実行だと画面が切り替わって押した感が出ない）。
    sfx.unlock(); sfx.click();
    pressedBtn = { id: b.id, t: nowT };
    pendingAction = { fn: b.action, at: nowT + 0.12 };
    return;
  }
}
canvas.addEventListener('pointerdown', onPointer);

// ---------- 描画ユーティリティ ----------
function roundRect(c, x, y, w, h, r) {
  c.beginPath();
  c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
}
function btn(c, id, x, y, w, h, action, drawFn) {
  buttons.push({ id, x, y, w, h, action });
  // 押下中は全体を数 px 沈めて「押した」を見せる。
  const sunk = pressedBtn && pressedBtn.id === id && nowT - pressedBtn.t < 0.15;
  if (sunk) { c.save(); c.translate(0, 3); drawFn(x, y, w, h); c.restore(); }
  else drawFn(x, y, w, h);
}
function stars(c, x, y, size, n, gap = 6) {
  c.textAlign = 'left'; c.textBaseline = 'middle';
  c.font = `${size}px ${FONT}`;
  for (let i = 0; i < 3; i++) {
    c.globalAlpha = i < n ? 1 : 0.25;
    c.fillText('⭐', x + i * (size + gap), y);
  }
  c.globalAlpha = 1;
}
function muteBtn(c) {
  const m = layout.mute;
  btn(c, 'mute', m.x, m.y, m.w, m.h, () => { sfx.unlock(); sfx.toggleMute(); }, (x, y, w, h) => {
    c.fillStyle = '#3a332b'; roundRect(c, x, y, w, h, 8); c.fill();
    c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = `${Math.round(h * 0.5)}px ${FONT}`;
    c.fillText(sfx.muted ? '🔇' : '🔊', x + w / 2, y + h / 2 + 1);
  });
}

// ---------- 画面: プレイ ----------
function drawPlayHud(c) {
  c.fillStyle = '#2c2620'; c.fillRect(0, 0, W, layout.hud);
  c.fillStyle = '#3a332b'; c.fillRect(0, layout.hud - 4, W, 4);
  const cy = layout.hud / 2;
  // 戻る
  btn(c, 'back', 12, (layout.hud - 38) / 2, 70, 38, () => { screen = 'title'; }, (x, y, w, h) => {
    c.fillStyle = '#3a332b'; roundRect(c, x, y, w, h, 8); c.fill();
    c.fillStyle = '#e8e2d6'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = `700 ${Math.round(h * 0.42)}px ${FONT}`;
    c.fillText('‹ もどる', x + w / 2, y + h / 2);
  });
  // すすみ具合バー（ステージ名は廃止。カウント＋バーを HUD 内で縦中央そろえ）
  const total = round.queue.length, frac = round.index / total;
  const barH = 12;
  const mw = Math.min(300, W * 0.30), mx = W / 2 - mw / 2;
  const countFont = Math.round(layout.hud * 0.24);
  const gap = Math.max(3, Math.round(layout.hud * 0.06));
  const groupTop = cy - (countFont + gap + barH) / 2;
  const my = groupTop + countFont + gap;
  c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillStyle = '#cfc8ba'; c.font = `700 ${countFont}px ${FONT}`;
  c.fillText(`${round.index} / ${total}`, W / 2, groupTop + countFont / 2);
  c.fillStyle = '#1c1814'; roundRect(c, mx, my, mw, barH, barH / 2); c.fill();
  c.fillStyle = '#3fd6a0'; roundRect(c, mx, my, Math.max(6, mw * frac), barH, barH / 2); c.fill();
  muteBtn(c);
}

function drawPlay(c) {
  c.save(); c.translate(layout.world.x, layout.world.y);
  scene.draw(c);
  // drawTarget はステージ内で固定のタイル辺長で描く（長文は 2 行折り返し。render/target.js）。
  // 返り値 = 現在タイルの中心。キャラのピッケル狙い先（focus）をそこへ向ける。
  if (current) { const f = drawTarget(c, layout.world.w, layout.world.h, current); scene.setFocus(f.x, f.y); }
  c.restore();
  const pulse = (Math.sin(nowT * 4) + 1) / 2;
  const fresh = (m) => m && nowT - m.t < 0.18;
  keyboard.draw(c, {
    highlight: current && !current.done ? current.matcher.canonicalNext() : null,
    pressedOk: fresh(lastPressed) ? lastPressed.ch : null,
    pressedWrong: fresh(lastWrong) ? lastWrong.ch : null,
    pulse,
  });
  drawPlayHud(c);
}

// ---------- 画面: タイトル（ステージ選択）----------
function drawTitle(c) {
  // 累計スコアを Scene に渡す → 背景の家 tier を更新（家の進化はここで反映）。
  const total = loadTotal();
  scene.setTotal(total);
  c.save(); c.translate(layout.world.x, layout.world.y); scene.draw(c); c.restore();
  c.fillStyle = 'rgba(20,16,12,0.5)'; c.fillRect(0, 0, W, H);
  c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillStyle = '#ffd34d'; c.font = `900 ${Math.round(Math.min(76, W * 0.09))}px ${FONT}`;
  c.fillText('キッドタイプ', W / 2, H * 0.16);

  // いまのおうち ＋ 家プログレスバー（長期プログレス。ためたスコアはバーの 💎 が表す）。
  const ty = H * 0.16 + 56;
  c.fillStyle = 'rgba(255,255,255,0.82)'; c.font = `700 ${Math.round(Math.min(20, W * 0.024))}px ${FONT}`;
  c.fillText(`いまの おうち：${scene.currentHouseName()}`, W / 2, ty);

  // 家プログレスバー（次のおうちマイルストーンまでの到達度）。
  houseBar.setTotal(total);
  const hbW = Math.min(420, W * 0.46), hbH = Math.max(16, Math.min(24, H * 0.028));
  houseBar.draw(c, { x: W / 2 - hbW / 2, y: ty + 24, w: hbW, h: hbH, font: FONT });

  // 5枚のステージカード
  const cols = 5, gap = Math.min(28, W * 0.025);
  const cw = Math.min(240, (W * 0.86 - gap * (cols - 1)) / cols);
  const ch = Math.min(cw * 1.15, H * 0.42);
  const totalW = cw * cols + gap * (cols - 1);
  const x0 = W / 2 - totalW / 2, y0 = H * 0.4;
  const pulse = (Math.sin(nowT * 3) + 1) / 2;
  for (let i = 0; i < cols; i++) {
    const stage = i + 1;
    const x = x0 + i * (cw + gap);
    const best = loadBest(stage);
    btn(c, 'stage' + stage, x, y0, cw, ch, () => startRound(stage), (bx, by, bw, bh) => {
      c.save(); c.shadowColor = 'rgba(0,0,0,0.4)'; c.shadowBlur = 14; c.shadowOffsetY = 6;
      c.fillStyle = '#5a8f3a'; roundRect(c, bx, by, bw, bh, 16); c.fill(); c.restore();
      c.fillStyle = '#6fae46'; roundRect(c, bx, by, bw, bh * 0.9, 16); c.fill();
      c.textAlign = 'center'; c.textBaseline = 'middle';
      c.font = `${Math.round(bh * 0.26)}px ${FONT}`;
      c.fillText(STAGE_ICON[stage], bx + bw / 2, by + bh * 0.3);
      c.fillStyle = '#fff';
      const nameStr = `${stage}. ${STAGE_NAME[stage]}`;
      let nf = Math.round(bh * 0.16);
      c.font = `900 ${nf}px ${FONT}`;
      while (c.measureText(nameStr).width > bw * 0.86 && nf > 8) { nf--; c.font = `900 ${nf}px ${FONT}`; }
      c.fillText(nameStr, bx + bw / 2, by + bh * 0.54);
      // ベスト ★
      stars(c, bx + bw / 2 - (bh * 0.13 * 3) / 2, by + bh * 0.74, bh * 0.13, best.stars, 4);
      if (best.score > 0) {
        c.fillStyle = '#ffe9a8'; c.textAlign = 'center'; c.font = `700 ${Math.round(bh * 0.09)}px ${FONT}`;
        c.fillText('ベスト ' + best.score, bx + bw / 2, by + bh * 0.88);
      }
    });
    // ほんのり鼓動
    if (best.score === 0) { c.save(); c.globalAlpha = 0.25 * pulse; c.fillStyle = '#fff'; roundRect(c, x, y0, cw, ch * 0.9, 16); c.fill(); c.restore(); }
  }
  c.fillStyle = 'rgba(255,255,255,0.6)'; c.textAlign = 'center'; c.font = `700 16px ${FONT}`;
  c.fillText('タップ、または 1〜5 のキー', W / 2, y0 + ch + 30);
  muteBtn(c);
}

// ---------- 画面: 結果 ----------
function drawResult(c) {
  // 世界は dim オーバーレイの下、紙吹雪(celebrate)はオーバーレイの上 — お祝いをくすませない。
  c.save(); c.translate(layout.world.x, layout.world.y); scene.draw(c, { particles: false }); c.restore();
  c.fillStyle = 'rgba(20,16,12,0.55)'; c.fillRect(0, 0, W, H);
  c.save(); c.translate(layout.world.x, layout.world.y); scene.drawParticles(c); c.restore();
  const cx = W / 2;
  c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillStyle = '#ffd34d'; c.font = `900 ${Math.round(Math.min(72, W * 0.085))}px ${FONT}`;
  c.fillText('クリア！', cx, H * 0.14);
  c.fillStyle = '#e8e2d6'; c.font = `700 ${Math.round(Math.min(28, W * 0.03))}px ${FONT}`;
  c.fillText(`${STAGE_ICON[result.stage]} ${STAGE_NAME[result.stage]}`, cx, H * 0.14 + 48);

  // ★
  const ss = Math.min(64, W * 0.07);
  stars(c, cx - (ss * 3 + 12 * 2) / 2, H * 0.32, ss, result.stars, 12);

  // パネル（タイム・正解率・スコア＋家プログレスバー）
  const pw = Math.min(520, W * 0.6), px = cx - pw / 2, py = H * 0.42, ph = H * 0.30;
  c.fillStyle = 'rgba(20,16,12,0.6)'; roundRect(c, px, py, pw, ph, 16); c.fill();
  const seconds = (result.timeMs / 1000).toFixed(1);
  const accPct = Math.round(result.accuracy * 100);
  const rowY = (i) => py + ph * (0.21 + i * 0.225);
  const drawRow = (i, label, val, col) => {
    c.textAlign = 'left'; c.fillStyle = '#cfc8ba'; c.font = `700 ${Math.round(ph * 0.14)}px ${FONT}`;
    c.fillText(label, px + pw * 0.12, rowY(i));
    c.textAlign = 'right'; c.fillStyle = col; c.font = `900 ${Math.round(ph * 0.17)}px ${FONT}`;
    c.fillText(val, px + pw * 0.88, rowY(i));
  };
  drawRow(0, '⏱ じかん', `${seconds} びょう`, '#fff');
  drawRow(1, '🎯 せいかい', `${accPct} %`, accPct >= 90 ? '#3fd6a0' : '#ffd34d');
  drawRow(2, '⭐ スコア', `${result.score}`, '#ffe9a8');
  // 家プログレスバー：スコア行の下。得点のダイヤはスコアの数字あたりから飛んで注がれる。
  houseBar.draw(c, {
    x: px + pw * 0.12, y: py + ph * 0.80, w: pw * 0.76, h: ph * 0.13,
    font: FONT, sourceX: px + pw * 0.84, sourceY: rowY(2),
  });
  if (result.isNewBest) {
    c.textAlign = 'center'; c.fillStyle = '#ff6b6b'; c.font = `900 ${Math.round(ph * 0.18)}px ${FONT}`;
    c.fillText('🎉 しんきろく！', cx, py + ph + 26);
  } else {
    c.textAlign = 'center'; c.fillStyle = '#b9b09c'; c.font = `700 ${Math.round(ph * 0.14)}px ${FONT}`;
    c.fillText('ベスト ' + result.best.score, cx, py + ph + 24);
  }

  // ボタン
  const bw = Math.min(260, W * 0.32), bh = 70, by = H * 0.82, bgap = 24;
  btn(c, 'retry', cx - bw - bgap / 2, by, bw, bh, () => startRound(result.stage), (x, y, w, h) => {
    c.fillStyle = '#74c34a'; roundRect(c, x, y, w, h, 14); c.fill();
    c.fillStyle = '#fff'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = `900 ${Math.round(h * 0.36)}px ${FONT}`;
    c.fillText('▶ もういちど', x + w / 2, y + h / 2);
  });
  btn(c, 'select', cx + bgap / 2, by, bw, bh, () => { screen = 'title'; }, (x, y, w, h) => {
    c.fillStyle = '#5a6270'; roundRect(c, x, y, w, h, 14); c.fill();
    c.fillStyle = '#fff'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = `900 ${Math.round(h * 0.34)}px ${FONT}`;
    c.fillText('ステージを えらぶ', x + w / 2, y + h / 2);
  });
}

// ---------- ループ ----------
let last = 0;
function frame(t) {
  nowT = t / 1000;
  const dt = Math.min(0.05, last ? (nowT - last) : 0); last = nowT;
  scene.update(dt);
  houseBar.update(dt);
  // BGM: プレイ中はフル編成、タイトル/結果は pad 中心に薄く。同値なら即 return の軽い呼び出し。
  bgm.setScene(screen === 'play' ? 'play' : 'calm');
  // ボタン押下フィードバック（0.12s）を見せ終えたらアクション実行（画面切替は描画前に反映）。
  if (pendingAction && nowT >= pendingAction.at) {
    const fn = pendingAction.fn; pendingAction = null;
    fn();
  }
  if (screen === 'play' && current && current.done && nowT >= nextAt) {
    if (round.index >= round.queue.length) finishRound(); else nextRoundItem();
  }
  buttons = [];
  ctx.clearRect(0, 0, W, H);
  if (screen === 'title') drawTitle(ctx);
  else if (screen === 'result') drawResult(ctx);
  else drawPlay(ctx);
  requestAnimationFrame(frame);
}

resize();
// 埋め込みフォント（src/font.js）の読み込みを待ってから描き始める
// → 起動時に一瞬システムフォントで描かれる「フォールバックのちらつき」を出さない。
// 失敗/タイムアウト時は false で resolve してシステムフォントのまま開始する。
loadGameFont().then(() => requestAnimationFrame(frame));

if ('serviceWorker' in navigator && window.isSecureContext) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}

// ?install のときだけ「ホームに ついか」導線を出す（紙のチラシ install.html の QR からの 1手順導線）。
initInstall();
