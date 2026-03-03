#!/bin/bash
set -euo pipefail

echo "🔄 开始更新订阅源..."

V2RAY_COUNT=0
CLASH_COUNT=0
UPDATE_STATUS="success"
ERROR_MSG=""
ORIGINAL_DATE="未知"
LAST_DATE_FILE="./feeds/last_update_date.txt"
mkdir -p feeds

# 读取上次日期
if [ -f "$LAST_DATE_FILE" ]; then
    LAST_UPDATE_DATE=$(cat "$LAST_DATE_FILE")
else
    LAST_UPDATE_DATE="从未更新"
fi
echo "📜 上次源日期: $LAST_UPDATE_DATE"

README_URL="https://raw.githubusercontent.com/free-clash-v2ray/free-clash-v2ray.github.io/main/README.md"
echo "🌐 抓取 README: $README_URL"
README_CONTENT=$(curl -s -L "$README_URL" --max-time 30 --retry 2 2>/dev/null || "")

if [ -z "$README_CONTENT" ]; then
    UPDATE_STATUS="failure"
    ERROR_MSG="README 获取失败"
    echo "❌ $ERROR_MSG"
fi

# 提取同一天所有 txt / yaml
extract_all_urls() {
    local content="$1" ext="$2"
    echo "$content" | grep -oE "https://free-clash-v2ray\.github\.io/uploads/[0-9]{4}/[0-9]{2}/[0-9]+-[0-9]{8}\.$ext" || true
}

# ==================== Clash 逻辑不变 ====================
CLASH_URL=""
if [ -n "$README_CONTENT" ]; then
    CLASH_URL=$(extract_all_urls "$README_CONTENT" yaml | awk -F'-' '{date=substr($NF,1,8); print date" "$0}' | sort -r | head -n1 | cut -d" " -f2-)
fi

if [ -n "$CLASH_URL" ]; then
    echo "🔗 Clash 链接: $CLASH_URL"
    if curl -s -L "$CLASH_URL" -o feeds/clash-latest.yaml --max-time 30 --retry 2; then
        CLASH_COUNT=$(wc -l < feeds/clash-latest.yaml 2>/dev/null || 0)
        echo "📥 Clash 行数: $CLASH_COUNT"
    else
        echo "# Clash 下载失败" > feeds/clash-latest.yaml
        CLASH_COUNT=0
        UPDATE_STATUS="partial_failure"
        ERROR_MSG+="Clash下载失败;"
    fi
else
    echo "# 未找到 Clash 链接" > feeds/clash-latest.yaml
    CLASH_COUNT=0
    UPDATE_STATUS="partial_failure"
    ERROR_MSG+="未找到Clash;"
fi

# ==================== V2Ray 核心修复 ====================
V2RAY_URL=""
if [ -n "$README_CONTENT" ]; then
    # 拿到同一天所有 txt
    ALL_TXT=$(extract_all_urls "$README_CONTENT" txt)
    if [ -n "$ALL_TXT" ]; then
        # 按日期从新到旧排
        ALL_TXT_SORTED=$(echo "$ALL_TXT" | awk -F'-' '{date=substr($NF,1,8); print date" "$0}' | sort -r | cut -d" " -f2-)
        echo -e "\n🔍 发现当天所有 txt："
        echo "$ALL_TXT_SORTED"
        
        # 遍历找第一个有效（行数>10）
        FOUND_VALID_V2RAY=""
        for url in $ALL_TXT_SORTED; do
            echo -e "\n🧪 测试: $url"
            TMP=$(mktemp)
            if curl -s -L "$url" -o "$TMP" --max-time 20 --retry 1; then
                cnt=$(wc -l < "$TMP" 2>/dev/null || 0)
                echo "   行数: $cnt"
                # 正常节点文件一般远大于10行
                if [ "$cnt" -gt 10 ]; then
                    FOUND_VALID_V2RAY="$url"
                    V2RAY_COUNT="$cnt"
                    cp "$TMP" feeds/v2ray-latest.txt
                    echo "✅ 找到有效 V2Ray 链接"
                    break
                fi
            fi
            rm -f "$TMP"
        done

        if [ -n "$FOUND_VALID_V2RAY" ]; then
            V2RAY_URL="$FOUND_VALID_V2RAY"
        else
            echo "# 未找到有效V2Ray节点文件(都是编码/空文件)" > feeds/v2ray-latest.txt
            V2RAY_COUNT=0
            UPDATE_STATUS="partial_failure"
            ERROR_MSG+="无有效V2Ray节点;"
        fi
    else
        echo "# 未找到任何 V2Ray 链接" > feeds/v2ray-latest.txt
        V2RAY_COUNT=0
        UPDATE_STATUS="partial_failure"
        ERROR_MSG+="未找到V2Ray链接;"
    fi
fi

# 提取源日期
extract_date() {
    echo "$1" | grep -oE '[0-9]{8}' | head -n1 | sed -E 's/(....)(..)(..)/\1-\2-\3/'
}
ORIGINAL_DATE=$(extract_date "${V2RAY_URL:-$CLASH_URL}" || echo "未知")
echo -e "\n📅 本次源日期: $ORIGINAL_DATE"

# 记录上次日期
echo "$ORIGINAL_DATE" > "$LAST_DATE_FILE"

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
  <p>最后更新: $UPDATE_TIME</p>
  <p>上次源日期: $LAST_UPDATE_DATE</p>
  <p>本次源日期: $ORIGINAL_DATE</p>
  <p>V2Ray: $V2RAY_COUNT 行</p>
  <p>Clash: $CLASH_COUNT 行</p>
  <p>状态: $UPDATE_STATUS</p>
</div>
<div class="card">
  <h2>V2Ray</h2><div class="url">https://$GITHUB_OWNER.github.io/$REPO_NAME/v2ray-latest.txt</div>
  <h2>Clash</h2><div class="url">https://$GITHUB_OWNER.github.io/$REPO_NAME/clash-latest.yaml</div>
</div>
EOF

# 输出变量
echo "v2ray_count=$V2RAY_COUNT" >> "$GITHUB_OUTPUT"
echo "clash_count=$CLASH_COUNT" >> "$GITHUB_OUTPUT"
echo "update_status=$UPDATE_STATUS" >> "$GITHUB_OUTPUT"
echo "original_date=$ORIGINAL_DATE" >> "$GITHUB_OUTPUT"

echo -e "\n✅ 完成"
