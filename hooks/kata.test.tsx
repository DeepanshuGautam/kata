import { expect, test } from 'claude-code/testing'

import { CACHE, PR_LIBRARY, engine, newSeen, newWorld, running, setFile, setState, start, typed } from './engine.testkit'

const BAND = {
  plugin: 'kata',
  component: 'AbovePrompt',
  props: { hasSurvey: false, isWorking: false, maxRows: 4, bodyColumns: 120, scroll: { offset: 0, bodyRows: 4 }, view: {} },
} as const

const PANE = {
  plugin: 'kata',
  component: 'Pane',
  requestId: 'kata',
  props: { title: 'Kata', isFocused: false, bodyColumns: 72, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} },
} as const

const TRAILER_COMMIT = 'git commit -m "feat: toy change" -m "Co-Authored-By: Someone <someone@example.com>"'
const PLAIN_COMMIT = 'git commit -m "feat: toy change"'

// ----- commit guard --------------------------------------------------------------------------

test('the commit guard denies a trailer during a run and allows a clean commit', async ($, on) => {
  const world = newWorld()
  setState(world, running())
  engine(on, world, newSeen())
  await start($)

  expect((await $.tool.call({ tool: 'Bash', command: TRAILER_COMMIT })).deny).toMatch(/kata: commit messages carry no trailers/)
  expect((await $.tool.call({ tool: 'Bash', command: PLAIN_COMMIT })).deny).toBeUndefined()
  expect((await $.tool.call({ tool: 'Bash', command: 'echo "Co-Authored-By: nobody"' })).deny).toBeUndefined()
})

test('the commit guard lets a trailer through when no run is active', async ($, on) => {
  engine(on, newWorld(), newSeen())
  await start($)
  expect((await $.tool.call({ tool: 'Bash', command: TRAILER_COMMIT })).deny).toBeUndefined()
})

test('blockTrailers=always denies a trailer with no run', { options: { blockTrailers: 'always' } }, async ($, on) => {
  engine(on, newWorld(), newSeen())
  await start($)
  expect((await $.tool.call({ tool: 'Bash', command: TRAILER_COMMIT })).deny).toMatch(/kata/)
})

test('blockTrailers=never lets a trailer through during a run', { options: { blockTrailers: 'never' } }, async ($, on) => {
  const world = newWorld()
  setState(world, running())
  engine(on, world, newSeen())
  await start($)
  expect((await $.tool.call({ tool: 'Bash', command: TRAILER_COMMIT })).deny).toBeUndefined()
})

// ----- band ---------------------------------------------------------------------------------

test('the band stays with the engine when there is no run', async ($, on) => {
  engine(on, newWorld(), newSeen())
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

test('the band shows mode, branch, current step, its progress, the trail and the issue counts', async ($, on) => {
  const world = newWorld()
  setState(world, running())
  engine(on, world, newSeen())
  await start($)

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...BAND, surface })
    expect(await ui.find({ type: 'Text', text: '⛩ kata' })).toBeDefined()
    expect((await ui.find({ type: 'Text', text: /⎇/ }))?.text).toBe('⎇ feat/logging')
    expect((await ui.find({ type: 'Text', text: /^4\/5$/ }))?.text).toBe('4/5')
    expect(await ui.find({ type: 'Text', text: 'Fix every issue' })).toBeDefined()
    expect((await ui.find({ type: 'Text', text: /fixed$/ }))?.text).toBe('████░░░░ 5/10 fixed')
    expect((await ui.find({ type: 'Text', text: /✓ review/ }))?.text).toBe('✓ review')
    expect((await ui.find({ type: 'Text', text: /▶ fix/ }))?.text).toBe('▶ fix')
    expect((await ui.find({ type: 'Text', text: /◆/ }))?.text).toBe('◆ 10 found · 5 fixed · 5 open')
    await ui.unmount()
  }
})

test('a one-row band leaves the trail out', async ($, on) => {
  const world = newWorld()
  setState(world, running())
  engine(on, world, newSeen())
  await start($)

  const ui = await $.ui.mount({ ...BAND, props: { ...BAND.props, maxRows: 1 }, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: 'Fix every issue' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /◆/ })).toBeUndefined()
  await ui.unmount()
})

test('a paused run says it waits for the person, and the step activity shows without progress', async ($, on) => {
  const world = newWorld()
  const base = running()
  const steps = base.steps.map((s, i) => (i === 3 ? { ...s, progress: undefined } : s))
  setState(world, { ...base, steps, status: 'paused' })
  engine(on, world, newSeen())
  await start($)

  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: '⏸ waiting for you' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'fixing #6 in src/log.ts' })).toBeDefined()
  await ui.unmount()
})

test('the band hides on request and the pane brings it back', async ($, on) => {
  const world = newWorld()
  setState(world, running())
  engine(on, world, newSeen())
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })
  await start($)

  const band = await $.ui.mount({ ...BAND, surface: 'terminal' })
  await band.press({ key: 'hide' })
  expect(await band.find({ type: 'Text', text: '⛩ kata' })).toBeUndefined()
  await band.unmount()

  const pane = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await pane.press({ key: 'unhide' })
  await pane.unmount()

  const again = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await again.find({ type: 'Text', text: '⛩ kata' })).toBeDefined()
  await again.unmount()
})

test('showBand=false leaves the band to the engine during a run', { options: { showBand: false } }, async ($, on) => {
  const world = newWorld()
  setState(world, running())
  engine(on, world, newSeen())
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })
  await start($)

  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: '⛩ kata' })).toBeUndefined()
  await ui.unmount()
})

// ----- status line, toasts, notifications ------------------------------------------------------

test('the status line carries the headline with progress and branch', async ($, on) => {
  const world = newWorld()
  setState(world, running())
  const seen = newSeen()
  engine(on, world, seen)
  await start($)
  await $.tool.call({ tool: 'Read', file_path: '/proj/README.md' })

  expect(seen.statuses.filter(Boolean).pop()).toBe('⛩ kata pr · 4/5 Fix every issue · 5/10 fixed ⎇ feat/logging')
})

test('steps, pauses and the end of a run are announced', async ($, on) => {
  const world = newWorld()
  const seen = newSeen()
  const base = running()
  setState(world, { ...base, current: 2, steps: base.steps.map((s, i) => (i === 2 ? { ...s, status: 'running' as const, note: undefined } : i > 2 ? { ...s, status: 'pending' as const, progress: undefined } : s)) })
  engine(on, world, seen)
  await start($)
  expect(seen.toasts).toEqual(['⛩ Kata PR implementation started · 5 steps'])

  // The skill writes the state file: review done, run paused at a confirm gate.
  setState(world, { ...base, current: 3, status: 'paused' })
  await $.tool.call({ tool: 'Write', file_path: '/proj/.claude/kata/state.json', content: '{}' })
  expect(seen.toasts).toContain('✓ Full self-review · 10 issues found')
  expect(seen.notifications).toEqual(['Waiting for you after “Fix every issue”.'])

  setState(world, { ...base, status: 'done', steps: base.steps.map(s => ({ ...s, status: 'done' as const })), issues: base.issues?.map(i => ({ ...i, status: 'fixed' as const })) })
  await $.tool.call({ tool: 'Write', file_path: '/proj/.claude/kata/state.json', content: '{}' })
  expect(seen.toasts).toContain('⛩ Kata PR implementation: done · 10/10 issues fixed')
  expect(seen.notifications).toContain('Run done · 10/10 issues fixed.')
  expect(seen.statuses[seen.statuses.length - 1]).toBeUndefined()
})

test('notify=false keeps toasts but sends no notification', { options: { notify: false } }, async ($, on) => {
  const world = newWorld()
  const seen = newSeen()
  setState(world, running())
  engine(on, world, seen)
  await start($)
  setState(world, running({ status: 'paused' }))
  await $.tool.call({ tool: 'Write', file_path: '/proj/.claude/kata/state.json', content: '{}' })
  expect(seen.notifications).toEqual([])
})

// ----- pane ----------------------------------------------------------------------------------

test('the pane lists steps with progress, the issues with their status, and the branch', async ($, on) => {
  const world = newWorld()
  setState(world, running())
  engine(on, world, newSeen())
  await start($)

  for (const surface of ['terminal', 'desktop', 'vscode', 'mobile'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect(await ui.find({ type: 'Text', text: 'PR implementation' })).toBeDefined()
    expect((await ui.find({ type: 'Text', text: /^⎇ feat\/logging · started/ }))?.text).toMatch(/^⎇ feat\/logging · started \d\d:\d\d · /)
    expect(await ui.find({ type: 'Text', text: 'Read the plan' })).toBeDefined()
    expect((await ui.find({ type: 'Text', text: /scope written/ }))?.text).toMatch(/scope written$/)
    expect((await ui.find({ type: 'Text', text: /█+░+ 5\/10 fixed$/ }))?.text).toMatch(/^\s+█{7}░{7} 5\/10 fixed$/)
    expect((await ui.find({ type: 'Text', text: /fixing #6/ }))?.text).toMatch(/fixing #6 in src\/log.ts$/)
    expect((await ui.find({ type: 'Text', text: /fixed · |\/10 fixed$/ }))).toBeDefined()
    expect((await ui.findAll({ type: 'Text', text: /issue \d+/ })).length).toBeGreaterThanOrEqual(10)
    expect(await ui.find({ type: 'Button', key: 'stop' })).toBeDefined()
    await ui.unmount()
  }
})

test('the Stop run button runs /kata stop', async ($, on) => {
  const world = newWorld()
  setState(world, running())
  const seen = newSeen()
  const clock = engine(on, world, seen)
  await start($)

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.press({ key: 'stop' })
  await clock.advance(100)
  expect(seen.kataRuns).toEqual(['stop'])
  await ui.unmount()
})

test('a fresh install shows how to start: setup, the steps library, or a first command', async ($, on) => {
  engine(on, newWorld(), newSeen())
  await start($)

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /no library yet · 0 modes · 0 commands/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'Your library is empty. Three ways to start:' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /\/kata examples/ })).toBeDefined()
  await ui.unmount()
})

test('without a run the pane shows the library: modes and step commands with their slash names', async ($, on) => {
  const world = newWorld()
  setFile(world, CACHE, PR_LIBRARY)
  engine(on, world, newSeen())
  await start($)

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /No run in this project/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /local copy · 1 modes · 8 commands/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '/kata pr' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '/kata-review' })).toBeDefined()
  await ui.unmount()
})

test('/kata-panel opens the pane and reports the headline', async ($, on) => {
  const world = newWorld()
  setState(world, running())
  const seen = newSeen()
  engine(on, world, seen)
  await start($)

  const result = await $.command.run(typed('kata-panel'))
  expect(seen.opened).toEqual(['kata'])
  expect(result.text).toBe('Kata pane opened: ⛩ kata pr · 4/5 Fix every issue · 5/10 fixed ⎇ feat/logging')
})

// ----- prompt section ------------------------------------------------------------------------

test('prompt.compose appends kata:config with the source, URL and library', { options: { source: 'local', artifactUrl: 'https://claude.ai/artifact/abc' } }, async ($, on) => {
  const world = newWorld()
  setFile(world, CACHE, PR_LIBRARY)
  engine(on, world, newSeen())
  on('prompt.compose', () => ({ sections: [{ id: 'base', text: 'base', scope: 'shared' }] }))
  await start($)

  const result = await $.prompt.compose({ model: 'm', promptModel: 'm', surfaces: ['terminal'], tools: [], outputStyle: null, traits: [] })
  const section = result.sections.find(s => s.id === 'kata:config')
  expect(result.sections[0]?.id).toBe('base')
  expect(section?.scope).toBe('session')
  expect(section?.text).toContain('library source: local')
  expect(section?.text).toContain('artifact URL: https://claude.ai/artifact/abc')
  expect(section?.text).toContain('modes pr; commands acceptance, commit, fix, implement, pr, read, review, verify')
})
