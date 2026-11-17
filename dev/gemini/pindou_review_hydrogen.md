Gemini 說了

以下依嚴重度排序，列出程式碼中已確認或高度懷疑的 20 個真實 Bug（聚焦於 iOS Safari／Telegram WebView 觸控與鍵盤、Web Speech、WebAudio、計時暫停、題庫過濾與結算邏輯）：

一、會卡關（流程中斷、畫面空白、按鈕無效、強制彈窗）
1. 首次玩家完成／跳過操作教學進入王關或複習關，戰場永久隱藏（畫面全空）

嚴重度：會卡關

關鍵字串：function finishOnboarding() / if (!game.boss && !game.stage.reviewOnly) beginGuide();

觸發情境：新玩家（save.settings.onboarding === false）首次遊玩直接點擊「複習錯題」（review／review-spell）或進入不走引導的關卡，在操作教學第 4 步按「完成教學」或按「跳過」。

為什麼會錯：renderOnboarding() 在第 3 步（畫面顯示 操作 4 / 4）執行了 $('#battlefield').hidden = step === 3; 把戰場隱藏。但 finishOnboarding() 走 else 分支時直接顯示「開始戰鬥」遮罩，忘記把 $('#battlefield').hidden = game.ime 與 $('#duel-panel').hidden = !game.ime 設回來。按「開始戰鬥」後怪物會在隱藏的戰場中前進並扣爆城門，玩家只看得到空白畫面。

建議修法：在 finishOnboarding() 中 configureInputs() 之後補上 $('#battlefield').hidden = game.ime; $('#duel-panel').hidden = !game.ime;。

2. iPhone 第 5 區（咒語神殿）每打完一句就自動彈出暫停遮罩，且 globallyComposing 卡住時按「施放」完全沒反應

嚴重度：會卡關

關鍵字串：function castSpell() / castInput.readOnly = true; / globallyComposing

觸發情境：在 iPhone Safari 或 Telegram 內建瀏覽器打第 5 區（ime-duel／ime-boss），用系統拼音輸入法選完一句繁體中文後點「施放」；或在 iOS 候選字列點選最後一個詞後直接點「施放」。

為什麼會錯：

castSpell() 命中後執行 castInput.readOnly = true;，iOS Safari 對焦點中的 <input> 設為 readOnly 會立刻收起系統鍵盤並觸發 blur 與 visualViewport 回彈，進而觸發 keyboardDismissed()，導致每打完一句就被強制暫停並跳出「點我繼續打字」遮罩。

iOS Safari 點選候選字列上屏時常不會立刻觸發 compositionend（直到失焦或輸入下一個字），此時 globallyComposing 仍為 true；而 pointerdown 對 #cast-button 呼叫了 event.preventDefault() 阻止失焦，導致 castSpell() 開頭的 if (... || globallyComposing ...) return; 永遠擋掉點擊。

建議修法：換句過場（spellAdvance）期間不要對焦點中的 castInput 設 readOnly = true（改用 spellAdvance > 0 狀態擋輸入並保留焦點）；並在 castSpell() 被點擊時，若輸入框內已有中文字且非純拼音字母，允許直接結束組字狀態並執行結算。

3. iOS Safari 使用系統拼音／英文鍵盤（第 1～4 區）時，打死第一隻怪或轉向後會失去焦點並不斷觸發暫停

嚴重度：會卡關

關鍵字串：function rotateInput() / next.focus({preventScroll: true}) / function updateViewport()

觸發情境：在 iPhone 上將設定切換為「手機拼音鍵盤」或「英文鍵盤」遊玩第 1～4 區，擊倒第一隻怪時；或在橫向進入關卡後轉回直向。

為什麼會錯：

rotateInput() 在 input／compositionupdate 事件內呼叫 next.focus()，iOS WebKit 認定非直接觸控手勢而拒絕轉移焦點，導致原本的 previous 失焦、系統鍵盤收起，進而觸發 blur → keyboardDismissed() → 遊戲自動暫停。

updateViewport() 只在 screen !== 'play' 時更新 viewportBaseline，若在橫向進入遊戲後轉為直向，viewportBaseline 仍停留在橫向較小的高度，h < viewportBaseline - 120 永遠為 false，導致系統鍵盤偵測失效。

建議修法：第 1～4 區系統鍵盤模式改用單一穩定 <input> 並透過 inputState.consumed 切片或清空 value 處理，避免在非手勢事件中呼叫 next.focus() 輪替；updateViewport() 應在 h > viewportBaseline 時同步更新 viewportBaseline = h。

4. keyboardClickPending 在 iOS Safari 上不會被重置，可能吞掉下一次非觸控／輔助點擊

嚴重度：會卡關

關鍵字串：let keyboardClickPending = false; / document.addEventListener('click'

觸發情境：在 iPhone Safari／Telegram 內建瀏覽器點擊 #builtin-keyboard 後，透過 VoiceOver、外接鍵盤 Enter 或無 pointerdown 的方式觸發其他按鈕。

為什麼會錯：#builtin-keyboard 的 pointerdown 呼叫了 event.preventDefault()，在 iOS WebKit 中這會阻止瀏覽器產生後續的 click 事件，導致 keyboardClickPending 維持 true 不被重置；下一次若有任何未經過 pointerdown 的 click 事件，會被全域捕獲階段的 click 監聽器攔截並 stopImmediatePropagation() 吞掉。

建議修法：移除跨事件的 keyboardClickPending 布林狀態，改用時間戳記比對（僅攔截 performance.now() - lastKeyboardPointerDown < 400 且來自觸控的相容 click），或僅在 #builtin-keyboard 容器內部攔截 click。

5. 預設「內建鍵盤」在 navigator.maxTouchPoints === 0 的環境下同時隱藏內建鍵盤又停用輸入框

嚴重度：會卡關

關鍵字串：function showBuiltinKeyboard() / !navigator.maxTouchPoints / input.disabled = useBuiltin()

觸發情境：預設 keyboardMode === 'builtin' 下，在桌面瀏覽器、iPad 特定視窗模式或 navigator.maxTouchPoints === 0 的 WebView 開啟第 1～4 區。

為什麼會錯：useBuiltin() 為 true 時，configureInputs() 把 .spell-inputs 隱藏並把兩個 <input> 都設為 disabled = true、readOnly = true；但 showBuiltinKeyboard() 又因為 !navigator.maxTouchPoints 把 #builtin-keyboard 隱藏，造成畫面上既沒有虛擬鍵盤也沒有可輸入的欄位。

建議修法：當 save.settings.keyboardMode === 'builtin' 且 !game?.ime 時，無論 navigator.maxTouchPoints 為何都應顯示 #builtin-keyboard（僅在偵測到實體鍵盤按鍵 hardwareKeyboard 時隱藏）。

6. 倒數計時（3-2-1）期間點擊「跳過」教學，舊的 countdownTimer 未被取消，1 秒後會強行解除暫停

嚴重度：會卡關

關鍵字串：function finishOnboarding() / countdownTimer

觸發情境：新玩家進入任何關卡，在開始倒數 3... 2... 1... 尚未結束前點擊右上角「跳過」（skip-onboarding），且該關卡跳過引導直接進入戰鬥準備畫面（如王關或複習關）。

為什麼會錯：finishOnboarding() 沒有呼叫 cancelKeyboardWait()，原本的 countdownTimer 仍持有相同的 keyboardTicket，倒數結束時會直接隱藏 #start-overlay 並將 game.paused 設為 false 強行開戰。

建議修法：在 finishOnboarding() 開頭呼叫 cancelKeyboardWait()。

二、會算錯（題庫過濾錯誤、連擊與熟練度漏算、正確率灌水）
7. 執行期關卡題庫去重迴圈把第 3 區「ü 與 v (r3-6)」及「y 與 w (r3-8)」的核心教學題全部刪光

嚴重度：會算錯

關鍵字串：// Stage ownership is runtime configuration. / for (const region of [2, 3, 4])

觸發情境：進入第 3 區第 6 關「ü 與 v 的鍵位」（r3-6）或第 8 關「y 與 w 開頭」（r3-8）。

為什麼會錯：初始化時對第 3 區執行跨關卡去重（owner.add(id)）。因為 r3-2（n 與 l）先搶走了「女 (nv)、綠 (lv)、略 (lve)」，導致專門教 ü → v 的 r3-6 題池中 女、綠、略 全部被移除，連教學彈窗 teach() 搜尋 stage.pool 時也找不到例字 女 與 略；同理 r3-6 搶走了所有 魚、雨、月、雲 等 yu- 字，導致 r3-8（y 與 w 開頭）完全沒有 yu 開頭題目。

建議修法：第 3 區（region === 3）是針對不同發音對比的專項訓練，應從去重迴圈排除（改為 for (const region of [2, 4])），保留各音組完整的對照題池。

8. 第 4 區雙層護甲怪第一題打錯後，第二題未重置 enemy.clean = true，導致完美答對第二題也不算連擊與複習熟練度

嚴重度：會算錯

關鍵字串：function nextEnemyQuestion(enemy) / if (enemy.remaining > 0)

觸發情境：在第 4 區（詞語山道）遇到雙題護甲怪，第一題打錯一個字母後修正並擊破第一層護甲，接著第二題完全無誤一次打完。

為什麼會錯：在 completeQuestion() 中，Boss 關換題前有執行 enemy.clean = true; nextEnemyQuestion(enemy);，但一般雙層護甲怪在 if (enemy.remaining > 0) 分支呼叫 nextEnemyQuestion(enemy) 時沒有重置 enemy.clean = true，導致第二題繼承了第一題的 clean = false，使 recordMastery(enemy.q, clean) 失效且擊倒時不給 addCombo()。

建議修法：在 nextEnemyQuestion(enemy) 函式內部統一加上 enemy.clean = true;。

9. 第 1～4 區使用系統拼音鍵盤時，候選字上屏同音字會誤扣下一隻怪連擊；在純英文／第 1 區誤輸入漢字會永久卡死輸入框

嚴重度：會算錯（並導致該場輸入卡死）

關鍵字串：const han = value.match(/\p{Script=Han}+/gu)?.join('') || ''; / if (han) return;

觸發情境：

第 2～4 區開啟「手機拼音鍵盤」，輸入 ta 已用字母擊倒「他」，隨後輸入法自動上屏同音字「它」。

第 1 區（或設定為「英文鍵盤」）時，使用者誤用中文輸入法輸入一個漢字。

為什麼會錯：

字母階段已經完成擊殺並將 '他' 存入 inputState.credits，上屏同音字 '它' 不在 credits 中，程式會進入 if (remaining) wrongKey(...) 對下一隻無辜怪物判錯並斷連擊。

當 region === 1 或 keyboardMode === 'english' 時，第 1309 行 if (han && ...) 被跳過，卻在第 1335 行命中 if (han) return;，既不處理也不清空 castInput.value，導致該漢字永遠卡在輸入框內，之後打的所有英文字母都接在漢字後面而失效。

建議修法：當 region === 1 或 keyboardMode === 'english' 偵測到 han 時，應提示切換鍵盤並呼叫 resetInput() 清空輸入框；第 2～4 區在字母已完整匹配擊殺並輪替後，應忽略該次組字結束隨附的同音漢字提交。

10. 第 4 區第 3 關（r4-3 長詞連打）雙層護甲怪幾乎每隻都連續考兩次完全相同的詞

嚴重度：會算錯

關鍵字串：if (!game.ime && !game.boss && game.stage.region === 4) / excluded.delete(first.pinyin[0]);

觸發情境：遊玩 r4-3（長詞連打）。

為什麼會錯：為了讓雙層護甲怪兩題首字母相同，prepareBattle() 排除了 first.pinyin[0] 以外的所有首字母；但 r4-3 題池僅 16 個詞，多數首字母（如 t 圖書館、b 博物館、h 紅綠燈、y 羽毛球、q 輕聲細語、w 五顏六色、p 平平安安）在整個題池中只有唯一一題，chooseQuestion 找不到其他同首字母詞彙，只能重複抽出同一題，造成同一隻怪連打兩次一模一樣的詞。

建議修法：若同首字母沒有第二個不同的題目（eligible.filter(id => id !== first.id).length === 0），第二題應放寬限制改選場上未佔用的其他首字母題目，避免同一隻怪連考兩次相同單詞。

11. 單題打錯重打時 game.correct 重複累加前綴字母，導致打錯多次仍算出極高「正確率」

嚴重度：會算錯

關鍵字串：game.correct += added; / enemy.progress = 0;

觸發情境：在多字母題目（如 4 字母詞語或 zhuan）前 3 個字母打對、第 4 個字母打錯，反覆錯 2～3 次後才打對。

為什麼會錯：每次重打都會把前 3 個字母再次計入 game.correct，3 次失敗 + 1 次成功會算出 12 / 15 = 80% 正確率，嚴重灌水並影響兩星（90%）與三星（95%）判定。

建議修法：在 wrongKey(enemy) 重置 enemy.progress = 0 前，將該次失敗嘗試已計入的 enemy.progress 從 game.correct 減回（或僅在完成整題時結算該題有效正確字母數）。

三、偶發（環境相依、競態條件、中斷恢復異常）
12. Web Speech API 在 Telegram iOS 內建瀏覽器因 getVoices() 為空而完全靜音，且 guideNext() 切換步驟時提示語音被取消後不再重唸

嚴重度：偶發

關鍵字串：function speak(text) / !voice / function guideNext()

觸發情境：

在 Telegram iOS 內建瀏覽器或冷啟動的 iPhone Safari 中遊玩（speechSynthesis.getVoices() 常回傳 []）。

在引導練習（guide）從「1 看」按「翻下一張」進入「2 跟」時。

為什麼會錯：

speak() 檢查 if (... || !voice || ...) return false;，當 getVoices() 尚未載入或回傳空陣列時直接放棄發聲，即使瀏覽器其實支援 u.lang = 'zh-TW' 原生朗讀。

guideNext() 先呼叫 renderGuide()（設定 g.spokenCue = 'follow:0:false' 並排程語音 '照著打一次。'），緊接著呼叫 beginKeyboard() 觸發 audio.suspend() 把該語音取消；3-2-1 倒數結束後再次呼叫 renderGuide() 時，因 g.spokenCue === cue 成立而跳過朗讀，導致提示語音完全消失。

建議修法：只要 synth && window.SpeechSynthesisUtterance 存在就不應因 !voice 擋掉發聲（voice 為 null 時僅設 u.lang = 'zh-TW'）；guideNext() 應等 beginKeyboard() 倒數結束進入 follow 時再由 renderGuide() 播放提示語音。

13. WebAudio AudioContext 在 iOS Safari 來電、下拉控制中心或切換 App 返回後進入 'interrupted' 狀態，導致音樂與音效永久無聲

嚴重度：偶發

關鍵字串：document.addEventListener('visibilitychange' / audio.sync() / context.state

觸發情境：在 iPhone 上遊玩時下拉控制中心、接聽電話或切換到其他 App 後切回遊戲畫面（特別是在地圖畫面未點擊按鈕時）。

為什麼會錯：iOS Safari 中斷音訊時會將 AudioContext.state 設為 'interrupted' 或 'suspended'。切回前景時 visibilitychange 僅呼叫 audio.sync()，而 sync() 內部完全沒有呼叫 context.resume()；此外全域解鎖僅監聽 button 的 pointerdown，玩家觸碰非按鈕區域或滑動地圖時無法恢復音訊。

建議修法：在 audio.sync() 中若 unlocked && context && context.state !== 'running' && context.state !== 'closed' 且頁面可見，主動呼叫 context.resume()；並將全域手勢解鎖擴大至文件的 touchend／pointerdown／keydown。

14. 連續快速打怪中斷語音時，iOS Web Speech 易觸發 no-start 並誤判為 speechBroken = true

嚴重度：偶發

關鍵字串：speechBroken = true; / failedAttempt('no-start')

觸發情境：連續快速擊倒怪物，導致前一題語音剛啟動就被下一題 cancelEngine() 中斷，重複兩次後。

為什麼會錯：iOS Safari 在 synth.cancel() 後緊接著 synth.speak() 時，常因底層語音佇列尚未釋放而使新語音在 1500ms 內未觸發 onstart，觸發 no-start 重試一次再失敗後便將 speechBroken 設為 true。

建議修法：將 cancelEngine() 後的冷卻時間從 110ms 拉長至 250ms，且不應將打怪中斷導致的 no-start 永久標記為 speechBroken。

15. #builtin-keyboard 點擊按鍵間隙會誤觸「偷看」／錯字，且滑出螢幕底部系統手勢區可能殘留按鍵氣泡

嚴重度：偶發

關鍵字串：builtinKeyboard.addEventListener('pointerdown' / const nearest = buttons.reduce

觸發情境：單手拇指在 #builtin-keyboard 底部工具列（偷看、⌫、解除鎖定）附近點擊縫隙，或從鍵盤邊緣滑出螢幕觸發 iOS 系統手勢。

為什麼會錯：

nearest 沒有設定最大距離門檻，點到工具列按鈕之間的空白縫隙也會強制觸發最近的按鈕，極易誤按「偷看」直接扣次數並歸零連擊。

#builtin-keyboard 未監聽 touchstart 呼叫 preventDefault()，且當觸控被 iOS 系統底部手勢攔截而未觸發 pointercancel 時，key-bubble 放大氣泡（position: fixed; z-index: 100）會永久殘留在畫面上。

建議修法：為 nearest 加上最大半徑限制（超出按鈕邊界 10px 則忽略）；為 key-bubble 加上安全自動移除計時器（如 1200ms），並在 #builtin-keyboard 加上 {passive: false} 的 touchstart preventDefault()。

16. pointerdown 對功能按鈕呼叫 event.preventDefault()，在部分 iOS WebKit 版本會抑制後續 click 事件

嚴重度：偶發

關鍵字串：if (['peek','unlock','ready','guide-next','replay','sound','pause'].includes(action)

觸發情境：在 iPhone Safari 或 Telegram WebView 點擊怪物卡片右上角「再唸一次（小喇叭）」或「偷看」按鈕。

為什麼會錯：在 document 的 pointerdown 中對這些按鈕執行 event.preventDefault()，某些 iOS WebKit 版本會因此取消該次觸控的相容性 click 事件，而這些按鈕的實際業務邏輯全都綁在 document.addEventListener('click', ...) 上。

建議修法：不要在 pointerdown 對有 data-action 的按鈕呼叫 event.preventDefault()（僅保留 castInput.focus() 避免失焦即可）。

17. 第 5 區（咒語神殿）未切換中文輸入法直接送出純英數字時，直接當成錯字扣進度與連擊

嚴重度：偶發

關鍵字串：function castSpell() / const result = alignSpell(q.text, value);

觸發情境：玩家在第 5 區忘記切換繁體拼音輸入法，直接打出 jintian... 後按 Enter。

為什麼會錯：castSpell() 未檢查輸入是否包含任何漢字（\p{Script=Han}），直接進行編輯距離比對並判 0% 正確率，導致連擊中斷、王回血並加速蓄力。

建議修法：在 castSpell() 進入比對前先檢查 !/\p{Script=Han}/u.test(value)，若完全沒有中文字則提示「請先切換至繁體中文拼音輸入法再送出」並退回輸入，不計入失誤。

四、小問題（顯示矛盾、動畫凍結、無效快捷鍵提示）
18. 結算畫面條件明細 resultConditions() 因四捨五入顯示自相矛盾的「✗ 正確率 95.0%（三星 95%，差 0.0 個百分點）」

嚴重度：小問題

關鍵字串：function resultConditions(accuracy) / accuracy >= .95

觸發情境：玩家通關時的實際正確率介於 94.95% 到 94.99% 之間。

為什麼會錯：條件判斷使用未捨入的浮點數 accuracy >= 0.95（結果為 false 顯示 ✗），但顯示百分比與差距時使用 .toFixed(1) 四捨五入成 95.0% 與 0.0，造成條件打叉卻顯示已達標且差 0.0 的矛盾訊息。

建議修法：當 accuracy < 0.95 時使用無條件捨去（Math.floor(accuracy * 1000) / 10）顯示百分比，並確保未達標時差距至少顯示 0.1 個百分點。

19. 引導練習「看・記住鍵位 (step === 'look')」下方的迷你鍵盤亮燈提示凍結不動，且提示文字與隱藏鍵盤矛盾

嚴重度：小問題

關鍵字串：keyDiagram(q.pinyin[Math.floor(performance.now()/700)%q.pinyin.length]) / 也可以直接打出拼音

觸發情境：進入任何非王關的引導練習第 1 步「看・記住鍵位」。

為什麼會錯：renderGuide() 僅在切換題目時執行一次，Math.floor(performance.now()/700) 計算完就靜止在單一字母上不會輪播；同時 showBuiltinKeyboard() 在 step === 'look' 強制隱藏 #builtin-keyboard，但提示文字卻寫「也可以直接打出拼音」。

建議修法：在 tick() 中於 game.guide?.step === 'look' 時定期更新 .mini-keys 的 .next-key 高亮；並在觸控模式下將提示文字改為「看這張卡，按『翻下一張』繼續」。

20. 結算畫面「前往下一站 Enter」按鈕標示 Enter 快捷鍵，但實際按 Enter 鍵無反應

嚴重度：小問題

關鍵字串：前往下一站 Enter / if (screen !== 'play' || !game?.running

觸發情境：關卡勝利進入結算畫面（result-screen）後，按下鍵盤的 Enter 鍵。

為什麼會錯：全域 keydown 監聽器開頭即判斷 if (screen !== 'play' ...) return;，直接忽略了 screen === 'result' 的所有鍵盤事件；只要按鈕失去焦點，按 Enter 就無法進入下一關。

建議修法：在全域 keydown 監聽器中，當 screen === 'result' && !modal.open && event.key === 'Enter' 時，自動觸發 $('#result-screen .primary')?.click()。
