#!/bin/bash
set -euo pipefail

echo "🔄 开始更新订阅源..."

V2RAY_COUNT=0
CLASH_COUNT=0
UPDATE_STATUS="success"
ERROR_MSG=""
ORIGINAL_DATE="未知"
mkdir -p feeds

README_URL="https://raw.githubusercontent.com/free-clash-v2ray/free-clash-v2ray.github.io/main/README.md"
README_CONTENT=$(curl -s -L "$README_URL" --max-time 30 2>/dev/null || "")

extract_url() {
  local content="$1" ext="$2"
  local links=$(echo "$content" | grep -oE "https://[^\s\"]+\.$ext" | grep "free-clash-v2ray" || true)
  echo "$links" | awk -F'/' '
    match($NF, /^([0-9]+)-([0-9]{8})\.'"$ext"'/, ms) {
      print ms[2] " " $0
    }' | sort -r | head -n1 | cut -d" " -f2 | head -n1
}

V2RAY_URL=$( [ -n "$README_CONTENT" ] && extract_url "$README_CONTENT" txt )
CLASH_URL=$( [ -n "$README_CONTENT" ] && extract_url "$README_CONTENT" yaml )

V2RAY_URL=${V2RAY_URL:-"https://free-clash-v2ray.github.io/uploads/2026/02/0-20260216.txt"}
CLASH_URL=${CLASH_URL:-"https://free-clash-v2ray.github.io/uploads/2026/02/0-20260216.yaml"}

extract_date() {
  local d=$(echo "$1" | grep -oE '[0-9]{8}' | head -n1)
  [ -n "$d" ] && echo "${d:0:4}-${d:4:2}-${d:6:2}" || echo "未知"
}
ORIGINAL_DATE=$(extract_date "$V2RAY_URL")

echo "✅ 源日期: $ORIGINAL_DATE"

# 下载 V2Ray
if curl -s -L "$V2RAY_URL" -o feeds/v2ray-latest.txt --max-time 30; then
  V2RAY_COUNT=$(wc -l < feeds/v2ray-latest.txt 2>/dev/null || 0)
else
  echo "# V2Ray 暂时不可用" > feeds/v2ray-latest.txt
  UPDATE_STATUS="partial_failure"
  ERROR_MSG+="V2Ray下载失败; "
fi

# 下载 Clash
if curl -s -L "$CLASH_URL" -o feeds/clash-latest.yaml --max-time 30; then
  CLASH_COUNT=$(wc -l < feeds/clash-latest.yaml 2>/dev/null || 0)
else
  echo "# Clash 暂时不可用" > feeds/clash-latest.yaml
  UPDATE_STATUS="partial_failure"
  ERROR_MSG+="Clash下载失败; "
fi

# 生成页面
REPO_NAME="${GITHUB_REPOSITORY#*/}"
GITHUB_OWNER="${GITHUB_REPOSITORY%%/*}"
UPDATE_TIME=$(date -u +'%Y-%m-%d %H:%M:%S UTC')

cat > feeds/index.html <<EOF
<!DOCTYPE html>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>订阅代理服务</title>
<style>
body{font-family:sans-serif;max-width:800px;margin:0 auto;padding:20px}
.card{background:#f5f5f5;padding:20px;margin:20px 0;border-radius:10px}
.url{background:white;padding:10px;border-radius:5px;font-family:monospace;overflow-x:auto}
</style>
<h1>📡 订阅代理服务</h1>
<div class="card">
  <h2>📊 更新状态</h2>
  <p>✅ 最后更新: $UPDATE_TIME</p>
  <p>源日期: $ORIGINAL_DATE</p>
  <p>V2Ray: $V2RAY_COUNT 行</p>
  <p>Clash: $CLASH_COUNT 行</p>
</div>
<div class="card">
  <h2>V2Ray</h2><div class="url">https://$GITHUB_OWNER.github.io/$REPO_NAME/v2ray-latest.txt</div>
  <h2>Clash</h2><div class="url">https://$GITHUB_OWNER.github.io/$REPO_NAME/clash-latest.yaml</div>
</div>
EOF

cat > feeds/latest_links.txt <<EOF
V2Ray: $V2RAY_URL
Clash: $CLASH_URL
Source date: $ORIGINAL_DATE
Update time: $UPDATE_TIME
EOF

echo "v2ray_count=$V2RAY_COUNT" >> "$GITHUB_OUTPUT"
echo "clash_count=$CLASH_COUNT" >> "$GITHUB_OUTPUT"
echo "update_status=$UPDATE_STATUS" >> "$GITHUB_OUTPUT"
echo "error_msg=$ERROR_MSG" >> "$GITHUB_OUTPUT"
echo "original_date=$ORIGINAL_DATE" >> "$GITHUB_OUTPUT"

echo "✅ 更新完成"
