// font-coverage.mjs — 埋め込みフォントのグリフ抜け検査（開発時のみ使用・npm test 外）。
//
// ゲームが描き得る全文字（コーパス全域 + src/ 内の全文字列リテラル + ASCII 全域）を
// 集め、assets/fonts/*.kana.woff2 の cmap に全部載っているか照合する。
// 抜けグリフは全端末で豆腐になる＝今より悪いので、コーパスや UI 文言を増やしたら
// これを回す。絵文字（🟩💎⭐…）は意図的にサブセット外（システムの絵文字フォントに
// グリフ単位でフォールバックさせる）なので required から除外する。
//
// 実行: node tools/font-coverage.mjs   （cmap 抽出に python3 + fontTools を使う）
// exit 0 = 全カバー / exit 1 = 抜けあり（一覧を表示）

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import * as path from 'node:path';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const WOFF2 = path.join(ROOT, 'assets/fonts/MPLUSRounded1c-ExtraBold.kana.woff2');

const { KEY_ORDER, KANA_ORDER, WORDS, SENTENCES, LONG_SENTENCES } =
  await import(new URL('../src/engine/content.js', import.meta.url));
const { HOUSE_MILESTONES } = await import(new URL('../src/engine/milestones.js', import.meta.url));

// ---- 絵文字判定（サブセット対象外にする文字）------------------------------
// ★☆(U+2605-2606) は文字扱い（サブセットに含める）。それ以外の記号絵文字系は除外。
const isEmoji = (cp) =>
  cp >= 0x1f000 ||
  (cp >= 0x2600 && cp <= 0x27bf && cp !== 0x2605 && cp !== 0x2606) || // ☀⚽✂✨❤ …
  (cp >= 0x2b00 && cp <= 0x2bff) ||                                   // ⬆⭐🟨(枠外)…
  (cp >= 0x2300 && cp <= 0x23ff) ||                                   // ⏱⌛ …
  cp === 0xfe0f || cp === 0x200d || cp === 0x20e3;                    // VS16/ZWJ/keycap

// ---- src/ の文字列リテラル抽出（コメントは除外＝コメントの漢字を拾わない）----
function extractLiterals(code) {
  const out = [];
  let i = 0;
  const n = code.length;
  while (i < n) {
    const c = code[i];
    if (c === '/' && code[i + 1] === '/') { while (i < n && code[i] !== '\n') i++; continue; }
    if (c === '/' && code[i + 1] === '*') {
      i += 2; while (i < n && !(code[i] === '*' && code[i + 1] === '/')) i++; i += 2; continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      const q = c; i++;
      let buf = '';
      while (i < n && code[i] !== q) {
        if (code[i] === '\\') { buf += code[i + 1] ?? ''; i += 2; continue; }
        if (q === '`' && code[i] === '$' && code[i + 1] === '{') {
          i += 2; let depth = 1;                      // 挿入部はリテラルでない → } まで飛ばす
          while (i < n && depth > 0) { if (code[i] === '{') depth++; else if (code[i] === '}') depth--; i++; }
          continue;
        }
        buf += code[i]; i++;
      }
      i++;
      out.push(buf);
      continue;
    }
    i++;
  }
  return out;
}

function jsFiles(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) out.push(...jsFiles(p));
    else if (name.endsWith('.js')) out.push(p);
  }
  return out;
}

// ---- required set を構築 ---------------------------------------------------
const required = new Map(); // cp -> 由来ラベル（レポート用）
const add = (str, from) => {
  str = str.replace(/\/\*[\s\S]*?\*\//g, ''); // リテラル内 CSS のコメントは描画されない
  for (const ch of str) {
    const cp = ch.codePointAt(0);
    if (cp < 0x20) continue;            // 制御文字
    if (isEmoji(cp)) continue;          // 絵文字はシステム任せ
    if (!required.has(cp)) required.set(cp, from);
  }
};

// ASCII 印字全域（キーラベル A-Z・数字・スコア・タイム表示などランタイム合成文字を包括）
for (let cp = 0x20; cp <= 0x7e; cp++) required.set(cp, 'ascii');
// コーパス（かな教材の全文字。大文字化されるキーは ASCII で包括済み）
add(KEY_ORDER.join(''), 'content:KEY_ORDER');
add(KANA_ORDER.join(''), 'content:KANA_ORDER');
for (const w of WORDS) add(w.kana, 'content:WORDS');
for (const s of SENTENCES) add(s.text, 'content:SENTENCES');
for (const s of LONG_SENTENCES) add(s.text, 'content:LONG_SENTENCES');
for (const m of HOUSE_MILESTONES) add(m.name, 'milestones');
// UI 文言（src/ 全 .js の文字列リテラル。fillText 文言・install バナー文言を包括）
const emojiSeen = new Set();
for (const f of jsFiles(path.join(ROOT, 'src'))) {
  for (const lit of extractLiterals(readFileSync(f, 'utf8'))) {
    add(lit, path.relative(ROOT, f));
    for (const ch of lit) if (isEmoji(ch.codePointAt(0))) emojiSeen.add(ch);
  }
}
// 指示された保険: ★ は非絵文字の星としてフォントに要求する
add('★', 'explicit');

// ---- woff2 の実 cmap と照合 ------------------------------------------------
const cmapOut = execFileSync('python3', ['-c', `
from fontTools.ttLib import TTFont
print('\\n'.join(str(cp) for cp in TTFont(${JSON.stringify(WOFF2)}).getBestCmap()))
`], { encoding: 'utf8' });
const have = new Set(cmapOut.trim().split('\n').map(Number));

const missing = [...required.keys()].filter((cp) => !have.has(cp)).sort((a, b) => a - b);
console.log(`required: ${required.size} chars / font cmap: ${have.size} chars`);
console.log(`emoji (excluded, system fallback): ${[...emojiSeen].length}`);
if (missing.length) {
  console.error('MISSING GLYPHS (tofu on every device!):');
  for (const cp of missing) {
    console.error(`  U+${cp.toString(16).toUpperCase().padStart(4, '0')} ${String.fromCodePoint(cp)}  <- ${required.get(cp)}`);
  }
  process.exit(1);
}
console.log('✓ all drawable glyphs covered by the embedded font');
