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

const store = {
  read(k) { return $prefs.valueForKey(k); },
  write(k, v) { $prefs.setValueForKey(v, k); },
};

function notify(title, sub, body) {
  try { $notification?.post(title, sub, body); } catch {}
  console.log(`[通知] ${title} | ${body}`);
}

function extractToken() {
  const auth = $request?.headers?.Authorization || $request?.headers?.authorization || '';
  const m = auth.match(/^Bearer\s+(.+)/);
  return m?.[1]?.startsWith('eyJ') ? m[1] : null;
}

function saveToken(token) {
  if (!token || token.length < 20) return false;
  const prev = store.read(KEY);
  if (token !== prev) {
    store.write(KEY, token);
    console.log(`[uumit] Token saved: ${token.substring(0, 20)}...`);
    notify("uumit Token", "已捕获", "登录成功，签到可用");
    return true;
  }
  return false;
}

function getToken() {
  return store.read(KEY) || extractToken() || null;
}

// ── Rewrite: 自动捕获 Token ──
if (typeof $request !== 'undefined') {
  const t = extractToken();
  if (t) saveToken(t);
  $done({});
}

// ── Task: 执行签到 ──
else if (typeof $task !== 'undefined') {

  function api(method, path, body, retry = 0) {
    const token = getToken();
    if (!token) return Promise.reject("未获取 Token，请先登录 uumit");

    const opts = {
      url: HOST + path,
      method,
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
    if (method === "POST" && body) { opts.body = body; opts.headers["Content-Type"] = "application/json"; }

    return new Promise((resolve, reject) => {
      $task.fetch(opts).then(
        r => { try { resolve(JSON.parse(r.body)); } catch { resolve({ code: -1 }); } },
        e => retry < 3 ? resolve(api(method, path, body, retry + 1)) : reject(e)
      );
    });
  }

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
      notify("uumit 签到失败", "Token 未配置", "请先登录 uumit");
      return;
    }
    out.push(`\nToken: ${token.substring(0, 20)}...`);

    // 用户信息
    try { const r = await api("GET", API.userMe); if (r?.code === 0) out.push(`用户: ${r.data.profile.nickname}`); } catch {}

    // 签到
    out.push("\n每日签到");
    let ok = false;
    try {
      const r = await api("POST", API.checkin, "");
      if (r?.code === 0) {
        out.push(`  签到成功 +${r.data.reward_ut} UT`);
        out.push(`  连续 ${r.data.streak_day}/${r.data.streak_target} 天`);
        ok = true;
      } else if (r?.code === 40001) {
        out.push("  今日已签到");
        ok = true;
      } else {
        out.push(`  签到失败: ${r?.message || "未知"}`);
      }
    } catch (e) { out.push(`  签到异常: ${e.message}`); }

    // 宝箱
    out.push("\n宝箱任务");
    try {
      const r = await api("GET", API.box);
      if (r?.code === 0) {
        const d = r.data;
        out.push(`  ${d.completed_count}/${d.total_count}`);
        d.missions.forEach(m => out.push(`  ${m.completed ? "✓" : " "} ${m.name} (${m.reward_ut} UT)`));
        if (d.completed_count >= d.total_count && !d.bonus_claimed) out.push(`  宝箱 ${d.bonus_ut} UT 待领取`);
        out.push(`  连续 ${d.streak_day} 天`);
      }
    } catch {}

    // 扭蛋
    out.push("\n免费额度");
    try {
      const r = await api("GET", API.cyberEgg);
      if (r?.code === 0) out.push(`  ${r.data.claimed ? "✓" : " "} ¥${r.data.value_cny} ${r.data.claimed ? "(已领)" : "(待领取)"}`);
    } catch {}

    // 钱包
    out.push("\n钱包");
    try {
      const r = await api("GET", API.wallet);
      if (r?.code === 0) out.push(`  ${r.data.ut.balance} UT`);
      const s = await api("GET", API.walletStats);
      if (s?.code === 0) out.push(`  今日 +${s.data.ut.today_income} UT`);
    } catch {}

    out.push("\n═══════════════════");
    console.log(out.join("\n"));

    ok ? notify("uumit 签到成功", "", out.filter(l => l.includes("✓")).join(" | ")) : notify("uumit 签到失败", "", out.filter(l => l.includes("❌")).join("\n"));
  })().finally(() => { $done(); });
}