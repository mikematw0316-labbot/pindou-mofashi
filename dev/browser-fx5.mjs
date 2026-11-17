/** Chrome DevTools Protocol 實測，無套件；所有 profile、輸出都在本資料夾。 */
import {spawn} from 'node:child_process';
import {readFile, writeFile, rm, mkdir} from 'node:fs/promises';
import {fileURLToPath, pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
const root = fileURLToPath(new URL('.', import.meta.url));
const html = await readFile(new URL('index.html', import.meta.url), 'utf8');
const bankSource = html.match(/\/\/ BEGIN QUESTION BANK\n([\s\S]*?)\n\/\/ END QUESTION BANK/u)[1];
const data = await import(`data:text/javascript;base64,${Buffer.from(bankSource).toString('base64')}`);

const fxStart = html.indexOf('function comboBanner('), fxEnd = html.indexOf("document.addEventListener('input', event => {",fxStart);
const fxHTML = html.slice(0,fxStart) + html.slice(fxStart,fxEnd).replaceAll('later(', '(window.__freezeFX ? (fn,ms)=>{window.__fx.push({fn,ms});} : later)(') + html.slice(fxEnd);
const fixture = fxHTML.replace('return {unlock, sync, speak, target,', 'return {pump, unlock, sync, speak, target,')
  .replaceAll('requestAnimationFrame(tick);', 'if (!window.__manualRAF) requestAnimationFrame(tick);')
  .replace('  </script>\n</body>', `window.__test = {audio, SCORE, get game(){return game;}, get save(){return save;},
    finishGame, beginGuide, renderOnboarding, stagePool, guideItems, spawnEnemy, processText, completeQuestion, pauseGame, tick,
    setLastTime(v){lastTime=v;}, renderEnemy, positionEnemy, persist, renderGuide, addCombo};
  </script>\n</body>`);
await writeFile(new URL('.test-fx5.html',import.meta.url),fixture);

const results = [];
const errors = [];
const check = (condition, label) => { assert.ok(condition, label); results.push(`PASS ${label}`); console.log(`PASS ${label}`); };
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const profile = '.chrome-fx-profile5';
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
async function click(selector) {
  const rect = await evaluate(`(() => { const e = [...document.querySelectorAll(${JSON.stringify(selector)})].find(item => item.getClientRects().length && !item.closest("[hidden]")); if (!e) throw Error('Missing selector'); e.scrollIntoView({block:'center'}); const r=e.getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2}; })()`);
  await send('Input.dispatchMouseEvent', {type: 'mousePressed', ...rect, button: 'left', clickCount: 1});
  await send('Input.dispatchMouseEvent', {type: 'mouseReleased', ...rect, button: 'left', clickCount: 1});
}
async function press(key) {
  const code = /^[a-z]$/i.test(key) ? `Key${key.toUpperCase()}` : key;
  await send('Input.dispatchKeyEvent', {type: 'keyDown', key, code, windowsVirtualKeyCode: key === 'Enter' ? 13 : key === 'Escape' ? 27 : key === 'Tab' ? 9 : key === 'Backspace' ? 8 : key.toUpperCase().charCodeAt(0), ...(key === 'Enter' ? {text: '\r'} : key.length === 1 ? {text: key} : {})});
  await send('Input.dispatchKeyEvent', {type: 'keyUp', key, code});
}
async function screenshot(name) {
  await evaluate(`window.getSelection()?.removeAllRanges()`);

  const {data} = await send('Page.captureScreenshot', {format: 'png', captureBeyondViewport: false});
  await writeFile(new URL(`shots7/${name}.png`, import.meta.url), Buffer.from(data, 'base64'));
}
async function load() {
  await evaluate(`window.__smokeBeforeNavigation=true`);
  await send('Page.navigate', {url: pathToFileURL(`${root}.test-fx5.html`).href});
  await waitFor(`!window.__smokeBeforeNavigation && document.readyState === 'complete' && document.querySelectorAll('.stage-node').length > 0`);
}
async function metrics(width=390, height=844, mobile=true) {
  await send('Emulation.setDeviceMetricsOverride', {width,height,deviceScaleFactor:1,mobile});
  await send('Emulation.setTouchEmulationEnabled', {enabled:mobile,maxTouchPoints:5});
}
async function touch(selector, dx=0, dy=0) {
  const r = await evaluate(`(() => { const e=[...document.querySelectorAll(${JSON.stringify(selector)})].find(e=>e.getClientRects().length&&!e.closest('[hidden]')); if(!e)throw Error('Missing touch '+${JSON.stringify(selector)});e.scrollIntoView({block:'nearest'});const r=e.getBoundingClientRect();return {x:r.x+r.width/2+${dx},y:r.y+r.height/2+${dy}}; })()`);
  await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...r,id:1}]});
  await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
}
async function textInput(value, composing=false) {
  await evaluate(`(() => {const i=document.querySelector('.active-input');i.dispatchEvent(new InputEvent('beforeinput',{bubbles:true,inputType:'insertText',data:${JSON.stringify(value)},isComposing:${composing}}));i.value=${JSON.stringify(value)};i.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText',data:${JSON.stringify(value)},isComposing:${composing}}));})()`);
}
async function composition(type, value) {
  await evaluate(`document.querySelector('.active-input').dispatchEvent(new CompositionEvent(${JSON.stringify('composition'+type)},{bubbles:true,data:${JSON.stringify(value)}}))`);
}
async function seed({onboarding=true, builtin=false, keyboardMode=builtin?'builtin':'pinyin', debug=false, review={}}={}) {
  // Finish the previous pagehide save before installing a new saved-game fixture.
  await send('Page.navigate', {url:'about:blank'});
  await waitFor(`location.href==='about:blank'&&document.readyState==='complete'`);
  const {identifier}=await send('Page.addScriptToEvaluateOnNewDocument',{source:`(() => {const s=JSON.parse(localStorage.getItem('pinyin-keep-save-v2'))||{version:2,settings:{},records:{},upgrades:{},review:{}};s.coins=1000;s.learned=[];s.settings.onboarding=${onboarding};s.settings.builtin=${builtin};s.settings.keyboardMode=${JSON.stringify(keyboardMode)};s.settings.builtinMigrated=true;s.settings.debug=${debug};s.settings.sound=true;s.settings.muted=false;s.settings.speech=true;s.settings.music=true;s.settings.effects=true;s.review=${JSON.stringify(review)};for(const id of ${JSON.stringify(data.stages.map(s=>s.id))})s.records[id]={stars:3,bestSpeed:1,bestScore:0,attempts:1,last:{speed:1,accuracy:1,score:0}};if(!s.settings.onboarding){s.records['r1-1'].stars=0;s.records['r1-boss'].stars=0;}localStorage.setItem('pinyin-keep-save-v2',JSON.stringify(s));})()`});
  await load();
  await send('Page.removeScriptToEvaluateOnNewDocument',{identifier});
}
async function stage(id, skip=true) {
  const s=data.stages.find(s=>s.id===id);
  await touch(`[data-action="region"][data-id="${s.region}"]`);
  await touch(`[data-action="stage"][data-id="${id}"]`);
  const replay = !skip && await evaluate(`!!document.querySelector('[data-action="replay-guide"]')`);
  await touch(replay ? '[data-action="replay-guide"]' : '[data-action="start"]');
}
async function ready({keyboard=false}={}) {
  if(await evaluate(`!!document.querySelector('#start-overlay [data-action="ready"]')?.getClientRects().length`)) await touch('#start-overlay [data-action="ready"]');
  if(keyboard) await mockKeyboard(500);
  await waitFor(`document.querySelector('#start-overlay').hidden`,8000);
}
async function mockKeyboard(height) {
  // Native headless has no OS keyboard: override only visualViewport geometry/events.
  await evaluate(`(() => {const vv=visualViewport;Object.defineProperty(vv,'height',{configurable:true,get:()=>${height}});vv.dispatchEvent(new Event('resize'));})()`);
}
async function enemy() {
  const result=await evaluate(`(() => {const e=document.querySelector('.enemy.locked:not(.defeated)')||[...document.querySelectorAll('.enemy:not(.defeated)')].sort((a,b)=>b.getBoundingClientRect().y-a.getBoundingClientRect().y)[0];if(!e)return null;return {id:e.dataset.enemyId,prompt:e.querySelector('.prompt').textContent,example:e.querySelector('.example')?.textContent.replace('例字：',''),progress:e.querySelectorAll('.typed').length};})()`);
  if(!result)return null;
  const q=data.questionBank.find(q=>result.example?q.kind==='phonics'&&q.symbol===result.prompt&&q.text===result.example:q.kind!=='phonics'&&q.text===result.prompt);
  assert.ok(q,JSON.stringify(result));return {...result,q};
}
async function solve(mode='input', timeout=80000) {
  const start=Date.now();
  while(Date.now()-start<timeout) {
    if(await evaluate(`!document.querySelector('#result-screen').hidden`))return;
    const e=await enemy();
    if(e) {
      if(mode==='key')for(const c of e.q.pinyin.slice(e.progress))await press(c);
      else if(mode==='touch')for(const c of e.q.pinyin.slice(e.progress))await touch(`[data-key="${c}"]`);
      else if(mode==='composition') {
        await composition('start','');
        for(let i=1;i<=e.q.pinyin.length;i++)await composition('update',e.q.pinyin.slice(0,i));
        await composition('end',e.q.kind==='phonics'?e.q.pinyin:e.q.text);
      } else for(let i=e.progress+1;i<=e.q.pinyin.length;i++)await textInput(e.q.pinyin.slice(0,i));
    } else await delay(50);
  }
  throw Error(`Solve timeout ${mode} `+JSON.stringify(await evaluate(`({progress:document.querySelector('#progress-value').textContent,overlay:document.querySelector('#start-overlay').hidden?'hidden':document.querySelector('#start-overlay').textContent,input:document.querySelector('.active-input').value,builtin:document.querySelector('#builtin-keyboard').hidden,enemies:[...document.querySelectorAll('.enemy:not(.defeated)')].map(e=>({hidden:e.hidden,prompt:e.querySelector('.prompt').textContent,answer:e.querySelector('.answer').textContent,typed:e.querySelectorAll('.typed').length})),save:JSON.parse(localStorage.getItem('pinyin-keep-save-v2')).settings})`)));
}
async function backMap() {
  if(await evaluate(`!document.querySelector('#play-screen').hidden`)) {
    await touch('[data-action="pause"]');
    await touch('#start-overlay [data-action="map"]');
  } else if(await evaluate(`!document.querySelector('#result-screen').hidden`))await touch('#result-screen [data-action="map"]');
}
async function geometry(label) {
  const report=await evaluate(`(() => {const field=document.querySelector('#battlefield').getBoundingClientRect();const input=document.querySelector('#spell-form').getBoundingClientRect();const cards=[...document.querySelectorAll('.enemy:not(.defeated):not([hidden]) .question-card')].map(e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom}});const overlap=cards.some((a,i)=>cards.some((b,j)=>j>i&&a.x<b.right&&a.right>b.x&&a.y<b.bottom&&a.bottom>b.y));return {scroll:document.documentElement.scrollWidth,width:innerWidth,visible:visualViewport.height,inputBottom:input.bottom,fieldBottom:field.bottom,creatures:[...document.querySelectorAll('.enemy:not(.defeated):not([hidden]) .creature')].map(e=>{const r=e.getBoundingClientRect();return {bottom:r.bottom,limit:field.bottom}}),cards,overlap,bounds:cards.every(r=>r.x>=field.x&&r.right<=field.right+.5&&r.y>=field.y&&r.bottom<=field.bottom+.5)}})()`);
  check(report.creatures.every(c=>c.bottom<=c.limit+.5)&&report.scroll<=report.width&&!report.overlap&&report.bounds&&report.inputBottom<=report.visible+1&&report.fieldBottom<=report.inputBottom,label+' '+JSON.stringify(report));
}
let mockIdentifier;
async function audioMode(mode='normal') {
  if (mockIdentifier) await send('Page.removeScriptToEvaluateOnNewDocument',{identifier:mockIdentifier});
  const mock=await readFile(new URL('audio-mock4.js',import.meta.url),'utf8');
  const modifier = {
    normal:'', none:`__mock.voices=[{lang:'zh-HK',name:'香港'},{lang:'en-US',name:'English'}];`,
    absent:`Object.defineProperty(window,'speechSynthesis',{configurable:true,value:undefined});`,
    fail:`__mock.failAudio=true;`, throws:`speechSynthesis.speak=()=>{throw Error('speech denied')};`,
    cancelThrows:`speechSynthesis.cancel=()=>{throw Error('cancel denied')};`,
    delayed:`__mock.voices=[];`, fallback:`__mock.voices=[{lang:'zh-HK',name:'香港'},{lang:'zh-CN',name:'中國'}];`,
  }[mode];
  ({identifier:mockIdentifier}=await send('Page.addScriptToEvaluateOnNewDocument',{source:mock+'\n'+modifier}));
  await load();
}
async function battle(id='r1-1', mode='pinyin') {
  await seed({keyboardMode:mode}); await stage(id); await ready({keyboard:mode!=='builtin'});
  if(!id.startsWith('r5'))await waitFor(`document.querySelector('.enemy:not(.defeated)')`);
}
async function shotNow(name) {
  const {data}=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
  await writeFile(new URL(`shots7/${name}.png`,import.meta.url),Buffer.from(data,'base64'));
}
try {
 await send('Runtime.enable');await send('Log.enable');await send('Page.enable');await metrics();await audioMode();
 for(const [width,height] of [[390,844],[360,640],[430,932],[1280,720]]) {
  await metrics(width,height,width<700);await battle('r2-2','builtin');
  await evaluate(`(()=>{const g=__test.game;g.spawnIn=999;while(g.enemies.length<g.maxEnemies)__test.spawnEnemy();g.enemies.forEach(e=>{e.x=65;__test.positionEnemy(e)});window.__manualRAF=true;window.__freezeFX=true;window.__fx=[];g.combo=0;})()`);
  for(const c of (await enemy()).q.pinyin)await (width>=700 ? press(c) : touch(`[data-key="${c}"]`));
  await evaluate(`document.querySelectorAll('.magic-bolt').forEach(e=>{e.style.animationPlayState='paused';e.style.animationDelay='-.10s'})`);
  check(await evaluate(`!!document.querySelector('.fireball')`),`${width}×${height} 擊倒有大型飛行火球`);
  let shot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
  await writeFile(new URL(`shots7/${width}x${height}-16-fireball-flight.png`,import.meta.url),Buffer.from(shot.data,'base64'));
  await evaluate(`window.__fx.filter(e=>e.ms<220).forEach(e=>e.fn());const style=document.createElement('style');style.textContent='.magic-explosion::before,.magic-explosion i{animation-play-state:paused!important;animation-delay:-.13s!important}';document.head.append(style);`);
  check(await evaluate(`!!document.querySelector('.magic-explosion')`),`${width}×${height} 命中有爆炸與粒子`);
  shot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
  await writeFile(new URL(`shots7/${width}x${height}-08-explosion.png`,import.meta.url),Buffer.from(shot.data,'base64'));
  await geometry(`${width}×${height} 特效畫面題卡不重疊`);
 }
 check(errors.length===0,'獨立 VFX 截圖 0 console error／runtime exception '+JSON.stringify(errors));
} catch(error){console.error(error);results.push('FAIL '+error.stack);process.exitCode=1;}
finally {
 await writeFile(new URL('browser-fx5-output.txt',import.meta.url),results.join('\n')+'\nConsole errors: '+JSON.stringify(errors)+'\n');
 await cdp('Browser.close').catch(()=>{});ws.close();if(chrome.exitCode===null)await new Promise(r=>chrome.once('exit',r));await rm(new URL('.chrome-fx-profile5',import.meta.url),{recursive:true,force:true});await rm(new URL('.test-fx5.html',import.meta.url),{force:true});chrome.stderr.destroy();chrome.unref();
}
