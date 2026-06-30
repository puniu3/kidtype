// scene.js — Minecraft 風の世界・採掘演出。
// ターゲットのタイル列（main が上段に描く）が「採掘するブロック」そのもの。
// このシーンは下段の地面・キャラ・パーティクル担当で、タイルには重ねない。
// main から setFocus(現在タイルの中心) を受け、そこへ向けてキャラが振り、破片を飛ばす。

const SKY_TOP = '#69b7ff', SKY_BOT = '#bfeaff';

export class Scene {
  constructor() {
    this.w = 0; this.h = 0; this.t = 0;
    this.shake = 0;
    this.flash = 0;            // 間違い時の赤フラッシュ 0..1
    this.particles = [];
    this.swing = 0;            // ピッケル振り 0..1
    this.focus = { x: 0, y: 0 }; // 採掘対象（現在タイル）の中心
  }

  resize(w, h) { this.w = w; this.h = h; this.focus = { x: w * 0.5, y: h * 0.3 }; }
  setFocus(x, y) { this.focus.x = x; this.focus.y = y; }

  hit() { this.swing = 1; this._burst(this.focus.x, this.focus.y, 6, ['#cdb98a', '#a98e5e', '#ffffff']); }
  miss() { this.shake = Math.max(this.shake, 7); this.flash = 1; this.swing = 0.5; }
  complete() {
    this.swing = 1;
    this._burst(this.focus.x, this.focus.y, 26, ['#8a8a8a', '#bdbdbd', '#5fa83a', '#ffd34d']);
    this.shake = Math.max(this.shake, 9);
  }
  celebrate() {
    for (let i = 0; i < 60; i++) {
      this._burst(this.w * (0.3 + 0.4 * Math.random()), this.h * 0.25, 1,
        ['#ffd34d', '#3fd6d6', '#5fa83a', '#ff6b6b', '#ffffff'], 5);
    }
    this.shake = Math.max(this.shake, 6);
  }

  _burst(x, y, n, colors, spd = 3.2) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, v = spd * (0.4 + Math.random());
      this.particles.push({
        x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 2.2,
        s: 3 + Math.random() * 5, life: 1, col: colors[(Math.random() * colors.length) | 0],
      });
    }
  }

  update(dt) {
    this.t += dt;
    this.shake *= Math.pow(0.001, dt);
    this.flash = Math.max(0, this.flash - dt * 4);
    this.swing = Math.max(0, this.swing - dt * 5);
    const g = 26;
    for (const p of this.particles) { p.vy += g * dt; p.x += p.vx; p.y += p.vy; p.life -= dt * 1.3; }
    this.particles = this.particles.filter((p) => p.life > 0 && p.y < this.h + 30);
  }

  draw(ctx) {
    const W = this.w, H = this.h;
    const groundY = H * 0.74;            // 地面を下段に
    ctx.save();
    if (this.shake > 0.2) ctx.translate((Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake);

    // 空
    const sky = ctx.createLinearGradient(0, 0, 0, H * 0.8);
    sky.addColorStop(0, SKY_TOP); sky.addColorStop(1, SKY_BOT);
    ctx.fillStyle = sky; ctx.fillRect(-20, -20, W + 40, H + 40);

    // 太陽（四角い）
    ctx.fillStyle = 'rgba(255,241,168,0.35)'; ctx.fillRect(W * 0.86 - 8, H * 0.12 - 8, 62, 62);
    ctx.fillStyle = '#fff1a8'; ctx.fillRect(W * 0.86, H * 0.12, 46, 46);

    // 遠景の丘
    ctx.fillStyle = '#4f8f6a';
    for (let i = 0; i < 14; i++) {
      const bw = W / 11, bh = (i % 3 + 1) * H * 0.04 + H * 0.05;
      ctx.fillRect(i * bw - 10, groundY - bh, bw + 1, bh);
    }

    // 地面（草＋土）
    ctx.fillStyle = '#5fa83a'; ctx.fillRect(-20, groundY, W + 40, H * 0.05);
    ctx.fillStyle = '#7a5230'; ctx.fillRect(-20, groundY + H * 0.05, W + 40, H);
    ctx.fillStyle = 'rgba(0,0,0,0.10)';
    for (let x = 0; x < W; x += 36) for (let y = groundY + H * 0.08; y < H; y += 28)
      ctx.fillRect(x + ((y / 28) % 2) * 18, y, 6, 6);

    this._drawCharacter(ctx, groundY);

    for (const p of this.particles) {
      ctx.globalAlpha = Math.max(0, p.life); ctx.fillStyle = p.col; ctx.fillRect(p.x, p.y, p.s, p.s);
    }
    ctx.globalAlpha = 1;

    if (this.flash > 0) { ctx.fillStyle = `rgba(200,50,50,${this.flash * 0.16})`; ctx.fillRect(-20, -20, W + 40, H + 40); }
    ctx.restore();
  }

  // キャラは下段・左寄り。ピッケルを focus（現在タイル）へ向けて振る。
  _drawCharacter(ctx, groundY) {
    const u = Math.max(9, this.h * 0.05);
    const x = this.w * 0.16;
    const bob = Math.sin(this.t * 3) * u * 0.05;
    const footY = groundY + this.h * 0.01;
    const bodyTop = footY - u * 4 + bob;

    // 脚
    ctx.fillStyle = '#3a4a8a';
    ctx.fillRect(x, footY - u * 1.6, u * 0.9, u * 1.6);
    ctx.fillRect(x + u * 1.0, footY - u * 1.6, u * 0.9, u * 1.6);
    // 胴
    ctx.fillStyle = '#23a39b'; ctx.fillRect(x, bodyTop + u * 2, u * 1.9, u * 2);
    ctx.fillStyle = '#1f8d86'; ctx.fillRect(x - u * 0.5, bodyTop + u * 2, u * 0.6, u * 1.7);
    // 頭
    ctx.fillStyle = '#e7b690'; ctx.fillRect(x + u * 0.1, bodyTop, u * 1.7, u * 1.8);
    ctx.fillStyle = '#5a3a22'; ctx.fillRect(x + u * 0.1, bodyTop, u * 1.7, u * 0.5);
    ctx.fillRect(x + u * 0.1, bodyTop, u * 0.35, u * 1.0);
    // 目（focus 側を見る）
    ctx.fillStyle = '#1c1c1c';
    ctx.fillRect(x + u * 0.95, bodyTop + u * 0.8, u * 0.28, u * 0.32);
    ctx.fillRect(x + u * 1.3, bodyTop + u * 0.8, u * 0.28, u * 0.32);

    // ピッケル：肩 pivot から focus へ向けて、振りを乗せる
    const px = x + u * 1.9, py = bodyTop + u * 2.4;
    const aim = Math.atan2(this.focus.y - py, this.focus.x - px);
    const swing = Math.sin(this.swing * Math.PI) * 0.7;
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(aim - 0.35 + swing);
    ctx.fillStyle = '#8a5a2c'; ctx.fillRect(0, -u * 0.16, u * 2.6, u * 0.32);     // 柄
    ctx.fillStyle = '#cfcfd6'; ctx.fillRect(u * 2.3, -u * 0.85, u * 0.5, u * 1.7); // 頭
    ctx.fillStyle = '#9aa0aa'; ctx.fillRect(u * 2.2, -u * 0.28, u * 0.8, u * 0.56);
    ctx.restore();
  }
}
