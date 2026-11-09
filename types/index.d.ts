export type KataStepStatus = 'pending' | 'running' | 'done' | 'skipped' | 'failed'

export type KataStep = {
  command: string
  title: string
  status: KataStepStatus
  startedAt?: string
  finishedAt?: string
  note?: string
}

export type KataLastCommand = { command: string; title: string; finishedAt: string; status: KataStepStatus }

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
}

declare module 'claude-code' {
  interface PluginState {
    kata: { run: KataState | null; isBandHidden: boolean }
  }
}
