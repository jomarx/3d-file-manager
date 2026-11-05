import {
  FILE_EXTENSIONS,
  type FileItem,
  type FileQuery,
  type FileQueryResult,
  type FileType,
  type SortKey
} from '@shared/api'
import { parseSearch } from '../search/parse'
import { getDb } from './index'

const RECENT_DAYS = 30
const MAX_LIMIT = 1000

interface FileRow {
  id: number
  folder_id: number
  path: string
  name: string
  ext: string
  size: number
  mtime: number
  missing_since: string | null
  tag_ids: string | null
  collection_ids: string | null
}

const TYPE_BY_EXT = new Map(FILE_EXTENSIONS.map((e) => [e.ext, e.type]))

const ids = (list: string | null): number[] => (list ? list.split(',').map(Number) : [])

function toItem(r: FileRow): FileItem {
  return {
    id: r.id,
    folderId: r.folder_id,
    path: r.path,
    name: r.name,
    ext: r.ext,
    type: TYPE_BY_EXT.get(r.ext) ?? 'stl',
    size: r.size,
    mtime: r.mtime,
    missing: r.missing_since !== null,
    tagIds: ids(r.tag_ids),
    collectionIds: ids(r.collection_ids)
  }
}

function extsFor(types: Iterable<FileType | null>): string[] {
  const wanted = new Set(types)
  return FILE_EXTENSIONS.filter((e) => wanted.has(e.type)).map((e) => e.ext)
}

function likeContains(value: string): string {
  return '%' + value.replace(/[\\%_]/g, (c) => '\\' + c) + '%'
}

const ORDER_BY: Record<SortKey, string> = {
  name: 'f.name COLLATE NOCASE',
  mtime: 'f.mtime',
  size: 'f.size',
  type: 'f.ext'
}

// Path of a cataloged, present file; null for unknown ids or missing files.
export function filePath(id: number): string | null {
  const row = getDb()
    .prepare('SELECT path FROM files WHERE id = ? AND missing_since IS NULL')
    .get(id) as { path: string } | undefined
  return row?.path ?? null
}

const ROW_COLUMNS = `f.id, f.folder_id, f.path, f.name, f.ext, f.size, f.mtime, f.missing_since,
  (SELECT group_concat(tag_id) FROM file_tags WHERE file_id = f.id) AS tag_ids,
  (SELECT group_concat(collection_id) FROM collection_files WHERE file_id = f.id) AS collection_ids`

export function getFile(id: number): FileItem | undefined {
  const row = getDb().prepare(`SELECT ${ROW_COLUMNS} FROM files f WHERE f.id = ?`).get(id) as
    | FileRow
    | undefined
  return row && toItem(row)
}

// Cataloged files for the given ids, in the order given; unknown ids are skipped.
export function getFiles(ids: number[]): FileItem[] {
  return ids.map(getFile).filter((f): f is FileItem => f !== undefined)
}

// Records a rename done on disk. A stale missing-file row at the new path is
// dropped first: the renamed file now lives there.
export function renameFileRow(id: number, path: string, name: string): FileItem {
  const db = getDb()
  db.transaction(() => {
    db.prepare('DELETE FROM files WHERE path = ? AND id != ? AND missing_since IS NOT NULL').run(path, id)
    db.prepare('UPDATE files SET path = ?, name = ? WHERE id = ?').run(path, name, id)
  })()
  return getFile(id)!
}

export function deleteFileRows(ids: number[]): void {
  const db = getDb()
  const del = db.prepare('DELETE FROM files WHERE id = ?')
  db.transaction(() => ids.forEach((id) => del.run(id)))()
}

export function queryFiles(q: FileQuery): FileQueryResult {
  const search = parseSearch(q.search)
  const where: string[] = []
  const params: unknown[] = []

  const scope = q.scope
  if (scope.kind === 'library' && scope.id === 'missing') {
    where.push('f.missing_since IS NOT NULL')
  } else {
    where.push('f.missing_since IS NULL')
  }
  if (scope.kind === 'library' && scope.id === 'recent') {
    where.push('f.mtime >= ?')
    params.push(Date.now() - RECENT_DAYS * 86_400_000)
  } else if (scope.kind === 'library' && scope.id === 'untagged') {
    where.push('NOT EXISTS (SELECT 1 FROM file_tags ft WHERE ft.file_id = f.id)')
  } else if (scope.kind === 'folder') {
    where.push('f.folder_id = ?')
    params.push(scope.id)
  } else if (scope.kind === 'tag') {
    where.push('EXISTS (SELECT 1 FROM file_tags ft WHERE ft.file_id = f.id AND ft.tag_id = ?)')
    params.push(scope.id)
  } else if (scope.kind === 'collection') {
    where.push(
      'EXISTS (SELECT 1 FROM collection_files cf WHERE cf.file_id = f.id AND cf.collection_id = ?)'
    )
    params.push(scope.id)
  }

  // Toolbar chips and type: prefixes each narrow the result.
  for (const types of [q.types, search.types]) {
    if (types.length === 0) continue
    const exts = extsFor(types)
    if (exts.length === 0) {
      where.push('0')
      continue
    }
    where.push(`f.ext IN (${exts.map(() => '?').join(', ')})`)
    params.push(...exts)
  }

  for (const term of search.terms) {
    where.push("f.name LIKE ? ESCAPE '\\'")
    params.push(likeContains(term))
  }
  for (const tag of search.tags) {
    where.push(
      `EXISTS (SELECT 1 FROM file_tags ft JOIN tags t ON t.id = ft.tag_id
               WHERE ft.file_id = f.id AND t.name = ?)`
    )
    params.push(tag)
  }
  for (const name of search.collections) {
    where.push(
      `EXISTS (SELECT 1 FROM collection_files cf JOIN collections c ON c.id = cf.collection_id
               WHERE cf.file_id = f.id AND c.name = ? COLLATE NOCASE)`
    )
    params.push(name)
  }
  for (const folder of search.folders) {
    where.push("substr(f.path, 1, length(f.path) - length(f.name)) LIKE ? ESCAPE '\\'")
    params.push(likeContains(folder))
  }

  const whereSql = where.join(' AND ')
  const db = getDb()
  const { total } = db
    .prepare(`SELECT COUNT(*) AS total FROM files f WHERE ${whereSql}`)
    .get(...params) as { total: number }

  const dir = q.desc ? 'DESC' : 'ASC'
  const order = `${ORDER_BY[q.sort]} ${dir}, f.name COLLATE NOCASE ${dir}, f.id`
  const limit = Math.min(Math.max(q.limit, 1), MAX_LIMIT)
  const rows = db
    .prepare(
      `SELECT ${ROW_COLUMNS} FROM files f WHERE ${whereSql} ORDER BY ${order} LIMIT ? OFFSET ?`
    )
    .all(...params, limit, Math.max(q.offset, 0)) as FileRow[]

  return { total, items: rows.map(toItem), terms: search.terms }
}
