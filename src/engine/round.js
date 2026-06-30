// round.js — ラウンドの出題 id 選択（純粋関数・DOM 非依存・Math.random 非依存）。
//
// 旧実装は POOLS の「前方 N*2 件」だけを抽選していたため、拡充コーパスの新語
// （w16.. / s10..）が実プレイに一切出てこなかった。本モジュールはプール「全体」
// からサンプルし、毎ラウンド count 件の distinct id を返す。
//
// lv 付きステージ（3:たんご / 4:ぶんしょう）は易しめ寄りの難易度ミックスにする：
//   - lv の各 tier に最低 1 件を割り当て（count >= tier 数のとき）→ 全 tier 到達可能
//   - 残り枠は重み LV_WEIGHTS（易しいほど大）で D'Hondt 配分 → やさしい問題が多め
//   - tier 内は一様抽選 → 何度も回せば tier 内の全エントリが出る（新語も到達可能）
// lv 無しステージ（1:キー / 2:かな）は順序プール全体から一様に distinct 抽選する。
//
// rng は [0,1) を返す関数（呼び出し側で Math.random を渡す。テストは seed 付きを渡す）。

// 易しい tier ほど多く出すための重み（lv1 が最も出やすい）。
export const LV_WEIGHTS = { 1: 4, 2: 3, 3: 2, 4: 1 };

// 配列から distinct に k 件取り出す（部分 Fisher–Yates。元配列は破壊しない）。
function sampleDistinct(arr, k, rng) {
  const a = arr.slice();
  const n = a.length;
  const m = Math.max(0, Math.min(k, n));
  for (let i = 0; i < m; i++) {
    const j = i + Math.floor(rng() * (n - i));
    const t = a[i]; a[i] = a[j]; a[j] = t;
  }
  return a.slice(0, m);
}

// tier 配分：lvs（出現する lv の昇順配列）に count 件を割り当てた map lv->n を返す。
//   - count >= lvs.length: 各 tier にベース 1 件、残りを重み配分（D'Hondt 最高平均法）
//   - count <  lvs.length: ベース無しで count 個の tier を重み順に 1 件ずつ選ぶ
// sizes[lv] を超えて割り当てない（実データでは常に十分だが安全側に）。
function allocateCounts(lvs, sizes, count, weights) {
  const alloc = {};
  for (const lv of lvs) alloc[lv] = 0;
  const numTiers = lvs.length;
  if (numTiers === 0 || count <= 0) return alloc;

  const hasBaseline = count >= numTiers;
  let placed = 0;
  if (hasBaseline) {
    for (const lv of lvs) { if (sizes[lv] > 0) { alloc[lv] = 1; placed++; } }
  }
  // ベース時の追加上限は tier の在庫、非ベース時は 1（distinct な tier を選ぶ）。
  const capOf = (lv) => (hasBaseline ? sizes[lv] : 1);

  let remaining = count - placed;
  while (remaining > 0) {
    // D'Hondt: weight / (currentExtra + 1) が最大の tier に 1 件。
    // ベース分はラウンド配分の母数に含めない（追加分のみで平均化）。
    let best = null, bestScore = -Infinity;
    for (const lv of lvs) {
      if (alloc[lv] >= capOf(lv)) continue;            // 在庫/上限に達した tier は除外
      const extra = hasBaseline ? alloc[lv] - 1 : alloc[lv]; // 追加割当数
      const score = (weights[lv] || 1) / (extra + 1);
      // タイブレーク：重み大優先 → lv 小優先（決定的）。
      if (score > bestScore + 1e-9 ||
          (Math.abs(score - bestScore) <= 1e-9 &&
            (best === null ||
             (weights[lv] || 1) > (weights[best] || 1) ||
             ((weights[lv] || 1) === (weights[best] || 1) && lv < best)))) {
        best = lv; bestScore = score;
      }
    }
    if (best === null) break; // 全 tier が上限：これ以上は置けない
    alloc[best]++;
    remaining--;
  }
  return alloc;
}

// ステージのラウンド出題 id を選ぶ。
//   stage : ステージ番号（ログ/将来拡張用。挙動は lvOf の有無で決まる）
//   pool  : そのステージの id 配列（content.js の POOLS[stage]）
//   lvOf  : id -> lv（1..4）の関数。null/未指定なら lv 無し（一様抽選）。
//   count : 1 ラウンドの出題数（ROUND_COUNT[stage]）
//   rng   : [0,1) を返す乱数（Math.random / seed 付き）
// 返り値：count 件の distinct id 配列（順序はシャッフル済み）。
export function pickRoundIds(stage, { pool, lvOf = null, count, rng }) {
  if (!Array.isArray(pool) || pool.length === 0 || count <= 0) return [];

  // lv 無し：プール全体から一様 distinct 抽選。
  if (!lvOf) return sampleDistinct(pool, count, rng);

  // lv 付き：tier ごとに分け、配分し、tier 内一様抽選 → 結合してシャッフル。
  const byLv = new Map();
  for (const id of pool) {
    const lv = lvOf(id);
    if (!byLv.has(lv)) byLv.set(lv, []);
    byLv.get(lv).push(id);
  }
  const lvs = [...byLv.keys()].sort((a, b) => a - b);
  const sizes = {};
  for (const lv of lvs) sizes[lv] = byLv.get(lv).length;

  const alloc = allocateCounts(lvs, sizes, count, LV_WEIGHTS);

  let picked = [];
  for (const lv of lvs) {
    const n = alloc[lv] || 0;
    if (n > 0) picked = picked.concat(sampleDistinct(byLv.get(lv), n, rng));
  }
  // 端数や上限で count に満たない場合、残り全体から不足分を補う（安全側）。
  if (picked.length < count) {
    const have = new Set(picked);
    const rest = pool.filter((id) => !have.has(id));
    picked = picked.concat(sampleDistinct(rest, count - picked.length, rng));
  }
  // 易→難で並ばないよう最終シャッフル。
  return sampleDistinct(picked, picked.length, rng);
}
