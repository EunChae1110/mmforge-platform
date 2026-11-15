import { lstat, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import type { Plugin } from 'vite'
import { designDeletedEvent, designFileRoute } from '../shared/designFiles'
import { respond, sameLocalOrigin } from './localRequest'

export function designFiles(): Plugin {
  return {
    name: 'mmforge-design-files',
    apply: 'serve',
    configureServer(server) {
      const directory = join(server.config.root, 'designs')

      server.middlewares.use((request, response, next) => {
        const url = new URL(request.url ?? '/', 'http://localhost')
        if (url.pathname !== designFileRoute) return next()
        if (request.method !== 'DELETE') {
          respond(response, 405, { error: 'Unsupported file request.' })
          return
        }
        if (!sameLocalOrigin(request)) {
          respond(response, 403, { error: 'Designs can only be deleted from this local canvas.' })
          return
        }

        const filename = url.searchParams.get('filename')
        if (!filename || filename.startsWith('.') || !filename.endsWith('.tsx') || /[/\\\u0000]/.test(filename)) {
          respond(response, 400, { error: 'Select a design file from the sidebar.' })
          return
        }

        void (async () => {
          const path = join(directory, filename)
          if (!(await lstat(directory)).isDirectory() || !(await lstat(path)).isFile()) {
            respond(response, 400, { error: 'Only regular design files can be deleted.' })
            return
          }

          await unlink(path)
          server.ws.send(designDeletedEvent, { filename })
          respond(response, 200, { filename })
        })().catch((error: NodeJS.ErrnoException) => {
          if (error.code === 'ENOENT') {
            respond(response, 404, { error: 'This file is no longer in the designs folder.' })
          } else {
            server.config.logger.error(String(error))
            respond(response, 500, { error: 'Couldn’t delete the file. Check that the folder is writable and try again.' })
          }
        })
      })
    },
  }
}
