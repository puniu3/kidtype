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
    this.diamond = null;       // 完答リワード：掘り出されたダイヤ（湧いている間だけ非 null）
    this.gleam = null;         // 完答時の局所フラッシュ（拡がる閃光）
  }

  resize(w, h) { this.w = w; this.h = h; this.focus = { x: w * 0.5, y: h * 0.3 }; }
  setFocus(x, y) { this.focus.x = x; this.focus.y = y; }

  hit() { this.swing = 1; this._burst(this.focus.x, this.focus.y, 6, ['#cdb98a', '#a98e5e', '#ffffff']); }
  miss() { this.shake = Math.max(this.shake, 7); this.flash = 1; this.swing = 0.5; }
  complete() {
    this.swing = 1;
    // 石ブロックがくだける破片（灰・土）→ その中からダイヤが現れる
    this._burst(this.focus.x, this.focus.y, 18, ['#8a8a8a', '#bdbdbd', '#6f6f6f', '#9a8a6a']);
    this.shake = Math.max(this.shake, 9);
    this._reveal(this.focus.x, this.focus.y);
  }

  // 採掘リワード：ブロックがくだけてダイヤが掘り出される瞬間。
  _reveal(x, y) {
    // ダイヤ本体（上にポンッと飛び出して、ふわっと浮かんで煌めく）
    this.diamond = { x, y, x0: x, y0: y, t: 0, life: 1.4, max: 1.4 };
    // 局所フラッシュ（一瞬の閃光・拡がって消える。全画面ストロボにはしない）
    this.gleam = { x, y, t: 0, life: 0.55, max: 0.55 };
    // ダイヤのかけら（水色のブロック破片が上向きに飛び散る）
    this._burst(x, y, 14, ['#9af0ff', '#5fd6e6', '#cfffff', '#ffffff'], 4.4);
    // キラキラ（落ちずにふわっと減速して瞬く粒）
    for (let i = 0; i < 18; i++) {
      const a = Math.random() * Math.PI * 2, v = 1.4 + Math.random() * 2.6;
      this.particles.push({
        x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 1.4,
        s: 2 + Math.random() * 3.5, life: 0.55 + Math.random() * 0.55,
        col: Math.random() < 0.5 ? '#ffffff' : '#bff6ff', kind: 'spark', tw: Math.random() * 6.28,
      });
    }
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
    for (const p of this.particles) {
      if (p.kind === 'spark') {           // きらめき：ふわっと減速して、ほんの少しだけ落ちる
        p.vx *= 0.9; p.vy = p.vy * 0.9 + 6 * dt; p.x += p.vx; p.y += p.vy; p.life -= dt * 1.5;
      } else {                            // 通常破片：重力で落ちる
        p.vy += g * dt; p.x += p.vx; p.y += p.vy; p.life -= dt * 1.3;
      }
    }
    this.particles = this.particles.filter((p) => p.life > 0 && p.y < this.h + 30);

    // ダイヤ：弧を描いて飛び出し → ふわふわ浮いて煌めく
    if (this.diamond) {
      const d = this.diamond; d.t += dt; d.life -= dt;
      const peak = this.h * 0.24;        // ブロック（上に重なって描かれる）の上までしっかり飛び出す
      const rise = d.t < 0.5 ? 1 - Math.pow(1 - d.t / 0.5, 3) : 1;           // ease-out で上昇
      const hover = d.t < 0.5 ? 0 : Math.sin((d.t - 0.5) * 4) * this.h * 0.008; // 上昇後はふわふわ
      d.y = d.y0 - peak * rise + hover;
      d.x = d.x0 + Math.sin(d.t * 2.5) * this.w * 0.004;
      if (d.life <= 0) this.diamond = null;
    }
    // フラッシュ
    if (this.gleam) { this.gleam.t += dt; this.gleam.life -= dt; if (this.gleam.life <= 0) this.gleam = null; }
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

    // 完答フラッシュ（局所・拡がる閃光）。ダイヤ・破片より奥に。
    if (this.gleam) {
      const gm = this.gleam, gp = 1 - gm.life / gm.max;        // 0..1
      const R = Math.max(11, this.h * 0.05);
      const gr = (0.25 + gp * 1.0) * R * 3;                    // 拡がる半径
      const ga = (1 - gp) * 0.5;                               // だんだん薄く
      const grd = ctx.createRadialGradient(gm.x, gm.y, 0, gm.x, gm.y, gr);
      grd.addColorStop(0, `rgba(224,255,255,${ga})`);
      grd.addColorStop(0.45, `rgba(150,235,255,${ga * 0.5})`);
      grd.addColorStop(1, 'rgba(150,235,255,0)');
      ctx.fillStyle = grd; ctx.fillRect(gm.x - gr, gm.y - gr, gr * 2, gr * 2);
    }

    for (const p of this.particles) {
      if (p.kind === 'spark') {                                // 十字に光るきらめき
        const tw = 0.5 + 0.5 * Math.sin(this.t * 12 + p.tw);
        ctx.globalAlpha = Math.max(0, p.life) * (0.4 + 0.6 * tw);
        ctx.fillStyle = p.col;
        const s = p.s * (0.7 + tw);
        ctx.fillRect(p.x - s / 2, p.y - s * 0.16, s, s * 0.32);
        ctx.fillRect(p.x - s * 0.16, p.y - s / 2, s * 0.32, s);
      } else {
        ctx.globalAlpha = Math.max(0, p.life); ctx.fillStyle = p.col; ctx.fillRect(p.x, p.y, p.s, p.s);
      }
    }
    ctx.globalAlpha = 1;

    if (this.diamond) this._drawDiamond(ctx, this.diamond);

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

  // 掘り出されたダイヤ：カット宝石本体 + 放射光 + 走るきらめき。
  _drawDiamond(ctx, d) {
    const R = Math.max(11, this.h * 0.05);
    const t = d.t;
    const fade = Math.min(1, d.life / 0.35);                 // 終盤に消える
    let sc;                                                  // 飛び出しのポップ（オーバーシュート）
    if (t < 0.15) sc = 1.3 * (t / 0.15);
    else if (t < 0.30) sc = 1.3 - 0.3 * ((t - 0.15) / 0.15);
    else sc = 1 + 0.05 * Math.sin((t - 0.30) * 5);

    ctx.save();
    ctx.translate(d.x, d.y);
    ctx.scale(Math.max(0, sc), Math.max(0, sc));

    // 放射する光のすじ（ゆっくり回りながら点滅。控えめにしてストロボ感を出さない）
    ctx.save();
    ctx.rotate(t * 0.5);
    ctx.globalAlpha = fade * (0.16 + 0.10 * Math.sin(t * 9));
    ctx.fillStyle = '#d4f8ff';
    const rays = 8, rlen = R * 2.7;
    for (let i = 0; i < rays; i++) {
      ctx.rotate((Math.PI * 2) / rays);
      ctx.beginPath();
      ctx.moveTo(-R * 0.12, -R * 0.9); ctx.lineTo(0, -rlen); ctx.lineTo(R * 0.12, -R * 0.9);
      ctx.closePath(); ctx.fill();
    }
    ctx.restore();

    // 宝石本体（八面体のカット宝石。左面=暗・右面=明・上のテーブル面=最も明るい）
    const top = -R, bot = R * 1.18, mx = R * 0.72, ty = -R * 0.45;
    ctx.globalAlpha = fade;
    ctx.fillStyle = '#2f9fc2';                                // 左面（影）
    ctx.beginPath(); ctx.moveTo(0, top); ctx.lineTo(-mx, 0); ctx.lineTo(0, bot); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#54d6e8';                                // 右面（光）
    ctx.beginPath(); ctx.moveTo(0, top); ctx.lineTo(mx, 0); ctx.lineTo(0, bot); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#bff4ff';                                // 上のテーブル面
    ctx.beginPath();
    ctx.moveTo(0, top); ctx.lineTo(-mx * 0.6, ty); ctx.lineTo(0, ty * 0.4); ctx.lineTo(mx * 0.6, ty);
    ctx.closePath(); ctx.fill();
    ctx.lineJoin = 'round'; ctx.lineWidth = Math.max(1.5, R * 0.10); ctx.strokeStyle = '#176a86';
    ctx.beginPath(); ctx.moveTo(0, top); ctx.lineTo(mx, 0); ctx.lineTo(0, bot); ctx.lineTo(-mx, 0); ctx.closePath(); ctx.stroke();

    // 表面を左右に走るきらめき
    const sx = Math.sin(t * 4) * R * 0.42;
    ctx.globalAlpha = fade * (0.5 + 0.4 * Math.sin(t * 8));
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(sx, -R * 0.55); ctx.lineTo(sx + R * 0.16, -R * 0.28); ctx.lineTo(sx, -R * 0.02); ctx.lineTo(sx - R * 0.16, -R * 0.28);
    ctx.closePath(); ctx.fill();

    // 角で瞬く 4 方向のスター
    const stw = 0.5 + 0.5 * Math.sin(t * 10);
    ctx.globalAlpha = fade * stw;
    const spx = R * 0.5, spy = -R * 0.7, ss = R * 0.5 * (0.6 + stw * 0.6);
    ctx.fillRect(spx - ss / 2, spy - ss * 0.12, ss, ss * 0.24);
    ctx.fillRect(spx - ss * 0.12, spy - ss / 2, ss * 0.24, ss);

    ctx.restore();
  }
}
