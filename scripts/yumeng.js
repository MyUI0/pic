// 诊断标记必须位于密码学初始化之前；记录失败不影响业务。
let diagStart;
try { diagStart = Date.now(); } catch (_) {}
function diag(stage, result, error) {
  try {
    const elapsed = typeof diagStart === "number" ? Math.max(0, Date.now() - diagStart) : -1;
    console.log("[MengyouDiag-v3] " + JSON.stringify({ stage, result, error, ms: Number.isFinite(elapsed) ? Math.round(elapsed) : -1 }));
  } catch (_) {}
}
diag("start", "entered", "none");
let result = {};
try {
const _AL = (() => {
  const a = [];
  for (let c = 48; c <= 57; c++) a.push(String.fromCharCode(c));
  a.push(String.fromCharCode(49, 48)); // "10"
  for (let c = 65; c <= 90; c++) a.push(String.fromCharCode(c));
  for (let c = 97; c <= 122; c++) a.push(String.fromCharCode(c));
  return a;
})();
const _map = (n) => n.map((i) => _AL[i]).join("");

// ===========================================================================
// 2) 纯 JS Base64
// ===========================================================================
const B64C = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const B64R = (() => {
  const m = {};
  for (let i = 0; i < B64C.length; i++) m[B64C[i]] = i;
  m["-"] = 62; m["_"] = 63;
  return m;
})();
function b64decode(s) {
  const out = [];
  let buf = 0, bits = 0;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === "=" || ch === "\n" || ch === "\r" || ch === " " || ch === "\t") continue;
    const v = B64R[ch];
    if (v === undefined) continue;
    buf = (buf << 6) | v; bits += 6;
    if (bits >= 8) { bits -= 8; out.push((buf >> bits) & 0xff); }
  }
  return out;
}
function b64encode(bytes) {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i], b1 = bytes[i + 1], b2 = bytes[i + 2];
    out += B64C[b0 >> 2];
    out += B64C[((b0 & 3) << 4) | ((b1 === undefined ? 0 : b1) >> 4)];
    out += b1 === undefined ? "=" : B64C[((b1 & 15) << 2) | ((b2 === undefined ? 0 : b2) >> 6)];
    out += b2 === undefined ? "=" : B64C[b2 & 63];
  }
  return out;
}

// ===========================================================================
// 3) 纯 JS UTF-8
// ===========================================================================
function utf8Encode(str) {
  const out = [];
  for (let i = 0; i < str.length; i++) {
    let c = str.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff && i + 1 < str.length) {
      const c2 = str.charCodeAt(i + 1);
      if (c2 >= 0xdc00 && c2 <= 0xdfff) { c = 0x10000 + ((c - 0xd800) << 10) + (c2 - 0xdc00); i++; }
    }
    if (c < 0x80) out.push(c);
    else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
    else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    else out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
  }
  return out;
}
function utf8Decode(bytes) {
  let s = "";
  for (let i = 0; i < bytes.length; ) {
    const b = bytes[i++];
    let c;
    if (b < 0x80) c = b;
    else if (b < 0xe0) c = ((b & 31) << 6) | (bytes[i++] & 63);
    else if (b < 0xf0) c = ((b & 15) << 12) | ((bytes[i++] & 63) << 6) | (bytes[i++] & 63);
    else c = ((b & 7) << 18) | ((bytes[i++] & 63) << 12) | ((bytes[i++] & 63) << 6) | (bytes[i++] & 63);
    if (c > 0xffff) {
      c -= 0x10000;
      s += String.fromCharCode(0xd800 + (c >> 10), 0xdc00 + (c & 1023));
    } else s += String.fromCharCode(c);
  }
  return s;
}

// ===========================================================================
// 4) 纯 JS AES (128-bit key, CBC, PKCS#7)
//    S-box 由 GF(2^8) 逆元 + 仿射变换现场计算，避免 256 字节常量表。
// ===========================================================================
const SBOX = new Uint8Array(256), INV_SBOX = new Uint8Array(256);
(function buildSbox() {
  const xt = (x) => ((x << 1) ^ (x & 0x80 ? 0x1b : 0)) & 0xff;
  for (let i = 0; i < 256; i++) {
    let inv = 0;
    if (i) { // i^254 in GF(2^8)
      let r = 1, b = i, e = 254;
      while (e) {
        if (e & 1) r = gmul(r, b);
        b = gmul(b, b); e >>= 1;
      }
      inv = r;
    }
    let s = inv;
    let x = inv;
    for (let k = 0; k < 4; k++) { x = ((x << 1) | (x >> 7)) & 0xff; s ^= x; }
    s ^= 0x63;
    SBOX[i] = s; INV_SBOX[s] = i;
  }
  void xt;
})();
function gmul(a, b) {
  let p = 0;
  for (let i = 0; i < 8; i++) {
    if (b & 1) p ^= a;
    const hi = a & 0x80;
    a = (a << 1) & 0xff;
    if (hi) a ^= 0x1b;
    b >>= 1;
  }
  return p & 0xff;
}
function expandKey(key) { // key: 16 bytes -> 176-byte round-key schedule
  if (key.length !== 16) throw new Error("AES key must be 16 bytes");
  const w = new Uint8Array(176);
  w.set(key);
  let rcon = 1;
  for (let i = 16; i < 176; i += 4) {
    let t0 = w[i - 4], t1 = w[i - 3], t2 = w[i - 2], t3 = w[i - 1];
    if (i % 16 === 0) {
      const tmp = t0;
      t0 = SBOX[t1] ^ rcon; t1 = SBOX[t2]; t2 = SBOX[t3]; t3 = SBOX[tmp];
      rcon = gmul(rcon, 2);
    }
    w[i] = w[i - 16] ^ t0; w[i + 1] = w[i - 15] ^ t1;
    w[i + 2] = w[i - 14] ^ t2; w[i + 3] = w[i - 13] ^ t3;
  }
  return w;
}
function addKey(s, w, off) { for (let i = 0; i < 16; i++) s[i] ^= w[off + i]; }
function encryptBlock(s, w) {
  addKey(s, w, 0);
  for (let r = 1; r <= 10; r++) {
    for (let i = 0; i < 16; i++) s[i] = SBOX[s[i]];
    const t = s.slice();
    // ShiftRows (state is column-major: s[c*4+r])
    for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) s[c * 4 + r] = t[((c + r) % 4) * 4 + r];
    if (r !== 10) {
      for (let c = 0; c < 4; c++) {
        const a0 = s[c * 4], a1 = s[c * 4 + 1], a2 = s[c * 4 + 2], a3 = s[c * 4 + 3];
        s[c * 4] = gmul(a0, 2) ^ gmul(a1, 3) ^ a2 ^ a3;
        s[c * 4 + 1] = a0 ^ gmul(a1, 2) ^ gmul(a2, 3) ^ a3;
        s[c * 4 + 2] = a0 ^ a1 ^ gmul(a2, 2) ^ gmul(a3, 3);
        s[c * 4 + 3] = gmul(a0, 3) ^ a1 ^ a2 ^ gmul(a3, 2);
      }
    }
    addKey(s, w, r * 16);
  }
  return s;
}
function decryptBlock(s, w) {
  addKey(s, w, 160);
  for (let r = 9; r >= 0; r--) {
    const t = s.slice();
    // InvShiftRows
    for (let c = 0; c < 4; c++) for (let q = 0; q < 4; q++) s[c * 4 + q] = t[((c - q + 4) % 4) * 4 + q];
    for (let i = 0; i < 16; i++) s[i] = INV_SBOX[s[i]];
    addKey(s, w, r * 16);
    if (r !== 0) {
      for (let c = 0; c < 4; c++) {
        const a0 = s[c * 4], a1 = s[c * 4 + 1], a2 = s[c * 4 + 2], a3 = s[c * 4 + 3];
        s[c * 4] = gmul(a0, 14) ^ gmul(a1, 11) ^ gmul(a2, 13) ^ gmul(a3, 9);
        s[c * 4 + 1] = gmul(a0, 9) ^ gmul(a1, 14) ^ gmul(a2, 11) ^ gmul(a3, 13);
        s[c * 4 + 2] = gmul(a0, 13) ^ gmul(a1, 9) ^ gmul(a2, 14) ^ gmul(a3, 11);
        s[c * 4 + 3] = gmul(a0, 11) ^ gmul(a1, 13) ^ gmul(a2, 9) ^ gmul(a3, 14);
      }
    }
  }
  return s;
}
function aesCbcEncrypt(bytes, key, iv) {
  const w = expandKey(key);
  const pad = 16 - (bytes.length % 16);
  const data = bytes.slice();
  for (let i = 0; i < pad; i++) data.push(pad);
  let prev = iv.slice();
  const out = [];
  for (let i = 0; i < data.length; i += 16) {
    const blk = new Uint8Array(16);
    for (let j = 0; j < 16; j++) blk[j] = data[i + j] ^ prev[j];
    encryptBlock(blk, w);
    for (let j = 0; j < 16; j++) out.push(blk[j]);
    prev = Array.from(blk);
  }
  return out;
}
function aesCbcDecrypt(bytes, key, iv) {
  const w = expandKey(key);
  if (bytes.length % 16 !== 0) throw new Error("ciphertext not block aligned");
  let prev = iv.slice();
  const out = [];
  for (let i = 0; i < bytes.length; i += 16) {
    const blk = Uint8Array.from(bytes.slice(i, i + 16));
    const ct = Array.from(blk);
    decryptBlock(blk, w);
    for (let j = 0; j < 16; j++) out.push(blk[j] ^ prev[j]);
    prev = ct;
  }
  const pad = out[out.length - 1];
  if (pad > 0 && pad <= 16 && out.length >= pad) out.length -= pad;
  return out;
}

// ===========================================================================

function protocolKeys(cfg) {
  const k = cfg.aesKey || _map([16,30,18,17,35,35,22,31,18,21,31,28,14,21,15,22]);
  const v = cfg.aesIv || _map([0,1,0,2,0,3,0,4,0,5,0,6,0,7,0,8]);
  const kb = utf8Encode(k), vb = utf8Encode(v);
  if (kb.length !== 16 || vb.length !== 16) throw new Error("AES key/iv must be 16 bytes of text");
  return { key: kb, iv: vb };
}
function encryptBody(obj, cfg) {
  const { key, iv } = protocolKeys(cfg);
  return b64encode(aesCbcEncrypt(utf8Encode(JSON.stringify(obj)), key, iv));
}

// 离线源文件；构建时前接现有 Scriptable 的 AES 实现。不会主动发起网络请求。
const STORE = "mengyou_we_loon_v1";
const MARKER = "x-mengyou-widget";
const TARGET = /^https:\/\/gw2c\.yumeng\.work\/app2c\/(?:water_meter\/list_home_water_meter|electric_meter\/(?:list_home_electric_meter|get_home_electric_meter_info|list_power_day_usage))(?:\?[^#]*)?$/i;
const cfg = { aesKey: "", aesIv: "" };
function header(h, name) {
  const k = Object.keys(h || {}).find(x => x.toLowerCase() === name.toLowerCase());
  return k === undefined ? "" : String(h[k] || "");
}
function del(h, name) { Object.keys(h).forEach(k => { if (k.toLowerCase() === name.toLowerCase()) delete h[k]; }); }
function read() {
  try { const v = JSON.parse($persistentStore.read(STORE) || "null"); return v && typeof v === "object" ? v : null; } catch (_) { return null; }
}
function valid(v) {
  return v && /^Bearer\s+\S+$/i.test(v.auth || "") && typeof v.tenant === "string" && typeof v.appId === "string" && v.appId.length > 0 && typeof v.cityId === "string" && v.cityId.length > 0;
}
function write(v) { return $persistentStore.write(JSON.stringify(v), STORE) === true; }
function version() { return Date.now().toString(36) + Math.random().toString(36).slice(2); }
function markerId(h) {
  const value = header(h, MARKER);
  return /^loon-v1-[a-z0-9]{8,40}$/.test(value) ? value : "";
}
function pendingKey(id) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return STORE + "_pending_" + (hash % 64);
}
function bodyObject(body) {
  const env = JSON.parse(body);
  if (!env || typeof env.data !== "string") throw new Error("invalid body");
  const plain = aesCbcDecrypt(b64decode(env.data), protocolKeys(cfg).key, protocolKeys(cfg).iv);
  return JSON.parse(utf8Decode(plain));
}
function blocked() {
  return { response: { status: 428, headers: { "Content-Type": "application/json" }, body: '{"code":"LOON_AUTH_MISSING"}' } };
}
function run() {
  let stage = "route";
  if (!$request || $request.method !== "POST" || !TARGET.test($request.url || "")) { diag("route", "skip", "none"); return {}; }
  const h = $request.headers || {};
  const id = markerId(h);
  const widget = !!id;
  if (typeof $response === "undefined") {
    if (!widget) {
      const d = { body: false, envelope: false, decrypt: false, auth: false, tenant: false, app: false, city: false, write: false, readback: false, error: "none" };
      try {
        d.auth = /^Bearer\s+\S+$/i.test(header(h, "Authorization"));
        d.tenant = Object.keys(h).some(k => k.toLowerCase() === "x-t-id");
        d.body = typeof $request.body === "string";
        if (!d.body) throw "body_type";
        const env = JSON.parse($request.body);
        d.envelope = !!env && typeof env.data === "string";
        if (!d.envelope) throw "envelope";
        const biz = bodyObject($request.body);
        d.decrypt = true;
        const v = { auth: header(h, "Authorization"), tenant: header(h, "x-t-id"), appId: biz.appId, cityId: biz.cityId };
        d.app = typeof v.appId === "string" && v.appId.length > 0;
        d.city = typeof v.cityId === "string" && v.cityId.length > 0;
        if (d.tenant && valid(v)) {
          const old = read();
          v.version = valid(old) && old.auth === v.auth && old.tenant === v.tenant && old.appId === v.appId && old.cityId === v.cityId && old.version ? old.version : version();
          d.write = write(v);
          const saved = read();
          d.readback = d.write && valid(saved) && saved.version === v.version;
        }
      } catch (_) { d.error = !d.body ? "body_type" : !d.envelope ? "envelope" : !d.decrypt ? "decrypt" : "store"; }
      try { console.log("[MengyouDiag-v2] " + JSON.stringify(d)); } catch (_) {}
      diag("capture", d.readback ? "saved" : "not_saved", d.error !== "none" ? d.error : (!d.auth || !d.tenant || !d.app || !d.city) ? "validation" : !d.write ? "write" : !d.readback ? "readback" : "none");
      return {};
    }
    try {
      stage = "read";
      const v = read();
      if (!valid(v)) { diag("widget_request", "blocked", "read"); return blocked(); }
      stage = "version_write";
      if (!v.version) { v.version = version(); if (!write(v)) { diag("widget_request", "blocked", "version_write"); return blocked(); } }
      stage = "body";
      const biz = bodyObject($request.body);
      stage = "pending_write";
      if (!$persistentStore.write(JSON.stringify({id, version: v.version}), pendingKey(id))) { diag("widget_request", "blocked", "pending_write"); return blocked(); }
      biz.appId = v.appId; biz.cityId = v.cityId;
      const headers = Object.assign({}, h);
      del(headers, "Authorization"); del(headers, "x-t-id"); del(headers, "Content-Length");
      headers.Authorization = v.auth; headers["x-t-id"] = v.tenant;
      stage = "encrypt";
      const result = { headers, body: JSON.stringify({ data: encryptBody(biz, cfg) }) };
      diag("widget_request", "injected", "none");
      return result;
    } catch (_) { diag("widget_request", "blocked", stage); return blocked(); }
  }
  const rh = $response.headers || {};
  let responseResult = "skipped";
  const nt = header(rh, "nt").trim();
  try {
    const old = read();
    const auth = header(h, "Authorization");
    const tenant = header(h, "x-t-id");
    let matched = auth === (old && old.auth) && tenant === (old && old.tenant);
    if (widget) {
      const key = pendingKey(id);
      const pending = JSON.parse($persistentStore.read(key) || "null");
      matched = !!(pending && pending.id === id && old && pending.version === old.version);
      if (pending && pending.id === id) $persistentStore.write(undefined, key);
    }
    // 请求头在响应阶段可能是原始值；用本机临时版本关联，拒绝覆盖较新的认证。
    if (valid(old) && matched && /^\S+$/.test(nt) && Number($response.status) >= 200 && Number($response.status) < 300) {
      old.auth = "Bearer " + nt;
      old.version = version();
      responseResult = write(old) ? "updated" : "write_failed";
    }
  } catch (_) { responseResult = "error"; }
  if (!widget) { diag("capture_response", responseResult, responseResult === "error" ? "response" : responseResult === "write_failed" ? "write" : "none"); return {}; }
  // 不将服务端新 token 交给 Scriptable；标记由组件验证响应脚本是否经过。
  const headers = Object.assign({}, rh);
  del(headers, "nt"); del(headers, "x-mengyou-loon");
  headers["X-Mengyou-Loon"] = "v1";
  diag("widget_response", responseResult, responseResult === "error" ? "response" : responseResult === "write_failed" ? "write" : "none");
  return { headers };
}
try { result = run(); } catch (_) {
  diag("dispatch", "error", "unexpected");
  try { result = (typeof $response === "undefined" && markerId(($request || {}).headers)) ? blocked() : {}; } catch (_) { result = {}; }
}

} catch (_) {
  diag("initialization", "error", "unexpected");
  try {
    const headers = $request.headers || {};
    const key = Object.keys(headers).find(k => k.toLowerCase() === "x-mengyou-widget");
    if (typeof $response === "undefined" && key && /^loon-v1-[a-z0-9]{8,40}$/.test(String(headers[key] || ""))) {
      result = { response: { status: 428, headers: { "Content-Type": "application/json" }, body: '{"code":"LOON_AUTH_MISSING"}' } };
    }
  } catch (_) {}
}
$done(result);
