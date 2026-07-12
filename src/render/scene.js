// scene.js — Minecraft 風の世界・採掘演出。
// ターゲットのタイル列（main が上段に描く）が「採掘するブロック」そのもの。
// このシーンは下段の地面・キャラ・パーティクル担当で、タイルには重ねない。
// main から setFocus(現在タイルの中心) を受け、そこへ向けてキャラが振り、破片を飛ばす。
//
// 長期プログレス：背景に「育つ家(村)」を描く。main から累計スコアを setTotal() で受け取り、
// milestones.houseLevelForTotal() で tier 0..N を決めて drawHouse() が段階に応じた家を描く。

import { houseLevelForTotal, HOUSE_MILESTONES } from '../engine/milestones.js';

const SKY_TOP = '#69b7ff', SKY_BOT = '#bfeaff';

// 空に流れるブロック雲の固定テーブル（決定的 — 毎フレーム乱数は使わない）。
// shape: '#' がブロック。底が平らで上に段差のあるクラスタ（Minecraft の雲の流儀）。
// fx=初期位置(周期に対する割合) / fy=高さ(H比) / spd=速度(W比/秒。雲ごとに少し違える) / sc=大きさ。
const CLOUDS = [
  { fx: 0.10, fy: 0.045, spd: 0.009, sc: 1.15, shape: [
    '    #####     ',
    '  #########   ',
    ' ############ ',
    '##############',
  ] },
  { fx: 0.52, fy: 0.150, spd: 0.014, sc: 0.85, shape: [
    '  ####  ',
    ' ###### ',
    '########',
  ] },
  { fx: 0.80, fy: 0.095, spd: 0.006, sc: 1.0, shape: [
    '  ###    ## ',
    ' ######  ###',
    '############',
  ] },
];

export class Scene {
  constructor() {
    this.w = 0; this.h = 0; this.t = 0;
    this.drawBottom = 0;       // 実画面の下端（scene ローカル座標）。土をここまで伸ばして
                               // PWA 全画面で地面の下にページ背景がのぞくのを防ぐ。0 のときは this.h を使う。
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

  // bottom = 実画面の下端（scene ローカル座標）。world 領域より下（キーボード帯）まで土を
  // 伸ばすために main から H - world.y を受け取る。省略時は h（＝従来挙動）。
  resize(w, h, bottom = h) { this.w = w; this.h = h; this.drawBottom = bottom; this.focus = { x: w * 0.5, y: h * 0.3 }; }
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

  draw(ctx, { particles = true } = {}) {
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

    // 雲（太陽の手前・丘の奥をゆっくり流れる。Minecraft では雲は太陽の手前）
    this._drawClouds(ctx);

    // 遠景の丘
    ctx.fillStyle = '#4f8f6a';
    for (let i = 0; i < 14; i++) {
      const bw = W / 11, bh = (i % 3 + 1) * H * 0.04 + H * 0.05;
      ctx.fillRect(i * bw - 10, groundY - bh, bw + 1, bh);
    }

    // 地面（草＋土）。土は world 領域の高さ(H)ではなく「実画面の下端(drawBottom)」まで伸ばす。
    // これで PWA 全画面（縦長/横長どちらでも）地面の下に空色のページ背景がのぞかない。
    const dirtTop = groundY + H * 0.05;
    const floor = Math.max(dirtTop + H, this.drawBottom) + 20;   // 実下端まで（＋わずかにオーバーシュート）
    ctx.fillStyle = '#5fa83a'; ctx.fillRect(-20, groundY, W + 40, H * 0.05);
    ctx.fillStyle = '#7a5230'; ctx.fillRect(-20, dirtTop, W + 40, floor - dirtTop);
    ctx.fillStyle = 'rgba(0,0,0,0.10)';
    for (let x = 0; x < W; x += 36) for (let y = groundY + H * 0.08; y < floor; y += 28)
      ctx.fillRect(x + ((y / 28) % 2) * 18, y, 6, 6);

    // 育つ家（村）— 丘の上の区画に、累計スコアの tier に応じた家を建てる。
    this._drawHouse(ctx, groundY);

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

    if (particles) this.drawParticles(ctx);

    if (this.diamond) this._drawDiamond(ctx, this.diamond);

    if (this.flash > 0) { ctx.fillStyle = `rgba(200,50,50,${this.flash * 0.16})`; ctx.fillRect(-20, -20, W + 40, H + 40); }
    ctx.restore();
  }

  // パーティクルだけを描く。結果画面は dim オーバーレイの下に世界（particles:false の draw）、
  // 上にこれを重ねる — お祝いの紙吹雪がオーバーレイにくすまないように。
  drawParticles(ctx) {
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
  }

  // ===== 空の雲（ブロック調・背景装飾）================================
  // CLOUDS の固定テーブルを this.t 駆動でゆっくり右へ流す。右端を出たら左から
  // 入り直す（wrap around）。控えめな半透明の白 — ターゲットタイルや家の
  // 視認性を落とさないよう、淡く・ゆっくり・少数に留める。
  _drawClouds(ctx) {
    const W = this.w, H = this.h;
    const cell = Math.max(3, Math.round(H * 0.014));            // ブロック1個（整数でくっきり・継ぎ目なし）
    for (const c of CLOUDS) {
      const s = Math.max(2, Math.round(cell * c.sc));
      const cw = c.shape[0].length * s;                          // 雲の幅
      const span = W + cw;                                       // wrap 周期（画面幅＋自分の幅）
      const x = Math.round(((c.fx * span + this.t * c.spd * W) % span) - cw);
      const y = Math.round(H * c.fy);
      const last = c.shape.length - 1;
      for (let r = 0; r <= last; r++) {
        const row = c.shape[r];
        // 底の行だけほんのり青灰に（Minecraft の雲の底の影）
        ctx.fillStyle = r === last ? 'rgba(214,235,248,0.60)' : 'rgba(255,255,255,0.65)';
        let run = -1;                                            // '#' の連続区間ごとに1矩形で描く
        for (let i = 0; i <= row.length; i++) {
          const on = i < row.length && row[i] === '#';
          if (on && run < 0) run = i;
          else if (!on && run >= 0) { ctx.fillRect(x + run * s, y + r * s, (i - run) * s, s); run = -1; }
        }
      }
    }
  }

  // ===== 育つ すまい（更地 → 集落 → 城）=============================
  // 累計スコアの tier に応じて、丘の上の区画に建物を描く。低 tier は単一の建物、
  // 中〜高 tier は横に広がる「複数の建物の集落(estate/むら)」へ、最後は天守をもつ
  // 巨大なお城へ進化する。区画は tier が上がるほど横に広がる。
  //   0 さらち / 1 たきび / 2 こや / 3 ちいさな いえ / 4 はたけつき いえ /
  //   5 いえと なや / 6 おおきな いえ / 7 やしき / 8 むら / 9 とりで /
  //   10 おしろ / 11 おおきな おしろ
  // ステージ選択カードは画面下寄り、タイトルは上端。建物は丘の帯（中ほど）に収め、
  // 集落は横（左右）へ広げてカードと衝突させない。
  _drawHouse(ctx, groundY) {
    const W = this.w, H = this.h;
    const N = HOUSE_MILESTONES.length;
    const tier = Math.max(0, Math.min(N - 1, this.houseTier | 0));
    const u = Math.max(7, H * 0.05);                       // ブロック単位
    const cx = W * 0.5;                                    // 区画の中心 x
    const baseY = H * 0.645;                               // 区画の地面ライン（丘の上）
    const span = Math.min(W * 0.92, u * (5 + tier * 1.7)); // 区画幅：tier で横に広がる（端で頭打ち）
    // 区画は本来の地面より高い「丘の帯」に置く（カード・タイトルを避けるため）。
    // そのままだと土台が宙に浮くので、地面(groundY)から区画(baseY)まで草の丘を盛って
    // つなぎ、区画が「丘の平らな頂上」に建っているように地面と馴染ませる。
    this._mound(ctx, cx, baseY, groundY ?? H * 0.74, span, u);
    this._plot(ctx, cx, baseY, span, u);
    switch (tier) {
      case 0:  this._tier0(ctx, cx, baseY, u); break;
      case 1:  this._estTent(ctx, cx, baseY, u); break;
      case 2:  this._estShack(ctx, cx, baseY, u); break;
      case 3:  this._estSmallHouse(ctx, cx, baseY, u); break;
      case 4:  this._estFarmHouse(ctx, cx, baseY, u, span); break;
      case 5:  this._estFarmstead(ctx, cx, baseY, u, span); break;
      case 6:  this._estManor(ctx, cx, baseY, u, span); break;
      case 7:  this._estEstate(ctx, cx, baseY, u, span); break;
      case 8:  this._estVillage(ctx, cx, baseY, u, span); break;
      case 9:  this._estFort(ctx, cx, baseY, u, span); break;
      case 10: this._estCastle(ctx, cx, baseY, u, span); break;
      default: this._estGrandCastle(ctx, cx, baseY, u, span); break;
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

  // 区画を地面につなぐ「草の丘（土手）」。区画の地面ライン(topY)から本来の地面(groundY)まで
  // ブロックを積み、下へ行くほど横へ広がる丘の輪郭を作る。露出した段差(棚)には草を載せて
  // 草の生えた斜面に見せる。これで区画は宙に浮かず、丘の平らな頂上に建っているように
  // 地面と馴染む。全 tier 共通（更地〜大城まで topW=span を受けて幅が追従する）。
  _mound(ctx, cx, topY, groundY, topW, u) {
    const rise = groundY - topY;
    if (rise <= u * 0.2) return;
    const rows = Math.max(5, Math.round(rise / (u * 0.34)));
    const rowH = rise / rows;
    // 下端の幅：区画より広げて「丘の裾野」を作る（端で頭打ち。広 span はほぼ全幅の大地に）。
    const bottomW = Math.min(this.w * 1.18, topW + Math.max(u * 4.5, u * 8));
    const grass = '#5fa83a', grassHi = '#74c34a', dirt = '#7a5230';
    let prevW = topW;
    for (let i = 0; i < rows; i++) {
      const f = (i + 1) / rows;                                  // 0(上)→1(下)
      const w = topW + (bottomW - topW) * Math.pow(f, 1.5);      // 下ほど広がる丘の輪郭
      const y = topY + i * rowH;
      this._blk(ctx, cx - w / 2, y, w, rowH + 1, dirt);          // 土の本体
      const ledge = (w - prevW) / 2;                             // 上の段からはみ出た棚（左右）
      if (ledge > 1.2) {
        const gh = Math.min(rowH + 1, u * 0.42);
        this._blk(ctx, cx - w / 2, y, ledge + 1, gh, grass);            // 左の棚に草
        this._blk(ctx, cx + prevW / 2, y, ledge + 1, gh, grass);       // 右の棚に草
        this._blk(ctx, cx - w / 2, y, ledge + 1, 2, grassHi);          // 草のハイライト
        this._blk(ctx, cx + prevW / 2, y, ledge + 1, 2, grassHi);
      }
      prevW = w;
    }
    // 土の斑点（本来の地面と同じテクスチャで馴染ませる）。露出した土の斜面だけに散らす。
    ctx.fillStyle = 'rgba(0,0,0,0.10)';
    for (let y = topY + rise * 0.35; y < groundY - u * 0.2; y += u * 0.66) {
      const f = (y - topY) / rise, ww = topW + (bottomW - topW) * Math.pow(f, 1.5);
      for (let x = cx - ww / 2 + u * 0.5; x < cx + ww / 2 - u * 0.4; x += u * 1.05)
        ctx.fillRect(Math.round(x + ((y / 22) % 2) * 10), Math.round(y), Math.max(2, u * 0.13), Math.max(2, u * 0.13));
    }
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

  // ----- 部品（集落を組み立てる building blocks）-----------------------

  // 1 軒の家。cx を中心に baseY へ建てる。色・屋根幅・ドア・窓・煙突を opts で。
  _house(ctx, cx, baseY, u, ww, wh, o = {}) {
    const left = cx - ww / 2, top = baseY - wh;
    this._blk(ctx, left, top, ww, wh, o.wall || '#caa15e');
    this._wallShade(ctx, left, top, ww, wh);
    if (o.band) this._blk(ctx, left, baseY - wh * 0.5, ww, u * 0.3, '#9a6a3c'); // 2階の帯（梁）
    if (o.chimney != null) this._chimney(ctx, cx + o.chimney * ww, top, u * (o.chimU || 1));
    this._roof(ctx, cx, top, ww * (o.roofW || 1.18), u, o.roofA || '#b14a36', o.roofB || '#9a3f2e');
    if (o.door !== false) this._door(ctx, cx + (o.doorDx || 0) * ww, baseY, (o.doorW || 0.9) * u, wh * (o.doorH || 0.46));
    for (const w of (o.windows || []))
      this._window(ctx, cx + w.dx * ww, top + wh * (w.wy ?? 0.4), (w.s || 0.95) * u);
  }

  // 畑（耕した土＋緑の作物の畝）。cx 中心・幅 w。
  _field(ctx, cx, baseY, u, w) {
    const left = cx - w / 2, rows = Math.max(3, Math.round(w / (u * 0.9)));
    this._blk(ctx, left, baseY - u * 0.2, w, u * 0.2, '#6a4a28');          // 耕した土
    this._blk(ctx, left, baseY - u * 0.2, w, 2, '#7a5a34');
    for (let i = 0; i < rows; i++) {
      const fx = left + (i + 0.5) * (w / rows);
      this._blk(ctx, fx - u * 0.05, baseY - u * 0.78, u * 0.1, u * 0.6, '#3f7a2a'); // 茎
      this._blk(ctx, fx - u * 0.18, baseY - u * 0.86, u * 0.36, u * 0.2, '#5fb13a'); // 葉
    }
  }

  // 井戸（石の枠＋柱＋小さな屋根）。
  _well(ctx, cx, baseY, u) {
    const w = u * 1.1;
    this._blk(ctx, cx - w / 2, baseY - u * 0.95, w, u * 0.95, '#8a8f99');  // 石の枠
    this._blk(ctx, cx - w / 2, baseY - u * 0.95, w, 2, 'rgba(255,255,255,0.15)');
    this._blk(ctx, cx - w * 0.36, baseY - u * 0.78, w * 0.72, u * 0.3, '#244a5a'); // 水
    this._blk(ctx, cx - w / 2, baseY - u * 2.2, u * 0.18, u * 1.3, '#7a5230');     // 柱
    this._blk(ctx, cx + w / 2 - u * 0.18, baseY - u * 2.2, u * 0.18, u * 1.3, '#7a5230');
    this._roof(ctx, cx, baseY - u * 2.2, w * 1.5, u * 0.7, '#8a4a36', '#7a3f2e');
  }

  // 納屋（赤い大きな建物＋観音開きの扉）。
  _barn(ctx, cx, baseY, u, ww, wh) {
    this._house(ctx, cx, baseY, u, ww, wh, { wall: '#a8463a', roofA: '#6a4234', roofB: '#5a3628', roofW: 1.12, door: false });
    const dw = ww * 0.5, dh = wh * 0.66, left = cx - dw / 2, top = baseY - dh;
    this._blk(ctx, left, top, dw, dh, '#caa15e');           // 扉
    this._blk(ctx, cx - 1, top, 2, dh, '#6a4422');          // 中央の合わせ目
    this._blk(ctx, left, top, dw, 2, '#e7d3a0');            // 白い縁取り（上）
    this._blk(ctx, left, top, 2, dh, '#e7d3a0');
    this._blk(ctx, left + dw - 2, top, 2, dh, '#e7d3a0');
  }

  // 柵（横木2本＋杭）。x0..x1 の範囲。
  _fence(ctx, x0, x1, baseY, u) {
    const w = x1 - x0;
    this._blk(ctx, x0, baseY - u * 0.58, w, u * 0.13, '#9a6a3c'); // 上の横木
    this._blk(ctx, x0, baseY - u * 0.3, w, u * 0.11, '#9a6a3c');  // 下の横木
    for (let x = x0; x <= x1 - u * 0.16; x += u * 0.85)
      this._blk(ctx, x, baseY - u * 0.72, u * 0.16, u * 0.72, '#7a5230');
  }

  // 木（幹＋四角い葉のかたまり）。
  _tree(ctx, cx, baseY, u) {
    this._blk(ctx, cx - u * 0.16, baseY - u * 1.3, u * 0.32, u * 1.3, '#6a4422'); // 幹
    this._blk(ctx, cx - u * 0.9, baseY - u * 2.7, u * 1.8, u * 1.5, '#3f8a3a');   // 葉
    this._blk(ctx, cx - u * 0.6, baseY - u * 3.1, u * 1.2, u * 0.6, '#4f9e44');
    this._blk(ctx, cx - u * 0.9, baseY - u * 2.7, u * 1.8, 2, 'rgba(255,255,255,0.10)');
  }

  // 石ブロックの目地テクスチャ（壁・塔の表面）。
  _stoneTex(ctx, x, y, w, h) {
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    const rows = Math.max(3, Math.round(h / 14)), rh = h / rows;
    for (let r = 0; r <= rows; r++) ctx.fillRect(Math.round(x), Math.round(y + r * rh), Math.round(w), 2);
    for (let r = 0; r < rows; r++) {
      const off = (r % 2) ? w * 0.12 : 0;
      for (let bx = x + off; bx < x + w; bx += w * 0.22) ctx.fillRect(Math.round(bx), Math.round(y + r * rh), 2, Math.round(rh));
    }
    this._blk(ctx, x, y, w, 2, 'rgba(255,255,255,0.10)');           // 上の光
    this._blk(ctx, x + w - 2, y, 2, h, 'rgba(0,0,0,0.13)');         // 右の影
  }

  // 旗（ポール＋なびく三角旗）。topY=ポール下端の高さ。
  _flag(ctx, x, topY, u, col, len = 1.6) {
    const ph = u * len;
    this._blk(ctx, x - 1, topY - ph, 2, ph, '#5a4a3a');            // ポール
    const fw = u * (0.55 + len * 0.5), fh = u * 0.8, wave = Math.sin(this.t * 4 + x * 0.05) * fh * 0.22;
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.moveTo(x + 1, topY - ph);
    ctx.lineTo(x + 1 + fw, topY - ph + fh * 0.5 + wave);
    ctx.lineTo(x + 1, topY - ph + fh);
    ctx.closePath(); ctx.fill();
  }

  // 塔（石の柱＋胸壁＋窓・任意で旗）。cx 中心・幅 tw・高さ th。
  _tower(ctx, cx, baseY, u, tw, th, o = {}) {
    const stone = o.stone || '#9aa0aa', stoneD = o.stoneD || '#7d828c';
    const left = cx - tw / 2, top = baseY - th;
    this._blk(ctx, left, top, tw, th, stone);
    this._stoneTex(ctx, left, top, tw, th);
    const segs = 5, m = tw / segs;                                // 胸壁
    for (let i = 0; i < segs; i += 2) this._blk(ctx, left + i * m, top - u * 0.6, m, u * 0.6, stoneD);
    this._blk(ctx, cx - tw * 0.16, baseY - th * 0.66, tw * 0.32, u * 0.85, '#2a2a30'); // 窓
    if (o.flag) this._flag(ctx, cx, top - u * 0.6, u, o.flag, o.flagLen || 1.5);
  }

  // 胸壁つきの石壁（curtain wall）。x0..x1・高さ wh。
  _wall(ctx, x0, x1, baseY, u, wh, o = {}) {
    const stone = o.stone || '#9aa0aa', stoneD = o.stoneD || '#7d828c', w = x1 - x0;
    this._blk(ctx, x0, baseY - wh, w, wh, stone);
    this._stoneTex(ctx, x0, baseY - wh, w, wh);
    const n = Math.max(4, Math.round(w / (u * 1.1))), m = w / n;  // 胸壁
    for (let i = 0; i < n; i += 2) this._blk(ctx, x0 + i * m, baseY - wh - u * 0.55, m, u * 0.55, stoneD);
  }

  // 門（暗いアーチ＋落とし格子）。cx 中心・幅 gw・高さ gh。
  _gate(ctx, cx, baseY, gw, gh) {
    this._blk(ctx, cx - gw / 2, baseY - gh, gw, gh, '#3a3138');
    this._blk(ctx, cx - gw / 2 + 2, baseY - gh + 2, gw - 4, gh - 2, '#241f26');
    ctx.fillStyle = 'rgba(190,190,200,0.5)';
    for (let i = 1; i < 4; i++) ctx.fillRect(Math.round(cx - gw / 2 + (gw * i) / 4), Math.round(baseY - gh + 2), 2, Math.round(gh * 0.7));
  }

  // ----- 各 tier の すまい -------------------------------------------

  // tier 1: たきび＋テント（最初の拠点）。
  _estTent(ctx, cx, baseY, u) {
    const tx = cx - u * 1.4;
    this._roof(ctx, tx, baseY, u * 3.0, u, '#d98a4a', '#c97a3a'); // 三角テント（地面まで）
    this._blk(ctx, tx - u * 0.45, baseY - u * 1.0, u * 0.9, u * 1.0, '#5a3a1c'); // 入口
    // たきび：薪＋ゆらぐ炎
    const fx = cx + u * 1.7, fl = 0.85 + 0.15 * Math.sin(this.t * 9);
    this._blk(ctx, fx - u * 0.7, baseY - u * 0.22, u * 1.4, u * 0.22, '#6a4422'); // 薪
    ctx.fillStyle = '#ff8a2a';
    this._blk(ctx, fx - u * 0.4, baseY - u * (0.85 * fl) - u * 0.22, u * 0.8, u * (0.85 * fl), '#ff8a2a');
    this._blk(ctx, fx - u * 0.22, baseY - u * (0.55 * fl) - u * 0.22, u * 0.44, u * (0.55 * fl), '#ffd34d');
  }

  // tier 2: 掘立て小屋（板壁＋片流れ屋根＋暗い入口）。
  _estShack(ctx, cx, baseY, u) {
    const ww = u * 3.0, wh = u * 1.9, left = cx - ww / 2, top = baseY - wh;
    this._blk(ctx, left, top, ww, wh, '#9a6a3c');
    this._wallShade(ctx, left, top, ww, wh);
    const steps = 3;
    for (let i = 0; i < steps; i++)
      this._blk(ctx, left - u * 0.3 + i * (ww / steps), top - u * 0.5 - i * u * 0.45, ww / steps + u * 0.4, u * 0.5, i % 2 ? '#6f4420' : '#5e3a1c');
    this._blk(ctx, cx - u * 0.5, baseY - u * 1.2, u * 1.0, u * 1.2, '#3a2614');     // 入口
  }

  // tier 3: 小さな家（壁＋三角屋根＋ドア＋窓）。
  _estSmallHouse(ctx, cx, baseY, u) {
    this._house(ctx, cx, baseY, u, u * 3.4, u * 2.6, {
      wall: '#caa15e', doorDx: -0.18, doorW: 1.0, doorH: 0.5,
      windows: [{ dx: 0.24, wy: 0.38, s: 1.0 }],
    });
  }

  // tier 4: はたけつき いえ（家＋畑＋木＝複数の構成物で集落が芽生える）。
  _estFarmHouse(ctx, cx, baseY, u, span) {
    const hx = cx - span * 0.18;
    this._house(ctx, hx, baseY, u, u * 3.4, u * 2.7, {
      wall: '#d8b06a', chimney: 0.28, doorDx: -0.18, doorW: 1.0, doorH: 0.48,
      windows: [{ dx: 0.24, wy: 0.34, s: 1.0 }],
    });
    this._field(ctx, cx + span * 0.26, baseY, u, span * 0.34);   // 畑
    this._tree(ctx, cx + span * 0.46, baseY, u);                 // 木
  }

  // tier 5: いえと なや（家＋納屋＋井戸＋畑＝農家。3 棟）。
  _estFarmstead(ctx, cx, baseY, u, span) {
    this._field(ctx, cx + span * 0.3, baseY, u, span * 0.3);     // 奥の畑
    this._barn(ctx, cx + span * 0.28, baseY, u, u * 3.2, u * 2.8); // 納屋
    this._well(ctx, cx, baseY, u);                               // 井戸
    this._house(ctx, cx - span * 0.3, baseY, u, u * 3.6, u * 3.0, {
      wall: '#d8b06a', chimney: 0.3, doorDx: -0.2, doorW: 1.0, doorH: 0.46,
      windows: [{ dx: 0.24, wy: 0.32, s: 1.0 }, { dx: 0.24, wy: 0.7, s: 1.0 }],
    });
  }

  // tier 6: おおきな いえ（2階建ての母屋＋庭＋木＋柵）。
  _estManor(ctx, cx, baseY, u, span) {
    this._fence(ctx, cx - span * 0.46, cx + span * 0.46, baseY, u);   // 庭の柵
    this._tree(ctx, cx - span * 0.38, baseY, u);
    this._field(ctx, cx + span * 0.3, baseY, u, span * 0.28);         // 家庭菜園
    this._house(ctx, cx - span * 0.06, baseY, u, u * 5.2, u * 4.0, {
      wall: '#e0c074', band: true, chimney: 0.32, chimU: 1.05, roofW: 1.16,
      doorDx: 0, doorW: 1.2, doorH: 0.4,
      windows: [
        { dx: -0.3, wy: 0.17, s: 1.0 }, { dx: 0.3, wy: 0.17, s: 1.0 },
        { dx: -0.3, wy: 0.55, s: 1.0 }, { dx: 0.3, wy: 0.55, s: 1.0 },
      ],
    });
  }

  // tier 7: やしき（母屋＋離れ＋納屋＋柵で囲った庭＝屋敷）。
  _estEstate(ctx, cx, baseY, u, span) {
    this._fence(ctx, cx - span * 0.48, cx + span * 0.48, baseY, u);
    this._tree(ctx, cx + span * 0.42, baseY, u);
    this._field(ctx, cx + span * 0.18, baseY, u, span * 0.24);
    this._house(ctx, cx + span * 0.36, baseY, u, u * 2.8, u * 2.2, {   // 離れ
      wall: '#caa15e', door: true, doorW: 0.8, doorH: 0.46, windows: [{ dx: 0.26, wy: 0.4, s: 0.9 }],
    });
    this._house(ctx, cx - span * 0.26, baseY, u, u * 5.6, u * 4.4, {   // 母屋（大きい）
      wall: '#e6c87e', band: true, chimney: 0.34, chimU: 1.1, roofW: 1.16,
      doorDx: 0, doorW: 1.3, doorH: 0.4,
      windows: [
        { dx: -0.3, wy: 0.16, s: 1.05 }, { dx: 0.3, wy: 0.16, s: 1.05 },
        { dx: -0.3, wy: 0.56, s: 1.05 }, { dx: 0.3, wy: 0.56, s: 1.05 },
      ],
    });
  }

  // tier 8: むら（大小いくつもの家が横に並ぶ集落＋井戸＋木）。
  _estVillage(ctx, cx, baseY, u, span) {
    const L = cx - span / 2;
    // 横に5棟、大きさ・屋根色を散らして「集落」感を出す。
    const houses = [
      { fx: 0.12, w: 3.0, h: 2.4, wall: '#caa15e', roofA: '#b14a36', win: 1 },
      { fx: 0.30, w: 3.8, h: 3.2, wall: '#d8b06a', roofA: '#7a8f4a', win: 2, chimney: 0.3 },
      { fx: 0.5,  w: 4.4, h: 3.8, wall: '#e0c074', roofA: '#b14a36', win: 2, chimney: 0.3, band: true },
      { fx: 0.70, w: 3.6, h: 3.0, wall: '#cfa760', roofA: '#4a6f8f', win: 2 },
      { fx: 0.88, w: 2.8, h: 2.2, wall: '#caa15e', roofA: '#b14a36', win: 1 },
    ];
    this._tree(ctx, L + span * 0.02, baseY, u);
    for (const hh of houses) {
      const wins = hh.win === 2
        ? [{ dx: -0.26, wy: 0.4, s: 0.9 }, { dx: 0.26, wy: 0.4, s: 0.9 }]
        : [{ dx: 0.24, wy: 0.4, s: 0.9 }];
      this._house(ctx, L + span * hh.fx, baseY, u, u * hh.w, u * hh.h, {
        wall: hh.wall, roofA: hh.roofA, roofB: '#9a3f2e', band: hh.band,
        chimney: hh.chimney ?? null, doorW: 0.9, doorH: 0.46, windows: wins,
      });
    }
    this._well(ctx, L + span * 0.6, baseY, u);          // 村の井戸
    this._tree(ctx, L + span * 0.98, baseY, u);
  }

  // tier 9: とりで（石壁で囲った砦：見張り塔＋胸壁つき石壁＋門＋中の建物＋旗）。
  _estFort(ctx, cx, baseY, u, span) {
    const L = cx - span / 2, R = cx + span / 2, wh = u * 3.2;
    // 壁の中（奥）の小屋（先に描く）
    this._house(ctx, cx - span * 0.18, baseY, u, u * 3.0, u * 2.4, { wall: '#b98f50', roofA: '#7a4a36', windows: [{ dx: 0.2, wy: 0.4, s: 0.85 }] });
    // 左右の石壁（門の左右）
    const gw = span * 0.18;
    this._wall(ctx, L + u * 1.1, cx - gw / 2, baseY, u, wh);
    this._wall(ctx, cx + gw / 2, R - u * 1.1, baseY, u, wh);
    this._gate(ctx, cx, baseY, gw, wh * 0.78);                        // 門
    // 両端の見張り塔（壁より高い）
    this._tower(ctx, L + u * 1.1, baseY, u, u * 2.0, wh + u * 1.6, { flag: '#3aa0c0', flagLen: 1.3 });
    this._tower(ctx, R - u * 1.1, baseY, u, u * 2.0, wh + u * 1.6);
  }

  // tier 10: おしろ（天守＋両端の塔＋胸壁つき石壁＋門＋旗）。
  _estCastle(ctx, cx, baseY, u, span) {
    const keepW = u * 5.2, keepH = u * 4.6, wallH = u * 3.0;
    const L = cx - span / 2, R = cx + span / 2;
    // 左右の curtain wall
    this._wall(ctx, L + u * 1.0, cx - keepW * 0.5, baseY, u, wallH);
    this._wall(ctx, cx + keepW * 0.5, R - u * 1.0, baseY, u, wallH);
    // 天守（中央・石造り）
    this._tower(ctx, cx, baseY, u, keepW, keepH);
    this._gate(ctx, cx, baseY, keepW * 0.3, keepH * 0.5);            // 天守の門
    this._blk(ctx, cx - keepW * 0.28, baseY - keepH * 0.72, keepW * 0.18, u * 0.95, '#2a2a30'); // 窓
    this._blk(ctx, cx + keepW * 0.1, baseY - keepH * 0.72, keepW * 0.18, u * 0.95, '#2a2a30');
    this._flag(ctx, cx, baseY - keepH - u * 0.6, u, '#d23b3b', 1.7);  // 天守の旗
    // 両端の塔
    this._tower(ctx, L + u * 1.0, baseY, u, u * 1.8, wallH + u * 1.4, { flag: '#d23b3b', flagLen: 1.3 });
    this._tower(ctx, R - u * 1.0, baseY, u, u * 1.8, wallH + u * 1.4, { flag: '#d23b3b', flagLen: 1.3 });
  }

  // tier 11: おおきな おしろ（巨大な城。長い石壁＋4本の塔＋高い天守＋たくさんの旗）。
  // 大きな家(tier 6)を遥かに凌ぐ：横幅・高さともに圧倒的、天守は家の倍以上の高さ。
  _estGrandCastle(ctx, cx, baseY, u, span) {
    const L = cx - span / 2, R = cx + span / 2;
    const wallH = u * 4.2, midTowerH = u * 6.4, cornerH = u * 7.2, keepW = u * 6.2, keepH = u * 8.6;
    // 1) 長い curtain wall を全幅に
    this._wall(ctx, L + u * 1.2, R - u * 1.2, baseY, u, wallH);
    // 2) 内側の中段の塔（壁より高い・天守を挟む）
    this._tower(ctx, cx - span * 0.24, baseY, u, u * 2.2, midTowerH, { flag: '#3aa0c0', flagLen: 1.1 });
    this._tower(ctx, cx + span * 0.24, baseY, u, u * 2.2, midTowerH, { flag: '#3aa0c0', flagLen: 1.1 });
    // 3) 中央の天守（巨大・高い。複数階の窓＋大きな門）
    const keepL = cx - keepW / 2, keepTop = baseY - keepH;
    this._tower(ctx, cx, baseY, u, keepW, keepH, { stone: '#a6abb5', stoneD: '#868c96' });
    // 天守の階の窓（3段×2列）
    for (let row = 0; row < 3; row++)
      for (const dx of [-0.22, 0.22])
        this._blk(ctx, cx + keepW * dx - keepW * 0.06, baseY - keepH * (0.7 - row * 0.22), keepW * 0.12, u * 0.95, '#23232a');
    this._gate(ctx, cx, baseY, keepW * 0.26, keepH * 0.34);          // 大きな門
    // 天守の上にひときわ高い旗
    this._flag(ctx, cx, keepTop - u * 0.6, u, '#ffd34d', 1.6);
    this._flag(ctx, cx - keepW * 0.34, keepTop - u * 0.6, u, '#d23b3b', 1.0);
    this._flag(ctx, cx + keepW * 0.34, keepTop - u * 0.6, u, '#d23b3b', 1.0);
    // 4) 四隅の塔（最も高い・旗つき）
    this._tower(ctx, L + u * 1.2, baseY, u, u * 2.4, cornerH, { stone: '#a6abb5', stoneD: '#868c96', flag: '#d23b3b', flagLen: 1.2 });
    this._tower(ctx, R - u * 1.2, baseY, u, u * 2.4, cornerH, { stone: '#a6abb5', stoneD: '#868c96', flag: '#d23b3b', flagLen: 1.2 });
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

  // 掘り出されたダイヤ：ボクセル(立方体積み)の宝石本体 + ブロックのきらめき。
  // ゲーム全体のブロック調に合わせ、なめらかなカット宝石ではなく四角いブロックの集まりで描く。
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

    // 宝石のシルエット（'#'=ブロックあり）。上は平らなテーブル面、中ほどが最も広く、下はとがった底。
    const GRID = [
      '  #####  ',
      ' ####### ',
      '#########',
      '#########',
      ' ####### ',
      ' ####### ',
      '  #####  ',
      '   ###   ',
      '    #    ',
    ];
    const GW = 9, GH = GRID.length, mid = 4;                  // 列中心
    const cell = R * 0.27;                                    // ブロック1個の大きさ（チャンキー）
    const ox = -(GW * cell) / 2, oy = -(GH * cell) / 2;       // 原点（d.x,d.y を中心に）
    const at = (gx, gy) => (gy >= 0 && gy < GH && gx >= 0 && gx < GW && GRID[gy][gx] === '#');
    const edge = Math.max(2, cell * 0.24);                    // ブロック上面/側面シェードの厚み

    // 面シェード：上段=テーブル面(明)、それ以外は左=影 / 右=光 / 中央の稜線=中間。Minecraft 風。
    const C_TABLE_HI = '#e8feff', C_TABLE = '#bff4ff';
    const C_LEFT = '#2f9fc2', C_MID = '#5fd6e6', C_RIGHT = '#54d6e8';
    ctx.globalAlpha = fade;
    for (let gy = 0; gy < GH; gy++) {
      for (let gx = 0; gx < GW; gx++) {
        if (!at(gx, gy)) continue;
        const x = ox + gx * cell, y = oy + gy * cell;
        let col;
        if (gy <= 1) col = gy === 0 ? C_TABLE_HI : C_TABLE;  // テーブル面（最も明るい）
        else if (gx < mid) col = C_LEFT;                     // 左面（影）
        else if (gx > mid) col = C_RIGHT;                    // 右面（光）
        else col = C_MID;                                    // 中央の稜線
        this._blk(ctx, x, y, cell + 1, cell + 1, col);       // +1 で継ぎ目をなくす
        // 立方体シェード：上が空ならブロック上面の光、右/下が空なら影。家・壁と同じ流儀。
        if (!at(gx, gy - 1)) this._blk(ctx, x, y, cell + 1, edge, 'rgba(255,255,255,0.22)');
        if (!at(gx + 1, gy)) this._blk(ctx, x + cell - edge, y, edge, cell + 1, 'rgba(0,0,0,0.18)');
        if (!at(gx, gy + 1)) this._blk(ctx, x, y + cell - edge, cell + 1, edge, 'rgba(0,0,0,0.16)');
      }
    }

    // テーブル面で瞬く白いブロックの輝き（specular）。なめらかな放射光は使わない。
    const glint = 0.5 + 0.5 * Math.sin(t * 7);
    ctx.globalAlpha = fade * (0.35 + 0.5 * glint);
    this._blk(ctx, ox + 2 * cell, oy + 1 * cell, cell + 1, cell + 1, '#ffffff');

    // 角でまたたくブロックのスター（十字のピクセル・きらめき）。
    const sparks = [
      { sx: 4.5, sy: -1.0, ph: 0 },        // 上
      { sx: 9.0, sy: 1.6,  ph: 2.1 },      // 右
      { sx: 0.0, sy: 5.2,  ph: 4.0 },      // 左下
    ];
    for (const s of sparks) {
      const tw = 0.5 + 0.5 * Math.sin(t * 10 + s.ph);
      ctx.globalAlpha = fade * tw;
      ctx.fillStyle = tw > 0.6 ? '#ffffff' : '#bff6ff';
      const px = ox + s.sx * cell, py = oy + s.sy * cell;
      const ss = cell * (0.55 + tw * 0.85), arm = Math.max(2, ss * 0.3);
      ctx.fillRect(Math.round(px - ss / 2), Math.round(py - arm / 2), Math.round(ss), Math.round(arm)); // 横
      ctx.fillRect(Math.round(px - arm / 2), Math.round(py - ss / 2), Math.round(arm), Math.round(ss)); // 縦
    }

    ctx.restore();
  }
}
