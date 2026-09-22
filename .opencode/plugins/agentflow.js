import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

const userMessages = new Set()
const captured = new Set()

const runHook = ({ directory, sessionID, turnID, event, prompt }) => {
  const script = join(directory, 'skills', 'agentflow', 'scripts', 'stop-hook.js')
  if (!existsSync(script)) return
  const payload = JSON.stringify({ cwd: directory, session_id: sessionID, turn_id: turnID, hook_event_name: event, ...(prompt === undefined ? {} : { prompt }) })
  const result = spawnSync(process.execPath, [script, '--host', 'opencode'], {
    cwd: directory,
    input: payload,
    encoding: 'utf8',
    windowsHide: true,
  })
  if (result.error) throw result.error
  if (result.stderr) process.stderr.write(result.stderr)
  if (result.status === 2) process.stderr.write('Agentflow closeout is incomplete; keep this OpenCode session active and repair the reported checks.\n')
}

export const AgentflowPlugin = async ({ directory }) => ({
  event: async ({ event }) => {
    if (event.type === 'message.updated' && event.properties?.info?.role === 'user') {
      userMessages.add(event.properties.info.id)
      return
    }
    if (event.type === 'message.part.updated') {
      const part = event.properties?.part
      if (!part || part.type !== 'text' || !userMessages.has(part.messageID) || typeof part.text !== 'string' || !part.text.trim()) return
      const key = createHash('sha256').update(`${part.sessionID}\0${part.messageID}\0${part.text}`).digest('hex')
      if (captured.has(key)) return
      captured.add(key)
      runHook({ directory, sessionID: part.sessionID, turnID: part.messageID, event: 'UserPromptSubmit', prompt: part.text })
      return
    }
    if (event.type === 'session.idle') {
      runHook({ directory, sessionID: event.properties?.sessionID, turnID: `idle:${event.properties?.sessionID || ''}`, event: 'Stop' })
    }
  },
})
