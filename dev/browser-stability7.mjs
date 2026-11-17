/** TASK7 browser regressions. Node built-ins + Chrome CDP, no package install. */
import {spawn} from 'node:child_process';
import {readFile, writeFile, rm, mkdir} from 'node:fs/promises';
import {fileURLToPath, pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
const root=fileURLToPath(new URL('.',import.meta.url));
const html=await readFile(new URL('index.html',import.meta.url),'utf8');
const hooks = `
window.__test={audio,stages,questionsById,BUILD,startGame,beginKeyboard,beginGuide,guideNext,finishOnboarding,renderOnboarding,guideText,processText,builtinLetter,spawnEnemy,removeEnemy,completeQuestion,checkWaves,completeVictory,finishGame,pauseGame,resumeGame,goMap,handleAction,teach,updateViewport,renderDebug,renderEnemy,positionEnemy,resetInput,loadSave,persist,configureInputs,castSpell,tick,spoken,stagePool,guideItems,
  replaceBuiltin(fn){builtinLetter=fn},setKeyboardSeen(value){keyboardSeen=value},cancelKeyboardWait,get game(){return game},get save(){return save},get uiTimers(){return uiTimers.size},get uiFrames(){return uiFrames.size},get pointers(){return keyPointers.size},get keyboardTimer(){return keyboardTimer},get countdownTimer(){return countdownTimer},get errors(){return recentErrors},get input(){return castInput},setLastTime(t){lastTime=t;},get screen(){return screen}};
window.__now7=performance.now();
window.__advance7=seconds=>{for(let i=0;i<Math.ceil(seconds/.05);i++){window.__now7+=50;tick(window.__now7);if(window.__virtual7)window.__drain7(50);window.__mock?.advance(.05);}};
`;
const fixture=html.replace('return {unlock, sync, speak, target,','return {pump, unlock, sync, speak, target,').replaceAll('requestAnimationFrame(tick);','if(!window.__manualRAF) requestAnimationFrame(tick);')
  .replace('  </script>\n</body>',hooks+'\n  </script>\n</body>');
await writeFile(new URL('.test7.html',import.meta.url),fixture);
const results = [];
const errors = [];
const check = (condition, label) => { assert.ok(condition, label); results.push(`PASS ${label}`); console.log(`PASS ${label}`); };
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const profile = '.chrome-stability-profile7';
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
  '--headless=new', '--no-first-run', '--no-default-browser-check', '--disable-background-networking',
  '--disable-component-update', '--disable-sync', '--disable-default-apps', '--hide-scrollbars',
  '--remote-debugging-port=0', `--user-data-dir=${root}${profile}`, 'about:blank',
], {stdio: ['ignore', 'ignore', 'pipe']});
const endpoint = await new Promise((resolve, reject) => {
  let output = '';
  chrome.stderr.on('data', chunk => {
    output += chunk;
    const match = output.match(/DevTools listening on (ws:\/\/[^\s]+)/);
    if (match) resolve(match[1]);
  });
  chrome.on('exit', code => reject(new Error(`Chrome early exit ${code}`)));
  setTimeout(() => reject(new Error('Chrome startup timeout')), 15000).unref();
});
const ws = new WebSocket(endpoint);
await new Promise(resolve => ws.addEventListener('open', resolve, {once: true}));
let serial = 0;
const pending = new Map();
ws.addEventListener('message', event => {
  const message = JSON.parse(event.data);
  if (message.id) {
    const item = pending.get(message.id);
    if (!item) return;
    pending.delete(message.id);
    if (message.error) item.reject(new Error(JSON.stringify(message.error)));
    else item.resolve(message.result);
  }
  if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text);
  if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') errors.push(JSON.stringify(message.params.args));
  if (message.method === 'Log.entryAdded' && message.params.entry.level === 'error') errors.push(message.params.entry.text);
});
function cdp(method, params = {}, sessionId) {
  return new Promise((resolve, reject) => {
    const id = ++serial;
    pending.set(id, {resolve, reject});
    ws.send(JSON.stringify({id, method, params, ...(sessionId ? {sessionId} : {})}));
  });
}
const {targetId} = await cdp('Target.createTarget', {url: 'about:blank'});
const {sessionId} = await cdp('Target.attachToTarget', {targetId, flatten: true});
const send = (method, params) => cdp(method, params, sessionId);
async function evaluate(expression) {
  const result = await send('Runtime.evaluate', {expression, returnByValue: true, awaitPromise: true});
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  return result.result.value;
}
async function waitFor(expression, timeout = 10000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await evaluate(expression)) return;
    await delay(45);
  }
  throw new Error(`Timeout: ${expression}`);
}

async function press(key) {
  const code = /^[a-z]$/i.test(key) ? `Key${key.toUpperCase()}` : key;
  await send('Input.dispatchKeyEvent', {type: 'keyDown', key, code, windowsVirtualKeyCode: key === 'Enter' ? 13 : key === 'Escape' ? 27 : key === 'Tab' ? 9 : key === 'Backspace' ? 8 : key.toUpperCase().charCodeAt(0), ...(key === 'Enter' ? {text: '\r'} : key.length === 1 ? {text: key} : {})});
  await send('Input.dispatchKeyEvent', {type: 'keyUp', key, code});
}

async function load() {
  await evaluate(`window.__smokeBeforeNavigation=true`);
  await send('Page.navigate', {url: pathToFileURL(`${root}.test7.html`).href});
  await waitFor(`!window.__smokeBeforeNavigation && document.readyState === 'complete' && document.querySelectorAll('.stage-node').length > 0`);
}
async function metrics(width=390, height=844, mobile=true) {
  await send('Emulation.setDeviceMetricsOverride', {width,height,deviceScaleFactor:mobile?3:1,mobile});
  await send('Emulation.setTouchEmulationEnabled', {enabled:mobile,maxTouchPoints:5});
  await evaluate(`if(window.visualViewport)delete visualViewport.height;window.__test?.updateViewport();`);
}
async function touch(selector, dx=0, dy=0) {
  const r = await evaluate(`(() => { const e=[...document.querySelectorAll(${JSON.stringify(selector)})].find(e=>e.getClientRects().length&&!e.closest('[hidden]')); if(!e)throw Error('Missing touch '+${JSON.stringify(selector)});e.scrollIntoView({block:'nearest'});const r=e.getBoundingClientRect();return {x:r.x+r.width/2+${dx},y:r.y+r.height/2+${dy}}; })()`);
  await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...r,id:1}]});
  await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
}





async function mockKeyboard(height) {
  // Native headless has no OS keyboard: override only visualViewport geometry/events.
  await evaluate(`(() => {const vv=visualViewport;Object.defineProperty(vv,'height',{configurable:true,get:()=>${height}});vv.dispatchEvent(new Event('resize'));})()`);
}




const instrumentation = `
window.__manualRAF=true;
window.__virtual7=false;
window.__virtualTime7=0;
window.__virtualTimers7=new Map();
let nextVirtual=-1;
const nativeSetTimeout=window.setTimeout.bind(window),nativeClearTimeout=window.clearTimeout.bind(window);
window.__timeoutIds7=new Set();window.__intervalIds7=new Set();
window.setTimeout=(callback,ms=0,...args)=>{
 if(window.__virtual7){const id=nextVirtual--;window.__virtualTimers7.set(id,{at:window.__virtualTime7+ms,callback:()=>callback(...args)});return id;}
 let id=nativeSetTimeout(()=>{window.__timeoutIds7.delete(id);callback(...args)},ms);window.__timeoutIds7.add(id);return id;
};
window.clearTimeout=id=>{window.__virtualTimers7.delete(id);window.__timeoutIds7.delete(id);nativeClearTimeout(id)};
const nativeSetInterval=window.setInterval.bind(window),nativeClearInterval=window.clearInterval.bind(window);
window.setInterval=(...args)=>{const id=nativeSetInterval(...args);window.__intervalIds7.add(id);return id;};
window.clearInterval=id=>{window.__intervalIds7.delete(id);nativeClearInterval(id);};
window.__drain7=ms=>{window.__virtualTime7+=ms;for(const [id,t]of [...window.__virtualTimers7])if(t.at<=window.__virtualTime7){window.__virtualTimers7.delete(id);t.callback();}};
window.__listenerCount7=0;
const nativeAdd=EventTarget.prototype.addEventListener,nativeRemove=EventTarget.prototype.removeEventListener;
EventTarget.prototype.addEventListener=function(...args){window.__listenerCount7++;return nativeAdd.apply(this,args);};
EventTarget.prototype.removeEventListener=function(...args){window.__listenerCount7--;return nativeRemove.apply(this,args);};
`;
const mock=await readFile(new URL('audio-mock4.js',import.meta.url),'utf8');
const speechMock=`
__mock.speechMode='normal';__mock.calls=[];
speechSynthesis.paused=false;speechSynthesis.speaking=false;speechSynthesis.pending=false;
speechSynthesis.resume=()=>{speechSynthesis.paused=false;__mock.calls.push({type:'resume',at:performance.now()});};
speechSynthesis.speak=u=>{
 __mock.calls.push({type:'speak',text:u.text,volume:u.volume,at:performance.now()});__mock.utterance=u;
 if(__mock.speechMode==='no-start'&&u.volume!==0)return;
 speechSynthesis.speaking=true;u.onstart?.();
 if(u.volume===0)setTimeout(()=>{if(__mock.utterance===u){speechSynthesis.speaking=false;u.onend?.();}},20);
};
speechSynthesis.cancel=()=>{__mock.calls.push({type:'cancel',at:performance.now()});speechSynthesis.speaking=false;const u=__mock.utterance;__mock.utterance=null;u?.onerror?.({error:'canceled'});};
`;
async function shot(name){const {data}=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await writeFile(new URL('shots7/'+name+'.png',import.meta.url),Buffer.from(data,'base64'));}
async function start(id='r2-1', {guide=false}={}){
 await evaluate(`(()=>{const t=__test;t.save.settings.onboarding=true;t.save.settings.keyboardMode='builtin';t.save.settings.muted=false;for(const s of t.stages)t.save.records[s.id]={stars:3,bestScore:0,bestSpeed:0,attempts:1};t.startGame(t.stages.find(s=>s.id===${JSON.stringify(id)}),${!guide});})()`);
}
async function activate(){
 await evaluate(`__test.beginKeyboard()`);
 await waitFor(`!__test.game.paused`,5000);
 await evaluate(`__test.setLastTime(__now7);__advance7(.4)`);
}
async function pointer(key,id=1,type='pointerdown'){
 await evaluate(`(()=>{const key=document.querySelector('[data-key="${key}"]');const r=key.getBoundingClientRect();document.querySelector('#builtin-keyboard').dispatchEvent(new PointerEvent('${type}',{bubbles:true,cancelable:true,pointerType:'touch',pointerId:${id},clientX:r.x+r.width/2,clientY:r.y+r.height/2}));})()`);
}
async function checkBaseline(label){
 await evaluate(`__test.goMap()`);await delay(420);
 const state=await evaluate(`({ui:__test.uiTimers,frames:__test.uiFrames,keys:__test.pointers,keyboard:__test.keyboardTimer,count:__test.countdownTimer,intervals:__intervalIds7.size,timeouts:__timeoutIds7.size,listeners:__listenerCount7,enemies:document.querySelectorAll('.enemy').length})`);
 check(state.ui===0&&state.frames===0&&state.keys===0&&!state.keyboard&&!state.count&&!state.intervals&&state.timeouts<=baseline.timeouts&&state.listeners===baseline.listeners&&!state.enemies,label+' '+JSON.stringify(state));
}
let baseline;
try{
 await mkdir(new URL('shots7',import.meta.url),{recursive:true});
 await send('Runtime.enable');await send('Log.enable');await send('Page.enable');await metrics();
 await send('Page.addScriptToEvaluateOnNewDocument',{source:instrumentation+mock+speechMock});
 await load();await evaluate(`__test.audio.unlock()`);await delay(450);
 baseline=await evaluate(`({timeouts:__timeoutIds7.size,listeners:__listenerCount7})`);
 check(await evaluate(`__test.save.settings.keyboardMode==='builtin'&&__test.save.settings.builtinMigrated`),'新存檔預設內建鍵盤與遷移旗標');
 const migrations=await evaluate(`(()=>{const t=__test;const results=[];for(const raw of ['bad','null','[]','{"version":2,"settings":{}}','{"version":1,"settings":{"keyboardMode":"pinyin"}}','{"version":2,"settings":{"keyboardMode":"pinyin","builtinMigrated":true}}','{"version":2,"records":{"r1-1":{"stars":"wrong","attempts":1e400}},"review":{"__proto__":{"count":3}},"learned":["__proto__","no-id"]}']){localStorage.setItem('pinyin-keep-save-v2',raw);const s=t.loadSave();results.push({mode:s.settings.keyboardMode,learned:s.learned,review:Object.keys(s.review),attempts:s.records['r1-1']?.attempts});}t.persist();return results;})()`);
 check(migrations.slice(0,5).every(x=>x.mode==='builtin')&&migrations[5].mode==='pinyin'&&migrations[6].learned.length===0&&migrations[6].review.length===0&&migrations[6].attempts===0,'壞 JSON、型別錯、舊版遷移與手動切回系統鍵盤 '+JSON.stringify(migrations));
 // Full ordinary-stage flow through real buttons, with every focus recorded.
 await evaluate(`window.__badFocus7=[];document.addEventListener('focusin',e=>{if(__test.game&&!__test.game.ime&&__test.save.settings.keyboardMode==='builtin'&&e.target.matches('input,textarea'))__badFocus7.push(e.target.id);});__test.save.settings.onboarding=false;__test.save.records={};__test.persist();`);
 // The focus observer is test-only and contributes one stable listener.
 baseline.listeners++;
 await touch('[data-action="stage"][data-id="r1-1"]');await touch('[data-action="start"]');
 check(await evaluate(`__test.game.training&&__test.game.paused`),'地圖→教學卡→操作教學準備');
 await touch('#start-overlay [data-action="ready"]');
 check(await evaluate(`document.querySelector('#start-reason').textContent==='3'&&!document.activeElement.matches('input,textarea')&&!__test.keyboardTimer`),'內建模式開始直接倒數、沒有鍵盤等待與 input 焦點');
 await waitFor(`!__test.game.paused`,5000);
 await evaluate(`for(const key of ['b','p','b','p'])__test.builtinLetter(key);`);
 check(await evaluate(`__test.game.onboarding===3&&!document.querySelector('#tutorial-info').hidden`),'操作教學四步完整前進');
 check(await evaluate(`(()=>{const t=__test;const before=t.game.paused;t.updateViewport();return t.game.paused===before;})()`),'noKeyboardNeeded 操作說明卡更新 viewport 不暫停');
 await evaluate(`__test.save.settings.keyboardMode='pinyin';__test.configureInputs();__test.setKeyboardSeen(true);`);
 await mockKeyboard(420);await mockKeyboard(844);
 check(await evaluate(`!__test.game.paused&&__test.game.onboarding===3&&document.querySelector('#start-overlay').hidden`),'noKeyboardNeeded 在系統鍵盤模式收起鍵盤仍停留操作說明卡');
 await evaluate(`__test.save.settings.keyboardMode='builtin';__test.configureInputs();`);

 await touch('[data-action="onboarding-done"]');
 check(await evaluate(`__test.game.guide.items.length===__test.game.stage.pool.length&&__test.game.guide.step==='look'`),'操作教學→本關全部項目看卡');
 for(let i=0;i<8;i++)await touch('[data-action="guide-next"]');
 await waitFor(`!__test.game.paused`,5000);
 await evaluate(`for(let round=0;round<2;round++)for(const q of __test.game.guide.items)for(const c of q.pinyin)__test.builtinLetter(c);`);
 check(await evaluate(`!__test.game.guide&&__test.game.paused&&__test.game.elapsed===0`),'全部跟練與自測→準備，遊戲時間維持零');
 await activate();
 const solve=await evaluate(`(()=>{const t=__test;let frame=0;while(t.game.running&&!t.game.completing&&frame++<5000){__advance7(.1);const e=t.game.enemies[0];if(e)for(const c of e.q.pinyin.slice(e.progress))t.builtinLetter(c);}return {completing:t.game.completing,focus:__badFocus7,kills:t.game.kills};})()`);
 check(solve.completing&&solve.kills===12&&!solve.focus.length,'內建鍵盤整場 12 波完成，從未聚焦 input／textarea');
 await waitFor(`__test.screen==='result'`,1500);
 check(await evaluate(`__test.save.records['r1-1'].stars===3`),'最後一擊確實結算且星等入檔');
 await touch('[data-action="restart"]');
 check(await evaluate(`!__test.game.guide&&!__test.game.training&&__test.game.paused`),'restart 跳過引導');
 await checkBaseline('重來→返回地圖，計時器與監聽回基準');
 await touch('[data-action="stage"][data-id="r1-1"]');
 check(await evaluate(`!!document.querySelector('[data-action="replay-guide"]')`),'已過關教學卡提供重看教學');
 await touch('[data-action="start"]');
 check(await evaluate(`!__test.game.guide&&!__test.game.training`),'已過關開始直接戰鬥準備');
 await checkBaseline('已過關開始→地圖清理');
 await touch('[data-action="stage"][data-id="r1-1"]');await touch('[data-action="replay-guide"]');
 check(await evaluate(`__test.game.guide.step==='look'&&__test.game.guide.items.length===8`),'重看教學確實還原全部八題引導');
 await checkBaseline('重看引導→地圖清理');
 // Independent pointer IDs, gaps, no repeats and bubble cleanup.
 await start('r4-3');await activate();
 await evaluate(`const t=__test;const q=t.questionsById[t.game.stage.pool[0]];const e=t.game.enemies[0];e.q=q;e.progress=0;t.resetInput();t.renderEnemy(e);window.__keys7=[];window.__originalBuiltin7=t.builtinLetter;__test.replaceBuiltin(key=>__keys7.push(key));`);
 await pointer('q',11);await pointer('w',12);await pointer('q',11);
 check(await evaluate(`__keys7.join('')==='qw'&&__test.pointers===2&&document.querySelectorAll('.key-bubble').length===2`),'兩個 pointerId 交錯按下各觸發一次，長按不重複，兩顆字母氣泡');
 await shot('keyboard-bubbles');
 await pointer('q',11,'pointerup');await pointer('w',12,'pointercancel');
 await evaluate(`(()=>{const k=document.querySelector('[data-key="q"]').getBoundingClientRect();const board=document.querySelector('#builtin-keyboard');for(const x of [k.right+2,board.getBoundingClientRect().left+1]){board.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,pointerId:33,pointerType:'touch',clientX:x,clientY:k.y+10}));board.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,pointerId:33}));}__test.replaceBuiltin(__originalBuiltin7);})()`);
 check(await evaluate(`__keys7.length===4&&__test.pointers===0&&!document.querySelector('.key-bubble')`),'鍵縫／邊緣判給最近鍵，pointerup／cancel 完整釋放');
 // Rapid keys must leave the latest locked question audible.
 await start('r2-3');await activate();
 await evaluate(`(()=>{const t=__test;for(let i=t.game.enemies.length;i<t.game.maxEnemies;i++)if(!t.spawnEnemy())break;t.audio.stopSpeech();__mock.calls=[];const e=t.game.enemies.find(e=>e.q.pinyin.length>=3)||t.game.enemies[0];t.game.locked=e.id;t.audio.target(true);window.__spoken7=t.spoken(e.q);for(const c of e.q.pinyin.slice(0,-1))t.builtinLetter(c);t.spawnEnemy();})()`);
 await waitFor(`__mock.calls.some(c=>c.type==='speak'&&c.text===__spoken7)`,2000);
 await delay(130);
 const calls=await evaluate(`__mock.calls`);
 check(await evaluate(`__mock.calls.some(c=>c.type==='speak'&&c.text===__spoken7)`),'快速連打＋同場多怪仍 speak 目前鎖定題目');
 check(calls.every((c,i)=>c.type!=='cancel'||!calls.slice(0,i).findLast(x=>x.type==='speak')||c.at-calls.slice(0,i).findLast(x=>x.type==='speak').at>=100),'語音 speak 後 100ms 內未被按鍵 cancel');
 await evaluate(`__test.audio.stopSpeech();__mock.calls=[];__test.audio.speak('舊句');__test.audio.speak('中句');__test.audio.speak('最新一句');`);
 await waitFor(`__mock.calls.some(c=>c.text==='最新一句')`);
 check(await evaluate(`!__mock.calls.some(c=>['舊句','中句'].includes(c.text))`),'單一待播佇列只留下最新一句');
 check(await evaluate(`__mock.calls.every((c,i)=>c.type!=='speak'||!__mock.calls.slice(0,i).findLast(x=>x.type==='cancel')||c.at-__mock.calls.slice(0,i).findLast(x=>x.type==='cancel').at>=100)`),'cancel→speak 至少 100ms 安全間隔');
 await evaluate(`__test.audio.stopSpeech();speechSynthesis.paused=true;__test.audio.speak('恢復語音');`);
 await waitFor(`__mock.calls.some(c=>c.text==='恢復語音')`);
 check(await evaluate(`!speechSynthesis.paused&&__mock.calls.some(c=>c.type==='resume')`),'paused 引擎在 speak 前 resume');
 await evaluate(`__test.audio.stopSpeech();__mock.speechMode='no-start';__mock.calls=[];__test.audio.speak('測試看門狗');`);
 await waitFor(`__test.audio.diagnostics.speechBroken`,4500);
 check(await evaluate(`__mock.calls.filter(c=>c.text==='測試看門狗').length===2&&__test.audio.diagnostics.history.at(-1).events.some(e=>e.includes('語音無回應'))&&__test.game.running`),'1.5 秒 onstart 看門狗重試一次，兩次無回應留下診斷且遊戲持續');
 await evaluate(`__mock.speechMode='normal';__test.audio.speak('恢復成功');`);
 await waitFor(`__test.audio.diagnostics.history.at(-1).events.includes('start')`);
 check(await evaluate(`!__test.audio.diagnostics.speechBroken`),'失敗後測試語音可恢復');
 await evaluate(`__test.pauseGame()`);
 check(await evaluate(`!!document.querySelector('#start-overlay [data-action="test-speech"]')`),'暫停選單含測試語音');
 await touch('#start-overlay [data-action="test-speech"]');
 await waitFor(`__mock.calls.some(c=>c.text==='你好，跟著聲音一起練習拼音。')`);
 await checkBaseline('暫停與測試語音→地圖清理');
 const geometries=[];
 for(const [w,h] of [[360,640],[375,667],[390,844],[430,932],[390,560],[844,390]]){
  await metrics(w,h);await start('r4-3');await activate();
  await evaluate(`(()=>{const t=__test;const q=t.game.stage.pool.map(id=>t.questionsById[id]).find(q=>[...q.text].length===4);for(let i=t.game.enemies.length;i<t.game.maxEnemies;i++)if(!t.spawnEnemy())break;for(const e of t.game.enemies){e.q=q;t.renderEnemy(e);t.positionEnemy(e);}})()`);
  const g=await evaluate(`(()=>{const rect=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,w:r.width,h:r.height}};return {w:innerWidth,h:visualViewport.height,field:rect(document.querySelector('#battlefield')),cast:rect(document.querySelector('#spell-form')),board:rect(document.querySelector('#builtin-keyboard')),hud:rect(document.querySelector('.hud')),key:rect(document.querySelector('[data-key="q"]')),keyTextFits:[...document.querySelectorAll('#builtin-keyboard button')].every(e=>e.scrollHeight<=e.clientHeight+1),keyBounds:[...document.querySelectorAll('#builtin-keyboard button')].map(rect),cards:[...document.querySelectorAll('.enemy .question-card')].map(rect),creatures:[...document.querySelectorAll('.enemy .creature')].map(rect),scroll:document.documentElement.scrollWidth}})()`);
  geometries.push(g);
  check(g.keyTextFits&&g.keyBounds.every(r=>r.bottom<=h+1)&&g.scroll<=w&&g.board.bottom<=h+1&&g.cast.bottom<=g.board.y+1&&g.field.y>=g.hud.bottom&&g.field.bottom<=g.cast.y+1&&g.cards.every(r=>r.x>=g.field.x&&r.right<=g.field.right+.5&&r.bottom<=g.field.bottom+.5)&&g.creatures.every(r=>r.bottom<=g.field.bottom+.5),`${w}×${h} 戰場、四字題卡、HUD、鍵盤無裁切／重疊 `+JSON.stringify({...g,keyBounds:undefined}));
  if(h>=640)check(g.key.h>=42&&g.key.h<=46&&g.board.h/h>=.30&&g.board.h/h<=.34,`${w}×${h} 原生比例鍵高與整體 30–34%`);
  await shot(`${w}x${h}-battle`);
 }
 await writeFile(new URL('geometry7.json',import.meta.url),JSON.stringify(geometries,null,2)+'\n');
 await metrics();await start();await activate();
 await evaluate(`__test.save.settings.debug=true;__test.renderDebug();`);await delay(50);
 check(await evaluate(`document.querySelector('#debug-speech').textContent.includes('voices=3')&&document.querySelector('#debug-errors').textContent.includes('v0.7.0')`),'偵錯面板顯示 voice 名稱、語系、狀態、五筆紀錄與版本');
 await shot('debug-speech');
 await evaluate(`__test.save.settings.debug=false;__test.renderDebug();__test.goMap();__test.handleAction('settings');document.querySelector('.build-info').scrollIntoView({block:'center'});`);
 check(await evaluate(`document.querySelector('.build-info').textContent.includes('v0.7.0')&&document.querySelector('.build-info').textContent.includes('2026-11-17')`),'設定頁最下方版本及完整建置時間');
 await shot('settings-version');await evaluate(`__test.goMap()`);
 await start('r5-1');
 await evaluate(`__test.beginKeyboard()`);await mockKeyboard(500);
 await waitFor(`!__test.game.paused`,5000);
 await mockKeyboard(844);
 check(await evaluate(`__test.game.paused&&document.querySelectorAll('#start-overlay button').length===1&&document.querySelector('#start-overlay button').textContent==='點我繼續打字'`),'第五區收起鍵盤只顯示單一繼續打字按鈕');
 await touch('#start-overlay [data-action="ready"]');await mockKeyboard(500);await waitFor(`!__test.game.paused`,5000);
 check(await evaluate(`document.activeElement===__test.input&&__test.input.type==='text'`),'第五區點繼續同步重新聚焦系統輸入框');
 await checkBaseline('第五區重聚焦→返回地圖清理');await mockKeyboard(844);
 await start('r2-3');await activate();
 const atomic=await evaluate(`(()=>{const t=__test;const g=t.game;const e=g.enemies[0];const original=g.kills;t.completeQuestion(e);t.completeQuestion(e);return g.kills===original+1;})()`);
 check(atomic,'同一怪物重複完成事件只計分一次');
 await start('r2-1');await activate();
 await evaluate(`(()=>{const t=__test;t.save.settings.keyboardMode='english';t.configureInputs();const e=t.game.enemies[0];t.input.value=e.q.pinyin;t.input.dispatchEvent(new Event('input',{bubbles:true}));})()`);
 check(await evaluate(`__test.game.kills===1&&!__test.errors.length`),'缺少 inputType 的一般 input 事件仍可正確擊倒');
 await evaluate(`__test.save.settings.keyboardMode='builtin';__test.configureInputs();`);

 await evaluate(`(()=>{const t=__test;const g=t.game;while(!g.enemies.length)t.spawnEnemy();const e=g.enemies[0];g.locked=e.id;t.input.value=e.q.pinyin.slice(0,1);e.progress=1;t.removeEnemy(e);})()`);
 check(await evaluate(`!__test.game.locked&&__test.input.value===''`),'鎖定怪抵達城門／移除時清除舊輸入');
 for(const finish of ['defeat','gate','parked','boss']){
  await start(finish==='boss'?'r2-boss':'r2-1');await activate();
  await evaluate(`(()=>{const t=__test;const g=t.game;const e=g.enemies[0];g.spawned=g.total;g.enemies.filter(x=>x!==e).forEach(x=>t.removeEnemy(x));g.parked=[];if('${finish}'==='boss'){g.bossHP=1;t.completeQuestion(e);}else if('${finish}'==='defeat'){t.completeQuestion(e);}else if('${finish}'==='gate'){e.x=0;__advance7(.1);}else{g.parked.push(e);g.enemies=[];e.element.hidden=true;t.checkWaves();const parked=g.enemies[0];t.completeQuestion(parked);}})()`);
  await waitFor(`__test.screen==='result'`,1500);
  check(await evaluate(`!__test.game.running`),`${finish} 最後一隻／停放怪／王血歸零必定結算`);
 }
 for(const transition of ['guide','countdown','pause','hidden','blur','popstate','pagehide']){
  await start('r1-1',{guide:transition==='guide'});
  if(transition==='countdown')await evaluate(`__test.beginKeyboard()`);
  if(!['guide','countdown'].includes(transition))await activate();
  await evaluate(`(()=>{const t=__test;switch('${transition}'){case'pause':t.pauseGame();break;case'hidden':Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'));Object.defineProperty(document,'hidden',{configurable:true,get:()=>false});document.dispatchEvent(new Event('visibilitychange'));break;case'blur':window.dispatchEvent(new Event('blur'));break;case'popstate':window.dispatchEvent(new PopStateEvent('popstate'));break;case'pagehide':window.dispatchEvent(new PageTransitionEvent('pagehide'));window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}));break;}})()`);
  if(transition==='hidden')check(await evaluate(`__test.game.paused&&!speechSynthesis.paused`),'背景返回前景維持遊戲暫停並 resume 語音引擎');
  await checkBaseline(`${transition} 狀態轉換後計時器／監聽回基準`);
 }
 await metrics(1280,720,false);await start();await activate();
 check(await evaluate(`document.querySelector('#builtin-keyboard').hidden`),'非觸控桌機預設隱藏內建鍵盤');
 const desktop=await evaluate(`(()=>{const t=__test;const e=t.game.enemies[0];for(const c of e.q.pinyin)document.dispatchEvent(new KeyboardEvent('keydown',{key:c,bubbles:true}));return t.game.kills;})()`);
 check(desktop===1,'桌機實體鍵盤照常擊倒');
 await metrics();await start();await activate();
 await press('a');
 check(await evaluate(`document.querySelector('#builtin-keyboard').hidden`),'觸控裝置偵測實體鍵盤輸入後隱藏內建鍵盤');
 await evaluate(`document.dispatchEvent(new PointerEvent('pointerdown',{pointerType:'touch',bubbles:true}));`);
 check(await evaluate(`!document.querySelector('#builtin-keyboard').hidden`),'再次觸控恢復內建鍵盤');
 const optional=await evaluate(`(()=>{const t=__test;const vv=window.visualViewport;Object.defineProperty(window,'visualViewport',{configurable:true,value:undefined});Object.defineProperty(navigator,'vibrate',{configurable:true,value:undefined});t.updateViewport();t.builtinLetter('delete');Object.defineProperty(window,'visualViewport',{configurable:true,value:vv});return t.errors.length===0;})()`);
 check(optional,'visualViewport／Vibration 不存在時安全運作');
 await checkBaseline('桌機／觸控切換後清理');
 const endurance=await evaluate(`(()=>{
  const t=__test;
  const snapshots=[];
  t.save.settings.muted=true;
  t.audio.settingsChanged();
  window.__virtual7=true;
  for(const id of ['r1-4','r2-2','r3-5','r4-3','r2-boss']){
   t.startGame(t.stages.find(s=>s.id===id),true);
   t.cancelKeyboardWait();
   t.game.paused=false;
   document.querySelector('#start-overlay').hidden=true;
   t.game.hp=t.game.maxHP=100000;
   t.game.speed=Math.min(t.game.speed,.2);
   if(t.game.boss)t.spawnEnemy();
   t.setLastTime(__now7);
   let nextAnswer=12;
   for(let frame=0;frame<2400;frame++){
    __advance7(.05);
    if(t.game.elapsed>=nextAnswer){
     const e=t.game.enemies[0];
     if(e)for(const c of e.q.pinyin.slice(e.progress))t.builtinLetter(c);
     nextAnswer=t.game.elapsed+12;
    }
   }
   for(let frame=0;frame<1000&&!t.game.completing;frame++){
    __advance7(.05);
    const e=t.game.enemies[0];
    if(e)for(const c of e.q.pinyin.slice(e.progress))t.builtinLetter(c);
   }
   const elapsed=t.game.elapsed;
   __drain7(1000);
   const finished=t.screen==='result';
   t.goMap();__drain7(5000);t.audio.pump();__mock.advance(5);
   snapshots.push({id,elapsed,finished,nodes:document.querySelectorAll('*').length,timers:__virtualTimers7.size,intervals:__intervalIds7.size,ui:t.uiTimers,audio:t.audio.diagnostics.active,listeners:__listenerCount7,peak:t.audio.diagnostics.peak,released:t.audio.diagnostics.released,created:t.audio.diagnostics.created});
  }
  window.__virtual7=false;
  return snapshots;
 })()`);
 await writeFile(new URL('endurance7.json',import.meta.url),JSON.stringify(endurance,null,2)+'\n');
 check(endurance.length===5&&endurance.every(x=>x.elapsed>=119.9&&x.finished&&x.ui===0&&x.timers<=1&&x.intervals===0&&x.audio===0&&x.listeners===baseline.listeners&&x.peak<=48)&&Math.max(...endurance.map(x=>x.nodes))-Math.min(...endurance.map(x=>x.nodes))<25,'10 分鐘／連續五關 DOM、timer、listener 與音訊節點維持界限 '+JSON.stringify(endurance));
 await evaluate(`__test.save.settings.muted=false;__test.audio.settingsChanged();`);

 // Reload each meaningful state and verify a fresh map with no inherited work.
 for(const state of ['teach','onboarding','guide','ready','countdown','battle','pause','result']){
  await start('r1-1',{guide:state==='guide'});
  if(state==='teach')await evaluate(`__test.goMap();__test.teach(__test.stages[0]);`);
  if(state==='onboarding')await evaluate(`__test.save.settings.onboarding=false;__test.save.records['r1-1'].stars=0;__test.startGame(__test.stages[0],false);`);
  if(state==='countdown')await evaluate(`__test.beginKeyboard()`);
  if(state==='battle'||state==='pause')await activate();
  if(state==='pause')await evaluate(`__test.pauseGame()`);
  if(state==='result')await evaluate(`__test.finishGame(false)`);
  await evaluate(`window.__beforeReload7=true`);await send('Page.reload');await waitFor(`!window.__beforeReload7&&window.__test&&__test.screen==='map'&&!__test.game`);
  check(await evaluate(`!__test.keyboardTimer&&!__test.countdownTimer&&!__test.uiTimers&&!document.querySelector('.enemy')&&!__test.errors.length`),state+' 重新整理回地圖，沒有舊怪／計時器／輸入狀態');
 }
 // Version notice appears once per new build, and the silent speech unlock settles.
 await evaluate(`localStorage.setItem('pinyin-build','v0.6.0')`);
 await evaluate(`window.__beforeReload7=true`);await send('Page.reload');await waitFor(`!window.__beforeReload7&&window.__test&&__test.screen==='map'`);
 check(await evaluate(`document.querySelector('#toast').textContent.includes('已更新到新版本 v0.7.0')&&localStorage.getItem('pinyin-build')==='v0.7.0'`),'版本變更提示並記錄最新版');
 await evaluate(`__test.audio.unlock();__test.audio.speak('解鎖之後第一句');`);
 await waitFor(`__mock.calls.some(c=>c.text==='解鎖之後第一句')`);
 check(await evaluate(`(()=>{const a=__mock.calls.find(c=>c.type==='speak'&&c.volume===0);const b=__mock.calls.find(c=>c.text==='解鎖之後第一句');return b.at-a.at>=15;})()`),'第一句真語音等待靜音 utterance onend 完成');
 await evaluate(`window.__beforeReload7=true`);await send('Page.reload');await waitFor(`!window.__beforeReload7&&window.__test&&__test.screen==='map'`);
 await evaluate(`__mock.speechMode='no-start';const original=speechSynthesis.speak;speechSynthesis.speak=u=>{if(u.volume===0){__mock.calls.push({type:'speak',text:u.text,volume:0,at:performance.now()});__mock.utterance=u;}else original(u)};__test.audio.unlock();__test.audio.speak('解鎖逾時第一句');`);
 await waitFor(`__mock.calls.some(c=>c.text==='解鎖逾時第一句')`);
 check(await evaluate(`(()=>{const a=__mock.calls.find(c=>c.type==='speak'&&c.volume===0);const b=__mock.calls.find(c=>c.text==='解鎖逾時第一句');return b.at-a.at>=400;})()`),'靜音解鎖沒有 onend 時 300ms 逾時加安全間隔後播放');
 await evaluate(`__test.audio.stopSpeech();__mock.speechMode='normal'`);

 const {identifier:optionalId}=await send('Page.addScriptToEvaluateOnNewDocument',{source:`Object.defineProperty(window,'visualViewport',{configurable:true,value:undefined});window.AudioContext=undefined;window.webkitAudioContext=undefined;Object.defineProperty(navigator,'vibrate',{configurable:true,value:undefined});`});
 await evaluate(`window.__beforeReload7=true`);await send('Page.reload');await waitFor(`!window.__beforeReload7&&window.__test&&__test.screen==='map'`);
 await start('r1-1');await activate();
 await evaluate(`const t=__test;const e=t.game.enemies[0];for(const c of e.q.pinyin)t.builtinLetter(c);`);
 await pointer('q',91);await pointer('q',91,'pointerup');
 check(await evaluate(`__test.game.kills===1&&__test.audio.diagnostics.failed&&!__test.errors.length`),'AudioContext／visualViewport／Vibration 全缺仍可啟動、按鍵與擊倒');
 await send('Page.removeScriptToEvaluateOnNewDocument',{identifier:optionalId});
 await evaluate(`__test.goMap()`);
 check(await evaluate(`__test.errors.length===0`),'正常遊玩沒有全域例外');
 await evaluate(`for(let i=0;i<6;i++)window.dispatchEvent(new ErrorEvent('error',{message:'測試錯誤 '+i,lineno:70+i}));window.dispatchEvent(new PromiseRejectionEvent('unhandledrejection',{promise:Promise.resolve(),reason:Error('測試拒絕')}));__test.save.settings.debug=true;__test.renderDebug();`);
 check(await evaluate(`__test.errors.length===5&&__test.errors[0].line===72&&document.querySelector('#debug-errors').textContent.includes('測試拒絕')`),'全域 error／unhandledrejection 保留最近五筆、訊息與行號');
 await shot('debug-errors');
 check(errors.length===0,'全部 TASK7 正常流程 0 console error／runtime exception '+JSON.stringify(errors));
 console.log('全部 '+results.length+' 項 TASK7 瀏覽器檢查通過');
}catch(error){console.error(error);results.push('FAIL '+error.stack);process.exitCode=1;await shot('failure').catch(()=>{});}
finally{
 await writeFile(new URL('browser-stability7-checks.txt',import.meta.url),results.join('\n')+'\nErrors '+JSON.stringify(errors)+'\n');
 await cdp('Browser.close').catch(()=>{});ws.close();
 if(chrome.exitCode===null)await new Promise(resolve=>chrome.once('exit',resolve));
 chrome.stderr.destroy();chrome.unref();
 await rm(new URL(profile,import.meta.url),{recursive:true,force:true});
 await rm(new URL('.test7.html',import.meta.url),{force:true});
}
