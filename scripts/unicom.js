/*
 * 中国联通 Surge 签到脚本 (unicom.js)
 * ---------------------------------------------------------------
 * 由「中国联通 Python 版 v1.1.1」移植，运行于 Surge type=cron 环境。
 * 功能：
 *   1. Token#AppId 登录（onLine），支持多账号（& 或换行分隔）
 *   2. 资产查询（话费余额 / 实时话费 / 套餐详情）
 *   3. 首页签到（每日签到 / 月签有礼 / 任务中心 / 话费红包）
 * 说明：Python 版中的账号密码登录已失效、且需要 RSA，本脚本只支持
 *      Token#AppId 模式（从联通 App 抓包获取）。
 *
 * 参数 $argument：管道符分隔 token|cronexp|mode（兼容 JSON 数组/裸 token）
 *   token    ：Token#AppId，多账号用 & 或换行分隔（例如：abc#7E3...&def#7E3...）
 *   cronexp  ：cron 表达式（仅用于面板展示/日志）
 *   mode     ：daily（默认，登录+资产+签到） / query（仅查询资产与签到状态）
 */

const SCRIPT_VERSION = "1.1.4-loon";
const UA = "Dalvik/2.1.0 (Linux; U; Android 12; Mi 10 Pro MIUI/21.11.3);unicom{version:android@11.0802}";
const MARKET_UA = UA;
const STORE_KEY = "china_unicom_token_appid";

// ---------------------------------------------------------------
// Loon 抓包保存 Token#AppId
// ---------------------------------------------------------------
function notify(title, subtitle, body) {
  try { $notification.post(title, subtitle || "", body || ""); } catch (_) {}
}

function storeRead(key) {
  try {
    if (typeof $persistentStore !== "undefined") return $persistentStore.read(key) || "";
  } catch (_) {}
  return "";
}

function storeWrite(value, key) {
  try {
    if (typeof $persistentStore !== "undefined") return $persistentStore.write(value, key);
  } catch (_) {}
  return false;
}

function parseFormBody(body) {
  const out = {};
  String(body || "").split("&").forEach((pair) => {
    if (!pair) return;
    const idx = pair.indexOf("=");
    const k = idx >= 0 ? pair.slice(0, idx) : pair;
    const v = idx >= 0 ? pair.slice(idx + 1) : "";
    try { out[decodeURIComponent(k)] = decodeURIComponent(String(v).replace(/\+/g, " ")); }
    catch (_) { out[k] = v; }
  });
  return out;
}

function parseKVFromText(text) {
  const out = {};
  const s = String(text || "");
  // form/query: a=b&c=d
  Object.assign(out, parseFormBody(s.replace(/^\?/, "")));
  // Cookie: a=b; c=d
  s.split(";").forEach((pair) => {
    const idx = pair.indexOf("=");
    if (idx < 0) return;
    const k = pair.slice(0, idx).trim();
    const v = pair.slice(idx + 1).trim();
    if (k && !(k in out)) out[k] = v;
  });
  return out;
}

function getUrlQuery(url) {
  const i = String(url || "").indexOf("?");
  return i >= 0 ? String(url).slice(i + 1) : "";
}

function captureTokenIfNeeded() {
  if (typeof $request === "undefined") return false;
  const url = String($request.url || "");
  // 只处理联通主域名，放宽路径，避免 App 没触发 onLine.htm 时完全抓不到
  if (!/^https?:\/\/m\.client\.10010\.com\//i.test(url)) return false;

  const headers = $request.headers || {};
  const cookie = headers.Cookie || headers.cookie || "";
  const body = $request.body || "";
  const merged = Object.assign(
    {},
    parseKVFromText(getUrlQuery(url)),
    parseKVFromText(cookie),
    parseKVFromText(body)
  );

  const token = merged.token_online || merged.tokenOnline || merged.TOKEN_ONLINE || "";
  const appId = merged.appId || merged.appid || merged.APPID || "";

  if (token && appId) {
    const tokenPair = `${token}#${appId}`;
    const old = storeRead(STORE_KEY);
    const ok = storeWrite(tokenPair, STORE_KEY);
    const masked = maskStr(token) + "#" + maskStr(appId);
    if (ok && old !== tokenPair) notify("中国联通", "Token#AppId 已更新", masked);
    else if (ok) notify("中国联通", "Token#AppId 已存在", masked);
    else notify("中国联通", "Token#AppId 保存失败", "请检查 Loon 持久化存储权限");
  } else {
    // 放宽匹配后会进来很多请求，没 token 的请求静默跳过，避免通知刷屏
    console.log(`[Capture Skip] ${url} 未发现 token_online/appId`);
  }
  try { $done({}); } catch (_) { $done(); }
  return true;
}

// ---------------------------------------------------------------
// 工具函数
// ---------------------------------------------------------------
function randomString(len, chars) {
  const c = chars || "abcdefghijklmnopqrstuvwxyz0123456789";
  let s = "";
  for (let i = 0; i < len; i++) s += c.charAt(Math.floor(Math.random() * c.length));
  return s;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function maskStr(s) {
  s = String(s || "");
  if (s.length === 11 && /^\d{11}$/.test(s)) return s.slice(0, 3) + "****" + s.slice(7);
  if (s.startsWith("enc_")) return s;
  if (s.length > 11) return s.slice(0, 6) + "******" + s.slice(-6);
  return s;
}

function parseArgs() {
  // 与 Heaizo 示例保持一致：cron 不依赖 argument，直接读取 http-request 抓包保存的凭证
  let token = storeRead(STORE_KEY);
  let mode = "daily";
  let cronexp = "";

  // 兼容手动运行或旧版插件传入 argument 的情况；Loon cron 通常没有 $argument
  try {
    if (typeof $argument !== "undefined" && $argument !== null) {
      const raw = String($argument || "").trim();
      if (raw) {
        if (raw.includes("|")) {
          const parts = raw.split("|");
          const argToken = (parts[0] || "").trim();
          const argCron = (parts[1] || "").trim();
          const argMode = (parts[2] || "").trim().toLowerCase();
          if (argToken && argToken !== "placeholder" && !/^\{arg\d+\}$/.test(argToken)) token = argToken;
          if (argCron && !/^\{arg\d+\}$/.test(argCron)) cronexp = argCron;
          if (/^(daily|query)$/.test(argMode)) mode = argMode;
        } else if (raw !== "placeholder" && !/^\{arg\d+\}$/.test(raw)) {
          token = raw;
        }
      }
    }
  } catch (e) {
    console.log(`[Parse Args Ignore] ${e && e.message ? e.message : e}`);
  }

  return { token: token || "", cronexp, mode };
}

function parseAccounts(tokenStr) {
  const accounts = [];
  for (const part of String(tokenStr || "").split(/[&\n]/)) {
    const cfg = part.trim();
    if (!cfg) continue;
    const [token, appId] = cfg.split("#");
    accounts.push({ token: token.trim(), appId: (appId || "").trim() });
  }
  return accounts;
}

// ---------------------------------------------------------------
// 用户服务（对应 Python UserService）
// ---------------------------------------------------------------
class UserService {
  constructor(index, token_online, appId) {
    this.index = index;
    this.token_online = token_online;
    this.appId = appId || "";
    this.account_mobile = "";
    this.mobile = "";
    this.ecs_token = "";
    this.t3_token = "";
    this.private_token = "";
    this.city_info = [];
    this.notify_logs = [];
    this.sign_initial_amount = 0;

    // 设备 ID（每次运行随机生成，对应 Python 的 uuid / unicomTokenId / tokenId_cookie）
    this.uuid = randomString(32, "0123456789abcdef");
    this.unicomTokenId = randomString(32);
    this.tokenId_cookie = "chinaunicom-" + randomString(32, "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789");
    this.cookie_string =
      "TOKENID_COOKIE=" + this.tokenId_cookie +
      "; UNICOM_TOKENID=" + this.unicomTokenId +
      "; sdkuuid=" + this.unicomTokenId;
  }

  log(msg, notify = false) {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    console.log(`[${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}] 账号[${this.index}]${msg}`);
    if (notify) this.notify_logs.push(String(msg));
  }

  cookieHeader(extra) {
    const parts = [this.cookie_string, `token_online=${this.token_online}`];
    if (this.appId) parts.push(`appId=${this.appId}`);
    if (extra) parts.push(extra);
    return parts.join("; ");
  }

  // 对应 Python UserService.request：自动带上 Cookie，JSON 解析失败返回 null
  request(method, url, opts = {}) {
    const headers = Object.assign({ "User-Agent": UA }, opts.headers || {});
    if (!headers["Cookie"]) headers["Cookie"] = this.cookieHeader();

    let finalUrl = url;
    if (opts.params) {
      const qs = Object.keys(opts.params)
        .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(opts.params[k])}`)
        .join("&");
      finalUrl += (url.includes("?") ? "&" : "?") + qs;
    }

    let body = null;
    if (opts.data) {
      body = Object.keys(opts.data)
        .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(opts.data[k])}`)
        .join("&");
    }

    const opt = {
      url: finalUrl,
      method: method.toUpperCase(),
      headers,
      timeout: opts.timeout || 15000,
    };
    if (body !== null) {
      opt.headers["Content-Type"] = "application/x-www-form-urlencoded";
      opt.body = body;
    }

    return new Promise((resolve) => {
      const cb = (error, response, raw) => {
        if (error || !response) {
          this.log(`请求 ${finalUrl} 异常: ${error || "no response"}`);
          resolve(null);
          return;
        }
        try {
          resolve(JSON.parse(raw));
        } catch (e) {
          resolve(null);
        }
      };

      try {
        if (typeof $httpClient.request === "function") {
          $httpClient.request(opt, cb);
        } else if (opt.method === "GET" && typeof $httpClient.get === "function") {
          $httpClient.get(opt, cb);
        } else if (opt.method === "POST" && typeof $httpClient.post === "function") {
          $httpClient.post(opt, cb);
        } else {
          this.log("当前环境不支持 $httpClient.request/get/post");
          resolve(null);
        }
      } catch (e) {
        this.log(`请求 ${finalUrl} 异常: ${e && e.message ? e.message : e}`);
        resolve(null);
      }
    });
  }

  // ---------------------------------------------------------
  // 登录
  // ---------------------------------------------------------
  async onLine() {
    if (!this.token_online) {
      this.log("❌ 缺少 token_online，无法执行 onLine");
      return false;
    }
    const url = "https://m.client.10010.com/mobileService/onLine.htm";
    const data = {
      isFirstInstall: "1",
      netWay: "Wifi",
      version: "android@11.0000",
      token_online: this.token_online,
      provinceChanel: "general",
      deviceModel: "ALN-AL10",
      step: "dingshi",
      androidId: "291a7deb1d716b5a",
      reqtime: String(Date.now()),
    };
    if (this.appId) data.appId = this.appId;

    const res = await this.request("post", url, { data });
    if (!res) return false;
    const code = res.code;
    if (code === "0" || code === 0) {
      const desmobile = res.desmobile || "";
      if (desmobile.length === 11 && /^\d{11}$/.test(desmobile)) {
        this.account_mobile = desmobile;
        this.mobile = desmobile;
      }
      this.log("登录成功");
      this.city_info = res.list || [];
      this.ecs_token = res.ecs_token;
      this.t3_token = res.t3_token || "";
      this.private_token = res.private_token || "";
      return true;
    }
    this.log(`登录失败[${code}]: ${res.msg || ""}`);
    return false;
  }

  // ---------------------------------------------------------
  // 资产查询
  // ---------------------------------------------------------
  async queryRemain() {
    if (!this.ecs_token) {
      if (!(await this.onLine())) {
        this.log("❌ 无法获取 ecs_token，跳过查询");
        return;
      }
    }
    this.log("==== 资产查询 ====");
    this.log("正在查询套餐余量...");
    const url = "https://m.client.10010.com/servicequerybusiness/balancenew/accountBalancenew.htm";
    const res = await this.request("get", url, {
      headers: { "User-Agent": MARKET_UA, "Cookie": `ecs_token=${this.ecs_token}` },
    });
    if (!res) return;
    if (res.code === "0000") {
      const current_balance = res.cuntbalancecust != null ? String(res.cuntbalancecust) : "0.00";
      const real_time_fee = res.realfeecust != null ? String(res.realfeecust) : "0.00";
      this.log(`💰 [资产-话费] 当前余额: ${current_balance}元, 实时话费: ${real_time_fee}元`, true);
      const pkg_list = res.realTimeFeeSpecialFlagThree || [];
      if (Array.isArray(pkg_list) && pkg_list.length) {
        this.log("📋 [套餐详情]:", true);
        for (const item of pkg_list) {
          const sub_items = item.subItems || [];
          for (const sub of sub_items) {
            const bill = sub.bill || {};
            if (bill) {
              const name = bill.integrateitem || "未知项";
              const fee = bill.realfee != null ? bill.realfee : "0.00";
              this.log(`   - ${name}: ${fee}元`, true);
            }
          }
        }
      }
    } else {
      this.log(`套餐余量查询失败: ${res.desc || res.msg || "未知错误"}`);
    }
  }

  // ---------------------------------------------------------
  // 首页签到
  // ---------------------------------------------------------
  async gettaskip() {
    const orderId = randomString(32).toUpperCase();
    try {
      const url = "https://m.client.10010.com/taskcallback/topstories/gettaskip";
      await this.request("post", url, { data: { mobile: this.account_mobile, orderId } });
    } catch (e) { /* ignore */ }
    return orderId;
  }

  async sign_getContinuous(is_query_only = false) {
    const url = "https://activity.10010.com/sixPalaceGridTuntableLottery/signin/getContinuous";
    const res = await this.request("get", url, { params: { taskId: "", channel: "wode", imei: this.uuid } });
    if (!res) return;
    const code = res.code;
    if (code === "0000") {
      const todayIsSignIn = (res.data || {}).todayIsSignIn || "n";
      this.log(`签到区今天${todayIsSignIn === "y" ? "已" : "未"}签到`, true);
      if (todayIsSignIn === "y") {
        // 已签到，跳过
      } else if (!is_query_only) {
        await sleep(1000);
        await this.sign_daySign();
      } else {
        this.log("签到区: [查询模式] 跳过自动打卡");
      }
    } else {
      this.log(`签到区查询签到状态失败[${code}]: ${res.desc || ""}`);
    }
  }

  async sign_daySign() {
    const url = "https://activity.10010.com/sixPalaceGridTuntableLottery/signin/daySign";
    const res = await this.request("post", url, { data: {} });
    if (!res) return;
    const code = res.code;
    if (code === "0000") {
      const d = res.data || {};
      this.log(`签到区签到成功: [${d.statusDesc || ""}]${d.redSignMessage || ""}`);
    } else if (code === "0002" && String(res.desc || "").includes("已经签到")) {
      this.log("签到区签到成功: 今日已完成签到！");
    } else {
      this.log(`签到区签到失败[${code}]: ${res.desc || ""}`);
    }
  }

  async sign_getTelephone(is_initial = false, silent = false) {
    const url = "https://act.10010.com/SigninApp/convert/getTelephone";
    const res = await this.request("post", url, { data: {} });
    if (!res) return null;
    const status = res.status;
    if (status === "0000" && res.data) {
      const current_amount = parseFloat(res.data.telephone || 0) || 0;
      if (silent) return current_amount;
      if (is_initial) {
        this.sign_initial_amount = current_amount;
        this.log(`签到区-话费红包: 运行前总额 ${current_amount.toFixed(2)}元`);
      } else {
        if (typeof this.sign_initial_amount === "number" && this.sign_initial_amount > 0) {
          const increase = current_amount - this.sign_initial_amount;
          this.log(`签到区-话费红包: 本次运行增加 ${increase.toFixed(2)}元`, true);
        }
        let msg = `签到区-话费红包: 总额 ${current_amount.toFixed(2)}元`;
        const exp_num = parseFloat(res.data.needexpNumber || 0) || 0;
        if (exp_num > 0) {
          msg += `，其中 ${res.data.needexpNumber}元 将于 ${res.data.month || ""}月底到期`;
        }
        this.log(msg, true);
      }
      return current_amount;
    }
    if (!silent) this.log(`签到区查询话费红包失败[${status}]: ${res.msg || ""}`);
    return null;
  }

  async sign_getTaskList() {
    const url = "https://activity.10010.com/sixPalaceGridTuntableLottery/task/taskList";
    const headers = { "Referer": "https://img.client.10010.com/" };
    for (let i = 0; i < 30; i++) {
      const res = await this.request("get", url, { params: { type: "2" }, headers, timeout: 10000 });
      if (!res) return;
      const code = res.code;
      if (code === "0329" || String(res.desc || "").includes("火爆")) {
        this.log("签到区: 系统繁忙(0329)，停止后续尝试");
        break;
      }
      if (code !== "0000") {
        this.log(`签到区-任务中心: 获取任务列表失败[${code}]: ${res.desc || ""}`);
        return;
      }
      const d = res.data || {};
      const tag_list = d.tagList || [];
      const task_list = d.taskList || [];
      let all_tasks = task_list.slice();
      for (const tag of tag_list) {
        all_tasks = all_tasks.concat(tag.taskDTOList || []);
      }
      all_tasks = all_tasks.filter((t) => t);
      if (!all_tasks.length) {
        if (i === 0) this.log("签到区-任务中心: 当前无任何任务。");
        break;
      }
      const do_task = all_tasks.find((t) => String(t.taskState) === "1" && String(t.taskType) === "5");
      if (do_task) {
        this.log(`签到区-任务中心: 开始执行任务 [${do_task.taskName}]`);
        await this.sign_doTaskFromList(do_task);
        await sleep(3000);
        continue;
      }
      const claim_task = all_tasks.find((t) => String(t.taskState) === "0");
      if (claim_task) {
        this.log(`签到区-任务中心: 发现可领取奖励的任务 [${claim_task.taskName}]`);
        await this.sign_getTaskReward(claim_task.id);
        await sleep(2000);
        continue;
      }
      if (i === 0) this.log("签到区-任务中心: 没有可执行或可领取的任务。");
      else this.log("签到区-任务中心: 所有任务处理完毕。");
      break;
    }
  }

  async sign_doTaskFromList(task) {
    if (task.url && task.url !== "1" && String(task.url).startsWith("http")) {
      await this.request("get", task.url, { headers: { "Referer": "https://img.client.10010.com/" } });
      this.log(`签到区-任务中心: 浏览页面 [${task.taskName}]`);
      await sleep(5000 + Math.floor(Math.random() * 2000)); // 5~7 秒
    }
    const orderId = await this.gettaskip();
    const url = "https://activity.10010.com/sixPalaceGridTuntableLottery/task/completeTask";
    const res = await this.request("get", url, { params: { taskId: task.id, orderId, systemCode: "QDQD" } });
    if (!res) return;
    const code = res.code;
    if (code === "0000") {
      this.log(`签到区-任务中心: ✅ 任务 [${task.taskName}] 已完成`);
    } else {
      this.log(`签到区-任务中心: ❌ 任务 [${task.taskName}] 完成失败[${code}]: ${res.desc || "未知错误"}`);
    }
  }

  async sign_getTaskReward(task_id) {
    const url = "https://activity.10010.com/sixPalaceGridTuntableLottery/task/getTaskReward";
    const res = await this.request("get", url, { params: { taskId: task_id } });
    if (!res) return;
    const code = res.code;
    if (code === "0000") {
      const d = res.data || {};
      if (d.code === "0000") {
        this.log(`签到区-领取奖励: [${d.prizeName || ""}] ${d.prizeNameRed || ""}`);
      } else {
        this.log(`签到区-领取奖励失败[${d.code}]: ${res.desc || d.desc || ""}`);
      }
    } else {
      this.log(`签到区-领取奖励失败[${code}]: ${res.desc || ""}`);
    }
  }

  async sign_month_sign_gift(is_query_only = false) {
    const url = "https://activity.10010.com/sixPalaceGridTuntableLottery/floor/getMonthSign";
    const res = await this.request("get", url, { headers: { "Referer": "https://img.client.10010.com/" }, timeout: 10000 });
    if (!res) return;
    const code = res.code;
    if (code !== "0000") {
      this.log(`签到区-月签有礼: 查询失败[${code}]: ${res.desc || ""}`);
      return;
    }
    const task_list = (res.data || {}).taskList || [];
    if (!task_list.length) {
      this.log("签到区-月签有礼: 暂无月签任务");
      return;
    }
    const claim_tasks = task_list.filter((t) => String(t.taskStatus) === "1" && t.taskId && t.id);
    const claimed_count = task_list.filter((t) => String(t.taskStatus) === "2").length;
    if (is_query_only) {
      this.log(`签到区-月签有礼: 可领取 ${claim_tasks.length} 个，已领取 ${claimed_count} 个`);
      return;
    }
    if (!claim_tasks.length) {
      this.log(`签到区-月签有礼: 暂无可领取奖励，已领取 ${claimed_count}/${task_list.length}`);
      return;
    }
    for (const task of claim_tasks) {
      await this.sign_get_month_sign_reward(task);
      await sleep(1000);
    }
  }

  async sign_get_month_sign_reward(task) {
    const task_name = task.taskName || "月签奖励";
    const url = "https://activity.10010.com/sixPalaceGridTuntableLottery/task/getTaskReward";
    const res = await this.request("get", url, {
      params: { taskId: task.taskId, taskType: "30", id: task.id },
      headers: { "Referer": "https://img.client.10010.com/" },
      timeout: 10000,
    });
    if (!res) return;
    const code = res.code;
    const d = res.data || {};
    if (code === "0000" && d.code === "0000") {
      const prize_name = d.prizeName || "";
      const prize_red = d.prizeNameRed || "";
      const reward = prize_name || prize_red ? `[${prize_name}] ${prize_red}`.trim() : d.statusDesc || "领取成功";
      this.log(`签到区-月签有礼: [${task_name}] ${reward}`, true);
      return;
    }
    const msg = d.desc || res.desc || res.msg || "未知错误";
    this.log(`签到区-月签有礼: [${task_name}] 领取失败[${d.code || code}]: ${msg}`);
  }

  async sign_query_my_prizes() {
    this.log("正在查询账户明细 (抢兑)...");
    const url = "https://act.10010.com/SigninApp/convert/phoneDetails";
    const res = await this.request("post", url, {
      data: { log_type: "1", number: "1", list_num: "" },
      headers: { "Origin": "https://img.client.10010.com" },
    });
    if (!res) return;
    if (res.status === "0000") {
      const data = (res.data || {}).detailedBO || [];
      if (Array.isArray(data) && data.length) {
        let logged_count = 0;
        for (const item of data) {
          if (logged_count >= 5) break;
          const remark = item.remark || "";
          const buss_name = item.from_bussname || "";
          if (String(remark).includes("兑换") || String(buss_name).includes("兑换")) {
            if (logged_count === 0) this.log("📋 [账户明细] 最近 5 条记录:", true);
            const order_time = item.order_time || "";
            const amount = item.booksNumber || item.books_number || "0";
            this.log(`  🎁 [抢兑] ${order_time} | ${remark} (变动:${amount})`, true);
            logged_count += 1;
          }
        }
        if (logged_count === 0) this.log("[账户明细] 暂无兑换记录");
      } else {
        this.log("[账户明细] 暂无兑换记录");
      }
    } else {
      this.log(`[账户明细] 查询异常: ${res.msg || "Result Error"}`);
    }
  }

  // ---------------------------------------------------------
  // 签到区主流程（对应 Python sign_task_main，抢话费券未移植）
  // ---------------------------------------------------------
  async sign_task_main() {
    this.log("==== 签到区 ====");
    await this.sign_getTelephone(true);
    await this.sign_getContinuous(false);
    await this.sign_month_sign_gift();
    await this.sign_getTaskList();
    await this.sign_getTelephone();
    await this.sign_query_my_prizes();
  }

  // ---------------------------------------------------------
  // 运行入口（对应 Python ensure_login + execute_daily_tasks，仅保留 资产+首页签到）
  // ---------------------------------------------------------
  async run(query_only) {
    if (!(await this.onLine())) {
      this.log("登录流程失败，跳过该账号");
      return;
    }
    if (query_only) {
      this.log("📋 [查询模式] 仅查询资产，跳过任务执行", true);
      await this.queryRemain();
      await this.sign_getContinuous(true);
      await this.sign_month_sign_gift(true);
      await this.sign_getTelephone();
      await this.sign_query_my_prizes();
      return;
    }
    await this.queryRemain();
    await this.sign_task_main();
  }
}

// ---------------------------------------------------------------
// 主流程
// ---------------------------------------------------------------
async function main() {
  console.log(`[Script Start] 中国联通 Surge ${SCRIPT_VERSION}`);
  const args = parseArgs();
  const accounts = parseAccounts(args.token);
  if (!accounts.length || accounts.every(a => !a.token || a.token === "placeholder")) {
    $notification.post("中国联通", "⚠️ 未配置账号", "请先打开自动抓包开关，然后进入中国联通 App 触发一次登录/刷新，看到 Token#AppId 已更新后再执行签到");
    $done();
    return;
  }
  console.log(`发现 ${accounts.length} 个账号, mode=${args.mode}, cronexp=${args.cronexp || "-"}`);
  const query_only = args.mode === "query";

  const allNotify = [];
  for (let i = 0; i < accounts.length; i++) {
    const acc = accounts[i];
    console.log(`\n🔄 正在初始化账号[${i + 1}]...`);
    const svc = new UserService(i + 1, acc.token, acc.appId);
    if (svc.appId) console.log(`账号[${i + 1}] 识别到 Token#AppId 模式，AppId: ${svc.appId}`);
    await svc.run(query_only);

    if (svc.notify_logs.length) {
      const phone = maskStr(svc.account_mobile || svc.mobile);
      allNotify.push(`【账号${i + 1}】${phone}`);
      allNotify.push(...svc.notify_logs);
      allNotify.push("");
    }
    if (i < accounts.length - 1) await sleep(2000);
  }

  if (allNotify.length) {
    $notification.post("中国联通", `共 ${accounts.length} 个账号`, allNotify.join("\n"));
  }
  console.log("\n[Script End]");
  $done();
}

// Loon http-request 抓包入口：只负责保存 Token#AppId，不执行签到流程
if (typeof $request !== "undefined") {
   // http-request context
   if (captureTokenIfNeeded()) {
      // captureTokenIfNeeded already called $done()
   } else {
      // not a token request, just end
      try { $done({}); } catch (_) { $done(); }
   }
} else {
   // cron context
   main().catch((e) => {
      console.log(`[Fatal] ${e && e.stack ? e.stack : e}`);
      try { $notification.post("中国联通", "脚本异常", String(e)); } catch (_) {}
      $done();
   });
}
