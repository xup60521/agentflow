*2026-09-22 — independent read-only review*

Base: `63a89e8`

## PowerShell PR

Reviewed commit: `18e01c705c0485a3829646a20a2fef2f3e15207f`

Outcome: PASS

Minimality: PASS

Conformance: PASS

- Linear three-commit branch based directly on current `upstream/main`; no merge or release conflict.
- Diff is limited to `setup.js` and `windows.test.js`; no notebook, CRLF, OpenCode, or dispatcher changes.
- Setup shortcut, UTF-8 stdin, and UTF-8 BOM behavior remain equivalent to the previously reviewed implementation.
- Focused Windows test evidence covers managed replacement/uninstall, literal paths and argv, real Windows PowerShell, and Unicode native stdin.

## Windows process-tree PR

Reviewed commit: `73e01227a71d6035f7867f785e1ffbf8034b9bdf`

Outcome: PASS

Minimality: PASS

Conformance: PASS

- Single commit whose parent is current `upstream/main`; no base drift or cherry-pick conflict.
- Diff is limited to `ag-settings.js`, `external-runner.js`, `process-tree.js`, and `windows.test.js`.
- Windows native-executable fail-closed behavior, descendant termination, and hidden child window behavior match the previously reviewed implementation.
- Focused Windows test evidence covers unsupported shims, native executables, and real descendant process-tree termination.

Both PRs are suitable for upstream review and keep the intended separation from `.env` provisioning and the OpenCode overlay.
