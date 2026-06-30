// run.mjs — エンジンのテスト（node test/run.mjs）。依存なし・自前ランナー。
import { toChunks, canonicalRomaji, kanaToRomaji } from '../src/engine/romaji.js';
import { Matcher, matcherFor } from '../src/engine/matcher.js';
import { Progress, Stage } from '../src/engine/progress.js';
import { kataToHira } from '../src/engine/kana.js';
import { WORDS, SENTENCES } from '../src/engine/content.js';

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
  for (const s of SENTENCES) {
    ok(Number.isInteger(s.lv) && s.lv >= 1 && s.lv <= 4, `SENTENCE "${s.text}" lv in 1..4 (got ${s.lv})`);
    typeable(`SENTENCE`, s.text);
  }
  // 重複検出（WORDS.kana / SENTENCES.text とも一意であること）
  const wset = new Set(WORDS.map((w) => w.kana));
  eq(wset.size, WORDS.length, 'WORDS kana are all unique (no duplicates)');
  const sset = new Set(SENTENCES.map((s) => s.text));
  eq(sset.size, SENTENCES.length, 'SENTENCES text are all unique (no duplicates)');
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

// ---- 結果 ----
console.log(`\n${pass} passed, ${fail} failed`);
if (fail) { console.log('\nFAILURES:'); for (const f of fails) console.log('  ✗ ' + f); process.exit(1); }
console.log('✓ all green');
