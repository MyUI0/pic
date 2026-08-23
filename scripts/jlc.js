const SCRIPT_VERSION = "1.0.0-loon";
const BASE_URL = "https://m.jlc.com";
const STORE_KEY = "jlc_auth_token_secret";
const PLATFORM_TYPE = "MP-WEIXIN";
const SOURCE = "2";

// TODO(BoxJS 多账号版备忘): 后续可新增 jlc_accounts = [{name, token, secret, enabled, remark}]。
// 当前版本保持单账号覆盖模式：抓到新的 token#secret 直接覆盖旧数据。

function notify(title, subtitle, body) {
  try { $notification.post(title, subtitle || "", body || ""); } catch (_) {}
}

function done(v) {
  try { $done(v || {}); } catch (_) { try { $done(); } catch (e) {} }
}

function storeRead(key) {
  try { return $persistentStore.read(key) || ""; } catch (_) { return ""; }
}

function storeWrite(value, key) {
  try { return $persistentStore.write(value, key); } catch (_) { return false; }
}

function mask(s) {
  s = String(s || "");
  if (s.length <= 10) return s ? s.slice(0, 2) + "***" : "";
  return s.slice(0, 6) + "******" + s.slice(-4);
}

function getHeader(headers, name) {
  headers = headers || {};
  const target = String(name).toLowerCase();
  for (const k in headers) {
    if (String(k).toLowerCase() === target) return headers[k];
  }
  return "";
}

function captureAuthIfNeeded() {
  if (typeof $request === "undefined") return false;
  const url = String($request.url || "");
  if (!/^https?:\/\/m\.jlc\.com\/api\//i.test(url)) return false;

  const headers = $request.headers || {};
  const token = getHeader(headers, "x-jlc-accesstoken");
  const secret = getHeader(headers, "secretkey");

  if (token && secret) {
    const auth = `${token}#${secret}`;
    const old = storeRead(STORE_KEY);
    const ok = storeWrite(auth, STORE_KEY);
    if (ok) {
      notify("嘉立创签到", old === auth ? "✅ 凭证未变化" : "✅ 凭证已覆盖保存", `${mask(token)}#${mask(secret)}`);
    } else {
      notify("嘉立创签到", "❌ 保存失败", "请检查 Loon 持久化存储权限");
    }
  } else {
    console.log(`[Capture Skip] ${url} 未发现 x-jlc-accesstoken/secretkey`);
  }
  done();
  return true;
}

function parseAuth() {
  let auth = storeRead(STORE_KEY);
  // 兼容旧版手动 argument，但 LPX 默认不传 argument。
  try {
    if (typeof $argument !== "undefined" && $argument) auth = String($argument).trim();
  } catch (_) {}
  if (!auth || !auth.includes("#")) return null;
  const arr = auth.split("#");
  const token = (arr[0] || "").trim();
  const secret = arr.slice(1).join("#").trim();
  if (!token || !secret) return null;
  return { token, secret, remark: "账号1" };
}

function buildHeaders(token, secret) {
  return {
    "accept": "application/json, text/plain, */*",
    "content-type": "application/json;charset=UTF-8",
    "x-jlc-accesstoken": token,
    "secretkey": secret,
    "origin": BASE_URL,
    "referer": BASE_URL + "/",
    "user-agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0.50"
  };
}

function qs(params) {
  const parts = [];
  for (const k in (params || {})) parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(params[k])}`);
  return parts.join("&");
}

function apiGet(path, params, headers) {
  return new Promise((resolve) => {
    const query = qs(params || {});
    const url = BASE_URL + path + (query ? "?" + query : "");
    $httpClient.get({ url, headers, timeout: 15000 }, (err, resp, data) => {
      if (err) {
        resolve({ ok: false, error: `网络错误: ${err}` });
        return;
      }
      try {
        resolve({ ok: true, data: JSON.parse(data || "{}") });
      } catch (e) {
        const status = resp && (resp.status || resp.statusCode) ? (resp.status || resp.statusCode) : "-";
        const snippet = String(data || "").replace(/\s+/g, " ").slice(0, 160);
        resolve({ ok: false, error: `返回非JSON: status=${status}, body=${snippet || "<empty>"}` });
      }
    });
  });
}

async function checkSignStatus(headers) {
  return await apiGet("/api/activity/sign/getCurrentUserSignInConfig", { platformType: PLATFORM_TYPE }, headers);
}

async function doSignIn(headers) {
  return await apiGet("/api/activity/sign/signIn", { platformType: PLATFORM_TYPE, source: SOURCE }, headers);
}

async function getDoudouBalance(headers) {
  return await apiGet("/api/activity/front/getCustomerIntegral", {}, headers);
}

async function main() {
  console.log(`[Script Start] 嘉立创签到 ${SCRIPT_VERSION}`);
  const acc = parseAuth();
  if (!acc) {
    notify("嘉立创签到", "⚠️ 未配置账号", "请先打开抓包开关，进入嘉立创小程序签到/消息页面触发一次接口请求");
    done();
    return;
  }

  const headers = buildHeaders(acc.token, acc.secret);
  const logs = [];
  let success = true;
  let doudou = 0;

  console.log(`开始处理 ${acc.remark}`);

  console.log("正在查询签到状态...");
  const statusResp = await checkSignStatus(headers);
  if (!statusResp.ok) {
    const msg = `查询状态异常: ${statusResp.error}`;
    console.log(msg);
    logs.push(`❌ ${msg}`);
    notify("嘉立创签到", "❌ 签到失败", logs.join("\n"));
    done();
    return;
  }

  const status = statusResp.data || {};
  if (!status.success) {
    const msg = `查询状态失败: ${status.msg || "未知错误"}`;
    console.log(msg);
    logs.push(`❌ ${msg}`);
    notify("嘉立创签到", "❌ 签到失败", logs.join("\n"));
    done();
    return;
  }

  const alreadySigned = !!(((status.data || {}).haveSignIn));
  console.log(`签到状态: ${alreadySigned ? "已签到" : "未签到"}`);

  if (alreadySigned) {
    logs.push("✅ 今日已签到，无需重复");
  } else {
    console.log("正在执行签到...");
    const signResp = await doSignIn(headers);
    if (!signResp.ok) {
      const msg = `签到异常: ${signResp.error}`;
      console.log(msg);
      logs.push(`❌ ${msg}`);
      success = false;
    } else {
      const result = signResp.data || {};
      if (result.success) {
        const gain = (((result.data || {}).gainNum) || 0);
        logs.push(`✅ 签到成功！获得 ${gain} 豆豆`);
        console.log(`签到成功！获得 ${gain} 豆豆`);
      } else {
        const msg = `签到失败: ${result.msg || "未知错误"}`;
        logs.push(`❌ ${msg}`);
        console.log(msg);
        success = false;
      }
    }
  }

  console.log("正在查询豆豆余额...");
  const balanceResp = await getDoudouBalance(headers);
  if (balanceResp.ok && balanceResp.data && balanceResp.data.success) {
    const data = balanceResp.data.data || {};
    doudou = data.integralVoucher || 0;
    const expire = data.expireTime || "";
    const expireInfo = expire ? `（${expire}到期）` : "";
    logs.push(`💰 豆豆余额: ${doudou}${expireInfo}`);
    console.log(`豆豆余额: ${doudou}${expireInfo}`);
  } else {
    const msg = balanceResp.ok ? (balanceResp.data && balanceResp.data.msg || "未知错误") : balanceResp.error;
    logs.push(`⚠️ 查询余额失败: ${msg}`);
    console.log(`查询余额失败: ${msg}`);
  }

  notify("嘉立创签到", success ? "✅ 执行完成" : "❌ 存在失败", logs.join("\n"));
  console.log("[Script End]");
  done();
}

if (typeof $request !== "undefined") {
  if (!captureAuthIfNeeded()) done();
} else {
  main().catch((e) => {
    console.log(`[Fatal] ${e && e.stack ? e.stack : e}`);
    notify("嘉立创签到", "脚本异常", String(e));
    done();
  });
}
