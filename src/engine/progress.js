// progress.js — 習熟モデルと段階進行（「confident になったら次へ」の中枢）。
//
// 段階(Stage):
//   1 KEY      … 単キーを正しく叩く（画面のキー位置を見て）
//   2 KANA     … かな1文字 → ローマ字（対応の習得）
//   3 WORD     … 単語（ひらがな/カタカナ）
//   4 SENTENCE … 短い文章
//   5 LONG     … 長文（ぶんしょうの上・10かな以上の長い文）
//
// 習熟(mastery)の考え方:
//   各「項目(item)」ごとに直近の結果リング(correct/time)を持ち、
//   直近 WINDOW 回の正答率と速度がしきい値を超えたら mastered。
//   ある段階の項目を順に「解禁(introduce)」し、十分 master したら次段階を解禁。
//
// 永続化: localStorage（ブラウザ）。Node テスト時は in-memory に fallback。

export const Stage = { KEY: 1, KANA: 2, WORD: 3, SENTENCE: 4, LONG: 5 };

const WINDOW = 6;        // 直近何回を見るか
const NEED_CORRECT = 5;  // そのうち何回正解で master 候補
const STUCK_SEEN = 8;    // これ以上出題しても未習得なら「行き詰まり」とみなす
// 段階ごとの「1項目あたり許容時間(ms)」。record() で時間は「1かなあたり」に正規化済み
// なので、単語/文(3/4)を単キー(2)より厳しくしてはいけない（語境界の思考分むしろ緩め）。
const SPEED_MS = { 1: 1500, 2: 2600, 3: 2400, 4: 2200, 5: 2200 };

const MEM = {}; // Node 用 in-memory store

function store() {
  if (typeof localStorage !== 'undefined') return localStorage;
  return {
    getItem: (k) => (k in MEM ? MEM[k] : null),
    setItem: (k, v) => { MEM[k] = String(v); },
    removeItem: (k) => { delete MEM[k]; },
  };
}

function median(arr) {
  if (!arr.length) return Infinity;
  const a = [...arr].sort((x, y) => x - y);
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

export class Progress {
  constructor(profileName = 'default') {
    this.key = `kidtype:progress:${profileName}`;
    this.data = this._load();
  }

  _blank() {
    return {
      stage: Stage.KEY,        // 現在プレイ中の段階
      unlocked: Stage.KEY,     // 解禁済みの最高段階
      items: {},               // id -> { res:[bool], time:[ms], seen, mastered }
      introduced: { 1: [], 2: [], 3: [], 4: [], 5: [] }, // 各段階で解禁済みの item id
      totals: { attempts: 0, correct: 0, keys: 0, keyErrors: 0 },
    };
  }

  _load() {
    try {
      const raw = store().getItem(this.key);
      if (raw) return this._normalize(JSON.parse(raw));
    } catch (_) { /* ignore */ }
    return this._blank();
  }

  // 旧/壊れた保存データでも落ちないよう形を正規化（introduced の全段階キー・items 等）。
  _normalize(d) {
    const out = this._blank();
    if (!d || typeof d !== 'object') return out;
    if (typeof d.stage === 'number') out.stage = d.stage;
    if (typeof d.unlocked === 'number') out.unlocked = d.unlocked;
    if (d.items && typeof d.items === 'object') out.items = d.items;
    if (d.introduced && typeof d.introduced === 'object') {
      for (const k of [1, 2, 3, 4, 5]) if (Array.isArray(d.introduced[k])) out.introduced[k] = d.introduced[k];
    }
    if (d.totals && typeof d.totals === 'object') out.totals = { ...out.totals, ...d.totals };
    return out;
  }

  save() {
    try { store().setItem(this.key, JSON.stringify(this.data)); } catch (_) { /* ignore */ }
  }

  reset() { this.data = this._blank(); this.save(); }

  // --- 項目の解禁 ---
  // 段階の「順序付きプール」から、まだ解禁していない先頭を1つ解禁する。
  introduce(stage, pool) {
    const intro = this.data.introduced[stage];
    for (const id of pool) {
      if (!intro.includes(id)) { intro.push(id); this.save(); return id; }
    }
    return null; // 全部解禁済み
  }

  // 解禁済みのうち「ブロッキング(未習得かつ行き詰まりでない)」が一定数以下なら次を解禁。
  // 行き詰まり項目はカウントしない＝苦手があっても新しい練習が止まらない。
  shouldIntroduceMore(stage) {
    const intro = this.data.introduced[stage];
    if (intro.length === 0) return true;
    const blocking = intro.filter((id) => {
      const it = this._item(id);
      return !it.mastered && it.seen < STUCK_SEEN;
    }).length;
    return blocking <= 2;
  }

  _item(id) {
    let it = this.data.items[id];
    if (!it || !Array.isArray(it.res)) { it = { res: [], time: [], seen: 0, mastered: false }; this.data.items[id] = it; }
    if (!Array.isArray(it.time)) it.time = [];
    return it;
  }

  // 段階を進めてよい「十分できる」判定。正確さ重視・速度は問わない。
  // mastered(速い＋正確) とは別物。遅くても正確な子を段階に閉じ込めないため。
  _competent(id) {
    const it = this._item(id);
    const recentCorrect = it.res.filter(Boolean).length;
    return it.res.length >= WINDOW && recentCorrect >= NEED_CORRECT;
  }

  // --- 1 試行を記録 ---
  // stage: Stage, id: 項目id, correct: 完答できたか, timeMs: 所要, kanaLen: 文字数(速度正規化)
  record(stage, id, correct, timeMs, kanaLen = 1) {
    const it = this._item(id);
    it.seen++;
    it.res.push(!!correct);
    it.time.push(timeMs / Math.max(1, kanaLen)); // 1かなあたりに正規化
    if (it.res.length > WINDOW) it.res.shift();
    if (it.time.length > WINDOW) it.time.shift();

    this.data.totals.attempts++;
    if (correct) this.data.totals.correct++;

    // mastery 判定
    const recentCorrect = it.res.filter(Boolean).length;
    const fastEnough = median(it.time) <= (SPEED_MS[stage] || 2000);
    it.mastered = it.res.length >= WINDOW && recentCorrect >= NEED_CORRECT && fastEnough;

    this.save();
    return it.mastered;
  }

  // 個々のキー打鍵の集計（Stage1 の精度演出やヒート用）
  recordKey(correct) {
    this.data.totals.keys++;
    if (!correct) this.data.totals.keyErrors++;
  }

  // --- 段階クリア判定 ---
  // pool(その段階の中核項目id列)が十分 master されたら次段階を解禁。
  // 「順々に次の段階へ」= confident の集積。
  stageCleared(stage, pool, ratio = 0.85) {
    const good = pool.filter((id) => this._competent(id)).length;
    return pool.length > 0 && good / pool.length >= ratio;
  }

  unlockNext(stage) {
    if (stage >= Stage.LONG) return false;
    if (this.data.unlocked < stage + 1) {
      this.data.unlocked = stage + 1;
      this.save();
      return true; // 今まさに解禁された
    }
    return false;
  }

  setStage(stage) { this.data.stage = stage; this.save(); }

  // --- 次に出題する項目を選ぶ（適応的: 新規/苦手を厚く、復習を混ぜる）---
  // 戻り値は解禁済み item id。引数 rng は 0..1 を返す関数（テスト時に固定可能）。
  // avoid: 直前に出した id（同じキー/項目の連続を避ける。候補が1つしか無い時のみ許す）。
  pick(stage, rng = Math.random, avoid = null) {
    const all = this.data.introduced[stage];
    if (all.length === 0) return null;
    const intro = (avoid != null && all.length > 1) ? all.filter((id) => id !== avoid) : all;
    const weights = intro.map((id) => {
      const it = this._item(id);
      if (it.seen === 0) return 6;           // 新規は最優先
      if (!it.mastered) return 3;            // 苦手は厚め
      return 1;                              // 既習はたまに復習
    });
    const sum = weights.reduce((a, b) => a + b, 0);
    let r = rng() * sum;
    for (let i = 0; i < intro.length; i++) {
      r -= weights[i];
      if (r <= 0) return intro[i];
    }
    return intro[intro.length - 1];
  }

  // 表示用ヒントの濃さ 0..1（その項目に慣れるほど薄くする）。
  hintLevel(id) {
    const it = this._item(id);
    if (it.seen === 0) return 1;
    if (it.mastered) return 0;
    const recentCorrect = it.res.filter(Boolean).length;
    return Math.max(0, 1 - recentCorrect / WINDOW);
  }

  accuracy() {
    const t = this.data.totals;
    return t.attempts ? t.correct / t.attempts : 1;
  }
}
