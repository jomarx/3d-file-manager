import { existsSync, statSync } from 'node:fs'
import { resolve, sep } from 'node:path'
import type { AddFolderResult, Collection, Folder, LibraryStats, Tag } from '@shared/api'
import { getDb } from './index'

interface FolderRow {
  id: number
  path: string
  recursive: number
  offline: number
  added_at: string
  file_count: number
}

function toFolder(row: FolderRow): Folder {
  return {
    id: row.id,
    path: row.path,
    recursive: row.recursive === 1,
    offline: row.offline === 1,
    addedAt: row.added_at,
    fileCount: row.file_count
  }
}

const FOLDER_SELECT = `
  SELECT f.id, f.path, f.recursive, f.offline, f.added_at,
         (SELECT COUNT(*) FROM files WHERE folder_id = f.id AND missing_since IS NULL) AS file_count
  FROM folders f`

export function listFolders(): Folder[] {
  const rows = getDb().prepare(`${FOLDER_SELECT} ORDER BY f.path COLLATE NOCASE`).all() as FolderRow[]
  return rows.map(toFolder)
}

export function getFolder(id: number): Folder | undefined {
  const row = getDb().prepare(`${FOLDER_SELECT} WHERE f.id = ?`).get(id) as FolderRow | undefined
  return row && toFolder(row)
}

function normalizeDir(p: string): string {
  const abs = resolve(p)
  // Keep "C:\" as-is, strip trailing separators elsewhere.
  return abs.length > 3 && abs.endsWith(sep) ? abs.slice(0, -1) : abs
}

function isInside(child: string, parent: string): boolean {
  const c = child.toLowerCase()
  const p = parent.toLowerCase()
  return c.startsWith(p.endsWith(sep) ? p : p + sep)
}

export function addFolder(rawPath: string, recursive = true): AddFolderResult {
  const path = normalizeDir(rawPath)
  if (!existsSync(path) || !statSync(path).isDirectory()) {
    return { ok: false, reason: 'not-found', message: `Folder not found: ${path}` }
  }
  for (const existing of listFolders()) {
    if (existing.path.toLowerCase() === path.toLowerCase()) {
      return { ok: false, reason: 'duplicate', message: `${path} is already in the catalog.` }
    }
    if (existing.recursive && isInside(path, existing.path)) {
      return {
        ok: false,
        reason: 'nested',
        message: `${path} is already included through ${existing.path}.`
      }
    }
  }
  const info = getDb()
    .prepare('INSERT INTO folders (path, recursive) VALUES (?, ?)')
    .run(path, recursive ? 1 : 0)
  return { ok: true, folder: getFolder(Number(info.lastInsertRowid))! }
}

export function removeFolder(id: number): void {
  getDb().prepare('DELETE FROM folders WHERE id = ?').run(id)
}

export function listTags(): Tag[] {
  return getDb()
    .prepare(
      `SELECT t.id, t.name, t.color, COUNT(ft.file_id) AS fileCount
       FROM tags t LEFT JOIN file_tags ft ON ft.tag_id = t.id
       GROUP BY t.id ORDER BY t.name COLLATE NOCASE`
    )
    .all() as Tag[]
}

export function listCollections(): Collection[] {
  return getDb()
    .prepare(
      `SELECT c.id, c.name, c.description, COUNT(cf.file_id) AS fileCount
       FROM collections c LEFT JOIN collection_files cf ON cf.collection_id = c.id
       GROUP BY c.id ORDER BY c.sort_order, c.name COLLATE NOCASE`
    )
    .all() as Collection[]
}

export function libraryStats(): LibraryStats {
  return getDb()
    .prepare(
      `SELECT
         COUNT(*) FILTER (WHERE missing_since IS NULL) AS files,
         COUNT(*) FILTER (WHERE missing_since IS NULL
           AND NOT EXISTS (SELECT 1 FROM file_tags WHERE file_id = files.id)) AS untagged,
         COUNT(*) FILTER (WHERE missing_since IS NOT NULL) AS missing
       FROM files`
    )
    .get() as LibraryStats
}
