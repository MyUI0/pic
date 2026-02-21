#!/bin/bash

# ==============================================================================
# 更新订阅源脚本
# 从 free-clash-v2ray 项目获取最新的 V2Ray 和 Clash 订阅并保存到 `feeds/` 目录。
# 此脚本被 .github/workflows/update-feed-notifications.yml 调用。
# ==============================================================================

set -euo pipefail  # 启用严格模式：遇到错误退出，使用未定义变量报错

echo "🔄 开始解析和更新订阅源..."

# 初始化变量
V2RAY_COUNT=0
CLASH_COUNT=0
UPDATE_STATUS="success"
ERROR_MSG=""

# 确保 feeds 目录存在
mkdir -p feeds

echo "🔍 获取源项目README..."
README_URL="https://raw.githubusercontent.com/free-clash-v2ray/free-clash-v2ray.github.io/main/README.md"
README_CONTENT=$(curl -s -L "$README_URL" --max-time 30 2>/dev/null || echo "")

if [ -z "$README_CONTENT" ]; then
  echo "⚠️ 无法获取README，使用备用链接"
  V2RAY_URL="https://free-clash-v2ray.github.io/uploads/2026/02/0-20260216.txt"
  CLASH_URL="https://free-clash-v2ray.github.io/uploads/2026/02/0-20260216.yaml"
else
  echo "🔍 提取V2Ray链接..."
  V2RAY_LINKS=$(echo "$README_CONTENT" | grep -oE "https://[^\s\"]+\.txt" | grep "free-clash-v2ray" || true)
  V2RAY_URL=$(echo "$V2RAY_LINKS" | awk -F'/' '
    {
      match($NF, /^([0-9]+)-([0-9]{8})\.txt/, ms)
      if (ms[2] != "") print ms[2], $0
      else print "00000000", $0
    }' | sort -r | head -n1 | cut -d" " -f2)
  [ -z "$V2RAY_URL" ] && V2RAY_URL=$(echo "$V2RAY_LINKS" | head -n1)

  echo "🔍 提取Clash链接..."
  CLASH_LINKS=$(echo "$README_CONTENT" | grep -oE "https://[^\s\"]+\.yaml" | grep "free-clash-v2ray" || true)
  CLASH_URL=$(echo "$CLASH_LINKS" | awk -F'/' '
    {
      match($NF, /^([0-9]+)-([0-9]{8})\.yaml/, ms)
      if (ms[2] != "") print ms[2], $0
      else print "00000000", $0
    }' | sort -r | head -n1 | cut -d" " -f2)
  [ -z "$CLASH_URL" ] && CLASH_URL=$(echo "$CLASH_LINKS" | head -n1)
fi

# 设置默认URL（如果提取失败）
V2RAY_URL=${V2RAY_URL:-"https://free-clash-v2ray.github.io/uploads/2026/02/0-20260216.txt"}
CLASH_URL=${CLASH_URL:-"https://free-clash-v2ray.github.io/uploads/2026/02/0-20260216.yaml"}

echo "✅ 提取结果:"
echo "V2Ray: $V2RAY_URL"
echo "Clash: $CLASH_URL"

# ------------------------------------------------------------------------------
# 下载 V2Ray 订阅
# ------------------------------------------------------------------------------
echo "⬇️ 下载V2Ray订阅源..."
if curl -s -L "$V2RAY_URL" -o feeds/v2ray-latest.txt --max-time 30; then
  V2RAY_COUNT=$(wc -l < feeds/v2ray-latest.txt 2>/dev/null || echo 0)
  echo "✅ V2Ray下载成功，行数: $V2RAY_COUNT"
else
  echo "❌ V2Ray下载失败，使用空文件"
  echo "# V2Ray订阅暂时不可用" > feeds/v2ray-latest.txt
  UPDATE_STATUS="partial_failure"
  ERROR_MSG="${ERROR_MSG}V2Ray下载失败; "
fi

# ------------------------------------------------------------------------------
# 下载 Clash 订阅
# ------------------------------------------------------------------------------
echo "⬇️ 下载Clash订阅源..."
if curl -s -L "$CLASH_URL" -o feeds/clash-latest.yaml --max-time 30; then
  CLASH_COUNT=$(wc -l < feeds/clash-latest.yaml 2>/dev/null || echo 0)
  echo "✅ Clash下载成功，行数: $CLASH_COUNT"
else
  echo "❌ Clash下载失败，使用空文件"
  echo "# Clash订阅暂时不可用" > feeds/clash-latest.yaml
  UPDATE_STATUS="partial_failure"
  ERROR_MSG="${ERROR_MSG}Clash下载失败; "
fi

# ------------------------------------------------------------------------------
# 生成状态页面 (HTML)
# ------------------------------------------------------------------------------
echo "📄 创建状态页面..."
cat > feeds/index.html <<'EOF'
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
        .warning { color: #ffc107; }
        .error { color: #dc3545; }
        a { color: #007bff; text-decoration: none; }
        a:hover { text-decoration: underline; }
    </style>
</head>
<body>
    <h1>📡 订阅代理服务</h1>
    <p>自动同步最新的订阅源，提供永久访问链接。</p>
    <div class="card">
        <h2>📊 更新状态</h2>
        <p class="success">✅ 最后更新: __UPDATE_TIME__</p>
        <p>V2Ray订阅: __V2RAY_COUNT__ 行</p>
        <p>Clash订阅: __CLASH_COUNT__ 行</p>
        <p>更新状态: __UPDATE_STATUS__</p>
    </div>
    <div class="card">
        <h2>V2Ray订阅</h2>
        <p>永久链接:</p>
        <div class="url">https://__GITHUB_OWNER__.github.io/__REPO_NAME__/v2ray-latest.txt</div>
        <p>源链接:</p>
        <div class="url">__V2RAY_SOURCE_URL__</div>
    </div>
    <div class="card">
        <h2>Clash订阅</h2>
        <p>永久链接:</p>
        <div class="url">https://__GITHUB_OWNER__.github.io/__REPO_NAME__/clash-latest.yaml</div>
        <p>源链接:</p>
        <div class="url">__CLASH_SOURCE_URL__</div>
    </div>
    <hr>
    <p>源项目: <a href="https://github.com/free-clash-v2ray/free-clash-v2ray.github.io" target="_blank">free-clash-v2ray.github.io</a></p>
    <p>更新频率: 每2天自动更新 | 由 <a href="https://github.com/__GITHUB_REPO__/actions" target="_blank">GitHub Actions</a> 驱动</p>
</body>
</html>
EOF

# 替换 HTML 中的占位符变量
REPO_NAME=$(echo "$GITHUB_REPOSITORY" | cut -d'/' -f2)
GITHUB_OWNER=$(echo "$GITHUB_REPOSITORY" | cut -d'/' -f1)

sed -i "s|__UPDATE_TIME__|$(date -u +'%Y-%m-%d %H:%M:%S UTC')|g" feeds/index.html
sed -i "s|__V2RAY_COUNT__|$V2RAY_COUNT|g" feeds/index.html
sed -i "s|__CLASH_COUNT__|$CLASH_COUNT|g" feeds/index.html
sed -i "s|__UPDATE_STATUS__|$UPDATE_STATUS|g" feeds/index.html
sed -i "s|__GITHUB_OWNER__|$GITHUB_OWNER|g" feeds/index.html
sed -i "s|__REPO_NAME__|$REPO_NAME|g" feeds/index.html
sed -i "s|__GITHUB_REPO__|$GITHUB_REPOSITORY|g" feeds/index.html
sed -i "s|__V2RAY_SOURCE_URL__|$V2RAY_URL|g" feeds/index.html
sed -i "s|__CLASH_SOURCE_URL__|$CLASH_URL|g" feeds/index.html

# ------------------------------------------------------------------------------
# 生成状态文件 (纯文本)
# ------------------------------------------------------------------------------
cat > feeds/latest_links.txt <<EOF
V2Ray: $V2RAY_URL
Clash: $CLASH_URL
V2Ray lines: $V2RAY_COUNT
Clash lines: $CLASH_COUNT
Update time: $(date -u +'%Y-%m-%d %H:%M:%S UTC')
Update status: $UPDATE_STATUS
Error messages: $ERROR_MSG
EOF

# ------------------------------------------------------------------------------
# 输出结果供后续步骤使用
# ------------------------------------------------------------------------------
echo "v2ray_count=$V2RAY_COUNT" >> $GITHUB_OUTPUT
echo "clash_count=$CLASH_COUNT" >> $GITHUB_OUTPUT
echo "update_status=$UPDATE_STATUS" >> $GITHUB_OUTPUT
echo "error_msg=$ERROR_MSG" >> $GITHUB_OUTPUT

echo "✅ 订阅源更新完成"
