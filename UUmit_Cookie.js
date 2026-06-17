// ==UserScript==
// @name         uumit 签到+星火 V3 (长期凭证版)
// @description  捕获 refresh_token → auth/refresh 自动续期 | 单rewrite | 有弹窗
// @version      3.0
// ==/UserScript==

// ============================================================
// QX 配置
// ============================================================
// [rewrite_local]
// # 只捕获登录响应的 refresh_token
// ^https://m\.uumit\.com/api/v1/auth/login url script-response-body uumit_v3.js
//
// [mitm]
// hostname = m.uumit.com
//
// [task_local]
// 0 9,21 * * * uumit_v3.js, tag=uumit 签到+星火, enabled=true
// ============================================================

// ====== 常量 ======
const API = "https://m.uumit.com/api/v1";
const KEY = {
  RT: "uumit_rt_v3",
  AT: "uumit_at_v3",     // 缓存 access_token（来自 auth/refresh），非 rewrite 捕获
  AK: "uumit_ak",
  AK_DATE: "uumit_ak_date",
};

// ====== 持久化存储（兼容 QX & 脚本环境） ======
const store = (() => {
  // Quantumult X
  if (typeof $prefs !== 'undefined') {
    return {
      read: (k) => $prefs.valueForKey(k),
      write: (k, v) => $prefs.setValueForKey(v, k),
      remove: (k) => $prefs.removeValueForKey(k),
    };
  }
  // Loon / Surge (fallback)
  if (typeof $persistentStore !== 'undefined') {
    return {
      read: (k) => $persistentStore.read(k),
      write: (k, v) => $persistentStore.write(v, k),
      remove: (k) => $persistentStore.remove(k),
    };
  }
  // 测试环境
  return {
    read: () => null,
    write: () => {},
    remove: () => {},
  };
})();

// ====== 通知 ======
function notify(title, subtitle, body) {
  if (typeof $notify !== 'undefined') {
    $notify(title, subtitle, body);
  } else {
    console.log(`[通知] ${title} | ${subtitle} | ${body}`);
  }
}

// ====== 日志 ======
function log(msg) {
  console.log(`[uumit] ${msg}`);
}

// ====== HTTP 请求 ======
async function api(method, path, body, token) {
  const url = `${API}${path}`;
  const headers = { "Content-Type": "application/json" };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  
  return new Promise((resolve) => {
    const opt = {
      url,
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      timeout: 10000,
    };
    
    // QX
    if (typeof $task !== 'undefined') {
      $task.fetch(opt).then(
        resp => {
          try { resolve(JSON.parse(resp.body)); }
          catch(e) { resolve(null); }
        },
        err => resolve(null)
      );
    // Surge / Loon
    } else if (typeof $httpClient !== 'undefined') {
      const cb = (err, resp, data) => {
        if (err) { resolve(null); return; }
        try { resolve(JSON.parse(data)); }
        catch(e) { resolve(null); }
      };
      if (body) {
        $httpClient[method.toLowerCase()](opt, cb);
      } else {
        $httpClient[method.toLowerCase()](url, headers, cb);
      }
    } else {
      resolve(null);
    }
  });
}

// ====== 解码 JWT 获取过期时间 ======
function getJWTExp(token) {
  try {
    const parts = token.split('.');
    if (parts.length < 2) return null;
    let payload = parts[1];
    // Base64URL → Base64
    payload = payload.replace(/-/g, '+').replace(/_/g, '/');
    // 补 padding
    while (payload.length % 4) payload += '=';
    const decoded = typeof atob !== 'undefined' 
      ? atob(payload) 
      : (typeof Base64 !== 'undefined' ? Base64.decode(payload) : null);
    if (!decoded) return null;
    const obj = JSON.parse(decoded);
    return obj.exp ? obj.exp * 1000 : null;
  } catch (e) {
    return null;
  }
}

// ====== 用 refresh_token 获取新的 access_token ======
async function getAccessToken() {
  const rt = store.read(KEY.RT);
  if (!rt) {
    log("无 refresh_token，需要重新登录");
    return null;
  }
  
  // 先检查缓存的 access_token 是否仍有效
  const cachedAT = store.read(KEY.AT);
  if (cachedAT) {
    const exp = getJWTExp(cachedAT);
    if (exp && Date.now() < exp - 60000) {
      log("缓存的 access_token 仍有效（剩余" + Math.round((exp - Date.now())/60000) + "分钟）");
      return cachedAT;
    }
    log("缓存的 access_token 已过期，准备刷新");
  } else {
    log("无缓存的 access_token，准备刷新");
  }
  
  // 调用 auth/refresh
  const r = await api("POST", "/auth/refresh", { refresh_token: rt });
  if (!r) {
    log("auth/refresh 请求失败（网络异常）");
    return null;
  }
  
  if (r.code === 0 && r.data?.access_token) {
    const newAT = r.data.access_token;
    store.write(KEY.AT, newAT);
    log("access_token 已刷新");
    
    // 检查 refresh_token 是否 rotation（服务端返回了新 refresh_token）
    if (r.data.refresh_token && r.data.refresh_token !== rt) {
      store.write(KEY.RT, r.data.refresh_token);
      log("🔄 refresh_token 已 rotation，新一轮有效");
    } else {
      log("refresh_token 未 rotation，保持原值");
    }
    
    return newAT;
  }
  
  // auth/refresh 失败
  log(`auth/refresh 失败: code=${r.code} msg=${r.message}`);
  return null;
}

// ====== 每日签到 ======
async function doCheckin(token) {
  const r = await api("POST", "/daily/checkin", null, token);
  if (!r) return { ok: false, msg: "请求失败" };
  if (r.code === 0 && r.data) {
    const d = r.data;
    const parts = [];
    parts.push(`+${d.reward_ut || 0} UT`);
    parts.push(`${d.streak_day || 0}/${d.streak_target || 0}天`);
    if (d.streak_bonus_ut && parseFloat(d.streak_bonus_ut) > 0) {
      parts.push(`🎁 连签奖励 ${d.streak_bonus_ut} UT`);
    }
    // mascot_line 有些会带 emoji，直接显示
    const line = d.mascot_line ? `「${d.mascot_line}」` : "";
    return { ok: true, msg: parts.join(" | "), line, reward: d.reward_ut };
  }
  if (r.code === 40001) {
    return { ok: true, msg: "今日已签到" };
  }
  return { ok: false, msg: r.message || "签到失败" };
}

// ====== 每日宝箱 ======
async function getBoxStatus(token) {
  const r = await api("GET", "/daily/box", null, token);
  if (!r || r.code !== 0 || !r.data) return null;
  return r.data;
}

// ====== 钱包 & 统计 ======
async function getBalance(token) {
  const [w, s] = await Promise.all([
    api("GET", "/wallet", null, token),
    api("GET", "/wallet/stats", null, token),
  ]);
  const balance = w?.code === 0 && w.data?.ut ? w.data.ut.balance : null;
  const income = s?.code === 0 && s.data?.ut ? s.data.ut.today_income : null;
  return { balance, income };
}

// ====== 星火计划 ======
async function claimSpark(token) {
  const r = await api("POST", "/llm/cyber-egg/claim", null, token);
  if (!r) return { ok: false, msg: "请求失败" };
  if (r.code === 0 && r.data) {
    const preview = r.data.api_key_preview || r.data.api_key || null;
    let fullKey = r.data.api_key || null;
    if (!fullKey && r.data.claim_id) {
      // 尝试取完整 key
      const detail = await api("GET", `/llm/cyber-egg/claims/${r.data.claim_id}`, null, token);
      if (detail?.code === 0 && detail?.data?.api_key) {
        fullKey = detail.data.api_key;
      }
    }
    if (fullKey) {
      store.write(KEY.AK, fullKey);
      const today = new Date();
      store.write(KEY.AK_DATE, `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`);
    }
    const budget = r.data.budget_remaining_cny || r.data.value_cny || null;
    return { ok: true, preview, fullKey, budget, already: !!r.data.already_claimed };
  }
  if (r.code === 1003 || (r.message && r.message.includes('已领取'))) {
    return { ok: false, msg: "今日已领取" };
  }
  return { ok: false, msg: r.message || "未知错误" };
}

// ============================================================
// 主入口
// ============================================================
(async () => {
  // ── 模式1: Rewrite 捕获 ──
  if (typeof $response !== 'undefined' && $response && $response.body) {
    try {
      const body = typeof $response.body === 'string' 
        ? JSON.parse($response.body) 
        : $response.body;
      
      // 确认是登录成功响应
      if (body?.code === 0 && body?.data?.refresh_token) {
        const rt = body.data.refresh_token;
        store.write(KEY.RT, rt);
        
        // 解码看有效期
        let expiryInfo = "";
        const exp = getJWTExp(rt);
        if (exp) {
          const days = Math.round((exp - Date.now()) / 86400000);
          expiryInfo = `（${days}天有效）`;
        }
        
        log(`Refresh Token 已保存${expiryInfo}`);
        
        // 系统通知弹窗
        notify(
          "uumit 凭证",
          "✅ 长期凭证已保存",
          `refresh_token 已捕获${expiryInfo}，签到将自动续期`
        );
      } else if (body?.data?.refresh_token) {
        // 接口返回了 refresh_token 但不是 code=0
        log(`登录异常: code=${body.code} msg=${body.message}`);
      } else {
        // 不是登录响应，不做处理
        log("非登录响应，跳过");
      }
    } catch (e) {
      log(`解析响应体失败: ${e}`);
    }
    
    $done({});
    return;
  }
  
  // ── 模式2: Task 执行 ──
  
  // 获取 access_token（自动 refresh）
  const token = await getAccessToken();
  if (!token) {
    notify(
      "uumit 签到",
      "❌ 凭证失效",
      "refresh_token 已过期或未捕获，请打开 uumit 网页重新登录"
    );
    $done();
    return;
  }
  
  const results = [];
  
  // 1. 每日签到
  log("▶ 签到中...");
  const checkin = await doCheckin(token);
  if (checkin.ok) {
    log(`签到: ${checkin.msg}`);
    results.push(`✅ 签到成功`);
    if (checkin.line) results.push(`💬 ${checkin.line}`);
    if (checkin.msg) results.push(`📊 ${checkin.msg}`);
  } else {
    log(`签到异常: ${checkin.msg}`);
    results.push(`⚠️ ${checkin.msg}`);
  }
  
  // 2. 宝箱状态
  const box = await getBoxStatus(token);
  if (box) {
    log(`宝箱: ${box.completed_count}/${box.total_count} 完成`);
    // 显示今日任务完成情况
    for (const m of (box.missions || [])) {
      const done = m.completed ? "✅" : "⭕";
      log(`  ${done} ${m.fun_title || m.name}: +${m.reward_ut} UT`);
    }
    results.push(`📦 宝箱 ${box.completed_count}/${box.total_count}`);
  }
  
  // 3. 钱包 & 今日收入
  const fin = await getBalance(token);
  let balanceStr = "";
  if (fin) {
    balanceStr = `💰 ${fin.balance || 0} UT`;
    if (fin.income && parseFloat(fin.income) > 0) {
      balanceStr += ` (今日 +${fin.income})`;
    }
    log(`余额: ${balanceStr}`);
    results.push(balanceStr);
  }
  
  // 4. 星火计划
  const spark = await claimSpark(token);
  if (spark.ok) {
    log(`星火领取成功`);
    if (spark.budget) results.push(`🔥 星火 ¥${spark.budget}`);
    if (spark.preview) results.push(`🔑 ${spark.preview}`);
    if (spark.fullKey) log(`API Key: ${spark.fullKey.substring(0,10)}...${spark.fullKey.slice(-6)}`);
    if (!results.some(r => r.includes('签到'))) results.push(`✅ 已签到`);
  } else {
    if (spark.msg.includes('已领取')) {
      log(`星火: 今日已领取`);
      results.push(`🔥 今日已领取`);
    } else {
      log(`星火: ${spark.msg}`);
      results.push(`❌ ${spark.msg}`);
    }
  }
  
  // 5. 检查 refresh_token 有效期
  let rtWarning = "";
  const rt = store.read(KEY.RT);
  if (rt) {
    const exp = getJWTExp(rt);
    if (exp) {
      const remainingDays = (exp - Date.now()) / 86400000;
      if (remainingDays < 1) {
        rtWarning = `⚠️ refresh_token 即将过期（<1天），请重新登录`;
      } else if (remainingDays < 3) {
        rtWarning = `📅 凭证 ${Math.round(remainingDays)} 天后到期`;
      }
    }
  }

  // ── 显示结果 ──
  const title = "uumit 签到+星火";
  
  const sub = results
    .filter(r => r.startsWith('✅') || r.startsWith('🔥') || r.startsWith('💰'))
    .join('  ');
  
  let body = results.join('\n');
  if (rtWarning) body += '\n' + rtWarning;
  
  notify(title, sub || "请查看详情", body);
  $done();
  
})().catch(e => {
  log(`异常: ${e.message || e}`);
  notify("uumit 脚本错误", "", String(e.message || e));
  $done();
});
