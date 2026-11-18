# TASK8 執行報告（v0.7.1）

依 TASK8.md 與 pindou_review_hydrogen.md 逐條驗證並修正。備份為 `v7.html`；所有專案修改、測試 profile 與輸出均在本專案內，未使用 git、未部署。建置版本 `v0.7.1`，時間 `2026-11-18T00:15:07+08:00`，設定頁與偵錯面板共用 BUILD。

## 20 項判定與證據

行號以原始備份 `v7.html` 為問題證據，以 `index.html` 為修正位置。「部分正確」表示程式中的有效問題已修，但審查對影響範圍或 iOS 必然行為的描述過強，不能用桌面 Chrome 模擬當作真機證明。20 項均有成立部分，沒有整項不成立而硬改的項目。

| # | 判定 | 原始證據／重現 | 修正位置與結果 |
|---|---|---|---|
| 1 | 確認 | `renderOnboarding`（3797）、`finishOnboarding`（3830）：最後一頁隱藏戰場，王關／複習分支未還原。回歸測試遍歷一般王、第五區王與複習關。 | `finishOnboarding`（3857）還原 battlefield／duel-panel，依 ime 決定可見性。 |
| 2 | 部分正確 | `castSpell`（3140、3201）確實把焦點框設 readOnly，且 globallyComposing 一律拒絕；是否每句都因 iOS blur 而暫停需真機。 | `castSpell`（3163）保留可編輯的固定框；spellAdvance 和施放按鈕 disabled 阻止重複提交，beforeinput／input 擋過場輸入。明確提交已有純中文候選字時可解除殘留組字；仍保留一般組字 Enter 防護。 |
| 3 | 部分正確 | `rotateInput`（3479）在輸入事件內移焦；`updateViewport`（3662）遊戲中不更新較高基準。移焦是否被 WebKit 拒絕取決於環境。 | `rotateInput`（3522）保持同一 input，使用 consumed 處理同一組字累積值；`updateViewport`（3688）接受更高視窗高度。拼音、英文與第五區都不在命中／重試時換焦。 |
| 4 | 確認 | `keyboardClickPending`（4052）會殘留；pointerdown 無 click 後直接呼叫另一顆按鈕 `.click()` 即被吞。 | 點擊捕獲（4096）改為容器內攔截，另以 400ms、12px、觸控來源共同辨認可能重新定向的相容 click；輔助點擊不受影響；新 pointerdown 立即清除舊手勢紀錄，即使新畫面按鈕在相同座標也可操作。 |
| 5 | 部分正確 | `showBuiltinKeyboard`（3429）因 maxTouchPoints=0 隱藏，`configureInputs` 仍 disabled；但 `keydown`（4090）仍可接受實體鍵盤，並非完全卡關。 | `showBuiltinKeyboard`（3471）不再依 maxTouchPoints 隱藏；偵測實體按鍵才隱藏，觸控再恢復。 |
| 6 | 確認 | `finishOnboarding`（3830）未取消 `runCountdown` 持有的 timer／ticket；跳過後 3 秒可被舊 callback 解暫停。 | `finishOnboarding` 開頭 `cancelKeyboardWait()`；測試等待超過 3 秒仍停在準備畫面。 |
| 7 | 確認 | Stage ownership（1752）對 `[2,3,4]` 去重，r3-6 缺女／綠／略，r3-8 缺 yu 組；教學卡例字搜尋也落空。 | 1753 只對 `[2,4]` 去重。selftest 驗證第三區逐關與原始池完全相同、核心讀音與每組全部教學例字都在本關。 |
| 8 | 確認 | `nextEnemyQuestion`（2986）只重設 progress／peeked，未重設 clean；一般雙層護甲第二題繼承 false。 | `nextEnemyQuestion`（3006）統一重設 clean=true。錯第一題、乾淨答第二題可取得連擊與熟練度。 |
| 9 | 確認 | `processText`（3892）credits 只比對原漢字，提交「它」不能抵扣已答「他」；region1／english 的 `if(han)return` 留住輸入。 | `processText`（3895；漢字分支3903）忽略同次已用字母命中的候選提交；新 compositionstart 清除舊 credits。第一區／英文模式漢字在戰鬥與引導頁都會提示、清空，下一題可正常輸入；第五區英文設定仍保留中文選字。 |
| 10 | 確認 | `prepareBattle`（2587）把第二題限制在同一首字母，僅一詞可選時 `chooseQuestion` 退回原題。 | `prepareBattle`（2594）有不同同首字詞才維持限制，否則放寬；`spawnEnemy`（2777）同時保留目前與後續護甲的首字母，避免另一怪換題時撞首字母。 |
| 11 | 確認 | `processText`（3952）、`attack`（2973）每次前綴都加 correct；wrongKey／刪除／解除鎖定不扣回。第五區也會重算未達門檻的正確字。 | `creditLetters`（2967）只在整題成功時一次計入字母；換題重設 credited。`castSpell`（3185）只計達傷害門檻的最後有效提交，失敗提交只保留錯誤數。 |
| 12 | 確認 | `speak`（2280）因 !voice return false；`guideNext`（3742）先 renderGuide 記錄 spokenCue，再 beginKeyboard 取消語音，倒數後不重播。 | `speak`（2287）voice 為 null 時不指定 voice、lang='zh-TW'。狀態與 debug 顯示「未取得語音清單，使用系統預設中文」。`guideNext`（3769）與 `renderGuide`（3742）延至倒數結束才標記及播放跟練提示。 |
| 13 | 確認 | `audio.sync`（2137）未 resume interrupted/suspended；全域解鎖（2411）僅按鈕 pointerdown。 | `sync`（2138）可見且已解鎖時嘗試 resume，單一 resuming 防重入，拒絕後可由後續手勢重試；全域可信 pointerdown／touchend／keydown 都可解鎖。 |
| 14 | 部分正確 | `failedAttempt`（2250）兩次 no-start 設 speechBroken=true；但 speechTicket 原已隔離舊 callback，而且 speak 沒直接用 speechBroken 阻擋，所以「永久靜音」不是所有情況都成立。 | `scheduleSpeech`（2229）cancel 後冷卻 250ms；no-start／canceled／interrupted 不把引擎標為壞掉，仍有一次重試與診斷，下一題可直接恢復。 |
| 15 | 部分正確 | 鍵盤 pointerdown（4061）無最大命中距離；pointer 清理雖含 cancel／lostcapture，但全部遺失時沒有逾期保護。一般鍵縫給最近鍵原是既有設計。 | 4118 加 10px 邊界門檻，保留近距離容錯；pointer 氣泡 1200ms 自動釋放，pointerup／cancel／切場會清 timer；加入非 passive touchstart preventDefault。 |
| 16 | 部分正確 | 功能 pointerdown（4013）有 preventDefault，而動作靠 click。Chrome 觸控中仍會 click，無法證明所有 iOS 版本必然失效。 | 4051 附近保留內建模式原行為；系統模式功能按鈕不 preventDefault。blur 前往功能按鈕時不搶先開遮罩，click 後需要輸入的動作同步補回焦點。另驗證原生觸控與合成 click。 |
| 17 | 確認 | `castSpell`（3140）把純英數送入 alignSpell，造成 wrong／combo／王狀態變化。 | 3179 檢查 Han；純英數只提示切換繁體中文拼音，原輸入可保留修正，不計失誤。 |
| 18 | 確認 | `resultConditions`（2658）以未捨入值判門檻，toFixed(1) 卻可顯示 95.0%、差0.0。 | 2667 顯示值向下取一位，未達標差距向上取一位且至少0.1；94.99% 顯示94.9%、差0.1，星等仍用真值。 |
| 19 | 確認 | `renderGuide`（3715）只在重繪時計算 mini-keys；`tick`（3285）不更新，而提示仍說可直接打。 | `tick`（3320）逐幀依時間更新既有鍵位亮燈，無額外 interval；提示改為按「翻下一張」繼續，不再要求隱藏的觸控鍵盤。 |
| 20 | 確認 | `keydown`（4090）在非 play 直接 return。finishGame 雖預設聚焦主按鈕，但失焦後 Enter 無作用，所以不是每次結算都失效。 | 4146 在 result 先處理 Enter，觸發主按鈕一次；modal、修飾鍵、組字與長按重複不觸發。 |

## 正確率定義

第一至四區採「每題最後成功答案的有效字母數」：完整匹配才把答案長度加入 correct，一題只計一次；錯誤嘗試的前綴、刪除再打、換鎖定均不增加 correct。每次錯鍵仍計一次 wrong。公式仍為 `correct / max(1, correct + wrong)`。例如 nihao 的前四字母重試三次後成功，為 `5 / (5+3) = 62.5%`，不是把三次前綴累加。未完成的題不給正確字母分。

第五區以最後達到 80% 傷害門檻的有效提交計正確中文字；未達門檻重試的相同綠字不累加，但每次編輯距離錯誤保留。星等門檻及題庫讀音未改。

## 保留與範圍

- `BEGIN QUESTION BANK` 至 `END QUESTION BANK` 與 v7.html、data.js、原始 v1.html 逐位元相同。
- 保留手動 `ZHUYIN_SOUND`／`spoken(q)`，selftest 與 v6.html 逐字比對仍通過。
- 保留操作教學第4步 `noKeyboardNeeded`，以及已過關直接開始、`replay-guide` 重看完整引導。舊穩定性測試繼續覆蓋。
- 內建鍵盤仍不聚焦／開啟系統 input，保留多 pointer、近鍵縫容錯、實體鍵盤、觸控恢復與最後一擊防穿透。
- 舊測試僅調整已改變的契約：固定同框取代換焦、spellAdvance／施放按鈕取代 readOnly、250ms 冷卻、no-start 診斷取代故障標記、空 voice 使用預設中文、桌面顯示內建鍵盤、版本／日期。原流程、幾何、得分、清理與效能斷言保留。

## 測試結果

以 `/opt/homebrew/bin/node test8.mjs` 執行；runner 動態列出全部 `browser-*.mjs`，包含本次新增回歸。環境為 Node v26.13.0、Chrome 157.0.8103.79，所有入口結束碼均為 **0**。最終完整測試於台灣時間 **2026-11-18 00:27:06** 結束。

| 測試入口 | 通過檢查數 | 結束碼 | 輸出 |
|---|---:|---:|---|
| `selftest.mjs` | 8,261 | 0 | [selftest-run8-output.txt](selftest-run8-output.txt) |
| `browser-audio4.mjs` | 56 | 0 | [browser-audio4-run8-output.txt](browser-audio4-run8-output.txt) |
| `browser-design5.mjs` | 67 | 0 | [browser-design5-run8-output.txt](browser-design5-run8-output.txt) |
| `browser-fx5.mjs` | 13 | 0 | [browser-fx5-run8-output.txt](browser-fx5-run8-output.txt) |
| `browser-layout.mjs` | 6 | 0 | [browser-layout-run8-output.txt](browser-layout-run8-output.txt) |
| `browser-performance5.mjs` | 9 | 0 | [browser-performance5-run8-output.txt](browser-performance5-run8-output.txt) |
| `browser-regressions8.mjs` | 32 | 0 | [browser-regressions8-run8-output.txt](browser-regressions8-run8-output.txt) |
| `browser-smoke.mjs` | 795 | 0 | [browser-smoke-run8-output.txt](browser-smoke-run8-output.txt) |
| `browser-stability7.mjs` | 81 | 0 | [browser-stability7-run8-output.txt](browser-stability7-run8-output.txt) |
| `browser-time6.mjs` | 625 | 0 | [browser-time6-run8-output.txt](browser-time6-run8-output.txt) |

瀏覽器輸出共 1,684 條 PASS；其中 smoke 795 條包含自身 114 條、音訊 56 條與時間模擬 625 條，因此統計包含這兩個入口的重複執行，不宣稱為互不重複案例。selftest 為 8,261 項。

- 新增 `browser-regressions8.mjs` 共 32 條全過。以 `TEST8_SOURCE=v7.html /opt/homebrew/bin/node browser-regressions8.mjs` 做修正前對照：29 條問題斷言失敗、3 條保護性檢查原本即通過；每個 #1～#20 都有至少一條失敗斷言，且相同斷言在最終版全部通過。修正前的 exit=1 是預期對照結果，不屬於正常完整套件失敗。
- 對照紀錄：[修正前](browser-regressions8-before-output.txt)、[修正後](browser-regressions8-output.txt)。涵蓋教學完成／跳過／倒數、三種鍵盤、第五區候選字殘留組字、固定焦點、漢字提交與引導、護甲、題池、重試正確率、語音清單與提示、AudioContext interrupted、no-start、按鍵距離與逾期清理、功能 click、門檻顯示及結算 Enter。
- 舊套件繼續驗證全區模擬、有效時間與星等、戰鬥通關、存檔遷移／損壞、背景／重整恢復、暫停、節點／計時器清理、圖片 404／離線、窄版與桌面幾何、VFX、減少動態效果及效能。效能測試 rAF 平均約 16.7ms、p95 約 16.8ms；正常流程無非預期 console／runtime error。
- 額外目視檢查 360×640 引導看卡：例字、鍵位與「翻下一張」提示可見，沒有水平溢出。新增截圖位於 `output/playwright/task8/`；舊套件截圖沿用各自輸出位置。
- 整體紀錄：[suite8-output.txt](suite8-output.txt)、[test-status8.json](test-status8.json)、[verification8.json](verification8.json)。主程式變更可用 [changes8.diff](changes8.diff) 檢視。

測試起始與結束 `index.html` SHA-256 均為 `2cb2bd529b09190862c7bebdaebd522d962f513bf5bfb47e9d79725858a1507d`，測試後未再修改程式。`v7.html` 備份 SHA-256 為 `2db3239d145f6c33c7765d279a5a49d408f82fec27e22f1381b41de9148ff163`。


## 仍需真機驗證

1. iPhone Safari 與 Telegram iOS WebView 冷啟動、getVoices 空清單／延遲清單時是否真的聽到預設中文，以及背景返回後第一句聲音。
2. 系統繁體拼音選字後 compositionend 延遲、直接點施放、命中換句、純拼音未上屏；確認不因 readOnly／焦點切換收鍵盤，且不重複施放。
3. 第一至四區拼音／英文鍵盤連打、退格、同音候選提交、旋轉直橫向、收起及恢復鍵盤。
4. 來電、控制中心、切 App 導致 AudioContext interrupted 後，非按鈕觸控／鍵盤是否能重新恢復音樂與音效。
5. 底部系統手勢奪走 pointer、VoiceOver／外接鍵盤啟動功能按鈕、快速打怪中斷語音。Chrome CDP 模擬與 mocks 已驗證事件／狀態邏輯，但不能取代 iOS WebKit 的原生鍵盤及實際音訊驗收。
