// main.js — ゲーム全体の進行。
// フロー: タイトル(ステージ自由選択) → ラウンド(有限の課題) → 結果(タイム/正解率/スコア/★)。
// ラベル類(ローマ字ヒント・説明文)は出さない。光るキーだけが頼り＝キーボードが教材。

import { matcherFor } from './engine/matcher.js';
import { toChunks } from './engine/romaji.js';
import { POOLS, wordById, sentenceById } from './engine/content.js';
import { Scene } from './render/scene.js';
import { Keyboard } from './render/keyboard.js';
import sfx from './audio/sfx.js';

const FONT = 'ui-rounded, "Hiragino Maru Gothic ProN", "Hiragino Sans", system-ui, sans-serif';
const STAGE_NAME = { 1: 'キー', 2: 'ローマじ', 3: 'たんご', 4: 'ぶんしょう' };
const STAGE_SUB = { 1: 'キーを おぼえる', 2: 'ローマじで うつ', 3: 'たんごを うつ', 4: 'ぶんを うつ' };
const STAGE_ICON = { 1: '🟨', 2: '🟩', 3: '🟦', 4: '🟪' };
// 集中力が続く程度の1ラウンド課題数（調整しやすいよう一箇所に）
const ROUND_COUNT = { 1: 16, 2: 14, 3: 8, 4: 5 };

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const scene = new Scene();
const keyboard = new Keyboard();

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

// ---------- ベストスコア ----------
function loadBest(stage) {
  try { return JSON.parse(localStorage.getItem('kidtype:best:' + stage)) || { score: 0, stars: 0 }; }
  catch (_) { return { score: 0, stars: 0 }; }
}
function saveBest(stage, score, stars) {
  const b = loadBest(stage);
  const nb = { score: Math.max(b.score, score), stars: Math.max(b.stars, stars) };
  try { localStorage.setItem('kidtype:best:' + stage, JSON.stringify(nb)); } catch (_) {}
  return score > b.score;
}

// ---------- レイアウト ----------
function resize() {
  DPR = Math.min(2, window.devicePixelRatio || 1);
  W = window.innerWidth; H = window.innerHeight;
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
  scene.resize(layout.world.w, layout.world.h);
  keyboard.setArea(layout.kb.x, layout.kb.y, layout.kb.w, layout.kb.h);
}
window.addEventListener('resize', resize);

// ---------- ラウンド構築 ----------
function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; }

function buildRound(stage) {
  const pool = POOLS[stage];
  const N = ROUND_COUNT[stage];
  const cap = Math.min(pool.length, N * 2);     // 易しめ寄り（順序プールの前方から）に絞ってから抽選
  const cand = shuffle(pool.slice(0, cap));
  return cand.slice(0, Math.min(N, cand.length));
}

function buildItem(stage, id) {
  let target, emoji = null, kind;
  if (stage === 1) { target = id; kind = 'key'; }
  else if (stage === 2) { target = id; kind = 'kana'; }
  else if (stage === 3) { const w = wordById(id); target = w.kana; emoji = w.e; kind = 'word'; }
  else { const s = sentenceById(id); target = s.text; kind = 'sentence'; }
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
  const total = round.keysOk + round.keysErr;
  const accuracy = total ? round.keysOk / total : 1;
  const avgPerKey = timeMs / Math.max(1, round.keysOk);
  const speedBonus = Math.max(0, Math.round((1600 - avgPerKey) * round.keysOk / 100));
  const score = Math.round(round.keysOk * (5 + accuracy * 5) + speedBonus);
  let stars = 1;
  if (accuracy >= 0.80) stars = 2;
  if (accuracy >= 0.95 && avgPerKey <= 1400) stars = 3;
  const isNewBest = saveBest(round.stage, score, stars);
  result = { stage: round.stage, timeMs, accuracy, score, stars, isNewBest, best: loadBest(round.stage) };
  screen = 'result';
  if (stars >= 3) sfx.stageup(); else sfx.levelup();
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
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const k = e.key;
  if (['Tab', 'Backspace', ' '].includes(k)) e.preventDefault();
  if (k === 'm' && e.shiftKey) { sfx.toggleMute(); return; }

  if (screen === 'title') {
    if (k >= '1' && k <= '4') startRound(Number(k));
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
  const p = canvasPoint(e);
  for (const b of buttons) if (hit(b, p)) { b.action(); return; }
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
  drawFn(x, y, w, h);
}
function tile(c, x, y, s, label, state) {
  const colors = { todo: ['#9aa0aa', '#6f7480'], current: ['#ffd34d', '#d9a32e'], done: ['#74c34a', '#4f9130'] };
  const [top, side] = colors[state] || colors.todo;
  const d = Math.max(4, s * 0.1);
  c.fillStyle = side; roundRect(c, x, y, s, s, 8); c.fill();
  c.fillStyle = top; roundRect(c, x, y, s, s - d, 8); c.fill();
  if (state === 'current') {
    c.save(); c.shadowColor = '#ffe27a'; c.shadowBlur = 22;
    c.lineWidth = 3; c.strokeStyle = '#fff3b0'; roundRect(c, x + 1.5, y + 1.5, s - 3, s - d - 3, 7); c.stroke(); c.restore();
  }
  c.fillStyle = state === 'current' ? '#3a2c00' : '#23282f';
  c.font = `800 ${Math.round(s * (label.length > 1 ? 0.42 : 0.58))}px ${FONT}`;
  c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillText(label, x + s / 2, y + (s - d) / 2);
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

// ---------- ターゲット（タイルのみ・ラベル無し）----------
function drawTarget(c, Wr, Hr, item) {
  const visible = item.chunks.map((ch, i) => ({ ch, i }));
  const n = visible.filter((v) => !v.ch.auto).length;
  const s = item.stage <= 2 ? Math.min(Wr * 0.2, Hr * 0.34)
    : Math.max(28, Math.min(Wr * 0.74 / Math.max(1, n) - 8, Hr * 0.26));
  const gap = s * 0.16, spaceGap = s * 0.5;
  let totalW = 0; for (const v of visible) totalW += v.ch.auto ? spaceGap : s + gap; totalW -= gap;
  let x = Wr / 2 - totalW / 2;
  const y = Hr * 0.16;
  const cur = item.matcher.currentChunkIndex();
  let fx = Wr / 2, fy = y + s / 2;
  c.textAlign = 'center'; c.textBaseline = 'middle';
  if (item.emoji) { c.font = `${Math.round(s * 0.9)}px ${FONT}`; c.fillText(item.emoji, x - s * 0.6, y + s / 2); }
  for (const v of visible) {
    if (v.ch.auto) { x += spaceGap; continue; }
    const state = v.i < cur ? 'done' : v.i === cur ? 'current' : 'todo';
    const label = item.kind === 'key' ? v.ch.text.toUpperCase() : v.ch.text;
    tile(c, x, y, s, label, state);
    if (v.i === cur) { fx = x + s / 2; fy = y + s / 2; }
    x += s + gap;
  }
  scene.setFocus(fx, fy);
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
  // ステージ名
  c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillStyle = '#ffd34d'; c.font = `800 ${Math.round(layout.hud * 0.34)}px ${FONT}`;
  c.fillText(`${STAGE_ICON[round.stage]} ${STAGE_NAME[round.stage]}`, W / 2, cy);
  // すすみ具合バー
  const total = round.queue.length, frac = round.index / total;
  const mw = Math.min(260, W * 0.26), mx = W / 2 - mw / 2, my = cy + layout.hud * 0.26;
  c.fillStyle = '#1c1814'; roundRect(c, mx, my, mw, 10, 5); c.fill();
  c.fillStyle = '#3fd6a0'; roundRect(c, mx, my, Math.max(6, mw * frac), 10, 5); c.fill();
  c.fillStyle = '#cfc8ba'; c.font = `700 ${Math.round(layout.hud * 0.2)}px ${FONT}`;
  c.fillText(`${round.index} / ${total}`, W / 2, my - 9);
  muteBtn(c);
}

function drawPlay(c) {
  c.save(); c.translate(layout.world.x, layout.world.y);
  scene.draw(c);
  if (current) drawTarget(c, layout.world.w, layout.world.h, current);
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
  c.save(); c.translate(layout.world.x, layout.world.y); scene.draw(c); c.restore();
  c.fillStyle = 'rgba(20,16,12,0.5)'; c.fillRect(0, 0, W, H);
  c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillStyle = '#ffd34d'; c.font = `900 ${Math.round(Math.min(76, W * 0.09))}px ${FONT}`;
  c.fillText('ブロック タイピング', W / 2, H * 0.16);
  c.fillStyle = '#e8e2d6'; c.font = `700 ${Math.round(Math.min(26, W * 0.032))}px ${FONT}`;
  c.fillText('すきな ステージを えらんでね', W / 2, H * 0.16 + 50);

  // 4枚のステージカード
  const cols = 4, gap = Math.min(28, W * 0.025);
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
      c.fillText(STAGE_ICON[stage], bx + bw / 2, by + bh * 0.26);
      c.fillStyle = '#fff';
      const nameStr = `${stage}. ${STAGE_NAME[stage]}`;
      let nf = Math.round(bh * 0.16);
      c.font = `900 ${nf}px ${FONT}`;
      while (c.measureText(nameStr).width > bw * 0.86 && nf > 8) { nf--; c.font = `900 ${nf}px ${FONT}`; }
      c.fillText(nameStr, bx + bw / 2, by + bh * 0.52);
      c.fillStyle = 'rgba(255,255,255,0.85)'; c.font = `700 ${Math.round(bh * 0.085)}px ${FONT}`;
      c.fillText(STAGE_SUB[stage], bx + bw / 2, by + bh * 0.65);
      // ベスト ★
      stars(c, bx + bw / 2 - (bh * 0.13 * 3) / 2, by + bh * 0.81, bh * 0.13, best.stars, 4);
      if (best.score > 0) {
        c.fillStyle = '#ffe9a8'; c.textAlign = 'center'; c.font = `700 ${Math.round(bh * 0.09)}px ${FONT}`;
        c.fillText('ベスト ' + best.score, bx + bw / 2, by + bh * 0.93);
      }
    });
    // ほんのり鼓動
    if (best.score === 0) { c.save(); c.globalAlpha = 0.25 * pulse; c.fillStyle = '#fff'; roundRect(c, x, y0, cw, ch * 0.9, 16); c.fill(); c.restore(); }
  }
  c.fillStyle = 'rgba(255,255,255,0.6)'; c.textAlign = 'center'; c.font = `700 16px ${FONT}`;
  c.fillText('タップ、または 1〜4 のキー', W / 2, y0 + ch + 30);
  muteBtn(c);
}

// ---------- 画面: 結果 ----------
function drawResult(c) {
  c.save(); c.translate(layout.world.x, layout.world.y); scene.draw(c); c.restore();
  c.fillStyle = 'rgba(20,16,12,0.55)'; c.fillRect(0, 0, W, H);
  const cx = W / 2;
  c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillStyle = '#ffd34d'; c.font = `900 ${Math.round(Math.min(72, W * 0.085))}px ${FONT}`;
  c.fillText('クリア！', cx, H * 0.14);
  c.fillStyle = '#e8e2d6'; c.font = `700 ${Math.round(Math.min(28, W * 0.03))}px ${FONT}`;
  c.fillText(`${STAGE_ICON[result.stage]} ${STAGE_NAME[result.stage]}`, cx, H * 0.14 + 48);

  // ★
  const ss = Math.min(64, W * 0.07);
  stars(c, cx - (ss * 3 + 12 * 2) / 2, H * 0.32, ss, result.stars, 12);

  // パネル（タイム・正解率・スコア）
  const pw = Math.min(520, W * 0.6), px = cx - pw / 2, py = H * 0.42, ph = H * 0.26;
  c.fillStyle = 'rgba(20,16,12,0.6)'; roundRect(c, px, py, pw, ph, 16); c.fill();
  const seconds = (result.timeMs / 1000).toFixed(1);
  const accPct = Math.round(result.accuracy * 100);
  const rowY = (i) => py + ph * (0.24 + i * 0.26);
  const drawRow = (i, label, val, col) => {
    c.textAlign = 'left'; c.fillStyle = '#cfc8ba'; c.font = `700 ${Math.round(ph * 0.16)}px ${FONT}`;
    c.fillText(label, px + pw * 0.12, rowY(i));
    c.textAlign = 'right'; c.fillStyle = col; c.font = `900 ${Math.round(ph * 0.2)}px ${FONT}`;
    c.fillText(val, px + pw * 0.88, rowY(i));
  };
  drawRow(0, '⏱ じかん', `${seconds} びょう`, '#fff');
  drawRow(1, '🎯 せいかい', `${accPct} %`, accPct >= 90 ? '#3fd6a0' : '#ffd34d');
  drawRow(2, '⭐ スコア', `${result.score}`, '#ffe9a8');
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
requestAnimationFrame(frame);

if ('serviceWorker' in navigator && window.isSecureContext) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}
