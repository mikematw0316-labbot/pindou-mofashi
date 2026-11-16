# 第二步完成報告：《拼音守城》完整遊戲

完成日期：2026-11-16。遊戲入口為 [index.html](index.html)，可直接離線雙擊開啟；CSS、JavaScript、題庫與原創 SVG 全部內嵌，沒有外部函式庫、字型、圖片或音檔載入。

## 檔案與行數

| 檔案 | 行數 | 用途 |
| --- | ---: | --- |
| index.html | 2214 | 完整單檔遊戲，含全部題庫 |
| data.js | 863 | 保留第一步原始題庫，未修改、未刪減 |
| selftest.mjs | 282 | 改為從 index.html 的題庫標記抽出模組後驗證 |
| browser-smoke.mjs | 325 | 無套件 Chrome DevTools Protocol 瀏覽器實測程式 |
| selftest-output.txt | 48 | 完整題庫檢查輸出 |
| browser-test-output.txt | 45 | 瀏覽器實測輸出 |
| REPORT.md | 139 | 本報告 |

另有 shots/ 內 13 張 PNG 截圖。原有 TASK.md、STEP1.md 與 attempt1/ 未修改；未使用 git、未部署、未安裝套件。Chrome 測試 profile 建在本資料夾，結束後已移除。

## 題量與保留驗證

| 地區 | 題數 | 關卡數（含王） |
| --- | --- | ---: |
| 1 聲韻草原 | 58：21 聲母＋37 韻母 | 7 |
| 2 單字森林 | 345 個不重複單字 | 5 |
| 3 迷音沼澤 | 8 組、235 個分組題位，引用 211 個不重複單字 | 9 |
| 4 詞語山道 | 194 個詞：178 雙字、11 三字、5 四字 | 5 |
| 5 咒語神殿 | 30 句、311 個逐字答案 | 4 |

共 627 筆正規題目、30 個關卡。第 3 區為引用既有單字，並未重複建立資料。程式逐字比對內嵌題庫來源與原始 data.js，內容完全一致；既有注音轉換函式、逐字讀音、專項題池、王關優先池與參考來源都完整保留。

## 已實作玩法

- 橫向戰場：右方出怪、左方城門與術士。首字母鎖定最靠近城門的符合目標；正確字母亮起、命中擊退、完整作答擊倒。Backspace／Esc 解除鎖定，未鎖定時 Esc 開暫停選單。
- 錯誤立即亮出正確拼音 1.5 秒、怪物前衝、記錄錯題與斷連擊；Tab 偷看消耗次數，本次不累積連擊。每 5 連擊增加 0.5 倍，最高 3 倍。
- 依關卡提高移速、縮短出怪間隔並增加同場數；同場首字母盡量互異。兩排題卡與同排間距避免五隻怪互相遮字；山道怪移動較慢、需連打兩題。
- 城門血量、怪物碰城扣血、零血失敗、重來；每區王三段血條、優先易錯與個人錯題，打錯回少量血並加速蓄力。
- 五區地圖依序解鎖，顯示每關星等與最佳速度；每關教學卡、2–4 例題與常見錯誤，第一區附完整對照表。
- 第五區獨立中文輸入法對決：compositionstart／update／end、isComposing／229 防誤判、結束組字後的 Enter 保護；NFKC 正規化、忽略標點與空白。用編輯距離逐字對齊，標出錯字、漏字及多字；80% 以上可造成傷害，全對傷害較高，並計算中文字／分鐘。王在組字時仍蓄力，暫停則停止。
- 教學包含 macOS／Windows 拼音輸入法新增、切換、繁體輸出與選字說明。遊戲無法代替使用者安裝輸入法或判斷所用輸入法種類。
- 結算含星等、正確率、完成題字母／中文字速度、最長連擊、得分、最常打錯 3 題與正解，以及上次速度和正確率比較。
- 複習清單保留錯誤次數；合適的後續題池優先再出錯題。完整正確答對三次標為熟練。另有動態降低同場數的拼音複習關，以及中文咒語複習關。
- 金幣小店：城門血量、偷看次數、每關一次連擊保護。星等、最佳／上次成績、金幣、升級、錯題、音效及色彩設定存 localStorage，全部讀寫有 try/catch；失敗時提供可玩的暫存模式。
- 重設進度有兩次明確確認；暫停可繼續／重來／回地圖，視窗失焦與分頁隱藏自動暫停。一般戰偵測中文組字會暫停並提示切英文。
- 原創五區 SVG 怪物與加大王造型、WebAudio 合成音效（預設開）、命中／擊倒／受傷／連擊動畫、系統深淺色與手動選擇、reduced-motion、鍵盤選單與可見焦點。360px 地圖不溢出並顯示鍵盤遊玩說明。

可調星等、血量、倍率與提示時間集中在 index.html 的 CONFIG；遊戲以 requestAnimationFrame 和 delta time 更新，暫停不計入有效遊玩時間。

## 檢查指令與結果

環境：Node v26.13.0（/opt/homebrew/bin/node）、Google Chrome 157.0.8103.52。未安裝 Playwright；使用本機 Chrome headless 加 Node 內建 WebSocket／DevTools Protocol，沒有下載瀏覽器或套件。

```sh
PATH=/opt/homebrew/bin:$PATH node selftest.mjs
PATH=/opt/homebrew/bin:$PATH node browser-smoke.mjs
```

已將 index.html 的完整內嵌 module 抽出到本資料夾暫存 .syntax-check.mjs，執行 `node --check .syntax-check.mjs`，結束狀態 **0**、stdout/stderr 空白；暫存檔已刪除。browser-smoke.mjs 的 `node --check` 也為 0。另靜態確認沒有外部 script／link／img 資源標籤。

selftest 完整 stdout 如下，stderr 空白，結束狀態 **0**：

```text
拼音守城・單檔內嵌題庫自我檢查
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

## Chrome 實測範圍

[完整瀏覽器結果](browser-test-output.txt)：**44 項 PASS，0 console error、0 runtime exception，結束狀態 0**。

1. 直接以 file:// 載入 index.html。從乾淨存檔開始，開啟教學並按 Enter；以 DevTools 的實際 keyDown／keyUp 事件、自題目判讀答案、正常時間打完第一區第一關的 12 波，得到三星、100% 正確率、12 最長連擊。驗證存檔、第二關依序解鎖與重新載入保留。
2. 後續分支使用測試 fixture 解鎖各關，避免把逐關人工作答誤稱已驗證。開啟全部 30 關的教學卡；檢查錯誤揭答、Tab 消耗、複習清單與複習關入口、暫停位置不動、失焦與 composition 自動暫停。另在先前分支測試實際驗證首字母鎖定、逐字亮起與 Backspace 解除。
3. 購買小店全部三項升級並核對扣款、125 血量、連擊保護消耗與王打錯回血；逐題打完第一區王關。驗證第四區第一題完成仍存活、後期同場五怪及題目卡矩形無遮疊。
4. 第五區用合成 composition 事件與中文填入檢查組字時 Enter／Esc 不施放、不判錯、不暫停；檢查錯字、漏字對齊與標點／全形空白忽略，實際施放到通關並核對中文字速度結算。
5. 耐久分支僅在測試頁面替換 rAF 排程、加速模擬時間，未改動遊戲資料或內部狀態：確認無輸入時怪物碰城、城門零血失敗、零星與上次成績比較；確認第五區王在組字期間蓄滿力後扣 22 血，暫停時蓄力固定。第一關正常通關基準沒有使用加速。
6. 360×800 無水平溢出，1280×720 主介面實際截圖；模擬深色與 reduced-motion；封鎖 Storage 讀寫後仍可開圖及開戰；音效開關重新載入保留；重設兩次確認之前不清除，最後確認後進度確實歸零。

截圖：

- [01 地圖](shots/01-map.png)、[02 教學](shots/02-teaching.png)、[03 第一關戰場](shots/03-first-battle.png)、[04 第一關三星結算](shots/04-first-clear.png)
- [05 小店](shots/05-shop.png)、[06 三段王](shots/06-boss.png)、[07 厚血詞語怪](shots/07-word-battle.png)
- [08 中文逐字標錯](shots/08-ime-correction.png)、[09 咒語結算](shots/09-ime-clear.png)
- [10 窄螢幕](shots/10-mobile.png)、[11 深色](shots/11-dark-map.png)、[12 五怪同場](shots/12-five-enemies.png)、[13 城門失敗](shots/13-defeat.png)

已實際打開檢視地圖、第一關戰場與結算、中文標錯、五怪同場及手機截圖。

## 已知限制與未驗證事項

- headless 不提供實際 macOS／Windows 輸入法候選視窗。本次驗證的是 composition 事件時序、中文比對與快捷鍵防護；**未聲稱實際操作系統拼音選字通關**。真正的候選選字與各版本設定路徑仍需在使用者的電腦手動確認，教學已提示名稱可能因版本而異。
- 只實測本機 Chrome；未實測 Safari／Firefox，也沒有用真人逐一打完全部 30 關或長時間評估所有關卡平衡。各關共用引擎，全部教學與既有題池均通過檢查；已完整打完的代表關卡與其他分支如上列出。
- 音效開關與儲存、WebAudio 執行無錯誤已驗證，未以真人聽覺評估合成音效。reduced-motion 會縮短回饋動畫；必要的怪物移動仍保留，以維持玩法。
- 360px 可瀏覽地圖、教學與選單；遊玩仍以實體鍵盤為設計目標。部分較長教學及結算內容採垂直捲動。
- file:// 的 localStorage 是否可用、搬移檔案後的存檔範圍由瀏覽器決定。無法儲存時明確顯示暫存提示，遊戲仍能進行。
- 本步沒有新增或更動讀音資料，沒有新增待核對讀音；既有 12 個無完整官方詞目的詞與自寫句子的校對範圍，仍以 STEP1.md 的說明為準。

## 11/16 修正

- 第 1 區 ㄩ 維持 v、例字「女」，題卡與教學例題加註「nv／lv 中的 v」；ㄩㄝ 維持 ve、例字「略」。
- ㄩㄢ 由 van 改考完整音節 yuan（元）；ㄩㄣ 由 vn 改考完整音節 yun（雲）。
- ㄩㄥ 維持 iong，例字由「永」改為帶聲母的「熊」（xiong）；補入熊的完整讀音資料，既有題目 ID 保留。
- ㄨㄥ 的零聲母題由 ueng 改考完整音節 weng（翁）；帶聲母的 ong（東）維持原題。
- ui 的例字由「水」改為「對」（dui）；檢查其餘結合韻例字：ia 家、ie 街、iao 小、iu 牛、ian 天、in 心、iang 香、ing 星、ua 花、uo 火、uai 快、uan 短、un 春、uang 光，均帶聲母且拼音含指定片段。
- 教學卡、題卡與對照表同步區分片段及完整音節，說明 ü 的三種打法：n/l 後打 v；j q x 後打 u；單獨成音節寫 yu/yue/yuan/yun。更新結合韻關卡名稱與王關優先題池。
- data.js 與 index.html 內嵌題庫同步；selftest.mjs 增加一致性、完整音節答案、題卡標註及結合韻例字檢查，禁止第 1 區出現 van、vn、ueng 答案。
- 驗證：`node selftest.mjs` 通過全部 7155 項檢查；`node browser-smoke.mjs` 通過，兩者結束狀態皆為 0，瀏覽器 console error／runtime exception 為 0。（本機以 `/opt/homebrew/bin` 加入 PATH 執行。）
