const BASE_URL = 'https://chatclient.heaizo.com'
const STORE_KEY = 'heaizo_long_token'

// 自动从【个人信息接口】抓取长效Token
if (typeof $request !== 'undefined') {
  const token = $request.headers.token
  const userAgent = $request.headers['User-Agent']
  if (token && $request.url.includes('/user/info/detail')) {
    $persistentStore.write(JSON.stringify({ token, userAgent }), STORE_KEY)
    $notification.post('Heaizo', '✅ 长效Token已保存', '一次保存，永久自动签到')
  }
  $done()
  return
}

// 读取长效Token
const stored = JSON.parse($persistentStore.read(STORE_KEY) || '{}')
const token = stored.token
const userAgent = stored.userAgent || 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148'

// 无Token提示
if (!token) {
  $notification.post('Heaizo', '⚠️ 未获取Token', '打开小程序【我的】页面即可自动抓取')
  $done()
  return
}

// 执行签到（用长效Token）
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
  try {
    const res = JSON.parse(data)
    if (res.code === 1) {
      $notification.post('Heaizo', '✅ 签到成功', `积分：${res.data}`)
    } else if (res.msg?.includes('已签到') || res.code === 0) {
      $notification.post('Heaizo', 'ℹ️ 今日已签到', '无需重复操作')
    } else if (res.code === 401 || res.msg?.includes('token')) {
      $notification.post('Heaizo', '⚠️ Token已失效', '重新打开【我的】页面刷新')
    } else {
      $notification.post('Heaizo', 'ℹ️ 签到结果', res.msg || '已完成今日签到')
    }
  } catch (e) {
    $notification.post('Heaizo', 'ℹ️ 今日已签到', '接口无重复提示')
  }
  $done()
})