import { useEffect, useState } from 'react'
import { fileUrl, type FileItem } from '@shared/api'
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

export function useModel(file: FileItem | null): { state: ModelState; loadLarge(): void } {
  const [state, setState] = useState<ModelState>({ status: 'idle' })
  const [forced, setForced] = useState<number | null>(null)
  const id = file?.id ?? null
  const key = file ? `${file.id}:${file.mtime}:${file.size}` : null
  const large = !!file && file.size > AUTO_PREVIEW_BYTES && forced !== id

  useEffect(() => {
    if (!file) return setState({ status: 'idle' })
    if (large) return setState({ status: 'large' })

    setState({ status: 'loading', loaded: 0, total: file.size, parsing: false })
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
      const request: ParseRequest = { url: fileUrl(file.id), ext: file.ext, size: file.size }
      worker.postMessage(request)
    }, START_DELAY_MS)

    return () => {
      clearTimeout(timer)
      worker?.terminate()
    }
    // `key` covers the fields of `file` that matter.
  }, [key, large])

  return { state, loadLarge: () => setForced(id) }
}
