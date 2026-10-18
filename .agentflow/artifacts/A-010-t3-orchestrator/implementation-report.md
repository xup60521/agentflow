* _2026-10-18 15:51:26 +0800 (claude-opus-5-5/medium)_

# A-010 T3 orchestrator 實作報告

- **結果：** 在 T3 環境明確選擇內建子代理後，threeways 不再要求外部 CLI 設定，會回傳「等待中」的派工資料，不會立刻判失敗。Host 呼叫真正的 T3 工具後，可以把查詢結果交回同一輪，完成報告與結論。相關測試從 27 項增加到 37 項，全部通過。

- **限制：** 本輪只用單元測試注入模擬的工具結果，沒有實際呼叫 T3 `delegate_task`。子代理仍可寫入共用檔案系統，clone 不等於 OS 沙箱。另有兩項與本輪無關的既有失敗：always-loaded 32 KiB 上限，以及 alignment 的 release 範本檢查。

- **Host 下一步：** 依設計驗收 1、3、7 跑一次真正的 T3 journey，包含 clone 內最小寫入，再交 GPT review。來源 commit 是 `bc226d1bd5db492807dcc3c9b4c65ab577bb582a`，尚未經審查。

## 使用方式

T3 host 依下列順序使用。這裡的 frozen context 指開始派工時凍結、之後不能更動的派工記錄。

1. 呼叫 `execute_threeways_debate(facts)`，facts 需包含 `task.executor_choice = { kind: 'internal', reason }`、`source_identity`（git 40 碼或 no-git 64 碼）、`capabilities.internal`。
   - 每個 provider/model 建一個 internal candidate，`controls.efforts` 只列該模型在 live catalog 上的 effort，例如 `{ candidate_id, available: true, provider_instance_id, model, effort, controls: { models: [model], efforts: [...] } }`。

   - 不需要 `runner_options`、`runner_arguments`，也不需要 external profile。程式不呼叫 external resolver 或 runner。

   - 回傳 `consensus: 'PENDING'`、`native_handoff`（`task_prompt` 為 brief 全文、`provider_instance_id`、`model`、`effort`、`client_request_id`、`brief_path`、`brief_sha256`）與 `frozen_context`。只寫入 brief，不寫 report 或 resolution。

   - 同一輪以相同 brief 再呼叫，回傳相同的 `client_request_id`；brief 不同則拒絕。該輪已有 report 或 resolution 時，也拒絕重新派工，並指示改用完成函式。

2. Host 用 handoff 的內容呼叫真正的 `delegate_task`（`task`、`target`、`clientRequestId`），再呼叫 `bind_threeways_native_task(frozen_context, delegate_result)`，取得綁定 `task_id`、`child_thread_id` 的 context，存入既有的 round 記錄。
   - 缺 `taskId`、`childThreadId`，`clientRequestId` 不符，或 context 已綁定其他 task 時，都會拒絕。

3. 收到完成通知或需要結果時，host 呼叫 `task_status`，把原始結果交給 `complete_threeways_native({ repo_root, context, source_identity, round, host_resolution, host_disagreement, task_status })`。
   - `queued`、`running`、`waiting`、`completed` 但 `hasPendingChildRuns` 為 true、`workState` 仍在工作或等待子工作時，都回傳 `state: 'pending'`。

   - 結果不是物件、狀態缺失或未知、`hasPendingChildRuns` 不是布林值、`waitTimedOut` 時，回傳 `state: 'uncertain'`。

   - 上面兩種情況都回 `PENDING`、`retry_required: false`、`fallback_permitted: false`，不寫任何檔案，也不回傳 attempt。

   - `taskId`、`childThreadId`、`clientRequestId`、`providerInstanceId`、`model` 與 context 不符，或 source、round、brief 的 sha256 不符時，回傳 `valid: false`。

   - 只有 `completed`、`failed`、`cancelled`、`interrupted` 且 `hasPendingChildRuns === false` 才會收尾。報告內容取自 `summary`，必須通過原有的開頭時間戳記與 `Self-check:` 檢查。

4. 收尾與外部路徑共用 `finalize_threeways_round`：
   - 第一次寫入 report 與 resolution。重送相同結果時只讀取比對，回 `replayed: true`；內容不同時回報衝突，不覆寫。

   - 若 report 已寫但 resolution 尚未寫，先核對 report 一致，再補寫 resolution。只有 resolution、沒有 report 時拒絕。

   - `failed` 對應 `task-failed`，第 1、2 輪會 `retry_required: true`。`cancelled` 與 `interrupted` 對應 `cancelled`，回 `requires_authorization: true` 且不要求重試。

   - 回傳的 `attempt` 帶有 `transport.stop_verified: true`，可直接放進 selector 的 `attempts`。未設定 `resume_authorized` 時，既有的 `unresolved_history` 會阻擋替代 writer。

5. 輪次上限：完成第 3 輪不會重新走 `worker_starts` 檢查，所以合法的第三次可以完成；`worker_starts: 3` 的第四次啟動仍被拒絕。查詢和恢復都不會增加啟動次數。

## 變更內容

- `skills/agentflow/scripts/delegation-route.js`：明確選 internal 時略過 external 前置檢查與 resolver；選到 internal 時回傳 handoff，選到 host 時仍是 UNRESOLVED。新增 `bind_threeways_native_task`、`complete_threeways_native`，並從原有收尾抽出 `finalize_threeways_round` 與 `write_or_match`。selector 和 `validate_execution_record` 沒有修改。

- `skills/agentflow/scripts/delegation-route.test.js`：新增 10 項測試，原有 27 項不變。

- `skills/agentflow/references/delegation.md`：T3 段落改為允許在 host 準備、沒有 remotes 的 disposable clone 中寫入，並揭露共用檔案系統、未強制唯讀、沒有 OS 沙箱。補上 effort 不跨模型合併、pending 或不確定時不收尾、不重試、不換手，取消需 `task_cancel` 加 `task_status` 確認並取得重新授權，以及 threeways 原生流程。

- `skills/agentflow/scripts/README.md`：補上新函式用法。

- `skills/agentflow/scripts/prompt-compression.test.js`：在既有 delegation 規則測試加入 5 項斷言。

- 沒有新增 terminal 操作，CLI 參數和 `main` 都沒有改，因此沒有新增 `threeways-native-journey.js`，也沒有跑 PTY journey。原有 `threeways` 指令在 native facts 下會輸出 PENDING handoff，exit 0，且只寫 brief；這是以一般 shell 驗證，不是 PTY。

## 測試證據

- **Red：** 先新增測試，再執行 `node --test delegation-route.test.js`，結果 37 項中 29 項通過、8 項失敗。第一項 native 測試的失敗訊息是 `threeways launch requires frozen external-runner options`，重現了設計中指出的問題。其餘 7 項失敗，是因為新函式尚未存在。

- **Green：** 實作後再執行同一命令，37 項全部通過，0 項失敗。原有 27 項基線仍然通過。

- **規則契約：** `node --test prompt-compression.test.js` 結果 12 項中 11 項通過。唯一失敗的是 `the always-loaded skill stays within the retained 32 KiB budget`，修改前同樣失敗，是已知基線。新增的 delegation 斷言所在測試已通過。

- **其他讀取 delegation.md 的測試：** `language-contract.test.js` 2 項全部通過。`ag-settings.test.js` 中名稱符合 `refresh active-guide` 的測試 1 項通過。`alignment.test.js` 15 項中 14 項通過，唯一失敗的 `public release templates use the validator schema...` 用 git stash 確認在修改前同樣失敗，與本輪無關。

- `node --check delegation-route.js` 通過。完整 log 留在 `/tmp/A010-red.log`、`/tmp/A010-green.log`、`/tmp/A010-pc.log`、`/tmp/A010-pc-baseline.log`。

## 未覆蓋事項與注意點

- **真實 T3 欄位：** 沒有實際呼叫 T3。`task_status` 欄位依工具說明採用 `status`、`hasPendingChildRuns`、`summary`、`workState`、`taskId`。若實際狀態值或欄位名稱不同，程式會判為 uncertain，不會收尾；host journey 應確認實際名稱。

- **模型身分：** 實際 model/effort 記錄的是 context 中的派送目標。`task_status` 若有回傳 `model` 或 `providerInstanceId`，必須相符；effort 只能依 host 送出的 target，無法從狀態結果交叉核對。

- **取消證據：** library 只能檢查交入物件的欄位，無法證明它真的來自 `task_status`。工具證據來源仍要由 host 負責。

- **隱含選擇：** 沒有明確 executor choice、但 internal 是唯一可選類型時，仍回傳 handoff。這時沿用舊規則，需要 external argv；重新呼叫同一輪也會因 brief 已存在而失敗。T3 host 應總是記錄明確的 `executor_choice`。

- **CLI：** 沒有新增完成用的 CLI 子命令；host 需以 Node 呼叫匯出函式。若之後要加 terminal 子命令，需要另外授權並跑 PTY journey。

- **工作範圍：** 只寫入 `/tmp/agentflow-A010-opus-y5Qmmo/clone`，沒有修改主工作區、`ag.json`、`.agents` 安裝副本、looper 或 external runner；沒有新增 remote 或 push。

## 交付資訊

- Source commit：`bc226d1bd5db492807dcc3c9b4c65ab577bb582a`，基於 `791420dc29f02a14792ad654ca8940fd5ebfc042`。

- changed_paths：
  - `skills/agentflow/scripts/delegation-route.js`

  - `skills/agentflow/scripts/delegation-route.test.js`

  - `skills/agentflow/references/delegation.md`

  - `skills/agentflow/scripts/README.md`

  - `skills/agentflow/scripts/prompt-compression.test.js`

  - `.agentflow/artifacts/A-010-t3-orchestrator/implementation-report.md`（本報告，另行提交）

Self-check: 已先以失敗測試重現 native threeways 要求 external argv 的問題，再完成最小實作。delegation-route 37 項全數通過，契約測試中只剩修改前已存在的兩項失敗。報告如實列出未實際呼叫 T3、未跑 PTY、共用檔案系統與欄位名稱假設等限制，沒有自行審查或宣稱 review PASS。
