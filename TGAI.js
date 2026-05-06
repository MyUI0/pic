const BASE_URL = 'https://chatclient.heaizo.com'
const STORE_KEY = 'heaizo_signin_token'

// 自动抓包模式：拦截手动签到请求，保存token和真实UA
if (typeof $request !== 'undefined') {
  const token = $request.headers.token
  const userAgent = $request.headers['User-Agent']
  
  if (token) {
    $persistentStore.write(JSON.stringify({ token, userAgent }), STORE_KEY)
    $notification.post('Heaizo签到', '✅ 配置成功', '已保存账号信息，明天自动签到')
  } else {
    $notification.post('Heaizo签到', '⚠️ 抓包失败', '未获取到token，请先登录小程序')
  }
  $done()
  return
}

// ========== 第一步：检测是否已配置token ==========
const stored = JSON.parse($persistentStore.read(STORE_KEY) || '{}')
const token = stored.token
const userAgent = stored.userAgent || 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148'

if (!token) {
  $notification.post('Heaizo签到', '⚠️ 未配置账号', '请先打开Heaizo小程序，手动点击一次签到')
  $done()
  return
}

// ========== 第二步：执行签到并准确判断所有状态 ==========
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
      
      // 状态1：签到成功
      if (res.code === 1) {
        $notification.post('Heaizo签到', '✅ 签到成功', `今日获得 ${res.data} 积分`)
      }
      // 状态2：今日已签到（最常见，之前误判为token过期）
      else if (res.code === 0 && (res.msg?.includes('已签到') || res.msg?.includes('重复'))) {
        $notification.post('Heaizo签到', 'ℹ️ 今日已签到', '无需重复签到，明天会自动执行')
      }
      // 状态3：真正的token过期/无效
      else if (res.code === 401 || res.msg?.includes('登录') || res.msg?.includes('token') || res.msg?.includes('过期')) {
        $notification.post('Heaizo签到', '❌ Token已过期', '请打开Heaizo小程序，手动签到一次更新token')
      }
      // 状态4：其他已知错误
      else {
        $notification.post('Heaizo签到', '⚠️ 签到失败', `服务器返回：${res.msg || JSON.stringify(res)}`)
      }
    } catch (e) {
      $notification.post('Heaizo签到', '❌ 签到失败', '响应解析错误')
    }
  }
  $done()
})