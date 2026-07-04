// run.mjs — エンジンのテスト（node test/run.mjs）。依存なし・自前ランナー。
import { toChunks, canonicalRomaji, kanaToRomaji } from '../src/engine/romaji.js';
import { Matcher, matcherFor } from '../src/engine/matcher.js';
import { Progress, Stage } from '../src/engine/progress.js';
import { kataToHira } from '../src/engine/kana.js';
import { WORDS, SENTENCES, LONG_SENTENCES, POOLS, lvOfId } from '../src/engine/content.js';
import { pickRoundIds } from '../src/engine/round.js';

let pass = 0, fail = 0;
const fails = [];
function ok(cond, msg) { if (cond) pass++; else { fail++; fails.push(msg); } }
function eq(a, b, msg) { ok(a === b, `${msg} :: got ${JSON.stringify(a)} want ${JSON.stringify(b)}`); }

// 文字列 seq を 1 文字ずつ打って完答できるか。誤キーは {miss} に数える。
function typeAll(target, seq) {
  const m = matcherFor(target);
  let miss = 0;
  for (const ch of seq) { const r = m.press(ch); if (!r.ok) miss++; }
  return { done: m.isDone(), miss, m };
}
// target を「正解列で打って完答 & ミス0」を期待
function accepts(target, seq) {
  const { done, miss } = typeAll(target, seq);
  ok(done && miss === 0, `accepts(${target} <- "${seq}") done=${done} miss=${miss}`);
}
// 完答はするが、その経路では成立しない（途中で詰まる）ことを期待
function rejects(target, seq) {
  const { done } = typeAll(target, seq);
  ok(!done, `rejects(${target} <- "${seq}") but it completed`);
}

// ================= コーパス(content.js) 全エントリの打鍵可能性監査 =================
// WORDS/SENTENCES の全エントリが romaji エンジンで最後まで打てることを保証する。
// auto(空白) 以外のチャンクの options が全て ASCII でなければ、未対応かなが
// literal として素通り＝打てない → FAIL（該当エントリ名と該当かなを表示）。
{
  const ASCII = /^[\x20-\x7e]+$/;
  const typeable = (label, str) => {
    for (const c of toChunks(str)) {
      if (c.auto) continue; // 空白チャンクは打鍵不要なので除外
      ok(c.options.every((o) => ASCII.test(o)),
        `typeable: ${label} 「${c.kana}」 in "${str}" opts=${JSON.stringify(c.options)}`);
    }
  };
  for (const w of WORDS) {
    ok(typeof w.e === 'string' && w.e.length > 0, `WORD "${w.kana}" has emoji`);
    ok(Number.isInteger(w.lv) && w.lv >= 1 && w.lv <= 4, `WORD "${w.kana}" lv in 1..4 (got ${w.lv})`);
    typeable(`WORD "${w.kana}"`, w.kana);
  }
  const klen = (str) => [...str].length; // 表示かな数（長さの分割しきい値に使う）
  const LONG_MIN = 10;                    // 「ながいぶん」の下限（10かな以上を長文とみなす）
  for (const s of SENTENCES) {
    ok(Number.isInteger(s.lv) && s.lv >= 1 && s.lv <= 4, `SENTENCE "${s.text}" lv in 1..4 (got ${s.lv})`);
    // 分割の不変条件: ぶんしょう(4) には「らくに読める中くらいの長さ」だけ残す（10かな未満）。
    ok(klen(s.text) < LONG_MIN, `SENTENCE "${s.text}" stays mid-length (< ${LONG_MIN} kana, got ${klen(s.text)})`);
    typeable(`SENTENCE`, s.text);
  }
  // Stage5 長文コーパス: 全エントリが打鍵可能・lv 1..4・かつ genuinely long（10かな以上）。
  for (const s of LONG_SENTENCES) {
    ok(Number.isInteger(s.lv) && s.lv >= 1 && s.lv <= 4, `LONG "${s.text}" lv in 1..4 (got ${s.lv})`);
    ok(klen(s.text) >= LONG_MIN, `LONG "${s.text}" is genuinely long (>= ${LONG_MIN} kana, got ${klen(s.text)})`);
    typeable(`LONG`, s.text);
  }
  // 長文ステージは round 不変条件（各 lv tier 到達・毎ラウンド lv1 を含む）のため全 tier を持つ。
  for (const lv of [1, 2, 3, 4]) ok(LONG_SENTENCES.some((s) => s.lv === lv), `LONG has at least one lv${lv} entry`);
  // 重複検出（WORDS.kana / SENTENCES.text / LONG_SENTENCES.text とも一意・かつステージ間で重複なし）
  const wset = new Set(WORDS.map((w) => w.kana));
  eq(wset.size, WORDS.length, 'WORDS kana are all unique (no duplicates)');
  const sset = new Set(SENTENCES.map((s) => s.text));
  eq(sset.size, SENTENCES.length, 'SENTENCES text are all unique (no duplicates)');
  const lset = new Set(LONG_SENTENCES.map((s) => s.text));
  eq(lset.size, LONG_SENTENCES.length, 'LONG_SENTENCES text are all unique (no duplicates)');
  ok(![...lset].some((t) => sset.has(t)), 'LONG_SENTENCES do not overlap SENTENCES (each problem lives in one stage)');
}

// ============ ラウンド出題サンプラ（round.js pickRoundIds）の検証 ============
// buildRound が「プール前方 N*2 件」だけ抽選していた回帰の防止。
//   1) 到達性: seed 付き多数ドローで、各ステージのプール全 id が最低 1 回出る
//      （特に stage3 の w0..w165 / stage4 の s0..s53 = 拡充した新語が出ること）。
//   2) 各ラウンドは count 件すべて distinct で、プールの正規メンバーであること。
//   3) 難易度: lv 付き stage3/4 は 1 ラウンドが全 lv4 にならず、易しい lv1 を必ず含む。
{
  const ROUND_COUNT = { 1: 16, 2: 14, 3: 8, 4: 5, 5: 4 };
  // 決定的な seed 付き rng（LCG）。テスト再現性のため Math.random は使わない。
  const makeRng = (seed) => { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; };

  for (const stage of [1, 2, 3, 4, 5]) {
    const pool = POOLS[stage];
    const count = ROUND_COUNT[stage];
    const lvOf = (stage === 3 || stage === 4 || stage === 5) ? lvOfId : null;
    const poolSet = new Set(pool);
    const rng = makeRng(0x9e37 + stage);
    const seen = new Set();
    const rounds = 4000;
    let distinctOk = true, memberOk = true;
    let allLv4 = 0, missingLv1 = 0;

    for (let k = 0; k < rounds; k++) {
      const ids = pickRoundIds(stage, { pool, lvOf, count, rng });
      // distinct & count
      if (ids.length !== count || new Set(ids).size !== count) distinctOk = false;
      // 全 id がプール所属
      for (const id of ids) { if (!poolSet.has(id)) memberOk = false; seen.add(id); }
      // 難易度スプレッド（lv 付きのみ）
      if (lvOf) {
        const lvs = ids.map(lvOf);
        if (lvs.every((lv) => lv === 4)) allLv4++;        // 全 lv4 = 鬼畜（あってはならない）
        if (!lvs.some((lv) => lv === 1)) missingLv1++;    // やさしい lv1 が無いラウンド
      }
    }

    ok(distinctOk, `pickRoundIds stage${stage}: every round has ${count} distinct ids`);
    ok(memberOk, `pickRoundIds stage${stage}: all picked ids belong to the pool`);
    // 到達性: プール全 id が出る（前方スライス回帰なら新語が漏れて FAIL）。
    eq(seen.size, poolSet.size,
      `pickRoundIds stage${stage}: REACHABILITY — all ${poolSet.size} pool ids appear over ${rounds} draws`);
    if (lvOf) {
      eq(allLv4, 0, `pickRoundIds stage${stage}: no round is entirely lv4 (difficulty spread)`);
      eq(missingLv1, 0, `pickRoundIds stage${stage}: every round includes at least one easy lv1 item`);
    }
  }

  // 旧バグの明示的回帰: 拡充で増えた末尾 id（w165 / 各プールの末尾）が必ず到達できること。
  // corpus2 で拡充し WORDS=166(w0..w165) / SENTENCES=54(s0..s53) / LONG=32(l0..l31)。末尾 id は動的に取る。
  {
    const rng = makeRng(424242);
    const seenW = new Set(), seenS = new Set(), seenL = new Set();
    const lastS = POOLS[4][POOLS[4].length - 1];   // 's35'
    const lastL = POOLS[5][POOLS[5].length - 1];   // 'l19'
    for (let k = 0; k < 4000; k++) {
      for (const id of pickRoundIds(3, { pool: POOLS[3], lvOf: lvOfId, count: 8, rng })) seenW.add(id);
      for (const id of pickRoundIds(4, { pool: POOLS[4], lvOf: lvOfId, count: 5, rng })) seenS.add(id);
      for (const id of pickRoundIds(5, { pool: POOLS[5], lvOf: lvOfId, count: 4, rng })) seenL.add(id);
    }
    ok(seenW.has('w109') && seenW.has('w74') && seenW.has('w50'),
      'pickRoundIds: newly-added WORD ids (w50/w74/w109) are reachable');
    ok(seenS.has(lastS) && seenS.has('s20') && seenS.has('s10'),
      `pickRoundIds: last/mid SENTENCE ids (s10/s20/${lastS}) are reachable`);
    ok(seenL.has(lastL) && seenL.has('l0') && seenL.has('l10'),
      `pickRoundIds: LONG stage ids (l0/l10/${lastL}) are reachable`);
  }
}

// ---- kana.js ----
eq(kataToHira('ブロック'), 'ぶろっく', 'kata→hira block');
eq(kataToHira('ダイヤ'), 'だいや', 'kata→hira diamond');
eq(kataToHira('クリーパー'), 'くりーぱー', 'kata→hira creeper keeps ー');

// ---- 基本かな ----
eq(kanaToRomaji('あ'), 'a', 'あ');
eq(kanaToRomaji('き'), 'ki', 'き');
eq(kanaToRomaji('し'), 'shi', 'し canonical shi');
eq(kanaToRomaji('ち'), 'chi', 'ち canonical chi');
eq(kanaToRomaji('つ'), 'tsu', 'つ canonical tsu');
eq(kanaToRomaji('ふ'), 'fu', 'ふ canonical fu');
eq(kanaToRomaji('じ'), 'ji', 'じ canonical ji');
eq(kanaToRomaji('ん'), 'nn', 'ん canonical nn');

// 別形許容
accepts('し', 'shi'); accepts('し', 'si');
accepts('ち', 'chi'); accepts('ち', 'ti');
accepts('つ', 'tsu'); accepts('つ', 'tu');
accepts('ふ', 'fu'); accepts('ふ', 'hu');
accepts('じ', 'ji'); accepts('じ', 'zi');
rejects('し', 'su'); // 違うかな

// ---- 拗音 ----
eq(kanaToRomaji('きょ'), 'kyo', 'きょ');
accepts('きょう', 'kyou');
accepts('しゃ', 'sha'); accepts('しゃ', 'sya');
accepts('ちゃ', 'cha'); accepts('ちゃ', 'tya');
accepts('じゃ', 'ja'); accepts('じゃ', 'jya'); accepts('じゃ', 'zya');

// ---- 促音 ----
accepts('がっこう', 'gakkou');
accepts('きって', 'kitte');
accepts('ブロック', 'burokku');
accepts('トロッコ', 'torokko');
accepts('まっちゃ', 'maccha');   // ちゃ=cha を重ねて ccha
accepts('まっちゃ', 'mattya');   // ちゃ=tya を重ねて ttya
rejects('がっこう', 'gakou');    // 促音抜けは不可

// ---- ん の n/nn 規則 ----
accepts('こんにちは', 'konnnichiha'); // ん+に は nn 強制
rejects('こんにちは', 'konichiha');   // n 1個では に と合体してしまう→不可
accepts('かんけい', 'kankei');        // ん+け は n でOK
accepts('かんけい', 'kannkei');       // nn でもOK
accepts('ほん', 'honn');              // 語末は nn 強制
rejects('ほん', 'hon');               // 語末 n 単独は不可
accepts('しんや', 'shinnya');         // ん+や は nn 強制
rejects('しんや', 'shinya');          // n だと に＋ゃ と紛れる→不可
accepts('ぱん', 'pann');

// ---- 長音 ----
accepts('クリーパー', 'kuri-pa-');    // ー = '-'
accepts('クリーパー', 'kuriipaa');    // ー = 直前母音の連打も許容
accepts('クリーパー', 'kuri-paa');    // 混在も可

// ---- 単語/カタカナ ----
accepts('ダイヤ', 'daiya');
accepts('ゾンビ', 'zonbi');           // ん+び は n 可
accepts('ゾンビ', 'zonnbi');
accepts('エメラルド', 'emerarudo');
accepts('チェスト', 'chesuto');

// ---- 文章（スペース自動スキップ）----
accepts('いしを とる', 'ishiwotoru');     // スペースを打たなくてもOK
accepts('いしを とる', 'ishiwo toru');    // スペースを打ってもOK
accepts('ブロックを ほる', 'burokkuwohoru');

// ---- Stage1 単キー ----
{
  const m = matcherFor('a');
  eq(m.canonicalNext(), 'a', 'single key next=a');
  const r = m.press('a'); ok(r.ok && r.done, 'single key press a done');
}
{
  const m = matcherFor('k');
  const bad = m.press('j'); ok(!bad.ok && m.errors === 1, 'wrong single key counts error');
  const good = m.press('k'); ok(good.ok && good.done, 'right single key done');
}

// ---- canonicalNext / expectedChars ----
{
  const m = matcherFor('し');
  eq(m.canonicalNext(), 's', 'し next = s');
  ok(m.expectedChars().includes('s'), 'し expected includes s');
  m.press('s');
  // s の後、shi なら h、si なら i の両方が候補
  const ex = m.expectedChars();
  ok(ex.includes('h') && ex.includes('i'), `after s expected has h & i (got ${ex})`);
}

// ---- ミス打鍵は状態を進めない ----
{
  const m = matcherFor('ねこ');
  m.press('n'); m.press('e');     // ね 完了
  const wrong = m.press('x');     // こ の途中で誤キー
  ok(!wrong.ok, 'wrong key not ok');
  eq(m.currentChunkIndex(), 1, 'still on chunk 1 (こ) after miss');
  const good = m.press('k'); ok(good.ok, 'recover after miss');
  m.press('o'); ok(m.isDone(), 'ねこ done');
}

// ---- progress.js: confident → 段階解禁 ----
{
  const p = new Progress('test-' + pass); // ユニークキー
  p.reset();
  // Stage2 のかなを3つ解禁
  const a = p.introduce(2, ['あ', 'い', 'う']);
  eq(a, 'あ', 'introduce first = あ');
  // あ を WINDOW 回、速く正解 → mastered
  let mastered = false;
  for (let i = 0; i < 6; i++) mastered = p.record(Stage.KANA, 'あ', true, 800, 1);
  ok(mastered, 'あ mastered after 6 fast correct');
  ok(!p._item('い').mastered, 'い not yet mastered');
  // 遅いと master しない
  for (let i = 0; i < 6; i++) p.record(Stage.KANA, 'い', true, 9000, 1);
  ok(!p._item('い').mastered, 'too slow → not mastered');
  // 苦手が2つ以下になったら次を投入してよい
  for (let i = 0; i < 6; i++) p.record(Stage.KANA, 'い', true, 800, 1);
  ok(p._item('い').mastered, 'い mastered after fast');
}
{
  const p = new Progress('test-stage-' + pass);
  p.reset();
  const pool = ['あ', 'い'];
  p.introduce(2, pool); p.introduce(2, pool);
  for (const id of pool) for (let i = 0; i < 6; i++) p.record(Stage.KANA, id, true, 700, 1);
  ok(p.stageCleared(2, pool), 'stage2 cleared when pool mastered');
  ok(p.unlockNext(2), 'unlockNext returns true first time');
  ok(!p.unlockNext(2), 'unlockNext idempotent');
  eq(p.data.unlocked, Stage.WORD, 'unlocked advanced to WORD');
}
// 長文(LONG=5)が新しい最上段: ぶんしょう(4)クリアで LONG を解禁し、LONG より上は無い。
{
  const p = new Progress('test-longstage-' + pass);
  p.reset();
  ok(p.unlockNext(Stage.SENTENCE), 'clearing ぶんしょう unlocks LONG (stage 5)');
  eq(p.data.unlocked, Stage.LONG, 'unlocked advanced to LONG');
  ok(!p.unlockNext(Stage.LONG), 'LONG is terminal: no stage above it');
}
// pick: 新規を優先（固定rng）
{
  const p = new Progress('test-pick-' + pass);
  p.reset();
  const pp = ['あ', 'い', 'う'];
  p.introduce(2, pp); p.introduce(2, pp); p.introduce(2, pp); // 3つとも解禁
  // あ を master 済みに、い/う は新規 → rng=0.99 でも新規寄りに重みづけ
  for (let i = 0; i < 6; i++) p.record(Stage.KANA, 'あ', true, 700, 1);
  const picks = new Set();
  for (let i = 0; i < 20; i++) picks.add(p.pick(2, () => (i % 17) / 17));
  ok(picks.has('い') || picks.has('う'), 'pick surfaces new items');
}

// ================= 監査(workflow)で見つかった不具合の回帰テスト =================

// [HIGH] 速度ゲート反転の修正: ~1600ms/かな の子が単語(stage3)を master できる
{
  const p = new Progress('test-speedgate-' + pass);
  p.reset();
  let mastered = false;
  for (let i = 0; i < 6; i++) mastered = p.record(Stage.WORD, 'w0', true, 1600 * 3, 3); // 1600ms/かな
  ok(mastered, 'stage3 word masterable at 1600ms/kana (speed gate not inverted)');
}
// 段階解禁は正確さベース（遅くても正確なら閉じ込めない）
{
  const p = new Progress('test-competent-' + pass);
  p.reset();
  for (let i = 0; i < 6; i++) p.record(Stage.WORD, 'w0', true, 9000 * 3, 3); // 遅いが正確
  ok(!p._item('w0').mastered, 'slow → not mastered (mastery needs speed)');
  ok(p.stageCleared(3, ['w0']), 'slow-but-accurate still clears stage (no dead-end)');
}

// [MEDIUM] 行き詰まり項目は新規投入をブロックしない
{
  const p = new Progress('test-stuck-' + pass);
  p.reset();
  const pool = ['あ', 'い', 'う'];
  for (let k = 0; k < 3; k++) p.introduce(2, pool);
  // 全部 seen を少しだけ(未習得) → ブロッキング → 投入しない
  for (const id of pool) for (let i = 0; i < 2; i++) p.record(Stage.KANA, id, false, 5000, 1);
  ok(!p.shouldIntroduceMore(2), 'unmastered & not-stuck blocks new intro');
  // さらに出題して行き詰まり(seen>=8) → ブロッキングから外れ、投入OK
  for (const id of pool) for (let i = 0; i < 8; i++) p.record(Stage.KANA, id, false, 5000, 1);
  ok(p.shouldIntroduceMore(2), 'stuck items no longer block (escape from 3-item lock)');
}

// [LOW] ん + 表示スペース越しの母音: 単独 n は不可、nn を要求
accepts('ほん あ', 'honna');   // ん=nn を強制
rejects('ほん あ', 'hona');    // 単独 n は あ と紛れるので不可
accepts('ぱん や', 'pannya');  // 次が や行でも nn 強制
rejects('ぱん や', 'panya');

// [LOW] 壊れた/旧保存データでも落ちない
{
  const prof = 'test-corrupt-' + pass;
  const p1 = new Progress(prof);
  // 旧式: introduced に一部キーしか無い・item が空オブジェクト
  p1.data = { stage: 3, unlocked: 3, items: { w0: {} }, introduced: { 2: ['あ'] } };
  p1.save();
  let threw = false;
  try {
    const p2 = new Progress(prof);
    ok(Array.isArray(p2.data.introduced[1]) && Array.isArray(p2.data.introduced[4]), 'introduced normalized to all stages');
    p2.introduce(3, ['w1']); p2.pick(3, () => 0.5); p2.record(3, 'w0', true, 1000, 1); // 壊れた item でも動く
  } catch (_) { threw = true; }
  ok(!threw, 'corrupt/old save data does not crash');
}

// 表示メタ(text/ci0/ci1): カタカナ原文を保持、全文字を被覆
{
  for (const t of ['ブロック', 'がっこう', 'クリーパー', 'いしを とる', 'まっちゃ']) {
    const cs = toChunks(t);
    eq(cs.map((c) => c.text).join(''), t, `chunk.text reconstructs "${t}"`);
  }
  const block = toChunks('ブロック');
  eq(block[0].text, 'ブ', 'first tile keeps original katakana ブ');
}

// 直前と同じ項目を避ける（同じキー連続の防止）
{
  const p = new Progress('test-avoid-' + pass);
  p.reset();
  const pp = ['あ', 'い']; p.introduce(2, pp); p.introduce(2, pp);
  for (let i = 0; i < 10; i++) ok(p.pick(2, () => 0.5, 'あ') === 'い', 'pick avoids previous id');
  const p2 = new Progress('test-avoid2-' + pass); p2.reset(); p2.introduce(2, ['あ']);
  ok(p2.pick(2, () => 0.5, 'あ') === 'あ', 'avoid ignored when single candidate');
}

// ---- audio: バックグラウンド復帰の自動レジューム（sfx.js） ----
// 偽の AudioContext / window / document を仕込み、visibilitychange 等で resume() するかを検証。
{
  function makeCtx() {
    let resumeCalls = 0;
    const c = {
      state: 'suspended', sampleRate: 44100, currentTime: 0, destination: {},
      resume() { resumeCalls++; c.state = 'running'; return Promise.resolve(); },
      suspend() { c.state = 'suspended'; return Promise.resolve(); },
      createDynamicsCompressor() { return { threshold: {}, ratio: {}, knee: {}, attack: {}, release: {}, connect() {} }; },
      createGain() { return { gain: {}, connect() {} }; },
      createBuffer() { return { getChannelData() { return new Float32Array(1); } }; },
      createBufferSource() { return { buffer: null, connect() {}, start() {}, stop() {} }; },
      get resumeCalls() { return resumeCalls; },
    };
    return c;
  }
  function makeTarget(extra) {
    const h = {};
    return Object.assign({
      addEventListener(t, fn) { (h[t] = h[t] || []).push(fn); },
      dispatch(t) { (h[t] || []).forEach((fn) => fn()); },
    }, extra);
  }
  function setup(mutedFlag) {
    const c = makeCtx();
    global.localStorage = { s: { 'kidtype:muted': mutedFlag ? '1' : '0' }, getItem(k) { return this.s[k] ?? null; }, setItem(k, v) { this.s[k] = String(v); } };
    global.window = makeTarget({ AudioContext: function () { return c; } });
    global.document = makeTarget({ visibilityState: 'visible' });
    return c;
  }

  // (1) 非ミュート：復帰イベントで suspended → running へ resume する（3 経路とも）。
  {
    const c = setup(false);
    const sfx = (await import('../src/audio/sfx.js?case=on')).default;
    sfx.unlock();                 // ctx 生成＋リスナ登録
    c.state = 'suspended';        // OS のバックグラウンド suspend を模擬
    const before = c.resumeCalls;
    global.document.dispatch('visibilitychange');
    ok(c.resumeCalls === before + 1 && c.state === 'running', 'visibilitychange resumes when not muted');
    c.state = 'suspended'; global.window.dispatch('pageshow');
    ok(c.state === 'running', 'pageshow resumes when not muted');
    c.state = 'suspended'; global.window.dispatch('focus');
    ok(c.state === 'running', 'focus resumes when not muted');
  }
  // (2) ミュート中：復帰イベントが来ても絶対に resume しない（mute=suspend を尊重）。
  {
    const c = setup(true);
    const sfx = (await import('../src/audio/sfx.js?case=muted')).default;
    sfx.unlock();                 // muted なので resume されない
    c.state = 'suspended';
    const before = c.resumeCalls;
    global.document.dispatch('visibilitychange');
    global.window.dispatch('pageshow');
    global.window.dispatch('focus');
    ok(c.resumeCalls === before && c.state === 'suspended', 'muted: visibility/pageshow/focus never resume');
  }
  delete global.window; delete global.document; delete global.localStorage;
}

// ---- score.js: 得点設計（正確 かつ 速いほど高得点・ミスは得点に寄与しない）----
// 値そのものでなく「意図」を検証する性質テスト。computeScore/computeStars は純粋関数。
{
  const { computeScore, computeStars } = await import('../src/engine/score.js');

  // (1) 同じ keysOk / timeMs でミスが増えるほど厳密に減点される（ミスはコスト）。
  {
    let prev = Infinity, mono = true;
    for (let err = 0; err <= 3; err++) {
      const s = computeScore({ keysOk: 30, keysErr: err, timeMs: 30000 });
      if (!(s < prev)) mono = false;
      prev = s;
    }
    ok(mono, 'more mistypes ⇒ strictly lower score (same keysOk/timeMs)');
  }

  // (2) 完璧(誤0) は 同じ keysOk で誤りありより高得点。
  {
    const perfect = computeScore({ keysOk: 30, keysErr: 0, timeMs: 30000 });
    const sloppy = computeScore({ keysOk: 30, keysErr: 5, timeMs: 30000 });
    ok(perfect > sloppy, 'perfect round beats same keysOk with several errors');
  }

  // (3) 同じ keysOk / 同じ正確率(誤0) で速いほど高得点。
  {
    const slow = computeScore({ keysOk: 30, keysErr: 0, timeMs: 30000 }); // 1000ms/打鍵
    const fast = computeScore({ keysOk: 30, keysErr: 0, timeMs: 15000 }); //  500ms/打鍵
    ok(fast > slow, 'faster (lower timeMs) ⇒ higher score');
  }

  // (4) 速いが雑(30ok/30err) は 丁寧(30ok/0err・やや遅い) を上回らない。
  {
    const sloppyFast = computeScore({ keysOk: 30, keysErr: 30, timeMs: 12000 }); //  400ms/打鍵
    const carefulSlower = computeScore({ keysOk: 30, keysErr: 0, timeMs: 36000 }); // 1200ms/打鍵
    ok(carefulSlower > sloppyFast, 'fast-but-sloppy does NOT beat careful-slightly-slower');
  }

  // (5) 得点は常に整数 ≥ 0。最後まで遊んだ初心者でも正の得点（0 で行き止まりにしない）。
  {
    const beginner = computeScore({ keysOk: 16, keysErr: 32, timeMs: 80000 });
    ok(Number.isInteger(beginner) && beginner > 0, 'beginner who finishes earns positive integer points');
    ok(computeScore({ keysOk: 0, keysErr: 5, timeMs: 1000 }) === 0, 'no correct keys ⇒ 0 (never negative)');
  }

  // (6) ★: 完走で1・高正確率で2・正確かつ速いで3。範囲は {1,2,3}。
  {
    eq(computeStars({ keysOk: 10, keysErr: 10, timeMs: 30000 }), 1, '低正確率 → ★1');
    eq(computeStars({ keysOk: 17, keysErr: 3, timeMs: 60000 }), 2, '高正確率だが遅い → ★2');
    eq(computeStars({ keysOk: 40, keysErr: 0, timeMs: 32000 }), 3, '完璧かつ速い → ★3');
    const st = computeStars({ keysOk: 30, keysErr: 1, timeMs: 30000 });
    ok(Number.isInteger(st) && st >= 1 && st <= 3, 'stars ∈ {1,2,3}');
  }
}

// ---- milestones.js: 長期プログレス（累計スコア→すまい tier）----
// 純関数 houseLevelForTotal / 配列 HOUSE_MILESTONES の不変条件を検証する。
// 拡充: 6 段 → 12 段（更地 → 集落 → 大きなお城）。tier 0 は更地、最上位は grand castle。
{
  const { houseLevelForTotal, HOUSE_MILESTONES, houseName } = await import('../src/engine/milestones.js');

  // 拡充後の tier テーブル（しきい値 / 名前）。回帰防止のためテーブルそのものを明示固定。
  const EXPECTED = [
    [0, 'さらち'], [500, 'たきび'], [1200, 'こや'], [2500, 'ちいさな いえ'],
    [4500, 'はたけつき いえ'], [7500, 'いえと なや'], [12000, 'おおきな いえ'],
    [18000, 'やしき'], [28000, 'むら'], [45000, 'とりで'], [75000, 'おしろ'],
    [130000, 'おおきな おしろ'],
  ];

  // (0) tier 数が拡充後の段数（12）に一致し、各 (しきい値・名前) が期待どおり。
  eq(HOUSE_MILESTONES.length, EXPECTED.length, 'tier count matches expanded table (12 tiers)');
  eq(HOUSE_MILESTONES.length, 12, 'tier count is 12 (more tiers + higher ceiling)');
  for (let i = 0; i < EXPECTED.length; i++) {
    eq(HOUSE_MILESTONES[i].total, EXPECTED[i][0], `tier ${i} threshold == ${EXPECTED[i][0]}`);
    eq(HOUSE_MILESTONES[i].name, EXPECTED[i][1], `tier ${i} name == ${EXPECTED[i][1]}`);
  }

  // (1) しきい値は厳密昇順。先頭は total=0（更地が tier 0）。天井は 25000 より遥かに高い。
  eq(HOUSE_MILESTONES[0].total, 0, 'first milestone threshold is 0 (empty lot)');
  {
    let asc = true;
    for (let i = 1; i < HOUSE_MILESTONES.length; i++)
      if (!(HOUSE_MILESTONES[i].total > HOUSE_MILESTONES[i - 1].total)) asc = false;
    ok(asc, 'milestone thresholds are strictly ascending');
  }
  ok(HOUSE_MILESTONES.every((m) => typeof m.name === 'string' && m.name.length > 0), 'every tier has a name');
  ok(HOUSE_MILESTONES[HOUSE_MILESTONES.length - 1].total >= 100000, 'top threshold raised well past old 25000 ceiling');

  // (2) total=0 は tier 0。序盤は刻みが低く、すぐ次の段へ届く（最初の段は 500 以下）。
  eq(houseLevelForTotal(0), 0, 'total 0 → tier 0');
  ok(HOUSE_MILESTONES[1].total <= 800, 'first reward tier is reachable quickly (<= 800)');

  // (3) 各しきい値ちょうどでその tier に乗る／直前(-1)では一つ下に留まる。
  for (let i = 0; i < HOUSE_MILESTONES.length; i++) {
    eq(houseLevelForTotal(HOUSE_MILESTONES[i].total), i, `total == threshold[${i}] → tier ${i}`);
    if (i > 0) eq(houseLevelForTotal(HOUSE_MILESTONES[i].total - 1), i - 1, `total just below threshold[${i}] → tier ${i - 1}`);
  }
  // 代表点のスポット確認（しきい値表の取り違え検出）。
  eq(houseLevelForTotal(500), 1, 'total 500 → tier 1 (たきび)');
  eq(houseLevelForTotal(7500), 5, 'total 7500 → tier 5 (いえと なや)');
  eq(houseLevelForTotal(130000), 11, 'total 130000 → tier 11 (おおきな おしろ)');

  // (4) tier は total に対して単調非減少（途中の刻みでも下がらない）。
  {
    let prev = -1, mono = true;
    for (let t = 0; t <= HOUSE_MILESTONES[HOUSE_MILESTONES.length - 1].total + 5000; t += 137) {
      const tier = houseLevelForTotal(t);
      if (tier < prev) mono = false;
      prev = tier;
    }
    ok(mono, 'houseLevelForTotal is monotonically non-decreasing in total');
  }

  // (5) 最上位しきい値以上は必ず最上位 tier（おおきな おしろ＝grand castle）に乗り、超過しても飛び出さない。
  const top = HOUSE_MILESTONES.length - 1;
  eq(top, 11, 'top tier index is 11');
  eq(houseLevelForTotal(HOUSE_MILESTONES[top].total), top, 'max threshold → top tier (grand castle)');
  eq(houseLevelForTotal(HOUSE_MILESTONES[top].total * 10), top, 'far beyond max stays at top tier (no overflow)');
  eq(houseName(HOUSE_MILESTONES[top].total), 'おおきな おしろ', 'houseName at max returns grand castle name');
  eq(houseName(HOUSE_MILESTONES[top].total), HOUSE_MILESTONES[top].name, 'houseName returns top tier name at max');

  // (6) 異常入力(負値・非数)は tier 0 に丸める。
  eq(houseLevelForTotal(-500), 0, 'negative total → tier 0');
  eq(houseLevelForTotal(NaN), 0, 'NaN total → tier 0');
  eq(houseLevelForTotal(undefined), 0, 'undefined total → tier 0');
}

// ---- scene.js: 背景の家 tier は「いまの累計スコア」から即反映される ----
// 回帰防止: ラウンド終了直後（結果画面）に累計がマイルストーンを跨いだら、ステージ選択へ
// 戻るのを待たずに背景の家 tier が上がっていること。scene が描く tier の唯一の更新点である
// setTotal() が、渡した total に対して houseTier / currentHouseName を即座に一致させる契約を固定する。
{
  const { Scene } = await import('../src/render/scene.js');
  const { houseLevelForTotal, HOUSE_MILESTONES } = await import('../src/engine/milestones.js');

  // (0) setTotal は描画される tier の唯一の更新窓口。渡した total に対し tier が即一致する。
  const s = new Scene();
  eq(s.houseTier, 0, 'fresh scene starts at tier 0 (さらち)');
  for (let i = 0; i < HOUSE_MILESTONES.length; i++) {
    const ret = s.setTotal(HOUSE_MILESTONES[i].total);
    eq(s.houseTier, i, `setTotal(threshold[${i}]) → houseTier ${i} immediately`);
    eq(ret, i, `setTotal returns the new tier ${i}`);
    eq(s.currentHouseName(), HOUSE_MILESTONES[i].name, `currentHouseName reflects tier ${i} name`);
  }

  // (1) 本命シナリオ: マイルストーン直下からラウンド分を加算して跨ぐと、その場で tier が上がる。
  //     （main.finishRound は afterTotal を setTotal に渡す＝ステージ選択を待たず結果画面に反映）。
  const cross = new Scene();
  cross.setTotal(HOUSE_MILESTONES[1].total - 1);   // たきび直前
  eq(cross.houseTier, 0, 'just below tier 1 threshold → still tier 0 on result screen');
  const afterTotal = (HOUSE_MILESTONES[1].total - 1) + 5;   // ラウンド得点でしきい値を跨ぐ
  cross.setTotal(afterTotal);
  eq(cross.houseTier, houseLevelForTotal(afterTotal), 'crossing a milestone bumps tier at once (no navigation needed)');
  eq(cross.houseTier, 1, 'tier becomes 1 (たきび) right after the round total crosses');
}

// ---- 結果 ----
console.log(`\n${pass} passed, ${fail} failed`);
if (fail) { console.log('\nFAILURES:'); for (const f of fails) console.log('  ✗ ' + f); process.exit(1); }
console.log('✓ all green');
