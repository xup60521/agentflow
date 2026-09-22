# STATUS

Project: agentflow

Notebook: .agentflow/features/thin-customization/thin-customization.devlog.md — stream.

Current commit: stream-open only, no code commits yet.

Tests/scenarios: none.

Configuration: .agentflow/features/thin-customization/ag.json — schema v8; validated for codex this round.

Proven: the stream configuration was copied from the root configuration.

Open: none.

Next: reply to the first Ask below.

Artifacts: none.

Archived eras: none.

Streams: none.

Backlink: main notebook `.agentflow/devlog.md` (main checkout)

Feature: thin-customization — active — thin customization

Opened by the `agf` shell shortcut on 2026-09-22, not by an agent round. The main-notebook `stream:` pointer line was deliberately NOT written — the next main-checkout session re-derives it from `.agentflow/features/*/*devlog.md`.

---

# → Ask / A-001 (xup60521)

+ 在新的 stream 保留 thin customization

---

# → Ask / A-002 (xup60521)

+ cd 'D:\code\fork\agentflow\.worktrees\thin-customization'
  godev

+ retry

+ so continue

+ ????? fork????????? `main` merge ??? 8.3?
  ? `upstream/main` ??????????????
  - PowerShell setup
  - Windows executable/process-tree ??
  - ??? `.env` provisioning
  - OpenCode integration

+ ???? 8.3 ??? notebook/CRLF patch?
  ? Windows ?????? upstream PR?????????????????
  OpenCode ???????????? host adapter/plugin?????????? overlay?????????? fork?

+ ????branch notebook ?????

+ Design Go: 590b74f

+ ??
  ??review ??????????????????????? e.g. powershell ?????????unicode ?????? ????

---

## [RUN-001] Event — 2026-09-22 15:26:13 +0800 (A-002)

- ???? branch notebook ????? owner ? 8.3 ??????????? A-002?

- ? `upstream/main` ?? `migration/upstream-8.3-overlay`???? fork `main`????? fork?

- ??? `upstream/powershell-setup`?`upstream/windows-process-tree`?`upstream/env-provisioning`?Windows process-tree ???? 2/2 ???

- ??? notebook POSIX-mode ? CRLF patch?? OpenCode commit ??? 8.3 ???? dispatcher ?????

- ??? 8.3-aware OpenCode adapter/plugin ????? exact Design Go ???? OpenCode ???

## [RUN-002] Event — 2026-09-22 15:35:56 +0800 (A-002)

- `Design Go: 590b74f` ??????? 8.3 ???????

- OpenCode overlay ???? `9a8d7e7`??? 8.3 generic-host?`.opencode/plugins/agentflow.js`?structured provider/model + variant??? literal argv worker recipe????? dispatcher?

- ???? 9/9 ???plugin ???????migration branch ???? origin?

- ?? OpenCode PTY ??? session `ses_f37f5fa28ffeHI0nzdQVEEsbQdx`?? CLI ?? server error `err_96c351d6`????????? model-backed journey?????? Result Go?

## [RUN-004] Event — 2026-09-22 16:08:00 +0800 (A-002)

- 依使用者要求，以真實 Windows 使用者旅程做獨立 review，特別檢查 PowerShell 編碼、Unicode 被替換為 `?`／亂碼、native executable、process tree 與 OpenCode event lifecycle。

- 在 Windows PowerShell 5.1 實際重現 `$OutputEncoding = us-ascii`：繁中與 emoji 經 pipeline 傳入 native process 時會被替換為 `?`。Setup wrapper 現在於呼叫期間使用 UTF-8 no-BOM stdin 並復原原設定；profile 寫入與 uninstall rewrite 使用 UTF-8 BOM。

- Review 亦發現並修正 npm `.cmd` shim、Bun 的 `process.execPath` 指向 `opencode.exe`、plugin debounce race，以及 assistant/orphan event state 未清除。最終 implementation 為 `1b785e995be092cb06d1d3945ea9e94b59fcb8e4`。

- 聚焦測試獨立重跑 9/9 通過；75ms progressive Unicode journey 確認只提交一次完整、byte-correct 的繁中／emoji prompt，且 prompt 先於 Stop。

- 真實 native OpenCode 1.18.30 journey 使用 resolved executable 與免費 model，輸出精確為 `UTF8-OK-繁體`，process exit 0。

- 獨立 reviewer verdict：Outcome PASS、Minimality PASS、Conformance PASS。報告：`artifacts/A-002-upstream-83-migration/cross-check-report.md`。

- 限制：較廣測試中的 generic `portable-host` Git fixture 曾在 30 秒 timeout；plain fixture 通過，且 reviewer 判定與本次 Windows/OpenCode 變更無關，因此未宣稱 full suite green。

- 下一個 consequential action 是推送／建立小型 upstream PR 與後續 overlay 整理；需使用者以 exact current commit 回覆 `Result Go: 1b785e9`。

## [RUN-003] Event — 2026-09-22 15:37:56 +0800 (A-002)

- ?? OpenCode plugin export contract ???? commit ??? `d024ba3` ???? origin?

- ?? PTY journey ?? OpenCode 1.18.30 ? `opencode/ling-3.0-flash-fin-free` ???plugin ???session ??????? `OK`?process exit 0?

- ?? server error ?????? helper export ????? model ???????????? plugin config/event/dispose ???
