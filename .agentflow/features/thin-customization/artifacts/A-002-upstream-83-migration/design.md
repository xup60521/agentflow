# Agentflow 8.3 薄型遷移設計

## 結果

- 從 `upstream/main` 維護小型 overlay，不合併 fork 的 `main`，也不刪除 fork。

- Windows 通用修正各自形成可獨立送 upstream 的小分支；OpenCode 只增加 8.3 現有 generic-host 架構缺少的 adapter/plugin。

## 範圍

- 保留 PowerShell setup、Windows native executable/process-tree、必要的 `.env` worktree provisioning，以及 OpenCode integration。

- 捨棄 notebook POSIX-mode 與 CRLF patch；不復活 8.3 已刪除的 `dispatch-review.js`。

- 不直接合併目前 fork `main`，不刪除任何 fork branch 或 remote。

## 實作方式

1. `upstream/powershell-setup`、`upstream/windows-process-tree`、`upstream/env-provisioning` 各自直接基於 `upstream/main`。

2. `migration/upstream-8.3-overlay` 疊加已驗證的小 commits，作為尚未 upstream 合併時的最小 overlay。

3. OpenCode coordinator 使用 `.opencode/plugins/` 的 project plugin；plugin 將 owner prompt 與 `session.idle` 對接既有 notebook capture/closeout 邊界，並以 session ID 去重。

4. OpenCode external worker 透過 8.3 transport-neutral selection 增加 invocation recipe：`opencode run --model <provider/model> [--variant <effort>] --format json`。參數維持 literal argv，不經 shell。

5. `provider/model` 與 provider-specific variant 不建 allowlist；只做長度、控制字元與 argv 安全驗證，模型可用性由 OpenCode 決定。

6. 因 OpenCode 的 `session.idle` handler 可能不是可靠 finalization barrier，plugin 必須把無法同步完成 closeout 的情況明確記錄為 limitation，不宣稱等同 Claude/Codex stop hook。

## Invariants

- **INV-1 — Fork preservation**

  - Starting condition: `origin` 保留現有 fork branches 與 history。

  - Preserved guarantee: 遷移只新增 branches/commits，不刪除或 force-push fork。

  - Failure condition: 任一既有 branch、remote 或 commit 被刪除、覆寫或改寫。

- **INV-2 — Clean upstream base**

  - Starting condition: `upstream/main` 為 8.3 base。

  - Preserved guarantee: 每個 upstream PR branch 的 merge-base 是 `upstream/main`，且不含 fork `main` 的 notebook/CRLF commits。

  - Failure condition: PR diff 含未授權的 notebook、CRLF、歷史或整份 fork 差異。

- **INV-3 — Literal worker invocation**

  - Starting condition: 8.3 external work 使用 literal command arrays。

  - Preserved guarantee: OpenCode model/variant 永不插入 shell command string。

  - Failure condition: 任一使用者值經 shell parsing、command concatenation 或 eval。

- **INV-4 — Existing hosts remain unchanged**

  - Starting condition: Codex 與 Claude 的 8.3 host/worker 行為可用。

  - Preserved guarantee: OpenCode adapter 不改變兩者的 template、argv 或 hook installation。

  - Failure condition: Codex/Claude 既有聚焦測試或 invocation contract 回歸。

## Acceptance criteria

- **AC-1（INV-1、INV-2）**：`git log upstream/main..upstream/<branch>` 對每個小分支只顯示該修正；`git diff --name-status` 無 notebook/CRLF patch。

- **AC-2（INV-3）**：測試證明任意安全的 `provider/model` 與 variant 形成預期 literal argv；含 shell metacharacter 或控制字元的值被拒絕。

- **AC-3（INV-4）**：Codex/Claude 原有 worker selection 與 hook tests 維持原結果；OpenCode-specific tests 不需修改其 expected argv。

- **AC-4**：在可用 OpenCode CLI 的環境完成 PTY journey：project plugin 載入、owner prompt capture、idle limitation/closeout 行為可觀察、worker 使用明確 model/variant。

- **AC-5**：在沒有 OpenCode CLI 的環境，聚焦單元測試仍可驗證 plugin payload parsing、去重與 argv recipe，並清楚標記未完成真實 journey。

## Minimality check

- 最小成果是三個獨立通用修正分支，加上一個只補 generic-host 缺口的 OpenCode overlay。

- 較簡單但不足的替代方案是直接 cherry-pick 舊 OpenCode commit；8.3 已刪除其 dispatcher，因此會復活淘汰架構並擴大維護面。

- 保留的每一部分都對應 owner 指定項目；notebook/CRLF patch、舊 dispatcher 與整份 fork merge 均排除。

## Questions

- None.
