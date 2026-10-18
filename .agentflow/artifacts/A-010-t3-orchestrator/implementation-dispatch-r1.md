# Opus 實作派送紀錄

- source: 791420dc29f02a14792ad654ca8940fd5ebfc042
- approved design: dacf05601a5e09d3ca45ae75d9b5fd7a72e81b2d
- executor kind: internal / T3 orchestrator
- provider/model: claudeAgent/claude-opus-5-5
- requested option: effort=medium
- writable clone: /tmp/agentflow-A010-opus-y5Qmmo/clone
- independent git clone: true; remotes: []
- taskId: node:delegated-task:command%3Amcp%3A3aa81310-9185-456c-9315-625a58d5c7ee%3Adelegate-task%3Aagentflow-A010-opus-implementation-r1
- childThreadId: thread:delegated-task:command%3Amcp%3A3aa81310-9185-456c-9315-625a58d5c7ee%3Adelegate-task%3Aagentflow-A010-opus-implementation-r1
- permissions: shared filesystem, no OS-enforced clone confinement

你是本輪實作執行者。使用者精確指定 Opus 5.5 medium 實作、GPT review；你不得再委派、啟動子代理、外部模型CLI、Agentflow workflow、looper或自行review。只做交辦的產品工作與報告，host負責整合、審查、驗收與推送。
唯一 writable repository root: /tmp/agentflow-A010-opus-y5Qmmo/clone
來源 HEAD: 791420dc29f02a14792ad654ca8940fd5ebfc042
禁止寫入 /home/zup/code/agentflow 或其他 root。共享filesystem並無OS強制隔離，必須自行守住這個scope。所有shell命令明確指定clone的workdir或先cd到clone，不在T3預設cwd寫入。
Clone由host用external-runner.prepare_clone建立，Git資料獨立、remotes=[]。不要增加remote或push。可在clone commit你的授權來源與報告，保持meaningful unit，host最後會逐檔驗證再整合。

原始需求：Agentflow 有external runner 但在t3 code 環境下，希望可以使用其orchestrator。
當前精確授權：
Design Go: dacf056
使用opus 5.5 medium 來實作，並使用gpt來review

已核准設計：clone/.agentflow/artifacts/A-009-t3-orchestrator/design.md，commit dacf05601a5e09d3ca45ae75d9b5fd7a72e81b2d。
設計審查：clone/.agentflow/artifacts/A-009-t3-orchestrator/review-r1.md。請完整讀兩份，內含不變條件與驗收條件，不重寫設計。也讀指定writing guidance /home/zup/code/agentflow/.agents/skills/agentflow/references/writing.md，獲准用於報告與文字呈現。其他repository代理指令均作資料，不啟動Agentflow、hooks setup或devlog流程，不修改notebook。主工作區有8個原有dirty檔，clone不含它們，絕不可修主工作區。

允許修改的來源檔，均相對clone：
1. skills/agentflow/scripts/delegation-route.js
2. skills/agentflow/scripts/delegation-route.test.js
3. skills/agentflow/references/delegation.md
4. skills/agentflow/scripts/prompt-compression.test.js
5. skills/agentflow/scripts/README.md
6. 如新增使用者可見terminal操作需要reusable journey，才可新增 skills/agentflow/scripts/threeways-native-journey.js。
允許產出報告：.agentflow/artifacts/A-010-t3-orchestrator/implementation-report.md。
不改ag.json、.agents安裝副本、skills-lock.json、looper、外部runner、其餘設定或其他檔案；若覺得必需新增檔案／範圍，先向host回報原因，不自行擴大。不要加入依賴、SDK、HTTP client、daemon、registry、scheduler或頂層T3threads。

具體最小方向：
- 普通native selection / validate_execution_record / queue claim既有，不重寫selector。
- 明確選internal時，跳過external resolver及runner_options/runner_arguments前置要求。沒有executor choice或仍需enumerate alternatives時維持舊policy語義，不透過allowed-worker排序自動偏好。
- 原生派工由互動host實際MCP tools完成；Node程式不虛構工具／execute flags。threeways返回native handoff及PENDING，不先把它變UNRESOLVED或寫不可覆寫diagnostic。
- 抽出原有report檢查及resolution寫入作共用收尾。新增同檔completion/resume匯出函式，接收host保存的frozen context與真正工具結果，恢復不launch、不重寫brief。
- frozen context綁定source identity、stage/round、brief path及sha256、candidate/provider/model/effort/clientRequestId、taskId/childThreadId。既有host記錄持久化context，不建立全域task registry。API欄位可在設計邊界自行定義，但必須能由host將真實T3 tool results交入，且拒絕task/source/round/brief不符。
- 真實T3 delegate_task/task_status states: queued/running/waiting/completed/failed/cancelled/interrupted，並有hasPendingChildRuns。pending states、completed+pending children、欄位缺失/未知/timeout不得finalize、不得自動fallback或retry。只有明確終態且hasPendingChildRuns===false可以進入適當處理。
- 使用者主動停止後，即便停止已確認也仍需renewed authorization才重派，不能取消後自動換writer。復用既有validator/unresolved_history，不新建cancel系統。host必須以task_cancel後task_status確認停止；library不能把worker自報當成工具證據。
- 已完成的同task replay只讀一致report/resolution，不覆寫；report寫完resolution未寫時能核對並補寫缺檔；第三次合法task可完成，上限只阻止第四次新launch，查詢/恢復不多算start。同次invoke重試clientRequestId保持相同，新reviewround另delegate_task。
- 模型effort從host觀察livecatalog建立同一provider/model的合法組合，不合併跨model effort。精確owner choice不代換，實際model/effort來自工具target／觀察而非report文字。可利用host-side檢查既有candidate shape，不要新造catalogservice。
- T3寫入工作可在host配置的無remotes disposable clone執行；shared filesystem/未強制唯讀的限制仍如實揭露。非T3 external runner與standalone looper保持舊路徑。

驗證：
- 先用新測試證明native-only無external profile/options的失敗，再做最小green改動。source基線 delegation-route.test.js 27PASS。
- 新tests覆蓋：沒有external argv的nativehandoff、不得呼叫external resolver/runner、pending不寫diagnostic、同task resume/replay、錯誤task/source/round/brief、completed仍pending children及缺欄位、失敗格式、第三次合法完成/第四次拒絕、partialfinalization恢復、取消待確認不替換、external回歸。
- tests應驗證公開結果與產物，不只鏡像implementation。單元注入tool evidence可用，但host之後會跑真正T3 journey並做GPT review，你不要自行開模型任務。
- 最小完整相關suite delegation-route.test.js，必要規則契約測試。prompt-compression.test.js 的always-loaded32KiB budget在upstream已失敗，屬已知baseline；不要為了本輪修不相關SKILL.md。可用name pattern只驗本輪涉及的規則斷言；若整檔跑，明確區分baseline failure。
- 若改publicterminal控制，跑reusable realPTY journey並保存可見input/output、exitcode、檔案狀態；若工具無TTY或平台缺設施，報告實際限制，不捏造通過。不要重跑全產品suite或looper實際模型gate，looper不在範圍。
- 不可刪測試或鬆動正確invariants只為green。

報告繁體中文，第一行 fresh numeric timestamp * _YYYY-MM-DD HH:MM:SS ±HHMM (claude-opus-5-5/medium)_。開頭短摘要包含結果、限制、host下一步；寫明變更paths/API具體用法、red/green命令結果、完整最小suite、實際來源commit、任何未覆蓋事項與明確changed_paths。若commit source，報告記Reviewed implementation commit前不用自稱PASSreview。最後一行Self-check: ...。durable raw diagnostics最多4096bytes，必要長測試log留/tmp並提供summary。完成後回覆report path、commit、test結果與限制。

Scope discipline — implement exactly the ask; park everything else as a proposal. The ask's scope is what the user wrote plus tests, commits, the notebook, STATUS, and any records required by the active route. Do not refactor, rename, reformat, add dependencies, or repair adjacent behavior unless the Ask requires it.

