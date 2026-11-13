import { readFile, readdir, stat } from 'node:fs/promises'
import { dirname, isAbsolute, join, relative, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'
import { designActivityEvent, designSavedEvent, type DesignActivity, type DesignSaved } from './src/designActivity'

function designEdits(): Plugin {
  const id = 'virtual:design-edits'
  const resolvedId = '\0' + id
  let directory: string
  let marker: string
  let agentActivity: DesignActivity | undefined

  return {
    name: 'mmforge-design-edits',
    configResolved(config) {
      directory = join(config.root, 'designs')
      marker = join(config.root, '.mmforge-activity.json')
    },
    configureServer(server) {
      let latest: DesignActivity | undefined

      function publish(activity: DesignActivity) {
        latest = activity
        server.ws.send(designActivityEvent, activity)
      }

      async function readAgentActivity() {
        try {
          const { phase, path, until } = JSON.parse(await readFile(marker, 'utf8'))
          if (!['creating', 'writing', 'editing', 'done'].includes(phase) || typeof path !== 'string' ||
            !/^designs\/.+/.test(path) || typeof until !== 'number' || !Number.isFinite(until) || until <= Date.now()) return
          const previewReady = agentActivity?.path === path && agentActivity.phase !== 'done' && agentActivity.until > Date.now()
            ? agentActivity.previewReady : undefined
          agentActivity = { phase, path, until, source: 'agent', previewReady }
          publish(agentActivity)
        } catch {
          // The marker is optional and may disappear between a watch event and the read.
        }
      }

      server.watcher.add(marker)
      server.watcher.on('all', (event, file) => {
        if (event !== 'add' && event !== 'change') return
        if (file === marker) {
          void readAgentActivity()
          return
        }

        const name = relative(directory, file)
        if (!name || name === '..' || name.startsWith('..' + sep) || isAbsolute(name) || !/\.(tsx?|jsx?|css|html)$/.test(name)) return
        const path = 'designs/' + name.split(sep).join('/')
        const now = Date.now()
        const saved: DesignActivity = {
          phase: event === 'add' ? 'created' : 'updated', path, until: now + 2800, source: 'filesystem',
        }
        if (agentActivity && agentActivity.until > now) {
          if (agentActivity.phase === 'done') {
            if (agentActivity.path === path) return
          } else {
            if (agentActivity.path !== path) return
            // Restore the preview after saving while the activity continues until `done`.
            agentActivity = { ...agentActivity, previewReady: true }
            publish(agentActivity)
            return
          }
        }
        publish(saved)
      })

      server.ws.on(designActivityEvent + ':sync', (_, client) => {
        if (latest && latest.until > Date.now()) client.send(designActivityEvent, latest)
      })
    },
    resolveId(source) {
      if (source === id) return resolvedId
    },
    async load(source) {
      if (source !== resolvedId) return
      const files = await readdir(directory, { withFileTypes: true }).catch((error: NodeJS.ErrnoException) => {
        if (error.code === 'ENOENT') return []
        throw error
      })
      const designs = files.filter((file) => file.isFile() && file.name.endsWith('.tsx'))
      const entries = await Promise.all(
        designs.map(async (file) => {
          const info = await stat(join(directory, file.name), { throwIfNoEntry: false })
          return [file.name, info?.mtime.toISOString()]
        }),
      )
      return 'export default ' + JSON.stringify(Object.fromEntries(entries))
    },
    hotUpdate: {
      order: 'pre',
      handler({ file, modules, type }) {
        const name = relative(directory, file)
        if (!name || name === '..' || name.startsWith('..' + sep) || isAbsolute(name)) return

        const filename = dirname(file) === directory && file.endsWith('.tsx') ? name : null
        if (this.environment.name === 'client' && type !== 'delete' && /\.(tsx?|jsx?|css|html)$/.test(name)) {
          const owners = new Set<string>()
          if (!filename) {
            const visited = new Set<(typeof modules)[number]>()
            const queue = [...(this.environment.moduleGraph.getModulesByFile(file) ?? [])]
            for (const module of queue) {
              if (visited.has(module)) continue
              visited.add(module)

              if (module.file && dirname(module.file) === directory && module.file.endsWith('.tsx')) {
                owners.add(relative(directory, module.file))
              } else {
                queue.push(...module.importers)
              }
            }

            // Newly created assets may not be in the import graph until the design is saved.
            if (owners.size === 0 && agentActivity && agentActivity.phase !== 'done' && agentActivity.until > Date.now()) {
              const target = agentActivity.path.match(/^designs\/([^/]+\.tsx)$/)?.[1]
              if (target) owners.add(target)
            }
          }
          this.environment.hot.send(designSavedEvent, { filename, owners: [...owners] } satisfies DesignSaved)
        }

        if (filename) {
          const metadata = this.environment.moduleGraph.getModuleById(resolvedId)
          if (metadata) return [...modules, metadata]
        }
      },
    },
  }
}

export default defineConfig({
  plugins: [react(), designEdits()],
  publicDir: fileURLToPath(new URL('./public', import.meta.url)),
  define: {
    __MMFORGE_WORKSPACE__: JSON.stringify(process.cwd()),
    __MMFORGE_WORKSPACE_URL__: JSON.stringify(pathToFileURL(process.cwd() + sep).href),
  },
  server: {
    host: 'localhost',
    port: 5173,
  },
})
