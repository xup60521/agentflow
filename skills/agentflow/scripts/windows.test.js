'use strict'

// Native PowerShell is not covered by the zsh/bash/fish shortcuts.

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

const setup = require('./setup.js')
const settings = require('./ag-settings.js')
const launch = require('./executable-launch.js')
const runner = require('./external-runner.js')
const { send_tree_signal } = require('./process-tree.js')

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'agentflow-windows-'))
const drop = directory => fs.rmSync(directory, { recursive: true, force: true })

test('PowerShell shortcuts preserve arguments and support managed replacement', () => {
  assert.equal(setup.detect_shell('C:\\Program Files\\PowerShell\\7\\pwsh.exe'), 'powershell')
  const shortcuts = { agf: "C:\\Users\\O'Brien\\.agents\\skills\\agentflow\\scripts\\agf.js", looper: 'C:\\Users\\test\\.agents\\skills\\agentflow\\scripts\\looper.js' }
  const content = setup.fixed_content({ shell: 'powershell', content: '', needs_fn: true, needs_looper: true, needs_open: true, shortcut_paths: shortcuts })
  assert.match(content, /O''Brien/)
  assert.match(content, /@args/)
  assert.match(content, /Set-Location -LiteralPath/)
  assert.equal(setup.uninstall_content('powershell', content), '')
})
test('PowerShell executes shortcuts with literal paths and forwards arguments', { skip: process.platform !== 'win32' }, () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "agf O'Brien "))
  try {
    const script = path.join(root, 'agf.js')
    fs.writeFileSync(script, 'process.stdout.write(process.argv[2])')
    const content = setup.lines_to_append('powershell', true, false, root, false)
    fs.mkdirSync(path.join(root, 'scripts'))
    fs.copyFileSync(script, path.join(root, 'scripts', 'agf.js'))
    const profile = path.join(root, 'journey.ps1')
    fs.writeFileSync(profile, `${content}\nagf '${root.replaceAll("'", "''")}'\n(Get-Location).Path\n`)
    const output = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', profile], { encoding: 'utf8' })
    assert.equal(output.trim(), root)
  } finally { drop(root) }
})

// npm leaves an extensionless POSIX shim next to its .cmd wrapper. Windows
// spawns with shell:false, so counting that shim as available selects a worker
// that cannot start; only a real .exe or .com proves launchability.
test('Windows executable discovery requires a native executable extension', { skip: process.platform !== 'win32' }, () => {
  const root = tmp()
  try {
    fs.writeFileSync(path.join(root, 'claude'), '#!/bin/sh\nexec node "$@"\n')
    fs.writeFileSync(path.join(root, 'codex.cmd'), '@echo off\n')
    assert.equal(settings.executable_available('claude', { path_value: root }), false)
    assert.equal(settings.executable_available('codex', { path_value: root }), false)
    fs.writeFileSync(path.join(root, 'claude.exe'), '')
    assert.equal(settings.executable_available('claude', { path_value: root }), true)
    const native = path.join(root, 'node_modules', 'opencode-ai', 'bin')
    fs.mkdirSync(native, { recursive: true })
    fs.writeFileSync(path.join(native, 'opencode.exe'), '')
    fs.writeFileSync(path.join(root, 'opencode.cmd'), '@ECHO off\r\n"%dp0%\\node_modules\\opencode-ai\\bin\\opencode.exe" %*\r\n')
    assert.equal(settings.resolve_executable('opencode', { path_value: root }), path.join(native, 'opencode.exe'))
  } finally { drop(root) }
})

// npm's Codex wrapper names node.exe first and the real entry point second.
// Launching the first .exe it mentions would run `node.exe exec ...`, so a
// script-backed wrapper must launch node with that script ahead of the args.
const write_node_shim = (root, name, script) => {
  fs.copyFileSync(process.execPath, path.join(root, 'node.exe'))
  const entry = path.join(root, 'node_modules', name, 'bin', `${name}.js`)
  fs.mkdirSync(path.dirname(entry), { recursive: true })
  fs.writeFileSync(entry, script)
  fs.writeFileSync(path.join(root, `${name}.cmd`), `@ECHO off\r\nIF EXIST "%dp0%\\node.exe" (\r\n  SET "_prog=%dp0%\\node.exe"\r\n) ELSE (\r\n  SET "_prog=node"\r\n)\r\n"%_prog%"  "%dp0%\\node_modules\\${name}\\bin\\${name}.js" %*\r\n`)
  return entry
}

test('Windows launch runs a node-script wrapper through node with its entry point first', { skip: process.platform !== 'win32' }, () => {
  const root = tmp()
  try {
    const entry = write_node_shim(root, 'codex', '')
    assert.deepEqual(launch.resolve_launch('codex', { path_value: root }), { file: path.join(root, 'node.exe'), prefix: [entry] })
    assert.deepEqual(launch.launch_command('codex', ['exec', '-'], { path_value: root }), { file: path.join(root, 'node.exe'), args: [entry, 'exec', '-'] })
    assert.equal(settings.executable_available('codex', { path_value: root }), true)
    assert.deepEqual(launch.launch_command('C:\\tools\\codex.exe', ['exec'], { path_value: root }), { file: 'C:\\tools\\codex.exe', args: ['exec'] })
  } finally { drop(root) }
})

test('worker selection keeps the profile command name that recipe checks depend on', () => {
  const config = settings.make_template('codex')
  const selection = settings.resolve_worker_tier(config, { role: 'acceptance' }, { active_host: 'codex', executables: ['codex', 'claude'] })
  assert.equal(selection.executable, 'codex')
})

test('the external runner launches a node-script wrapper on Windows', { skip: process.platform !== 'win32', timeout: 30000 }, async () => {
  const root = tmp()
  const source = tmp()
  const clones = tmp()
  const saved = process.env.PATH
  try {
    write_node_shim(root, 'fakecli', "process.stdout.write('ARGS:' + JSON.stringify(process.argv.slice(2)))")
    for (const args of [['init', '-q'], ['config', 'user.email', 'runner@example.test'], ['config', 'user.name', 'Runner'], ['commit', '-q', '--allow-empty', '-m', 'initial']]) execFileSync('git', ['-C', source, ...args])
    process.env.PATH = `${root}${path.delimiter}${saved}`
    const result = await runner.run_external_command({ source_directory: source, clone_directory: path.join(clones, 'clone'), command: ['fakecli', 'exec', 'ok'], timeout_ms: 20000 })
    assert.equal(result.process.error, null)
    assert.equal(result.status, 'completed')
    assert.equal(result.command.executable, 'fakecli')
    assert.match(result.stdout, /ARGS:\["exec","ok"\]/u)
  } finally { process.env.PATH = saved; drop(root); drop(source); drop(clones) }
})

test('Windows cancellation terminates descendants', { skip: process.platform !== 'win32', timeout: 15000 }, async () => {
  const { spawn } = require('node:child_process')
  const { once } = require('node:events')
  const code = `const {spawn}=require('node:child_process'); const child=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore',windowsHide:true}); console.log(child.pid); setInterval(()=>{},1000)`
  const child = spawn(process.execPath, ['-e', code], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true })
  let descendant
  try {
    const [data] = await once(child.stdout, 'data')
    descendant = Number(String(data).trim())
    const closed = once(child, 'close')
    send_tree_signal(child, 'SIGTERM')
    await closed
    assert.throws(() => process.kill(descendant, 0), { code: 'ESRCH' })
  } finally {
    try { send_tree_signal(child, 'SIGKILL') } catch {}
    if (descendant) { try { process.kill(descendant) } catch {} }
  }
})

test('PowerShell shortcut preserves Unicode piped to native stdin', { skip: process.platform !== 'win32' }, () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agf-unicode-'))
  try {
    const scripts = path.join(root, 'scripts')
    fs.mkdirSync(scripts)
    const output = path.join(root, 'captured.txt')
    fs.writeFileSync(path.join(scripts, 'agf.js'), `const fs=require('node:fs');const b=[];process.stdin.on('data',x=>b.push(x));process.stdin.on('end',()=>{fs.writeFileSync(process.argv[2],Buffer.concat(b));process.stdout.write(process.cwd())})`)
    const profile = path.join(root, 'journey.ps1')
    // Windows PowerShell 5.1 requires a BOM to read a .ps1 file as UTF-8.
    fs.writeFileSync(profile, `\uFEFF${setup.lines_to_append('powershell', true, false, root, false)}\n'繁體中文🙂 café — 測試' | agf '${output.replaceAll("'", "''")}'\n`)
    execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', profile], { encoding: 'utf8' })
    assert.equal(fs.readFileSync(output, 'utf8').trim(), '繁體中文🙂 café — 測試')
  } finally { drop(root) }
})
