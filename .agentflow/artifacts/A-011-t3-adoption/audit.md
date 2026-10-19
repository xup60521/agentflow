* _2026-10-19 12:14:03 +0800 (gpt-6.1-sol/high)_

- **建議下一步**：補上一般委派使用的 T3 即時模型目錄轉換函式，並明訂「決定委派後，符合政策時優先選 T3」。保留目前的 external runner，不重做 A-010 已完成的 threeways。

- **目前可用**：原生 threeways、任務綁定、等待、完成與重播已存在。本輪重跑路由測試 **41 PASS、0 FAIL**，相關文件契約 **1 PASS、0 FAIL**。這不代表完整產品或 Windows 實機驗證已完成。

- **需要 owner 決定的變更**：若要把 T3 `isolation:"worktree"` 納入預設寫入方式，必須先決定是否接受它與現行獨立、無 remote clone 的隔離差異。建議與本次最小實作分開處理。

1. **已完成的能力應保留。**

   - 一般選擇器已支援 `external`、`internal`、`host`，會檢查權限、明確模型要求與未解決的前次任務；原生動作回傳資料供 host 呼叫工具，沒有捏造 CLI 命令。見 [delegation-route.js:606](/home/zup/code/agentflow/skills/agentflow/scripts/delegation-route.js:606)、[delegation-route.js:600](/home/zup/code/agentflow/skills/agentflow/scripts/delegation-route.js:600)。

   - threeways 明確選 `internal` 時，已不要求外部 profile、argv 或 resolver；回傳 `PENDING`、派工資料與需保存的 context。見 [delegation-route.js:96](/home/zup/code/agentflow/skills/agentflow/scripts/delegation-route.js:96)、[delegation-route.js:212](/home/zup/code/agentflow/skills/agentflow/scripts/delegation-route.js:212)。

   - 同輪恢復已固定來源、brief、request ID 與 task；缺 context 不重派。完成處理會等待未結束的子工作，支援相同結果重播及部分收尾恢復。見 [delegation-route.js:230](/home/zup/code/agentflow/skills/agentflow/scripts/delegation-route.js:230)、[delegation-route.js:334](/home/zup/code/agentflow/skills/agentflow/scripts/delegation-route.js:334)。A-010 也已有真實完成與重播的 host 驗收紀錄，並非只有模擬測試，見 [acceptance.md:10](/home/zup/code/agentflow/.agentflow/artifacts/A-010-t3-orchestrator/acceptance.md:10)。

   - 互動式 queue 已有 `claim_host_plan`／`finish_host_plan`，保留來源、所有權、驗收與封存檢查，不需要重新建立 queue 執行器。見 [looper.js:1846](/home/zup/code/agentflow/skills/agentflow/scripts/looper.js:1846)、[looper.js:1898](/home/zup/code/agentflow/skills/agentflow/scripts/looper.js:1898)。

2. **真正的採用缺口在派工準備。**

   - **「T3 優先」目前仍靠 host 臨場選擇。** 文件說明 host 選 `internal` 後使用 orchestrator，但沒有明訂適用時的預設偏好。共用選擇器遇到多種可用執行方式，本來就應回傳 `selection-required`；這是既有政策，不是錯誤。應在 host 指引補上偏好，不能把 `allowed-worker` 排序改成優先順序。見 [delegation.md:21](/home/zup/code/agentflow/skills/agentflow/references/delegation.md:21)、[delegation-route.js:650](/home/zup/code/agentflow/skills/agentflow/scripts/delegation-route.js:650)。

   - **即時目錄到工具參數，仍由 host 手動拼裝。** 原生候選直接讀取 `capabilities.internal`；一般原生 action 只帶 candidate、brief 與通用 model／effort，沒有整理成 T3 的 provider、model、options 目標。現有「catalog」測試也是手工建立候選，沒有驗證真正目錄的轉換。見 [delegation-route.js:557](/home/zup/code/agentflow/skills/agentflow/scripts/delegation-route.js:557)、[delegation-route.js:580](/home/zup/code/agentflow/skills/agentflow/scripts/delegation-route.js:580)、[delegation-route.test.js:724](/home/zup/code/agentflow/skills/agentflow/scripts/delegation-route.test.js:724)。這是可用性缺口，目前沒有證據顯示既有手動派工因此失效。

   - 本輪唯讀呼叫 `orchestrator_capabilities`，確認 Codex、Claude、OpenCode 可執行 child task。目錄中的 Codex 推理選項 ID 是 `reasoningEffort`，Claude 是 `effort`，OpenCode 模型可使用 `variant`。轉換必須保存該模型實際提供的選項 ID，不能一律送 `effort`，也不能合併不同模型的可用值。模型與 provider 清單不應寫死。

3. **交給 Opus 的最小實作範圍。**

   - 在既有路由模組增加一個**只轉換資料、不呼叫工具**的函式。輸入 host 剛觀察的 catalog、真實工具可用性，以及本次已選定的 provider／model／options；輸出既有格式的原生候選與可供 `delegate_task` 使用的 target。停用 provider、缺模型或不合法選項應明確拒絕，不自行猜模型或替換 owner 的精確要求。

   - host 已判斷值得委派、沒有明確指定其他執行方式、`internal` 被允許且 T3 可用時，記錄選 `internal` 的理由，再交給原有選擇器檢查。小工作繼續依既有規則判斷是否由 host 直接完成，見 [delegation.md:13](/home/zup/code/agentflow/skills/agentflow/references/delegation.md:13)。

   - 產品檔案限制為五個：`skills/agentflow/scripts/delegation-route.js`、其測試、`skills/agentflow/references/delegation.md`、`skills/agentflow/scripts/README.md`、`skills/agentflow/scripts/prompt-compression.test.js`。不改設定 schema、external runner、looper 或 threeways 的完成流程；不新增依賴、registry、scheduler 或 daemon。

   - 較小的文件修改能補上偏好，但仍留下每次手動轉換目錄與參數的工作。上述純資料函式是本輪值得增加的最小程式成果。

4. **生命週期、隔離與政策相容性。**

   - **生命週期沿用現有規則。** 保存 `taskId`、`childThreadId` 與原呼叫目標；同次呼叫重試沿用 `clientRequestId`，新審查輪次才使用新 ID。`queued`、`running`、`waiting`、timeout、未知狀態或尚有子工作，都不能觸發替代 writer。取消後須由真實狀態確認停止，owner 主動停止仍需重新授權。這些已寫在 [delegation.md:21](/home/zup/code/agentflow/skills/agentflow/references/delegation.md:21)，不需要再造一套。

   - **目錄更新不能改掉執行中的任務。** 新函式只服務首次派工準備；已開始的 threeways 仍使用保存的 context 恢復，不重新選模型或建立新任務。見 [delegation-route.js:228](/home/zup/code/agentflow/skills/agentflow/scripts/delegation-route.js:228)。

   - **目前寫入隔離維持 clone。** T3 工具現在支援 `isolation:"worktree"`，從父任務本機 commit 建立 checkout，不複製未提交修改，並先執行專案 setup。這與現行要求的獨立 Git 資料、無 remote clone 不同；現有檢查明確驗證 Git common directory 與 remotes，見 [external-runner.js:60](/home/zup/code/agentflow/skills/agentflow/scripts/external-runner.js:60)、[external-runner.js:125](/home/zup/code/agentflow/skills/agentflow/scripts/external-runner.js:125)。clone 與 worktree 都不能當作 OS sandbox。

   - **既有設定不可暗改。** `allowed-worker` 仍是無順序的權限集合；`cli-provider` 只限制外部 profiles；獨立審查要求維持原義。v7 遷移仍保守保留 `external`／`host`，不能因偵測到 T3 就加入 `internal`。見 [delegation.md:23](/home/zup/code/agentflow/skills/agentflow/references/delegation.md:23)、[ag-settings.js:884](/home/zup/code/agentflow/skills/agentflow/scripts/ag-settings.js:884)。

   - **非 T3 路徑保持獨立可用。** Standalone looper 目前只提供外部能力；無可用外部 worker 時留下 queue 並交回互動 host，這是有意限制。見 [looper.js:869](/home/zup/code/agentflow/skills/agentflow/scripts/looper.js:869)。不需要把它改成 T3 client，也不需要排程功能。

5. **驗收應集中在新增的轉換邊界。**

   - 用接近實際 catalog 的資料測試不同 provider 的選項 ID、各模型獨有的 effort、停用 provider、自訂模型，以及含 `/` 的模型 ID；不能只測已手工整理好的 internal candidate。

   - 驗證輸出的 provider／model／options 與選定目標一致，完整 brief 原樣保留；精確模型不可用時拒絕，不能自動改名或替換。未指定的 runtime 與其他選項保持繼承。

   - 保留現有權限排列測試、明確執行者選擇、獨立審查與未停止任務阻擋測試；通用選擇器原本的 `selection-required` 行為維持不變。

   - 重跑目前 41 項路由測試與受影響文件契約。實作後由 host 使用新增函式準備一次真實 T3 委派，核對實際 target、task handles、產物與驗收，證明新函式確實用在派工流程中。本次 audit 沒有啟動這項實驗。

6. **須決策與暫存提案。**

   - 將 T3 worktree 設成一般寫入預設前，owner 須決定是否接受共用 Git 資料與專案 setup 的差異，以及它如何配合 Agentflow stream 的 notebook／所有權規則。現行規則已將 stream worktree 與 worker clone 分開，見 [streams.md:5](/home/zup/code/agentflow/skills/agentflow/references/streams.md:5)。建議本輪維持 clone，避免讓這項決策阻塞模型轉換函式。

   - 已知 effort completion 測試會先因缺 brief 而失敗，A-010 已揭露並另做行為查證，見 [review-r2.md:25](/home/zup/code/agentflow/.agentflow/artifacts/A-010-t3-orchestrator/review-r2.md:25)。測試強化、既有 budget／release alignment 問題及擴大 CI，均留作提案，不混入本輪。

- 本次稽核基準為 `feature/t3-orchestrator`、HEAD `62e74c72fd91c66bab95d637882a302194c992da`。未啟動 Agentflow、寫 notebook、委派、啟動外部模型 CLI、修改來源、commit 或 push；原有 `.agents`、設定與其他髒檔未由本次操作更動。測試僅建立暫存的 threeways 產物。

Self-check: 已核對目前來源、相關測試、執行入口與 A-010 設計及驗收，區分既有能力與採用缺口；建議限於一般 T3 派工準備，保留外部 runner，將隔離政策變更明列為 owner 決策。
