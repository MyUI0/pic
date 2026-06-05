/*
==================================================
  蜜雪冰城 - 访问雪王铺领币 v3
  Quantumult X 签到脚本
  ⚡ 无需 RSA 签名
==================================================

工作原理：
  整个签到流程分两部分：
  1. mxsa.mxbc.net → 获取 duiba 登录链接（需要 sign）
  2. 76177-activity.dexfu.cn → 领币操作（只要 cookie，不需要 sign）
  
  ❌ 方案A（被否决）：在 QX 中用 JS 做 RSA 签名 → 太复杂
  ✅ 方案B（本脚本）：通过 rewrite 被动捕获所有必要数据
  
  具体做法：
  - script-request-header 拦截 customer/info → 保存 Access-Token + x-ssos-cid
  - script-request-header 拦截 duiba/getLoginUrl → 保存完整 URL（含有效 sign）
  - script-response-body 拦截 autoLogin 302 响应 → 捕获 set-cookie 保存
  - task 执行时：用缓存的 duiba URL → 拿 loginUrl → 自动登录 → visitMall
  
  首次使用流程：
  1. 开启 QX 配置
  2. 打开蜜雪冰城微信小程序（进入"我的"页即可）
  3. 进入"雪王铺"一次
  4. 以后 task 每天自动签到

配置：

[rewrite_local]
# 拦截 token（必须）
^https:\/\/mxsa\.mxbc\.net\/api\/v1\/customer\/info url script-request-header https://raw.githubusercontent.com/MyUI0/pic/main/scripts/mxbc.js
# 拦截 duiba URL 含 sign（必须）
^https:\/\/mxsa\.mxbc\.net\/api\/v1\/duiba\/getLoginUrl url script-request-header https://raw.githubusercontent.com/MyUI0/pic/main/scripts/mxbc.js
# 拦截 autoLogin 响应 获取 cookie（推荐）
^https:\/\/76177-activity\.dexfu\.cn\/autoLogin\/autologin url script-response-body https://raw.githubusercontent.com/MyUI0/pic/main/scripts/mxbc.js

[mitm]
hostname = mxsa.mxbc.net, 76177-activity.dexfu.cn

[task_local]
0 9 * * * https://raw.githubusercontent.com/MyUI0/pic/main/scripts/mxbc.js, tag=蜜雪冰城-雪王铺签到, enabled=true

==================================================
*/

// ====== 常量 ======
const DOMAIN = {
  ACTIVITY: '76177-activity.dexfu.cn',
  MXSA: 'mxsa.mxbc.net'
};
const SKIN_ID = '216593';
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0.70(0x1800463a) NetType/WIFI Language/zh_CN';

const K = {
  TOKEN: 'mxbc_token_v3',
  CID: 'mxbc_cid_v3',
  DUIBA: 'mxbc_duiba_v3',
  COOKIE: 'mxbc_ck_v3'
};

// ====== 存储 ======
function read(k) {
  try { return $prefs.valueForKey(k) } catch(e) {}
  try { return $persistentStore.read(k) } catch(e) {}
  return null;
}
function write(k, v) {
  try { $prefs.setValueForKey(v, k) } catch(e) {}
  try { $persistentStore.write(v, k) } catch(e) {}
}

// ====== 工具函数 ======
function buildCookieFromSC(setCookieHeaders) {
  const arr = Array.isArray(setCookieHeaders) ? setCookieHeaders : (setCookieHeaders ? [setCookieHeaders] : []);
  const parts = [];
  for (const sc of arr) {
    const eq = sc.indexOf('=');
    if (eq < 0) continue;
    const semi = sc.indexOf(';', eq);
    const val = sc.slice(eq + 1, semi > 0 ? semi : sc.length).trim();
    if (val && val !== '""' && val !== "''") {
      parts.push(sc.slice(0, semi > 0 ? semi : sc.length));
    }
  }
  return parts.join('; ');
}

function parseCookiesToObj(setCookieHeaders) {
  const arr = Array.isArray(setCookieHeaders) ? setCookieHeaders : (setCookieHeaders ? [setCookieHeaders] : []);
  const obj = {};
  for (const sc of arr) {
    const eq = sc.indexOf('=');
    if (eq < 0) continue;
    const name = sc.slice(0, eq).trim();
    const semi = sc.indexOf(';', eq);
    const val = sc.slice(eq + 1, semi > 0 ? semi : sc.length).trim();
    if (val && val !== '""' && val !== "''") {
      obj[name] = val;
    }
  }
  return obj;
}

function http(method, url, hdrs, body) {
  return new Promise((res, rej) => {
    const opts = { url, headers: hdrs || {}, timeout: 15 };
    if (body !== undefined) opts.body = body;
    const cb = (e, r, d) => e ? rej(e) : res({ status: r.status || r.statusCode, headers: r.headers, body: d || r.body || '' });
    $httpClient[method === 'GET' ? 'get' : 'post'](opts, cb);
  });
}
const $get = (u, h) => http('GET', u, h);
const $post = (u, b, h) => http('POST', u, h, b);

// ====== ⚡ 拦截请求 (script-request-header) ======
function onRequest() {
  const url = $request.url;
  const h = $request.headers;
  
  const token = h['Access-Token'];
  if (token) {
    const old = read(K.TOKEN);
    if (token !== old) {
      write(K.TOKEN, token);
      console.log(`[mxbc] ✅ Token 更新: ${token.slice(0, 20)}...`);
    }
  }
  
  const cid = h['x-ssos-cid'];
  if (cid) write(K.CID, cid);
  
  // 拦截 duiba URL（含完整 sign 参数）
  if (url.includes('duiba/getLoginUrl')) {
    write(K.DUIBA, url);
    console.log('[mxbc] ✅ duiba URL 已缓存');
  }
  
  $done({});
}

// ====== ⚡ 拦截响应 (script-response-body) 捕获 autoLogin 的 cookie ======
function onResponse() {
  const url = $request.url;
  
  if (url.includes('autoLogin/autologin')) {
    const sc = $response.headers['Set-Cookie'] || $response.headers['set-cookie'];
    if (sc) {
      const cookieStr = buildCookieFromSC(sc);
      // 检查是否拿到关键 cookie
      if (cookieStr.includes('tokenId=') || cookieStr.includes('wdata4=')) {
        write(K.COOKIE, cookieStr);
        console.log('[mxbc] ✅ cookie 已从 autoLogin 捕获并缓存');
      }
    }
  }
  
  $done({});
}

// ====== 🏪 访问雪王铺 + 领币（只需 cookie，无需 sign） ======
async function doReward(cookieStr) {
  const ref = `https://${DOMAIN.ACTIVITY}/chw/visual-editor/skins?id=${SKIN_ID}&from=login&spm=76177.1.1.1`;
  const hdrs = {
    'User-Agent': UA,
    'Referer': ref,
    'Cookie': cookieStr
  };
  
  // 1. 访问雪王铺
  console.log('[mxbc] 🏪 访问雪王铺...');
  await $get(`https://${DOMAIN.ACTIVITY}/chw/visual-editor/skins?id=${SKIN_ID}&from=login&spm=76177.1.1.1`, hdrs);
  
  // 2. 查余额
  console.log('[mxbc] 💰 查银两...');
  const b1 = await $get(`https://${DOMAIN.ACTIVITY}/globalReward/accountBalance`, hdrs);
  const bd1 = JSON.parse(b1.body);
  const balance = bd1.data?.balance ?? 0;
  const balanceStatus = bd1.data?.status ?? 0;
  console.log(`[mxbc]   余额: ${balance} | status: ${balanceStatus}`);
  
  // 3. 领币
  console.log('[mxbc] 🎁 访问雪王铺领币...');
  const v = await $post(`https://${DOMAIN.ACTIVITY}/globalReward/visitMall`, null, hdrs);
  const vd = JSON.parse(v.body);
  
  let msg = '';
  let earned = 0;
  
  if (vd.success) {
    msg = '✅ 领币成功';
    earned = 10; // 雪王铺每次访问+10 (经验值)
  } else {
    const desc = vd.desc || '';
    msg = desc.includes('已') ? '✅ 今日已领取' : `⚠️ ${desc}`;
  }
  
  // 再查余额确认
  await new Promise(r => setTimeout(r, 500));
  const b2 = await $get(`https://${DOMAIN.ACTIVITY}/globalReward/accountBalance`, hdrs);
  const bd2 = JSON.parse(b2.body);
  const balance2 = bd2.data?.balance ?? balance;
  const diff = balance2 - balance;
  
  console.log(`[mxbc] 📊 ${msg} | 银两 ${balance} → ${balance2} ${diff > 0 ? `+${diff}` : diff === 0 ? '(不变)' : `${diff}`}`);
  
  const line2 = msg;
  const line3 = diff > 0 ? `银两 ${balance} → ${balance2} +${diff}🪙` : 
                diff < 0 ? `银两 ${balance} → ${balance2} ${diff}` :
                `银两 ${balance2}`;
  
  $notification.post('🍦 蜜雪冰城 雪王铺', line2, line3);
}

// ====== 📋 签到主流程 ======
async function run() {
  console.log(`\n[mxbc] ====== 🍦 蜜雪冰城 雪王铺签到 ======\n`);
  
  // 优先用缓存的 cookie（不需要 sign 就能做事）
  let cookie = read(K.COOKIE);
  if (cookie) {
    console.log('[mxbc] 💾 有缓存 cookie，尝试直接领币...');
    try {
      await doReward(cookie);
      console.log('[mxbc] ✅ 执行完毕');
      return;
    } catch (e) {
      console.log(`[mxbc] cookie 过期: ${e.message || e}`);
      // 继续往下走尝试刷新 cookie
    }
  }
  
  // 需要获取新的 cookie → 需要 duiba URL（含 sign）
  const token = read(K.TOKEN);
  const duibaUrl = read(K.DUIBA);
  
  if (!duibaUrl) {
    $notification.post('🍦 蜜雪冰城', '❌ 缺少数据', '请先打开蜜雪冰城小程序(进入雪王铺页面)');
    return;
  }
  
  if (!token) {
    $notification.post('🍦 蜜雪冰城', '❌ 缺少 Token', '请先打开蜜雪冰城小程序');
    return;
  }
  
  const cid = read(K.CID) || '';
  const authH = { 'Content-Type': 'application/json', 'Access-Token': token, 'x-ssos-cid': cid, 'version': '2.8.31', 'User-Agent': UA };
  
  try {
    // 请求 duiba/getLoginUrl
    console.log('[mxbc] 📡 请求 duiba/getLoginUrl...');
    const dRes = await $get(duibaUrl, authH);
    const dData = JSON.parse(dRes.body);
    
    if (dData.code !== 0 || !dData.data?.loginUrl) {
      console.log(`[mxbc] ❌ duiba 返回异常: ${JSON.stringify(dData).slice(0, 150)}`);
      
      if (dData.code === 401) {
        // Token 过期，尝试用旧 cookie 兜底
        if (cookie) {
          console.log('[mxbc] Token 过期，用旧 cookie 尝试...');
          await doReward(cookie);
        } else {
          $notification.post('🍦 蜜雪冰城', '❌ Token 过期', '请重新打开蜜雪冰城小程序');
        }
      } else {
        $notification.post('🍦 蜜雪冰城', '❌ duiba 登录异常', dData.msg || '请重新打开小程序');
      }
      return;
    }
    
    const loginUrl = dData.data.loginUrl;
    console.log('[mxbc] ✅ 获取 loginUrl 成功');
    
    // 自动登录获取 cookie
    console.log('[mxbc] 🔑 自动登录...');
    const lRes = await $get(loginUrl, {
      'User-Agent': UA,
      'Referer': `https://${DOMAIN.ACTIVITY}/chw/visual-editor/skins?id=${SKIN_ID}`
    });
    
    const sc = lRes.headers['Set-Cookie'] || lRes.headers['set-cookie'];
    const cookies = parseCookiesToObj(sc);
    
    if (!cookies.tokenId && !cookies.wdata4) {
      console.log('[mxbc] ❌ 自动登录失败：未获取 cookie');
      // 尝试旧 cookie
      if (cookie) {
        await doReward(cookie);
      } else {
        $notification.post('🍦 蜜雪冰城', '❌ 登录失败', '获取 cookie 失败');
      }
      return;
    }
    
    // 构建并缓存所有 cookie
    const allParts = [];
    for (const [k, v] of Object.entries(cookies)) {
      if (v && v !== '""') allParts.push(`${k}=${v}`);
    }
    const newCookie = allParts.join('; ');
    write(K.COOKIE, newCookie);
    console.log(`[mxbc] ✅ 登录成功，缓存 cookie (${Object.keys(cookies).length}个)`);
    
    // 领币
    await doReward(newCookie);
    
  } catch (e) {
    console.log(`[mxbc] ❌ 异常: ${e.message || e}`);
    if (cookie) {
      console.log('[mxbc] 异常，用旧 cookie 尝试...');
      try { await doReward(cookie); } catch(e2) {
        $notification.post('🍦 蜜雪冰城', '❌ 异常', e.message || '签到失败');
      }
    } else {
      $notification.post('🍦 蜜雪冰城', '❌ 异常', e.message || '未知错误');
    }
  }
}

// ====== 🚪 入口 ======
if (typeof $request !== 'undefined' && $request && typeof $response !== 'undefined' && $response) {
  onResponse();
} else if (typeof $request !== 'undefined' && $request) {
  onRequest();
} else {
  (async () => { await run(); $done(); })();
}
