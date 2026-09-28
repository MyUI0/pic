// Loon request script: credentials stay in local persistent storage.
(() => {
  try {
    const headers = $request.headers || {};
    const h = Object.keys(headers).find(k => k.toLowerCase() === 'cookie');
    const cookie = h ? headers[h] : '';
    if (!cookie || typeof cookie !== 'string') return;
    const pairs = {};
    cookie.split(';').forEach(part => {
      const i = part.indexOf('=');
      if (i > 0) pairs[part.slice(0, i).trim()] = part.slice(i + 1).trim();
    });
    const key = "JD_COOKIE";
    if (!key) return;
    const valid = key === 'JD_COOKIE' ? (pairs.pt_key && pairs.pt_pin)
      : key === 'JDJR_COOKIE' ? (pairs.cookie2 || pairs.pt_key || pairs.pwd)
      : (pairs.cookie2 || pairs.sgcookie || pairs._m_h5_tk);
    if (!valid || $persistentStore.read(key) === cookie) return;
    const ok = $persistentStore.write(cookie, key);
    $notification.post('Loon Cookie', ok ? '已更新' : '保存失败', key + '：' + (ok ? '仅保存在本机；请手动测试任务。' : '请检查本地存储。'));
  } catch (_) {
    console.log('Cookie 处理异常，原请求继续');
  } finally {
    $done({});
  }
})();
