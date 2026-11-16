// Media capture for `mise run media`: mounts the band and the pane through the mod for each moment of a
// pull-request run and prints what the mod drew, one `KATA-MEDIA <json>` line per frame. As a test it also
// checks that every frame draws. tools/media/build.mjs turns these trees into the README and website media.
import { expect, test } from 'claude-code/testing'

import type { KataIssue, KataState, KataStep } from '../types'
import { CACHE, engine, newSeen, newWorld, PR_LIBRARY, setFile, setState, start } from './engine.testkit'

// The test runner passes console output through; the plugin environment's types don't declare it.
declare const console: { log: (line: string) => void }

const BAND = {
  plugin: 'kata',
  component: 'AbovePrompt',
  props: { hasSurvey: false, isCollapsed: false, isWorking: true, maxRows: 4, bodyColumns: 96, scroll: { offset: 0, bodyRows: 4 }, view: {} },
} as const
const PANE = {
  plugin: 'kata',
  component: 'Pane',
  requestId: 'kata',
  props: { title: 'Kata', isFocused: false, bodyColumns: 58, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} },
} as const

const STEPS: [string, string][] = [
  ['read', 'Read the plan'],
  ['implement', 'Implement the scope'],
  ['review', 'Full self-review'],
  ['fix', 'Fix every issue'],
  ['verify', 'Lint, tests, architecture check'],
  ['commit', 'Commit without trailers'],
  ['acceptance', 'Acceptance criteria and TODOs'],
  ['pr', 'Open the pull request'],
]
const ISSUES: Omit<KataIssue, 'status'>[] = [
  { id: '1', title: 'farewell() has no test for an empty name', file: 'test/greet.test.js', line: 9, severity: 'high', step: 'review' },
  { id: '2', title: 'greet and farewell repeat the trim logic', file: 'src/greet.js', line: 14, severity: 'medium', step: 'review' },
  { id: '3', title: 'README does not mention farewell()', file: 'README.md', severity: 'low', step: 'review' },
  { id: '4', title: 'JSDoc missing on farewell()', file: 'src/greet.js', line: 11, severity: 'low', step: 'review' },
]
const NOTES: Record<string, string> = {
  read: 'scope written, 4 criteria',
  implement: 'farewell() added with a test',
  review: '4 issues found',
  fix: '4/4 fixed',
  verify: 'lint and 3 tests pass',
  commit: 'feat(greet): add farewell(name)',
  acceptance: '4 of 4 criteria met',
  pr: 'PR #12 opened',
}

type Frame = { name: string; current: number; status?: KataState['status']; activity?: string; fixed?: number; checks?: [number, number] }
const FRAMES: Frame[] = [
  { name: 'read', current: 0, activity: 'reading CLAUDE.md and the plan' },
  { name: 'implement', current: 1, activity: 'writing src/greet.js and its test' },
  { name: 'review', current: 2, activity: 'reading every touched file' },
  { name: 'fix-0', current: 3, fixed: 0, activity: 'fixing #1 in test/greet.test.js' },
  { name: 'fix-2', current: 3, fixed: 2, activity: 'fixing #3 in README.md' },
  { name: 'fix-4', current: 3, fixed: 4, status: 'paused' },
  { name: 'verify', current: 4, fixed: 4, activity: 'running npm test', checks: [1, 2] },
  { name: 'pr', current: 7, fixed: 4, activity: 'opening the pull request' },
  { name: 'done', current: 8, fixed: 4, status: 'done' },
]

const iso = (minutesAgo: number) => new Date(Date.now() - minutesAgo * 60_000).toISOString()

function stateFor(f: Frame): KataState {
  const steps: KataStep[] = STEPS.map(([command, title], i) => {
    const step: KataStep = { command, title, status: i < f.current ? 'done' : i === f.current ? 'running' : 'pending' }
    if (f.status === 'paused' && i === f.current) step.status = 'done'
    if (step.status !== 'pending') step.startedAt = iso(24 - i * 3)
    if (step.status === 'done') { step.finishedAt = iso(22 - i * 3); step.note = NOTES[command] }
    if (step.status === 'running' && f.activity) step.activity = f.activity
    if (command === 'fix' && f.fixed !== undefined && i <= f.current) step.progress = { done: f.fixed, total: ISSUES.length, label: 'fixed' }
    if (command === 'verify' && f.checks && i === f.current) step.progress = { done: f.checks[0], total: f.checks[1], label: 'checks' }
    return step
  })
  const done = steps.filter(s => s.status === 'done')
  const last = done[done.length - 1]
  return {
    version: 1,
    mode: 'pr',
    modeName: 'PR implementation',
    args: 'add a farewell function with a test',
    status: f.status ?? (f.current >= STEPS.length ? 'done' : 'running'),
    startedAt: iso(26),
    updatedAt: iso(1),
    current: Math.min(f.current, STEPS.length - 1),
    steps,
    ...(last ? { lastCommand: { command: last.command, title: last.title, finishedAt: last.finishedAt ?? iso(2), status: 'done' as const } } : {}),
    scope: 'Add farewell(name) next to greet, returning Goodbye, NAME!, with a test',
    issues: f.current >= 3 ? ISSUES.map((issue, i) => ({ ...issue, status: i < (f.fixed ?? 0) ? 'fixed' as const : 'open' as const })) : [],
  }
}

for (const frame of FRAMES) {
  test(`media frame: ${frame.name}`, async ($, on) => {
    const world = newWorld({ branch: 'feat/farewell' })
    setState(world, stateFor(frame))
    setFile(world, CACHE, PR_LIBRARY)
    const seen = newSeen()
    engine(on, world, seen)
    on('ui.render', ($, e) => {
      const { Text } = $.ui.resolve(e)
      return <Text> </Text>
    })
    await start($)

    const band = await $.ui.mount({ ...BAND, surface: 'terminal' })
    const bandTree = await band.drawn()
    await band.unmount()
    const pane = await $.ui.mount({ ...PANE, surface: 'terminal' })
    const paneTree = await pane.drawn()
    await pane.unmount()

    expect(paneTree).toBeDefined()
    const status = seen.statuses.filter(Boolean).pop() ?? null
    const now = new Date()
    console.log(`KATA-MEDIA ${JSON.stringify({ name: frame.name, band: bandTree, pane: paneTree, status, clock: now.getHours() * 60 + now.getMinutes() })}`)
  })
}
