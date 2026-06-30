// keyboard.js — 画面上のブロック風 US キーボード。次に押すキーを光らせる「地図」。
// 指のゾーンをほんのり色分けして、正しい指の習慣づけも促す。

const ROWS = [
  { off: 0.0, keys: ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p', '-'] },
  { off: 0.3, keys: ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'] },
  { off: 0.8, keys: ['z', 'x', 'c', 'v', 'b', 'n', 'm'] },
];

// 指ゾーン（タッチタイプ標準）→ やわらかいパステル
const FINGER = {
  q: 'lp', a: 'lp', z: 'lp', '-': 'rp',
  w: 'lr', s: 'lr', x: 'lr',
  e: 'lm', d: 'lm', c: 'lm',
  r: 'li', f: 'li', v: 'li', t: 'li', g: 'li', b: 'li',
  y: 'ri', h: 'ri', n: 'ri', u: 'ri', j: 'ri', m: 'ri',
  i: 'rm', k: 'rm',
  o: 'rr', l: 'rr',
  p: 'rp',
};
const ZONE = {
  lp: '#3a4a6b', lr: '#3f5a6b', lm: '#3f6b5a', li: '#4a6b3f',
  ri: '#6b6b3f', rm: '#6b5a3f', rr: '#6b4a4a', rp: '#5a3f6b',
  _: '#444a55',
};

export class Keyboard {
  constructor() { this.area = { x: 0, y: 0, w: 0, h: 0 }; this.unit = 40; this.rects = new Map(); }

  // 配置領域からキー寸法を計算
  setArea(x, y, w, h) {
    this.area = { x, y, w, h };
    const cols = 11.5;          // 一番長い行＋余白
    const gap = 0.08;           // キー間（unit比）
    const rowsN = ROWS.length + 1; // +1 = space 行
    // 幅基準と高さ基準の小さい方で unit を決める
    const uW = w / (cols * (1 + gap));
    const uH = h / (rowsN * (1 + gap));
    this.unit = Math.min(uW, uH);
    const u = this.unit, g = u * gap;
    this.rects.clear();
    const totalH = rowsN * u + (rowsN - 1) * g;
    let cy = y + (h - totalH) / 2;
    // 全体を水平センタリング（最長行基準）
    const rowWidth = (n, off) => n * u + (n - 1) * g + off * (u + g);
    const maxW = Math.max(...ROWS.map((r) => rowWidth(r.keys.length, r.off)));
    const x0 = x + (w - maxW) / 2;
    for (const row of ROWS) {
      let cx = x0 + row.off * (u + g);
      for (const k of row.keys) { this.rects.set(k, { x: cx, y: cy, w: u, h: u }); cx += u + g; }
      cy += u + g;
    }
    // スペースバー
    const spW = u * 6 + g * 5;
    this.rects.set(' ', { x: x + (w - spW) / 2, y: cy, w: spW, h: u });
  }

  keyRect(ch) { return this.rects.get(ch); }

  // 1 キー描画（ブロック風：上面＋影の縁）
  _cap(ctx, r, label, fill, opts = {}) {
    const { glow = 0, pressed = false, wrong = false } = opts;
    const d = Math.max(3, r.h * 0.12); // 立体の厚み
    const y = r.y + (pressed ? d * 0.6 : 0);
    // 影の側面
    ctx.fillStyle = wrong ? '#7a2b2b' : shade(fill, -0.45);
    ctx.fillRect(r.x, y, r.w, r.h);
    // 上面
    ctx.fillStyle = wrong ? '#c0392b' : (glow > 0 ? mix(fill, '#ffe27a', 0.55 + 0.35 * glow) : fill);
    ctx.fillRect(r.x, y, r.w, r.h - d);
    // 縁ハイライト
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fillRect(r.x, y, r.w, Math.max(2, r.h * 0.08));
    if (glow > 0) {
      ctx.save();
      ctx.shadowColor = '#ffd34d'; ctx.shadowBlur = 18 + 18 * glow;
      ctx.lineWidth = Math.max(2, r.w * 0.08);
      ctx.strokeStyle = `rgba(255,221,77,${0.6 + 0.4 * glow})`;
      ctx.strokeRect(r.x + 1, y + 1, r.w - 2, r.h - d - 2);
      ctx.restore();
    }
    // ラベル
    if (label) {
      ctx.fillStyle = glow > 0 ? '#2a2a2a' : 'rgba(255,255,255,0.85)';
      ctx.font = `700 ${Math.round(r.h * 0.42)}px ui-rounded, "Hiragino Maru Gothic ProN", system-ui, sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const lbl = label === ' ' ? '␣' : label.toUpperCase();
      ctx.fillText(lbl, r.x + r.w / 2, y + (r.h - d) / 2 + 1);
    }
  }

  // state: { highlight:string|null, pressedOk:string|null, pressedWrong:string|null, pulse:0..1 }
  draw(ctx, state = {}) {
    const { highlight = null, pressedOk = null, pressedWrong = null, pulse = 0 } = state;
    for (const [k, r] of this.rects) {
      const base = ZONE[FINGER[k] || '_'] || ZONE._;
      const opts = {};
      if (k === highlight) opts.glow = 0.5 + 0.5 * pulse;
      if (k === pressedOk) opts.pressed = true;
      if (k === pressedWrong) { opts.wrong = true; opts.pressed = true; }
      this._cap(ctx, r, k, base, opts);
    }
    // ホームポジションの突起(F/J)
    for (const k of ['f', 'j']) {
      const r = this.rects.get(k); if (!r) continue;
      ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = Math.max(2, r.w * 0.06);
      const cx = r.x + r.w / 2;
      ctx.beginPath(); ctx.moveTo(cx - r.w * 0.16, r.y + r.h * 0.72); ctx.lineTo(cx + r.w * 0.16, r.y + r.h * 0.72); ctx.stroke();
    }
  }
}

// --- 色ユーティリティ ---
function hex(c) { c = c.replace('#', ''); return [parseInt(c.slice(0, 2), 16), parseInt(c.slice(2, 4), 16), parseInt(c.slice(4, 6), 16)]; }
function toHex(a) { return '#' + a.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join(''); }
function shade(c, f) { const a = hex(c); return toHex(a.map((v) => v + (f < 0 ? v * f : (255 - v) * f))); }
function mix(c1, c2, t) { const a = hex(c1), b = hex(c2); return toHex(a.map((v, i) => v + (b[i] - v) * t)); }
