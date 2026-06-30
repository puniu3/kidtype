// milestones.js — 長期プログレス: 累計獲得点で「村」が育つマイルストーン（純粋・DOM非依存）。
// 採掘(mining)で貯めた累計スコアが各しきい値を超えるたびに、ステージ選択画面の
// 背景の家が一段ずつ豪華に進化する：何もない更地 → 小屋 → 小さな家 → ちゃんとした家
// → 大きな家 → 城。tier はこの配列の index（0..N-1）。
//
// しきい値は初期見積り（1ラウンド ~150–500 点を 7 歳が何度も遊ぶ前提）。早い段階で
// 達成感が出て、城は長く遊んだご褒美になる配分。調整はこの 1 箇所だけ触ればよい。
export const HOUSE_MILESTONES = [
  { total: 0,     name: 'さらち' },        // tier 0: 更地（まだ何もない・杭だけ）
  { total: 800,   name: 'こや' },          // tier 1: 掘立て小屋
  { total: 2500,  name: 'ちいさな いえ' }, // tier 2: 小さな家（屋根＋ドア＋窓）
  { total: 6000,  name: 'いえ' },          // tier 3: ちゃんとした家（窓＋煙突）
  { total: 12000, name: 'おおきな いえ' }, // tier 4: 大きな家・屋敷（2階・たくさんの窓）
  { total: 25000, name: 'おしろ' },        // tier 5: 城（石壁＋塔＋旗）
];

// 累計スコア total に対応する家の tier（0..N-1）を返す。
// HOUSE_MILESTONES は昇順なので「total 以下の最大しきい値」の index を選ぶ。
// total=0 → tier 0、欠損/負値も tier 0 に丸める。
export function houseLevelForTotal(total) {
  const t = Number.isFinite(total) ? total : 0;
  let tier = 0;
  for (let i = 0; i < HOUSE_MILESTONES.length; i++) {
    if (t >= HOUSE_MILESTONES[i].total) tier = i; else break;
  }
  return tier;
}

// その累計スコアの家の名前（表示用）。
export function houseName(total) {
  return HOUSE_MILESTONES[houseLevelForTotal(total)].name;
}
