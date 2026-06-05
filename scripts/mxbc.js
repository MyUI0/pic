/*
==================================================
  蜜雪冰城 - 访问雪王铺领币
  Quantumult X 签到脚本 v3.5
  ⚡ 单文件 · 无需 RSA · 自动 polyfill
==================================================

[rewrite_local]
^https:\/\/mxsa\.mxbc\.net\/api\/v1\/customer\/info url script-request-header https://raw.githubusercontent.com/MyUI0/pic/main/scripts/mxbc.js
^https:\/\/mxsa\.mxbc\.net\/api\/v1\/duiba\/getLoginUrl url script-request-header https://raw.githubusercontent.com/MyUI0/pic/main/scripts/mxbc.js
^https:\/\/76177-activity\.dexfu\.cn\/autoLogin\/autologin url script-response-body https://raw.githubusercontent.com/MyUI0/pic/main/scripts/mxbc.js

[mitm]
hostname = mxsa.mxbc.net, 76177-activity.dexfu.cn

[task_local]
0 9 * * * mxbc.js, tag=蜜雪冰城-雪王铺签到, enabled=true

==================================================
*/

// ================================================================
// 环境检测
// ================================================================
const isRequest = typeof $request  != "undefined";  // rewrite 模式
const isSurge   = typeof $httpClient != "undefined" && typeof $task === "undefined"; // Surge
const isQuanX   = typeof $task       != "undefined"; // Quantumult X
const isNode    = typeof require     == "function";  // Node.js

// ================================================================
// 调试：打印 $task.fetch 返回的原始结构（仅第一次）
// ================================================================
if (isQuanX && !window.__mxbc_debug_printed) {
  window.__mxbc_debug_printed = true;
  $task.fetch({ url: 'https://httpbin.org/get' }).then(r => {
    console.log('[mxbc 调试] $task.fetch 原始返回 keys:', Object.keys(r));
    console.log('[mxbc 调试] $task.fetch body type:', typeof r.body, r.body);
    console.log('[mxbc 调试] $task.fetch responseText type:', typeof r.responseText, (r.responseText || '').slice(0, 100));
    console.log('[mxbc 调试] $task.fetch status:', r.status);
  }).catch(e => console.log('[mxbc 调试] fetch error:', e));
}

// ================================================================
// $httpClient polyfill (QX task 模式 → $task.fetch)
//   QX task 模式下无 $httpClient，用 $task.fetch 模拟
//   rewrite 模式下原生 $httpClient 存在，不生效
// ================================================================
if (isQuanX && typeof $httpClient === 'undefined') {
  const _fetch = (opts, cb) => {
    $task.fetch(opts).then(r => {
      // QX task 模式的 $task.fetch 返回结构
      // 常见字段: {status, headers, body, responseText}
      // body 可能为 {} 空对象，responseText 才是实际内容
      let raw = r.body;
      if (!raw || raw === {} || typeof raw !== 'string') {
        raw = r.responseText || '';
      }
      cb(null, { status: r.status || 0, headers: r.headers || {}, body: raw || '' });
    }).catch(e => cb(e, { status: 0, headers: {}, body: '' }));
  };
  $httpClient = {
    get(opts, cb)  { _fetch(opts, cb); },
    post(opts, cb) { _fetch(opts, cb); }
  };
}

// ================================================================
// 常量
// ================================================================
const D = {
  ACTIVITY: '76177-activity.dexfu.cn',
  SKIN_ID: '216593'
};
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0.70(0x1800463a) NetType/WIFI Language/zh_CN';

const K = {
  TOKEN: 'mxbc_token',
  CID: 'mxbc_cid',
  DUIBA: 'mxbc_duiba_url',
  CK: 'mxbc_ck'
};

// ================================================================
// 存储 (兼容 QX / Surge)
// ================================================================
const $read = key => {
  if (isQuanX) try { return $prefs.valueForKey(key) } catch(e) {}
  if (isSurge)  try { return $persistentStore.read(key) } catch(e) {}
  return null;
};
const $write = (key, val) => {
  if (isQuanX) try { $prefs.setValueForKey(val, key) } catch(e) {}
  if (isSurge)  try { $persistentStore.write(val, key) } catch(e) {}
};

// ================================================================
// $done 兼容
// ================================================================
const callDone = val => {
  if (isQuanX) return $done(val);
  if (isSurge)  return isRequest ? $done(val) : $done();
};

// ================================================================
// Set-Cookie 解析
// ================================================================
function scToObj(sc) {
  const arr = Array.isArray(sc) ? sc : (sc ? [sc] : []);
  const obj = {};
  for (const s of arr) {
    const eq = s.indexOf('=');
    if (eq < 0) continue;
    const nm = s.slice(0, eq).trim();
    const semi = s.indexOf(';', eq);
    const val = s.slice(eq + 1, semi > 0 ? semi : s.length).trim();
    if (!val || val === '""') continue;
    if (/\bmax-age=0\b/i.test(s)) continue;
    obj[nm] = val;
  }
  return obj;
}

// ================================================================
// HTTP
// ================================================================
function http(method, url, hdrs, body) {
  return new Promise((resolve, reject) => {
    const opts = { url, headers: hdrs || {}, timeout: 15 };
    if (body !== undefined) opts.body = body;

    if (isQuanX) {
      // QX task 模式: $task.fetch（无原生 $httpClient）
      if (typeof $httpClient === 'undefined' || typeof $httpClient.get === 'undefined') {
        $task.fetch(opts).then(r => {
          let raw = r.body;
          // 兼容: body 可能是空对象或 undefined，实际内容在 responseText
          if (!raw || typeof raw !== 'string' || raw === '{}') {
            raw = r.responseText || '';
          }
          resolve({ status: r.status || 0, headers: r.headers || {}, body: raw });
        }).catch(e => reject(e));
        return;
      }
      // QX rewrite 模式: 原生 $httpClient
      $httpClient[method === 'GET' ? 'get' : 'post'](opts, (err, resp, data) => {
        if (err) return reject(err);
        resolve({ status: resp.status, headers: resp.headers, body: data || '' });
      });
      return;
    }

    if (isSurge) {
      $httpClient[method === 'GET' ? 'get' : 'post'](opts, (err, resp, data) => {
        if (err) return reject(err);
        resolve({ status: resp.status, headers: resp.headers, body: data || '' });
      });
      return;
    }

    reject(new Error('未知环境'));
  });
}
const $get  = (url, hdrs) => http('GET',  url, hdrs);
const $post = (url, b,  hdrs) => http('POST', url, hdrs, b);

// ================================================================
// script-request-header — 被动捕获
// ================================================================
function onRequest() {
  const url = $request.url;
  const h = $request.headers;

  const token = h['Access-Token'];
  if (token && token !== $read(K.TOKEN)) {
    $write(K.TOKEN, token);
    console.log(`[mxbc] ✅ Token 更新: ${token.slice(0, 24)}...`);
  }

  const cid = h['x-ssos-cid'];
  if (cid) $write(K.CID, cid);

  if (url.includes('duiba/getLoginUrl')) {
    $write(K.DUIBA, url);
    console.log('[mxbc] ✅ duiba URL 已缓存');
  }

  $done({});
}

// ================================================================
// script-response-body — 被动捕获 cookie
// ================================================================
function onResponse() {
  const url = $request.url;

  if (url.includes('autoLogin/autologin')) {
    const sc = $response.headers['Set-Cookie'] || $response.headers['set-cookie'];
    if (sc) {
      const ck = scToObj(sc);
      if (ck.tokenId || ck.wdata4) {
        $write(K.CK, Object.entries(ck).filter(([_, v]) => v).map(([k, v]) => `${k}=${v}`).join('; '));
        console.log('[mxbc] ✅ cookie 已捕获并缓存');
      } else {
        console.log('[mxbc] ⚠️ cookie 不完整，跳过');
      }
    }
  }

  $done({});
}

// ================================================================
// 领币（只需 cookie，无需 sign）
// ================================================================
async function doReward(ck) {
  const ref = `https://${D.ACTIVITY}/chw/visual-editor/skins?id=${D.SKIN_ID}&from=login&spm=76177.1.1.1`;
  const hdrs = { 'User-Agent': UA, 'Referer': ref, 'Cookie': ck };

  // 1. 访问雪王铺
  await $get(`https://${D.ACTIVITY}/chw/visual-editor/skins?id=${D.SKIN_ID}&from=login&spm=76177.1.1.1`, hdrs);

  // 2. 查余额
  const b1 = await $get(`https://${D.ACTIVITY}/globalReward/accountBalance`, hdrs);
  const bd1 = JSON.parse(b1.body);
  const bal = (bd1.data && bd1.data.balance) || 0;

  // 3. 领币
  const vr = await $post(`https://${D.ACTIVITY}/globalReward/visitMall`, null, hdrs);
  const vd = JSON.parse(vr.body);

  let msg = '';
  if (vd.success) {
    msg = '✅ 领币成功';
  } else {
    const desc = vd.desc || '';
    msg = /已|重复|already|visited|今天|今日/i.test(desc) ? '✅ 今日已领取' : `⚠️ ${desc}`;
  }

  // 4. 确认余额
  await new Promise(r => setTimeout(r, 600));
  const b2 = await $get(`https://${D.ACTIVITY}/globalReward/accountBalance`, hdrs);
  const bd2 = JSON.parse(b2.body);
  const bal2 = (bd2.data && bd2.data.balance) || bal;
  const diff = bal2 - bal;

  const line = diff > 0 ? `银两 ${bal} → ${bal2} 🪙 +${diff}` : `银两 ${bal2} 🪙`;
  console.log(`[mxbc] 📊 ${msg} | ${line}`);
  $notify('🍦 蜜雪冰城 雪王铺', msg, line);
}

// ================================================================
// 主流程
// ================================================================
(async () => {
  console.log('\n[mxbc] ====== 🍦 蜜雪冰城 雪王铺签到 ======\n');

  // --- 有缓存 cookie → 直接领币 ---
  let ck = $read(K.CK);
  if (ck) {
    console.log('[mxbc] 💾 有缓存 cookie');
    try {
      await doReward(ck);
      callDone();
      return;
    } catch (e) {
      console.log(`[mxbc] ⚠️ 直接领币失败: ${e.message || e}`);
    }
  }

  // --- 缓存失效 → 需刷新 ---
  const token = $read(K.TOKEN);
  const duibaUrl = $read(K.DUIBA);

  if (!duibaUrl || !token) {
    const reason = !duibaUrl && !token ? 'Token + duiba URL 均缺失' :
                   !duibaUrl ? 'duiba URL 已过期' : 'Token 已过期';
    console.log(`[mxbc] ❌ ${reason}`);
    $notify('🍦 蜜雪冰城', '❌ 数据过期', reason + '\n请打开蜜雪冰城小程序');
    callDone();
    return;
  }

  const cid = $read(K.CID) || '';
  const authH = { 'Content-Type': 'application/json', 'Access-Token': token, 'x-ssos-cid': cid, 'version': '2.8.31', 'User-Agent': UA };

  try {
    // 请求 duiba URL → 获取 loginUrl
    console.log('[mxbc] 📡 请求 duiba 登录链接...');
    const dRes = await $get(duibaUrl, authH);

    // 调试：打印原始响应
    console.log(`[mxbc] 调试 duiba 响应 status: ${dRes.status}`);
    console.log(`[mxbc] 调试 duiba body 长度: ${(dRes.body || '').length}`);
    console.log(`[mxbc] 调试 duiba body 前100字符: ${(dRes.body || '').slice(0, 100)}`);

    const dData = JSON.parse(dRes.body);

    if (dData.code !== 0 || !dData.data?.loginUrl) {
      $write(K.DUIBA, '');
      console.log(`[mxbc] ❌ duiba 异常: ${dData.msg || '未知错误'}`);
      $notify('🍦 蜜雪冰城', '❌ duiba 已过期', `${dData.msg || '未知错误'}\n请打开蜜雪冰城小程序刷新`);
      callDone();
      return;
    }

    const loginUrl = dData.data.loginUrl;
    console.log('[mxbc] ✅ 获取 loginUrl，开始自动登录...');

    // 访问 loginUrl → 302 → set-cookie
    const lRes = await $get(loginUrl, {
      'User-Agent': UA,
      'Referer': `https://${D.ACTIVITY}/chw/visual-editor/skins?id=${D.SKIN_ID}`
    });

    const sc = lRes.headers['Set-Cookie'] || lRes.headers['set-cookie'];
    const cookies = scToObj(sc);

    if (!cookies.tokenId && !cookies.wdata4) {
      throw new Error('autoLogin 返回的 cookie 不完整');
    }

    const newCk = Object.entries(cookies)
      .filter(([_, v]) => v)
      .map(([k, v]) => `${k}=${v}`)
      .join('; ');
    $write(K.CK, newCk);
    console.log(`[mxbc] ✅ 自动登录成功 (${Object.keys(cookies).length} 项 cookie)`);

    await doReward(newCk);

  } catch (e) {
    console.log(`[mxbc] ❌ ${e.message || e}`);
    if (ck) { try { await doReward(ck); } catch(_) {} }
    $notify('🍦 蜜雪冰城', '❌ 签到失败', e.message || '未知错误');
  }

  callDone();
})();
