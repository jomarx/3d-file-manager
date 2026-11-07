import { createReadStream } from 'node:fs'
import { readFile, stat } from 'node:fs/promises'
import { Readable } from 'node:stream'
import { protocol } from 'electron'
import { FILE_PROTOCOL } from '@shared/api'
import { filePath, thumbName } from './db/files'
import { quickPath } from './launch'
import { thumbFile } from './thumbs'

// threefm://file/<id> streams a cataloged file to the renderer and
// threefm://thumb/<id> its cached thumbnail. Only ids in the catalog resolve,
// so the page can never read arbitrary paths. threefm://quick/<token> streams
// the one file opened from Explorer into the quick view.

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
    const key = url.pathname.replace(/^\//, '')
    const id = Number(key)
    if (url.hostname === 'thumb') return thumbResponse(id)
    const path =
      url.hostname === 'file' && Number.isInteger(id)
        ? filePath(id)
        : url.hostname === 'quick' && key !== ''
          ? quickPath(key)
          : null
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

async function thumbResponse(id: number): Promise<Response> {
  const name = Number.isInteger(id) ? thumbName(id) : null
  try {
    if (!name) throw new Error('no thumbnail')
    const data = await readFile(thumbFile(name))
    return new Response(data, { headers: headers({ 'Content-Type': 'image/png' }) })
  } catch {
    return new Response('Not found', { status: 404, headers: headers() })
  }
}