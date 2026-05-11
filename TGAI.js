const BASE_URL = 'https://chatclient.heaizo.com'
const STORE_KEY = 'heaizo_longterm_credentials'

// ========== 自动抓包模式：拦截登录请求，保存长期凭证 ==========
if (typeof $request !== 'undefined' && $request.url.includes('/user/login/fast/login')) {
  try {
    const loginBody = JSON.parse($request.body)
    
    // 只保存长期有效的核心凭证，过滤一次性参数
    const credentials = {
      tgName: loginBody.tgName,
      platId: loginBody.platId,
      channelCode: loginBody.channelCode,
      tgParentId: loginBody.tgParentId,
      clientType: loginBody.clientType,
      tgId: loginBody.tgId,
      type: loginBody.type,
      accessToken: loginBody.accessToken, // 核心长期凭证（Telegram登录签名）
      tgUserName: loginBody.tgUserName,
      userAgent: $request.headers['User-Agent']
    }
    
    $persistentStore.write(JSON.stringify(credentials), STORE_KEY)
    $notification.post('Heaizo长期签到', '✅ 配置成功', '已保存长期登录凭证，无需再手动更新Token')
  } catch (e) {
    $notification.post('Heaizo长期签到', '⚠️ 抓包失败', `解析登录请求失败：${e.message}`)
  }
  $done()
  return
}

// ========== 第一步：检测是否已配置长期凭证 ==========
const credentials = JSON.parse($persistentStore.read(STORE_KEY) || '{}')
const userAgent = credentials.userAgent || 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148'

if (!credentials.accessToken) {
  $notification.post('Heaizo长期签到', '⚠️ 未配置账号', '请先打开Heaizo小程序，触发一次自动登录（无需手动签到）')
  $done()
  return
}

// ========== 第二步：自动登录获取最新Token ==========
function login() {
  return new Promise((resolve, reject) => {
    $httpClient.post({
      url: `${BASE_URL}/user/login/fast/login`,
      headers: {
        'accept': 'application/json, text/plain, */*',
        'accept-language': 'zh-CN,zh-Hans;q=0.9',
        'content-type': 'application/json;charset=UTF-8',
        'origin': BASE_URL,
        'referer': `${BASE_URL}/NewHome?platId=1`,
        'sec-fetch-dest': 'empty',
        'sec-fetch-mode': 'cors',
        'sec-fetch-site': 'same-origin',
        'platid': credentials.platId,
        'x-timestamp': String(Date.now()),
        'User-Agent': userAgent,
        'cookie': 'soulai_lang=zh_CN'
      },
      body: JSON.stringify({
        tgName: credentials.tgName,
        platId: credentials.platId,
        channelCode: credentials.channelCode,
        tgParentId: credentials.tgParentId,
        clientType: credentials.clientType,
        tgId: credentials.tgId,
        type: credentials.type,
        accessToken: credentials.accessToken,
        ip: "",
        tgUserName: credentials.tgUserName
      }),
      timeout: 15000
    }, (err, resp, data) => {
      if (err) {
        reject(`登录网络错误：${err}`)
        return
      }
      
      try {
        const res = JSON.parse(data)
        if (res.code === 1 && res.data.token) {
          resolve(res.data.token)
        } else if (res.code === 104) {
          reject('Heaizo服务器系统错误，稍后自动重试')
        } else if (res.msg?.includes('过期') || res.msg?.includes('无效') || res.code === 401) {
          reject('长期凭证已过期，请重新打开Heaizo小程序触发登录更新')
        } else {
          reject(`登录失败：${res.msg || JSON.stringify(res)}`)
        }
      } catch (e) {
        reject(`登录响应解析错误：${e.message}`)
      }
    })
  })
}

// ========== 第三步：使用最新Token执行签到 ==========
function signIn(token) {
  return new Promise((resolve, reject) => {
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
        reject(`签到网络错误：${err}`)
        return
      }
      
      try {
        const res = JSON.parse(data)
        if (res.code === 1) {
          resolve(`今日获得 ${res.data} 积分`)
        } else if (res.code === 0 && (res.msg?.includes('已签到') || res.msg?.includes('重复'))) {
          resolve('今日已签到，无需重复操作')
        } else if (res.code === 104) {
          reject('Heaizo服务器系统错误，稍后自动重试')
        } else if (res.code === 401 || res.msg?.includes('登录') || res.msg?.includes('token')) {
          // 理论上不会走到这里，因为刚登录过
          reject('Token异常，将在下一次自动重试')
        } else {
          reject(`签到失败：${res.msg || JSON.stringify(res)}`)
        }
      } catch (e) {
        reject(`签到响应解析错误：${e.message}`)
      }
    })
  })
}

// ========== 主执行流程 ==========
;(async () => {
  try {
    const token = await login()
    const result = await signIn(token)
    $notification.post('Heaizo长期签到', '✅ 签到成功', result)
  } catch (error) {
    $notification.post('Heaizo长期签到', '❌ 签到失败', error)
  } finally {
    $done()
  }
})()