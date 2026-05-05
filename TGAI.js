const BASE_URL = 'https://chatclient.heaizo.com'
const STORE_KEY = 'heaizo_signin_token'

// 自动抓包模式：拦截手动签到请求，保存token和UA
if (typeof $request !== 'undefined') {
  const token = $request.headers.token
  const userAgent = $request.headers['User-Agent']
  if (token) {
    // 同时保存token和真实UA，避免用通用UA被拦截
    $persistentStore.write(JSON.stringify({ token, userAgent }), STORE_KEY)
    $notification.post('Heaizo签到', '✅ 配置成功', '已保存token，明天自动签到')
  } else {
    $notification.post('Heaizo签到', '⚠️ 抓包失败', '请先登录小程序再点击签到')
  }
  $done()
  return
}

// 定时签到模式
const stored = JSON.parse($persistentStore.read(STORE_KEY) || '{}')
const token = stored.token
const userAgent = stored.userAgent || 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148'

if (!token) {
  $notification.post('Heaizo签到', '⚠️ 未配置账号', '请先打开小程序手动签到一次')
  $done()
  return
}

// 100%还原你抓包里的所有请求头
$httpClient.post({
  url: `${BASE_URL}/user/activity/signIn/h5`,
  headers: {
    'accept': 'application/json, text/plain, */*',
    'accept-language': 'zh-CN,zh-Hans;q=0.9',
    'cookie': 'soulai_lang=zh_CN',
    'origin': BASE_URL,
    'referer': `${BASE_URL}/NewHome?platId=1`,
    'sec-fetch-dest': 'empty',
    'sec-fetch-mode': 'cors',
    'sec-fetch-site': 'same-origin',
    'token': token,
    'platid': '1',
    'x-timestamp': String(Date.now()),
    'User-Agent': userAgent
  },
  timeout: 10000
}, (err, resp, data) => {
  if (err) {
    $notification.post('Heaizo签到', '❌ 签到失败', `网络错误：${err}`)
  } else {
    try {
      const res = JSON.parse(data)
      if (res.code === 1) {
        // 直接显示随机积分，适配所有数值
        $notification.post('Heaizo签到', '✅ 签到成功', `今日获得 ${res.data} 积分`)
      } else {
        $notification.post('Heaizo签到', '❌ 签到失败', res.msg || 'token已过期，请重新手动签到一次')
      }
    } catch (e) {
      $notification.post('Heaizo签到', '❌ 签到失败', '响应解析错误')
    }
  }
  $done()
})