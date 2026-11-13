import { lstatSync, mkdirSync, readlinkSync, symlinkSync, unlinkSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const skillName = 'mmforge-platform'
const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const linkType = process.platform === 'win32' ? 'junction' : 'dir'

function projectRootFromInstall() {
  if (process.env.INIT_CWD) return resolve(process.env.INIT_CWD)
  const parts = packageRoot.split(sep)
  const nodeModules = parts.lastIndexOf('node_modules')
  if (nodeModules > 0) return parts.slice(0, nodeModules).join(sep)
  return packageRoot
}

function linkSkill(directory) {
  mkdirSync(directory, { recursive: true })
  const linkPath = join(directory, skillName)
  const target = linkType === 'junction' ? packageRoot : relative(directory, packageRoot)

  try {
    const current = lstatSync(linkPath)
    if (!current.isSymbolicLink()) {
      console.log(`mmforge-platform: left existing ${linkPath} in place`)
      return
    }
    if (resolve(directory, readlinkSync(linkPath)) === packageRoot) return
    unlinkSync(linkPath)
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }

  symlinkSync(target, linkPath, linkType)
  console.log(`mmforge-platform: linked ${linkPath}`)
}

const globalInstall = process.env.npm_config_global === 'true'
const projectRoot = projectRootFromInstall()

if (!globalInstall && projectRoot === packageRoot) {
  console.log('mmforge-platform: source checkout, skill link skipped')
} else {
  const root = globalInstall ? homedir() : projectRoot
  for (const folder of ['.agents/skills', '.cursor/skills']) {
    linkSkill(resolve(root, folder))
  }
}
