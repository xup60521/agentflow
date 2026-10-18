'use strict'
const fs = require('node:fs'), assert = require('node:assert/strict'), cp = require('node:child_process')
const base = '.agentflow/artifacts/A-010-t3-orchestrator'
const round = process.argv[2] || '1'
assert.match(round, /^[123]$/)
assert.equal(process.stdin.isTTY, true)
assert.equal(process.stdout.isTTY, true)
const terminal = cp.execFileSync('tty', {stdio: ['inherit', 'pipe', 'inherit'], encoding: 'utf8'}).trim()
console.log('Terminal: ' + terminal)
const args = ['skills/agentflow/scripts/delegation-route.js', 'threeways', base + '/native-review-facts-r' + round + '.json']
console.log('Input: node ' + args.join(' '))
const child = cp.spawnSync(process.execPath, args, {encoding: 'utf8'})
assert.equal(child.status, 0, child.stderr)
const result = JSON.parse(child.stdout)
assert.equal(result.consensus, 'PENDING')
assert.equal(result.native_handoff.provider_instance_id, 'codex')
assert.equal(Object.hasOwn(result.native_handoff, 'command'), false)
for (const kind of ['report', 'resolution']) assert.equal(fs.existsSync(result.artifacts[kind]), false)
assert.equal(fs.readFileSync(result.artifacts.brief, 'utf8'), result.native_handoff.task_prompt)
fs.writeFileSync(base + '/native-handoff-r' + round + '.json', JSON.stringify(result, null, 2) + '\n')
const proof = {terminal, input: ['node', ...args], exit_status: child.status, consensus: result.consensus, provider: result.native_handoff.provider_instance_id, model: result.native_handoff.model, client_request_id: result.native_handoff.client_request_id, brief_only: true}
fs.writeFileSync(base + '/native-pty-proof-r' + round + '.json', JSON.stringify(proof, null, 2) + '\n')
console.log('Output: ' + JSON.stringify(proof))
