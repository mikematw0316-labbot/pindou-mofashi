/** TASK7 browser regressions. Node built-ins + Chrome CDP, no package install. */
import {spawn} from 'node:child_process';
import {readFile, writeFile, rm, mkdir} from 'node:fs/promises';
import {fileURLToPath, pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
const root=fileURLToPath(new URL('.',import.meta.url));
const html=await readFile(new URL(process.env.TEST8_SOURCE || 'index.html',import.meta.url),'utf8');
const hooks = `
window.__test={audio,stages,questionsById,BUILD,showBuiltinKeyboard,renderGuide,nextEnemyQuestion,wrongKey,prepareBattle,resultConditions,rotateInput,startGame,beginKeyboard,beginGuide,guideNext,finishOnboarding,renderOnboarding,guideText,processText,builtinLetter,spawnEnemy,removeEnemy,completeQuestion,checkWaves,completeVictory,finishGame,pauseGame,resumeGame,goMap,handleAction,teach,updateViewport,renderDebug,renderEnemy,positionEnemy,resetInput,loadSave,persist,configureInputs,castSpell,tick,spoken,stagePool,guideItems,
  setComposing(value){globallyComposing=value},get composing(){return globallyComposing},get baseline(){return viewportBaseline},replaceBuiltin(fn){builtinLetter=fn},setKeyboardSeen(value){keyboardSeen=value},cancelKeyboardWait,get game(){return game},get save(){return save},get uiTimers(){return uiTimers.size},get uiFrames(){return uiFrames.size},get pointers(){return keyPointers.size},get keyboardTimer(){return keyboardTimer},get countdownTimer(){return countdownTimer},get errors(){return recentErrors},get input(){return castInput},setLastTime(t){lastTime=t;},get screen(){return screen}};
window.__now7=performance.now();
window.__advance7=seconds=>{for(let i=0;i<Math.ceil(seconds/.05);i++){window.__now7+=50;tick(window.__now7);if(window.__virtual7)window.__drain7(50);window.__mock?.advance(.05);}};
`;
const fixture=html.replace('return {unlock, sync, speak, target,','return {pump, unlock, sync, speak, target,').replaceAll('requestAnimationFrame(tick);','if(!window.__manualRAF) requestAnimationFrame(tick);')
  .replace('  </script>\n</body>',hooks+'\n  </script>\n</body>');
await writeFile(new URL('.test8.html',import.meta.url),fixture);
const results = [];
const errors = [];
const check = (condition, label) => { results.push(`${condition?'PASS':'FAIL'} ${label}`); console.log(results.at(-1)); if(!condition)process.exitCode=1; };
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const profile = '.chrome-regressions-profile8';
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
  await send('Page.navigate', {url: pathToFileURL(`${root}.test8.html`).href});
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
async function shot(name){const {data}=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await writeFile(new URL('output/playwright/task8/'+name+'.png',import.meta.url),Buffer.from(data,'base64'));}
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

async function test(label, fn) {
 try { check(await fn(),label); } catch(error) {check(false,label+' '+error.message);}
}
async function setup(id='r2-1',mode='pinyin') {
 await evaluate(`(()=>{const t=__test;t.goMap();t.save.settings.onboarding=true;t.save.settings.keyboardMode=${JSON.stringify(mode)};t.save.settings.muted=false;t.save.settings.speech=true;t.save.settings.speechVolume=80;t.save.settings.vibration=false;for(const s of t.stages)t.save.records[s.id]={stars:3,bestScore:0,bestSpeed:0,attempts:1};t.startGame(t.stages.find(s=>s.id===${JSON.stringify(id)}),true);t.game.paused=false;document.querySelector('#start-overlay').hidden=true;t.configureInputs();t.showBuiltinKeyboard();if(!t.game.ime)t.spawnEnemy();})()`);
}
try {
 await mkdir(new URL('output/playwright/task8',import.meta.url),{recursive:true});
 await send('Runtime.enable');await send('Log.enable');await send('Page.enable');await metrics();
 await send('Page.addScriptToEvaluateOnNewDocument',{source:instrumentation+mock+speechMock+`const NativeContext8=AudioContext;window.AudioContext=class extends NativeContext8{constructor(){super();window.__context8=this;}};`});
 await load();await evaluate(`__test.save.settings.vibration=false;for(const s of __test.stages)__test.save.records[s.id]={stars:3};__test.audio.unlock()`);await delay(450);
 await test('#1 教學最後一頁結束後王關／複習關戰場恢復',async()=>{
  return await evaluate(`(()=>{const t=__test;for(const id of ['r1-boss','r5-boss','review']){t.goMap();t.save.settings.onboarding=false;const stage=id==='review'?{...t.stages.find(s=>s.id==='r2-1'),id:'review',reviewOnly:true}:t.stages.find(s=>s.id===id);t.startGame(stage,false);t.game.onboarding=3;t.renderOnboarding();t.finishOnboarding();if(document.querySelector('#battlefield').hidden!==t.game.ime||document.querySelector('#duel-panel').hidden===t.game.ime)return false;}return true;})()`);
 });
 await setup('r5-1');
 await test('#2a 施放命中換句時維持同框焦點與可輸入狀態、重複施放無效',async()=>await evaluate(`(()=>{const t=__test;const input=t.input;input.focus();input.value=t.game.currentSpell.text;t.castSpell();const hp=t.game.bossHP;t.castSpell();return t.game.spellAdvance>0&&!input.readOnly&&t.input===input&&document.activeElement===input&&!t.game.paused&&t.game.bossHP===hp;})()`));
 await setup('r5-1');
 await test('#2b 候選中文已上屏但 compositionend 未到，明確按鈕提交仍可施放',async()=>await evaluate(`(()=>{const t=__test;t.input.value=t.game.currentSpell.text;t.setComposing(true);document.querySelector('#spell-form').dispatchEvent(new Event('submit',{cancelable:true,bubbles:true}));return t.game.kills===1&&!t.composing;})()`));
 await setup('r2-1');
 await test('#3a 系統拼音／英文完成及重試全程使用原輸入框，不發生 blur',async()=>await evaluate(`(()=>{const t=__test;for(const mode of ['pinyin','english']){t.save.settings.keyboardMode=mode;t.configureInputs();const input=t.input;input.focus();let blurred=0;input.addEventListener('blur',()=>blurred++,{once:true});const e=t.game.enemies[0];input.value=e.q.pinyin;t.processText(input.value);t.spawnEnemy();t.wrongKey(t.game.enemies[0]);if(t.input!==input||document.activeElement!==input||blurred||t.game.paused)return false;}return true;})()`));
 await test('#3b 戰鬥中旋轉至較高視窗後更新鍵盤基準',async()=>await evaluate(`(()=>{Object.defineProperty(visualViewport,'height',{configurable:true,value:1000});__test.updateViewport();return __test.baseline>=1000;})()`));
 await metrics();await setup('r2-1','builtin');
 await test('#4 內建鍵盤 pointerdown 無後續 click，不吞輔助點擊',async()=>{
  await pointer('q',44);return await evaluate(`(()=>{let clicks=0;const b=document.createElement('button');b.onclick=()=>clicks++;document.body.append(b);b.click();b.remove();return clicks===1;})()`);
 });
 await test('#4b 新觸控 pointerdown 可立即操作相同座標的新畫面按鈕',async()=>{
  await pointer('q',45);return await evaluate(`(()=>{const r=document.querySelector('[data-key="q"]').getBoundingClientRect();const b=document.createElement('button');let count=0;b.onclick=()=>count++;document.body.append(b);for(const type of ['pointerdown','click'])b.dispatchEvent(new PointerEvent(type,{bubbles:true,cancelable:true,pointerType:'touch',clientX:r.x+r.width/2,clientY:r.y+r.height/2}));b.remove();return count===1;})()`);
 });
 await metrics(900,800,false);await setup('r1-1','builtin');
 await test('#5 maxTouchPoints=0 仍顯示可操作內建鍵盤',async()=>await evaluate(`(()=>{Object.defineProperty(navigator,'maxTouchPoints',{configurable:true,value:0});__test.showBuiltinKeyboard();return !document.querySelector('#builtin-keyboard').hidden;})()`));
 await evaluate(`delete navigator.maxTouchPoints`);await metrics();
 await test('#6 跳過操作教學取消倒數，逾期不解除戰鬥準備暫停',async()=>{
  await evaluate(`(()=>{const t=__test;t.goMap();t.save.settings.keyboardMode='builtin';t.save.settings.onboarding=false;t.startGame(t.stages.find(s=>s.id==='r1-boss'),false);t.beginKeyboard();t.finishOnboarding();})()`);
  await delay(3150);return await evaluate(`__test.game.paused&&!__test.countdownTimer&&!document.querySelector('#start-overlay').hidden`);
 });
 await test('#7 第三區專項保留完整題池與所有教學卡例字',async()=>await evaluate(`(()=>{const t=__test;const a=t.stages.find(s=>s.id==='r3-6').pool.map(id=>t.questionsById[id]);const b=t.stages.find(s=>s.id==='r3-8').pool.map(id=>t.questionsById[id]);return ['女','綠','略'].every(text=>a.some(q=>q.text===text))&&['yu','yue','yuan','yun'].every(p=>b.some(q=>q.pinyin===p));})()`));
 await setup('r4-3','builtin');
 await test('#8 護甲第二題 clean 重置且可累積連擊與熟練度',async()=>await evaluate(`(()=>{const t=__test;const e=t.game.enemies[0];e.clean=false;t.completeQuestion(e);const q=e.q;delete t.save.review[q.id];t.save.review[q.id]={count:1,mastered:0};const clean=e.clean;t.completeQuestion(e);return clean&&t.game.combo===1&&t.save.review[q.id].mastered===1;})()`));
 await setup('r2-1');
 await test('#9a 拼音已擊倒後提交同音異字不誤扣下一怪',async()=>await evaluate(`(()=>{const t=__test;const e=t.game.enemies[0];e.q=Object.values(t.questionsById).find(q=>q.text==='他'&&q.pinyin==='ta');t.input.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true}));t.input.value='ta';t.input.dispatchEvent(new CompositionEvent('compositionupdate',{bubbles:true,data:'ta'}));t.spawnEnemy();const wrong=t.game.wrong;t.input.value='它';t.input.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true,data:'它'}));return t.game.kills===1&&t.game.wrong===wrong&&t.input.value==='';})()`));
 await test('#9b 第一區／英文模式誤輸漢字會清空並可繼續答題',async()=>{
  for(const [id,mode] of [['r1-1','pinyin'],['r2-1','english']]){await setup(id,mode);if(!await evaluate(`(()=>{const t=__test;t.input.value='字';t.processText('字');const empty=t.input.value==='';const e=t.game.enemies[0];t.input.value=e.q.pinyin;t.processText(t.input.value);return empty&&t.game.kills===1;})()`))return false;}return true;
 });
 await test('#9c 引導頁第一區／英文模式漢字也會清空，下一題可繼續',async()=>{
  for(const [id,mode] of [['r1-1','pinyin'],['r2-1','english']]){await setup(id,mode);if(!await evaluate(`(()=>{const t=__test;t.beginGuide();t.input.value='字';t.processText('字');const empty=t.input.value==='';const q=t.game.guide.items[0];t.processText(q.pinyin);return empty&&t.game.guide.index===1;})()`))return false;}await setup('r5-1','english');return await evaluate(`(()=>{const t=__test;t.beginGuide();const q=t.game.guide.items[0];t.processText(q.text);return t.game.guide.index===1;})()`);
 });
 await setup('r4-3','builtin');
 await test('#10 長詞雙層護甲不連考同詞，後續首字母也與場上怪分離',async()=>await evaluate(`(()=>{const t=__test;for(let n=0;n<30;n++){t.prepareBattle();if(t.game.battlePlan.some(q=>q[0].id===q[1].id))return false;}t.game.enemies.forEach(e=>t.removeEnemy(e));for(let n=0;n<3;n++)t.spawnEnemy();const groups=t.game.enemies.map(e=>new Set([e.q,...e.questions].map(q=>q.pinyin[0])));return groups.every((a,i)=>groups.every((b,j)=>i===j||![...a].some(x=>b.has(x))));})()`));
 await setup('r2-1','builtin');
 await test('#11 重打／刪除／解除鎖定不重複累加有效字母',async()=>await evaluate(`(()=>{const t=__test;const e=t.game.enemies[0];e.q=Object.values(t.questionsById).find(q=>q.pinyin==='nihao');for(let i=0;i<3;i++){t.resetInput();t.processText('niha',false,true);t.wrongKey(e);}t.resetInput();t.processText('ni',false,true);t.processText('n',false,true,true);t.processText('ni',false,true);t.handleAction('unlock');t.processText('nihao',false,true);return t.game.correct===5&&t.game.wrong===3;})()`));
 await setup('r5-1');
 await test('#11b 第五區未達門檻重打也不重複計正確字數',async()=>await evaluate(`(()=>{const t=__test;const text=t.game.currentSpell.text;for(let n=0;n<3;n++){t.input.value=text.slice(0,2);t.castSpell();}t.input.value=text;t.castSpell();return t.game.correct===[...text.normalize('NFKC').replace(/[\\p{P}\\p{Z}\\s]/gu,'')].length;})()`));
 await setup('r2-1');
 await test('#12a 空 voice 清單仍以 zh-TW 發聲，診斷說明系統預設中文',async()=>{
  await evaluate(`__test.audio.stopSpeech();__mock.changeVoices([]);__mock.calls=[];__test.audio.speak('預設中文測試');`);await delay(600);
  return await evaluate(`__mock.calls.some(c=>c.text==='預設中文測試')&&__mock.utterance.lang==='zh-TW'&&!__mock.utterance.voice&&__test.audio.status.includes('使用系統預設中文')`);
 });
 await test('#12b 跟練提示等倒數結束才播出，不被開始流程取消',async()=>{
  await setup('r2-1','builtin');await evaluate(`__mock.changeVoices([{lang:'zh-TW',name:'測試台灣中文'}]);__test.beginGuide();__test.game.guide.index=__test.game.guide.items.length-1;__mock.calls=[];__test.guideNext();`);await delay(3500);
  return await evaluate(`__mock.calls.some(c=>c.text==='照著打一次。')`);
 });
 await test('#13a interrupted AudioContext 在 sync 自動恢復',async()=>{
  await evaluate(`__context8.state='interrupted';window.__resumes8=__mock.resumes;__test.audio.sync();`);await delay(20);
  return await evaluate(`__context8.state==='running'&&__mock.resumes>__resumes8`);
 });
 await test('#13b 非按鈕真實手勢也恢復音訊',async()=>{
  await evaluate(`__context8.state='interrupted';window.__resumes8=__mock.resumes;`);
  await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:2,y:2,id:1}]});await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  return await evaluate(`__mock.resumes>__resumes8`);
 });
 await test('#14 no-start 重試後不永久標壞，下一句可自動恢復',async()=>{
  await evaluate(`__test.audio.stopSpeech();__mock.speechMode='no-start';__test.audio.speak('打怪中斷測試');`);await delay(3800);
  const ok=await evaluate(`!__test.audio.diagnostics.speechBroken&&__test.audio.diagnostics.history.at(-1).events.some(e=>e.includes('語音無回應'))`);
  await evaluate(`__mock.speechMode='normal';__test.audio.speak('自動恢復');`);await delay(600);
  return ok&&await evaluate(`__mock.calls.some(c=>c.text==='自動恢復')`);
 });
 await setup('r2-1','builtin');
 await test('#15a 鍵盤空白距離超過 10px 不觸發工具／按鍵',async()=>await evaluate(`(()=>{const t=__test;window.__gapKeys8=[];const original=t.builtinLetter;t.replaceBuiltin(k=>__gapKeys8.push(k));const board=document.querySelector('#builtin-keyboard');board.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,cancelable:true,pointerType:'touch',pointerId:90,clientX:0,clientY:0}));t.replaceBuiltin(original);return __gapKeys8.length===0;})()`));
 await test('#15b 系統手勢遺失 pointerup 時按鍵氣泡自動移除',async()=>{await pointer('q',91);await delay(1300);return await evaluate(`__test.pointers===0&&!document.querySelector('.key-bubble')`);});
 await test('#15c touchstart 阻止系統觸控預設動作',async()=>await evaluate(`(()=>{const e=new Event('touchstart',{cancelable:true,bubbles:true});document.querySelector('#builtin-keyboard').dispatchEvent(e);return e.defaultPrevented;})()`));
 await setup('r2-1');
 await test('#16 系統模式再唸／偷看／聲音按鈕 pointerdown 不抑制 click 並保留焦點',async()=>await evaluate(`(()=>{const t=__test;t.input.focus();const b=document.querySelector('.enemy [data-action="replay"]');const event=new PointerEvent('pointerdown',{bubbles:true,cancelable:true,pointerType:'touch'});b.dispatchEvent(event);const count=t.audio.diagnostics.history.length;b.click();return !event.defaultPrevented&&t.audio.diagnostics.history.length>=count&&document.activeElement===t.input;})()`));
 await test('#16b 真實觸控再唸／偷看／聲音及解鎖處理只執行一次，不誤暫停',async()=>{
  await touch('.enemy [data-action="replay"]');
  const before=await evaluate(`__test.game.peeks`);await touch('[data-action="peek"]');
  await evaluate(`__test.handleAction('unlock')`);await touch('.play-heading [data-action="sound"]');
  return await evaluate(`!__test.game.paused&&__test.game.peeks===${before-1}&&__test.save.settings.muted&&document.activeElement===__test.input`);
 });
 await setup('r5-1');
 await test('#17 純英數咒語只提示切換鍵盤，不扣血量進度或連擊',async()=>await evaluate(`(()=>{const t=__test;t.game.combo=3;t.input.value='jintian123';const hp=t.game.bossHP;t.castSpell();return t.game.wrong===0&&t.game.correct===0&&t.game.combo===3&&t.game.bossHP===hp&&document.querySelector('#battle-message').textContent.includes('切換');})()`));
 await test('#18 94.99% 未達標不顯示 95.0%／差 0.0',async()=>await evaluate(`(()=>{const text=__test.resultConditions(.9499);return text.includes('94.9%')&&text.includes('差 0.1 個百分點')&&!text.includes('差 0.0');})()`));
 await setup('r2-1','builtin');await evaluate(`__test.beginGuide();__test.game.guide.items=[Object.values(__test.questionsById).find(q=>q.pinyin==='nihao')];__test.renderGuide?.();`);
 await test('#19 看卡迷你鍵盤隨時間輪播且提示符合觸控操作',async()=>await evaluate(`(()=>{const t=__test;t.game.guide.index=0;/* render via navigation without changing the chosen card */t.cancelKeyboardWait();t.game.guide.step='look';t.game.guide.index=0;t.game.paused=true;t.game.guide.items=[Object.values(t.questionsById).find(q=>q.pinyin==='nihao')];t.game.guide.index=0;t.renderGuide();t.tick(700);const first=document.querySelector('#guide-panel .mini-keys .next-key')?.textContent;t.tick(1400);const second=document.querySelector('#guide-panel .mini-keys .next-key')?.textContent;return first==='i'&&second==='h'&&!document.querySelector('#action-prompt').textContent.includes('也可以直接打');})()`));
 await setup('r1-1','builtin');
 await test('#20 結算按鈕失焦後 Enter 可前往下一站，modal 中不觸發',async()=>await evaluate(`(()=>{const t=__test;t.finishGame(true);const primary=document.querySelector('#result-screen .primary');let clicks=0;primary.addEventListener('click',()=>clicks++);document.activeElement.blur();document.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));document.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));return clicks===1&&document.querySelector('dialog').open&&document.querySelector('dialog').textContent.includes(t.stages[1].title);})()`));
 check(errors.length===0,'TASK8 回歸流程 0 console/runtime error '+JSON.stringify(errors));
 await shot(process.env.TEST8_SOURCE?'before-fixes':'after-fixes');
} catch(error){check(false,error.stack);}
finally {
 const name=process.env.TEST8_SOURCE?'browser-regressions8-before-output.txt':'browser-regressions8-output.txt';
 await writeFile(new URL(name,import.meta.url),results.join('\n')+'\n');
 await cdp('Browser.close').catch(()=>{});ws.close();
 if(chrome.exitCode===null)await new Promise(resolve=>chrome.once('exit',resolve));
 chrome.stderr.destroy();chrome.unref();
 await rm(new URL(profile,import.meta.url),{recursive:true,force:true});
 await rm(new URL('.test8.html',import.meta.url),{force:true});
}
