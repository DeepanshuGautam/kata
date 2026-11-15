import { expect, test } from 'claude-code/testing'

import { CACHE, PR_LIBRARY, engine, library, newSeen, newWorld, setFile, start, typed } from './engine.testkit'
import type { Command, Mode } from './engine.testkit'

const REVIEW: Command = { title: 'Full self-review', slash: 'kata-review', gate: 'continue', instruction: 'Review.' }
const DOCS: Command = { title: 'Write the docs', slash: 'docs', gate: 'confirm', instruction: 'Write them.' }
const SHIP: Mode = { name: 'Ship it', slash: 'ship', steps: ['review', 'docs'] }
const URL = 'https://claude.ai/artifact/abc'

test('every command and mode with a slash name becomes a slash command', async ($, on) => {
  const world = newWorld()
  setFile(world, CACHE, library({ review: REVIEW, docs: DOCS }, { ship: SHIP, plain: { name: 'Plain', steps: ['review'] } }))
  const seen = newSeen()
  engine(on, world, seen)
  await start($)

  expect(seen.registered).toEqual(expect.arrayContaining(['kata-panel', 'kata-refresh', 'kata-review', 'docs', 'ship']))
  expect(seen.registered).not.toContain('plain')
})

test('a step command runs /kata run with its arguments, a mode command runs /kata with the mode', async ($, on) => {
  const world = newWorld()
  setFile(world, CACHE, library({ review: REVIEW, docs: DOCS }, { ship: SHIP }))
  const seen = newSeen()
  const clock = engine(on, world, seen)
  await start($)

  const step = await $.command.run(typed('kata-review', '  the logging package '))
  await $.command.run(typed('ship', 'v2'))
  await clock.advance(100)

  expect(step.text).toBe('⛩ /kata run review the logging package')
  expect(seen.kataRuns).toEqual(['run review the logging package', 'ship v2'])
})

test('a namespaced /kata:kata gets /kata as a short name, and step commands run through it', async ($, on) => {
  const world = newWorld({ kataName: 'kata:kata', hasPlainKata: false })
  setFile(world, CACHE, library({ review: REVIEW }))
  const seen = newSeen()
  const clock = engine(on, world, seen)
  await start($)

  expect(seen.registered).toContain('kata')
  await $.command.run(typed('kata', 'pr toy change'))
  await $.command.run(typed('kata-review'))
  await clock.advance(100)
  expect(seen.kataRuns).toEqual(['pr toy change', 'run review'])
})

test('a renamed slash name is registered within one tick, and the old one says it is gone', async ($, on) => {
  const world = newWorld()
  setFile(world, CACHE, library({ review: REVIEW }))
  const seen = newSeen()
  const clock = engine(on, world, seen)
  await start($)

  setFile(world, CACHE, library({ review: { ...REVIEW, slash: 'self-review' } }))
  await clock.advance(2000)
  expect(seen.registered).toContain('self-review')

  await $.command.run(typed('self-review', 'x'))
  await clock.advance(100)
  expect(seen.kataRuns).toEqual(['run review x'])
  expect((await $.command.run(typed('kata-review'))).text).toMatch(/no longer in the Kata library/)
})

test('a command or mode added to the library shows up without a reload', async ($, on) => {
  const world = newWorld()
  setFile(world, CACHE, library({ review: REVIEW }))
  const seen = newSeen()
  const clock = engine(on, world, seen)
  await start($)
  expect(seen.registered).not.toContain('docs')

  setFile(world, CACHE, library({ review: REVIEW, docs: DOCS }, { ship: SHIP }))
  await clock.advance(2000)
  expect(seen.registered).toEqual(expect.arrayContaining(['docs', 'ship']))
})

test('reserved and malformed slash names are not registered', async ($, on) => {
  const world = newWorld()
  const bad = (slash: string | undefined): Command => ({ ...REVIEW, slash })
  setFile(world, CACHE, library({ a: bad('kata'), b: bad('kata-panel'), c: bad('Bad Name'), d: bad(undefined), e: bad('kata-setup') }))
  const seen = newSeen()
  engine(on, world, seen)
  await start($)
  expect(seen.registered.filter(n => !['kata-panel', 'kata-refresh'].includes(n))).toEqual([])
})

test('KATA_HOME moves the local library copy', async ($, on) => {
  const world = newWorld()
  setFile(world, '/elsewhere/kata/library.json', library({ review: REVIEW }))
  const seen = newSeen()
  engine(on, world, seen, { KATA_HOME: '/elsewhere/kata/' })
  await start($)
  expect(seen.registered).toContain('kata-review')
})

test('a fresh install has an empty library: only Kata\'s own commands are registered', async ($, on) => {
  const seen = newSeen()
  engine(on, newWorld(), seen)
  await start($)
  expect(seen.registered).toEqual(['kata-panel', 'kata-refresh'])
})

test('the example pr workflow, once in the library, registers its eight step commands', async ($, on) => {
  const world = newWorld()
  setFile(world, CACHE, PR_LIBRARY)
  const seen = newSeen()
  engine(on, world, seen)
  await start($)
  expect(seen.registered).toEqual(expect.arrayContaining(['kata-read', 'kata-implement', 'kata-review', 'kata-fix', 'kata-verify', 'kata-commit', 'kata-acceptance', 'kata-pr']))
})

test('with the artifact configured and readable, the mod pulls it into the cache and registers its commands', { options: { source: 'artifact', artifactUrl: URL } }, async ($, on) => {
  const world = newWorld({
    artifact: { decision: 'allow', commands: { docs: { ...DOCS, updatedAt: '2026-11-15T00:00:00Z' } }, modes: { ship: { name: 'Ship it', slash: 'ship', steps: ['docs'] } } },
  })
  const seen = newSeen()
  const clock = engine(on, world, seen)
  await start($)
  await clock.advance(3000)
  await clock.advance(2000)

  expect(seen.artifactCalls).toBe(2)
  const written = seen.writes.find(w => w.path === CACHE)
  expect(written).toBeDefined()
  expect(JSON.parse(written?.text ?? '{}')).toEqual({ version: 1, commands: { docs: DOCS }, modes: { ship: { name: 'Ship it', slash: 'ship', steps: ['docs'] } } })
  expect(seen.registered).toEqual(expect.arrayContaining(['docs', 'ship']))
})

test('the mod never asks for permission to read the artifact', { options: { source: 'artifact', artifactUrl: URL } }, async ($, on) => {
  const world = newWorld({ artifact: { decision: 'ask', commands: { docs: DOCS }, modes: {} } })
  const seen = newSeen()
  const clock = engine(on, world, seen)
  await start($)
  await clock.advance(3000)

  expect(seen.artifactCalls).toBe(0)
  const result = await $.command.run(typed('kata-refresh'))
  expect(result.text).toMatch(/could not pull the artifact here: reading the artifact would ask for permission/)
})

test('/kata-refresh pulls the artifact on demand and reports the counts', { options: { source: 'artifact', artifactUrl: URL } }, async ($, on) => {
  const world = newWorld({ artifact: { decision: 'allow', commands: { docs: DOCS }, modes: { ship: SHIP } } })
  engine(on, world, newSeen())
  await start($)

  const first = await $.command.run(typed('kata-refresh'))
  expect(first.text).toBe('Kata library pulled from the artifact: 1 modes, 1 commands.')
  const second = await $.command.run(typed('kata-refresh'))
  expect(second.text).toBe('Kata library is up to date with the artifact: 1 modes, 1 commands.')
})
