import { mkdirSync, mkdtempSync, renameSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { ScanProgress } from '@shared/api'
import { closeDatabase, getDb, openDatabase } from '../db/index'
import { getFile, setThumb } from '../db/files'
import { pairMoves, type MoveCandidate } from '../db/moves'
import { addFolder } from '../db/repo'
import { locateFile } from '../fileops'
import { Scanner } from './scanner'

let tmp: string
let scanner: Scanner
const waiters: ((p: ScanProgress) => void)[] = []
const folders: Record<string, number> = {}
let stamp = Date.parse('2024-03-01T12:00:00Z')

// Each file gets its own modification time, as real files nearly always do.
function write(rel: string, body = 'model'): string {
  const full = join(tmp, rel)
  mkdirSync(join(full, '..'), { recursive: true })
  writeFileSync(full, body)
  stamp += 60_000
  utimesSync(full, new Date(stamp), new Date(stamp))
  return full
}

function move(from: string, to: string): void {
  mkdirSync(join(tmp, to, '..'), { recursive: true })
  renameSync(join(tmp, from), join(tmp, to))
}

function scan(name: string): Promise<ScanProgress> {
  return new Promise((resolve) => {
    waiters.push(resolve)
    scanner.enqueue(folders[name])
  })
}

const idOf = (path: string) =>
  (getDb().prepare('SELECT id FROM files WHERE path = ?').get(join(tmp, path)) as { id: number } | undefined)?.id

function tag(fileId: number, name: string): void {
  const db = getDb()
  const tagId = db.prepare('INSERT INTO tags (name) VALUES (?)').run(name).lastInsertRowid
  db.prepare('INSERT INTO file_tags (file_id, tag_id) VALUES (?, ?)').run(fileId, tagId)
}

beforeAll(async () => {
  tmp = mkdtempSync(join(tmpdir(), '3fm-moves-'))
  write('A/benchy.stl', 'benchy')
  write('A/clip.3mf', 'clip')
  write('A/parts/gear.stl', 'gear')
  write('B/vase.stl', 'vase')
  openDatabase(join(tmp, 'test.db'))
  scanner = new Scanner((p) => {
    if (p.phase !== 'scanning') waiters.shift()?.(p)
  })
  for (const name of ['A', 'B']) {
    const added = addFolder(join(tmp, name))
    if (!added.ok) throw new Error(added.message)
    folders[name] = added.folder.id
    await scan(name)
  }
})

afterAll(() => {
  closeDatabase()
  rmSync(tmp, { recursive: true, force: true })
})

describe('pairMoves', () => {
  const c = (id: number, name: string, size = 10, mtime = 1): MoveCandidate => ({ id, name, ext: 'stl', size, mtime })

  it('pairs one gone file with one new file of the same size, time and type', () => {
    expect(pairMoves([c(1, 'a.stl')], [c(2, 'b.stl')])).toEqual([{ lost: c(1, 'a.stl'), fresh: c(2, 'b.stl') }])
    expect(pairMoves([c(1, 'a.stl')], [c(2, 'a.stl', 11)])).toEqual([])
    expect(pairMoves([c(1, 'a.stl')], [{ ...c(2, 'a.stl'), ext: '3mf' }])).toEqual([])
  })

  it('uses names to settle look-alikes, and skips what stays ambiguous', () => {
    const lost = [c(1, 'left.stl'), c(2, 'right.stl')]
    const fresh = [c(3, 'right.stl'), c(4, 'LEFT.stl')]
    expect(pairMoves(lost, fresh).map((p) => [p.lost.id, p.fresh.id])).toEqual([
      [1, 4],
      [2, 3]
    ])
    expect(pairMoves([c(1, 'a.stl'), c(2, 'b.stl')], [c(3, 'c.stl'), c(4, 'd.stl')])).toEqual([])
  })

  it('leaves empty files alone', () => {
    expect(pairMoves([c(1, 'a.stl', 0)], [c(2, 'b.stl', 0)])).toEqual([])
  })
})

describe('scanning after moves', () => {
  it('follows a rename and a move into a subfolder, keeping tags and thumbnails', async () => {
    const benchy = idOf('A/benchy.stl')!
    const gear = idOf('A/parts/gear.stl')!
    tag(benchy, 'boats')
    setThumb(benchy, getFile(benchy)!.mtime, `${benchy}.png`)
    move('A/benchy.stl', 'A/Benchy v2.stl')
    move('A/parts/gear.stl', 'A/gears/gear.stl')

    expect(await scan('A')).toMatchObject({ phase: 'done', added: 0, missing: 0, moved: 2 })
    expect(getFile(benchy)).toMatchObject({
      name: 'Benchy v2.stl',
      path: join(tmp, 'A/Benchy v2.stl'),
      missing: false,
      thumb: 'ready'
    })
    expect(getFile(benchy)!.tagIds).toHaveLength(1)
    expect(getFile(gear)).toMatchObject({ path: join(tmp, 'A/gears/gear.stl'), missing: false })
    const { n } = getDb().prepare('SELECT COUNT(*) AS n FROM files').get() as { n: number }
    expect(n).toBe(4)
  })

  it('follows a move between folders, whichever is scanned first', async () => {
    const clip = idOf('A/clip.3mf')!
    const vase = idOf('B/vase.stl')!
    tag(clip, 'clips')
    move('A/clip.3mf', 'B/clip.3mf')
    move('B/vase.stl', 'A/vase.stl')

    // A first: clip goes missing and vase looks new, then B settles both.
    expect(await scan('A')).toMatchObject({ added: 1, missing: 1, moved: 0 })
    expect(await scan('B')).toMatchObject({ added: 0, missing: 0, moved: 2 })
    expect(getFile(clip)).toMatchObject({ folderId: folders.B, path: join(tmp, 'B/clip.3mf'), missing: false })
    expect(getFile(clip)!.tagIds).toHaveLength(1)
    expect(getFile(vase)).toMatchObject({ folderId: folders.A, path: join(tmp, 'A/vase.stl'), missing: false })
  })

  it('does not merge a file that was copied, not moved', async () => {
    write('A/copy-src.stl', 'same bytes')
    await scan('A')
    const src = join(tmp, 'A/copy-src.stl')
    const copy = write('B/copy.stl', 'same bytes')
    const { mtime } = getFile(idOf('A/copy-src.stl')!)!
    utimesSync(copy, new Date(mtime), new Date(mtime))
    expect(await scan('B')).toMatchObject({ added: 1, moved: 0 })
    expect(getFile(idOf('A/copy-src.stl')!)).toMatchObject({ path: src, missing: false })
  })
})

describe('locateFile', () => {
  it('relinks a missing file the user points to, keeping its tags', async () => {
    const gear = idOf('A/gears/gear.stl')!
    // Changed as well as moved, so the scan can't match it by itself.
    rmSync(join(tmp, 'A/gears/gear.stl'))
    write('A/found/gear (fixed).stl', 'gear, repaired')
    expect(await scan('A')).toMatchObject({ added: 1, missing: 1, moved: 0 })
    tag(gear, 'gears')
    const stray = idOf('A/found/gear (fixed).stl')!

    const result = await locateFile(gear, join(tmp, 'A/found/gear (fixed).stl'))
    expect(result).toMatchObject({ ok: true, file: { id: gear, name: 'gear (fixed).stl', missing: false, thumb: null } })
    expect(getFile(gear)!.tagIds).toHaveLength(1)
    // The entry the scan made for it is folded in.
    expect(getFile(stray)).toBeUndefined()
  })

  it('refuses files outside the catalog and files that are not missing', async () => {
    write('benchy.stl', 'benchy')
    write('A/lost.stl', 'lost')
    await scan('A')
    const lost = idOf('A/lost.stl')!
    rmSync(join(tmp, 'A/lost.stl'))
    await scan('A')
    expect(await locateFile(lost, join(tmp, 'benchy.stl'))).toMatchObject({ ok: false, reason: 'refused' })
    expect(await locateFile(lost, join(tmp, 'test.db'))).toMatchObject({
      ok: false,
      message: 'Pick an STL, 3MF or G-code file.'
    })
    expect(await locateFile(idOf('A/vase.stl')!, join(tmp, 'A/vase.stl'))).toMatchObject({ ok: false })
  })
})

describe('thumbnails', () => {
  it('records a thumbnail only for the version it was made from, and forgets it on change', async () => {
    const vase = idOf('A/vase.stl')!
    const { mtime } = getFile(vase)!
    expect(setThumb(vase, mtime + 1, `${vase}.png`)).toBe(false)
    expect(setThumb(vase, mtime, `${vase}.png`)).toBe(true)
    expect(getFile(vase)!.thumb).toBe('ready')
    write('A/vase.stl', 'vase, taller')
    await scan('A')
    expect(getFile(vase)!.thumb).toBeNull()
    setThumb(vase, getFile(vase)!.mtime, '')
    expect(getFile(vase)!.thumb).toBe('none')
  })
})
