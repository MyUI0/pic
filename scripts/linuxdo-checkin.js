const BASE_URL = "https://linux.do";
const COOKIE_KEY = "linuxdo.cookie";
const DEFAULT_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";

const args = typeof $argument === "object" && $argument ? $argument : {};
const topicCount = clamp(parseInt(args.topicCount || "5", 10), 1, 10);
const readSeconds = clamp(parseInt(args.readSeconds || "30", 10), 5, 120);
const notifyEnabled = String(args.notify === undefined ? "true" : args.notify).toLowerCase() !== "false";

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}

function notify(subtitle, body) {
  if (notifyEnabled) {
    $notification.post("Linux.do 每日保活", subtitle || "", body || "", "https://linux.do/");
  }
}

function request(method, options) {
  return new Promise((resolve, reject) => {
    const client = $httpClient[method.toLowerCase()];
    client(options, (error, response, data) => {
      if (error) {
        reject(new Error(String(error)));
        return;
      }
      const status = Number((response && (response.status || response.statusCode)) || 0);
      resolve({ status, headers: (response && response.headers) || {}, data: data || "" });
    });
  });
}

function json(data, label) {
  try {
    return JSON.parse(data);
  } catch (_) {
    throw new Error(`${label}返回的不是有效 JSON`);
  }
}

function commonHeaders(cookie) {
  return {
    Accept: "application/json, text/javascript, */*; q=0.01",
    "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
    Cookie: cookie,
    Referer: `${BASE_URL}/`,
    "User-Agent": DEFAULT_UA,
    "X-Requested-With": "XMLHttpRequest"
  };
}

function shuffle(items) {
  const result = items.slice();
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function decodeHtml(text) {
  return String(text || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

async function getCurrentUser(cookie) {
  const response = await request("get", {
    url: `${BASE_URL}/session/current.json`,
    timeout: 15000,
    headers: commonHeaders(cookie),
    "auto-cookie": false
  });
  if (response.status !== 200) {
    throw new Error(`登录检查失败（HTTP ${response.status || "未知"}）`);
  }
  const data = json(response.data, "登录检查");
  const user = data.current_user;
  if (!user || !user.username) {
    throw new Error("Cookie 已失效，请在 Safari 中重新登录 linux.do 并访问一次首页");
  }
  return user;
}

async function getCsrf(cookie) {
  const response = await request("get", {
    url: `${BASE_URL}/session/csrf`,
    timeout: 15000,
    headers: commonHeaders(cookie),
    "auto-cookie": false
  });
  if (response.status !== 200) throw new Error(`获取 CSRF 失败（HTTP ${response.status}）`);
  const data = json(response.data, "CSRF 接口");
  if (!data.csrf) throw new Error("CSRF Token 为空");
  return data.csrf;
}

async function getLatestTopics(cookie) {
  const response = await request("get", {
    url: `${BASE_URL}/latest.json?order=default`,
    timeout: 20000,
    headers: commonHeaders(cookie),
    "auto-cookie": false
  });
  if (response.status !== 200) throw new Error(`获取主题列表失败（HTTP ${response.status}）`);
  const data = json(response.data, "主题列表");
  const topics = data.topic_list && data.topic_list.topics;
  if (!Array.isArray(topics) || topics.length === 0) throw new Error("主题列表为空");
  return topics.filter((topic) => topic && topic.id && !topic.archived);
}

async function visitTopic(cookie, csrf, topic) {
  const slug = topic.slug || "topic";
  const url = `${BASE_URL}/t/${encodeURIComponent(slug)}/${topic.id}.json?track_visit=true&forceLoad=true`;
  const response = await request("get", {
    url,
    timeout: 20000,
    headers: commonHeaders(cookie),
    "auto-cookie": false
  });
  if (response.status !== 200) throw new Error(`读取主题 ${topic.id} 失败（HTTP ${response.status}）`);

  const detail = json(response.data, `主题 ${topic.id}`);
  const posts = detail.post_stream && detail.post_stream.posts;
  const postNumbers = Array.isArray(posts)
    ? posts.map((post) => Number(post.post_number)).filter((number) => number > 0).slice(0, 8)
    : [1];
  const effectivePosts = postNumbers.length ? postNumbers : [1];
  const totalMs = readSeconds * 1000;
  const perPostMs = Math.max(1000, Math.floor(totalMs / effectivePosts.length));
  const timings = {};
  effectivePosts.forEach((number) => { timings[String(number)] = perPostMs; });

  const timingResponse = await request("post", {
    url: `${BASE_URL}/topics/timings`,
    timeout: 15000,
    headers: Object.assign(commonHeaders(cookie), {
      "Content-Type": "application/json; charset=UTF-8",
      Origin: BASE_URL,
      "X-CSRF-Token": csrf
    }),
    body: JSON.stringify({
      topic_id: Number(topic.id),
      topic_time: totalMs,
      timings
    }),
    "auto-cookie": false
  });
  if (timingResponse.status < 200 || timingResponse.status >= 300) {
    throw new Error(`主题 ${topic.id} 阅读计时上报失败（HTTP ${timingResponse.status}）`);
  }

  return decodeHtml(topic.title || detail.title || `主题 ${topic.id}`);
}

async function getConnectSummary(cookie) {
  try {
    const response = await request("get", {
      url: "https://connect.linux.do/",
      timeout: 15000,
      headers: {
        Accept: "text/html,application/xhtml+xml",
        Cookie: cookie,
        "User-Agent": DEFAULT_UA
      },
      "auto-cookie": false
    });
    if (response.status !== 200) return "";

    const rows = [];
    const rowPattern = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    let rowMatch;
    while ((rowMatch = rowPattern.exec(response.data)) && rows.length < 4) {
      const cells = [];
      const cellPattern = /<td[^>]*>([\s\S]*?)<\/td>/gi;
      let cellMatch;
      while ((cellMatch = cellPattern.exec(rowMatch[1]))) cells.push(decodeHtml(cellMatch[1]));
      if (cells.length >= 3) rows.push(`${cells[0]} ${cells[1]}/${cells[2]}`);
    }
    return rows.join("；");
  } catch (_) {
    return "";
  }
}

async function main() {
  const cookie = $persistentStore.read(COOKIE_KEY) || "";
  if (!cookie) {
    throw new Error("尚未抓取 Cookie：请启用插件与 MitM，然后在 Safari 登录 linux.do 并访问一次首页");
  }

  const user = await getCurrentUser(cookie);
  const csrf = await getCsrf(cookie);
  const topics = shuffle(await getLatestTopics(cookie)).slice(0, topicCount);
  const successes = [];
  const failures = [];

  for (const topic of topics) {
    try {
      const title = await visitTopic(cookie, csrf, topic);
      successes.push(title);
    } catch (error) {
      failures.push(String(error.message || error));
    }
    await sleep(800 + Math.floor(Math.random() * 1200));
  }

  const connect = await getConnectSummary(cookie);
  const lines = [
    `账号：${user.username}`,
    `主题：成功 ${successes.length}/${topics.length}`
  ];
  if (connect) lines.push(`Connect：${connect}`);
  if (failures.length) lines.push(`异常：${failures[0]}`);

  if (successes.length === 0) throw new Error(lines.join("\n"));
  notify(failures.length ? "部分完成" : "执行成功", lines.join("\n"));
  console.log(`[Linux.do] ${lines.join(" | ")}`);
}

main()
  .catch((error) => {
    const message = String(error && (error.message || error));
    console.log(`[Linux.do] ${message}`);
    notify("执行失败", message);
  })
  .finally(() => $done());
