import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { closeDatabase, getDb, openDatabase } from './db/index'
import { addFolder } from './db/repo'
import { launchTarget, modelFileArg, queueLaunch, quickPath, takeLaunch } from './launch'

let tmp: string
const exe = 'C:\\Program Files\\3FM\\3FM.exe'

function write(rel: string, body = 'model'): string {
  const full = join(tmp, rel)
  mkdirSync(join(full, '..'), { recursive: true })
  writeFileSync(full, body)
  return full
}

beforeAll(() => {
  tmp = mkdtempSync(join(tmpdir(), '3fm-launch-'))
  write('lib/benchy.stl')
  write('loose/vase.3mf', 'vase!')
  write('loose/plate.gcode.3mf')
  write('loose/notes.txt')
  mkdirSync(join(tmp, 'loose', 'folder.stl'))
  openDatabase(join(tmp, 'test.db'))
  const added = addFolder(join(tmp, 'lib'))
  if (!added.ok) throw new Error(added.message)
  getDb()
    .prepare('INSERT INTO files (folder_id, path, name, ext, size, mtime) VALUES (?, ?, ?, ?, ?, ?)')
    .run(added.folder.id, join(tmp, 'lib', 'benchy.stl'), 'benchy.stl', 'stl', 5, 1)
})

afterAll(() => {
  closeDatabase()
  rmSync(tmp, { recursive: true, force: true })
})

describe('modelFileArg', () => {
  it('finds a model file among flags', () => {
    const vase = join(tmp, 'loose', 'vase.3mf')
    expect(modelFileArg([exe, '--allow-file-access-from-files', vase], tmp)).toBe(vase)
    expect(modelFileArg([exe, vase, '--flag'], tmp)).toBe(vase)
  })

  it('resolves paths relative to the working directory', () => {
    expect(modelFileArg([exe, 'loose\\vase.3mf'], tmp)).toBe(join(tmp, 'loose', 'vase.3mf'))
  })

  it('skips the program, other files, folders and missing files', () => {
    expect(modelFileArg([join(tmp, 'loose', 'vase.3mf')], tmp)).toBeNull()
    expect(modelFileArg([exe, '.', join(tmp, 'loose', 'notes.txt')], tmp)).toBeNull()
    expect(modelFileArg([exe, join(tmp, 'loose', 'folder.stl')], tmp)).toBeNull()
    expect(modelFileArg([exe, join(tmp, 'loose', 'gone.stl')], tmp)).toBeNull()
  })
})

describe('launchTarget', () => {
  it('sends a cataloged file to the catalog, whatever the case of its path', () => {
    const target = launchTarget(join(tmp, 'LIB', 'BENCHY.STL'))
    expect(target?.kind).toBe('catalog')
    expect(target?.kind === 'catalog' && target.file.name).toBe('benchy.stl')
  })

  it('opens anything else in the quick view, which may read only that file', () => {
    const vase = join(tmp, 'loose', 'vase.3mf')
    const target = launchTarget(vase)
    if (target?.kind !== 'quick') throw new Error('expected a quick view')
    expect(target.file).toMatchObject({ path: vase, name: 'vase.3mf', ext: '3mf', type: '3mf', size: 5 })
    expect(quickPath(target.file.token)).toBe(vase)
    expect(quickPath('not-the-token')).toBeNull()

    // The next file replaces it.
    const plate = launchTarget(join(tmp, 'loose', 'plate.gcode.3mf'))
    if (plate?.kind !== 'quick') throw new Error('expected a quick view')
    expect(plate.file).toMatchObject({ ext: 'gcode.3mf', type: 'gcode' })
    expect(quickPath(target.file.token)).toBeNull()
    expect(quickPath()).toBe(join(tmp, 'loose', 'plate.gcode.3mf'))
  })
})

describe('queueLaunch', () => {
  it('hands the file over once', () => {
    expect(queueLaunch([exe, join(tmp, 'lib', 'benchy.stl')], tmp)).toBe(true)
    expect(takeLaunch()?.kind).toBe('catalog')
    expect(takeLaunch()).toBeNull()
  })

  it('ignores a command line without a model file', () => {
    expect(queueLaunch([exe, '--flag'], tmp)).toBe(false)
    expect(takeLaunch()).toBeNull()
  })
})
