# 任務：依 Gemini 4 Hydrogen 的程式碼審查修 bug（v0.7.0 → v0.7.1）

同資料夾的 pindou_review_hydrogen.md 是另一個模型（Gemini 4 Hydrogen）對目前 index.html 的審查，列了 20 條 bug。我（Claude）已抽查並確認其中至少這幾條為真：#7（第 3 區被跨關去重，r3-6／r3-8 核心例字被刪）、#8（nextEnemyQuestion 沒重置 enemy.clean）、#12（speak() 在 voice 為 null 時直接 return false，iOS／Telegram WebView 的 getVoices() 常為空 → 整個靜音，很可能就是使用者回報「進戰鬥沒語音」的原因）、#6（finishOnboarding 沒取消倒數）、#20（結算畫面 Enter 無效）。

規則：只在本資料夾工作；先把 index.html 備份成 v7.html；題庫讀音不可改；不要 git、不要部署。保留所有既有手動修正（noKeyboardNeeded、ZHUYIN_SOUND／spoken(q)、已過關跳過引導與 replay-guide）。

## 步驟
1. 逐條驗證 20 條：每條判定「確認／部分正確／不成立」，附你重現或讀碼的證據（函式名與行號）。不成立的不要改。
2. 修正所有確認與部分正確的項目。特別要求：
   - #7：第 3 區不要做跨關去重（它是發音對比專項，同一字可在不同對比關出現）；第 2、4 區維持去重。修完確認 r3-6 含 女、綠、略 等 nv/lv/lve，r3-8 含 yu／yue／yuan／yun 開頭字；教學卡例字都找得到。selftest 的「每關只考本關項目」檢查同步調整。
   - #12：只要 speechSynthesis 與 SpeechSynthesisUtterance 存在就要能發聲；voice 為 null 時設 u.lang='zh-TW'（不指定 voice）。偵錯面板註明「未取得語音清單，使用系統預設中文」。
   - #11：正確率以「每題最終有效字母」或「首次嘗試的正確字母」計，不可因重打重複累加；說明你採用的定義。
   - #14：打怪中斷造成的 no-start 不可把語音永久標記為壞掉。
   - #2、#3、#16：涉及 iOS 焦點與 preventDefault 的修改要保守：內建鍵盤模式（預設）不得受影響；系統鍵盤模式與第 5 區照建議修，並補測試。
3. 版本號改為 v0.7.1（設定頁與偵錯面板），建置時間更新。
4. 測試：selftest、所有 browser-*.mjs 全過；為每個修正補至少一條會在修正前失敗、修正後通過的測試。
5. REPORT8.md：20 條的判定表（確認／部分／不成立＋證據）、改了什麼、測了什麼、仍需真機驗證的事。
