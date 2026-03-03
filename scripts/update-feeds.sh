#!/bin/bash
set -euo pipefail  # 严格模式：未定义变量/管道失败均退出
# 解决中文/特殊字符编码问题
export LC_ALL=C.UTF-8

# ===================== 1. 基础配置 =====================
# 目录配置（按需修改）
PROJECT_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd")
FEEDS_DIR="${PROJECT_ROOT}/feeds"
LOG_DIR="${PROJECT_ROOT}/logs"
# 源站基础配置
BASE_URL="https://free-clash-v2ray.github.io/uploads"
PREFIXES=(0 1 2 3 4)  # 源站的文件前缀（0-4）
# 时间配置（UTC时间，和源站一致）
TODAY=$(date -u +'%Y%m%d')          # 20260301
TODAY_HUMAN=$(date -u +'%Y-%m-%d')  # 2026-03-01
MONTH_DIR=$(date -u +'%Y/%m')       # 2026/03
UPDATE_TIME=$(date -u +'%Y-%m-%d %H:%M:%S UTC')

# ===================== 2. 目录初始化 =====================
mkdir -p "${FEEDS_DIR}" "${LOG_DIR}"
# 清空旧内容（避免残留）
> "${FEEDS_DIR}/v2ray-latest.txt"
> "${FEEDS_DIR}/clash-latest.yaml"
> "${FEEDS_DIR}/latest_links.txt"

# ===================== 3. 拉取订阅源（多前缀） =====================
echo -e "\n📥 开始拉取 ${TODAY_HUMAN} 的订阅源（前缀：${PREFIXES[*]}）..."
for prefix in "${PREFIXES[@]}"; do
    # 拼接单个文件链接
    v2ray_url="${BASE_URL}/${MONTH_DIR}/${prefix}-${TODAY}.txt"
    clash_url="${BASE_URL}/${MONTH_DIR}/${prefix}-${TODAY}.yaml"
    
    # 拉取V2Ray文件（静默模式，失败跳过）
    if curl -s --head --fail "${v2ray_url}" >/dev/null 2>&1; then
        echo "✅ 拉取V2Ray[${prefix}]: ${v2ray_url}"
        curl -s "${v2ray_url}" >> "${FEEDS_DIR}/v2ray-latest.txt"
        # 写入链接到汇总文件
        echo "V2Ray[${prefix}]: ${v2ray_url}" >> "${FEEDS_DIR}/latest_links.txt"
    else
        echo "❌ V2Ray[${prefix}]链接不存在: ${v2ray_url}"
    fi

    # 拉取Clash文件（静默模式，失败跳过）
    if curl -s --head --fail "${clash_url}" >/dev/null 2>&1; then
        echo "✅ 拉取Clash[${prefix}]: ${clash_url}"
        curl -s "${clash_url}" >> "${FEEDS_DIR}/clash-latest.yaml"
        # 写入链接到汇总文件
        echo "Clash[${prefix}]: ${clash_url}" >> "${FEEDS_DIR}/latest_links.txt"
    else
        echo "❌ Clash[${prefix}]链接不存在: ${clash_url}"
    fi
done

# ===================== 4. 容错处理：当日无文件则回退昨日 =====================
V2RAY_EMPTY=$(wc -l < "${FEEDS_DIR}/v2ray-latest.txt")
CLASH_EMPTY=$(wc -l < "${FEEDS_DIR}/clash-latest.yaml")
if [ "${V2RAY_EMPTY}" -eq 0 ] && [ "${CLASH_EMPTY}" -eq 0 ]; then
    echo -e "\n⚠️ 当日(${TODAY_HUMAN})无有效文件，回退到昨日..."
    # 重新计算昨日日期
    YESTERDAY=$(date -u -d "yesterday" +'%Y%m%d')
    YESTERDAY_HUMAN=$(date -u -d "yesterday" +'%Y-%m-%d')
    YESTERDAY_MONTH=$(date -u -d "yesterday" +'%Y/%m')
    # 重新拉取昨日文件
    for prefix in "${PREFIXES[@]}"; do
        v2ray_url="${BASE_URL}/${YESTERDAY_MONTH}/${prefix}-${YESTERDAY}.txt"
        clash_url="${BASE_URL}/${YESTERDAY_MONTH}/${prefix}-${YESTERDAY}.yaml"
        if curl -s --head --fail "${v2ray_url}" >/dev/null 2>&1; then
            curl -s "${v2ray_url}" >> "${FEEDS_DIR}/v2ray-latest.txt"
            echo "V2Ray[${prefix}](昨日): ${v2ray_url}" >> "${FEEDS_DIR}/latest_links.txt"
        fi
        if curl -s --head --fail "${clash_url}" >/dev/null 2>&1; then
            curl -s "${clash_url}" >> "${FEEDS_DIR}/clash-latest.yaml"
            echo "Clash[${prefix}](昨日): ${clash_url}" >> "${FEEDS_DIR}/latest_links.txt"
        fi
    done
    # 更新源日期为昨日
    TODAY_HUMAN="${YESTERDAY_HUMAN}"
fi

# ===================== 5. 更新索引文件 & 汇总信息 =====================
echo -e "\n📝 更新索引文件..."
# 补充汇总文件的基础信息
echo -e "\nSource date: ${TODAY_HUMAN}" >> "${FEEDS_DIR}/latest_links.txt"
echo "Update time: ${UPDATE_TIME}" >> "${FEEDS_DIR}/latest_links.txt"

# 更新index.html（替换源日期和最后更新时间）
# 先检查index.html是否存在，不存在则创建基础模板
if [ ! -f "${FEEDS_DIR}/index.html" ]; then
    cat > "${FEEDS_DIR}/index.html" << EOF
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <title>订阅代理服务</title>
</head>
<body>
<h1>📡 订阅代理服务</h1>
<div class="card">
  <h2>📊 更新状态</h2>
  <p>✅ 最后更新: ${UPDATE_TIME}</p>
  <p>源日期: ${TODAY_HUMAN}</p>
  <p>V2Ray: 0 行</p>
  <p>Clash: 0 行</p>
</div>
</body>
</html>
EOF
else
    # 替换已有内容
    sed -i.bak "s/最后更新: .*/最后更新: ${UPDATE_TIME}/g" "${FEEDS_DIR}/index.html"
    sed -i.bak "s/源日期: .*/源日期: ${TODAY_HUMAN}/g" "${FEEDS_DIR}/index.html"
    rm -f "${FEEDS_DIR}/index.html.bak"  # 删除sed备份文件
fi

# 统计行数并更新index.html
V2RAY_LINES=$(wc -l < "${FEEDS_DIR}/v2ray-latest.txt")
CLASH_LINES=$(wc -l < "${FEEDS_DIR}/clash-latest.yaml")
sed -i.bak "s/V2Ray: .*/V2Ray: ${V2RAY_LINES} 行/g" "${FEEDS_DIR}/index.html"
sed -i.bak "s/Clash: .*/Clash: ${CLASH_LINES} 行/g" "${FEEDS_DIR}/index.html"
rm -f "${FEEDS_DIR}/index.html.bak"

# ===================== 6. 输出最终统计 & 标记变化 =====================
echo -e "\n✅ 更新完成！最终统计："
echo "├── 源日期: ${TODAY_HUMAN}"
echo "├── 最后更新: ${UPDATE_TIME}"
echo "├── V2Ray节点行数: ${V2RAY_LINES}"
echo "├── Clash节点行数: ${CLASH_LINES}"

# 标记是否有真实内容变化（供Action判断是否提交）
if [ "${V2RAY_LINES}" -gt 0 ] || [ "${CLASH_LINES}" -gt 0 ]; then
    echo "has_real_change=true" >> "${GITHUB_OUTPUT:-/dev/null}"
else
    echo "has_real_change=false" >> "${GITHUB_OUTPUT:-/dev/null}"
    echo "⚠️ 无有效节点内容，本次不提交Git"
fi

# 保存日志
echo -e "\n===== $(date -u) =====\n源日期: ${TODAY_HUMAN} | V2Ray: ${V2RAY_LINES}行 | Clash: ${CLASH_LINES}行\n" >> "${LOG_DIR}/update-feeds.log"
