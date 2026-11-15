// A stand-in for the engine beneath the Kata mod in tests: a project folder, a home folder with an
// optional library cache, git, the /kata skill and the ArtifactData tool, each recorded for assertions.
import { mock } from 'claude-code/testing'
import type { Engine, MockClock } from 'claude-code/testing'
import type { On } from 'claude-code'

import type { KataState } from '../types'

export const ROOT = '/proj'
export const HOME = '/home/me'
export const CACHE = `${HOME}/.claude/kata/library.json`
export const STATE = `${ROOT}/.kata/state.json`

export type Command = { title: string; slash?: string; gate: string; instruction: string }
export type Mode = { name: string; slash?: string; steps: string[] }

export const library = (commands: Record<string, Command>, modes: Record<string, Mode> = {}) =>
  JSON.stringify({ version: 1, commands, modes })

const STEP_IDS = ['read', 'implement', 'review', 'fix', 'verify', 'commit', 'acceptance', 'pr']
/** The bundled library: empty. A new user starts from nothing, or from the steps library. */
export const BUNDLED = library({})

/** The example `pr` workflow's shape: the pr mode and its eight commands, each with a kata-<id> slash name. */
export const PR_LIBRARY = library(
  Object.fromEntries(STEP_IDS.map(id => [id, { title: id, slash: `kata-${id}`, gate: 'continue', instruction: `Do ${id}.` }])),
  { pr: { name: 'PR implementation', steps: STEP_IDS } },
)

export type World = {
  files: Map<string, { text: string; mtimeMs: number }>
  branch: string
  /** The /kata skill's name in the session; `kata:kata` when plugin skills are namespaced. */
  kataName: string
  /** Whether a command named `kata` already exists (the skill itself, un-namespaced). */
  hasPlainKata: boolean
  artifact?: { commands: Record<string, unknown>; modes: Record<string, unknown>; decision: 'allow' | 'ask' | 'deny' }
}

export type Seen = {
  registered: string[]
  kataRuns: string[]
  toasts: string[]
  notifications: string[]
  statuses: Array<string | undefined>
  opened: string[]
  writes: Array<{ path: string; text: string }>
  artifactCalls: number
}

export const newWorld = (over: Partial<World> = {}): World => ({
  files: new Map(),
  branch: 'feat/logging',
  kataName: 'kata',
  hasPlainKata: true,
  ...over,
})

export const newSeen = (): Seen => ({ registered: [], kataRuns: [], toasts: [], notifications: [], statuses: [], opened: [], writes: [], artifactCalls: 0 })

let clockMs = 1000
export const setState = (world: World, state: KataState | null): void => {
  clockMs += 1000
  if (state) world.files.set(STATE, { text: JSON.stringify(state), mtimeMs: clockMs })
  else world.files.delete(STATE)
}
export const setFile = (world: World, path: string, text: string): void => {
  clockMs += 1000
  world.files.set(path, { text, mtimeMs: clockMs })
}

const lines = (docs: Record<string, unknown>) =>
  ['=== BEGIN ARTIFACT DB x ===', ...Object.entries(docs).map(([id, data]) => JSON.stringify({ id, data, version: 1 })), '=== END ARTIFACT DB x ==='].join('\n')

export function engine(on: On, world: World, seen: Seen, env: Record<string, string> = {}): MockClock {
  const clock = mock.clock(on)
  mock.env(on, { HOME, ...env })
  on('session.root', () => ({ value: ROOT }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('ui.status', (_, e) => {
    seen.statuses.push(e.text)
    return { value: undefined }
  })
  on('ui.toast', (_, e) => {
    seen.toasts.push(e.text)
    return { value: undefined }
  })
  on('ui.notify', (_, e) => {
    seen.notifications.push(e.text)
    return { value: { isSent: true, channel: 'terminal_bell' } }
  })
  on('ui.open', (_, e) => {
    seen.opened.push(e.id)
    return { value: { isPlaced: true } }
  })
  const bundled = (path: string) => (path.endsWith('/library/default.json') && !world.files.has(path) ? { text: BUNDLED, mtimeMs: 1 } : undefined)
  on('fs.stat', (_, e) => {
    const f = world.files.get(e.path) ?? bundled(e.path)
    if (!f) throw new Error('ENOENT')
    return { value: { kind: 'file', size: f.text.length, mtimeMs: f.mtimeMs, isLink: false } }
  })
  on('fs.read', (_, e) => {
    const f = world.files.get(e.path) ?? bundled(e.path)
    if (!f) throw new Error('ENOENT')
    return { value: f.text }
  })
  on('fs.write', (_, e) => {
    seen.writes.push({ path: e.path, text: e.text })
    setFile(world, e.path, e.text)
    return { value: undefined }
  })
  on('process.run', (_, e) => {
    if (e.argv.join(' ') === 'git branch --show-current') return { value: { exitCode: 0, stdout: `${world.branch}\n`, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
    return { value: { exitCode: 1, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })
  on('command.register', (_, e) => {
    seen.registered.push(e.name)
    return { value: { command: e.name } }
  })
  on('command.list', () => ({
    value: [
      ...(world.hasPlainKata ? [{ name: 'kata', description: 'Run a Kata', source: 'plugin' as const, plugin: 'kata' }] : []),
      ...(world.kataName !== 'kata' ? [{ name: world.kataName, description: 'Run a Kata', source: 'plugin' as const, plugin: 'kata' }] : []),
    ],
  }))
  on('command.run', (_, e) => {
    if (e.command === world.kataName) seen.kataRuns.push(e.args)
    return { text: '' }
  })
  on('tool.list', () => ({
    value: world.artifact ? [{ name: 'ArtifactData', description: 'Artifact database', mcp: false }] : [],
  }))
  on('tool.check', () => ({ decision: world.artifact?.decision ?? 'deny' }))
  on('tool.call', (_, e) => {
    if (e.tool === 'ArtifactData' && world.artifact) {
      seen.artifactCalls += 1
      const collection = String((e as { collection?: unknown }).collection)
      const docs = collection === 'modes' ? world.artifact.modes : world.artifact.commands
      return { result: lines(docs), text: lines(docs) }
    }
    return { result: {} }
  })
  return clock
}

export const start = ($: Engine) => $.session.start({ cwd: ROOT, surface: 'terminal', isInteractive: true })

export const typed = (command: string, args = '') =>
  ({ command, args, origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 120 } }) as const

export const running = (over: Partial<KataState> = {}): KataState => ({
  version: 1,
  mode: 'pr',
  modeName: 'PR implementation',
  args: 'toy change',
  status: 'running',
  startedAt: '2026-11-15T09:00:00Z',
  updatedAt: '2026-11-15T09:20:00Z',
  current: 3,
  steps: [
    { command: 'read', title: 'Read the plan', status: 'done', note: 'scope written' },
    { command: 'implement', title: 'Implement the scope', status: 'done' },
    { command: 'review', title: 'Full self-review', status: 'done', note: '10 issues found' },
    { command: 'fix', title: 'Fix every issue', status: 'running', activity: 'fixing #6 in src/log.ts', progress: { done: 5, total: 10, label: 'fixed' } },
    { command: 'verify', title: 'Lint, tests, architecture check', status: 'pending' },
  ],
  lastCommand: { command: 'review', title: 'Full self-review', finishedAt: '2026-11-15T09:15:00Z', status: 'done' },
  scope: 'Add a logging package',
  issues: Array.from({ length: 10 }, (_, i) => ({
    id: String(i + 1),
    title: `issue ${i + 1}`,
    file: 'src/log.ts',
    line: 10 + i,
    severity: i < 2 ? ('high' as const) : ('low' as const),
    status: i < 5 ? ('fixed' as const) : ('open' as const),
    step: 'review',
  })),
  ...over,
})
