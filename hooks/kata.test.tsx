import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

import type { KataState } from '../types'

const ROOT = '/proj'

const BAND = {
  plugin: 'kata',
  component: 'AbovePrompt',
  props: { hasSurvey: false, isWorking: false, maxRows: 4, bodyColumns: 100, scroll: { offset: 0, bodyRows: 4 }, view: {} },
} as const

const PANE = {
  plugin: 'kata',
  component: 'Pane',
  requestId: 'kata',
  props: { title: 'Kata', isFocused: false, bodyColumns: 72, placement: 'dock', scroll: { offset: 0, bodyRows: 30 }, view: {} },
} as const

const running: KataState = {
  version: 1,
  mode: 'pr',
  modeName: 'PR implementation',
  args: 'toy change',
  status: 'running',
  startedAt: '2026-11-09T12:00:00Z',
  updatedAt: '2026-11-09T12:04:00Z',
  current: 2,
  steps: [
    { command: 'read', title: 'Read the plan', status: 'done', note: 'scope written' },
    { command: 'implement', title: 'Implement the scope', status: 'done' },
    { command: 'review', title: 'Full self-review', status: 'running' },
    { command: 'fix', title: 'Fix every issue', status: 'pending' },
  ],
  lastCommand: { command: 'implement', title: 'Implement the scope', finishedAt: '2026-11-09T12:04:00Z', status: 'done' },
  scope: 'Add a toy change to the README',
}

const TRAILER_COMMIT = 'git commit -m "feat: toy change" -m "Co-Authored-By: Someone <someone@example.com>"'
const PLAIN_COMMIT = 'git commit -m "feat: toy change"'

/** Stands for the engine beneath the plugin: a project at ROOT whose state file holds `state` (or none). */
type Seen = { toasts?: string[]; statuses?: Array<string | undefined>; opened?: string[] }

function project(on: On, state: KataState | null, seen: Seen = {}): void {
  mock.clock(on)
  on('session.root', () => ({ value: ROOT }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('command.register', () => ({ value: { command: 'kata-panel' } }))
  on('ui.open', (_, e) => {
    seen.opened?.push(e.id)
    return { value: { isPlaced: true } }
  })
  on('ui.status', (_, e) => {
    seen.statuses?.push(e.text)
    return { value: undefined }
  })
  on('ui.toast', (_, e) => {
    seen.toasts?.push(e.text)
    return { value: undefined }
  })
  on('tool.call', () => ({ result: {} }))
  if (state) {
    on('fs.stat', () => ({ value: { kind: 'file', size: 1, mtimeMs: 1000, isLink: false } }))
    on('fs.read', () => ({ value: JSON.stringify(state) }))
  }
}

async function start($: Engine): Promise<void> {
  await $.session.start({ cwd: ROOT, surface: 'terminal', isInteractive: true })
}

test('the commit guard denies a trailer during a run and allows a clean commit', async ($, on) => {
  project(on, running)
  await start($)

  const denied = await $.tool.call({ tool: 'Bash', command: TRAILER_COMMIT })
  expect(denied.deny).toBeDefined()
  expect(denied.deny).toMatch(/kata: commit messages carry no trailers/)

  const allowed = await $.tool.call({ tool: 'Bash', command: PLAIN_COMMIT })
  expect(allowed.deny).toBeUndefined()

  const other = await $.tool.call({ tool: 'Bash', command: 'echo "Co-Authored-By: nobody"' })
  expect(other.deny).toBeUndefined()
})

test('the commit guard lets a trailer through when no run is active', async ($, on) => {
  project(on, null)
  await start($)

  const result = await $.tool.call({ tool: 'Bash', command: TRAILER_COMMIT })
  expect(result.deny).toBeUndefined()
})

test('blockTrailers=always denies a trailer with no run', { options: { blockTrailers: 'always' } }, async ($, on) => {
  project(on, null)
  await start($)

  const result = await $.tool.call({ tool: 'Bash', command: TRAILER_COMMIT })
  expect(result.deny).toMatch(/kata/)
})

test('blockTrailers=never lets a trailer through during a run', { options: { blockTrailers: 'never' } }, async ($, on) => {
  project(on, running)
  await start($)

  const result = await $.tool.call({ tool: 'Bash', command: TRAILER_COMMIT })
  expect(result.deny).toBeUndefined()
})

test('a run start is announced with a toast and the status line', async ($, on) => {
  const toasts: string[] = []
  const statuses: Array<string | undefined> = []
  project(on, running, { toasts, statuses })
  await start($)

  expect(toasts).toContain('Kata run started: PR implementation')
  expect(statuses[statuses.length - 1]).toBe('⛩ kata pr · 3/4 Full self-review')
})

test('the band stays with the engine when there is no run', async ($, on) => {
  project(on, null)
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })
  await start($)

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...BAND, surface })
    expect((await ui.find({ type: 'Text', text: /engine/ }))?.text).toBe('engine')
    expect(await ui.find({ type: 'Text', text: /kata/ })).toBeUndefined()
    await ui.unmount()
  }
})

test('the band shows the headline, the trail and the last command, and hides on request', async ($, on) => {
  project(on, running)
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })
  await start($)

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...BAND, surface })
    expect((await ui.find({ type: 'Text', text: /⛩ kata pr/ }))?.text).toBe('⛩ kata pr · 3/4 Full self-review')
    expect((await ui.find({ type: 'Text', text: /✓/ }))?.text).toBe('✓ ✓ ▶ ·')
    expect((await ui.find({ type: 'Text', text: /last:/ }))?.text).toMatch(/^last: implement \d\d:\d\d$/)
    expect(await ui.find({ type: 'Button', key: 'hide' })).toBeDefined()
    await ui.unmount()
  }

  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  await ui.press({ key: 'hide' })
  expect(await ui.find({ type: 'Text', text: /kata pr/ })).toBeUndefined()
  expect((await ui.find({ type: 'Text', text: /engine/ }))?.text).toBe('engine')
  await ui.unmount()

  // The pane's "show band" button brings it back.
  const pane = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await pane.press({ key: 'unhide' })
  await pane.unmount()
  const again = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect((await again.find({ type: 'Text', text: /⛩ kata pr/ }))?.text).toBe('⛩ kata pr · 3/4 Full self-review')
  await again.unmount()
})

test('showBand=false leaves the band to the engine during a run', { options: { showBand: false } }, async ($, on) => {
  project(on, running)
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })
  await start($)

  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /kata pr/ })).toBeUndefined()
  await ui.unmount()
})

test('the pane lists every step with its status, the last command and the scope', async ($, on) => {
  project(on, running)
  await start($)

  for (const surface of ['terminal', 'desktop', 'vscode', 'mobile'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect((await ui.find({ type: 'Text', text: /PR implementation/ }))?.text).toBe('PR implementation')
    expect((await ui.find({ type: 'Text', text: /Read the plan/ }))?.text).toBe('✓  1 Read the plan — scope written')
    expect((await ui.find({ type: 'Text', text: /Implement the scope$/ }))?.text).toBe('✓  2 Implement the scope')
    expect((await ui.find({ type: 'Text', text: /Full self-review/ }))?.text).toBe('▶  3 Full self-review')
    expect((await ui.find({ type: 'Text', text: /Fix every issue/ }))?.text).toBe('·  4 Fix every issue')
    expect((await ui.find({ type: 'Text', text: /last command/ }))?.text).toMatch(/^last command: implement \(done\) at \d\d:\d\d$/)
    expect((await ui.find({ type: 'Text', text: /scope:/ }))?.text).toBe('scope: Add a toy change to the README')
    await ui.unmount()
  }
})

test('the pane says so when the project has no run', async ($, on) => {
  project(on, null)
  await start($)

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect((await ui.find({ type: 'Text', text: /No Kata run/ }))?.text).toBe('No Kata run in this project.')
  await ui.unmount()
})

test('/kata-panel opens the pane and reports the headline', async ($, on) => {
  const opened: string[] = []
  project(on, running, { opened })
  await start($)

  const result = await $.command.run({ command: 'kata-panel', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 120 } })
  expect(opened).toEqual(['kata'])
  expect(result.text).toBe('Kata pane opened: ⛩ kata pr · 3/4 Full self-review')
})

test('prompt.compose appends the kata:config section with the configured source and URL', { options: { source: 'local', artifactUrl: 'https://claude.ai/artifact/abc' } }, async ($, on) => {
  project(on, null)
  on('prompt.compose', () => ({ sections: [{ id: 'base', text: 'base', scope: 'shared' }] }))
  await start($)

  const result = await $.prompt.compose({ model: 'm', promptModel: 'm', surfaces: ['terminal'], tools: [], outputStyle: null, traits: [] })
  const section = result.sections.find(s => s.id === 'kata:config')
  expect(result.sections[0]?.id).toBe('base')
  expect(section?.scope).toBe('session')
  expect(section?.text).toContain('library source: local')
  expect(section?.text).toContain('artifact URL: https://claude.ai/artifact/abc')
  expect(section?.text).toContain('.claude/kata/state.json')
})

test('a finished run clears the status line and toasts the outcome', async ($, on) => {
  const toasts: string[] = []
  const statuses: Array<string | undefined> = []
  let state: KataState = running
  mock.clock(on)
  on('session.root', () => ({ value: ROOT }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('command.register', () => ({ value: { command: 'kata-panel' } }))
  on('ui.status', (_, e) => {
    statuses.push(e.text)
    return { value: undefined }
  })
  on('ui.toast', (_, e) => {
    toasts.push(e.text)
    return { value: undefined }
  })
  on('tool.call', () => ({ result: {} }))
  on('fs.stat', () => ({ value: { kind: 'file', size: 1, mtimeMs: state.updatedAt === running.updatedAt ? 1000 : 2000, isLink: false } }))
  on('fs.read', () => ({ value: JSON.stringify(state) }))
  await start($)

  state = { ...running, status: 'done', updatedAt: '2026-11-09T12:30:00Z', current: 4, steps: running.steps.map(s => ({ ...s, status: 'done' })) }
  // A Write of the state file by the skill refreshes the mirror.
  await $.tool.call({ tool: 'Write', file_path: `${ROOT}/.claude/kata/state.json`, content: '{}' })

  expect(toasts).toEqual(['Kata run started: PR implementation', 'Kata pr: done'])
  expect(statuses[statuses.length - 1]).toBeUndefined()
})
