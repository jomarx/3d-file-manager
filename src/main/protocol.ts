import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { Readable } from 'node:stream'
import { protocol } from 'electron'
import { FILE_PROTOCOL } from '@shared/api'
import { filePath } from './db/files'

// threefm://file/<id> streams a cataloged file to the renderer. Only ids in the
// catalog resolve, so the page can never read arbitrary paths.

export function registerFileScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: FILE_PROTOCOL,
      privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true }
    }
  ])
}

const headers = (extra: Record<string, string> = {}) => ({
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Expose-Headers': 'Content-Length',
  ...extra
})

export function handleFileProtocol(): void {
  protocol.handle(FILE_PROTOCOL, async (request) => {
    const url = new URL(request.url)
    const id = Number(url.pathname.replace(/^\//, ''))
    const path = url.hostname === 'file' && Number.isInteger(id) ? filePath(id) : null
    if (!path) return new Response('Not found', { status: 404, headers: headers() })
    try {
      const info = await stat(path)
      const body = Readable.toWeb(createReadStream(path)) as ReadableStream<Uint8Array>
      return new Response(body, {
        headers: headers({ 'Content-Type': 'application/octet-stream', 'Content-Length': String(info.size) })
      })
    } catch {
      return new Response('File unavailable', { status: 410, headers: headers() })
    }
  })
}
