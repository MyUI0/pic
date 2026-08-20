/*
 * 酷云 / 酷卡 Loon 签到 + 广告积分脚本
 * 作者: 也也
 *
 * 功能:
 * 1. mode=capture：保存 openId、token、User-Agent、Referer、uid
 * 2. mode=run：每日签到 + 激励视频积分(type=400) + 视频点击积分(type=401)
 *
 * 参数:
 * - mode=capture：捕获凭证
 * - mode=run：执行任务
 * - notify=0：捕获凭证时关闭通知
 * - maxAd=20：单项广告任务最大执行次数
 * - delay=500：广告任务请求间隔，单位毫秒
 *
 * 建议：
 * 插件里默认关闭「酷云_获取Cookie」，仅在 token 过期时手动开启一次。
 */

const NAME = '酷云积分';
const BASE = 'https://zuhu.kuka001.com';
const AUTH_KEY = 'kuyun_loon_auth';

const TASKS = {
  sign: { type: 2, name: '签到积分' },
  adView: { type: 400, name: '浏览视频奖励' },
  adClick: { type: 401, name: '视频点击奖励' },
};

function safeDecode(value) {
  try {
    return decodeURIComponent(String(value || '').replace(/\+/g, ' '));
  } catch (_) {
    return String(value || '');
  }
}

function parseArgs() {
  const raw = typeof $argument === 'string' ? $argument : '';
  const result = {};

  raw.split('&').forEach(pair => {
    if (!pair) return;

    const index = pair.indexOf('=');
    const key = safeDecode(index >= 0 ? pair.slice(0, index) : pair).trim();
    const value = safeDecode(index >= 0 ? pair.slice(index + 1) : '1').trim();

    if (key) result[key] = value;
  });

  return result;
}

const ARG = parseArgs();
const MODE = ARG.mode || (typeof $request !== 'undefined' ? 'capture' : 'run');
const CAPTURE_NOTIFY = String(ARG.notify || '1') !== '0';
const MAX_AD_LOOP = Math.max(1, Math.min(Number(ARG.maxAd) || 20, 50));
const AD_DELAY = Math.max(0, Math.min(Number(ARG.delay) || 500, 10000));

function uuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, char => {
    const random = Math.random() * 16 | 0;
    const value = char === 'x' ? random : (random & 0x3 | 0x8);
    return value.toString(16);
  });
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

function safeJson(value, fallback = null) {
  if (value !== null && typeof value === 'object') return value;

  try {
    return JSON.parse(value);
  } catch (_) {
    return fallback;
  }
}

function stringify(value) {
  if (value === undefined || value === null || value === '') return '';

  if (typeof value === 'string') return value;

  try {
    return JSON.stringify(value);
  } catch (_) {
    return String(value);
  }
}

function getHeader(headers, name) {
  if (!headers) return '';

  const target = String(name).toLowerCase();

  for (const key of Object.keys(headers)) {
    if (key.toLowerCase() === target) return headers[key];
  }

  return '';
}

function mask(value) {
  if (!value) return '-';

  const text = String(value);
  if (text.length <= 6) return `${text.slice(0, 2)}***`;

  return `${text.slice(0, 6)}***`;
}

function saveAuthFromRequest() {
  if (MODE !== 'capture') {
    console.log(`[${NAME}] 当前不是 capture 模式，跳过凭证捕获`);
    $done({});
    return;
  }

  if (typeof $request === 'undefined' || !$request) {
    console.log(`[${NAME}] 未检测到请求对象`);
    $done({});
    return;
  }

  const requestHeaders = $request.headers || {};
  const oldAuth = safeJson($persistentStore.read(AUTH_KEY) || '{}', {}) || {};

  const openId = getHeader(requestHeaders, 'openId') || oldAuth.openId || '';
  const token = getHeader(requestHeaders, 'token') || oldAuth.token || '';
  const ua = getHeader(requestHeaders, 'User-Agent') || oldAuth.ua ||
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 MicroMessenger/8.0.0';
  const referer = getHeader(requestHeaders, 'Referer') || oldAuth.referer ||
    'https://servicewechat.com/wxe417dfc034255e91/264/page-frame.html';
  const contentType = getHeader(requestHeaders, 'Content-Type') ||
    oldAuth.contentType || 'application/json;charset=utf-8';

  let uid = oldAuth.uid || '';
  const url = String($request.url || '');
  const uidMatch = url.match(/\/market\/pointAccount\/uid\/([^/?#]+)/i);

  if (uidMatch) {
    uid = safeDecode(uidMatch[1]);
  }

  if (!openId || !token) {
    console.log(`[${NAME}] 当前请求未包含 openId/token，跳过保存`);
    $done({});
    return;
  }

  const changed =
    openId !== oldAuth.openId ||
    token !== oldAuth.token ||
    uid !== oldAuth.uid ||
    ua !== oldAuth.ua ||
    referer !== oldAuth.referer;

  const auth = {
    openId,
    token,
    ua,
    referer,
    contentType,
    uid,
    updatedAt: new Date().toISOString(),
  };

  const saved = $persistentStore.write(JSON.stringify(auth), AUTH_KEY);

  if (!saved) {
    console.log(`[${NAME}] 凭证写入失败`);
    if (CAPTURE_NOTIFY) {
      $notification.post(NAME, '凭证保存失败', '无法写入 Loon 持久化存储');
    }
    $done({});
    return;
  }

  console.log(
    `[${NAME}] 凭证已保存 openId=${mask(openId)} token=${mask(token)} uid=${uid || '-'}`
  );

  if (CAPTURE_NOTIFY && changed) {
    $notification.post(
      NAME,
      '凭证保存成功',
      `uid: ${uid || '暂未捕获'}，保存后建议关闭「酷云_获取Cookie」`
    );
  }

  $done({});
}

function loadAuth() {
  const auth = safeJson($persistentStore.read(AUTH_KEY) || '{}', {}) || {};

  if (!auth.openId || !auth.token) {
    throw new Error(
      '缺少 openId/token：请在 Loon 中开启「酷云_获取Cookie」，然后打开酷云/酷卡小程序捕获一次'
    );
  }

  return auth;
}

function buildHeaders(auth) {
  return {
    'Content-Type': auth.contentType || 'application/json;charset=utf-8',
    'openId': auth.openId,
    'token': auth.token,
    'User-Agent': auth.ua ||
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 MicroMessenger/8.0.0',
    'Referer': auth.referer ||
      'https://servicewechat.com/wxe417dfc034255e91/264/page-frame.html',
  };
}

function isApiSuccess(json) {
  if (!json || typeof json !== 'object') return false;
  if (Number(json.code) === 0) return true;
  return json.code === undefined && json.success === true;
}

function responseMessage(result, fallback) {
  if (result && result.json) {
    return String(
      result.json.msg ||
      result.json.message ||
      result.json.error ||
      fallback
    );
  }

  if (result && result.err) return String(result.err);
  if (result && result.raw) return stringify(result.raw);

  return fallback;
}

function request(method, url, body, auth) {
  return new Promise(resolve => {
    const requestMethod = String(method || 'GET').toLowerCase();
    const clientMethod = $httpClient[requestMethod];

    if (typeof clientMethod !== 'function') {
      resolve({
        ok: false,
        err: `不支持的请求方法: ${method}`,
      });
      return;
    }

    const options = {
      url,
      headers: buildHeaders(auth),
      timeout: 15000,
    };

    if (body !== undefined && body !== null) {
      options.body = typeof body === 'string' ? body : JSON.stringify(body);
    }

    clientMethod(options, (error, response, data) => {
      const status = response
        ? Number(response.statusCode || response.status || 0)
        : 0;

      if (error) {
        resolve({
          ok: false,
          err: String(error),
          status,
          raw: data,
        });
        return;
      }

      const json = safeJson(data, null);
      const unauthorized =
        status === 401 ||
        status === 403 ||
        (json && /token|登录|认证|授权|过期/i.test(
          String(json.msg || json.message || '')
        ));

      resolve({
        ok: isApiSuccess(json),
        unauthorized,
        status,
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
    return {
      ok: false,
      unauthorized: result.unauthorized,
      msg: responseMessage(result, `查询失败 HTTP ${result.status || '-'}`),
    };
  }

  const data = result.json ? result.json.data : null;
  const item = Array.isArray(data) ? data[0] : null;

  if (!item) {
    return {
      ok: false,
      msg: '接口未返回任务数据',
    };
  }

  const surplusCount = Number(item.surplusCount);
  const singlePoints = Number(item.singlePoints);

  return {
    ok: true,
    item,
    surplusCount: Number.isFinite(surplusCount) ? surplusCount : 0,
    acquiredPoint:
      item.acquiredPoint === undefined || item.acquiredPoint === null
        ? '0'
        : String(item.acquiredPoint),
    singlePoints: Number.isFinite(singlePoints) ? singlePoints : 0,
  };
}

async function doSign(auth) {
  const before = await queryChannel(auth, TASKS.sign.type);

  if (before.ok && before.surplusCount <= 0) {
    return `签到: 今日已完成，已得 ${before.acquiredPoint}`;
  }

  if (before.unauthorized) {
    return `签到: 凭证已失效 (${before.msg})`;
  }

  const result = await request(
    'POST',
    `${BASE}/market/userSignRecord/sign`,
    {},
    auth
  );

  if (!result.ok) {
    const message = responseMessage(result, '签到失败');

    if (result.unauthorized) {
      return `签到: 凭证已失效 (${message})`;
    }

    if (/已签到|重复签到|无需重复|already|sign/i.test(message)) {
      return `签到: 今日已签到 (${message})`;
    }

    return `签到: 失败 (${message})`;
  }

  const after = await queryChannel(auth, TASKS.sign.type);

  return after.ok
    ? `签到: 成功，今日已得 ${after.acquiredPoint}`
    : '签到: 成功';
}

async function doAd(auth, type, name) {
  const logs = [];
  let task = await queryChannel(auth, type);

  if (!task.ok) {
    return `${name}: 查询失败 (${task.msg})`;
  }

  if (task.surplusCount <= 0) {
    return `${name}: 今日已完成，已得 ${task.acquiredPoint}`;
  }

  const plannedCount = Math.min(task.surplusCount, MAX_AD_LOOP);
  let completedCount = 0;
  let lastSurplus = task.surplusCount;
  let stagnantCount = 0;

  for (let index = 0; index < plannedCount; index++) {
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
      const message = responseMessage(result, '领取失败');
      logs.push(`第${index + 1}次失败: ${message}`);
      break;
    }

    const data = result.json && result.json.data
      ? result.json.data
      : {};

    const points =
      data.points !== undefined && data.points !== null
        ? data.points
        : task.singlePoints;

    completedCount++;
    logs.push(`+${points || 0}`);

    if (index + 1 < plannedCount && AD_DELAY > 0) {
      await sleep(AD_DELAY);
    }

    task = await queryChannel(auth, type);

    if (!task.ok) {
      logs.push(`进度查询失败: ${task.msg}`);
      break;
    }

    if (task.surplusCount <= 0) break;

    if (task.surplusCount >= lastSurplus) {
      stagnantCount++;
    } else {
      stagnantCount = 0;
    }

    lastSurplus = task.surplusCount;

    if (stagnantCount >= 2) {
      logs.push('任务次数未减少，已停止重试');
      break;
    }
  }

  const after = await queryChannel(auth, type);
  const total = after.ok ? after.acquiredPoint : '?';
  const remaining = after.ok ? after.surplusCount : '?';
  const detail = logs.length ? logs.join(', ') : '无新增';

  if (
    completedCount >= MAX_AD_LOOP &&
    after.ok &&
    after.surplusCount > 0
  ) {
    return `${name}: ${detail}，今日已得 ${total}，剩余 ${remaining} 次（已达单次运行上限）`;
  }

  return `${name}: ${detail}，今日已得 ${total}`;
}

async function queryBalance(auth) {
  if (!auth.uid) return '';

  const result = await request(
    'GET',
    `${BASE}/market/pointAccount/uid/${encodeURIComponent(auth.uid)}`,
    null,
    auth
  );

  if (!result.ok) return '';

  const data = result.json ? result.json.data : null;
  const account = Array.isArray(data) ? data[0] : null;

  if (!account) return '';

  const amount =
    account.amount === undefined || account.amount === null
      ? '-'
      : account.amount;
  const usedAmount =
    account.usedAmount === undefined || account.usedAmount === null
      ? '-'
      : account.usedAmount;

  return `当前积分: ${amount}，已用: ${usedAmount}`;
}

async function main() {
  const auth = loadAuth();
  const results = [];

  results.push(await doSign(auth));
  results.push(await doAd(
    auth,
    TASKS.adView.type,
    TASKS.adView.name
  ));
  results.push(await doAd(
    auth,
    TASKS.adClick.type,
    TASKS.adClick.name
  ));

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
    const message = error && error.message
      ? error.message
      : String(error);

    console.log(`[${NAME}] ${message}`);
    $notification.post(NAME, '运行失败', message);
    $done();
  });
}
