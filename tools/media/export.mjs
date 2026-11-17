// Copies Kata's media into the gautam-systems folder on Google Drive (synced by Google Drive for desktop), as
//   gautam-systems/kata/<version>_<date>/readme/{images,animations}   docs/media: the stills and GIFs the README shows
//   gautam-systems/kata/<version>_<date>/website/{images,videos}      what the website serves (img/apps/kata/)
// with a README.md, and files named kata_<version>_<area>_<what>.<ext>. A folder for the same version and date is
// replaced. Run `mise run media` first, and `mise run kata:media` in the website repository for its copies.
//   KATA_DRIVE_DIR  the destination folder (default: My Drive/gautam-systems/kata under ~/Library/CloudStorage)
//   WEB_DIR         the website checkout (default: ../deepanshugautam-web); skipped when missing
import { spawnSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const MEDIA = join(ROOT, 'docs', 'media')
const WEB = process.env.WEB_DIR ?? join(ROOT, '..', 'deepanshugautam-web')
const version = JSON.parse(readFileSync(join(ROOT, '.claude-plugin', 'plugin.json'), 'utf8')).version
const now = new Date()
const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`

function driveDir() {
  if (process.env.KATA_DRIVE_DIR) return process.env.KATA_DRIVE_DIR
  const cloud = join(homedir(), 'Library', 'CloudStorage')
  const drive = existsSync(cloud) ? readdirSync(cloud).find((d) => d.startsWith('GoogleDrive-')) : undefined
  if (!drive) throw new Error('Google Drive for desktop is not syncing here; set KATA_DRIVE_DIR')
  return join(cloud, drive, 'My Drive', 'gautam-systems', 'kata')
}

if (!existsSync(MEDIA) || !readdirSync(MEDIA).some((f) => f.endsWith('.png'))) throw new Error('docs/media is empty: run `mise run media` first')
const out = join(driveDir(), `${version}_${date}`)
rmSync(out, { recursive: true, force: true })

const copied = []
function put(from, area, kind, what) {
  const dir = join(out, area, kind)
  mkdirSync(dir, { recursive: true })
  const name = `kata_${version}_${area}_${what}${extname(from)}`
  copyFileSync(from, join(dir, name))
  copied.push(`${area}/${kind}/${name}`)
}

for (const f of readdirSync(MEDIA).sort()) {
  const what = f.replace(/\.[^.]+$/, '')
  if (f.endsWith('.png')) put(join(MEDIA, f), 'readme', 'images', what)
  else if (f.endsWith('.gif')) put(join(MEDIA, f), 'readme', 'animations', what)
}

const webMedia = join(WEB, 'img', 'apps', 'kata')
const hasWeb = existsSync(webMedia)
if (hasWeb) {
  for (const f of readdirSync(webMedia).sort()) {
    const what = f.replace(/\.[^.]+$/, '')
    if (/\.(webp|png|jpg)$/.test(f)) put(join(webMedia, f), 'website', 'images', what)
    else if (/\.(webm|mp4|gif)$/.test(f)) put(join(webMedia, f), 'website', 'videos', what)
  }
}

writeFileSync(join(out, 'README.md'), `# Kata ${version}, ${date}

Media for the Kata plugin ${version}. They come from the plugin's own code and the Kata Library page, filled with the steps library, never from a real session.

| Folder | What | Made by |
| --- | --- | --- |
| readme/images | The terminal at five moments of a run, and five Kata Library views: the same 16:9 frame, PNG at 2x | \`mise run media\` (kata) |
| readme/animations | A \`/kata pr\` run in the terminal, and a tour of the Kata Library page (GIF) | same |
${hasWeb ? `| website/images | The same stills as the website serves them: WebP, 1600×900 | \`mise run kata:media\` (deepanshugautam-web) |
| website/videos | The run as WebM (the demo on the Kata page) and as GIF | same |
` : ''}
File names: \`kata_<version>_<area>_<what>.<ext>\`. Exported with \`mise run assets:export\` (kata).
`)
console.log(`${out}\n  ${copied.join('\n  ')}\n  README.md`)

// The files only reach Drive while Google Drive for desktop runs; without it they wait in the local folder.
if (!process.env.KATA_DRIVE_DIR && spawnSync('pgrep', ['-x', 'Google Drive']).status !== 0) {
  const started = spawnSync('open', ['-a', 'Google Drive']).status === 0
  console.log(started
    ? 'Google Drive for desktop was not running: started it, so the files upload in the next minutes.'
    : 'Google Drive for desktop is not running: start it, or the files stay on this Mac only.')
}
