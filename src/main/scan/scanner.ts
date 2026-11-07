import { existsSync } from 'node:fs'
import type { ScanProgress } from '@shared/api'
import { getDb } from '../db'
import { getFolder } from '../db/repo'
import { missingCandidates, moveFileRow, pairMoves, presentPlace, type MoveCandidate } from '../db/moves'
import { walk, type FoundFile } from './walk'

const BATCH_SIZE = 500
const PROGRESS_INTERVAL_MS = 400
// How long a new file can still turn out to be one moved from a folder
// scanned later. Startup scans of a whole catalog fit well within this.
const RECENT_MS = 60 * 60 * 1000

interface KnownFile {
  id: number
  size: number
  mtime: number
  missing: boolean
}

/**
 * Brings the files table in line with what is on disk, one folder at a time.
 * Scans run sequentially so several folders on one drive don't fight over it.
 */
export class Scanner {
  private queue: number[] = []
  private running = false
  // Files new to the catalog this session, for moves across folders.
  private recent = new Map<number, MoveCandidate & { at: number }>()

  constructor(private readonly emit: (progress: ScanProgress) => void) {}

  enqueue(folderId: number): void {
    if (!this.queue.includes(folderId)) this.queue.push(folderId)
    void this.drain()
  }

  private async drain(): Promise<void> {
    if (this.running) return
    this.running = true
    try {
      while (this.queue.length > 0) {
        const id = this.queue.shift()!
        await this.scanFolder(id)
      }
    } finally {
      this.running = false
    }
  }

  private async scanFolder(folderId: number): Promise<void> {
    const folder = getFolder(folderId)
    if (!folder) return
    const db = getDb()
    const progress: ScanProgress = {
      folderId,
      path: folder.path,
      phase: 'scanning',
      seen: 0,
      added: 0,
      updated: 0,
      missing: 0,
      moved: 0
    }

    // An unplugged drive must not turn every file into "missing".
    if (!existsSync(folder.path)) {
      db.prepare('UPDATE folders SET offline = 1 WHERE id = ?').run(folderId)
      this.emit({ ...progress, phase: 'offline' })
      return
    }
    db.prepare('UPDATE folders SET offline = 0 WHERE id = ?').run(folderId)
    this.emit({ ...progress })

    const known = new Map<string, KnownFile>()
    const rows = db
      .prepare('SELECT id, path, size, mtime, missing_since FROM files WHERE folder_id = ?')
      .all(folderId) as { id: number; path: string; size: number; mtime: number; missing_since: string | null }[]
    for (const r of rows) {
      known.set(r.path.toLowerCase(), { id: r.id, size: r.size, mtime: r.mtime, missing: r.missing_since !== null })
    }

    // ON CONFLICT handles a file that was indexed under another folder row.
    const upsert = db.prepare(
      `INSERT INTO files (folder_id, path, name, ext, size, mtime)
       VALUES (@folderId, @path, @name, @ext, @size, @mtime)
       ON CONFLICT(path) DO UPDATE SET
         folder_id = excluded.folder_id, name = excluded.name, ext = excluded.ext,
         size = excluded.size, mtime = excluded.mtime, missing_since = NULL,
         quick_hash = NULL, meta_json = NULL, thumb_path = NULL, indexed_at = datetime('now')`
    )
    const idOf = db.prepare('SELECT id FROM files WHERE path = ?').pluck()
    const restore = db.prepare('UPDATE files SET missing_since = NULL WHERE id = ?')
    const markMissing = db.prepare(
      "UPDATE files SET missing_since = datetime('now') WHERE id = ? AND missing_since IS NULL"
    )

    // Ids of files this scan added and found gone, for move detection.
    const added = new Set<number>()
    const gone = new Set<number>()
    const applyBatch = db.transaction((batch: FoundFile[]) => {
      for (const f of batch) {
        const key = f.path.toLowerCase()
        const prev = known.get(key)
        known.delete(key)
        if (!prev) {
          upsert.run({ folderId, ...f })
          progress.added++
          const id = idOf.get(f.path) as number
          added.add(id)
          this.recent.set(id, { id, name: f.name, ext: f.ext, size: f.size, mtime: f.mtime, at: Date.now() })
        } else if (prev.size !== f.size || prev.mtime !== f.mtime) {
          upsert.run({ folderId, ...f })
          progress.updated++
        } else if (prev.missing) {
          restore.run(prev.id)
          progress.updated++
        }
      }
    })

    let batch: FoundFile[] = []
    let lastEmit = Date.now()
    try {
      for await (const file of walk(folder.path, folder.recursive)) {
        batch.push(file)
        progress.seen++
        if (batch.length >= BATCH_SIZE) {
          applyBatch(batch)
          batch = []
        }
        if (Date.now() - lastEmit >= PROGRESS_INTERVAL_MS) {
          this.emit({ ...progress })
          lastEmit = Date.now()
        }
      }
      applyBatch(batch)

      // Whatever was indexed before but not seen now is gone from disk.
      db.transaction(() => {
        for (const prev of known.values()) {
          if (!prev.missing && markMissing.run(prev.id).changes > 0) {
            progress.missing++
            gone.add(prev.id)
          }
        }
      })()
      if (added.size > 0 || gone.size > 0) this.followMoves(progress, added, gone)
      this.emit({ ...progress, phase: 'done' })
    } catch (error) {
      applyBatch(batch)
      this.emit({
        ...progress,
        phase: 'error',
        message: error instanceof Error ? error.message : String(error)
      })
    }
  }

  // Hands each new file that is really a missing one moved or renamed over to
  // the missing entry. `added` and `gone` are this scan's, to fix its counts.
  private followMoves(progress: ScanProgress, added: Set<number>, gone: Set<number>): void {
    const now = Date.now()
    const lostFiles = missingCandidates()
    const lostIds = new Set(lostFiles.map((c) => c.id))
    // A recent file that has gone missing since is a candidate to move, not a destination.
    for (const [id, c] of this.recent) if (now - c.at > RECENT_MS || lostIds.has(id)) this.recent.delete(id)
    for (const { lost, fresh } of pairMoves(lostFiles, [...this.recent.values()])) {
      const place = presentPlace(fresh.id)
      this.recent.delete(fresh.id)
      if (!place) continue
      moveFileRow(lost.id, place)
      progress.moved++
      if (added.has(fresh.id)) progress.added--
      if (gone.has(lost.id)) progress.missing--
    }
  }
}
