// Renders Kata's README and website media from the current code, into docs/media:
//   terminal-0N-<moment>.png, terminal-run.gif/.webm   a terminal with the band and pane, at five moments of a run
//   library-0N-<view>.png, library-tour.gif            the Kata Library page, five views
// Every still is the same 1440×810 frame at 2x, so the README and the website can show them full width, side by side.
// Pages are laid out at 1/ZOOM that size and shrunk to fit, so a whole page and the whole pane fit in the frame.
// The band and pane come from the mod itself: hooks/media.test.tsx mounts them for each moment of a pull-request
// run and prints what the mod drew; this script lays those trees out in a terminal window and screenshots it.
// The page is the real artifact/kata-library.html with an in-memory store holding the steps library.
// Run with `mise run media` after a visible change to the mod or the page.
import { spawnSync } from 'node:child_process'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

import { decodePng, encodeGif } from './codec.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const OUT = join(ROOT, 'docs', 'media')
// The frame is 1440×810; pages are laid out at W×H CSS pixels and drawn at ZOOM, like a browser zoomed to 60%.
const ZOOM = 0.6
const W = Math.round(1440 / ZOOM), H = Math.round(810 / ZOOM)

// ----- 1. What the mod draws ----------------------------------------------------------------------

// The mod prints clock times from the real time; shift every HH:MM so the moment a frame was drawn reads 10:30,
// and the media only change when something visible does.
const PINNED = 10 * 60 + 30
function pinClock(frame) {
  const shift = (t) => t.replace(/\b([01]\d|2[0-3]):([0-5]\d)\b/g, (_, h, m) => {
    const v = (((Number(h) * 60 + Number(m) - frame.clock + PINNED) % 1440) + 1440) % 1440
    return `${String(Math.floor(v / 60)).padStart(2, '0')}:${String(v % 60).padStart(2, '0')}`
  })
  const walk = (n) => typeof n === 'string' ? shift(n) : Array.isArray(n) ? n.map(walk) : n && typeof n === 'object' ? { ...n, children: walk(n.children ?? []) } : n
  return { ...frame, band: walk(frame.band), pane: walk(frame.pane), status: frame.status && shift(frame.status) }
}

function captureFrames() {
  // The test runner writes to stderr; read both streams.
  const run = spawnSync('claude', ['plugin', 'test', ROOT], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  const out = `${run.stdout ?? ''}\n${run.stderr ?? ''}`
  if (run.status !== 0) throw new Error(`claude plugin test failed:\n${out.split('\n').filter((l) => !l.includes('KATA-MEDIA')).join('\n')}`)
  const frames = new Map()
  for (const line of out.split('\n')) {
    const at = line.indexOf('KATA-MEDIA ')
    if (at >= 0) { const f = pinClock(JSON.parse(line.slice(at + 11))); frames.set(f.name, f) }
  }
  if (!frames.size) throw new Error('no KATA-MEDIA frames: is hooks/media.test.tsx in place?')
  return frames
}

// ----- 2. A terminal that draws those trees ---------------------------------------------------------

const THEME = {
  text: '#e8e8e8', inactive: '#8c8c8c', subtle: '#5c5c5c', claude: '#d77757', success: '#4eba65', error: '#ff6b80',
  warning: '#ffc107', suggestion: '#b1b9f9', permission: '#b1b9f9', remember: '#b1b9f9',
}
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
const color = (c) => THEME[c] ?? c ?? null

function textStyle(p = {}) {
  const css = []
  const c = color(p.color)
  if (c) css.push(`color:${c}`)
  else if (p.dimColor) css.push(`color:${THEME.inactive}`)
  if (p.bold || p.weight === 'bold' || p.weight === 'semibold') css.push('font-weight:700')
  if (p.italic) css.push('font-style:italic')
  if (p.underline) css.push('text-decoration:underline')
  if (p.strikethrough) css.push('text-decoration:line-through')
  if (p.backgroundColor) css.push(`background:${color(p.backgroundColor)}`)
  if (p.wrap && String(p.wrap).startsWith('truncate')) css.push('overflow:hidden;text-overflow:ellipsis;min-width:0')
  return css.join(';')
}

function render(node) {
  if (node === null || node === undefined || node === false) return ''
  if (typeof node === 'string' || typeof node === 'number') return esc(node)
  if (Array.isArray(node)) return node.map(render).join('')
  const p = node.props ?? {}, kids = render(node.children ?? [])
  if (node.type === 'Text') return `<span class="t" style="${textStyle(p)}">${kids}</span>`
  if (node.type === 'Button') return `<span class="btn${p.plain ? ' plain' : ''}">${esc(p.label ?? '')}</span>`
  if (node.type === 'Box') {
    const col = p.flexDirection === 'column'
    const gap = p.gap ? (col ? `gap:calc(${p.gap} * var(--lh))` : `column-gap:${p.gap}ch`) : ''
    return `<div class="box ${col ? 'col' : 'row'}" style="${gap}">${kids}</div>`
  }
  return kids
}

const TRANSCRIPT = {
  read: ['⏺ Kata ▸ pr · step 1/8 · Read the plan', '  Reading CLAUDE.md, the plan and the open tasks before any code.'],
  implement: ['⏺ Scope: add farewell(name) next to greet, with a test. 4 acceptance criteria.', '', '⏺ Kata ▸ pr · step 2/8 · Implement the scope', '  Update(src/greet.js)', '  Update(test/greet.test.js)'],
  review: ['⏺ farewell() added next to greet, with a test.', '', '⏺ Kata ▸ pr · step 3/8 · Full self-review', '  Bash(git diff main)', '  Read(src/greet.js) · Read(test/greet.test.js) · Read(README.md)'],
  'fix-0': ['⏺ Review found 4 issues:', '  1. high    farewell() has no test for an empty name   test/greet.test.js:9', '  2. medium  greet and farewell repeat the trim logic   src/greet.js:14', '  3. low     README does not mention farewell()         README.md', '  4. low     JSDoc missing on farewell()                src/greet.js:11', '', '⏺ Kata ▸ pr · step 4/8 · Fix every issue'],
  'fix-2': ['⏺ Kata ▸ pr · step 4/8 · Fix every issue', '  ✓ #1 test for an empty name', '  ✓ #2 shared trim() helper', '  Update(README.md)'],
  'fix-4': ['  ✓ #3 README section for farewell()', '  ✓ #4 JSDoc on farewell()', '', '⏺ All 4 issues are fixed. The next step runs the checks.', '  Continue to verify?'],
  verify: ['❯ yes', '', '⏺ Kata ▸ pr · step 5/8 · Lint, tests, architecture check', '  Bash(npm run lint) ✓', '  Bash(npm test) …'],
  pr: ['⏺ Kata ▸ pr · step 6/8 · Commit without trailers', '  feat(greet): add farewell(name)', '', '⏺ Kata ▸ pr · step 7/8 · Acceptance criteria and TODOs', '  4 of 4 criteria met.', '', '⏺ Kata ▸ pr · step 8/8 · Open the pull request'],
  done: ['⏺ Kata ▸ pr · step 8/8 · Open the pull request', '  gh pr create', '', '⏺ Opened PR #12: feat(greet): add farewell(name).', '  All 8 steps done.'],
}

function terminalPage(frame) {
  const lines = (TRANSCRIPT[frame.name] ?? []).map((l) => {
    const cls = l.startsWith('⏺') ? 'say' : l.startsWith('❯') ? 'you' : l.trim().startsWith('✓') ? 'ok' : 'dim'
    return `<div class="line ${cls}">${esc(l) || '&nbsp;'}</div>`
  }).join('')
  const band = frame.band && frame.band.type === 'Box' ? `<div class="band" id="band">${render(frame.band)}</div>` : ''
  const status = frame.status ? `<div class="status"><span style="color:${THEME.warning}">kata: ${esc(frame.status)}</span></div>` : '<div class="status">&nbsp;</div>'
  return `<!doctype html><html><head><meta charset="utf-8"><style>
:root { --lh: 1.42em; }
* { box-sizing: border-box; }
body { margin: 0; background: #111214; font: 13px/1.42 "SF Mono", Menlo, Monaco, monospace; color: ${THEME.text}; }
.window { width: ${W}px; margin: 0; border-radius: 10px; overflow: hidden; background: #1c1c1e; border: 1px solid #333; }
.titlebar { height: 30px; background: #2a2a2c; display: flex; align-items: center; padding: 0 12px; gap: 8px; color: #9a9a9a; font: 12px -apple-system, "Segoe UI", sans-serif; }
.dot { width: 12px; height: 12px; border-radius: 50%; } .titlebar .title { flex: 1; text-align: center; margin-right: 52px; }
.body { display: flex; height: ${H - 32}px; }
.main { flex: 1; min-width: 0; display: flex; flex-direction: column; padding: 10px 14px 8px; }
.transcript { flex: 1; display: flex; flex-direction: column; justify-content: flex-end; overflow: hidden; white-space: pre; }
.line.say { color: ${THEME.text}; } .line.you { color: ${THEME.inactive}; } .line.ok { color: ${THEME.success}; } .line.dim { color: ${THEME.inactive}; }
.band { margin-top: 10px; white-space: pre; }
.rule { border-top: 1px solid #3a3a3a; margin: 6px 0; }
.prompt { color: ${THEME.text}; } .cursor { display: inline-block; width: 0.6em; height: 1.1em; background: #d0d0d0; vertical-align: text-bottom; }
.status { white-space: pre; margin-top: 2px; }
.pane { width: 640px; border-left: 1px solid #3a3a3a; background: #232325; padding: 10px 14px; white-space: pre; overflow: hidden; }
.pane .head { display: flex; justify-content: space-between; color: ${THEME.inactive}; margin-bottom: 8px; }
.box { display: flex; min-width: 0; } .box.row { flex-direction: row; align-items: baseline; flex-wrap: nowrap; } .box.col { flex-direction: column; }
.t { white-space: pre; }
.pane .t { white-space: pre-wrap; overflow-wrap: anywhere; }
.btn { color: ${THEME.text}; border: 1px solid #555; border-radius: 3px; padding: 0 0.5ch; margin-right: 1ch; } .btn.plain { border: 0; padding: 0; color: ${THEME.inactive}; }
</style></head><body><div class="window">
<div class="titlebar"><span class="dot" style="background:#ff5f57"></span><span class="dot" style="background:#febc2e"></span><span class="dot" style="background:#28c840"></span><span class="title">my-app — claude — 230×66</span></div>
<div class="body"><div class="main">
  <div class="transcript"><div class="line you">❯ /kata pr add a farewell function with a test</div><div class="line">&nbsp;</div>${lines}</div>
  ${band}
  <div class="rule"></div><div class="prompt">❯ <span class="cursor"></span></div><div class="rule"></div>
  ${status}
</div>
<div class="pane" id="pane"><div class="head"><span>Kata</span><span>×</span></div>${render(frame.pane)}</div>
</div></div></body></html>`
}

// ----- 3. The Kata Library page with an in-memory store ---------------------------------------------

function libraryPage() {
  const fragment = readFileSync(join(ROOT, 'artifact', 'kata-library.html'), 'utf8')
  const lib = JSON.parse(readFileSync(join(ROOT, 'library', 'examples.json'), 'utf8'))
  const seed = { commands: lib.commands, modes: lib.modes }
  const stub = `<script>
(() => {
  const store = ${JSON.stringify(seed)};
  const subs = [];
  const snap = (c) => ({ docs: Object.entries(store[c] || {}).map(([id, d]) => ({ id, exists: true, data: () => d })), metadata: { fromCache: false } });
  const notify = () => subs.forEach(([c, cb]) => cb(snap(c)));
  const db = {
    collection: (c) => ({ onSnapshot: (cb) => { subs.push([c, cb]); setTimeout(() => cb(snap(c)), 0); return () => {}; } }),
    doc: (path) => { const [c, id] = path.split('/'); return {
      set: async (d) => { (store[c] ||= {})[id] = d; notify(); },
      update: async (d) => { store[c][id] = { ...store[c][id], ...d }; notify(); },
      delete: async () => { delete store[c][id]; notify(); } }; },
  };
  window.claude = { use: async (name) => name === 'db' ? db : name === 'user' ? { canEdit: async () => true, isOwner: async () => true } : null };
})();
</script>`
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body>${stub}${fragment}</body></html>`
}

// The terminal stills: file, and the moment of the run (a frame of hooks/media.test.tsx).
const TERMINAL_STILLS = [
  ['terminal-01-plan.png', 'read'],
  ['terminal-02-review.png', 'review'],
  ['terminal-03-fix.png', 'fix-2'],
  ['terminal-04-checks.png', 'verify'],
  ['terminal-05-done.png', 'done'],
]

// ----- 4. Shoot -------------------------------------------------------------------------------------

async function shoot() {
  const frames = captureFrames()
  // The WebM differs on every recording; keep the old one when the run it shows (the GIF) has not changed.
  const before = (name) => { try { return readFileSync(join(OUT, name)) } catch { return null } }
  const oldGif = before('terminal-run.gif'), oldWebm = before('terminal-run.webm')
  rmSync(OUT, { recursive: true, force: true })
  mkdirSync(OUT, { recursive: true })
  const browser = await chromium.launch()
  const written = []
  const save = (name, buf) => { writeFileSync(join(OUT, name), buf); written.push(name) }

  // Terminal: stills at 2x, the run as a GIF at 1x.
  const sharp = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 2 * ZOOM })
  for (const [file, name] of TERMINAL_STILLS) {
    await sharp.setContent(terminalPage(frames.get(name)))
    save(file, await sharp.locator('.window').screenshot())
  }
  await sharp.close()

  const flat = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: ZOOM })
  const order = ['read', 'implement', 'review', 'fix-0', 'fix-2', 'fix-4', 'verify', 'pr', 'done']
  const gifFrames = []
  for (const name of order) {
    if (!frames.has(name)) continue
    await flat.setContent(terminalPage(frames.get(name)))
    const png = decodePng(await flat.locator('.window').screenshot())
    gifFrames.push({ ...png, delayMs: name === 'done' ? 3500 : name.startsWith('fix') ? 1600 : 1800 })
  }
  const gif = encodeGif(gifFrames)
  save('terminal-run.gif', gif)
  const sameRun = oldGif && oldWebm && oldGif.equals(gif)
  await flat.close()

  // The same run as a video for the website; Playwright records the page as WebM.
  if (sameRun) save('terminal-run.webm', oldWebm)
  else {
    const tmp = join(ROOT, '.media-tmp')
    rmSync(tmp, { recursive: true, force: true })
    const ctx = await browser.newContext({ viewport: { width: W, height: H }, recordVideo: { dir: tmp, size: { width: 1440, height: 810 } } })
    const rec = await ctx.newPage()
    for (const [i, f] of gifFrames.entries()) {
      await rec.setContent(terminalPage(frames.get(order.filter((n) => frames.has(n))[i])))
      await rec.waitForTimeout(f.delayMs)
    }
    const video = rec.video()
    await ctx.close()
    save('terminal-run.webm', readFileSync(await video.path()))
    rmSync(tmp, { recursive: true, force: true })
  }

  // The Kata Library page: stills at 2x, a tour as a GIF at 1x.
  const views = [
    ['library-01-mode.png', '[data-kind="mode"][data-id="pr"]'],
    ['library-02-command.png', '[data-kind="command"][data-id="review"]'],
    ['library-03-edit.png', '[data-act="edit"]'],
    ['library-04-steps.png', '#btn-examples'],
    ['library-05-about.png', '#btn-about'],
  ]
  for (const [scale, gif] of [[2, false], [1, true]]) {
    const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: scale * ZOOM, colorScheme: 'dark' })
    await page.setContent(libraryPage(), { waitUntil: 'networkidle' })
    await page.waitForSelector('[data-kind="mode"][data-id="pr"]')
    const tour = []
    for (const [file, selector] of views) {
      if (file === 'library-04-steps.png') await page.click('[data-act="cancel"]').catch(() => {})
      await page.click(selector)
      await page.mouse.move(W - 170, H - 60)
      await page.waitForTimeout(250)
      const shot = await page.screenshot()
      if (gif) tour.push({ ...decodePng(shot), delayMs: 2200 })
      else save(file, shot)
    }
    if (gif) save('library-tour.gif', encodeGif(tour))
    await page.close()
  }
  await browser.close()

  const sizes = written.map((f) => `${f} ${(readFileSync(join(OUT, f)).length / 1024).toFixed(0)} KiB`)
  writeFileSync(join(OUT, 'README.md'), `# Media\n\nGenerated by \`mise run media\` (tools/media/build.mjs) from the current mod and Kata Library page. Do not edit by hand; run the task again after a visible change.\n`)
  console.log(`docs/media:\n  ${sizes.join('\n  ')}`)
}

await shoot()
