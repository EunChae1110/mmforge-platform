import { execFile } from 'node:child_process'
import { access, lstat, mkdir, mkdtemp, readFile, rename, rm } from 'node:fs/promises'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'
import type { Plugin } from 'vite'

const repository = 'https://github.com/EunChae1110/mmforge-platform'
const latestRelease = 'https://api.github.com/repos/EunChae1110/mmforge-platform/releases/latest'
const route = '/__mmforge/update'
const stableTag = /^v?((?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*))$/
const canvasFiles = ['index.html', 'package.json', 'package-lock.json', 'tsconfig.json', 'vite.config.ts', 'canvas-update.ts', 'public', 'scripts', 'src']
const run = promisify(execFile)

type Release = { tag: string; version: string; notes: string; url: string }

class UpdateError extends Error {}

function isNewer(candidate: string, installed: string) {
  const parts = candidate.split('.').map(Number)
  const current = installed.split('.').map(Number)
  const difference = parts.findIndex((part, index) => part !== current[index])
  return difference !== -1 && parts[difference] > current[difference]
}

async function versionAt(directory: string) {
  const { name, version } = JSON.parse(await readFile(join(directory, 'package.json'), 'utf8'))
  if (name !== 'mmforge-platform' || typeof version !== 'string' || !stableTag.test(version)) {
    throw new UpdateError('The MMForge version could not be verified.')
  }
  return version
}

async function fetchRelease(): Promise<Release | null> {
  const response = await fetch(latestRelease, {
    headers: { Accept: 'application/vnd.github+json' },
    signal: AbortSignal.timeout(8000),
  }).catch(() => { throw new UpdateError('GitHub could not be reached. Try checking again.') })
  if (response.status === 404) return null
  if (!response.ok) throw new UpdateError('GitHub could not provide release information. Try again later.')
  const release = await response.json()
  const version = typeof release.tag_name === 'string' && release.tag_name.match(stableTag)?.[1]
  if (!version || release.draft || release.prerelease) return null
  return {
    tag: release.tag_name,
    version,
    notes: typeof release.body === 'string' ? release.body : '',
    url: repository + '/releases/tag/' + release.tag_name,
  }
}

async function exists(path: string): Promise<boolean> {
  try {
    await lstat(path)
    return true
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false
    throw error
  }
}

function git(cwd: string, ...args: string[]) {
  return run('git', args, { cwd, timeout: 90_000, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } })
}

async function requireCleanCheckout(checkout: string) {
  const { stdout } = await git(checkout, 'status', '--porcelain')
  if (stdout.trim()) throw new UpdateError('The MMForge checkout has uncommitted changes. Commit or stash them, then retry.')
}

async function installDependencies(directory: string) {
  const args = ['ci', '--ignore-scripts', '--no-audit', '--no-fund']
  const npmCli = process.env.npm_execpath
  if (process.platform === 'win32' && !npmCli) throw new UpdateError('Start the canvas with npm run dev, then retry.')
  await run(npmCli ? process.execPath : 'npm', npmCli ? [npmCli, ...args] : args, { cwd: directory, timeout: 180_000 })
}

async function replaceCanvas(canvas: string, next: string, backup: string) {
  const files = [...canvasFiles, 'node_modules']
  const saved: string[] = []
  const installed: string[] = []
  await mkdir(backup)
  try {
    for (const file of files) {
      await access(join(next, file))
    }
    for (const file of files) {
      if (await exists(join(canvas, file))) {
        await rename(join(canvas, file), join(backup, file))
        saved.push(file)
      }
      await rename(join(next, file), join(canvas, file))
      installed.push(file)
    }
  } catch (error) {
    try {
      for (const file of installed.reverse()) await rename(join(canvas, file), join(next, file))
      for (const file of saved.reverse()) await rename(join(backup, file), join(canvas, file))
    } catch {
      throw new UpdateError('The update could not be restored automatically. The previous files are in ' + backup + '.')
    }
    throw error
  }
}

async function installRelease(canvas: string, release: Release) {
  const skillRoot = resolve(canvas, '../..')
  const isSkillCheckout = await exists(join(skillRoot, '.git')) && await exists(join(skillRoot, 'SKILL.md'))
  const isCanvasCheckout = !isSkillCheckout && await exists(join(canvas, '.git'))
  const updateDirectory = join(canvas, '.mmforge-update')
  await mkdir(updateDirectory, { recursive: true })
  const lock = join(updateDirectory, 'install.lock')
  await mkdir(lock).catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'EEXIST') throw new UpdateError('An update is already in progress.')
    throw error
  })

  let staging: string | undefined
  try {
    if (!isNewer(release.version, await versionAt(canvas))) throw new UpdateError('This version is already installed.')
    if (isCanvasCheckout) {
      throw new UpdateError('This canvas has its own Git history. Apply the release through your repository to preserve that history.')
    }
    if (isSkillCheckout) await requireCleanCheckout(skillRoot)
    staging = await mkdtemp(join(updateDirectory, 'release-'))
    const source = join(staging, 'source')
    await mkdir(source)
    await git(source, 'init', '--quiet')
    await git(source, 'fetch', '--no-tags', ...(isSkillCheckout ? [] : ['--depth=1']), repository + '.git', 'refs/tags/' + release.tag)
    await git(source, 'checkout', '--quiet', '--detach', 'FETCH_HEAD')
    const next = join(source, 'assets', 'canvas')
    if (await versionAt(next) !== release.version) throw new UpdateError('The release tag does not match its package version.')

    if (isSkillCheckout) {
      const { stdout: paths } = await git(source, 'ls-tree', '-r', '--name-only', 'HEAD', '--', 'designs', 'assets/canvas/designs')
      if (paths.trim()) throw new UpdateError('The release contains files in a workspace designs folder.')
      await git(skillRoot, 'fetch', '--no-tags', source, 'HEAD')
      const { stdout: fetched } = await git(skillRoot, 'rev-parse', 'FETCH_HEAD')
      const commit = fetched.trim()
      await git(skillRoot, 'merge-base', '--is-ancestor', 'HEAD', commit).catch(() => {
        throw new UpdateError('The release cannot fast-forward this checkout. Update it through Git.')
      })
      const oldLock = await readFile(join(canvas, 'package-lock.json'))
      const nextLock = await readFile(join(next, 'package-lock.json'))
      const dependenciesChanged = !oldLock.equals(nextLock)
      if (dependenciesChanged) await installDependencies(next)
      await requireCleanCheckout(skillRoot)
      const dependencies = join(canvas, 'node_modules')
      const previous = join(updateDirectory, 'node-modules-' + Date.now())
      let replaced = false
      if (dependenciesChanged && await exists(dependencies)) await rename(dependencies, previous)
      try {
        if (dependenciesChanged) {
          await rename(join(next, 'node_modules'), dependencies)
          replaced = true
        }
        await git(skillRoot, 'merge', '--ff-only', '--no-edit', commit)
      } catch (error) {
        if (replaced) await rename(dependencies, join(next, 'node_modules'))
        if (await exists(previous)) await rename(previous, dependencies)
        throw error
      }
      await rm(previous, { recursive: true, force: true })
    } else {
      await installDependencies(next)
      const backup = join(updateDirectory, 'backup-' + Date.now())
      await replaceCanvas(canvas, next, backup)
    }
  } finally {
    try {
      if (staging) await rm(staging, { recursive: true, force: true })
    } finally {
      await rm(lock, { recursive: true, force: true })
    }
  }
}

function sameLocalOrigin(request: IncomingMessage) {
  const host = request.headers.host ?? ''
  const loopback = ['::1', '127.0.0.1', '::ffff:127.0.0.1']
  return loopback.includes(request.socket.remoteAddress ?? '') &&
    /^(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(host) &&
    (request.headers.origin === 'http://' + host || request.headers.origin === 'https://' + host)
}

function respond(response: ServerResponse, status: number, body: object) {
  response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
  response.end(JSON.stringify(body))
}

export function canvasUpdate(canvas: string): Plugin {
  let checkedAt = 0
  let releaseCheck: Promise<Release | null> | undefined
  function checkRelease() {
    if (!releaseCheck || Date.now() - checkedAt >= 60_000) {
      checkedAt = Date.now()
      releaseCheck = fetchRelease().catch(error => {
        releaseCheck = undefined
        throw error
      })
    }
    return releaseCheck
  }

  return {
    name: 'mmforge-canvas-update',
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const url = new URL(request.url ?? '/', 'http://localhost')
        if (url.pathname !== route) return next()
        if (request.method === 'POST' && !sameLocalOrigin(request)) {
          respond(response, 403, { error: 'Updates can only be started from this local canvas.' })
          return
        }
        if (request.method !== 'GET' && request.method !== 'POST') {
          respond(response, 405, { error: 'Unsupported update request.' })
          return
        }

        void (async () => {
          const version = await versionAt(canvas)
          const release = await checkRelease()
          const update = release && isNewer(release.version, version) ? release : null
          if (request.method === 'POST') {
            if (!update || url.searchParams.get('tag') !== update.tag) {
              respond(response, 409, { error: 'The selected release is no longer available. Check for updates again.' })
              return
            }
            await installRelease(canvas, update)
            respond(response, 200, { installed: update.version })
          } else {
            respond(response, 200, { version, update })
          }
        })().catch(error => {
          if (!(error instanceof UpdateError)) server.config.logger.error(String(error))
          respond(response, 500, { error: error instanceof UpdateError ? error.message : 'The update could not be completed. Try again or check the local server log.' })
        })
      })
    },
  }
}
