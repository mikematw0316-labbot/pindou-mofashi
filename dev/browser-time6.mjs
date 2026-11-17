/** Chrome DevTools Protocol 實測，無套件；所有 profile、輸出都在本資料夾。 */
import {spawn} from 'node:child_process';
import {readFile, writeFile, rm, mkdir} from 'node:fs/promises';
import {fileURLToPath, pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
const root = fileURLToPath(new URL('.', import.meta.url));
const html = await readFile(new URL('index.html', import.meta.url), 'utf8');
const bankSource = html.match(/\/\/ BEGIN QUESTION BANK\n([\s\S]*?)\n\/\/ END QUESTION BANK/u)[1];
const data = await import(`data:text/javascript;base64,${Buffer.from(bankSource).toString('base64')}`);

const fixture = html.replaceAll('requestAnimationFrame(tick);', 'if (!window.__manualRAF) requestAnimationFrame(tick);')
 .replace('  </script>\n</body>', `window.__test = {startGame, stages, CONFIG, beginKeyboard, earnedStars, bestClearTime, battleLimits, timeStatus, updateHUD, finishGame, renderMap, loadSave, pauseGame, beginGuide, finishOnboarding, guideText, spawnEnemy, tick, attack, castSpell, processText, prepareBattle, persist, get game(){return game;}, get save(){return save;}, setLastTime(v){lastTime=v;}};
 window.__advance = function(seconds) {
   let now=1;lastTime=now;
   for(let i=0;i<Math.round(seconds*100);i++){now+=10;tick(now);}
 };
 window.__hudWarnings = function() {
   game.timeWarnings.clear();const originalSound=sound;const calls=[];sound=(type)=>calls.push(type);
   for(const elapsed of [game.star3Seconds-5,game.star3Seconds-4,game.star3Seconds+.01,game.star2Seconds-5,game.star2Seconds-4,game.star2Seconds+.01]){game.elapsed=elapsed;updateHUD();}
   sound=originalSound;return calls;
 };
 window.__runRobot = function(id, seed, factor=1, legacy=false) {
   let randomState=seed;
   const originalRandom=Math.random;
   Math.random=()=>((randomState=Math.imul(1664525,randomState)+1013904223>>>0)/4294967296);
   const originals={updateHUD,positionEnemy,renderEnemy,magic,floating,sound,animate,message,addCombo,recordMastery,judge};
   updateHUD=positionEnemy=renderEnemy=magic=floating=sound=animate=message=addCombo=recordMastery=judge=()=>{};
   save.settings.onboarding=true; save.settings.keyboardMode='builtin';save.review={};save.learned=[];save.upgrades.gate=0;
   for(const s of stages)save.records[s.id]={stars:3,bestSpeed:0,bestScore:0,attempts:0};
   startGame(stages.find(s=>s.id===id),true);
   cancelKeyboardWait();game.guide=null;game.training=false;game.paused=false;$('#start-overlay').hidden=true;
   const letters=game.plannedQuestions.reduce((n,q)=>n+q.pinyin.length,0);
   const chars=game.plannedQuestions.reduce((n,q)=>n+[...normalizeSpell(q.text)].length,0);
   const questionIds=game.plannedQuestions.map(q=>q.id);
   const speed=game.ime?CONFIG.timing.sentenceThreeCPM:CONFIG.timing.lettersPerMinute[game.stage.region];
   const unitTime=factor===-1?.2:60/(speed*factor);
   const spawns=[];let targetId=null,question=null,nextInput=0,now=1,lastSpawned=0,previousKills=0,spellKills=-1,bossKills=0;
   lastTime=now;
   if(game.boss&&!game.ime)spawnEnemy();
   const step=.01;
   for(let frame=0;frame<180000&&game.running&&!game.completing;frame++) {
     now+=step*1000;tick(now);
     const legacySpawnIn=game.spawnIn;
     if(game.spawned!==lastSpawned){spawns.push(game.elapsed);lastSpawned=game.spawned;}
     if(game.ime) {
       if(game.spellAdvance<=0&&game.kills!==spellKills){question=game.currentSpell;spellKills=game.kills;nextInput=game.elapsed+CONFIG.timing.reactionSeconds+[...normalizeSpell(question.text)].length*unitTime;}
       if(game.spellAdvance<=0&&game.elapsed+1e-8>=nextInput){castInput.value=question.text;castSpell();}
     } else {
       let target=game.enemies.find(e=>e.id===targetId);
       if(!target){target=[...game.enemies].sort((a,b)=>a.x-b.x)[0];if(target){targetId=target.id;question=target.q;nextInput=game.elapsed+CONFIG.timing.reactionSeconds+unitTime;}}
       if(target&&(target.q!==question||game.boss&&game.kills!==bossKills)){question=target.q;bossKills=game.kills;nextInput=game.elapsed+(game.boss?CONFIG.timing.reactionSeconds:0)+unitTime;}
       if(target&&game.elapsed+1e-8>=nextInput){game.locked=target.id;attack(target.q.pinyin[target.progress]);nextInput+=unitTime;}
     }
     if(legacy&&game.kills!==previousKills){game.spawnIn=legacySpawnIn;previousKills=game.kills;}
   }
   const result={id,seed,factor,elapsed:game.elapsed,star2:game.star2Seconds,star3:game.star3Seconds,hp:game.hp,won:!!game.completing,stars:earnedStars(!!game.completing,game.correct/Math.max(1,game.correct+game.wrong),game.hp/game.maxHP,game.elapsed,game.star2Seconds,game.star3Seconds),letters,chars,completedLetters:game.letters,completedChars:game.completedCharacters,questionIds,spawns,kills:game.kills};
   game.running=false;
   ({updateHUD,positionEnemy,renderEnemy,magic,floating,sound,animate,message,addCombo,recordMastery,judge}=originals);Math.random=originalRandom;
   return result;
 };
  </script>\n</body>`);
await writeFile(new URL('.test6.html',import.meta.url),fixture);

const results = [];
const errors = [];
const check = (condition, label) => { assert.ok(condition, label); results.push(`PASS ${label}`); console.log(`PASS ${label}`); };
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const profile = '.chrome-time-profile6';
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

try {
 await send('Runtime.enable');await send('Log.enable');await send('Page.enable');
 await send('Page.addScriptToEvaluateOnNewDocument',{source:'window.__manualRAF=true;'});
 await send('Page.navigate',{url:pathToFileURL(root+'.test6.html').href});
 await waitFor('!!window.__runRobot');
 await mkdir(new URL('shots7/regression-time',import.meta.url),{recursive:true});
 await evaluate(`(()=>{const t=__test;for(const s of t.stages)t.save.records[s.id]={stars:3,bestSpeed:0,bestScore:0,attempts:0};t.save.settings.onboarding=true;t.save.settings.keyboardMode='builtin';t.save.settings.muted=true;})()`);
 check(await evaluate(`(()=>{const t=__test;t.startGame(t.stages.find(s=>s.id==='r1-4'),true);return t.game.paused&&document.querySelector('.star-conditions').textContent.includes('三星')&&document.querySelector('.star-conditions').textContent.includes(t.game.star3Seconds.toFixed(2).replace(/\\.?0+$/,''));})()`),'準備畫面依實抽題目顯示兩星、三星時限');
 check(await evaluate(`(()=>{const t=__test;__advance(3);return t.game.elapsed===0;})()`),'開始前等待不計時');
 check(await evaluate(`(()=>{const t=__test;t.beginKeyboard();__advance(2);return t.game.paused&&t.game.elapsed===0;})()`),'倒數期間不計時');
 await evaluate(`__test.pauseGame('test',false)`);
 check(await evaluate(`(()=>{const t=__test;t.game.paused=false;t.beginGuide();__advance(3);return t.game.elapsed===0;})()`),'引導練習不計時');
 check(await evaluate(`(()=>{const t=__test;t.game.guide=null;t.game.training=true;t.game.onboarding=0;t.game.paused=false;__advance(3);t.game.training=false;return t.game.elapsed===0;})()`),'首次操作教學不計時');
 check(await evaluate(`(()=>{const t=__test;t.startGame(t.stages.find(s=>s.id==='r1-4'),true);t.game.paused=false;t.game.elapsed=t.game.star3Seconds-12;t.updateHUD();return document.querySelector('#star-countdown').textContent==='三星 還剩 12 秒';})()`),'HUD 顯示三星剩餘時間');
 check(await evaluate(`(()=>{const t=__test;t.game.elapsed=t.game.star3Seconds+.01;t.updateHUD();return document.querySelector('#star-countdown').textContent.startsWith('兩星 還剩');})()`),'HUD 超過三星切換兩星');
 check(await evaluate(`(()=>{const t=__test;t.game.elapsed=t.game.star2Seconds+.01;t.updateHUD();return document.querySelector('#star-countdown').textContent==='已超時';})()`),'HUD 超過兩星顯示已超時');
 check(await evaluate(`(()=>{const t=__test;t.game.elapsed=t.game.star3Seconds-5;t.updateHUD();return document.querySelector('#battle-clock').classList.contains('time-urgent');})()`),'最後五秒套用警示顏色');
 check(await evaluate(`__hudWarnings().filter(c=>c==='count').length===2`),'兩個門檻各提示一次，沿用 count 音效');
 check(await evaluate(`(()=>{const t=__test;const before=t.game.elapsed;t.pauseGame('test',false);__advance(10);return t.game.elapsed===before;})()`),'暫停十秒有效計時完全不動');
 check(await evaluate(`(()=>{const t=__test;t.startGame(t.stages[0],true);t.game.paused=false;__advance(.5);return document.querySelector('#star-countdown').textContent===''&&document.querySelector('#elapsed-time').textContent==='00:00'&&t.game.elapsed>0;})()`),'無時限關卡只顯示計時');
 // Exercise the production save writer, loader and result/map renderers.
 check(await evaluate(`(()=>{const t=__test;t.startGame(t.stages.find(s=>s.id==='r1-4'),true);t.game.elapsed=t.game.star2Seconds+1;t.game.correct=100;t.finishGame(true);return t.save.records['r1-4'].stars===3&&t.save.records['r1-4'].bestTime===t.game.elapsed&&document.querySelector('.best-time').textContent.includes('刷新最佳時間')&&document.querySelectorAll('.result-conditions li').length===3&&document.querySelector('.result-conditions').textContent.includes('差');})()`),'結算條件表、刷新最佳時間、舊三星保留');
 check(await evaluate(`(()=>{const t=__test;const old=t.save.records['r1-4'].bestTime;const loaded=t.loadSave();t.renderMap();return loaded.records['r1-4'].bestTime===old&&document.querySelector('[data-action=stage][data-id="r1-4"] .best').textContent.includes('最佳時間');})()`),'最佳時間寫入存檔、重讀與地圖顯示');
 check(await evaluate(`(()=>{const t=__test;const old=t.save.records['r1-4'].bestTime;t.startGame(t.stages.find(s=>s.id==='r1-4'),true);t.game.elapsed=old+5;t.finishGame(true);return t.save.records['r1-4'].bestTime===old&&!document.querySelector('.best-time').textContent.includes('刷新');})()`),'較慢通關保留最佳時間');
 check(await evaluate(`(()=>{const t=__test;const old=t.save.records['r1-4'].bestTime;t.startGame(t.stages.find(s=>s.id==='r1-4'),true);t.game.elapsed=1;t.finishGame(false);return t.save.records['r1-4'].bestTime===old&&t.save.records['r1-4'].stars===3;})()`),'失敗保留最佳時間及歷史三星');
 for(const [width,height] of [[390,844],[360,640],[430,932],[1280,720]]) {
   await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<500});
   await evaluate(`(()=>{const t=__test;t.startGame(t.stages.find(s=>s.id==='r1-4'),true);})()`);
   await delay(280);
   let shot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
   await writeFile(new URL('shots7/regression-time/'+width+'-ready.png',import.meta.url),Buffer.from(shot.data,'base64'));
   await evaluate(`__test.beginKeyboard()`);
   await waitFor('!__test.game.paused',5000);
   check(await evaluate(`(()=>{const t=__test;__advance(.5);const clock=document.querySelector('#battle-clock').getBoundingClientRect();const input=document.querySelector('#spell-form').getBoundingClientRect();window.__layout6={scroll:document.documentElement.scrollWidth,width:innerWidth,clock:{left:clock.left,right:clock.right},input:input.bottom,viewport:visualViewport.height};return document.documentElement.scrollWidth<=innerWidth&&clock.left>=0&&clock.right<=innerWidth&&input.bottom<=visualViewport.height+1;})()`),width+' 窄版 HUD 與施法列無溢出');
   await delay(280);
   shot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
   await writeFile(new URL('shots7/regression-time/'+width+'-battle.png',import.meta.url),Buffer.from(shot.data,'base64'));
   await evaluate(`(()=>{const t=__test;t.game.elapsed=t.game.star3Seconds+7;t.game.correct=94;t.game.wrong=6;t.game.hp=40;t.finishGame(true);})()`);
   await delay(1800);
   shot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
   await writeFile(new URL('shots7/regression-time/'+width+'-result.png',import.meta.url),Buffer.from(shot.data,'base64'));
 }
 await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
 const simulations=[];
 for(const stage of data.stages) {
   for(let seed=1;seed<=5;seed++) {
     for(const factor of [1,.6])simulations.push(await evaluate(`__runRobot(${JSON.stringify(stage.id)},${seed},${factor})`));
   }
   const rows=simulations.filter(r=>r.id===stage.id);
   console.log(JSON.stringify({id:stage.id,rows:rows.map(r=>({t:r.elapsed,limit:r.star3,two:r.star2,hp:r.hp,win:r.won,stars:r.stars}))}));
 }
 await writeFile(new URL('simulation6.json',import.meta.url),JSON.stringify(simulations,null,2)+'\n');
 check(simulations.every((row,index)=>row.factor!==1||JSON.stringify(row.questionIds)===JSON.stringify(simulations[index+1].questionIds)),'相同種子的兩種速度使用完全相同題目');
 for(const row of simulations) {
   if(row.star3!=null)check(row.won&&(row.factor===1?row.stars===3&&row.elapsed>=row.star3*.85&&row.elapsed<=row.star3:row.stars===2),row.id+' seed '+row.seed+' speed '+row.factor+' 真實 tick／輸入通關與星等');
   else check(row.won&&row.stars===3,row.id+' seed '+row.seed+' speed '+row.factor+' 無時限沿用舊星等');
   check(row.letters===row.completedLetters&&(row.id.startsWith('r5')?row.chars===row.completedChars:true)&&row.kills===(row.id.startsWith('r5')?6:row.id.includes('boss')?12:12+Math.floor(data.stages.findIndex(s=>s.id===row.id)/6)*2),row.id+' 實抽題量與完成波數');
 }
 const fast=await evaluate(`__runRobot('r1-1',123,-1)`);
 const slow=await evaluate(`__runRobot('r1-1',123,.6)`);
 const legacy=await evaluate(`__runRobot('r1-1',123,-1,true)`);
 check(fast.elapsed<slow.elapsed*.6&&fast.elapsed<legacy.elapsed*.6,'每字母 0.2 秒機器人通關顯著快於慢速與舊固定節奏');
 check(fast.spawns.slice(1).every((t,i)=>t-fast.spawns[i]>=.45-1e-6),'擊倒後補怪保留至少 0.45 秒延遲');
 const noInput=await evaluate(`(()=>{const t=__test;t.startGame(t.stages.find(s=>s.id==='r1-3'),true);t.game.paused=false;document.querySelector('#start-overlay').hidden=true;const times=[];let spawned=0;for(let i=0;i<650;i++){__advance(.01);if(t.game.spawned!==spawned){times.push(t.game.elapsed);spawned=t.game.spawned;}}return {times,interval:t.game.spawnInterval};})()`);
 check(noInput.times.length===3&&noInput.times.slice(1).every((time,i)=>Math.abs(time-noInput.times[i]-noInput.interval)<.021),'未擊倒時依舊固定間隔出怪，到同場上限停止');
 await writeFile(new URL('cadence6.json',import.meta.url),JSON.stringify({fast,slow,legacy,noInput},null,2)+'\n');
 check(errors.length===0,'全程 0 console error／runtime exception '+JSON.stringify(errors));
 console.log('全部 '+results.length+' 項 TASK6 瀏覽器及模擬檢查通過');
} catch(error){console.error(error);console.error(await evaluate('window.__layout6').catch(()=>null));process.exitCode=1;}
finally {
 await writeFile(new URL('browser-time6-checks.txt',import.meta.url),results.join('\n')+'\nErrors '+JSON.stringify(errors)+'\n');
 await cdp('Browser.close').catch(()=>{});ws.close();
 if(chrome.exitCode===null)await new Promise(resolve=>chrome.once('exit',resolve));
 await rm(new URL(profile,import.meta.url),{recursive:true,force:true});
 await rm(new URL('.test6.html',import.meta.url),{force:true});
 chrome.stderr.destroy();chrome.unref();
}
