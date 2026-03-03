#!/bin/bash
set -euo pipefail

echo "🔄 开始更新订阅源..."

# 初始化变量
V2RAY_COUNT=0
CLASH_COUNT=0
UPDATE_STATUS="success"
ERROR_MSG=""
ORIGINAL_DATE="未知"
LAST_DATE_FILE="./feeds/last_update_date.txt"
mkdir -p feeds

# 读取上次更新的日期（用于对比）
if [ -f "$LAST_DATE_FILE" ]; then
    LAST_UPDATE_DATE=$(cat "$LAST_DATE_FILE")
else
    LAST_UPDATE_DATE="从未更新"
fi
echo "📜 上次更新日期: $LAST_UPDATE_DATE"

# 1. 获取目标README内容（增强错误处理）
README_URL="https://raw.githubusercontent.com/free-clash-v2ray/free-clash-v2ray.github.io/main/README.md"
echo "🌐 正在抓取README: $README_URL"
README_CONTENT=$(curl -s -L "$README_URL" --max-time 30 --retry 2 2>/tmp/curl_error.log || "")

# 检查README抓取结果
if [ -z "$README_CONTENT" ]; then
    UPDATE_STATUS="failure"
    ERROR_MSG+="无法获取README内容; $(cat /tmp/curl_error.log 2>/dev/null)"
    echo "❌ README抓取失败: $ERROR_MSG"
else
    echo "✅ README抓取成功，内容长度: ${#README_CONTENT} 字符"
fi

# 2. 核心：提取最新链接（无硬编码）
extract_latest_url() {
    local content="$1" ext="$2"
    # 精准匹配目标链接格式
    local links=$(echo "$content" | grep -oE "https://free-clash-v2ray\.github\.io/uploads/[0-9]{4}/[0-9]{2}/[0-9]+-[0-9]{8}\.$ext" || true)
    
    if [ -z "$links" ]; then
        echo ""
        return
    fi

    # 按日期排序取最新
    echo "$links" | awk -F'-' '
        {
            date_str = substr($NF, 1, 8)
            print date_str " " $0
        }' | sort -r | head -n1 | cut -d" " -f2- | head -n1
}

# 获取最新链接（无默认值）
V2RAY_URL=$( [ -n "$README_CONTENT" ] && extract_latest_url "$README_CONTENT" txt )
CLASH_URL=$( [ -n "$README_CONTENT" ] && extract_latest_url "$README_CONTENT" yaml )

# 3. 验证链接并提取日期（核心改进：无硬编码）
extract_formatted_date() {
    local url="$1"
    local d=$(echo "$url" | grep -oE '[0-9]{8}' | head -n1)
    [ -n "$d" ] && echo "${d:0:4}-${d:4:2}-${d:6:2}" || echo "未知"
}

# 处理V2Ray链接
if [ -n "$V2RAY_URL" ]; then
    ORIGINAL_DATE=$(extract_formatted_date "$V2RAY_URL")
    echo "🔗 找到最新V2Ray链接: $V2RAY_URL (日期: $ORIGINAL_DATE)"
    
    # 下载V2Ray内容
    if curl -s -L "$V2RAY_URL" -o feeds/v2ray-latest.txt --max-time 30 --retry 2; then
        V2RAY_COUNT=$(wc -l < feeds/v2ray-latest.txt 2>/dev/null || 0)
        echo "📥 V2Ray下载成功，共 $V2RAY_COUNT 行"
    else
        echo "# 未获取到有效V2Ray订阅源 (获取时间: $(date -u))" > feeds/v2ray-latest.txt
        UPDATE_STATUS="partial_failure"
        ERROR_MSG+="V2Ray内容下载失败; "
        echo "❌ V2Ray内容下载失败"
    fi
else
    echo "# 未找到最新V2Ray订阅链接 (获取时间: $(date -u))" > feeds/v2ray-latest.txt
    UPDATE_STATUS="partial_failure"
    ERROR_MSG+="未找到V2Ray链接; "
    echo "❌ 未找到任何V2Ray链接"
fi

# 处理Clash链接
if [ -n "$CLASH_URL" ]; then
    CLASH_DATE=$(extract_formatted_date "$CLASH_URL")
    echo "🔗 找到最新Clash链接: $CLASH_URL (日期: $CLASH_DATE)"
    
    # 下载Clash内容
    if curl -s -L "$CLASH_URL" -o feeds/clash-latest.yaml --max-time 30 --retry 2; then
        CLASH_COUNT=$(wc -l < feeds/clash-latest.yaml 2>/dev/null || 0)
        echo "📥 Clash下载成功，共 $CLASH_COUNT 行"
    else
        echo "# 未获取到有效Clash订阅源 (获取时间: $(date -u))" > feeds/clash-latest.yaml
        UPDATE_STATUS="partial_failure"
        ERROR_MSG+="Clash内容下载失败; "
        echo "❌ Clash内容下载失败"
    fi
else
    echo "# 未找到最新Clash订阅链接 (获取时间: $(date -u))" > feeds/clash-latest.yaml
    UPDATE_STATUS="partial_failure"
    ERROR_MSG+="未找到Clash链接; "
    echo "❌ 未找到任何Clash链接"
fi

# 4. 记录本次更新日期（用于下次对比）
echo "$ORIGINAL_DATE" > "$LAST_DATE_FILE"

# 5. 生成页面（保留原有功能）
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
.update-status{color:green;font-weight:bold}
.update-failure{color:red;font-weight:bold}
</style>
<h1>📡 订阅代理服务</h1>
<div class="card">
  <h2>📊 更新状态</h2>
  <p>✅ 最后更新: $UPDATE_TIME</p>
  <p>上次更新日期: $LAST_UPDATE_DATE</p>
  <p>本次源日期: $ORIGINAL_DATE</p>
  <p>V2Ray: $V2RAY_COUNT 行</p>
  <p>Clash: $CLASH_COUNT 行</p>
  <p class="$([ "$UPDATE_STATUS" = "success" ] && echo "update-status" || echo "update-failure")">
    状态: $([ "$UPDATE_STATUS" = "success" ] && echo "✅ 全部成功" || echo "❌ 部分/全部失败")
  </p>
  $( [ -n "$ERROR_MSG" ] && echo "<p>错误信息: $ERROR_MSG</p>" )
</div>
<div class="card">
  <h2>V2Ray</h2><div class="url">https://$GITHUB_OWNER.github.io/$REPO_NAME/v2ray-latest.txt</div>
  <h2>Clash</h2><div class="url">https://$GITHUB_OWNER.github.io/$REPO_NAME/clash-latest.yaml</div>
</div>
EOF

# 记录原始链接（用于排查）
cat > feeds/latest_links.txt <<EOF
V2Ray原始链接: ${V2RAY_URL:-"未找到"}
Clash原始链接: ${CLASH_URL:-"未找到"}
源日期: $ORIGINAL_DATE
上次更新日期: $LAST_UPDATE_DATE
本次更新时间: $UPDATE_TIME
错误信息: ${ERROR_MSG:-"无"}
EOF

# 输出GitHub Action变量
echo "v2ray_count=$V2RAY_COUNT" >> "$GITHUB_OUTPUT"
echo "clash_count=$CLASH_COUNT" >> "$GITHUB_OUTPUT"
echo "update_status=$UPDATE_STATUS" >> "$GITHUB_OUTPUT"
echo "error_msg=$ERROR_MSG" >> "$GITHUB_OUTPUT"
echo "original_date=$ORIGINAL_DATE" >> "$GITHUB_OUTPUT"
echo "last_update_date=$LAST_UPDATE_DATE" >> "$GITHUB_OUTPUT"

echo "✅ 更新流程完成（最终状态: $UPDATE_STATUS）"
