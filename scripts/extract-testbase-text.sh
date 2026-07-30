#!/usr/bin/env bash
# テストベースPDFを全文テキスト化して .work/testbase/<year>/ へ出力する。
#
# 用途:
#   MCPツール（audit_id_population / analyze_requirements など）へ「全文」を投入するための前処理。
#   抽出物は ASTER 提供資料の逐語テキストになるため .work/ 配下に置き、リポジトリにはコミットしない
#   （.gitignore で除外済み）。
#
# 使い方:
#   bash scripts/extract-testbase-text.sh 2025
set -euo pipefail

YEAR="${1:-}"
if [ -z "$YEAR" ]; then
  echo "usage: bash scripts/extract-testbase-text.sh <year>   (例: bash scripts/extract-testbase-text.sh 2025)" >&2
  exit 2
fi

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC_ROOT="$REPO_ROOT/sample/$YEAR"
OUT_DIR="$REPO_ROOT/.work/testbase/$YEAR"

if ! command -v pdftotext >/dev/null 2>&1; then
  cat >&2 <<'MSG'
error: pdftotext が見つかりません。poppler-utils を導入してから再実行してください。

  Debian/Ubuntu: apt-get update && apt-get install -y poppler-utils
  macOS (Homebrew): brew install poppler
  Windows (winget): winget install --id oschwartz10612.Poppler
MSG
  exit 1
fi

if [ ! -d "$SRC_ROOT" ]; then
  echo "error: $SRC_ROOT が存在しません。" >&2
  exit 1
fi

# sample/<year>/**/<year>_tdc_open_testbase/*.pdf を対象にする（入れ子の同名ディレクトリに対応）。
mapfile -d '' PDFS < <(
  find "$SRC_ROOT" -type d -name "*_tdc_open_testbase" -exec find {} -maxdepth 1 -type f -name '*.pdf' -print0 \; |
    sort -z
)

if [ "${#PDFS[@]}" -eq 0 ]; then
  echo "error: $SRC_ROOT 配下の *_tdc_open_testbase に PDF が見つかりません。" >&2
  exit 1
fi

mkdir -p "$OUT_DIR"

COUNT=0
for pdf in "${PDFS[@]}"; do
  base="$(basename "$pdf" .pdf)"
  out="$OUT_DIR/$base.txt"
  pdftotext -layout -enc UTF-8 "$pdf" "$out"
  chars="$(wc -m <"$out" | tr -d ' ')"
  echo "extracted: $base.txt (${chars} chars)"
  COUNT=$((COUNT + 1))
done

echo "done: $COUNT file(s) -> $OUT_DIR"
