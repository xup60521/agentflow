'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const integration = require('./opencode-integration.js')

test('OpenCode project install is idempotent and uninstall removes only owned files', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agf-opencode-'))
  const skill = path.join(root, 'canonical-skill')
  fs.mkdirSync(path.join(skill, 'scripts'), { recursive: true })
  fs.writeFileSync(path.join(skill, 'SKILL.md'), '---\nname: agentflow\ndescription: test\n---\n')
  try {
    const first = integration.install({ repo: root, skill_dir: skill, model: 'custom/model-x', effort: 'thinking-plus' })
    const second = integration.install({ repo: root, skill_dir: skill, model: 'custom/model-x', effort: 'thinking-plus' })
    assert.equal(first.plugin, second.plugin)
    assert.equal(fs.realpathSync(first.skill), fs.realpathSync(skill))
    assert.match(fs.readFileSync(first.plugin, 'utf8'), /chat\.message[\s\S]+session\.idle/)
    assert.match(fs.readFileSync(first.plugin, 'utf8'), /spawnSync\("node"[\s\S]+shell: false/)
    const config = JSON.parse(fs.readFileSync(first.config, 'utf8'))
    assert.deepEqual(config['external-workers'][0].tiers.basic, { model: 'custom/model-x', effort: 'thinking-plus' })
    integration.uninstall({ repo: root, skill_dir: skill })
    assert.equal(fs.existsSync(first.plugin), false)
    assert.equal(fs.existsSync(first.skill), false)
    assert.equal(fs.existsSync(first.config), true)
  } finally { fs.rmSync(root, { recursive: true, force: true }) }
})

test('OpenCode install refuses foreign plugin content', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agf-opencode-'))
  const skill = path.join(root, 'skill')
  fs.mkdirSync(path.join(root, '.opencode', 'plugins'), { recursive: true })
  fs.mkdirSync(skill)
  fs.writeFileSync(path.join(root, '.opencode', 'plugins', 'agentflow.js'), '// foreign\n')
  assert.throws(() => integration.install({ repo: root, skill_dir: skill, model: 'custom/model', effort: 'default' }), /not Agentflow-owned/)
  assert.equal(fs.readFileSync(path.join(root, '.opencode', 'plugins', 'agentflow.js'), 'utf8'), '// foreign\n')
  fs.rmSync(root, { recursive: true, force: true })
})

test('agf setup exposes explicit OpenCode project setup and removal', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agf-opencode-cli-'))
  const cli = path.join(__dirname, 'agf.js')
  try {
    const install = spawnSync(process.execPath, [cli, 'setup', '--host', 'opencode', '--model', 'custom/model-x', '--effort', 'deep'], { cwd: root, encoding: 'utf8' })
    assert.equal(install.status, 0, install.stderr)
    assert.match(install.stderr, /restart OpenCode/)
    assert.equal(JSON.parse(fs.readFileSync(path.join(root, 'ag.json'), 'utf8'))['schema-version'], 8)
    const remove = spawnSync(process.execPath, [cli, 'setup', '--host', 'opencode', '--off'], { cwd: root, encoding: 'utf8' })
    assert.equal(remove.status, 0, remove.stderr)
    assert.equal(fs.existsSync(path.join(root, '.opencode', 'plugins', 'agentflow.js')), false)
  } finally { fs.rmSync(root, { recursive: true, force: true }) }
})
