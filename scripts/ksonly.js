/*
==================================================
  快手自动签到 - Loon LPX 脚本
  Source: https://github.com/1nbeat/kuaishou-check-in
  Convert: 也也

  原 Java 逻辑：
  GET https://nebula.kuaishou.com/rest/wd/encourage/unionTask/signIn/report
  Header: Cookie: kuaishou.api_st=<token>

  Loon 逻辑：
  1. http-request 抓取 Cookie 里的 kuaishou.api_st 并保存。
  2. cron 定时读取已保存 token 执行签到。
==================================================
*/

const NAME = '快手自动签到';
const SIGN_URL = 'https://nebula.kuaishou.com/rest/wd/encourage/unionTask/signIn/report';
const STORE_KEY = 'kuaishou_api_st_tokens';
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 kuaishou';

const isRequest = typeof $request !== 'undefined';

function log(msg) { console.log(`[kuaishou] ${msg}`); }
function done(val) { try { $done(val || {}); } catch (_) {} }
function read(key) { try { return $persistentStore.read(key); } catch (_) { return null; } }
function write(key, val) { try { return $persistentStore.write(String(val || ''), key); } catch (_) { return false; } }
function notify(title, sub, body) {
  try {
    if (typeof $notification !== 'undefined') $notification.post(title, sub || '', body || '');
    else if (typeof $notify !== 'undefined') $notify(title, sub || '', body || '');
  } catch (_) {}
}
function lowerHeaders(h) {
  const out = {};
  Object.keys(h || {}).forEach(k => out[k.toLowerCase()] = h[k]);
  return out;
}
function uniq(arr) {
  const seen = {};
  const out = [];
  for (const v of arr || []) {
    const s = String(v || '').trim();
    if (!s || seen[s]) continue;
    seen[s] = true;
    out.push(s);
  }
  return out;
}
function getTokens() {
  return uniq(String(read(STORE_KEY) || '').split(/[&\n,]+/).map(s => s.trim()).filter(Boolean));
}
function saveToken(token) {
  const tokens = getTokens();
  if (!tokens.includes(token)) tokens.push(token);
  write(STORE_KEY, tokens.join('&'));
  return tokens.length;
}
function maskToken(token) {
  token = String(token || '');
  if (token.length <= 12) return token ? token.slice(0, 3) + '***' : '';
  return token.slice(0, 6) + '...' + token.slice(-6);
}
function extractApiSt(cookie) {
  const str = String(cookie || '');
  const m = str.match(/(?:^|;\s*)kuaishou\.api_st=([^;]+)/i);
  return m ? decodeURIComponent(m[1]).trim() : '';
}
function httpGet(url, headers) {
  return new Promise((resolve, reject) => {
    $httpClient.get({ url, headers: headers || {}, timeout: 30 }, (err, resp, body) => {
      if (err) return reject(err);
      resolve({ status: resp && resp.status ? resp.status : 0, headers: resp && resp.headers || {}, body: body || '' });
    });
  });
}

function onRequest() {
  const url = $request.url || '';
  const headers = lowerHeaders($request.headers || {});
  const cookie = headers.cookie || '';
  const token = extractApiSt(cookie);

  if (token) {
    const count = saveToken(token);
    log(`✅ 已保存 kuaishou.api_st：${maskToken(token)}，当前共 ${count} 个账号`);
  } else {
    log(`未在该请求 Cookie 中发现 kuaishou.api_st：${url}`);
  }
  done({});
}

async function signOne(token, index) {
  const headers = {
    'Cookie': `kuaishou.api_st=${token}`,
    'User-Agent': UA,
    'Accept': 'application/json,text/plain,*/*',
    'Connection': 'keep-alive',
    'Host': 'nebula.kuaishou.com'
  };
  const res = await httpGet(SIGN_URL, headers);
  let data = null;
  try { data = JSON.parse(res.body || '{}'); } catch (_) {}

  const rawMsg = data ? (data.msg || data.message || data.error_msg || data.result || '') : '';
  const code = data ? (data.result || data.code || data.status) : '';
  const okText = /成功|已签|已领取|already|success|ok/i.test(String(res.body || rawMsg));
  const title = okText ? '✅ 签到完成' : (res.status >= 200 && res.status < 300 ? '⚠️ 请求完成' : '❌ 请求失败');
  const line = `账号${index} HTTP ${res.status}${rawMsg ? '，' + rawMsg : ''}`;

  log(`${title}：${line}`);
  log(`响应：${String(res.body || '').slice(0, 500)}`);
  return { title, line, status: res.status, code, body: res.body || '' };
}

async function main() {
  log(`====== ${NAME} 开始 ======`);
  const tokens = getTokens();
  if (!tokens.length) {
    const msg = '未抓到 kuaishou.api_st，请打开快手极速版/快手相关页面，让 Loon 抓包保存 Cookie。';
    log(`❌ ${msg}`);
    notify(NAME, '❌ 缺少 Token', msg);
    done();
    return;
  }

  const results = [];
  for (let i = 0; i < tokens.length; i++) {
    try {
      results.push(await signOne(tokens[i], i + 1));
    } catch (e) {
      const line = `账号${i + 1}：${e.message || e}`;
      log(`❌ ${line}`);
      results.push({ title: '❌ 签到异常', line });
    }
  }

  const body = results.map(r => r.line).join('\n');
  notify(NAME, `完成 ${results.length} 个账号`, body);
  log(`====== ${NAME} 结束 ======`);
  done();
}

if (isRequest) onRequest();
else main();
