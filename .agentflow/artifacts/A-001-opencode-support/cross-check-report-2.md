* _2026-09-21 15:40:18 +0800 (GPT-5/better)_

- **結果：通過。** 修正版已解除首輪兩項 blocker：plugin 路徑改為 `.opencode/plugins/`；必要 runtime discovery 已移除，改由使用者明示 `provider/model` 與 reasoning variant，`opencode models` 僅作使用者查詢指引。

- **需求保留完整。** 計畫仍保證任意安全的 provider/model 與 provider-specific variant 原值傳遞，不設硬編碼 catalog、不自動替換選擇，也不讀取或保存 provider credentials。

## 核對證據

- **精確版本。** HEAD 與指定來源均為 `525ff21867cf990786e5b57ebfa60c29e7285470`；精確 diff 只修正既有設計的 discovery、plugin 路徑、測試描述、風險與 minimality 說明，未擴張實作範圍。

- **首項 blocker 已修正。** 「Implementation phases / 5」與 plugin tests 均使用 `.opencode/plugins/`；setup、inspection、backup、uninstall、ownership-safe removal 仍由第 6 階段覆蓋。

- **第二項 blocker 已修正。** 「Configuration design」要求 setup 從明示 flags 取得 model 與 effort；「Add bounded OpenCode preflight」只驗證 executable 與安全語法，將 model/auth/variant 相容性留給 OpenCode，並明確延後 Agentflow discovery/parser/cache subsystem。

- **Schema v7 相容性具體。** Schema v8 設計要求同時讀取 v7 字串與 v8 結構、正規化為 `{ model, effort }`，僅在明示設定變更或 migration 時寫回；rollout 要求至少一個 major release 保留 v7 reads，AC-1 要求 Codex/Claude 以 v7 input 通過。

- **任意值傳遞具體。** Structured `model` 允許 `/`；`effort` 僅受 bounded safe-token 驗證而非固定 enum。AC-2 使用 `custom-provider/model-x` 與非標準安全 variant，provider matrix 還要求不同 variant vocabulary 與 `default` sentinel。

- **Literal argv 邊界具體。** 現有 runner 已用 `spawn(executable, args, { shell: false, stdio: ['ignore', ...] })`。計畫要求沿用 argument array、final prompt argument、closed stdin、無 remotes clone 與 nested-worker containment；AC-3 要求精確 argv 及 shell metacharacter 拒絕測試。

- **既有 host 回歸完整。** 現況的 host markers、STATUS grammar、hook paths、CLI validation 與 family flags皆硬編碼 Codex/Claude；計畫逐一納入 registry、settings、dispatch、hooks、setup、STATUS、process-tree、help、Windows launcher及 release suites，並以 INV-1、AC-1 和 regression tests 保護既有語意。

## 檢視的簡化

- **進一步刪除 discovery：成立且已採用。** 可刪除 runtime `opencode models` adapter、parser、cache、refresh UX 與 membership preflight；修正版已全部延後，只保留文件指引及 executable preflight。

- **合併既有邊界：成立。** OpenCode dispatch 可擴充既有 family argv builder 並重用 `external-runner-v1`，plugin 可轉譯事件後重用既有 notebook writer 與 closeout referee；無需另一套 runner、credential layer 或 closeout engine。

- **無可再刪的核心概念。** Schema migration 解決 `provider/model` 與 effort 分離；host adapter 收斂現存散落判斷；plugin 提供 coordinator prompt/idle 語意；dispatch adapter 實現明示 worker 選擇。再刪任一項會失去相容性或第一級 OpenCode 支援。

Outcome: PASS

Minimality: PASS

Conformance: PASS

Self-check: 已唯讀檢查指定 commit、修正版精確 diff、首輪報告、A-001、指定 host/configuration/dispatch 邊界與 writing guidance；未寫入 repository、未使用網路、未執行 Agentflow、未委派或啟動巢狀 reviewer，且三項 verdict 各出現一次。
