'use strict'

const fs = require('node:fs')
const path = require('node:path')
const ag_settings = require('./ag-settings.js')

const OWNER = 'agentflow-opencode-v1'
const plugin_source = skill_dir => `// ${OWNER}\nimport { spawnSync } from "node:child_process"\nimport path from "node:path"\n\nconst skill = ${JSON.stringify(path.resolve(skill_dir))}\nconst run = (script, args, cwd, input) => spawnSync("node", [path.join(skill, "scripts", script), ...args], { cwd, input, encoding: "utf8", windowsHide: true, shell: false })\nconst textOf = parts => (parts || []).filter(part => part && part.type === "text" && typeof part.text === "string").map(part => part.text).join("\\n").trim()\n\nexport const Agentflow = async ({ directory }) => ({\n  "chat.message": async (_input, output) => {\n    const text = textOf(output.parts)\n    if (!text) return\n    const result = run("agf.js", ["start", "--repo", directory, "--host", "opencode", "--message-stdin", "--json"], directory, text + "\\n")\n    if (result.status !== 0) throw new Error("Agentflow prompt capture failed: " + (result.stderr || result.stdout).slice(0, 4096))\n  },\n  event: async ({ event }) => {\n    if (event.type !== "session.idle") return\n    const result = run("stop-hook.js", ["--host", "opencode"], directory, JSON.stringify({ cwd: directory, hook_event_name: "Stop", session_id: event.properties?.sessionID || null }))\n    if (result.status !== 0 && result.status !== 2) throw new Error("Agentflow idle check failed: " + (result.stderr || result.stdout).slice(0, 4096))\n  },\n})\n`

const owned_plugin = text => typeof text === 'string' && text.startsWith(`// ${OWNER}\n`)

const install = ({ repo, skill_dir, model, effort = 'default' }) => {
  const root = path.resolve(repo)
  const skill = path.resolve(skill_dir)
  const config_path = path.join(root, 'ag.json')
  if (fs.existsSync(config_path)) {
    const current = ag_settings.read_json_config(config_path, { repo_root: root, active_host: 'opencode', check_executables: false })
    const profile = current['external-workers'].find(item => item.id === 'opencode-default')
    if (!profile) throw new Error('existing ag.json has no opencode-default profile; no files changed')
  } else {
    ag_settings.initialize_project({ repo_root: root, active_host: 'opencode', model, effort, check_executables: false })
  }

  const link = path.join(root, '.opencode', 'skills', 'agentflow')
  fs.mkdirSync(path.dirname(link), { recursive: true })
  if (!fs.existsSync(link)) fs.symlinkSync(skill, link, process.platform === 'win32' ? 'junction' : 'dir')
  else if (fs.realpathSync(link) !== fs.realpathSync(skill)) throw new Error(`${link} already exists and is not the active Agentflow skill; left unchanged`)

  const plugin = path.join(root, '.opencode', 'plugins', 'agentflow.js')
  fs.mkdirSync(path.dirname(plugin), { recursive: true })
  if (fs.existsSync(plugin) && !owned_plugin(fs.readFileSync(plugin, 'utf8'))) throw new Error(`${plugin} is not Agentflow-owned; left unchanged`)
  ag_settings.write_text_atomic(plugin, plugin_source(skill))
  return { config: config_path, skill: link, plugin, restart_required: true }
}

const uninstall = ({ repo, skill_dir }) => {
  const root = path.resolve(repo)
  const plugin = path.join(root, '.opencode', 'plugins', 'agentflow.js')
  if (fs.existsSync(plugin)) {
    if (!owned_plugin(fs.readFileSync(plugin, 'utf8'))) throw new Error(`${plugin} is not Agentflow-owned; left unchanged`)
    fs.unlinkSync(plugin)
  }
  const link = path.join(root, '.opencode', 'skills', 'agentflow')
  if (fs.existsSync(link)) {
    const stat = fs.lstatSync(link)
    if (!stat.isSymbolicLink() || fs.realpathSync(link) !== fs.realpathSync(skill_dir)) throw new Error(`${link} is not the Agentflow-owned skill link; left unchanged`)
    fs.unlinkSync(link)
  }
  return { plugin, skill: link }
}

module.exports = { OWNER, plugin_source, owned_plugin, install, uninstall }
