# Tracker

## Identity

- **Work key:** A-001-opencode-support.

- **Active Ask:** A-003.

- **Goal:** Deliver an implementation-ready plan for first-class OpenCode support with configurable provider/model and reasoning effort.

- **Last update:** 2026-09-21 15:29:52 +0800.

- **Evidence commit:** 525ff21867cf990786e5b57ebfa60c29e7285470.

## Overall state

- **State:** active.

- **Reason:** Design Go approved implementation; the schema/host/dispatch foundation is committed and OpenCode lifecycle integration remains.

- **Total:** 6.

- **Completed:** 4.

- **Remaining:** 2.

## Accepted task checklist

- [x] **T-1:** Inspect current host, configuration, dispatch, hook, and documentation boundaries; produce a plan with invariants, phases, risks, and acceptance checks in `design.md`. Proof: saved-file inspection and source-linked findings. Source: A-001.

- [x] **T-2:** Validate the plan artifact and final changed-path scope, then record the completed planning round. Proof: tracker validation passed, the saved plan was read back, and Git status/diff showed only the Agentflow bootstrap and requested planning artifacts. Source: A-001.

- [x] **T-3:** Correct the independent review findings, re-run the bounded cross-check, and close only on PASS. Proof: corrected plan commit `525ff21867cf990786e5b57ebfa60c29e7285470`; `cross-check-report-2.md` returned Outcome PASS, Minimality PASS, and Conformance PASS. Source: A-001.

- [x] **T-4:** Add schema-v8 structured model/effort selections, OpenCode host identity, and literal OpenCode worker flags. Paths: `skills/agentflow/scripts/{ag-settings,agf,completion-context,dispatch-review,looper,notebook-write,resume-intake,stop-hook}.js` and focused tests. Proof: targeted Node tests pass and commit `413cb7d`. Source: A-003.

- [ ] **T-5:** Add ownership-safe OpenCode skill/plugin setup, prompt capture, idle closeout, uninstall, and Windows launch handling. Proof: focused setup/plugin tests. Failure handling: do not advertise coordinator support until lifecycle tests pass. Source: A-003.

- [ ] **T-6:** Update documentation/release metadata and run regressions plus the real OpenCode PTY/provider journey. Proof: applicable suites, independent review, and Result Go for the final implementation commit. Source: A-003.

## Accepted scope changes

- None.

## Current recovery

- **Current item:** T-5.

- **Last proven result:** Schema-v8 selections and exact OpenCode dispatch flags pass focused tests; all three host templates validate.

- **Active blocker or running process:** None.

- **Next safe action:** Implement and test the OpenCode-owned plugin/skill lifecycle without changing unrelated host files.

- **Expected changed files:** `.agentflow/artifacts/A-001-opencode-support/design.md`, `.agentflow/artifacts/A-001-opencode-support/tracker.md`, `.agentflow/artifacts/A-001-opencode-support/cross-check-facts.json`, `.agentflow/artifacts/A-001-opencode-support/cross-check-brief.md`, `.agentflow/artifacts/A-001-opencode-support/cross-check-report.md`, `.agentflow/artifacts/A-001-opencode-support/cross-check-report.md.dispatch.json`, `.agentflow/artifacts/A-001-opencode-support/cross-check-brief-2.md`, `.agentflow/artifacts/A-001-opencode-support/cross-check-report-2.md`, `.agentflow/artifacts/A-001-opencode-support/cross-check-report-2.md.dispatch.json`, `.agentflow/devlog.md`, `.gitignore`, `ag.json`.

## Completion proof

- **All accepted tasks checked:** no.

- **Blocking accepted decision:** none.

- **Operation running:** no.

- **Next action remaining:** T-5 and T-6.

- **Evidence status:** partial.

- **Judgment:** active.

## Update meaning

- Saving this tracker is a recovery checkpoint, not a stop signal.

- Work continues with the next unfinished item unless an independent stop condition applies.
