// tilelayout.js — 問題文タイルの行分割と「ステージ内で統一するタイルサイズ」の幅計算。
//
// 背景: 以前はチャンク数からタイル辺長を問題ごとに導出していたため、同じステージでも
// 短い問題は巨大に・長い問題は極小に描かれ、サイズがばらついて見苦しかった。
// 方針: 辺長はステージ単位で 1 つに固定し、長い問題は「縮小」ではなく「2 行への
// 折り返し」で収める（3 行以上にはしない）。このモジュールはその純ロジック側。
//
//  - 幅の勘定はタイル辺長 s = 1 とした相対単位（px 換算は呼び出し側で s を掛ける）。
//    render/target.js の描画と同一の勘定: タイル = 1 + TILE_GAP（後続の隙間）、
//    空白(auto) = SPACE_GAP、行末の余分な TILE_GAP は差し引く。
//  - 行分割はチャンク境界のみ（った / きゃ 等のまとまり＝1 タイルを絶対に割らない）。
//  - 空白(auto)チャンクの境界があればそこを優先（語の切れ目＝自然な改行点）。
//    行頭・行末に残った空白は幅に入れず描画もしない（改行が空白を吸収する）。

export const TILE_GAP = 0.16;   // タイル間の隙間（s 比）
export const SPACE_GAP = 0.5;   // 空白(auto)チャンクの幅（s 比）

// [start, end) から行頭・行末の auto(空白) を除いた範囲を返す。
function trimRange(chunks, start, end) {
  let a = start, b = end;
  while (a < b && chunks[a].auto) a++;
  while (b > a && chunks[b - 1].auto) b--;
  return [a, b];
}

// chunks[start..end) を 1 行に並べたときの幅（s 単位）。行端の auto は数えない。
export function lineUnits(chunks, start = 0, end = chunks.length) {
  const [a, b] = trimRange(chunks, start, end);
  let u = 0, tiles = 0;
  for (let i = a; i < b; i++) {
    if (chunks[i].auto) u += SPACE_GAP;
    else { u += 1 + TILE_GAP; tiles++; }
  }
  return tiles > 0 ? u - TILE_GAP : 0;
}

// 2 行への最良分割。全チャンク境界のうち「広い方の行が最も狭くなる」切れ目を選ぶ
// （同幅なら 1 行目が長い方＝上が重い形）。空白境界が 1 つでもあれば空白境界だけを
// 候補にする（語の途中で折らない）。実タイルが 1 個以下なら分割不能で 1 行を返す。
// 返り値: { ranges: [[a,b]] | [[a0,b0],[a1,b1]], units: 最も広い行の幅 }
export function bestSplit(chunks) {
  const [a, b] = trimRange(chunks, 0, chunks.length);
  const whole = { ranges: [[a, b]], units: lineUnits(chunks, a, b) };
  const cuts = [], spaceCuts = [];
  for (let i = a + 1; i < b; i++) {
    cuts.push(i);
    if (chunks[i].auto || chunks[i - 1].auto) spaceCuts.push(i);
  }
  let best = null;
  for (const i of (spaceCuts.length ? spaceCuts : cuts)) {
    const r1 = trimRange(chunks, a, i), r2 = trimRange(chunks, i, b);
    if (r1[0] >= r1[1] || r2[0] >= r2[1]) continue;   // 片側が空白のみ
    const units = Math.max(lineUnits(chunks, r1[0], r1[1]), lineUnits(chunks, r2[0], r2[1]));
    if (!best || units <= best.units + 1e-9) best = { ranges: [r1, r2], units };
  }
  return best && best.units < whole.units ? best : whole;
}

// 許容行数のもとで必要な行幅（s 単位）＝ その問題の最も広い行の幅。
// ステージ統一サイズの導出に使う: プール全問題の max を取れば、availW / maxUnits が
// 「プール中どの問題も許容行数に収まる」ステージ固定のタイル辺長になる。
export function requiredUnits(chunks, maxLines = 2) {
  if (maxLines <= 1) return lineUnits(chunks);
  return Math.min(lineUnits(chunks), bestSplit(chunks).units);
}

// プール（chunks 配列の配列）全体で必要な行幅の最大値（s 単位）。
export function poolMaxUnits(chunkLists, maxLines = 2) {
  let max = 0;
  for (const chunks of chunkLists) max = Math.max(max, requiredUnits(chunks, maxLines));
  return max;
}

// 描画用の行割り: capacityUnits(=availW/s) に収まるなら 1 行、あふれるなら 2 行。
// 返り値は元 chunks への添字範囲 [start, end) の配列。チャンク列を複製しないので、
// 状態色付け（done/current/todo）やキャレット強調は元 index のまま行を跨いで機能する。
export function layoutRanges(chunks, capacityUnits) {
  const [a, b] = trimRange(chunks, 0, chunks.length);
  if (lineUnits(chunks, a, b) <= capacityUnits + 1e-9) return [[a, b]];
  return bestSplit(chunks).ranges;
}
