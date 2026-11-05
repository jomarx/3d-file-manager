import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { TAG_COLORS, type FileQuery, type Scope } from '@shared/api'
import { Scanner } from '../scan/scanner'
import { closeDatabase, getDb, openDatabase } from './index'
import { getFile, queryFiles } from './files'
import { addFolder, libraryStats } from './repo'
import { assignTag, createTag, deleteTag, listTags, updateTag } from './tags'
import {
  assignCollection,
  createCollection,
  deleteCollection,
  listCollections,
  updateCollection
} from './collections'

let tmp: string
const ids: Record<string, number> = {}

function names(scope: Scope, search = ''): string[] {
  const query: FileQuery = { scope, search, types: [], sort: 'name', desc: false, offset: 0, limit: 100 }
  return queryFiles(query).items.map((f) => f.name)
}

function tagOk(name: string, color?: string) {
  const result = createTag(name, color)
  if (!result.ok) throw new Error(result.message)
  return result.tag
}

function collectionOk(name: string, description?: string) {
  const result = createCollection(name, description)
  if (!result.ok) throw new Error(result.message)
  return result.collection
}

beforeAll(async () => {
  tmp = mkdtempSync(join(tmpdir(), '3fm-organize-'))
  const lib = join(tmp, 'Prints')
  mkdirSync(lib)
  for (const name of ['benchy.stl', 'clip.3mf', 'vase.stl', 'ornament.gcode']) writeFileSync(join(lib, name), 'x')

  openDatabase(join(tmp, 'test.db'))
  const added = addFolder(lib)
  if (!added.ok) throw new Error(added.message)
  await new Promise<void>((resolve) => {
    const scanner = new Scanner((p) => p.phase !== 'scanning' && resolve())
    scanner.enqueue(added.folder.id)
  })
  for (const f of queryFiles({ scope: { kind: 'library', id: 'all' }, search: '', types: [], sort: 'name', desc: false, offset: 0, limit: 100 }).items) {
    ids[f.name] = f.id
  }
})

afterAll(() => {
  closeDatabase()
  rmSync(tmp, { recursive: true, force: true })
})

describe('tags', () => {
  it('creates tags with the next color in turn', () => {
    const pla = tagOk('  PLA  ')
    expect(pla).toEqual({ id: expect.any(Number), name: 'PLA', color: TAG_COLORS[0], fileCount: 0 })
    expect(tagOk('PETG').color).toBe(TAG_COLORS[1])
    expect(tagOk('Gift ideas', '#123abc').color).toBe('#123abc')
    expect(listTags().map((t) => t.name)).toEqual(['Gift ideas', 'PETG', 'PLA'])
  })

  it('refuses bad names and colors', () => {
    expect(createTag('pla')).toEqual({ ok: false, message: 'There is already a tag called "pla".' })
    expect(createTag('   ').ok).toBe(false)
    expect(createTag('say "hi"').ok).toBe(false)
    expect(createTag('x'.repeat(41)).ok).toBe(false)
    expect(createTag('Resin', 'red')).toEqual({ ok: false, message: 'That is not a color.' })
  })

  it('renames and recolors', () => {
    const petg = listTags().find((t) => t.name === 'PETG')!
    // A change of case alone is not a clash with itself.
    expect(updateTag(petg.id, { name: 'petg' })).toMatchObject({ ok: true, tag: { name: 'petg' } })
    expect(updateTag(petg.id, { name: 'PLA' }).ok).toBe(false)
    expect(updateTag(petg.id, { color: '#000000' })).toMatchObject({ ok: true, tag: { name: 'petg', color: '#000000' } })
    expect(updateTag(9999, { name: 'Nope' }).ok).toBe(false)
  })

  it('assigns and unassigns, ignoring repeats and unknown files', () => {
    const pla = listTags().find((t) => t.name === 'PLA')!
    assignTag([ids['benchy.stl'], ids['vase.stl'], 9999], pla.id, true)
    assignTag([ids['benchy.stl']], pla.id, true)
    expect(listTags().find((t) => t.id === pla.id)!.fileCount).toBe(2)
    expect(getFile(ids['benchy.stl'])!.tagIds).toEqual([pla.id])
    expect(names({ kind: 'tag', id: pla.id })).toEqual(['benchy.stl', 'vase.stl'])
    expect(names({ kind: 'library', id: 'all' }, 'tag:pla')).toEqual(['benchy.stl', 'vase.stl'])
    expect(libraryStats().untagged).toBe(2)

    assignTag([ids['vase.stl']], pla.id, false)
    expect(names({ kind: 'tag', id: pla.id })).toEqual(['benchy.stl'])
    expect(getFile(ids['vase.stl'])!.tagIds).toEqual([])
  })

  it('finds names with spaces in searches', () => {
    const gift = listTags().find((t) => t.name === 'Gift ideas')!
    assignTag([ids['ornament.gcode']], gift.id, true)
    expect(names({ kind: 'library', id: 'all' }, 'tag:"gift ideas"')).toEqual(['ornament.gcode'])
  })

  it('leaves missing files out of the count', () => {
    const pla = listTags().find((t) => t.name === 'PLA')!
    const db = getDb()
    db.prepare("UPDATE files SET missing_since = datetime('now') WHERE id = ?").run(ids['benchy.stl'])
    expect(listTags().find((t) => t.id === pla.id)!.fileCount).toBe(0)
    db.prepare('UPDATE files SET missing_since = NULL WHERE id = ?').run(ids['benchy.stl'])
    expect(listTags().find((t) => t.id === pla.id)!.fileCount).toBe(1)
  })

  it('deletes a tag and its assignments, not the files', () => {
    const gift = listTags().find((t) => t.name === 'Gift ideas')!
    deleteTag(gift.id)
    expect(listTags().map((t) => t.name)).toEqual(['petg', 'PLA'])
    expect(getFile(ids['ornament.gcode'])!.tagIds).toEqual([])
    const { n } = getDb().prepare('SELECT COUNT(*) AS n FROM file_tags WHERE tag_id = ?').get(gift.id) as { n: number }
    expect(n).toBe(0)
  })
})

describe('collections', () => {
  it('creates collections with optional descriptions', () => {
    expect(collectionOk('  Christmas  ', '  Gifts for the family ')).toEqual({
      id: expect.any(Number),
      name: 'Christmas',
      description: 'Gifts for the family',
      fileCount: 0
    })
    expect(collectionOk('Workshop', '   ').description).toBeNull()
    expect(createCollection('christmas').ok).toBe(false)
    expect(createCollection('"quoted"').ok).toBe(false)
    expect(listCollections().map((c) => c.name)).toEqual(['Christmas', 'Workshop'])
  })

  it('edits name and description separately', () => {
    const shop = listCollections().find((c) => c.name === 'Workshop')!
    expect(updateCollection(shop.id, { description: 'Jigs' })).toMatchObject({
      ok: true,
      collection: { name: 'Workshop', description: 'Jigs' }
    })
    expect(updateCollection(shop.id, { name: 'Shop' })).toMatchObject({
      ok: true,
      collection: { name: 'Shop', description: 'Jigs' }
    })
    expect(updateCollection(shop.id, { name: 'CHRISTMAS' }).ok).toBe(false)
  })

  it('adds files in order after the ones already there', () => {
    const xmas = listCollections().find((c) => c.name === 'Christmas')!
    assignCollection([ids['vase.stl'], ids['ornament.gcode']], xmas.id, true)
    assignCollection([ids['vase.stl'], ids['clip.3mf'], 9999], xmas.id, true)
    const rows = getDb()
      .prepare('SELECT file_id, position FROM collection_files WHERE collection_id = ? ORDER BY position')
      .all(xmas.id)
    expect(rows).toEqual([
      { file_id: ids['vase.stl'], position: 0 },
      { file_id: ids['ornament.gcode'], position: 1 },
      { file_id: ids['clip.3mf'], position: 2 }
    ])
    expect(listCollections().find((c) => c.id === xmas.id)!.fileCount).toBe(3)
    expect(getFile(ids['vase.stl'])!.collectionIds).toEqual([xmas.id])
    expect(names({ kind: 'library', id: 'all' }, 'in:christmas')).toEqual(['clip.3mf', 'ornament.gcode', 'vase.stl'])
  })

  it('removes files from a collection', () => {
    const xmas = listCollections().find((c) => c.name === 'Christmas')!
    assignCollection([ids['ornament.gcode']], xmas.id, false)
    expect(names({ kind: 'collection', id: xmas.id })).toEqual(['clip.3mf', 'vase.stl'])
  })

  it('deletes a collection and its entries, not the files', () => {
    const xmas = listCollections().find((c) => c.name === 'Christmas')!
    deleteCollection(xmas.id)
    expect(listCollections().map((c) => c.name)).toEqual(['Shop'])
    expect(getFile(ids['vase.stl'])).toMatchObject({ name: 'vase.stl', collectionIds: [] })
  })
})
