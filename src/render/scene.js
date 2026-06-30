// scene.js — Minecraft 風の世界・採掘演出。
// ターゲットのタイル列（main が上段に描く）が「採掘するブロック」そのもの。
// このシーンは下段の地面・キャラ・パーティクル担当で、タイルには重ねない。
// main から setFocus(現在タイルの中心) を受け、そこへ向けてキャラが振り、破片を飛ばす。
//
// 長期プログレス：背景に「育つ家(村)」を描く。main から累計スコアを setTotal() で受け取り、
// milestones.houseLevelForTotal() で tier 0..N を決めて drawHouse() が段階に応じた家を描く。

import { houseLevelForTotal, HOUSE_MILESTONES } from '../engine/milestones.js';

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
    this.houseTotal = 0;       // 累計スコア（背景の家の進化に使う）
    this.houseTier = 0;        // 現在の家 tier（0..N-1）
  }

  resize(w, h) { this.w = w; this.h = h; this.focus = { x: w * 0.5, y: h * 0.3 }; }
  setFocus(x, y) { this.focus.x = x; this.focus.y = y; }

  // 累計スコアを受け取り、背景の家 tier を更新する（新 tier を返す）。
  // main.js が milestones.js を直接 import せずに済むよう、変換はここに閉じ込める。
  setTotal(total) {
    this.houseTotal = Math.max(0, total | 0);
    this.houseTier = houseLevelForTotal(this.houseTotal);
    return this.houseTier;
  }
  // total → tier の純変換（main.js が tier 上がりを検出する用。import を増やさないための窓口）。
  houseTierForTotal(total) { return houseLevelForTotal(total); }
  // 現在の家の名前（表示用）。
  currentHouseName() { return HOUSE_MILESTONES[this.houseTier].name; }

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

    // 育つ家（村）— 丘の上の区画に、累計スコアの tier に応じた家を建てる。
    this._drawHouse(ctx);

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

  // ===== 育つ家（村）=================================================
  // 累計スコアの tier に応じて、丘の上の区画に建物を描く。
  // 0:更地 1:小屋 2:小さな家 3:ちゃんとした家(煙突) 4:大きな家 5:城。
  // ステージ選択カードに隠れないよう、丘の上（画面中ほど）に浮かせて配置する。
  _drawHouse(ctx) {
    const W = this.w, H = this.h;
    const tier = Math.max(0, Math.min(HOUSE_MILESTONES.length - 1, this.houseTier | 0));
    const u = Math.max(7, H * 0.05);      // ブロック単位
    const cx = W * 0.5;                    // 区画の中心 x
    const baseY = H * 0.645;               // 区画の地面ライン（丘の上）
    const plotW = u * (5.5 + tier * 1.5);  // 区画は tier が上がるほど広く
    this._plot(ctx, cx, baseY, plotW, u);
    switch (tier) {
      case 0: this._tier0(ctx, cx, baseY, u); break;
      case 1: this._tier1(ctx, cx, baseY, u); break;
      case 2: this._tier2(ctx, cx, baseY, u); break;
      case 3: this._tier3(ctx, cx, baseY, u); break;
      case 4: this._tier4(ctx, cx, baseY, u); break;
      default: this._castle(ctx, cx, baseY, u); break;
    }
  }

  // ピクセル(ブロック)1個。整数位置に置いてくっきり描く。
  _blk(ctx, x, y, w, h, col) {
    ctx.fillStyle = col;
    ctx.fillRect(Math.round(x), Math.round(y), Math.max(1, Math.round(w)), Math.max(1, Math.round(h)));
  }

  // 草＋土の土台プラットフォーム（村の区画）。
  _plot(ctx, cx, baseY, w, u) {
    const left = cx - w / 2;
    const grassH = u * 0.45, dirtH = u * 1.0;
    this._blk(ctx, left, baseY, w, grassH + dirtH, '#7a5230');      // 土
    this._blk(ctx, left, baseY, w, grassH, '#5fa83a');             // 草の表面
    this._blk(ctx, left, baseY, w, 2, '#74c34a');                 // 草のハイライト
    ctx.fillStyle = 'rgba(0,0,0,0.10)';
    for (let x = left + u * 0.4; x < left + w - u * 0.2; x += u * 0.9)
      ctx.fillRect(Math.round(x), Math.round(baseY + grassH + u * 0.3), Math.max(2, u * 0.16), Math.max(2, u * 0.16));
  }

  // 板/壁の継ぎ目とライティング（立体感）。
  _wallShade(ctx, x, y, w, h) {
    ctx.fillStyle = 'rgba(0,0,0,0.07)';
    for (let i = 1; i < 4; i++) ctx.fillRect(Math.round(x + (w * i) / 4), Math.round(y), 1, Math.round(h));
    for (let j = 1; j < 3; j++) ctx.fillRect(Math.round(x), Math.round(y + (h * j) / 3), Math.round(w), 1);
    this._blk(ctx, x, y, w, 2, 'rgba(255,255,255,0.10)');           // 上の光
    this._blk(ctx, x + w - 2, y, 2, h, 'rgba(0,0,0,0.12)');         // 右の影
  }

  // 三角(階段状)の屋根。eaveY=壁の上端、baseW=軒幅。
  _roof(ctx, cx, eaveY, baseW, u, colA, colB) {
    const rowH = u * 0.55;
    const rows = Math.max(3, Math.round(baseW / (u * 1.0)));
    for (let i = 0; i < rows; i++) {
      const w = baseW * (1 - i / rows);
      this._blk(ctx, cx - w / 2, eaveY - (i + 1) * rowH, w, rowH + 1, i % 2 ? colA : colB);
    }
    this._blk(ctx, cx - baseW / 2, eaveY - rowH, baseW, 2, 'rgba(0,0,0,0.12)'); // 軒の影
  }

  _door(ctx, cx, baseY, w, h) {
    this._blk(ctx, cx - w / 2, baseY - h, w, h, '#5a3a1c');
    this._blk(ctx, cx - w / 2, baseY - h, w, h * 0.12, '#3a2614');                       // 上枠
    this._blk(ctx, cx + w * 0.2, baseY - h * 0.55, Math.max(2, w * 0.13), Math.max(2, h * 0.08), '#e3c24a'); // ノブ
  }

  _window(ctx, cx, cy, s) {
    this._blk(ctx, cx - s / 2, cy - s / 2, s, s, '#3a2a16');                    // 枠
    this._blk(ctx, cx - s * 0.38, cy - s * 0.38, s * 0.76, s * 0.76, '#bfe9ff'); // ガラス
    this._blk(ctx, cx - s * 0.32, cy - s * 0.32, s * 0.2, s * 0.2, '#ffffff');   // 反射
    ctx.fillStyle = '#3a2a16';
    ctx.fillRect(Math.round(cx - Math.max(1, s * 0.04)), Math.round(cy - s * 0.38), Math.max(2, s * 0.08), Math.round(s * 0.76));
    ctx.fillRect(Math.round(cx - s * 0.38), Math.round(cy - Math.max(1, s * 0.04)), Math.round(s * 0.76), Math.max(2, s * 0.08));
  }

  // 煙突＋ゆらぐ煙。topY=屋根の基準（壁の上端）。
  _chimney(ctx, x, topY, u) {
    const cw = u * 0.9;
    const chTop = topY - u * 1.05;
    this._blk(ctx, x, chTop, cw, u * 3.4, '#8a5a4a');                 // 煉瓦
    this._blk(ctx, x, chTop, cw, u * 0.4, 'rgba(0,0,0,0.15)');
    this._blk(ctx, x - cw * 0.12, chTop, cw * 1.24, u * 0.4, '#6a4234'); // 笠
    ctx.fillStyle = '#ededed';
    for (let i = 0; i < 3; i++) {
      const ph = (this.t * 0.45 + i / 3) % 1;
      const sx = x + cw / 2 + Math.sin((this.t + i * 1.3) * 1.6) * cw * 0.7;
      const sy = chTop - ph * u * 3.0;
      const ss = cw * (0.45 + ph * 0.8);
      ctx.globalAlpha = (1 - ph) * 0.5;
      ctx.fillRect(Math.round(sx - ss / 2), Math.round(sy - ss / 2), Math.ceil(ss), Math.ceil(ss));
    }
    ctx.globalAlpha = 1;
  }

  // tier 0: 更地（建てる前の区画。杭と立て札だけ）。
  _tier0(ctx, cx, baseY, u) {
    this._blk(ctx, cx - u * 0.12, baseY - u * 1.7, u * 0.24, u * 1.7, '#8a5a2c'); // 杭
    this._blk(ctx, cx - u * 0.55, baseY - u * 1.7, u * 1.1, u * 0.55, '#a06a34'); // 立て札
    this._blk(ctx, cx - u * 0.55, baseY - u * 1.7, u * 1.1, 2, 'rgba(255,255,255,0.15)');
    this._blk(ctx, cx + u * 1.3, baseY - u * 0.45, u * 0.8, u * 0.45, '#7a5230');  // 土の山
  }

  // tier 1: 掘立て小屋（板壁＋片流れ屋根＋暗い入口）。
  _tier1(ctx, cx, baseY, u) {
    const ww = u * 3.0, wh = u * 1.9, left = cx - ww / 2, top = baseY - wh;
    this._blk(ctx, left, top, ww, wh, '#9a6a3c');
    this._wallShade(ctx, left, top, ww, wh);
    const steps = 3;
    for (let i = 0; i < steps; i++)
      this._blk(ctx, left - u * 0.3 + i * (ww / steps), top - u * 0.5 - i * u * 0.45, ww / steps + u * 0.4, u * 0.5, i % 2 ? '#6f4420' : '#5e3a1c');
    this._blk(ctx, cx - u * 0.5, baseY - u * 1.2, u * 1.0, u * 1.2, '#3a2614');     // 入口
  }

  // tier 2: 小さな家（壁＋三角屋根＋ドア＋窓）。
  _tier2(ctx, cx, baseY, u) {
    const ww = u * 3.4, wh = u * 2.6, left = cx - ww / 2, top = baseY - wh;
    this._blk(ctx, left, top, ww, wh, '#caa15e');
    this._wallShade(ctx, left, top, ww, wh);
    this._roof(ctx, cx, top, ww * 1.18, u, '#b14a36', '#9a3f2e');
    this._door(ctx, cx - ww * 0.18, baseY, u * 1.0, wh * 0.5);
    this._window(ctx, cx + ww * 0.24, top + wh * 0.38, u * 1.0);
  }

  // tier 3: ちゃんとした家（大きめ＋窓2つ＋煙突＋煙）。
  _tier3(ctx, cx, baseY, u) {
    const ww = u * 4.2, wh = u * 3.0, left = cx - ww / 2, top = baseY - wh;
    this._blk(ctx, left, top, ww, wh, '#d8b06a');
    this._wallShade(ctx, left, top, ww, wh);
    this._chimney(ctx, cx + ww * 0.28, top, u);
    this._roof(ctx, cx, top, ww * 1.2, u, '#b14a36', '#9a3f2e');
    this._door(ctx, cx - ww * 0.2, baseY, u * 1.1, wh * 0.48);
    this._window(ctx, cx + ww * 0.22, top + wh * 0.3, u * 1.05);
    this._window(ctx, cx + ww * 0.22, baseY - wh * 0.26, u * 1.05);
  }

  // tier 4: 大きな家・屋敷（2階建ての帯＋窓4つ＋煙突）。
  _tier4(ctx, cx, baseY, u) {
    const ww = u * 5.2, wh = u * 4.0, left = cx - ww / 2, top = baseY - wh;
    this._blk(ctx, left, top, ww, wh, '#e0c074');
    this._wallShade(ctx, left, top, ww, wh);
    this._blk(ctx, left, baseY - wh * 0.5, ww, u * 0.32, '#9a6a3c');   // 階の帯（梁）
    this._chimney(ctx, cx + ww * 0.32, top, u * 1.05);
    this._roof(ctx, cx, top, ww * 1.16, u, '#b14a36', '#9a3f2e');
    this._door(ctx, cx, baseY, u * 1.2, wh * 0.4);
    this._window(ctx, cx - ww * 0.3, top + wh * 0.17, u * 1.0);
    this._window(ctx, cx + ww * 0.3, top + wh * 0.17, u * 1.0);
    this._window(ctx, cx - ww * 0.3, baseY - wh * 0.3, u * 1.0);
    this._window(ctx, cx + ww * 0.3, baseY - wh * 0.3, u * 1.0);
  }

  // tier 5: 城（石壁＋胸壁＋両端の塔＋門＋旗）。
  _castle(ctx, cx, baseY, u) {
    const ww = u * 5.6, wh = u * 3.4, left = cx - ww / 2, top = baseY - wh;
    const stone = '#9aa0aa', stoneD = '#7d828c';
    this._blk(ctx, left, top, ww, wh, stone);
    // 石ブロックの目地
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    const rh = wh / 5;
    for (let r = 0; r <= 5; r++) ctx.fillRect(Math.round(left), Math.round(top + r * rh), Math.round(ww), 2);
    for (let r = 0; r < 5; r++) {
      const off = (r % 2) ? ww * 0.12 : 0;
      for (let x = left + off; x < left + ww; x += ww * 0.24) ctx.fillRect(Math.round(x), Math.round(top + r * rh), 2, Math.round(rh));
    }
    // 本体の胸壁（てっぺんの凸凹）
    const m = ww / 9;
    for (let i = 0; i <= 8; i += 2) this._blk(ctx, left + i * m, top - u * 0.7, m, u * 0.7, stoneD);
    // 両端の塔
    const tw = u * 1.5, th = wh + u * 1.3;
    for (const tx of [left - tw * 0.5, left + ww - tw * 0.5]) {
      this._blk(ctx, tx, baseY - th, tw, th, stone);
      this._blk(ctx, tx, baseY - th, 2, th, 'rgba(255,255,255,0.12)');
      this._blk(ctx, tx + tw - 2, baseY - th, 2, th, 'rgba(0,0,0,0.14)');
      const tm = tw / 3;
      for (let i = 0; i <= 2; i += 2) this._blk(ctx, tx + i * tm, baseY - th - u * 0.6, tm, u * 0.6, stoneD);
      this._blk(ctx, tx + tw * 0.3, baseY - th * 0.72, tw * 0.4, u * 0.85, '#2a2a30'); // 塔の窓
    }
    // 門（暗いアーチ＋落とし格子）
    const gw = ww * 0.26, gh = wh * 0.62;
    this._blk(ctx, cx - gw / 2, baseY - gh, gw, gh, '#3a3138');
    this._blk(ctx, cx - gw / 2 + 2, baseY - gh + 2, gw - 4, gh - 2, '#241f26');
    ctx.fillStyle = 'rgba(190,190,200,0.5)';
    for (let i = 1; i < 4; i++) ctx.fillRect(Math.round(cx - gw / 2 + (gw * i) / 4), Math.round(baseY - gh + 2), 2, Math.round(gh * 0.7));
    // 旗（右の塔の上ではためく）
    const ftx = left + ww - tw * 0.5 + tw / 2, fty = baseY - th - u * 0.6;
    this._blk(ctx, ftx - 1, fty - u * 1.9, 2, u * 1.9, '#5a4a3a');     // ポール
    const fw = u * 1.6, fh = u * 0.95, wave = Math.sin(this.t * 4) * fh * 0.2;
    ctx.fillStyle = '#d23b3b';
    ctx.beginPath();
    ctx.moveTo(ftx + 1, fty - u * 1.9);
    ctx.lineTo(ftx + 1 + fw, fty - u * 1.9 + fh * 0.5 + wave);
    ctx.lineTo(ftx + 1, fty - u * 1.9 + fh);
    ctx.closePath(); ctx.fill();
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
