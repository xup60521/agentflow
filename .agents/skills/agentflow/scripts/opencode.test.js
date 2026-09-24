'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const settings = require('./ag-settings.js')
const { configured_worker_args } = require('./looper.js')

test('OpenCode model selections keep provider/model separate from variant', () => {
  const selection = { model: 'custom-provider/model-x', effort: 'thinking_plus' }
  assert.deepEqual(settings.parse_model_value(selection), { ...selection, value: selection })
  assert.equal(settings.parse_model_value({ model: 'provider/model;echo', effort: 'high' }), null)
  assert.equal(settings.parse_model_value({ model: 'provider/model', effort: 'high value' }), null)
})

test('OpenCode profiles are inferred only from structured provider/model selections', () => {
  const tiers = Object.fromEntries(settings.tier_names.map(tier => [tier, { model: 'provider/model', effort: tier === 'cheap' ? 'default' : 'high' }]))
  assert.equal(settings.profile_family({ command: ['opencode', 'run'], priority: 1, tiers }), 'opencode')
})

test('OpenCode worker arguments preserve provider/model and optional variant literally', () => {
  assert.deepEqual(configured_worker_args({ worker_family: 'opencode', worker_model: 'provider/model', worker_effort: 'high' }, ['run']), ['run', '--model', 'provider/model', '--variant', 'high', '--format', 'json'])
  assert.deepEqual(configured_worker_args({ worker_family: 'opencode', worker_model: 'provider/model', worker_effort: 'default' }, ['run']), ['run', '--model', 'provider/model', '--format', 'json'])
})
