* _2026-09-21 15:42:30 +0800 (GPT-5/better)_

- **結論：可通過。** 修正版已處理先前兩項阻擋：OpenCode plugin 改用正確的 `.opencode/plugins/` 路徑，且 Agentflow 自有的 discovery/parser/cache 子系統已延後，不再擴張本次需求。

- **相容性完整。** 計畫保留 schema-v7 讀取能力，以 schema v8 分離 `model` 與 `effort`，並明確要求既有 Codex、Claude 設定與流程的回歸測試。

- **下一步：** 可依此計畫進入實作；互動式模型探索仍應維持為後續提案。

Reviewed implementation commit: 525ff21867cf990786e5b57ebfa60c29e7285470

## 核對結果

- **Plugin 路徑已修正。** 「Implementation phases / 5」現指定 `.opencode/plugins/`，plugin 測試亦明確驗證從該目錄載入；原先會阻止 coordinator prompt／idle 整合生效的路徑錯誤已排除。

- **任意 provider/model 可原樣保留。** Schema v8 使用獨立的 `{ model, effort }` 欄位，允許結構化 `model` 包含 `/`，且 AC-2 要求 `custom-provider/model-x` 不經 allowlist 即抵達 OpenCode argv。

- **Reasoning variant 保持安全且不受固定清單限制。** `effort` 僅接受有界安全 token，不套用跨 provider 的 enum；實際相容性由 OpenCode 判斷。`default` sentinel 只控制省略 `--variant`，不會替換使用者選擇。

- **Discovery 已縮減至需求邊界。** 第 3 節只驗證 executable 可啟動、輸入格式安全，並把 `opencode models [provider]` 定位為使用者自行執行的探索命令；互動式 parser、cache 與 refresh 子系統明確延後。

- **Literal argv 邊界清楚。** OpenCode dispatch 固定為 executable 加 argument array，要求 `shell: false`，並以 `--model <model>`、`--variant <effort>`、`--format json`、`--dir <clone>` 及單一 final prompt argument 傳遞資料。Shell metacharacter fixture 必須在啟動前遭拒。

- **Schema-v7 相容策略足夠。** 計畫要求 v7 字串與 v8 object 都正規化為 `{ model, effort }`，只在明確設定變更或 migration 時寫回 v8，且至少跨一個 major release 保留 v7 reads。

- **Codex／Claude 回歸範圍完整。** 測試清單涵蓋既有 settings、hooks、dispatch、closeout、alignment、Windows 與 release suites，並要求 schema-v7 input 在既有兩個 host 上持續通過。

## 最小性核對

- **必要結構保留合理。** 結構化 model／effort 無法由延長既有 `<model>/<effort>` 字串安全取代，因為 `provider/model` 會造成分隔歧義。

- **既有執行機制得到重用。** OpenCode 僅擴充目前 family-specific argv builder 與 runner 邊界，沒有另建第二套 launcher。

- **額外探索功能已移除。** 本次只保留 explicit selection、基本安全驗證與 executable preflight；模型清單解析、快取及互動選擇不再是實作前提。

Verdict: PASS

Outcome: PASS

Minimality: PASS

Conformance: PASS

Self-check: 已依指定邊界核對修正版設計與 commit 差異，確認 plugin 路徑、任意 provider/model、安全 variant、延後 discovery、schema-v7 相容、literal argv 及 Codex／Claude 回歸覆蓋；未修改 clone、未執行網路探測、未呼叫 Agentflow、未委派或啟動其他 reviewer，且所有必要欄位各出現一次並以本行結束。
