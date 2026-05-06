const STORE_KEY = "heaizo_auto_token"
const DOMAIN = "chatclient.heaizo.com"

// 【自动抓取】仅匹配小程序域名，有token就存，绝对触发
if (typeof $request !== "undefined") {
  // 只处理目标域名，不干扰其他请求
  if ($request.host.includes(DOMAIN)) {
    const token = $request.headers.token
    const ua = $request.headers["User-Agent"]
    if (token) {
      $persistentStore.write(JSON.stringify({ token, ua }), STORE_KEY)
      $notification.post("✅ 自动抓取成功", "Token已保存", "等待自动签到")
    }
  }
  $done()
  return
}

// 【自动签到】读取Token并签到
const data = $persistentStore.read(STORE_KEY)
if (!data) {
  $notification.post("ℹ️ 等待抓取Token", "打开小程序任意页面即可")
  $done()
  return
}

const { token, ua } = JSON.parse(data)
$httpClient.post({
  url: "https://chatclient.heaizo.com/user/activity/signIn/h5",
  headers: {
    "accept": "application/json, text/plain, */*",
    "token": token,
    "platid": "1",
    "x-timestamp": String(Date.now()),
    "User-Agent": ua,
    "origin": "https://chatclient.heaizo.com",
    "referer": "https://chatclient.heaizo.com/NewHome?platId=1",
    "cookie": "soulai_lang=zh_CN"
  }
}, (err, resp, body) => {
  try {
    const res = JSON.parse(body)
    if (res.code === 1) $notification.post("✅ 自动签到成功", "今日完成")
    else if (res.code === 0) $notification.post("ℹ️ 今日已签到", "无需重复")
    else $notification.post("ℹ️ 签到状态", res.msg || "已完成")
  } catch {
    $notification.post("ℹ️ 今日已签到", "接口无重复提示")
  }
  $done()
})