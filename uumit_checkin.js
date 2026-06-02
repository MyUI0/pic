/*
╔══════════════════════════════════════════════════════╗
║   🎯 uumit (小龙人) — 签到 + 自动凭证抓取            ║
║   QuantumultX Rewrite + Task 脚本                    ║
║   抓包分析日期: 2026-06-02                           ║
╚══════════════════════════════════════════════════════╝

📌 Rewrite 配置 (QX → 配置 → 重写 → +):
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  ^https:\/\/m\.uumit\.com\/api\/v1\/.* url script-request-body https://raw.githubusercontent.com/xxx/UUmit_Cookie.js

📌 MITM 配置 (QX → 配置 → 代理 → HTTPS 解密):
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  hostname = m.uumit.com

📌 首次使用:
  1. 开启 QX + MITM (需信任 HTTPS 证书)
  2. 打开 uumit App 或 m.uumit.com 登录一次 (微信/手机号/邮箱均可)
  3. 脚本自动捕获 Token 并持久化保存
  4. 之后每天 0 点自动签到

📌 Task 配置:
  0 0 * * * https://raw.githubusercontent.com/xxx/UUmit_Cookie.js, tag=uumit每日签到, enabled=true
*/

// ═══════════════════════════════════════════════════════
// 配置项
// ═══════════════════════════════════════════════════════
const UUMIT_HOST = "https://m.uumit.com";

// uumit 签到 API（来自 2026-06-02 抓包分析）
const API = {
  // 每日签到 — POST 空 body，返回 reward_ut + streak_day
  checkin:    { method: "POST", path: "/api/v1/daily/checkin" },
  // 宝箱任务 — GET，返回 mission 列表及完成状态
  box:        { method: "GET",  path: "/api/v1/daily/box" },
  // 免费额度(扭蛋) — GET，返回 claimed/value_cny/budget
  cyberEgg:   { method: "GET",  path: "/api/v1/llm/cyber-egg/today" },
  // 钱包余额
  wallet:     { method: "GET",  path: "/api/v1/wallet" },
  // 今日收支
  walletStats:{ method: "GET",  path: "/api/v1/wallet/stats" },
  // 用户信息
  userMe:     { method: "GET",  path: "/api/v1/users/me" },
};

// ═══════════════════════════════════════════════════════
// 工具函数
// ═══════════════════════════════════════════════════════

/**
 * 持久化存储（兼容 QX / Surge）
 */
const $storage = {
  read(k) {
    if (typeof $persistentStore !== 'undefined') return $persistentStore.read(k);
    return null;
  },
  write(k, v) {
    if (typeof $persistentStore !== 'undefined') return $persistentStore.write(v, k);
    return false;
  },
};

const STORE_TOKEN = "uumit_token";

/**
 * 发送通知
 */
function notify(title, sub, body) {
  if (typeof $notification !== 'undefined') $notification.post(title, sub, body);
}

/**
 * 从请求 headers 提取 Bearer Token
 * 当用户登录或调用 API 时，QX rewrite 会拦截每个请求
 */
function extractTokenFromHeaders() {
  // $request 在 script-request-body 中存在
  // $request.headers 是 dict { key: value }
  const hdrs = $request?.headers || {};
  // Authorization 可能大小写不同
  const auth = hdrs['Authorization'] || hdrs['authorization'] || '';
  const m = auth.match(/^Bearer\s+(.+)/);
  if (m) {
    const token = m[1];
    if (!token.startsWith('eyJ')) return null; // 不是 JWT
    return token;
  }
  return null;
}

/**
 * 从响应体提取 Token（某些接口可能在 body 返回）
 */
function extractTokenFromBody() {
  try {
    const body = JSON.parse($response?.body || '{}');
    if (body?.data?.token) return body.data.token;
    if (body?.data?.access_token) return body.data.access_token;
    if (body?.token) return body.token;
    if (body?.access_token) return body.access_token;
  } catch {}
  return null;
}

/**
 * 持久化保存 Token（Token 有效才保存）
 */
function saveToken(token) {
  if (!token || token.length < 20) return false;
  const prev = $storage.read(STORE_TOKEN);
  if (token !== prev) {
    $storage.write(STORE_TOKEN, token);
    console.log(`[uumit] Token 已保存 (前20: ${token.substring(0, 20)}...)`);
    return true;
  }
  return false;
}

/**
 * 获取已保存的 Token
 */
function getToken() {
  if (typeof $environment !== 'undefined' && $environment?.params?.uumit_token) {
    return $environment.params.uumit_token;
  }
  return $storage.read(STORE_TOKEN);
}

// ═══════════════════════════════════════════════════════
// Rewrite 入口（拦截请求时执行）
// ═══════════════════════════════════════════════════════
if (typeof $request !== 'undefined') {
  // 捕获模式：从请求/响应中提取 Token
  const fromHdr = extractTokenFromHeaders();
  if (fromHdr) saveToken(fromHdr);
  
  // 也可从响应体提取（某些登录接口返回新 token）
  if (typeof $response !== 'undefined') {
    const fromBody = extractTokenFromBody();
    if (fromBody) saveToken(fromBody);
  }
  
  // 不修改请求/响应，原样放行
  $done({});
}

// ═══════════════════════════════════════════════════════
// 定时任务模式（执行签到）
// ═══════════════════════════════════════════════════════
else if (typeof $task !== 'undefined') {

  /**
   * HTTP 请求
   */
  function api(method, path, bodyStr = "", retry = 0) {
    const token = getToken();
    if (!token) {
      return Promise.reject(new Error("未获取到 Token，请先打开 uumit 登录一次"));
    }

    const hdrs = {
      "Authorization": `Bearer ${token}`,
      "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1",
      "Accept": "*/*",
      "Accept-Language": "zh-CN,zh-Hans;q=0.9",
      "Origin": UUMIT_HOST,
      "Referer": UUMIT_HOST + "/hall",
    };
    if (method === "POST" && bodyStr) hdrs["Content-Type"] = "application/json";

    const opts = {
      url: UUMIT_HOST + path,
      method: method,
      headers: hdrs,
      timeout: 15000,
    };
    if (method === "POST") opts.body = bodyStr;

    return new Promise((resolve, reject) => {
      $task.fetch(opts).then(
        r => { try { resolve(JSON.parse(r.body)); } catch { resolve({ code: -1, raw: r.body }); } },
        e => {
          if (retry < 3) {
            console.log(`重试 (${retry+1}/3): ${path}`);
            resolve(api(method, path, bodyStr, retry + 1));
          } else {
            reject(e);
          }
        }
      );
    });
  }

  /**
   * 签到主流程
   */
  async function run() {
    const lines = [];
    const now = new Date();
    const ds = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}-${String(now.getDate()).padStart(2,"0")}`;
    const ts = now.toLocaleTimeString("zh-CN", { hour12: false });

    lines.push("╔══════════════════════════════╗");
    lines.push("║  🎯 uumit 每日签到");
    lines.push(`║  📅 ${ds}  ${ts}`);
    lines.push("╚══════════════════════════════╝");

    // --- Token 检查 ---
    const token = getToken();
    if (!token) {
      lines.push("\n❌ 未获取到 Token！");
      lines.push("📌 请开启 QX → 打开 uumit 登录一次 → Token 自动保存");
      console.log(lines.join("\n"));
      notify("uumit 签到失败", "Token 未配置", "请先登录一次 uumit");
      return;
    }
    lines.push(`\n✅ Token 已加载`);

    // --- 1. 用户信息 ---
    try {
      const r = await api("GET", API.userMe.path);
      if (r?.code === 0) lines.push(`👤 ${r.data.profile.nickname || "用户"}`);
    } catch {}

    // --- 2. 每日签到 ---
    lines.push("\n📌 每日签到");
    try {
      const r = await api("POST", API.checkin.path, "");
      if (r?.code === 0) {
        lines.push(`  ✅ 签到成功！+${r.data.reward_ut} UT`);
        lines.push(`  🔥 连续 ${r.data.streak_day}/${r.data.streak_target} 天`);
      } else if (r?.code === 40001) {
        lines.push(`  ℹ️ 今日已签到`);
      } else {
        lines.push(`  ❌ ${r?.message || "失败"}`);
      }
    } catch (e) { lines.push(`  ❌ ${e.message}`); }

    // --- 3. 宝箱任务 ---
    lines.push("\n📌 宝箱任务");
    try {
      const r = await api("GET", API.box.path);
      if (r?.code === 0) {
        const d = r.data;
        lines.push(`  📦 进度 ${d.completed_count}/${d.total_count}`);
        d.missions.forEach(m => lines.push(`  ${m.completed ? "✅" : "⬜"} ${m.name} (${m.reward_ut} UT)`));
        if (d.completed_count >= d.total_count && !d.bonus_claimed) {
          lines.push(`  🏆 可领宝箱 ${d.bonus_ut} UT (App内领取)`);
        }
        lines.push(`  🔥 连续 ${d.streak_day} 天`);
      }
    } catch {}

    // --- 4. 扭蛋 ---
    lines.push("\n📌 免费额度");
    try {
      const r = await api("GET", API.cyberEgg.path);
      if (r?.code === 0) {
        const d = r.data;
        if (d.claimed) {
          lines.push(`  ✅ 已领 ¥${d.value_cny}`);
          lines.push(`  ⏳ 到期: ${(d.expires_at || "").substring(0, 10)}`);
        } else {
          lines.push(`  ℹ️ 未领取 (App内操作)`);
        }
      }
    } catch {}

    // --- 5. 钱包 ---
    lines.push("\n📌 钱包");
    try {
      const r = await api("GET", API.wallet.path);
      if (r?.code === 0) {
        lines.push(`  💰 ${r.data.ut.balance} UT`);
        lines.push(`  💳 可提: ${r.data.ut.withdrawable_balance || "0"} UT`);
      }
      const s = await api("GET", API.walletStats.path);
      if (s?.code === 0) lines.push(`  📈 今日 +${s.data.ut.today_income} UT`);
    } catch {}

    // --- 通知推送 ---
    const result = lines.join("\n");
    console.log(result);

    const keyLines = result.split("\n").filter(l => l.includes("✅") || l.includes("❌") || l.includes("ℹ️") || l.includes("💰"));
    const summary = keyLines.slice(0, 3).join("  |  ");
    notify("uumit 签到", "", summary || "执行完毕");
  }

  run().catch(e => {
    console.log(`❌ 脚本异常: ${e.message}`);
    notify("uumit 签到失败", "", e.message);
  });
}
