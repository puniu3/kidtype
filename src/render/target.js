// target.js — 問題文ターゲット（かなタイル列）の描画。
//
// タイル辺長はステージ内で 1 つに固定する: プール中で最も幅を要する問題が
// 許容行数（たんご=1 行・ぶんしょう/ながいぶん=2 行）に収まる辺長をコーパスから
// 導出し、全問題を同じ辺長で描く。短い問題が巨大化し長い問題が極小化する従来の
// 「1 行フィット縮小」をやめ、長文は同じ辺長のまま 2 行に折り返す。
// 行分割の純ロジックは engine/tilelayout.js（チャンク境界のみ＝字を割らない）。

import { toChunks } from '../engine/romaji.js';
import { POOLS, wordById, sentenceById, longSentenceById } from '../engine/content.js';
import { TILE_GAP, SPACE_GAP, lineUnits, layoutRanges, poolMaxUnits } from '../engine/tilelayout.js';

const FONT = 'ui-rounded, "Hiragino Maru Gothic ProN", "Hiragino Sans", system-ui, sans-serif';

// ステージ → 許容行数。たんご(3) は 1 行のまま、ぶんしょう(4)・ながいぶん(5) は 2 行まで。
export const STAGE_MAX_LINES = { 3: 1, 4: 2, 5: 2 };

// ステージのプール全問題が許容行数に収まるための行幅（s 単位）。コーパスから導出する
// ので、語彙・文が増えても「ステージ内で統一されたサイズ」が自動で保たれる
// （最長の問題が伸びたらステージ全体が同じだけ小さくなる＝ばらつきは戻らない）。
const unitsCache = new Map();
export function stageTileUnits(stage) {
  if (!unitsCache.has(stage)) {
    const textOf = stage === 3 ? (id) => wordById(id).kana
      : stage === 4 ? (id) => sentenceById(id).text
        : (id) => longSentenceById(id).text;
    const lists = POOLS[stage].map((id) => toChunks(textOf(id)));
    unitsCache.set(stage, poolMaxUnits(lists, STAGE_MAX_LINES[stage]));
  }
  return unitsCache.get(stage);
}

function roundRect(c, x, y, w, h, r) {
  c.beginPath();
  c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
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

// ターゲット描画（タイルのみ・ラベル無し）。item は main.buildItem が作る
// { stage, kind, emoji, chunks, matcher, ... }。
// 返り値: 現在チャンク（採掘ターゲット）の中心座標 — 呼び出し側が scene.setFocus に渡す。
export function drawTarget(c, Wr, Hr, item) {
  const chunks = item.chunks;
  const availW = Wr * 0.74;
  let s, y0;
  if (item.stage <= 2) {
    // キー/ローマじ: 1 チャンクの大タイル（従来どおり）。
    s = Math.min(Wr * 0.2, Hr * 0.34);
    y0 = Hr * 0.16;
  } else if (STAGE_MAX_LINES[item.stage] === 1) {
    s = Math.max(28, Math.min(availW / stageTileUnits(item.stage), Hr * 0.26));
    y0 = Hr * 0.16;
  } else {
    // 2 行ステージは辺長をやや抑え、2 行目の分だけ開始位置も上げる。
    s = Math.max(28, Math.min(availW / stageTileUnits(item.stage), Hr * 0.22));
    y0 = Hr * 0.12;
  }
  const gap = s * TILE_GAP, spaceGap = s * SPACE_GAP, lineGap = s * 0.18;
  const lines = layoutRanges(chunks, availW / s);
  const cur = item.matcher.currentChunkIndex();
  const focus = { x: Wr / 2, y: y0 + s / 2 };
  c.textAlign = 'center'; c.textBaseline = 'middle';
  for (let li = 0; li < lines.length; li++) {
    const [i0, i1] = lines[li];
    const y = y0 + li * (s + lineGap);
    let x = Wr / 2 - (lineUnits(chunks, i0, i1) * s) / 2;
    if (li === 0 && item.emoji) { c.font = `${Math.round(s * 0.9)}px ${FONT}`; c.fillText(item.emoji, x - s * 0.6, y + s / 2); }
    for (let i = i0; i < i1; i++) {
      const ch = chunks[i];
      if (ch.auto) { x += spaceGap; continue; }
      const state = i < cur ? 'done' : i === cur ? 'current' : 'todo';
      const label = item.kind === 'key' ? ch.text.toUpperCase() : ch.text;
      tile(c, x, y, s, label, state);
      if (i === cur) { focus.x = x + s / 2; focus.y = y + s / 2; }
      x += s + gap;
    }
  }
  return focus;
}
