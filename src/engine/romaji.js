// romaji.js — かな → 許容ローマ字列 のテーブルと、ターゲット文字列をチャンク列へ
// 分解するトークナイザ。
//
// 設計方針:
//  - 各「チャンク」は 1 回で打ち切る単位（あ / きゃ / っ+た のまとまり など）。
//  - chunk.display は「教える形」(canonical) で 1 つ。例: し=shi, ち=chi, つ=tsu,
//    ふ=fu, じ=ji, ん=nn。子どもには常に正しく打てる素直な形を教える。
//  - chunk.options は「受理する形」の配列（複数可）。例: し=[shi, si]。
//  - matcher.js は options を NFA として走らせ、n/nn・shi/si 等の分岐を吸収する。
//
// 特殊処理:
//  - っ(促音): 次のチャンクの先頭子音を重ねる（katta, gakkou, burokku）。
//  - ん: 次が母音/な行/や行/ん/語末なら nn を強制、それ以外は n も許容。
//  - ー(長音): '-' を基本に、直前が母音ならその母音の連打も許容（kuri-pa- / kuriipaa）。
//  - スペース: 語の区切り。打鍵は必須にせず自動スキップ（auto chunk）。

import { kataToHira, isSpace } from './kana.js';

// --- 基本表（ひらがな単位 → 受理ローマ字。先頭が canonical=教える形）---
const BASE = {
  // 母音
  あ: ['a'], い: ['i'], う: ['u'], え: ['e'], お: ['o'],
  // か行
  か: ['ka'], き: ['ki'], く: ['ku'], け: ['ke'], こ: ['ko'],
  が: ['ga'], ぎ: ['gi'], ぐ: ['gu'], げ: ['ge'], ご: ['go'],
  // さ行（し は shi 教え、si も許容）
  さ: ['sa'], し: ['shi', 'si'], す: ['su'], せ: ['se'], そ: ['so'],
  ざ: ['za'], じ: ['ji', 'zi'], ず: ['zu'], ぜ: ['ze'], ぞ: ['zo'],
  // た行（ち=chi, つ=tsu 教え）
  た: ['ta'], ち: ['chi', 'ti'], つ: ['tsu', 'tu'], て: ['te'], と: ['to'],
  だ: ['da'], ぢ: ['di'], づ: ['du'], で: ['de'], ど: ['do'],
  // な行
  な: ['na'], に: ['ni'], ぬ: ['nu'], ね: ['ne'], の: ['no'],
  // は行（ふ=fu 教え）
  は: ['ha'], ひ: ['hi'], ふ: ['fu', 'hu'], へ: ['he'], ほ: ['ho'],
  ば: ['ba'], び: ['bi'], ぶ: ['bu'], べ: ['be'], ぼ: ['bo'],
  ぱ: ['pa'], ぴ: ['pi'], ぷ: ['pu'], ぺ: ['pe'], ぽ: ['po'],
  // ま行
  ま: ['ma'], み: ['mi'], む: ['mu'], め: ['me'], も: ['mo'],
  // や行
  や: ['ya'], ゆ: ['yu'], よ: ['yo'],
  // ら行
  ら: ['ra'], り: ['ri'], る: ['ru'], れ: ['re'], ろ: ['ro'],
  // わ行
  わ: ['wa'], を: ['wo'], ゔ: ['vu'],
  // 小書き（単独）
  ぁ: ['la', 'xa'], ぃ: ['li', 'xi'], ぅ: ['lu', 'xu'], ぇ: ['le', 'xe'], ぉ: ['lo', 'xo'],
  ゃ: ['lya', 'xya'], ゅ: ['lyu', 'xyu'], ょ: ['lyo', 'xyo'], ゎ: ['lwa', 'xwa'],
};

// --- 拗音・外来音の二文字表 ---
const DIGRAPH = {
  きゃ: ['kya'], きゅ: ['kyu'], きょ: ['kyo'],
  ぎゃ: ['gya'], ぎゅ: ['gyu'], ぎょ: ['gyo'],
  しゃ: ['sha', 'sya'], しゅ: ['shu', 'syu'], しょ: ['sho', 'syo'],
  じゃ: ['ja', 'jya', 'zya'], じゅ: ['ju', 'jyu', 'zyu'], じょ: ['jo', 'jyo', 'zyo'],
  ちゃ: ['cha', 'tya'], ちゅ: ['chu', 'tyu'], ちょ: ['cho', 'tyo'],
  ぢゃ: ['dya'], ぢゅ: ['dyu'], ぢょ: ['dyo'],
  にゃ: ['nya'], にゅ: ['nyu'], にょ: ['nyo'],
  ひゃ: ['hya'], ひゅ: ['hyu'], ひょ: ['hyo'],
  びゃ: ['bya'], びゅ: ['byu'], びょ: ['byo'],
  ぴゃ: ['pya'], ぴゅ: ['pyu'], ぴょ: ['pyo'],
  みゃ: ['mya'], みゅ: ['myu'], みょ: ['myo'],
  りゃ: ['rya'], りゅ: ['ryu'], りょ: ['ryo'],
  // 外来音（カタカナ語向け）
  ふぁ: ['fa'], ふぃ: ['fi'], ふぇ: ['fe'], ふぉ: ['fo'],
  うぃ: ['wi'], うぇ: ['we'], うぉ: ['who'],
  ゔぁ: ['va'], ゔぃ: ['vi'], ゔぇ: ['ve'], ゔぉ: ['vo'],
  てぃ: ['thi'], でぃ: ['dhi'], とぅ: ['twu'], どぅ: ['dwu'],
  ちぇ: ['che', 'tye'], じぇ: ['je', 'jye', 'zye'], しぇ: ['she', 'sye'],
};

const VOWELS = 'aiueo';

// 句読点・記号などローマ字キーへ素直に対応するもの（IME 風）。
// 子ども向け文章では基本使わないが、表示に出たら受理できるように。
const PUNCT = {
  '。': '.', '、': ',', '・': '/', '「': '[', '」': ']',
  '！': '!', '？': '?', 'ー': '-',
};

// --- トークナイズ: 生ユニット列へ ---
// type: 'kana' | 'sokuon'(っ) | 'n'(ん) | 'long'(ー) | 'auto'(空白) | 'literal'
// 各ユニットに原文インデックス i0/len を持たせる（kataToHira は長さ保存なので
// 正規化後の位置 == 原文の位置。表示用 tile の原文切り出しに使う）。
function tokenize(hira) {
  const units = [];
  let i = 0;
  while (i < hira.length) {
    const two = hira.substr(i, 2);
    const one = hira[i];

    if (DIGRAPH[two]) {
      units.push({ type: 'kana', kana: two, options: DIGRAPH[two].slice(), display: DIGRAPH[two][0], i0: i, len: 2 });
      i += 2;
      continue;
    }
    if (one === 'っ') { units.push({ type: 'sokuon', kana: 'っ', i0: i, len: 1 }); i += 1; continue; }
    if (one === 'ん') { units.push({ type: 'n', kana: 'ん', display: 'nn', i0: i, len: 1 }); i += 1; continue; }
    if (one === 'ー') { units.push({ type: 'long', kana: 'ー', i0: i, len: 1 }); i += 1; continue; }
    if (isSpace(one)) { units.push({ type: 'auto', kana: one, char: ' ', i0: i, len: 1 }); i += 1; continue; }
    if (BASE[one]) {
      units.push({ type: 'kana', kana: one, options: BASE[one].slice(), display: BASE[one][0], i0: i, len: 1 });
      i += 1;
      continue;
    }
    if (PUNCT[one]) {
      const r = PUNCT[one];
      units.push({ type: 'literal', kana: one, options: [r], display: r, i0: i, len: 1 });
      i += 1;
      continue;
    }
    // a-z / 0-9 などはそのまま（Stage1 の単キー課題や英字混じり用）
    units.push({ type: 'literal', kana: one, options: [one], display: one, i0: i, len: 1 });
    i += 1;
  }
  return units;
}

// ん の n/nn 判定用に「次の実ユニット」（auto=空白を飛ばす）の先頭ローマ字を得る。
// 文中の表示スペースは IME 上は存在しないものとして扱う＝スペース越しに先を見る。
function nextRealFirst(raw, idx) {
  for (let j = idx + 1; j < raw.length; j++) {
    if (raw[j].type === 'auto') continue;
    const u = raw[j];
    return (u.display || u.options?.[0] || u.char || '')[0] || '';
  }
  return '';
}

// --- チャンク列の構築（特殊処理を解決）---
// 各 chunk は { kana, options[], display, text(原文), ci0, ci1, auto? } を持つ。
// options/display はマッチング用（テスト済み）、text/ci0/ci1 は表示 tile 用。
export function toChunks(target) {
  const orig = String(target);
  const hira = kataToHira(orig);
  const raw = tokenize(hira);
  const chunks = [];
  let pendingSokuon = 0;
  let sokuonStart = -1;

  const flushSokuonAsLtu = () => {
    for (let k = 0; k < pendingSokuon; k++) {
      const p = sokuonStart + k;
      chunks.push({ kana: 'っ', options: ['ltu', 'xtu'], display: 'ltu', text: orig.substr(p, 1), ci0: p, ci1: p + 1 });
    }
    pendingSokuon = 0;
  };

  for (let i = 0; i < raw.length; i++) {
    const u = raw[i];

    if (u.type === 'sokuon') { if (pendingSokuon === 0) sokuonStart = u.i0; pendingSokuon++; continue; }

    if (u.type === 'auto') {
      chunks.push({ kana: ' ', options: [' '], display: ' ', auto: true, text: orig.substr(u.i0, u.len), ci0: u.i0, ci1: u.i0 + u.len });
      continue;
    }

    let opts, disp;
    if (u.type === 'kana' || u.type === 'literal') {
      opts = u.options.slice();
      disp = u.display;
    } else if (u.type === 'long') {
      const prev = chunks[chunks.length - 1];
      const pv = prev ? prev.display.slice(-1) : '';
      opts = ['-'];
      if (VOWELS.includes(pv)) opts.push(pv);
      disp = '-';
    } else if (u.type === 'n') {
      const nf = nextRealFirst(raw, i);                       // 空白を飛ばして次の実音を見る
      const forceNN = nf === '' || 'aiueony'.includes(nf);
      opts = forceNN ? ['nn'] : ['n', 'nn'];
      disp = 'nn';
    } else {
      continue;
    }

    // 促音適用
    let ci0 = u.i0;
    if (pendingSokuon > 0) {
      const canDouble = opts.every((o) => /^[a-z]/.test(o) && !VOWELS.includes(o[0]));
      if (canDouble) {
        opts = opts.map((o) => o[0].repeat(pendingSokuon) + o);
        disp = disp[0].repeat(pendingSokuon) + disp;
        ci0 = sokuonStart;                                    // tile 範囲に っ を含める
        pendingSokuon = 0;
      } else {
        flushSokuonAsLtu();                                   // 母音始まり等は っ を独立 tile に
      }
    }

    chunks.push({ kana: u.kana, options: opts, display: disp, text: orig.slice(ci0, u.i0 + u.len), ci0, ci1: u.i0 + u.len });
  }

  if (pendingSokuon > 0) flushSokuonAsLtu();                  // 末尾の促音

  return chunks;
}

// 教える形の連結（表示・進捗計算用）。空白チャンクはそのまま空白。
export function canonicalRomaji(chunks) {
  return chunks.map((c) => c.display).join('');
}

// 単一かな(または二文字拗音)の代表ローマ字。Stage2 のヒント表示などに。
export function kanaToRomaji(kana) {
  const chunks = toChunks(kana);
  return canonicalRomaji(chunks);
}

export { BASE, DIGRAPH };
