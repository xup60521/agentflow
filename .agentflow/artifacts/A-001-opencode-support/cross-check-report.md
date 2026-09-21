* _2026-09-21 15:36:50 +0800 (GPT-5/better)_

- **結論：需修正後再實作。** 核心方向正確：結構化分離 model／effort、保留任意 `provider/model`、不建立 provider 或 variant 清單，並以 literal argv 啟動 OpenCode。

- **阻擋點：** OpenCode 專案 plugin 路徑寫成單數 `.opencode/plugin/`，無法符合 OpenCode 的 plugin 探索目錄；另有一整個非必要的動態模型探索階段，超出「允許使用者指定」的最小需求。

- **下一步：** 修正第 5 節的 plugin 路徑，並刪除或降級第 3 節的自動 discovery，再進入實作。

## Findings

- **F-1 — BLOCKING：plugin 安裝路徑錯誤。**  
  「Implementation phases / 5. Integrate the OpenCode coordinator」指定 `.opencode/plugin/`。應改為 OpenCode 所使用的複數目錄 `.opencode/plugins/`，並同步修正第 6 節 setup、inspection、backup、uninstall、ignore 管理及 plugin 測試中的預期路徑。否則方案宣稱的 coordinator prompt／idle 整合不會被載入。

- **F-2 — model 與 variant 的表示方式正確。**  
  現行 `parse_model_value()` 以最後一個 `/` 分割，且 model regex 不允許 `/`，因此無法表示 `openai/gpt-5/high` 中的 provider-qualified model。Schema v8 將 tier 改為 `{model, effort}` 可消除歧義，並保持 `provider/model` 原值。

- **F-3 — 任意 provider/model 得到保留。**  
  第 2、3、4 節只做安全字元、長度與 literal-argument 驗證；明確允許 discovery 未涵蓋的 custom provider，亦未加入 provider/model allowlist。AC-2 要求 `custom-provider/model-x` 原樣抵達 argv，足以鎖定此行為。

- **F-4 — provider-specific reasoning variant 得到保留。**  
  方案將 effort 驗證為有界安全 token，而非固定 enum，並由 OpenCode 判斷相容性；`default` 僅作省略 `--variant` 的 sentinel。這符合不同 provider 使用不同 variant 字彙的需求。

- **F-5 — literal 執行邊界與現有 runner 相容。**  
  現行 `dispatch-review.js` 已以 argument array 建立 Codex／Claude flags，再交給 `run_external_command()`；第 4 節沿用此模式加入 OpenCode family，且要求 closed stdin、no-remotes clone、bounded diagnostics 與 nested-worker containment，沒有削弱既有邊界。

- **F-6 — 相容性覆蓋大致完整。**  
  計畫有列出 schema-v7 read compatibility、Codex／Claude regression、Windows native launcher、STATUS、setup、hook install/uninstall、dispatch provenance 與 real PTY journey。來源版本亦確認為指定 commit `e58afdcbf89028b4769fca91abcbdb770a23dafd`。

- **F-7 — host registry 必須保持薄層。**  
  現行 host 判斷散落於 `ag-settings.js`、`dispatch-review.js`、`install-hook.js` 與 `agf.js`。集中 host metadata 合理，但第 1 節所稱 adapter 不應吸收 settings migration、plugin event translation 或 runner policy；這些仍應留在原本專責模組，避免形成新的全域抽象。

## Examined simplifications

- **刪除第 3 節的 runtime model discovery。**  
  A-001 要求使用者能指定 model 與 reasoning effort，並未要求 Agentflow 列出模型。保留 explicit `--model`／`--effort`、安全 token 驗證、executable preflight，以及由 OpenCode 回報 model/auth/variant 錯誤，即可完成要求。

- **具體修正：** 將 `opencode models` discovery、output parser、cache／`--refresh` UX、discovery membership preflight 及其專屬測試移出本次實作，列為後續提案。若保留互動式 setup，只需要求明確輸入，不應因此建立新的 discovery subsystem。

- **可重用既有行為：** OpenCode dispatch 應擴充目前的 family-specific argv builder 與 `external-runner-v1`，而非另建第二套 launcher。方案已大致採此方向。

- **不建議刪除 schema v8。** 單純延長 `<model>/<effort>` 字串會使 provider/model 與 effort 邊界含糊；結構化 selection 是必要變更，不屬過度設計。

Outcome: BLOCKING

Minimality: BLOCKING

Conformance: PASS

Self-check: 已直接核對指定 commit、設計、A-001、四個腳本及兩份參考文件；未修改 clone、未執行 Agentflow、未委派、未進行網路探測，且三個 verdict 各出現一次。
