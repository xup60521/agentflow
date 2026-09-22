import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const pluginPath = path.resolve(here, '..', '..', '..', '.opencode', 'plugins', 'agentflow.js')
test('OpenCode plugin coalesces progressive Unicode text regardless of event order', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agentflow-opencode-plugin-'))
  try {
    const modulePath = path.join(root, 'agentflow-plugin.mjs')
    fs.writeFileSync(modulePath, fs.readFileSync(pluginPath, 'utf8'))
    const { AgentflowPlugin } = await import(pathToFileURL(modulePath))
    const scripts = path.join(root, 'skills', 'agentflow', 'scripts')
    fs.mkdirSync(scripts, { recursive: true })
    const log = path.join(root, 'events.jsonl')
    fs.writeFileSync(path.join(scripts, 'stop-hook.js'), `const fs=require('node:fs');const b=[];process.stdin.on('data',x=>b.push(x));process.stdin.on('end',()=>fs.appendFileSync(${JSON.stringify(log)},Buffer.concat(b).toString('utf8')+'\\n'))`)
    const plugin = await AgentflowPlugin({ directory: root })
    const part = text => plugin.event({ event: { type: 'message.part.updated', properties: { part: { type: 'text', messageID: 'm1', sessionID: 's1', text } } } })
    await part('繁體')
    await plugin.event({ event: { type: 'message.updated', properties: { info: { id: 'm1', sessionID: 's1', role: 'user' } } } })
    await part('繁體中文🙂 café — 測試')
    await new Promise(resolve => setTimeout(resolve, 100))
    await plugin.event({ event: { type: 'session.idle', properties: { sessionID: 's1' } } })
    const events = fs.readFileSync(log, 'utf8').trim().split(/\r?\n/u).map(JSON.parse)
    assert.equal(events.filter(event => event.hook_event_name === 'UserPromptSubmit').length, 1)
    assert.equal(events[0].prompt, '繁體中文🙂 café — 測試')
    assert.equal(events.at(-1).hook_event_name, 'Stop')
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})
