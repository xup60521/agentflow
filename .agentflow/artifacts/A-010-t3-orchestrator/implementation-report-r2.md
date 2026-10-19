* _2026-10-18 16:04:24 +0800 (claude-opus-5-5/medium)_

# A-010 T3 orchestrator 修正報告（第 2 輪：R1、R2）

- **結果：** GPT review 擋下的兩個問題已修正。同一輪再次呼叫時，程式改用 host 保存的原始派工記錄，不再依當下資料重新產生 request ID 或重新選擇候選。缺少這份記錄時，結果改為「不確定」，不會產生新派工，也不會寫 report 或 resolution。路由測試從 37 項增加到 41 項，全部通過。

- **限制：** 本輪仍只用單元測試注入模擬的工具結果，沒有實際呼叫 T3 `delegate_task`／`task_status`。Host 必須在呼叫 `delegate_task` 前先保存派工記錄，程式無法替 host 保存，詳見下方「恢復規則」。always-loaded 32 KiB 上限的既有失敗仍在，與本輪無關。

- **Host 下一步：** 整合來源 commit `22eff43dbcaeda429cb4beb261bfc2adff646727`，依下方恢復規則調整 host 的重入流程，再交新的 GPT review。本 commit 尚未經審查。

## 修正內容

這裡的「frozen context」指開始派工時凍結、之後不能更動的派工記錄，由 `execute_threeways_debate` 回傳、host 保存。

- **R1：重入只認原始記錄。** 該輪 brief 已存在時，`execute_threeways_debate` 不再重新選擇候選，只接受 `facts.native_context`（host 保存的 frozen context）。

  - 未綁定 task 的記錄：回傳和第一次完全相同的派工資料與 `client_request_id`，`state: 'handoff'`。當下候選的 effort 改了也不受影響。

  - 已綁定 task 的記錄：`state: 'pending'`，只回傳 `native_task: { task_id, child_thread_id }`，不給任何可再呼叫 `delegate_task` 的資料。

  - 記錄的來源、round、work root、brief 雜湊，或 facts 帶入的 `client_request_id` 與記錄不符：`valid: false`，不派工、不寫檔。

  - 沒有帶記錄：`state: 'uncertain'`、`consensus: 'PENDING'`，沒有派工資料、沒有新 context、`retry_required` 與 `fallback_permitted` 都是 false。

  - 帶了記錄但該輪 brief 不存在：`valid: false`，不會當成第一次派工。

- **R1：派工身分涵蓋實際控制項。** 自動產生的 request ID 改為納入 candidate、provider、model、effort。`bind_threeways_native_task` 會比對 `delegate_task` 結果（含其 `target`）回報的 providerInstanceId、model、effort；`complete_threeways_native` 也比對 `task_status` 的 effort。任何一項不符即拒絕，避免把 high 任務記成 medium。

- **R2：重入不會替執行中的任務結案。** 因為重入不再呼叫選擇器，候選暫時不可用、policy 改成禁止 internal、選擇改成 external，都不會進入 report/resolution 收尾，也不會回報需要重試或可以 fallback。原任務稍後完成時，仍可用 `complete_threeways_native` 正常收尾。

- **首次選擇失敗如實回報。** 明確選 internal 但第一次選擇就失敗時，回傳 `consensus: 'UNRESOLVED'`、`worker_started: false`、`retry_required: false`，不寫 brief、report、resolution。原本會寫出「worker report 缺漏」的診斷檔並占用該輪，但其實沒有 worker 啟動過。現在 brief 只在產生派工資料時才寫入，因此 brief 存在就代表派工資料可能已送出；候選恢復後，同一輪可以正常第一次派工。

- **未變動：** 外部 runner 路徑、完成收尾、相同結果只讀重播、report 已寫但 resolution 未寫的補寫、第三輪合法完成與第四次禁止啟動，都沿用原行為與原測試。沒有新增 registry、scheduler、CLI 參數或依賴；CLI 透過同一份 facts JSON 的 `native_context` 欄位取得記錄。

## 恢復規則（互動 host 須遵守）

1. 呼叫 `execute_threeways_debate(facts)` 取得 `state: 'handoff'` 後，先把 `frozen_context` 寫入 host 既有的該輪記錄，再呼叫 `delegate_task`，使用 `native_handoff.client_request_id`。

2. 拿到 `taskId`／`childThreadId` 後，呼叫 `bind_threeways_native_task(context, delegate_result)`，把綁定後的 context 覆蓋存回同一輪記錄。

3. 中斷後重入同一輪時，在 facts 加上 `native_context: <保存的 context>`。

   - 回傳 `state: 'handoff'`：前次 `delegate_task` 結果不明，用同一 `client_request_id` 重送，T3 會去重。

   - 回傳 `state: 'pending'`：不要再派工，讀 `task_status(native_task.task_id)`，交給 `complete_threeways_native`。

4. 找不到保存的 context 時，重入會回 `state: 'uncertain'`。這時：

   - 先從 host 的對話或派工記錄找回 context，再照第 3 步。

   - 找不回時，在 T3 查該輪是否已有 task（例如以 `client_request_id` 或子對話標題比對）。若找到，以 `task_cancel` 加 `task_status` 確認停止且沒有 pending child runs，才算結束。

   - 兩者都無法確認時，該輪維持不確定，交由 owner 決定。程式沒有提供跳過這個狀態的參數。

5. 想換候選、effort 或執行者，必須先讓原任務經 `complete_threeways_native` 進入終態；owner 主動停止仍需重新授權。重入時改 facts 不會換掉已開始的派工。

## 驗證

- **紅燈（修正前）：** `node --test delegation-route.test.js`：41 項中 37 PASS、4 FAIL，exit 1。失敗項目正是新增的四個反例：同輪重入產生新身分、不同 effort 共用 request ID、重入時選擇失敗被結案、首次選擇失敗占用該輪。完整 log：`/tmp/agentflow-A010-r2-red.log`。

- **綠燈（修正後）：** 同一命令 41 PASS、0 FAIL，exit 0。完整 log：`/tmp/agentflow-A010-r2-green.log`。

- **調整的既有測試：** 只有一處。原測試以相同 facts、不帶 context 重入並期待相同 request ID；這正是 R1 指出的缺口，現改為帶 `native_context` 重入，斷言相同。

- **文件契約：** `node --test prompt-compression.test.js`：12 項中 11 PASS、1 FAIL。失敗的是 always-loaded 32 KiB 上限，在未修改的 HEAD 上同樣失敗，屬既有基線。新增的恢復規則斷言位於「advanced feature rulebooks」測試，已通過。

- **未執行：** 沒有跑全產品 suite、真實 PTY journey 或實際 T3 工具；本輪沒有新增 terminal 操作。

## 變更

- 來源 commit：`22eff43dbcaeda429cb4beb261bfc2adff646727`，基於 `e894a0a`。

- changed_paths：

  - `skills/agentflow/scripts/delegation-route.js`

  - `skills/agentflow/scripts/delegation-route.test.js`

  - `skills/agentflow/references/delegation.md`

  - `skills/agentflow/scripts/README.md`

  - `skills/agentflow/scripts/prompt-compression.test.js`

  - `.agentflow/artifacts/A-010-t3-orchestrator/implementation-report-r2.md`（本報告，另一個 commit）

- 公開 API 變更：

  - `execute_threeways_debate(facts)` 新增輸入 `facts.native_context`，回傳新增 `state`（`handoff`／`pending`／`uncertain`）、`native_task`、`worker_started`、`fallback_permitted`。

  - `bind_threeways_native_task` 新增 providerInstanceId／model／effort 比對；`complete_threeways_native` 新增 effort 比對。

  - 自動 `client_request_id` 的雜湊輸入新增 candidate／provider／model／effort，格式不變（`threeways-r<round>-<24 hex>`）。

Self-check: 已先以四個反例測試重現 R1、R2 並取得紅燈，再以最小修改轉綠；重入只依 host 保存的 context，缺記錄時不派工、不收尾，首次選擇失敗不占用該輪；未宣稱真實 T3 驗證或審查通過，32 KiB 失敗已標為既有基線。
