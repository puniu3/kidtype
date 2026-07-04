#!/usr/bin/env bash
# font-subset.sh — 埋め込みフォント assets/fonts/*.kana.woff2 の再生成手順（開発時のみ使用）。
#
# 元フォント: M PLUS Rounded 1c ExtraBold（OFL・Reserved Font Name なし）
#   https://github.com/google/fonts/tree/main/ofl/mplusrounded1c
# コーパスは永久にかなだけ（漢字なし）という前提で、かな全域＋英数＋記号だけに
# サブセットする（フル 3.6MB → 約 24KB）。例外として iOS の ?install バナーが
# 「ホーム画面に追加」を表示するため、漢字 4 字（画/面/追/加）だけ含める。
#
# 実行: bash tools/font-subset.sh <path/to/MPLUSRounded1c-ExtraBold.ttf>
# 必要: pyftsubset (pip install --user fonttools) + brotli
# 生成後は node tools/font-coverage.mjs で全描画グリフが載っているか検査すること。
set -euo pipefail
SRC="${1:?usage: font-subset.sh <MPLUSRounded1c-ExtraBold.ttf>}"
OUT="$(dirname "$0")/../assets/fonts/MPLUSRounded1c-ExtraBold.kana.woff2"

# U+0020-007E  ASCII 全域（キー表示 A-Z・数字・記号・スコア表示）
# U+00D7       × （install バナーの閉じる）
# U+2018-201D  ‘ ’ “ ” 引用符（保険）
# U+2039-203A  ‹ › （「もどる」ボタン）
# U+22EE       ⋮ （install バナーのメニュー案内）
# U+2460-2469  ①-⑩ （install バナーの手順番号）
# U+25B6/25C0  ▶◀ （「もういちど」ボタンなどの三角）
# U+2605-2606  ★☆ （非絵文字の星。絵文字⭐はシステム任せ）
# U+3000-3002  全角スペース・、。
# U+300C-300F  「」『』
# U+301C       〜
# U+3041-309F  ひらがな全域（濁点・半濁点・小書き含む）
# U+30A0-30FF  カタカナ全域（ー・ヴ・中黒含む）
# U+FF01/08-09/0B/1A/1F/5E  ！（）＋：？～ 全角記号
# U+52A0/753B/8FFD/9762  加/画/追/面（iOS「ホーム画面に追加」専用の例外）
pyftsubset "$SRC" \
  --unicodes="U+0020-007E,U+00D7,U+2018-201D,U+2039-203A,U+22EE,U+2460-2469,U+25B6,U+25C0,U+2605-2606,U+3000-3002,U+300C-300F,U+301C,U+3041-309F,U+30A0-30FF,U+FF01,U+FF08-FF09,U+FF0B,U+FF1A,U+FF1F,U+FF5E,U+52A0,U+753B,U+8FFD,U+9762" \
  --flavor=woff2 --no-hinting --desubroutinize \
  --layout-features='' --name-IDs=0,1,2,3,4,5,6,13,14 \
  --output-file="$OUT"
ls -la "$OUT"
