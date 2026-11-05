import { existsSync, statSync } from 'node:fs'
import { resolve, sep } from 'node:path'
import type { AddFolderResult, Folder, LibraryStats } from '@shared/api'
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
  const db = getDb()
  const id = db.transaction(() => {
    const info = db
      .prepare('INSERT INTO folders (path, recursive) VALUES (?, ?)')
      .run(path, recursive ? 1 : 0)
    const newId = Number(info.lastInsertRowid)
    // Adding a parent of folders already in the catalog absorbs them. Their
    // files move over by id, so tags and collection entries survive.
    if (recursive) {
      for (const child of listFolders()) {
        if (child.id === newId || !isInside(child.path, path)) continue
        db.prepare('UPDATE files SET folder_id = ? WHERE folder_id = ?').run(newId, child.id)
        db.prepare('DELETE FROM folders WHERE id = ?').run(child.id)
      }
    }
    return newId
  })()
  return { ok: true, folder: getFolder(id)! }
}

export function removeFolder(id: number): void {
  getDb().prepare('DELETE FROM folders WHERE id = ?').run(id)
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
