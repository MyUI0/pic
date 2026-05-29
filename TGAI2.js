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
  done: (r) => $done(r)
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
// 模式1：请求脚本 - 拦截登录请求，抓取全部凭证
// （使用 script-request-body 规则）
// ==============================================
if (typeof $request !== 'undefined' && typeof $response === 'undefined' && $request.url.includes('/user/login/fast/login')) {
  ;(async () => {
    try {
      // 1. 解析请求体，获取登录参数
      if (!$request.body || $request.body === 'undefined') {
        $.notify(SCRIPT_NAME, '⚠️ 请求体为空', '无法获取登录参数')
        $.done({})
        return
      }

      const loginBody = JSON.parse($request.body)
      const userAgent = $request.headers['User-Agent'] || $request.headers['user-agent'] || ''

      // 2. 手动发一次登录请求，获取响应（Cookie + Token）
      const resp = await new Promise((resolve, reject) => {
        $task.fetch({
          method: 'POST',
          url: $request.url,
          headers: $request.headers,
          body: $request.body,
          timeout: 15000
        }).then(resolve).catch(reject)
      })

      // 3. 从响应头提取 Cookie
      let cookieStr = ''
      const setCookieHeader = resp.headers && (resp.headers['set-cookie'] || resp.headers['Set-Cookie'])
      if (setCookieHeader) {
        const setCookies = Array.isArray(setCookieHeader) ? setCookieHeader : [setCookieHeader]
        const cookies = setCookies.map(c => c.split(';')[0].trim()).filter(c => c)
        cookieStr = cookies.join('; ')
      }

      // 4. 从响应体提取 Token
      let token = loginBody.accessToken || ''
      if (resp.body) {
        try {
          const resData = JSON.parse(resp.body)
          if (resData.code === 1 && resData.data && resData.data.token) {
            token = resData.data.token
          }
        } catch (e) {
          console.log('响应体解析跳过:', e)
        }
      }

      // 5. 合并新旧 Cookie
      const existing = loadCredentials()
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

      // 6. 保存完整凭证
      const credentials = {
        tgName: loginBody.tgName || '',
        platId: loginBody.platId || 1,
        channelCode: loginBody.channelCode || '',
        tgParentId: loginBody.tgParentId || '',
        clientType: loginBody.clientType || '',
        tgId: loginBody.tgId || '',
        type: loginBody.type || '',
        accessToken: token,
        tgUserName: loginBody.tgUserName || '',
        userAgent: userAgent,
        cookie: cookieStr || existing.cookie || 'soulai_lang=zh_CN'
      }

      saveCredentials(credentials)

      // 7. 通知结果
      $.notify(
        SCRIPT_NAME,
        '✅ 全部凭证已保存',
        `type: ${credentials.type}\n` +
        `Token: ${token.substring(0, 20)}...\n` +
        `Cookie长度: ${(cookieStr || '').length}\n` +
        `tgName: ${credentials.tgName}`
      )
    } catch (e) {
      $.notify(SCRIPT_NAME, '⚠️ 抓包失败', `错误: ${e.message}`)
      console.log('抓包错误:', e)
    }

    // 8. 放行原始请求（不影响小程序正常使用）
    $.done({})
  })()
}

// ==============================================
// 模式2：定时任务 - 自动签到
// ==============================================
else {
  const credentials = loadCredentials()
  const userAgent = credentials.userAgent || 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148'
  const savedCookie = credentials.cookie || 'soulai_lang=zh_CN'

  if (!credentials.accessToken) {
    $.notify(SCRIPT_NAME, '⚠️ 未配置账号', '请先打开Heaizo小程序登录一次')
    $.done()
  } else if (!credentials.type) {
    $.notify(SCRIPT_NAME, '⚠️ 参数不完整', '缺少 type 字段，请重新打开小程序登录')
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
            type: credentials.type,
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