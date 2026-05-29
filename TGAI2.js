const SCRIPT_NAME = 'Heaizo调试'
const STORE_KEY = 'heaizo_single_account'

const $ = {
  prefs: { write: (v,k) => $prefs.setValueForKey(v,k), read: (k) => $prefs.valueForKey(k) },
  notify: (t,s,b) => $notify(t,s,b),
  done: () => $done()
}

// ========== 调试版抓包逻辑：每一步都弹通知 ==========
if (typeof $response !== 'undefined') {
  $.notify('✅ 重写规则已触发', `请求URL: ${$request.url}`, '')
  
  if ($request.url.includes('/user/login/fast/login')) {
    $.notify('✅ 命中登录请求', '开始解析请求体和Cookie', '')
    
    try {
      const loginBody = JSON.parse($request.body)
      $.notify('✅ 请求体解析成功', `accessToken存在: ${!!loginBody.accessToken}`, `tgId: ${loginBody.tgId || '空'}`)
      
      let cookieStr = ''
      if ($response.headers && $response.headers['Set-Cookie']) {
        const setCookies = Array.isArray($response.headers['Set-Cookie']) 
          ? $response.headers['Set-Cookie'] 
          : [$response.headers['Set-Cookie']]
        cookieStr = setCookies.map(c => c.split(';')[0].trim()).join('; ')
        $.notify('✅ Cookie获取成功', `Cookie长度: ${cookieStr.length}`, cookieStr)
      } else {
        $.notify('⚠️ 响应头无Set-Cookie', 'MITM解密可能失败', JSON.stringify($response.headers))
      }

      const credentials = {
        ...loginBody,
        userAgent: $request.headers['User-Agent'] || $request.headers['user-agent'],
        cookie: cookieStr
      }
      
      $.prefs.write(JSON.stringify(credentials), STORE_KEY)
      $.notify('🎉 配置完全成功', '现在可以换回正式脚本了', '凭证已保存到本地')
    } catch (e) {
      $.notify('❌ 解析失败', `错误: ${e.message}`, `请求体: ${$request.body}`)
    }
  } else {
    $.notify('⚠️ 未命中登录请求', `当前URL: ${$request.url}`, '请检查重写规则的URL匹配')
  }
  
  $.done()
} else {
  const credentials = JSON.parse($.prefs.read(STORE_KEY) || '{}')
  if (credentials.accessToken) {
    $.notify(SCRIPT_NAME, '✅ 凭证已存在', `accessToken: ${credentials.accessToken.substring(0,20)}...`)
  } else {
    $.notify(SCRIPT_NAME, '⚠️ 未配置账号', '请先打开Heaizo小程序触发登录')
  }
  $.done()
}