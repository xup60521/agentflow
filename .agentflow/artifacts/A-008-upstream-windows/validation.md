# 上游整合驗證

- 已合併 upstream 80fcd7f，保留 Windows、OpenCode、Linux 與跨機器開發的 fork 行為。產品整合提交為 59c8646569bf87355b4829bd9c85f2164dc63f0e；Windows 測試 fixture 修正為 8cb804ca98dcad795422dca510a6d3876be6bd74。
- 本機平台與工作區檢查通過；完整測試仍有 12 項上游既有失敗，沒有宣稱全套通過。Windows 原生 CI 第一次發現 8 項失敗，第二次已全部通過第一階段，並在第二階段發現三項路徑或 fixture 問題；已修正，第三次 Windows/Linux 均 PASS。
- 產品修正先推送到 xup60521/agentflow 的 integrate/upstream-windows-20261017；複審後合回同一 fork 的 main。沒有 force push，也沒有推送 agfnow/agentflow。

## 原始要求與範圍

> try to rebase to agfnow/agentflow
> note that I'm maintaining my fork and have no intention to push to agfnow/agentflow.

> My fork is aimed at windows support and cross-machine development. Go try that

- 先前 rebase 試跑已中止。本輪採用擁有者授權的獨立分支合併方案，保留 fork 已發布歷史。
- 保留 Windows PowerShell/Unicode stdin、native exe/cmd launching、行程樹取消、ACL looper、NTFS identity、case alias、CRLF、Recycle Bin/Linux trash、worktree .env links、可共用的 skills/settings、Claude machine-local hooks 及 OpenCode。
- 上游其餘功能沿用原發布內容；沒有新增產品功能或修改使用者既有未提交設定。

## 本機檢查

- 環境為 Linux，Node v26.8.1。
- `node --test --test-concurrency=4 skills/agentflow/scripts/*.test.js`，整合版 1576 tests，1503 PASS、12 FAIL、61 skip。
- 同機未修改 upstream 80fcd7f 的同一指令，1550 tests，1478 PASS、19 FAIL、53 skip。整合版 12 個失敗名稱全包含在 upstream baseline 中；這只證明沒有新增失敗名稱，不等於所有未測行為都正確。
- CI 選用的 Windows/Linux 平台 suite，本機 341 tests，330 PASS、11 native-Windows skip；agf ignore/CRLF/.env/cleanup focused 12 PASS。
- hook/startup/cleanup 修正檢查，3 PASS；hook/Windows helper suite 28 PASS、8 native-Windows skip。
- Windows fixture 修正後，notebook-write、notebook-compact、windows tests 共 105 tests，95 PASS、10 skip。來源程式未變，沿用其餘完整 suite 證據。
- OpenCode plugin `.test.mjs` 另行執行，1 PASS。
- 實際 PTY `ownership-controls-journey.js`，exit 0；確認可見輸入輸出、session 拒絕/允許、owner bytes 與 Git 狀態。摘要見 [pty-evidence.txt](pty-evidence.txt)。一般 suite 的 Expect journeys 因本機未安裝 Expect 略過，未當作成功。

## 原生 CI

- [第一輪 39032464370](https://github.com/xup60521/agentflow/actions/runs/39032464370)，59c8646，Ubuntu PASS；Windows 316 PASS、8 FAIL、8 skip。
- 失敗涉及 Windows RUNNER~1 路徑的 fixture 字串比較，以及封存案例未包含另一個應保留的最新完成回合。修正 native realpath fixture 和封存 history，不略過測試。
- [第二輪 39032638534](https://github.com/xup60521/agentflow/actions/runs/39032638534)，8cb804c，Ubuntu PASS；Windows 第一階段 324 PASS、0 FAIL、8 skip；第二階段 11 PASS、3 FAIL。

- 第二輪的 Git ignore fixture 使用 Windows 裝置空路徑作全域設定檔，改用真實空檔並檢查 Git exit status。Windows junction/短路徑未統一，導致 cleanup/ditch 無法辨識目前 worktree；共用 real_path 在 Windows 改為 native realpath，worktree registry 比對復用 same_folder。
- 修正提交 311fe7eca9ca7690cb53943a1dadb485b418e7fa；Linux ignore/cleanup/ditch 64 PASS。這項共用 helper 在 Linux 仍使用原路徑解析，已通過證據不重跑。
- [第三輪 39032803759](https://github.com/xup60521/agentflow/actions/runs/39032803759)，311fe7e，Windows/Linux 均 PASS。Windows 第一階段 324 PASS、0 FAIL、8 skip，第二階段 14 PASS；Ubuntu 第一階段 330 PASS、0 FAIL、11 skip，第二階段 12 PASS。

## 完整 suite 保留的上游失敗

- away-gates is optional, defaults off, validates and survives a settings change
- close scope preserves outside ownership during continued edits but reviews new, candidate and committed paths
- completion checks read away-gates from the active configuration
- policy change during archive preparation refuses both archive and live publication
- public release templates use the validator schema and explain installation readiness
- start adds missing template fields and reports a safe invalid value without changing it
- start migrates schema seven before adding missing current template fields
- start treats bare godev as activation only and leaves an empty Ask
- startup reports effective defaults without rewriting older settings
- template audit fills absent properties and reports invalid existing values without replacing them
- the always-loaded skill stays within the retained 32 KiB budget
- version-8 templates contain the exact switches and defaults

## 最小改動檢查

- 最小成果是讓現有 fork 能吸收最新上游並保留 Windows 與跨機器開發能力。
- 直接採用 upstream 版本會遺失 fork 的 Windows/OpenCode/.env 能力；直接保留 fork 衝突區則會遺失 upstream 的 ignore bytes、manual capture 與新匯出函式。
- 因此只合併必要差異、修正遇到的 fixture，新增一個 Windows/Linux workflow 取得本機無法提供的原生證據。未另建產品轉接層、依賴或執行器。

## 最終交付檢查

- 複審 review-r2.md 對 311fe7e 的 Verdict、Outcome、Minimality、Conformance 皆 PASS。
- 主工作區 main 已由 ea1612d 快轉至 311fe7e，八個原有未提交檔案的 SHA-256 與整合前完全相同。其餘新增檔案僅保存本輪同一份測試、審查及派送證據，不改產品程式或判定。
