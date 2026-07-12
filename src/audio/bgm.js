// bgm.js — Web Audio 直書きの手続きBGMループ（依存ゼロ・アセットなし）。
//  - AudioContext / リミッタ経路は sfx.js と共有（sharedBus）。ミュート = ctx.suspend() が
//    SFX/BGM を一撃で止め、resume で途中から続きが鳴る（曲時計は ctx.currentTime なので凍結する）。
//  - 起動は sfx.unlock() への相乗り（onUnlock フック）。ページロード時には何も作らない。
//  - メロディ・コード進行は事前作曲した固定データ（[step,midi,...] 配列）。実行時に乱数は
//    一切使わない — pad / bass / arp はデータから決定的に導出され、リロードしても同じ曲。
//  - 単調回避はセクション構成（8小節×4）とレーンの抜き差しで行う。
//
// 曲: 「そらのいえ」 D メジャー / 66 BPM / 32小節ループ（約116秒）。
// C418 的な浮遊感: add9/maj7 の柔らかい和声、sine パッドの遅い呼吸、triangle の細いメロディ。
//   S1 よあけ   (小節 0-7)  : pad + まばらな bass（ループの継ぎ目もここ＝静かに再入場）
//   S2 さんぽ   (小節 8-15) : + メロディ
//   S3 たかだい (小節 16-23): 平行短調 Bm へ持ち上げ、+ 薄い arp（頂点）
//   S4 ゆうぐれ (小節 24-31): メロディは残響だけ、息を抜いて S1 へ戻る

import { sharedBus, onUnlock } from './sfx.js';

// ---------- 時間の枠組み ----------
const BPM = 66;
const SEC_PER_STEP = 60 / BPM / 4;   // 16分音符 = 1 step ≈ 0.227s
const STEPS_PER_BAR = 16;
const BARS = 32;
const TOTAL_STEPS = BARS * STEPS_PER_BAR;          // 512
const LOOP_SEC = TOTAL_STEPS * SEC_PER_STEP;       // ≈ 116.4s
const STEPS_PER_SLOT = 32;                         // コード1つ = 2小節
const LOOKAHEAD = 1.5;   // 先読み窓（秒）。バックグラウンドのタイマー間引き(≥1s)より広く取る
const TICK_MS = 200;

// ---------- 作曲データ（事前作曲・固定） ----------
// コードパレット: pad = パッド用ボイシング(midi)、bass = ベース用ルート(midi)。
const CH = {
  Dmaj7: { pad: [62, 66, 69, 73], bass: 50 }, // D4 F#4 A4 C#5 / D3
  Fsm7:  { pad: [61, 64, 66, 69], bass: 54 }, // C#4 E4 F#4 A4 / F#3
  Gmaj7: { pad: [62, 66, 67, 71], bass: 55 }, // D4 F#4 G4 B4  / G3
  A7sus: { pad: [57, 62, 64, 67], bass: 45 }, // A3 D4 E4 G4   / A2
  Bm7:   { pad: [59, 62, 66, 69], bass: 47 }, // B3 D4 F#4 A4  / B2
  Asus2: { pad: [57, 59, 64, 69], bass: 45 }, // A3 B3 E4 A4   / A2
  Dmaj9: { pad: [64, 66, 69, 74], bass: 50 }, // E4 F#4 A4 D5  / D3
};
// 進行: 2小節×16スロット（4セクション×4スロット）。
const PROG = [
  'Dmaj7', 'Fsm7', 'Gmaj7', 'A7sus',   // S1 よあけ
  'Dmaj7', 'Fsm7', 'Gmaj7', 'A7sus',   // S2 さんぽ
  'Bm7',   'Gmaj7', 'Dmaj7', 'Asus2',  // S3 たかだい
  'Gmaj7', 'A7sus', 'Dmaj9', 'Dmaj9',  // S4 ゆうぐれ（Dmaj9 で息を抜いてループ頭へ）
];
// メロディ: [step, midi, 長さ(step), ベロシティ]。S1 は無音（pad だけで開ける）。
const MELODY = [
  // --- S2 さんぽ（小節 8-15）---
  [128, 78, 8, 0.9], [136, 76, 4, 0.75], [140, 74, 4, 0.75],  // F#5 E5 D5 (Dmaj7)
  [144, 76, 12, 0.85],                                        // E5 …add9 の浮遊
  [160, 73, 8, 0.8], [168, 69, 4, 0.7], [172, 71, 4, 0.75],   // C#5 A4 B4 (F#m7)
  [176, 73, 12, 0.8],                                         // C#5
  [192, 71, 4, 0.75], [196, 74, 4, 0.8], [200, 79, 8, 0.9],   // B4 D5 G5 (Gmaj7)
  [208, 78, 12, 0.85],                                        // F#5 = maj7 の光
  [224, 76, 8, 0.85], [232, 74, 4, 0.75], [236, 71, 4, 0.7],  // E5 D5 B4 (A7sus)
  [240, 69, 14, 0.8],                                         // A4 に着地 → Bm7 では7度に化ける
  // --- S3 たかだい（小節 16-23・頂点）---
  [256, 71, 4, 0.75], [260, 74, 4, 0.8], [264, 78, 8, 0.95],  // B4 D5 F#5 (Bm7) 駆け上がり
  [272, 76, 8, 0.85], [280, 74, 4, 0.75], [284, 76, 4, 0.8],  // E5 D5 E5
  [288, 74, 8, 0.85], [296, 71, 4, 0.75], [300, 69, 4, 0.7],  // D5 B4 A4 (Gmaj7)
  [304, 71, 12, 0.8],                                         // B4
  [320, 69, 8, 0.8], [328, 66, 4, 0.7], [332, 69, 4, 0.75],   // A4 F#4 A4 (Dmaj7) 一度沈む
  [336, 74, 12, 0.85],                                        // D5
  [352, 73, 8, 0.85], [360, 71, 4, 0.75], [364, 69, 4, 0.7],  // C#5 B4 A4 (Asus2+3度)
  [368, 71, 14, 0.8],                                         // B4 → Gmaj7 の3度へ滑り込む
  // --- S4 ゆうぐれ（小節 24-31・残響だけ）---
  [392, 74, 4, 0.55],                                         // D5 のこだま (Gmaj7)
  [408, 76, 4, 0.55],                                         // E5 のこだま (G6 の色)
  [424, 74, 4, 0.55],                                         // D5 のこだま (A7sus)
  [448, 69, 8, 0.7], [456, 71, 4, 0.65], [460, 73, 4, 0.65],  // A4 B4 C#5 (Dmaj9)
  [464, 74, 12, 0.75],                                        // D5 で解決。残り2小節は pad の呼吸のみ
];
// arp（S3 のみ・薄いきらめき）: 各小節の8分裏 [2,6,10,14] に、ボイシングの音を +1oct で。
const ARP_POS = [2, 6, 10, 14];
const ARP_IDX = [1, 2, 3, 2];                 // ボイシング内インデックス（上り→戻り）
const ARP_VEL = [0.8, 0.65, 0.75, 0.6];

// ---------- ミキシング ----------
const BGM_GAIN = 0.09;   // BGM バス全体（sfx master 0.9 の内側。SFX よりはっきり小さく）
const LANE_GAIN = { pad: 0.125, bass: 0.5, mel: 0.8, arp: 0.22 };
// 画面によるレーンの抜き差し（title/result = calm は pad 中心に薄く、play はフル編成）。
const SCENE_MUL = {
  calm: { pad: 1, bass: 0.7, mel: 0.45, arp: 0 },
  play: { pad: 1, bass: 1, mel: 1, arp: 1 },
};

// ---------- コンパイル（純データ → 時刻順イベント列。決定的） ----------
function compile() {
  const ev = [];
  PROG.forEach((name, slot) => {
    const base = slot * STEPS_PER_SLOT;
    const ch = CH[name];
    // pad: スロット頭で和音を一斉に（遅いアタックで呼吸させる）。終曲スロットだけ少し引く。
    for (const m of ch.pad) ev.push({ step: base, lane: 'pad', midi: m, dur: 32, vel: slot === 15 ? 0.85 : 1 });
    // bass: S1/S4 はスロット頭のみ（まばら）、S2/S3 は小節ごと（2打目は弱く）。
    if (slot < 4 || slot >= 12) {
      ev.push({ step: base, lane: 'bass', midi: ch.bass, dur: 30, vel: 0.8 });
    } else {
      ev.push({ step: base, lane: 'bass', midi: ch.bass, dur: 14, vel: 0.85 });
      ev.push({ step: base + 16, lane: 'bass', midi: ch.bass, dur: 14, vel: 0.6 });
    }
    // arp: S3（スロット8..11）だけ。コードトーンから決定的に導出。
    if (slot >= 8 && slot < 12) {
      for (const bar of [0, 1]) {
        for (let i = 0; i < 4; i++) {
          ev.push({ step: base + bar * STEPS_PER_BAR + ARP_POS[i], lane: 'arp', midi: ch.pad[ARP_IDX[i]] + 12, dur: 2, vel: ARP_VEL[i] });
        }
      }
    }
  });
  for (const [step, midi, dur, vel] of MELODY) ev.push({ step, lane: 'mel', midi, dur, vel });
  return ev.sort((a, b) => a.step - b.step);
}

// ---------- エンジン ----------
let ctx = null, lanes = null;
let events = null, idx = 0, loopBase = 0, timer = null;
let scene = 'calm';
let started = false;

function midiHz(m) { return 440 * Math.pow(2, (m - 69) / 12); }

// pad: sine、ゆっくり立ち上がりゆっくり消える。隣のコードと尾がクロスフェードする。
function padVoice(t, hz, durSec, vel) {
  const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = hz;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vel, t + 1.6);
  g.gain.setTargetAtTime(0.0001, t + durSec, 1.2);
  o.connect(g); g.connect(lanes.pad);
  o.start(t); o.stop(t + durSec + 5);
}
// bass: triangle、丸い立ち上がり + 長い減衰。
function bassVoice(t, hz, durSec, vel) {
  const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = hz;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vel, t + 0.06);
  g.gain.setTargetAtTime(vel * 0.6, t + 0.06, 1.2);
  g.gain.setTargetAtTime(0.0001, t + durSec, 0.4);
  o.connect(g); g.connect(lanes.bass);
  o.start(t); o.stop(t + durSec + 2);
}
// メロディ: triangle を ±3 cent でデチューンした2本（細い声にほのかな幅を持たせる）。
function melVoice(t, hz, durSec, vel) {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vel, t + 0.06);
  g.gain.setTargetAtTime(vel * 0.7, t + 0.06, 1.0);
  g.gain.setTargetAtTime(0.0001, t + durSec, 0.3);
  g.connect(lanes.mel);
  for (const det of [-3, 3]) {
    const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = hz; o.detune.value = det;
    const og = ctx.createGain(); og.gain.value = 0.5;
    o.connect(og); og.connect(g);
    o.start(t); o.stop(t + durSec + 1.5);
  }
}
// arp: sine の小さな粒（きらめき）。
function arpVoice(t, hz, vel) {
  const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = hz;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vel, t + 0.015);
  g.gain.setTargetAtTime(0.0001, t + 0.05, 0.22);
  o.connect(g); g.connect(lanes.arp);
  o.start(t); o.stop(t + 1.2);
}

function playEvent(e, t) {
  const hz = midiHz(e.midi);
  const durSec = e.dur * SEC_PER_STEP;
  if (e.lane === 'pad') padVoice(t, hz, durSec, e.vel);
  else if (e.lane === 'bass') bassVoice(t, hz, durSec, e.vel);
  else if (e.lane === 'mel') melVoice(t, hz, durSec, e.vel);
  else arpVoice(t, hz, e.vel);
}

// lookahead スケジューラ。先読み窓に入ったイベントを Web Audio の時刻で確定予約する。
// ミュート(ctx.suspend)中は currentTime が凍結する → 窓が埋まったら自然に何もしなくなり、
// resume で凍結地点から続きが鳴る（特別扱い不要）。
function tick() {
  const horizon = ctx.currentTime + LOOKAHEAD;
  while (true) {
    const e = events[idx];
    const t = loopBase + e.step * SEC_PER_STEP;
    if (t >= horizon) break;
    if (t > ctx.currentTime - 0.05) playEvent(e, t);
    idx++;
    if (idx >= events.length) { idx = 0; loopBase += LOOP_SEC; } // シームレスにループ
  }
}

const bgm = {
  // 冪等。sfx.unlock() 相乗りで最初のユーザー操作から呼ばれる（下の onUnlock 登録）。
  start() {
    if (started || typeof window === 'undefined') return;
    started = true;
    const bus0 = sharedBus();       // sfx と同じ ctx / master(→リミッタ) に相乗り
    ctx = bus0.ctx;
    const bus = ctx.createGain();
    bus.gain.value = BGM_GAIN;
    bus.connect(bus0.master);
    lanes = {};
    for (const k of Object.keys(LANE_GAIN)) {
      const g = ctx.createGain();
      g.gain.value = LANE_GAIN[k] * SCENE_MUL[scene][k];
      g.connect(bus);
      lanes[k] = g;
    }
    events = compile();
    idx = 0;
    loopBase = ctx.currentTime + 0.1;
    tick();
    timer = setInterval(tick, TICK_MS);
  },
  // 画面に応じてレーンを抜き差し（'calm' = タイトル/結果: pad 中心に薄く / 'play' = フル編成）。
  // 毎フレーム呼ばれても同値なら即 return。切替はゲインのランプで滑らかに。
  setScene(name) {
    if (name === scene || !SCENE_MUL[name]) return;
    scene = name;
    if (!lanes) return; // 未開始なら start 時に反映される
    const mul = SCENE_MUL[name];
    for (const k of Object.keys(lanes)) {
      lanes[k].gain.setTargetAtTime(LANE_GAIN[k] * mul[k], ctx.currentTime, 0.6);
    }
  },
  get running() { return started; },
};

// 最初の sfx.unlock()（= 最初のユーザー操作）で遅延開始。ページロードでは何も起きない。
onUnlock(() => bgm.start());

export default bgm;
