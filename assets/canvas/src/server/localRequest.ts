import type { IncomingMessage, ServerResponse } from 'node:http'

export function sameLocalOrigin(request: IncomingMessage) {
  const host = request.headers.host ?? ''
  const loopback = ['::1', '127.0.0.1', '::ffff:127.0.0.1']
  return loopback.includes(request.socket.remoteAddress ?? '') &&
    /^(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(host) &&
    (request.headers.origin === 'http://' + host || request.headers.origin === 'https://' + host)
}

export function respond(response: ServerResponse, status: number, body: object) {
  response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
  response.end(JSON.stringify(body))
}
