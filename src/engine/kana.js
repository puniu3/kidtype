// kana.js — かな関連のユーティリティ
// カタカナ→ひらがな正規化など。ローマ字エンジンはひらがな前提で動くので、
// 表示はカタカナでも内部ではここでひらがなに寄せてから処理する。

// カタカナ(U+30A1〜U+30F6)をひらがな(U+3041〜)へ。長音符ー(U+30FC)や
// 記号・英数字・スペースはそのまま通す。
export function kataToHira(str) {
  let out = '';
  for (const ch of str) {
    const c = ch.codePointAt(0);
    // ァ(0x30A1)〜ヶ(0x30F6) をシフト。ヴ(0x30F4)→ゔ(0x3094) も含む。
    if (c >= 0x30a1 && c <= 0x30f6) {
      out += String.fromCodePoint(c - 0x60);
    } else {
      out += ch;
    }
  }
  return out;
}

export function isHiragana(ch) {
  const c = ch.codePointAt(0);
  return c >= 0x3041 && c <= 0x3096;
}

export function isKatakana(ch) {
  const c = ch.codePointAt(0);
  return c >= 0x30a1 && c <= 0x30f6;
}

// 表示用に半角スペースを「ここで区切れる」見える記号に使うかどうかは UI 側の判断。
// エンジンは ' '(半角)/'　'(全角) を語の区切り(auto chunk)として扱う。
export function isSpace(ch) {
  return ch === ' ' || ch === '　';
}
