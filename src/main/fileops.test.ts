import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { FileItem, ScanProgress } from '@shared/api'
import { Scanner } from './scan/scanner'
import { closeDatabase, getDb, openDatabase } from './db/index'
import { getFile } from './db/files'
import { addFolder } from './db/repo'
import { addApp, setDefaultApp } from './db/apps'
import {
  buildArgs,
  checkFileName,
  hasRecycleBin,
  MAX_OPEN_SYSTEM,
  openFiles,
  openFilesWithSystem,
  renameFile,
  trashFiles
} from './fileops'

let tmp: string
let lib: string
let bin: string
let folderId: number
let scanner: Scanner
let waiters: (() => void)[] = []

function write(rel: string, body = 'x'): string {
  const full = join(lib, rel)
  mkdirSync(join(full, '..'), { recursive: true })
  writeFileSync(full, body)
  return full
}

function scan(): Promise<void> {
  return new Promise((resolve) => {
    waiters.push(resolve)
    scanner.enqueue(folderId)
  })
}

function byName(name: string): FileItem {
  const row = getDb().prepare('SELECT id FROM files WHERE name = ?').get(name) as { id: number } | undefined
  if (!row) throw new Error(`${name} is not cataloged`)
  return getFile(row.id)!
}

// Stand-in for shell.trashItem: moves the file into a "bin" folder.
const fakeTrash = async (path: string) => {
  renameSync(path, join(bin, `${Date.now()}-${Math.random()}`))
}

beforeAll(async () => {
  tmp = mkdtempSync(join(tmpdir(), '3fm-ops-'))
  lib = join(tmp, 'Prints')
  bin = join(tmp, 'bin')
  mkdirSync(bin)
  write('benchy.stl', 'solid benchy')
  write('Clip.3MF', 'clip')
  write('taken.stl', 'other')
  write('plate.gcode.3mf', 'plate')
  for (let i = 0; i < MAX_OPEN_SYSTEM + 1; i++) write(`many/part${i}.stl`)
  openDatabase(join(tmp, 'test.db'))
  scanner = new Scanner((p: ScanProgress) => {
    if (p.phase !== 'scanning') waiters.shift()?.()
  })
  const added = addFolder(lib)
  if (!added.ok) throw new Error(added.message)
  folderId = added.folder.id
  await scan()
})

afterAll(() => {
  closeDatabase()
  rmSync(tmp, { recursive: true, force: true })
})

describe('checkFileName', () => {
  it('accepts ordinary names', () => {
    expect(checkFileName('Benchy v2 (0.2mm).stl', 'stl')).toBeNull()
    expect(checkFileName('plate.GCODE.3MF', 'gcode.3mf')).toBeNull()
  })

  it('rejects names Windows does not allow', () => {
    expect(checkFileName('a:b.stl', 'stl')).toMatch(/characters/)
    expect(checkFileName('a?.stl', 'stl')).toMatch(/characters/)
    expect(checkFileName('tab\there.stl', 'stl')).toMatch(/characters/)
    expect(checkFileName('CON.stl', 'stl')).toMatch(/reserved/)
    expect(checkFileName('com1.part.stl', 'stl')).toMatch(/reserved/)
    expect(checkFileName(' lead.stl', 'stl')).toMatch(/space/)
    expect(checkFileName('x'.repeat(252) + '.stl', 'stl')).toMatch(/too long/)
  })

  it('requires a name and the original extension', () => {
    expect(checkFileName('.stl', 'stl')).toBe('Enter a name.')
    expect(checkFileName('benchy.obj', 'stl')).toMatch(/end in \.stl/)
    expect(checkFileName('plate.3mf', 'gcode.3mf')).toMatch(/end in \.gcode\.3mf/)
  })
})

describe('buildArgs', () => {
  it('passes each file as its own argument', () => {
    expect(buildArgs('"{file}"', ['C:\\a b\\x.stl', 'C:\\y.stl'])).toEqual(['C:\\a b\\x.stl', 'C:\\y.stl'])
  })

  it('keeps fixed arguments around the files', () => {
    expect(buildArgs('--single-instance --load "{file}" -v', ['C:\\x.3mf'])).toEqual([
      '--single-instance',
      '--load',
      'C:\\x.3mf',
      '-v'
    ])
    expect(buildArgs('"--file={file}"', ['a', 'b'])).toEqual(['--file=a', '--file=b'])
  })

  it('appends the files when the template has no placeholder', () => {
    expect(buildArgs('', ['a'])).toEqual(['a'])
    expect(buildArgs('--new-window', ['a', 'b'])).toEqual(['--new-window', 'a', 'b'])
  })
})

describe('renameFile', () => {
  it('renames on disk and in the catalog', async () => {
    const file = byName('benchy.stl')
    const result = await renameFile(file.id, 'Benchy hull.stl')
    expect(result.ok).toBe(true)
    expect(existsSync(join(lib, 'benchy.stl'))).toBe(false)
    expect(readFileSync(join(lib, 'Benchy hull.stl'), 'utf8')).toBe('solid benchy')
    expect(getFile(file.id)).toMatchObject({ name: 'Benchy hull.stl', path: join(lib, 'Benchy hull.stl') })
  })

  it('allows changing only the case', async () => {
    const file = byName('Clip.3MF')
    expect((await renameFile(file.id, 'clip.3MF')).ok).toBe(true)
    expect(getFile(file.id)?.name).toBe('clip.3MF')
  })

  it('never replaces another file', async () => {
    const file = byName('Benchy hull.stl')
    const result = await renameFile(file.id, 'taken.stl')
    expect(result).toEqual({ ok: false, message: 'There is already a file named "taken.stl" in this folder.' })
    expect(readFileSync(join(lib, 'taken.stl'), 'utf8')).toBe('other')
    expect(getFile(file.id)?.name).toBe('Benchy hull.stl')
  })

  it('rejects invalid names before touching the disk', async () => {
    const file = byName('Benchy hull.stl')
    expect(await renameFile(file.id, 'a|b.stl')).toMatchObject({ ok: false })
    expect(await renameFile(file.id, 'Benchy hull.obj')).toMatchObject({ ok: false })
    expect(existsSync(file.path)).toBe(true)
  })

  it('reports files that are gone', async () => {
    expect(await renameFile(999_999, 'x.stl')).toMatchObject({ ok: false })
  })
})

describe('trashFiles', () => {
  it('moves files away and drops them from the catalog', async () => {
    const file = byName('taken.stl')
    const result = await trashFiles([file.id], fakeTrash)
    expect(result).toEqual({ trashed: [file.id], failed: [] })
    expect(existsSync(file.path)).toBe(false)
    expect(getFile(file.id)).toBeUndefined()
  })

  it('keeps files that could not be trashed', async () => {
    const file = byName('plate.gcode.3mf')
    const busy = Object.assign(new Error('busy'), { code: 'EBUSY' })
    const result = await trashFiles([file.id], () => Promise.reject(busy))
    expect(result.trashed).toEqual([])
    expect(result.failed).toEqual([{ name: 'plate.gcode.3mf', message: 'The file is open in another program.' }])
    expect(getFile(file.id)).toBeDefined()
  })

  it('drops files already deleted outside 3FM', async () => {
    const file = byName('plate.gcode.3mf')
    rmSync(file.path)
    let calls = 0
    const result = await trashFiles([file.id], async (p) => {
      calls++
      await fakeTrash(p)
    })
    expect(calls).toBe(1)
    expect(result.trashed).toEqual([file.id])
    expect(getFile(file.id)).toBeUndefined()
  })

  it('does not call the trash for files the catalog knows are missing', async () => {
    write('gone.stl')
    await scan()
    const file = byName('gone.stl')
    rmSync(file.path)
    await scan()
    expect(getFile(file.id)?.missing).toBe(true)
    const result = await trashFiles([file.id], () => Promise.reject(new Error('should not be called')))
    expect(result).toEqual({ trashed: [file.id], failed: [] })
  })
})

describe('hasRecycleBin', () => {
  it('is false for network shares', () => {
    expect(hasRecycleBin('\\\\nas\\prints\\benchy.stl')).toBe(false)
  })

  it('is true for the system drive', () => {
    expect(hasRecycleBin(join(process.env.SystemDrive ?? 'C:', '\\x.stl'))).toBe(true)
  })
})

describe('openFiles', () => {
  let opened: string[]
  const openPath = async (p: string) => {
    opened.push(p)
    return ''
  }
  beforeEach(() => {
    opened = []
  })

  it('uses the Windows default when no app is chosen', async () => {
    const file = byName('Benchy hull.stl')
    expect(await openFiles([file.id], null, openPath)).toEqual({ ok: true })
    expect(opened).toEqual([file.path])
  })

  it('reports an app that is no longer installed', async () => {
    const added = addApp(join(tmp, 'NoSuchSlicer', 'slicer.exe'))
    if (!added.ok) throw new Error(added.message)
    const app = added.state.apps.find((a) => a.name === 'slicer')!
    const file = byName('Benchy hull.stl')
    const result = await openFiles([file.id], app.id, openPath)
    expect(result).toEqual({ ok: false, message: `slicer was not found at ${app.exePath}.` })

    // The same app as the type's default.
    setDefaultApp('stl', app.id)
    expect(await openFiles([file.id], null, openPath)).toMatchObject({ ok: false })
    // Other types still use the Windows default; openSystem ignores the setting.
    expect(await openFiles([byName('clip.3MF').id], null, openPath)).toEqual({ ok: true })
    expect(await openFilesWithSystem([file.id], openPath)).toEqual({ ok: true })
    expect(opened).toEqual([byName('clip.3MF').path, file.path])
    setDefaultApp('stl', null)
  })

  it('passes on errors from the Windows default program', async () => {
    const file = byName('Benchy hull.stl')
    const result = await openFiles([file.id], null, async () => 'No application is associated')
    expect(result).toEqual({ ok: false, message: 'Benchy hull.stl could not be opened: No application is associated' })
  })

  it('refuses to open a large batch one window at a time', async () => {
    const ids = (getDb().prepare("SELECT id FROM files WHERE name LIKE 'part%'").all() as { id: number }[]).map(
      (r) => r.id
    )
    expect(ids.length).toBeGreaterThan(MAX_OPEN_SYSTEM)
    expect(await openFiles(ids, null, openPath)).toMatchObject({ ok: false })
    expect(opened).toEqual([])
  })

  it('refuses missing files', async () => {
    write('later.stl')
    await scan()
    const file = byName('later.stl')
    rmSync(file.path)
    await scan()
    expect(await openFiles([file.id], null, openPath)).toEqual({ ok: false, message: 'later.stl is missing from disk.' })
  })
})
