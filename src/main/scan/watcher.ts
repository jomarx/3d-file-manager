import { existsSync, statSync, watch, type FSWatcher } from 'node:fs'
import { join } from 'node:path'
import { extensionOf } from '@shared/api'
import { listFolders } from '../db/repo'

// Wait for changes to settle so copying a folder of files costs one rescan.
const SETTLE_MS = 1500
// How often to look for drives that came back and watchers that broke.
const RETRY_MS = 60_000

const SKIPPED = /(^|[\\/])(\$recycle\.bin|system volume information|node_modules|\.git)([\\/]|$)/i

/**
 * Rescans a folder shortly after something in it changes on disk, and rescans
 * offline folders when their drive comes back. Any change to a model file or
 * a folder counts; other files (a slicer's temp files, notes, images) don't.
 */
export class FolderWatcher {
  private watchers = new Map<number, { path: string; watcher: FSWatcher }>()
  private timers = new Map<number, NodeJS.Timeout>()
  // Folders whose watcher failed; left alone until the next retry tick.
  private resting = new Set<number>()
  private retry: NodeJS.Timeout

  constructor(
    private readonly rescan: (folderId: number) => void,
    private readonly settleMs = SETTLE_MS
  ) {
    this.retry = setInterval(() => {
      this.resting.clear()
      this.sync()
    }, RETRY_MS)
    this.retry.unref()
  }

  // Starts and stops watchers to match the catalog. Call after folders are
  // added or removed and after each scan.
  sync(): void {
    const folders = listFolders()
    const current = new Map(folders.map((f) => [f.id, f.path]))
    for (const [id, w] of this.watchers) if (current.get(id) !== w.path) this.stop(id)
    for (const folder of folders) {
      if (this.watchers.has(folder.id) || this.resting.has(folder.id) || !existsSync(folder.path)) continue
      if (folder.offline) this.rescan(folder.id)
      this.start(folder.id, folder.path, folder.recursive)
    }
  }

  close(): void {
    clearInterval(this.retry)
    for (const id of [...this.watchers.keys()]) this.stop(id)
  }

  private start(id: number, path: string, recursive: boolean): void {
    let watcher: FSWatcher
    try {
      watcher = watch(path, { recursive }, (event, name) => {
        if (name === null || relevant(path, name, event)) this.schedule(id)
      })
    } catch {
      // Some network and virtual drives can't be watched; rescans still work.
      this.resting.add(id)
      return
    }
    // Usually the drive went away. The rescan marks the folder offline.
    watcher.on('error', () => {
      this.stop(id)
      this.resting.add(id)
      this.rescan(id)
    })
    this.watchers.set(id, { path, watcher })
  }

  private stop(id: number): void {
    this.watchers.get(id)?.watcher.close()
    this.watchers.delete(id)
    clearTimeout(this.timers.get(id))
    this.timers.delete(id)
  }

  private schedule(id: number): void {
    clearTimeout(this.timers.get(id))
    this.timers.set(
      id,
      setTimeout(() => {
        this.timers.delete(id)
        this.rescan(id)
      }, this.settleMs)
    )
  }
}

// `name` is relative to the watched folder.
function relevant(root: string, name: string, event: string): boolean {
  if (SKIPPED.test(name)) return false
  if (extensionOf(name)) return true
  // A folder moved, renamed or deleted takes its files with it. Something
  // gone that had an extension was most likely a file. A 'change' on a folder
  // only means something inside it changed, and that has its own event.
  if (event !== 'rename') return false
  try {
    const stat = statSync(join(root, name), { throwIfNoEntry: false })
    return stat ? stat.isDirectory() : !/\.[^\\/.]+$/.test(name)
  } catch {
    return true
  }
}
