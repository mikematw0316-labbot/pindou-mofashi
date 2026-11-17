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
    spoken, stagePool, guideItems, spawnEnemy, processText, completeQuestion, pauseGame, tick,
    setLastTime(v){lastTime=v;}, renderEnemy, positionEnemy, persist, renderGuide, addCombo};
  </script>\n</body>`);
await writeFile(new URL('.test4.html',import.meta.url),fixture);

const results = [];
const errors = [];
const check = (condition, label) => { assert.ok(condition, label); results.push(`PASS ${label}`); console.log(`PASS ${label}`); };
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const profile = '.chrome-audio-profile4';
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
  await writeFile(new URL(`shots7/regression-audio/${name}.png`, import.meta.url), Buffer.from(data, 'base64'));
}
async function load() {
  await evaluate(`window.__smokeBeforeNavigation=true`);
  await send('Page.navigate', {url: pathToFileURL(`${root}.test4.html`).href});
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
  const report=await evaluate(`(() => {const field=document.querySelector('#battlefield').getBoundingClientRect();const input=document.querySelector('#spell-form').getBoundingClientRect();const cards=[...document.querySelectorAll('.enemy:not(.defeated):not([hidden]) .question-card')].map(e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom}});const overlap=cards.some((a,i)=>cards.some((b,j)=>j>i&&a.x<b.right&&a.right>b.x&&a.y<b.bottom&&a.bottom>b.y));return {scroll:document.documentElement.scrollWidth,width:innerWidth,visible:visualViewport.height,inputBottom:input.bottom,fieldBottom:field.bottom,cards,overlap,bounds:cards.every(r=>r.x>=field.x&&r.right<=field.right+.5&&r.y>=field.y&&r.bottom<=field.bottom+.5)}})()`);
  check(report.scroll<=report.width&&!report.overlap&&report.bounds&&report.inputBottom<=report.visible+1&&report.fieldBottom<=report.inputBottom,label+' '+JSON.stringify(report));
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
  await writeFile(new URL(`shots7/regression-audio/${name}.png`,import.meta.url),Buffer.from(data,'base64'));
}
try {
  await mkdir(new URL('shots7/regression-audio',import.meta.url),{recursive:true});
  await send('Runtime.enable');await send('Log.enable');await send('Page.enable');await metrics();
  await audioMode();
  check(await evaluate(`__mock.contexts===0&&__mock.calls.filter(c=>c.type==='speak').length===0&&!__test.audio.diagnostics.unlocked`),'手勢之前無 AudioContext、無 speak、尚未解鎖');
  await touch('[data-action="settings"]');
  check(await evaluate(`__mock.contexts===1&&__mock.resumes>0&&__test.audio.diagnostics.unlocked&&__mock.calls.some(c=>c.type==='speak'&&c.volume===0)`),'真實按鈕手勢建立並 resume AudioContext、無聲 utterance 解鎖');
  check(await evaluate(`document.querySelector('#voice-status').textContent.includes('台灣')&&__test.audio.diagnostics.voice==='zh-TW'`),'中文 voice 優先 zh-TW');
  await evaluate(`document.querySelector('.sound-settings').scrollIntoView({block:'start'})`);
  await delay(300);await evaluate(`window.getSelection()?.removeAllRanges()`);
  await shotNow('01-sound-settings');
  await touch('[data-action="test-speech"]');await waitFor(`__test.audio.diagnostics.speaking`);
  check(await evaluate(`__test.audio.diagnostics.speaking&&__mock.nodes.some(n=>n.kind==='gain'&&n.gain.events.some(e=>e[0]==='ramp'&&e[1]===.24))`),'語音期間 music duck gain 淡到 .24');
  await evaluate(`__mock.endSpeech()`);
  check(await evaluate(`!__test.audio.diagnostics.speaking`),'語音結束恢復音樂增益');
  for(const [key,value] of [['speech',false],['music',false],['effects',false],['speechVolume',36],['musicVolume',27],['effectsVolume',58],['speechRate',1.2]]) {
    await evaluate(`(()=>{const e=document.querySelector('[data-sound-setting="${key}"]');if(e.type==='checkbox')e.checked=${value};else e.value=${value};e.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  }
  await load(); await touch('[data-action="settings"]');
  check(await evaluate(`['speech','music','effects'].every(k=>!__test.save.settings[k])&&__test.save.settings.speechVolume===36&&__test.save.settings.musicVolume===27&&__test.save.settings.effectsVolume===58&&__test.save.settings.speechRate===1.2`),'三組開關／音量／語速重新載入保留');
  await seed();await stage('r1-1',false);
  check(await evaluate(`!__test.audio.diagnostics.paused`),'看卡閱讀時可播放地區音樂');
  await touch('[data-action="pause"]');
  check(await evaluate(`__test.audio.diagnostics.paused&&!__test.audio.diagnostics.speaking`),'看卡階段按暫停也停止語音並淡出音樂');
  await battle();await waitFor(`__mock.calls.some(c=>c.type==='speak'&&c.text===__test.spoken(__test.game.enemies[0].q))`);
  check(await evaluate(`__mock.calls.some(c=>c.type==='speak'&&c.text===__test.spoken(__test.game.enemies[0].q))`),'第一區出怪唸注音讀法');
  const noRepeat=await evaluate(`(()=>{const n=__mock.calls.length;for(let i=0;i<20;i++)__test.audio.target();return __mock.calls.length===n;})()`);
  check(noRepeat,'同一隻怪不重複自動唸');
  const replay=await evaluate(`({id:document.activeElement.id,n:__mock.calls.length})`);
  await touch('.enemy .replay');await delay(250);
  check(await evaluate(`document.activeElement.id===${JSON.stringify(replay.id)}&&__mock.calls.length>${replay.n}&&document.querySelector('#start-overlay').hidden`),'題卡重聽會 speak，輸入焦點與鍵盤暫停狀態不變');
  await evaluate(`__mock.calls=[]`);await textInput('x');await delay(250);
  check(await evaluate(`__mock.calls.some(c=>c.type==='speak'&&c.text===__test.spoken(__test.game.enemies[0].q))`),'打錯唸正確注音讀法');
  await touch('[data-action="sound"]');
  check(await evaluate(`__test.save.settings.muted&&__mock.nodes.some(n=>n.kind==='gain'&&n.gain.events.at(-1)?.[1]===0)`),'戰鬥總靜音將總增益淡到 0');
  check(await evaluate(`(()=>{const n=__mock.calls.length;__test.audio.target(true);__test.audio.effect('hit');return __mock.calls.length===n;})()`),'總靜音禁止語音與音效');
  await load();check(await evaluate(`__test.save.settings.muted`),'總靜音存檔');
  await battle('r2-3');
  await evaluate(`__test.game.spawnIn=0`);await waitFor(`__test.game.enemies.length>=2`);
  await evaluate(`__mock.calls=[]`);await touch('.enemy:nth-child(2)');await delay(250);
  check(await evaluate(`__mock.calls.some(c=>c.type==='cancel')&&__mock.calls.findLast(c=>c.type==='speak')?.text===__test.spoken(__test.game.enemies.find(e=>e.id===__test.game.locked).q)`),'切換鎖定經安全間隔 cancel 再唸鎖定國字，僅唸目前目標');
  check(await evaluate(`!document.querySelector('#target-line').hidden&&document.querySelector('.enemy.locked')`),'鎖定框與連線清楚顯示');
  // Verify all region themes plus boss variations against the actual scheduler.
  const themes=[];
  for(const id of ['r1-1','r2-1','r3-1','r4-1','r5-1']) {
    await battle(id);themes.push(await evaluate(`__test.audio.diagnostics.theme`));
  }
  check(new Set(themes).size===5,'五地區使用五個不同排程曲目');
  await battle('r4-boss');
  check(await evaluate(`__test.audio.diagnostics.boss&&__test.audio.diagnostics.theme===4`),'王關使用該區加速低音／打擊變奏');
  await touch('[data-action="pause"]');
  check(await evaluate(`__test.audio.diagnostics.paused&&!__test.audio.diagnostics.speaking&&__mock.nodes.some(n=>n.kind==='gain'&&n.gain.events.some(e=>e[0]==='ramp'&&e[1]===0))`),'暫停停止語音，音樂 gate 使用排程淡到 0');
  await ready({keyboard:true});
  check(await evaluate(`!__test.audio.diagnostics.paused&&__mock.nodes.some(n=>n.kind==='gain'&&n.gain.events.at(-1)?.[0]==='ramp'&&n.gain.events.at(-1)?.[1]===1)`),'倒數恢復後音樂淡入 1');
  const leak=await evaluate(`(()=>{__mock.endSpeech();for(let i=0;i<7200;i++){__mock.advance(.025);__test.audio.pump();}__mock.advance(3);return {...__test.audio.diagnostics,disconnected:__mock.disconnected,unreleased:__mock.nodes.filter(n=>n.kind==='oscillator'&&n.ended&&!n.disconnected).length};})()`);
  check(leak.created>1000&&leak.active===0&&leak.peak<=48&&leak.released===leak.created&&leak.unreleased===0,`模擬三分鐘 lookahead 排程無音符節點洩漏 ${JSON.stringify(leak)}`);
  // Real handlers, four different input paths, immediate damage while composing.
  for(const mode of ['composition','han','english','builtin']) {
    await battle('r2-1',mode==='english'?'english':mode==='builtin'?'builtin':'pinyin');
    const e=await enemy();const kills=await evaluate(`__test.game.kills`);
    if(mode==='composition'){await composition('start','');await composition('update',e.q.pinyin);}
    if(mode==='han')await textInput(e.q.text);
    if(mode==='english')await textInput(e.q.pinyin);
    if(mode==='builtin')for(const c of e.q.pinyin)await touch(`[data-key="${c}"]`);
    check(await evaluate(`__test.game.kills===${kills+1}&&!__test.game.enemies.some(e=>e.id===${Number(e.id)})`),`${mode} 完整正確輸入立即擊倒，第 1～3 區無隨機厚血`);
  }
  await battle('r4-1','english');
  const armored=await enemy();await shotNow('05-armored-health');
  check(await evaluate(`__test.game.enemies.find(e=>e.id===${armored.id}).remaining===2&&document.querySelector('.enemy .plates').children.length===2`),'第四區厚血怪顯示兩格護甲');
  await evaluate(`window.__freezeFX=true;window.__fx=[]`);
  await textInput(armored.q.pinyin);
  check(await evaluate(`__test.game.enemies.find(e=>e.id===${armored.id}).remaining===1&&document.querySelector('.enemy .plates .empty')&&document.querySelector('#battle-message').textContent.includes('還差 1 題')&&document.querySelector('.magic-bolt.fireball')`),'打對厚血怪立刻扣一格、有火球、命中文字與還差一題');
  await evaluate(`document.getAnimations().filter(a=>a.effect?.target?.classList.contains('magic-bolt')).forEach(a=>{a.pause();a.currentTime=85;})`);
  await shotNow('02-fireball-flight');
  await evaluate(`__fx.splice(0).forEach(t=>{if(t.ms<=190)t.fn();});document.getAnimations().filter(a=>a.effect?.target?.closest('.magic-explosion')).forEach(a=>{a.pause();a.currentTime=100;})`);
  check(await evaluate(`!!document.querySelector('.magic-explosion')`),'火球命中產生爆炸粒子 DOM');await shotNow('03-hit-explosion');
  // Test an actual defeat, then combo>=2 in the battlefield.
  const same=await enemy();await textInput(same.q.pinyin);await evaluate(`__fx.splice(0).forEach(t=>{if(t.ms<=190)t.fn();});document.getAnimations().filter(a=>a.effect?.target?.closest('.magic-explosion')).forEach(a=>{a.pause();a.currentTime=100;})`);
  check(await evaluate(`!!document.querySelector('.magic-explosion')&&!!document.querySelector('.defeated')`),'擊倒產生爆炸與怪物消散');await shotNow('04-defeat-explosion');await evaluate(`window.__freezeFX=false`);
  await battle('r1-1','english');
  for(let i=0;i<2;i++){await waitFor(`__test.game.enemies.length>0`);const e=await enemy();await textInput(e.q.pinyin);}
  check(await evaluate(`document.querySelector('.combo-banner')?.textContent.includes('COMBO ×2')`),'連續兩次擊倒立即出現戰場 COMBO 大字');await delay(300);await evaluate(`document.getAnimations().filter(a=>a.effect?.target?.classList.contains('combo-banner')).forEach(a=>{a.pause();a.currentTime=300;})`);await shotNow('06-combo');
  await evaluate(`while(__test.game.combo<5)__test.addCombo()`);
  check(await evaluate(`document.querySelector('.tier-up')?.textContent.includes('得分 ×1.5')`),'連擊五次有升階演出與倍率');
  // No real wall clock is needed for deterministic movement and pool coverage.
  await metrics(390,932);await battle('r1-1','builtin');
  const movement=await evaluate(`(()=>{window.__manualRAF=true;const g=__test.game;g.total=1000;g.hp=100000;g.maxHP=100000;const records=new Map();let t=performance.now();__test.setLastTime(t);for(let i=0;i<1001;i++){t+=60;__test.tick(t);for(const e of g.enemies){const top=e.element.getBoundingClientRect().top;const a=records.get(e.id)||{first:top,last:top,monotonic:true};a.monotonic&&=top>=a.last-.1;a.last=top;records.set(e.id,a);}}window.__manualRAF=false;__test.tick(t);const height=document.querySelector('#battlefield').clientHeight;return {height,travel:height-document.querySelector('.enemy:not(.defeated)').offsetHeight-8,records:[...records.values()],elapsed:g.elapsed};})()`);
  check(movement.elapsed>=59&&movement.records.every(r=>r.monotonic)&&movement.records.some(r=>r.last-r.first>movement.travel*.9),`模擬 60 秒怪物單調前進、跨越可移動軌道 90% ${JSON.stringify(movement)}`);
  for(let seedValue=1;seedValue<=5;seedValue++) {
    const coverage=await evaluate(`(()=>{let rng=${seedValue};const original=Math.random;Math.random=()=>((rng=(rng*1664525+1013904223)>>>0)/4294967296);const g=__test.game;g.pool=__test.stagePool(g.stage);g.deck=[...g.pool];const taught=new Set(__test.guideItems(g.stage,[]).map(q=>q.id));const seen=new Set();for(let i=0;i<60;i++){g.enemies.forEach(e=>e.element.remove());g.enemies=[];__test.spawnEnemy();seen.add(g.enemies[0].q.id);}Math.random=original;return {ok:[...seen].every(id=>taught.has(id)),seen:seen.size};})()`);
    check(coverage.ok&&coverage.seen===8,`第一關亂數種子 ${seedValue}：實際出題全部包含於教過的 8 題`);
  }
  await metrics();
  for (const id of ['r1-1','r4-boss','r5-1']) {
    await battle(id,'english');
    if (id === 'r4-boss') {
      const longest = [...data.words].sort((a,b)=>b.pinyin.length-a.pinyin.length)[0];
      await evaluate(`(()=>{const e=__test.game.enemies[0];e.q=${JSON.stringify(longest)};e.progress=0;__test.renderEnemy(e);__test.positionEnemy(e);})()`);
    }
    await evaluate(`if(__test.game.boss||__test.game.ime)__test.game.bossHP=1;else __test.game.total=__test.game.spawned;`);
    if(id.startsWith('r5')) { await textInput(await evaluate(`__test.game.currentSpell.text`)); await press('Enter'); }
    else { const finalEnemy=await enemy();await textInput(finalEnemy.q.pinyin); }
    check(await evaluate(`__test.game.completing&&!document.querySelector('#play-screen').hidden&&__test.game.paused`),`${id} 最後一擊先保留戰場並停止後續輸入`);
    await waitFor(`!!document.querySelector('.magic-explosion')`,1000);
    check(await evaluate(`!document.querySelector('#play-screen').hidden`),`${id} 結算前可看見最後一擊爆炸`);
    await waitFor(`!document.querySelector('#result-screen').hidden`,1500);
  }
  for(const mode of ['none','absent','fail','throws','cancelThrows']) {
    await audioMode(mode);await battle();const e=await enemy();await textInput(e.q.pinyin);
    check(await evaluate(`__test.game.kills===1`),`${mode} 語音／音訊不可用仍能正常擊倒`);
    await touch('[data-action="pause"]');await touch('#start-overlay [data-action="settings"]');
    if(mode==='none'||mode==='absent')check(await evaluate(`document.querySelector('#voice-status').textContent.includes(${JSON.stringify(mode==='none'?'沒有可用的中文語音':'不支援語音')})`),`${mode} 設定頁顯示停用原因`);
  }
  await audioMode('fallback');await touch('[data-action="settings"]');
  check(await evaluate(`__test.audio.diagnostics.voice==='zh-CN'&&document.querySelector('#voice-status').textContent.includes('此裝置沒有台灣中文語音')`),'沒有台灣 voice 時排除香港並使用 zh-CN，設定說明原因');
  await audioMode('delayed');await battle();
  check(await evaluate(`__test.audio.diagnostics.voice===null`),'非同步載入前沒有 voice');
  await evaluate(`__mock.changeVoices([{lang:'zh-TW',name:'延遲台灣'}])`);await delay(250);
  check(await evaluate(`__test.audio.diagnostics.voice==='zh-TW'&&__mock.calls.some(c=>c.text===__test.spoken(__test.game.enemies[0].q))`),'voiceschanged 載入中文後自動恢復並唸目前怪物');
  await evaluate(`Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'));`);
  check(await evaluate(`__test.audio.diagnostics.paused&&!__test.audio.diagnostics.speaking&&__test.game.paused`),'分頁隱藏停止語音與音樂，遊戲暫停');
  check(errors.length===0,`全部新增測試 0 console error／runtime exception ${JSON.stringify(errors)}`);
} catch(error) {
  await shotNow('failure').catch(()=>{});results.push(`FAIL ${error.stack}`);console.error(error);process.exitCode=1;
} finally {
  await writeFile(new URL('browser-audio5-output.txt',import.meta.url),results.join('\n')+'\nConsole errors: '+JSON.stringify(errors)+'\n');
  await cdp('Browser.close').catch(()=>{});ws.close();
  if(chrome.exitCode===null)await new Promise(resolve=>chrome.once('exit',resolve));
  await rm(new URL(profile,import.meta.url),{recursive:true,force:true});
  // Chrome helpers may keep the inherited stderr pipe open after browser exit.
  chrome.stderr.destroy(); chrome.unref();
  await rm(new URL('.test4.html',import.meta.url),{force:true});
}
