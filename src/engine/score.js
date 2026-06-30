// score.js — ラウンド得点の純粋関数（DOM非依存・performance.now非依存。timeMs は引数で渡す）。
// 設計意図: 正確 かつ 速い ほど高得点。ミスタイプは得点に寄与しない（むしろ減点）。
//   - 得点は「正しい打鍵」だけから生まれ、正確率の二乗で強く割り引く
//     (100%→1.0, 90%→0.81, 80%→0.64, 50%→0.25)。誤打のたびに得点は必ず下がる。
//   - スピード加点は正確率でゲートする（速いだけ・雑なのは、丁寧で少し遅いより上に来ない）。
//   - 明示的なミス減点も足すが、基礎点の一部までに上限を設けるので、
//     最後まで遊んだ初心者でも必ず 0 より大きい点を得る（floor は 0、負にしない）。
//   旧式に対し、完璧なラウンドの得点はほぼ同じ（基準を合わせてある）。誤りの多い
//   ラウンドだけ得点が下がるので、保存済みベストは「正確でないラウンド」ほど相対的に下がる。

const BASE_PER_KEY     = 10;    // 正しい打鍵1つあたりの基礎点（正確率²でスケール）
const SPEED_TARGET_MS  = 1600;  // この ms/打鍵 でスピード加点が 0 になる（旧式と同じ基準）
const SPEED_SCALE      = 100;   // スピード加点の割り係数（旧式と同じ）
const ERROR_PENALTY    = 4;     // ミス1回あたりの明示的な減点
const PENALTY_CAP_FRAC = 0.6;   // 減点は基礎点のこの割合まで（完走した初心者は必ず正の得点）

const ACC_2STAR     = 0.80;     // ★★: 正確率しきい値
const ACC_3STAR     = 0.95;     // ★★★: 正確率しきい値
const FAST_3STAR_MS = 1400;     // ★★★: ms/打鍵 の上限（速さ）

function accuracyOf(keysOk, keysErr) {
  const total = keysOk + keysErr;
  return total ? keysOk / total : 1;
}

// 正しい打鍵・誤打鍵・所要時間から整数の得点を返す。
export function computeScore({ keysOk = 0, keysErr = 0, timeMs = 0 } = {}) {
  const ok = Math.max(0, keysOk | 0);
  const err = Math.max(0, keysErr | 0);
  if (ok === 0) return 0;                            // 1打も正しく打てていなければ 0

  const accuracy = accuracyOf(ok, err);
  const accFactor = accuracy * accuracy;             // 誤打を強く罰する（正確率²）

  const base = ok * BASE_PER_KEY * accFactor;        // 常に > 0、誤打が増えると厳密に減る
  const avgPerKey = Math.max(0, timeMs) / ok;        // 正しい打鍵あたりの平均時間
  const speedRaw = Math.max(0, SPEED_TARGET_MS - avgPerKey) * ok / SPEED_SCALE;
  const speed = speedRaw * accFactor;                // スピード加点は正確率でゲート

  // 明示的なミス減点。基礎点の一定割合を上限にして、完走者の得点が 0 にならないようにする。
  const penalty = Math.min(err * ERROR_PENALTY, base * PENALTY_CAP_FRAC);

  return Math.max(0, Math.round(base + speed - penalty));
}

// ★の数（1〜3）。完走で1・高い正確率で2・正確かつ速いで3。旧式のしきい値の精神を保つ。
export function computeStars({ keysOk = 0, keysErr = 0, timeMs = 0 } = {}) {
  const ok = Math.max(1, keysOk | 0);
  const accuracy = accuracyOf(Math.max(0, keysOk | 0), Math.max(0, keysErr | 0));
  const avgPerKey = Math.max(0, timeMs) / ok;
  let stars = 1;                                                       // 完走で必ず ★1
  if (accuracy >= ACC_2STAR) stars = 2;                               // 高い正確率で ★2
  if (accuracy >= ACC_3STAR && avgPerKey <= FAST_3STAR_MS) stars = 3; // 正確かつ速いで ★3
  return stars;
}

// 結果画面が使う一括版。{ score, stars, accuracy } を返す（result オブジェクトの形を保つ）。
export function scoreRound({ keysOk = 0, keysErr = 0, timeMs = 0 } = {}) {
  return {
    score: computeScore({ keysOk, keysErr, timeMs }),
    stars: computeStars({ keysOk, keysErr, timeMs }),
    accuracy: accuracyOf(Math.max(0, keysOk | 0), Math.max(0, keysErr | 0)),
  };
}
