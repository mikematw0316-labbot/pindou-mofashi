/** 無套件；直接執行 /opt/homebrew/bin/node selftest.mjs。從同資料夾 index.html 抽取內嵌題庫。 */
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
// data URI 明確以 ESM 載入，不依賴 package.json 的 type 或 Node 自動偵測。
const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const match = html.match(/\/\/ BEGIN QUESTION BANK\n([\s\S]*?)\n\/\/ END QUESTION BANK/u);
assert.ok(match, 'index.html 必須有完整的內嵌題庫標記');
const source = match[1];
assert.equal(source, readFileSync(new URL('./data.js', import.meta.url), 'utf8').trimEnd(), 'data.js 與內嵌題庫必須一致');
const originalBank = readFileSync(new URL('./v1.html', import.meta.url), 'utf8').match(/\/\/ BEGIN QUESTION BANK\n([\s\S]*?)\n\/\/ END QUESTION BANK/u);
assert.equal(source, originalBank?.[1], '第二版題庫必須與 v1.html 備份逐位元一致');
const data = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const {zhuyinToPinyin: convert, readingToPinyin, phonics, characters, words,
  sentences, soundGroups, stages, regions, questionBank, questionsById, reviewStage} = data;
const failures = [];
let assertions = 0;
function check(ok, message) {
  assertions++;
  if (!ok) failures.push(message);
}
function equal(actual, expected, message) {
  check(actual === expected, `${message}：${actual} ≠ ${expected}`);
}
function safely(fn, label) {
  try { fn(); } catch (error) { check(false, `${label}：${error.message}`); }
}
function unique(values, label) {
  const seen = new Set();
  for (const value of values) {
    check(!seen.has(value), `${label}重複：${value}`);
    seen.add(value);
  }
}

// TASK4: run the actual planner, then prove combat pools contain only taught items.
const plannerSource = html.match(/function guideItems\(stage, learned = save.learned\) \{([\s\S]*?)\n\}/u);
check(!!plannerSource, '存在完整引導規劃器');
const planGuide = new Function('stage', 'learned', 'soundGroups', 'questionsById', plannerSource[1]);
const previouslyTaught = new Set();
for (const stage of stages) {
  if (!stage.kind.includes('boss')) for (const q of planGuide(stage, [...previouslyTaught], soundGroups, questionsById)) previouslyTaught.add(q.id);
  check(stage.pool.every(id => previouslyTaught.has(id)), `${stage.id} 打怪題池包含於本關及之前實際教過的項目`);
}
check(planGuide(stages[0], [], soundGroups, questionsById).length === 8, '第一關引導涵蓋全部八個聲母');

// 答案獨立寫出，不以 FINALS／INITIALS 產生期望值。
const regression = [
  ['ㄅㄚ','ba'],['ㄆㄛ','po'],
  ['ㄇㄧˇ','mi'],['ㄈㄟ','fei'],['ㄉㄜˊ','de'],['ㄊㄨˇ','tu'],
  ['ㄋㄚˊ','na'],['ㄌㄞˊ','lai'],['ㄍㄜ','ge'],['ㄎㄠˇ','kao'],['ㄏㄜˊ','he'],
  ['ㄐㄧ','ji'],['ㄑㄧ','qi'],['ㄒㄧ','xi'],
  ['ㄓ','zhi'],['ㄔ','chi'],['ㄕ','shi'],['ㄖˋ','ri'],['ㄗˋ','zi'],['ㄘˋ','ci'],['ㄙˋ','si'],
  ['ㄋㄩˇ','nv'],['ㄋㄩㄝˋ','nve'],['ㄌㄩˋ','lv'],['ㄌㄩㄝˋ','lve'],
  ['ㄐㄩ','ju'],['ㄐㄩㄝˊ','jue'],['ㄐㄩㄢ','juan'],['ㄐㄩㄣ','jun'],
  ['ㄑㄩˋ','qu'],['ㄑㄩㄝˋ','que'],['ㄑㄩㄢˊ','quan'],['ㄑㄩㄣˊ','qun'],
  ['ㄒㄩ','xu'],['ㄒㄩㄝˊ','xue'],['ㄒㄩㄢ','xuan'],['ㄒㄩㄣˊ','xun'],
  ['ㄧ','yi'],['ㄧㄚ','ya'],['ㄧㄝˇ','ye'],['ㄧㄠˋ','yao'],['ㄧㄡˇ','you'],
  ['ㄧㄢˇ','yan'],['ㄧㄣ','yin'],['ㄧㄤˊ','yang'],['ㄧㄥ','ying'],
  ['ㄨˇ','wu'],['ㄨㄚ','wa'],['ㄨㄛˇ','wo'],['ㄨㄞˋ','wai'],['ㄨㄟˊ','wei'],
  ['ㄨㄢˇ','wan'],['ㄨㄣˊ','wen'],['ㄨㄤˊ','wang'],['ㄨㄥ','weng'],
  ['ㄩˊ','yu'],['ㄩㄝˋ','yue'],['ㄩㄢˊ','yuan'],['ㄩㄣˊ','yun'],['ㄩㄥˇ','yong'],
  ['ㄋㄧㄡˊ','niu'],['ㄌㄧㄡˋ','liu'],['ㄐㄧㄡˇ','jiu'],['ㄑㄧㄡˊ','qiu'],['ㄒㄧㄡ','xiu'],
  ['ㄉㄨㄟˋ','dui'],['ㄊㄨㄟ','tui'],['ㄍㄨㄟ','gui'],['ㄏㄨㄟˊ','hui'],
  ['ㄓㄨㄟ','zhui'],['ㄔㄨㄟ','chui'],['ㄕㄨㄟˇ','shui'],['ㄖㄨㄟˋ','rui'],
  ['ㄉㄨㄣˋ','dun'],['ㄊㄨㄣ','tun'],['ㄌㄨㄣˊ','lun'],['ㄍㄨㄣˇ','gun'],
  ['ㄔㄨㄣ','chun'],['ㄘㄨㄣ','cun'],['ㄙㄨㄣ','sun'],
  ['ㄉㄨㄥ','dong'],['ㄓㄨㄥ','zhong'],['ㄐㄩㄥˇ','jiong'],['ㄑㄩㄥˊ','qiong'],['ㄒㄩㄥ','xiong'],
  ['ㄚ','a'],['ㄛ','o'],['ㄜˋ','e'],['ㄝˋ','e'],['ㄞˋ','ai'],['ㄟ','ei'],
  ['ㄠ','ao'],['ㄡ','ou'],['ㄢ','an'],['ㄣ','en'],['ㄤˊ','ang'],['ㄥ','eng'],['ㄦˇ','er'],
  ['˙ㄉㄜ','de'],['˙ㄇㄣ','men'],['ㄇㄚˉ','ma'],
];
for (const [input, expected] of regression) {
  safely(() => equal(convert(input), expected, `規則 ${input}`), `規則 ${input}`);
}
const invalid = ['', ' ', 'ㄋㄧˇ ㄏㄠˇ', 'ni', 'ㄅ', 'ㄅㄩ', 'ㄓㄧ', 'ㄧㄧ',
  'ㄐㄨ', 'ㄓㄩ', 'ㄩㄧ', 'ㄚˊˇ', 'ㄉ˙ㄜ', '˙ㄉㄜˊ', 'ㄇㄜ˙', 'ㄨㄛˇ!', ' ㄨㄛˇ', null, 123];
for (const input of invalid) safely(() => {
  assert.throws(() => convert(input));
  check(true, '非法輸入正確拒絕');
}, `拒絕 ${String(input)}`);
safely(()=>assert.throws(()=>convert('ㄚ',{mode:'typo'})), '拒絕未知模式');
safely(()=>assert.throws(()=>convert('ㄧˇ',{mode:'final'})), '拒絕帶調片段');
for (const mode of ['initial','final']) {
  for (const input of ['constructor','toString','ㄅㄅ','abc']) {
    safely(()=>{assert.throws(()=>convert(input,{mode}));check(true,'非法片段正確拒絕');},`拒絕 ${mode} 片段 ${input}`);
  }
}
equal(convert('ㄓ',{mode:'initial'}),'zh','聲母片段不加 i');
equal(convert('ㄧ',{mode:'final'}),'i','韻母片段不加 y');
equal(convert('ㄩ',{mode:'final'}),'v','ü 片段鍵位');
equal(convert('ㄝ',{mode:'final'}),'e','ê 片段鍵位');
equal(convert('ㄨㄥ',{mode:'final'}),'ueng','零聲母韻母原形');
equal(convert('ㄨㄥ',{mode:'final',attached:true}),'ong','有聲母韻母 ong');
equal(readingToPinyin('ㄋㄩˇ ㄌㄩˋ ㄌㄩㄝˋ ㄑㄩˋ ㄒㄩㄝˊ ㄩㄢˊ ㄩㄣˊ'),
  'nvlvlvequxueyuanyun','詞句 ü 連打');
equal(readingToPinyin('ㄒㄧㄢ ㄢ'),'xianan','輸入法連打不含分音符');

function validateQuestion(q, errors) {
  const fail = message => errors.push(`${q.id} ${q.text}：${message}`);
  if (!/^[a-z]+$/u.test(q.pinyin)) fail('拼音只能含 a–z');
  if (q.kind === 'phonics') {
    try {
      if (convert(q.zhuyin,{mode:q.wholeSyllable?'syllable':q.mode,attached:q.attached}) !== q.pinyin) fail('片段轉換不一致');
    } catch (error) { fail(error.message); }
    const example = questionsById[q.exampleId];
    if (!example || example.kind !== 'character') fail('缺少完整例字');
    else {
      if (q.text !== example.text || q.symbol !== q.zhuyin) fail('聲韻題目與例字不符');
      if (q.example?.text !== example.text || q.example?.zhuyin !== example.zhuyin ||
          q.example?.pinyin !== example.pinyin) fail('內附例字讀音不符');
      // ㄝ 為 ㄧㄝ 的一部分；結合韻例字須含實際鍵入片段。
      const bare = example.zhuyin.replace(/[ˉˊˇˋ˙]/gu,'');
      if (!bare.includes(q.zhuyin)) fail('例字未含指定聲韻');
      if (q.wholeSyllable && q.pinyin !== example.pinyin) fail('完整音節與例字答案不符');
      if (q.mode === 'final' && q.zhuyin.length > 1 && !q.wholeSyllable) {
        if (!/^[ㄅ-ㄙ]/u.test(bare)) fail('結合韻例字必須帶聲母');
        if (!example.pinyin.endsWith(q.pinyin)) fail('例字拼音未含指定鍵入片段');
      }
    }
    return;
  }
  if (!/^\p{Script=Han}+$/u.test(q.text)) fail('國字題目含非漢字');
  const chars = [...q.text], syllables = q.zhuyin.split(' ');
  if (chars.length !== syllables.length || chars.length !== q.units?.length) fail('字數與注音／逐字資料數不符');
  if (q.kind === 'character' && chars.length !== 1) fail('單字不是一字');
  if (q.kind === 'word' && (chars.length < 2 || chars.length > 4)) fail('詞語不是 2～4 字');
  if (q.kind === 'sentence' && (chars.length < 8 || chars.length > 20)) fail('句子不是 8～20 字');
  for (const [i, unit] of (q.units || []).entries()) {
    if (unit.text !== chars[i] || unit.zhuyin !== syllables[i]) fail(`第 ${i+1} 字對位錯誤`);
    if (!/^[a-z]+$/u.test(unit.pinyin)) fail(`第 ${i+1} 字拼音格式錯誤`);
    try {
      const actual = convert(unit.zhuyin);
      if (actual !== unit.pinyin) fail(`第 ${i+1} 字 ${unit.zhuyin} → ${actual}，資料為 ${unit.pinyin}`);
    } catch (error) { fail(`第 ${i+1} 字 ${error.message}`); }
  }
  if (q.units?.map(u=>u.pinyin).join('') !== q.pinyin) fail('逐字拼音與連打答案不符');
  try {
    if (readingToPinyin(q.zhuyin) !== q.pinyin) fail('整筆注音轉拼音不一致');
  } catch (error) { fail(error.message); }
}
unique(questionBank.map(q=>q.id), '全題庫 ID ');
unique(phonics.map(q=>q.prompt),'聲韻畫面題目 ');
for (const [name, list] of [['聲韻',phonics],['單字',characters],['詞語',words],['句子',sentences]]) {
  unique(list.map(q=>q.kind==='phonics'?`${q.mode}:${q.zhuyin}:${q.notation}`:q.text), `${name}題目 `);
  for (const q of list) {
    const errors = [];
    validateQuestion(q, errors);
    check(errors.length === 0, errors.join('\n'));
    equal(questionsById[q.id],q,`${q.id} 索引`);
  }
}
equal(questionBank.length,phonics.length+characters.length+words.length+sentences.length,'全題庫完整');
equal(Object.keys(questionsById).length,questionBank.length,'索引沒有漏題');

// 測試檢查器本身：真實資料遭破壞時必須能報錯。
for (const [label, mutate] of [
  ['錯拼音',q=>{q.units[0].pinyin='wrong';q.pinyin='wrong';}],
  ['錯注音',q=>{q.units[0].zhuyin='ㄅㄩ';q.zhuyin='ㄅㄩ';}],
  ['逐字缺漏',q=>{q.units.pop();}],
  ['國字錯位',q=>{q.units[0].text='錯';}],
  ['非法答案',q=>{q.pinyin='nǚ';}],
]) {
  const fixture = structuredClone(characters[0]);
  mutate(fixture);
  const errors = [];
  validateQuestion(fixture, errors);
  check(errors.length>0,`檢查器未抓到：${label}`);
}

const expectedInitials = 'b p m f d t n l g k h j q x zh ch sh r z c s'.split(' ');
const expectedFinals = 'a o e i u ü ai ei ao ou an en ang eng ong ia ie iao iu ian in iang ing iong ua uo uai ui uan un uang weng üe yuan yun er'.split(' ');
for (const initial of expectedInitials) equal(phonics.filter(q=>q.mode==='initial'&&q.notation===initial).length,1,`聲母 ${initial}`);
for (const final of expectedFinals) check(phonics.some(q=>q.mode==='final'&&q.notation===final),`缺少韻母 ${final}`);
for (const [notation, symbol, answer, text, wholeSyllable] of [
  ['ü','ㄩ','v','女',false], ['üe','ㄩㄝ','ve','略',false],
  ['yuan','ㄩㄢ','yuan','元',true], ['yun','ㄩㄣ','yun','雲',true],
  ['iong','ㄩㄥ','iong','熊',false], ['weng','ㄨㄥ','weng','翁',true],
  ['ui','ㄨㄟ','ui','對',false], ['un','ㄨㄣ','un','春',false],
]) {
  const q = phonics.find(q=>q.notation===notation);
  check(q?.zhuyin===symbol && q.pinyin===answer && q.text===text && q.wholeSyllable===wholeSyllable,
    `第 1 區 ${symbol} 的答案／例字／完整音節標示`);
}
check(phonics.find(q=>q.notation==='ü')?.exampleNote==='nv／lv 中的 v','ㄩ 例字旁須說明 v 的使用情境');
check(!phonics.some(q=>['van','vn','ueng'].includes(q.pinyin)),'第 1 區不得考未實際鍵入的片段');
for (const symbol of [...'ㄅㄆㄇㄈㄉㄊㄋㄌㄍㄎㄏㄐㄑㄒㄓㄔㄕㄖㄗㄘㄙㄧㄨㄩㄚㄛㄜㄝㄞㄟㄠㄡㄢㄣㄤㄥㄦ']) {
  check(phonics.some(q=>q.zhuyin===symbol),`缺少基本注音符號 ${symbol}`);
}
check(characters.length>=150,'第 2 區至少 150 單字');
check(words.length>=150,'第 4 區至少 150 詞');
check([2,3,4].every(n=>words.some(q=>[...q.text].length===n)),'詞語須涵蓋 2／3／4 字');
check(sentences.length>=30,'第 5 區至少 30 句');
// 明確排除 TASK 點名的兩岸異讀項目；其他字詞另以人工讀音檢視補足。
for (const q of questionBank.filter(q=>q.kind!=='phonics')) {
  check(!/[企液期和微夕息髮]/u.test(q.text)&&!q.text.includes('垃圾'),`${q.id} 含排除的兩岸異讀項目`);
}

const groupIds = ['retroflex','n-l','an-ang','en-eng','in-ing','umlaut','contractions','y-w'];
unique(soundGroups.map(g=>g.id),'易錯音分組 ');
equal(soundGroups.length,8,'易錯音組數');
function groupBucket(groupId, q) {
  const p = q.pinyin;
  switch(groupId) {
    case 'retroflex': return /^(zh|ch|sh|z|c|s)/u.exec(p)?.[0];
    case 'n-l': return /^[nl]/u.exec(p)?.[0];
    case 'an-ang': return /(ang|an)$/u.exec(p)?.[0];
    case 'en-eng': return /(eng|en)$/u.exec(p)?.[0];
    case 'in-ing': return /(ing|in)$/u.exec(p)?.[0];
    case 'umlaut': return /^[nl]v/u.test(p)?'v':/^[jqx]u/u.test(p)?'jqx':/^yu/u.test(p)?'y':undefined;
    case 'contractions': return /(iu|ui|un)$/u.exec(p)?.[0];
    case 'y-w': return /^[yw]/u.exec(p)?.[0];
  }
}
for (const id of groupIds) {
  const group = soundGroups.find(g=>g.id===id);
  check(Boolean(group),`缺少易錯音組 ${id}`);
  if (!group) continue;
  check(group.pool.length>=20,`${group.title} 至少 20 題`);
  unique(group.pool,`${group.title} 題池 `);
  const buckets = {};
  for (const qid of group.pool) {
    const q = questionsById[qid];
    check(q?.kind==='character',`${id} 引用了不存在或非單字題 ${qid}`);
    if (!q) continue;
    const bucket = groupBucket(id,q);
    check(Boolean(bucket),`${group.title} 混入無關題 ${q.text} ${q.pinyin}`);
    if (bucket) buckets[bucket]=(buckets[bucket]||0)+1;
  }
  const expected = {
    retroflex:['zh','ch','sh','z','c','s'],'n-l':['n','l'],'an-ang':['an','ang'],
    'en-eng':['en','eng'],'in-ing':['in','ing'],umlaut:['v','jqx','y'],
    contractions:['iu','ui','un'],'y-w':['y','w'],
  }[id];
  for (const bucket of expected) check(buckets[bucket]>=3,`${group.title} 的 ${bucket} 類至少 3 題`);
  check(group.rule&&group.commonMistake,`${id} 缺少規則／常見錯誤`);
  check(group.exampleTexts.length>=2&&group.exampleTexts.length<=4,`${id} 例子不是 2～4 個`);
  for (const text of group.exampleTexts) check(group.pool.some(qid=>questionsById[qid]?.text===text),`${id} 例子未在題池 ${text}`);
}

unique(stages.map(s=>s.id),'小關 ID ');
equal(regions.length,5,'地區數');
const regionLists = {1:phonics,2:characters,3:[...new Set(soundGroups.flatMap(g=>g.pool))].map(id=>questionsById[id]),4:words,5:sentences};
const stageOutput = [];
function validateStage(s, errors) {
  const fail = m=>errors.push(`${s.id}：${m}`);
  if (!s.pool?.length) {fail('空題池');return;}
  if (new Set(s.pool).size!==s.pool.length) fail('題池重複 ID');
  const list = s.pool.map(id=>questionsById[id]);
  if (list.some(q=>!q)) {fail('題池引用不存在的題目');return;}
  if (!Number.isInteger(s.maxSimultaneous)||s.maxSimultaneous<1||s.maxSimultaneous>5) fail('同場怪數須為 1～5');
  // 以每個首字母各取一題，實際構造一組可同場出場的怪。
  const byFirst = new Map();
  for (const q of list) if (!byFirst.has(q.pinyin[0])) byFirst.set(q.pinyin[0],q.id);
  const witness = [...byFirst.values()].slice(0,s.maxSimultaneous);
  if (witness.length!==s.maxSimultaneous) fail(`無法湊首字母互異組合（只有 ${byFirst.size} 種）`);
  if (s.kind.includes('boss')&&s.maxSimultaneous!==1) fail('王關一次只能出一題');
  if (s.kind.includes('boss')) {
    if (!s.reviewPriority||!s.priorityPool?.length) fail('王關缺少易錯／複習優先設定');
    if (s.priorityPool?.some(id=>!s.pool.includes(id))) fail('王關優先題不在題池');
  }
  return {firsts:[...byFirst.keys()].sort().join(''),witness};
}
for (const s of stages) {
  const errors = [], proof = validateStage(s,errors);
  check(errors.length===0,errors.join('\n'));
  check(regions.some(r=>r.id===s.region),`${s.id} 地區不存在`);
  for (const id of s.pool) check(questionsById[id]?.kind===regions.find(r=>r.id===s.region)?.questionKind,`${s.id} 題型不屬該區：${id}`);
  if (s.region===4&&s.kind==='battle') check(s.questionsPerMonster>=2&&s.movementScale<1,`${s.id} 詞語怪須較厚且較慢`);
  if (s.region===5) check(s.kind==='ime-duel'||s.kind==='ime-boss',`${s.id} 必須使用真輸入法對決`);
  stageOutput.push(`${s.id}｜${s.title}｜${s.pool.length} 題｜同場 ${s.maxSimultaneous}｜首字母 ${proof?.firsts||'無'}`);
}
for (const region of regions) {
  const list = stages.filter(s=>s.region===region.id);
  check(list.length>=3,`${region.title} 需數個小關與王關`);
  equal(list.filter(s=>s.kind.includes('boss')).length,1,`${region.title} 王關數`);
  check(list.at(-1)?.kind.includes('boss'),`${region.title} 最後一關須為王關`);
  equal(region.stageIds.join(','),list.map(s=>s.id).join(','),`${region.title} 關卡清單`);
  // 不讓「全區題數很多、實際普通小關只使用少數題」混過檢查。
  const normalPool = new Set(list.filter(s=>!s.kind.includes('boss')).flatMap(s=>s.pool));
  for (const q of regionLists[region.id]) check(normalPool.has(q.id),`${region.title} 普通關未涵蓋 ${q.id} ${q.text}`);
}
for (const group of soundGroups) {
  const matches = stages.filter(s=>s.soundGroup===group.id);
  equal(matches.length,1,`${group.id} 專項小關數`);
  equal(matches[0]?.pool.join(','),group.pool.join(','),`${group.id} 小關完整引用專項題池`);
}
const reviewErrors=[];
validateStage(reviewStage,reviewErrors);
check(reviewErrors.length===0,reviewErrors.join('\n'));
check(reviewStage.adaptiveSimultaneous&&reviewStage.reviewOnly,'複習關須隨實際複習池減少同場怪數');
// 首字母檢查的反例：n/l 專項同場三隻一定不成立。
const impossible = {...stages.find(s=>s.soundGroup==='n-l'),maxSimultaneous:3};
const impossibleErrors=[];
validateStage(impossible,impossibleErrors);
check(impossibleErrors.some(e=>e.includes('首字母互異')),'未抓到不可能的同場數');

// Third-version safeguards: unchanged bank and real consumed-prefix behavior.
const thirdHTML = readFileSync(new URL('index.html', import.meta.url), 'utf8');
const secondHTML = readFileSync(new URL('v2.html', import.meta.url), 'utf8');
const bankBlock = text => text.match(/\/\/ BEGIN QUESTION BANK\n([\s\S]*?)\n\/\/ END QUESTION BANK/u)[1];
equal(bankBlock(thirdHTML), bankBlock(secondHTML), '第三版與 v2.html 題庫逐位元相同');
equal(bankBlock(thirdHTML), bankBlock(readFileSync(new URL('v3.html', import.meta.url),'utf8')), '第四版與 v3.html 題庫逐位元相同');
check(!/<(?:script|img|audio|video|source)[^>]+src\s*=/iu.test(thirdHTML), '單檔沒有外部 script、圖片或音訊資源');
const prefixFunction = thirdHTML.slice(thirdHTML.indexOf('function pendingLetters('), thirdHTML.indexOf('function configureInputs('));
const state = {raw: 'b', consumed: 1};
const pendingLettersTest = new Function('inputState', 'normalizeLetters', prefixFunction + '; return pendingLetters;')(state, text => text.toLowerCase().replace(/[\s’']/gu, '').replace(/ü/g, 'v'));
equal(pendingLettersTest('bp').slice(state.consumed), 'p', '換焦失效、殘留 b 的 bp 仍接受下一個 p');
state.raw = 'bp'; state.consumed = 2;
equal(pendingLettersTest("bp ' m").slice(state.consumed), 'm', '組字持續累積含空格與撇號仍消耗前綴');
state.raw = 'b'; state.consumed = 1;
equal(pendingLettersTest('p').slice(state.consumed), 'p', '換焦成功後新字母 p 不被舊 consumed 吞掉');
state.raw = 'b'; state.consumed = 1;
equal(pendingLettersTest('b').slice(state.consumed), 'b', '下一隻同答案 b 仍可重新擊倒');
state.raw = 'ni'; state.consumed = 0;
equal(pendingLettersTest('n').slice(state.consumed), 'n', '刪除回退保留新的有效前綴');
state.raw = 'b'; state.consumed = 1;
equal(pendingLettersTest(''), '', '組字刪光後 consumed 歸零');
equal(state.consumed, 0, '刪光不殘留 consumed');
state.raw = 'ni'; state.consumed = 2;
equal(pendingLettersTest('nihao', ['nihao']).slice(state.consumed), 'nihao', '乾淨的新答案與前題共享前綴仍完整接受');
state.raw = 'ni'; state.consumed = 2;
equal(pendingLettersTest('ninihao', ['nihao']).slice(state.consumed), 'nihao', '共享前綴的原生殘留仍消耗舊 ni');

console.log('拼鬥魔法師・單檔內嵌題庫自我檢查');
console.log(`第 1 區：${phonics.length} 題（聲母 ${phonics.filter(q=>q.mode==='initial').length}、韻母 ${phonics.filter(q=>q.mode==='final').length}；含 ㄝ／ㄦ 補充）`);
console.log(`第 2 區：${characters.length} 個不重複單字`);
console.log(`第 3 區：${soundGroups.length} 組，${soundGroups.reduce((n,g)=>n+g.pool.length,0)} 個分組題位，${regionLists[3].length} 個不重複單字`);
for (const group of soundGroups) console.log(`  ${group.title}：${group.pool.length} 題`);
console.log(`第 4 區：${words.length} 個不重複詞（${[2,3,4].map(n=>`${n} 字詞 ${words.filter(q=>[...q.text].length===n).length}`).join('、')}）`);
console.log(`第 5 區：${sentences.length} 句，${sentences.reduce((n,q)=>n+q.units.length,0)} 個逐字注音／拼音（每句 8～20 字）`);
console.log(`獨立規則案例：${regression.length}；非法輸入案例：${invalid.length}＋8 個聲韻片段；資料損壞反例：5；同場數反例：1`);
console.log(`全部 ${stages.length} 小關（含 5 王關）與複習關的題池／同場數：`);
for (const line of stageOutput) console.log(`  ${line}`);
console.log(`  review｜複習關｜${reviewStage.pool.length} 題候選｜同場上限 ${reviewStage.maxSimultaneous}（實際依錯題首字母數降低）`);
if (failures.length) {
  console.error(`自我檢查未通過：${failures.length} 項\n${failures.map(f=>`－ ${f}`).join('\n')}`);
  process.exitCode=1;
} else {
  console.log(`全部通過（${assertions} 項檢查）；結束狀態 0`);
}
