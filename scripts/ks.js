/*
==================================================
  快手广告金币任务 - Loon 精简版
  基于用户提供的“小飞KS1117版.py”重写为 Loon 可运行低轮数版本。

  安全设计：
  - 不跑多线程，不跑代理，不自动换 DID，不突破 2500 上限。
  - 默认低轮数，可在 LPX 参数中设置。
  - 签名服务地址可在 LPX 参数中修改。
  - 不打印完整 Cookie、api_st、salt、userId、did、egid。

  注意：
  - encsign/nssig 算法不在原 Python 内，原脚本也依赖外部签名服务。
  - 本脚本保留可配置签名服务，不内置未知闭源算法。
==================================================
*/

const NAME = '快手广告金币任务';
const STORE_KEY = 'ks_ad_task_accounts_v1';
const DEFAULT_NEBULA_SIGN = 'http://103.24.218.196:6161';
const DEFAULT_KUAISHOU_SIGN = 'http://103.24.218.196:6162';
const isRequest = typeof $request !== 'undefined';

const PLATFORM_KUAISHOU = {
  type: 'KUAISHOU',
  name: '快手普通版',
  userInfoUrl: 'https://encourage.kuaishou.com/rest/wd/encourage/account/basicInfo',
  host: 'encourage.kuaishou.com',
  adClientKey: '3c2cd3f3',
  reportClientKey: '3c2cd3f3',
  signBase: DEFAULT_KUAISHOU_SIGN,
  tasks: {
    box: { name: '宝箱广告', businessId: 604, posId: 20345, subPageId: 100024063, requestSceneType: 1, taskType: 1, pageId: 100011251 },
    look: { name: '看广告得金币', businessId: 671, posId: 24068, subPageId: 100026368, requestSceneType: 1, taskType: 1, pageId: 100011251 },
    search: { name: '搜索广告', businessId: 7077, posId: 216267, subPageId: 100161535, requestSceneType: 1, taskType: 2, pageId: 10014, linkUrl: 'eyJwYWdlSWQiOjEwMDE0LCJzdWJQYWdlSWQiOjEwMDE2MTUzNSwicG9zSWQiOjIxNjI2NywiYnVzaW5lc3NJZCI6NzA3NywiZXh0UGFyYW1zIjoiYzc4OWI1ZTAzMjMxOTUwZjcyM2ZjMWE1ZGJjYzgwNmYzMDE1OTcyZWE0Mzc2NmNlNDYwNTk2ZDgzMGVjNTE5MDM0OGEwNTlkOTA2NWYwZGY1ZjkwY2YwMjEwMGVhMmQzYzU0YjUyZDBlNGUxY2Q0NmMxN2ExZDU3YmRhY2EyMzVlM2U1NjYzN2JmZGQzMThiZWMzNTgzOWU1YzIxNWUyNzMzY2IyMzQ2ZGQ1NDYyODc1NDdlMjc4OWYxMjZjZWU5NWZhYzg4N2IxMzM2MzBlZTEzYTVmYTlhODYzNDYxODQ5MjM0NDk3ZGY3ZTRmOWYyYzk2ZjQ5YzViMGExNzQ2NGE2MGM0MDg1MzU2NTY2ZDc4NGIxYjY3NzY3MzYzYjg3IiwiY3VzdG9tRGF0YSI6eyJleGl0SW5mbyI6eyJ0b2FzdERlc2MiOm51bGwsInJvYXN0SW1nVXJsIjpudWxsfX0sInBlbmRhbnRUeXBlIjoxLCJkaXNwbGF5VHlwZSI6Miwic2luZ2xlUGFnZUlkIjowLCJzaW5nbGVTdWJQYWdlSWQiOjAsIm5vYW5uZWwiOjAsIm5vd250ZG93blJlcG9ydCI6ZmFsc2UsInRoZW1lVHlwZSI6MCwibWl4ZWRBZCI6dHJ1ZSwiZnVsbE1peGVkIjp0cnVlLCJhdXRvUmVwb3J0Ijp0cnVlLCJmcm9tVGFza0NlbnRlciI6dHJ1ZSwic2VhcmNoSW5zcGlyZVNjaGVtZUluZm8iOm51bGwsImFtb3VudCI6MH0=' }
  }
};
const PLATFORM_NEBULA = {
  type: 'NEBULA',
  name: '快手极速版',
  userInfoUrl: 'https://nebula.kuaishou.com/rest/n/nebula/activity/earn/overview/basicInfo',
  host: 'nebula.kuaishou.com',
  adClientKey: '2ac2a76d',
  reportClientKey: '2ac2a76d',
  signBase: DEFAULT_NEBULA_SIGN,
  tasks: {
    box: { name: '宝箱广告', pageId: 11101, subPageId: 100024064, businessId: 606, posId: 20346, requestSceneType: 1, taskType: 1 },
    look: { name: '看广告得金币', pageId: 11101, subPageId: 100026367, businessId: 672, posId: 24067, requestSceneType: 1, taskType: 1 },
    search: { name: '搜索广告', pageId: 11014, subPageId: 100161537, businessId: 7076, posId: 216268, requestSceneType: 1, taskType: 1, linkUrl: 'eyJwYWdlSWQiOjExMDE0LCJzdWJQYWdlSWQiOjEwMDE2MTUzNywicG9zSWQiOjIxNjI2OCwiYnVzaW5lc3NJZCI6NzA3NiwiZXh0UGFyYW1zIjoiYjc4OWI1ZTAzMjMxOTUwZjcyM2ZjMWE1ZGJjYzgwNmYzMDE1OTcyZWE0Mzc2NmNlNDYwNTk2ZDgzMGVjNTE5MDM0OGEwNTlkOTA2NWYwZGY1ZjkwY2YwMjEwMGVhMmQzYzU0YjUyZDBlNGUxY2Q0NmMxN2ExZDU3YmRhY2EyMzVlM2U1NjYzN2JmZGQzMThiZWMzNTgzOWU1YzIxNWUyNzMzY2IyMzQ2ZGQ1NDYyODc1NDdlMjc4OWYxMjZjZWU5NWZhYzg4N2IxMzM2MzBlZTEzYTVmYTlhODYzNDYxODQ5MjM0NDk3ZGY3ZTRmOWYyYzk2ZjQ5YzViMGExNzQ2NGE2MGM0MDg1MzU2NTY2ZDc4NGIxYjY3NzY3MzYzYjg3IiwiY3VzdG9tRGF0YSI6eyJleGl0SW5mbyI6eyJ0b2FzdERlc2MiOm51bGwsInJvYXN0SW1nVXJsIjpudWxsfX0sInBlbmRhbnRUeXBlIjoxLCJkaXNwbGF5VHlwZSI6Miwic2luZ2xlUGFnZUlkIjowLCJzaW5nbGVTdWJQYWdlSWQiOjAsIm5vYW5uZWwiOjAsIm5vd250ZG93blJlcG9ydCI6ZmFsc2UsInRoZW1lVHlwZSI6MCwibWl4ZWRBZCI6dHJ1ZSwiZnVsbE1peGVkIjp0cnVlLCJhdXRvUmVwb3J0Ijp0cnVlLCJmcm9tVGFza0NlbnRlciI6dHJ1ZSwic2VhcmNoSW5zcGlyZVNjaGVtZUluZm8iOm51bGwsImFtb3VudCI6MH0=' }
  }
};

function log(s){ console.log('[ks-ad] ' + s); }
function done(v){ try{$done(v||{});}catch(e){} }
function read(k){ try{return $persistentStore.read(k);}catch(e){return null;} }
function write(k,v){ try{return $persistentStore.write(String(v||''),k);}catch(e){return false;} }
function notify(t,s,b){ try{ if(typeof $notification!=='undefined') $notification.post(t,s||'',b||''); else if(typeof $notify!=='undefined') $notify(t,s||'',b||''); }catch(e){} }
function lh(h){ const o={}; Object.keys(h||{}).forEach(k=>o[k.toLowerCase()]=h[k]); return o; }
function enc(v){ return encodeURIComponent(v == null ? '' : String(v)); }
function qs(obj){ return Object.keys(obj||{}).map(k=>enc(k)+'='+enc(obj[k])).join('&'); }
function parseCookie(cookie){ const o={}; String(cookie||'').split(';').forEach(p=>{ const i=p.indexOf('='); if(i>0)o[p.slice(0,i).trim()]=p.slice(i+1).trim(); }); return o; }
function sleep(ms){ return new Promise(r=>setTimeout(r,ms)); }
function rnd(a,b){ return Math.floor(a+Math.random()*(b-a+1)); }
function safeUrlBase(s, fallback){ s=String(s||'').trim(); return /^https?:\/\//i.test(s) ? s.replace(/\/+$/,'') : fallback; }
function getArg(){ try{ return typeof $argument==='undefined' ? '' : String($argument||''); }catch(e){ return ''; } }
function parseArgs(){
  const raw = getArg();
  const p = raw.split('|');
  const rounds = Math.min(Math.max(parseInt(p[0]||'3',10)||3,1),20);
  const task = /^(box|look|search|all)$/.test(p[1]||'') ? p[1] : 'all';
  const nebulaSign = safeUrlBase(p[2], DEFAULT_NEBULA_SIGN);
  const kuaishouSign = safeUrlBase(p[3], DEFAULT_KUAISHOU_SIGN);
  const waitSec = Math.min(Math.max(parseInt(p[4]||'35',10)||35,5),60);
  return { rounds, task, nebulaSign, kuaishouSign, waitSec };
}
function http(method,url,headers,body){
  return new Promise((resolve,reject)=>{
    const opt={url,headers:headers||{},timeout:30};
    if(body!==undefined&&body!==null) opt.body = typeof body==='string' ? body : JSON.stringify(body);
    $httpClient[method.toLowerCase()](opt,(err,resp,data)=>{
      if(err) return reject(err);
      resolve({status: resp&&resp.status||0, headers: resp&&resp.headers||{}, body: data||''});
    });
  });
}
async function getJson(url,headers){ const r=await http('get',url,headers); try{return {raw:r, json:JSON.parse(r.body||'{}')};}catch(e){return {raw:r,json:null};} }
async function postForm(url,form,headers){ return http('post',url,Object.assign({'Content-Type':'application/x-www-form-urlencoded; charset=UTF-8'},headers||{}), typeof form==='string'?form:qs(form)); }
async function postJson(url,obj){ const r=await http('post',url,{'Content-Type':'application/json'},obj); try{return JSON.parse(r.body||'{}');}catch(e){ throw new Error('签名服务返回非 JSON'); } }
function b64Utf8(s){ return btoa(unescape(encodeURIComponent(s))); }

function loadAccounts(){ try{return JSON.parse(read(STORE_KEY)||'[]')||[];}catch(e){return [];} }
function saveAccount(acc){
  const list = loadAccounts();
  const key = acc.platform + ':' + (acc.userId||'') + ':' + (acc.did||'');
  const item = Object.assign({key, updatedAt: Date.now()}, acc);
  const idx = list.findIndex(x=>x.key===key || (x.cookie===acc.cookie && x.salt===acc.salt));
  if(idx>=0) list[idx]=Object.assign(list[idx], item); else list.push(item);
  write(STORE_KEY, JSON.stringify(list.slice(-20)));
  return list.length;
}
function onRequest(){
  const h=lh($request.headers||{}), cookie=h.cookie||'', url=$request.url||'';
  if(!/kuaishou\.api_st=/.test(cookie)){ done({}); return; }
  const c=parseCookie(cookie);
  const salt = h['x-requestid'] || h['x-client-salt'] || h['__ns_salt'] || h['salt'] || c.salt || '';
  const kpn=(c.kpn||(/nebula/i.test(url)?'NEBULA':'KUAISHOU')).toUpperCase();
  const platform = kpn === 'KUAISHOU' ? 'KUAISHOU' : 'NEBULA';
  const acc={ platform, cookie, salt, userId:c.userId||'', did:c.did||'', egid:c.egid||'', appver:c.appver||'' };
  const n=saveAccount(acc);
  log(`✅ 已保存账号参数：${platform}，当前 ${n} 个账号。${salt?'':'注意：未抓到 salt，广告任务可能无法签名。'}`);
  done({});
}

function accountFromRaw(raw, args){
  const c=parseCookie(raw.cookie||'');
  const platform = raw.platform === 'KUAISHOU' ? Object.assign({}, PLATFORM_KUAISHOU) : Object.assign({}, PLATFORM_NEBULA);
  platform.signBase = platform.type === 'KUAISHOU' ? args.kuaishouSign : args.nebulaSign;
  const get=(k,d)=> c[k] || d || '';
  const mod=get('mod','Xiaomi(23116PN5BC)'), appver=get('appver','13.7.20.10468'), egid=get('egid',''), did=get('did','');
  const a={
    raw, platform, cookie:raw.cookie, salt:raw.salt||'',
    apiSt:get('kuaishou.api_st',''), userId:get('userId',''), did, egid, mod, appver,
    queryBase:`mod=${enc(mod)}&appver=${enc(appver)}&egid=${enc(egid)}&did=${enc(did)}`,
    device:{
      earphoneMode:get('earphoneMode','1'), mod, appver, isp:get('isp','CUCC'), language:get('language','zh-cn'), ud:get('userId',''), did_tag:get('did_tag','0'), net:get('net','WIFI'), kcv:get('kcv','1600'), app:get('app','0'), kpf:get('kpf','ANDROID_PHONE'), ver:get('ver','12.0'), android_os:get('android_os','0'), boardPlatform:get('boardPlatform','pineapple'), kpn:platform.type, androidApiLevel:get('androidApiLevel','33'), country_code:get('country_code','cn'), sys:get('sys','ANDROID_13'), sw:get('sw','1080'), sh:get('sh','2400'), abi:get('abi','arm64'), userRecoBit:get('userRecoBit','0')
    }
  };
  return a;
}
function impExt(task){
  if(!/搜索/.test(task.name)) return '{}';
  const words=['短剧小说','热门视频','美食教程','生活小技巧','搞笑段子','影视解说'];
  return JSON.stringify({openH5AdCount:2,sessionLookedCompletedCount:'1',sessionType:'1',searchKey:words[rnd(0,words.length-1)],triggerType:'2',disableReportToast:'true',businessEnterAction:'7',neoParams:task.linkUrl||''});
}
function parseAd(feed){
  const ret={title:'无广告数据',expectedCoin:1,creativeId:'',llsid:'',hasExtraTask:false};
  if(!feed) return ret;
  const ad=feed.ad||{}; ret.creativeId=ad.creativeId||'';
  const sp=String(feed.exp_tag||'').split('/'); if(sp.length>=2) ret.llsid=String(sp[1]).split('_')[0];
  try{ const ext=JSON.parse(ad.extData||'{}'); ret.expectedCoin=parseInt(ext.awardCoin||0,10)||ret.expectedCoin; }catch(e){}
  try{ const ins=(ad.adDataV2&&((ad.adDataV2.inspirePersonalize)||((ad.adDataV2.inspireAdInfo||{}).inspirePersonalize)))||null; if(ret.expectedCoin===1&&ins) ret.expectedCoin=parseInt(ins.awardValue||ins.neoValue||1,10)||1; }catch(e){}
  const p=(ad.adDataV2&&ad.adDataV2.product)||ad.product||{}; ret.title=p.name||((ad.adDataV2||{}).adTitle)||((ad.adDataV2||{}).mainTitle)||ad.title||feed.caption||ret.title;
  return ret;
}
async function encSign(acc, base64Data){
  const j=await postJson(acc.platform.signBase + '/encsign', {data:base64Data});
  if(j&&j.status&&j.data) return j.data;
  throw new Error('encsign 失败');
}
async function nsSign(acc, path, data){
  if(!acc.salt) throw new Error('缺少 salt，无法 nssig');
  const j=await postJson(acc.platform.signBase + '/nssig', {path, data, salt:acc.salt});
  if(j&&j.data) return {sig:j.data.sig,__NStokensig:j.data.nstokensig,__NS_sig3:j.data.nssig3,__NS_xfalcon:j.data.nssig4||''};
  throw new Error('nssig 失败');
}
async function userInfo(acc){
  const r=await getJson(acc.platform.userInfoUrl, {'Host':acc.platform.host,'User-Agent':'kwai-android aegon/3.56.0','Cookie':acc.cookie});
  const b=r.json;
  if(!(b&&b.result===1&&b.data)) throw new Error('Cookie 无效或查询用户失败');
  const ud=(b.data.userData||{}); const coin=acc.platform.type==='KUAISHOU'?parseInt(b.data.coinAmount||0,10):parseInt(b.data.totalCoin||0,10);
  const cash=acc.platform.type==='KUAISHOU'?b.data.cashAmountDisplay:b.data.allCash;
  return {nickname:ud.nickname||'未知昵称', coin:coin||0, cash:cash||0};
}
async function getAd(acc, taskKey){
  const task=acc.platform.tasks[taskKey], adPath='/rest/e/reward/mixed/ad';
  const common={encData:'|encData|',sign:'|sign|',cs:'false',client_key:acc.platform.adClientKey,videoModelCrowdTag:'1_23',os:'android','kuaishou.api_st':acc.apiSt};
  const imp={appInfo:{appId:acc.platform.type==='KUAISHOU'?'kuaishou':'kuaishou_nebula',name:acc.platform.name,packageName:acc.platform.type==='KUAISHOU'?'com.smile.gifmaker':'com.kuaishou.nebula',version:acc.appver,versionCode:-1},deviceInfo:{osType:1,osVersion:'13',deviceId:acc.did,screenSize:{width:parseInt(acc.device.sw||1080,10),height:parseInt(acc.device.sh||2400,10)},ftt:''},userInfo:{userId:acc.userId,age:0,gender:''},impInfo:[{pageId:task.pageId||100011251,subPageId:task.subPageId,action:0,browseType:/搜索/.test(task.name)?4:3,impExtData:impExt(task),mediaExtData:'{}'}]};
  const es=await encSign(acc,b64Utf8(JSON.stringify(imp))); common.encData=es.encdata; common.sign=es.sign;
  const postData=qs(common)+'&'+qs(acc.device);
  const ns=await nsSign(acc, adPath, postData);
  const finalUrl='https://api.e.kuaishou.com'+adPath+'?'+qs(Object.assign({},acc.device,ns));
  const r=await postForm(finalUrl, common, {'Host':'api.e.kuaishou.com','User-Agent':'kwai-android aegon/3.56.0','Cookie':acc.cookie});
  let b={}; try{b=JSON.parse(r.body||'{}');}catch(e){}
  if(b.errorMsg!=='OK' || !b.feeds || !b.feeds.length) throw new Error('广告获取失败');
  return parseAd(b.feeds[0]);
}
async function report(acc, taskKey, ad){
  const task=acc.platform.tasks[taskKey];
  const bizStr=JSON.stringify({businessId:task.businessId,endTime:Date.now(),extParams:'',mediaScene:'video',neoInfos:[{creativeId:ad.creativeId,extInfo:'',llsid:ad.llsid,requestSceneType:task.requestSceneType,taskType:task.taskType,watchExpId:'',watchStage:0}],pageId:task.pageId||100011251,posId:task.posId,reportType:0,sessionId:'',startTime:Date.now()-30000,subPageId:task.subPageId});
  const postData='bizStr='+enc(bizStr)+'&cs=false&client_key='+enc(acc.platform.reportClientKey);
  const ns=await nsSign(acc,'/rest/r/ad/task/report',acc.queryBase+'&'+postData);
  const finalUrl='https://api.e.kuaishou.com/rest/r/ad/task/report?'+acc.queryBase+'&'+qs(ns);
  const r=await postForm(finalUrl, postData, {'Host':'api.e.kuaishou.com','User-Agent':'kwai-android aegon/3.56.0','Cookie':acc.cookie});
  let b={}; try{b=JSON.parse(r.body||'{}');}catch(e){}
  if(b.result===1) return parseInt((b.data||{}).neoAmount||0,10)||0;
  if([20107,20108,1003,415].indexOf(b.result)>=0) throw new Error('今日已达上限');
  throw new Error(b.error_msg||b.errorMsg||('上报失败 result='+b.result));
}
async function runAcc(raw, args, idx){
  const acc=accountFromRaw(raw,args); const info=await userInfo(acc);
  log(`账号${idx} ${acc.platform.name}：${info.nickname}，金币 ${info.coin}`);
  const keys=args.task==='all'?['box','look','search']:[args.task]; let total=0, lines=[];
  for(let i=0;i<args.rounds;i++){
    const key=keys[i%keys.length]; const t=acc.platform.tasks[key];
    try{
      log(`账号${idx} 第${i+1}/${args.rounds}轮：${t.name}`);
      const ad=await getAd(acc,key); log(`广告：${ad.title}，预计 ${ad.expectedCoin} 金币，等待 ${args.waitSec}s`);
      await sleep(args.waitSec*1000);
      const coin=await report(acc,key,ad); total+=coin; lines.push(`${t.name}+${coin}`); log(`✅ ${t.name} +${coin}`);
    }catch(e){ lines.push(`${t.name}失败`); log(`⚠️ ${t.name}：${e.message||e}`); }
    await sleep(rnd(1000,3000));
  }
  return `账号${idx} ${info.nickname}：+${total}金币（${lines.join('，')}）`;
}
async function main(){
  const args=parseArgs();
  log(`开始：轮数=${args.rounds}，任务=${args.task}，等待=${args.waitSec}s`);
  const list=loadAccounts();
  if(!list.length){ notify(NAME,'缺少账号','请先打开快手/快手极速版，让插件抓取 Cookie。'); done(); return; }
  const out=[];
  for(let i=0;i<list.length;i++){
    try{ out.push(await runAcc(list[i],args,i+1)); }
    catch(e){ out.push(`账号${i+1}失败：${e.message||e}`); log(`账号${i+1}失败：${e.message||e}`); }
  }
  notify(NAME,`完成 ${list.length} 个账号`,out.join('\n'));
  done();
}

if(isRequest) onRequest(); else main();
