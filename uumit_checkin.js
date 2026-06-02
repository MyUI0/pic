/*
QuantumultX 脚本 - uumit 每日签到（支持自动捕获 Token）

📌 功能：
  1. 自动捕获登录后的 Authorization Token（通过 rewrite 拦截）
  2. 每日签到 POST /api/v1/daily/checkin
  3. 查询宝箱、扭蛋、钱包状态

📌 安装步骤：

  【第一步】在 [rewrite_local] 中添加：
  ^https:\/\/m\.uumit\.com\/api\/v1\/(daily|users|wallet|llm) url script-response-body https://raw.githubusercontent.com/xxx/uumit_checkin.js
  
  【第二步】在 [mitm] 中添加：
  hostname = m.uumit.com
  
  【第三步】在 [task_local] 中添加定时任务：
  0 0 * * * https://raw.githubusercontent.com/xxx/uumit_checkin.js, tag=uumit每日签到, enabled=true
  
  📌 首次使用：
  1. 开启 QX 并登录 uumit（微信或邮箱）
  2. 脚本会自动捕获 Token 并持久化存储
  3. 之后每天定时签到的通知推送

📌 Token 说明：
  - uumit 使用 JWT Bearer Token（无 cookie）
  - Token 过期后需重新登录，脚本会自动刷新
  - 可通过 $persistentStore 跨会话保存
*/

// ===================== 配置区域 =====================
const UUMIT_HOST = "https://m.uumit.com";
const CONFIG = {
  maxRetries: 3,          // 失败重试次数
  requestTimeout: 15000,  // 请求超时(ms)
  storeKey: "uumit_token",// 持久化存储 Key
};

// API 端点定义
const APIS = [
  ["checkin",  "POST", "/api/v1/daily/checkin"],
  ["box",      "GET",  "/api/v1/daily/box"],
  ["cyberEgg", "GET",  "/api/v1/llm/cyber-egg/today"],
  ["wallet",   "GET",  "/api/v1/wallet"],
  ["walletStats","GET","/api/v1/wallet/stats"],
  ["userMe",   "GET",  "/api/v1/users/me"],
];

// ====================================================

/**
 * 持久化存储读写（兼容 QX / Surge / Loon）
 */
const Store = {
  read(key) {
    if (typeof $persistentStore !== 'undefined') return $persistentStore.read(key);
    if (typeof $prefs !== 'undefined') return $prefs.valueForKey(key);
    return null;
  },
  write(key, val) {
    if (typeof $persistentStore !== 'undefined') return $persistentStore.write(val, key);
    if (typeof $prefs !== 'undefined') return $prefs.setValueForKey(val, key);
    return false;
  },
};

/**
 * 发送通知
 */
function notify(title, subtitle, body) {
  if (typeof $notification !== 'undefined') $notification.post(title, subtitle, body);
  console.log(`[通知] ${title} | ${subtitle} | ${body}`);
}

/**
 * 自动捕获 Token（由 rewrite 触发时运行）
 * 从登录/用户信息的响应中提取 Bearer Token 并存储
 */
function captureToken() {
  // 情况 1: 从请求的 Authorization header 捕获（用于首次捕获）
  if (typeof $request !== 'undefined' && $request.headers) {
    const auth = $request.headers['Authorization'] || $request.headers['authorization'] || '';
    const match = auth.match(/Bearer\s+(.+)/);
    if (match && match[1]) {
      const token = match[1];
      const oldToken = Store.read(CONFIG.storeKey);
      if (token !== oldToken) {
        Store.write(CONFIG.storeKey, token);
        console.log(`✅ Token 已捕获并保存 (${token.substring(0, 20)}...)`);
        notify("uumit Token", "已自动捕获", "登录态已保存，签到脚本可正常使用");
      }
      return token;
    }
  }

  // 情况 2: 从响应体中提取（/users/me 等接口返回可能包含 token 信息）
  if (typeof $response !== 'undefined' && $response.body) {
    try {
      const body = JSON.parse($response.body);
      // 某些接口可能在 data 中包含新的 token
      if (body?.data?.token || body?.data?.access_token) {
        const token = body.data.token || body.data.access_token;
        Store.write(CONFIG.storeKey, token);
        console.log(`✅ Token 已从响应体捕获并保存`);
      }
    } catch {}
  }

  return Store.read(CONFIG.storeKey);
}

/**
 * Token 获取（优先持久化存储，其次脚本默认值）
 */
function getToken() {
  // rewrite 模式下尝试捕获
  if (typeof $request !== 'undefined' || typeof $response !== 'undefined') {
    return captureToken();
  }
  // 定时任务模式：从存储读取
  const stored = Store.read(CONFIG.storeKey);
  if (stored) return stored;
  // 从 $environment.params 读取（QX 面板传入）
  if (typeof $environment !== 'undefined' && $environment.params?.uumit_token) {
    return $environment.params.uumit_token;
  }
  return null;
}

/**
 * HTTP 请求封装
 */
async function apiRequest(method, path, bodyData = null, retry = 0) {
  const token = getToken();
  if (!token) {
    throw new Error("❌ Token 未获取到，请先登录 uumit (需开启 QX rewrite)");
  }

  const headers = {
    "Authorization": `Bearer ${token}`,
    "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1",
    "Accept": "*/*",
    "Accept-Language": "zh-CN,zh-Hans;q=0.9",
    "Origin": UUMIT_HOST,
    "Referer": UUMIT_HOST + "/hall",
  };

  if (method === "POST" && bodyData) {
    headers["Content-Type"] = "application/json";
  }

  const params = {
    url: UUMIT_HOST + path,
    method: method,
    headers: headers,
    timeout: CONFIG.requestTimeout,
  };
  if (method === "POST") params.body = bodyData || "";

  return new Promise((resolve, reject) => {
    if (typeof $task === 'undefined') {
      console.log(`[模拟] ${method} ${path}`);
      return resolve(null);
    }
    $task.fetch(params).then(
      resp => {
        try { resolve(JSON.parse(resp.body)); }
        catch { resolve({ code: -1, raw: resp.body }); }
      },
      err => {
        if (retry < CONFIG.maxRetries) {
          console.log(`⚠ 第 ${retry+1} 次重试: ${path}`);
          resolve(apiRequest(method, path, bodyData, retry + 1));
        } else {
          reject(err);
        }
      }
    );
  });
}

// ===================== 签到主流程 =====================

async function doCheckin() {
  const lines = [];
  const now = new Date();
  const d = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}-${String(now.getDate()).padStart(2,"0")}`;
  const t = now.toLocaleTimeString("zh-CN", { hour12: false });

  lines.push(`╔══════════════════════════════╗`);
  lines.push(`║  🎯 uumit 每日签到`);
  lines.push(`║  📅 ${d}  ${t}`);
  lines.push(`╚══════════════════════════════╝`);

  // 检查 Token
  const token = getToken();
  if (!token) {
    lines.push(`\n❌ 未获取到 Token！`);
    lines.push(`📌 请确保在 uumit 登录时 QX rewrite 已开启`);
    return lines.join("\n");
  }
  lines.push(`\n✅ Token 有效 (${token.substring(0, 20)}...)`);

  // 1. 用户信息
  try {
    const r = await apiRequest("GET", APIS.find(x => x[0]==="userMe")[2]);
    if (r?.code === 0) lines.push(`👤 ${r.data.profile.nickname || "用户"}`);
  } catch {}

  // 2. 签到
  lines.push(`\n📌 每日签到`);
  try {
    const r = await apiRequest("POST", APIS.find(x => x[0]==="checkin")[2], "");
    if (r?.code === 0) {
      lines.push(`  ✅ 成功！+${r.data.reward_ut} UT`);
      lines.push(`  🔥 连续 ${r.data.streak_day}/${r.data.streak_target} 天`);
    } else if (r?.code === 40001) {
      lines.push(`  ℹ️ 今日已签到`);
    } else {
      lines.push(`  ❌ ${r?.message || "失败"}`);
    }
  } catch (e) { lines.push(`  ❌ ${e.message}`); }

  // 3. 宝箱
  lines.push(`\n📌 宝箱任务`);
  try {
    const r = await apiRequest("GET", APIS.find(x => x[0]==="box")[2]);
    if (r?.code === 0) {
      const d = r.data;
      lines.push(`  📊 ${d.completed_count}/${d.total_count}`);
      d.missions.forEach(m => lines.push(`  ${m.completed ? "✅":"⬜"} ${m.name} (${m.reward_ut} UT)`));
      if (d.completed_count >= d.total_count && !d.bonus_claimed) {
        lines.push(`  🏆 宝箱可领 ${d.bonus_ut} UT`);
      }
    }
  } catch {}

  // 4. 扭蛋
  lines.push(`\n📌 免费额度`);
  try {
    const r = await apiRequest("GET", APIS.find(x => x[0]==="cyberEgg")[2]);
    if (r?.code === 0) {
      const d = r.data;
      if (d.claimed) lines.push(`  ✅ ¥${d.value_cny} (已领取)`);
      else lines.push(`  ℹ️ 未领取 (App内操作)`);
    }
  } catch {}

  // 5. 钱包
  lines.push(`\n📌 钱包`);
  try {
    const r = await apiRequest("GET", APIS.find(x => x[0]==="wallet")[2]);
    if (r?.code === 0) lines.push(`  💰 ${r.data.ut.balance} UT`);
    const s = await apiRequest("GET", APIS.find(x => x[0]==="walletStats")[2]);
    if (s?.code === 0) lines.push(`  📈 今日 +${s.data.ut.today_income} UT`);
  } catch {}

  return lines.join("\n");
}

// ===================== 入口 =====================

(async () => {
  try {
    // 如果是 rewrite 模式（拦截请求/响应），仅捕获 token 后直接退出
    if (typeof $request !== 'undefined' || typeof $response !== 'undefined') {
      captureToken();
      return $done?.();
    }

    // 定时任务模式：执行签到
    const result = await doCheckin();
    console.log(result);

    // 提取关键状态发通知
    const summary = result.split("\n")
      .filter(l => l.includes("✅") || l.includes("❌") || l.includes("ℹ️") || l.includes("💰") || l.includes("🎯"))
      .slice(0, 4)
      .join(" | ");

    notify("uumit 签到", "", summary || "执行完成，查看详情");
  } catch (e) {
    console.log(`❌ ${e.message}`);
    notify("uumit 签到失败", "", e.message);
  } finally {
    if (typeof $done !== 'undefined') $done();
  }
})();
