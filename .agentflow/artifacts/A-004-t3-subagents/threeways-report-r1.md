* _2026-10-05 13:40:00 +0800 (gpt-6/unknown)_

- 同意以 T3 native adapter 替換 worker 啟動、等待與取消機制，保留 Agentflow 的工作契約、紀錄與 host 驗收，也保留 external runner 的跨環境支援。

- 不能只新增 `internal` 設定就宣稱完成替換。threeways 目前拒絕執行 native action；T3 完成通知也不等於 Agentflow 驗收完成。

- 原始碼已明確接受 native reviewer 滿足 `require-independent`，但這不代表權限隔離或強制唯讀。實作 worker 建議使用獨立 worktree，避免與 parent 同時寫入同一 checkout。

- 下一個 owner 決策是是否採用這個 adapter 方向，以及接受哪些隔離限制。本輪僅核對原始碼；T3 能力依提供的觀測資料，未重新實測。

1. **AMEND，主張 1：可替換派工機制，不能整包替換監督責任。** `delegate_task` 適合接手實作、advisor、cross-check 與 threeways 的 worker 派送。不過 threeways 現有入口選到非 external 時，仍回傳 `UNRESOLVED`，需要接入 native 結果處理。見 [delegation-route.js:154](/tmp/agentflow-external-runner-fDNSfX/clone/.agents/skills/agentflow/scripts/delegation-route.js:154)。

   完成通知可以接手喚醒 parent，但通知遺失、handle 遺失與取消後是否停止，仍需狀態查詢和證據。現有驗證要求已啟動的 cancelled worker 有 `stop_verified`，不接受只記錄取消請求。見 [delegation-route.js:538](/tmp/agentflow-external-runner-fDNSfX/clone/.agents/skills/agentflow/scripts/delegation-route.js:538)。若允許 parent 結束 turn 後等待通知，也要明確調整現有「worker pending 時不結束 turn」規則。見 [delegation.md:47](/tmp/agentflow-external-runner-fDNSfX/clone/.agents/skills/agentflow/references/delegation.md:47)。

   Live catalog 適合驗證 provider、model 與 effort 是否可選。`best/better/basic/cheap` 對應哪些工作，仍是 Agentflow 的選擇政策；外部 CLI 的 profiles 也仍有用途。

2. **AGREE，主張 2：worktree 建立與 looper 派工只能部分替換。** `t3_thread_launch` 能接手建立 worktree 和綁定 thread，但 `agf new` 還建立 stream notebook、複製設定、提交開啟紀錄，並在有 remote 時推送。見 [agf.js:1956](/tmp/agentflow-external-runner-fDNSfX/clone/.agents/skills/agentflow/scripts/agf.js:1956)、[agf.js:1988](/tmp/agentflow-external-runner-fDNSfX/clone/.agents/skills/agentflow/scripts/agf.js:1988)。T3 建好的 worktree，需要接回這些 stream 紀錄與路徑規則。

   looper 已有互動式接點，不必先重寫整個程序管理器。`claim_host_plan` 可透過共同 selector 選擇 native worker；`finish_host_plan` 驗證 execution record、來源、ownership、completion 與歸檔。見 [looper.js:1845](/tmp/agentflow-external-runner-fDNSfX/clone/.agents/skills/agentflow/scripts/looper.js:1845)、[looper.js:1894](/tmp/agentflow-external-runner-fDNSfX/clone/.agents/skills/agentflow/scripts/looper.js:1894)。

3. **AGREE，主張 3：保留 Agentflow 的紀錄、決策與驗收功能。** 提供的 T3 能力沒有 notebook、Ask ownership、Design Go／Result Go、round-linter、tracker 或逐位元保留歷史的 compaction 等價功能。現有規則也把 notebook 歷史與 consequential gates 明確分開管理。見 [SKILL.md:50](/tmp/agentflow-external-runner-fDNSfX/clone/.agents/skills/agentflow/SKILL.md:50)、[SKILL.md:133](/tmp/agentflow-external-runner-fDNSfX/clone/.agents/skills/agentflow/SKILL.md:133)。

   reviewer 的啟動方式可換，`cross-check-plan.js` 的審查深度與 Outcome／Minimality／Conformance 契約仍保留。見 [cross-check-plan.js:81](/tmp/agentflow-external-runner-fDNSfX/clone/.agents/skills/agentflow/scripts/cross-check-plan.js:81)。Hooks 的事件來源日後可調整，但 prompt capture 與 closeout 責任不能因 T3 有 thread 就省略。

4. **AMEND，主張 4：`internal` 是正確接點，最小路徑需要完整的結果轉接。** 現有 `ag.json` 確實只允許 external 與 host。新增 internal 後，如果多種 executor 都符合条件，selector 不會依陣列順序自動偏好 T3；host 要提供有理由的 `executor_choice`。見 [ag.json:15](/tmp/agentflow-external-runner-fDNSfX/clone/ag.json:15)、[delegation-route.js:467](/tmp/agentflow-external-runner-fDNSfX/clone/.agents/skills/agentflow/scripts/delegation-route.js:467)。

   除了 taskId，還需要 native tool identity、childThreadId、來源、requested／actual model 和 effort、輸出、changed paths 與 host acceptance。execution record 不允許 internal transport 偽造 CLI command。見 [delegation-route.js:504](/tmp/agentflow-external-runner-fDNSfX/clone/.agents/skills/agentflow/scripts/delegation-route.js:504)、[delegation-route.js:533](/tmp/agentflow-external-runner-fDNSfX/clone/.agents/skills/agentflow/scripts/delegation-route.js:533)。審查紀錄宜以 childThreadId 作 reviewer 與 handle，另保留 taskId 供查詢和取消。

5. **AMEND，主張 5：風險成立，但獨立性與隔離基準可以說得更確定。** Agentflow 的 review validator 已接受 `native-review`，要求不同 reviewer identity、真實 tool，以及與 reviewer 相符的 handle。`require-independent` 沒有自動要求不同 family、fresh context 或強制唯讀。後兩者是另外的要求。見 [completion-record.js:288](/tmp/agentflow-external-runner-fDNSfX/clone/.agents/skills/agentflow/scripts/completion-record.js:288)。既有測試也明確描述 shared context／permissions 的 native review 可通過該政策；本輪只讀取測試，未執行。見 [review-policy.test.js:74](/tmp/agentflow-external-runner-fDNSfX/clone/.agents/skills/agentflow/scripts/review-policy.test.js:74)。

   disposable clone 提供 checkout 分離與無 remote 的保障，但 external runner 自己也聲明 OS confinement、remote-provider cancellation 都是 `not_proven`。T3 worktree 同樣不能被描述為 OS sandbox。見 [external-runner.js:637](/tmp/agentflow-external-runner-fDNSfX/clone/.agents/skills/agentflow/scripts/external-runner.js:637)、[streams.md:35](/tmp/agentflow-external-runner-fDNSfX/clone/.agents/skills/agentflow/references/streams.md:35)。T3 依賴應留在 adapter；保留 external 路徑可維持可攜性。

- **Host 漏掉：child 不繼承對話，brief 必須自行完整。** 原始 Ask、最新修正、來源版本、允許輸出、禁改範圍、驗收條件與指定寫作指引，都需要明確傳入。現有 frozen brief 已列出這些責任，不能假設 child 知道 parent 的上下文。見 [delegation.md:33](/tmp/agentflow-external-runner-fDNSfX/clone/.agents/skills/agentflow/references/delegation.md:33)。

- **Host 漏掉：nested-worker containment 尚無 T3 等價證據。** external runner 會偵測 nested worker，將結果標為違規並隔離相關證據。提供的 capabilities 沒有證明 T3 能禁止 child 再派工，或保證取消涵蓋其後代。這項保障不能隨 process transport 一起宣稱已被替換。見 [external-runner.js:561](/tmp/agentflow-external-runner-fDNSfX/clone/.agents/skills/agentflow/scripts/external-runner.js:561)、[external-runner.js:620](/tmp/agentflow-external-runner-fDNSfX/clone/.agents/skills/agentflow/scripts/external-runner.js:620)。

- **Host 漏掉：不能把所有 external worker 都視為 clone worker。** standalone looper 直接以 `cwd: context.root` 啟動 CLI worker，沒有經過 external runner 建立 disposable clone。它與 threeways external runner 的隔離基準不同。見 [looper.js:1630](/tmp/agentflow-external-runner-fDNSfX/clone/.agents/skills/agentflow/scripts/looper.js:1630)。

- **Host 漏掉：目前已禁止以安靜時間判定 stall。** `stall_timeout_ms` 非零會直接報錯。因此這不是一個需要完整移植到 T3 的現行功能；應保留活動觀察和有授權的 deadline。見 [external-runner.js:661](/tmp/agentflow-external-runner-fDNSfX/clone/.agents/skills/agentflow/scripts/external-runner.js:661)。

- **不確定性 1：native T3 child 是否符合獨立審查？** 可以符合目前的 `require-independent`，前提是允許 internal，且紀錄有真實的獨立 reviewer identity、tool 和 handle。依提供的 T3 觀測，可記錄 fresh context；不同 provider 若對應不同模型家族，可記錄 family diversity。permissions 與強制唯讀仍需分別如實記錄，不能由 `role=review` 或 `interactionMode=plan` 推定。宣稱 fresh 或 enforced read-only 時，validator 還要求相應 proof。

- **不確定性 2：實作 child 可否寫 parent checkout？** 本輪證據不足以支持把它設為一般預設。建議使用 disposable clone 或 T3 worktree thread，讓 host 能獨立檢查改動，再整合。單一 writer 的序列工作可以另作選擇，現有 looper 就採這種方式，但需要保留來源基準、ownership 與 changed-path 驗收。若使用 T3 worktree thread，也要管理該 top-level thread 的完成與停止，不能直接假設 child task 的取消語意適用。

- **不確定性 3：looper 值得移植嗎？** 建議先接既有互動式 claim／finish 路徑，不移植整個 standalone looper。`create_threads` 適合批次啟動彼此獨立的工作，`schedule_task` 適合定時觸發；提供的能力沒有證明它們能取代 frozen queue 的順序、依賴、digest、單一 ownership 與完成歸檔。這些契約仍由 Agentflow 保留。見 [looper.md:21](/tmp/agentflow-external-runner-fDNSfX/clone/.agents/skills/agentflow/references/looper.md:21)。

- **不確定性 4：tier／model-passing 缺口是真的嗎？** 是。`resolve_threeways_worker` 呼叫 `resolve_profile_tier`，後者把 model／effort 放在 metadata，`args` 只取 `profile.command.slice(1)`。目前 Codex profile 因而得到 `["exec"]`。threeways launcher 僅接上 caller 提供的 `runner_arguments`，沒有自行加入模型或 effort 參數。見 [ag-settings.js:1742](/tmp/agentflow-external-runner-fDNSfX/clone/.agents/skills/agentflow/scripts/ag-settings.js:1742)、[ag-settings.js:1815](/tmp/agentflow-external-runner-fDNSfX/clone/.agents/skills/agentflow/scripts/ag-settings.js:1815)、[delegation-route.js:156](/tmp/agentflow-external-runner-fDNSfX/clone/.agents/skills/agentflow/scripts/delegation-route.js:156)。

- **這個缺口影響模型使用的可信度，但不改變替換方向。** caller 若沒補參數，不能宣稱 threeways 實際使用了設定的模型與 effort。looper 已另外加入兩者，所以不能擴大成「所有派工都漏傳」。見 [looper.js:1287](/tmp/agentflow-external-runner-fDNSfX/clone/.agents/skills/agentflow/scripts/looper.js:1287)。`gpt-6-1-sol` 與提供的 T3 catalog `gpt-6.1-sol` 不同，也不能直接照抄；本輪沒有證明 CLI 是否接受前者。相關修正僅列為後續提案。

Consensus: AGREE

Self-check: 僅只讀核對；未啟動 Agentflow、未委派、未修改檔案、未執行測試或網路寫入；T3 能力採提供的觀測，未重新驗證；精確模型部署版本與 effort 未提供，未冒稱 gpt-6.1-sol。
