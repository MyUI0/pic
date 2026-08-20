/*
 * 酷云 / 酷卡 Loon 签到 + 广告积分脚本
 * 作者: 也也
 *
 * 已还原小程序动态签名：
 * MD5(x-timestamp + x-random + x-version + x-agent + token + endpoint)
 */

const NAME = '酷云积分';
const BASE = 'https://zuhu.kuka001.com';
const AUTH_KEY = 'kuyun_loon_auth';

const TASKS = {
  sign: { type: 2, name: '签到积分' },
  adView: { type: 400, name: '浏览视频奖励' },
  adClick: { type: 401, name: '视频点击奖励' },
};

function parseArgs() {
  const raw = typeof $argument === 'string' ? $argument : '';
  const result = {};

  raw.split('&').forEach(pair => {
    if (!pair) return;
    const index = pair.indexOf('=');
    const key = decodeValue(index >= 0 ? pair.slice(0, index) : pair);
    const value = decodeValue(index >= 0 ? pair.slice(index + 1) : '1');
    if (key) result[key.trim()] = value.trim();
  });

  return result;
}

function decodeValue(value) {
  try {
    return decodeURIComponent(String(value || '').replace(/\+/g, ' '));
  } catch (_) {
    return String(value || '');
  }
}

const ARG = parseArgs();
const MODE = ARG.mode || (typeof $request !== 'undefined' ? 'capture' : 'run');
const CAPTURE_NOTIFY = String(ARG.notify || '1') !== '0';
const MAX_AD_LOOP = Math.max(1, Math.min(Number(ARG.maxAd) || 20, 50));
const AD_DELAY = Math.max(0, Math.min(Number(ARG.delay) || 800, 10000));

function safeJson(value, fallback) {
  if (value !== null && typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch (_) {
    return fallback === undefined ? null : fallback;
  }
}

function getHeader(headers, name) {
  if (!headers) return '';
  const target = String(name).toLowerCase();
  const keys = Object.keys(headers);

  for (let i = 0; i < keys.length; i++) {
    if (keys[i].toLowerCase() === target) return String(headers[keys[i]] || '');
  }

  return '';
}

function mask(value) {
  if (!value) return '-';
  const text = String(value);
  return `${text.slice(0, 6)}***`;
}

function today() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function uuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, char => {
    const random = Math.random() * 16 | 0;
    const value = char === 'x' ? random : (random & 0x3 | 0x8);
    return value.toString(16);
  });
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function createRandom() {
  return `${randomInt(200, 999)}5${randomInt(1000, 9999)}`;
}

function endpointName(url) {
  const path = String(url || '').split('?')[0].replace(/\/+$/, '');
  const parts = path.split('/');
  return parts[parts.length - 1] || '';
}

function add32(a, b) {
  return a + b & 0xFFFFFFFF;
}

function cmn(q, a, b, x, s, t) {
  a = add32(add32(a, q), add32(x, t));
  return add32(a << s | a >>> 32 - s, b);
}

function ff(a, b, c, d, x, s, t) {
  return cmn(b & c | ~b & d, a, b, x, s, t);
}

function gg(a, b, c, d, x, s, t) {
  return cmn(b & d | c & ~d, a, b, x, s, t);
}

function hh(a, b, c, d, x, s, t) {
  return cmn(b ^ c ^ d, a, b, x, s, t);
}

function ii(a, b, c, d, x, s, t) {
  return cmn(c ^ (b | ~d), a, b, x, s, t);
}

function md5Cycle(state, block) {
  let a = state[0];
  let b = state[1];
  let c = state[2];
  let d = state[3];

  a = ff(a, b, c, d, block[0], 7, -680876936);
  d = ff(d, a, b, c, block[1], 12, -389564586);
  c = ff(c, d, a, b, block[2], 17, 606105819);
  b = ff(b, c, d, a, block[3], 22, -1044525330);
  a = ff(a, b, c, d, block[4], 7, -176418897);
  d = ff(d, a, b, c, block[5], 12, 1200080426);
  c = ff(c, d, a, b, block[6], 17, -1473231341);
  b = ff(b, c, d, a, block[7], 22, -45705983);
  a = ff(a, b, c, d, block[8], 7, 1770035416);
  d = ff(d, a, b, c, block[9], 12, -1958414417);
  c = ff(c, d, a, b, block[10], 17, -42063);
  b = ff(b, c, d, a, block[11], 22, -1990404162);
  a = ff(a, b, c, d, block[12], 7, 1804603682);
  d = ff(d, a, b, c, block[13], 12, -40341101);
  c = ff(c, d, a, b, block[14], 17, -1502002290);
  b = ff(b, c, d, a, block[15], 22, 1236535329);

  a = gg(a, b, c, d, block[1], 5, -165796510);
  d = gg(d, a, b, c, block[6], 9, -1069501632);
  c = gg(c, d, a, b, block[11], 14, 643717713);
  b = gg(b, c, d, a, block[0], 20, -373897302);
  a = gg(a, b, c, d, block[5], 5, -701558691);
  d = gg(d, a, b, c, block[10], 9, 38016083);
  c = gg(c, d, a, b, block[15], 14, -660478335);
  b = gg(b, c, d, a, block[4], 20, -405537848);
  a = gg(a, b, c, d, block[9], 5, 568446438);
  d = gg(d, a, b, c, block[14], 9, -1019803690);
  c = gg(c, d, a, b, block[3], 14, -187363961);
  b = gg(b, c, d, a, block[8], 20, 1163531501);
  a = gg(a, b, c, d, block[13], 5, -1444681467);
  d = gg(d, a, b, c, block[2], 9, -51403784);
  c = gg(c, d, a, b, block[7], 14, 1735328473);
  b = gg(b, c, d, a, block[12], 20, -1926607734);

  a = hh(a, b, c, d, block[5], 4, -378558);
  d = hh(d, a, b, c, block[8], 11, -2022574463);
  c = hh(c, d, a, b, block[11], 16, 1839030562);
  b = hh(b, c, d, a, block[14], 23, -35309556);
  a = hh(a, b, c, d, block[1], 4, -1530992060);
  d = hh(d, a, b, c, block[4], 11, 1272893353);
  c = hh(c, d, a, b, block[7], 16, -155497632);
  b = hh(b, c, d, a, block[10], 23, -1094730640);
  a = hh(a, b, c, d, block[13], 4, 681279174);
  d = hh(d, a, b, c, block[0], 11, -358537222);
  c = hh(c, d, a, b, block[3], 16, -722521979);
  b = hh(b, c, d, a, block[6], 23, 76029189);
  a = hh(a, b, c, d, block[9], 4, -640364487);
  d = hh(d, a, b, c, block[12], 11, -421815835);
  c = hh(c, d, a, b, block[15], 16, 530742520);
  b = hh(b, c, d, a, block[2], 23, -995338651);

  a = ii(a, b, c, d, block[0], 6, -198630844);
  d = ii(d, a, b, c, block[7], 10, 1126891415);
  c = ii(c, d, a, b, block[14], 15, -1416354905);
  b = ii(b, c, d, a, block[5], 21, -57434055);
  a = ii(a, b, c, d, block[12], 6, 1700485571);
  d = ii(d, a, b, c, block[3], 10, -1894986606);
  c = ii(c, d, a, b, block[10], 15, -1051523);
  b = ii(b, c, d, a, block[1], 21, -2054922799);
  a = ii(a, b, c, d, block[8], 6, 1873313359);
  d = ii(d, a, b, c, block[15], 10, -30611744);
  c = ii(c, d, a, b, block[6], 15, -1560198380);
  b = ii(b, c, d, a, block[13], 21, 1309151649);
  a = ii(a, b, c, d, block[4], 6, -145523070);
  d = ii(d, a, b, c, block[11], 10, -1120210379);
  c = ii(c, d, a, b, block[2], 15, 718787259);
  b = ii(b, c, d, a, block[9], 21, -343485551);

  state[0] = add32(a, state[0]);
  state[1] = add32(b, state[1]);
  state[2] = add32(c, state[2]);
  state[3] = add32(d, state[3]);
}

function md5Block(text) {
  const block = [];
  for (let i = 0; i < 64; i += 4) {
    block[i >> 2] = text.charCodeAt(i) |
      text.charCodeAt(i + 1) << 8 |
      text.charCodeAt(i + 2) << 16 |
      text.charCodeAt(i + 3) << 24;
  }
  return block;
}

function md5State(text) {
  const length = text.length;
  const state = [1732584193, -271733879, -1732584194, 271733878];
  let index;

  for (index = 64; index <= length; index += 64) {
    md5Cycle(state, md5Block(text.substring(index - 64, index)));
  }

  text = text.substring(index - 64);
  const tail = new Array(16).fill(0);

  for (index = 0; index < text.length; index++) {
    tail[index >> 2] |= text.charCodeAt(index) << (index % 4 << 3);
  }

  tail[index >> 2] |= 0x80 << (index % 4 << 3);

  if (index > 55) {
    md5Cycle(state, tail);
    for (index = 0; index < 16; index++) tail[index] = 0;
  }

  tail[14] = length * 8;
  md5Cycle(state, tail);
  return state;
}

function hex(value) {
  const hexChars = '0123456789abcdef';
  let result = '';

  for (let i = 0; i < 4; i++) {
    result += hexChars.charAt(value >> (i * 8 + 4) & 0x0F) +
      hexChars.charAt(value >> (i * 8) & 0x0F);
  }

  return result;
}

function md5(value) {
  const text = unescape(encodeURIComponent(String(value)));
  return md5State(text).map(hex).join('');
}

function createSignatureHeaders(auth, url) {
  const timestamp = String(Date.now());
  const random = createRandom();
  const version = auth.version || '1.0.0.0';
  const agent = auth.agent || 'ios';
  const endpoint = endpointName(url);
  const source = `${timestamp}${random}${version}${agent}${auth.token}${endpoint}`;

  return {
    'x-timestamp': timestamp,
    'x-version': version,
    'x-random': random,
    'x-agent': agent,
    'x-sign': md5(source),
  };
}

function saveAuthFromRequest() {
  if (MODE !== 'capture') {
    $done({});
    return;
  }

  const requestHeaders = $request.headers || {};
  const oldAuth = safeJson($persistentStore.read(AUTH_KEY) || '{}', {}) || {};

  const auth = {
    openId: getHeader(requestHeaders, 'openId') || oldAuth.openId || '',
    token: getHeader(requestHeaders, 'token') || oldAuth.token || '',
    uid: getHeader(requestHeaders, 'uid') || oldAuth.uid || '',
    appId: getHeader(requestHeaders, 'appId') || oldAuth.appId || 'wxe417dfc034255e91',
    version: getHeader(requestHeaders, 'x-version') || oldAuth.version || '1.0.0.0',
    agent: getHeader(requestHeaders, 'x-agent') || oldAuth.agent || 'ios',
    ua: getHeader(requestHeaders, 'User-Agent') || oldAuth.ua || '',
    referer: getHeader(requestHeaders, 'Referer') || oldAuth.referer ||
      'https://servicewechat.com/wxe417dfc034255e91/264/page-frame.html',
    contentType: getHeader(requestHeaders, 'Content-Type') || oldAuth.contentType ||
      'application/json;charset=utf-8',
    updatedAt: new Date().toISOString(),
  };

  const uidMatch = String($request.url || '').match(/\/market\/pointAccount\/uid\/([^/?#]+)/i);
  if (!auth.uid && uidMatch) auth.uid = decodeValue(uidMatch[1]);

  if (!auth.openId || !auth.token) {
    console.log(`[${NAME}] 当前请求未包含 openId/token，跳过保存`);
    $done({});
    return;
  }

  const changed = auth.openId !== oldAuth.openId ||
    auth.token !== oldAuth.token ||
    auth.uid !== oldAuth.uid;

  const saved = $persistentStore.write(JSON.stringify(auth), AUTH_KEY);

  console.log(
    `[${NAME}] 凭证${saved ? '已保存' : '保存失败'} ` +
    `openId=${mask(auth.openId)} token=${mask(auth.token)} uid=${auth.uid || '-'}`
  );

  if (saved && CAPTURE_NOTIFY && changed) {
    $notification.post(
      NAME,
      '凭证保存成功',
      `uid: ${auth.uid || '暂未捕获'}，签名参数已同步`
    );
  }

  $done({});
}

function loadAuth() {
  const auth = safeJson($persistentStore.read(AUTH_KEY) || '{}', {}) || {};

  if (!auth.openId || !auth.token) {
    throw new Error('缺少 openId/token：请开启插件中的“自动抓包更新登录凭证”，再打开酷云/酷卡小程序');
  }

  if (!auth.uid) {
    throw new Error('缺少 uid：请开启抓包开关并重新进入酷云/酷卡小程序积分页面');
  }

  return auth;
}

function buildHeaders(auth, url) {
  return Object.assign({
    'content-type': auth.contentType || 'application/json;charset=utf-8',
    'openId': auth.openId,
    'uid': auth.uid,
    'appId': auth.appId || 'wxe417dfc034255e91',
    'token': auth.token,
    'User-Agent': auth.ua ||
      'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 MicroMessenger/8.0.70',
    'Referer': auth.referer ||
      'https://servicewechat.com/wxe417dfc034255e91/264/page-frame.html',
  }, createSignatureHeaders(auth, url));
}

function apiSuccess(json) {
  return !!json && Number(json.code) === 0;
}

function resultMessage(result, fallback) {
  if (result && result.json) {
    return String(result.json.msg || result.json.message || fallback);
  }
  if (result && result.error) return String(result.error);
  if (result && result.raw) return String(result.raw);
  return fallback;
}

function request(method, url, body, auth) {
  return new Promise(resolve => {
    const client = $httpClient[String(method).toLowerCase()];
    const options = {
      url,
      headers: buildHeaders(auth, url),
      timeout: 15000,
    };

    if (body !== undefined && body !== null) {
      options.body = typeof body === 'string' ? body : JSON.stringify(body);
    }

    client(options, (error, response, data) => {
      const status = response ? Number(response.statusCode || response.status || 0) : 0;
      const json = safeJson(data, null);

      resolve({
        ok: !error && apiSuccess(json),
        status,
        error: error ? String(error) : '',
        json,
        raw: data,
      });
    });
  });
}

async function queryChannel(auth, type) {
  const result = await request(
    'POST',
    `${BASE}/market/pointAccountFlow/dayDetailByChannel`,
    { dictTypeList: [type] },
    auth
  );

  if (!result.ok) {
    return { ok: false, msg: resultMessage(result, '查询失败') };
  }

  const item = Array.isArray(result.json.data) ? result.json.data[0] : null;
  if (!item) return { ok: false, msg: '无任务数据' };

  return {
    ok: true,
    surplusCount: Number(item.surplusCount || 0),
    acquiredPoint: String(item.acquiredPoint || '0'),
    singlePoints: Number(item.singlePoints || 0),
  };
}

async function doSign(auth) {
  const before = await queryChannel(auth, TASKS.sign.type);

  if (before.ok && before.surplusCount <= 0) {
    return `签到: 今日已完成，已得 ${before.acquiredPoint}`;
  }

  const result = await request(
    'POST',
    `${BASE}/market/userSignRecord/sign`,
    {},
    auth
  );

  if (!result.ok) {
    const message = resultMessage(result, '失败');
    if (/已签到|重复签到|无需重复/i.test(message)) {
      return `签到: 今日已签到 (${message})`;
    }
    return `签到: 失败 (${message})`;
  }

  const after = await queryChannel(auth, TASKS.sign.type);
  return after.ok ? `签到: 成功，今日已得 ${after.acquiredPoint}` : '签到: 成功';
}

async function doAd(auth, type, name) {
  const logs = [];
  let task = await queryChannel(auth, type);

  if (!task.ok) return `${name}: 查询失败 (${task.msg})`;
  if (task.surplusCount <= 0) return `${name}: 今日已完成，已得 ${task.acquiredPoint}`;

  const count = Math.min(task.surplusCount, MAX_AD_LOOP);

  for (let index = 0; index < count; index++) {
    const body = type === TASKS.adClick.type
      ? { type, uuid: uuid() }
      : { type };

    const result = await request(
      'POST',
      `${BASE}/api/market/act/stimulateVideo`,
      body,
      auth
    );

    if (!result.ok) {
      logs.push(`第${index + 1}次失败: ${resultMessage(result, '领取失败')}`);
      break;
    }

    const data = result.json.data || {};
    logs.push(`+${data.points || task.singlePoints || 0}`);

    if (index + 1 < count && AD_DELAY > 0) await sleep(AD_DELAY);

    task = await queryChannel(auth, type);
    if (!task.ok || task.surplusCount <= 0) break;
  }

  const after = await queryChannel(auth, type);
  const total = after.ok ? after.acquiredPoint : '?';
  return `${name}: ${logs.join(', ') || '无新增'}，今日已得 ${total}`;
}

async function queryBalance(auth) {
  const result = await request(
    'GET',
    `${BASE}/market/pointAccount/uid/${encodeURIComponent(auth.uid)}`,
    null,
    auth
  );

  if (!result.ok || !Array.isArray(result.json.data) || !result.json.data[0]) return '';

  const account = result.json.data[0];
  return `当前积分: ${account.amount || '-'}，已用: ${account.usedAmount || '-'}`;
}

async function main() {
  const auth = loadAuth();
  const results = [];

  results.push(await doSign(auth));
  results.push(await doAd(auth, TASKS.adView.type, TASKS.adView.name));
  results.push(await doAd(auth, TASKS.adClick.type, TASKS.adClick.name));

  const balance = await queryBalance(auth);
  if (balance) results.push(balance);

  const text = results.join('\n');
  console.log(`[${NAME}]\n${text}`);
  $notification.post(NAME, `任务完成 ${today()}`, text);
  $done();
}

if (typeof $request !== 'undefined') {
  saveAuthFromRequest();
} else {
  main().catch(error => {
    const message = error && error.message ? error.message : String(error);
    console.log(`[${NAME}] ${message}`);
    $notification.post(NAME, '运行失败', message);
    $done();
  });
}
