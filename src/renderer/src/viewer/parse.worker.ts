import { ModelError, parseModel, type ParsedModel } from '@shared/model'
import type { ParseMessage, ParseRequest } from './messages'

// Downloads a catalog file over threefm:// and parses it off the UI thread.
// One worker handles one file; useModel terminates it when the selection moves on.

const PROGRESS_STEP = 4 * 1024 * 1024

const ctx = self as unknown as {
  onmessage: ((e: MessageEvent<ParseRequest>) => void) | null
  postMessage(message: ParseMessage, transfer?: Transferable[]): void
}

ctx.onmessage = async ({ data: { url, ext, size } }) => {
  let downloaded = false
  try {
    const bytes = await download(url, size)
    downloaded = true
    ctx.postMessage({ type: 'parsing' })
    const model = parseModel(bytes, ext)
    ctx.postMessage({ type: 'done', model }, transferables(model))
  } catch (err) {
    const message =
      err instanceof ModelError
        ? err.message
        : `Could not preview this file: ${err instanceof Error ? err.message : String(err)}`
    ctx.postMessage({ type: 'error', message, unavailable: !downloaded })
  }
}

async function download(url: string, size: number): Promise<Uint8Array> {
  const res = await fetch(url)
  if (res.status === 404 || res.status === 410) {
    throw new ModelError('This file is missing or no longer readable. Try rescanning its folder.')
  }
  if (!res.ok || !res.body) throw new ModelError(`The file could not be read (${res.status}).`)
  const total = Number(res.headers.get('Content-Length')) || size
  let bytes = new Uint8Array(total)
  let loaded = 0
  let reported = 0
  const reader = res.body.getReader()
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    if (loaded + value.length > bytes.length) {
      // The file grew since it was scanned.
      const bigger = new Uint8Array(Math.max(bytes.length * 2, loaded + value.length))
      bigger.set(bytes.subarray(0, loaded))
      bytes = bigger
    }
    bytes.set(value, loaded)
    loaded += value.length
    if (loaded - reported >= PROGRESS_STEP) {
      reported = loaded
      ctx.postMessage({ type: 'progress', loaded, total })
    }
  }
  return loaded === bytes.length ? bytes : bytes.subarray(0, loaded)
}

function transferables(model: ParsedModel): Transferable[] {
  const buffers = new Set<ArrayBuffer>()
  const g = model.geometry
  if (g?.kind === 'mesh') [g.positions, g.partStarts].forEach((a) => buffers.add(a.buffer as ArrayBuffer))
  if (g?.kind === 'toolpath') {
    ;[g.positions, g.features, g.layerEnds, g.layerZ].forEach((a) => buffers.add(a.buffer as ArrayBuffer))
  }
  if (model.thumbnail) buffers.add(model.thumbnail.data.buffer as ArrayBuffer)
  return [...buffers]
}
