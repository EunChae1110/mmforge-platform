import { renameSync, writeFileSync } from 'node:fs'
import { isAbsolute, relative, resolve, sep } from 'node:path'

const [phase, filename] = process.argv.slice(2)
const workspace = process.cwd()
const directory = resolve(workspace, 'designs')
const path = filename ? relative(directory, resolve(workspace, filename)) : ''

if (
  !['creating', 'writing', 'editing', 'done'].includes(phase) ||
  !path || path === '..' || path.startsWith('..' + sep) || isAbsolute(path)
) {
  console.error('Usage: npm run design-activity -- <creating|writing|editing|done> designs/<file>')
  process.exitCode = 1
} else {
  const marker = resolve(workspace, '.mmforge-activity.json')
  const temporary = marker + '.' + process.pid
  writeFileSync(temporary, JSON.stringify({
    phase,
    path: 'designs/' + path.split(sep).join('/'),
    until: Date.now() + (phase === 'done' ? 2800 : 60_000),
  }))
  renameSync(temporary, marker)
}
