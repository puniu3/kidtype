// milestones.js — 長期プログレス: 累計獲得点で「すまい」が育つマイルストーン（純粋・DOM非依存）。
// 採掘(mining)で貯めた累計スコアが各しきい値を超えるたびに、ステージ選択画面の
// 背景の建物が一段ずつ豪華に進化する：更地 → たきび → こや → ちいさな いえ …
// → 単一の家がやがて「複数の建物が並ぶ集落(estate/むら)」へ、最後は大きなお城へ。
// tier はこの配列の index（0..N-1）。
//
// しきい値は初期見積り（1ラウンド ~150–500 点を 7 歳が何度も遊ぶ前提）。序盤は
// すぐ次の段に届いて達成感が出るよう刻みを細かく・低く、後半は長く遊ぶご褒美として
// 天井（おおきな おしろ）まで大きく伸ばす。配分の調整はこの 1 箇所だけ触ればよい。
export const HOUSE_MILESTONES = [
  { total: 0,      name: 'さらち' },          // tier 0:  更地（杭と立て札だけ）
  { total: 500,    name: 'たきび' },          // tier 1:  たきび＋テント（最初の拠点・すぐ届く）
  { total: 1200,   name: 'こや' },            // tier 2:  掘立て小屋
  { total: 2500,   name: 'ちいさな いえ' },   // tier 3:  小さな家（屋根＋ドア＋窓）
  { total: 4500,   name: 'はたけつき いえ' }, // tier 4:  家＋畑（ここから複数の構成物＝集落の芽生え）
  { total: 7500,   name: 'いえと なや' },     // tier 5:  農家（家＋納屋＋井戸＋畑）
  { total: 12000,  name: 'おおきな いえ' },   // tier 6:  大きな家（2階建て）＋庭＋木＋柵
  { total: 18000,  name: 'やしき' },          // tier 7:  屋敷（母屋＋離れ＋柵で囲った庭）
  { total: 28000,  name: 'むら' },            // tier 8:  村（大小いくつもの家が横に並ぶ集落）
  { total: 45000,  name: 'とりで' },          // tier 9:  砦（石壁で囲い・見張り塔・門）
  { total: 75000,  name: 'おしろ' },          // tier 10: 城（天守＋両端の塔＋門＋旗）
  { total: 130000, name: 'おおきな おしろ' }, // tier 11: 大きなお城（巨大・幾つもの塔＋高い天守＝大きな家を遥かに凌ぐ）
];

// 累計スコア total に対応する建物の tier（0..N-1）を返す。
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

// その累計スコアの建物の名前（表示用）。
export function houseName(total) {
  return HOUSE_MILESTONES[houseLevelForTotal(total)].name;
}

// 家プログレスバー用: いまの tier 内で「次のマイルストーン」へどこまで届いたか。
//   tier   … いまの tier（houseLevelForTotal と同じ値）
//   frac   … 次のしきい値への到達割合 0..1（最上位 tier は常に 1＝満タン）
//   cur    … いまの tier のしきい値
//   next   … 次のしきい値（最上位なら null）
//   remain … 次のしきい値まで残り（最上位なら 0）
export function houseProgress(total) {
  const t = Math.max(0, Number.isFinite(total) ? total : 0);
  const tier = houseLevelForTotal(t);
  const cur = HOUSE_MILESTONES[tier].total;
  const next = tier + 1 < HOUSE_MILESTONES.length ? HOUSE_MILESTONES[tier + 1].total : null;
  if (next == null) return { tier, frac: 1, cur, next: null, remain: 0 };
  const frac = Math.max(0, Math.min(1, (t - cur) / (next - cur)));
  return { tier, frac, cur, next, remain: Math.max(0, next - t) };
}
