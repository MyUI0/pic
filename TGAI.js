// 纯代码文件，不要加任何#!开头的配置
const BASE_URL = 'https://chatclient.heaizo.com'
const STORE_KEY = 'heaizo_signin_token'

if (typeof $request !== 'undefined') {
  // 自动抓包模式
  const token = $request.headers.token
  if (token) {
    $persistentStore.write(token, STORE_KEY)
    $notification.post('Heaizo签到', '✅ 配置成功', '已自动保存token，明天开始自动签到')
  } else {
    $notification.post('Heaizo签到', '⚠️ 抓包失败', '请先登录小程序再点击签到')
  }
  $done()
  return
}

// 定时签到模式
const token = $persistentStore.read(STORE_KEY)
if (!token) {
  $notification.post('Heaizo签到', '⚠️ 未配置账号', '请先打开小程序手动签到一次')
  $done()
  return
}

$httpClient.post({
  url: `${BASE_URL}/user/activity/signIn/h5`,
  headers: {
    'accept': 'application/json',
    'token': token,
    'platid': '1',
    'x-timestamp': String(Date.now()),
    'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148'
  },
  timeout: 10000
}, (err, resp, data) => {
  if (err) {
    $notification.post('Heaizo签到', '❌ 签到失败', `网络错误：${err}`)
  } else {
    try {
      const res = JSON.parse(data)
      if (res.code === 1) {
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