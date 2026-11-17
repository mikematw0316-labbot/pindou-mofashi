/** Chrome DevTools Protocol 實測，無套件；所有 profile、輸出都在本資料夾。 */
import {spawn} from 'node:child_process';
import {readFile, writeFile, rm, mkdir} from 'node:fs/promises';
import {fileURLToPath, pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
const root = fileURLToPath(new URL('.', import.meta.url));
const html = await readFile(new URL('index.html', import.meta.url), 'utf8');
const bankSource = html.match(/\/\/ BEGIN QUESTION BANK\n([\s\S]*?)\n\/\/ END QUESTION BANK/u)[1];
const data = await import(`data:text/javascript;base64,${Buffer.from(bankSource).toString('base64')}`);
const results = [];
const errors = [];
const check = (condition, label) => { assert.ok(condition, label); results.push(`PASS ${label}`); console.log(`PASS ${label}`); };
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
  '--headless=new', '--no-first-run', '--no-default-browser-check', '--disable-background-networking',
  '--disable-component-update', '--disable-sync', '--disable-default-apps', '--hide-scrollbars',
  '--remote-debugging-port=0', `--user-data-dir=${root}.chrome-perf-profile5`, 'about:blank',
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
  await delay(300); // Let native touch feedback paint out before capturing the layout.
  const {data} = await send('Page.captureScreenshot', {format: 'png', captureBeyondViewport: false});
  await writeFile(new URL(`shots7/regression-layout/${name}.png`, import.meta.url), Buffer.from(data, 'base64'));
}
async function load() {
  await evaluate(`window.__smokeBeforeNavigation=true`);
  await send('Page.navigate', {url: pathToFileURL(`${root}index.html`).href});
  await waitFor(`!window.__smokeBeforeNavigation && document.readyState === 'complete' && document.querySelectorAll('.stage-node').length > 0`);
}
async function metrics(width=390, height=844, mobile=true) {
  await send('Emulation.setDeviceMetricsOverride', {width,height,deviceScaleFactor:mobile?3:1,mobile});
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
async function seed({onboarding=true, builtin=false, review={}}={}) {
  // Finish the previous pagehide save before installing a new saved-game fixture.
  await send('Page.navigate', {url:'about:blank'});
  await waitFor(`location.href==='about:blank'&&document.readyState==='complete'`);
  const {identifier}=await send('Page.addScriptToEvaluateOnNewDocument',{source:`(() => {const s=JSON.parse(localStorage.getItem('pinyin-keep-save-v2'));s.coins=1000;s.learned=[];s.settings.onboarding=${onboarding};s.settings.builtin=${builtin};s.settings.sound=false;s.review=${JSON.stringify(review)};for(const id of ${JSON.stringify(data.stages.map(s=>s.id))})s.records[id]={stars:3,bestSpeed:1,bestScore:0,attempts:1,last:{speed:1,accuracy:1,score:0}};if(!s.settings.onboarding){s.records['r1-1'].stars=0;s.records['r1-boss'].stars=0;}localStorage.setItem('pinyin-keep-save-v2',JSON.stringify(s));})()`});
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
  throw Error(`Solve timeout ${mode}`);
}
async function backMap() {
  if(await evaluate(`!document.querySelector('#play-screen').hidden`)) {
    await touch('[data-action="pause"]');
    await touch('#start-overlay [data-action="map"]');
  } else if(await evaluate(`!document.querySelector('#result-screen').hidden`))await touch('#result-screen [data-action="map"]');
}
async function geometry(label) {
  const report=await evaluate(`(() => {const field=document.querySelector('#battlefield').getBoundingClientRect();const input=document.querySelector('#spell-form').getBoundingClientRect();const cards=[...document.querySelectorAll('.enemy:not(.defeated):not([hidden]) .question-card')].map(e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom}});const overlap=cards.some((a,i)=>cards.some((b,j)=>j>i&&a.x<b.right&&a.right>b.x&&a.y<b.bottom&&a.bottom>b.y));return {scroll:document.documentElement.scrollWidth,width:innerWidth,visible:visualViewport.height,inputBottom:input.bottom,fieldBottom:field.bottom,cards,overlap,bounds:cards.every(r=>r.x>=field.x&&r.right<=field.right+.5&&r.y>=field.y&&r.bottom<=field.bottom+.5)}})()`);
  check(report.scroll<=report.width&&!report.overlap&&report.bounds&&report.inputBottom<=report.visible+1&&report.fieldBottom<=report.inputBottom,label+' '+JSON.stringify(report));
}
let failAssets=false;
const httpServer=createServer(async(req,res)=>{
 try {const name=decodeURIComponent((req.url||'/').split('?')[0]).replace(/^\//,'')||'index.html';if(name.includes('..')){res.writeHead(403);res.end();return;}
 if(failAssets&&name.startsWith('assets/')){res.writeHead(404);res.end();return;}
 const bytes=await readFile(new URL(name,import.meta.url));res.writeHead(200,{'Content-Type':name.endsWith('.html')?'text/html; charset=utf-8':name.endsWith('.webp')?'image/webp':'image/png','Cache-Control':'no-store'});res.end(bytes);
 } catch {res.writeHead(404);res.end();}
});
await new Promise(r=>httpServer.listen(0,'127.0.0.1',r));
const url=`http://127.0.0.1:${httpServer.address().port}/index.html`;
try {
 await send('Runtime.enable');await send('Log.enable');await send('Page.enable');await send('Network.enable');
 await metrics();await send('Network.setCacheDisabled',{cacheDisabled:true});
 await send('Network.emulateNetworkConditions',{offline:false,latency:150,downloadThroughput:1.6*1024*1024/8,uploadThroughput:750*1024/8,connectionType:'cellular4g'});
 await send('Emulation.setCPUThrottlingRate',{rate:4});
 const timings=[];
 for(let i=0;i<3;i++) {
  await send('Page.navigate',{url:'about:blank'});await waitFor(`location.href==='about:blank'`);
  await send('Network.clearBrowserCache');await send('Page.navigate',{url});
  await waitFor(`document.querySelectorAll('.stage-node').length===7`);
  await click('[data-action="stage"][data-id="r1-1"]');await waitFor(`document.querySelector('#modal').open`);
  const ms=await evaluate(`Math.round(performance.now())`);timings.push(ms);
  check(ms<3000,`Slow 4G＋CPU 4× 第 ${i+1} 次可互動 ${ms}ms（實際點開教學）`);
 }
 await send('Emulation.setCPUThrottlingRate',{rate:1});await send('Network.emulateNetworkConditions',{offline:false,latency:0,downloadThroughput:-1,uploadThroughput:-1});
 await evaluate(`document.querySelector('[data-action="close"]').click()`);
 // Contrast checks use actual resolved CSS tokens in both themes.
 const contrast=await evaluate(`(()=>{const rgb=h=>h.match(/\\d+/g).slice(0,3).map(Number);const lum=c=>c.map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4}).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0);const ratio=(a,b)=>{a=lum(rgb(a));b=lum(rgb(b));return (Math.max(a,b)+.05)/(Math.min(a,b)+.05)};const out=[];for(const theme of ['light','dark']){document.documentElement.dataset.theme=theme;const sample=document.createElement('span');document.body.append(sample);for(const fg of ['ink','muted','accent','gold','danger']){sample.style.color='var(--'+fg+')';sample.style.background='var(--panel)';const s=getComputedStyle(sample);out.push({theme,fg,ratio:ratio(s.color,s.backgroundColor)})}sample.remove()}document.documentElement.dataset.theme='light';return out})()`);
 check(contrast.every(c=>c.ratio>=4.5),'淺／深色五組主要文字色對面板 ≥4.5:1 '+JSON.stringify(contrast));
 check(errors.length===0,'HTTP 冷啟動 0 console error／runtime exception '+JSON.stringify(errors));
 console.log('TIMINGS',JSON.stringify(timings));
 await send('Page.navigate',{url:'about:blank'});await waitFor(`location.href==='about:blank'&&document.readyState==='complete'`);
 const {identifier:seedId}=await send('Page.addScriptToEvaluateOnNewDocument',{source:`(()=>{const s=JSON.parse(localStorage.getItem('pinyin-keep-save-v2'));s.settings.keyboardMode='builtin';s.settings.builtin=true;s.settings.onboarding=true;s.settings.muted=true;s.records['r1-1']={stars:3,bestSpeed:1,bestScore:0,attempts:1};localStorage.setItem('pinyin-keep-save-v2',JSON.stringify(s))})()`});
 await send('Page.navigate',{url});await waitFor(`document.querySelectorAll('.stage-node').length===7`);await send('Page.removeScriptToEvaluateOnNewDocument',{identifier:seedId});await stage('r1-1');await ready();await waitFor(`document.querySelector('.enemy')`);
 const frames=await evaluate(`new Promise(resolve=>{const stamps=[];function f(t){stamps.push(t);if(stamps.length<121)requestAnimationFrame(f);else {const dt=stamps.slice(1).map((v,i)=>v-stamps[i]);resolve({mean:dt.reduce((a,b)=>a+b,0)/dt.length,p95:dt.sort((a,b)=>a-b)[Math.floor(dt.length*.95)]})}}requestAnimationFrame(f)})`);
 check(frames.mean<20&&frames.p95<25,'Headless 正常戰鬥 rAF 平均 <20ms、p95 <25ms '+JSON.stringify(frames));
 await backMap();failAssets=true;await send('Network.clearBrowserCache');await send('Page.navigate',{url});await waitFor(`document.querySelectorAll('.stage-node').length===7`);
 const expected404Start=errors.length;
 await stage('r1-1');await ready();await waitFor(`document.querySelector('.enemy')`);await delay(400);
 check(await evaluate(`!document.querySelector('.enemy .art-wrap').classList.contains('art-ready')&&getComputedStyle(document.querySelector('.enemy .fallback-art')).visibility==='visible'`),'HTTP 真正 404 回應時顯示 SVG');
 for(const c of (await enemy()).q.pinyin)await touch(`[data-key="${c}"]`);
 check(await evaluate(`document.querySelector('#progress-value').textContent.startsWith('1 /')`),'HTTP 圖片全部 404 仍能正常擊倒');
 check(errors.slice(expected404Start).every(e=>/404|load resource/i.test(e)),'404 情境只有預期資源錯誤，沒有 JS 例外');
} catch(error){console.error(error);results.push('FAIL '+error.stack);process.exitCode=1;}
finally {
 await writeFile(new URL('browser-performance5-output.txt',import.meta.url),results.join('\n')+'\nConsole errors: '+JSON.stringify(errors)+'\n');
 await cdp('Browser.close').catch(()=>{});ws.close();if(chrome.exitCode===null)await new Promise(r=>chrome.once('exit',r));await rm(new URL('.chrome-perf-profile5',import.meta.url),{recursive:true,force:true});chrome.stderr.destroy();chrome.unref();await new Promise(r=>httpServer.close(r));
}
