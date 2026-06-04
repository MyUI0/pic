/*
------------------------------------------
@Name: 蜜雪冰城 访问雪王铺
@Desc: 每日自动访问雪王铺获取雪王币2
------------------------------------------

⚙️ QX配置：

[MITM]
hostname = mxsa.mxbc.net, 76177-activity.dexfu.cn

[Script]
# 获取Token（进入小程序「我的」页面触发）
http-response ^https:\/\/mxsa\.mxbc\.net\/api\/v1\/customer\/info script-path=https://raw.githubusercontent.com/MyUI0/pic/main/scripts/mxbc.js, requires-body=true, timeout=60, tag=蜜雪冰城获取token

# 定时任务（每天8点）
[task_local]
0 8 * * * https://raw.githubusercontent.com/MyUI0/pic/main/scripts/mxbc.js, tag=蜜雪冰城访问雪王铺
*/

const $ = new Env("蜜雪冰城");

const CK_NAME = "mxbc_data";     // 持久化存储key名
const users = (() => {
  try {
    const raw = $.getdata(CK_NAME);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
})();

$.notifyMsg = [];

// ========== 基础工具 ==========
function ts13() { return Date.now().toString(); }

// 请求包装
async function req(opts) {
  return new Promise((resolve, reject) => {
    const { url, method = 'GET', headers = {}, body, resultType, followRedirect, timeout = 15000 } = opts;
    const options = { url, method, headers, timeout, followRedirect };
    if (body) options.body = body;
    $.log(`[${method}] ${url.replace(/\?.*/, '')}`);
    $task.fetch(options).then(
      resp => resolve(resultType === 'all' ? resp : resp.body),
      err => reject(err)
    );
  });
}

// ========== RSA-SHA256 签名 ==========
function getSHA256withRSA(content) {
  const keyStr = `-----BEGIN PRIVATE KEY-----
MIIEvwIBADANBgkqhkiG9w0BAQEFAASCBKkwggSlAgEAAoIBAQCtypUdHZJKlQ9L
L6lIJSphnhqjke7HclgWuWDRWvzov30du235cCm13mqJ3zziqLCwstdQkuXo9sOP
Ih94t6nzBHTuqYA1whrUnQrKfv9X4/h3QVkzwT+xWflE+KubJZoe+daLKkDeZjVW
nUku8ov0E5vwADACfntEhAwiSZUALX9UgNDTPbj5ESeII+VztZ/KOFsRHMTfDb1G
IR/dAc1mL5uYbh0h2Fa/fxRPgf7eJOeWGiygesl3CWj0Ue13qwX9PcG7klJXfToI
576MY+A7027a0aZ49QhKnysMGhTdtFCksYG0lwPz3bIR16NvlxNLKanc2h+ILTFQ
bMW/Y3DRAgMBAAECggEBAJGTfX6rE6zX2bzASsu9HhgxKN1VU6/L70/xrtEPp4SL
SpHKO9/S/Y1zpsigr86pQYBx/nxm4KFZewx9p+El7/06AX0djOD7HCB2/+AJq3iC
5NF4cvEwclrsJCqLJqxKPiSuYPGnzji9YvaPwArMb0Ff36KVdaHRMw58kfFys5Y2
HvDqh4x+sgMUS7kSEQT4YDzCDPlAoEFgF9rlXnh0UVS6pZtvq3cR7pR4A9hvDgX9
wU6zn1dGdy4MEXIpckuZkhwbqDLmfoHHeJc5RIjRP7WIRh2CodjetgPFE+SV7Sdj
ECmvYJbet4YLg+Qil0OKR9s9S1BbObgcbC9WxUcrTgECgYEA/Yj8BDfxcsPK5ebE
9N2teBFUJuDcHEuM1xp4/tFisoFH90JZJMkVbO19rddAMmdYLTGivWTyPVsM1+9s
tq/NwsFJWHRUiMK7dttGiXuZry+xvq/SAZoitgI8tXdDXMw7368vatr0g6m7ucBK
jZWxSHjK9/KVquVr7BoXFm+YxaECgYEAr3sgVNbr5ovx17YriTqe1FLTLMD5gPrz
ugJj7nypDYY59hLlkrA/TtWbfzE+vfrN3oRIz5OMi9iFk3KXFVJMjGg+M5eO9Y8m
14e791/q1jUuuUH4mc6HttNRNh7TdLg/OGKivE+56LEyFPir45zw/dqwQM3jiwIz
yPz/+bzmfTECgYATxrOhwJtc0FjrReznDMOTMgbWYYPJ0TrTLIVzmvGP6vWqG8rI
S8cYEA5VmQyw4c7G97AyBcW/c3K1BT/9oAj0wA7wj2JoqIfm5YPDBZkfSSEcNqqy
5Ur/13zUytC+VE/3SrrwItQf0QWLn6wxDxQdCw8J+CokgnDAoehbH6lTAQKBgQCE
67T/zpR9279i8CBmIDszBVHkcoALzQtU+H6NpWvATM4WsRWoWUx7AJ56Z+joqtPK
G1WztkYdn/L+TyxWADLvn/6Nwd2N79MyKyScKtGNVFeCCJCwoJp4R/UaE5uErBNn
OH+gOJvPwHj5HavGC5kYENC1Jb+YCiEDu3CB0S6d4QKBgQDGYGEFMZYWqO6+LrfQ
ZNDBLCI2G4+UFP+8ZEuBKy5NkDVqXQhHRbqr9S/OkFu+kEjHLuYSpQsclh6XSDks
5x/hQJNQszLPJoxvGECvz5TN2lJhuyCupS50aGKGqTxKYtiPHpWa8jZyjmanMKnE
dOGyw/X4SFyodv8AEloqd81yGg==
-----END PRIVATE KEY-----`;
  const key = KEYUTIL.getKey(keyStr);
  const sig = new KJUR.crypto.Signature({ alg: 'SHA256withRSA' });
  sig.init(key);
  sig.updateString(content);
  return hextob64u(sig.sign());
}

// ========== 获取用户信息 ==========
async function getUserInfo(token) {
  const t = ts13();
  const signContent = `appId=d82be6bbc1da11eb9dd000163e122ecb&t=${t}`;
  const sign = getSHA256withRSA(signContent);
  const url = `https://mxsa.mxbc.net/api/v1/customer/info?appId=d82be6bbc1da11eb9dd000163e122ecb&t=${t}&sign=${sign}`;
  const resp = await req({
    url,
    headers: {
      "app": "mxbc",
      "appchannel": "xiaomi",
      "appversion": "3.0.3",
      "Access-Token": token,
      "Host": "mxsa.mxbc.net",
      "User-Agent": "okhttp/4.4.1"
    }
  });
  const json = typeof resp === 'string' ? JSON.parse(resp) : resp;
  if (json?.code === 0) {
    return { mobile: json.data.mobilePhone, point: json.data.customerPoint };
  }
  $.log(`获取用户信息失败: ${json?.msg || JSON.stringify(json)}`);
  return null;
}

// ========== 获取兑吧登录URL ==========
async function getLoginUrl(token) {
  const t = ts13();
  const dbredirect = "https://76177-activity.dexfu.cn/chw/visual-editor/skins?id=216593";
  const signContent = `appId=d82be6bbc1da11eb9dd000163e122ecb&dbredirect=${encodeURIComponent(dbredirect)}&t=${t}`;
  const sign = getSHA256withRSA(signContent);
  const url = `https://mxsa.mxbc.net/api/v1/duiba/getLoginUrl?appId=d82be6bbc1da11eb9dd000163e122ecb&dbredirect=${encodeURIComponent(dbredirect)}&t=${t}&sign=${sign}`;
  const resp = await req({
    url,
    headers: {
      "app": "mxbc",
      "appchannel": "xiaomi",
      "appversion": "3.0.3",
      "Access-Token": token,
      "Host": "mxsa.mxbc.net",
      "User-Agent": "okhttp/4.4.1"
    }
  });
  const json = typeof resp === 'string' ? JSON.parse(resp) : resp;
  if (json?.data?.loginUrl) {
    $.log(`✅ 获取兑吧登录URL成功`);
    return json.data.loginUrl;
  }
  $.log(`获取登录URL失败: ${JSON.stringify(json)}`);
  return null;
}

// ========== 自动登录获取活动session（cookie） ==========
async function getActivitySession(loginUrl) {
  // 步骤1: 访问loginUrl → 302重定向 + set-cookie
  const resp = await req({
    url: loginUrl,
    followRedirect: false,
    resultType: "all",
    headers: {
      'Accept-Encoding': 'gzip, deflate, br',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Host': '76177-activity.dexfu.cn',
      'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0.70',
      'Accept-Language': 'zh-CN,zh-Hans;q=0.9'
    }
  });

  let headers = resp?.headers || {};
  // key全部转小写
  const lcHeaders = {};
  for (const [k, v] of Object.entries(headers)) {
    lcHeaders[k.toLowerCase()] = v;
  }

  // 提取set-cookie
  let cookies = lcHeaders['set-cookie'] || '';
  if (Array.isArray(cookies)) cookies = cookies.join('; ');
  const cookieKeys = ['wdata4', 'w_ts', '_ac', 'tokenId', 'wdata3', 'dcustom', 'createdAtToday', 'isNotLoginUser'];

  // 提取关键cookie
  let cookieParts = [];
  for (const key of cookieKeys) {
    const re = new RegExp(`${key}=[^;]+`);
    const m = cookies.match(re);
    if (m) cookieParts.push(m[0]);
  }

  // 如果没cookie（可能302直接跳了），用location再试
  if (cookieParts.length < 3) {
    const location = lcHeaders['location'];
    if (location) {
      $.log(`ℹ️ 登录URL重定向至: ${location}`);
      const finalUrl = location.startsWith('http') ? location : `https://76177-activity.dexfu.cn${location}`;
      const resp2 = await req({
        url: finalUrl,
        followRedirect: false,
        resultType: "all",
        headers: {
          'Accept-Encoding': 'gzip, deflate, br',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Host': '76177-activity.dexfu.cn',
          'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0.70',
          'Accept-Language': 'zh-CN,zh-Hans;q=0.9'
        }
      });
      const h2 = resp2?.headers || {};
      const lc2 = {};
      for (const [k, v] of Object.entries(h2)) lc2[k.toLowerCase()] = v;
      let cookies2 = lc2['set-cookie'] || '';
      if (Array.isArray(cookies2)) cookies2 = cookies2.join('; ');
      cookieParts = [];
      for (const key of cookieKeys) {
        const re = new RegExp(`${key}=[^;]+`);
        const m = cookies2.match(re);
        if (m) cookieParts.push(m[0]);
      }
    }
  }

  if (cookieParts.length < 3) {
    $.log(`⛔️ 获取活动cookie不足: ${cookieParts.join('; ')}`);
    return null;
  }

  const session = cookieParts.join('; ');
  $.log(`✅ 获取活动Session成功`);
  return session;
}

// ========== 访问雪王铺页面 ==========
async function visitPage(session) {
  const resp = await req({
    url: 'https://76177-activity.dexfu.cn/chw/visual-editor/skins?id=216593&from=login&spm=76177.1.1.1',
    resultType: 'all',
    headers: {
      'Cookie': session,
      'Host': '76177-activity.dexfu.cn',
      'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0.70',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Encoding': 'gzip, deflate, br',
      'Accept-Language': 'zh-CN,zh-Hans;q=0.9',
      'Connection': 'keep-alive'
    }
  });
  const body = typeof resp?.body === 'string' ? resp.body : '';
  if (body && body.includes('请重新登陆')) {
    $.log(`⛔️ Session已过期`);
    return false;
  }
  $.log(`✅ 访问雪王铺页面成功`);
  return true;
}

// ========== 查询余额 ==========
async function accountBalance(session) {
  const resp = await req({
    url: 'https://76177-activity.dexfu.cn/globalReward/accountBalance',
    headers: {
      'Cookie': session,
      'Host': '76177-activity.dexfu.cn',
      'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0.70',
      'Accept': 'application/json, text/plain, */*',
      'Accept-Encoding': 'gzip, deflate, br',
      'Accept-Language': 'zh-CN,zh-Hans;q=0.9',
      'Referer': 'https://76177-activity.dexfu.cn/chw/visual-editor/skins?id=216593',
      'Sec-Fetch-Site': 'same-origin',
      'Sec-Fetch-Mode': 'cors',
      'Sec-Fetch-Dest': 'empty'
    }
  });
  const json = typeof resp === 'string' ? JSON.parse(resp) : resp;
  if (json?.success) {
    const balance = json.data?.balance ?? json.data?.credits ?? 0;
    $.log(`💰 当前银两余额: ${balance}`);
    return balance;
  }
  return null;
}

// ========== 访问雪王铺（核心：触发签到领币） ==========
async function visitMall(session) {
  const resp = await req({
    url: 'https://76177-activity.dexfu.cn/globalReward/visitMall',
    method: 'POST',
    body: '',
    headers: {
      'Cookie': session,
      'Host': '76177-activity.dexfu.cn',
      'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0.70',
      'Accept': 'application/json, text/plain, */*',
      'Accept-Encoding': 'gzip, deflate, br',
      'Accept-Language': 'zh-CN,zh-Hans;q=0.9',
      'Referer': 'https://76177-activity.dexfu.cn/chw/visual-editor/skins?id=216593',
      'Origin': 'https://76177-activity.dexfu.cn',
      'Content-Type': 'application/json',
      'Content-Length': '0',
      'Sec-Fetch-Site': 'same-origin',
      'Sec-Fetch-Mode': 'cors',
      'Sec-Fetch-Dest': 'empty'
    }
  });
  const json = typeof resp === 'string' ? JSON.parse(resp) : resp;
  if (json?.success) {
    $.log(`✅ 访问雪王铺成功，领取奖励!`);
    return true;
  }
  $.log(`⚠️ 访问雪王铺返回: ${JSON.stringify(json)}`);
  return false;
}

// ========== 获取/刷新Cookie（QX重写抓token） ==========
async function getCookie() {
  try {
    if ($request && $request.method === 'OPTIONS') return;
    const header = ObjectKeys2LowerCase($request.headers) || {};
    const body = (() => { try { return JSON.parse($response.body); } catch { return null; } })();
    const token = header['access-token'];
    if (!token || !body) {
      $.log(`⛔️ 获取token失败`);
      return;
    }

    const newUser = {
      userId: body?.data?.mobilePhone || body?.data?.userId || '',
      token: token,
      userName: body?.data?.mobilePhone || ''
    };

    const users = (() => {
      try {
        const raw = $.getdata(CK_NAME);
        return raw ? JSON.parse(raw) : [];
      } catch { return []; }
    })();

    const idx = users.findIndex(u => u.userId === newUser.userId);
    if (idx >= 0) {
      users[idx] = newUser;
    } else {
      users.push(newUser);
    }
    $.setdata(JSON.stringify(users), CK_NAME);
    $.log(`✅ Token更新成功: ${newUser.userName}`);
    $.msg($.name, `🎉 ${newUser.userName || ''} Token更新成功`, '');
  } catch (e) {
    $.logErr(e);
  }
}

// ========== 主流程 ==========
async function main() {
  try {
    if (!users || !users.length) throw new Error("没有找到账号，请先在微信小程序触发获取token");

    $.log(`⚙️ 共 ${users.length} 个账号`);

    for (let idx = 0; idx < users.length; idx++) {
      const user = users[idx];
      if (!user.token) {
        $.log(`⛔️ 账号${idx+1}: token为空，跳过`);
        continue;
      }
      $.log(`\n🚀 账号${idx+1}: ${user.userName || user.userId || ''}`);

      // 1. 查用户信息获取初始雪王币
      const userInfo = await getUserInfo(user.token);
      if (!userInfo) {
        $.notifyMsg.push(`❌ 账号${idx+1}: token可能已失效`);
        continue;
      }
      const pointB = userInfo.point || 0;
      $.log(`📊 当前雪王币: ${pointB}`);

      // 2. 获取兑吧登录URL
      const loginUrl = await getLoginUrl(user.token);
      if (!loginUrl) continue;

      // 3. 自动登录获取活动session
      const session = await getActivitySession(loginUrl);
      if (!session) continue;

      // 4. 访问雪王铺页面
      const pageOk = await visitPage(session);
      if (!pageOk) continue;

      // 5. 查活动余额
      await accountBalance(session);

      // 6. 执行访问雪王铺（领取奖励）
      await visitMall(session);

      // 7. 重新查用户信息获取最终雪王币
      await new Promise(r => setTimeout(r, 2000));
      const userInfoE = await getUserInfo(user.token);
      const pointE = userInfoE?.point || 0;
      const gained = pointE - pointB;
      $.log(`🎉 ${userInfoE?.mobile || user.userName} 本次获得 ${gained} 雪王币，当前 ${pointE} 币`);
      $.notifyMsg.push(`「${userInfoE?.mobile || user.userName}」+${gained}币，余额${pointE}币`);
    }
  } catch (e) {
    $.logErr(e);
  } finally {
    if ($.notifyMsg.length) {
      $.msg($.name, '签到结果', $.notifyMsg.join('\n'));
    }
  }
}

// ========== 加载CryptoJS ==========
let CryptoJS = null;
function createCryptoJS() { return CryptoJS; }

async function loadCryptoJS() {
  try {
    const code = $.getdata('CryptoJS_code');
    if (code) {
      $.log(`✅ 使用缓存的CryptoJS`);
      try {
        executeInGlobal(code);
        CryptoJS = createCryptoJS();
        if (!CryptoJS) throw new Error('eval后CryptoJS仍为null');
        return true;
      } catch (e) {
        $.log(`⚠️ CryptoJS缓存失效: ${e.message}，重新下载...`);
        $.setdata('', 'CryptoJS_code');
      }
    }
    $.log(`🚀 下载CryptoJS...`);
    const fn = await $.getScript('https://cdn.jsdelivr.net/gh/Sliverkiss/QuantumultX@main/Utils/CryptoJS.min.js');
    if (fn) {
      $.setdata(fn, 'CryptoJS_code');
      executeInGlobal(fn);
      CryptoJS = createCryptoJS();
      $.log(`✅ CryptoJS加载成功`);
      return true;
    }
    throw new Error('CryptoJS下载失败');
  } catch (e) {
    $.logErr(`加载CryptoJS失败: ${e}`);
    return false;
  }
}

// ========== 加载RSA库（依赖CryptoJS） ==========
async function loadJsrsasign() {
  try {
    if (!CryptoJS) {
      const ok = await loadCryptoJS();
      if (!ok) return false;
    }
    // 强制清掉可能损坏的缓存，每次都完整下载
    $.setdata('', 'Jsrsasign_code');
    $.log(`🚀 下载Jsrsasign (96KB)...`);
    const fn = await $.getScript('https://cdn.jsdelivr.net/gh/Sliverkiss/QuantumultX@main/Utils/jsrsasign-part.js');
    if (!fn || fn.length < 50000) throw new Error('下载不完整，请检查网络');
    // 写入持久化缓存
    $.setdata(fn, 'Jsrsasign_code');
    // eval 并验证
    executeInGlobal(fn);
    if (typeof KEYUTIL === 'undefined') throw new Error('KEYUTIL未定义，eval可能被沙箱隔离');
    $.log(`✅ Jsrsasign加载成功`);
    return true;
  } catch (e) {
    $.logErr(`加载Jsrsasign失败: ${e}`);
    return false;
  }
}

// ========== 入口 ==========
(async () => {
  try {
    if (typeof $request !== 'undefined') {
      await getCookie();
    } else {
      const loaded = await loadJsrsasign();
      if (!loaded) { $.msg($.name, '⛔️ 错误', 'RSA库加载失败，请检查网络'); return; }
      await main();
    }
  } catch (e) {
    $.logErr(e);
    $.msg($.name, '⛔️ 错误', e.message || e);
  }
})()
  .catch(e => { $.logErr(e); })
  .finally(() => setTimeout(() => $.done(), 1000));

// ========== 全局执行环境（在最顶层定义，eval结果可全局访问） ==========
function executeInGlobal(code) {
  // QX/Surge script-engine: 顶层代码 eval 作用于全局上下文
  // 不需要 special handling，直接 eval 即可
  eval(code);
}

// ========== Env工具 ==========
function Env(t, e) {
  return new class {
    constructor(t, e) {
      this.name = t;
      this.logs = [];
      this.isMute = false;
      this.logSeparator = '\n';
      this.startTime = Date.now();
      Object.assign(this, e);
      this.log('', `🔔${this.name}, 开始!`);
    }
    getEnv() {
      if (typeof $task !== 'undefined') return 'Quantumult X';
      if (typeof $environment !== 'undefined') {
        if ($environment['surge-version']) return 'Surge';
        if ($environment['stash-version']) return 'Stash';
      }
      if (typeof $loon !== 'undefined') return 'Loon';
      if (typeof $rocket !== 'undefined') return 'Shadowrocket';
      if (typeof module !== 'undefined' && module.exports) return 'Node.js';
      return 'unknown';
    }
    isNode() { return false; }
    toObj(t, e = null) { try { return JSON.parse(t); } catch { return e; } }
    toStr(t, e = null) { try { return JSON.stringify(t); } catch { return e; } }
    getdata(t) { return $prefs.valueForKey(t); }
    setdata(t, e) { return $prefs.setValueForKey(t, e); }
    getScript(t) { return new Promise(r => { this.get({ url: t }, (e, s, b) => r(b)); }); }
    get(t, cb) {
      const opts = typeof t === 'string' ? { url: t } : t;
      $task.fetch(opts).then(resp => cb(null, null, resp.body), err => cb(err));
    }
    log(t) {
      if (!this.isMute) {
        this.logs.push(t);
        console.log(t);
      }
    }
    logErr(t) { this.log(`❌ ${t}`); }
    msg(t = this.name, e = '', s = '', r) {
      if (typeof $notify !== 'undefined') {
        $notify(t, e, s, { 'open-url': r?.['open-url'] });
      }
    }
  }(t, e);
}

function ObjectKeys2LowerCase(obj) {
  if (!obj) return {};
  const r = {};
  for (const [k, v] of Object.entries(obj)) r[k.toLowerCase()] = v;
  return r;
}
