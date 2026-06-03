/*
------------------------------------------
@Name: 蜜雪冰城 访问雪王铺
@Desc: 通过访问兑吧活动页面雪王铺获取雪王币
------------------------------------------

⚙️ QX配置：

[MITM]
hostname = mxsa.mxbc.net, 76177-activity.dexfu.cn

[Script]
# 获取Token（进入小程序我的页面触发）
http-response ^https:\/\/mxsa\.mxbc\.net\/api\/v1\/customer\/info script-path=https://raw.githubusercontent.com/MyUI0/pic/main/scripts/mxbc.js, requires-body=true, timeout=60, tag=蜜雪冰城获取token

# 定时任务（每天8点）
[task_local]
0 8 * * * https://raw.githubusercontent.com/MyUI0/pic/main/scripts/mxbc.js, tag=蜜雪冰城访问雪王铺
*/

const $ = new Env("蜜雪冰城");
const ckName = "mxbc_data";
const userCookie = $.toObj($.isNode() ? process.env[ckName] : $.getdata(ckName)) || [];
$.notifyMsg = [];

const baseUrl = "https://mxsa.mxbc.net";
const _headers = {
    "app": "mxbc",
    "appchannel": "xiaomi",
    "appversion": "3.0.3",
    "Access-Token": "",
    "Host": "mxsa.mxbc.net",
    "User-Agent": "okhttp/4.4.1"
};

// ========== 核心fetch ==========
const fetchAPI = async (o) => {
    try {
        if (typeof o === 'string') o = { url: o };
        if (o?.url?.startsWith("/")) o.url = baseUrl + o.url;
        const res = await requestTask({ ...o, headers: o.headers || _headers, url: o.url });
        return res;
    } catch (e) {
        $.ckStatus = false;
        $.log(`⛔️ 请求失败: ${e}`);
    }
};

function requestTask(options) {
    return new Promise((resolve, reject) => {
        if (typeof options === 'string') options = { url: options };
        let url = options.url;
        if (options.params) {
            let qs = Object.entries(options.params).map(([k,v]) => encodeURIComponent(k)+'='+encodeURIComponent(v)).join('&');
            url += (url.includes('?') ? '&' : '?') + qs;
        }
        let method = (options.method || (options.body ? 'POST' : 'GET')).toUpperCase();
        let headers = options.headers || {};
        let body = options.body;
        if (body && typeof body === 'object' && !headers['content-type']?.toLowerCase()?.includes('json') && !headers['Content-Type']?.toLowerCase()?.includes('json')) {
            body = Object.entries(body).map(([k,v]) => encodeURIComponent(k)+'='+encodeURIComponent(v)).join('&');
        } else if (body && typeof body === 'object') {
            body = JSON.stringify(body);
        }
        let timeout = options.timeout || 15000;
        let opts = { url, method, headers, body, timeout };
        $.log(`[fetch] ${method} ${url}`);
        $task.fetch(opts).then(
            resp => {
                let result = options.resultType === 'all' ? resp : resp.body;
                if (result && typeof result === 'string' && result.startsWith('{')) {
                    try { result = JSON.parse(result); } catch {}
                }
                resolve(result);
            },
            err => reject(err)
        );
    });
}

// ========== 主流程 ==========
async function main() {
    try {
        if (!userCookie?.length) throw new Error("没有找到可用账号");
        $.log(`⚙️ 共找到 ${userCookie.length} 个账号`);

        for (let [index, user] of userCookie.entries()) {
            if (!user.token) {
                $.log(`⛔️ 账号${index+1}: token为空，跳过`);
                continue;
            }
            $.log(`\n🚀 账号${index+1}: ${user?.userName || user?.userId || ''}`);
            $.ckStatus = true;
            _headers["Access-Token"] = user.token;

            // 1. 查用户信息，记录初始雪王币
            let userInfo = await getUserInfo();
            let pointB = userInfo?.point || 0;
            $.log(`📊 当前余额: ${pointB} 雪王币`);


            // 3. 访问雪王铺（核心：获取活动奖励）
            if ($.ckStatus) {
                try {
                    let loginUrl = await getLoginUrl();
                    if (loginUrl) {
                        let session = await getActivitySession(loginUrl);
                        if (session) {
                            await visitSnowKingMall(session);
                        }
                    }
                } catch (e) {
                    $.log(`⛔️ 雪王铺任务异常: ${e.message}`);
                }
            }

            // 4. 查最终雪王币
            if ($.ckStatus) {
                let userInfoE = await getUserInfo();
                let pointE = userInfoE?.point || 0;
                let gained = pointE - pointB;
                let name = userInfoE?.userName || user?.userName || `账号${index+1}`;
                $.log(`🎉 ${name} 本次获得 ${gained} 雪王币，当前余额 ${pointE}`);
                $.notifyMsg.push(`「${name}」+${gained}币，余额${pointE}币`);
            } else {
                $.notifyMsg.push(`❌ 账号${index+1}: token可能已失效`);
            }
        }
    } catch (e) {
        $.logErr(e);
    } finally {
        sendNotify($.notifyMsg.join("\n"));
    }
}

// ========== 查询用户信息 ==========
async function getUserInfo() {
    try {
        let t = ts13();
        let res = await fetchAPI({
            url: `/api/v1/customer/info`,
            params: { appId: "d82be6bbc1da11eb9dd000163e122ecb", t, sign: getSHA256withRSA('appId=d82be6bbc1da11eb9dd000163e122ecb&t=' + t) }
        });
        if (res?.code == 0) {
            return { userName: res.data.mobilePhone, point: res.data.customerPoint };
        }
        $.ckStatus = false;
        $.log(`⛔️ 查用户信息失败: ${res?.msg || '未知'}`);
    } catch (e) {
        $.log(`⛔️ 查用户信息异常: ${e}`);
    }
}

// ========== 获取兑吧登录URL ==========
async function getLoginUrl() {
    try {
        let t = ts13();
        let res = await fetchAPI({
            url: `/api/v1/duiba/getLoginUrl`,
            params: {
                appId: "d82be6bbc1da11eb9dd000163e122ecb",
                t,
                sign: getSHA256withRSA('appId=d82be6bbc1da11eb9dd000163e122ecb&t=' + t),
                // 从抓包可知 redirect 目标是 skins 页面 (雪王铺)
                dbredirect: "https%3A%2F%2F76177-activity.dexfu.cn%2Fchw%2Fvisual-editor%2Fskins%3Fid%3D216593"
            }
        });
        if (res?.data?.loginUrl) {
            $.log(`✅ 获取活动登录URL成功`);
            return res.data.loginUrl;
        }
        $.log(`⛔️ 获取活动登录URL失败`);
    } catch (e) {
        $.log(`⛔️ 获取活动登录URL异常: ${e}`);
    }
}

// ========== 获取活动Session（Cookie） ==========
async function getActivitySession(loginUrl) {
    try {
        // 步骤1: 访问 loginUrl（自动登录），拿到 set-cookie
        let opts = {
            url: loginUrl,
            followRedirect: false,
            resultType: "all",
            headers: {
                'Accept-Encoding': 'gzip, deflate, br',
                'Connection': 'keep-alive',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Host': '76177-activity.dexfu.cn',
                'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0.70',
                'Accept-Language': 'zh-CN,zh-Hans;q=0.9'
            }
        };

        let res = await requestTask(opts);
        let headers = ObjectKeys2LowerCase(res?.headers || {});
        let cookies = headers['set-cookie'] || '';
        if (Array.isArray(cookies)) cookies = cookies.join('; ');

        // 提取关键cookie (从抓包看需要这些)
        let match = cookies.match(/(wdata4|w_ts|_ac|wdata3|dcustom)=.+?(?:;|$)/g);
        if (!match) {
            // 可能loginUrl已重定向，检查location
            let location = headers['location'];
            if (location) {
                $.log(`ℹ️ 登录URL有重定向: ${location}`);
                // 用 location 再试
                opts.url = location.startsWith('http') ? location : `https://76177-activity.dexfu.cn${location}`;
                opts.followRedirect = true;
                let res2 = await requestTask(opts);
                let headers2 = ObjectKeys2LowerCase(res2?.headers || {});
                let cookies2 = headers2['set-cookie'] || '';
                if (Array.isArray(cookies2)) cookies2 = cookies2.join('; ');
                match = cookies2.match(/(wdata4|w_ts|_ac|wdata3|dcustom)=.+?(?:;|$)/g);
                if (match) cookies = cookies2;
            }
            if (!match) {
                throw new Error("无法获取活动session cookie");
            }
        }

        let session = match.join('');
        $.log(`✅ 获取活动Session成功`);
        return session;
    } catch (e) {
        $.log(`⛔️ 获取活动Session失败: ${e.message}`);
    }
}

// ========== 访问雪王铺（触发访问奖励） ==========
async function visitSnowKingMall(session) {
    try {
        // 访问雪王铺页面 (skins页面 = 积分兑换商城/雪王铺)
        let opts = {
            url: "https://76177-activity.dexfu.cn/chw/visual-editor/skins?id=216593",
            params: { from: "login", spm: "76177.1.1.1" },
            headers: {
                'Cookie': session,
                'Host': '76177-activity.dexfu.cn',
                'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0.70',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Encoding': 'gzip, deflate, br',
                'Accept-Language': 'zh-CN,zh-Hans;q=0.9',
                'Connection': 'keep-alive'
            }
        };

        let res = await requestTask(opts);
        let body = typeof res === 'string' ? res : JSON.stringify(res);

        if (body && body.includes('请重新登陆')) {
            throw new Error('Session已过期，需要重新获取');
        }
        $.log(`✅ 访问雪王铺成功!`);
    } catch (e) {
        $.log(`⛔️ 访问雪王铺失败: ${e.message}`);
    }
}

// ========== 获取/刷新Cookie（QX重写抓token） ==========
async function getCookie() {
    try {
        if ($request && $request.method === 'OPTIONS') return;
        const header = ObjectKeys2LowerCase($request.headers) || {};
        const body = $.toObj($response.body);
        const token = header['access-token'];
        if (!token || !body) throw new Error("获取token失败，值不存在");

        const newData = {
            userId: body?.data?.mobilePhone || body?.data?.userId || '',
            token: token,
            userName: body?.data?.mobilePhone || '',
        };

        const index = userCookie.findIndex(e => e.userId == newData.userId);
        if (index >= 0) {
            userCookie[index] = newData;
        } else {
            userCookie.push(newData);
        }
        $.setjson(userCookie, ckName);
        $.msg($.name, `🎉 ${newData.userName || '账号'} 更新token成功!`, ``);
    } catch (e) {
        $.logErr(e);
    }
}

// ========== 工具函数 ==========
function ts13() { return Math.round(new Date().getTime()).toString(); }

function getSHA256withRSA(content) {
    var privateKeyString = `-----BEGIN PRIVATE KEY-----
MIIEvwIBADANBgkqhkiG9w0BAQEFAASCBKkwggSlAgEAAoIBAQCtypUdHZJKlQ9L
L6lIJSphnhqjke7HclgWuWDRWvzov30du235cCm13mqJ3zziqLCwstdQkuXo9sOP
Ih94t6nzBHTuqYA1whrUnQrKfv9X4/h3QVkzwT+xWflE+KubJZoe+daLKkDeZjVW
nUku8ov0E5vwADACfntEhAwiSZUALX9UgNDTPbj5ESeII+VztZ/KOFsRHMTfDb1G
IR/dAc1mL5uYbh0h2Fa/fxRPgf7eJOeWGiygesl3CWj0Ue13qwX9PcG7klJXfToI
576MY+A7027a0aZ49QhKnysMGhTdtFCksYG0lwPz3bIR16NvlxNLKanc2h+ILTFQ
bMW/Y3DRAgMBAAECggEBAJGTfX6rE6zX2bzASsu9HhgxKN1VU6/L70/xrtEPp4SL
SpHKO9/S/Y1zpsigr86pQYBx/nxm4KFZewx9p+El7/06AX0djOD7HCB2/+AJq3iC
5NF4cvEwclrsJCqLJqxKPiSuYPGnzji9YvaPwArMb0Ff36KVdaHRMw58kfFys5Y2
HvDqh4x+sgMUS7kSEQT4YDzCDPlAoEFgF9rlXnh0UVS6pZtvq3cR7pR4A9hvDgX9
wU6zn1dGdy4MEXIpckuZkhwbqDLmfoHHeJc5RIjRP7WIRh2CodjetgPFE+SV7Sdj
ECmvYJbet4YLg+Qil0OKR9s9S1BbObgcbC9WxUcrTgECgYEA/Yj8BDfxcsPK5ebE
9N2teBFUJuDcHEuM1xp4/tFisoFH90JZJMkVbO19rddAMmdYLTGivWTyPVsM1+9s
tq/NwsFJWHRUiMK7dttGiXuZry+xvq/SAZoitgI8tXdDXMw7368vatr0g6m7ucBK
jZWxSHjK9/KVquVr7BoXFm+YxaECgYEAr3sgVNbr5ovx17YriTqe1FLTLMD5gPrz
ugJj7nypDYY59hLlkrA/TtWbfzE+vfrN3oRIz5OMi9iFk3KXFVJMjGg+M5eO9Y8m
14e791/q1jUuuUH4mc6HttNRNh7TdLg/OGKivE+56LEyFPir45zw/dqwQM3jiwIz
yPz/+bzmfTECgYATxrOhwJtc0FjrReznDMOTMgbWYYPJ0TrTLIVzmvGP6vWqG8rI
S8cYEA5VmQyw4c7G97AyBcW/c3K1BT/9oAj0wA7wj2JoqIfm5YPDBZkfSSEcNqqy
5Ur/13zUytC+VE/3SrrwItQf0QWLn6wxDxQdCw8J+CokgnDAoehbH6lTAQKBgQCE
67T/zpR9279i8CBmIDszBVHkcoALzQtU+H6NpWvATM4WsRWoWUx7AJ56Z+joqtPK
G1WztkYdn/L+TyxWADLvn/6Nwd2N79MyKyScKtGNVFeCCJCwoJp4R/UaE5uErBNn
OH+gOJvPwHj5HavGC5kYENC1Jb+YCiEDu3CB0S6d4QKBgQDGYGEFMZYWqO6+LrfQ
ZNDBLCI2G4+UFP+8ZEuBKy5NkDVqXQhHRbqr9S/OkFu+kEjHLuYSpQsclh6XSDks
5x/hQJNQszLPJoxvGECvz5TN2lJhuyCupS50aGKGqTxKYtiPHpWa8jZyjmanMKnE
dOGyw/X4SFyodv8AEloqd81yGg==
-----END PRIVATE KEY-----`;
    const { KEYUTIL, KJUR, hextob64u } = $.Jsrsasign;
    const key = KEYUTIL.getKey(privateKeyString);
    const sig = new KJUR.crypto.Signature({ alg: 'SHA256withRSA' });
    sig.init(key);
    sig.updateString(content);
    const originSign = sig.sign();
    return hextob64u(originSign);
}

// ========== 加载模块 ==========
async function loadModule() {
    $.Jsrsasign = await loadJsrsasign();
    return !!$.Jsrsasign;
}

async function loadJsrsasign() {
    let code = ($.isNode() ? require('jsrsasign') : $.getdata('Jsrsasign_code')) || '';
    if ($.isNode()) return code;
    if (code && Object.keys(code).length) {
        $.log(`✅ 使用缓存的Jsrsasign`);
        const CryptoJS = await loadCryptoJS();
        eval(code);
        return { KEYUTIL, KJUR, hextob64u };
    }
    $.log(`🚀 下载Jsrsasign...`);
    try {
        const CryptoJS = await loadCryptoJS();
        const _partFun = await $.getScript('https://cdn.jsdelivr.net/gh/Sliverkiss/QuantumultX@main/Utils/jsrsasign-part.js');
        const _function = `${_partFun};`;
        $.setdata(_function, 'Jsrsasign_code');
        eval(_function);
        $.log(`✅ Jsrsasign加载成功`);
        return { KEYUTIL, KJUR, hextob64u };
    } catch (e) {
        $.logErr(e);
        throw new Error('loadJsrsasign error');
    }
}

async function loadCryptoJS() {
    let code = ($.isNode() ? require('crypto-js') : $.getdata('CryptoJS_code')) || '';
    if ($.isNode()) return code;
    if (code && Object.keys(code).length) {
        $.log(`✅ 使用缓存的CryptoJS`);
        eval(code);
        return createCryptoJS();
    }
    $.log(`🚀 下载CryptoJS...`);
    return new Promise(async (resolve) => {
        $.getScript('https://cdn.jsdelivr.net/gh/Sliverkiss/QuantumultX@main/Utils/CryptoJS.min.js')
            .then((fn) => {
                $.setdata(fn, 'CryptoJS_code');
                eval(fn);
                resolve(createCryptoJS());
            });
    });
}

// ========== 入口 ==========
!(async () => {
    try {
        if (typeof $request != "undefined") {
            await getCookie();
        } else {
            let loaded = await loadModule();
            if (loaded) await main();
        }
    } catch (e) {
        $.logErr(e);
        $.msg($.name, `⛔️ 运行错误`, e.message || e);
    }
})()
    .catch(e => { $.logErr(e); })
    .finally(() => { $.done({ ok: 1 }); });

// ========== 通知 ==========
function sendNotify(msg) {
    if (msg) {
        if ($.isNode()) {
            try {
                const notify = require('./sendNotify');
                notify.sendNotify($.name, msg);
            } catch (e) {}
        } else {
            $.msg($.name, $.title || "", msg);
        }
    }
}

// ========== Env工具（与原脚本一致） ==========
function Env(t, e) {
    class s { constructor(t) { this.env = t } send(t, e = "GET") { t = "string" == typeof t ? { url: t } : t; let s = this.get; return "POST" === e && (s = this.post), new Promise(((e, r) => { s.call(this, t, ((t, s, a) => { t ? r(t) : e(s) })) })) } get(t) { return this.send.call(this.env, t) } post(t) { return this.send.call(this.env, t, "POST") } }
    return new class {
        constructor(t, e) {
            this.name = t, this.http = new s(this), this.data = null, this.dataFile = "box.dat", this.logs = [], this.isMute = !1, this.isNeedRewrite = !1, this.logSeparator = "\n", this.encoding = "utf-8", this.startTime = (new Date).getTime(), Object.assign(this, e), this.log("", `🔔${this.name}, 开始!`)
        }
        getEnv() { return "undefined" != typeof $environment && $environment["surge-version"] ? "Surge" : "undefined" != typeof $environment && $environment["stash-version"] ? "Stash" : "undefined" != typeof module && module.exports ? "Node.js" : "undefined" != typeof $task ? "Quantumult X" : "undefined" != typeof $loon ? "Loon" : "undefined" != typeof $rocket ? "Shadowrocket" : void 0 }
        isNode() { return "Node.js" === this.getEnv() }
        isQuanX() { return "Quantumult X" === this.getEnv() }
        isSurge() { return "Surge" === this.getEnv() }
        isLoon() { return "Loon" === this.getEnv() }
        toObj(t, e = null) { try { return JSON.parse(t) } catch { return e } }
        toStr(t, e = null) { try { return JSON.stringify(t) } catch { return e } }
        getjson(t, e) { let s = e; if (this.getdata(t)) try { s = JSON.parse(this.getdata(t)) } catch {} return s }
        setjson(t, e) { try { return this.setdata(JSON.stringify(t), e) } catch { return !1 } }
        getScript(t) { return new Promise((e => { this.get({ url: t }, ((t, s, r) => e(r))) })) }
        getdata(t) { let e = this.getval(t); if (/^@/.test(t)) { const [, s, r] = /^@(.*?)\.(.*?)$/.exec(t), a = s ? this.getval(s) : ""; if (a) try { const t = JSON.parse(a); e = t ? this.lodash_get(t, r, "") : e } catch { e = "" } } return e }
        setdata(t, e) { let s = !1; if (/^@/.test(e)) { const [, r, a] = /^@(.*?)\.(.*?)$/.exec(e), i = this.getval(r), o = r ? "null" === i ? null : i || "{}" : "{}"; try { const e = JSON.parse(o); this.lodash_set(e, a, t), s = this.setval(JSON.stringify(e), r) } catch { const i = {}; this.lodash_set(i, a, t), s = this.setval(JSON.stringify(i), r) } } else s = this.setval(t, e); return s }
        getval(t) { switch (this.getEnv()) { case "Surge": case "Loon": case "Stash": case "Shadowrocket": return $persistentStore.read(t); case "Quantumult X": return $prefs.valueForKey(t); case "Node.js": return this.data = this.loaddata(), this.data[t]; default: return this.data && this.data[t] || null } }
        setval(t, e) { switch (this.getEnv()) { case "Surge": case "Loon": case "Stash": case "Shadowrocket": return $persistentStore.write(t, e); case "Quantumult X": return $prefs.setValueForKey(t, e); case "Node.js": return this.data = this.loaddata(), this.data[e] = t, this.writedata(), !0; default: return this.data && this.data[e] || null } }
        loaddata() { if (!this.isNode()) return {}; this.fs = this.fs || require("fs"), this.path = this.path || require("path"); let t = this.path.resolve(this.dataFile), e = this.path.resolve(process.cwd(), this.dataFile), s = this.fs.existsSync(t), r = !s && this.fs.existsSync(e); if (!s && !r) return {}; let a = s ? t : e; try { return JSON.parse(this.fs.readFileSync(a)) } catch { return {} } }
        writedata() { if (this.isNode()) { this.fs = this.fs || require("fs"), this.path = this.path || require("path"); let t = this.path.resolve(this.dataFile), e = this.path.resolve(process.cwd(), this.dataFile), s = this.fs.existsSync(t), r = !s && this.fs.existsSync(e), a = JSON.stringify(this.data); s ? this.fs.writeFileSync(t, a) : r ? this.fs.writeFileSync(e, a) : this.fs.writeFileSync(this.dataFile, a) } }
        lodash_get(t, e, s) { let r = e.replace(/\[(\d+)\]/g, ".$1").split("."); let a = t; for (let t of r) if (a = Object(a)[t], void 0 === a) return s; return a }
        lodash_set(t, e, s) { Object(t) !== t || (Array.isArray(e) || (e = e.toString().match(/[^.[\]]+/g) || []), e.slice(0, -1).reduce(((t, s, r) => Object(t[s]) === t[s] ? t[s] : t[s] = Math.abs(e[r + 1]) >> 0 == +e[r + 1] ? [] : {}), t)[e[e.length - 1]] = s), t }
        log(t) { this.isMute || (this.logs.includes(t) || this.logs.push(t), console.log(t)) }
        logErr(t) { this.log(`❌ ${t}`) }
        msg(t = this.name, e = "", s = "", r) { let a = r ? r["media-url"] : void 0, i = r ? r["open-url"] : void 0, o = r ? r["update-pasteboard"] : void 0; if (!this.isMute) { if ("Surge" == this.getEnv() && !this.isNeedRewrite) $notification.post(t, e, s, { "media-url": a, "open-url": i, "update-pasteboard": o }); if ("Quantumult X" == this.getEnv()) $notify(t, e, s, { "open-url": i, "media-url": a, "update-pasteboard": o }); if ("Loon" == this.getEnv()) $notification.post(t, e, s, a ? { mediaUrl: a, openUrl: i, updatePasteboard: o } : { openUrl: i, updatePasteboard: o }); if ("Shadowrocket" == this.getEnv()) $notification.post(t, e, s, { mediaUrl: a, openUrl: i, updatePasteboard: o }); if ("Stash" == this.getEnv()) $notification.post(t, e, s, { "media-url": a, "open-url": i, "update-pasteboard": o }); if ("Node.js" == this.getEnv()) require('./sendNotify').sendNotify(t, e + "\n" + s) } }
        queryStr(t) { return Object.keys(t).map((e => `${encodeURIComponent(e)}=${encodeURIComponent(t[e])}`)).join("&") }
    }(t, e)
}

async function Request(t) {
    "string" == typeof t && (t = { url: t });
    try {
        if (!t?.url) throw new Error("[Request] 缺少 url");
        let { url: o, type: e, headers: r = {}, body: s, params: a, dataType: n = "form", resultType: u = "data" } = t;
        const p = e ? e?.toLowerCase() : "body" in t ? "post" : "get",
            c = o + (a ? '?' + $.queryStr(a) : ''),
            i = t.timeout ? ($.isSurge() ? t.timeout / 1e3 : t.timeout) : 1e4;
        "json" === n && (r["Content-Type"] = "application/json;charset=UTF-8");
        const y = s && "form" == n ? $.queryStr(s) : $.toStr(s),
            l = { ...t, ...t?.opts || {}, url: c, headers: r, ..."post" === p && { body: y }, ..."get" === p && a && { params: a }, timeout: i },
            m = $.http[p.toLowerCase()](l).then((t => "data" == u ? $.toObj(t.body) || t.body : $.toObj(t) || t)).catch((t => $.log(`❌请求失败: ${t}`)));
        return Promise.race([new Promise(((t, o) => setTimeout((() => o("请求超时")), i))), m])
    } catch (t) { $.log(`❌Request异常: ${t}`) }
}

function ObjectKeys2LowerCase(obj) { return !obj ? {} : Object.fromEntries(Object.entries(obj).map(([k, v]) => [k.toLowerCase(), v])) };
