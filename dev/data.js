/**
 * 拼音守城・第一步題庫。無 DOM、網路、套件或 I/O；可直接內嵌於 module script。
 * 拼音為不含聲調的鍵入形式：ü → v，j/q/x/y 後保留 u。
 * 國字注音記詞典本調（不記口語連讀變調）；輕聲 ˙ 放在音節前。
 * row.pinyin 是手工列出的答案，絕不由轉換函式產生，以便獨立交叉檢查。
 */
export const SCHEMA_VERSION = 1;
export const INITIALS = Object.freeze({
  ㄅ:'b', ㄆ:'p', ㄇ:'m', ㄈ:'f', ㄉ:'d', ㄊ:'t', ㄋ:'n', ㄌ:'l',
  ㄍ:'g', ㄎ:'k', ㄏ:'h', ㄐ:'j', ㄑ:'q', ㄒ:'x',
  ㄓ:'zh', ㄔ:'ch', ㄕ:'sh', ㄖ:'r', ㄗ:'z', ㄘ:'c', ㄙ:'s',
});
export const FINALS = Object.freeze({
  ㄚ:'a', ㄛ:'o', ㄜ:'e', ㄝ:'e', ㄞ:'ai', ㄟ:'ei', ㄠ:'ao', ㄡ:'ou',
  ㄢ:'an', ㄣ:'en', ㄤ:'ang', ㄥ:'eng', ㄦ:'er',
  ㄧ:'i', ㄧㄚ:'ia', ㄧㄝ:'ie', ㄧㄠ:'iao', ㄧㄡ:'iu', ㄧㄢ:'ian',
  ㄧㄣ:'in', ㄧㄤ:'iang', ㄧㄥ:'ing', ㄩㄥ:'iong',
  ㄨ:'u', ㄨㄚ:'ua', ㄨㄛ:'uo', ㄨㄞ:'uai', ㄨㄟ:'ui', ㄨㄢ:'uan',
  ㄨㄣ:'un', ㄨㄤ:'uang', ㄨㄥ:'ong',
  ㄩ:'v', ㄩㄝ:'ve', ㄩㄢ:'van', ㄩㄣ:'vn',
});
const ZERO_INITIAL = Object.freeze({
  ㄧ:'yi', ㄧㄚ:'ya', ㄧㄝ:'ye', ㄧㄠ:'yao', ㄧㄡ:'you', ㄧㄢ:'yan',
  ㄧㄣ:'yin', ㄧㄤ:'yang', ㄧㄥ:'ying', ㄩㄥ:'yong',
  ㄨ:'wu', ㄨㄚ:'wa', ㄨㄛ:'wo', ㄨㄞ:'wai', ㄨㄟ:'wei', ㄨㄢ:'wan',
  ㄨㄣ:'wen', ㄨㄤ:'wang', ㄨㄥ:'weng',
  ㄩ:'yu', ㄩㄝ:'yue', ㄩㄢ:'yuan', ㄩㄣ:'yun',
});
// 用來拒絕不成立的聲韻組合；不將任意符號串悄悄拼成答案。
const LEGAL_FINALS = Object.fromEntries(Object.entries({
  b:'a o ai ei ao an en ang eng i ie iao ian in ing u',
  p:'a o ai ei ao ou an en ang eng i ie iao ian in ing u',
  m:'a o e ai ei ao ou an en ang eng i ie iao iu ian in ing u',
  f:'a o ei ou an en ang eng u',
  d:'a e ai ei ao ou an en ang eng ong i ie iao iu ian ing u uo ui uan un',
  t:'a e ai ao ou an ang eng ong i ie iao ian ing u uo ui uan un',
  n:'a e ai ei ao ou an en ang eng ong i ie iao iu ian in iang ing u uo uan un v ve',
  l:'a o e ai ei ao ou an ang eng ong i ia ie iao iu ian in iang ing u uo uan un v ve',
  g:'a e ai ei ao ou an en ang eng ong u ua uo uai ui uan un uang',
  k:'a e ai ao ou an en ang eng ong u ua uo uai ui uan un uang',
  h:'a e ai ei ao ou an en ang eng ong u ua uo uai ui uan un uang',
  j:'i ia ie iao iu ian in iang ing iong v ve van vn',
  q:'i ia ie iao iu ian in iang ing iong v ve van vn',
  x:'i ia ie iao iu ian in iang ing iong v ve van vn',
  zh:'a e ai ei ao ou an en ang eng ong u ua uo uai ui uan un uang',
  ch:'a e ai ao ou an en ang eng ong u ua uo uai ui uan un uang',
  sh:'a e ai ei ao ou an en ang eng u ua uo uai ui uan un uang',
  r:'e ao ou an en ang eng ong u uo ui uan un',
  z:'a e ai ei ao ou an en ang eng ong u uo ui uan un',
  c:'a e ai ao ou an en ang eng ong u uo ui uan un',
  s:'a e ai ao ou an en ang eng ong u uo ui uan un',
}).map(([initial, finals]) => [initial, new Set(finals.split(' '))]));

/**
 * 單一注音音節 → 英文鍵位。
 * mode: syllable（預設，整字）／initial（聲母片段）／final（韻母片段）。
 * final 的 ㄨㄥ 預設 ueng；attached:true 時為 ong。
 * final 的 ㄩ 系列回傳 v/ve/van/vn；展示用 ü 見 phonics.notation。
 * 不支援兒化合音、罕用方音或無效注音，遇到即丟錯。
 */
export function zhuyinToPinyin(input, {mode = 'syllable', attached = false} = {}) {
  if (typeof input !== 'string' || !input || input !== input.trim()) {
    throw new TypeError('請提供單一、無前後空白的注音音節');
  }
  if (!['syllable', 'initial', 'final'].includes(mode)) throw new Error(`未知模式：${mode}`);
  if (mode !== 'syllable') {
    if (/[ˉˊˇˋ˙]/u.test(input)) throw new Error('聲韻片段不附聲調');
    if (mode === 'initial' && Object.hasOwn(INITIALS, input)) return INITIALS[input];
    if (mode === 'final' && Object.hasOwn(FINALS, input)) return input === 'ㄨㄥ' && !attached ? 'ueng' : FINALS[input];
    throw new Error(`無效聲韻片段：${input}`);
  }
  // 第一聲可省略或使用 ˉ，輕聲限前置，其他聲調限後置。
  if (!/^(?:˙[ㄅ-ㄩ]+|[ㄅ-ㄩ]+[ˉˊˇˋ]?)$/u.test(input)) throw new Error(`無效注音格式：${input}`);
  let syllable = input.replace(/[ˉˊˇˋ˙]/gu, '');
  const initial = INITIALS[syllable[0]] || '';
  if (initial) syllable = syllable.slice(1);
  if (!initial) {
    const result = ZERO_INITIAL[syllable] || FINALS[syllable];
    if (!result) throw new Error(`未知音節：${input}`);
    return result;
  }
  if (!syllable && /^(zh|ch|sh|r|z|c|s)$/u.test(initial)) return initial + 'i';
  const final = FINALS[syllable];
  if (!final || !LEGAL_FINALS[initial]?.has(final)) throw new Error(`無效聲韻組合：${input}`);
  return initial + (/^[jqx]$/u.test(initial) ? final.replace(/^v/u, 'u') : final);
}

/** 詞句注音以空白分節，回傳連打的完整答案。 */
export function readingToPinyin(reading) {
  if (typeof reading !== 'string' || !reading.trim()) throw new TypeError('注音不可空白');
  return reading.trim().split(/\s+/u).map(s => zhuyinToPinyin(s)).join('');
}

// 題目保留逐字答案；同一字在詞句中可依詞義有不同讀音，不以單字表覆寫。
function rows(source, prefix, kind) {
  return source.trim().split('\n').map((line, index) => {
    const fields = line.split('|');
    if (fields.length !== 3) throw new Error(`${prefix} 第 ${index + 1} 列須有三個欄位`);
    const [text, zhuyin, answers] = fields;
    const syllables = zhuyin.split(' ');
    const keys = answers.split(' ');
    if ([...text].length !== syllables.length || syllables.length !== keys.length) {
      throw new Error(`${text} 的字數、注音節數、拼音節數不一致`);
    }
    return {
      id: `${prefix}${String(index + 1).padStart(3, '0')}`, kind, text, zhuyin,
      pinyin: keys.join(''),
      units: [...text].map((char, i) => ({text: char, zhuyin: syllables[i], pinyin: keys[i]})),
    };
  });
}

export const characters = rows(`
八|ㄅㄚ|ba
白|ㄅㄞˊ|bai
百|ㄅㄞˇ|bai
包|ㄅㄠ|bao
杯|ㄅㄟ|bei
北|ㄅㄟˇ|bei
本|ㄅㄣˇ|ben
筆|ㄅㄧˇ|bi
邊|ㄅㄧㄢ|bian
冰|ㄅㄧㄥ|bing
布|ㄅㄨˋ|bu
怕|ㄆㄚˋ|pa
排|ㄆㄞˊ|pai
跑|ㄆㄠˇ|pao
皮|ㄆㄧˊ|pi
片|ㄆㄧㄢˋ|pian
平|ㄆㄧㄥˊ|ping
坡|ㄆㄛ|po
朋|ㄆㄥˊ|peng
門|ㄇㄣˊ|men
毛|ㄇㄠˊ|mao
米|ㄇㄧˇ|mi
面|ㄇㄧㄢˋ|mian
明|ㄇㄧㄥˊ|ming
木|ㄇㄨˋ|mu
美|ㄇㄟˇ|mei
每|ㄇㄟˇ|mei
滿|ㄇㄢˇ|man
慢|ㄇㄢˋ|man
風|ㄈㄥ|feng
分|ㄈㄣ|fen
飛|ㄈㄟ|fei
非|ㄈㄟ|fei
方|ㄈㄤ|fang
房|ㄈㄤˊ|fang
服|ㄈㄨˊ|fu
大|ㄉㄚˋ|da
地|ㄉㄧˋ|di
低|ㄉㄧ|di
點|ㄉㄧㄢˇ|dian
電|ㄉㄧㄢˋ|dian
東|ㄉㄨㄥ|dong
冬|ㄉㄨㄥ|dong
短|ㄉㄨㄢˇ|duan
多|ㄉㄨㄛ|duo
對|ㄉㄨㄟˋ|dui
堆|ㄉㄨㄟ|dui
他|ㄊㄚ|ta
她|ㄊㄚ|ta
臺|ㄊㄞˊ|tai
太|ㄊㄞˋ|tai
天|ㄊㄧㄢ|tian
田|ㄊㄧㄢˊ|tian
甜|ㄊㄧㄢˊ|tian
鐵|ㄊㄧㄝˇ|tie
土|ㄊㄨˇ|tu
圖|ㄊㄨˊ|tu
兔|ㄊㄨˋ|tu
頭|ㄊㄡˊ|tou
推|ㄊㄨㄟ|tui
你|ㄋㄧˇ|ni
年|ㄋㄧㄢˊ|nian
鳥|ㄋㄧㄠˇ|niao
牛|ㄋㄧㄡˊ|niu
南|ㄋㄢˊ|nan
男|ㄋㄢˊ|nan
難|ㄋㄢˊ|nan
能|ㄋㄥˊ|neng
內|ㄋㄟˋ|nei
腦|ㄋㄠˇ|nao
泥|ㄋㄧˊ|ni
農|ㄋㄨㄥˊ|nong
怒|ㄋㄨˋ|nu
女|ㄋㄩˇ|nv
暖|ㄋㄨㄢˇ|nuan
拿|ㄋㄚˊ|na
來|ㄌㄞˊ|lai
老|ㄌㄠˇ|lao
冷|ㄌㄥˇ|leng
藍|ㄌㄢˊ|lan
林|ㄌㄧㄣˊ|lin
鄰|ㄌㄧㄣˊ|lin
零|ㄌㄧㄥˊ|ling
鈴|ㄌㄧㄥˊ|ling
臉|ㄌㄧㄢˇ|lian
六|ㄌㄧㄡˋ|liu
柳|ㄌㄧㄡˇ|liu
路|ㄌㄨˋ|lu
綠|ㄌㄩˋ|lv
略|ㄌㄩㄝˋ|lve
旅|ㄌㄩˇ|lv
律|ㄌㄩˋ|lv
哥|ㄍㄜ|ge
歌|ㄍㄜ|ge
高|ㄍㄠ|gao
狗|ㄍㄡˇ|gou
光|ㄍㄨㄤ|guang
工|ㄍㄨㄥ|gong
公|ㄍㄨㄥ|gong
古|ㄍㄨˇ|gu
果|ㄍㄨㄛˇ|guo
國|ㄍㄨㄛˊ|guo
關|ㄍㄨㄢ|guan
根|ㄍㄣ|gen
耕|ㄍㄥ|geng
跟|ㄍㄣ|gen
開|ㄎㄞ|kai
口|ㄎㄡˇ|kou
可|ㄎㄜˇ|ke
課|ㄎㄜˋ|ke
客|ㄎㄜˋ|ke
空|ㄎㄨㄥ|kong
快|ㄎㄨㄞˋ|kuai
寬|ㄎㄨㄢ|kuan
好|ㄏㄠˇ|hao
黑|ㄏㄟ|hei
紅|ㄏㄨㄥˊ|hong
花|ㄏㄨㄚ|hua
海|ㄏㄞˇ|hai
河|ㄏㄜˊ|he
火|ㄏㄨㄛˇ|huo
很|ㄏㄣˇ|hen
橫|ㄏㄥˊ|heng
黃|ㄏㄨㄤˊ|huang
回|ㄏㄨㄟˊ|hui
家|ㄐㄧㄚ|jia
加|ㄐㄧㄚ|jia
今|ㄐㄧㄣ|jin
金|ㄐㄧㄣ|jin
近|ㄐㄧㄣˋ|jin
進|ㄐㄧㄣˋ|jin
井|ㄐㄧㄥˇ|jing
京|ㄐㄧㄥ|jing
景|ㄐㄧㄥˇ|jing
九|ㄐㄧㄡˇ|jiu
久|ㄐㄧㄡˇ|jiu
見|ㄐㄧㄢˋ|jian
間|ㄐㄧㄢ|jian
江|ㄐㄧㄤ|jiang
腳|ㄐㄧㄠˇ|jiao
街|ㄐㄧㄝ|jie
句|ㄐㄩˋ|ju
居|ㄐㄩ|ju
軍|ㄐㄩㄣ|jun
君|ㄐㄩㄣ|jun
七|ㄑㄧ|qi
起|ㄑㄧˇ|qi
千|ㄑㄧㄢ|qian
前|ㄑㄧㄢˊ|qian
錢|ㄑㄧㄢˊ|qian
青|ㄑㄧㄥ|qing
清|ㄑㄧㄥ|qing
晴|ㄑㄧㄥˊ|qing
請|ㄑㄧㄥˇ|qing
親|ㄑㄧㄣ|qin
琴|ㄑㄧㄣˊ|qin
球|ㄑㄧㄡˊ|qiu
秋|ㄑㄧㄡ|qiu
橋|ㄑㄧㄠˊ|qiao
去|ㄑㄩˋ|qu
取|ㄑㄩˇ|qu
群|ㄑㄩㄣˊ|qun
裙|ㄑㄩㄣˊ|qun
西|ㄒㄧ|xi
小|ㄒㄧㄠˇ|xiao
笑|ㄒㄧㄠˋ|xiao
心|ㄒㄧㄣ|xin
新|ㄒㄧㄣ|xin
信|ㄒㄧㄣˋ|xin
星|ㄒㄧㄥ|xing
形|ㄒㄧㄥˊ|xing
醒|ㄒㄧㄥˇ|xing
先|ㄒㄧㄢ|xian
線|ㄒㄧㄢˋ|xian
香|ㄒㄧㄤ|xiang
想|ㄒㄧㄤˇ|xiang
雪|ㄒㄩㄝˇ|xue
學|ㄒㄩㄝˊ|xue
需|ㄒㄩ|xu
許|ㄒㄩˇ|xu
中|ㄓㄨㄥ|zhong
知|ㄓ|zhi
紙|ㄓˇ|zhi
竹|ㄓㄨˊ|zhu
主|ㄓㄨˇ|zhu
站|ㄓㄢˋ|zhan
張|ㄓㄤ|zhang
章|ㄓㄤ|zhang
針|ㄓㄣ|zhen
真|ㄓㄣ|zhen
正|ㄓㄥˋ|zheng
睜|ㄓㄥ|zheng
桌|ㄓㄨㄛ|zhuo
春|ㄔㄨㄣ|chun
吃|ㄔ|chi
車|ㄔㄜ|che
窗|ㄔㄨㄤ|chuang
床|ㄔㄨㄤˊ|chuang
船|ㄔㄨㄢˊ|chuan
昌|ㄔㄤ|chang
常|ㄔㄤˊ|chang
城|ㄔㄥˊ|cheng
成|ㄔㄥˊ|cheng
塵|ㄔㄣˊ|chen
陳|ㄔㄣˊ|chen
書|ㄕㄨ|shu
師|ㄕ|shi
十|ㄕˊ|shi
手|ㄕㄡˇ|shou
水|ㄕㄨㄟˇ|shui
山|ㄕㄢ|shan
上|ㄕㄤˋ|shang
深|ㄕㄣ|shen
身|ㄕㄣ|shen
生|ㄕㄥ|sheng
聲|ㄕㄥ|sheng
少|ㄕㄠˇ|shao
日|ㄖˋ|ri
人|ㄖㄣˊ|ren
仁|ㄖㄣˊ|ren
熱|ㄖㄜˋ|re
柔|ㄖㄡˊ|rou
如|ㄖㄨˊ|ru
字|ㄗˋ|zi
早|ㄗㄠˇ|zao
左|ㄗㄨㄛˇ|zuo
走|ㄗㄡˇ|zou
在|ㄗㄞˋ|zai
再|ㄗㄞˋ|zai
草|ㄘㄠˇ|cao
菜|ㄘㄞˋ|cai
村|ㄘㄨㄣ|cun
餐|ㄘㄢ|can
倉|ㄘㄤ|cang
蒼|ㄘㄤ|cang
四|ㄙˋ|si
三|ㄙㄢ|san
色|ㄙㄜˋ|se
森|ㄙㄣ|sen
送|ㄙㄨㄥˋ|song
傘|ㄙㄢˇ|san
嗓|ㄙㄤˇ|sang
一|ㄧ|yi
衣|ㄧ|yi
以|ㄧˇ|yi
已|ㄧˇ|yi
也|ㄧㄝˇ|ye
夜|ㄧㄝˋ|ye
頁|ㄧㄝˋ|ye
牙|ㄧㄚˊ|ya
鴨|ㄧㄚ|ya
有|ㄧㄡˇ|you
友|ㄧㄡˇ|you
油|ㄧㄡˊ|you
眼|ㄧㄢˇ|yan
言|ㄧㄢˊ|yan
煙|ㄧㄢ|yan
羊|ㄧㄤˊ|yang
陽|ㄧㄤˊ|yang
因|ㄧㄣ|yin
音|ㄧㄣ|yin
銀|ㄧㄣˊ|yin
英|ㄧㄥ|ying
影|ㄧㄥˇ|ying
五|ㄨˇ|wu
午|ㄨˇ|wu
屋|ㄨ|wu
我|ㄨㄛˇ|wo
外|ㄨㄞˋ|wai
晚|ㄨㄢˇ|wan
碗|ㄨㄢˇ|wan
灣|ㄨㄢ|wan
王|ㄨㄤˊ|wang
網|ㄨㄤˇ|wang
為|ㄨㄟˊ|wei
文|ㄨㄣˊ|wen
聞|ㄨㄣˊ|wen
翁|ㄨㄥ|weng
魚|ㄩˊ|yu
雨|ㄩˇ|yu
玉|ㄩˋ|yu
月|ㄩㄝˋ|yue
約|ㄩㄝ|yue
元|ㄩㄢˊ|yuan
圓|ㄩㄢˊ|yuan
遠|ㄩㄢˇ|yuan
雲|ㄩㄣˊ|yun
運|ㄩㄣˋ|yun
用|ㄩㄥˋ|yong
永|ㄩㄥˇ|yong
安|ㄢ|an
岸|ㄢˋ|an
昂|ㄤˊ|ang
恩|ㄣ|en
愛|ㄞˋ|ai
耳|ㄦˇ|er
二|ㄦˋ|er
阿|ㄚ|a
喔|ㄛ|o
餓|ㄜˋ|e
矮|ㄞˇ|ai
凹|ㄠ|ao
歐|ㄡ|ou
燈|ㄉㄥ|deng
等|ㄉㄥˇ|deng
登|ㄉㄥ|deng
單|ㄉㄢ|dan
當|ㄉㄤ|dang
奔|ㄅㄣ|ben
崩|ㄅㄥ|beng
盆|ㄆㄣˊ|pen
烹|ㄆㄥ|peng
萌|ㄇㄥˊ|meng
肯|ㄎㄣˇ|ken
坑|ㄎㄥ|keng
賓|ㄅㄧㄣ|bin
兵|ㄅㄧㄥ|bing
拼|ㄆㄧㄣ|pin
品|ㄆㄧㄣˇ|pin
民|ㄇㄧㄣˊ|min
名|ㄇㄧㄥˊ|ming
您|ㄋㄧㄣˊ|nin
寧|ㄋㄧㄥˊ|ning
休|ㄒㄧㄡ|xiu
修|ㄒㄧㄡ|xiu
收|ㄕㄡ|shou
貴|ㄍㄨㄟˋ|gui
龜|ㄍㄨㄟ|gui
退|ㄊㄨㄟˋ|tui
吹|ㄔㄨㄟ|chui
睡|ㄕㄨㄟˋ|shui
追|ㄓㄨㄟ|zhui
純|ㄔㄨㄣˊ|chun
輪|ㄌㄨㄣˊ|lun
存|ㄘㄨㄣˊ|cun
孫|ㄙㄨㄣ|sun
吞|ㄊㄨㄣ|tun
盾|ㄉㄨㄣˋ|dun
隻|ㄓ|zhi
虐|ㄋㄩㄝˋ|nve
呂|ㄌㄩˇ|lv
次|ㄘˋ|ci
思|ㄙ|si
詞|ㄘˊ|ci
私|ㄙ|si
熊|ㄒㄩㄥˊ|xiong
`, 'c', 'character');

export const words = rows(`
感謝|ㄍㄢˇ ㄒㄧㄝˋ|gan xie
電腦|ㄉㄧㄢˋ ㄋㄠˇ|dian nao
臺灣|ㄊㄞˊ ㄨㄢ|tai wan
天空|ㄊㄧㄢ ㄎㄨㄥ|tian kong
友人|ㄧㄡˇ ㄖㄣˊ|you ren
老師|ㄌㄠˇ ㄕ|lao shi
學生|ㄒㄩㄝˊ ㄕㄥ|xue sheng
水果|ㄕㄨㄟˇ ㄍㄨㄛˇ|shui guo
你好|ㄋㄧˇ ㄏㄠˇ|ni hao
明天|ㄇㄧㄥˊ ㄊㄧㄢ|ming tian
今天|ㄐㄧㄣ ㄊㄧㄢ|jin tian
昨天|ㄗㄨㄛˊ ㄊㄧㄢ|zuo tian
早晨|ㄗㄠˇ ㄔㄣˊ|zao chen
中午|ㄓㄨㄥ ㄨˇ|zhong wu
下午|ㄒㄧㄚˋ ㄨˇ|xia wu
夜晚|ㄧㄝˋ ㄨㄢˇ|ye wan
時間|ㄕˊ ㄐㄧㄢ|shi jian
春天|ㄔㄨㄣ ㄊㄧㄢ|chun tian
夏天|ㄒㄧㄚˋ ㄊㄧㄢ|xia tian
秋天|ㄑㄧㄡ ㄊㄧㄢ|qiu tian
冬天|ㄉㄨㄥ ㄊㄧㄢ|dong tian
月亮|ㄩㄝˋ ㄌㄧㄤˋ|yue liang
星光|ㄒㄧㄥ ㄍㄨㄤ|xing guang
太陽|ㄊㄞˋ ㄧㄤˊ|tai yang
白雲|ㄅㄞˊ ㄩㄣˊ|bai yun
下雨|ㄒㄧㄚˋ ㄩˇ|xia yu
晴天|ㄑㄧㄥˊ ㄊㄧㄢ|qing tian
颱風|ㄊㄞˊ ㄈㄥ|tai feng
彩虹|ㄘㄞˇ ㄏㄨㄥˊ|cai hong
大海|ㄉㄚˋ ㄏㄞˇ|da hai
河流|ㄏㄜˊ ㄌㄧㄡˊ|he liu
山林|ㄕㄢ ㄌㄧㄣˊ|shan lin
森林|ㄙㄣ ㄌㄧㄣˊ|sen lin
草地|ㄘㄠˇ ㄉㄧˋ|cao di
花園|ㄏㄨㄚ ㄩㄢˊ|hua yuan
公園|ㄍㄨㄥ ㄩㄢˊ|gong yuan
樹木|ㄕㄨˋ ㄇㄨˋ|shu mu
樹葉|ㄕㄨˋ ㄧㄝˋ|shu ye
綠色|ㄌㄩˋ ㄙㄜˋ|lv se
紅色|ㄏㄨㄥˊ ㄙㄜˋ|hong se
藍色|ㄌㄢˊ ㄙㄜˋ|lan se
白色|ㄅㄞˊ ㄙㄜˋ|bai se
黑色|ㄏㄟ ㄙㄜˋ|hei se
黃色|ㄏㄨㄤˊ ㄙㄜˋ|huang se
圓形|ㄩㄢˊ ㄒㄧㄥˊ|yuan xing
方形|ㄈㄤ ㄒㄧㄥˊ|fang xing
三角形|ㄙㄢ ㄐㄧㄠˇ ㄒㄧㄥˊ|san jiao xing
正方形|ㄓㄥˋ ㄈㄤ ㄒㄧㄥˊ|zheng fang xing
牛奶|ㄋㄧㄡˊ ㄋㄞˇ|niu nai
豆漿|ㄉㄡˋ ㄐㄧㄤ|dou jiang
白飯|ㄅㄞˊ ㄈㄢˋ|bai fan
麵包|ㄇㄧㄢˋ ㄅㄠ|mian bao
麵條|ㄇㄧㄢˋ ㄊㄧㄠˊ|mian tiao
水餃|ㄕㄨㄟˇ ㄐㄧㄠˇ|shui jiao
早餐|ㄗㄠˇ ㄘㄢ|zao can
午餐|ㄨˇ ㄘㄢ|wu can
晚餐|ㄨㄢˇ ㄘㄢ|wan can
白菜|ㄅㄞˊ ㄘㄞˋ|bai cai
青菜|ㄑㄧㄥ ㄘㄞˋ|qing cai
番茄|ㄈㄢ ㄑㄧㄝˊ|fan qie
蘋果|ㄆㄧㄥˊ ㄍㄨㄛˇ|ping guo
香蕉|ㄒㄧㄤ ㄐㄧㄠ|xiang jiao
西瓜|ㄒㄧ ㄍㄨㄚ|xi gua
葡萄|ㄆㄨˊ ㄊㄠˊ|pu tao
草莓|ㄘㄠˇ ㄇㄟˊ|cao mei
芒果|ㄇㄤˊ ㄍㄨㄛˇ|mang guo
鳳梨|ㄈㄥˋ ㄌㄧˊ|feng li
果汁|ㄍㄨㄛˇ ㄓ|guo zhi
紅茶|ㄏㄨㄥˊ ㄔㄚˊ|hong cha
綠茶|ㄌㄩˋ ㄔㄚˊ|lv cha
白糖|ㄅㄞˊ ㄊㄤˊ|bai tang
冰水|ㄅㄧㄥ ㄕㄨㄟˇ|bing shui
熱水|ㄖㄜˋ ㄕㄨㄟˇ|re shui
開水|ㄎㄞ ㄕㄨㄟˇ|kai shui
書包|ㄕㄨ ㄅㄠ|shu bao
課本|ㄎㄜˋ ㄅㄣˇ|ke ben
鉛筆|ㄑㄧㄢ ㄅㄧˇ|qian bi
毛筆|ㄇㄠˊ ㄅㄧˇ|mao bi
白紙|ㄅㄞˊ ㄓˇ|bai zhi
黑板|ㄏㄟ ㄅㄢˇ|hei ban
教室|ㄐㄧㄠˋ ㄕˋ|jiao shi
學校|ㄒㄩㄝˊ ㄒㄧㄠˋ|xue xiao
同學|ㄊㄨㄥˊ ㄒㄩㄝˊ|tong xue
校園|ㄒㄧㄠˋ ㄩㄢˊ|xiao yuan
國語|ㄍㄨㄛˊ ㄩˇ|guo yu
中文|ㄓㄨㄥ ㄨㄣˊ|zhong wen
英文|ㄧㄥ ㄨㄣˊ|ying wen
拼音|ㄆㄧㄣ ㄧㄣ|pin yin
注音|ㄓㄨˋ ㄧㄣ|zhu yin
聲母|ㄕㄥ ㄇㄨˇ|sheng mu
韻母|ㄩㄣˋ ㄇㄨˇ|yun mu
字母|ㄗˋ ㄇㄨˇ|zi mu
字典|ㄗˋ ㄉㄧㄢˇ|zi dian
課文|ㄎㄜˋ ㄨㄣˊ|ke wen
功課|ㄍㄨㄥ ㄎㄜˋ|gong ke
問題|ㄨㄣˋ ㄊㄧˊ|wen ti
答案|ㄉㄚˊ ㄢˋ|da an
練習|ㄌㄧㄢˋ ㄒㄧˊ|lian xi
複習|ㄈㄨˋ ㄒㄧˊ|fu xi
學習|ㄒㄩㄝˊ ㄒㄧˊ|xue xi
閱讀|ㄩㄝˋ ㄉㄨˊ|yue du
寫字|ㄒㄧㄝˇ ㄗˋ|xie zi
打字|ㄉㄚˇ ㄗˋ|da zi
鍵盤|ㄐㄧㄢˋ ㄆㄢˊ|jian pan
滑鼠|ㄏㄨㄚˊ ㄕㄨˇ|hua shu
網路|ㄨㄤˇ ㄌㄨˋ|wang lu
手機|ㄕㄡˇ ㄐㄧ|shou ji
照片|ㄓㄠˋ ㄆㄧㄢˋ|zhao pian
相機|ㄒㄧㄤˋ ㄐㄧ|xiang ji
電視|ㄉㄧㄢˋ ㄕˋ|dian shi
電影|ㄉㄧㄢˋ ㄧㄥˇ|dian ying
音量|ㄧㄣ ㄌㄧㄤˋ|yin liang
音符|ㄧㄣ ㄈㄨˊ|yin fu
耳機|ㄦˇ ㄐㄧ|er ji
公車|ㄍㄨㄥ ㄔㄜ|gong che
火車|ㄏㄨㄛˇ ㄔㄜ|huo che
汽車|ㄑㄧˋ ㄔㄜ|qi che
機車|ㄐㄧ ㄔㄜ|ji che
單車|ㄉㄢ ㄔㄜ|dan che
車站|ㄔㄜ ㄓㄢˋ|che zhan
車票|ㄔㄜ ㄆㄧㄠˋ|che piao
馬路|ㄇㄚˇ ㄌㄨˋ|ma lu
路口|ㄌㄨˋ ㄎㄡˇ|lu kou
方向|ㄈㄤ ㄒㄧㄤˋ|fang xiang
左邊|ㄗㄨㄛˇ ㄅㄧㄢ|zuo bian
右邊|ㄧㄡˋ ㄅㄧㄢ|you bian
前面|ㄑㄧㄢˊ ㄇㄧㄢˋ|qian mian
後面|ㄏㄡˋ ㄇㄧㄢˋ|hou mian
中間|ㄓㄨㄥ ㄐㄧㄢ|zhong jian
門口|ㄇㄣˊ ㄎㄡˇ|men kou
房間|ㄈㄤˊ ㄐㄧㄢ|fang jian
廚房|ㄔㄨˊ ㄈㄤˊ|chu fang
客廳|ㄎㄜˋ ㄊㄧㄥ|ke ting
陽臺|ㄧㄤˊ ㄊㄞˊ|yang tai
窗簾|ㄔㄨㄤ ㄌㄧㄢˊ|chuang lian
地板|ㄉㄧˋ ㄅㄢˇ|di ban
書桌|ㄕㄨ ㄓㄨㄛ|shu zhuo
書架|ㄕㄨ ㄐㄧㄚˋ|shu jia
衣物|ㄧ ㄨˋ|yi wu
外套|ㄨㄞˋ ㄊㄠˋ|wai tao
雨衣|ㄩˇ ㄧ|yu yi
雨傘|ㄩˇ ㄙㄢˇ|yu san
手套|ㄕㄡˇ ㄊㄠˋ|shou tao
毛巾|ㄇㄠˊ ㄐㄧㄣ|mao jin
牙刷|ㄧㄚˊ ㄕㄨㄚ|ya shua
牙膏|ㄧㄚˊ ㄍㄠ|ya gao
眼神|ㄧㄢˇ ㄕㄣˊ|yan shen
耳環|ㄦˇ ㄏㄨㄢˊ|er huan
身體|ㄕㄣ ㄊㄧˇ|shen ti
手指|ㄕㄡˇ ㄓˇ|shou zhi
頭頂|ㄊㄡˊ ㄉㄧㄥˇ|tou ding
笑容|ㄒㄧㄠˋ ㄖㄨㄥˊ|xiao rong
心情|ㄒㄧㄣ ㄑㄧㄥˊ|xin qing
開心|ㄎㄞ ㄒㄧㄣ|kai xin
安心|ㄢ ㄒㄧㄣ|an xin
小心|ㄒㄧㄠˇ ㄒㄧㄣ|xiao xin
認真|ㄖㄣˋ ㄓㄣ|ren zhen
努力|ㄋㄨˇ ㄌㄧˋ|nu li
勇敢|ㄩㄥˇ ㄍㄢˇ|yong gan
溫暖|ㄨㄣ ㄋㄨㄢˇ|wen nuan
快樂|ㄎㄨㄞˋ ㄌㄜˋ|kuai le
幸福|ㄒㄧㄥˋ ㄈㄨˊ|xing fu
希望|ㄒㄧ ㄨㄤˋ|xi wang
健康|ㄐㄧㄢˋ ㄎㄤ|jian kang
平安|ㄆㄧㄥˊ ㄢ|ping an
安全|ㄢ ㄑㄩㄢˊ|an quan
放鬆|ㄈㄤˋ ㄙㄨㄥ|fang song
睡覺|ㄕㄨㄟˋ ㄐㄧㄠˋ|shui jiao
運動|ㄩㄣˋ ㄉㄨㄥˋ|yun dong
跑步|ㄆㄠˇ ㄅㄨˋ|pao bu
游泳|ㄧㄡˊ ㄩㄥˇ|you yong
散步|ㄙㄢˋ ㄅㄨˋ|san bu
旅行|ㄌㄩˇ ㄒㄧㄥˊ|lv xing
旅客|ㄌㄩˇ ㄎㄜˋ|lv ke
女王|ㄋㄩˇ ㄨㄤˊ|nv wang
女人|ㄋㄩˇ ㄖㄣˊ|nv ren
音樂|ㄧㄣ ㄩㄝˋ|yin yue
歌曲|ㄍㄜ ㄑㄩˇ|ge qu
規律|ㄍㄨㄟ ㄌㄩˋ|gui lv
策略|ㄘㄜˋ ㄌㄩㄝˋ|ce lve
圖書館|ㄊㄨˊ ㄕㄨ ㄍㄨㄢˇ|tu shu guan
博物館|ㄅㄛˊ ㄨˋ ㄍㄨㄢˇ|bo wu guan
動物園|ㄉㄨㄥˋ ㄨˋ ㄩㄢˊ|dong wu yuan
紅綠燈|ㄏㄨㄥˊ ㄌㄩˋ ㄉㄥ|hong lv deng
輸入法|ㄕㄨ ㄖㄨˋ ㄈㄚˇ|shu ru fa
羽毛球|ㄩˇ ㄇㄠˊ ㄑㄧㄡˊ|yu mao qiu
大自然|ㄉㄚˋ ㄗˋ ㄖㄢˊ|da zi ran
打招呼|ㄉㄚˇ ㄓㄠ ㄏㄨ|da zhao hu
電風扇|ㄉㄧㄢˋ ㄈㄥ ㄕㄢˋ|dian feng shan
輕聲細語|ㄑㄧㄥ ㄕㄥ ㄒㄧˋ ㄩˇ|qing sheng xi yu
四面八方|ㄙˋ ㄇㄧㄢˋ ㄅㄚ ㄈㄤ|si mian ba fang
五顏六色|ㄨˇ ㄧㄢˊ ㄌㄧㄡˋ ㄙㄜˋ|wu yan liu se
自由自在|ㄗˋ ㄧㄡˊ ㄗˋ ㄗㄞˋ|zi you zi zai
平平安安|ㄆㄧㄥˊ ㄆㄧㄥˊ ㄢ ㄢ|ping ping an an
`, 'w', 'word');

export const sentences = rows(`
今天早晨我們去公園散步|ㄐㄧㄣ ㄊㄧㄢ ㄗㄠˇ ㄔㄣˊ ㄨㄛˇ ˙ㄇㄣ ㄑㄩˋ ㄍㄨㄥ ㄩㄢˊ ㄙㄢˋ ㄅㄨˋ|jin tian zao chen wo men qu gong yuan san bu
明天我要去圖書館看書|ㄇㄧㄥˊ ㄊㄧㄢ ㄨㄛˇ ㄧㄠˋ ㄑㄩˋ ㄊㄨˊ ㄕㄨ ㄍㄨㄢˇ ㄎㄢˋ ㄕㄨ|ming tian wo yao qu tu shu guan kan shu
請幫我把門口的燈打開|ㄑㄧㄥˇ ㄅㄤ ㄨㄛˇ ㄅㄚˇ ㄇㄣˊ ㄎㄡˇ ˙ㄉㄜ ㄉㄥ ㄉㄚˇ ㄎㄞ|qing bang wo ba men kou de deng da kai
晚餐我想吃青菜配白飯|ㄨㄢˇ ㄘㄢ ㄨㄛˇ ㄒㄧㄤˇ ㄔ ㄑㄧㄥ ㄘㄞˋ ㄆㄟˋ ㄅㄞˊ ㄈㄢˋ|wan can wo xiang chi qing cai pei bai fan
外面下雨出門記得帶傘|ㄨㄞˋ ㄇㄧㄢˋ ㄒㄧㄚˋ ㄩˇ ㄔㄨ ㄇㄣˊ ㄐㄧˋ ˙ㄉㄜ ㄉㄞˋ ㄙㄢˇ|wai mian xia yu chu men ji de dai san
這本書的內容十分有趣|ㄓㄜˋ ㄅㄣˇ ㄕㄨ ˙ㄉㄜ ㄋㄟˋ ㄖㄨㄥˊ ㄕˊ ㄈㄣ ㄧㄡˇ ㄑㄩˋ|zhe ben shu de nei rong shi fen you qu
我的同學喜愛打羽毛球|ㄨㄛˇ ˙ㄉㄜ ㄊㄨㄥˊ ㄒㄩㄝˊ ㄒㄧˇ ㄞˋ ㄉㄚˇ ㄩˇ ㄇㄠˊ ㄑㄧㄡˊ|wo de tong xue xi ai da yu mao qiu
我們一起練習中文打字|ㄨㄛˇ ˙ㄇㄣ ㄧ ㄑㄧˇ ㄌㄧㄢˋ ㄒㄧˊ ㄓㄨㄥ ㄨㄣˊ ㄉㄚˇ ㄗˋ|wo men yi qi lian xi zhong wen da zi
請把這張白紙放在書桌上|ㄑㄧㄥˇ ㄅㄚˇ ㄓㄜˋ ㄓㄤ ㄅㄞˊ ㄓˇ ㄈㄤˋ ㄗㄞˋ ㄕㄨ ㄓㄨㄛ ㄕㄤˋ|qing ba zhe zhang bai zhi fang zai shu zhuo shang
今天的天空有很多白雲|ㄐㄧㄣ ㄊㄧㄢ ˙ㄉㄜ ㄊㄧㄢ ㄎㄨㄥ ㄧㄡˇ ㄏㄣˇ ㄉㄨㄛ ㄅㄞˊ ㄩㄣˊ|jin tian de tian kong you hen duo bai yun
我想買一杯冰的西瓜汁|ㄨㄛˇ ㄒㄧㄤˇ ㄇㄞˇ ㄧ ㄅㄟ ㄅㄧㄥ ˙ㄉㄜ ㄒㄧ ㄍㄨㄚ ㄓ|wo xiang mai yi bei bing de xi gua zhi
請問這班公車開往何處|ㄑㄧㄥˇ ㄨㄣˋ ㄓㄜˋ ㄅㄢ ㄍㄨㄥ ㄔㄜ ㄎㄞ ㄨㄤˇ ㄏㄜˊ ㄔㄨˋ|qing wen zhe ban gong che kai wang he chu
我把新的照片傳給同學|ㄨㄛˇ ㄅㄚˇ ㄒㄧㄣ ˙ㄉㄜ ㄓㄠˋ ㄆㄧㄢˋ ㄔㄨㄢˊ ㄍㄟˇ ㄊㄨㄥˊ ㄒㄩㄝˊ|wo ba xin de zhao pian chuan gei tong xue
早晨起床先刷牙再洗臉|ㄗㄠˇ ㄔㄣˊ ㄑㄧˇ ㄔㄨㄤˊ ㄒㄧㄢ ㄕㄨㄚ ㄧㄚˊ ㄗㄞˋ ㄒㄧˇ ㄌㄧㄢˇ|zao chen qi chuang xian shua ya zai xi lian
老師請同學打開國語課本|ㄌㄠˇ ㄕ ㄑㄧㄥˇ ㄊㄨㄥˊ ㄒㄩㄝˊ ㄉㄚˇ ㄎㄞ ㄍㄨㄛˊ ㄩˇ ㄎㄜˋ ㄅㄣˇ|lao shi qing tong xue da kai guo yu ke ben
我每天都會練習十分鐘|ㄨㄛˇ ㄇㄟˇ ㄊㄧㄢ ㄉㄡ ㄏㄨㄟˋ ㄌㄧㄢˋ ㄒㄧˊ ㄕˊ ㄈㄣ ㄓㄨㄥ|wo mei tian dou hui lian xi shi fen zhong
這條山路兩旁有很多樹|ㄓㄜˋ ㄊㄧㄠˊ ㄕㄢ ㄌㄨˋ ㄌㄧㄤˇ ㄆㄤˊ ㄧㄡˇ ㄏㄣˇ ㄉㄨㄛ ㄕㄨˋ|zhe tiao shan lu liang pang you hen duo shu
我們在海邊看美麗的晚霞|ㄨㄛˇ ˙ㄇㄣ ㄗㄞˋ ㄏㄞˇ ㄅㄧㄢ ㄎㄢˋ ㄇㄟˇ ㄌㄧˋ ˙ㄉㄜ ㄨㄢˇ ㄒㄧㄚˊ|wo men zai hai bian kan mei li de wan xia
今天下午我要整理房間|ㄐㄧㄣ ㄊㄧㄢ ㄒㄧㄚˋ ㄨˇ ㄨㄛˇ ㄧㄠˋ ㄓㄥˇ ㄌㄧˇ ㄈㄤˊ ㄐㄧㄢ|jin tian xia wu wo yao zheng li fang jian
請把手機的音量調小一點|ㄑㄧㄥˇ ㄅㄚˇ ㄕㄡˇ ㄐㄧ ˙ㄉㄜ ㄧㄣ ㄌㄧㄤˋ ㄊㄧㄠˊ ㄒㄧㄠˇ ㄧ ㄉㄧㄢˇ|qing ba shou ji de yin liang tiao xiao yi dian
我喜愛坐在窗邊聽音樂|ㄨㄛˇ ㄒㄧˇ ㄞˋ ㄗㄨㄛˋ ㄗㄞˋ ㄔㄨㄤ ㄅㄧㄢ ㄊㄧㄥ ㄧㄣ ㄩㄝˋ|wo xi ai zuo zai chuang bian ting yin yue
週末我們打算去動物園|ㄓㄡ ㄇㄛˋ ㄨㄛˇ ˙ㄇㄣ ㄉㄚˇ ㄙㄨㄢˋ ㄑㄩˋ ㄉㄨㄥˋ ㄨˋ ㄩㄢˊ|zhou mo wo men da suan qu dong wu yuan
這件綠色外套很適合你|ㄓㄜˋ ㄐㄧㄢˋ ㄌㄩˋ ㄙㄜˋ ㄨㄞˋ ㄊㄠˋ ㄏㄣˇ ㄕˋ ㄏㄜˊ ㄋㄧˇ|zhe jian lv se wai tao hen shi he ni
請先放鬆一下再繼續練習|ㄑㄧㄥˇ ㄒㄧㄢ ㄈㄤˋ ㄙㄨㄥ ㄧ ㄒㄧㄚˋ ㄗㄞˋ ㄐㄧˋ ㄒㄩˋ ㄌㄧㄢˋ ㄒㄧˊ|qing xian fang song yi xia zai ji xu lian xi
我想學會用拼音輸入中文|ㄨㄛˇ ㄒㄧㄤˇ ㄒㄩㄝˊ ㄏㄨㄟˋ ㄩㄥˋ ㄆㄧㄣ ㄧㄣ ㄕㄨ ㄖㄨˋ ㄓㄨㄥ ㄨㄣˊ|wo xiang xue hui yong pin yin shu ru zhong wen
今天夜晚的月亮又圓又亮|ㄐㄧㄣ ㄊㄧㄢ ㄧㄝˋ ㄨㄢˇ ˙ㄉㄜ ㄩㄝˋ ㄌㄧㄤˋ ㄧㄡˋ ㄩㄢˊ ㄧㄡˋ ㄌㄧㄤˋ|jin tian ye wan de yue liang you yuan you liang
我把雨衣掛在門口旁邊|ㄨㄛˇ ㄅㄚˇ ㄩˇ ㄧ ㄍㄨㄚˋ ㄗㄞˋ ㄇㄣˊ ㄎㄡˇ ㄆㄤˊ ㄅㄧㄢ|wo ba yu yi gua zai men kou pang bian
記得出門前帶上你的水壺|ㄐㄧˋ ˙ㄉㄜ ㄔㄨ ㄇㄣˊ ㄑㄧㄢˊ ㄉㄞˋ ㄕㄤˋ ㄋㄧˇ ˙ㄉㄜ ㄕㄨㄟˇ ㄏㄨˊ|ji de chu men qian dai shang ni de shui hu
這家店的麵包又香又好吃|ㄓㄜˋ ㄐㄧㄚ ㄉㄧㄢˋ ˙ㄉㄜ ㄇㄧㄢˋ ㄅㄠ ㄧㄡˋ ㄒㄧㄤ ㄧㄡˋ ㄏㄠˇ ㄔ|zhe jia dian de mian bao you xiang you hao chi
感謝你陪我一起練習打字|ㄍㄢˇ ㄒㄧㄝˋ ㄋㄧˇ ㄆㄟˊ ㄨㄛˇ ㄧ ㄑㄧˇ ㄌㄧㄢˋ ㄒㄧˊ ㄉㄚˇ ㄗˋ|gan xie ni pei wo yi qi lian xi da zi
`, 's', 'sentence');

/**
 * 第 1 區：只考實際鍵入片段；yuan／yun／weng 改考完整音節。
 * notation 是標準拼寫；pinyin 才是遊戲鍵位（ü 顯示為 ü，鍵入 v）。
 * ㄨㄥ 有聲母考 ong（東），零聲母考完整音節 weng（翁）。
 */
const phonicsSource = [
  ['initial','ㄅ','b','八'], ['initial','ㄆ','p','怕'],
  ['initial','ㄇ','m','米'], ['initial','ㄈ','f','風'],
  ['initial','ㄉ','d','大'], ['initial','ㄊ','t','天'],
  ['initial','ㄋ','n','你'], ['initial','ㄌ','l','來'],
  ['initial','ㄍ','g','哥'], ['initial','ㄎ','k','開'],
  ['initial','ㄏ','h','好'], ['initial','ㄐ','j','家'],
  ['initial','ㄑ','q','七'], ['initial','ㄒ','x','西'],
  ['initial','ㄓ','zh','知'], ['initial','ㄔ','ch','吃'],
  ['initial','ㄕ','sh','師'], ['initial','ㄖ','r','日'],
  ['initial','ㄗ','z','字'], ['initial','ㄘ','c','次'], ['initial','ㄙ','s','四'],
  ['final','ㄚ','a','阿'], ['final','ㄛ','o','喔'], ['final','ㄜ','e','餓'],
  ['final','ㄧ','i','一'], ['final','ㄨ','u','五'], ['final','ㄩ','ü','女'],
  ['final','ㄞ','ai','愛'], ['final','ㄟ','ei','杯'],
  ['final','ㄠ','ao','凹'], ['final','ㄡ','ou','歐'],
  ['final','ㄢ','an','安'], ['final','ㄣ','en','恩'],
  ['final','ㄤ','ang','昂'], ['final','ㄥ','eng','燈'],
  ['final','ㄨㄥ','ong','東'],
  ['final','ㄧㄚ','ia','家'], ['final','ㄧㄝ','ie','街'],
  ['final','ㄧㄠ','iao','小'], ['final','ㄧㄡ','iu','牛'],
  ['final','ㄧㄢ','ian','天'], ['final','ㄧㄣ','in','心'],
  ['final','ㄧㄤ','iang','香'], ['final','ㄧㄥ','ing','星'],
  ['final','ㄩㄥ','iong','熊'],
  ['final','ㄨㄚ','ua','花'], ['final','ㄨㄛ','uo','火'],
  ['final','ㄨㄞ','uai','快'], ['final','ㄨㄟ','ui','對'],
  ['final','ㄨㄢ','uan','短'], ['final','ㄨㄣ','un','春'],
  ['final','ㄨㄤ','uang','光'], ['final','ㄨㄥ','weng','翁'],
  ['final','ㄩㄝ','üe','略'], ['final','ㄩㄢ','yuan','元'], ['final','ㄩㄣ','yun','雲'],
  // 補齊基本注音符號中的 ㄝ、ㄦ；ㄝ 以複合韻 ㄧㄝ 中的發音示例。
  ['final','ㄝ','ê','街'], ['final','ㄦ','er','耳'],
];
export const phonics = phonicsSource.map(([mode, zhuyin, notation, exampleChar], i) => {
  const example = characters.find(q => q.text === exampleChar);
  if (!example) throw new Error(`缺少聲韻例字：${exampleChar}`);
  const wholeSyllable = ['yuan', 'yun', 'weng'].includes(notation);
  const exampleNote = notation === 'ü' ? 'nv／lv 中的 v' : wholeSyllable ? '完整音節' : '片段鍵位';
  return {
    id: `p${String(i + 1).padStart(3, '0')}`, kind: 'phonics', mode,
    text: exampleChar, symbol: zhuyin, zhuyin, notation,
    prompt: `${zhuyin}（${exampleChar}・${exampleNote}）`, wholeSyllable, exampleNote, pinyin: notation.replaceAll('ü', 'v').replace('ê', 'e'),
    attached: notation === 'ong', exampleId: example.id,
    example: {text: example.text, zhuyin: example.zhuyin, pinyin: example.pinyin},
  };
});

const characterId = new Map(characters.map(q => [q.text, q.id]));
function charPool(text) {
  return [...text].map(char => {
    const id = characterId.get(char);
    if (!id) throw new Error(`題池引用了未建單字：${char}`);
    return id;
  });
}

// 第 3 區八組，皆為獨立的教學題池；跨組可引用同一題，不另製重複題目。
export const soundGroups = [
  {id:'retroflex', title:'zh／ch／sh 與 z／c／s',
    rule:'捲舌聲母多一個 h；ㄓㄔㄕㄗㄘㄙ 單獨成字時仍要加 i。',
    commonMistake:'把 zhi 打成 zi，或把 chi 打成 ch。',
    exampleTexts:['知','字','吃','次'],
    pool:charPool('知紙竹主站中吃車窗船春書師十水山字早左走草菜次四思私')},
  {id:'n-l', title:'n 與 l',
    rule:'ㄋ 對應 n，ㄌ 對應 l；先看注音再連打韻母。',
    commonMistake:'把 ni 打成 li，或把 nv 打成 lv。',
    exampleTexts:['你','泥','來','綠'],
    pool:charPool('你年鳥牛南男能內腦泥農怒女暖拿來老冷藍林零臉六路綠略')},
  {id:'an-ang', title:'an 與 ang',
    rule:'ㄢ 結尾 an；ㄤ 結尾 ang，多一個 g。',
    commonMistake:'把山 shan 打成 shang。',
    exampleTexts:['山','上','南','羊'],
    pool:charPool('安昂單當山上南男藍滿慢方房光黃張章昌常三傘嗓倉蒼羊')},
  {id:'en-eng', title:'en 與 eng',
    rule:'ㄣ 結尾 en；ㄥ 結尾 eng，多一個 g。',
    commonMistake:'把根 gen 打成 geng。',
    exampleTexts:['分','風','真','正'],
    pool:charPool('分風根耕很橫真正深生人仁門萌奔崩盆烹肯坑塵城陳成')},
  {id:'in-ing', title:'in 與 ing',
    rule:'ㄧㄣ 結尾 in；ㄧㄥ 結尾 ing，多一個 g。',
    commonMistake:'把心 xin 打成 xing。',
    exampleTexts:['心','星','金','京'],
    pool:charPool('心新信星形醒金今近進京井景林鄰零鈴親琴青清晴請賓兵拼品民名您寧')},
  {id:'umlaut', title:'ü 與 v 的鍵位',
    rule:'ü 有三種打法：n/l 後打 v（女 nv、綠 lv、虐 nve、略 lve）；j/q/x 後打 u（去 qu、學 xue、卷 juan、群 qun）；單獨成音節寫 yu／yue／yuan／yun。',
    commonMistake:'把女打成 nu，或把去打成 qv。',
    exampleTexts:['女','略','去','月'],
    pool:charPool('女綠略旅律句居軍君去取群裙需許雪學魚雨玉月約元圓遠雲運')},
  {id:'contractions', title:'iu／ui／un 縮寫',
    rule:'有聲母時 iou → iu、uei → ui、uen → un；零聲母用 you／wei／wen。',
    commonMistake:'把牛打成 niou，或把對打成 duei。',
    exampleTexts:['牛','對','春','輪'],
    pool:charPool('牛六柳九久球秋休修對堆推退貴龜回水睡吹追春純村存孫吞盾輪')},
  {id:'y-w', title:'y 與 w 開頭',
    rule:'沒有聲母的 ㄧ／ㄨ／ㄩ 音節用 y／w／yu 開頭；ㄧㄣ → yin、ㄧㄥ → ying、ㄨㄣ → wen。',
    commonMistake:'把一打成 i、五打成 u，或把雲打成 yvn。',
    exampleTexts:['一','五','魚','文'],
    pool:charPool('一衣以已也夜頁牙鴨有友油眼言煙羊陽因音銀英影五午屋我外晚碗灣王網為文聞翁魚雨玉月約元圓遠雲運用永')},
];

// 以下每關都是明確 ID 題池。maxSimultaneous 不超過題池的不同首字母數。
const ids = list => list.map(q => q.id);
function stage(id, region, title, pool, maxSimultaneous, extra = {}) {
  return {id, region, title, pool, maxSimultaneous, kind:'battle', ...extra};
}
const characterStages = [
  stage('r2-1',2,'常用字起步',charPool('八白包杯筆怕跑皮米木美風飛大地天田土你牛來老哥高開口好花家七西中書手人字草四一五我魚雨'),1),
  stage('r2-2',2,'生活與自然',charPool('冰布片平坡門毛面明每滿慢房東冬短多對她臺太甜鐵圖兔頭年鳥南男腦冷藍林臉路光工古果國火海河黑紅黃回'),2),
  stage('r2-3',2,'拼讀熟練',charPool('心新星先香想雪學前錢青清晴請球秋橋春車窗床船水山上十日熱早左走在再菜三色送衣也夜牙有眼羊因音英影午屋外晚王文月元圓雲'),3),
  stage('r2-4',2,'常用字總練習',ids(characters),4),
  stage('r2-boss',2,'森林守關者',ids(characters),1,{kind:'boss', reviewPriority:true,
    priorityPool:charPool('女綠略學去月雲牛對春知吃師日字次四心星') }),
];
const wordStages = [
  stage('r4-1',4,'日常雙字詞',ids(words.filter(q=>[...q.text].length===2).slice(0,60)),3),
  stage('r4-2',4,'校園與生活',ids(words.filter(q=>[...q.text].length===2).slice(60,120)),4),
  stage('r4-3',4,'長詞連打',ids(words.filter(q=>[...q.text].length>=3)),4),
  stage('r4-4',4,'山道總練習',ids(words),5),
  stage('r4-boss',4,'山道守關者',ids(words),1,{kind:'boss', reviewPriority:true,
    priorityPool:ids(words.filter(q=>/[v]/u.test(q.pinyin)||[...q.text].length>=3))}),
].map(q=>({...q, questionsPerMonster:q.kind==='boss'?1:2, movementScale:0.7}));

export const stages = [
  stage('r1-1',1,'聲母 b p m f d t n l',ids(phonics.slice(0,8)),1,{showPinyin:true}),
  stage('r1-2',1,'聲母 g k h j q x',ids(phonics.slice(8,14)),2,{showPinyin:true}),
  stage('r1-3',1,'聲母 zh ch sh r z c s',ids(phonics.slice(14,21)),3),
  stage('r1-4',1,'單韻與複韻 a 至 ou',ids(phonics.slice(21,31)),2),
  stage('r1-5',1,'鼻韻 an en ang eng ong，補充 ㄝ／ㄦ',ids([...phonics.slice(31,36),...phonics.slice(-2)]),3),
  stage('r1-6',1,'結合韻與完整音節',ids(phonics.slice(36,-2)),3),
  stage('r1-boss',1,'草原守關者',ids(phonics),1,{kind:'boss',reviewPriority:true,
    priorityPool:ids(phonics.filter(q=>['zh','ch','sh','ü','iu','ui','un','weng','üe','yuan','yun'].includes(q.notation)))}),
  ...characterStages,
  ...soundGroups.map((group,i)=>stage(`r3-${i+1}`,3,group.title,group.pool,
    [3,2,3,3,4,4,4,2][i],{soundGroup:group.id})),
  stage('r3-boss',3,'沼澤守關者',[...new Set(soundGroups.flatMap(g=>g.pool))],1,
    {kind:'boss',reviewPriority:true,priorityPool:charPool('女綠略去學元雲牛對春一五魚月因英文為知字吃次心星')}),
  ...wordStages,
  stage('r5-1',5,'日常咒語',ids(sentences.slice(0,10)),1,{kind:'ime-duel'}),
  stage('r5-2',5,'生活咒語',ids(sentences.slice(10,20)),1,{kind:'ime-duel'}),
  stage('r5-3',5,'熟練咒語',ids(sentences.slice(20,30)),1,{kind:'ime-duel'}),
  stage('r5-boss',5,'神殿守關者',ids(sentences),1,{kind:'ime-boss',reviewPriority:true,
    priorityPool:ids(sentences.filter(q=>q.pinyin.includes('v')||[...q.text].length>=12))}),
];

export const regions = [
  {id:1,title:'聲韻草原',questionKind:'phonics'},
  {id:2,title:'單字森林',questionKind:'character'},
  {id:3,title:'迷音沼澤',questionKind:'character'},
  {id:4,title:'詞語山道',questionKind:'word'},
  {id:5,title:'咒語神殿',questionKind:'sentence'},
].map(region=>({...region,stageIds:stages.filter(s=>s.region===region.id).map(s=>s.id)}));

export const questionBank = [...phonics,...characters,...words,...sentences];
export const questionsById = Object.fromEntries(questionBank.map(q=>[q.id,q]));
export const reviewStage = {
  id:'review',title:'複習關',pool:ids(questionBank.filter(q=>q.kind!=='sentence')),
  kind:'battle',maxSimultaneous:3,reviewOnly:true,
  // 動態題池只剩一種開頭時必須降為 1 隻；同開頭可依最靠近城門者鎖定。
  adaptiveSimultaneous:true,
};

// 527 筆單字／詞語逐筆比對官方公開資料的注音及去調拼音；
// 其餘 12 詞與 30 句以人工判讀上下文，並核對 340 個逐字候選讀音。
// 核對方法與範圍見 STEP1.md；不複製辭典的釋義、例句或音訊。
export const references = [
  {title:'教育部《國語辭典簡編本》公開文字資料（2014_20260929）',
    url:'https://language.moe.gov.tw/001/Upload/Files/site_content/M0001/respub/download/dict_concised_2014_20260929.zip'},
  {title:'教育部：漢語拼音與通用拼音對照表',url:'https://ws.moe.edu.tw/001/Upload/FileUpload/3692-16962/Documents/970918duizhao.pdf'},
  {title:'教育部簡編本：略',url:'https://dict.concised.moe.edu.tw/dictView.jsp?ID=15806&la=0&powerMode=0'},
  {title:'教育部簡編本：綠',url:'https://dict.concised.moe.edu.tw/dictView.jsp?ID=15762&la=0&powerMode=0'},
  {title:'教育部重編本：女',url:'https://dict.revised.moe.edu.tw/dictView.jsp?ID=3170&la=0&powerMode=0'},
];
