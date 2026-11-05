import { mkdtempSync, mkdirSync, rmSync, unlinkSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FileQuery, ScanProgress } from '@shared/api'
import { Scanner } from '../scan/scanner'
import { closeDatabase, getDb, openDatabase } from './index'
import { queryFiles } from './files'
import { addFolder, libraryStats, listFolders } from './repo'

let tmp: string
let lib: string
let folderId: number
let scanner: Scanner
let waiters: ((p: ScanProgress) => void)[] = []

function write(rel: string, body = 'x', root = lib): string {
  const full = join(root, rel)
  mkdirSync(join(full, '..'), { recursive: true })
  writeFileSync(full, body)
  return full
}

// Runs a scan and resolves with its final progress event.
function scan(id: number): Promise<ScanProgress> {
  return new Promise((resolve) => {
    waiters.push(resolve)
    scanner.enqueue(id)
  })
}

function query(overrides: Partial<FileQuery> = {}) {
  return queryFiles({
    scope: { kind: 'library', id: 'all' },
    search: '',
    types: [],
    sort: 'name',
    desc: false,
    offset: 0,
    limit: 100,
    ...overrides
  })
}

const names = (overrides: Partial<FileQuery> = {}) => query(overrides).items.map((f) => f.name)

beforeAll(async () => {
  tmp = mkdtempSync(join(tmpdir(), '3fm-db-'))
  lib = join(tmp, 'Prints')
  write('benchy.stl', 'solid benchy')
  write('Cable Clip.3mf')
  write('100%_infill.stl')
  write('gifts/ornament.gcode', 'G1 X0')
  write('gifts/plate_1.gcode.3mf')
  write('notes.txt')
  const old = write('archive/old part.stl')
  utimesSync(old, new Date('2020-01-01'), new Date('2020-01-01'))

  openDatabase(join(tmp, 'test.db'))
  scanner = new Scanner((p) => {
    if (p.phase !== 'scanning') waiters.shift()?.(p)
  })
  const added = addFolder(lib)
  if (!added.ok) throw new Error(added.message)
  folderId = added.folder.id
  await scan(folderId)
})

afterAll(() => {
  closeDatabase()
  rmSync(tmp, { recursive: true, force: true })
})

describe('scanning', () => {
  it('indexes only catalogable files', () => {
    expect(names()).toEqual([
      '100%_infill.stl',
      'benchy.stl',
      'Cable Clip.3mf',
      'old part.stl',
      'ornament.gcode',
      'plate_1.gcode.3mf'
    ])
    expect(libraryStats()).toEqual({ files: 6, untagged: 6, missing: 0 })
  })

  it('reports changed, missing and restored files on rescan', async () => {
    write('benchy.stl', 'solid benchy, but bigger')
    const ornament = join(lib, 'gifts/ornament.gcode')
    unlinkSync(ornament)
    let result = await scan(folderId)
    expect(result).toMatchObject({ phase: 'done', added: 0, updated: 1, missing: 1 })
    expect(names({ scope: { kind: 'library', id: 'missing' } })).toEqual(['ornament.gcode'])
    expect(names()).not.toContain('ornament.gcode')

    write('gifts/ornament.gcode', 'G1 X0')
    result = await scan(folderId)
    expect(result).toMatchObject({ phase: 'done', missing: 0 })
    expect(libraryStats().missing).toBe(0)
  })

  it('marks a vanished folder offline instead of losing its files', async () => {
    const gone = join(tmp, 'USB')
    write('usb.stl', 'x', gone)
    const added = addFolder(gone)
    if (!added.ok) throw new Error(added.message)
    await scan(added.folder.id)
    rmSync(gone, { recursive: true })
    expect(await scan(added.folder.id)).toMatchObject({ phase: 'offline' })
    expect(listFolders().find((f) => f.id === added.folder.id)).toMatchObject({ offline: true, fileCount: 1 })
    getDb().prepare('DELETE FROM folders WHERE id = ?').run(added.folder.id)
  })
})

describe('adding folders', () => {
  it('refuses duplicates and folders already covered', () => {
    expect(addFolder(lib)).toMatchObject({ ok: false, reason: 'duplicate' })
    expect(addFolder(join(lib, 'gifts'))).toMatchObject({ ok: false, reason: 'nested' })
    expect(addFolder(join(tmp, 'nope'))).toMatchObject({ ok: false, reason: 'not-found' })
  })

  it('absorbs child folders when their parent is added, keeping tags', async () => {
    const parent = join(tmp, 'Models')
    const childPath = join(parent, 'Thingi')
    write('vase.stl', 'x', childPath)
    const child = addFolder(childPath)
    if (!child.ok) throw new Error(child.message)
    await scan(child.folder.id)
    const db = getDb()
    const vase = db.prepare("SELECT id FROM files WHERE name = 'vase.stl'").get() as { id: number }
    const tag = db.prepare("INSERT INTO tags (name) VALUES ('keep')").run().lastInsertRowid
    db.prepare('INSERT INTO file_tags (file_id, tag_id) VALUES (?, ?)').run(vase.id, tag)

    const merged = addFolder(parent)
    if (!merged.ok) throw new Error(merged.message)
    await scan(merged.folder.id)
    expect(listFolders().map((f) => f.path)).not.toContain(childPath)
    const after = db.prepare("SELECT id, folder_id FROM files WHERE name = 'vase.stl'").get() as {
      id: number
      folder_id: number
    }
    expect(after).toEqual({ id: vase.id, folder_id: merged.folder.id })
    expect(names({ search: 'tag:keep' })).toEqual(['vase.stl'])

    db.prepare('DELETE FROM folders WHERE id = ?').run(merged.folder.id)
    db.prepare('DELETE FROM tags WHERE id = ?').run(tag)
  })
})

describe('queryFiles', () => {
  it('matches every word anywhere in the name, case-insensitively', () => {
    expect(names({ search: 'CLIP cable' })).toEqual(['Cable Clip.3mf'])
    expect(names({ search: 'ench' })).toEqual(['benchy.stl'])
    expect(query({ search: 'benchy clip' }).total).toBe(0)
  })

  it('treats % and _ in the search literally', () => {
    expect(names({ search: '%_' })).toEqual(['100%_infill.stl'])
  })

  it('filters by type chips and type: prefixes together', () => {
    expect(names({ types: ['gcode'] })).toEqual(['ornament.gcode', 'plate_1.gcode.3mf'])
    expect(names({ types: ['stl', '3mf'], search: 'type:3mf' })).toEqual(['Cable Clip.3mf'])
    expect(query({ search: 'type:obj' }).total).toBe(0)
  })

  it('filters by folder: on the directory, not the file name', () => {
    expect(names({ search: 'folder:gifts' })).toEqual(['ornament.gcode', 'plate_1.gcode.3mf'])
    expect(query({ search: 'folder:benchy' }).total).toBe(0)
  })

  it('filters by tag:, in:, tag scope, collection scope and untagged', () => {
    const db = getDb()
    const id = (name: string) =>
      (db.prepare('SELECT id FROM files WHERE name = ?').get(name) as { id: number }).id
    const pla = Number(db.prepare("INSERT INTO tags (name) VALUES ('PLA')").run().lastInsertRowid)
    db.prepare('INSERT INTO file_tags VALUES (?, ?)').run(id('benchy.stl'), pla)
    const gifts = Number(
      db.prepare("INSERT INTO collections (name) VALUES ('Christmas gifts')").run().lastInsertRowid
    )
    db.prepare('INSERT INTO collection_files (collection_id, file_id) VALUES (?, ?)').run(gifts, id('ornament.gcode'))

    expect(names({ search: 'tag:pla' })).toEqual(['benchy.stl'])
    expect(names({ scope: { kind: 'tag', id: pla } })).toEqual(['benchy.stl'])
    expect(names({ search: 'in:"christmas GIFTS"' })).toEqual(['ornament.gcode'])
    expect(names({ scope: { kind: 'collection', id: gifts } })).toEqual(['ornament.gcode'])
    expect(names({ scope: { kind: 'library', id: 'untagged' } })).not.toContain('benchy.stl')
    expect(libraryStats().untagged).toBe(5)
  })

  it('limits Recent to files modified in the last 30 days', () => {
    expect(names({ scope: { kind: 'library', id: 'recent' } })).not.toContain('old part.stl')
    expect(query({ scope: { kind: 'library', id: 'recent' } }).total).toBe(5)
  })

  it('sorts and pages', () => {
    const bySize = query({ sort: 'size', desc: true }).items.map((f) => f.size)
    expect(bySize).toEqual([...bySize].sort((a, b) => b - a))
    const page = query({ offset: 2, limit: 2 })
    expect(page.total).toBe(6)
    expect(page.items.map((f) => f.name)).toEqual(['Cable Clip.3mf', 'old part.stl'])
  })

  it('returns plain search words for highlighting', () => {
    expect(query({ search: 'clip tag:pla "cable clip"' }).terms).toEqual(['clip', 'cable clip'])
  })
})
