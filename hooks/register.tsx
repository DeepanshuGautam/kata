import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { KataIssue, KataLibraryInfo, KataProgress, KataSeverity, KataState, KataStep, KataStepStatus, KataVerdict } from '../types'

// ---------------------------------------------------------------------------------------------
// Kata mod. It never runs a step: the /kata skill does, writing <project>/.kata/state.json.
// The mod mirrors that file into a band, the status line, a pane, toasts and notifications; keeps
// the library's commands and modes registered as slash commands; and guards commit trailers.
// ---------------------------------------------------------------------------------------------

const PANE = 'kata'
const STATE_FILE = '.kata/state.json'
const run = atom({ plugin: 'kata', key: 'run' } as const, null)
const isBandHidden = atom({ plugin: 'kata', key: 'isBandHidden' } as const, false)
const library = atom({ plugin: 'kata', key: 'library' } as const, null)
const branch = atom({ plugin: 'kata', key: 'branch' } as const, null)
const minute = atom({ plugin: 'kata', key: 'minute' } as const, 0)

const COMMIT = /\bgit\b[^|;&\n]*\bcommit\b/
const TRAILER = /co-authored-by|generated[- ]with|generated-by|signed-off-by/i
const SLASH = /^[a-z0-9][a-z0-9_-]{0,63}$/
const OWN_COMMANDS = ['kata-panel', 'kata-refresh'] as const
const RESERVED = new Set(['kata', 'kata-sync', 'kata-edit', 'kata-setup', ...OWN_COMMANDS])
const ARTIFACT_EVERY_MS = 10 * 60 * 1000

// ----- formatting ---------------------------------------------------------------------------

const GLYPH: Record<KataStepStatus, string> = { done: '✓', running: '▶', failed: '✗', skipped: '–', pending: '○' }
const COLOR: Record<KataStepStatus, string> = { done: 'success', running: 'claude', failed: 'error', skipped: 'inactive', pending: 'inactive' }
const SEVERITY_COLOR: Record<KataSeverity, string> = { high: 'error', medium: 'warning', low: 'inactive', major: 'error', minor: 'warning', nit: 'inactive' }
const SEVERITY_ORDER: KataSeverity[] = ['major', 'minor', 'nit', 'high', 'medium', 'low']
const VERDICT_COLOR: Record<KataVerdict, string> = { approve: 'success', comment: 'warning', 'request changes': 'error' }

const hhmm = (iso?: string): string => {
  if (!iso) return ''
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

const duration = (fromIso?: string, toIso?: string, nowMs = Date.now()): string => {
  const from = fromIso ? Date.parse(fromIso) : NaN
  if (Number.isNaN(from)) return ''
  const to = toIso ? Date.parse(toIso) : nowMs
  const mins = Math.max(0, Math.round(((Number.isNaN(to) ? nowMs : to) - from) / 60000))
  return mins < 60 ? `${mins}m` : `${Math.floor(mins / 60)}h${String(mins % 60).padStart(2, '0')}m`
}

const bar = (done: number, total: number, width = 10): string => {
  const n = total > 0 ? Math.round((Math.min(done, total) / total) * width) : 0
  return `${'█'.repeat(n)}${'░'.repeat(width - n)}`
}

const cut = (s: string, n: number): string => (s.length > n ? `${s.slice(0, Math.max(0, n - 1))}…` : s)

type ActiveKataState = KataState & { status: 'running' | 'paused' }
const isActive = (s: KataState | null): s is ActiveKataState => s !== null && (s.status === 'running' || s.status === 'paused')

const issueCounts = (issues: readonly KataIssue[] | undefined) => {
  const list = issues ?? []
  const fixed = list.filter(i => i.status === 'fixed').length
  const skipped = list.filter(i => i.status === 'skipped').length
  return { total: list.length, fixed, skipped, open: list.length - fixed - skipped }
}

/** `2 major · 1 minor · 3 nits`, while nothing is fixed or skipped yet and every issue has a severity; else null. */
const severitySummary = (issues: readonly KataIssue[] | undefined): string | null => {
  const list = issues ?? []
  if (!list.length || list.some(i => !i.severity || i.status !== 'open')) return null
  return SEVERITY_ORDER
    .map(sev => [sev, list.filter(i => i.severity === sev).length] as const)
    .filter(([, n]) => n > 0)
    .map(([sev, n]) => `${n} ${sev === 'nit' && n !== 1 ? 'nits' : sev}`)
    .join(' · ')
}

/** The countable progress of a step: its own, or, while it works through the run's issues, fixed of found. */
const stepProgress = (s: KataState, step: KataStep | undefined): KataProgress | undefined => {
  if (!step) return undefined
  if (step.progress && step.progress.total > 0) return step.progress
  return undefined
}

const headline = (s: KataState, br: string | null): string => {
  const total = s.steps.length
  const where = br ? ` ⎇ ${br}` : ''
  if (!isActive(s)) return `⛩ kata ${s.mode} · ${s.status}${where}`
  const step = s.steps[s.current]
  const p = stepProgress(s, step)
  const extra = p ? ` · ${p.done}/${p.total}${p.label ? ` ${p.label}` : ''}` : ''
  const paused = s.status === 'paused' ? ' · waiting for you' : ''
  return `⛩ kata ${s.mode} · ${Math.min(s.current + 1, total)}/${total} ${step?.title ?? ''}${extra}${paused}${where}`
}

// ----- state file mirror ----------------------------------------------------------------------

let stateMtime = -1

async function root($: EngineInterface): Promise<string> {
  return $.session.root()
}

/** Re-reads the state file when it changed, mirrors it into $.state and announces transitions. */
async function refresh($: EngineInterface, notify: boolean): Promise<void> {
  const path = `${await root($)}/${STATE_FILE}`
  const stat = await $.fs.stat(path).catch(() => undefined)
  if (!stat) {
    if (stateMtime !== 0) {
      stateMtime = 0
      await update($, run, () => null)
      $.ui.status(undefined)
    }
    return
  }
  if (stat.mtimeMs === stateMtime) return
  stateMtime = stat.mtimeMs
  const text = await $.fs.read(path).catch(() => undefined)
  if (typeof text !== 'string') return
  let next: KataState
  try {
    next = JSON.parse(text) as KataState
  } catch {
    return
  }
  if (!next || !Array.isArray(next.steps)) return
  const before = await read($, run)
  await update($, run, () => next)
  $.ui.status(isActive(next) ? headline(next, await read($, branch)) : undefined)
  await announce($, before, next, notify)
}

/** Toasts for steps and runs, and a native notification when a run waits for the person or ends. */
async function announce($: EngineInterface, before: KataState | null, now: KataState, notify: boolean): Promise<void> {
  const name = now.modeName || now.mode
  const sameRun = before !== null && before.startedAt === now.startedAt
  if (isActive(now) && !(sameRun && isActive(before))) {
    $.ui.toast(`⛩ Kata ${name} started · ${now.steps.length} steps`)
  }
  if (sameRun) {
    now.steps.forEach((step, i) => {
      const was = before.steps[i]?.status
      if (was !== step.status && (step.status === 'done' || step.status === 'failed')) {
        $.ui.toast(`${GLYPH[step.status]} ${step.title}${step.note ? ` · ${step.note}` : ''}`)
      }
    })
  }
  const send = (text: string) => {
    if (notify) void $.ui.notify(text, { title: `Kata ${name}` }).catch(() => undefined)
  }
  if (now.status === 'paused' && before?.status !== 'paused') {
    send(`Waiting for you after “${now.steps[now.current]?.title ?? 'a step'}”.`)
  }
  if (!isActive(now) && isActive(before)) {
    const c = issueCounts(now.issues)
    const found = severitySummary(now.issues)
    const tail = (found ? ` · ${found}` : c.total ? ` · ${c.fixed}/${c.total} issues fixed` : '') + (now.verdict ? ` · ${now.verdict}` : '')
    $.ui.toast(`⛩ Kata ${name}: ${now.status}${tail}`)
    send(`Run ${now.status}${tail}.`)
  }
}

// ----- git branch -----------------------------------------------------------------------------

async function refreshBranch($: EngineInterface): Promise<void> {
  const cwd = await root($)
  const head = await $.process.run(['git', 'branch', '--show-current'], { cwd, timeoutMs: 5000 }).catch(() => undefined)
  let name = head && head.exitCode === 0 ? head.stdout.trim() : ''
  if (head && head.exitCode === 0 && !name) {
    const sha = await $.process.run(['git', 'rev-parse', '--short', 'HEAD'], { cwd, timeoutMs: 5000 }).catch(() => undefined)
    name = sha && sha.exitCode === 0 ? `detached ${sha.stdout.trim()}` : ''
  }
  const value = name || null
  if ((await read($, branch)) !== value) {
    await update($, branch, () => value)
    const s = await read($, run)
    if (isActive(s)) $.ui.status(headline(s, value))
  }
}

// ----- library: artifact, local cache, bundled default ----------------------------------------

type LibCommand = { title?: unknown; slash?: unknown; gate?: unknown; instruction?: unknown }
type LibMode = { name?: unknown; slash?: unknown; steps?: unknown; description?: unknown; argsHint?: unknown }
type Library = { version: 1; commands: Record<string, LibCommand>; modes: Record<string, LibMode> }

let cacheMtime = -1
let lastArtifactPull = 0
/** slash name -> what it runs, as `/kata <args>` */
let slashTargets = new Map<string, { kind: 'command' | 'mode'; id: string }>()
const registered = new Set<string>()
let kataCommand: string | undefined
let kataAliased = false

/** The local library copy, one path for the skills and the mod: $KATA_HOME/library.json, else ~/.claude/kata/library.json. */
async function cachePath($: EngineInterface): Promise<string | undefined> {
  const kataHome = await $.env.get('KATA_HOME').catch(() => undefined)
  if (kataHome) return `${kataHome.replace(/\/+$/, '')}/library.json`
  const home = await $.env.get('HOME').catch(() => undefined)
  return home ? `${home}/.claude/kata/library.json` : undefined
}

const parseLibrary = (text: string): Library | undefined => {
  try {
    const lib = JSON.parse(text) as Partial<Library>
    if (!lib || typeof lib !== 'object') return undefined
    const commands = lib.commands && typeof lib.commands === 'object' ? lib.commands : {}
    const modes = lib.modes && typeof lib.modes === 'object' ? lib.modes : {}
    return { version: 1, commands, modes }
  } catch {
    return undefined
  }
}

/** The documents an ArtifactData `list` answered with: one JSON object per line, `{ id, data, ... }`. */
const documentsOf = (answer: unknown): Record<string, Record<string, unknown>> => {
  const out: Record<string, Record<string, unknown>> = {}
  const texts: string[] = []
  const collect = (v: unknown) => {
    if (typeof v === 'string') texts.push(v)
    else if (Array.isArray(v)) v.forEach(collect)
    else if (v && typeof v === 'object') Object.values(v as Record<string, unknown>).forEach(collect)
  }
  collect(answer)
  for (const text of texts) {
    for (const line of text.split('\n')) {
      const t = line.trim()
      if (!t.startsWith('{"id"')) continue
      try {
        const doc = JSON.parse(t) as { id?: unknown; data?: unknown }
        if (typeof doc.id === 'string' && doc.data && typeof doc.data === 'object') out[doc.id] = doc.data as Record<string, unknown>
      } catch {
        // a line that is not one document
      }
    }
  }
  return out
}

/**
 * Reads the library from the Kata Library artifact through the ArtifactData tool, when this session has
 * the tool and may call it without asking. Writes the local cache when it changed. Never prompts.
 */
async function pullArtifact($: EngineInterface, url: string): Promise<'pulled' | 'unchanged' | string> {
  const tools = await $.tool.list().catch(() => [])
  if (!tools.some(t => t.name === 'ArtifactData')) return 'the ArtifactData tool is not available in this session'
  const input = (collection: string) => ({ action: 'list', url, collection, query: { limit: 1000 } })
  const verdict = await $.tool.check({ tool: 'ArtifactData', input: input('commands') }).catch(() => undefined)
  if (!verdict || verdict.decision !== 'allow') return 'reading the artifact would ask for permission'
  const [commands, modes] = await Promise.all(
    ['commands', 'modes'].map(c => $.tool.call({ tool: 'ArtifactData', ...input(c) } as never).then(r => documentsOf(r), () => undefined)),
  )
  if (!commands || !modes) return 'the artifact could not be read'
  const strip = (docs: Record<string, Record<string, unknown>>) =>
    Object.fromEntries(Object.entries(docs).sort(([a], [b]) => a.localeCompare(b)).map(([id, d]) => {
      const { updatedAt: _u, ...rest } = d
      return [id, rest]
    }))
  const lib = { version: 1, commands: strip(commands), modes: strip(modes) }
  lastArtifactPull = Date.now()
  const path = await cachePath($)
  if (!path) return 'no place for the local cache'
  const text = `${JSON.stringify(lib, null, 2)}\n`
  const current = await $.fs.read(path).catch(() => undefined)
  if (typeof current === 'string' && JSON.stringify(parseLibrary(current)) === JSON.stringify(parseLibrary(text))) {
    await markSynced($)
    return 'unchanged'
  }
  await $.fs.write(path, text)
  cacheMtime = -1
  syncedAt = new Date().toISOString()
  return 'pulled'
}

let syncedAt: string | undefined
let librarySource: KataLibraryInfo['source'] = 'bundled'

async function markSynced($: EngineInterface): Promise<void> {
  syncedAt = new Date().toISOString()
  librarySource = 'artifact'
  const info = await read($, library)
  if (info) await update($, library, () => ({ ...info, source: 'artifact' as const, syncedAt }))
}

/** Reads the newest local library (cache, else bundled) when it changed, and registers its slash commands. */
async function refreshLibrary($: EngineInterface): Promise<void> {
  let newest: { path: string; mtime: number; source: KataLibraryInfo['source'] } | undefined
  const local = await cachePath($)
  const st = local ? await $.fs.stat(local).catch(() => undefined) : undefined
  if (local && st && st.kind === 'file') newest = { path: local, mtime: st.mtimeMs, source: 'cache' }
  if (!newest) {
    const path = `${$.plugin.root}/library/default.json`
    const st = await $.fs.stat(path).catch(() => undefined)
    if (st && st.kind === 'file') newest = { path, mtime: st.mtimeMs, source: 'bundled' }
  }
  if (!newest || newest.mtime === cacheMtime) return
  cacheMtime = newest.mtime
  const text = await $.fs.read(newest.path).catch(() => undefined)
  const lib = typeof text === 'string' ? parseLibrary(text) : undefined
  if (!lib) return
  if (newest.source === 'bundled') librarySource = 'bundled'
  else if (librarySource === 'bundled') librarySource = 'cache'
  await registerLibrary($, lib)
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '')

async function registerLibrary($: EngineInterface, lib: Library): Promise<void> {
  const next = new Map<string, { kind: 'command' | 'mode'; id: string }>()
  const take = (slash: string, kind: 'command' | 'mode', id: string) => {
    const name = slash.trim()
    if (SLASH.test(name) && !RESERVED.has(name) && !next.has(name)) next.set(name, { kind, id })
  }
  for (const [id, m] of Object.entries(lib.modes)) take(str(m?.slash), 'mode', id)
  for (const [id, c] of Object.entries(lib.commands)) take(str(c?.slash), 'command', id)
  slashTargets = next
  for (const [name, target] of next) {
    if (registered.has(name)) continue
    const label =
      target.kind === 'mode'
        ? `Kata mode: ${str(lib.modes[target.id]?.name) || target.id} (runs /kata ${target.id})`
        : `Kata step: ${str(lib.commands[target.id]?.title) || target.id} (runs /kata run ${target.id})`
    const hint = target.kind === 'mode' ? str(lib.modes[target.id]?.argsHint) || '[args]' : '[args]'
    const ok = await $.command.register({ name, description: label, argumentHint: hint }).then(() => true, () => false)
    if (ok) registered.add(name)
  }
  const info: KataLibraryInfo = {
    source: librarySource,
    ...(syncedAt ? { syncedAt } : {}),
    modes: Object.entries(lib.modes)
      .map(([id, m]) => ({
        id,
        name: str(m?.name) || id,
        steps: Array.isArray(m?.steps) ? m.steps.length : 0,
        ...(SLASH.test(str(m?.slash)) ? { slash: str(m?.slash) } : {}),
      }))
      .sort((a, b) => a.id.localeCompare(b.id)),
    commands: Object.entries(lib.commands)
      .map(([id, c]) => ({
        id,
        title: str(c?.title) || id,
        gate: str(c?.gate) || 'continue',
        ...(SLASH.test(str(c?.slash)) ? { slash: str(c?.slash) } : {}),
      }))
      .sort((a, b) => a.id.localeCompare(b.id)),
  }
  await update($, library, () => info)
}

/** Pulls the artifact (when configured) and re-reads the library; says what happened. */
async function syncFromArtifact($: EngineInterface, url: string): Promise<string> {
  if (!url) return 'the library source is local'
  const outcome = await pullArtifact($, url).catch((x: unknown) => `the artifact could not be read (${String(x)})`)
  if (outcome === 'pulled' || outcome === 'unchanged') {
    await refreshLibrary($)
    await markSynced($)
  }
  return outcome
}

/** The /kata skill's name: `kata`, or `kata:kata` where plugin skills are namespaced. */
async function kataName($: EngineInterface): Promise<string> {
  if (kataCommand) return kataCommand
  const names = (await $.command.list().catch(() => [])).map(c => c.name)
  const skill = names.find(n => n.endsWith(':kata'))
  kataCommand = names.includes('kata') && !kataAliased ? 'kata' : skill ?? 'kata'
  return kataCommand
}

/** Gives a namespaced /kata:kata the short name /kata too, when nothing else holds it. */
async function aliasKata($: EngineInterface): Promise<void> {
  const names = (await $.command.list().catch(() => [])).map(c => c.name)
  if (names.includes('kata')) return
  const skill = names.find(n => n.endsWith(':kata'))
  if (!skill) return
  kataCommand = skill
  const ok = await $.command
    .register({ name: 'kata', description: 'Run a Kata mode or command (/kata modes, /kata <mode> [args], /kata run <command>)', argumentHint: 'MODE [args] | run COMMAND | modes | commands | status | stop' })
    .then(() => true, () => false)
  kataAliased = ok
}

/** Runs `/kata <args>` after the current command has answered: a command hook cannot start another one. */
function runKata($: EngineInterface, name: string, args: string): void {
  $.clock.after(50, () => $.command.run({ command: name, args }).then(() => undefined, () => undefined))
}

// ----- registration ---------------------------------------------------------------------------

export const register: Register = (on, options) => {
  const notify = options.notify !== false
  const source = String(options.source ?? 'artifact')
  const artifactUrl = String(options.artifactUrl ?? '').trim()
  const useArtifact = source === 'artifact' && artifactUrl !== ''
  const syncUrl = useArtifact ? artifactUrl : ''

  on('session.start', async ($, e, next) => {
    const started = await next(e)
    await $.command.register({ name: 'kata-panel', description: 'Open the Kata pane: the run, its steps, issues and branch, and the library' })
    await $.command.register({ name: 'kata-refresh', description: 'Pull the Kata library from its artifact now and re-register its slash commands' })
    await aliasKata($).catch(() => undefined)
    await refreshLibrary($).catch(() => undefined)
    await refresh($, notify).catch(() => undefined)
    await refreshBranch($).catch(() => undefined)
    if (useArtifact) {
      // The first pull waits for the session to settle; the clock below pulls again every ten minutes.
      lastArtifactPull = Date.now()
      $.clock.after(3000, () => syncFromArtifact($, syncUrl).then(() => undefined))
    }
    let ticks = 0
    $.clock.every(2000, async () => {
      ticks += 1
      await refresh($, notify).catch(() => undefined)
      await refreshLibrary($).catch(() => undefined)
      if (ticks % 5 === 0) await refreshBranch($).catch(() => undefined)
      const m = Math.floor(Date.now() / 60000)
      if ((await read($, minute)) !== m) await update($, minute, () => m)
      if (useArtifact && Date.now() - lastArtifactPull > ARTIFACT_EVERY_MS) {
        lastArtifactPull = Date.now()
        await syncFromArtifact($, syncUrl).catch(() => undefined)
      }
    })
    return started
  })

  on('command.run', { command: 'kata-panel' }, async $ => {
    await $.ui.open({ id: PANE, title: 'Kata' })
    const state = await read($, run)
    return { text: state ? `Kata pane opened: ${headline(state, await read($, branch))}` : 'Kata pane opened. No run in this project yet.' }
  })

  on('command.run', { command: 'kata-refresh' }, async $ => {
    if (!useArtifact) {
      cacheMtime = -1
      await refreshLibrary($)
      const info = await read($, library)
      return { text: `Kata library re-read from the ${info?.source ?? 'bundled'} copy: ${info?.modes.length ?? 0} modes, ${info?.commands.length ?? 0} commands. Set the artifact URL in /config to pull from a Kata Library page.` }
    }
    const outcome = await syncFromArtifact($, syncUrl)
    const info = await read($, library)
    const counts = `${info?.modes.length ?? 0} modes, ${info?.commands.length ?? 0} commands`
    if (outcome === 'pulled') return { text: `Kata library pulled from the artifact: ${counts}.` }
    if (outcome === 'unchanged') return { text: `Kata library is up to date with the artifact: ${counts}.` }
    return { text: `Kata could not pull the artifact here: ${outcome}. Run /kata commands, which reads it through Claude, or /kata-sync.` }
  })

  // /kata as a short name for a namespaced /kata:kata, and every library slash command.
  on('command.run', async ($, e, next) => {
    if (e.command === 'kata' && kataAliased) {
      runKata($, await kataName($), e.args.trim())
      return { text: '' }
    }
    if (!registered.has(e.command)) return next(e)
    const target = slashTargets.get(e.command)
    if (!target) return { text: `/${e.command} is no longer in the Kata library. Run /kata commands to see the current names.` }
    const rest = e.args.trim()
    const args = target.kind === 'mode' ? `${target.id}${rest ? ` ${rest}` : ''}` : `run ${target.id}${rest ? ` ${rest}` : ''}`
    const name = await kataName($)
    runKata($, name, args)
    return { text: `⛩ /${name} ${args}` }
  })

  // Guard: a git commit whose message carries a trailer is refused while a Kata run is active (or always).
  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const command = String((e as { command?: unknown }).command ?? '')
    const policy = String(options.blockTrailers ?? 'during-kata')
    const active = isActive(await read($, run))
    const guards = policy === 'always' || (policy === 'during-kata' && active)
    if (guards && COMMIT.test(command) && TRAILER.test(command)) {
      return {
        deny: 'kata: commit messages carry no trailers (Co-Authored-By, Generated with, Signed-off-by). Rewrite the commit message without them and run the commit again.',
      }
    }
    const ran = await next(e)
    await refresh($, notify).catch(() => undefined)
    if (/\bgit\b/.test(command)) await refreshBranch($).catch(() => undefined)
    return ran
  }).catch(($, e, next) => next(e))

  // Any other tool (the skill's Write of the state file) refreshes the mirror promptly.
  on('tool.call', async ($, e, next) => {
    const ran = await next(e)
    if (e.tool !== 'Bash') await refresh($, notify).catch(() => undefined)
    return ran
  })

  // The model learns the configured library and its slash commands without reading settings itself.
  on('prompt.compose', async ($, e, next) => {
    const result = await next(e)
    const info = await read($, library)
    const lines = [
      'Kata plugin configuration (set in /config under the kata plugin):',
      `- library source: ${source}`,
      `- artifact URL: ${artifactUrl || '(not set)'}`,
      `- run state file: <project root>/${STATE_FILE}`,
      'The /kata, /kata-sync, /kata-edit and /kata-setup skills read these values; do not ask the user for them when they are set.',
    ]
    if (source === 'artifact' && !artifactUrl) {
      lines.push('- warning: the library source is artifact but no artifact URL is set; Kata falls back to the local file, else the bundled (empty) library. Say so when you run /kata, and point to /kata-setup.')
    }
    if (info) {
      lines.push(`- library as the mod last read it (${info.source}): modes ${info.modes.map(m => m.id).join(', ') || 'none'}; commands ${info.commands.map(c => c.id).join(', ') || 'none'}`)
    }
    return { sections: [...result.sections, { id: 'kata:config', text: lines.join('\n'), scope: 'session' }] }
  })

  // ----- band above the prompt -----------------------------------------------------------------
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const state = await read($, run)
    const hidden = await read($, isBandHidden)
    if (options.showBand === false || e.props.hasSurvey || !isActive(state) || hidden) return next(e)
    const br = await read($, branch)
    await read($, minute)
    const { Box, Text, Button } = $.ui.resolve(e)
    const total = state.steps.length
    const step = state.steps[state.current]
    const p = stepProgress(state, step)
    const issues = issueCounts(state.issues)
    const found = severitySummary(state.issues)
    // Newer engines tell the band it is collapsed; older ones do not carry the prop.
    const isCollapsed = (e.props as { isCollapsed?: boolean }).isCollapsed === true
    const twoRows = e.props.maxRows >= 2 && !isCollapsed
    return (
      <Box flexDirection="column">
        <Box gap={1}>
          <Text color="claude" bold>⛩ kata</Text>
          <Text bold>{state.mode}</Text>
          {br && <Text color="suggestion">⎇ {br}</Text>}
          <Text dimColor>│</Text>
          <Text dimColor>{Math.min(state.current + 1, total)}/{total}</Text>
          <Text bold wrap="truncate-end">{step?.title ?? ''}</Text>
          {p && <Text color={p.done >= p.total ? 'success' : 'warning'}>{bar(p.done, p.total, 8)} {p.done}/{p.total}{p.label ? ` ${p.label}` : ''}</Text>}
          {!p && step?.activity && <Text dimColor wrap="truncate-end">{step.activity}</Text>}
          {state.status === 'paused' && <Text color="warning" bold>⏸ waiting for you</Text>}
          <Text dimColor>{duration(state.startedAt)}</Text>
          <Button key="hide" plain dimColor label="hide" onPress={() => update($, isBandHidden, () => true)} />
        </Box>
        {twoRows && (
          <Box gap={1}>
            {state.steps.map((s, i) => (
              <Text color={COLOR[s.status]} bold={i === state.current} dimColor={s.status === 'pending' && i !== state.current}>
                {GLYPH[s.status]} {s.command}
              </Text>
            ))}
            {issues.total > 0 && (
              <Text color={issues.open ? 'warning' : 'success'}>
                ◆ {found ?? `${issues.total} found · ${issues.fixed} fixed${issues.open ? ` · ${issues.open} open` : ''}`}
              </Text>
            )}
            {state.verdict && <Text color={VERDICT_COLOR[state.verdict]} bold>verdict: {state.verdict}</Text>}
          </Box>
        )}
      </Box>
    )
  })

  // ----- pane --------------------------------------------------------------------------------
  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const state = await read($, run)
    const info = await read($, library)
    const br = await read($, branch)
    const hidden = await read($, isBandHidden)
    await read($, minute)
    const width = Math.max(24, e.props.bodyColumns ?? 60)
    const rule = '─'.repeat(Math.min(width, 60))

    const librarySection = info && (
      <Box flexDirection="column">
        <Text bold>Library</Text>
        <Text dimColor>
          {info.source === 'artifact' ? 'Kata Library artifact' : info.source === 'cache' ? 'local copy' : 'no library yet'}
          {info.syncedAt ? ` · synced ${hhmm(info.syncedAt)}` : ''} · {info.modes.length} modes · {info.commands.length} commands
        </Text>
        {info.modes.length + info.commands.length === 0 && (
          <Box flexDirection="column">
            <Text>Your library is empty. Three ways to start:</Text>
            <Text dimColor>  /kata-setup              a Kata Library page to edit on claude.ai</Text>
            <Text dimColor>  /kata examples           the steps library: example commands to copy</Text>
            <Text dimColor>  /kata-edit new command   write one from the terminal</Text>
          </Box>
        )}
        {info.modes.map(m => (
          <Text>
            <Text color="claude">{m.slash ? `/${m.slash}` : `/kata ${m.id}`}</Text>
            <Text dimColor> {cut(m.name, width - 24)} · {m.steps} steps</Text>
          </Text>
        ))}
        {info.commands.map(c => (
          <Text>
            <Text color="suggestion">{c.slash ? `/${c.slash}` : `/kata run ${c.id}`}</Text>
            <Text dimColor> {cut(c.title, width - 24)}</Text>
          </Text>
        ))}
      </Box>
    )

    if (!state) {
      return (
        <Box flexDirection="column" gap={1}>
          <Box flexDirection="column">
            <Text color="claude" bold>⛩ Kata</Text>
            <Text dimColor>No run in this project{br ? ` · ⎇ ${br}` : ''}.</Text>
            <Text dimColor>Start one with /kata MODE [args], or one step with its slash command.</Text>
          </Box>
          {librarySection}
          <Box gap={1}>
            <Button key="refresh" label="Refresh library" onPress={() => runKata($, 'kata-refresh', '')} />
          </Box>
        </Box>
      )
    }

    const issues = state.issues ?? []
    const counts = issueCounts(issues)
    const found = severitySummary(issues)
    const statusColor = state.status === 'done' ? 'success' : state.status === 'failed' ? 'error' : state.status === 'paused' ? 'warning' : state.status === 'stopped' ? 'inactive' : 'claude'
    return (
      <Box flexDirection="column" gap={1}>
        <Box flexDirection="column">
          <Box gap={1}>
            <Text color="claude" bold>⛩</Text>
            <Text bold>{state.modeName || state.mode}</Text>
            <Text color={statusColor} bold>{state.status === 'paused' ? '⏸ waiting for you' : state.status}</Text>
          </Box>
          <Text dimColor>
            {br ? `⎇ ${br} · ` : ''}started {hhmm(state.startedAt)} · {duration(state.startedAt, isActive(state) ? undefined : state.updatedAt)}
          </Text>
          {state.args !== '' && <Text dimColor>args: {cut(state.args, width - 8)}</Text>}
          {state.scope && <Text>scope: {cut(state.scope, width * 2 - 8)}</Text>}
          {state.verdict && <Text color={VERDICT_COLOR[state.verdict]} bold>verdict: {state.verdict}</Text>}
        </Box>
        <Text dimColor>{rule}</Text>
        <Box flexDirection="column">
          {state.steps.map((s, i) => {
            const current = i === state.current && isActive(state)
            const p = s.progress && s.progress.total > 0 ? s.progress : undefined
            return (
              <Box flexDirection="column">
                <Box gap={1}>
                  <Text color={COLOR[s.status]} bold={current}>{GLYPH[s.status]}</Text>
                  <Text dimColor>{String(i + 1).padStart(2, ' ')}</Text>
                  <Text bold={current} dimColor={s.status === 'pending' && !current} wrap="truncate-end">{cut(s.title, width - 18)}</Text>
                  {s.startedAt && <Text dimColor>{duration(s.startedAt, s.status === 'running' ? undefined : s.finishedAt)}</Text>}
                </Box>
                {p && (
                  <Text color={p.done >= p.total ? 'success' : 'warning'}>
                    {'      '}{bar(p.done, p.total, 14)} {p.done}/{p.total}{p.label ? ` ${p.label}` : ''}
                  </Text>
                )}
                {current && s.activity && <Text dimColor wrap="truncate-end">{'      '}{cut(s.activity, width - 8)}</Text>}
                {s.note && <Text dimColor wrap="truncate-end">{'      '}{cut(s.note, width - 8)}</Text>}
              </Box>
            )
          })}
        </Box>
        {counts.total > 0 && (
          <Box flexDirection="column">
            <Text dimColor>{rule}</Text>
            <Box gap={1}>
              <Text bold>Issues</Text>
              {found
                ? <Text color="warning">{found}</Text>
                : <Text color={counts.open ? 'warning' : 'success'}>
                    {bar(counts.fixed, counts.total, 12)} {counts.fixed}/{counts.total} fixed{counts.skipped ? ` · ${counts.skipped} skipped` : ''}
                  </Text>}
            </Box>
            {issues.map(issue => {
              const where = issue.file ? `${issue.file}${issue.line ? `:${issue.line}` : ''}` : ''
              const mark = issue.status === 'fixed' ? '✓' : issue.status === 'skipped' ? '–' : '○'
              return (
                <Text dimColor={issue.status !== 'open'} wrap="truncate-end">
                  <Text color={issue.status === 'fixed' ? 'success' : issue.status === 'skipped' ? 'inactive' : 'warning'}>{mark}</Text>
                  {' '}
                  <Text color={issue.severity ? SEVERITY_COLOR[issue.severity] : 'inactive'}>{issue.severity ?? '·'}</Text>
                  {' '}
                  {cut(issue.title, width - 12 - where.length)}
                  {where ? <Text color="suggestion"> {where}</Text> : ''}
                </Text>
              )
            })}
          </Box>
        )}
        {state.lastCommand && (
          <Text dimColor>
            last: {state.lastCommand.command} {GLYPH[state.lastCommand.status]} at {hhmm(state.lastCommand.finishedAt)}
          </Text>
        )}
        <Box gap={1}>
          {isActive(state) && (
            <Button key="stop" label="Stop run" onPress={() => void kataName($).then(name => runKata($, name, 'stop'))} />
          )}
          {hidden ? (
            <Button key="unhide" label="Show band" onPress={() => update($, isBandHidden, () => false)} />
          ) : (
            <Button key="hideband" label="Hide band" onPress={() => update($, isBandHidden, () => true)} />
          )}
          <Button key="refresh" label="Refresh library" onPress={() => runKata($, 'kata-refresh', '')} />
        </Box>
        {librarySection}
      </Box>
    )
  })
}
