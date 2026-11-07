import { useEffect, useState } from 'react'
import { fileUrl, quickUrl, type FileItem, type QuickFile } from '@shared/api'
import type { ParsedModel } from '@shared/model'
import type { ParseMessage, ParseRequest } from '../viewer/messages'
import ParseWorker from '../viewer/parse.worker?worker&inline'

// Files above this size wait for an explicit "Load preview" click.
export const AUTO_PREVIEW_BYTES = 50 * 1024 * 1024
// Short pause so clicking through files quickly doesn't start a load for each one.
const START_DELAY_MS = 120

export type ModelState =
  | { status: 'idle' }
  | { status: 'large' }
  | { status: 'loading'; loaded: number; total: number; parsing: boolean }
  | { status: 'ready'; model: ParsedModel }
  | { status: 'error'; message: string }

// A file to preview: where to fetch it and what it is. A new key starts a new load.
export interface ModelSource {
  key: string
  url: string
  ext: string
  size: number
}

export const catalogSource = (file: FileItem): ModelSource => ({
  key: `file:${file.id}:${file.mtime}:${file.size}`,
  url: fileUrl(file.id),
  ext: file.ext,
  size: file.size
})

export const quickSource = (file: QuickFile): ModelSource => ({
  key: `quick:${file.token}`,
  url: quickUrl(file.token),
  ext: file.ext,
  size: file.size
})

export function useModel(source: ModelSource | null): { state: ModelState; loadLarge(): void } {
  const [state, setState] = useState<ModelState>({ status: 'idle' })
  const [forced, setForced] = useState<string | null>(null)
  const key = source?.key ?? null
  const large = !!source && source.size > AUTO_PREVIEW_BYTES && forced !== key

  useEffect(() => {
    if (!source) return setState({ status: 'idle' })
    if (large) return setState({ status: 'large' })

    setState({ status: 'loading', loaded: 0, total: source.size, parsing: false })
    let worker: Worker | null = null
    const timer = setTimeout(() => {
      worker = new ParseWorker()
      worker.onmessage = ({ data }: MessageEvent<ParseMessage>) => {
        if (data.type === 'progress') {
          setState({ status: 'loading', loaded: data.loaded, total: data.total, parsing: false })
        } else if (data.type === 'parsing') {
          setState((s) => (s.status === 'loading' ? { ...s, loaded: s.total, parsing: true } : s))
        } else {
          setState(
            data.type === 'done'
              ? { status: 'ready', model: data.model }
              : { status: 'error', message: data.message }
          )
          worker?.terminate()
        }
      }
      worker.onerror = (e) => setState({ status: 'error', message: `The previewer crashed: ${e.message}` })
      const request: ParseRequest = { url: source.url, ext: source.ext, size: source.size }
      worker.postMessage(request)
    }, START_DELAY_MS)

    return () => {
      clearTimeout(timer)
      worker?.terminate()
    }
    // `key` covers the fields of `source` that matter.
  }, [key, large])

  return { state, loadLarge: () => setForced(key) }
}
