# 第一步：題庫完成記錄

本次只完成 `data.js`、`selftest.mjs` 與本記錄，未修改 `attempt1/`，未建立遊戲介面。本次產出與暫存檔均在本資料夾內；未使用 git、安裝套件或部署。

## 題量

| 地區 | 已建立題數 | TASK.md 下限／覆蓋 |
| --- | ---: | --- |
| 1 聲韻草原 | 58 題：21 聲母＋37 韻母 | 全部 21 聲母、指定 35 個韻母／結合韻，另補 ㄝ、ㄦ；基本 37 個注音符號全涵蓋 |
| 2 單字森林 | 345 個不重複單字 | 至少 150 字 |
| 3 迷音沼澤 | 8 組、235 個分組題位，引用 211 個不重複單字 | 每組至少 20 題 |
| 4 詞語山道 | 194 個不重複詞：178 個二字詞、11 個三字詞、5 個四字詞 | 至少 150 詞、每詞 2～4 字 |
| 5 咒語神殿 | 30 句、311 個逐字注音及拼音 | 至少 30 句、每句 8～20 字 |

第 3 區依序為：zh/ch/sh 與 z/c/s **26** 題、n/l **26** 題、an/ang **25** 題、en/eng **24** 題、in/ing **31** 題、ü 規則 **27** 題、iu/ui/un **28** 題、y/w **48** 題。各組含規則、常見錯誤與 2～4 個例子；檢查器會驗證組內每題確實符合該組音型，而且各個對比類型至少有 3 題。

實際題目共 627 筆；第 3 區引用單字表，不建立重複資料。每組、每關題池內不重複；跨區／跨組重用題目 ID 是為了分階段教學。第 1 區的 ㄜ／ㄝ 分別示範 e／ê（鍵位皆 e），ㄨㄥ 分別示範 ong／ueng，題目符號與例字組合互異。

## 資料介面與之後的內嵌方式

`data.js` 為 ES module，沒有外部 import、套件、DOM、儲存或網路操作；題庫初始化僅組合資料。未生成答案來填補題庫：原始字／詞／句的注音與逐字拼音皆分別列出，再用轉換函式交叉檢查。

- `characters`、`words`、`sentences`：每筆含 `id`、`kind`、`text`（國字）、`zhuyin`（空白分節）、`pinyin`（整題連打）及 `units`（逐字 `{ text, zhuyin, pinyin }`）。
- `phonics`：聲韻片段題；含國字 `text`、符號 `symbol`、完整顯示用 `prompt`、片段 `zhuyin`、`notation`（標準拼寫）、`pinyin`（片段鍵位）、`mode`、`attached`，以及例字的 `exampleId` 與完整 `example`。例字拼音與片段答案用途不同。
- `questionBank`、`questionsById`：627 筆正規題目與 ID 索引。
- `soundGroups`：第 3 區八個獨立專項題池與教學文字。
- `stages`、`regions`：五區共 30 個關卡節點（含 5 個王關），每關都有 `pool` 和 `maxSimultaneous`。普通關完整覆蓋各區題庫；王關另有 `priorityPool` 與 `reviewPriority`。
- 第 4 區普通怪 `questionsPerMonster: 2`、`movementScale: 0.7`，供下一步接入較厚、較慢的行為。第 5 區使用 `ime-duel`／`ime-boss` 題型，固定同場 1 隻。
- `reviewStage`：597 筆非句子候選題、同場上限 3；`reviewOnly` 與 `adaptiveSimultaneous` 表示之後實際依錯題清單篩選，並把同場上限降至實際題池的不同首字母數（空錯題池應顯示尚無錯題）。
- `references`：核對讀音與拼音規則的來源網址。

`zhuyinToPinyin(input, options)` 處理單節注音；`readingToPinyin(reading)` 處理空白分節的詞句。預設是完整音節；聲韻片段須明確指定模式：

```js
zhuyinToPinyin('ㄓ');                              // zhi
zhuyinToPinyin('ㄓ', { mode: 'initial' });         // zh
zhuyinToPinyin('ㄧ');                              // yi
zhuyinToPinyin('ㄧ', { mode: 'final' });           // i
zhuyinToPinyin('ㄨㄥ', { mode: 'final' });         // ueng
zhuyinToPinyin('ㄨㄥ', { mode: 'final', attached: true }); // ong
readingToPinyin('ㄋㄩˇ ㄌㄩˋ ㄌㄩㄝˋ');           // nvlvlve
readingToPinyin('ㄑㄩˋ ㄒㄩㄝˊ ㄩㄢˊ ㄩㄣˊ');    // quxueyuanyun
```

輸入法鍵位只使用 a–z；n/l 後的 ü 打 v，j/q/x/y 後打 u。零聲母的 y/w、iu/ui/un 縮寫、zhi/chi/shi/ri/zi/ci/si 皆有獨立案例。片段 üan／ün 為 van／vn，完整音節則依實際聲母轉成 yuan／yun、juan／jun 等。注音保留詞典本調，不記「一」等字的口語連讀變調；輕聲點前置。轉換函式會拒絕不合法符號、聲調位置及聲韻組合；不處理兒化合音或罕見方音。

下一步可將 `data.js` 原文放入 `index.html` 的內嵌 `<script type="module">`，在同一 module 中接遊戲程式。此步 selftest 明確讀 `data.js`，不讀舊版 `attempt1/index.html`；最終單檔交付時再改為抽取內嵌模組，保留相同檢查。

## 讀音核對

以教育部《國語辭典簡編本》公開文字資料 **2014_20260929** 為主。從[教育部官方下載頁](https://language.moe.gov.tw/001/Upload/Files/site_content/M0001/respub/dict_concised_download.html)下載文字 ZIP，只在本資料夾暫存，以標準函式庫讀取 XLSX 內的「字詞名／注音一式／變體注音／漢語拼音」欄，核對後刪除暫存資料。教育部資料來源採「創用 CC－姓名標示－禁止改作 3.0 臺灣」授權；本題庫自寫詞句，未使用辭典釋義、例句或影音。

345 單字＋194 詞，共 539 筆中，**527 筆**有相同完整詞目，注音符合其主要或變體讀音，去調拼音也相符，差異 **0**。其餘 **12 詞**沒有完全相同詞目：你好、大海、草地、方形、紅茶、國語、中文、聲母、門口、輸入法、輕聲細語、平平安安。這些詞以人工判讀上下文，再核對教育部單字讀音候選；加上 30 句，共核對 **340 個逐字候選**，注音／去調拼音差異 **0**。句子是原創練習句，這項核對不等於官方整句斷詞認證。

校對時將單字「台」改為教育部正字「臺」（ㄊㄞˊ），並使用「臺灣／陽臺」；排除 TASK 點名的垃圾、企、液、期、和，以及辨識出的微、夕、息、髮等兩岸異讀。也以友人、星光、窗簾、衣物、眼神、耳環、早晨、夜晚等詞替代常見輕聲變體，降低教學歧義。多音字依題目所附注音指定常用讀音；詞句逐字讀音獨立保存，不盲目套用單字表。

拼音規則另參照[教育部漢語拼音與通用拼音對照表](https://ws.moe.edu.tw/001/Upload/FileUpload/3692-16962/Documents/970918duizhao.pdf)；女、綠、略的讀音另查教育部辭典，來源亦列於 `data.js`。

## 自我檢查

執行環境：Node v26.13.0；執行檔 `/opt/homebrew/bin/node`。不需要任何套件，也不需要網路。

```sh
/opt/homebrew/bin/node selftest.mjs
# 或把 /opt/homebrew/bin 加入 PATH 後執行 node selftest.mjs
```

檢查全部題目與逐字答案、a–z 格式、ID／題目／題池重複、字數與音節對位、每區題量、所有聲韻覆蓋、八組專項題型、每區普通關完整覆蓋、王關優先池與每關首字母互異的實際可行組合；另有 101 個獨立規則案例、非法輸入及故意損壞資料的反例，確認檢查器會報錯。n/l、y/w 同場均設為 2，避免只看總題數卻無法構造不同首字母組合。

最初執行發現兩項檢查失敗：ㄜ／ㄝ 兩種不同片段被重複判定規則誤合併，以及 an/ang 教學例字「羊」未列入該池；均已修正並反覆重跑。以下為最終實際輸出（stdout；stderr 為空），**結束狀態 0**：

```text
拼音守城・第一步題庫自我檢查
第 1 區：58 題（聲母 21、韻母 37；含 ㄝ／ㄦ 補充）
第 2 區：345 個不重複單字
第 3 區：8 組，235 個分組題位，211 個不重複單字
  zh／ch／sh 與 z／c／s：26 題
  n 與 l：26 題
  an 與 ang：25 題
  en 與 eng：24 題
  in 與 ing：31 題
  ü 與 v 的鍵位：27 題
  iu／ui／un 縮寫：28 題
  y 與 w 開頭：48 題
第 4 區：194 個不重複詞（2 字詞 178、3 字詞 11、4 字詞 5）
第 5 區：30 句，311 個逐字注音／拼音（每句 8～20 字）
獨立規則案例：101；非法輸入案例：19＋8 個聲韻片段；資料損壞反例：5；同場數反例：1
全部 30 小關（含 5 王關）與複習關的題池／同場數：
  r1-1｜聲母 b p m f d t n l｜8 題｜同場 1｜首字母 bdflmnpt
  r1-2｜聲母 g k h j q x｜6 題｜同場 2｜首字母 ghjkqx
  r1-3｜聲母 zh ch sh r z c s｜7 題｜同場 3｜首字母 crsz
  r1-4｜單韻與複韻 a 至 ou｜10 題｜同場 2｜首字母 aeiouv
  r1-5｜鼻韻 an en ang eng ong，補充 ㄝ／ㄦ｜7 題｜同場 3｜首字母 aeo
  r1-6｜結合韻 ia 至 ün｜20 題｜同場 3｜首字母 iuv
  r1-boss｜草原守關者｜58 題｜同場 1｜首字母 abcdefghijklmnopqrstuvxz
  r2-1｜常用字起步｜43 題｜同場 1｜首字母 bcdfghjklmnpqrstwxyz
  r2-2｜生活與自然｜48 題｜同場 2｜首字母 bdfghlmnpt
  r2-3｜拼讀熟練｜58 題｜同場 3｜首字母 cqrswxyz
  r2-4｜常用字總練習｜345 題｜同場 4｜首字母 abcdefghjklmnopqrstwxyz
  r2-boss｜森林守關者｜345 題｜同場 1｜首字母 abcdefghjklmnopqrstwxyz
  r3-1｜zh／ch／sh 與 z／c／s｜26 題｜同場 3｜首字母 csz
  r3-2｜n 與 l｜26 題｜同場 2｜首字母 ln
  r3-3｜an 與 ang｜25 題｜同場 3｜首字母 acdfghlmnsyz
  r3-4｜en 與 eng｜24 題｜同場 3｜首字母 bcfghkmprsz
  r3-5｜in 與 ing｜31 題｜同場 4｜首字母 bjlmnpqx
  r3-6｜ü 與 v 的鍵位｜27 題｜同場 4｜首字母 jlnqxy
  r3-7｜iu／ui／un 縮寫｜28 題｜同場 4｜首字母 cdghjlnqstxz
  r3-8｜y 與 w 開頭｜48 題｜同場 2｜首字母 wy
  r3-boss｜沼澤守關者｜211 題｜同場 1｜首字母 abcdfghjklmnpqrstwxyz
  r4-1｜日常雙字詞｜60 題｜同場 3｜首字母 bcdfghjlmnpqstwxyz
  r4-2｜校園與生活｜60 題｜同場 4｜首字母 bcdefghjklmpqrstwxyz
  r4-3｜長詞連打｜16 題｜同場 4｜首字母 bdhpqstwyz
  r4-4｜山道總練習｜194 題｜同場 5｜首字母 abcdefghjklmnpqrstwxyz
  r4-boss｜山道守關者｜194 題｜同場 1｜首字母 abcdefghjklmnpqrstwxyz
  r5-1｜日常咒語｜10 題｜同場 1｜首字母 jmqwz
  r5-2｜生活咒語｜10 題｜同場 1｜首字母 jlqwz
  r5-3｜熟練咒語｜10 題｜同場 1｜首字母 gjqwz
  r5-boss｜神殿守關者｜30 題｜同場 1｜首字母 gjlmqwz
  review｜複習關｜597 題候選｜同場上限 3（實際依錯題首字母數降低）
全部通過（7137 項檢查）；結束狀態 0
```
