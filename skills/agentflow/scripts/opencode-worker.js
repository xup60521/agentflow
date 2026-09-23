'use strict'

const child_process = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

const candidates = directory => [
  path.join(directory, 'node_modules', 'opencode-ai', 'bin', process.platform === 'win32' ? 'opencode.exe' : 'opencode'),
  path.join(directory, '..', 'lib', 'node_modules', 'opencode-ai', 'bin', 'opencode'),
]

const find_opencode_entrypoint = (path_value = process.env.PATH) => {
  for (const directory of String(path_value || '').split(path.delimiter).filter(Boolean)) {
    for (const candidate of candidates(directory.replace(/^"|"$/g, ''))) {
      try { if (fs.statSync(candidate).isFile()) return path.resolve(candidate) } catch {}
    }
  }
  return null
}

const main = () => {
  const executable = find_opencode_entrypoint()
  if (executable === null) { process.stderr.write('agentflow: could not find the OpenCode CLI package on PATH\n'); process.exit(1) }
  const result = child_process.spawnSync(executable, process.argv.slice(2), { stdio: 'inherit', windowsHide: true })
  if (result.error) { process.stderr.write(`agentflow: OpenCode worker failed to start: ${result.error.message}\n`); process.exit(1) }
  process.exit(result.status === null ? 1 : result.status)
}

if (require.main === module) main()
module.exports = { find_opencode_entrypoint }
