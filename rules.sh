#！/垃圾/砰

#注：
#当脚本提示你提供专用配置链接时，请复制并使用你自己的Gist！的RAW链接！
# 
# 注意：
# 当脚本提示你提供专属配置链接时，请使用你自己的Gist的RAW链接！



#必填。
#
#如果你无法直接访问GitHub（例如因网络限制），请在这里设置代理URL前缀。
#请注意，前缀也会被添加到所有规则URL的开头。
#
#否则，留空!!
#
#示例：
#GLOBAL_GITHUB_PROXY_URL=“https：//my_github_proxy_url_prefix.com”



#必填。
#
#如果订阅过程失败，请修改该参数。（更多信息请参见 https://github.com/immortalwrt/homeproxy/pull/189。）
#
#否则，留空!!
#
#示例：SUBSCRIPTION_USER_AGENT=“Mozilla/5.0（Windows NT 10.0;Win64;x64）”
SUBSCRIPTION_USER_AGENT=""



#可选。
#
#如果定义好，脚本会调用嵌入的 homeproxy 订阅脚本，自动完成代理服务的订阅流程。
SUBSCRIPTION_URLS=（
  #更改为您自己的订阅网址。
  "https://dash.pqjc.site/api/v1/client/subscribe?token=fc9b60b018923d16b73dd854d48de691#机场01"
)



#必填。
RULESET_URLS=（
  #
  #“Your_Node_Name|
  #URL1
  #URL2
  #URL3
  # /绝对/文件/路径/file1.json
  # /absolute/file/path/file2.srs
  # ...”
  #

  #可选：如果你不需要任何广告规则，请删除整个“reject_out”定义。
  “reject_out|
https://raw.githubusercontent.com/privacy-protection-tools/anti-ad.github.io/master/docs/anti-ad-sing-box.srs”
  
  #
  #
  # ----------------- 规则集开始 -----------------
  #
  #

  “PROXY_SERVER_01_US|
/etc/homeproxy/ruleset/MyProxy.json
https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/refs/heads/sing/geo/geosite/google@cn.srs
https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/refs/heads/sing/geo/geosite/google-gemini.srs
https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/refs/heads/sing/geo/geosite/google-trust-services.srs
https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/refs/heads/sing/geo/geosite/google-trust-services@cn.srs
https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/refs/heads/sing/geo/geosite/google-play.srs
https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/refs/heads/sing/geo/geosite/google-play@cn.srs
https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/refs/heads/sing/geo/geosite/googlefcm.srs
https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/refs/heads/sing/geo/geosite/google.srs
https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/refs/heads/sing/geo/geoip/google.srs”

  “PROXY_SERVER_02_US|
/etc/homeproxy/ruleset/MyAI.json
https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/refs/heads/sing/geo/geosite/openai.srs
https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/refs/heads/sing/geo/geosite/bing.srs
https://raw.githubusercontent.com/KaringX/karing-ruleset/sing/geo/geoip/ai.srs
https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/refs/heads/sing/geo/geosite/telegram.srs
https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/refs/heads/sing/geo/geoip/telegram.srs
https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/refs/heads/sing/geo/geosite/discord.srs”
  
  “PROXY_SERVER_02_SG_With_Or_Without_Suffix|
https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/refs/heads/sing/geo/geosite/twitch.srs
https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/refs/heads/sing/geo/geosite/amazon.srs
https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/refs/heads/sing/geo/geosite/amazon@cn.srs
  https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/refs/heads/sing/geo/geosite/amazontrust.srs"
  
  "PROXY_SERVER_02_US_IPv6_AsBackup|
  https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/refs/heads/sing/geo/geosite/twitter.srs
  https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/refs/heads/sing/geo/geosite/x.srs
  https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/sing/geo/geoip/twitter.srs
  https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/refs/heads/sing/geo/geosite/tiktok.srs"
 
  # Optional: Delete the entire 'direct_out' definition if you don't need any domestic rules.
  "direct_out|
  /etc/homeproxy/ruleset/MyDirect.json
  https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/refs/heads/sing/geo/geosite/microsoft@cn.srs
  https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/refs/heads/sing/geo/geosite/azure@cn.srs
  https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/refs/heads/sing/geo/geosite/apple-cn.srs
  https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/refs/heads/sing/geo/geoip/cn.srs
  https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/refs/heads/sing/geo/geosite/cn.srs"
  
  #
  #
  #  -----------------  Rule-Sets end -----------------
  #
  #

)



#必填。
DNS_SERVERS=（
  #“Your_DNS_Server_Name|
  #DoH
  #交通部
  #UDP
  #更多信息请参见 https://sing-box.sagernet.org/configuration/dns/server。
  # ...
  # "
  #
  
  “PROXY_SERVER_01_US|
https://dns.google/dns-query”
  
  “PROXY_SERVER_02_US|
https://dns.google/dns-query”
  
  “PROXY_SERVER_02_SG_With_Or_Without_Suffix|
https://1.1.1.1/dns-query”
  
  “PROXY_SERVER_02_US_IPv6_AsBackup|
2001：4860：4860：0000：0000：0000：0000：8888”
  
  “Default_DNS_Server|
https://dns.google/dns-query
https://cloudflare-dns.com/dns-query
https://doh.opendns.com/dns-query”
)
