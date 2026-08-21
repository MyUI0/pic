const COOKIE_KEY = "linuxdo.cookie";
const args = typeof $argument === "object" && $argument ? $argument : {};
const notifyEnabled = String(args.captureNotify === undefined ? "true" : args.captureNotify).toLowerCase() !== "false";

function notify(title, subtitle, body) {
  if (notifyEnabled) $notification.post(title, subtitle || "", body || "");
}

function getHeader(headers, name) {
  if (!headers) return "";
  const target = name.toLowerCase();
  for (const key of Object.keys(headers)) {
    if (key.toLowerCase() === target) return headers[key];
  }
  return "";
}

try {
  const cookie = getHeader($request.headers, "Cookie");
  if (!cookie) {
    $done({});
  } else {
    const previous = $persistentStore.read(COOKIE_KEY) || "";
    const changed = previous !== cookie;
    $persistentStore.write(cookie, COOKIE_KEY);

    const match = cookie.match(/(?:^|;\s*)_t=([^;]+)/);
    if (match && match[1]) $persistentStore.write(match[1], "linuxdo.token");

    if (changed) {
      notify("Linux.do", "Cookie 已保存", "可以在 Loon 插件中手动运行一次“Linux.do 手动保活”进行测试。");
    }
    $done({});
  }
} catch (error) {
  notify("Linux.do", "Cookie 抓取失败", String(error));
  $done({});
}
