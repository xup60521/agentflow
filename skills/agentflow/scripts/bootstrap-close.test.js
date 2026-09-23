'use strict'

const assert = require('node:assert/strict')
const { execFileSync, spawnSync } = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')

const AGF = path.join(__dirname, 'agf.js')

const environment = () => {
  const env = { ...process.env }
  for (const key of Object.keys(env)) if (/^(?:CLAUDE|CODEX)/u.test(key)) delete env[key]
  return env
}

// First use of Agentflow in a repository that already has history.
const first_close = (t, prepare) => {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'agf-bootstrap-close-'))
  t.after(() => fs.rmSync(repo, { recursive: true, force: true }))
  const git = (...args) => execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8' })
  git('init', '-q', '-b', 'main')
  git('config', 'user.email', 'bootstrap@example.invalid')
  git('config', 'user.name', 'Bootstrap')
  git('config', 'core.autocrlf', 'false')
  fs.writeFileSync(path.join(repo, 'README.md'), '# existing project\n')
  prepare(repo, git)
  git('add', '-A')
  git('commit', '-q', '-m', 'existing history')
  const env = environment()
  const agf = (args, input) => spawnSync(process.execPath, [AGF, ...args, '--host', 'codex', '--session', 'bootstrap-1'], { cwd: repo, env, input, encoding: 'utf8' })
  const start = agf(['start', '--repo', repo, '--message-stdin', '--json'], 'Create hello.txt containing hi\n')
  assert.equal(start.status, 0, start.stderr)
  fs.writeFileSync(path.join(repo, 'hello.txt'), 'hi\n')
  const manifest = {
    version: 1,
    notebook: '.agentflow/devlog.md',
    ask: 'A-001',
    run_events: ['- Saved hello.txt and read it back.'],
    reply: '## [SUMMARY]\n\n- Created hello.txt.\n\n## [FINAL REPORT]\n\n1. Create hello.txt\n\n   - Succeeded: saved and read back.\n\n```completion-metadata\nInformational document: hello.txt — one-line greeting\n```\n',
    status: { project: 'bootstrap', notebook: '.agentflow/devlog.md', notebook_kind: 'root', current_commit: 'recorded in Git history', tests_scenarios: 'read back', config_path: 'ag.json', host: 'codex', validation: 'validated', proven: 'hello.txt saved', open: 'none', next: 'await the owner', artifacts: 'hello.txt', archived_eras: 'none', streams: [] },
    allowed_paths: ['.agentflow/devlog.md', '.gitignore', 'ag.json', 'hello.txt'],
    commit_message: 'add hello.txt',
    delivery: { mode: 'local' },
  }
  return JSON.parse(agf(['close', '--manifest-stdin'], JSON.stringify(manifest)).stdout)
}

test('first closeout in a repository with history treats setup-created files as bootstrap files', t => {
  const result = first_close(t, () => {})
  assert.equal(result.ok, true, JSON.stringify(result.error))
  assert.equal(result.commit.state, 'created')
})

test('first closeout still reviews a previously tracked .gitignore that setup changed', t => {
  const result = first_close(t, repo => fs.writeFileSync(path.join(repo, '.gitignore'), 'node_modules/\n'))
  assert.equal(result.ok, false)
  assert.match(result.error.message, /cross_check/u)
})
