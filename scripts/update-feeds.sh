#!/bin/bash
set -euo pipefail

# 订阅源更新脚本 - 精简优化版
echo "🔄 开始更新订阅源..."

# 初始化核心变量
V2RAY_COUNT=0
CLASH_COUNT=0
UPDATE_STATUS="success"
ERROR_MSG=""
ORIGINAL_DATE="未知"
mkdir -p feeds

# 获取并解析README内容
README_URL="https://raw.githubusercontent.com/free-clash-v2ray/free-clash-v2ray.github.io/main/README.md"
README_CONTENT=$(curl -s -L "$README_URL" --max-time 30 2>/dev/null || "")

# 提取订阅链接（带日期排序）
extract_url() {
  local content=$1
  local ext=$2
  local links=$(echo "$content" | grep -oE "https://[^\s\"]+\.$ext" | grep "free-clash-v2ray" || true)
  echo "$links" | awk -F'/' '
    {
      match($NF, /^([0-9]+)-([0-9]{8})\.'"$ext"'/, ms)
      if (ms[2] != "") print ms[2], $0
      else print "00000000", $0
    }' | sort -r | head -n1 | cut -d" " -f2 || echo "$links" | head -n1
}

# 提取V2Ray和Clash链接
V2RAY_URL=$( [ -n "$README_CONTENT" ] && extract_url "$README_CONTENT" "txt" || "" )
CLASH_URL=$( [ -n "$README_CONTENT" ] && extract_url "$README_CONTENT" "yaml" || "" )

# 设置备用链接
V2RAY_URL=${V2RAY_URL:-"https://free-clash-v2ray.github.io/uploads/2026/02/0-20260216.txt"}
CLASH_URL=${CLASH_URL:-"https://free-clash-v2ray.github.io/uploads/2026/02/0-20260216.yaml"}

# 提取原始日期（从URL中解析8位数字日期）
extract_date() {
  local url=$1
  local date=$(echo "$url" | grep -oE '[0-9]{8}' | head -1)
  if [ -n "$date" ]; then
    echo "${date:0:4}-${date:4:2}-${date:6:2}"
  else
    echo "未知"
  fi
}
ORIGINAL_DATE=$(extract_date "$V2RAY_URL")

echo "✅ 提取结果: V2Ray=$V2RAY_URL | Clash=$CLASH_URL | 源日期=$ORIGINAL_DATE"

# 下载V2Ray订阅
if curl -s -L "$V2RAY_URL" -o feeds/v2ray-latest.txt --max-time 30; then
  V2RAY_COUNT=$(wc -l < feeds/v2ray-latest.txt 2>/dev/null || 0)
  echo "✅ V2Ray下载成功 ($V2RAY_COUNT 行)"
else
  echo "# V2Ray订阅暂时不可用" > feeds/v2ray-latest.txt
  UPDATE_STATUS="partial_failure"
  ERROR_MSG+="V2Ray下载失败; "
  echo "❌ V2Ray下载失败"
fi

# 下载Clash订阅
if curl -s -L "$CLASH_URL" -o feeds/clash-latest.yaml --max-time 30; then
  CLASH_COUNT=$(wc -l < feeds/clash-latest.yaml 2>/dev/null || 0)
  echo "✅ Clash下载成功 ($CLASH_COUNT 行)"
else
  echo "# Clash订阅暂时不可用" > feeds/clash-latest.yaml
  UPDATE_STATUS="partial_failure"
  ERROR_MSG+="Clash下载失败; "
  echo "❌ Clash下载失败"
fi

# 生成状态页面
REPO_NAME=$(echo "${GITHUB_REPOSITORY:-}" | cut -d'/' -f2)
GITHUB_OWNER=$(echo "${GITHUB_REPOSITORY:-}" | cut -d'/' -f1)
UPDATE_TIME=$(date -u +'%Y-%m-%d %H:%M:%S UTC')

cat > feeds/index.html <<EOF
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>订阅代理服务</title>
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        body { font-family: sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
        .card { background: #f5f5f5; padding: 20px; margin: 20px 0; border-radius: 10px; }
        .url { background: white; padding: 10px; border-radius: 5px; font-family: monospace; overflow-x: auto; }
        .success { color: #28a745; }
        a { color: #007bff; text-decoration: none; }
        a:hover { text-decoration: underline; }
    </style>
</head>
<body>
    <h1>📡 订阅代理服务</h1>
    <p>自动同步最新的订阅源，提供永久访问链接。</p>
    <div class="card">
        <h2>📊 更新状态</h2>
        <p class="success">✅ 最后更新: $UPDATE_TIME</p>
        <p>源日期: $ORIGINAL_DATE</p>
        <p>V2Ray订阅: $V2RAY_COUNT 行</p>
        <p>Clash订阅: $CLASH_COUNT 行</p>
        <p>更新状态: $UPDATE_STATUS</p>
    </div>
    <div class="card">
        <h2>V2Ray订阅</h2>
        <p>永久链接:</p>
        <div class="url">https://$GITHUB_OWNER.github.io/$REPO_NAME/v2ray-latest.txt</div>
        <p>源链接:</p>
        <div class="url">$V2RAY_URL</div>
    </div>
    <div class="card">
        <h2>Clash订阅</h2>
        <p>永久链接:</p>
        <div class="url">https://$GITHUB_OWNER.github.io/$REPO_NAME/clash-latest.yaml</div>
        <p>源链接:</p>
        <div class="url">$CLASH_URL</div>
    </div>
    <hr>
    <p>源项目: <a href="https://github.com/free-clash-v2ray/free-clash-v2ray.github.io" target="_blank">free-clash-v2ray.github.io</a></p>
    <p>更新频率: 每2天自动更新 | 由 <a href="https://github.com/${GITHUB_REPOSITORY:-}/actions" target="_blank">GitHub Actions</a> 驱动</p>
</body>
</html>
EOF

# 生成状态文件
cat > feeds/latest_links.txt <<EOF
V2Ray: $V2RAY_URL
Clash: $CLASH_URL
V2Ray lines: $V2RAY_COUNT
Clash lines: $CLASH_COUNT
Source date: $ORIGINAL_DATE
Update time: $UPDATE_TIME
Update status: $UPDATE_STATUS
Error messages: $ERROR_MSG
EOF

# 输出所有变量供GitHub Actions使用
echo "v2ray_count=$V2RAY_COUNT" >> "$GITHUB_OUTPUT"
echo "clash_count=$CLASH_COUNT" >> "$GITHUB_OUTPUT"
echo "update_status=$UPDATE_STATUS" >> "$GITHUB_OUTPUT"
echo "error_msg=$ERROR_MSG" >> "$GITHUB_OUTPUT"
echo "original_date=$ORIGINAL_DATE" >> "$GITHUB_OUTPUT"

echo "✅ 订阅源更新完成 (源日期: $ORIGINAL_DATE)"
