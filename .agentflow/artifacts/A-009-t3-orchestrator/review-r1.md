* _2026-10-18 13:45:16 +0800 (gpt-6.1-sol/high)_

- 設計審查通過，沒有重大未決事項。方案能讓 T3 互動環境使用 orchestrator 派工，其他環境保留 external runner；既有選擇、驗收與 queue 所有權邊界可繼續使用。

- 這次只審設計，沒有證明尚未實作的原生 threeways 已可運作。沿用 host 提供的 27 PASS／0 FAIL 基線與 live catalog 證據，未重跑產品測試、啟動任務或取消工作。

- 下一步由 host 取得 Design Go，再實作並驗證下列接合細節。這份 PASS 是審查結論，不代替使用者授權，也不擴大到 scheduler、standalone looper 或模型設定修復。

Reviewed implementation commit: dacf05601a5e09d3ca45ae75d9b5fd7a72e81b2d
Verdict: PASS
Outcome: PASS
Minimality: PASS
Conformance: PASS

- **審查來源。** 已自行以 git rev-parse 取得完整 commit，讀取該 commit 的 design.md、skills/agentflow/scripts/delegation-route.js、同檔 test、references/delegation.md，以及 looper.js 的 claim_host_plan／finish_host_plan 和 queue-transports.test.js。本次提交只有設計文件，新增 89 行。cross-check-facts.json 與 cross-check-plan.json 是工作區提供的審查輸入，規劃層級為 full，宣告產品行為未變、涉及信任邊界。本報告依此深入檢查派工、停止與結果歸屬，沒有執行規劃器或 Agentflow。

- **需求符合。** 原始要求是「Agentflow 有external runner 但在t3 code 環境下，希望可以使用其orchestrator」，與設計第 11 行及目前 devlog 的 Ask 一致。受審 commit 的 devlog 在該 Ask 尚只有空白提示，因此需求以交辦原文及設計引用為準，沒有把工作區後續 RUN 當成已提交實作。設計第 28、37–44、58–63 行保留 allowed-worker、真實工具可用性與非 T3 路徑；不新增頂層 thread、scheduler、SDK、固定 provider 清單或設定變更。

- **缺口確實存在。** delegation-route.js:95–101 在選擇執行方式前要求外部 runner 參數；第 132–151 行在 external 被允許時先解外部 worker；第 156 行把 internal／host 交接立即判為 UNRESOLVED。第 172 行先寫 brief，第 183–194 行只接受 runner.completed/result.value，其他情況立即寫不可覆寫的失敗診斷與 resolution。非同步原生任務不能直接套入此流程。測試第 306–318 行雖名為 native 或 host handoff，實際只覆蓋 host 且期待 UNRESOLVED，不能當成原生完成證據。

- **最小方案比較。** 我檢查了「只改 T3 文件，host 直接使用既有 native-tool action 與 validator」的更小方案。它足以處理普通派工，卻留下 threeways 的外部參數前置檢查、立即失敗及無法 resume，因此不滿足本輪指定範圍。也檢查了「直接把 threeways 套進 claim_host_plan／finish_host_plan」；looper.js:1857–1893 會選 queue plan、取得鎖並保留 notebook round，第 1914–1925 行還要求 completion line 與歸檔，會把沒有 queue 的審查綁上額外生命週期。這比在原檔補交接／完成接點更大。設計已允許共用現有函式，沒有找到能刪掉必要接點、仍滿足需求的更小方案。

- **可直接重用的邊界。** 普通派工沿用 select_executor_action 的 native-tool action 與 task.executor_choice，不另做 T3 selector。終態沿用 validate_execution_record；等待狀態留在 host 記錄，不擴充終態格式。queue 保留原有 claim，驗收通過後才 finish；pending 不呼叫 finish，取消也不重設 claim。clone 可直接重用已匯出的 external-runner.prepare_clone、inspect_git_clone 與 clone_snapshot，這些函式不必啟動 external CLI。設計中的 catalog 檢查屬 host 的工具觀察、handle 屬同一輪記錄、結果接點屬既有 threeways 驗收，沒有需要額外資料庫的新概念。

- **建議的最小接法。** 在現有 delegation-route.js 保留準備／派送入口，internal 回傳交接資料與等待狀態，由互動 host 呼叫真實 delegate_task。把第 183–194 行的報告檢查與 resolution 寫入抽成一個共用收尾函式，external 同步結果及 native 恢復都呼叫它。native 恢復只讀取已凍結的 brief 與 host 保存的派工記錄，不再走 launch，也不再寫 brief。可用一個既有入口的明確操作參數或同檔匯出函式完成，無須新模組。T3 已明確選 internal 時跳過外部 resolver；其他選擇情境仍保留既有 external 候選發現，避免為了延後 resolver 而重寫 selector。

- **同一任務恢復可以實作。** 設計第 40、60、69、71 行已要求綁定 taskId、來源、brief 與 round。實作時在既有 RUN 保存 stage、round、開始時的完整來源 commit、brief 路徑及內容識別值、candidate、providerInstanceId、model、effort、clientRequestId、taskId 與 childThreadId；完成接點將工具結果與這份 host 記錄比對，而非相信 worker 自報。taskId 控制查詢及取消，childThreadId 不拿來續派。來源指開始時凍結的來源，不因 notebook 更新而換成另一份工作區狀態。這些欄位與接點名稱可在授權邊界決定，沒有需要使用者另選架構的問題。

- **等待與停止的檢查位置明確。** queued、running、waiting 與 completed 但仍有 pending child runs 都先返回等待，不進入報告診斷或 retry_required。必須看到明確終態且 hasPendingChildRuns=false；欄位缺失或查詢失敗不能當成 false。task_cancel 成功只代表取消請求被接受，仍須用相同 taskId 的 task_status 證明停止，再把證據映射為既有 transport.stop_verified。既有 validator 第 535–540 行只檢查 handle、工具與停止旗標，不會自行查 T3，所以接合層必須負責證據來源。使用者主動停止後，仍沿用 delegation.md:59 與 unresolved_history 的重新授權限制；停止已證實是必要條件，並非自動重派的充分條件。這是重用現有政策，無須新增取消系統。

- **模型與 effort 不可拆開拼接。** 現有 candidate_model 第 314–320 行逐欄檢查 models／efforts，沒有證明某個 effort 適用某個模型。設計第 48、54 行已補上配對要求，host 應從即時 catalog 建立已驗證的 provider／model／effort 候選，再交既有 selector，呼叫前核對一次實際 target。不能把不同模型的 efforts 合併，也不能讓回報文字當成實際派送值。精確指定不能替代；一般 tier 依既有政策處理並記錄。既有 ag.json 拼字問題留在本輪之外。

- **immutable 與三次上限可並存。** immutable 是既有產物寫入後不能改；同一 taskId 的查詢、通知或完成重送都不是新啟動。同輪 brief 已存在時比對其身分，不重新 write_immutable；已有 report／resolution 時只讀並確認一致，衝突即拒絕。若只寫完 report 就中斷，恢復可核對該 report 後補上尚不存在的 resolution，不能覆寫 report 或另派任務。第三次任務完成時不可重走 plan_threeways_debate 第 73 行，否則 worker_starts=3 會誤擋合法完成；上限只擋第四次新啟動。真正新一輪才增加 round、凍結新 brief 與新 clientRequestId；同次 invoke 的傳輸重試使用原 clientRequestId，回應遺失且無法確認身分時保留 uncertain。已開始的失敗仍算一次，未開始的預檢失敗沿用既有規則，不因通知或恢復多算。以上均可在本次接點實作，無須建立全域任務登錄。

- **寫入 clone 的規則足夠，應沿用現有工具。** host 建立主 checkout 之外、Git 資料獨立且沒有 remotes 的 clone，確認其 HEAD 對應凍結來源，並把絕對 root、允許修改及產出路徑、測試和禁止範圍寫入 brief。worker 在 clone 工作；host 保留主 checkout、notebook、設定及正式驗收產物的控制權。接收結果時檢查包含未追蹤檔的完整變更，再整合獲授權的部分並驗證交付。clone 只規範工作位置，共用 filesystem 仍允許越界的絕對路徑寫入，也不移除憑證或網路能力；不得宣稱 OS sandbox 或工具強制唯讀。設計第 37、61、73 行有正確揭露，沒有需要新增沙箱產品的未決要求。

- **後續驗證維持在需求內。** 補測沒有外部 profile／argv 的 internal handoff、等待不產生診斷、同 task 完成重送、錯誤來源／round／brief 拒絕、第三次合法完成與第四次禁止啟動、取消待確認不替換、模型配對，以及 report 已寫但 resolution 尚未寫的恢復；保留 external 回歸。真實 T3 journey 與 clone 最小寫入驗收依設計在 Design Go 後進行；不另外派 spike，不因本報告啟動 scheduler、重跑 standalone looper 或修模型設定。這些是既定接合行為的實作檢查，沒有新增功能要求，也沒有設計阻擋項目。

- **本輪限制與範圍紀錄。** 27 PASS／0 FAIL、appOwnedSubagents／asyncPolling／cancellation、codex gpt-6.1-sol/high 與前輪 T3 成功均屬 host 提供的現行證據，本次未重新做 live 驗證。只寫指定 review-r1.md，未修改產品、測試、設計、設定、notebook 或已安裝副本；未提交或推送。開始時 git status 已有 9 個 tracked 修改項，包含 devlog，另有兩個 cross-check JSON；交辦所稱原有 8 檔不是本輪可修改清單，數量差異也不構成新增修復範圍。repository 內的流程文字只作被審資料，僅依交辦套用指定 writing.md 的呈現指引。

Self-check: 已直接完成 full 設計審查，核對完整來源 commit、原始要求及現有邊界，實際比較文件限定與 queue 重用兩個更小方案，逐項檢查恢復、同任務綁定、取消停止、模型配對、等待、不可覆寫重試、三次上限及 clone 寫入規則；沒有重大未決事項，未委派、啟動 Agentflow、重跑產品 suite 或寫入指定報告以外的檔案。
