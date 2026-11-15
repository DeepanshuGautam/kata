export type KataStepStatus = 'pending' | 'running' | 'done' | 'skipped' | 'failed'

/** Countable work inside one step, such as issues fixed: drawn as `5/10 fixed` with a bar. */
export type KataProgress = { done: number; total: number; label?: string }

/** One finding a step recorded (a review issue, a failing test, a TODO) and what became of it. */
export type KataIssue = {
  id: string
  title: string
  file?: string
  line?: number
  severity?: 'high' | 'medium' | 'low'
  status: 'open' | 'fixed' | 'skipped'
  /** The command id of the step that found it. */
  step?: string
}

export type KataStep = {
  command: string
  title: string
  status: KataStepStatus
  startedAt?: string
  finishedAt?: string
  /** One line on how the step ended. */
  note?: string
  /** One line on what the running step is doing now. */
  activity?: string
  progress?: KataProgress
}

export type KataLastCommand = { command: string; title: string; finishedAt: string; status: KataStepStatus }

/** The run state file, `<project>/.claude/kata/state.json`: written by the /kata skill, read by the mod. */
export type KataState = {
  version: 1
  mode: string
  modeName: string
  args: string
  status: 'running' | 'paused' | 'done' | 'stopped' | 'failed'
  startedAt: string
  updatedAt: string
  current: number
  steps: KataStep[]
  lastCommand?: KataLastCommand
  scope?: string
  issues?: KataIssue[]
}

/** What the mod knows of the library: where it came from and what it offers as slash commands. */
export type KataLibraryInfo = {
  source: 'artifact' | 'cache' | 'bundled'
  syncedAt?: string
  modes: { id: string; name: string; steps: number; slash?: string }[]
  commands: { id: string; title: string; gate: string; slash?: string }[]
}

declare module 'claude-code' {
  interface PluginState {
    kata: {
      run: KataState | null
      isBandHidden: boolean
      library: KataLibraryInfo | null
      branch: string | null
      /** Minutes since the epoch, advanced by the mod's clock so elapsed times redraw. */
      minute: number
    }
  }
}
