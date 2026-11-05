import { labelProblem, type Collection, type CollectionResult } from '@shared/api'
import { getDb } from './index'

// File counts leave out missing files, matching what the collection's view shows.
const COLLECTION_SELECT = `
  SELECT c.id, c.name, c.description, COUNT(f.id) AS fileCount
  FROM collections c
  LEFT JOIN collection_files cf ON cf.collection_id = c.id
  LEFT JOIN files f ON f.id = cf.file_id AND f.missing_since IS NULL`

export function listCollections(): Collection[] {
  return getDb()
    .prepare(`${COLLECTION_SELECT} GROUP BY c.id ORDER BY c.sort_order, c.name COLLATE NOCASE`)
    .all() as Collection[]
}

export function getCollection(id: number): Collection | undefined {
  return getDb().prepare(`${COLLECTION_SELECT} WHERE c.id = ? GROUP BY c.id`).get(id) as Collection | undefined
}

const fail = (message: string) => ({ ok: false as const, message })

// Names are unique ignoring case, so in:"name" searches find exactly one collection.
function checkName(name: string, exceptId: number | null): string | null {
  const problem = labelProblem('collection', name)
  if (problem) return problem
  const other = getDb()
    .prepare('SELECT id FROM collections WHERE name = ? COLLATE NOCASE AND id IS NOT ?')
    .get(name, exceptId)
  return other ? `There is already a collection called "${name}".` : null
}

const cleanDescription = (d: string | null | undefined) => (d?.trim() ? d.trim() : null)

export function createCollection(rawName: string, description?: string | null): CollectionResult {
  const name = rawName.trim()
  const problem = checkName(name, null)
  if (problem) return fail(problem)
  const info = getDb()
    .prepare('INSERT INTO collections (name, description) VALUES (?, ?)')
    .run(name, cleanDescription(description))
  return { ok: true, collection: getCollection(Number(info.lastInsertRowid))! }
}

export function updateCollection(
  id: number,
  changes: { name?: string; description?: string | null }
): CollectionResult {
  if (!getCollection(id)) return fail('That collection no longer exists.')
  const name = changes.name?.trim()
  if (name !== undefined) {
    const problem = checkName(name, id)
    if (problem) return fail(problem)
  }
  const db = getDb()
  db.transaction(() => {
    if (name !== undefined) db.prepare('UPDATE collections SET name = ? WHERE id = ?').run(name, id)
    if (changes.description !== undefined) {
      db.prepare('UPDATE collections SET description = ? WHERE id = ?').run(cleanDescription(changes.description), id)
    }
  })()
  return { ok: true, collection: getCollection(id)! }
}

export function deleteCollection(id: number): void {
  getDb().prepare('DELETE FROM collections WHERE id = ?').run(id)
}

export function assignCollection(fileIds: number[], collectionId: number, on: boolean): void {
  const db = getDb()
  db.transaction(() => {
    if (!on) {
      const del = db.prepare('DELETE FROM collection_files WHERE collection_id = ? AND file_id = ?')
      for (const fileId of fileIds) del.run(collectionId, fileId)
      return
    }
    // New entries go to the end, in the order given.
    const { last } = db
      .prepare('SELECT COALESCE(MAX(position), -1) AS last FROM collection_files WHERE collection_id = ?')
      .get(collectionId) as { last: number }
    const add = db.prepare(
      `INSERT OR IGNORE INTO collection_files (collection_id, file_id, position)
       SELECT ?, id, ? FROM files WHERE id = ?`
    )
    let position = last
    for (const fileId of fileIds) {
      if (add.run(collectionId, position + 1, fileId).changes > 0) position++
    }
  })()
}
