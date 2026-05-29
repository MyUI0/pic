const BASE_URL = 'https://chatclient.heaizo.com'
const STORE_KEY = 'heaizo_single_account'
const SCRIPT_NAME = 'Heaizo签到'

// ========== QX 环境适配（绝对正确） ==========
const $ = {
  prefs: {
    write: (v, k) => $prefs.setValueForKey(v, k),
    read: (k) => $prefs.valueForKey(k)
  },
  notify: (t, s, b) => $notify(t, s, b),
  done: () => $done()
}

// ========== 工具函数 ==========
function sleep(ms) {
  return new Promise(r => setTimeout(r, ms))
}

// ========== 存储管理 ==========
function saveCredentials(data) {
  $.prefs.write(JSON.stringify(data), STORE_KEY)
}

function loadCredentials() {
  const raw = $.prefs.read(STORE_KEY)
  try {
    return raw ? JSON.parse(raw) : {}
  } catch (e) {
    return {}
  }
}

// ==============================================
// ✅ 第一部分：仅在重写模式下执行（自动抓包存Cookie）
// ==============================================
if (typeof $response !== 'undefined' && $request.url.includes('/user/login/fast/login')) {
  // ✅ 先放行响应，100%不影响小程序正常使用
  $.done()

  try {
    // 1. 从请求体提取长期登录凭证
    const loginBody = JSON.parse($request.body)
    
    // 2. 从响应头Set-Cookie获取完整Cookie（QX唯一可靠方式）
    let cookieStr = ''
    if ($response.headers && $response.headers['Set-Cookie']) {
      const setCookies = Array.isArray($response.headers['Set-Cookie']) 
        ? $response.headers['Set-Cookie'] 
        : [$response.headers['Set-Cookie']]
      
      // 解析所有Cookie，只保留name=value
      const cookies = setCookies.map(c => c.split(';')[0].trim())
      cookieStr = cookies.join('; ')
    }

    // 3. 合并新旧Cookie（避免覆盖）
    const existing = loadCredentials()
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
    
    saveCredentials(credentials)
    $.notify(SCRIPT_NAME, '✅ 配置成功', `已保存登录凭证\nCookie长度: ${cookieStr.length}`)
  } catch (e) {
    $.notify(SCRIPT_NAME, '⚠️ 抓包失败', `错误: ${e.message}`)
    console.log('Heaizo抓包错误:', e, $request.body, $response.headers)
  }

  // ❌ 这里绝对不能加return！全局return在QX中无效
}

// ==============================================
// ✅ 第二部分：仅在定时任务模式下执行（自动签到）
// ==============================================
else {
  const credentials = loadCredentials()
  const userAgent = credentials.userAgent || 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148'
  const savedCookie = credentials.cookie || 'soulai_lang=zh_CN'

  if (!credentials.accessToken) {
    $.notify(SCRIPT_NAME, '⚠️ 未配置账号', '请先打开Heaizo小程序登录一次')
    $.done()
  } else {
    // 自动登录获取最新Token
    function login() {
      return new Promise((resolve, reject) => {
        $task.fetch({
          method: 'POST',
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
        }).then(resp => {
          try {
            const res = JSON.parse(resp.body)
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
                saveCredentials(credentials)
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
        }).catch(err => {
          reject(`网络错误: ${err.error || String(err)}`)
        })
      })
    }

    // 执行签到
    function signIn(token) {
      return new Promise((resolve, reject) => {
        $task.fetch({
          method: 'POST',
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
        }).then(resp => {
          try {
            const res = JSON.parse(resp.body)
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
        }).catch(err => {
          reject(`网络错误: ${err.error || String(err)}`)
        })
      })
    }

    // 主执行流程
    ;(async () => {
      try {
        const token = await login()
        await sleep(1000) // 加1秒延迟，模拟真人操作
        const result = await signIn(token)
        $.notify(SCRIPT_NAME, '✅ 签到成功', result)
      } catch (error) {
        $.notify(SCRIPT_NAME, '❌ 签到失败', error)
      } finally {
        $.done()
      }
    })()
  }
}