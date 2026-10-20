/* Heaizo automatic Telegram-signature login + check-in. Loon 3.2.4(787)+.
 * Credentials stay in local storage only. A captured signature is NOT perpetual.
 * Capture a SUCCESSFUL login response, preserve its request body byte-for-byte.
 */
(function () {
  'use strict';
  var BASE = 'https://chatclient.heaizo.com', PATH = '/user/login/fast/login';
  var KEY = 'heaizo_login_v3', finished = false;
  function end() { if (!finished) { finished = true; $done(); } }
  function notify(title, message) { $notification.post('Heaizo自动登录签到', title, message); }
  function parse(s) { try { return JSON.parse(s); } catch (_) { return null; } }
  function text(s) { return typeof s === 'string' && !/[\r\n]/.test(s) ? s : ''; }
  function status(r) { return Number(r && (r.status || r.statusCode)); }
  function ok(r) { return status(r) >= 200 && status(r) < 300; }
  function normalize(h) {
    var out = {};
    Object.keys(h || {}).forEach(function (k) { out[k.toLowerCase()] = text(h[k]); });
    return out;
  }
  function bodyValid(b) {
    return b && typeof b === 'object' && !Array.isArray(b) && text(b.accessToken) &&
      (typeof b.platId === 'string' || typeof b.platId === 'number') &&
      /^[A-Za-z0-9_-]+$/.test(String(b.platId));
  }
  function valid(s) {
    var b = s && parse(s.rawBody);
    return s && s.version === 3 && bodyValid(b) && String(b.platId) === s.platId &&
      s.headers && typeof s.headers === 'object' && typeof s.capturedAt === 'number';
  }
  function capture() {
    if (!/^https:\/\/chatclient\.heaizo\.com\/user\/login\/fast\/login(?:\?[^#]*)?$/.test($request.url || '') ||
        String($request.method).toUpperCase() !== 'POST' || typeof $response === 'undefined' || !ok($response)) return;
    var result = parse($response.body), b = parse($request.body), h = normalize($request.headers);
    if (!result || result.code !== 1 || !result.data || !text(result.data.token) || !bodyValid(b)) return;
    var plat = String(b.platId);
    if (h.platid && h.platid !== plat) return;
    if (h.origin && h.origin !== BASE) return;
    if (h.referer && !/^https:\/\/chatclient\.heaizo\.com\//.test(h.referer)) return;
    var captured = {};
    ['accept','accept-language','content-type','origin','referer','user-agent','cookie',
      'sec-fetch-dest','sec-fetch-mode','sec-fetch-site'].forEach(function (k) { if (h[k]) captured[k] = h[k]; });
    var snapshot = {version:3, rawBody:$request.body, platId:plat, headers:captured,
      token:result.data.token, capturedAt:Date.now(), blocked:false, retryAfter:0};
    // Never merge with old-account cookies, tokens, or legacy partial payloads.
    if (!$persistentStore.write(JSON.stringify(snapshot), KEY)) {
      notify('保存失败', '请检查 Loon 本地存储后重新从 Telegram 打开。'); return;
    }
    notify('自动登录凭证已更新', '已保存成功登录的完整请求；签名被拒绝时仍需从 Telegram 重新打开。');
  }
  try {
    if (typeof $request !== 'undefined') {
      try { capture(); } catch (_) { notify('捕获失败', '请重新从 Telegram 打开并完成登录。'); }
      end(); return;
    }
    var original = $persistentStore.read(KEY), session = parse(original);
    if (!valid(session)) {
      notify('需要重新捕获登录', '请启用捕获，从 Telegram 重新打开 Heaizo 并完成登录；旧版部分字段/仅 Token 配置不混合迁移。');
      end(); return;
    }
    if (session.blocked) {
      notify('登录签名已被拒绝', '已停止重复登录，请从 Telegram 重新打开并捕获成功登录。'); end(); return;
    }
    if (session.retryAfter > Date.now()) { notify('暂缓登录', '上次请求未确认，冷却期内不重复请求。'); end(); return; }
    function current() { return $persistentStore.read(KEY) === original; }
    function save() {
      if (!current()) return false;
      var next = JSON.stringify(session);
      if (!$persistentStore.write(next, KEY)) return false;
      original = next; return true;
    }
    function headers(sign) {
      var h = normalize(session.headers);
      h.accept = h.accept || 'application/json, text/plain, */*';
      h.origin = h.origin || BASE;
      h.referer = h.referer || BASE + '/NewHome?platId=' + encodeURIComponent(session.platId);
      h.platid = session.platId; h['x-timestamp'] = String(Date.now());
      if (sign) { delete h['content-type']; h.token = session.token; }
      else h['content-type'] = h['content-type'] || 'application/json;charset=UTF-8';
      return h;
    }
    function rejection(r, res) {
      return status(r) === 401 || status(r) === 403 || (res && (Number(res.code) === 401 ||
        (Number(res.code) === 400 && ['无效的登录令牌','登录令牌已过期'].indexOf(res.msg) >= 0)));
    }
    function signIn() {
      if (!current()) { notify('账号配置已变化', '取消本次签到，避免使用迟到的登录结果。'); end(); return; }
      $httpClient.post({url:BASE + '/user/activity/signIn/h5', headers:headers(true), body:'', timeout:10000},
        function (err, r, data) {
          try {
            var res = parse(data);
            if (err || !ok(r) || !res) { notify('签到未确认', '网络、HTTP 或响应异常；未重复签到，请在网站核实。'); return; }
            if (res.code === 1 && typeof res.data === 'number' && isFinite(res.data))
              notify('签到成功', '今日获得 ' + res.data + ' 积分');
            else if (res.code === 0 && typeof res.msg === 'string' && /已签到|重复/.test(res.msg))
              notify('今日已签到', '无需重复操作。');
            else notify('签到未确认', '业务响应异常；本次不再次登录或签到，请在网站核实。');
          } catch (_) { notify('签到未确认', '处理响应失败，未重复请求。'); }
          finally { end(); }
        });
    }
    // Persist cooldown before sending. One login per run; rejected signatures stay blocked.
    session.retryAfter = Date.now() + 15 * 60 * 1000;
    if (!save()) { notify('保存失败或账号已变化', '未发起登录，请检查本地配置。'); end(); return; }
    $httpClient.post({url:BASE + PATH, headers:headers(false), body:session.rawBody, timeout:15000},
      function (err, r, data) {
        try {
          if (!current()) { notify('账号配置已变化', '忽略迟到的登录结果，不执行签到。'); end(); return; }
          var res = parse(data);
          if (!err && rejection(r, res)) {
            session.blocked = true; save();
            notify('需要新的 Telegram 登录签名', '服务端拒绝凭证；已停止重放，请从 Telegram 重新打开并捕获成功登录。'); end(); return;
          }
          if (err || !ok(r) || !res || res.code !== 1 || !res.data || !text(res.data.token)) {
            notify('自动登录未确认', '网络、HTTP 或业务响应异常；本次不重试、不签到，15 分钟内不重复登录。'); end(); return;
          }
          session.token = res.data.token;
          if (!save()) { notify('保存失败或账号已变化', '未执行签到，请重新捕获登录。'); end(); return; }
          signIn();
        } catch (_) { notify('登录处理失败', '未输出原始错误，未重复请求。'); end(); }
      });
  } catch (_) { notify('运行失败', '本地配置或请求异常；未输出原始错误详情。'); end(); }
})();
