# Tracker

## Identity

- **Work key:** A-001-opencode-support.

- **Active Ask:** A-001.

- **Goal:** Deliver an implementation-ready plan for first-class OpenCode support with configurable provider/model and reasoning effort.

- **Last update:** 2026-09-21 15:29:52 +0800.

- **Evidence commit:** uncommitted review correction.

## Overall state

- **State:** active.

- **Reason:** Independent review found a current OpenCode plugin-path correction and an unnecessary discovery subsystem; the plan is being corrected and re-reviewed.

- **Total:** 3.

- **Completed:** 2.

- **Remaining:** 1.

## Accepted task checklist

- [x] **T-1:** Inspect current host, configuration, dispatch, hook, and documentation boundaries; produce a plan with invariants, phases, risks, and acceptance checks in `design.md`. Proof: saved-file inspection and source-linked findings. Source: A-001.

- [x] **T-2:** Validate the plan artifact and final changed-path scope, then record the completed planning round. Proof: tracker validation passed, the saved plan was read back, and Git status/diff showed only the Agentflow bootstrap and requested planning artifacts. Source: A-001.

- [ ] **T-3:** Correct the independent review findings, re-run the bounded cross-check, and close only on PASS. Proof: corrected plan commit, accepted review report, tracker validation, and Agentflow closeout. Source: A-001.

## Accepted scope changes

- None.

## Current recovery

- **Current item:** Review correction.

- **Last proven result:** First review returned Conformance PASS but Outcome and Minimality BLOCKING on `.opencode/plugins/` and mandatory discovery scope.

- **Active blocker or running process:** None.

- **Next safe action:** Commit the corrected plan and run the same bounded cross-check again.

- **Expected changed files:** `.agentflow/artifacts/A-001-opencode-support/design.md`, `.agentflow/artifacts/A-001-opencode-support/tracker.md`, `.agentflow/devlog.md`, `.gitignore`, `ag.json`.

## Completion proof

- **All accepted tasks checked:** yes.

- **Blocking accepted decision:** none.

- **Operation running:** no.

- **Next action remaining:** corrected-plan cross-check and closeout.

- **Evidence status:** current.

- **Judgment:** active.

## Update meaning

- Saving this tracker is a recovery checkpoint, not a stop signal.

- Work continues with the next unfinished item unless an independent stop condition applies.
