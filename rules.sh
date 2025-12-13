#!/bin/bash
# Homeproxy自动生成配置脚本（修正版）

# 订阅链接：用?remark=分隔URL和标签，避免#锚点截断
SUBSCRIPTION_URLS=(
  "https://dash.pqjc.site/api/v1/client/subscribe?token=fc9b60b018923d16b73dd854d48de691&remark=机场01"
  "https://airport02.subscription.url/subscribe?token=yyyy&remark=机场02"
)

# RULESET_URLS：换行转义为\，URL用空格分隔；替换无效本地文件为公开规则
RULESET_URLS=(
  # 替换无效的adblockdns.srs为公开广告拦截规则
  "reject_out|https://raw.githubusercontent.com/Loyalsoldier/dnsmasq-china-list/master/anti-ad.conf"

  "HK_proxy_server_01|\
  https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/sing/geo/geosite/google.srs \
  https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/sing/geo/geosite/googlefcm.srs \
  https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/sing/geo/geosite/google-play.srs \
  https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/sing/geo/geosite/google-cn.srs \
  https://raw.githubusercontent.com/KaringX/karing-ruleset/sing/geo/geosite/google-trust-services@cn.srs \
  https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/sing/geo/geosite/google-gemini.srs \
  https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/sing/geo/geoip/google.srs"

  "SG_proxy_server_01|\
  https://raw.githubusercontent.com/SagerNet/sing-geosite/refs/heads/rule-set/geosite-openai.srs \
  https://raw.githubusercontent.com/SagerNet/sing-geosite/refs/heads/rule-set/geosite-bing.srs \
  https://raw.githubusercontent.com/KaringX/karing-ruleset/sing/geo/geoip/ai.srs"

  "SG_proxy_server_02|\
  https://raw.githubusercontent.com/SagerNet/sing-geosite/refs/heads/rule-set/geosite-discord.srs \
  https://raw.githubusercontent.com/SagerNet/sing-geosite/refs/heads/rule-set/geosite-twitch.srs \
  https://raw.githubusercontent.com/SagerNet/sing-geosite/refs/heads/rule-set/geosite-amazon.srs \
  https://raw.githubusercontent.com/SagerNet/sing-geosite/refs/heads/rule-set/geosite-amazon@cn.srs \
  https://raw.githubusercontent.com/SagerNet/sing-geosite/refs/heads/rule-set/geosite-amazontrust.srs"

  "US_proxy_server_02|\
  https://raw.githubusercontent.com/SagerNet/sing-geosite/refs/heads/rule-set/geosite-twitter.srs \
  https://raw.githubusercontent.com/SagerNet/sing-geosite/refs/heads/rule-set/geosite-x.srs \
  https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/sing/geo/geoip/twitter.srs \
  https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/sing/geo/geosite/tiktok.srs"
  
  "US_IPV6_proxy_server_02|\
  https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/sing/geo/geosite/telegram.srs \
  https://raw.githubusercontent.com/DustinWin/ruleset_geodata/sing-box-ruleset/telegramip.srs"
  
  # 替换无效的MyDirect.json为公开国内直连规则
  "direct_out|\
  https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/sing/geo/geoip/cn.srs \
  https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/sing/geo/geosite/cn.srs"
)

# DNS_SERVERS：删除重复项，规范rcode格式（同行空格分隔）
DNS_SERVERS=(
  "HK_proxy_server_01|https://1.1.1.1/dns-query"
  "SG_proxy_server_01|https://1.1.1.1/dns-query"
  "SG_proxy_server_02|https://1.1.1.1/dns-query"  # 补充遗漏的SG_proxy_server_02
  "US_proxy_server_02|https://1.1.1.1/dns-query"
  "US_IPV6_proxy_server_02|https://1.1.1.1/dns-query"
  
  # Default DNS：rcode://refused与URL同行，空格分隔
  "Default_DNS_Server|https://8.8.8.8/dns-query rcode://refused"
)

# 新增核心字段：解决null不可迭代错误（空数组即可）
urltest_nodes=()

# 可选：添加PROXY_SERVERS空数组（避免后续解析错误）
PROXY_SERVERS=()

# 可选：添加SING_BOX基础配置
SING_BOX_SETTINGS=(
  "log_level|info"
  "inet4_address|0.0.0.0"
  "inet6_address|::"
)
