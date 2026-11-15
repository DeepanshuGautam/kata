// Embeds library/examples.json (the steps library) into artifact/kata-library.html between its markers,
// so the published page can offer the examples without reading the repository.
// Usage: node scripts/embed-examples.mjs          rewrite the page
//        node scripts/embed-examples.mjs --check  exit 1 when the page is out of date
import { readFileSync, writeFileSync } from 'node:fs'

const root = new URL('..', import.meta.url)
const page = new URL('artifact/kata-library.html', root)
const examples = JSON.parse(readFileSync(new URL('library/examples.json', root), 'utf8'))
const html = readFileSync(page, 'utf8')
const begin = '/*EXAMPLES:BEGIN*/'
const end = '/*EXAMPLES:END*/'
const i = html.indexOf(begin)
const j = html.indexOf(end)
if (i < 0 || j < i) {
  console.error('kata-library.html has no EXAMPLES markers')
  process.exit(1)
}
// JSON is valid JavaScript; escape "<" so no "</script>" can close the block.
const body = JSON.stringify({ commands: examples.commands, modes: examples.modes }).replace(/</g, '\\u003c')
const next = `${html.slice(0, i + begin.length)}${body}${html.slice(j)}`
if (process.argv.includes('--check')) {
  if (next !== html) {
    console.error('artifact/kata-library.html is out of date: run node scripts/embed-examples.mjs')
    process.exit(1)
  }
  console.log('steps library embedded and current')
} else {
  writeFileSync(page, next)
  console.log(`embedded ${Object.keys(examples.commands).length} commands and ${Object.keys(examples.modes).length} modes`)
}
