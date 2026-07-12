// font.js — 埋め込みフォント。全端末（iPad / Chromebook / PC）で同じ見た目にする。
//
// フォント: M PLUS Rounded 1c ExtraBold（OFL。ライセンスは assets/fonts/OFL.txt）。
// コーパスは永久にかなだけ（漢字なし）なので、かな＋英数＋記号 324 字に
// サブセット済み（約 24KB woff2）。再生成の手順は tools/font-subset.sh。
// カバレッジ検査は tools/font-coverage.mjs（コーパスが増えたら再実行）。
//
// canvas の fillText は CSS の @font-face だけでは間に合わない（読み込み完了前に
// 描くとフォールバックで描かれる）ので、FontFace API でロード完了を待ってから
// ゲームループを開始する（main.js 側）。絵文字はサブセットに含めず、後続の
// システムフォールバックに任せる（canvas はグリフ単位でフォールバックする）。
//
// weight を '100 900' で登録する → 700/800/900 どの指定でもこの 1 ファイルに
// マッチし、ブラウザの疑似ボールド（にじみ）がかからない。

const FAMILY = 'KidType Maru';

// 埋め込みファミリーを先頭に。読み込み失敗時は従来のシステム連鎖に落ちる。
export const FONT = `"${FAMILY}", ui-rounded, "Hiragino Maru Gothic ProN", "Hiragino Sans", system-ui, sans-serif`;

// フォントを読み込んで document.fonts へ登録する。解決値: 使えるようになったか。
// - 成功: true（以後の描画は埋め込みフォント）
// - 失敗/タイムアウト: false（システムフォントで開始。裏で届いたら次フレームから
//   自動で切り替わる — メインループは毎フレーム全再描画なので repaint 不要）
export async function loadGameFont(timeoutMs = 2500) {
  if (typeof FontFace === 'undefined' || !document.fonts) return false;
  try {
    const url = new URL('../assets/fonts/MPLUSRounded1c-ExtraBold.kana.woff2', import.meta.url);
    const face = new FontFace(FAMILY, `url(${url})`, { weight: '100 900', style: 'normal' });
    const loading = face.load();
    loading.then((f) => document.fonts.add(f)).catch(() => {});
    const won = await Promise.race([
      loading.then(() => true, () => false),
      new Promise((r) => setTimeout(() => r(false), timeoutMs)),
    ]);
    return won;
  } catch (_) {
    return false;
  }
}
