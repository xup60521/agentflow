* _2026-10-05 13:50:00 +0800 (claude-opus-5-5/unknown)_

# Threeways host resolution (round 1, recorded before reading the worker report)

Selected design: 把 T3 `delegate_task` 當成 Agentflow 既有 `internal` 執行種類的轉接層；保留 external-runner 作為非 T3 環境的後備；串流、notebook、結案與審查紀錄規則不變。最終判斷寫在 devlog A-004 Reply，並納入 worker 報告的意見。

Rejected alternatives: 直接刪除 external-runner／looper 改用 T3（失去可攜性，非 T3 主機無法使用）；完全不採用 T3（放棄現成的非同步通知、取消與即時模型清單）。

Evidence: T3 `orchestrator_capabilities` 於 2026-10-05 的實際輸出；`delegation-route.js` 已有 internal/native-tool 種類與 handle 檢查；`ag.json` 目前 `allowed-worker` 不含 `internal`。

Model-family limitation: 主持人為 Claude（claude-opus-5-5），審查者為 codex gpt-6.1-sol，屬不同家族；兩者共用同一台機器與帳號權限。

Next human decision: 是否要做轉接層設計（需另一個 Ask 與 Design Go），以及是否把 `internal` 加入 `allowed-worker`。


Worker family diversity: different-family

Worker family limitation: none recorded

Consensus: AGREE

Attempts: 1

Self-check: The host recorded the debate resolution without authorizing implementation.
