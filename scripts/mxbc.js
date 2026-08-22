/*
==================================================
  蜜雪冰城 - Loon 插件脚本
  基于最新 Node 脚本转换：Loon 原生 $httpClient / $persistentStore
  功能：抓包缓存 Access-Token / duiba 登录 URL / 活动 Cookie，定时访问雪王铺并尝试领币
==================================================

使用方式：
1. 安装 mxbc_loon.plugin 或 mxbc_loon.lpx。
2. 打开 MitM，进入蜜雪冰城小程序/APP，访问「雪王铺」相关页面。
3. Loon 日志出现 Token、duiba URL、活动 Cookie 缓存提示后，可手动运行或等定时任务。

说明：
- 原最新版脚本依赖 Node crypto RSA 签名与 wx_server 换 code；Loon 环境不支持这些 Node 模块。
- 本版本通过抓包缓存服务端已签名请求，避免在 Loon 内做 RSA 私钥签名。
==================================================
*/

const SCRIPT_NAME = '蜜雪冰城';
const isRequest = typeof $request !== 'undefined';
const isResponse = typeof $response !== 'undefined';
const isLoon = typeof $persistentStore !== 'undefined' && typeof $httpClient !== 'undefined';

const API_BASE = 'https://mxsa.mxbc.net/api';
const APP_ID = 'd82be6bbc1da11eb9dd000163e122ecb';
const MINI_APP_ID = 'wx7696c66d2245d107';
const APP_VERSION = '2.8.28';
const ACTIVITY_HOST = '76177-activity.dexfu.cn';
const SKIN_ID = '216593';
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0.70(0x1800463a) NetType/WIFI Language/zh_CN miniProgram';

const K = {
  TOKEN: 'mxbc_access_token',
  CID: 'mxbc_x_ssos_cid',
  DUIBA_URL: 'mxbc_duiba_signed_url',
  ACTIVITY_URL: 'mxbc_activity_login_url',
  ACTIVITY_CK: 'mxbc_activity_cookie',
  PHONE: 'mxbc_phone_mask',
  POINT: 'mxbc_point'
};

function log(msg) { console.log(`[mxbc] ${msg}`); }
function read(key) { try { return $persistentStore.read(key); } catch (_) { return null; } }
function write(key, val) { try { return $persistentStore.write(String(val || ''), key); } catch (_) { return false; } }
function done(val) { try { $done(val || {}); } catch (_) {} }
function notify(title, sub, body) {
  try {
    if (typeof $notification !== 'undefined') $notification.post(title, sub || '', body || '');
    else if (typeof $notify !== 'undefined') $notify(title, sub || '', body || '');
  } catch (_) {}
}
function maskPhone(phone) { return String(phone || '').replace(/^(\d{3})\d{4}(\d{4})$/, '$1****$2'); }
function lowerHeaders(h) {
  const out = {};
  Object.keys(h || {}).forEach(k => out[k.toLowerCase()] = h[k]);
  return out;
}
function cookieObj(setCookie) {
  const arr = Array.isArray(setCookie) ? setCookie : (setCookie ? String(setCookie).split(/,(?=\s*[^;,=]+=[^;,]+)/) : []);
  const obj = {};
  for (const s of arr) {
    if (/\b(max-age=0|expires=thu,\s*01 jan 1970)\b/i.test(s)) continue;
    const m = String(s).match(/^\s*([^=;]+)=([^;]*)/);
    if (!m || !m[2]) continue;
    obj[m[1].trim()] = m[2].trim();
  }
  return obj;
}
function cookieStr(obj, names) {
  const keys = names && names.length ? names.filter(k => obj[k]) : Object.keys(obj).filter(k => obj[k]);
  return keys.map(k => `${k}=${obj[k]}`).join('; ');
}
function request(method, url, headers, body) {
  return new Promise((resolve, reject) => {
    const opts = { url, headers: headers || {}, timeout: 20 };
    if (body !== undefined && body !== null) opts.body = typeof body === 'string' ? body : JSON.stringify(body);
    $httpClient[method.toLowerCase()](opts, (err, resp, data) => {
      if (err) return reject(err);
      resolve({ status: resp && resp.status ? resp.status : 0, headers: lowerHeaders(resp && resp.headers), body: data || '' });
    });
  });
}
const get = (url, headers) => request('get', url, headers);
const post = (url, body, headers) => request('post', url, headers, body);

function miniHeaders(token) {
  return {
    'Host': 'mxsa.mxbc.net',
    'Connection': 'keep-alive',
    'User-Agent': 'Mozilla/5.0 (Windows NT 6.1; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/81.0.4044.138 Safari/537.36 MicroMessenger/7.0.4.501 NetType/WIFI MiniProgramEnv/Windows WindowsWechat/WMPF',
    'xweb_xhr': '1',
    'Access-Token': token || '',
    'Content-Type': 'application/json',
    'Accept': '*/*',
    'Referer': `https://servicewechat.com/${MINI_APP_ID}/59/page-frame.html`,
    'Accept-Language': 'zh-CN,zh-Hans;q=0.9',
    'version': APP_VERSION
  };
}

function onRequest() {
  const url = $request.url || '';
  const h = lowerHeaders($request.headers || {});
  const token = h['access-token'];
  if (token && token !== read(K.TOKEN)) {
    write(K.TOKEN, token);
    log(`✅ Access-Token 已缓存: ${token.slice(0, 16)}...`);
  }
  const cid = h['x-ssos-cid'];
  if (cid) write(K.CID, cid);
  if (/\/api\/v1\/customer\/info/i.test(url)) {
    write('mxbc_customer_info_signed_url', url);
    log('✅ customer/info 已签名 URL 已缓存');
  }
  if (/\/api\/v1\/duiba\/getLoginUrl/i.test(url)) {
    write(K.DUIBA_URL, url);
    log('✅ duiba 已签名 URL 已缓存');
  }
  done({});
}

function onResponse() {
  const url = $request.url || '';
  const rh = lowerHeaders(($response && $response.headers) || {});
  const sc = rh['set-cookie'];
  if (/autoLogin\/autologin|76177-activity\.dexfu\.cn/i.test(url) && sc) {
    const obj = cookieObj(sc);
    const ck = cookieStr(obj, ['wdata4', 'w_ts', '_ac', 'wdata3', 'dcustom', 'tokenId']);
    if (ck) {
      write(K.ACTIVITY_CK, ck);
      log(`✅ 活动 Cookie 已缓存: ${Object.keys(obj).join(', ')}`);
    }
  }
  done({});
}

async function userInfo(token) {
  // Loon 无 RSA 签名，用户信息校验优先依赖已抓包的 token；如需严格校验，请打开小程序刷新 token。
  const signed = read('mxbc_customer_info_signed_url');
  if (!signed) return null;
  const res = await get(signed, miniHeaders(token));
  const data = JSON.parse(res.body || '{}');
  if (data.code === 0 && data.data) {
    const phone = maskPhone(data.data.mobilePhone || '');
    const point = data.data.customerPoint;
    write(K.PHONE, phone);
    write(K.POINT, point);
    log(`用户有效: ${phone || '未知账号'}，雪王币 ${point}`);
  }
  return data;
}

async function getActivityLoginUrl(token) {
  const duibaUrl = read(K.DUIBA_URL);
  if (!duibaUrl) throw new Error('缺少 duiba 已签名 URL，请打开蜜雪冰城小程序进入雪王铺刷新');
  const cid = read(K.CID) || '';
  const headers = miniHeaders(token);
  if (cid) headers['x-ssos-cid'] = cid;
  log('📡 请求 duiba 登录链接...');
  const res = await get(duibaUrl, headers);
  let data;
  try { data = JSON.parse(res.body || '{}'); } catch (_) { throw new Error('duiba 响应不是 JSON'); }
  if (data.code !== 0 || !data.data || !data.data.loginUrl) {
    write(K.DUIBA_URL, '');
    throw new Error(`duiba URL 失效：${data.msg || '未知错误'}，请打开小程序刷新`);
  }
  write(K.ACTIVITY_URL, data.data.loginUrl);
  return data.data.loginUrl;
}

async function getActivityCookie(loginUrl) {
  log('📡 获取活动 Cookie...');
  const res = await get(loginUrl, {
    'User-Agent': UA,
    'Referer': `https://${ACTIVITY_HOST}/chw/visual-editor/skins?id=${SKIN_ID}`
  });
  const obj = cookieObj(res.headers['set-cookie']);
  const ck = cookieStr(obj, ['wdata4', 'w_ts', '_ac', 'wdata3', 'dcustom', 'tokenId']);
  if (!ck) throw new Error('未获取到完整活动 Cookie');
  write(K.ACTIVITY_CK, ck);
  log('✅ 获取活动 Cookie 成功');
  return ck;
}

async function visitSnowMall(ck) {
  const referer = `https://${ACTIVITY_HOST}/chw/visual-editor/skins?id=${SKIN_ID}&from=login&spm=76177.1.1.1`;
  const headers = { 'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 13_2_3 like Mac OS X)mxsa_mxbc', 'Referer': referer, 'Cookie': ck };
  await get(`https://${ACTIVITY_HOST}/chome/index?from=login&spm=76177.1.1.1`, headers);
  log('✅ 访问雪王铺成功');

  // 兼容旧活动接口：能领则领，不能领不影响主流程。
  try {
    const h2 = { 'User-Agent': UA, 'Referer': referer, 'Cookie': ck };
    const b1 = await get(`https://${ACTIVITY_HOST}/globalReward/accountBalance`, h2);
    const d1 = JSON.parse(b1.body || '{}');
    const before = Number(d1 && d1.data && d1.data.balance || 0);
    const vr = await post(`https://${ACTIVITY_HOST}/globalReward/visitMall`, null, h2);
    const vd = JSON.parse(vr.body || '{}');
    const b2 = await get(`https://${ACTIVITY_HOST}/globalReward/accountBalance`, h2);
    const d2 = JSON.parse(b2.body || '{}');
    const after = Number(d2 && d2.data && d2.data.balance || before);
    const diff = after - before;
    const msg = vd.success ? '领币成功' : (/已|重复|already|visited|今天|今日/i.test(vd.desc || '') ? '今日已领取' : (vd.desc || '已访问'));
    notify('🍦 蜜雪冰城 雪王铺', diff > 0 ? `✅ ${msg}` : `✅ ${msg}`, diff > 0 ? `银两 ${before} → ${after} 🪙 +${diff}` : `银两 ${after} 🪙`);
    log(`${msg}，银两 ${before} → ${after}`);
  } catch (e) {
    notify('🍦 蜜雪冰城 雪王铺', '✅ 访问成功', '领币接口无响应或活动规则已变化');
    log(`领币接口跳过：${e.message || e}`);
  }
}

async function main() {
  log('====== 🍦 蜜雪冰城 Loon 任务开始 ======');
  let ck = read(K.ACTIVITY_CK);
  if (ck) {
    try {
      log('💾 使用缓存活动 Cookie');
      await visitSnowMall(ck);
      done();
      return;
    } catch (e) {
      log(`缓存 Cookie 失效：${e.message || e}`);
      write(K.ACTIVITY_CK, '');
    }
  }

  const token = read(K.TOKEN);
  if (!token) {
    notify('🍦 蜜雪冰城', '❌ 缺少 Token', '请打开蜜雪冰城小程序/APP，进入雪王铺页面完成抓包缓存');
    done();
    return;
  }

  try {
    try { await userInfo(token); } catch (_) {}
    const loginUrl = await getActivityLoginUrl(token);
    ck = await getActivityCookie(loginUrl);
    await visitSnowMall(ck);
  } catch (e) {
    const msg = e.message || String(e);
    log(`❌ ${msg}`);
    notify('🍦 蜜雪冰城', '❌ 任务失败', msg);
  }
  done();
}

if (isRequest && !isResponse) onRequest();
else if (isRequest && isResponse) onResponse();
else main();