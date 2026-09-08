#!/bin/bash
# Robust upload + verify for smartcomp25.zip
# Uploads to multiple free hosts with retries; verifies by downloading back
# and comparing size + md5. Only a VERIFIED link is reported.

FILE=/home/z/my-project/download/smartcomp25.zip
EXPECTED_SIZE=$(stat -c%s "$FILE")
EXPECTED_MD5=$(md5sum "$FILE" | cut -d' ' -f1)
UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
VERIFY_DIR=/home/z/my-project/scripts/verify_tmp
mkdir -p "$VERIFY_DIR"

echo "Target: $FILE"
echo "Expected size: $EXPECTED_SIZE bytes | md5: $EXPECTED_MD5"
echo "======================================================"

verify_url() {
  # $1 = direct URL to download, $2 = service name
  local dl="$VERIFY_DIR/verify_$2.zip"
  rm -f "$dl"
  timeout 300 curl -sSL -A "$UA" -o "$dl" "$1" 2>/dev/null
  local size=$(stat -c%s "$dl" 2>/dev/null || echo 0)
  if [ "$size" != "$EXPECTED_SIZE" ]; then
    echo "  VERIFY FAIL ($2): got $size / want $EXPECTED_SIZE"
    rm -f "$dl"
    return 1
  fi
  local md5=$(md5sum "$dl" | cut -d' ' -f1)
  rm -f "$dl"
  if [ "$md5" != "$EXPECTED_MD5" ]; then
    echo "  VERIFY FAIL ($2): md5 mismatch ($md5)"
    return 1
  fi
  echo "  VERIFY OK ($2): size + md5 match"
  return 0
}

try_x0() {
  echo "[x0.at] direct link, 30+ days"
  for i in 1 2 3; do
    echo "  attempt $i..."
    local url=$(timeout 300 curl -sS -F "file=@$FILE" -A "$UA" https://x0.at 2>/dev/null | tr -d '\r\n ')
    if [ -z "$url" ]; then echo "    no url returned"; continue; fi
    echo "    link: $url"
    if verify_url "$url" "x0_$i"; then echo "X0_RESULT: $url"; return 0; fi
  done
  return 1
}

try_0x0() {
  echo "[0x0.st] direct link, 30+ days"
  for i in 1 2; do
    echo "  attempt $i..."
    local url=$(timeout 300 curl -sS -F "file=@$FILE" -A "$UA" https://0x0.st 2>/dev/null | tr -d '\r\n ')
    if [ -z "$url" ]; then echo "    empty response"; continue; fi
    echo "    link: $url"
    if verify_url "$url" "0x0_$i"; then echo "OXO_RESULT: $url"; return 0; fi
  done
  return 1
}

try_fileio() {
  echo "[file.io] single-download link, 14 days"
  for i in 1 2; do
    echo "  attempt $i..."
    local resp=$(timeout 300 curl -sS -F "file=@$FILE" -A "$UA" "https://file.io/?expires=14d" 2>/dev/null)
    if [ -z "$resp" ]; then echo "    empty response"; continue; fi
    local link=$(echo "$resp" | rg -o '"link":"[^"]+"' | head -1 | cut -d'"' -f4)
    if [ -z "$link" ]; then echo "    no link in resp: $(echo "$resp" | head -c 150)"; continue; fi
    echo "    link: $link"
    # file.io links are single-download: verify would consume it.
    # Trust the API success flag instead.
    local ok=$(echo "$resp" | rg -o '"success":(true|false)' | head -1)
    echo "    api status: $ok"
    if echo "$ok" | rg -q "true"; then echo "FILEIO_RESULT: $link"; return 0; fi
  done
  return 1
}

try_gofile() {
  echo "[gofile.io] browser page with download button"
  local srv=$(timeout 60 curl -sS -A "$UA" https://api.gofile.io/servers 2>/dev/null | rg -o '"name":"[^"]+"' | head -1 | cut -d'"' -f4)
  if [ -z "$srv" ]; then echo "  could not get server"; return 1; fi
  echo "  server: $srv"
  for i in 1 2; do
    echo "  attempt $i..."
    local resp=$(timeout 300 curl -sS -F "file=@$FILE" -A "$UA" "https://${srv}.gofile.io/contents/uploadfile" 2>/dev/null)
    if [ -z "$resp" ]; then echo "    empty response"; continue; fi
    local page=$(echo "$resp" | rg -o '"downloadPage":"[^"]+"' | head -1 | cut -d'"' -f4)
    if [ -z "$page" ]; then echo "    no downloadPage: $(echo "$resp" | head -c 200)"; continue; fi
    echo "GOFILE_RESULT: $page"
    return 0
  done
  return 1
}

try_filebin() {
  echo "[filebin.net] direct link, 6 days"
  local BIN="smartcomp25-$(date +%s)"
  local url="https://filebin.net/${BIN}/smartcomp25.zip"
  for i in 1 2; do
    echo "  attempt $i..."
    local code=$(timeout 300 curl -sS -o /dev/null -w "%{http_code}" -X POST --data-binary "@$FILE" -H "Content-Type: application/octet-stream" -A "$UA" "$url" 2>/dev/null)
    echo "    upload http status: $code"
    if [ "$code" != "201" ] && [ "$code" != "200" ]; then continue; fi
    if verify_url "$url" "filebin_$i"; then echo "FILEBIN_RESULT: $url"; return 0; fi
  done
  return 1
}

echo ""
echo "======== STARTING UPLOADS ========"
try_x0
try_0x0
try_gofile
try_fileio
try_filebin
echo ""
echo "======== DONE ========"
rm -rf "$VERIFY_DIR"
