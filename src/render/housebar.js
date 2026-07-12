// housebar.js — 「家のプログレスバー」。累計スコアが次のおうちマイルストーンへ
// どこまで届いたかを見える化する（タイトル＝ステージ選択と結果画面の両方に出す）。
// クリア時はラウンドの得点がダイヤになってバーへ注ぎ込まれ、その分だけバーが伸びる。
// マイルストーンを跨いだら金色にフラッシュ →「あたらしい おうち！」ポップ → バーは
// 次の段用に 0 から続きが注がれる（houseProgress が tier 内割合なので自然にそうなる）。
//
// アニメは全て canvas + dt 駆動（main のループから update(dt) を受ける）。CSS の
// transition/animation を使わないので prefers-reduced-motion の一括 0s 化の影響を受けない。

import { houseProgress, HOUSE_MILESTONES } from '../engine/milestones.js';

const FILL = '#3fc6e0', FILL_HI = '#9deefb', FILL_LO = '#2a93ad', GOLD = '#ffd34d';
const fmt = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

export class HouseBar {
  constructor() {
    this.displayTotal = 0;   // いま描いている累計。注ぎ込み中は from→to へ動く
    this.pour = null;        // 注ぎ込み演出の状態（null = 演出なし）
    this.flyers = [];        // 飛行中のダイヤ
    this.sparks = [];        // 着弾・お祝いのきらめき粒
    this.flash = 0;          // マイルストーン達成の金フラッシュ 0..1
    this.pulse = 0;          // 着弾でバー先端が白く光る 0..1
    this.tierPop = null;     // 「あたらしい おうち！」ポップ { name, t }
    this.lastTier = 0;
    this.geom = null;        // 直近 draw の配置。update の飛行目標・スポーン位置に使う
  }

  // 演出なしの即時反映（タイトル画面用）。注ぎ込み中は演出側が総量を管理するので触らない。
  setTotal(total) {
    if (this.pour) return;
    this.displayTotal = Math.max(0, total | 0);
    this.lastTier = houseProgress(this.displayTotal).tier;
  }

  // ラウンドクリア → 得点分のダイヤが飛んでバーに注がれる演出を開始。
  startPour(from, to) {
    from = Math.max(0, from | 0); to = Math.max(from, to | 0);
    this.displayTotal = from;
    this.lastTier = houseProgress(from).tier;
    const count = Math.max(5, Math.min(12, Math.round((to - from) / 40))); // 得点に応じた粒数
    const delay = 0.45, gap = 0.09, flight = 0.55;                          // 画面が落ち着いてから注ぐ
    this.pour = { from, to, t: 0, count, spawned: 0, delay, gap, flight,
      fillStart: delay + flight, fillEnd: delay + (count - 1) * gap + flight };
    this.flyers.length = 0; this.sparks.length = 0;
    this.flash = 0; this.pulse = 0; this.tierPop = null;
  }

  // 表示中の進捗（tier / frac / next / remain）。main がラベル等に使う窓口。
  info() { return houseProgress(this.displayTotal); }

  update(dt) {
    this.flash = Math.max(0, this.flash - dt * 1.4);
    this.pulse = Math.max(0, this.pulse - dt * 3);
    if (this.tierPop) { this.tierPop.t += dt; if (this.tierPop.t > 1.6) this.tierPop = null; }

    const g = this.geom;
    if (this.pour) {
      const P = this.pour; P.t += dt;
      // ダイヤのスポーン（スコア行のあたりから一定間隔で湧く）
      while (g && P.spawned < P.count && P.t >= P.delay + P.spawned * P.gap) {
        const sx = (g.sourceX ?? g.x + g.w / 2) + (Math.random() - 0.5) * 18;
        const sy = (g.sourceY ?? g.y - g.h * 3) + (Math.random() - 0.5) * 10;
        this.flyers.push({ u: 0, dur: P.flight, sx, sy,
          arc: g.h * (1.6 + Math.random() * 1.4), size: g.h * (0.5 + Math.random() * 0.2) });
        P.spawned++;
      }
      // バーの伸び：最初の着弾〜最後の着弾に同期して from→to へ（smoothstep）
      const span = Math.max(0.001, P.fillEnd - P.fillStart);
      const p = Math.min(1, Math.max(0, (P.t - P.fillStart) / span));
      this.displayTotal = Math.round(P.from + (P.to - P.from) * p * p * (3 - 2 * p));
      // マイルストーン跨ぎ → 金フラッシュ＋「あたらしい おうち」ポップ＋お祝いの粒
      const tier = houseProgress(this.displayTotal).tier;
      if (tier > this.lastTier) {
        this.lastTier = tier;
        this.flash = 1;
        this.tierPop = { name: HOUSE_MILESTONES[tier].name, t: 0 };
        if (g) this._tierBurst(g);
      }
      // 全て着弾してひと呼吸おいたら演出終了（総量を確定）
      if (P.t >= P.fillEnd + 0.6 && this.flyers.length === 0) { this.displayTotal = P.to; this.pour = null; }
    }

    // 飛行ダイヤ：進めて、着弾したらバー先端でスパーク
    if (g) {
      const tip = this._tip(g);
      for (const f of this.flyers) {
        f.u += dt / f.dur;
        if (Math.random() < 0.45) {                                 // 軌跡のきらめき
          const pos = this._flyerPos(f, tip);
          this.sparks.push({ x: pos.x, y: pos.y, vx: 0, vy: 10, life: 0.3, max: 0.3, s: 2.5, col: '#cfffff' });
        }
        if (f.u >= 1) { this.pulse = 1; this._burst(tip.x, tip.y, 7); }
      }
      this.flyers = this.flyers.filter((f) => f.u < 1);
    }
    // 粒（軽い重力で散って消える）
    for (const p of this.sparks) { p.vy += 240 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt; }
    this.sparks = this.sparks.filter((p) => p.life > 0);
  }

  draw(ctx, g) {
    this.geom = g;
    const { x, y, w, h } = g;
    const info = houseProgress(this.displayTotal);

    // 枠（石ブロック風の縁取り）と受け皿
    this._blk(ctx, x - 3, y - 3, w + 6, h + 6, '#15110d');
    this._blk(ctx, x, y, w, h, '#241f19');

    // 中身（ダイヤ色のブロック。上面の光＋下面の影で立体に）
    const fw = Math.round(w * info.frac);
    if (fw > 0) {
      this._blk(ctx, x, y, fw, h, FILL);
      this._blk(ctx, x, y, fw, Math.max(2, h * 0.3), FILL_HI);
      this._blk(ctx, x, y + h - Math.max(2, h * 0.24), fw, Math.max(2, h * 0.24), FILL_LO);
      if (this.pulse > 0) {                                        // 着弾の先端グロー
        ctx.globalAlpha = this.pulse;
        this._blk(ctx, Math.max(x, x + fw - h * 0.6), y, Math.min(fw, h * 0.6), h, '#eaffff');
        ctx.globalAlpha = 1;
      }
    }
    // 目盛り（ブロックの継ぎ目）
    ctx.fillStyle = 'rgba(0,0,0,0.20)';
    for (let i = 1; i < 10; i++) ctx.fillRect(Math.round(x + (w * i) / 10) - 1, Math.round(y), 2, Math.round(h));

    // マイルストーン達成の金フラッシュ
    if (this.flash > 0) { ctx.globalAlpha = this.flash * 0.8; this._blk(ctx, x, y, w, h, GOLD); ctx.globalAlpha = 1; }

    // 端の 💎（ためたスコア）と 🏠（つぎのおうち）
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = `${Math.round(h * 1.3)}px ${g.font}`;
    ctx.fillText('💎', x - h * 1.15, y + h / 2);
    ctx.fillText('🏠', x + w + h * 1.15, y + h / 2);

    // バー中央のラベル：つぎのおうちまでの残り（注ぎ込み中はカウントダウンする）
    const label = info.next == null ? 'さいこう！' : `あと ${fmt(info.remain)}`;
    ctx.font = `900 ${Math.round(h * 0.62)}px ${g.font}`;
    ctx.lineWidth = Math.max(2, h * 0.14); ctx.strokeStyle = 'rgba(10,20,24,0.6)'; ctx.lineJoin = 'round';
    ctx.strokeText(label, x + w / 2, y + h / 2 + 1);
    ctx.fillStyle = '#ffffff'; ctx.fillText(label, x + w / 2, y + h / 2 + 1);

    // きらめき粒
    for (const p of this.sparks) {
      ctx.globalAlpha = Math.max(0, p.life / p.max);
      ctx.fillStyle = p.col;
      ctx.fillRect(Math.round(p.x - p.s / 2), Math.round(p.y - p.s / 2), Math.round(p.s), Math.round(p.s));
    }
    ctx.globalAlpha = 1;

    // 飛行中のダイヤ（ちいさなブロック宝石）
    const tip = this._tip(g);
    for (const f of this.flyers) {
      const pos = this._flyerPos(f, tip);
      this._drawMiniDiamond(ctx, pos.x, pos.y, f.size, f.u);
    }

    // 「あたらしい おうち！」ポップ（跨いだ瞬間の一言。スケールでポンと出て、ふっと消える）
    if (this.tierPop) {
      const tp = this.tierPop;
      const a = tp.t < 1.2 ? 1 : Math.max(0, 1 - (tp.t - 1.2) / 0.4);
      const s = tp.t < 0.16 ? 0.5 + (tp.t / 0.16) * 0.7 : tp.t < 0.3 ? 1.2 - 0.2 * ((tp.t - 0.16) / 0.14) : 1;
      ctx.save();
      ctx.translate(x + w / 2, y - h * 1.35); ctx.scale(s, s); ctx.globalAlpha = a;
      const txt = `🎉 ${tp.name}！`;
      ctx.font = `900 ${Math.round(h * 0.95)}px ${g.font}`;
      ctx.lineWidth = Math.max(3, h * 0.18); ctx.strokeStyle = 'rgba(30,20,8,0.75)'; ctx.lineJoin = 'round';
      ctx.strokeText(txt, 0, 0);
      ctx.fillStyle = GOLD; ctx.fillText(txt, 0, 0);
      ctx.restore();
    }
  }

  // ----- 内部 ---------------------------------------------------------------

  // バーの「注ぎ口」＝いまの fill の先端（伸びに合わせて動く）。
  _tip(g) {
    const frac = houseProgress(this.displayTotal).frac;
    return { x: g.x + Math.max(g.h * 0.3, g.w * frac), y: g.y + g.h / 2 };
  }

  // 二次ベジェ（発射点 → 山なりの弧 → バー先端）。先端は伸びに合わせて動く＝追尾する。
  _flyerPos(f, tip) {
    const u = Math.min(1, f.u), v = 1 - u;
    const mx = (f.sx + tip.x) / 2, my = Math.min(f.sy, tip.y) - f.arc;
    return {
      x: v * v * f.sx + 2 * v * u * mx + u * u * tip.x,
      y: v * v * f.sy + 2 * v * u * my + u * u * tip.y,
    };
  }

  _burst(x, y, n, cols = ['#9af0ff', '#ffffff', '#5fd6e6']) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, v = 60 + Math.random() * 120;
      this.sparks.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 80,
        life: 0.45 + Math.random() * 0.25, max: 0.7, s: 2 + Math.random() * 3,
        col: cols[(Math.random() * cols.length) | 0] });
    }
  }

  // マイルストーン達成：バー全体から金の粒が吹き上がる。
  _tierBurst(g) {
    for (let i = 0; i < 26; i++) {
      this.sparks.push({ x: g.x + Math.random() * g.w, y: g.y + g.h * 0.5,
        vx: (Math.random() - 0.5) * 60, vy: -120 - Math.random() * 160,
        life: 0.6 + Math.random() * 0.4, max: 1, s: 2.5 + Math.random() * 3.5,
        col: Math.random() < 0.5 ? GOLD : '#fff3b0' });
    }
  }

  _blk(ctx, x, y, w, h, col) {
    ctx.fillStyle = col;
    ctx.fillRect(Math.round(x), Math.round(y), Math.max(1, Math.round(w)), Math.max(1, Math.round(h)));
  }

  // ちいさなブロック宝石（scene の採掘ダイヤと同じ配色のミニ版）。
  _drawMiniDiamond(ctx, x, y, s, u) {
    const c = Math.max(2, s * 0.34);
    this._blk(ctx, x - c * 1.5, y - c * 2, c * 3, c, FILL_HI);   // テーブル面（明）
    this._blk(ctx, x - c * 2.5, y - c, c * 5, c, FILL);          // 最大幅
    this._blk(ctx, x - c * 1.5, y, c * 3, c, FILL);              // 下段
    this._blk(ctx, x - c * 0.5, y + c, c, c, FILL_LO);           // とがった底
    const tw = 0.5 + 0.5 * Math.sin(u * 18);                     // 白いきらめき
    ctx.globalAlpha = 0.4 + 0.6 * tw;
    this._blk(ctx, x - c * 1.2, y - c * 1.9, c * 0.9, c * 0.9, '#ffffff');
    ctx.globalAlpha = 1;
  }
}
