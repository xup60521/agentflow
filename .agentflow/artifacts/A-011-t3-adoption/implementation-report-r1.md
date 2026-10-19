* _2026-10-19 12:18:04 +0800 (claude-opus-5-5/medium)_

- **Done:** Agentflow can now turn the live T3 model list into a ready-to-use `delegate_task` target and pass it through the existing selector. The selector's rules are unchanged, and the external runner is untouched.

- **Tests:** The delegation tests went from 41 passing with 3 new tests failing to 44 of 44 passing. The two affected checks on the guidance text both pass.
  - The full guidance-text test file has one failure: the 32 KiB size limit on `SKILL.md`. I didn't touch that file, so this is the known earlier failure.

- **Not yet proven:** No real T3 delegation has been run with the new function yet, so the next step is one live dispatch (example below).
  - The threeways path still builds its own handoff without model options. That was out of scope.

**Commit and location**

- **Worktree:** `/home/zup/.t3/worktrees/agentflow/t3-27b8a90b`, starting from `62e74c72fd91c66bab95d637882a302194c992da`.

- **Commit:** `265a89f08a82b5d65b6ac8ba09d539f8eae5207d`, with a Traditional Chinese message. Nothing was pushed.

- **Changed files:** exactly the five allowed files, all modified. There are no untracked files, and the worktree is clean.
  - `skills/agentflow/scripts/delegation-route.js`
  - `skills/agentflow/scripts/delegation-route.test.js`
  - `skills/agentflow/references/delegation.md`
  - `skills/agentflow/scripts/README.md`
  - `skills/agentflow/scripts/prompt-compression.test.js`

**What changed**

1. **New function `prepare_t3_internal_candidate({ catalog, tools, selection })`** in `delegation-route.js`. It only converts data and never calls a tool.
   - It needs observed `invoke`, `result` and `stop` tools to all be `true`.
   - The provider must be in the catalog, with `canRunChildTask: true` and not `enabled: false`.
   - The model ID must match exactly; IDs with slashes work.
   - Each option must use an ID that this model lists. Select options must use a listed value, and boolean options a real true/false.
   - Nothing is renamed or substituted, and no default values are filled in. Options left out are left out of the target, so runtime and options stay inherited.
   - `effort_option` lets the host say which of the model's options carries effort. That way no option name like `reasoningEffort` or `effort` is hardcoded.
   - `controls.efforts` holds only the chosen value. An exact effort request that doesn't match it is refused rather than swapped.

2. **Target passed through the selector.** When `select_executor_action` picks a candidate that has a target, the native action now includes `action.target` (a copy). `action.brief` is unchanged. Candidates built by hand keep their old shape. The selector still returns `selection-required` when several executor kinds qualify and none was chosen.

3. **Host guidance** in `delegation.md` and the README. Once the host decides delegation is worthwhile, it should prefer an eligible T3 internal executor unless the owner or brief names another. It records that choice with a reason, and the selector checks it.
   - This doesn't change: the order of `allowed-worker` meaning nothing, owner exact choices, the external runner outside T3, and the existing rules for retries, stopping and active tasks.

**Red/green evidence**

- **Red:** `node --test skills/agentflow/scripts/delegation-route.test.js` gave 44 tests, 41 passing and 3 failing. The failures were the 3 new tests, because the function didn't exist yet.

- **Green:** the same command gave 44 of 44 passing.

- **Guidance text:** `node --test --test-name-pattern="advanced feature rulebooks|delegation does not override" skills/agentflow/scripts/prompt-compression.test.js` gave 2 of 2 passing.

- **Full guidance-text file:** 11 of 12 pass. The only failure is the `SKILL.md` size limit described above.

- **What the new tests cover:** test data shaped like the real catalog, which I read once with `orchestrator_capabilities` and called nothing else.
  - Codex with `reasoningEffort` plus `serviceTier`.
  - Claude with `effort` plus the `fastMode` true/false option.
  - A custom provider `my-gateway` with model `vendor/family/model-1`, using `variant` and `thinking`.
  - Refusals:
    - a disabled provider
    - a missing provider
    - wrong-case provider or model IDs
    - a model taken from another provider
    - an option ID borrowed from another model
    - an unlisted or wrong-case value
    - wrong value types
    - a bad `effort_option`
    - each of the three tools missing
    - a malformed catalog
  - The selected action carries the exact target and an identical brief, and there is no `command` field.

**Example for the host's live GPT review dispatch**

```js
const route = require('./skills/agentflow/scripts/delegation-route.js')
const prepared = route.prepare_t3_internal_candidate({
  catalog: capabilitiesResult,                       // just-observed orchestrator_capabilities output
  tools: { invoke: true, result: true, stop: true }, // delegate_task / task_status / task_cancel observed
  selection: { provider_instance_id: 'codex', model: 'gpt-6.1-sol', options: { reasoningEffort: 'high' }, effort_option: 'reasoningEffort' },
})
if (!prepared.valid) throw new Error(prepared.error)  // report it; do not substitute
const picked = route.select_executor_action({
  policy, config, host,
  task: { ...task, role: 'review', brief: frozenBrief,
          executor_choice: { kind: 'internal', candidate_id: prepared.candidate.candidate_id, reason: 'T3 available; independent GPT review' } },
  capabilities: { internal: prepared.candidate },
})
// picked.status === 'selected' → delegate_task({ task: <picked.action.brief text>, target: picked.action.target, role: 'review', mode: 'async', clientRequestId })
```

- Keep the returned `taskId` and `childThreadId`. Follow the existing rules for completion, stopping and retries.

**Limits**

- **Fresh-context and read-only requests:** these hard requirements are still refused for T3 candidates. The helper doesn't claim either control, because the catalog doesn't prove them.

- **Threeways:** its native handoff path doesn't use `action.target` or model options yet.

- **Model is required:** the helper doesn't support an omitted model meaning "inherit the model".

**Recommended next checks**

1. Run one live T3 review dispatch built from `action.target`. Compare the target, `taskId` and `childThreadId` returned by `delegate_task`, and the report.

2. Have GPT review the new function, focusing on catalog edge cases such as option types other than select or true/false, and providers with no models.

Self-check: I worked only in the assigned worktree and committed only the five allowed files. Tests went from red to green, and the one remaining contract failure is the earlier `SKILL.md` size limit. I didn't start Agentflow, delegate, launch model command-line tools, push or create a PR.
