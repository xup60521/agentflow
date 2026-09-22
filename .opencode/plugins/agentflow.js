import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

const userMessages = new Map()
const parts = new Map()
const timers = new Map()

const runHook = ({ directory, sessionID, turnID, event, prompt }) => {
  const script = join(directory, 'skills', 'agentflow', 'scripts', 'stop-hook.js')
  if (!existsSync(script)) return
  const payload = JSON.stringify({ cwd: directory, session_id: sessionID, turn_id: turnID, hook_event_name: event, ...(prompt === undefined ? {} : { prompt }) })
  const result = spawnSync('node', [script, '--host', 'opencode'], {
    cwd: directory,
    input: payload,
    encoding: 'utf8',
    windowsHide: true,
  })
  if (result.error) throw result.error
  if (result.stderr) process.stderr.write(result.stderr)
  if (result.status === 2) process.stderr.write('Agentflow closeout is incomplete; keep this OpenCode session active and repair the reported checks.\n')
  else if (result.status !== 0) throw new Error(`Agentflow hook exited ${result.status}`)
}

export const AgentflowPlugin = async ({ directory }) => {
  const capture = messageID => {
    const info = userMessages.get(messageID)
    const part = parts.get(messageID)
    if (!info || !part || !part.text.trim()) return
    timers.delete(messageID)
    runHook({ directory, sessionID: info.sessionID || part.sessionID, turnID: messageID, event: 'UserPromptSubmit', prompt: part.text })
    userMessages.delete(messageID)
    parts.delete(messageID)
  }
  const schedule = messageID => {
    if (!userMessages.has(messageID) || !parts.has(messageID)) return
    clearTimeout(timers.get(messageID))
    timers.set(messageID, setTimeout(() => capture(messageID), 25))
  }
  return {
  event: async ({ event }) => {
    if (event.type === 'message.updated' && event.properties?.info?.role === 'user') {
      const info = event.properties.info
      userMessages.set(info.id, { sessionID: info.sessionID })
      schedule(info.id)
      return
    }
    if (event.type === 'message.part.updated') {
      const part = event.properties?.part
      if (!part || part.type !== 'text' || typeof part.text !== 'string') return
      parts.set(part.messageID, { sessionID: part.sessionID, text: part.text })
      schedule(part.messageID)
      return
    }
    if (event.type === 'session.idle') {
      for (const [messageID, info] of userMessages) if (info.sessionID === event.properties?.sessionID) capture(messageID)
      runHook({ directory, sessionID: event.properties?.sessionID, turnID: `idle:${event.properties?.sessionID || ''}`, event: 'Stop' })
      for (const [messageID, info] of userMessages) if (info.sessionID === event.properties?.sessionID) {
        clearTimeout(timers.get(messageID))
        timers.delete(messageID)
        userMessages.delete(messageID)
        parts.delete(messageID)
      }
    }
  },
  }
}
