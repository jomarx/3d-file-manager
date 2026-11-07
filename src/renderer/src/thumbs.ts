import { useEffect, useState, type RefObject } from 'react'
import { fileUrl, type FileItem } from '@shared/api'
import type { ParseMessage, ParseRequest } from './viewer/messages'
import ParseWorker from './viewer/parse.worker?worker&inline'
import { drawThumbnail } from './viewer/thumbnail'

// Thumbnails are made lazily, for tiles on screen, a couple at a time. A tile
// scrolled away before its turn drops out of the queue, so skimming a large
// folder doesn't read every file in it.

// Bigger files get no automatic thumbnail: reading them from a slow or cloud
// drive for a tile isn't worth it.
export const MAX_THUMB_SOURCE_BYTES = 30 * 1024 * 1024
const CONCURRENCY = 2

type Made = 'ready' | 'none'
type Done = (made: Made | null) => void

interface Job {
  file: FileItem
  key: string
  started: boolean
  waiting: Set<Done>
}

// What this session made, so tiles show it before the file list is reloaded.
const made = new Map<string, Made>()
const jobs = new Map<string, Job>()
const queue: string[] = []
let active = 0

// A file's thumbnail is for one version of it.
const keyOf = (file: FileItem) => `${file.id}:${file.mtime}`

// Queues a thumbnail for `file`; returns a function that withdraws the request.
function requestThumb(file: FileItem, done: Done): () => void {
  const key = keyOf(file)
  let job = jobs.get(key)
  if (!job) {
    job = { file, key, started: false, waiting: new Set() }
    jobs.set(key, job)
    queue.push(key)
  }
  const current = job
  current.waiting.add(done)
  pump()
  return () => {
    current.waiting.delete(done)
    if (!current.started && current.waiting.size === 0) {
      jobs.delete(key)
      queue.splice(queue.indexOf(key), 1)
    }
  }
}

function pump(): void {
  while (active < CONCURRENCY && queue.length > 0) {
    const job = jobs.get(queue.shift()!)!
    job.started = true
    active++
    void make(job.file).then((result) => {
      active--
      jobs.delete(job.key)
      if (result) made.set(job.key, result)
      for (const done of job.waiting) done(result)
      pump()
    })
  }
}

// Null when the file couldn't be read right now; nothing is recorded then.
async function make(file: FileItem): Promise<Made | null> {
  const result = await parse(file)
  if (result.type === 'error') {
    if (result.unavailable) return null
    await save(file, null)
    return 'none'
  }
  let png: Uint8Array | null
  try {
    png = await drawThumbnail(result.model)
  } catch {
    return null // a lost WebGL context, say; try again another time
  }
  if (!(await save(file, png))) return null
  return png ? 'ready' : 'none'
}

async function save(file: FileItem, png: Uint8Array | null): Promise<boolean> {
  try {
    await window.api.files.saveThumb(file.id, file.mtime, png)
    return true
  } catch {
    return false
  }
}

function parse(file: FileItem): Promise<Extract<ParseMessage, { type: 'done' | 'error' }>> {
  return new Promise((resolve) => {
    const worker = new ParseWorker()
    const finish = (message: Extract<ParseMessage, { type: 'done' | 'error' }>) => {
      worker.terminate()
      resolve(message)
    }
    worker.onmessage = ({ data }: MessageEvent<ParseMessage>) => {
      if (data.type === 'done' || data.type === 'error') finish(data)
    }
    worker.onerror = (e) => finish({ type: 'error', message: e.message, unavailable: false })
    const request: ParseRequest = { url: fileUrl(file.id), ext: file.ext, size: file.size }
    worker.postMessage(request)
  })
}

/**
 * The thumbnail state of `file`, asking for one while the element `ref`
 * points at is on screen and the catalog has none yet.
 */
export function useThumb(file: FileItem, ref: RefObject<Element | null>): Made | null {
  const key = keyOf(file)
  const [result, setResult] = useState<{ key: string; made: Made } | null>(null)
  const value = made.get(key) ?? file.thumb ?? (result?.key === key ? result.made : null)
  const wanted = value === null && !file.missing && file.size <= MAX_THUMB_SOURCE_BYTES

  useEffect(() => {
    const el = ref.current
    if (!wanted || !el) return
    let cancel: (() => void) | null = null
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        cancel ??= requestThumb(file, (m) => m && setResult({ key, made: m }))
      } else {
        cancel?.()
        cancel = null
      }
    })
    observer.observe(el)
    return () => {
      observer.disconnect()
      cancel?.()
    }
    // `key` covers the fields of `file` that matter.
  }, [key, wanted])

  return value
}
