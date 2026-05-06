const BASE_URL = "https://chatclient.heaizo.com"
const STORE_KEY = "heaizo_long_token"

// 万能抓取：只要请求头有token，直接保存，不限制接口
if (typeof $request !== "undefined") {
  const token = $request.headers.token
  const userAgent = $request.headers["User-Agent"]
  // 只要有token就存，不管是哪个页面的请求
  if (token) {
    $persistentStore.write(JSON.stringify({ token, userAgent }), STORE_KEY)
    $notification.post("Heaizo", "✅ Token已抓取", "后续自动签到")
  }
  $done()
  return
}

// 读取Token
const stored = JSON.parse($persistentStore.read(STORE_KEY) || "{}")
const token = stored.token
const userAgent = stored.userAgent

// 无Token提示
if (!token) {
  $notification.post("Heaizo", "ℹ️ 抓取Token", "重新打开小程序任意页面即可")
  $done()
  return
}

// 执行签到
$httpClient.post({
  url: `${BASE_URL}/user/activity/signIn/h5`,
  headers: {
    "accept": "application/json, text/plain, */*",
    "accept-language": "zh-CN,zh-Hans;q=0.9",
    "cookie": "soulai_lang=zh_CN",
    "origin": BASE_URL,
    "referer": `${BASE_URL}/NewHome?platId=1`,
    "sec-fetch-dest": "empty",
    "sec-fetch-mode": "cors",
    "sec-fetch-site": "same-origin",
    "token": token,
    "platid": "1",
    "x-timestamp": String(Date.now()),
    "User-Agent": userAgent
  },
  timeout: 10000
}, (err, resp, data) => {
  try {
    const res = JSON.parse(data)
    if (res.code === 1) {
      $notification.post("Heaizo", "✅ 签到成功", "积分：" + res.data)
    } else if (res.code === 0 || res.msg?.includes("已签到")) {
      $notification.post("Heaizo", "ℹ️ 今日已签到", "无需重复")
    } else if (res.code === 401 || res.msg?.includes("token")) {
      $notification.post("Heaizo", "⚠️ Token失效", "重开小程序即可刷新")
    } else {
      $notification.post("Heaizo", "ℹ️ 今日已完成", res.msg || "")
    }
  } catch (e) {
    $notification.post("Heaizo", "ℹ️ 今日已签到", "接口无重复提示")
  }
  $done()
})