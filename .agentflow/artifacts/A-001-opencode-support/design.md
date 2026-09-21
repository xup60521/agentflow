# OpenCode support implementation plan

## Summary

- Add OpenCode as a first-class Agentflow coordinator and external-worker family without weakening existing Codex or Claude Code behavior.

- Represent a worker selection as separate `model` and `effort` fields. This is required because OpenCode model IDs use `provider/model`, while reasoning effort is passed independently as `--variant`.

- Accept the user's explicit OpenCode `provider/model` and reasoning variant without hard-coding a catalog. Let OpenCode remain authoritative for provider authentication, model availability, and provider-specific variants; document `opencode models` as the user's discovery command.

- Deliver the work as a schema migration, host adapter, OpenCode plugin/hook integration, tests, documentation, and a real terminal journey.

## Outcome and scope

- A user can run Agentflow from an OpenCode session, invoke the `godev` workflow, retain prompt/stop bookkeeping, and use streams and closeout under host identity `opencode`.

- A user can configure an OpenCode external-worker profile with any installed provider/model identifier and a provider-supported reasoning variant.

- Agentflow launches OpenCode workers non-interactively as:

  ```text
  opencode run --model <provider/model> --variant <effort> --format json --dir <clone> <brief>
  ```

- The plan does not add an Agentflow-maintained model allowlist, store provider credentials, or claim that every model supports every reasoning variant.

## Current constraints

- Host validation, host markers, STATUS parsing, CLI usage, hooks, setup, and tests currently recognize only `codex` and `claude`.

- Worker dispatch has family-specific flags only for Codex and Claude. Unsupported families fail closed.

- Tier values currently use `<model>/<effort>`, but the model parser rejects `/` inside model IDs. That cannot represent OpenCode's required `provider/model` form safely.

- OpenCode exposes configured models dynamically through `opencode models [provider]`; reasoning is a provider-specific `--variant`, not a universal fixed enum.

## Invariants

- **INV-1 — Existing hosts remain stable.** Starting, validating, dispatching, closing, and installing hooks for Codex and Claude Code behave exactly as before. Failure condition: an existing configuration must be rewritten manually or an existing journey changes semantics.

- **INV-2 — No model allowlist.** Agentflow accepts any safe `provider/model` returned by or usable with the installed OpenCode configuration. Failure condition: adding a provider or model requires an Agentflow release.

- **INV-3 — Explicit selection is preserved.** The exact owner-selected model and reasoning variant are recorded and passed literally to OpenCode. Failure condition: Agentflow silently substitutes either value.

- **INV-4 — Safe literal execution.** OpenCode is launched through an executable plus argument array with `shell: false`; model, variant, paths, and prompts are never interpolated into shell text. Failure condition: user-controlled selection reaches shell parsing.

- **INV-5 — Provider authority stays with OpenCode.** Agentflow never reads or copies provider secrets and treats OpenCode's own model/auth errors as dispatch failures. Failure condition: Agentflow stores credentials or guesses provider support.

- **INV-6 — Reasoning is provider-specific.** Agentflow permits a safe variant token without claiming a universal set of valid efforts. Failure condition: a global enum rejects a variant supported by an installed provider.

- **INV-7 — Hooks fail closed.** Prompt capture and completion checks apply to the intended project/session only, remain idempotent, and do not duplicate notebook input. Failure condition: an unrelated session mutates an Agentflow notebook or one prompt is recorded twice.

## Configuration design

### Schema v8

- Change each tier value from an overloaded string to a structured selection:

  ```json
  {
    "model": "openai/gpt-5",
    "effort": "high"
  }
  ```

- Keep schema-v7 string values readable during migration. Normalize both representations internally to `{ model, effort }`; write schema v8 after an explicit settings change or migration.

- Permit `/` in structured `model` values while retaining control-character, length, and literal-argument safety checks. Validate `effort` as a bounded safe token, not as a fixed enum.

- Add an `opencode-default` profile only when OpenCode is the initializing host or the user explicitly adds it. Do not invent default provider/model values. Setup obtains both values from explicit flags; users can run `opencode models` themselves to choose an identifier.

- Recommended setup interface:

  ```text
  agf setup --host opencode --model <provider/model> --effort <variant>
  ```

- Recommended settings interface:

  ```text
  agf settings model --profile opencode-default --tier basic \
    --model <provider/model> --effort <variant>
  ```

- If effort is intentionally omitted for a model with no reasoning variants, store `effort: "default"` and omit `--variant` at dispatch. Reserve `default` as Agentflow's explicit “use provider default” sentinel.

## Implementation phases

### 1. Introduce a host and worker adapter boundary

- Add one central host registry for `codex`, `claude`, and `opencode` instead of extending scattered arrays and regular expressions.

- Each adapter owns runtime markers, host-family mapping, settings paths, restart behavior, worker command construction, and optional Reply identity extraction.

- Update `ag-settings.js`, `agf.js`, `stop-hook.js`, `resume-intake.js`, STATUS validation, process-tree names, and help text to consume the registry.

- Preserve explicit `--host` as the authoritative fallback when OpenCode has no stable host-owned environment marker.

### 2. Migrate model and effort representation

- Add `parse_model_selection` and `serialize_model_selection` helpers that normalize schema-v7 strings and schema-v8 objects.

- Bump the configuration schema to v8 with a deterministic migration that preserves every existing profile, tier, priority, command, and family.

- Update tier selection, exact-owner-selection logic, fallback records, metrics, dispatch stamps, and user-facing settings output to use separate model and effort fields.

- Add collision tests proving `openai/gpt-5` plus `high` cannot be confused with another model or effort.

### 3. Add bounded OpenCode preflight

- Verify that the OpenCode executable is spawnable before dispatch. Keep authentication, model availability, and variant compatibility as execution-time checks owned by OpenCode.

- Validate the explicitly supplied identifier as canonical `provider/model` and the variant as a bounded safe token. Never require membership in an Agentflow catalog.

- Document `opencode models [provider]` as the authoritative user-facing discovery command.

- Defer an Agentflow-owned interactive discovery/parser/cache subsystem until separately requested. If added later, never run `--refresh` automatically because it performs network work and changes local state.

### 4. Add OpenCode worker dispatch

- Extend `dispatch-review.js` with the OpenCode mapping `--model <model> --variant <effort> --format json --dir <clone>` and omit `--variant` for the `default` sentinel.

- Ensure the prompt remains one literal final argument, stdin stays closed, the disposable clone has no remotes, and nested-worker containment remains active.

- Add a small JSONL output adapter that extracts the final assistant text without discarding raw bounded diagnostics or dispatch provenance.

- Treat unavailable models, invalid variants, missing authentication, and malformed JSONL as distinct failures. Never substitute an owner-selected value automatically.

### 5. Integrate the OpenCode coordinator

- Install Agentflow as an OpenCode-discoverable skill under `.opencode/skills/agentflow/` or through an explicit `skills` source, reusing the canonical skill files rather than maintaining a divergent copy.

- Add a project OpenCode plugin under `.opencode/plugins/` that maps prompt submission to `notebook-write.js append-input` and `session.idle` to the existing closeout referee.

- Define and test the exact event-to-payload translation, including project `cwd`, session identity, prompt text, duplicate-event protection, and failure reporting.

- Add an optional `.opencode/commands/godev.md` convenience command only if testing proves plain `godev` skill discovery is insufficient. Do not pin a model in this command; the active OpenCode session owns coordinator model selection.

- Document that the coordinator model/variant is selected through OpenCode's session/configuration, while Agentflow's `external-workers` settings control delegated workers.

### 6. Extend setup, hooks, and uninstall

- Teach `setup.js`, `install-hook.js`, `agf hooks`, ignore-file management, inspection, backup, and uninstall flows about OpenCode-owned files.

- Merge plugin/config changes without overwriting unrelated OpenCode configuration. Mark generated entries so uninstall removes only Agentflow-owned content.

- Return `hooks_restart_required` when OpenCode must restart to load a new plugin or skill.

- On Windows, resolve a native `opencode.exe`/`.com` entrypoint or add a dedicated safe npm-package launcher equivalent to `codex-worker.js`; do not fall back to a shell `.cmd` invocation.

### 7. Documentation and release contract

- Update `SKILL.md`, both READMEs, both user guides, script reference, delegation rules, setup examples, troubleshooting, and supported-host statements.

- Explain `provider/model`, provider-specific `effort`, the `default` sentinel, `opencode models`, coordinator-versus-worker selection, and exact-selection no-substitution behavior.

- Record the feature in the changelog and bump the minor release because this adds a supported host and configuration capability.

## Tests and verification

- **Unit tests:** host normalization/detection, STATUS grammar, schema-v7 migration, schema-v8 validation, provider/model parsing, arbitrary safe variant parsing, unsafe-token rejection, profile selection, and exact-selection behavior.

- **Dispatch tests:** exact OpenCode argument array, omitted default variant, JSONL final-response extraction, nonzero exit, auth/model/variant errors, output truncation, closed stdin, clone isolation, and Windows launcher behavior.

- **Plugin tests:** loading from `.opencode/plugins/`, prompt capture once, session-idle closeout, non-Agentflow no-op, malformed event handling, unrelated configuration preservation, idempotent install, and ownership-safe uninstall.

- **Regression tests:** run existing Codex and Claude settings, hook, dispatch, closeout, alignment, Windows, and release suites unchanged except for expanded host matrices.

- **Real PTY journey:** start OpenCode in a disposable Git repository, invoke `godev`, confirm the Ask is captured, complete a small task, confirm closeout and STATUS, then dispatch an OpenCode worker with an explicitly selected model and variant.

- **Provider matrix:** exercise at least two configured provider/model IDs with different variant vocabularies, plus one model using `default`, to prove Agentflow does not encode one provider's model or effort list.

## Acceptance criteria

- **AC-1 (INV-1):** Existing Codex and Claude journey suites pass with schema-v7 input and schema-v8 normalized output.

- **AC-2 (INV-2, INV-6):** A fixture model such as `custom-provider/model-x` with a nonstandard safe variant reaches the OpenCode argument array without an Agentflow allowlist change.

- **AC-3 (INV-3, INV-4):** Given model `openai/gpt-5` and effort `high`, dispatch evidence and the spawned literal arguments contain exactly those values; shell metacharacter fixtures are rejected before launch.

- **AC-4 (INV-5):** Missing OpenCode authentication produces a bounded, classified failure and no credential file is read, copied, or written by Agentflow.

- **AC-5 (INV-7):** One OpenCode prompt creates one Ask entry, `session.idle` enforces closeout, repeated plugin delivery is idempotent, and a project without Agentflow files is unchanged.

- **AC-6:** `agf setup --host opencode --model <provider/model> --effort <variant>` creates a valid configuration without choosing a hard-coded provider or model.

- **AC-7:** The real PTY journey proves visible input/output, process exit status, notebook state, configuration state, and explicit model/variant dispatch.

## Rollout and compatibility

- Land schema normalization and host registry first, with no OpenCode advertised support until existing-host regression tests pass.

- Land OpenCode worker dispatch next behind an explicitly configured profile.

- Enable first-class coordinator setup only after the plugin journey passes on Linux/macOS and Windows behavior is either proven or clearly gated.

- Preserve schema-v7 reads for at least one major release. Provide a dry-run migration display and never rewrite configuration merely because it was inspected.

## Risks and mitigations

- **OpenCode event contracts may change.** Isolate them in one plugin adapter and pin tested minimum/maximum versions in compatibility tests and documentation.

- **Variants differ by provider and model.** Pass safe explicit values through, support `default`, and report OpenCode's validation error without guessing a substitute.

- **Users may select a stale or unavailable model.** Point them to `opencode models`; preserve OpenCode's bounded error without guessing a substitute.

- **JSONL output can evolve.** Preserve bounded raw diagnostics, test known event shapes, and fail clearly when no final assistant message is recoverable.

- **Coordinator and worker selection can be confused.** Keep them separate in CLI names, settings output, and documentation; never imply that changing an external-worker tier changes the active TUI model.

## Minimality check

- **Smallest useful outcome:** one additional host adapter, one OpenCode plugin, and one structured model/effort representation are enough to support OpenCode safely.

- **Simpler alternative considered:** append `/effort` to `provider/model`. Rejected because parsing is ambiguous and the existing model grammar rejects provider-qualified IDs.

- **Why each remaining part is needed:** schema migration preserves existing users; explicit safe input avoids a hard-coded catalog without adding a discovery subsystem; plugin integration supplies prompt/stop semantics; dispatch adaptation supplies exact model/variant control; regression and PTY tests protect the existing two hosts and prove the new terminal boundary.

## Implementation checkpoint

- This document authorizes no source changes. Implementation should begin only after the owner approves the plan and resolves any desired changes to the configuration interface or platform scope.
