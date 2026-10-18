* _2026-10-18 13:41:30 +0800 (gpt-6.1-sol/medium)_

# T3 orchestrator 派工接合設計

- 在 T3 Code 互動環境，委派工作優先使用內建 orchestrator；其他環境繼續使用 external runner。既有設定、模型選擇及驗收規則保留。
- 一般原生委派與審查已有資料介面，上一輪已實際使用 T3 子代理。缺口是 T3 選擇規則仍把寫入工作導回 CLI，以及 threeways 不接受原生結果，會直接回報 UNRESOLVED。
- 本設計接上現有原生介面和 threeways 的結果生命週期，不建立第二個排程器或頂層對話。尚未修改產品程式；派工與取消／完成驗收行為須先取得本設計的 Design Go。

## 原始要求與授權

> Agentflow 有external runner 但在t3 code 環境下，希望可以使用其orchestrator

- 本輪解讀為在 T3 互動式 host 中以 orchestrator 取代 CLI 派工，external runner 保留給其他環境和經確認不可用後的選擇。
- 所有提交與推送僅到 xup60521/agentflow；不更動工作區原有八個未提交檔案或已安裝的 .agents 副本。

## 已查證的現況

- `skills/agentflow/references/delegation.md` 已將 delegate_task/task_status/task_cancel 視為 internal candidate，但只偏好唯讀／審查；寫程式仍要求 external-runner clone，除非擁有者接受共用 checkout 寫入。
- `select_executor_action` 已能回傳 native-tool，`validate_execution_record` 已接受原生 handle、工具身分及取消後停止證據，不需要另外建立一套一般派工與紀錄格式。
- `launch_threeways_debate` 在選擇執行方式前就要求 runner_options/runner_arguments；選到 internal 後又立即回 UNRESOLVED。`execute_threeways_debate` 只讀取外部 runner 的 completed/result.value，無法處理尚在執行的原生任務。
- 互動式 queue 已有 claim_host_plan/finish_host_plan 原生交接；standalone looper 沒有互動式 MCP 工具。本輪不重寫 queue 或 standalone looper。
- 本輪 live orchestrator_capabilities 證實 appOwnedSubagents、asyncPolling、cancellation 均可用，且有 codex、claudeAgent、opencode provider。模型與 effort 必須使用這個即時 catalog，不保存固定清單。
- 現有 delegation-route.test.js 基線 27 PASS、0 FAIL。這只證明現有測試通過，不能證明缺少的原生 threeways 路徑可用。

## 正常使用流程

1. 使用者在 T3 對 Agentflow 交代工作或要求 threeways。
2. Host 確認 catalog 與 delegate_task/task_status/task_cancel 可用，依既有 allowed-worker 選 internal，記錄 task.executor_choice 和理由。這是 host 的明確選擇，不改 allowed-worker 順序的無優先級語義。
3. Host 從即時 catalog 確認 provider/model/effort 組合，凍結完整 brief 與穩定 clientRequestId，再呼叫 delegate_task。寫入工作先配置無 remotes 的 disposable clone，brief 指定唯一可寫 root、檔案及驗收命令；不因使用 T3 就授權改主 checkout。
4. 回傳 taskId 與 childThreadId 後保存於本輪記錄。queued/running/waiting 是等待中，依完成通知恢復；不提前寫失敗報告或重派。
5. 任務結束後由 task_status 讀取實際結果及是否還有未結束子工作。Host 檢查產物、diff 與測試，才接受完成；必要時將 clone 內的授權變更整合回來。
6. threeways 使用同一份 frozen brief、worker report、host resolution 規則；原生與外部結果都進入相同報告檢查及共識判斷。
7. 需要取消時，task_cancel 後再以 task_status 確認已停止且沒有 pending child runs。狀態不明時保留 pending/uncertain，不啟動第二個 writer。

## 最小實作邊界

- `skills/agentflow/references/delegation.md`：T3 有真實控制介面且 internal 被允許時，委派使用 orchestrator。寫入工作也可交給 T3，但工作 root 是 host 建立的無 remotes clone。記錄 shared filesystem、未強制唯讀及無 OS sandbox 的限制。非 T3 路徑不變。
- `skills/agentflow/scripts/delegation-route.js`：沿用 native-tool selection。將外部 runner 的參數驗證與 resolve_worker 延後到確實選 external 時；internal 不需 CLI executable 或 runner argv。
- threeways 的原生派送由互動 host 的真實工具完成，Node CLI 不自行假裝擁有 MCP。提供原生 handoff 及可重入的完成接合點，供 host 把實際工具回傳交回既有報告／共識邏輯。沒有工具的 standalone CLI 只回可執行的 handoff 說明，不宣稱已派送。
- 原生進行中的 handle 使用 host 既有 notebook/RUN 與 immutable brief 保存，不新增資料庫或全域 task registry。恢復必須綁定同一 taskId、來源、brief 與 round；原生完成接合點讀取既有 brief，不能再次寫入、覆蓋或偷偷啟動另一個任務。
- 外部和原生完成處理復用同一個 report/resolution 寫入與檢查函式，避免複製三次啟動上限、共識規則及錯誤診斷邏輯。
- `skills/agentflow/scripts/delegation-route.test.js`：補原生 handoff、等待、恢復、完成、失敗、取消與外部回歸測試。
- `skills/agentflow/scripts/prompt-compression.test.js` 與 `skills/agentflow/scripts/README.md`：只更新本次路由與原生結果接合的契約和用法。
- 若實作證明某個現有函式能直接重用，優先重用；不預先要求新模組、新設定、provider SDK、HTTP client、額外 daemon 或 shell CLI 代替 MCP。

## 原生結果與失敗處理

- Provider/model/effort 只來自 host 觀察到的 live catalog 和工具結果。worker 自報文字不能作為工具身分、實際模型或停止證據。不同模型的 effort 不可當作任意交叉組合。
- T3 pending 不轉成現有 execution record 的 completed/cancelled 等終態；持續保留實際 handle，等終態後再用既有 validator 驗證。
- completed 且 hasPendingChildRuns=false 才是可驗收候選。完成訊號、退出零或 report 的 Consensus: AGREE 都不能取代 host 驗收。
- 失敗或輸出不合契約時，沿用現有 truthful diagnostic/UNRESOLVED，不捏造 worker stamp、共識或 PASS。
- 原生 invoke 介面在尚未派出前確定 unavailable，或已證明工作停止且可安全重選時，才依現有選擇規則選 external；不得在 timeout、未知狀態或取消未確認時 fallback。
- 每個 review round 新呼叫 delegate_task 並使用獨立 clientRequestId。taskId 控制生命週期，childThreadId 僅作 storage/identity；不使用 t3_thread_send 繼續同一 review，也不以頂層 thread API 代替子代理。
- 使用者精確指定的模型／effort 不可偷偷替代。現有 ag.json 的 gpt-6-1-sol 與 live catalog 的 gpt-6.1-sol 不一致，本輪不改原有 dirty 設定；一般 tier 若依既有政策替代，必須記錄實際選擇與理由。

## Invariants

- INV-1：當 internal 被禁止或真實 T3 介面不可用時，維持既有政策限制；不得只因環境名稱就派出任務。違反條件為繞過 allowed-worker、虛構工具或變更設定取得權限。
- INV-2：T3 任務在尚未確認停止前始終只有一個有權寫入的任務。pending、timeout 或 handle 遺失都保留未解狀態；違反條件為重派或啟用 external writer。
- INV-3：開始時的 taskId、來源 commit、brief 與 round 在恢復及驗收時一致；來源或 handle 不符時拒絕。不得透過重試產生第二份 brief、覆蓋既有 report/resolution 或多算一次 worker start。
- INV-4：寫入工作開始時只授權 disposable clone 中的指定檔案，host 驗證後才整合；T3 shared permissions 仍如實揭露。違反條件為因 transport 切換擴大到主 checkout 或宣稱 clone 等於 OS sandbox。
- INV-5：沒有可驗收的完成結果時，不產生共識或 accepted completion。必須同時符合終態、無 pending child runs、報告契約與 host 驗收；違反條件為根據排隊成功或 worker 自述作 PASS。
- INV-6：非 T3 的外部路徑保留現有 command、clone、結果格式與限制。違反條件為在沒有 MCP 的 CLI 強制走 T3、依賴 T3 才能運作或移除 external runner。

## Acceptance criteria

1. 普通 T3 委派選 internal，使用 catalog 中的 provider/model/effort 與完整 brief 呼叫真實 delegate_task；一項實際子代理任務須留下 taskId/childThreadId、工具結果與 host 驗收，且沒有 external CLI spawn。對應 INV-1、INV-5。
2. threeways 的 internal-only case 即使沒有 external profile、CLI executable、runner_options、runner_arguments，也能取得有效 native handoff；偵測到的 task 不提前產生 worker diagnostic。用先失敗後修正的單元測試驗證。對應 INV-1、INV-6。
3. queued/running/waiting 以及 completed+pending children 都保持等待。相同 taskId 完成後只寫一次 report/resolution，合法報告才能進入共識判斷；重新讀取相同結果不重派、不覆寫。用 lifecycle unit tests 與一次 host/orchestrator 完成 journey 驗證。對應 INV-2、INV-3、INV-5。
4. 取消後只有 task_status 證明終止且無 pending children 才可選 replacement；lost handle/timeout/未確認取消都拒絕第二個 writer。用既有 execution validator 加必要的接合測試驗證，不能藉測試刻意取消其他工作。對應 INV-2、INV-5。
5. native 回報 taskId/來源／round 不符、缺報告、惡意或格式錯誤時，明確拒絕或 UNRESOLVED，不捏造報告。對應 INV-3、INV-5。
6. 非 T3 的 threeways 與 generic external 回歸測試保留，原 delegation-route 27 項基線加新測試全數通過；規則契約與跨平台語法檢查通過。若增加使用者可見 terminal 控制，另外跑實際 PTY journey。對應 INV-6。
7. 以 T3 委派一項 clone 內的最小寫入任務，host 驗證只有指定檔案改動、clone 沒有 remotes，主工作區八個原有髒檔內容不變。只把經驗證的授權變更整合，不把這視為 OS 隔離證據。對應 INV-4。

## Minimality check

- 最小成果是 host 在 T3 能用現有 orchestrator 委派，且 threeways 能正確接收／恢復該結果；外部 CLI 的 portable fallback 保留。
- 只改文件不足以補上 native threeways 立即 UNRESOLVED、要求外部 argv、pending 被寫成失敗診斷的程式缺口。
- 完整重寫 external-runner、looper 或建立 T3 專用排程器都不必要。一般 native selection、execution validator、queue claim/finish 與 immutable artifacts 均已有可重用邊界。
- 新的完成接合點只為連接真正的 host 工具結果與既有三方審查驗收，不增加 provider 名單、SDK、daemon 或額外持久化層。

## 驗證與交付順序

1. 設計獨立審查、修正必要異議、固定設計 commit，取得 Design Go。
2. 先以新測試重現 native threeways 的缺口，再實作最小接合與必要規則更新。
3. 跑 delegation-route 與受影響的規則契約測試；以真實 T3 task 和必要 PTY 證明 host journey，檢查結果與原有髒檔。
4. 對實作 commit 做獨立審查，處理本範圍內阻擋項目，再依重大變更規則取得 Result Go；只推送 fork。

Self-check: 以目前來源與 live T3 catalog 區分已有能力與缺口，列明不變條件、失敗邊界、最小方案及可觀察驗收；沒有宣稱未實作的原生 threeways 已可運作。
