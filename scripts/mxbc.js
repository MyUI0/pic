/*
==================================================
  蜜雪冰城 - 访问雪王铺领币
  Quantumult X 签到脚本 v3
  ⚡ 单文件 · 无需 RSA 签名
==================================================

【工作原理】
  本脚本一个文件同时支持三种模式，QX 自动判断：
  1. script-request-header  →  被动捕获 token 和 duiba URL
  2. script-response-body   →  被动捕获 autoLogin 返回的 cookie
  3. task                   →  主动执行签到（领币）

  关键发现（基于 HAR 抓包）：
  · 活动域名 76177-activity.dexfu.cn 的所有 API（globalReward/accountBalance、
    globalReward/visitMall）都不需要 sign，只要 cookie
  · cookie 在 autoLogin 302 响应中通过 set-cookie 下发
  · cookie 的 wdata4 / tokenId / wdata3 等关键项 24 小时过期

【首次使用】
  1. 配好脚本 + 开启 QX
  2. 打开蜜雪冰城微信小程序 → 进入"我的"页（触发 token 捕获）
  3. 再进一下"雪王铺"（触发 duiba URL + cookie 捕获）
  4. 之后每日 task 自动签到

【配置】
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

// ====== 常量 ======
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

// ====== 存储 ======
const $read = k => { try { return $prefs.valueForKey(k) } catch(e){} try { return $persistentStore.read(k) } catch(e){} return null };
const $write = (k, v) => { try { $prefs.setValueForKey(v, k) } catch(e){} try { $persistentStore.write(v, k) } catch(e){} };

// ====== 从 Set-Cookie 构建字符串 ======
function scToStr(sc) {
  const arr = Array.isArray(sc) ? sc : (sc ? [sc] : []);
  const parts = [];
  for (const s of arr) {
    const eq = s.indexOf('=');
    if (eq < 0) continue;
    const semi = s.indexOf(';', eq);
    const val = s.slice(eq + 1, semi > 0 ? semi : s.length).trim();
    if (!val || val === '""') continue;
    // 跳过 Max-Age=0（已被清除的 cookie）
    if (/\bmax-age=0\b/i.test(s)) continue;
    parts.push(s.slice(0, semi > 0 ? semi : s.length));
  }
  return parts.join('; ');
}

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

// ====== HTTP 工具（task 模式可用） ======
function http(method, url, hdrs, body) {
  return new Promise((res, rej) => {
    const opts = { url, headers: hdrs || {}, timeout: 15 };
    if (body !== undefined) opts.body = body;
    const cb = (e, r, d) => {
      if (e) return rej(new Error(typeof e === 'string' ? e : e.message || String(e)));
      res({
        status: r.status || r.statusCode || 0,
        headers: r.headers || {},
        body: d || r.body || ''
      });
    };
    $httpClient[method === 'GET' ? 'get' : 'post'](opts, cb);
  });
}
const $get = (u, h) => http('GET', u, h);
const $post = (u, b, h) => http('POST', u, h, b);

// ================================================================
// 模式 A：script-request-header
//   被动捕获 token 和 duiba URL
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
// 模式 B：script-response-body
//   被动捕获 autoLogin 302 响应中的 set-cookie
// ================================================================
function onResponse() {
  const url = $request.url;

  if (url.includes('autoLogin/autologin')) {
    const sc = $response.headers['Set-Cookie'] || $response.headers['set-cookie'];
    if (sc) {
      const ck = scToStr(sc);
      // 只有同时拿到 tokenId 和 wdata4 才保存
      if (ck.includes('tokenId=') && ck.includes('wdata4=')) {
        $write(K.CK, ck);
        console.log('[mxbc] ✅ cookie 已捕获并缓存');
      } else {
        console.log(`[mxbc] ⚠️ cookie 不完整: ${ck.slice(0, 100)}`);
      }
    }
  }

  $done({});
}

// ================================================================
// 模式 C：task — 主动签到
//   优先用缓存的 cookie 直接领币；失败则刷新 cookie
// ================================================================
async function doReward(ck) {
  const ref = `https://${D.ACTIVITY}/chw/visual-editor/skins?id=${D.SKIN_ID}&from=login&spm=76177.1.1.1`;
  const hdrs = { 'User-Agent': UA, 'Referer': ref, 'Cookie': ck };

  // 1. 访问雪王铺
  console.log('[mxbc] 🏪 访问雪王铺...');
  const r1 = await $get(`https://${D.ACTIVITY}/chw/visual-editor/skins?id=${D.SKIN_ID}&from=login&spm=76177.1.1.1`, hdrs);

  // 2. 查余额
  console.log('[mxbc] 💰 查银两余额...');
  const b1 = await $get(`https://${D.ACTIVITY}/globalReward/accountBalance`, hdrs);
  const bd1 = JSON.parse(b1.body);
  const bal = (bd1.data && bd1.data.balance) || 0;
  console.log(`[mxbc]   余额: ${bal}`);

  // 3. 领币（POST，空 body）
  console.log('[mxbc] 🎁 访问雪王铺领币...');
  const vr = await $post(`https://${D.ACTIVITY}/globalReward/visitMall`, null, hdrs);
  const vd = JSON.parse(vr.body);

  let msg = '';
  if (vd.success) {
    msg = '✅ 领币成功';
  } else {
    const desc = vd.desc || '';
    msg = /已|重复|重复|already|visited/i.test(desc) ? '✅ 今日已领取' : `⚠️ ${desc}`;
  }

  // 4. 再查余额
  await new Promise(r => setTimeout(r, 600));
  const b2 = await $get(`https://${D.ACTIVITY}/globalReward/accountBalance`, hdrs);
  const bd2 = JSON.parse(b2.body);
  const bal2 = (bd2.data && bd2.data.balance) || bal;
  const diff = bal2 - bal;

  const line = diff > 0 ? `银两 ${bal} → ${bal2} 🪙 +${diff}` : `银两 ${bal2} 🪙`;
  console.log(`[mxbc] 📊 ${msg} | ${line}`);
  $notification.post('🍦 蜜雪冰城 雪王铺', msg, line);
}

async function run() {
  console.log(`\n[mxbc] ====== 🍦 蜜雪冰城 雪王铺签到 ======\n`);

  // --- 优先用缓存 cookie 直接领币 ---
  let ck = $read(K.CK);
  if (ck) {
    console.log('[mxbc] 💾 有缓存 cookie');
    try {
      await doReward(ck);
      $done();
      return;
    } catch (e) {
      console.log(`[mxbc] ⚠️ cookie 可能过期: ${e.message || e}`);
    }
  }

  // --- 缓存 cookie 不可用，尝试用 duiba URL 刷新 ---
  const token = $read(K.TOKEN);
  const duibaUrl = $read(K.DUIBA);

  if (!duibaUrl) {
    $notification.post('🍦 蜜雪冰城', '❌ 缺少缓存数据', '请打开蜜雪冰城小程序进入雪王铺页面');
    $done();
    return;
  }
  if (!token) {
    $notification.post('🍦 蜜雪冰城', '❌ 缺少 Token', '请打开蜜雪冰城小程序');
    $done();
    return;
  }

  const cid = $read(K.CID) || '';
  const authH = { 'Content-Type': 'application/json', 'Access-Token': token, 'x-ssos-cid': cid, 'version': '2.8.31', 'User-Agent': UA };

  try {
    // 请求 duiba/getLoginUrl 获取 loginUrl（URL 本身含有效 sign）
    console.log('[mxbc] 📡 请求 duiba 登录链接...');
    const dRes = await $get(duibaUrl, authH);
    const dData = JSON.parse(dRes.body);

    if (dData.code !== 0 || !dData.data?.loginUrl) {
      if (dData.code === 401) {
        $notification.post('🍦 蜜雪冰城', '❌ Token 过期', '请重新打开蜜雪冰城小程序');
      } else {
        $notification.post('🍦 蜜雪冰城', '❌ duiba 异常', dData.msg || '请重新打开小程序');
      }
      $done();
      return;
    }

    const loginUrl = dData.data.loginUrl;
    console.log('[mxbc] ✅ 获取 loginUrl 成功');

    // 访问 loginUrl → 302 响应中会下发 session cookie
    console.log('[mxbc] 🔑 自动登录获取 cookie...');
    const lRes = await $get(loginUrl, {
      'User-Agent': UA,
      'Referer': `https://${D.ACTIVITY}/chw/visual-editor/skins?id=${D.SKIN_ID}`
    });

    const sc = lRes.headers['Set-Cookie'] || lRes.headers['set-cookie'];
    const cookies = scToObj(sc);

    if (!cookies.tokenId && !cookies.wdata4) {
      throw new Error('autoLogin 返回 cookie 不完整');
    }

    // 缓存 cookie
    const newCk = Object.entries(cookies)
      .filter(([_, v]) => v && v !== '""')
      .map(([k, v]) => `${k}=${v}`)
      .join('; ');
    $write(K.CK, newCk);
    console.log(`[mxbc] ✅ 登录成功，缓存 cookie (${Object.keys(cookies).length} 项)`);

    await doReward(newCk);

  } catch (e) {
    console.log(`[mxbc] ❌ ${e.message || e}`);
    // 用旧 cookie 再兜底一次
    if (ck) {
      try { await doReward(ck); } catch(_) {}
    }
    $notification.post('🍦 蜜雪冰城', '❌ 签到失败', e.message || '请重新打开小程序');
    $done();
  }
}

// ================================================================
// 主入口
// ================================================================
if (typeof $response !== 'undefined' && $response) {
  // script-response-body
  onResponse();
} else if (typeof $request !== 'undefined' && $request) {
  // script-request-header
  onRequest();
} else {
  // task
  (async () => { await run(); $done(); })();
}
