import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'
import type { MockClock } from 'claude-code/testing'

const HOME = '/home/me'
const CACHE = `${HOME}/.claude/kata/library.json`

type Command = { title: string; slash?: string; gate: string; instruction: string }
type Disk = { files: Map<string, { text: string; mtimeMs: number }> }

const library = (commands: Record<string, Command>) => JSON.stringify({ version: 1, commands, modes: {} })

const REVIEW: Command = { title: 'Full self-review', slash: 'kata-review', gate: 'continue', instruction: 'Review.' }
const PR: Command = { title: 'Open the pull request', slash: 'kata-pr', gate: 'continue', instruction: 'Open it.' }

type Seen = { registered: string[]; kataRuns: string[] }

/** Stands for the engine: a home folder whose library cache is `disk`, and a /kata skill that records its runs. */
function engine(on: On, disk: Disk, seen: Seen, kataName = 'kata', bundled?: string): MockClock {
  const clock = mock.clock(on)
  mock.env(on, { HOME })
  on('session.root', () => ({ value: '/proj' }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('ui.status', () => ({ value: undefined }))
  on('ui.toast', () => ({ value: undefined }))
  on('fs.stat', (_, e) => {
    if (bundled && e.path.endsWith('/library/default.json')) return { value: { kind: 'file', size: 1, mtimeMs: 1, isLink: false } }
    const f = disk.files.get(e.path)
    if (!f) throw new Error('ENOENT')
    return { value: { kind: 'file', size: f.text.length, mtimeMs: f.mtimeMs, isLink: false } }
  })
  on('fs.read', (_, e) => {
    if (bundled && e.path.endsWith('/library/default.json')) return { value: bundled }
    const f = disk.files.get(e.path)
    if (!f) throw new Error('ENOENT')
    return { value: f.text }
  })
  on('command.register', (_, e) => {
    seen.registered.push(e.name)
    return { value: { command: e.name } }
  })
  on('command.list', () => ({ value: [{ name: kataName, description: 'Run a Kata', source: 'plugin', plugin: 'kata' }] }))
  on('command.run', (_, e) => {
    if (e.command === kataName) seen.kataRuns.push(e.args)
    return { text: '' }
  })
  return clock
}

const start = ($: Engine) => $.session.start({ cwd: '/proj', surface: 'terminal', isInteractive: true })
const typed = (command: string, args = '') =>
  ({ command, args, origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 120 } }) as const

test('each library command with a slash name is registered as a slash command', async ($, on) => {
  const disk: Disk = { files: new Map([[CACHE, { text: library({ review: REVIEW, pr: PR }), mtimeMs: 1 }]]) }
  const seen: Seen = { registered: [], kataRuns: [] }
  engine(on, disk, seen)
  await start($)

  expect(seen.registered).toContain('kata-review')
  expect(seen.registered).toContain('kata-pr')
  expect(seen.registered).toContain('kata-panel')
})

test('a step command runs that one command through /kata run', async ($, on) => {
  const disk: Disk = { files: new Map([[CACHE, { text: library({ review: REVIEW }), mtimeMs: 1 }]]) }
  const seen: Seen = { registered: [], kataRuns: [] }
  const clock = engine(on, disk, seen)
  await start($)

  const result = await $.command.run(typed('kata-review', '  the logging package '))
  await $.command.run(typed('kata-review'))
  await clock.advance(100)

  expect(result.text).toBe('Kata ▸ /kata run review the logging package')
  expect(seen.kataRuns).toEqual(['run review the logging package', 'run review'])
})

test('a namespaced /kata skill is found by its suffix', async ($, on) => {
  const disk: Disk = { files: new Map([[CACHE, { text: library({ review: REVIEW }), mtimeMs: 1 }]]) }
  const seen: Seen = { registered: [], kataRuns: [] }
  const clock = engine(on, disk, seen, 'kata:kata')
  await start($)

  await $.command.run(typed('kata-review'))
  await clock.advance(100)
  expect(seen.kataRuns).toEqual(['run review'])
})

test('renaming a slash name in the library registers the new name without a reload', async ($, on) => {
  const disk: Disk = { files: new Map([[CACHE, { text: library({ review: REVIEW }), mtimeMs: 1 }]]) }
  const seen: Seen = { registered: [], kataRuns: [] }
  const clock = engine(on, disk, seen)
  await start($)

  disk.files.set(CACHE, { text: library({ review: { ...REVIEW, slash: 'self-review' } }), mtimeMs: 2 })
  // The mod re-reads the cache on its two-second clock.
  await clock.advance(2000)
  await clock.settle()

  expect(seen.registered).toContain('self-review')
  await $.command.run(typed('self-review', 'x'))
  await clock.advance(100)
  expect(seen.kataRuns).toEqual(['run review x'])

  const stale = await $.command.run(typed('kata-review'))
  expect(stale.text).toMatch(/no longer in the Kata library/)
  expect(seen.kataRuns).toEqual(['run review x'])
})

test('reserved and malformed slash names are not registered', async ($, on) => {
  const commands = {
    a: { ...REVIEW, slash: 'kata' },
    b: { ...REVIEW, slash: 'kata-panel' },
    c: { ...REVIEW, slash: 'Bad Name' },
    d: { ...REVIEW, slash: undefined },
  }
  const disk: Disk = { files: new Map([[CACHE, { text: library(commands), mtimeMs: 1 }]]) }
  const seen: Seen = { registered: [], kataRuns: [] }
  engine(on, disk, seen)
  await start($)

  expect(seen.registered).toEqual(['kata-panel'])
})

test('without a local cache the bundled library supplies the step commands', async ($, on) => {
  const disk: Disk = { files: new Map() }
  const seen: Seen = { registered: [], kataRuns: [] }
  engine(on, disk, seen, 'kata', library({ pr: PR }))
  await start($)

  expect(seen.registered).toContain('kata-pr')
})
