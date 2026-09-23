'use strict'

const node_fs = require('node:fs')
const node_path = require('node:path')

const is_file = candidate => {
  try { return node_fs.statSync(candidate).isFile() } catch { return false }
}

const search_path = options => {
  if (options.path_value !== undefined) return options.path_value
  if (options.env && typeof options.env === 'object') {
    const key = Object.keys(options.env).find(name => name.toUpperCase() === 'PATH')
    if (key !== undefined) return options.env[key]
  }
  return process.env.PATH
}

const path_directories = path_value => path_value
  .split(node_path.delimiter)
  .map(directory => process.platform === 'win32' ? directory.replace(/^"|"$/g, '') : directory)
  .filter(Boolean)

const find_on_path = (names, path_value) => {
  for (const directory of path_directories(path_value)) {
    for (const name of names) {
      const candidate = node_path.join(directory, name)
      if (is_file(candidate)) return candidate
    }
  }
  return null
}

// npm cmd-shim wrappers either run a native binary or run node on a JS entry
// point; spawning with shell:false needs the real program and its prefix.
const wrapper_launch = (directory, text, path_value) => {
  const references = [...text.matchAll(/%(?:~dp0|dp0%)[\\/]([^"'\r\n%]+)/giu)].map(match => node_path.resolve(directory, match[1].trim()))
  const script = references.find(reference => /\.[cm]?js$/iu.test(reference) && is_file(reference))
  if (script !== undefined) {
    const local_node = node_path.join(directory, 'node.exe')
    const node = is_file(local_node) ? local_node : find_on_path(['node.exe'], path_value)
    return node === null ? null : { file: node, prefix: [script] }
  }
  const native = references.find(reference => /\.exe$/iu.test(reference) && node_path.basename(reference).toLowerCase() !== 'node.exe' && is_file(reference))
  return native === undefined ? null : { file: native, prefix: [] }
}

const resolve_launch = (command, options = {}) => {
  if (typeof command !== 'string' || command.length === 0) return null
  const path_value = search_path(options)
  if (typeof path_value !== 'string') return null
  for (const directory of path_directories(path_value)) {
    if (process.platform !== 'win32') {
      const candidate = node_path.join(directory, command)
      try { if (node_fs.statSync(candidate).isFile() && (node_fs.statSync(candidate).mode & 0o111) !== 0) return { file: candidate, prefix: [] } } catch {}
      continue
    }
    for (const name of [`${command}.exe`, `${command}.com`]) {
      const candidate = node_path.join(directory, name)
      if (is_file(candidate)) return { file: candidate, prefix: [] }
    }
    let text
    try { text = node_fs.readFileSync(node_path.join(directory, `${command}.cmd`), 'utf8') } catch { continue }
    // cmd.exe would run this wrapper and never reach a later PATH entry.
    return wrapper_launch(directory, text, path_value)
  }
  return null
}

const is_bare_name = executable => typeof executable === 'string' && executable.length > 0 && !/[\\/]/u.test(executable) && !node_path.isAbsolute(executable)

const launch_command = (executable, args, options = {}) => {
  if (process.platform !== 'win32' || !is_bare_name(executable)) return { file: executable, args }
  const launch = resolve_launch(executable, options)
  return launch === null ? { file: executable, args } : { file: launch.file, args: [...launch.prefix, ...args] }
}

module.exports = {
  resolve_launch,
  launch_command,
}
