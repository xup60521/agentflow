# A-010 Host 驗收

- 實作與獨立審查完成，已取得 `Result Go: caef93b`，來源已推送 fork PR #4。驗收來源為 `caef93bdea94a443a81eecbea951be83480781ea`，設計為 `dacf05601a5e09d3ca45ae75d9b5fd7a72e81b2d`。
- 使用者指定的實作模型為 T3 `claudeAgent/claude-opus-5-5`、effort=medium；兩輪實作均依此執行。獨立審查使用 `codex/gpt-6.1-sol`、reasoningEffort=high。第二輪 Verdict、Outcome、Minimality、Conformance 全部 PASS，前輪 R1/R2 已關閉。
- 交付行為：T3 host 可使用 native orchestrator 派工，寫入工作限 host 建立的無 remotes clone；threeways 接受原生 handoff、保存 context、等待、完成與重播。既有 external runner 保留。缺 context、未知或未停止任務不產生新派工；變更候選不能提前結案。
- Host 比對五個產品檔，沒有新增 registry、scheduler、SDK、daemon 或依賴。來源修改已提交本機，原有八個髒檔雜湊保持不變，安裝副本與設定未納入交付。實作只推送 origin/feature/t3-orchestrator，PR https://github.com/xup60521/agentflow/pull/4 的 base 是 fork main，沒有向 agfnow/agentflow 推送。

## 驗收證據

1. INV-1、驗收1/2：live catalog、真實 Opus clone 實作、GPT 原生 task 皆保存 provider/model/handle。Internal handoff 不需外部 executable/argv；路由41 PASS 包含原27項基線。
2. INV-2/3/5、驗收3/4/5：反例先4FAIL再41PASS；第二輪 live task 綁定原 context。候選失效、effort 改medium、choice改external重入，仍保持原handle/high且無新handoff。缺context保持uncertain，沒有report/resolution。取消與未知狀態以suite覆蓋，未刻意取消其他真實工作。
3. 同輪 raw task_status 為 completed/result_available、hasPendingChildRuns=false，summary與獨立報告相同。Host檢查PASS後完成得AGREE；重播replayed=true，三份產物內容和mtime不變，沒有額外delegate或外部模型CLI。見 native-status-r2.json、native-complete-proof-r2.json。
4. INV-6、驗收6：Host route41PASS、advanced rulebook契約1PASS；未變動language契約2PASS沿用。真實PTY /dev/pts/4、公開CLI exit0/PENDING，只產生brief。可重用native-pty-journey.cjs與兩輪proof保留。未重跑無關全套測試。
5. INV-4、驗收7：獨立Git clone無remotes，僅五個授權產品檔和交辦報告；host逐檔整合來源，八個原髒檔SHA-256一致。這不是OS sandbox證據，T3仍共享filesystem與permissions。

## 限制與後續

- 本輪沒有Windows實機執行；新增Node程式沒有平台專用命令。先前上游整合的Windows/Ubuntu CI成功不能當作本次新增功能已跑Windows的證據。
- 32KiB always-loaded budget和release template alignment為已重現的既有baseline失敗，本輪未修；不宣稱全產品suite全綠。
- Reviewer指出一個effort completion測試會先被缺brief擋下；已以原碼記憶體檢查獨立證明effort不符會明確拒絕。該測試的後續強化是非阻擋建議，本輪不追加來源變更以免反覆審查。
- Context由host既有round紀錄保存，不是額外registry。派工前保存frozen context、取得task後保存bound context；遺失時須先恢復紀錄，不能重建第二個writer。
- 依擁有者最新要求改為提交 fork PR #4，不直接更新 main；Windows 由擁有者另測，保留外來髒檔。
