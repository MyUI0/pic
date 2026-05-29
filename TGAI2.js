const BASE_URL = 'https://chatclient.heaizo.com'
const STORE_KEY = 'heaizo_single_account'
const SCRIPT_NAME = 'Heaizo签到'

// ========== QX 环境适配 ==========
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
// 模式1：请求脚本 - 保存登录参数（type、tgName 等）
// ==============================================
if (typeof $request !== 'undefined' && typeof $response === 'undefined' && $request.url.includes('/user/login/fast/login')) {
  try {
    // 从请求体获取完整登录凭证
    if ($request.body && $request.body !== 'undefined') {
      const loginBody = JSON.parse($request.body)
      
      // 合并已有凭证（保留 Cookie）
      const existing = loadCredentials()
      const credentials = {
        ...existing,  // 保留已有数据（如 Cookie）
        tgName: loginBody.tgName,
        platId: loginBody.platId,
        channelCode: loginBody.channelCode,
        tgParentId: loginBody.tgParentId,
        clientType: loginBody.clientType,
        tgId: loginBody.tgId,
        type: loginBody.type,  // ← 关键字段
        accessToken: loginBody.accessToken,
        tgUserName: loginBody.tgUserName,
        userAgent: $request.headers && ($request.headers['User-Agent'] || $request.headers['user-agent'])
      }
      
      saveCredentials(credentials)
      $.notify(SCRIPT_NAME, '✅ 请求参数已保存', `type: ${loginBody.type}\ntgName: ${loginBody.tgName}`)
    } else {
      $.notify(SCRIPT_NAME, '⚠️ 请求体为空', '无法获取登录参数')
    }
  } catch (e) {
    $.notify(SCRIPT_NAME, '⚠️ 请求解析失败', `错误: ${e.message}`)
    console.log('请求解析错误:', e, $request.body)
  }
  $.done()
}

// ==============================================
// 模式2：响应脚本 - 保存 Cookie 和更新 token
// ==============================================
else if (typeof $response !== 'undefined' && $request.url.includes('/user/login/fast/login')) {
  try {
    const existing = loadCredentials()
    
    // 从响应体获取最新 token
    if ($response.body && $response.body !== 'undefined') {
      try {
        const responseData = JSON.parse($response.body)
        if (responseData.code === 1 && responseData.data) {
          existing.accessToken = responseData.data.token || existing.accessToken
          existing.tgId = responseData.data.tgId || existing.tgId
          existing.tgName = responseData.data.tgName || existing.tgName
          existing.tgUserName = responseData.data.tgUserName || existing.tgUserName
          existing.platId = responseData.data.platId || existing.platId || 1
        }
      } catch (e) {
        console.log('响应体解析失败:', e)
      }
    }
    
    // 从响应头 Set-Cookie 获取完整 Cookie
    let cookieStr = ''
    const setCookieHeader = $response.headers && ($response.headers['set-cookie'] || $response.headers['Set-Cookie'])
    if (setCookieHeader) {
      const setCookies = Array.isArray(setCookieHeader) ? setCookieHeader : [setCookieHeader]
      const cookies = setCookies.map(c => c.split(';')[0].trim()).filter(c => c)
      cookieStr = cookies.join('; ')
    }
    
    // 合并 Cookie
    if (existing.cookie && cookieStr) {
      const cookieMap = new Map()
      existing.cookie.split('; ').forEach(c => {
        const [k, ...v] = c.split('=')
        if (k) cookieMap.set(k.trim(), v.join('='))
      })
      cookieStr.split('; ').forEach(c => {
        const [k, ...v] = c.split('=')
        if (k) cookieMap.set(k.trim(), v.join('='))
      })
      cookieStr = Array.from(cookieMap.entries()).map(([k, v]) => `${k}=${v}`).join('; ')
    } else if (existing.cookie && !cookieStr) {
      cookieStr = existing.cookie
    }
    
    existing.cookie = cookieStr || existing.cookie || 'soulai_lang=zh_CN'
    saveCredentials(existing)
    
    $.notify(SCRIPT_NAME, '✅ Cookie 已保存', `Token: ${(existing.accessToken || '').substring(0, 20)}...\nCookie长度: ${(cookieStr || '').length}\ntype字段: ${existing.type || '未保存'}`)
  } catch (e) {
    $.notify(SCRIPT_NAME, '⚠️ 响应解析失败', `错误: ${e.message}`)
    console.log('响应解析错误:', e)
  }
  $.done()
}

// ==============================================
// 模式3：定时任务 - 自动签到
// ==============================================
else {
  const credentials = loadCredentials()
  const userAgent = credentials.userAgent || 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148'
  const savedCookie = credentials.cookie || 'soulai_lang=zh_CN'

  if (!credentials.accessToken) {
    $.notify(SCRIPT_NAME, '⚠️ 未配置账号', '请先打开Heaizo小程序登录一次')
    $.done()
  } else if (!credentials.type) {
    $.notify(SCRIPT_NAME, '⚠️ 参数不完整', '缺少 type 字段，请确保配置了请求脚本规则')
    $.done()
  } else {
    // 自动登录获取最新 Token
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
            tgName: credentials.tgName || '',
            platId: credentials.platId || 1,
            channelCode: credentials.channelCode || '',
            tgParentId: credentials.tgParentId || '',
            clientType: credentials.clientType || '',
            tgId: credentials.tgId || '',
            type: credentials.type,  // ← 必须字段
            accessToken: credentials.accessToken,
            ip: "",
            tgUserName: credentials.tgUserName || ''
          }),
          timeout: 15000
        }).then(resp => {
          try {
            const res = JSON.parse(resp.body)
            if (res.code === 1 && res.data.token) {
              // 自动更新 Cookie
              const setCookieHeader = resp.headers && (resp.headers['set-cookie'] || resp.headers['Set-Cookie'])
              if (setCookieHeader) {
                const newCookies = Array.isArray(setCookieHeader) ? setCookieHeader : [setCookieHeader]
                const cookieMap = new Map()
                savedCookie.split('; ').forEach(c => {
                  const [k, ...v] = c.split('=')
                  if (k) cookieMap.set(k.trim(), v.join('='))
                })
                newCookies.forEach(c => {
                  const [kv] = c.split(';')
                  const [k, ...v] = kv.split('=')
                  if (k) cookieMap.set(k.trim(), v.join('='))
                })
                credentials.cookie = Array.from(cookieMap.entries()).map(([k, v]) => `${k}=${v}`).join('; ')
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
        await sleep(1000)
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