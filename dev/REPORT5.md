# TASK5 完成報告：《拼鬥魔法師》繪本美術與介面精緻化

日期：2026-11-17（Asia/Taipei）。本次只在專案內修改，沒有 git、沒有部署、沒有安裝套件。開始時已將原 index.html 完整備份為 v4.html；題庫、data.js 與玩法判定保持不變。

## 美術與素材

使用內建 image_gen，先完成魔法師、芽獸與草原城門的風格基準，再製作獨立素材。共呼叫 38 次，33 次成功（32 個正式素材＋1 張風格基準），5 次生成未成功後重試。全部素材為本次生成，沒有使用網路圖庫或模仿指定作品；沒有使用 CLI/API 圖片生成。

統一方向是左上暖陽、乾筆粉彩／gouache 的手繪繪本，青綠、鼠尾草綠、奶油白與赭金。沼澤加紫藍，山道加岩土橘，神殿加象牙金。人物與怪物都是獨立透明素材；圖片內容沒有用程式重畫，只做保留 alpha 的透明邊界裁切、縮圖、WebP 編碼與總覽拼版。

素材包含魔法師待機／施法、五區直式背景、每區一般／快速／厚血／王各一隻、城門完好／受損、五區旅程圖、標誌字與 App 圖示。apple-touch-icon.png 由同一 App 圖示輸出 180×180；favicon 使用 app-icon.webp。總覽見 assets/_overview.webp，生成提示紀錄見 assets/PROMPTS5.md。

每張成功生成圖均已檢視：沒有多餘文字／浮水印、完整肢體、透明邊緣與一致筆觸。快速草原怪經多次未成功後，改為薄荷色風精靈；筆觸比其他角色略平，但色盤、光源與輪廓相容，已接受，沒有缺圖或待補的正式素材，也沒有因時間而保留不合格素材。

## 設計系統與畫面

CSS 變數定義 4／8／12／16／24／32／48px 間距、10／18／28px 與 pill 圓角、三層陰影，以及標題／內文／輔助／數字的字級。按鈕統一為綠色主按鈕、奶油色次按鈕與透明文字按鈕；圓角面板、標籤、卡片、帶邊框漸層血條、連擊徽章與同線寬內嵌 SVG 圖示共用一套規則。淺／深色都有對比處理，按鈕按下有一致下沉回饋，reduced-motion 停用持續動畫與長轉場。

- 地圖：標題圖、金幣與總星數置頂；五區沿插畫道路排列；當區關卡沿路交錯，已通關、可挑戰、未解鎖以顏色、邊框與文字區分，星等直接留在節點上。設定、對照、小店、複習與聲音集中到底部工具列。補上捲動預留，避免工具列擋住鍵盤導覽／自動捲入的節點。
- 戰鬥：五區專屬繪本背景、可辨識的怪物與王、城門及魔法師兩姿勢（小戰場依高度縮放，避免王被下緣裁切）；題卡改成金邊符咒牌，施法列改為卷軸。血條有完整寬度、邊框和高光；保留火球、爆炸、Combo、護甲格與五區魔法色。
- 教學、看／跟／試、設定、小店、暫停與複習：統一面板、字級、按鈕與留白；空錯題清單有專屬狀態。長面板可捲動，開啟時回到頂端。
- 結算：逐星落下、850ms 分數滾動、破紀錄提示與施法慶祝姿勢；聚焦按鈕不再把畫面捲到底部，進入時先看到儀式與成績。
- 轉場與文案：加入短頁面進場與倒數回饋，操作文字改為簡短動詞；精簡主頁導語、複習與升級按鈕。

## 載入、降級與效能

所有程式、題庫、聲音和 SVG 回退仍在 index.html；圖片以相對路徑載入。初屏優先載入標誌與旅程圖，其他圖片用 lazy-load；開啟某區教學時只預暖該區背景／怪物及共用角色。背景為 600×900，角色以 384px 內的透明 WebP 為主，魔法師為 360×540 內。

圖片載入前直接顯示原有 SVG，載入成功後才切換；載入失敗時保留 SVG，不顯示破圖框，不阻塞出怪或輸入。施法姿勢失敗仍會顯示已載入的待機姿勢。城門在血量低於一半時切換受損圖，失敗時仍保留城門 SVG。

## 測試與視覺檢查

最終版本的以下標準入口全部以狀態 0 結束（Node v26.13.0、Chrome 157.0.8103.52）。沒有刪除既有玩法測試；selftest 只將 TASK4 的「禁止圖片」限制改為 TASK5 的本地素材、檔案完整性與大小限制，另加入 v4 題庫比對。

| 指令（均使用 `/opt/homebrew/bin/node`） | 結果 | 日誌 |
| --- | --- | --- |
| `selftest.mjs` | 7,307 項通過 | [selftest5-output.txt](selftest5-output.txt) |
| `browser-smoke.mjs` | 114 項既有回歸＋56 項聲音／特效回歸通過 | [完整輸出](browser-test5-output.txt)、[主流程](browser-smoke5-output.txt)、[聲音／特效](browser-audio5-output.txt) |
| `browser-layout.mjs` | 6 項通過 | [browser-layout5-output.txt](browser-layout5-output.txt) |
| `browser-design5.mjs` | 67 項通過 | [browser-design5-output.txt](browser-design5-output.txt) |
| `browser-fx5.mjs` | 13 項通過 | [browser-fx5-output.txt](browser-fx5-output.txt) |
| `browser-performance5.mjs` | 9 項通過 | [browser-performance5-output.txt](browser-performance5-output.txt) |

正常載入與既有回歸均為 **0 console error／runtime exception**。刻意封鎖圖片及 HTTP 404 情境只有預期的資源載入錯誤，沒有 JavaScript 例外。

新增檢查包括：四尺寸無水平溢出、44px 按鈕／選單／滑桿、三種關卡節點、無破圖、面板標題／內容／操作列不覆蓋、王與一般怪完整位於戰場內、火球／爆炸／Combo、逐星與分數動畫完成、破紀錄提示、第五區整句正確輸入仍削血、reduced-motion，以及圖片全被封鎖、網路中斷與真正 HTTP 404 時仍可正常擊倒。既有首次教學、30 關教學預覽、四種輸入路徑、星等／存檔、小店與音訊降級等仍保留。

效能獨立量測，沒有與其他瀏覽器測試並行：HTTP 冷快取、約 1.68Mbps（209,715 bytes/s）、150ms 延遲、CPU 4×，從開始載入到實際點開教學分別為 **2,421／2,154／2,138ms**，均小於 3 秒。這量的是可操作時間，並非所有圖片下載完成時間。正常戰鬥 120 個 rAF 間隔平均 **16.67ms**、p95 **16.70ms**。淺／深色各五組主要文字色對面板的對比為 **5.27～11.29:1**。

四尺寸為 **390×844、360×640、430×932、1280×720**，每種 16 張，共 64 張主要截圖，包含地圖、教學、看／跟／試、首次操作、火球、爆炸、Combo、王、暫停、結算、小店、設定及第五區，均已逐張實際開啟檢查。完整清單與檢查說明見 [shots5/QA5.md](shots5/QA5.md)。另檢視深色、空狀態與 SVG 回退，以及 34 張回歸截圖的六張拼版。長地圖、結算和長面板採正常垂直捲動；沒有用縮小字體把所有內容塞入一屏。

同一份存檔、同為 390×844 的地圖前後對照：[shots5/_before_after.png](shots5/_before_after.png)。素材總覽：[assets/_overview.webp](assets/_overview.webp)。特效截圖用測試專用掛鉤固定短動畫時刻；正式 index.html 不含測試 API。測完已移除暫存 HTML 與 Chrome profiles。

## 已知限制

本次使用 Chrome headless 與觸控、viewport、輸入法事件及聲音 API 替身，沒有真機 iPhone／Safari／App 內建瀏覽器實測。4G、CPU 與 rAF 數字是本機模擬，不能保證所有手機的載入速度或 60fps。聲音功能沿用 TASK4；我無法聽到聲音，沒有宣稱完成聽感驗收。

「斷網仍可玩」指 index.html 與內嵌程式可取得後，即使圖片載入失敗仍可玩；沒有新增 Service Worker，不能宣稱第一次造訪遠端網址且完全離線時能取得 HTML。直接開啟本機 index.html 可離線使用，圖片遺失時回退 SVG。

## 素材清單與檔案大小

檔案大小以十進位 KB（1KB＝1,000 bytes）計；35 張圖片合計 **2,106,412 bytes（2.11MB）**，最大單張 journey.webp 為 **171,602 bytes**。全部單張 ≤200KB，總量 ≤6MB。

| 檔案 | 用途 | 尺寸 | 大小 |
| --- | --- | --- | ---: |
| [_overview.webp](assets/_overview.webp) | 素材總覽 | 1200×1320 | 153.78KB |
| [app-icon.webp](assets/app-icon.webp) | App 圖示／favicon | 384×384 | 33.21KB |
| [apple-touch-icon.png](assets/apple-touch-icon.png) | Apple 觸控圖示 | 180×180 | 65.42KB |
| [battle-1.webp](assets/battle-1.webp) | 第 1 區直式背景 | 600×900 | 113.68KB |
| [battle-2.webp](assets/battle-2.webp) | 第 2 區直式背景 | 600×900 | 118.25KB |
| [battle-3.webp](assets/battle-3.webp) | 第 3 區直式背景 | 600×900 | 105.97KB |
| [battle-4.webp](assets/battle-4.webp) | 第 4 區直式背景 | 600×900 | 103.73KB |
| [battle-5.webp](assets/battle-5.webp) | 第 5 區直式背景 | 600×900 | 100.32KB |
| [gate-damaged.webp](assets/gate-damaged.webp) | 受損城門 | 384×285 | 30.02KB |
| [gate-intact.webp](assets/gate-intact.webp) | 完好城門 | 384×263 | 27.69KB |
| [journey.webp](assets/journey.webp) | 五區旅程插畫 | 600×900 | 171.60KB |
| [mage-cast.webp](assets/mage-cast.webp) | 魔法師施法／慶祝 | 349×540 | 63.23KB |
| [mage-idle.webp](assets/mage-idle.webp) | 魔法師待機 | 324×540 | 65.65KB |
| [r1-boss.webp](assets/r1-boss.webp) | 第 1 區王 | 343×384 | 46.37KB |
| [r1-fast.webp](assets/r1-fast.webp) | 第 1 區快速怪 | 384×369 | 34.56KB |
| [r1-heavy.webp](assets/r1-heavy.webp) | 第 1 區厚血造型 | 318×384 | 33.44KB |
| [r1-normal.webp](assets/r1-normal.webp) | 第 1 區一般怪 | 300×384 | 25.05KB |
| [r2-boss.webp](assets/r2-boss.webp) | 第 2 區王 | 270×384 | 41.68KB |
| [r2-fast.webp](assets/r2-fast.webp) | 第 2 區快速怪 | 319×384 | 34.04KB |
| [r2-heavy.webp](assets/r2-heavy.webp) | 第 2 區厚血造型 | 343×384 | 39.63KB |
| [r2-normal.webp](assets/r2-normal.webp) | 第 2 區一般怪 | 307×384 | 35.19KB |
| [r3-boss.webp](assets/r3-boss.webp) | 第 3 區王 | 346×384 | 48.06KB |
| [r3-fast.webp](assets/r3-fast.webp) | 第 3 區快速怪 | 368×384 | 43.90KB |
| [r3-heavy.webp](assets/r3-heavy.webp) | 第 3 區厚血造型 | 329×384 | 40.44KB |
| [r3-normal.webp](assets/r3-normal.webp) | 第 3 區一般怪 | 280×384 | 32.74KB |
| [r4-boss.webp](assets/r4-boss.webp) | 第 4 區王 | 344×384 | 44.83KB |
| [r4-fast.webp](assets/r4-fast.webp) | 第 4 區快速怪 | 307×384 | 35.02KB |
| [r4-heavy.webp](assets/r4-heavy.webp) | 第 4 區厚血造型 | 384×344 | 42.82KB |
| [r4-normal.webp](assets/r4-normal.webp) | 第 4 區一般怪 | 363×384 | 32.36KB |
| [r5-boss.webp](assets/r5-boss.webp) | 第 5 區王 | 353×384 | 53.50KB |
| [r5-fast.webp](assets/r5-fast.webp) | 第 5 區快速怪 | 289×384 | 38.70KB |
| [r5-heavy.webp](assets/r5-heavy.webp) | 第 5 區厚血造型 | 331×384 | 40.34KB |
| [r5-normal.webp](assets/r5-normal.webp) | 第 5 區一般怪 | 384×327 | 31.84KB |
| [reference.webp](assets/reference.webp) | 風格基準 | 600×900 | 148.62KB |
| [title.webp](assets/title.webp) | 遊戲標誌字 | 480×160 | 30.72KB |

備份 v4.html 的 SHA-256：`c5041d421f114befa5d11d545616b7d052f7e6ff61dfed747f998a2b050bbce6`。
