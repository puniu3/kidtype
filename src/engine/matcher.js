// matcher.js — 入力マッチャ（チャンク列を NFA として走らせる）
//
// 状態 = 到達可能な位置の集合。各位置は "chunkIndex:optionIndex:charPos"。
//  - charPos はその option を何文字消費したか。
//  - チャンクを打ち切る(option 完了)と、次チャンクの開始位置群を生む。
//  - 空白(auto)チャンクは「打鍵せず素通り」も「スペースを打つ」も両方許容。
//
// これにより し=shi/si、ん=n/nn の前後依存、っの子音重ね、ー の '-'/母音 などの
// 分岐を、ハード確定せずに自然に吸収できる。誤キーは状態を進めない＝ミス。

const DONE = 'DONE';

export class Matcher {
  constructor(chunks) {
    this.chunks = chunks;
    this.typed = '';
    this.errors = 0; // 累積ミス打鍵数
    this.states = new Set();
    this._addStart(0, this.states);
  }

  _addStart(ci, set) {
    if (ci >= this.chunks.length) { set.add(DONE); return; }
    const c = this.chunks[ci];
    if (c.auto) {
      // 打鍵せず次へ進める分岐
      this._addStart(ci + 1, set);
      // スペースを実際に打つ分岐も許容
      c.options.forEach((_, oi) => set.add(`${ci}:${oi}:0`));
      return;
    }
    c.options.forEach((_, oi) => set.add(`${ci}:${oi}:0`));
  }

  isDone() { return this.states.has(DONE); }

  // 1 打鍵を処理。{ ok, done } を返す。ok=false は誤キー（状態は不変）。
  press(ch) {
    if (this.isDone()) return { ok: false, done: true };
    const next = new Set();
    let advanced = false;
    for (const s of this.states) {
      if (s === DONE) continue;
      const [ci, oi, cp] = s.split(':').map(Number);
      const opt = this.chunks[ci].options[oi];
      if (opt[cp] === ch) {
        advanced = true;
        const np = cp + 1;
        if (np === opt.length) this._addStart(ci + 1, next);
        else next.add(`${ci}:${oi}:${np}`);
      }
    }
    if (!advanced) { this.errors++; return { ok: false, done: false }; }
    this.states = next;
    this.typed += ch;
    return { ok: true, done: next.has(DONE) };
  }

  // 次に受理されるキー全集合（重複なし）。キーボード強調の候補。
  expectedChars() {
    const out = new Set();
    for (const s of this.states) {
      if (s === DONE) continue;
      const [ci, oi, cp] = s.split(':').map(Number);
      out.add(this.chunks[ci].options[oi][cp]);
    }
    return [...out];
  }

  // canonical 経路上の「次の 1 キー」。初心者には 1 つだけ光らせたいので。
  canonicalNext() {
    let best = null;
    for (const s of this.states) {
      if (s === DONE) continue;
      const [ci, oi, cp] = s.split(':').map(Number);
      if (best === null || ci < best.ci || (ci === best.ci && oi < best.oi)) best = { ci, oi, cp };
    }
    return best ? this.chunks[best.ci].options[best.oi][best.cp] : null;
  }

  // 進捗 0..1（打鍵数 / canonical 総長の近似）。プログレスバー用。
  progress() {
    let total = 0;
    for (const c of this.chunks) if (!c.auto) total += c.display.length;
    if (total === 0) return 1;
    return Math.min(1, this.typed.length / total);
  }

  // 「今どのチャンクを打っているか」の最小 index（UI でかなを強調する用）。
  currentChunkIndex() {
    let min = this.chunks.length;
    for (const s of this.states) {
      if (s === DONE) continue;
      const ci = Number(s.split(':')[0]);
      if (ci < min) min = ci;
    }
    return min;
  }
}

// 文字列ターゲットから一発でマッチャを作る薄いヘルパ。
import { toChunks } from './romaji.js';
export function matcherFor(target) {
  return new Matcher(toChunks(target));
}
