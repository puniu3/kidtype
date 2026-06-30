// content.js — 段階ごとの教材（順序付き）。Minecraft 風テーマで採掘/ブロック世界を味付け。
// ※ content-driven な部分。あとで /butler や workflow で拡充・検証していく土台。
//
//  - KEY_ORDER : Stage1 で導入する単キー（ローマ字に必要な英字）。母音→か行子音→…の順で、
//                Stage2 のかな入力にすぐ繋がるよう実用順に並べる。
//  - KANA_ORDER: Stage2 で導入するかな（清音→濁音→拗音）。
//  - WORDS     : Stage3 の単語。kana=表示, e=絵文字アイコン, lv=難易度。
//  - SENTENCES : Stage4 の短い文。語の区切りは半角スペース（打鍵は自動スキップ）。

// Stage1: 単キー導入順（実用＝早くかなを打てる順）
export const KEY_ORDER = [
  'a', 'i', 'u', 'e', 'o',          // 母音（あ行が打てる）
  'k', 's', 't', 'n',               // か/さ/た/な行
  'h', 'm', 'y', 'r', 'w',          // は/ま/や/ら/わ行
  'g', 'z', 'd', 'b', 'p',          // 濁音・半濁音
  'j', 'f', 'c', 'l', 'x', 'v', 'q',// 別形・外来音
];

// Stage2: かな導入順
export const KANA_ORDER = [
  'あ', 'い', 'う', 'え', 'お',
  'か', 'き', 'く', 'け', 'こ',
  'さ', 'し', 'す', 'せ', 'そ',
  'た', 'ち', 'つ', 'て', 'と',
  'な', 'に', 'ぬ', 'ね', 'の',
  'は', 'ひ', 'ふ', 'へ', 'ほ',
  'ま', 'み', 'む', 'め', 'も',
  'や', 'ゆ', 'よ',
  'ら', 'り', 'る', 'れ', 'ろ',
  'わ', 'を', 'ん',
  // 濁音・半濁音
  'が', 'ぎ', 'ぐ', 'げ', 'ご',
  'ざ', 'じ', 'ず', 'ぜ', 'ぞ',
  'だ', 'で', 'ど',
  'ば', 'び', 'ぶ', 'べ', 'ぼ',
  'ぱ', 'ぴ', 'ぷ', 'ぺ', 'ぽ',
  // 拗音
  'きゃ', 'きゅ', 'きょ',
  'しゃ', 'しゅ', 'しょ',
  'ちゃ', 'ちゅ', 'ちょ',
];

// Stage3: 単語。lv は難易度（1:短い清音 → 4:濁音/拗音/促音/長音）
export const WORDS = [
  // lv1: 1〜2かな・清音
  { kana: 'き', e: '🌲', lv: 1 },
  { kana: 'いし', e: '🪨', lv: 1 },
  { kana: 'つち', e: '🟫', lv: 1 },
  { kana: 'みず', e: '💧', lv: 1 },
  { kana: 'すな', e: '🏜️', lv: 1 },
  { kana: 'たね', e: '🌱', lv: 1 },
  { kana: 'にく', e: '🍖', lv: 1 },
  { kana: 'いぬ', e: '🐶', lv: 1 },
  { kana: 'ねこ', e: '🐱', lv: 1 },
  { kana: 'はな', e: '🌷', lv: 1 },
  // lv2: 3かな・清音
  { kana: 'たいまつ', e: '🔥', lv: 2 },
  { kana: 'つるはし', e: '⛏️', lv: 2 },
  { kana: 'さかな', e: '🐟', lv: 2 },
  { kana: 'ひつじ', e: '🐑', lv: 2 },
  { kana: 'にわとり', e: '🐔', lv: 2 },
  { kana: 'りんご', e: '🍎', lv: 2 },
  { kana: 'はしご', e: '🪜', lv: 2 },
  { kana: 'どうくつ', e: '🕳️', lv: 2 },
  // lv3: カタカナ語（Minecraft 風）
  { kana: 'ブロック', e: '🟩', lv: 3 },
  { kana: 'トロッコ', e: '🛒', lv: 3 },
  { kana: 'ベッド', e: '🛏️', lv: 3 },
  { kana: 'パン', e: '🍞', lv: 3 },
  { kana: 'ゾンビ', e: '🧟', lv: 3 },
  { kana: 'ダイヤ', e: '💎', lv: 3 },
  { kana: 'はしら', e: '🟫', lv: 3 },
  { kana: 'ようがん', e: '🌋', lv: 3 },
  // lv4: 長音・拗音・促音
  { kana: 'クリーパー', e: '🟢', lv: 4 },
  { kana: 'エメラルド', e: '🟩', lv: 4 },
  { kana: 'チェスト', e: '🧰', lv: 4 },
  { kana: 'こうせき', e: '⛏️', lv: 4 },
];

// Stage4: 短文（区切りは半角スペース）
export const SENTENCES = [
  { text: 'ブロックを ほる', lv: 1 },
  { text: 'いしを とる', lv: 1 },
  { text: 'きを きる', lv: 1 },
  { text: 'たいまつを おく', lv: 2 },
  { text: 'つるはしを つくる', lv: 2 },
  { text: 'よるは ゾンビが くる', lv: 3 },
  { text: 'ダイヤを みつけた', lv: 3 },
  { text: 'いえを つくろう', lv: 3 },
  { text: 'ようがんに きをつけて', lv: 4 },
  { text: 'クリーパーが ばくはつした', lv: 4 },
];

// 段階 → 順序付き id プール（progress.introduce/pick が使う）。
// WORD/SENTENCE は index を id にする（重複ターゲットがあっても安定）。
export const POOLS = {
  1: KEY_ORDER,
  2: KANA_ORDER,
  3: WORDS.map((_, i) => `w${i}`),
  4: SENTENCES.map((_, i) => `s${i}`),
};

export function wordById(id) { return WORDS[Number(String(id).slice(1))]; }
export function sentenceById(id) { return SENTENCES[Number(String(id).slice(1))]; }
