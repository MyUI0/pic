const BASE_URL = 'https://chatclient.heaizo.com'
const STORE_KEY = 'heaizo_signin_token'
const LOGIN_BODY_KEY = 'heaizo_login_body'

// ========== 自动抓包模式 ==========
// 1. 拦截登录接口，保存完整的登录请求体（TG授权凭证）
// 2. 拦截其他带 token 的请求，保存 token
if (typeof $request !== 'undefined') {
  const token = $request.headers.token
  const userAgent = $request.headers['User-Agent']

  if ($request.host.includes('chatclient.heaizo.com')) {
    // 保存登录请求体（包含 TG 授权数据，用于后续自动重新登录）
    if ($request.url.includes('/user/login/fast/login') && $request.body) {
      try {
        const body = JSON.parse($request.body)
        $persistentStore.write(JSON.stringify(body), LOGIN_BODY_KEY)
        $notification.post('Heaizo签到', '✅ 登录凭证已保存', '已记录TG授权数据，支持自动续期')
      } catch (e) {}
    }

    // 保存 token
    if (token) {
      $persistentStore.write(JSON.stringify({ token, userAgent }), STORE_KEY)
    }
  }
  $done()
  return
}

// ========== 签到模式 ==========
const stored = JSON.parse($persistentStore.read(STORE_KEY) || '{}')
const loginBody = JSON.parse($persistentStore.read(LOGIN_BODY_KEY) || 'null')
const userAgent = stored.userAgent || 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148'

// 构造请求头
function buildHeaders(token) {
  return {
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
  }
}

// 签到函数
function doSignIn(token) {
  $httpClient.post({
    url: `${BASE_URL}/user/activity/signIn/h5`,
    headers: buildHeaders(token),
    timeout: 10000
  }, (err, resp, data) => {
    if (err) {
      $notification.post('Heaizo签到', '❌ 签到失败', `网络错误：${err}`)
      $done()
      return
    }
    try {
      const res = JSON.parse(data)
      if (res.code === 1) {
        $notification.post('Heaizo签到', '✅ 签到成功', `今日获得 ${res.data} 积分`)
      } else if (res.code === 0 && (res.msg?.includes('已签到') || res.msg?.includes('重复'))) {
        $notification.post('Heaizo签到', 'ℹ️ 今日已签到', '明天自动执行')
      } else if (res.code === 401 || res.msg?.includes('登录') || res.msg?.includes('token') || res.msg?.includes('过期')) {
        $notification.post('Heaizo签到', '❌ Token已失效', 'TG凭证可能也已过期，请重新打开小程序')
      } else {
        $notification.post('Heaizo签到', '⚠️ 签到异常', `${res.msg || JSON.stringify(res)}`)
      }
    } catch (e) {
      $notification.post('Heaizo签到', '⚠️ 接口异常', `状态码：${resp?.status || '未知'}`)
    }
    $done()
  })
}

// 重新登录获取新 token
function reLogin(callback) {
  if (!loginBody) {
    callback(null)
    return
  }
  $httpClient.post({
    url: `${BASE_URL}/user/login/fast/login`,
    headers: {
      'accept': 'application/json, text/plain, */*',
      'accept-language': 'zh-CN,zh-Hans;q=0.9',
      'content-type': 'application/json;charset=UTF-8',
      'cookie': 'soulai_lang=zh_CN',
      'origin': BASE_URL,
      'referer': `${BASE_URL}/NewHome?platId=1`,
      'sec-fetch-dest': 'empty',
      'sec-fetch-mode': 'cors',
      'sec-fetch-site': 'same-origin',
      'platid': '1',
      'x-timestamp': String(Date.now()),
      'User-Agent': userAgent
    },
    body: JSON.stringify(loginBody),
    timeout: 10000
  }, (err, resp, data) => {
    if (err || !data) {
      callback(null)
      return
    }
    try {
      const res = JSON.parse(data)
      if (res.code === 1 && res.data && res.data.token) {
        // 登录成功，保存新 token
        $persistentStore.write(JSON.stringify({ token: res.data.token, userAgent }), STORE_KEY)
        callback(res.data.token)
      } else {
        callback(null)
      }
    } catch (e) {
      callback(null)
    }
  })
}

// ========== 主流程 ==========
// 策略：有TG登录凭证时，先重新登录拿新token再签到（长期有效）
//       无TG凭证时，直接用已保存的token签到（依赖手动更新）

if (loginBody) {
  // 有登录凭证 → 先重新登录获取新 token
  reLogin((newToken) => {
    if (newToken) {
      doSignIn(newToken)
    } else {
      // 重新登录失败，尝试用旧 token 兜底
      if (stored.token) {
        doSignIn(stored.token)
      } else {
        $notification.post('Heaizo签到', '❌ 登录失败', 'TG凭证已过期，请重新打开小程序')
        $done()
      }
    }
  })
} else if (stored.token) {
  // 无登录凭证，但有旧 token → 直接签到
  doSignIn(stored.token)
} else {
  $notification.post('Heaizo签到', '⚠️ 未配置', '请先打开Heaizo小程序，登录后自动获取凭证')
  $done()
}