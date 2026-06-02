/*
雨云 (RainYun) 每日签到脚本 - QuantumultX + BoxJS 版
版本: 1.0.0

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📌 功能说明
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. 支持多账号（通过 BoxJS 配置）
2. 自动登录并完成每日签到获取积分
3. 显示积分变化
4. 支持多种推送方式（QX 通知/BoxJS）

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📌 配置步骤
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. 添加 BoxJS 订阅（如未安装）
   QX → 重写 → 引用 → 添加 BoxJS 订阅
   https://raw.githubusercontent.com/chavyleung/scripts/master/box/rewrite/boxjs.rewrite.quanx.conf

2. 添加本脚本的重写和任务
   [rewrite_local]
   ^https://api\.v2\.rainyun\.com/user/ url script-request-header rainyun_checkin.js
   
   [task_local]
   15 7 * * * rainyun_checkin.js, tag=雨云签到, enabled=true
   
   [MITM]
   hostname = api.v2.rainyun.com

3. 打开 BoxJS → 应用 → 雨云签到 → 配置账号
   账号格式：用户名&密码（多个账号用 @ 分隔）
   示例：user1&pass1@user2&pass2

4. 首次运行或 Token 过期时，脚本会自动登录获取新 Token

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📌 BoxJS 订阅
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
在 BoxJS → 订阅 → 添加订阅，粘贴：
https://raw.githubusercontent.com/your-repo/rainyun.boxjs.json
（或使用下方提供的完整 BoxJS 配置）
*/

const $ = new Env('雨云签到');
const API_BASE = "https://api.v2.rainyun.com";
const UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1";

// ==================== 存储键名 ====================
const KEY_ACCOUNTS = 'rainyun_accounts';      // 账号列表
const KEY_SESSIONS = 'rainyun_sessions';      // 会话缓存（按账号）
const KEY_LAST_RUN = 'rainyun_last_run';      // 上次运行时间

// ==================== 工具函数 ====================

// 读取账号配置（优先从 BoxJS 读取）
function getAccounts() {
    let accountsStr = $.getdata(KEY_ACCOUNTS) || '';
    
    // 尝试从 BoxJS 读取
    if (typeof $prefs !== 'undefined') {
        const boxjsData = $.getdata('@rainyun.rainyun_accounts');
        if (boxjsData) accountsStr = boxjsData;
    }
    
    if (!accountsStr) {
        $.msg('雨云签到', '❌ 未配置账号', '请先在 BoxJS 中配置账号');
        return [];
    }
    
    const accounts = [];
    const parts = accountsStr.split('@');
    for (let part of parts) {
        part = part.trim();
        if (part.includes('&')) {
            const [username, password] = part.split('&', 2);
            if (username.trim() && password.trim()) {
                accounts.push({
                    username: username.trim(),
                    password: password.trim()
                });
            }
        }
    }
    return accounts;
}

// 获取账号会话
function getSession(username) {
    const sessions = JSON.parse($.getdata(KEY_SESSIONS) || '{}');
    return sessions[username] || null;
}

// 保存账号会话
function saveSession(username, session) {
    const sessions = JSON.parse($.getdata(KEY_SESSIONS) || '{}');
    sessions[username] = session;
    $.setdata(JSON.stringify(sessions), KEY_SESSIONS);
}

// 清除账号会话
function clearSession(username) {
    const sessions = JSON.parse($.getdata(KEY_SESSIONS) || '{}');
    delete sessions[username];
    $.setdata(JSON.stringify(sessions), KEY_SESSIONS);
}

// HTTP 请求封装
function httpRequest(options) {
    return new Promise((resolve, reject) => {
        $.httpClient.post(options, (err, resp, data) => {
            if (err) {
                reject(err);
            } else {
                try {
                    resolve({ resp, data: JSON.parse(data) });
                } catch {
                    resolve({ resp, data });
                }
            }
        });
    });
}

function httpGet(options) {
    return new Promise((resolve, reject) => {
        $.httpClient.get(options, (err, resp, data) => {
            if (err) {
                reject(err);
            } else {
                try {
                    resolve({ resp, data: JSON.parse(data) });
                } catch {
                    resolve({ resp, data });
                }
            }
        });
    });
}

// ==================== 核心功能 ====================

// 登录
async function login(username, password) {
    const options = {
        url: `${API_BASE}/user/login`,
        headers: {
            'User-Agent': UA,
            'Origin': 'https://app.rainyun.com',
            'Referer': 'https://app.rainyun.com/',
            'Accept': 'application/json, text/plain, */*',
            'Accept-Language': 'zh-CN,zh;q=0.9',
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ field: username, password: password })
    };
    
    try {
        const { resp, data } = await httpRequest(options);
        if (data.code === 200) {
            // 从响应头或 Cookie 中获取 CSRF Token
            const csrfToken = resp.headers['x-csrf-token'] || 
                             resp.headers['X-CSRF-Token'] ||
                             extractCsrfFromCookie(resp.headers['Set-Cookie']);
            
            if (csrfToken) {
                saveSession(username, {
                    csrfToken: csrfToken,
                    timestamp: Date.now()
                });
                $.log(`[${username}] 登录成功`);
                return { success: true, csrfToken };
            } else {
                return { success: false, message: '未获取到 CSRF Token' };
            }
        } else {
            return { success: false, message: data.message || '登录失败' };
        }
    } catch (e) {
        return { success: false, message: `登录异常: ${e}` };
    }
}

// 从 Cookie 提取 CSRF Token
function extractCsrfFromCookie(setCookie) {
    if (!setCookie) return null;
    const match = setCookie.match(/X-CSRF-Token=([^;]+)/);
    return match ? match[1] : null;
}

// 获取用户积分
async function getUserPoints(csrfToken) {
    const options = {
        url: `${API_BASE}/user/?no_cache=true`,
        headers: {
            'User-Agent': UA,
            'Origin': 'https://app.rainyun.com',
            'Referer': 'https://app.rainyun.com/',
            'Accept': 'application/json, text/plain, */*',
            'x-csrf-token': csrfToken
        }
    };
    
    try {
        const { data } = await httpGet(options);
        if (data.code === 200) {
            return data.data?.Points || 0;
        }
    } catch (e) {
        $.log(`获取积分失败: ${e}`);
    }
    return -1;
}

// 获取签到状态
async function getCheckinStatus(csrfToken) {
    const options = {
        url: `${API_BASE}/user/reward/tasks`,
        headers: {
            'User-Agent': UA,
            'Origin': 'https://app.rainyun.com',
            'Referer': 'https://app.rainyun.com/',
            'Accept': 'application/json, text/plain, */*',
            'x-csrf-token': csrfToken
        }
    };
    
    try {
        const { data } = await httpGet(options);
        if (data.code === 200) {
            const tasks = data.data || [];
            for (const task of tasks) {
                if (task.Name === '每日签到') {
                    return task.Status; // 2 = 已完成
                }
            }
        }
    } catch (e) {
        $.log(`获取签到状态失败: ${e}`);
    }
    return -1;
}

// 执行签到
async function doCheckin(csrfToken) {
    const options = {
        url: `${API_BASE}/user/reward/tasks`,
        headers: {
            'User-Agent': UA,
            'Origin': 'https://app.rainyun.com',
            'Referer': 'https://app.rainyun.com/',
            'Accept': 'application/json, text/plain, */*',
            'Content-Type': 'application/json',
            'x-csrf-token': csrfToken
        },
        body: JSON.stringify({
            task_name: '每日签到',
            verifyCode: '',
            vticket: '',
            vrandstr: ''
        })
    };
    
    try {
        const { data } = await httpRequest(options);
        if (data.code === 200) {
            return { success: true, message: '签到成功' };
        } else if (data.code === 10004) {
            return { success: false, message: '需要滑块验证码', needCaptcha: true };
        } else if (data.code === 30002) {
            return { success: false, message: '登录已失效', needRelogin: true };
        } else {
            return { success: false, message: data.message || '签到失败' };
        }
    } catch (e) {
        return { success: false, message: `请求异常: ${e}` };
    }
}

// 处理单个账号
async function processAccount(account) {
    const { username, password } = account;
    const result = {
        username,
        loginOk: false,
        pointsBefore: -1,
        pointsAfter: -1,
        checkinStatus: '',
        message: ''
    };
    
    $.log(`\n────────── 处理账号: ${username} ──────────`);
    
    // 1. 获取或刷新会话
    let session = getSession(username);
    let csrfToken = session?.csrfToken;
    
    // 检查 Token 是否过期（超过 6 小时）
    const tokenExpired = !session || (Date.now() - session.timestamp > 6 * 60 * 60 * 1000);
    
    if (tokenExpired) {
        $.log(`[${username}] Token 过期或不存在，重新登录...`);
        const loginRes = await login(username, password);
        if (!loginRes.success) {
            result.message = `登录失败: ${loginRes.message}`;
            $.log(`❌ ${result.message}`);
            return result;
        }
        csrfToken = loginRes.csrfToken;
    }
    
    result.loginOk = true;
    
    // 2. 获取签到前积分
    await $.wait(1000 + Math.random() * 2000);
    result.pointsBefore = await getUserPoints(csrfToken);
    $.log(`[${username}] 当前积分: ${result.pointsBefore}`);
    
    // 3. 检查签到状态
    await $.wait(1000 + Math.random() * 2000);
    const status = await getCheckinStatus(csrfToken);
    
    if (status === 2) {
        $.log(`[${username}] 今日已签到，跳过`);
        result.checkinStatus = 'already_done';
        result.pointsAfter = result.pointsBefore;
        result.message = '今日已签到';
        return result;
    }
    
    // 4. 执行签到
    await $.wait(1000 + Math.random() * 2000);
    const checkinRes = await doCheckin(csrfToken);
    
    if (checkinRes.success) {
        $.log(`[${username}] ✅ 签到成功 +500 积分`);
        result.checkinStatus = 'success';
        result.message = '签到成功 +500';
    } else if (checkinRes.needCaptcha) {
        $.log(`[${username}] ⚠️ 需要滑块验证码`);
        result.checkinStatus = 'need_captcha';
        result.message = '需要滑块验证码';
    } else if (checkinRes.needRelogin) {
        $.log(`[${username}] ❌ 登录失效，清除会话`);
        clearSession(username);
        result.checkinStatus = 'failed';
        result.message = '登录失效';
    } else {
        $.log(`[${username}] ❌ 签到失败: ${checkinRes.message}`);
        result.checkinStatus = 'failed';
        result.message = checkinRes.message;
    }
    
    // 5. 获取签到后积分
    await $.wait(1000 + Math.random() * 1000);
    result.pointsAfter = await getUserPoints(csrfToken);
    if (result.pointsBefore >= 0 && result.pointsAfter >= 0) {
        const gained = result.pointsAfter - result.pointsBefore;
        $.log(`[${username}] 积分: ${result.pointsBefore} → ${result.pointsAfter} (+${gained})`);
    }
    
    return result;
}

// 生成报告
function buildReport(results) {
    const now = new Date();
    const dateStr = now.toLocaleDateString('zh-CN');
    const timeStr = now.toLocaleTimeString('zh-CN', { hour12: false });
    
    const total = results.length;
    const successCount = results.filter(r => r.checkinStatus === 'success').length;
    const doneCount = results.filter(r => r.checkinStatus === 'already_done').length;
    const captchaCount = results.filter(r => r.checkinStatus === 'need_captcha').length;
    const failCount = results.filter(r => r.checkinStatus === 'failed' || !r.loginOk).length;
    
    // 标题
    let title;
    if (failCount > 0) {
        title = `⚠️ 雨云签到 ${dateStr} - 存在异常`;
    } else if (captchaCount === total) {
        title = `🔒 雨云签到 ${dateStr} - 需要验证码`;
    } else if (successCount > 0) {
        title = `✅ 雨云签到 ${dateStr} - 签到成功`;
    } else {
        title = `📋 雨云签到 ${dateStr} - 今日已完成`;
    }
    
    // 内容
    const lines = [
        `雨云每日签到报告`,
        `执行时间：${dateStr} ${timeStr}`,
        `账号总数：${total}`,
        `──────────────`,
        ''
    ];
    
    const statusMap = {
        'already_done': '今日已签到',
        'success': '签到成功 +500',
        'need_captcha': '需验证码',
        'failed': '签到失败',
        '': '未执行'
    };
    
    for (const r of results) {
        if (!r.loginOk) {
            lines.push(`❌ ${r.username}`);
            lines.push(`   状态：${r.message}`);
        } else {
            const statusStr = statusMap[r.checkinStatus] || '未知';
            const icon = r.checkinStatus === 'success' || r.checkinStatus === 'already_done' ? '✅' : '⚠️';
            lines.push(`${icon} ${r.username}`);
            lines.push(`   状态：${statusStr}`);
            if (r.pointsBefore >= 0) {
                const gained = r.pointsAfter - r.pointsBefore;
                lines.push(`   积分：${r.pointsBefore} → ${r.pointsAfter} (+${gained})`);
            }
        }
        lines.push('');
    }
    
    lines.push(`──────────────`);
    lines.push(`汇总：成功 ${successCount} | 已完成 ${doneCount} | 验证码 ${captchaCount} | 失败 ${failCount}`);
    
    return { title, content: lines.join('\n') };
}

// ==================== 主程序 ====================

async function main() {
    $.log('═══════════════════════════');
    $.log('  雨云每日签到脚本启动');
    $.log('═══════════════════════════');
    
    // 获取账号
    const accounts = getAccounts();
    if (accounts.length === 0) {
        $.log('❌ 未找到有效账号配置');
        $.done();
        return;
    }
    
    $.log(`共加载 ${accounts.length} 个账号`);
    
    // 处理每个账号
    const results = [];
    for (let i = 0; i < accounts.length; i++) {
        if (i > 0) {
            const delay = 5000 + Math.random() * 7000;
            $.log(`\n账号间延迟 ${(delay/1000).toFixed(1)}s...`);
            await $.wait(delay);
        }
        
        const result = await processAccount(accounts[i]);
        results.push(result);
    }
    
    // 生成并发送报告
    $.log('\n═══════════════════════════');
    $.log('  执行完毕，生成报告');
    $.log('═══════════════════════════');
    
    const report = buildReport(results);
    $.log('\n' + report.content);
    
    $.msg(report.title, '', report.content);
    
    // 保存最后运行时间
    $.setdata(new Date().toISOString(), KEY_LAST_RUN);
    
    $.done();
}

// ==================== Env 类 ====================

function Env(name) {
    this.name = name;
    this.logs = [];
    
    this.log = (msg) => {
        console.log(`[${this.name}] ${msg}`);
        this.logs.push(msg);
    };
    
    this.getdata = (key) => {
        if (typeof $prefs !== 'undefined') {
            return $prefs.valueForKey(key);
        }
        return null;
    };
    
    this.setdata = (val, key) => {
        if (typeof $prefs !== 'undefined') {
            return $prefs.setValueForKey(val, key);
        }
        return false;
    };
    
    this.msg = (title, subtitle, body) => {
        if (typeof $notify !== 'undefined') {
            $notify(title, subtitle, body);
        }
    };
    
    this.wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));
    
    this.httpClient = {
        get: (options, callback) => {
            $task.fetch({ ...options, method: 'GET' }).then(
                resp => callback(null, resp, resp.body),
                err => callback(err, null, null)
            );
        },
        post: (options, callback) => {
            $task.fetch({ ...options, method: 'POST' }).then(
                resp => callback(null, resp, resp.body),
                err => callback(err, null, null)
            );
        }
    };
    
    this.done = () => {
        $done();
    };
}

// 运行主程序
main().catch(e => {
    $.log(`脚本执行异常: ${e}`);
    $.msg('雨云签到', '❌ 脚本异常', String(e));
    $.done();
});
