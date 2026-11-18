/** Chrome DevTools Protocol 實測，無套件；所有 profile、輸出都在本資料夾。 */
import {spawn} from 'node:child_process';
import {readFile, writeFile, rm, mkdir} from 'node:fs/promises';
import {fileURLToPath, pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
if (process.argv.includes('--audio')) { await import('./browser-audio4.mjs'); process.exit(process.exitCode || 0); }
const root = fileURLToPath(new URL('.', import.meta.url));
const html = await readFile(new URL('index.html', import.meta.url), 'utf8');
const bankSource = html.match(/\/\/ BEGIN QUESTION BANK\n([\s\S]*?)\n\/\/ END QUESTION BANK/u)[1];
const data = await import(`data:text/javascript;base64,${Buffer.from(bankSource).toString('base64')}`);
const results = [];
const errors = [];
const check = (condition, label) => { assert.ok(condition, label); results.push(`PASS ${label}`); console.log(`PASS ${label}`); };
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const profile = process.argv.includes('--extra') ? '.chrome-extra-profile4' : process.argv.includes('--final') ? '.chrome-final-profile4' : '.chrome-test-profile4';
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
  await delay(300); // Let native touch feedback paint out before capturing the layout.
  const {data} = await send('Page.captureScreenshot', {format: 'png', captureBeyondViewport: false});
  await writeFile(new URL(`shots7/regression-main/${name}.png`, import.meta.url), Buffer.from(data, 'base64'));
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
async function seed({onboarding=true, builtin=false, keyboardMode=builtin?'builtin':'pinyin', debug=false, review={}}={}) {
  // Finish the previous pagehide save before installing a new saved-game fixture.
  await send('Page.navigate', {url:'about:blank'});
  await waitFor(`location.href==='about:blank'&&document.readyState==='complete'`);
  const {identifier}=await send('Page.addScriptToEvaluateOnNewDocument',{source:`(() => {const s=JSON.parse(localStorage.getItem('pinyin-keep-save-v2'))||{version:2,settings:{},records:{},upgrades:{},review:{}};s.coins=1000;s.learned=[];s.settings.onboarding=${onboarding};s.settings.builtin=${builtin};s.settings.keyboardMode=${JSON.stringify(keyboardMode)};s.settings.builtinMigrated=true;s.settings.debug=${debug};s.settings.sound=false;s.review=${JSON.stringify(review)};for(const id of ${JSON.stringify(data.stages.map(s=>s.id))})s.records[id]={stars:3,bestSpeed:1,bestScore:0,attempts:1,last:{speed:1,accuracy:1,score:0}};if(!s.settings.onboarding){s.records['r1-1'].stars=0;s.records['r1-boss'].stars=0;}localStorage.setItem('pinyin-keep-save-v2',JSON.stringify(s));})()`});
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
  const report=await evaluate(`(() => {const field=document.querySelector('#battlefield').getBoundingClientRect();const input=document.querySelector('#spell-form').getBoundingClientRect();const cards=[...document.querySelectorAll('.enemy:not(.defeated):not([hidden]) .question-card')].map(e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom}});const overlap=cards.some((a,i)=>cards.some((b,j)=>j>i&&a.x<b.right&&a.right>b.x&&a.y<b.bottom&&a.bottom>b.y));return {scroll:document.documentElement.scrollWidth,width:innerWidth,visible:visualViewport.height,inputBottom:input.bottom,fieldBottom:field.bottom,cards,overlap,bounds:cards.every(r=>r.x>=field.x&&r.right<=field.right+.5&&r.y>=field.y&&r.bottom<=field.bottom+.5)}})()`);
  check(report.scroll<=report.width&&!report.overlap&&report.bounds&&report.inputBottom<=report.visible+1&&report.fieldBottom<=report.inputBottom,label+' '+JSON.stringify(report));
}
try {
  await mkdir(new URL('shots7/regression-main',import.meta.url),{recursive:true});
  await send('Runtime.enable');await send('Log.enable');await send('Page.enable');
  const version=await cdp('Browser.getVersion');
  results.push(`環境：${process.version}，${version.product}，手機 DPR 3／觸控模擬`);
  console.log(results.at(-1));
  await metrics();await load();
  if (!process.argv.includes('--branches') && !process.argv.includes('--tail') && !process.argv.includes('--extra')) {
  await evaluate(`localStorage.removeItem('pinyin-keep-save-v2')`);await load();
  check(await evaluate(`document.title.includes('拼鬥魔法師')&&document.querySelectorAll('.stage-node').length===7`),'390×844 DPR3 觸控手機，離線載入新名稱與地圖');
  await screenshot('01-map');
  await touch('[data-action="settings"]');await evaluate(`const select=document.querySelector('#keyboard-mode');select.value='pinyin';select.dispatchEvent(new Event('change',{bubbles:true}));`);await touch('[data-action="close"]');
  await touch('[data-action="stage"][data-id="r1-1"]');await touch('[data-action="start"]');
  check(await evaluate(`document.querySelector('#start-reason').textContent.includes('30 秒')`),'首次進入有實際操作教學');
  await touch('#start-overlay [data-action="ready"]');
  check(await evaluate(`document.activeElement.classList.contains('active-input')&&!document.querySelector('.enemy')&&document.querySelector('#start-reason').textContent.includes('等待鍵盤')`),'同一開始手勢同步聚焦施法列，鍵盤出現前不出怪、不倒數');
  await mockKeyboard(500);
  check(await evaluate(`document.querySelector('#start-reason').textContent==='3'&&!document.querySelector('.enemy')`),'visualViewport 縮小確認鍵盤後才倒數 3');
  await waitFor(`document.querySelector('#start-overlay').hidden`);
  check(await evaluate(`document.querySelector('#action-prompt').textContent.includes('打出 b')&&!document.querySelector('#skip-onboarding').hidden`),'操作教學第一步正向作答、右上隨時可跳過');
  const hpStart=await evaluate(`document.querySelector('#hp-text').textContent`);
  const trainingPosition=await evaluate(`document.querySelector('.enemy').style.transform`);
  await delay(8500);
  check(await evaluate(`document.querySelector('#battlefield').classList.contains('answer-nudge')&&parseFloat(getComputedStyle(document.querySelector('.answer')).fontSize)>=25&&document.querySelector('.answer').textContent==='b'`),'8 秒沒有有效輸入，題卡答案放大閃動');
  await delay(12000);
  check(await evaluate(`!!document.querySelector('#late-skip')&&document.querySelector('#hp-text').textContent===${JSON.stringify(hpStart)}&&document.querySelector('.enemy').style.transform!==${JSON.stringify(trainingPosition)}`),'20 秒沒有進展提供跳過教學，怪物緩慢前進但不到城門也不扣血');
  await screenshot('00-tutorial-idle');
  await touch('.enemy');check(await evaluate(`!!document.querySelector('.enemy.locked')&&document.activeElement.classList.contains('active-input')`),'點怪鎖定保持焦點，正確輸入仍可前進');
  // Keep the physical editor reference: trailing input belongs to the editor
  // that just rotated, not whichever editor is active after compositionupdate.
  await evaluate(`window.imeStep=(value,start=false)=>{const i=document.querySelector('.active-input');if(start)i.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true}));i.dispatchEvent(new CompositionEvent('compositionupdate',{bubbles:true,data:value}));i.value=value;i.dispatchEvent(new InputEvent('input',{bubbles:true,data:value,isComposing:true,inputType:'insertCompositionText'}));}`);
  const firstSlot=await evaluate(`document.activeElement.id`);
  await evaluate(`imeStep('b',true)`);
  check(await evaluate(`document.querySelector('#action-prompt').textContent.includes('打出 p')&&document.activeElement.id===${JSON.stringify(firstSlot)}&&document.querySelector('#start-overlay').hidden`),'iOS b 組字無 compositionend 立即擊倒、保留同框焦點、不暫停');
  await screenshot('00-tutorial-step2');
  await evaluate(`imeStep('bp')`);
  check(await evaluate(`document.querySelector('#action-prompt').textContent.includes('兩隻一起來')&&document.querySelectorAll('.enemy:not(.defeated)').length===2&&document.querySelector('#combo-value').textContent.startsWith('2')&&document.querySelector('#start-overlay').hidden`),'組字未結束連續 bp，consumed 備援接受下一題 p，示範兩連擊');
  await mockKeyboard(420);await geometry('420px 教學兩隻題卡完整、不互疊');
  await screenshot('00-tutorial-step3-420');
  await evaluate(`imeStep('bpb')`);
  check(await evaluate(`document.querySelectorAll('.enemy:not(.defeated)').length===1&&document.querySelector('#action-prompt').textContent.includes('兩隻一起來')`),'兩隻教學接受首字母自動鎖定，先擊倒其中一隻');
  await evaluate(`imeStep('bpbp')`);
  check(await evaluate(`!document.querySelector('#tutorial-info').hidden&&document.querySelector('#tutorial-info').textContent.includes('連擊歸零')&&document.querySelector('#tutorial-info').textContent.includes('偷看')&&document.querySelector('#tutorial-info').textContent.includes('暫停')&&document.querySelector('#start-overlay').hidden`),'兩隻皆擊倒後進入第 4 步靜態說明，不要求故意打錯');
  await screenshot('00-tutorial-step4');
  await touch('[data-action="onboarding-done"]');
  check(await evaluate(`document.querySelector('#guide-panel').dataset.step==='look'&&JSON.parse(localStorage.getItem('pinyin-keep-save-v2')).settings.onboarding`),'我知道了結束四步教學，記住完成狀態並進入引導');
  await mockKeyboard(844);await screenshot('02-guide-look');
  for(let i=0;i<8;i++)await touch('[data-action="guide-next"]');
  await ready({keyboard:true});await screenshot('03-guide-follow');
  for(const q of data.phonics.slice(0,8))await textInput(q.pinyin);
  check(await evaluate(`document.querySelector('#guide-panel').dataset.step==='try'&&!/[a-z]/i.test(document.querySelector('.lesson-note').textContent)`),'跟著打完後進入隱藏答案的試，訣竅文字也不洩漏拼音');
  await screenshot('04-guide-try');
  await textInput('x');check(await evaluate(`document.querySelector('.lesson-note').textContent.includes('請從頭重打')&&!document.querySelector('.enemy:not(.defeated)')`),'試答錯立即揭答並要求重打，沒有怪物與扣血');
  for(const q of data.phonics.slice(0,8))await textInput(q.pinyin);
  check(await evaluate(`!document.querySelector('#start-overlay').hidden&&document.querySelector('#start-reason').textContent.includes('引導完成')`),'全部試答正確後才提供戰鬥開始');
  check(await evaluate(`JSON.parse(localStorage.getItem('pinyin-keep-save-v2')).learned.length===8`),'八個聲母完成試練後逐題存檔為實際學過');
  await ready();await waitFor(`document.querySelector('.enemy:not(.defeated)')`);await screenshot('05-battle');await geometry('手機戰場、題卡位於鍵盤上方');
  await solve();check(await evaluate(`document.querySelector('.result-stars').textContent==='★★★'`),'以一般 beforeinput/input 字母事件完整通過第一關三星');
  await mockKeyboard(844);await screenshot('06-result');await backMap();
  check(await evaluate(`document.querySelector('[data-id="r1-2"]').getAttribute('aria-disabled')==='false'`),'通關依序解鎖並保留金幣與星等');
  await load();check(await evaluate(`JSON.parse(localStorage.getItem('pinyin-keep-save-v2')).records['r1-1'].stars===3`),'重新載入保留進度');
  }
  if (!process.argv.includes('--intro') && !process.argv.includes('--extra')) {
  if (!process.argv.includes('--tail')) {
  await seed();
  check(await evaluate(`JSON.parse(localStorage.getItem('pinyin-keep-save-v2')).records['r1-6']?.stars===3`),'測試 fixture 已解鎖並三星各關');
  // All modes must complete the actual first-stage guide, then fight.
  for (const mode of ['pinyin','english','builtin']) {
    await seed({keyboardMode:mode});
    await touch('[data-action="settings"]');
    check(await evaluate(`document.querySelector('#keyboard-mode').value===${JSON.stringify(mode)}`),`${mode} 鍵盤模式存檔、地圖設定入口`);
    await touch('[data-action="close"]');
    await stage('r1-1',false);
    if(mode==='builtin') await touch('[data-action="guide-next"]');
    else {
      await textInput('b');
      check(await evaluate(`document.querySelector('#guide-panel .guide-top').textContent.includes('2 /')`),`${mode} 看階段直接答對也前進`);
    }
    for(let i=0;i<7;i++)await touch('[data-action="guide-next"]');
    await ready({keyboard:mode!=='builtin'});
    check(await evaluate(`document.querySelector('.active-input').type===${JSON.stringify(mode==='english'?'email':'text')}&&document.querySelector('.active-input').inputMode===${JSON.stringify(mode==='english'?'email':mode==='builtin'?'none':'text')}`),`${mode} 輸入框屬性正確`);
    for(let round=0;round<2;round++)for(const q of data.phonics.slice(0,8)) {
      if(mode==='builtin')for(const c of q.pinyin)await touch(`[data-key="${c}"]`);
      else await textInput(q.pinyin);
    }
    check(await evaluate(`document.querySelector('#start-reason').textContent.includes('引導完成')`),`${mode} 第一關看／跟／試全部完成`);
    await ready({keyboard:mode!=='builtin'});await waitFor(`document.querySelector('.enemy:not(.defeated)')`);
    check(await evaluate(`document.querySelector('#action-prompt').textContent.includes('鎖定')`),`${mode} 戰鬥等待輸入有明確指示`);
    const e=await enemy();const old=await evaluate(`document.querySelector('.active-input').id`);
    if(mode==='builtin')for(const c of e.q.pinyin)await touch(`[data-key="${c}"]`);
    else await textInput(e.q.pinyin);
    check(await evaluate(`document.querySelector('#progress-value').textContent.startsWith('1 /')&&document.querySelector('.active-input').value===''&&document.querySelector('.active-input').id===${JSON.stringify(old)}&&document.querySelector('#start-overlay').hidden`),`${mode} 戰鬥擊倒後同框、清空、不暫停`);
    await touch('[data-action="pause"]');await touch('#start-overlay [data-action="settings"]');
    check(await evaluate(`!!document.querySelector('#keyboard-mode')`),`${mode} 暫停選單可進設定`);
    await touch('[data-action="close"]');await touch('#start-overlay [data-action="map"]');
  }
  await seed({debug:true});await stage('r1-1');await ready({keyboard:true});
  await waitFor(`document.querySelector('.enemy:not(.defeated)')`);
  await mockKeyboard(420);
  const debugSlot=await evaluate(`document.activeElement.id`);
  await composition('start','');await composition('update','x');
  check(await evaluate(`document.activeElement.id===${JSON.stringify(debugSlot)}&&document.querySelector('.active-input').value===''&&document.querySelector('.enemy.reveal')&&document.querySelector('#start-overlay').hidden`),'打錯同事件同框清空、揭答、可乾淨重打');
  for(let i=0;i<10;i++)await textInput('');
  check(await evaluate(`document.querySelector('#debug-events').textContent.split('\\n').length===8&&document.querySelector('#debug-context').textContent.includes('UA')&&document.querySelector('#debug-events').textContent.includes(' N')`),'偵錯面板最近 8 筆事件與 viewport／焦點／UA 有內容');
  const debugRect=await evaluate(`(()=>{const r=e=>{const b=e.getBoundingClientRect();return {x:b.x,y:b.y,right:b.right,bottom:b.bottom}};const panel=r(document.querySelector('#input-debug'));const targets=[document.querySelector('.question-card'),document.querySelector('#spell-form'),document.querySelector('.creature')].map(r);return {panel,targets,ok:targets.every(t=>panel.bottom<=t.y||panel.y>=t.bottom||panel.right<=t.x||panel.x>=t.right)}})()`);
  check(debugRect.ok,'偵錯面板不遮擋題卡、怪物、施法列 '+JSON.stringify(debugRect));
  await geometry('420px App 瀏覽器＋鍵盤＋偵錯版面');
  check(await evaluate(`(()=>{const f=document.querySelector('#battlefield').getBoundingClientRect();return [...document.querySelectorAll('.enemy:not(.defeated):not([hidden])')].every(e=>{const c=e.querySelector('.question-card').getBoundingClientRect(),m=e.querySelector('.creature').getBoundingClientRect();return m.y>=c.bottom&&m.bottom<=f.bottom+1&&m.x>=f.x&&m.right<=f.right})})()`),'420px 題卡在怪物正上方，怪物完整露出並置中');
  await screenshot('00-debug-420');await backMap();await load();
  check(await evaluate(`!document.querySelector('#input-debug').hidden`),'偵錯開關重新載入仍保留');
  await touch('[data-action="settings"]');await touch('#debug-toggle');await touch('[data-action="close"]');
  check(await evaluate(`document.querySelector('#input-debug').hidden`),'設定可關閉偵錯面板');
  await seed();
  // Preview all 30 normal/boss lesson cards; do not claim all 30 have been played.
  for(const s of data.stages) {
    await touch(`[data-action="region"][data-id="${s.region}"]`);await touch(`[data-action="stage"][data-id="${s.id}"]`);
    assert.ok(await evaluate(`document.querySelector('#modal').open&&document.querySelectorAll('.example-tile').length>=2`),s.id);await touch('[data-action="close"]');
  }
  check(true,'全部 30 關教學卡可開啟');
  await stage('r1-6');
  await touch('#start-overlay [data-action="ready"]');await mockKeyboard(500);
  await evaluate(`document.querySelector('.active-input').blur()`);
  check(await evaluate(`document.querySelector('#start-overlay').textContent.includes('點我繼續')&&!document.querySelector('.enemy:not(.defeated)')`),'倒數期間失焦也會取消倒數並暫停');
  await ready({keyboard:true});await waitFor(`document.querySelector('.enemy:not(.defeated)')`);
  let e=await enemy();await textInput(e.q.pinyin[0]);
  const before=await evaluate(`Object.values(JSON.parse(localStorage.getItem('pinyin-keep-save-v2')).review).reduce((n,r)=>n+r.count,0)`);
  await textInput('');
  check(await evaluate(`document.querySelectorAll('.enemy:not(.defeated) .typed').length===0`),'刪除 raw 變短會回退進度');
  check(await evaluate(`Object.values(JSON.parse(localStorage.getItem('pinyin-keep-save-v2')).review).reduce((n,r)=>n+r.count,0)`)===before,'刪除不計錯誤');
  await evaluate(`document.querySelector('.active-input').blur()`);
  check(await evaluate(`!document.querySelector('#start-overlay').hidden&&document.querySelector('#start-overlay').textContent.includes('點我繼續')`),'施法列失焦立即暫停');
  const pos=await evaluate(`document.querySelector('.enemy').style.transform`);await delay(250);check(await evaluate(`document.querySelector('.enemy').style.transform`)===pos,'暫停怪物位置凍結');
  await ready();check(await evaluate(`document.activeElement.classList.contains('active-input')`),'點我繼續重新聚焦並倒數');
  await composition('start','');await composition('update','ㄋㄧ');
  check(await evaluate(`document.querySelector('#start-overlay').textContent.includes('目前是注音鍵盤')&&document.querySelector('.keyboard-help').textContent.includes('iOS')&&document.querySelector('.keyboard-help').textContent.includes('Android')`),'注音組字暫停並提供 iOS／Android 繁體拼音切換步驟');
  await composition('end','');await ready();
  await mockKeyboard(844);check(await evaluate(`document.querySelector('#start-overlay').textContent.includes('鍵盤已收起')`),'系統鍵盤收起立即暫停');await backMap();
  // First-area composition path (no Han commits) full first stage.
  await stage('r1-1');await ready({keyboard:true});await solve('composition');
  check(await evaluate(`document.querySelector('.result-stars').textContent==='★★★'`),'compositionstart/update/end 字母路徑完整通過第一關');await backMap();
  // Targeted review pool contains known questions, supplied only through a real saved review list.
  const ni=data.characters.find(q=>q.text==='你'),hao=data.characters.find(q=>q.text==='好');
  await seed({review:{[ni.id]:{count:1,mastered:0},[hao.id]:{count:1,mastered:0}}});
  await touch('[data-action="review"]');await touch('[data-action="review-start"]');await touch('[data-action="start"]');await ready({keyboard:true});
  await waitFor(`document.querySelectorAll('.enemy:not(.defeated)').length===2`,12000);
  await composition('start','');await composition('update','ni');
  check(await evaluate(`document.querySelector('#progress-value').textContent.startsWith('1 /')`),'拼音組字 ni 立即完成一題');
  await composition('update',"ni ' hao");
  check(await evaluate(`document.querySelector('#progress-value').textContent.startsWith('2 /')`),'同一次組字 ni hao 含空白、撇號，用 consumed 前綴再完成下一題');
  await composition('end','你好');
  check(await evaluate(`document.querySelector('#progress-value').textContent.startsWith('2 /')&&document.querySelector('.active-input').value===''`),'compositionend 國字不重複擊倒，兩個施法列維持空白');
  await textInput('你好');
  check(await evaluate(`document.querySelector('#progress-value').textContent.startsWith('2 /')`),'compositionend 後緊接重複 input 不重複計分');
  await waitFor(`document.querySelector('.enemy:not(.defeated)')`);e=await enemy();
  const scoreBeforeHan=await evaluate(`Number(document.querySelector('#score-value').textContent)`);await textInput(e.q.text);
  check(await evaluate(`Number(document.querySelector('#score-value').textContent)>${scoreBeforeHan}&&document.querySelector('.active-input').value===''`),'非組字 input 送出正確國字可擊倒或破除厚血護甲');
  await waitFor(`document.querySelector('.enemy:not(.defeated)')`);
  const mistakesBeforeHan=await evaluate(`Object.values(JSON.parse(localStorage.getItem('pinyin-keep-save-v2')).review).reduce((n,r)=>n+r.count,0)`);
  await textInput('錯');check(await evaluate(`Object.values(JSON.parse(localStorage.getItem('pinyin-keep-save-v2')).review).reduce((n,r)=>n+r.count,0)===${mistakesBeforeHan+1}&&!!document.querySelector('.enemy.reveal')`),'選錯國字只記一次錯誤並揭答');
  await backMap();
  const word=data.words.find(q=>q.text==='你好');
  await seed({review:{[word.id]:{count:1,mastered:0}}});await touch('[data-action="review"]');await touch('[data-action="review-start"]');await touch('[data-action="start"]');await ready({keyboard:true});
  await waitFor(`document.querySelector('.enemy:not(.defeated)')`);await composition('start','');await composition('update','ni');
  check(await evaluate(`document.querySelectorAll('.enemy .typed').length===2&&document.querySelector('#progress-value').textContent.startsWith('0 /')`),'詞語需完整拼音，ni 只亮前綴');
  await composition('update',"ni 'hao");await composition('end','你好');
  check(await evaluate(`document.querySelector('#progress-value').textContent.startsWith('1 /')`),'詞語帶撇號 ni hao 組字與完整國字送出只計一次');
  await waitFor(`document.querySelector('.enemy:not(.defeated)')`);await textInput('你');
  check(await evaluate(`document.querySelector('#progress-value').textContent.startsWith('1 /')&&document.querySelector('.enemy.reveal')`),'只送詞的一個字不算完整匹配並揭答');
  const embeddedScore=await evaluate(`Number(document.querySelector('#score-value').textContent)`);
  await textInput('甲你好乙');
  check(await evaluate(`Number(document.querySelector('#score-value').textContent)>${embeddedScore}`),'送出的國字包含完整在場詞語時仍可命中，額外錯字另算錯');
  await backMap();
  // Built-in keyboard must be enabled through settings; touch events go through pointerdown.
  await seed();await touch('[data-action="settings"]');await evaluate(`(()=>{const s=document.querySelector('#keyboard-mode');s.value='builtin';s.dispatchEvent(new Event('change',{bubbles:true}));})()`);await touch('[data-action="close"]');
  await stage('r1-1');await ready();check(await evaluate(`!document.querySelector('#builtin-keyboard').hidden&&!document.activeElement.classList.contains('spell-input')`),'設定開啟內建鍵盤後不聚焦系統輸入框');
  check(await evaluate(`Array.from(document.querySelectorAll('#builtin-keyboard button')).every(e=>{const r=e.getBoundingClientRect();return r.width>=24&&r.height>=42&&r.right<=innerWidth})`),'內建鍵盤三排鍵寬隨螢幕分配、鍵高至少 42px，整排不溢出');
  await screenshot('07-builtin');await solve('touch');check(await evaluate(`document.querySelector('.result-stars').textContent==='★★★'`),'內建 QWERTY pointerdown 觸控完整通過第一關三星');
  check(await evaluate(`JSON.parse(localStorage.getItem('pinyin-keep-save-v2')).settings.builtin===true`),'內建鍵盤作答與通關存檔不會關閉鍵盤設定');await backMap();
  const zh=data.phonics.find(q=>q.pinyin==='zh');
  await seed({builtin:true,review:{[zh.id]:{count:1,mastered:0}}});
  await touch('[data-action="review"]');await touch('[data-action="review-start"]');await touch('[data-action="start"]');await ready();
  await waitFor(`document.querySelector('.enemy:not(.defeated)')`);
  const points=await evaluate(`['z','h'].map((key,id)=>{const r=document.querySelector('[data-key="'+key+'"]').getBoundingClientRect();return {id:id+1,x:r.x+r.width/2,y:r.y+r.height/2}})`);
  await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:points});
  await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  check(await evaluate(`document.querySelector('#progress-value').textContent.startsWith('1 /')`),'內建鍵盤兩指同時 z／h 的 pointerdown 不漏鍵');
  await touch('[data-key="x"]');
  check(await evaluate(`document.querySelector('.active-input').value===''`),'兩波之間多按的字母不殘留到下一隻怪');
  await backMap();
  }
  await seed();await touch('[data-action="shop"]');await screenshot('08-shop');
  for(const key of ['gate','peek','guard'])await touch(`[data-action="buy"][data-id="${key}"]`);
  check(await evaluate(`(() => {const s=JSON.parse(localStorage.getItem('pinyin-keep-save-v2'));return s.coins===805&&s.upgrades.gate===1&&s.upgrades.peek===1&&s.upgrades.guard===1})()`),'小店三項升級扣款並保留');await touch('[data-action="close"]');
  await stage('r1-boss');await ready({keyboard:true});await waitFor(`document.querySelector('.enemy:not(.defeated)')`);await screenshot('09-boss');
  await touch('[data-action="pause"]');const charge=await evaluate(`document.querySelector('#charge-fill').style.width`);await delay(300);check(await evaluate(`document.querySelector('#charge-fill').style.width`)===charge,'王蓄力暫停凍結');await ready();await solve();
  check(await evaluate(`document.querySelector('.result-stars').textContent==='★★★'`),'手機王關三段護甲完整通關');await backMap();
  await stage('r3-1',false);await screenshot('10-paired-guide');check(await evaluate(`document.querySelectorAll('.pair-compare span').length===4`),'第三區引導以成對比較呈現');await backMap();
  await stage('r5-1',false);
  check(await evaluate(`document.querySelector('#guide-panel').scrollWidth<=document.querySelector('#guide-panel').clientWidth`),'第五區長句引導與鍵位示範無水平溢出');
  await backMap();
  await stage('r5-1');await ready({keyboard:true});await screenshot('11-temple');
  await composition('start','');await textInput('ㄨㄛ',true);check(await evaluate(`document.querySelector('#start-overlay').textContent.includes('目前是注音鍵盤')`),'第五區同樣攔截注音並保留拼音選字流程');await composition('end','');await ready();
  await composition('start','');await press('Enter');await press('Escape');check(await evaluate(`document.querySelector('#start-overlay').hidden&&document.querySelector('#progress-value').textContent.startsWith('12 /')`),'第五區組字中 Enter／Esc 不施放或暫停');await composition('end','');
  for(let i=0;i<7;i++) {
    if(await evaluate(`!document.querySelector('#result-screen').hidden`))break;
    await waitFor(`!document.querySelector('#cast-button').disabled`);
    const target=await evaluate(`document.querySelector('#spell-target').textContent`);
    await composition('start','');await textInput(target,true);await composition('end',target);await delay(120);if(i===0) await touch('#cast-button'); else await press('Enter');
  }
  await waitFor(`!document.querySelector('#result-screen').hidden`,1500); // Final impact now paints before results.
  check(await evaluate(`!document.querySelector('#result-screen').hidden&&document.querySelector('.result-stars').textContent==='★★★'`),'第五區完整中文組字、Enter 施放至三星通關');await screenshot('12-temple-result');await backMap();
  for(const [w,h] of [[360,640],[430,932]]) {
    await metrics(w,h);await load();check(await evaluate(`document.documentElement.scrollWidth<=innerWidth`),`${w}×${h} 地圖無水平捲動`);
    await stage('r4-3');await ready();await waitFor(`document.querySelectorAll('.enemy:not(.defeated)').length===3`,12000);await geometry(`${w}×${h} 三隻長詞題卡不重疊`);await screenshot(`13-battle-${w}`);
    await mockKeyboard(h-280);await geometry(`${w}×${h} 模擬鍵盤後題卡不遮擋施法列`);await screenshot(`14-keyboard-${w}`);await backMap();
  }
  await metrics(1280,720,false);await load();await stage('r1-1');
  const fallbackStarted=Date.now();await ready();
  check(Date.now()-fallbackStarted>=4300,'未偵測螢幕鍵盤時，等 1.5 秒備援與三秒倒數才開戰');
  await waitFor(`document.querySelector('.enemy:not(.defeated)')`);await screenshot('15-desktop');await solve('key');check(await evaluate(`document.querySelector('.result-stars').textContent==='★★★'`),'1280×720 桌機實體 CDP keyDown/keyUp 完整通過第一關');await backMap();
  await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-color-scheme',value:'dark'},{name:'prefers-reduced-motion',value:'reduce'}]});await load();
  check(await evaluate(`getComputedStyle(document.documentElement).getPropertyValue('--paper').trim()==='#fff8ea'&&matchMedia('(prefers-reduced-motion:reduce)').matches`),'預設明亮主題不跟系統暗色，尊重 reduced-motion');
  const {identifier}=await send('Page.addScriptToEvaluateOnNewDocument',{source:`Storage.prototype.getItem=function(){throw Error('blocked')};Storage.prototype.setItem=function(){throw Error('blocked')};`});await load();
  check(await evaluate(`!document.querySelector('#storage-notice').hidden&&document.querySelectorAll('.stage-node').length===7`),'儲存遭封鎖仍可玩並顯示暫存提示');await send('Page.removeScriptToEvaluateOnNewDocument',{identifier});
  }
  if (!process.argv.includes('--intro') && !process.argv.includes('--tail')) {
    await metrics();await seed({onboarding:false});await stage('r1-1',false);
    await touch('#skip-onboarding');
    check(await evaluate(`document.querySelector('#guide-panel').dataset.step==='look'&&JSON.parse(localStorage.getItem('pinyin-keep-save-v2')).settings.onboarding&&document.querySelector('#skip-onboarding').hidden`),'操作教學開始前右上跳過可用，並進入引導');
    await seed({onboarding:false});await stage('r1-1',false);await ready({keyboard:true});await delay(8500);
    check(await evaluate(`parseFloat(getComputedStyle(document.querySelector('.answer')).fontSize)>=25&&document.querySelector('#battlefield').classList.contains('answer-nudge')`),'閒置提示實際放大到 25px 並閃動');
    await screenshot('00-tutorial-idle');await touch('#skip-onboarding');
    for(const [id,mode] of [['r2-1','pinyin'],['r5-1','english']]) {
      await seed({keyboardMode:mode});await stage(id,false);
      const items=data.stages.find(s=>s.id===id).pool.map(id=>data.questionsById[id]);
      for(const q of items)await textInput(q.text);
      check(await evaluate(`document.querySelector('#guide-panel').dataset.step==='follow'`),`${id} 看階段正確國字／整句也會前進`);
      await ready({keyboard:true});
      for(let round=0;round<2;round++)for(const q of items)await textInput(q.text);
      check(await evaluate(`document.querySelector('#start-reason').textContent.includes('引導完成')`),`${id} 跟／試正確選字全部接受`);
      if(id==='r5-1')check(await evaluate(`document.querySelector('.active-input').type==='text'&&document.querySelector('.active-input').inputMode==='text'`),'英文鍵盤設定下第五區仍是一般文字框');
    }
    await seed({onboarding:false});await stage('r1-boss');await ready({keyboard:true});
    for(const c of ['b','p','b','p'])await textInput(c);
    check(await evaluate(`!document.querySelector('#tutorial-info').hidden`),'已解鎖王關首次操作教學仍能用正確答案完成四隻');
    await touch('[data-action="onboarding-done"]');
    check(await evaluate(`document.querySelector('#start-reason').textContent.includes('操作教學完成')&&document.querySelector('#progress-value').textContent.includes('12')`),'從王關結束教學可回到完整護甲戰鬥');
    await seed();await stage('r5-1');await ready({keyboard:true});
    const spellSlot=await evaluate(`document.querySelector('.active-input').id`);
    await textInput(await evaluate(`document.querySelector('#spell-target').textContent`));await press('Enter');
    check(await evaluate(`document.activeElement.id===${JSON.stringify(spellSlot)}&&[...document.querySelectorAll('.spell-input')].every(i=>i.value==='')&&document.querySelector('#spell-feedback').textContent.includes('咒語命中')&&document.querySelector('#start-overlay').hidden`),'第五區施放命中也同事件同框清空且不暫停');
    await waitFor(`!document.querySelector('#cast-button').disabled`);
    const retrySlot=await evaluate(`document.querySelector('.active-input').id`);
    await textInput('錯');await press('Enter');
    check(await evaluate(`document.activeElement.id===${JSON.stringify(retrySlot)}&&[...document.querySelectorAll('.spell-input')].every(i=>i.value==='')&&document.querySelector('#spell-feedback').textContent.includes('未達 80%')&&document.querySelector('#start-overlay').hidden`),'第五區未達門檻重試也同框清空，保留逐字回饋');
    const word=data.words.find(q=>q.text==='你好');
    await seed({review:{[word.id]:{count:1,mastered:0}}});
    await touch('[data-action="review"]');await touch('[data-action="review-start"]');await touch('[data-action="start"]');await ready({keyboard:true});
    await waitFor(`document.querySelector('.enemy:not(.defeated)')`);
    const before=await evaluate(`JSON.parse(localStorage.getItem('pinyin-keep-save-v2')).review[${JSON.stringify(word.id)}].count`);
    await composition('start','');await composition('update','ni');
    await evaluate(`(()=>{const i=document.querySelector('.active-input');i.value='n';i.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'deleteContentBackward',isComposing:true}));})()`);
    check(await evaluate(`document.querySelectorAll('.enemy .typed').length===1&&JSON.parse(localStorage.getItem('pinyin-keep-save-v2')).review[${JSON.stringify(word.id)}].count===${before}`),'組字中 deleteContentBackward 回退一字且不計錯');
    await evaluate(`(()=>{const i=document.querySelector('.active-input');i.value='';i.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'deleteContentBackward',isComposing:true}));})()`);
    check(await evaluate(`document.querySelectorAll('.enemy .typed').length===0&&JSON.parse(localStorage.getItem('pinyin-keep-save-v2')).review[${JSON.stringify(word.id)}].count===${before}`),'組字刪光不計錯，進度歸零');
    await evaluate(`(()=>{const i=document.querySelector('.active-input');i.addEventListener('blur',()=>{i.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true,data:'錯'}));i.value='錯';i.dispatchEvent(new InputEvent('input',{bubbles:true,data:'錯',inputType:'insertText'}));},{once:true});})()`);
    await textInput('nihao',true);
    check(await evaluate(`document.querySelector('#progress-value').textContent.startsWith('1 /')&&document.querySelector('#start-overlay').hidden&&document.activeElement.classList.contains('active-input')&&JSON.parse(localStorage.getItem('pinyin-keep-save-v2')).review[${JSON.stringify(word.id)}].count===${before}`),'穩定同框組字命中不觸發 blur、不重複判錯或暫停');
    await metrics(360,640);await seed({builtin:true});await stage('r1-1');await ready();await waitFor(`document.querySelector('.enemy:not(.defeated)')`);
    await geometry('360×640 內建鍵盤題卡、施法列完整可見');
    check(await evaluate(`document.querySelector('#builtin-keyboard').getBoundingClientRect().bottom<=visualViewport.height&&document.querySelector('.enemy:not(.defeated) .creature').getBoundingClientRect().bottom<=document.querySelector('#battlefield').getBoundingClientRect().bottom`),'360×640 內建鍵盤和怪物完整可見');
    await screenshot('16-builtin-360');
    await solve('touch');
    check(await evaluate(`document.querySelector('.result-stars').textContent==='★★★'`),'360×640 內建鍵盤完整第一關三星補測');
    await touch('#result-screen [data-action="map"]');
    check(await evaluate(`!document.querySelector('#map-screen').hidden`),'內建鍵盤通關不穿透點擊，新手勢仍可立即回地圖');
    await seed({builtin:true});
    await evaluate(`(()=>{const s=JSON.parse(localStorage.getItem('pinyin-keep-save-v2'));delete s.settings.keyboardMode;localStorage.setItem('pinyin-keep-save-v2',JSON.stringify(s));})()`);await load();await touch('[data-action="settings"]');
    check(await evaluate(`document.querySelector('#keyboard-mode').value==='builtin'`),'舊版 builtin 設定可遷移到三選一模式');
  }
  check(errors.length===0,`全程 0 console error／runtime exception：${errors.join(';')}`);
} catch(error) {
  await screenshot('failure').catch(()=>{});results.push(`FAIL ${error.stack}`);console.error(error);process.exitCode=1;
} finally {
  await writeFile(new URL(process.argv.includes('--intro')?'browser-intro5-output.txt':process.argv.includes('--extra')?'browser-extra5-output.txt':process.argv.includes('--tail')?'browser-tail5-output.txt':'browser-smoke5-output.txt',import.meta.url),results.join('\n')+'\nConsole errors: '+JSON.stringify(errors)+'\n');
  await cdp('Browser.close').catch(()=>{});ws.close();
  if(chrome.exitCode===null)await new Promise(resolve=>chrome.once('exit',resolve));
  await rm(new URL(profile,import.meta.url),{recursive:true,force:true});
  // Chrome helpers may keep the inherited stderr pipe open after browser exit.
  chrome.stderr.destroy(); chrome.unref();
}

if (!process.exitCode && !process.argv.slice(2).length) await import('./browser-audio4.mjs');

if (!process.exitCode && !process.argv.slice(2).length) await import('./browser-time6.mjs');
