/*
 * 酷云 / 酷卡 Loon 签到 + 广告积分脚本
 * 作者: 也也
 *
 * 功能:
 * 1. 请求捕获: 自动保存 openId、token、User-Agent、Referer、uid
 * 2. 定时任务: 每日签到 + 激励视频积分(type=400) + 视频点击积分(type=401)
 *
 * 使用:
 * - 配合 kuyun-loon.plugin 导入 Loon
 * - 打开小程序/酷云相关页面触发一次 zuhu.kuka001.com 请求，提示「凭证保存成功」即可
 * - 后续由 cron 自动运行，也可手动运行脚本
 */

const NAME = '酷云积分';
const BASE = 'https://zuhu.kuka001.com';
const KEY = 'kuyun_loon_auth';

const TASKS = {
  sign: { type: 2, name: '签到积分' },
  adView: { type: 400, name: '浏览视频奖励' },
  adClick: { type: 401, name: '视频点击奖励' },
};

function uuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

function today() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function month() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

function safeJson(str, fallback = null) {
  try { return JSON.parse(str); } catch (_) { return fallback; }
}

function getHeader(headers, name) {
  if (!headers) return '';
  const target = name.toLowerCase();
  for (const k of Object.keys(headers)) {
    if (k.toLowerCase() === target) return headers[k];
  }
  return '';
}

function saveAuthFromRequest() {
  const h = $request.headers || {};
  const old = safeJson($persistentStore.read(KEY) || '{}', {});
  const openId = getHeader(h, 'openId') || old.openId || '';
  const token = getHeader(h, 'token') || old.token || '';
  const ua = getHeader(h, 'User-Agent') || old.ua || 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 MicroMessenger/8.0.0';
  const referer = getHeader(h, 'Referer') || old.referer || 'https://servicewechat.com/wxe417dfc034255e91/264/page-frame.html';
  const contentType = getHeader(h, 'content-type') || getHeader(h, 'Content-Type') || old.contentType || 'application/json;charset=utf-8';

  let uid = old.uid || '';
  const m = ($request.url || '').match(/\/market\/pointAccount\/uid\/(\d+)/);
  if (m) uid = m[1];

  if (!openId || !token) {
    console.log(`[${NAME}] 未发现 openId/token，跳过保存`);
    $done({});
    return;
  }

  const auth = { openId, token, ua, referer, contentType, uid, updatedAt: new Date().toISOString() };
  $persistentStore.write(JSON.stringify(auth), KEY);
  console.log(`[${NAME}] 凭证保存成功 openId=${openId.slice(0, 6)}*** token=${token.slice(0, 6)}*** uid=${uid || '-'}`);
  $notification.post(NAME, '凭证保存成功', `uid: ${uid || '暂未捕获'}，可以运行签到广告任务了`);
  $done({});
}

function loadAuth() {
  const auth = safeJson($persistentStore.read(KEY) || '{}', {});
  if (!auth.openId || !auth.token) {
    throw new Error('缺少 openId/token：请先打开酷云/酷卡小程序页面，让 Loon 捕获一次请求');
  }
  return auth;
}

function headers(auth) {
  return {
    'content-type': auth.contentType || 'application/json;charset=utf-8',
    'openId': auth.openId,
    'token': auth.token,
    'User-Agent': auth.ua || 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 MicroMessenger/8.0.0',
    'Referer': auth.referer || 'https://servicewechat.com/wxe417dfc034255e91/264/page-frame.html',
  };
}

function request(method, url, body, auth) {
  return new Promise((resolve) => {
    const opts = { url, method, headers: headers(auth), timeout: 15000 };
    if (body !== undefined && body !== null) opts.body = typeof body === 'string' ? body : JSON.stringify(body);
    $httpClient[method.toLowerCase()](opts, (err, resp, data) => {
      if (err) {
        resolve({ ok: false, err: String(err), status: resp && resp.status, raw: data });
        return;
      }
      const json = safeJson(data, null);
      resolve({ ok: !!json && json.code === 0, status: resp && resp.status, json, raw: data });
    });
  });
}

async function queryChannel(auth, type) {
  const res = await request('POST', `${BASE}/market/pointAccountFlow/dayDetailByChannel`, { dictTypeList: [type] }, auth);
  if (!res.ok) return { ok: false, msg: res.json ? res.json.msg : (res.err || res.raw || '查询失败') };
  const item = Array.isArray(res.json.data) ? res.json.data[0] : null;
  if (!item) return { ok: false, msg: '无任务数据' };
  return {
    ok: true,
    item,
    surplusCount: Number(item.surplusCount || 0),
    acquiredPoint: String(item.acquiredPoint || '0'),
    singlePoints: Number(item.singlePoints || 0),
    isResume: Number(item.isResume || 0),
  };
}

async function doSign(auth) {
  const before = await queryChannel(auth, TASKS.sign.type);
  if (before.ok && before.surplusCount <= 0) return `签到: 今日已完成，已得 ${before.acquiredPoint}`;

  const res = await request('POST', `${BASE}/market/userSignRecord/sign`, {}, auth);
  if (!res.ok) {
    const msg = res.json ? res.json.msg : (res.err || res.raw || '失败');
    if (/已|重复|sign/i.test(msg)) return `签到: 已签到或无需重复签到 (${msg})`;
    return `签到: 失败 (${msg})`;
  }
  const after = await queryChannel(auth, TASKS.sign.type);
  return after.ok ? `签到: 成功，已得 ${after.acquiredPoint}` : '签到: 成功';
}

async function doAd(auth, type, name) {
  const logs = [];
  let q = await queryChannel(auth, type);
  if (!q.ok) return `${name}: 查询失败 (${q.msg})`;
  if (q.surplusCount <= 0) return `${name}: 今日已完成，已得 ${q.acquiredPoint}`;

  const maxLoop = Math.min(q.surplusCount, 5);
  for (let i = 0; i < maxLoop; i++) {
    const body = type === 401 ? { type, uuid: uuid() } : { type };
    const res = await request('POST', `${BASE}/api/market/act/stimulateVideo`, body, auth);
    if (!res.ok) {
      const msg = res.json ? res.json.msg : (res.err || res.raw || '失败');
      logs.push(`第${i + 1}次失败: ${msg}`);
      break;
    }
    const data = res.json.data || {};
    logs.push(`+${data.points || q.singlePoints || 0}`);

    q = await queryChannel(auth, type);
    if (!q.ok || q.surplusCount <= 0) break;
  }

  const after = await queryChannel(auth, type);
  const total = after.ok ? after.acquiredPoint : '?';
  return `${name}: ${logs.join(', ') || '无新增'}，今日已得 ${total}`;
}

async function queryBalance(auth) {
  if (!auth.uid) return '';
  const res = await request('GET', `${BASE}/market/pointAccount/uid/${auth.uid}`, null, auth);
  if (!res.ok || !Array.isArray(res.json.data) || !res.json.data[0]) return '';
  const a = res.json.data[0];
  return `当前积分: ${a.amount || '-'}，已用: ${a.usedAmount || '-'}`;
}

async function main() {
  const auth = loadAuth();
  const result = [];
  result.push(await doSign(auth));
  result.push(await doAd(auth, TASKS.adView.type, TASKS.adView.name));
  result.push(await doAd(auth, TASKS.adClick.type, TASKS.adClick.name));
  const balance = await queryBalance(auth);
  if (balance) result.push(balance);

  const text = result.join('\n');
  console.log(`[${NAME}]\n${text}`);
  $notification.post(NAME, `任务完成 ${today()}`, text);
  $done();
}

if (typeof $request !== 'undefined') {
  saveAuthFromRequest();
} else {
  main().catch(e => {
    const msg = e && e.message ? e.message : String(e);
    console.log(`[${NAME}] ${msg}`);
    $notification.post(NAME, '运行失败', msg);
    $done();
  });
}
