import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { KataState, KataStepStatus } from '../types'

const PANE = 'kata'
const STATE_FILE = '.claude/kata/state.json'
const run = atom({ plugin: 'kata', key: 'run' } as const, null)
const isBandHidden = atom({ plugin: 'kata', key: 'isBandHidden' } as const, false)

const COMMIT = /\bgit\b[^|;&\n]*\bcommit\b/
const TRAILER = /co-authored-by|generated[- ]with|generated-by|signed-off-by/i

const glyph = (s: KataStepStatus): string =>
  s === 'done' ? '✓' : s === 'running' ? '▶' : s === 'failed' ? '✗' : s === 'skipped' ? '–' : '·'

const clock = (iso?: string): string => {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

const headline = (s: KataState): string => {
  const total = s.steps.length
  if (s.status === 'running' || s.status === 'paused') {
    const step = s.steps[s.current]
    const label = step ? step.title : ''
    return `⛩ kata ${s.mode} · ${Math.min(s.current + 1, total)}/${total} ${label}${s.status === 'paused' ? ' (paused)' : ''}`
  }
  return `⛩ kata ${s.mode} · ${s.status}`
}

type ActiveKataState = KataState & { status: 'running' | 'paused' }

const isActive = (s: KataState | null): s is ActiveKataState =>
  s !== null && (s.status === 'running' || s.status === 'paused')

// Module-level mirror of the state file; a hot reload starts it over, and the next refresh re-reads the file.
let lastMtime = -1
let lastStatus: string | undefined

/** Re-reads the state file when it changed and mirrors it into $.state and the status line. */
async function refresh($: EngineInterface): Promise<void> {
  const path = `${await $.session.root()}/${STATE_FILE}`
  const stat = await $.fs.stat(path).catch(() => undefined)
  if (!stat) {
    if (lastMtime !== 0) {
      lastMtime = 0
      lastStatus = undefined
      await update($, run, () => null)
      $.ui.status(undefined)
    }
    return
  }
  if (stat.mtimeMs === lastMtime) return
  lastMtime = stat.mtimeMs
  const text = await $.fs.read(path).catch(() => undefined)
  if (typeof text !== 'string') return
  let parsed: KataState
  try {
    parsed = JSON.parse(text) as KataState
  } catch {
    return
  }
  if (!parsed || !Array.isArray(parsed.steps)) return
  const before = await read($, run)
  await update($, run, () => parsed)
  if (isActive(parsed)) {
    $.ui.status(headline(parsed))
    if (!isActive(before)) $.ui.toast(`Kata run started: ${parsed.modeName || parsed.mode}`)
  } else {
    $.ui.status(undefined)
    if (isActive(before) && parsed.status !== lastStatus) {
      $.ui.toast(`Kata ${parsed.mode}: ${parsed.status}`)
    }
  }
  lastStatus = parsed.status
}

// Step commands: each library command may name a slash command in its `slash` field. The mod reads the
// local library cache the /kata skill writes, registers those names, and runs `/kata run <id>` for them.
const SLASH = /^[a-z0-9][a-z0-9_-]{0,63}$/
const RESERVED = new Set(['kata', 'kata-sync', 'kata-edit', 'kata-panel'])
type CachedCommand = { title?: unknown; slash?: unknown }
let slashToId = new Map<string, string>()
let registered = new Set<string>()
let libraryMtime = -1
let kataCommand: string | undefined

/** The local library caches the /kata skill writes, newest first is decided by mtime. */
async function libraryPaths($: EngineInterface): Promise<string[]> {
  const paths: string[] = []
  const data = await $.env.get('CLAUDE_PLUGIN_DATA').catch(() => undefined)
  if (data) paths.push(`${data}/library.json`)
  const home = await $.env.get('HOME').catch(() => undefined)
  if (home) paths.push(`${home}/.claude/kata/library.json`)
  return paths
}

/** The bundled library, used for step commands until the skill has written a local cache. */
function bundledPath($: EngineInterface): string {
  return `${$.plugin.root}/library/default.json`
}

/** Re-reads the library cache when it changed and registers each command's `slash` name. */
async function refreshSlash($: EngineInterface): Promise<void> {
  let newest: { path: string; mtime: number } | undefined
  for (const path of await libraryPaths($)) {
    const st = await $.fs.stat(path).catch(() => undefined)
    if (st && st.kind === 'file' && (!newest || st.mtimeMs > newest.mtime)) newest = { path, mtime: st.mtimeMs }
  }
  if (!newest) {
    const path = bundledPath($)
    const st = await $.fs.stat(path).catch(() => undefined)
    if (st && st.kind === 'file') newest = { path, mtime: st.mtimeMs }
  }
  if (!newest || newest.mtime === libraryMtime) return
  libraryMtime = newest.mtime
  const text = await $.fs.read(newest.path).catch(() => undefined)
  if (typeof text !== 'string') return
  let commands: Record<string, CachedCommand>
  try {
    const lib = JSON.parse(text) as { commands?: Record<string, CachedCommand> }
    commands = lib && typeof lib.commands === 'object' && lib.commands ? lib.commands : {}
  } catch {
    return
  }
  const next = new Map<string, string>()
  for (const [id, c] of Object.entries(commands)) {
    const slash = typeof c?.slash === 'string' ? c.slash.trim() : ''
    if (SLASH.test(slash) && !RESERVED.has(slash) && !next.has(slash)) next.set(slash, id)
  }
  slashToId = next
  for (const [slash, id] of next) {
    if (registered.has(slash)) continue
    const title = typeof commands[id]?.title === 'string' ? (commands[id]?.title as string) : id
    const ok = await $.command
      .register({ name: slash, description: `Kata step: ${title} (runs /kata run ${id})`, argumentHint: '[args]' })
      .then(() => true, () => false)
    if (ok) registered.add(slash)
  }
}

/** The /kata skill's name in this session: `kata`, or `kata:kata` where plugin skills are namespaced. */
async function kataName($: EngineInterface): Promise<string> {
  if (kataCommand) return kataCommand
  const names = (await $.command.list().catch(() => [])).map(c => c.name)
  kataCommand = names.includes('kata') ? 'kata' : names.find(n => n.endsWith(':kata')) ?? 'kata'
  return kataCommand
}

export const register: Register = (on, options) => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'kata-panel',
      description: 'Open the Kata pane: the running mode, its steps and the last command',
    })
    await refresh($)
    await refreshSlash($).catch(() => undefined)
    $.clock.every(2000, () => Promise.all([refresh($), refreshSlash($).catch(() => undefined)]).then(() => undefined))
    return next(e)
  })

  // A step command typed by the person runs that one library command through the /kata skill.
  on('command.run', async ($, e, next) => {
    if (!registered.has(e.command)) return next(e)
    const id = slashToId.get(e.command)
    if (!id) return { text: `/${e.command} is no longer in the Kata library. Run /kata commands to see the current names.` }
    const args = `run ${id}${e.args.trim() ? ` ${e.args.trim()}` : ''}`
    const name = await kataName($)
    // A command hook cannot start another command (it would wait on itself), so the /kata run starts from a
    // timer once this command has answered; the engine queues it until the session is idle.
    $.clock.after(50, () => $.command.run({ command: name, args }).then(() => undefined, () => undefined))
    return { text: `Kata ▸ /${name} ${args}` }
  })

  on('command.run', { command: 'kata-panel' }, async $ => {
    await $.ui.open({ id: PANE, title: 'Kata' })
    const state = await read($, run)
    return { text: state ? `Kata pane opened: ${headline(state)}` : 'Kata pane opened. No run in this project yet.' }
  })

  // Guard: a git commit whose message carries a trailer is refused while a Kata run is active (or always, per config).
  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const command = String((e as { command?: unknown }).command ?? '')
    const policy = String(options.blockTrailers ?? 'during-kata')
    const active = isActive(await read($, run))
    const guards = policy === 'always' || (policy === 'during-kata' && active)
    if (guards && COMMIT.test(command) && TRAILER.test(command)) {
      return {
        deny:
          'kata: commit messages carry no trailers (Co-Authored-By, Generated with, Signed-off-by). Rewrite the commit message without them and run the commit again.',
      }
    }
    const ran = await next(e)
    await refresh($)
    return ran
  }).catch(($, e, next) => next(e))

  // Any other tool (Write/Edit of the state file by the /kata skill) refreshes the mirror promptly.
  on('tool.call', async ($, e, next) => {
    const ran = await next(e)
    if (e.tool !== 'Bash') await refresh($)
    return ran
  })

  // The model learns the configured library source without reading settings itself.
  on('prompt.compose', async ($, e, next) => {
    const result = await next(e)
    const source = String(options.source ?? 'artifact')
    const url = String(options.artifactUrl ?? '').trim()
    const text = [
      'Kata plugin configuration (set in /config under the kata plugin):',
      `- library source: ${source}`,
      `- artifact URL: ${url || '(not set)'}`,
      `- run state file: <project root>/${STATE_FILE}`,
      'The /kata, /kata-sync and /kata-edit skills read these values; do not ask the user for them when they are set.',
    ].join('\n')
    return { sections: [...result.sections, { id: 'kata:config', text, scope: 'session' }] }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const state = await read($, run)
    const hidden = await read($, isBandHidden)
    if (options.showBand === false || e.props.hasSurvey || !isActive(state) || hidden) return next(e)
    const { Box, Text, Button } = $.ui.resolve(e)
    const trail = state.steps.map((s, i) => (i === state.current && s.status === 'pending' ? '▶' : glyph(s.status))).join(' ')
    const last = state.lastCommand ? `last: ${state.lastCommand.command} ${clock(state.lastCommand.finishedAt)}` : ''
    return (
      <Box gap={1}>
        <Text bold>{headline(state)}</Text>
        <Text dimColor>{trail}</Text>
        {last !== '' && <Text dimColor>{last}</Text>}
        <Button key="hide" plain label="hide" onPress={() => update($, isBandHidden, () => true)} />
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const state = await read($, run)
    const width = Math.max(20, e.props.bodyColumns ?? 60)
    if (!state) {
      return (
        <Box flexDirection="column">
          <Text dimColor>No Kata run in this project.</Text>
          <Text dimColor>Start one with /kata &lt;mode&gt; [args], or /kata run &lt;command&gt;.</Text>
        </Box>
      )
    }
    const cut = (s: string, n: number) => (s.length > n ? `${s.slice(0, Math.max(0, n - 1))}…` : s)
    return (
      <Box flexDirection="column">
        <Text bold>{state.modeName || state.mode}</Text>
        <Text dimColor>
          {state.status} · started {clock(state.startedAt)} · {state.args ? cut(state.args, width - 24) : 'no arguments'}
        </Text>
        <Text> </Text>
        {state.steps.map((s, i) => (
          <Text key={`${s.command}-${i}`} dimColor={s.status === 'done' || s.status === 'skipped'} bold={i === state.current && isActive(state)}>
            {glyph(s.status)} {String(i + 1).padStart(2, ' ')} {cut(s.title, width - 12)}
            {s.note ? ` — ${cut(s.note, Math.max(8, width - 16 - s.title.length))}` : ''}
          </Text>
        ))}
        <Text> </Text>
        {state.lastCommand && (
          <Text dimColor>
            last command: {state.lastCommand.command} ({state.lastCommand.status}) at {clock(state.lastCommand.finishedAt)}
          </Text>
        )}
        {state.scope && <Text dimColor>scope: {cut(state.scope, width - 8)}</Text>}
        <Box>
          <Button key="unhide" plain label="show band" onPress={() => update($, isBandHidden, () => false)} />
        </Box>
      </Box>
    )
  })
}
