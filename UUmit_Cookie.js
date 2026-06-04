/*
uumit 每日签到 + 星火计划领取 + 自动 Token 刷新 (QuantumultX)
抓包: 2026-06-02 | 更新: 2026-06-05

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📌 核心改进（V2）
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ 长期凭证：保存 refresh_token + access_token，过期自动刷新
✅ 被动捕获：rewrite 拦截自动更新 token（V1 功能保留）
✅ 星火计划：每天领取 ¥3 额度（/llm/cyber-egg/claim）
✅ API Key 展示：通知中显示当天 API Key 预览，点击可查看完整 Key
✅ 完整签到：签到 + 宝箱 + 余额 + 星火额度的整合报告

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📌 配置说明
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

[rewrite_local]
# uumit Token 自动捕获（script-request-header：当请求发出时捕获 Access Token）
^https://m\.uumit\.com/api/v1/ url script-request-header https://raw.githubusercontent.com/MyUI0/pic/refs/heads/main/UUmit_Cookie.js
# uumit Token 自动捕获（script-response-body：捕获登录响应中的 Refresh Token）
^https://m\.uumit\.com/(api/v1/)?auth/(login|send-code|refresh) url script-response-body https://raw.githubusercontent.com/MyUI0/pic/refs/heads/main/UUmit_Cookie.js

[MITM]
hostname = m.uumit.com

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📌 首次使用
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. 在 m.uumit.com 登录一次（手机号/邮箱+密码 或 微信）
2. rewrite 会自动捕获 access_token 和 refresh_token
3. 随后每天自动签到+领取星火计划
4. 通知中会显示当天 API Key 预览

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📌 Token 存储说明
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
均使用 $prefs.setValueForKey / $prefs.valueForKey 持久化存储：
- uumit_at   → access_token（JWT，2小时有效）
- uumit_rt   → refresh_token（长期有效）
- uumit_user → 用户信息 JSON（昵称、邮箱等）
- uumit_ak   → 当日完整 API Key（星火计划领取后保存）
- uumit_ak_date → API Key 日期（用于判断是否需要重新领取）
*/

const BASE = "https://m.uumit.com";
const API = "/api/v1";

// ── QX 存储封装 ──
const store = {
  read(k)      { return $prefs.valueForKey(k); },
  write(k, v)  { return $prefs.setValueForKey(v, k); },
};

// ── 通知 ──
function notify(title, sub, body) {
  try { $notify(title, sub, body); } catch(e) { console.log(`[通知错误] ${e}`); }
  console.log(`[通知] ${title} | ${sub} | ${body}`);
}

// ── Token 相关 Key ──
const KEY_AT = "uumit_at";     // access_token
const KEY_RT = "uumit_rt";     // refresh_token
const KEY_AK = "uumit_ak";     // API key (today)
const KEY_AK_DATE = "uumit_ak_date";
const KEY_USER = "uumit_user";
const KEY_AK_CLAIM_ID = "uumit_ak_claim_id";

// ── 从请求头提取 Token ──
function extractTokenPair() {
  const auth = $request?.headers?.Authorization || $request?.headers?.authorization || '';
  const m = auth.match(/^Bearer\s+(.+)/i);
  const at = m?.[1]?.startsWith('eyJ') ? m[1] : null;
  return { access_token: at, refresh_token: null };
}

// ── 从登录响应体提取完整 Token Pair ──
function extractFromResponseBody() {
  if (!$response || !$response.body) return null;
  try {
    const body = typeof $response.body === 'string' ? JSON.parse($response.body) : $response.body;
    if (body?.code === 0 && body?.data?.access_token) {
      return {
        access_token: body.data.access_token,
        refresh_token: body.data.refresh_token || null,
        user: body.data.user || null,
      };
    }
  } catch(e) {}
  return null;
}

// ── 签到模块 ──
function api(method, path, body, token, retry = 0) {
  const tk = token || store.read(KEY_AT);
  if (!tk) return Promise.reject("未获取 Token");

  const opts = {
    url: BASE + (path.startsWith("/") ? path : "/" + path),
    method: method,
    headers: {
      "Authorization": `Bearer ${tk}`,
      "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1",
      "Accept": "application/json, text/plain, */*",
      "Accept-Language": "zh-CN,zh-Hans;q=0.9",
      "Origin": BASE,
      "Referer": BASE + "/hall",
    },
    timeout: 15000,
  };

  if (method === "POST") {
    opts.headers["Content-Type"] = "application/json";
    if (body) opts.body = typeof body === 'string' ? body : JSON.stringify(body);
  }

  return new Promise((resolve, reject) => {
    $task.fetch(opts).then(
      response => {
        try { resolve(JSON.parse(response.body)); }
        catch { resolve({ code: -1, message: "解析失败" }); }
      },
      error => {
        console.log(`[uumit] 请求失败: ${error}`);
        if (retry < 3) {
          setTimeout(() => resolve(api(method, path, body, token, retry + 1)), 1000);
        } else {
          reject(error);
        }
      }
    );
  });
}

// ── Token 刷新（使用 refresh_token）──
async function refreshAccessToken() {
  const rt = store.read(KEY_RT);
  if (!rt) return null;
  try {
    const r = await api("POST", `${API}/auth/refresh`, { refresh_token: rt });
    if (r?.code === 0 && r?.data?.access_token) {
      store.write(KEY_AT, r.data.access_token);
      if (r.data.refresh_token) store.write(KEY_RT, r.data.refresh_token);
      console.log(`[uumit] Token 已刷新: ${r.data.access_token.substring(0, 20)}...`);
      return r.data.access_token;
    }
  } catch(e) {
    console.log(`[uumit] Token 刷新失败: ${e}`);
  }
  return null;
}

// ── 获取有效 Token（自动刷新）──
async function ensureToken() {
  let at = store.read(KEY_AT);
  if (!at) {
    // 尝试刷新
    at = await refreshAccessToken();
  }
  if (!at) return null;
  
  // 检查 JWT 是否过期
  try {
    const payload = JSON.parse(atob(at.split('.')[1]));
    const exp = payload.exp * 1000;
    if (Date.now() >= exp - 60000) { // 过期或即将过期（1分钟内）
      at = await refreshAccessToken();
    }
  } catch(e) {}
  return at;
}

// ── 保存 API Key ──
function saveApiKey(claimData) {
  if (claimData?.api_key) {
    store.write(KEY_AK, claimData.api_key);
    store.write(KEY_AK_DATE, new Date().toISOString().slice(0, 10));
    if (claimData.claim_id) store.write(KEY_AK_CLAIM_ID, claimData.claim_id);
  } else if (claimData?.api_key_preview) {
    // 已领取过，保存 preview
    store.write(KEY_AK_DATE, new Date().toISOString().slice(0, 10));
  }
}

// ── Rewrite 模式判断 ──
// QX 支持两种模式：
//   1. script-request-header  → $request 存在，$response 不存在
//   2. script-response-body   → $request 和 $response 都存在
const isRewriteRequest = typeof $request !== 'undefined' && $request;

// ── Rewrite: script-request-header（捕获 Authorization 请求头）──
if (isRewriteRequest && typeof $response === 'undefined') {
  const t = extractTokenPair();
  if (t.access_token) {
    const prev = store.read(KEY_AT);
    if (t.access_token !== prev) {
      store.write(KEY_AT, t.access_token);
      console.log(`[uumit] Access Token 已捕获: ${t.access_token.substring(0, 20)}...`);
    }
  } else {
    console.log("[uumit] 未找到有效的 Authorization Token");
  }
  $done({});
}

// ── Rewrite: script-response-body（捕获登录响应中的 refresh_token）──
else if (isRewriteRequest && typeof $response !== 'undefined') {
  const pair = extractFromResponseBody();
  if (pair) {
    if (pair.access_token) store.write(KEY_AT, pair.access_token);
    if (pair.refresh_token) {
      store.write(KEY_RT, pair.refresh_token);
      console.log(`[uumit] Refresh Token 已保存`);
    }
    if (pair.user) {
      store.write(KEY_USER, JSON.stringify({ id: pair.user.id, email: pair.user.email, nickname: pair.user.nickname }));
    }
    notify("uumit Token", "已登录", "Access + Refresh Token 已保存，签到可用");
  } else {
    console.log(`[uumit] 响应体未解析到 Token pair: ${($request?.url || '').substring(0, 60)}`);
  }
  $done({});
}

// ── Task: 主执行逻辑 ──
else {
  (async () => {
    const out = [];
    const now = new Date();
    const ds = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}-${String(now.getDate()).padStart(2,"0")}`;
    const ts = now.toLocaleTimeString("zh-CN", { hour12: false });

    out.push("══ uumit 每日签到+星火 ══");
    out.push(`  ${ds} ${ts}`);
    out.push("═══════════════════════");

    // 获取或刷新 Token
    const token = await ensureToken();
    if (!token) {
      out.push("\n❌ Token 未获取！请先登录 uumit");
      notify("uumit 签到失败", "Token 未配置", "请先登录 uumit App 获取 Token");
      $done();
      return;
    }
    out.push(`\nToken: ${token.substring(0, 20)}...`);

    // ─── 获取用户信息 ───
    try {
      const r = await api("GET", `${API}/users/me`, null, token);
      if (r?.code === 0 && r.data?.profile?.nickname) {
        out.push(`用户: ${r.data.profile.nickname}`);
        store.write(KEY_USER, JSON.stringify({ id: r.data.id, email: r.data.email, nickname: r.data.profile.nickname }));
      }
    } catch(e) {
      console.log(`[uumit] 获取用户信息失败: ${e}`);
    }

    // ─── 每日签到 ───
    out.push("\n📅 每日签到");
    let checkinOK = false;
    try {
      const r = await api("POST", `${API}/daily/checkin`, "", token);
      if (r?.code === 0) {
        out.push(`  ✅ 签到成功 +${r.data?.reward_ut || 0} UT`);
        out.push(`  📊 连续 ${r.data?.streak_day || 0}/${r.data?.streak_target || 0} 天`);
        checkinOK = true;
      } else if (r?.code === 40001) {
        out.push("  ℹ️ 今日已签到");
        checkinOK = true;
      } else {
        out.push(`  ❌ 签到失败: ${r?.message || "未知错误"}`);
      }
    } catch (e) {
      out.push(`  ❌ 签到异常: ${e.message || e}`);
    }

    // ─── 星火计划（每日 AI 额度领取）───
    out.push("\n🔥 星火计划");
    let sparkOK = false;
    let apiKeyPreview = null;
    try {
      const r = await api("POST", `${API}/llm/cyber-egg/claim`, null, token);
      if (r?.code === 0 && r?.data) {
        if (r.data.already_claimed) {
          out.push(`  ℹ️ 今日星火已领取`);
          out.push(`  💰 余额: ¥${r.data.budget_remaining_cny || "3.00"}`);
          apiKeyPreview = r.data.api_key || r.data.api_key_preview;
        } else if (r.data.claim_id) {
          out.push(`  ✅ 星火领取成功 ¥${r.data.value_cny || "3.00"}`);
          out.push(`  💰 余额: ¥${r.data.budget_remaining_cny || "3.00"}`);
          apiKeyPreview = r.data.api_key || r.data.api_key_preview;
          // 保存 claim_id 以便查完整 Key
          store.write(KEY_AK_CLAIM_ID, r.data.claim_id);
        }
        
        if (apiKeyPreview) {
          out.push(`  🔑 API Key: ${apiKeyPreview}`);
          // 尝试获取完整 API Key
          const claimId = store.read(KEY_AK_CLAIM_ID);
          if (claimId) {
            try {
              const detail = await api("GET", `${API}/llm/cyber-egg/claims/${claimId}`, null, token);
              if (detail?.code === 0 && detail?.data?.api_key) {
                const fullKey = detail.data.api_key;
                store.write(KEY_AK, fullKey);
                out.push(`  📋 完整 Key 已保存`);
                apiKeyPreview = fullKey.substring(0, 15) + "..." + fullKey.slice(-8);
              }
            } catch(e) {
              console.log(`[uumit] 获取完整 API Key 失败: ${e}`);
            }
          }
        }
        
        // 保存到期时间
        if (r.data.expires_at) {
          const expireDate = new Date(r.data.expires_at).toLocaleString("zh-CN");
          out.push(`  ⏰ 到期: ${expireDate}`);
        }
        sparkOK = true;
      } else {
        out.push(`  ❌ 星火领取失败: ${r?.message || "未知错误"}`);
      }
    } catch (e) {
      out.push(`  ❌ 星火异常: ${e.message || e}`);
    }

    // ─── 宝箱任务 ───
    out.push("\n🎁 宝箱任务");
    try {
      const r = await api("GET", `${API}/daily/box`, null, token);
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

    // ─── 免费额度 ───
    out.push("\n🥚 免费额度");
    try {
      const r = await api("GET", `${API}/llm/cyber-egg/today`, null, token);
      if (r?.code === 0 && r.data) {
        const status = r.data.claimed ? "✅ 已领" : "⬜ 待领取";
        out.push(`  ${status} ¥${r.data.value_cny || 0}`);
      }
    } catch(e) {
      console.log(`[uumit] 获取免费额度失败: ${e}`);
    }

    // ─── 钱包 ───
    out.push("\n💰 钱包");
    try {
      const r = await api("GET", `${API}/wallet`, null, token);
      if (r?.code === 0 && r.data?.ut) {
        out.push(`  余额: ${r.data.ut.balance || 0} UT`);
      }
      const s = await api("GET", `${API}/wallet/stats`, null, token);
      if (s?.code === 0 && s.data?.ut) {
        out.push(`  今日收入: +${s.data.ut.today_income || 0} UT`);
      }
    } catch(e) {
      console.log(`[uumit] 获取钱包信息失败: ${e}`);
    }

    out.push("\n═══════════════════════");
    console.log(out.join("\n"));

    // ─── 发送通知 ───
    const title = sparkOK || checkinOK ? "uumit 签到+星火成功" : "uumit 签到失败";
    
    let sub = "";
    if (checkinOK) sub += "✅签到 ";
    if (sparkOK) sub += "🔥星火 ";

    let body = "";
    const successLines = out.filter(l => l.includes("✅") || l.includes("🎉") || l.includes("💰") || l.includes("🔑") || l.includes("📊"));
    if (successLines.length > 0) {
      body = successLines.join("\n").substring(0, 200);
    }

    // 当天完整 API Key 追加到通知底部
    const fullKey = store.read(KEY_AK);
    const akDate = store.read(KEY_AK_DATE);
    if (fullKey && akDate === ds) {
      body += `\n🔑 ${fullKey.substring(0, 10)}...${fullKey.slice(-6)}`;
    }

    notify(title, sub, body || (sparkOK ? "星火已领取，API Key 已保存" : "请检查日志"));

    $done();
  })().catch(e => {
    console.log(`[uumit] 执行异常: ${e}`);
    notify("uumit 脚本错误", "", String(e));
    $done();
  });
}
