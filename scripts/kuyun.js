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
  // Loon 3.5.1+ typed object binding: never split/decode credential values.
  if (typeof $argument === 'object' && $argument !== null && !Array.isArray($argument)) {
    return Object.assign({}, $argument);
  }
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
const AD_DELAY = Math.max(0, Math.min(Number(ARG.delay) || 42000, 60000));

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

function captureHeaders(headers, old) {
  return {
    appIdCaptured: !!getHeader(headers, 'appId') || old.appIdCaptured === true,
    appId: getHeader(headers, 'appId') || old.appId || 'wxe417dfc034255e91',
    version: getHeader(headers, 'x-version') || '1.0.0.0',
    agent: getHeader(headers, 'x-agent') || 'ios',
    ua: getHeader(headers, 'User-Agent'),
    referer: getHeader(headers, 'Referer'),
    contentType: getHeader(headers, 'Content-Type') || 'application/json;charset=utf-8',
  };
}

function sameIdentity(old, openId, uid, appId) {
  return old.openId === openId && (!uid || !old.uid || uid === old.uid) &&
    (!appId || !old.appId || appId === old.appId);
}

function persistAuth(auth, old) {
  const changed = !old.token || auth.openId !== old.openId ||
    auth.authScheme !== old.authScheme || auth.uid !== old.uid || auth.appId !== old.appId;
  auth.updatedAt = new Date().toISOString();
  const saved = $persistentStore.write(JSON.stringify(auth), AUTH_KEY);
  if (!saved) console.log(`[${NAME}] 凭证保存失败`);
  if (saved && CAPTURE_NOTIFY && changed) {
    $notification.post(NAME, '凭证保存成功', '认证及签名参数已同步');
  }
}

function saveAuthFromRequest() {
  if (MODE !== 'capture' || !/^https:\/\/zuhu\.kuka001\.com\/(?:market|api)\//i.test(String($request.url || ''))) {
    $done({});
    return;
  }
  const headers = $request.headers || {};
  const authorization = getHeader(headers, 'Authorization').trim();
  const bearer = authorization.match(/^Bearer\s+(\S+)\s*$/i);
  const legacy = getHeader(headers, 'token').trim();
  const token = bearer ? bearer[1] : legacy;
  const openId = getHeader(headers, 'openId');
  const uidMatch = String($request.url || '').match(/\/market\/pointAccount\/uid\/([^/?#]+)/i);
  const pathUid = uidMatch ? decodeValue(uidMatch[1]) : '';
  const headerUid = getHeader(headers, 'uid');
  if ((authorization && !bearer) || (bearer && legacy && legacy !== token) ||
      !token || !openId || (pathUid && headerUid && pathUid !== headerUid)) {
    $done({});
    return;
  }
  const old = safeJson($persistentStore.read(AUTH_KEY) || '{}', {}) || {};
  const uid = headerUid || pathUid;
  // 仅同一 token 且无身份冲突时补齐缓存；新 token 必须重新建立身份。
  const same = old.token === token && sameIdentity(old, openId, uid, getHeader(headers, 'appId'));
  const auth = Object.assign(captureHeaders(headers, same ? old : {}), {
    openId, token, authScheme: bearer ? 'bearer' : 'token',
    uid: uid || (same ? old.uid : '') || '',
  });
  if (same) {
    if (typeof old.refreshToken === 'string' && old.refreshToken) auth.refreshToken = old.refreshToken;
    if (Number.isFinite(old.expire) && old.expire > 0) auth.expire = old.expire;
  }
  persistAuth(auth, old);
  $done({});
}

function saveAuthFromResponse() {
  // 只读取成功登录响应，绝不读取/保存登录请求体。
  if (MODE !== 'capture' || typeof $request === 'undefined' ||
      String($request.method || '').toUpperCase() !== 'POST' ||
      !/^https:\/\/zuhu\.kuka001\.com\/api\/login\/userSess(?:\?[^#]*)?$/i.test(String($request.url || ''))) {
    $done({});
    return;
  }
  const status = Number($response.statusCode || $response.status || 0);
  const json = safeJson($response.body, null);
  const data = json && json.data;
  if ((status && (status < 200 || status >= 300)) || !json ||
      !(json.code === 0 || json.code === '0') || !data ||
      typeof data.token !== 'string' || !data.token || /\s/.test(data.token)) {
    $done({});
    return;
  }
  const headers = $request.headers || {};
  const openId = getHeader(headers, 'openId');
  const uid = sessionUid(data);
  const headerUid = getHeader(headers, 'uid');
  if (!openId || !uid || (headerUid && headerUid !== uid)) {
    $done({});
    return;
  }
  const old = safeJson($persistentStore.read(AUTH_KEY) || '{}', {}) || {};
  // 登录响应本身建立完整身份；不继承旧账号 refreshToken/expire。
  const auth = Object.assign(captureHeaders(headers, {}), {
    openId, uid, token: data.token, authScheme: tokenScheme(data.token),
  });
  if (typeof data.refreshToken === 'string' && data.refreshToken && !/\s/.test(data.refreshToken)) {
    auth.refreshToken = data.refreshToken;
  }
  const expire = normalizeExpire(data.expire);
  if (expire) auth.expire = expire;
  persistAuth(auth, old);
  $done({});
}

function sessionUid(data) {
  // Prefer the observed top-level id; source also uses userInfo.id.
  // Read only the id when necessary, never copy or log the profile.
  let value = data.userId;
  if (value === undefined && data.userInfo && typeof data.userInfo === 'object') value = data.userInfo.id;
  return ['string', 'number'].includes(typeof value) && String(value) ? String(value) : '';
}
function normalizeExpire(value) {
  if (!['string', 'number'].includes(typeof value) || value === '') return 0;
  const number = Number(value);
  const ms = number < 1e12 ? number * 1000 : number;
  return Number.isSafeInteger(ms) && ms > 0 ? ms : 0;
}
function tokenScheme(token) { return token.startsWith('kkv2_') ? 'bearer' : 'token'; }

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
  const scheme = auth.authScheme || tokenScheme(auth.token);
  return Object.assign({
    'content-type': auth.contentType || 'application/json;charset=utf-8',
    'openId': auth.openId,
    'uid': auth.uid,
    'appId': auth.appId || 'wxe417dfc034255e91',
    [scheme === 'token' ? 'token' : 'Authorization']:
      scheme === 'token' ? auth.token : `Bearer ${auth.token}`,
    'User-Agent': auth.ua ||
      'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 MicroMessenger/8.0.70',
    'Referer': auth.referer ||
      'https://servicewechat.com/wxe417dfc034255e91/264/page-frame.html',
  }, createSignatureHeaders(auth, url));
}

function apiSuccess(json) {
  return !!json && (json.code === 0 || json.code === '0');
}

function resultMessage(result, fallback) {
  // 不透传服务端 msg/message/raw 或网络异常，避免回显认证与个人数据。
  if (result && (result.status === 401 || result.status === 403)) return '认证失败，请重新登录并捕获凭证';
  if (result && result.error) return '网络请求失败';
  return fallback;
}

const LOGIN_ERRORS = {
  disabled: '登录已失效；自动登录未开启，请重新捕获凭证',
  config: '请在 Loon 插件本地填写普通登录密码和账号，并开启密码登录后备',
  headers: '缺少已捕获的 openId/appId：请开启捕获并在小程序正常登录一次',
  failed: '认证恢复失败，已停止本轮；请在小程序重新登录并捕获凭证',
  busy: '另一轮正在更新认证，已停止本轮，请稍后重试',
  stale: '认证缓存已被更新，已停止本轮且未覆盖新凭证',
  storage: '认证存储写入失败，已停止本轮',
  changed: '自动登录返回不同账号，已停止且未覆盖缓存；请手动登录目标账号并重新捕获',
  exhausted: '认证仍失败，本轮不再登录或重试',
};
let loginAttempted = false;
let authAborted = false;
function stopAuth(key) {
  authAborted = true;
  throw new Error(LOGIN_ERRORS[key]);
}
function authRejected(result) {
  // Network errors/timeouts are ambiguous: never replay them.
  if (result.error || result.status >= 500) return false;
  if (result.status === 401) return true;
  if (!result.json || apiSuccess(result.json)) return false;
  if (result.json.code === 401 || result.json.code === '401') return true;
  const message = result.json.msg || result.json.message;
  // Conservative exact messages; generic nonzero codes / 403 are NOT enough.
  return typeof message === 'string' && [
    '登录已过期', '登录已失效', '登录已过期，请重新登录',
    '登录已失效，请重新登录', '登录过期，请重新登录',
    'token expired', 'token has expired', 'jwt expired',
  ].includes(message.trim().toLowerCase());
}
function buildLoginHeaders(auth, url) {
  return Object.assign({
    'content-type': 'application/json;charset=utf-8',
    openId: auth.openId, appId: auth.appId, uid: auth.uid,
    'User-Agent': auth.ua || '', Referer: auth.referer || '',
  }, createSignatureHeaders(auth, url));
}
let recoveryPromise = null;
let recoveryLeaseOwner = null;
let recoveryAttempted = false;
const LOCK_KEY = AUTH_KEY + '_lock';
function authFingerprint(auth) {
  return JSON.stringify([auth.openId, String(auth.uid), auth.appId, auth.token, auth.refreshToken || '']);
}
function assertCurrent(auth) {
  const current = safeJson($persistentStore.read(AUTH_KEY), {});
  if (!current || authFingerprint(current) !== authFingerprint(auth)) stopAuth('stale');
}
function validToken(value) { return typeof value === 'string' && !!value && !/\s/.test(value); }
function commitSession(auth, data, requireUid) {
  if (!data || !validToken(data.token)) stopAuth('failed');
  const uid = requireUid ? sessionUid(data) :
    (['string', 'number'].includes(typeof data.userId) ? String(data.userId) : '');
  if (requireUid && !uid) stopAuth('failed');
  if (uid && uid !== String(auth.uid)) stopAuth('changed');
  if (data.userId !== undefined && !uid) stopAuth('failed');
  // Refresh normally has no userId. Bind it to the exact captured token generation.
  if (data.openId !== undefined && data.openId !== auth.openId) stopAuth('changed');
  const expire = normalizeExpire(data.expire);
  if (!expire || expire < Date.now()) stopAuth('failed');
  if (data.refreshToken != null && data.refreshToken !== '' && !validToken(data.refreshToken)) stopAuth('failed');
  assertCurrent(auth);
  const lease = safeJson($persistentStore.read(LOCK_KEY), {});
  if (!lease || lease.owner !== recoveryLeaseOwner || lease.until <= Date.now()) stopAuth('busy');
  const next = {openId: auth.openId, uid: String(auth.uid), appId: auth.appId,
    appIdCaptured: auth.appIdCaptured === true, token: data.token, authScheme: tokenScheme(data.token),
    version: auth.version, agent: auth.agent, ua: auth.ua, referer: auth.referer,
    contentType: 'application/json;charset=utf-8', expire, updatedAt: new Date().toISOString()};
  // Never keep an old refreshToken after rotation, even if the new response omits it.
  if (validToken(data.refreshToken)) next.refreshToken = data.refreshToken;
  if (!$persistentStore.write(JSON.stringify(next), AUTH_KEY)) stopAuth('storage');
  Object.keys(auth).forEach(key => delete auth[key]);
  Object.assign(auth, next);
}
async function relogin(auth) {
  if (loginAttempted) stopAuth('exhausted');
  if (!(ARG.autoLogin === true || ARG.autoLogin === 'true')) stopAuth('disabled');
  if (typeof $argument !== 'object' || typeof ARG.mobile !== 'string' || !ARG.mobile.trim() ||
      typeof ARG.password !== 'string' || !ARG.password.trim()) stopAuth('config');
  if (!auth.openId || !auth.appId || auth.appIdCaptured !== true) stopAuth('headers');
  assertCurrent(auth);
  loginAttempted = true;
  const url = `${BASE}/api/login/userSess`;
  const result = await sendRequest('POST', url, {
    mobile: ARG.mobile.trim(), password: ARG.password.trim(), rememberPsw: true, agree: true,
  }, buildLoginHeaders(auth, url));
  if (!result.ok) stopAuth('failed');
  commitSession(auth, result.json.data, true);
}
async function recoverAuth(auth) {
  // Share a single recovery for parallel callers within this script invocation.
  if (recoveryPromise) return recoveryPromise;
  if (recoveryAttempted) stopAuth('exhausted');
  recoveryAttempted = true;
  recoveryPromise = (async () => {
    assertCurrent(auth);
    const lock = safeJson($persistentStore.read(LOCK_KEY), {});
    if (lock && lock.until > Date.now()) stopAuth('busy');
    const owner = uuid();
    // Best-effort cross-script lease; Loon has no atomic compare-and-swap.
    if (!$persistentStore.write(JSON.stringify({owner, until: Date.now() + 60000}), LOCK_KEY)) stopAuth('storage');
    const mine = safeJson($persistentStore.read(LOCK_KEY), {});
    if (!mine || mine.owner !== owner) stopAuth('busy');
    recoveryLeaseOwner = owner;
    try {
      assertCurrent(auth);
      if (validToken(auth.refreshToken)) {
        const result = await sendRequest('POST', `${BASE}/api/auth/refresh`,
          {refreshToken: auth.refreshToken}, {'content-type': 'application/json;charset=utf-8'});
        assertCurrent(auth);
        if (result.ok) {
          commitSession(auth, result.json.data || result.json, false);
          return;
        }
        // Only explicit auth rejection permits optional password fallback.
        // Timeout/5xx/unknown business error may have consumed the refresh token.
        if (!authRejected(result)) stopAuth('failed');
      }
      await relogin(auth);
    } finally {
      const current = safeJson($persistentStore.read(LOCK_KEY), {});
      if (current && current.owner === owner) $persistentStore.write('', LOCK_KEY);
    }
  })();
  return recoveryPromise;
}
async function request(method, url, body, auth) {
  if (authAborted) stopAuth('exhausted');
  assertCurrent(auth);
  // Source checks expiry before dispatch, with seconds/milliseconds normalization.
  const expire = normalizeExpire(auth.expire);
  let recovered = false;
  if (expire && Date.now() > expire) { await recoverAuth(auth); recovered = true; }
  assertCurrent(auth);
  const sentToken = auth.token;
  let result = await sendRequest(method, url, body, buildHeaders(auth, url));
  if (!authRejected(result)) return result;
  if (recovered) stopAuth('exhausted');
  if (recoveryPromise) {
    await recoveryPromise;
    if (auth.token === sentToken) stopAuth('exhausted');
  } else {
    await recoverAuth(auth);
  }
  assertCurrent(auth);
  result = await sendRequest(method, url, body, buildHeaders(auth, url));
  if (authRejected(result)) stopAuth('exhausted');
  return result;
}
function sendRequest(method, url, body, headers) {
  return new Promise(resolve => {
    let settled = false;
    const finish = result => {
      if (settled) return;
      settled = true;
      if (typeof clearTimeout === 'function') clearTimeout(timer);
      resolve(result);
    };
    const failure = {ok: false, status: 0, error: true, json: null};
    const timer = setTimeout(() => finish(failure), 15000);
    const options = {url, headers, timeout: 15000, 'auto-redirect': false,
      'auto-cookie': false, insecure: false}; // Loon HTTP timeout is milliseconds.
    if (body !== undefined && body !== null) options.body = typeof body === 'string' ? body : JSON.stringify(body);
    try {
      $httpClient[String(method).toLowerCase()](options, (error, response, data) => {
        const status = response ? Number(response.statusCode || response.status || 0) : 0;
        const json = safeJson(data, null);
        finish({ok: !error && status >= 200 && status < 300 && apiSuccess(json),
          status, error: !!error, json});
      });
    } catch (_) { finish(failure); }
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

// Response hooks also provide $request: dispatch them first.
if (typeof $response !== 'undefined') {
  saveAuthFromResponse();
} else if (typeof $request !== 'undefined') {
  saveAuthFromRequest();
} else {
  main().catch(error => {
    const knownErrors = Object.values(LOGIN_ERRORS).concat([
      '缺少 openId/token：请开启插件中的“自动抓包更新登录凭证”，再打开酷云/酷卡小程序',
      '缺少 uid：请开启抓包开关并重新进入酷云/酷卡小程序积分页面',
    ]);
    const message = error && knownErrors.includes(error.message) ? error.message : '运行异常，请检查配置或重新捕获凭证';
    console.log(`[${NAME}] ${message}`);
    $notification.post(NAME, '运行失败', message);
    $done();
  });
}
