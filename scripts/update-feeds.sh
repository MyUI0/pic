#!/bin/bash
set -euo pipefail

echo "🔄 开始更新订阅源..."

V2RAY_COUNT=0
CLASH_COUNT=0
UPDATE_STATUS="success"
ERROR_MSG=""
ORIGINAL_DATE=""
LAST_DATE_FILE="./feeds/last_update_date.txt"
mkdir -p feeds

# 如果上次有记录，读一下（仅用于页面显示）
LAST_UPDATE_DATE="从未更新"
if [ -f "$LAST_DATE_FILE" ]; then
    LAST_UPDATE_DATE=$(cat "$LAST_DATE_FILE")
fi
echo "📜 上次源日期: ${LAST_UPDATE_DATE:-从未更新}"

# ============ 抓取 README ============
README_URL="https://raw.githubusercontent.com/free-clash-v2ray/free-clash-v2ray.github.io/main/README.md"
echo "🌐 抓取 README: $README_URL"
README_CONTENT=$(curl -skL "$README_URL" --max-time 30 --retry 2) || true

if [ -z "$README_CONTENT" ]; then
    echo "❌ README 获取失败，尝试备用镜像..."
    # 试试 Cloudflare/镜像加速
    README_CONTENT=$(curl -skL "https://gh.llkk.cc/https://raw.githubusercontent.com/free-clash-v2ray/free-clash-v2ray.github.io/main/README.md" --max-time 30 --retry 2) || true
fi

if [ -z "$README_CONTENT" ]; then
    UPDATE_STATUS="failure"
    ERROR_MSG="README 获取失败"
    echo "❌ $ERROR_MSG"
    ORIGINAL_DATE=$(cat "$LAST_DATE_FILE" 2>/dev/null || echo "未知")
fi

# 提取源中所有同链接
extract_all_urls() {
    local content="$1" ext="$2"
    echo "$content" | grep -oE "https://free-clash-v2ray\.github\.io/uploads/[0-9]{4}/[0-9]{2}/[0-9]+-[0-9]{8}\.$ext" || true
}

# ============ Clash（yaml）：合并所有文件 ============
CLASH_MERGED=""
CLASH_COUNT=0
if [ -n "$README_CONTENT" ]; then
    ALL_YAML=$(extract_all_urls "$README_CONTENT" yaml | awk -F'-' '{date=substr($NF,1,8); print date" "$0}' | sort -r | cut -d" " -f2-)

    if [ -n "$ALL_YAML" ]; then
        echo -e "\n🔍 发现当天所有 yaml 订阅链接，尝试合并..."
        TEMP_MERGED=$(mktemp)
        TOTAL_LINES=0
        FOUND_ANY=false

        for url in $ALL_YAML; do
            echo "  📥 $url"
            TMP=$(mktemp)
            if curl -skL "$url" -o "$TMP" --max-time 20 --retry 1; then
                cnt=$(wc -l < "$TMP" 2>/dev/null || 0)
                echo "    行数: $cnt"
                if [ "$cnt" -gt 5 ]; then
                    cat "$TMP" >> "$TEMP_MERGED"
                    TOTAL_LINES=$((TOTAL_LINES + cnt))
                    FOUND_ANY=true
                    echo "    ✅ 已合并"
                fi
            fi
            rm -f "$TMP"
        done

        if [ "$FOUND_ANY" = true ]; then
            # 去重（保留最后的配置头）
            CLASH_COUNT="$TOTAL_LINES"
            cp "$TEMP_MERGED" feeds/clash-latest.yaml
            echo "✅ Clash 合并完成，总行数: $CLASH_COUNT"
        else
            echo "⚠️  所有 yaml 文件均为空或无法下载"
            echo "# Clash 所有节点文件下载失败" > feeds/clash-latest.yaml
            CLASH_COUNT=0
            UPDATE_STATUS="partial_failure"
            ERROR_MSG+="Clash全部无效;"
        fi
        rm -f "$TEMP_MERGED"
    else
        echo "# 未找到 Clash 链接" > feeds/clash-latest.yaml
        CLASH_COUNT=0
        UPDATE_STATUS="partial_failure"
        ERROR_MSG+="未找到Clash链接;"
    fi
fi

# ============ V2Ray（txt）：合并所有文件 ============
V2RAY_COUNT=0
if [ -n "$README_CONTENT" ]; then
    ALL_TXT=$(extract_all_urls "$README_CONTENT" txt | awk -F'-' '{date=substr($NF,1,8); print date" "$0}' | sort -r | cut -d" " -f2-)

    if [ -n "$ALL_TXT" ]; then
        echo -e "\n🔍 发现当天所有 txt 订阅链接，尝试合并..."
        TEMP_MERGED=$(mktemp)
        TOTAL_LINES=0
        FOUND_ANY=false

        for url in $ALL_TXT; do
            echo "  📥 $url"
            TMP=$(mktemp)
            if curl -skL "$url" -o "$TMP" --max-time 20 --retry 1; then
                cnt=$(wc -l < "$TMP" 2>/dev/null || 0)
                echo "    行数: $cnt"
                if [ "$cnt" -gt 5 ]; then
                    cat "$TMP" >> "$TEMP_MERGED"
                    TOTAL_LINES=$((TOTAL_LINES + cnt))
                    FOUND_ANY=true
                    echo "    ✅ 已合并"
                fi
            fi
            rm -f "$TMP"
        done

        if [ "$FOUND_ANY" = true ]; then
            V2RAY_COUNT="$TOTAL_LINES"
            cp "$TEMP_MERGED" feeds/v2ray-latest.txt
            echo "✅ V2Ray 合并完成，总行数: $V2RAY_COUNT"
        else
            echo "⚠️  所有 txt 文件均为空或无法下载"
            echo "# V2Ray 所有节点文件下载失败" > feeds/v2ray-latest.txt
            V2RAY_COUNT=0
            UPDATE_STATUS="partial_failure"
            ERROR_MSG+="V2Ray全部无效;"
        fi
        rm -f "$TEMP_MERGED"
    else
        echo "# 未找到 V2Ray 链接" > feeds/v2ray-latest.txt
        V2RAY_COUNT=0
        UPDATE_STATUS="partial_failure"
        ERROR_MSG+="未找到V2Ray链接;"
    fi
fi

# ============ 提取源日期（从任意一个链接中提取） ============
extract_date() {
    local all_links
    all_links=$(extract_all_urls "$README_CONTENT" txt)
    if [ -z "$all_links" ]; then
        all_links=$(extract_all_urls "$README_CONTENT" yaml)
    fi
    echo "$all_links" | grep -oE '[0-9]{8}' | head -n1 | sed -E 's/(....)(..)(..)/\1-\2-\3/'
}

if [ -n "$README_CONTENT" ]; then
    ORIGINAL_DATE=$(extract_date)
fi
ORIGINAL_DATE="${ORIGINAL_DATE:-未知}"
echo -e "\n📅 本次源日期: $ORIGINAL_DATE"

# 记录本次日期
echo "$ORIGINAL_DATE" > "$LAST_DATE_FILE"

# ============ 生成 index.html（简洁干净） ============
REPO_NAME="${GITHUB_REPOSITORY#*/}"
GITHUB_OWNER="${GITHUB_REPOSITORY%%/*}"
UPDATE_TIME=$(date -u +'%Y-%m-%d %H:%M:%S UTC')

# 显示状态中文
case "$UPDATE_STATUS" in
    success) STATUS_ICON="✅"; STATUS_TEXT="正常" ;;
    partial_failure) STATUS_ICON="⚠️"; STATUS_TEXT="部分失败" ;;
    failure) STATUS_ICON="❌"; STATUS_TEXT="失败" ;;
    *) STATUS_ICON="❓"; STATUS_TEXT="未知" ;;
esac

BASE_URL="https://${GITHUB_OWNER}.github.io/${REPO_NAME}"

cat > feeds/index.html << 'PAGE_EOF'
<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
<title>订阅更新</title>
<style>
  :root {
    --bg: #f8f9fa;
    --card: #ffffff;
    --text: #1a1a2e;
    --muted: #6c757d;
    --accent: #4361ee;
    --border: #e9ecef;
    --radius: 12px;
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    background: var(--bg);
    color: var(--text);
    line-height: 1.6;
    padding: 24px 16px;
    max-width: 640px;
    margin: 0 auto;
    -webkit-font-smoothing: antialiased;
  }
  h1 {
    font-size: 24px;
    font-weight: 700;
    margin-bottom: 20px;
    letter-spacing: -0.3px;
  }
  .card {
    background: var(--card);
    border-radius: var(--radius);
    padding: 20px;
    margin-bottom: 16px;
    box-shadow: 0 1px 3px rgba(0,0,0,0.06);
    border: 1px solid var(--border);
  }
  .card h2 {
    font-size: 15px;
    font-weight: 600;
    color: var(--muted);
    margin-bottom: 12px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
  .stat-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px 0;
    border-bottom: 1px solid var(--border);
    font-size: 14px;
  }
  .stat-row:last-child { border-bottom: none; }
  .stat-label { color: var(--muted); }
  .stat-value { font-weight: 600; }
  .url-box {
    background: var(--bg);
    border-radius: 8px;
    padding: 12px;
    font-size: 13px;
    font-family: "SF Mono", "Fira Code", "Fantasque Sans Mono", monospace;
    word-break: break-all;
    margin-top: 8px;
    color: var(--accent);
    user-select: all;
    border: 1px solid var(--border);
  }
  .url-box::before {
    content: "📋 点击全选复制";
    display: block;
    font-size: 11px;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    color: var(--muted);
    margin-bottom: 6px;
    user-select: none;
  }
  .status-badge {
    display: inline-block;
    padding: 2px 10px;
    border-radius: 20px;
    font-size: 13px;
    font-weight: 600;
  }
  .status-success { background: #d3f9d8; color: #2b8a3e; }
  .status-warning { background: #fff3bf; color: #e67700; }
  .status-danger  { background: #ffe0e0; color: #c92a2a; }
  .footer {
    text-align: center;
    font-size: 12px;
    color: var(--muted);
    margin-top: 24px;
  }
</style>
</head>
<body>

<h1>📡 订阅更新</h1>

<div class="card">
  <h2>📊 状态</h2>
  <div class="stat-row">
    <span class="stat-label">状态</span>
    <span class="stat-value"><span class="status-badge status-PLACEHOLDER_STATUS_CLASS">PLACEHOLDER_STATUS_ICON PLACEHOLDER_STATUS_TEXT</span></span>
  </div>
  <div class="stat-row">
    <span class="stat-label">更新时间</span>
    <span class="stat-value">PLACEHOLDER_UPDATE_TIME</span>
  </div>
  <div class="stat-row">
    <span class="stat-label">源日期</span>
    <span class="stat-value">PLACEHOLDER_ORIGINAL_DATE</span>
  </div>
  <div class="stat-row">
    <span class="stat-label">上次源日期</span>
    <span class="stat-value">PLACEHOLDER_LAST_DATE</span>
  </div>
</div>

<div class="card">
  <h2>📦 订阅</h2>
  <div class="stat-row">
    <span class="stat-label">V2Ray</span>
    <span class="stat-value">PLACEHOLDER_V2RAY_COUNT 行</span>
  </div>
  <div class="stat-row">
    <span class="stat-label">Clash</span>
    <span class="stat-value">PLACEHOLDER_CLASH_COUNT 行</span>
  </div>
</div>

<div class="card">
  <h2>🔗 订阅链接</h2>
  <div class="url-box">PLACEHOLDER_V2RAY_URL</div>
  <div style="height:8px"></div>
  <div class="url-box">PLACEHOLDER_CLASH_URL</div>
</div>

<div class="footer">
  Generated by GitHub Actions
</div>

</body>
</html>
PAGE_EOF

# 用 sed 替换占位符
STATUS_CLASS="status-success"
if [ "$UPDATE_STATUS" = "partial_failure" ]; then STATUS_CLASS="status-warning"
elif [ "$UPDATE_STATUS" = "failure" ]; then STATUS_CLASS="status-danger"
fi

V2RAY_URL="${BASE_URL}/v2ray-latest.txt"
CLASH_URL="${BASE_URL}/clash-latest.yaml"
LAST_DATE_DISPLAY="${LAST_UPDATE_DATE:-从未更新}"

sed -i \
  -e "s/PLACEHOLDER_STATUS_CLASS/$STATUS_CLASS/g" \
  -e "s/PLACEHOLDER_STATUS_ICON/$STATUS_ICON/g" \
  -e "s/PLACEHOLDER_STATUS_TEXT/$STATUS_TEXT/g" \
  -e "s/PLACEHOLDER_UPDATE_TIME/$UPDATE_TIME/g" \
  -e "s/PLACEHOLDER_ORIGINAL_DATE/$ORIGINAL_DATE/g" \
  -e "s/PLACEHOLDER_LAST_DATE/$LAST_DATE_DISPLAY/g" \
  -e "s/PLACEHOLDER_V2RAY_COUNT/$V2RAY_COUNT/g" \
  -e "s/PLACEHOLDER_CLASH_COUNT/$CLASH_COUNT/g" \
  -e "s|PLACEHOLDER_V2RAY_URL|$V2RAY_URL|g" \
  -e "s|PLACEHOLDER_CLASH_URL|$CLASH_URL|g" \
  feeds/index.html

echo "✅ 页面已生成"

# ============ 输出给 GitHub Actions ============
echo "v2ray_count=$V2RAY_COUNT" >> "$GITHUB_OUTPUT"
echo "clash_count=$CLASH_COUNT" >> "$GITHUB_OUTPUT"
echo "update_status=$UPDATE_STATUS" >> "$GITHUB_OUTPUT"
echo "original_date=$ORIGINAL_DATE" >> "$GITHUB_OUTPUT"

echo -e "\n✅ 完成"
echo "   V2Ray: $V2RAY_COUNT 行"
echo "   Clash: $CLASH_COUNT 行"
echo "   源日期: $ORIGINAL_DATE"
echo "   状态: $UPDATE_STATUS"
