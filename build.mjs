#!/usr/bin/env node
// 静的「ビルド」: バニラ ES モジュールのアプリを --outDir へまるごとコピーするだけ。
// アプリ内のパスは全て相対 (./) なので、/<id>/ プレフィックス配下に置いても
// base 書き換えなしでそのまま解決される。必要なのはアプリシェルの完全なコピーだけ。
//   node build.mjs --outDir <dir>
import * as fs from 'node:fs';
import * as path from 'node:path';

let outDir = null;
const a = process.argv.slice(2);
for (let i = 0; i < a.length; i++) {
  if (a[i] === '--outDir') outDir = a[++i];
  else if (a[i].startsWith('--outDir=')) outDir = a[i].slice('--outDir='.length);
}
if (!outDir) { console.error('usage: build.mjs --outDir <dir>'); process.exit(2); }

// 配信に必要なファイル/ディレクトリ。.butler / review / test / node_modules 等は含めない。
const ITEMS = ['index.html', 'manifest.webmanifest', 'sw.js', 'css', 'src', 'assets'];
fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });
for (const item of ITEMS) {
  if (!fs.existsSync(item)) { console.error(`[build] skip missing ${item}`); continue; }
  fs.cpSync(item, path.join(outDir, item), { recursive: true });
}
console.error(`[build] copied ${ITEMS.join(', ')} -> ${outDir}`);
