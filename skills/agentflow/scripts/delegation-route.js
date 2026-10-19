'use strict'

const settings = require('./ag-settings.js')
const external_runner = require('./external-runner.js')
const { executable_name } = require('./executable-launch.js')
const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')

const generic_external_record_fields = Object.freeze([
	'executor_class',
	'substantive_delegated_capable',
	'runner_id',
	'shared_supervision',
	'clone_isolation',
	'os_confinement',
	'stage_id',
	'material_risks',
	'reason',
])

const nonempty_text = value => typeof value === 'string' && value.trim().length > 0
const string_array = value => Array.isArray(value) && value.length > 0 && value.every(item => nonempty_text(item))

const parse_threeways_trigger = ask_text => {
	if (typeof ask_text !== 'string') return { triggered: false }
	const match = /^(?:3ways|threeways)$/.exec(ask_text.trim())
	return match === null
		? { triggered: false }
		: { triggered: true, stage_id: 'threeways', runner_id: 'external-runner-v1', permits_one_review_when_allow_ag_off: true, permits_implementation: false }
}

const safe_work_root = value => typeof value === 'string' && value.length > 0 && !value.includes('\\') && !value.split('/').includes('..') && !value.startsWith('/')
const bounded_text = value => typeof value === 'string' && value.length > 0 && Buffer.byteLength(value, 'utf8') <= 1024 * 1024
const report_stamp = /^\* _\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?: [+-]\d{4})? \([^\r\n]+\)_$/u
const report_self_check = /^Self-check:\s+\S.*$/u
const required_brief_sections = ['Original Ask:', 'Evidence:', 'Normal journey:', 'Material uncertainties:', 'Forbidden scope:']
const required_resolution_sections = ['Selected design:', 'Rejected alternatives:', 'Evidence:', 'Model-family limitation:', 'Next human decision:']
const has_required_sections = (text, sections) => bounded_text(text) && sections.every(section => new RegExp(`^${section}\\s+\\S`, 'mu').test(text))

const artifact_path = (repo_root, relative) => {
	if (typeof repo_root !== 'string' || repo_root.length === 0 || !safe_work_root(relative)) throw new Error('threeways artifact paths require a repository root and safe relative work root')
	const root = fs.realpathSync(repo_root)
	const target = path.resolve(root, relative)
	if (!target.startsWith(root + path.sep)) throw new Error('threeways artifact path escapes repository')
	let current = root
	for (const part of relative.split('/')) {
		current = path.join(current, part)
		if (!fs.existsSync(current)) break
		if (fs.lstatSync(current).isSymbolicLink()) throw new Error('threeways artifact path contains a symbolic link')
	}
	return target
}

const write_immutable = (filename, text) => {
	if (!bounded_text(text)) throw new Error('threeways artifact must be non-empty bounded text')
	fs.mkdirSync(path.dirname(filename), { recursive: true })
	if (fs.existsSync(filename)) throw new Error(`threeways artifact already exists: ${path.basename(filename)}`)
	fs.writeFileSync(filename, text.endsWith('\n') ? text : `${text}\n`, { encoding: 'utf8', flag: 'wx' })
}

const valid_worker_report = text => {
	if (!bounded_text(text)) return false
	const lines = text.trimEnd().split(/\r?\n/u)
	return report_stamp.test(lines[0] || '') && report_self_check.test(lines.at(-1) || '') && lines.filter(line => line.startsWith('Self-check:')).length === 1
}

const plan_threeways_debate = facts => {
	if (facts === null || typeof facts !== 'object' || Array.isArray(facts)) return { valid: false, error: 'threeways facts must be an object' }
	const trigger = parse_threeways_trigger(facts.ask_text)
	if (!trigger.triggered) return { valid: true, ...trigger }
	if (!safe_work_root(facts.work_root)) return { valid: false, error: 'threeways work_root must be a non-empty repository-relative path' }
	if (!Number.isInteger(facts.worker_starts) || facts.worker_starts < 0) return { valid: false, error: 'threeways worker_starts must be a non-negative integer' }
	if (facts.worker_starts >= 3 || facts.owner_only_choice === true) return { valid: true, ...trigger, permits_launch: false, consensus: 'UNRESOLVED', reason: facts.worker_starts >= 3 ? 'three worker starts reached the fixed ceiling' : 'an owner-only choice remains' }
	const round = facts.worker_starts + 1
	return {
		valid: true,
		...trigger,
		permits_launch: true,
		consensus: 'PENDING',
		round,
		artifacts: {
			brief: `${facts.work_root}/threeways-brief-r${round}.md`,
			report: `${facts.work_root}/threeways-report-r${round}.md`,
			resolution: `${facts.work_root}/threeways-resolution-r${round}.md`
		}
	}
}

const launch_threeways_debate = async (facts, dependencies = {}) => {
	const plan = plan_threeways_debate(facts)
	if (!plan.valid || !plan.triggered || !plan.permits_launch) return plan
	if (dependencies === null || typeof dependencies !== 'object') {
		return { ...plan, valid: false, error: 'threeways launch requires configured worker selection and external-runner-v1' }
	}
	// An explicit native choice never reaches the external runner, so it needs no runner argv or resolver.
	const native_choice = explicit_native_choice(facts)
	if (!native_choice) {
		if (facts.runner_options === null || typeof facts.runner_options !== 'object' || Array.isArray(facts.runner_options)) {
			return { ...plan, valid: false, error: 'threeways launch requires frozen external-runner options' }
		}
		if (!Array.isArray(facts.runner_arguments) || !facts.runner_arguments.every(argument => typeof argument === 'string')) {
			return { ...plan, valid: false, error: 'threeways launch requires frozen literal runner_arguments' }
		}
		if (Object.hasOwn(facts.runner_options, 'command') || Object.hasOwn(facts.runner_options, 'executable')) return { ...plan, valid: false, error: 'threeways runner command must be derived only from the shared selected action' }
	}
	const requested_tier = settings.threeways_tier(facts.config)
	if (requested_tier === 'off' || settings.tier_name_error(requested_tier)) return { ...plan, valid: false, error: 'threeways requires a valid configured tier; off is not supported' }
	const configured_switches = facts.config?.switches || {}
	const policy_source = facts.policy || configured_switches
	const configured_allowed = Object.hasOwn(policy_source, 'allowed_worker') ? policy_source.allowed_worker : policy_source['allowed-worker']
	const configured_review = facts.policy?.review_policy || facts.policy?.['review-policy'] || configured_switches['review-policy']
	const policy = {
		allowed_worker: configured_allowed === undefined ? ['external', 'host'] : configured_allowed,
		review_policy: configured_review || 'require-independent',
		cli_provider: facts.policy?.cli_provider || configured_switches['cli-provider'] || 'on',
	}
	try { normalise_selection_policy(policy) } catch (error) { return { ...plan, selection: { status: 'unsatisfied', requirement: error.message }, consensus: 'UNRESOLVED' } }
	const resolve_worker = dependencies.resolve_worker || ((selection = {}) => {
		const disabled = new Set(selection.disabled_profile_ids || [])
		for (const profile of facts.config?.['external-workers'] || []) {
			const command = profile.command || []
			if (!((executable_name(command[0] || '') === 'codex' && command.includes('exec')) || (executable_name(command[0] || '') === 'claude' && command.includes('-p')))) disabled.add(profile.id)
		}
		return settings.resolve_threeways_worker(facts.config, { ...selection, disabled_profile_ids: disabled })
	})
	const run_external_command = dependencies.run_external_command || external_runner.run_external_command
	const task = {
		...(is_object(facts.task) ? facts.task : {}),
		task_id: facts.task?.task_id || 'threeways-review',
		role: 'cross-check', review: true, requested_tier, delegation_worthy: true,
		interactive_host: facts.task?.interactive_host !== false,
		work_boundary: facts.task?.work_boundary || [],
	}
	const capabilities = is_object(facts.capabilities) ? clone(facts.capabilities) : {}
	let worker = null
	if (policy.allowed_worker.includes('external') && !native_choice) {
		let unavailable
		try { worker = resolve_worker(facts.worker_selection) } catch (error) {
			if (!['AG_DISPATCH_NO_PROFILE', 'AG_DISPATCH_TIER_UNAVAILABLE'].includes(error.code)) throw error
			unavailable = error.message
		}
		if (unavailable) capabilities.external = [{ candidate_id: 'configured-external', available: false, reason: unavailable }]
		else {
		if (worker === null || typeof worker !== 'object' || worker.tier !== requested_tier) return { ...plan, valid: false, error: `threeways launch requires a configured ${requested_tier}-tier worker` }
		if (!Array.isArray(worker.args) || typeof worker.executable !== 'string') return { ...plan, valid: false, error: 'threeways runner command must be derived only from the selected worker' }
		const worker_model = worker.model && worker.effort ? `${worker.model}/${worker.effort}` : undefined
		const external = {
			candidate_id: worker.profile?.id || worker.id || 'threeways-worker', id: worker.profile?.id || worker.id || 'threeways-worker',
			priority: 100, available: true, recipe_checked: worker.recipe_checked === true || (executable_name(worker.executable) === 'codex' && worker.args.includes('exec')) || (executable_name(worker.executable) === 'claude' && worker.args.includes('-p')), family: worker.profile?.family || settings.family_for_host(worker.executable),
			command: [worker.executable, ...worker.args], ...(worker_model ? { model_effort: worker_model } : {}),
			...(worker.profile?.tiers ? { tiers: worker.profile.tiers } : {}),
		}
		capabilities.external = [external, ...(Array.isArray(capabilities.external) ? capabilities.external : [])]
		}
	}
	if (!capabilities.host && task.interactive_host) capabilities.host = { candidate_id: `host:${facts.host?.id || facts.worker_selection?.active_host || 'unknown'}`, available: true }
	const host = facts.host || { id: facts.worker_selection?.active_host || facts.worker_selection?.explicit_host, family: facts.worker_selection?.host_family }
	const selection = select_executor_action({ ...facts, host, policy, task, capabilities })
	if (selection.status !== 'selected') return { ...plan, selection, consensus: 'UNRESOLVED', review: 'UNRESOLVED' }
	if (selection.kind === 'internal') {
		// The interactive host performs the real native invoke; this is a pending handoff, not a result.
		const candidates = Array.isArray(capabilities.internal) ? capabilities.internal : capabilities.internal ? [capabilities.internal] : []
		const candidate = candidates.find(item => (item?.candidate_id || item?.id || 'internal') === selection.candidate_id) || {}
		const provider_instance_id = candidate.provider_instance_id || candidate.providerInstanceId
		const native_handoff = { type: 'native-tool', stage_id: plan.stage_id, round: plan.round, candidate_id: selection.candidate_id, ...(text_value(provider_instance_id) ? { provider_instance_id } : {}), model: selection.usable_model, effort: selection.usable_effort, requested: clone(selection.requested), limitations: [...selection.limitations] }
		return { ...plan, selection, action: selection.action, runner_id: 'native-tool', review: 'PENDING', consensus: 'PENDING', native_handoff }
	}
	if (selection.kind !== 'external') return { ...plan, selection, action: selection.action, review: 'UNRESOLVED', consensus: 'UNRESOLVED', limitation: 'standalone threeways runner cannot execute host handoff; coordinator review remains unresolved' }
	const selected_worker = worker || { tier: requested_tier, executable: selection.action.command[0], args: selection.action.command.slice(1) }
	const runner_options = { ...facts.runner_options, command: [...selection.action.command, ...facts.runner_arguments] }
	const result = await run_external_command(runner_options)
	return { ...plan, worker: selected_worker, selection, runner_id: 'external-runner-v1', runner: result }
}

const worker_diagnostic = '# Threeways worker diagnostic\n\nRecord type: HOST-DIAGNOSTIC (not a worker report)\n\nWorker report was missing, malformed, or its runner did not complete; no worker conclusion was accepted.\n'
const explicit_native_choice = facts => is_object(facts?.task?.executor_choice) && facts.task.executor_choice.kind === 'internal'
const valid_source_identity = value => is_object(value) && ((value.source_kind === 'git' && /^[0-9a-f]{40}$/u.test(value.value)) || (value.source_kind === 'no-git' && /^[0-9a-f]{64}$/u.test(value.value)))
const sha256_text = text => crypto.createHash('sha256').update(text).digest('hex')
const stored_text = text => text.endsWith('\n') ? text : `${text}\n`

// Writes a missing artifact or confirms the recorded one is identical; never overwrites.
const write_or_match = (filename, text) => {
	if (fs.existsSync(filename)) {
		if (fs.readFileSync(filename, 'utf8') !== stored_text(text)) throw new Error(`threeways artifact conflicts with recorded content: ${path.basename(filename)}`)
		return false
	}
	write_immutable(filename, text)
	return true
}

// Shared closeout for external and native results: one report and one host resolution per round.
const finalize_threeways_round = ({ round, filenames, report_text, report_ok, host_resolution, host_disagreement, family_record, limitation }) => {
	if (!fs.existsSync(filenames.report) && fs.existsSync(filenames.resolution)) throw new Error('threeways resolution exists without its report')
	// A diagnostic is deliberately not shaped as a worker report: the host must
	// never fabricate a worker stamp or self-check after a failed invocation.
	const report_written = write_or_match(filenames.report, report_ok ? report_text : worker_diagnostic)
	const agreed = report_ok && /^Consensus:\s+AGREE\s*$/mu.test(report_text) && host_disagreement !== true
	const consensus = agreed ? 'AGREE' : 'UNRESOLVED'
	const resolution_written = write_or_match(filenames.resolution, `${host_resolution}\n\nWorker family diversity: ${family_record}\n\nWorker family limitation: ${limitation}\n\nConsensus: ${consensus}\n\nAttempts: ${round}\n\nSelf-check: The host recorded the debate resolution without authorizing implementation.\n`)
	return { consensus, replayed: !report_written && !resolution_written }
}

const threeways_filenames = (repo_root, artifacts) => Object.fromEntries(Object.entries(artifacts).map(([kind, relative]) => [kind, artifact_path(repo_root, relative)]))

const native_handoff_from = (context, brief_text) => ({
	type: 'native-tool', stage_id: context.stage_id, round: context.round, candidate_id: context.candidate_id, ...(context.provider_instance_id ? { provider_instance_id: context.provider_instance_id } : {}),
	model: context.model, effort: context.effort, requested: clone(context.requested), limitations: [...context.limitations],
	client_request_id: context.client_request_id, brief_path: context.brief_path, brief_sha256: context.brief_sha256, task_prompt: brief_text,
})

const native_pending = (plan, facts, brief_text, launched) => {
	const brief_sha256 = sha256_text(brief_text)
	const source_identity = { source_kind: facts.source_identity.source_kind, value: facts.source_identity.value }
	const handoff = launched.native_handoff
	// Stable for retries of this round; a new round, brief, source, or launch control yields a new request id.
	const client_request_id = text_value(facts.client_request_id) ? facts.client_request_id : `threeways-r${plan.round}-${sha256_text([facts.work_root, plan.round, brief_sha256, source_identity.value, handoff.candidate_id, handoff.provider_instance_id || '', handoff.model, handoff.effort].join('\0')).slice(0, 24)}`
	const frozen_context = {
		context_version: 1, stage_id: plan.stage_id, work_root: facts.work_root, round: plan.round, artifacts: { ...plan.artifacts },
		brief_path: plan.artifacts.brief, brief_sha256, source_identity,
		candidate_id: handoff.candidate_id, ...(handoff.provider_instance_id ? { provider_instance_id: handoff.provider_instance_id } : {}),
		model: handoff.model, effort: handoff.effort, requested: clone(handoff.requested), limitations: [...handoff.limitations],
		client_request_id, task_id: null, child_thread_id: null,
	}
	return { ...launched, state: 'handoff', artifacts: plan.artifacts, retry_required: false, native_handoff: native_handoff_from(frozen_context, brief_text), frozen_context }
}

// Re-entry after the round brief exists: only the host-persisted context may restore the original dispatch.
// Live selection facts are not consulted, so candidate, policy, or choice changes cannot replace or close the round.
const resume_threeways_native = (plan, facts, filenames) => {
	const brief_text = fs.readFileSync(filenames.brief, 'utf8')
	if (brief_text !== stored_text(facts.brief_text)) return { ...plan, valid: false, error: `threeways artifact conflicts with recorded content: ${path.basename(filenames.brief)}` }
	const base = { ...plan, runner_id: 'native-tool', review: 'PENDING', consensus: 'PENDING', artifacts: plan.artifacts, retry_required: false, fallback_permitted: false }
	const context = facts.native_context
	if (context === undefined || context === null) return { ...base, state: 'uncertain', reason: 'the round brief exists without its persisted native context; recover the context from the host round record before any dispatch' }
	const refuse = error => ({ ...plan, valid: false, error, retry_required: false, fallback_permitted: false })
	const error = native_context_error(context, false)
	if (error) return refuse(error)
	if (context.work_root !== facts.work_root || context.round !== plan.round) return refuse('native threeways context belongs to another work root or round')
	if (!valid_source_identity(facts.source_identity) || facts.source_identity.source_kind !== context.source_identity.source_kind || facts.source_identity.value !== context.source_identity.value) return refuse('native threeways source_identity does not match the frozen context')
	if (context.brief_sha256 !== sha256_text(brief_text)) return refuse('native threeways frozen brief does not match the frozen context')
	if (facts.client_request_id !== undefined && facts.client_request_id !== context.client_request_id) return refuse('native threeways client_request_id does not match the frozen context')
	const bound = [context.task_id, context.child_thread_id].filter(value => value !== null && value !== undefined)
	if (bound.length === 0) return { ...base, state: 'handoff', native_handoff: native_handoff_from(context, brief_text), frozen_context: clone(context) }
	if (native_context_error(context, true)) return refuse('native threeways context must bind both taskId and childThreadId')
	return { ...base, state: 'pending', frozen_context: clone(context), native_task: { task_id: context.task_id, child_thread_id: context.child_thread_id }, reason: 'the task is already dispatched; read task_status and call complete_threeways_native' }
}

const execute_threeways_debate = async (facts, dependencies = {}) => {
	const plan = plan_threeways_debate(facts)
	if (!plan.valid || !plan.triggered || !plan.permits_launch) return plan
	if (typeof facts.repo_root !== 'string' || !has_required_sections(facts.brief_text, required_brief_sections) || !has_required_sections(facts.host_resolution, required_resolution_sections)) {
		return { ...plan, valid: false, error: 'threeways execution requires repository root plus frozen brief and resolution sections' }
	}
	const native_choice = explicit_native_choice(facts)
	const native_round = native_choice || (facts.native_context !== undefined && facts.native_context !== null)
	if (native_round && !valid_source_identity(facts.source_identity)) return { ...plan, valid: false, error: 'native threeways requires a frozen git or no-git source_identity' }
	let filenames
	try {
		filenames = threeways_filenames(facts.repo_root, plan.artifacts)
		if (native_round) {
			if (fs.existsSync(filenames.report) || fs.existsSync(filenames.resolution)) throw new Error('threeways round already has results; resume it with complete_threeways_native')
			if (fs.existsSync(filenames.brief)) return resume_threeways_native(plan, facts, filenames)
			if (facts.native_context !== undefined && facts.native_context !== null) throw new Error('native threeways context has no frozen brief for this round')
		} else write_immutable(filenames.brief, facts.brief_text)
	} catch (error) {
		return { ...plan, valid: false, error: error.message }
	}

	if (native_choice) {
		// The brief is frozen only with a handoff, so a failed first selection starts nothing and closes nothing.
		let launched
		try { launched = await launch_threeways_debate(facts, dependencies) } catch (error) { return { ...plan, valid: false, error: `threeways native selection failed: ${error.message}`, worker_started: false, retry_required: false } }
		if (launched.selection?.kind === 'internal' && launched.native_handoff) {
			try { write_immutable(filenames.brief, facts.brief_text) } catch (error) { return { ...plan, valid: false, error: error.message } }
			return native_pending(plan, facts, stored_text(facts.brief_text), launched)
		}
		return { ...launched, consensus: launched.valid === false ? launched.consensus : 'UNRESOLVED', worker_started: false, retry_required: false, fallback_permitted: false }
	}
	let launched
	try {
		launched = await launch_threeways_debate(facts, dependencies)
	} catch (error) {
		launched = { ...plan, valid: false, error: `threeways runner failed: ${error.message}`, runner: { status: 'spawn_error' } }
	}
	const report_text = typeof launched.runner?.result?.value === 'string' ? launched.runner.result.value : ''
	const report_ok = launched.runner?.status === 'completed' && valid_worker_report(report_text)
	try {
		const { consensus } = finalize_threeways_round({
			round: plan.round, filenames, report_text, report_ok, host_resolution: facts.host_resolution, host_disagreement: facts.host_disagreement,
			family_record: launched.worker?.family_diversity || 'unavailable', limitation: launched.worker?.limitation || 'none recorded',
		})
		return { ...launched, artifacts: plan.artifacts, consensus, retry_required: consensus === 'UNRESOLVED' && plan.round < 3 }
	} catch (error) {
		return { ...launched, valid: false, error: error.message }
	}
}

const native_context_error = (context, require_bound) => {
	if (!is_object(context) || context.context_version !== 1 || context.stage_id !== 'threeways') return 'native threeways context must be a version-1 threeways frozen context'
	if (!Number.isInteger(context.round) || context.round < 1 || context.round > 3) return 'native threeways context round must be 1 through 3'
	const plan = plan_threeways_debate({ ask_text: 'threeways', work_root: context.work_root, worker_starts: context.round - 1 })
	if (!plan.valid || !is_object(context.artifacts) || ['brief', 'report', 'resolution'].some(kind => context.artifacts[kind] !== plan.artifacts[kind]) || context.brief_path !== plan.artifacts.brief) return 'native threeways context artifacts do not match its work root and round'
	if (typeof context.brief_sha256 !== 'string' || !/^[0-9a-f]{64}$/u.test(context.brief_sha256)) return 'native threeways context must record the brief sha256'
	if (!valid_source_identity(context.source_identity)) return 'native threeways context must record a git or no-git source_identity'
	for (const field of ['candidate_id', 'model', 'effort', 'client_request_id']) if (!text_value(context[field])) return `native threeways context ${field} must be non-empty text`
	if (context.provider_instance_id !== undefined && !text_value(context.provider_instance_id)) return 'native threeways context provider_instance_id must be non-empty when present'
	if (!is_object(context.requested) || !Array.isArray(context.limitations)) return 'native threeways context must record requested controls and limitations'
	const exact_model = context.requested.exact_model || context.requested.owner_exact_model
	const exact_effort = context.requested.exact_effort || context.requested.owner_exact_effort
	if ((exact_model && exact_model !== context.model) || (exact_effort && exact_effort !== context.effort)) return 'native threeways context substitutes an exact owner model or effort'
	if (require_bound && !(text_value(context.task_id) && text_value(context.child_thread_id))) return 'native threeways context must be bound to the delegated taskId and childThreadId'
	return null
}

// Records the real delegate_task result in the host-persisted context; one context owns one task.
const bind_threeways_native_task = (context, delegated) => {
	const error = native_context_error(context, false)
	if (error) return { valid: false, error }
	if (!is_object(delegated) || !text_value(delegated.taskId) || !text_value(delegated.childThreadId)) return { valid: false, error: 'delegate_task result must supply taskId and childThreadId' }
	for (const [field, expected] of [['clientRequestId', context.client_request_id], ['providerInstanceId', context.provider_instance_id], ['model', context.model], ['effort', context.effort]]) {
		for (const value of [delegated[field], delegated.target?.[field]]) if (value !== undefined && value !== null && value !== expected) return { valid: false, error: `delegate_task ${field} does not match the frozen context` }
	}
	if ((context.task_id !== null && context.task_id !== undefined) || (context.child_thread_id !== null && context.child_thread_id !== undefined)) {
		if (context.task_id !== delegated.taskId || context.child_thread_id !== delegated.childThreadId) return { valid: false, error: 'native threeways context is already bound to another task' }
	}
	return { valid: true, context: { ...clone(context), task_id: delegated.taskId, child_thread_id: delegated.childThreadId } }
}

const native_pending_states = new Set(['queued', 'running', 'waiting'])
const native_terminal_states = Object.freeze({ completed: 'completed', failed: 'task-failed', cancelled: 'cancelled', interrupted: 'cancelled' })

// Resumes a native round from host-observed task_status evidence; it never launches or rewrites the brief.
const complete_threeways_native = input => {
	if (!is_object(input)) return { valid: false, error: 'native threeways completion input must be an object' }
	const { context } = input
	const context_error = native_context_error(context, true)
	if (context_error) return { valid: false, error: context_error }
	if (!valid_source_identity(input.source_identity) || input.source_identity.source_kind !== context.source_identity.source_kind || input.source_identity.value !== context.source_identity.value) return { valid: false, error: 'native threeways source_identity does not match the frozen context' }
	if (input.round !== context.round) return { valid: false, error: 'native threeways round does not match the frozen context' }
	if (typeof input.repo_root !== 'string' || !has_required_sections(input.host_resolution, required_resolution_sections)) return { valid: false, error: 'native threeways completion requires repository root and resolution sections' }
	let filenames
	try { filenames = threeways_filenames(input.repo_root, context.artifacts) } catch (error) { return { valid: false, error: error.message } }
	if (!fs.existsSync(filenames.brief) || sha256_text(fs.readFileSync(filenames.brief, 'utf8')) !== context.brief_sha256) return { valid: false, error: 'native threeways frozen brief is missing or changed' }
	const base = { valid: true, stage_id: 'threeways', round: context.round, artifacts: { ...context.artifacts } }
	const waiting = (state, reason) => ({ ...base, state, consensus: 'PENDING', retry_required: false, fallback_permitted: false, reason })
	const status = input.task_status
	if (!is_object(status)) return waiting('uncertain', 'task_status evidence is missing or malformed')
	if (status.taskId !== context.task_id) return { valid: false, error: 'task_status taskId does not match the frozen context' }
	for (const [field, expected] of [['childThreadId', context.child_thread_id], ['clientRequestId', context.client_request_id], ['providerInstanceId', context.provider_instance_id], ['model', context.model], ['effort', context.effort]]) {
		if (status[field] !== undefined && status[field] !== null && status[field] !== expected) return { valid: false, error: `task_status ${field} does not match the frozen context` }
	}
	if (status.waitTimedOut === true || status.timedOut === true) return waiting('uncertain', 'task status timed out; keep the taskId and read task_status again')
	if (native_pending_states.has(status.status)) return waiting('pending', `task is ${status.status}`)
	if (!Object.hasOwn(native_terminal_states, status.status)) return waiting('uncertain', 'task_status state is missing or unknown')
	if (typeof status.hasPendingChildRuns !== 'boolean') return waiting('uncertain', 'task_status hasPendingChildRuns is missing')
	if (status.hasPendingChildRuns || status.workState === 'working' || status.workState === 'waiting_for_children') return waiting('pending', 'task still has pending child runs')
	const state = native_terminal_states[status.status]
	const report_text = state === 'completed' && typeof status.summary === 'string' ? status.summary : ''
	const report_ok = state === 'completed' && valid_worker_report(report_text)
	let closed
	try {
		closed = finalize_threeways_round({
			round: context.round, filenames, report_text, report_ok, host_resolution: input.host_resolution, host_disagreement: input.host_disagreement,
			family_record: 'unavailable', limitation: context.limitations.filter(text_value).join('; ') || 'none recorded',
		})
	} catch (error) {
		return { valid: false, error: error.message }
	}
	// An owner stop stays unresolved until renewed authorization; it is never an automatic retry.
	const stopped = state === 'cancelled'
	return {
		...base, state, consensus: closed.consensus, replayed: closed.replayed,
		retry_required: closed.consensus === 'UNRESOLVED' && !stopped && context.round < 3,
		requires_authorization: stopped, fallback_permitted: false,
		attempt: {
			candidate_id: context.candidate_id, kind: 'internal', state, actual: { model: context.model, effort: context.effort },
			transport: { tool: 'task_status', handle: context.task_id, thread_id: context.child_thread_id, client_request_id: context.client_request_id, worker_started: true, stop_verified: true },
		},
	}
}

const main = async (argv, dependencies = {}) => {
	if (!Array.isArray(argv) || argv.length !== 2 || argv[0] !== 'threeways' || argv[1] === '') {
		throw new Error('usage: node delegation-route.js threeways <frozen-facts.json>')
	}
	const facts_path = path.resolve(argv[1])
	const facts = JSON.parse(fs.readFileSync(facts_path, 'utf8'))
	const result = await execute_threeways_debate(facts, dependencies)
	process.stdout.write(`${JSON.stringify(result)}\n`)
	if (result.valid === false || result.consensus === 'UNRESOLVED') process.exitCode = 1
	return result
}

const validate_generic_external_record = record => {
	if (record === null || typeof record !== 'object' || Array.isArray(record)) return 'generic-external record must be an object'
	if (record.executor_class !== 'generic_external') return 'generic-external record executor_class must be generic_external'
	if (typeof record.substantive_delegated_capable !== 'boolean') return 'generic-external record substantive_delegated_capable must be an actual boolean'
	if (record.runner_id !== 'external-runner-v1') return 'generic-external record runner_id must identify the tested runner'
	if (record.shared_supervision !== 'absent') return 'generic-external record shared_supervision must be absent'
	if (record.clone_isolation !== 'independent') return 'generic-external record clone_isolation must be independent'
	if (record.os_confinement !== 'not_proven') return 'generic-external record os_confinement must be not_proven'
	if (!nonempty_text(record.stage_id)) return 'generic-external record stage_id must be a non-empty stable string'
	if (!string_array(record.material_risks)) return 'generic-external record material_risks must be an array of non-empty risk identifiers'
	if (!nonempty_text(record.reason)) return 'generic-external record reason must be a non-empty plain-language string'
	for (const field of Object.keys(record)) if (!generic_external_record_fields.includes(field)) return `generic-external record must not contain unrecognised field ${field}`
	return null
}

const selection_kinds = Object.freeze(['external', 'internal', 'host'])
const execution_states = Object.freeze(['completed', 'unavailable', 'task-failed', 'cancelled', 'uncertain'])
const is_object = value => value !== null && typeof value === 'object' && !Array.isArray(value)
const text_value = value => typeof value === 'string' && value.trim().length > 0
const clone = value => JSON.parse(JSON.stringify(value))

const policy_values = policy => {
	const source = is_object(policy) ? policy : {}
	const allowed_worker = source.allowed_worker || source['allowed-worker']
	const review_policy = source.review_policy || source['review-policy'] || 'prefer-independent'
	return { allowed_worker, review_policy }
}

const normalise_selection_policy = policy => {
	const { allowed_worker, review_policy } = policy_values(policy)
	if (!Array.isArray(allowed_worker) || allowed_worker.length === 0 || allowed_worker.some(kind => !selection_kinds.includes(kind)) || new Set(allowed_worker).size !== allowed_worker.length) {
		throw new TypeError('policy.allowed_worker must be a non-empty permission list of unique external, internal, or host')
	}
	if (!['prefer-independent', 'require-independent'].includes(review_policy)) throw new TypeError('policy.review_policy must be prefer-independent or require-independent')
	return { allowed_worker: selection_kinds.filter(kind => allowed_worker.includes(kind)), review_policy }
}

const requested_controls = task => {
	const source = is_object(task) ? task : {}
	const exact_model = source.exact_model || source.owner_exact_model
	const exact_effort = source.exact_effort || source.owner_exact_effort
	return {
		tier: source.requested_tier || source.tier,
		model: exact_model || source.requested_model,
		effort: exact_effort || source.requested_effort,
		exact_model: exact_model,
		exact_effort: exact_effort,
	}
}

const hard_read_only = task => {
	const source = is_object(task) ? task : {}
	const restrictions = source.hard_restrictions || source.restrictions || {}
	return source.enforced_read_only === true || source.require_read_only === true || restrictions.read_only === true || restrictions.read_only?.required === true || restrictions.enforced_read_only === true
}
const hard_fresh_context = task => is_object(task) && (task.require_fresh_context === true || task.require_independent_context === true || task.fresh_context === 'required')
const host_review_hard_requirement = task => is_object(task) && (task.require_independent_review === true || task.require_second_reviewer === true || task.explicit_second_reviewer === true || task.independence_required === true || task.require_independent === true)
const normalise_role = role => String(role || '').trim().toLowerCase().replace(/[ _]+/gu, '-')
const review_roles = new Set(['cross-check', 'acceptance', 'security-scan', 'review', 'threeways', 'three-way-review'])
const review_task = task => is_object(task) && (task.review === true || review_roles.has(normalise_role(task.role)))
const pipeline_role_setting = (facts, task) => {
	const config = is_object(facts?.config) ? facts.config : {}
	const roles = config['pipeline-roles'] || config.pipeline_roles
	if (!is_object(roles)) return undefined
	const role = normalise_role(task?.role)
	return roles[role]
}
const unresolved_history = facts => {
	const attempts = Array.isArray(facts?.attempts) ? facts.attempts : []
	return attempts.filter(attempt => {
		if (!is_object(attempt)) return true
		if (attempt.state === 'completed') return false
		if (!['unavailable', 'cancelled', 'task-failed', 'uncertain'].includes(attempt.state)) return true
		const lifecycle = is_object(attempt.transport) ? attempt.transport : attempt
		const stopped = lifecycle.worker_started === false || lifecycle.stop_verified === true || lifecycle.cessation_verified === true || lifecycle.worker_stopped === true
		if (!stopped || attempt.ownership_uncertain === true || attempt.ownership === 'uncertain') return true
		if (attempt.state === 'cancelled' && facts.resume_authorized !== true) return true
		const inspected = (attempt.acceptance?.coordinator_inspected ?? attempt.coordinator_inspected) === true
		const reconciled = inspected && (attempt.reconciled === true || attempt.reconciliation?.completed === true)
		if (attempt.state === 'task-failed' || attempt.state === 'uncertain') return !reconciled
		return Array.isArray(attempt.changed_paths) && attempt.changed_paths.length > 0 && !reconciled
	})
}

const candidate_model = (candidate, task, kind = '') => {
	const controls = requested_controls(task)
	const actual = {
		model: candidate.model || candidate.controls?.model || 'inherited',
		effort: candidate.effort || candidate.controls?.effort || 'inherited',
	}
	let value = candidate.model_effort || candidate.value
	let tier_fallback
	if (!value && controls.tier && is_object(candidate.tiers)) {
		value = candidate.tiers[controls.tier]
		if (!value && kind === 'external' && candidate.tiers.basic) {
			value = candidate.tiers.basic
			tier_fallback = `tier substitution: ${controls.tier} → basic; reason: requested external tier is unavailable`
		}
	}
	const parsed = typeof value === 'string' ? settings.parse_model_value(value) : null
	let usable = parsed ? { model: parsed.model, effort: parsed.effort } : { ...actual }
	let control_limitation
	if (kind === 'internal') {
		for (const key of ['model', 'effort']) {
			const supported = candidate.controls?.[key === 'model' ? 'models' : 'efforts']
			const exact = controls[`exact_${key}`]
			const desired = exact || usable[key]
			if (desired === actual[key] || (Array.isArray(supported) && supported.includes(desired))) usable[key] = desired
			else { usable[key] = actual[key]; control_limitation = 'native tier identity is not exposed by the actual model/effort controls' }
		}
	}
	return { ...usable, ...(tier_fallback ? { tier_fallback } : {}), ...(control_limitation ? { control_limitation } : {}) }
}

const matches_exact_controls = (candidate, task, kind = '') => {
	const controls = requested_controls(task)
	const usable = candidate_model(candidate, task, kind)
	if (controls.exact_model && Array.isArray(candidate.controls?.models) && !candidate.controls.models.includes(controls.exact_model)) return { ok: false, reason: `exact model ${controls.exact_model} is unavailable` }
	if (controls.exact_effort && Array.isArray(candidate.controls?.efforts) && !candidate.controls.efforts.includes(controls.exact_effort)) return { ok: false, reason: `exact effort ${controls.exact_effort} is unavailable` }
	if (controls.exact_model && usable.model !== controls.exact_model) return { ok: false, reason: `exact model ${controls.exact_model} is unavailable` }
	if (controls.exact_effort && usable.effort !== controls.exact_effort) return { ok: false, reason: `exact effort ${controls.exact_effort} is unavailable` }
	if (hard_read_only(task) && !(candidate.controls?.read_only === true || candidate.controls?.enforced_read_only === true || candidate.read_only === true)) return { ok: false, reason: 'enforced read-only access is unavailable' }
	if (hard_fresh_context(task) && !(candidate.controls?.fresh_context === true || candidate.controls?.independent_context === true || candidate.fresh_context === true)) return { ok: false, reason: 'fresh independent context is unavailable' }
	return { ok: true, usable }
}

const attempt_ids = facts => {
	const source = is_object(facts) ? facts : {}
	const ids = new Set(Array.isArray(source.attempts) ? source.attempts.filter(attempt => attempt && (source.condition_fingerprint === undefined || attempt.condition_fingerprint === undefined || attempt.condition_fingerprint === source.condition_fingerprint)).map(attempt => attempt.candidate_id).filter(text_value) : [])
	const disabled = source.session_disabled_candidate_ids || source.disabled_candidate_ids
	if (Array.isArray(disabled)) for (const id of disabled) if (text_value(id)) ids.add(id)
	return ids
}

const safe_literal_command = command => Array.isArray(command) && command.length > 0 && command.every((argument, index) => {
	if (!text_value(argument) || /[\u0000-\u001f\u007f\u2028\u2029|&;<>$`(){}*?\[\]!'"\\]/u.test(argument)) return false
	return index !== 0 || (argument !== '.' && argument !== '..')
})

const external_candidates = (facts, task, skipped) => {
	const capabilities = is_object(facts.capabilities) ? facts.capabilities : {}
	const external = Array.isArray(capabilities.external) ? capabilities.external : Array.isArray(capabilities.external?.profiles) ? capabilities.external.profiles : []
	const provider = facts.policy?.cli_provider || facts.host?.cli_provider || facts.config?.switches?.['cli-provider'] || 'on'
	const host_family = facts.host?.family || settings.family_for_host(facts.host?.id || '')
	const eligible = external.map((raw, index) => ({ candidate: is_object(raw?.profile) ? { ...raw.profile, ...raw } : raw, index })).sort((left, right) => (Number(right.candidate?.priority) || 0) - (Number(left.candidate?.priority) || 0) || left.index - right.index).filter(({ candidate }) => {
		const id = candidate?.candidate_id || candidate?.id || candidate?.profile?.id
		if (!text_value(id)) { skipped.push({ kind: 'external', reason: 'candidate has no stable candidate_id' }); return false }
		if (skipped.some(item => item.candidate_id === id)) return false
		if (candidate.disabled === true || candidate.available !== true) { skipped.push({ kind: 'external', candidate_id: id, reason: candidate.disabled === true ? 'candidate is disabled' : 'executable unavailable' }); return false }
		const recipe_checked = candidate.recipe_checked === true || candidate.checked_recipe === true || candidate.invocation_recipe_checked === true || candidate.recipe?.checked === true || candidate.invocation_recipe?.checked === true
		if (!recipe_checked) { skipped.push({ kind: 'external', candidate_id: id, reason: 'checked Codex/Claude invocation recipe is unavailable' }); return false }
		if (provider === 'off' && (host_family === '' || settings.profile_family(candidate) !== host_family)) { skipped.push({ kind: 'external', candidate_id: id, reason: 'cli-provider=off excludes unknown or different external family' }); return false }
		const controls = requested_controls(task)
		if (controls.tier && is_object(candidate.tiers) && !candidate.tiers[controls.tier] && !candidate.tiers.basic && candidate.model === undefined && candidate.model_effort === undefined && candidate.value === undefined) { skipped.push({ kind: 'external', candidate_id: id, reason: `requested tier ${controls.tier} and basic substitution are unavailable` }); return false }
		if (!safe_literal_command(candidate.command)) { skipped.push({ kind: 'external', candidate_id: id, reason: 'checked literal external command is unavailable' }); return false }
		return true
	}).map(({ candidate }) => candidate)
	const tier = requested_controls(task).tier
	const matching = eligible.filter(candidate => !tier || candidate.tiers?.[tier] || candidate.model_effort || candidate.value)
	return matching.length ? matching : eligible
}

const internal_candidates = (facts, skipped) => {
	const value = facts.capabilities?.internal
	const candidates = Array.isArray(value) ? [...value] : value ? [value] : []
	return candidates.filter(candidate => {
		const id = candidate?.candidate_id || candidate?.id || 'internal'
		if (skipped.some(item => item.candidate_id === id)) return false
		if (candidate.available !== true) { skipped.push({ kind: 'internal', candidate_id: id, reason: 'native interface is unavailable in this host session' }); return false }
		return true
	})
}

const host_candidates = (facts, skipped) => {
	const value = facts.capabilities?.host
	const candidates = Array.isArray(value) ? [...value] : value ? [value] : []
	if (candidates.length === 0 && facts.task?.interactive_host === true) candidates.push({ candidate_id: `host:${facts.host?.id || 'unknown'}`, available: true })
	return candidates.filter(candidate => {
		const id = candidate?.candidate_id || candidate?.id || 'host'
		if (skipped.some(item => item.candidate_id === id)) return false
		if (candidate.available !== true) { skipped.push({ kind: 'host', candidate_id: id, reason: 'host direct execution is unavailable' }); return false }
		return true
	})
}

// Turns one observed T3 orchestrator_capabilities catalog plus the host's exact selection into an
// internal candidate and a delegate_task target. Pure data: it never calls tools or picks a model.
const prepare_t3_internal_candidate = input => {
	const refuse = error => ({ valid: false, error })
	if (!is_object(input)) return refuse('T3 preparation input must be an object')
	const tools = input.tools
	if (!is_object(tools)) return refuse('observed T3 invoke, result, and stop tool availability is required')
	for (const control of ['invoke', 'result', 'stop']) if (tools[control] !== true) return refuse(`T3 ${control} tool is unavailable in this host session`)
	const catalog = input.catalog
	if (!is_object(catalog) || !Array.isArray(catalog.providers)) return refuse('observed orchestrator_capabilities catalog with a providers list is required')
	const selection = is_object(input.selection) ? input.selection : {}
	const provider_id = selection.provider_instance_id ?? selection.providerInstanceId
	const model_id = selection.model
	if (!text_value(provider_id)) return refuse('selected T3 provider instance is required')
	if (!text_value(model_id)) return refuse('selected T3 model is required')
	const provider = catalog.providers.find(item => is_object(item) && item.providerInstanceId === provider_id)
	if (!provider) return refuse(`T3 provider instance ${provider_id} is not listed by orchestrator_capabilities`)
	if (provider.canRunChildTask !== true || provider.enabled === false) return refuse(`T3 provider instance ${provider_id} cannot run child tasks`)
	const model = Array.isArray(provider.models) ? provider.models.find(item => is_object(item) && item.id === model_id) : undefined
	if (!model) return refuse(`T3 model ${model_id} is not listed for provider instance ${provider_id}`)
	const descriptors = Array.isArray(model.options) ? model.options.filter(is_object) : []
	const chosen = selection.options === undefined ? {} : selection.options
	if (!is_object(chosen)) return refuse('selected T3 options must map option IDs to values')
	for (const [id, value] of Object.entries(chosen)) {
		const descriptor = descriptors.find(item => item.id === id)
		if (!descriptor) return refuse(`T3 option ${id} is not listed for model ${model_id}`)
		if (descriptor.type === 'boolean') { if (typeof value !== 'boolean') return refuse(`T3 option ${id} requires a boolean value`); continue }
		if (descriptor.type !== 'select') return refuse(`T3 option ${id} has unsupported type ${descriptor.type}`)
		const values = Array.isArray(descriptor.options) ? descriptor.options.filter(is_object).map(item => item.id) : []
		if (typeof value !== 'string' || !values.includes(value)) return refuse(`T3 option ${id} value ${value} is not listed for model ${model_id}`)
	}
	// The host names which of this model's select options carries effort; no option ID is assumed.
	const effort_option = selection.effort_option
	if (effort_option !== undefined) {
		const descriptor = descriptors.find(item => item.id === effort_option)
		if (!descriptor || descriptor.type !== 'select') return refuse(`T3 effort option ${effort_option} is not a select option of model ${model_id}`)
		if (!Object.hasOwn(chosen, effort_option)) return refuse(`T3 effort option ${effort_option} has no selected value`)
	}
	const effort = effort_option === undefined ? 'inherited' : chosen[effort_option]
	const target = { providerInstanceId: provider_id, model: model_id, ...(Object.keys(chosen).length ? { options: { ...chosen } } : {}) }
	const candidate = {
		candidate_id: `t3:${provider_id}:${model_id}`, available: true, provider_instance_id: provider_id, model: model_id, effort,
		controls: { models: [model_id], ...(effort === 'inherited' ? {} : { efforts: [effort] }) }, target: clone(target),
	}
	return { valid: true, candidate, target }
}

const selected_result = (kind, candidate, task, reason, limitations = []) => {
	const id = candidate.candidate_id || candidate.id || `${kind}:${task.task_id || 'task'}`
	const controls = requested_controls(task)
	const usable = candidate_model(candidate, task, kind)
	const requested = { ...(controls.exact_model ? { exact_model: controls.exact_model } : {}), ...(controls.exact_effort ? { exact_effort: controls.exact_effort } : {}), ...(controls.tier ? { tier: controls.tier } : {}), ...(controls.model ? { model: controls.model } : {}), ...(controls.effort ? { effort: controls.effort } : {}) }
	if (hard_read_only(task)) requested.enforced_read_only = true
	if (hard_fresh_context(task)) requested.require_fresh_context = true
	const result_limitations = Array.isArray(limitations) ? [...limitations] : [String(limitations)]
	if (usable.tier_fallback) result_limitations.push(usable.tier_fallback)
	if (usable.control_limitation) result_limitations.push(usable.control_limitation)
	const native_controls = { ...(usable.model !== 'inherited' && usable.model !== 'unknown' ? { model: usable.model } : {}), ...(usable.effort !== 'inherited' && usable.effort !== 'unknown' ? { effort: usable.effort } : {}) }
	if (hard_read_only(task)) native_controls.enforced_read_only = true
	if (hard_fresh_context(task)) native_controls.fresh_context = true
	if (controls.model && !controls.exact_model && usable.model !== controls.model) result_limitations.push(`requested model ${controls.model} was not exposed; actual ${usable.model} recorded`)
	if (controls.effort && !controls.exact_effort && usable.effort !== controls.effort) result_limitations.push(`requested effort ${controls.effort} was not exposed; actual ${usable.effort} recorded`)
	const result = {
		status: 'selected', candidate_id: id, kind, reason,
		requested_model: controls.model || 'inherited', requested_effort: controls.effort || 'inherited',
		requested, actual: { model: usable.model, effort: usable.effort }, usable_model: usable.model, usable_effort: usable.effort, limitations: result_limitations,
	}
	if (kind === 'external') result.action = { type: 'external-runner', candidate_id: id, profile_id: candidate.profile?.id || candidate.id || id, command: [...candidate.command] }
	if (kind === 'internal') result.action = { type: 'native-tool', candidate_id: id, brief: clone(task.brief || task.frozen_brief || {}), controls: native_controls, ...(is_object(candidate.target) ? { target: clone(candidate.target) } : {}) }
	if (kind === 'host') result.action = { type: 'host-direct', candidate_id: id, work_boundary: clone(task.work_boundary || []), reason }
	return result
}

const select_executor_action = facts => {
	if (!is_object(facts)) return { status: 'unsatisfied', requirement: 'selection facts must be an object', attempted: [], skipped: [], permitted_alternatives: [] }
	let policy
	try { policy = normalise_selection_policy(facts.policy || facts.config?.switches || facts.config) } catch (error) { return { status: 'unsatisfied', requirement: error.message, attempted: [], skipped: [], permitted_alternatives: [] } }
	const task = is_object(facts.task) ? { ...facts.task } : {}
	if (!task.requested_tier && !task.tier) task.requested_tier = pipeline_role_setting(facts, task) || 'basic'
	const attempted = attempt_ids(facts)
	const skipped = []
	const hard_failure = []
	const decision = (status, requirement, alternatives = []) => ({ status, requirement, attempted: [...attempted], skipped, permitted_alternatives: [...policy.allowed_worker], alternatives })
	if (pipeline_role_setting(facts, task) === 'off') return decision('unsatisfied', 'pipeline role ' + (normalise_role(task.role) || '<unknown>') + ' is disabled')
	if (unresolved_history(facts).length > 0) return decision('unsatisfied', 'selection is blocked by unresolved cancellation, task-failed, or uncertain worker history')
	const choice = task.executor_choice
	if (choice !== undefined && (!is_object(choice) || !selection_kinds.includes(choice.kind) || !text_value(choice.reason) || (choice.candidate_id !== undefined && !text_value(choice.candidate_id)))) return decision('unsatisfied', 'task.executor_choice requires a kind, a task-specific reason, and an optional non-empty candidate_id')
	if (choice && !policy.allowed_worker.includes(choice.kind)) return decision('unsatisfied', 'host executor choice is forbidden by allowed-worker')
	const is_review = review_task(task)
	const candidates_for = {
		external: () => external_candidates(facts, task, skipped),
		internal: () => internal_candidates(facts, skipped),
		host: () => host_candidates(facts, skipped),
	}
	let eligible = []
	// Enumeration order is stable for presentation; it never selects between kinds.
	for (const kind of policy.allowed_worker) {
		for (const candidate of candidates_for[kind]()) {
			const id = candidate.candidate_id || candidate.id || candidate.profile?.id || kind
			if (attempted.has(id)) { skipped.push({ kind, candidate_id: id, reason: 'candidate already attempted under this condition' }); continue }
			if (kind === 'host' && (host_review_hard_requirement(task) || (is_review && policy.review_policy === 'require-independent'))) { skipped.push({ kind, candidate_id: id, reason: 'independent review policy excludes host review' }); hard_failure.push('independent review requirement is unavailable'); continue }
			const controls = matches_exact_controls(candidate, task, kind)
			if (!controls.ok) { skipped.push({ kind, candidate_id: id, reason: controls.reason }); hard_failure.push(controls.reason); continue }
			const limitations = Array.isArray(candidate.limitations) ? [...candidate.limitations] : []
			if (kind === 'internal') {
				if (controls.usable.control_limitation) limitations.push(controls.usable.control_limitation)
				if (requested_controls(task).tier && !candidate.tiers?.[requested_controls(task).tier] && candidate.model === undefined) limitations.push('native interface did not expose configured tier ' + requested_controls(task).tier + '; inherited/default identity recorded')
			}
			eligible.push({ kind, candidate: { ...candidate, candidate_id: id }, limitations })
		}
	}
	if (is_review && eligible.some(item => item.kind !== 'host')) {
		for (const item of eligible.filter(item => item.kind === 'host')) skipped.push({ kind: 'host', candidate_id: item.candidate.candidate_id, reason: 'separate reviewer is available; review-policy excludes host fallback' })
		eligible = eligible.filter(item => item.kind !== 'host')
	}
	const alternatives = eligible.map(({ kind, candidate, limitations }) => ({ kind, candidate_id: candidate.candidate_id, actual: candidate_model(candidate, task, kind), limitations }))
	if (eligible.length === 0) return decision('unsatisfied', hard_failure[0] || 'no permitted executor is available', alternatives)
	const selected = choice ? eligible.find(item => item.kind === choice.kind && (!choice.candidate_id || item.candidate.candidate_id === choice.candidate_id)) : undefined
	if (choice && !selected) return decision('unsatisfied', 'host executor choice is not eligible', alternatives)
	if (!choice && new Set(eligible.map(item => item.kind)).size > 1) return decision('selection-required', 'host must choose an eligible executor for this task; allowed-worker order has no priority', alternatives)
	const { kind, candidate, limitations } = selected || eligible[0]
	const host_review = kind === 'host' && is_review
	if (host_review) limitations.push('separate reviewer unavailable: ' + (skipped.filter(item => item.kind !== 'host').map(item => item.reason).join('; ') || 'no eligible permitted external or internal reviewer'))
	const reason = choice?.reason || (host_review ? 'separate reviewer unavailable; host review fallback recorded' : 'only eligible executor kind: ' + kind)
	const result = selected_result(kind, candidate, task, reason, limitations)
	if (host_review) result.fallback_reason = 'prefer-independent policy recorded unavailable separate reviewers before host fallback'
	return result
}

const next_executor_action = (facts, settled_attempt) => {
	if (!is_object(settled_attempt) || settled_attempt.state !== 'unavailable') return { status: 'unsatisfied', requirement: 'automatic fallback requires a settled unavailable attempt', attempted: [], skipped: [], permitted_alternatives: [] }
	if (!text_value(settled_attempt.candidate_id)) return { status: 'unsatisfied', requirement: 'automatic fallback requires a stable unavailable candidate_id', attempted: [], skipped: [], permitted_alternatives: [] }
	if (facts?.condition_fingerprint !== undefined && settled_attempt.condition_fingerprint !== undefined && facts.condition_fingerprint !== settled_attempt.condition_fingerprint) return { status: 'unsatisfied', requirement: 'automatic fallback requires the unchanged capability condition', attempted: [], skipped: [], permitted_alternatives: [] }
	const lifecycle = is_object(settled_attempt.transport) ? settled_attempt.transport : settled_attempt
	const cessation_verified = lifecycle.worker_started === false || lifecycle.stop_verified === true || lifecycle.cessation_verified === true || lifecycle.worker_stopped === true
	if (!cessation_verified) return { status: 'unsatisfied', requirement: 'automatic fallback requires explicit worker_started=false or verified worker cessation', attempted: [], skipped: [], permitted_alternatives: [] }
	if (settled_attempt.ownership_uncertain === true || settled_attempt.uncertain_ownership === true || settled_attempt.ownership === 'uncertain') return { status: 'unsatisfied', requirement: 'automatic fallback is blocked by uncertain worker ownership', attempted: [], skipped: [], permitted_alternatives: [] }
	if (settled_attempt.changed_paths !== undefined && !Array.isArray(settled_attempt.changed_paths)) return { status: 'unsatisfied', requirement: 'automatic fallback changed_paths must be an observed path array', attempted: [], skipped: [], permitted_alternatives: [] }
	if (Array.isArray(settled_attempt.changed_paths) && settled_attempt.changed_paths.length > 0 && !((settled_attempt.acceptance?.coordinator_inspected ?? settled_attempt.coordinator_inspected) === true && (settled_attempt.reconciled === true || settled_attempt.reconciliation?.completed === true))) return { status: 'unsatisfied', requirement: 'automatic fallback requires coordinator inspection and reconciliation for changed paths', attempted: [], skipped: [], permitted_alternatives: [] }
	const prior = Array.isArray(facts?.attempts) ? facts.attempts : []
	const next_facts = { ...facts, attempts: [...prior, settled_attempt] }
	let next = select_executor_action(next_facts)
	const choice = facts?.task?.executor_choice
	// Expire only the failed choice, so the host can reassess the remaining kinds.
	if (next.status === 'unsatisfied' && next.requirement === 'host executor choice is not eligible' && choice && (choice.candidate_id === settled_attempt.candidate_id || (!choice.candidate_id && (choice.kind === settled_attempt.kind || next.skipped.some(item => item.candidate_id === settled_attempt.candidate_id && item.kind === choice.kind))))) {
		const task = { ...facts.task }
		delete task.executor_choice
		next = select_executor_action({ ...next_facts, task })
	}
	if (next.status === 'selected') next.fallback_reason = settled_attempt.reason || `previous candidate ${settled_attempt.candidate_id || '<unknown>'} was unavailable`
	return next
}

const validate_execution_record = (record, context = {}) => {
	if (is_object(record) && record.executor_class === 'generic_external') return validate_generic_external_record(record)
	if (!is_object(record)) return 'execution record must be an object'
	const required = ['record_version', 'task_id', 'attempt_id', 'candidate_id', 'kind', 'role', 'source_identity', 'requested', 'actual', 'state', 'outputs', 'changed_paths', 'acceptance', 'limitations', 'transport']
	for (const field of required) if (!Object.hasOwn(record, field)) return `execution record missing ${field}`
	if (record.record_version !== 1) return 'execution record record_version must be supported version 1'
	if (!['external', 'internal', 'host'].includes(record.kind)) return 'execution record kind is invalid'
	if (!execution_states.includes(record.state)) return 'execution record state is invalid'
	for (const field of ['task_id', 'attempt_id', 'candidate_id', 'role']) if (!text_value(record[field])) return `execution record ${field} must be non-empty text`
	const source_kind = record.source_identity && (record.source_identity.source_kind || record.source_identity.kind)
	const source_value = record.source_identity && (record.source_identity.value || record.source_identity.commit || record.source_identity.digest)
	if (!is_object(record.source_identity) || !['git', 'no-git'].includes(source_kind) || !text_value(source_value)) return 'execution record source_identity must identify git or no-git work'
	if (source_kind === 'git' && !/^[0-9a-f]{40}$/u.test(source_value)) return 'execution record git source identity must be exactly 40 lowercase hexadecimal characters'
	if (source_kind === 'no-git' && !/^[0-9a-f]{64}$/u.test(source_value)) return 'execution record no-git digest must be exactly 64 lowercase hexadecimal characters'
	if (source_kind === 'no-git' && Object.hasOwn(record.source_identity, 'commit')) return 'no-git source identity must not invent a commit'
	if (!is_object(record.requested) || !is_object(record.actual)) return 'execution record requested and actual must be objects'
	for (const field of ['model', 'effort']) if (!Object.hasOwn(record.actual, field) || !(text_value(record.actual[field]) || ['unknown', 'inherited'].includes(record.actual[field]))) return `execution record actual.${field} must record a model/effort or honest unknown/inherited value`
	if (!is_object(record.outputs)) return 'execution record outputs must be an object'
	if (record.state === 'completed' && Object.keys(record.outputs).length === 0) return 'completed execution requires observed output evidence'
	if (record.state === 'completed' && Object.values(record.outputs).every(value => value === null || value === undefined || (typeof value === 'string' && value.trim() === ''))) return 'completed execution output evidence is missing or malformed'
	if (!Array.isArray(record.changed_paths) || record.changed_paths.some(pathname => !text_value(pathname))) return 'execution record changed_paths must be an array of paths'
	if (!Array.isArray(record.limitations) || record.limitations.some(value => !text_value(value))) return 'execution record limitations must be an array of text'
	if (!is_object(record.acceptance)) return 'execution record acceptance must be an object'
	if (record.state !== 'completed' && record.acceptance.accepted === true) return 'noncompleted execution cannot claim acceptance'
	if (record.state === 'completed' && (record.acceptance.checks_run !== true || record.acceptance.coordinator_inspected !== true || record.acceptance.accepted !== true)) return 'completed execution requires observed checks, coordinator inspection, and acceptance'
	if (Object.hasOwn(record, 'fallback_reason') && !text_value(record.fallback_reason)) return 'execution record fallback_reason must be non-empty when present'
	if (!is_object(record.transport)) return 'execution record transport must be an object'
	if (record.kind === 'external' && !text_value(record.transport.runner_id) && !is_object(record.transport.process) && !is_object(record.transport.clone)) return 'external execution transport must include runner/process/clone evidence'
	const process_evidence = is_object(record.transport.process) && (Number.isInteger(record.transport.process.pid) || Number.isInteger(record.transport.process.exit_code) || text_value(record.transport.process.status))
	const clone_evidence = is_object(record.transport.clone) && (text_value(record.transport.clone.id) || text_value(record.transport.clone.path) || text_value(record.transport.clone.worktree) || text_value(record.transport.clone.status))
	if (record.kind === 'external' && (record.transport.runner_id !== 'external-runner-v1' || (!process_evidence && !clone_evidence))) return 'external execution transport requires runner-v1 plus real process or clone evidence'
	if (record.kind === 'external' && record.transport.recipe_checked === false) return 'external execution transport requires a checked invocation recipe'
	if (record.kind === 'internal' && (record.state === 'completed' || record.transport.worker_started === true) && !text_value(record.transport.thread_handle || record.transport.thread_id || record.transport.handle)) return 'started or completed internal execution requires an actual native handle'
	if (record.kind === 'internal' && (record.state === 'completed' || record.transport.worker_started === true) && !text_value(record.transport.tool || record.transport.native_tool)) return 'started or completed internal execution requires a native tool identity'
	if (record.kind === 'internal' && (Object.hasOwn(record.transport, 'command') || Object.hasOwn(record.transport, 'executable'))) return 'internal execution transport must not contain a fabricated command'
	if (record.kind === 'host' && !text_value(record.transport.session_id || record.transport.host_session || record.transport.host_id || record.transport.session)) return 'host execution transport must include host session identity'
	if (record.kind === 'host' && (Object.hasOwn(record.transport, 'command') || Object.hasOwn(record.transport, 'executable') || Object.hasOwn(record.transport, 'process'))) return 'host execution transport must not contain external process fields'
	if (record.state === 'cancelled' && record.transport.worker_started === true && record.transport.stop_verified !== true) return 'cancelled execution requires verified worker cessation'
	if (record.state === 'uncertain' && context.allow_uncertain !== true) return 'uncertain execution requires explicit unresolved handling'
	const context_controls = is_object(context.controls) ? context.controls : context
	const hard_model = record.requested.exact_model || record.requested.owner_exact_model || (is_object(record.requested.model) && record.requested.model.hard ? record.requested.model.value : undefined) || context_controls.exact_model || context_controls.owner_exact_model
	const hard_effort = record.requested.exact_effort || record.requested.owner_exact_effort || (is_object(record.requested.effort) && record.requested.effort.hard ? record.requested.effort.value : undefined) || context_controls.exact_effort || context_controls.owner_exact_effort
	if (hard_model && record.actual.model !== hard_model) return `execution record actual model does not satisfy exact model ${hard_model}`
	if (hard_effort && record.actual.effort !== hard_effort) return `execution record actual effort does not satisfy exact effort ${hard_effort}`
	if ((hard_read_only(context_controls) || hard_read_only(record.requested)) && record.transport.read_only !== true && record.actual.read_only !== true) return 'execution record does not prove required read-only control'
	if ((hard_fresh_context(context_controls) || hard_fresh_context(record.requested)) && record.transport.fresh_context !== true && record.actual.fresh_context !== true) return 'execution record does not prove required fresh context'
	return null
}

const normalize_execution_record = record => {
	if (is_object(record) && record.executor_class === 'generic_external') {
		const error = validate_generic_external_record(record)
		if (error) return { valid: false, error }
		return { valid: true, legacy: true, kind: 'external', record: clone(record) }
	}
	const error = validate_execution_record(record)
	return error ? { valid: false, error } : { valid: true, legacy: false, record: clone(record) }
}
const normalise_execution_record = normalize_execution_record
const read_execution_record = normalize_execution_record

module.exports = {
	generic_external_record_fields,
	validate_generic_external_record,
	parse_threeways_trigger,
	plan_threeways_debate,
	launch_threeways_debate,
	execute_threeways_debate,
	bind_threeways_native_task,
	complete_threeways_native,
	prepare_t3_internal_candidate,
	select_executor_action,
	next_executor_action,
	validate_execution_record,
	normalize_execution_record,
	normalise_execution_record,
	read_execution_record,
	main,
}

if (require.main === module) {
	main(process.argv.slice(2)).catch(error => {
		process.stderr.write(`${error.message}\n`)
		process.exitCode = 1
	})
}
