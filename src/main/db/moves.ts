import { getDb } from './index'

// Moves and renames done outside 3FM show up in a scan as one file gone and
// one new file. When the two have the same size, modification time and type,
// the old catalog entry follows the file, so its tags, collections and
// thumbnail stay. Explorer keeps the modification time on a move or rename.

export interface MoveCandidate {
  id: number
  name: string
  ext: string
  size: number
  mtime: number
}

export interface Place {
  folderId: number
  path: string
  name: string
  ext: string
  size: number
  mtime: number
}

const key = (c: MoveCandidate) => `${c.size}:${c.mtime}:${c.ext}`

/**
 * Pairs missing files with new ones that look like the same file. A match must
 * be unambiguous: one of each with that size and time, or failing that, one of
 * each that also share a name (a folder of copies moved in one go). Empty files
 * are left alone; they all look alike.
 */
export function pairMoves(lost: MoveCandidate[], fresh: MoveCandidate[]): { lost: MoveCandidate; fresh: MoveCandidate }[] {
  const groups = new Map<string, { lost: MoveCandidate[]; fresh: MoveCandidate[] }>()
  for (const [side, list] of [['lost', lost], ['fresh', fresh]] as const) {
    for (const c of list) {
      if (c.size === 0) continue
      const k = key(c)
      if (!groups.has(k)) groups.set(k, { lost: [], fresh: [] })
      groups.get(k)![side].push(c)
    }
  }
  const pairs: { lost: MoveCandidate; fresh: MoveCandidate }[] = []
  for (const g of groups.values()) {
    if (g.lost.length === 0 || g.fresh.length === 0) continue
    if (g.lost.length === 1 && g.fresh.length === 1) {
      pairs.push({ lost: g.lost[0], fresh: g.fresh[0] })
      continue
    }
    const byName = (list: MoveCandidate[]) => {
      const m = new Map<string, MoveCandidate[]>()
      for (const c of list) m.set(c.name.toLowerCase(), [...(m.get(c.name.toLowerCase()) ?? []), c])
      return m
    }
    const freshByName = byName(g.fresh)
    for (const [name, l] of byName(g.lost)) {
      const f = freshByName.get(name)
      if (l.length === 1 && f?.length === 1) pairs.push({ lost: l[0], fresh: f[0] })
    }
  }
  return pairs
}

export function missingCandidates(): MoveCandidate[] {
  return getDb()
    .prepare('SELECT id, name, ext, size, mtime FROM files WHERE missing_since IS NOT NULL')
    .all() as MoveCandidate[]
}

// Where a present file is now, or undefined if it's gone or missing.
export function presentPlace(id: number): Place | undefined {
  return getDb()
    .prepare(
      `SELECT folder_id AS folderId, path, name, ext, size, mtime
       FROM files WHERE id = ? AND missing_since IS NULL`
    )
    .get(id) as Place | undefined
}

/**
 * Points the catalog entry `id` at `place` and marks it present. Another entry
 * already at that path (the same file, indexed again under its new name) is
 * folded in: its tags and collections move over and it is dropped. If the size
 * or time differ, the file changed too, so cached details are cleared.
 */
export function moveFileRow(id: number, place: Place): void {
  const db = getDb()
  db.transaction(() => {
    const other = db.prepare('SELECT id FROM files WHERE path = ? AND id != ?').get(place.path, id) as
      | { id: number }
      | undefined
    if (other) {
      db.prepare('INSERT OR IGNORE INTO file_tags (file_id, tag_id) SELECT ?, tag_id FROM file_tags WHERE file_id = ?').run(
        id,
        other.id
      )
      db.prepare(
        `INSERT OR IGNORE INTO collection_files (collection_id, file_id, position, added_at)
         SELECT collection_id, ?, position, added_at FROM collection_files WHERE file_id = ?`
      ).run(id, other.id)
      db.prepare('UPDATE collections SET cover_file_id = ? WHERE cover_file_id = ?').run(id, other.id)
      db.prepare('DELETE FROM files WHERE id = ?').run(other.id)
    }
    const prev = db.prepare('SELECT size, mtime FROM files WHERE id = ?').get(id) as { size: number; mtime: number }
    const changed = prev.size !== place.size || prev.mtime !== place.mtime
    db.prepare(
      `UPDATE files SET folder_id = @folderId, path = @path, name = @name, ext = @ext, size = @size,
         mtime = @mtime, missing_since = NULL, indexed_at = datetime('now')
         ${changed ? ', quick_hash = NULL, meta_json = NULL, thumb_path = NULL' : ''}
       WHERE id = @id`
    ).run({ ...place, id })
  })()
}
