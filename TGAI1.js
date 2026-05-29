const BASE_URL = 'https://chatclient.heaizo.com'
const STORE_KEY = 'heaizo_longterm_credentials'

// QX 环境适配
const $ = {
  prefs: {
    write: (value, key) => $prefs.setValueForKey(value, key),
    read: (key) => $prefs.valueForKey(key)
  },
  notify: (title, subtitle, body) => $notify(title, subtitle, body),
  done: () => $done()
}

// ==============================================
// ✅ 第一部分：仅在重写模式下执行（抓包存凭证）
// ==============================================
if (typeof $response !== 'undefined' && $request.url.includes('/user/login/fast/login')) {
  try {
    // 先放行响应，绝对不影响小程序正常使用
    $.done()

    // 1. 从请求体提取长期登录凭证
    const loginBody = JSON.parse($request.body)
    
    // 2. 从响应头Set-Cookie获取完整Cookie（100%可靠）
    let cookieStr = ''
    if ($response.headers && $response.headers['Set-Cookie']) {
      const setCookies = Array.isArray($response.headers['Set-Cookie']) 
        ? $response.headers['Set-Cookie'] 
        : [$response.headers['Set-Cookie']]
      
      const cookies = setCookies.map(c => {
        const [kv] = c.split(';')
        return kv.trim()
      })
      cookieStr = cookies.join('; ')
    }

    // 3. 合并新旧Cookie（避免覆盖）
    const existing = JSON.parse($.prefs.read(STORE_KEY) || '{}')
    if (existing.cookie) {
      const cookieMap = new Map()
      existing.cookie.split('; ').forEach(c => {
        const [k, v] = c.split('=')
        cookieMap.set(k, v)
      })
      cookieStr.split('; ').forEach(c => {
        const [k, v] = c.split('=')
        cookieMap.set(k, v)
      })
      cookieStr = Array.from(cookieMap.entries())
        .map(([k, v]) => `${k}=${v}`)
        .join('; ')
    }

    // 4. 保存完整凭证
    const credentials = {
      tgName: loginBody.tgName,
      platId: loginBody.platId,
      channelCode: loginBody.channelCode,
      tgParentId: loginBody.tgParentId,
      clientType: loginBody.clientType,
      tgId: loginBody.tgId,
      type: loginBody.type,
      accessToken: loginBody.accessToken,
      tgUserName: loginBody.tgUserName,
      userAgent: $request.headers['User-Agent'] || $request.headers['user-agent'],
      cookie: cookieStr
    }
    
    $.prefs.write(JSON.stringify(credentials), STORE_KEY)
    $.notify('Heaizo配置成功', '✅ 已保存登录凭证', `Cookie长度: ${cookieStr.length}`)
  } catch (e) {
    $.notify('Heaizo抓包失败', '⚠️ 错误', e.message)
    console.log('=== 抓包调试 ===', e, $request.body, $response.headers)
  }

  // ✅ 这里绝对不能加return！全局return无效
}

// ==============================================
// ✅ 第二部分：仅在定时任务模式下执行（自动签到）
// ==============================================
else {
  // 检测是否已配置凭证
  const credentials = JSON.parse($.prefs.read(STORE_KEY) || '{}')
  const userAgent = credentials.userAgent || 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148'
  const savedCookie = credentials.cookie || 'soulai_lang=zh_CN'

  if (!credentials.accessToken) {
    // 只有定时任务执行时才会弹出这个提示
    $.notify('Heaizo签到', '⚠️ 未配置账号', '请先打开Heaizo小程序登录一次')
    $.done()
  } else {
    // 自动登录获取最新Token
    function login() {
      return new Promise((resolve, reject) => {
        $httpClient.post({
          url: `${BASE_URL}/user/login/fast/login`,
          headers: {
            'accept': 'application/json, text/plain, */*',
            'accept-language': 'zh-CN,zh-Hans;q=0.9',
            'content-type': 'application/json;charset=UTF-8',
            'origin': BASE_URL,
            'referer': `${BASE_URL}/NewHome?platId=${credentials.platId || 1}`,
            'platid': String(credentials.platId || 1),
            'x-timestamp': String(Date.now()),
            'User-Agent': userAgent,
            'Cookie': savedCookie
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
          if (err) return reject(`网络错误: ${err}`)
          
          try {
            const res = JSON.parse(data)
            if (res.code === 1 && res.data.token) {
              // 自动更新Cookie
              if (resp.headers && resp.headers['Set-Cookie']) {
                const newCookies = Array.isArray(resp.headers['Set-Cookie']) 
                  ? resp.headers['Set-Cookie'] 
                  : [resp.headers['Set-Cookie']]
                
                const cookieMap = new Map()
                savedCookie.split('; ').forEach(c => {
                  const [k, v] = c.split('=')
                  cookieMap.set(k, v)
                })
                newCookies.forEach(c => {
                  const [kv] = c.split(';')
                  const [k, v] = kv.split('=')
                  cookieMap.set(k, v)
                })
                credentials.cookie = Array.from(cookieMap.entries())
                  .map(([k, v]) => `${k}=${v}`)
                  .join('; ')
                $.prefs.write(JSON.stringify(credentials), STORE_KEY)
              }
              resolve(res.data.token)
            } else if (res.msg?.includes('过期') || res.code === 401) {
              reject('凭证已过期，请重新打开Heaizo登录')
            } else {
              reject(`登录失败: ${res.msg || JSON.stringify(res)}`)
            }
          } catch (e) {
            reject(`解析错误: ${e.message}`)
          }
        })
      })
    }

    // 执行签到
    function signIn(token) {
      return new Promise((resolve, reject) => {
        $httpClient.post({
          url: `${BASE_URL}/user/activity/signIn/h5`,
          headers: {
            'accept': 'application/json, text/plain, */*',
            'accept-language': 'zh-CN,zh-Hans;q=0.9',
            'origin': BASE_URL,
            'referer': `${BASE_URL}/NewHome?platId=${credentials.platId || 1}`,
            'token': token,
            'platid': String(credentials.platId || 1),
            'x-timestamp': String(Date.now()),
            'User-Agent': userAgent,
            'Cookie': savedCookie
          },
          timeout: 10000
        }, (err, resp, data) => {
          if (err) return reject(`网络错误: ${err}`)
          
          try {
            const res = JSON.parse(data)
            if (res.code === 1) {
              resolve(`今日获得 ${res.data} 积分`)
            } else if (res.msg?.includes('已签到')) {
              resolve('今日已签到')
            } else {
              reject(`签到失败: ${res.msg || JSON.stringify(res)}`)
            }
          } catch (e) {
            reject(`解析错误: ${e.message}`)
          }
        })
      })
    }

    // 主执行流程
    ;(async () => {
      try {
        const token = await login()
        const result = await signIn(token)
        $.notify('Heaizo签到成功', '✅', result)
      } catch (error) {
        $.notify('Heaizo签到失败', '❌', error)
      } finally {
        $.done()
      }
    })()
  }
}