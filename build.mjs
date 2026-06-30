#!/usr/bin/env node
// 静的「ビルド」: バニラ ES モジュールのアプリを --outDir へまるごとコピーするだけ。
// アプリ内のパスは全て相対 (./) なので、/<id>/ プレフィックス配下に置いても
// base 書き換えなしでそのまま解決される。必要なのはアプリシェルの完全なコピーだけ。
//   node build.mjs --outDir <dir>
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';

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

// --- sw.js を後処理: キャッシュ名を内容ハッシュで自動バージョニング + SHELL を実ファイルから生成 ---
// これが無いとデプロイしても sw.js が同一バイトのままで、ブラウザ/PWA が SW 更新を検知せず
// cache-first の古いシェルを配り続ける（＝新機能が端末に届かない）。内容が変われば CACHE 名が変わり
// install→activate が走って旧キャッシュを purge し、新シェルを配る。SHELL も実ファイルから自動生成し
// 取りこぼし無くオフライン precache する。
function listShellFiles(dir) {
  const out = [];
  const walk = (rel) => {
    for (const name of fs.readdirSync(path.join(dir, rel))) {
      const r = rel ? `${rel}/${name}` : name;
      if (fs.statSync(path.join(dir, r)).isDirectory()) walk(r);
      else out.push(r);
    }
  };
  for (const top of ITEMS) {
    if (top === 'sw.js' || !fs.existsSync(path.join(dir, top))) continue;
    if (fs.statSync(path.join(dir, top)).isDirectory()) walk(top);
    else out.push(top);
  }
  return out.sort();
}
const swPath = path.join(outDir, 'sw.js');
if (fs.existsSync(swPath)) {
  const files = listShellFiles(outDir);
  const h = crypto.createHash('sha1');
  for (const f of files) { h.update(f); h.update(fs.readFileSync(path.join(outDir, f))); }
  const ver = h.digest('hex').slice(0, 10);
  const shell = ['./', ...files.map((f) => './' + f)];
  let sw = fs.readFileSync(swPath, 'utf8');
  sw = sw.replace(/const CACHE = '[^']*';/, `const CACHE = 'kidtype-${ver}';`);
  sw = sw.replace(/const SHELL = \[[\s\S]*?\];/, `const SHELL = ${JSON.stringify(shell)};`);
  fs.writeFileSync(swPath, sw);
  console.error(`[build] sw.js → CACHE kidtype-${ver}, SHELL ${shell.length} files (auto-versioned)`);
}
