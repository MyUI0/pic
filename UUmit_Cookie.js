/*
uumit 每日签到 + 自动 Token 抓取 (QuantumultX)
抓包: 2026-06-02

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📌 首次使用
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. QX → 配置 → 重写 → + → 粘贴 [rewrite_local]
2. QX → 配置 → 代理 → HTTPS 解密 → + → 粘贴 [MITM]
3. QX → 配置 → 任务 → + → 粘贴 [task_local]
4. 打开 uumit App 登录一次 → 自动捕获 Token
5. 以后每天 0 点自动签到

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📌 配置示例
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

[rewrite_local]
# uumit Token 自动捕获（匹配所有 API 请求，确保刷新页面时能抓到 Token）
^https://m\.uumit\.com/api/ url script-request-header uumit_checkin.js

[task_local]
# uumit 每日签到 (每天 0:00 执行)
0 0 * * * uumit_checkin.js, tag=uumit签到, enabled=true

[MITM]
hostname = m.uumit.com
*/

const HOST = "https://m.uumit.com";
const KEY = "uumit_token";

const API = {
  checkin:     "/api/v1/daily/checkin",
  box:         "/api/v1/daily/box",
  cyberEgg:    "/api/v1/llm/cyber-egg/today",
  wallet:      "/api/v1/wallet",
  walletStats: "/api/v1/wallet/stats",
  userMe:      "/api/v1/users/me",
};

// QX 存储 API
const store = {
  read(k) { 
    return $prefs.valueForKey(k); 
  },
  write(k, v) { 
    return $prefs.setValueForKey(v, k); 
  },
};

// 通知函数
function notify(title, sub, body) {
  try { 
    $notify(title, sub, body); 
  } catch(e) {
    console.log(`[通知错误] ${e}`);
  }
  console.log(`[通知] ${title} | ${sub} | ${body}`);
}

// 从请求头中提取 Token
function extractToken() {
  const auth = $request?.headers?.Authorization || $request?.headers?.authorization || '';
  const m = auth.match(/^Bearer\s+(.+)/i);
  return m?.[1]?.startsWith('eyJ') ? m[1] : null;
}

// 保存 Token
function saveToken(token) {
  if (!token || token.length < 20) return false;
  const prev = store.read(KEY);
  if (token !== prev) {
    store.write(KEY, token);
    store.write(KEY + "_new", "1");
    console.log(`[uumit] Token 已保存: ${token.substring(0, 20)}...`);
    notify("uumit Token", "已捕获", "登录成功，签到可用");
    return true;
  }
  return false;
}

// 获取 Token
function getToken() {
  return store.read(KEY) || null;
}

// ── Rewrite: 自动捕获 Token ──
if (typeof $request !== 'undefined' && $request) {
  const t = extractToken();
  if (t) {
    saveToken(t);
  } else {
    console.log("[uumit] 未找到有效的 Authorization Token");
  }
  $done({});
}

// ── Task: 执行签到 ──
else {
  // QX HTTP 请求封装
  function api(method, path, body, retry = 0) {
    const token = getToken();
    if (!token) return Promise.reject("未获取 Token，请先登录 uumit");

    const opts = {
      url: HOST + path,
      method: method,
      headers: {
        "Authorization": `Bearer ${token}`,
        "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1",
        "Accept": "*/*",
        "Accept-Language": "zh-CN,zh-Hans;q=0.9",
        "Origin": HOST,
        "Referer": HOST + "/hall",
      },
      timeout: 15000,
    };
    
    if (method === "POST" && body) { 
      opts.body = body; 
      opts.headers["Content-Type"] = "application/json"; 
    }

    return new Promise((resolve, reject) => {
      $task.fetch(opts).then(
        response => { 
          try { 
            resolve(JSON.parse(response.body)); 
          } catch { 
            resolve({ code: -1, message: "解析失败" }); 
          } 
        },
        error => {
          console.log(`[uumit] 请求失败: ${error}`);
          if (retry < 3) {
            console.log(`[uumit] 重试第 ${retry + 1} 次...`);
            setTimeout(() => {
              resolve(api(method, path, body, retry + 1));
            }, 1000);
          } else {
            reject(error);
          }
        }
      );
    });
  }

  // 主执行函数
  (async () => {
    const out = [];
    const now = new Date();
    const ds = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}-${String(now.getDate()).padStart(2,"0")}`;
    const ts = now.toLocaleTimeString("zh-CN", { hour12: false });

    out.push("══ uumit 每日签到 ══");
    out.push(`  ${ds} ${ts}`);
    out.push("═══════════════════");

    const token = getToken();
    if (!token) {
      out.push("\n❌ Token 未获取！请先登录 uumit");
      console.log(out.join("\n"));
      notify("uumit 签到失败", "Token 未配置", "请先登录 uumit App 获取 Token");
      $done();
      return;
    }

    const isNew = store.read(KEY + "_new");
    if (isNew === "1") {
      notify("uumit Token", "已捕获", "登录成功，签到可用");
      store.write(KEY + "_new", "0");
    }
    out.push(`\nToken: ${token.substring(0, 20)}...`);

    // 获取用户信息
    try { 
      const r = await api("GET", API.userMe); 
      if (r?.code === 0 && r.data?.profile?.nickname) {
        out.push(`用户: ${r.data.profile.nickname}`);
      }
    } catch(e) {
      console.log(`[uumit] 获取用户信息失败: ${e}`);
    }

    // 每日签到
    out.push("\n📅 每日签到");
    let ok = false;
    try {
      const r = await api("POST", API.checkin, "");
      if (r?.code === 0) {
        out.push(`  ✅ 签到成功 +${r.data?.reward_ut || 0} UT`);
        out.push(`  📊 连续 ${r.data?.streak_day || 0}/${r.data?.streak_target || 0} 天`);
        ok = true;
      } else if (r?.code === 40001) {
        out.push("  ℹ️ 今日已签到");
        ok = true;
      } else {
        out.push(`  ❌ 签到失败: ${r?.message || "未知错误"}`);
      }
    } catch (e) { 
      out.push(`  ❌ 签到异常: ${e.message || e}`); 
    }

    // 宝箱任务
    out.push("\n🎁 宝箱任务");
    try {
      const r = await api("GET", API.box);
      if (r?.code === 0 && r.data) {
        const d = r.data;
        out.push(`  进度: ${d.completed_count || 0}/${d.total_count || 0}`);
        if (d.missions && Array.isArray(d.missions)) {
          d.missions.forEach(m => {
            const status = m.completed ? "✅" : "⬜";
            out.push(`  ${status} ${m.name || '任务'} (${m.reward_ut || 0} UT)`);
          });
        }
        if (d.completed_count >= d.total_count && !d.bonus_claimed) {
          out.push(`  🎉 宝箱 ${d.bonus_ut || 0} UT 待领取`);
        }
        out.push(`  📈 连续 ${d.streak_day || 0} 天`);
      }
    } catch(e) {
      console.log(`[uumit] 获取宝箱任务失败: ${e}`);
    }

    // 免费额度
    out.push("\n🥚 免费额度");
    try {
      const r = await api("GET", API.cyberEgg);
      if (r?.code === 0 && r.data) {
        const status = r.data.claimed ? "✅ 已领" : "⬜ 待领取";
        out.push(`  ${status} ¥${r.data.value_cny || 0}`);
      }
    } catch(e) {
      console.log(`[uumit] 获取免费额度失败: ${e}`);
    }

    // 钱包信息
    out.push("\n💰 钱包");
    try {
      const r = await api("GET", API.wallet);
      if (r?.code === 0 && r.data?.ut) {
        out.push(`  余额: ${r.data.ut.balance || 0} UT`);
      }
      const s = await api("GET", API.walletStats);
      if (s?.code === 0 && s.data?.ut) {
        out.push(`  今日收入: +${s.data.ut.today_income || 0} UT`);
      }
    } catch(e) {
      console.log(`[uumit] 获取钱包信息失败: ${e}`);
    }

    out.push("\n═══════════════════");
    console.log(out.join("\n"));

    // 发送通知
    if (ok) {
      const successMsg = out.filter(l => l.includes("✅")).join(" | ");
      notify("uumit 签到成功", "", successMsg || "签到完成");
    } else {
      const failMsg = out.filter(l => l.includes("❌")).join("\n");
      notify("uumit 签到失败", "", failMsg || "请检查日志");
    }
    
    $done();
  })().catch(e => {
    console.log(`[uumit] 执行异常: ${e}`);
    notify("uumit 脚本错误", "", String(e));
    $done();
  });
}
