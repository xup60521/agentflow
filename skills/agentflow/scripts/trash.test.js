'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')
const { move_to_trash } = require('./completion-cleanup')

test('Linux without a trash command moves records into the freedesktop home trash', { skip: process.platform !== 'linux' }, t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agf-trash-'))
  const saved = { PATH: process.env.PATH, XDG_DATA_HOME: process.env.XDG_DATA_HOME }
  t.after(() => {
    for (const [key, value] of Object.entries(saved)) value === undefined ? delete process.env[key] : process.env[key] = value
    fs.rmSync(root, { recursive: true, force: true })
  })
  process.env.PATH = path.join(root, 'empty-bin')
  process.env.XDG_DATA_HOME = path.join(root, 'data')
  const first = path.join(root, 'a dir', 'completion #1.json')
  fs.mkdirSync(path.dirname(first))
  for (const content of ['one', 'two']) {
    fs.writeFileSync(first, content)
    move_to_trash(first)
    assert.equal(fs.existsSync(first), false)
  }
  const trash = path.join(root, 'data', 'Trash')
  assert.deepEqual(fs.readdirSync(path.join(trash, 'files')).sort(), ['completion #1.json', 'completion #1.json.1'])
  assert.equal(fs.readFileSync(path.join(trash, 'files', 'completion #1.json.1'), 'utf8'), 'two')
  const info = fs.readFileSync(path.join(trash, 'info', 'completion #1.json.trashinfo'), 'utf8')
  assert.match(info, /^\[Trash Info\]\nPath=\/.*\/a%20dir\/completion%20%231\.json\nDeletionDate=\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\n$/u)
})
